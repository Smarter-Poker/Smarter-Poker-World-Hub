#!/usr/bin/env python3
"""Focused launchd ownership tests for the PNM scraper watchdog."""

import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

WATCHDOG_PATH = Path(__file__).with_name("scraper-watchdog.py")
WATCHDOG_SPEC = importlib.util.spec_from_file_location("scraper_watchdog", WATCHDOG_PATH)
watchdog = importlib.util.module_from_spec(WATCHDOG_SPEC)
WATCHDOG_SPEC.loader.exec_module(watchdog)
FRESHNESS_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907020500_pnm_freshness_servable_quality_contract.sql"
)
FRESHNESS_READER_PARITY_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907035000_pnm_freshness_reader_parity_contract.sql"
)
FRESHNESS_FAIL_CLOSED_IDENTITY_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907036000_pnm_freshness_fail_closed_identity_contract.sql"
)
CROSS_SOURCE_QUARANTINE_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907023000_pnm_cross_source_artifact_quarantine.sql"
)
EXPANDED_SERIES_QUARANTINE_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907024500_pnm_pokeratlas_cross_series_cohort_quarantine.sql"
)
DAILY_TRUTH_QUARANTINE_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907025000_pnm_daily_high_buyin_duplicate_quarantine.sql"
)
SERIES_FOLLOWUP_QUARANTINE_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907025500_pnm_series_misattribution_followup_quarantine.sql"
)
SOCIAL_WALL_QUARANTINE_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907030000_pnm_social_wall_daily_artifact_quarantine.sql"
)
MSPT_NATIVE_QUARANTINE_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907031000_pnm_mspt_native_parser_artifact_quarantine.sql"
)
UNDATED_NATIVE_QUARANTINE_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "supabase/migrations/20260907034000_pnm_undated_native_tour_artifact_quarantine.sql"
)


class DisallowedWriterTests(unittest.TestCase):
    def setUp(self):
        watchdog.RESTARTED_JOBS.clear()

    def test_all_retired_or_owner_disabled_writers_are_guarded(self):
        self.assertEqual(set(watchdog.DISALLOWED_WRITER_PLISTS), {
            "com.smarter-poker.bravo-daemon",
            "com.smarter-poker.charity-scraper",
            "com.smarter-poker.completeness-scraper",
            "com.smarter-poker.pokeratlas-tournaments-daemon",
        })

    def test_loaded_duplicate_is_booted_out_and_verified(self):
        with mock.patch.object(watchdog, "job_loaded", side_effect=[True, False]), \
             mock.patch.object(watchdog.subprocess, "run", return_value=SimpleNamespace(
                 returncode=0, stdout="", stderr=""
             )) as run:
            self.assertTrue(watchdog.disable_disallowed_writer(
                "com.smarter-poker.charity-scraper"
            ))
        self.assertEqual(run.call_args.args[0], [
            "launchctl", "bootout",
            watchdog.launch_target("com.smarter-poker.charity-scraper"),
        ])

    def test_absent_writer_is_already_safe(self):
        with mock.patch.object(watchdog, "job_loaded", return_value=False), \
             mock.patch.object(watchdog.subprocess, "run") as run:
            self.assertTrue(watchdog.disable_disallowed_writer(
                "com.smarter-poker.completeness-scraper"
            ))
        run.assert_not_called()

    def test_failed_bootout_is_not_reported_as_success(self):
        with mock.patch.object(watchdog, "job_loaded", return_value=True), \
             mock.patch.object(watchdog.subprocess, "run", return_value=SimpleNamespace(
                 returncode=1, stdout="", stderr="busy"
             )):
            self.assertFalse(watchdog.disable_disallowed_writer(
                "com.smarter-poker.pokeratlas-tournaments-daemon"
            ))

    def test_main_exits_nonzero_when_any_required_action_fails(self):
        with mock.patch.object(watchdog, "rotate_log"), \
             mock.patch.object(watchdog, "log"), \
             mock.patch.object(watchdog, "disable_disallowed_writer", return_value=True), \
             mock.patch.object(watchdog, "check_heartbeat", side_effect=[True, False, True]), \
             mock.patch.object(watchdog, "check_pid_alive", return_value=True), \
             mock.patch.object(watchdog, "check_required_process", return_value=True), \
             mock.patch.object(watchdog, "check_periodic_tour_job", return_value=True):
            self.assertEqual(watchdog.main(), 1)

    def test_fresh_heartbeat_without_pid_cannot_mask_an_absent_job(self):
        heartbeat = Path('/tmp/offline-watchdog-heartbeat.json')
        with mock.patch.object(Path, 'exists', return_value=True), \
             mock.patch('builtins.open', return_value=io.StringIO('{"pid": 0}')), \
             mock.patch.object(watchdog, 'job_pid', return_value=None), \
             mock.patch.object(watchdog, 'job_loaded', return_value=False), \
             mock.patch.object(watchdog, 'launchctl_load', return_value=True) as load:
            self.assertTrue(watchdog.check_pid_alive(
                'PokerAtlas', heartbeat, 'com.smarter-poker.pokeratlas-daemon',
            ))
        load.assert_called_once_with('com.smarter-poker.pokeratlas-daemon')

    def test_main_exits_zero_only_when_every_check_is_verified(self):
        with mock.patch.object(watchdog, "rotate_log"), \
             mock.patch.object(watchdog, "log"), \
             mock.patch.object(watchdog, "disable_disallowed_writer", return_value=True), \
             mock.patch.object(watchdog, "check_heartbeat", return_value=True), \
             mock.patch.object(watchdog, "check_pid_alive", return_value=True), \
             mock.patch.object(watchdog, "check_required_process", return_value=True), \
             mock.patch.object(watchdog, "check_periodic_tour_job", return_value=True):
            self.assertEqual(watchdog.main(), 0)

    def test_fresh_degraded_heartbeat_is_rejected_and_restarted(self):
        with tempfile.TemporaryDirectory() as tmp:
            heartbeat = Path(tmp) / "heartbeat.json"
            heartbeat.write_text(json.dumps({
                "status": "degraded",
                "run_status": "partial",
                "errors": 1,
            }))
            with mock.patch.object(
                watchdog, "launchctl_restart", return_value=True,
            ) as restart, mock.patch.object(watchdog, "job_pid", return_value=None):
                self.assertFalse(watchdog.check_heartbeat(
                    "Daily tournaments", heartbeat, watchdog.DAILY_PLIST,
                    healthy_statuses={"running", "ok"},
                ))
        restart.assert_called_once_with(watchdog.DAILY_PLIST)

    def test_fresh_degraded_source_run_preserves_producer_backoff(self):
        with tempfile.TemporaryDirectory() as tmp:
            heartbeat = Path(tmp) / "heartbeat.json"
            heartbeat.write_text(json.dumps({
                "status": "degraded",
                "run_status": "partial",
                "errors": 1,
            }))
            with mock.patch.object(watchdog, "launchctl_restart") as restart:
                self.assertFalse(watchdog.check_heartbeat(
                    "Tour schedules", heartbeat, watchdog.TOUR_PLIST,
                    healthy_statuses={"running", "idle"},
                    restart_on_nonhealthy=False,
                ))
        restart.assert_not_called()

    def test_nonhealthy_in_progress_pass_is_rejected_without_killing_owner_pid(self):
        with tempfile.TemporaryDirectory() as tmp:
            heartbeat = Path(tmp) / "heartbeat.json"
            heartbeat.write_text(json.dumps({
                "pid": 4242,
                "status": "degraded",
                "run_status": "progress",
                "errors": 1,
            }))
            with mock.patch.object(watchdog, "job_pid", return_value=4242), \
                 mock.patch.object(watchdog, "launchctl_restart") as restart:
                self.assertFalse(watchdog.check_heartbeat(
                    "Tour schedules", heartbeat, watchdog.TOUR_PLIST,
                    healthy_statuses={"running", "idle"},
                ))
        restart.assert_not_called()

    def test_final_partial_pass_is_never_granted_in_progress_exemption(self):
        self.assertFalse(watchdog.heartbeat_pass_is_still_running({
            "pid": 4242,
            "status": "degraded",
            "run_status": "partial",
        }, watchdog.TOUR_PLIST))

    def test_fresh_running_heartbeat_with_source_error_is_rejected(self):
        reason = watchdog.heartbeat_contract_reason({
            "status": "running",
            "source_errors": 1,
        }, {"running", "ok"})
        self.assertEqual(reason, "source_errors=1")

    def test_metrics_insert_failure_is_never_healthy(self):
        reason = watchdog.heartbeat_contract_reason({
            "status": "ok",
            "run_status": "success",
            "metrics_insert_failed": True,
        }, {"ok"})
        self.assertEqual(reason, "metrics_insert_failed=true")

    def test_main_monitors_all_active_families_and_never_loads_bravo_live(self):
        heartbeat_calls = []
        process_calls = []
        with mock.patch.object(watchdog, "rotate_log"), \
             mock.patch.object(watchdog, "log"), \
             mock.patch.object(watchdog, "disable_disallowed_writer", return_value=True), \
             mock.patch.object(
                 watchdog, "check_heartbeat",
                 side_effect=lambda *args, **kwargs: heartbeat_calls.append(
                     (args, kwargs)
                 ) or True,
             ), \
             mock.patch.object(
                 watchdog, "check_pid_alive",
                 side_effect=lambda *args, **kwargs: process_calls.append(args) or True,
             ), \
             mock.patch.object(watchdog, "check_required_process", return_value=True) as series, \
             mock.patch.object(watchdog, "check_periodic_tour_job", return_value=True) as tour:
            self.assertEqual(watchdog.main(), 0)

        labels = {args[2] for args, _kwargs in heartbeat_calls}
        self.assertEqual(labels, {
            watchdog.ESTIMATOR_PLIST, watchdog.PA_PLIST, watchdog.DAILY_PLIST,
        })
        semantic_restart_policy = {
            args[2]: kwargs.get("restart_on_nonhealthy", True)
            for args, kwargs in heartbeat_calls
        }
        self.assertTrue(semantic_restart_policy[watchdog.ESTIMATOR_PLIST])
        self.assertFalse(semantic_restart_policy[watchdog.PA_PLIST])
        self.assertFalse(semantic_restart_policy[watchdog.DAILY_PLIST])
        self.assertNotIn("com.smarter-poker.bravo-daemon", labels)
        self.assertNotIn(
            "com.smarter-poker.bravo-daemon",
            {args[2] for args in process_calls},
        )
        series.assert_called_once_with("Poker series", watchdog.SERIES_PLIST)
        tour.assert_called_once_with()


class FreshnessRpcContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = FRESHNESS_MIGRATION.read_text(encoding="utf-8").lower()

    def test_daily_and_charity_checks_use_one_servable_cohort(self):
        self.assertIn("servable_daily as materialized", self.sql)
        self.assertIn("d.is_active", self.sql)
        self.assertIn("d.is_suppressed is not true", self.sql)
        self.assertIn("'scraped_verified', 'scraped_inferred', 'manual_research'", self.sql)
        self.assertIn("pnm_public_text_quarantine_20260907", self.sql)
        self.assertIn("interval '30 days'", self.sql)
        self.assertIn("time_is_parseable", self.sql)
        self.assertIn("end >= 600", self.sql)
        self.assertIn("from servable_daily d", self.sql)

    def test_series_tour_and_live_checks_exclude_nonservable_quality(self):
        self.assertIn("servable_tours as materialized", self.sql)
        self.assertIn("servable_series as materialized", self.sql)
        self.assertIn("is_suppressed is not true", self.sql)
        self.assertIn("servable_live as materialized", self.sql)
        self.assertIn(
            "observation_kind = 'observed' and data_quality = 'scraped_verified'",
            self.sql,
        )
        self.assertIn(
            "observation_kind = 'catalog' and data_quality = 'catalog_verified'",
            self.sql,
        )
        self.assertIn(
            "observation_kind = 'modeled' and data_quality = 'simulated'",
            self.sql,
        )

    def test_rpc_remains_private_to_service_role(self):
        self.assertIn(
            "revoke all on function public.pnm_freshness_invariants() from anon",
            self.sql,
        )
        self.assertIn(
            "revoke all on function public.pnm_freshness_invariants() from authenticated",
            self.sql,
        )
        self.assertIn(
            "grant execute on function public.pnm_freshness_invariants() to service_role",
            self.sql,
        )


class FreshnessReaderParityContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = FRESHNESS_READER_PARITY_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_tour_health_requires_public_date_name_and_window_contract(self):
        for expected in (
            "servable_tours as materialized",
            "btrim(coalesce(stop_name, '')) <> ''",
            "btrim(coalesce(event_name, '')) <> ''",
            "start_date is not null or stop_start_date is not null",
            "stop_end_date >= stop_start_date",
            "start_date >= stop_start_date",
            "start_date <= stop_end_date",
        ):
            self.assertIn(expected, self.sql)

    def test_series_health_requires_public_source_provenance_contract(self):
        for expected in (
            "servable_series as materialized",
            "is_suppressed is not true",
            "now() + interval '5 minutes'",
            "^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$",
            "data_quality = 'manual_research'",
            "scrape_html_hash ~ '^[0-9a-fa-f]{64}$'",
            "scrape_html_hash !~ '^0{64}$'",
            "scrape_batch_id is not null",
        ):
            self.assertIn(expected, self.sql)

    def test_live_health_uses_the_public_observed_source_allowlist(self):
        for source in (
            "bravo", "bravo_scrape", "community_verified",
            "manual_verified", "operator", "operator_feed", "venue_reported",
        ):
            self.assertIn(f"'{source}'", self.sql)
        self.assertIn("lower(regexp_replace(", self.sql)
        self.assertIn("observation_kind = 'observed'", self.sql)
        self.assertIn("data_quality = 'scraped_verified'", self.sql)

    def test_replacement_preserves_private_rpc_acl(self):
        self.assertIn(
            "revoke all on function public.pnm_freshness_invariants() from anon",
            self.sql,
        )
        self.assertIn(
            "revoke all on function public.pnm_freshness_invariants() from authenticated",
            self.sql,
        )
        self.assertIn(
            "grant execute on function public.pnm_freshness_invariants() to service_role",
            self.sql,
        )


class FreshnessFailClosedIdentityContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = FRESHNESS_FAIL_CLOSED_IDENTITY_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_tour_identity_rejects_punctuation_and_encoded_parser_artifacts(self):
        for expected in (
            "stop_name ~ '[a-za-z0-9]'",
            "event_name ~ '[a-za-z0-9]'",
            "stop_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+);'",
            "event_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+);'",
        ):
            self.assertIn(expected, self.sql)

    def test_series_url_uses_js_fallback_and_fail_closed_authority(self):
        for expected in (
            "source_url is not null and source_url <> ''",
            "^https?://[a-z0-9]([a-z0-9._-]*[a-z0-9])?",
            "([:][0-9]{1,4})?",
            "^https?://[a-z0-9._-]*[a-z]",
        ):
            self.assertIn(expected, self.sql)
        self.assertNotIn(
            "when nullif(btrim(source_url), '') is not null\n             then btrim(source_url)",
            self.sql.split("v_new_series_url", 1)[1],
        )

    def test_forward_contract_is_transactional_idempotent_and_private(self):
        for expected in (
            "begin;",
            "if v_updated is distinct from v_definition then",
            "revoke all on function public.pnm_freshness_invariants() from anon",
            "revoke all on function public.pnm_freshness_invariants() from authenticated",
            "grant execute on function public.pnm_freshness_invariants() to service_role",
            "commit;",
        ):
            self.assertIn(expected, self.sql)
        self.assertNotIn("delete from", self.sql)
        self.assertNotIn("drop table", self.sql)


class CrossSourceQuarantineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = CROSS_SOURCE_QUARANTINE_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_exact_tour_cohorts_are_bound_by_count_and_uuid_checksum(self):
        for count, checksum in (
            (16, "8f04165706cbb715bf082234c9a42dae"),
            (16, "8c2ca578ae03622ae5c63760410cc2ae"),
            (15, "cd610b830cd14f6236dcc5a8c724034e"),
        ):
            self.assertIn(f"{count}, '{checksum}'", self.sql)
        self.assertIn("scrape_tour_full_schedules.py", self.sql)
        self.assertIn("tour quarantine updated %, expected 47", self.sql)

    def test_exact_cross_series_children_and_parents_fail_closed(self):
        for count, checksum in (
            (35, "cb177b370af4e0fcf73d04593be944e2"),
            (35, "d6a8e42d5fac970d62eea21a08fa966f"),
            (21, "f67295e7467a77a173dcded5ece56065"),
            (21, "d3232030c242a454d4c6e48ff517e336"),
        ):
            self.assertIn(f"{count}, '{checksum}'", self.sql)
        self.assertIn("expected 56 exact cross-series event pairs", self.sql)
        self.assertIn("series child quarantine updated %, expected 112", self.sql)
        self.assertIn("where id in (756, 757, 784, 828)", self.sql)

    def test_quarantine_is_non_destructive(self):
        self.assertNotIn("delete from public.tour_stop_events", self.sql)
        self.assertNotIn("delete from public.poker_events", self.sql)
        self.assertNotIn("delete from public.poker_series", self.sql)
        self.assertIn("set data_quality = 'stale'", self.sql)
        self.assertIn("is_suppressed = true", self.sql)


class ExpandedSeriesQuarantineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = EXPANDED_SERIES_QUARANTINE_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_all_physical_children_and_exact_parents_are_bound(self):
        self.assertIn("v_count <> 48 or v_child_count <> 4337", self.sql)
        self.assertIn("expected 16 contaminated source groups", self.sql)
        self.assertIn("fa36eb823b807dd3171c7590fd026861", self.sql)
        for count, checksum in (
            (307, "cabb28d300836cd561545f4875170141"),
            (50, "10fbf12306ab6c561849226e7b88e67a"),
            (223, "8c0cc15200a98c29080e0db10e123b32"),
            (108, "1c710e826734891fec8f46b5782df071"),
        ):
            self.assertIn(f"{count}, '{checksum}'", self.sql)
        self.assertIn("child quarantine updated %, expected 4337", self.sql)
        self.assertIn("parent quarantine updated %, expected 48", self.sql)

    def test_expanded_quarantine_is_append_only_and_non_destructive(self):
        self.assertNotIn("delete from public.poker_events", self.sql)
        self.assertNotIn("delete from public.poker_series", self.sql)
        self.assertIn("set data_quality = 'stale'", self.sql)
        self.assertIn("is_suppressed = true", self.sql)


class DailyTruthQuarantineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = DAILY_TRUTH_QUARANTINE_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_exact_high_buyin_and_duplicate_cohorts_are_bound(self):
        for expected in (
            "abe68a6fea638f05495e45cedb24ace4",
            "12f8237cef3913a2b77620f197dbf057",
            "4e3c060e8d53db7dbc5f1e2418b3e737",
            "high-buyin quarantine updated %, expected 244",
            "duplicate quarantine updated %, expected 1647",
            "expected two-row cohort overlap",
        ):
            self.assertIn(expected, self.sql)

    def test_daily_quarantine_is_non_destructive(self):
        self.assertNotIn("delete from public.venue_daily_tournaments", self.sql)
        self.assertIn("set is_active = false", self.sql)
        self.assertIn("is_suppressed = true", self.sql)
        self.assertIn("data_quality = 'stale'", self.sql)


class SeriesFollowupQuarantineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = SERIES_FOLLOWUP_QUARANTINE_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_exact_identity_and_window_cohorts_are_bound(self):
        for expected in (
            "75cf126c4be1836288a820afc6d0ea44",
            "ac64044796fcfe9ddf18c07c8c00b0af",
            "bcd66f4d3eb978a9198bc5a76515b6be",
            "cfe7bbffcb1f243b0250a4dd3006bba3",
            "da71d6e85f6c2c1f946ea89b13396447",
            "8ce4e4a914b010ffa05afb242bd1d4aa",
            "expected 465 outside-window children",
            "child quarantine updated %, expected 1125",
            "parent quarantine updated %, expected 36",
        ):
            self.assertIn(expected, self.sql)

    def test_each_parent_has_an_exact_physical_child_contract(self):
        self.assertIn("for r in select * from pnm_bad_series_followup", self.sql)
        self.assertIn("physical children drifted", self.sql)
        self.assertIn("actual.series_uid is distinct from expected.series_uid", self.sql)
        self.assertIn("actual.scrape_batch_id is distinct from expected.scrape_batch_id", self.sql)

    def test_followup_quarantine_is_non_destructive(self):
        self.assertNotIn("delete from public.poker_events", self.sql)
        self.assertNotIn("delete from public.poker_series", self.sql)
        self.assertIn("set data_quality = 'stale'", self.sql)
        self.assertIn("is_suppressed = true", self.sql)


class SocialWallQuarantineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = SOCIAL_WALL_QUARANTINE_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_exact_artifact_cohort_is_bound_and_fail_closed(self):
        for expected in (
            "22bc70fc51b6a62face62514a33ddf06",
            "social-wall-stream-%",
            "expected 13",
            "pnm_social_wall_artifact_quarantine_20260907",
        ):
            self.assertIn(expected, self.sql)

    def test_social_wall_quarantine_is_non_destructive(self):
        self.assertNotIn("delete from public.venue_daily_tournaments", self.sql)
        self.assertIn("set is_active = false", self.sql)
        self.assertIn("is_suppressed = true", self.sql)
        self.assertIn("data_quality = 'stale'", self.sql)


class MsptNativeQuarantineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MSPT_NATIVE_QUARANTINE_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_exact_native_artifact_cohort_is_bound(self):
        for expected in (
            "2eeeeab60df1251c468390e974d65c49",
            "d74e452ac1a6c571ad57824218138519d8fa61332252193489ba5fc6548c282b",
            "scrape_tour_native.py",
            "updated %, expected 16",
            "retired mspt native parser shifted card fields",
        ):
            self.assertIn(expected, self.sql)

    def test_native_artifact_quarantine_is_non_destructive(self):
        self.assertNotIn("delete from public.tour_stop_events", self.sql)
        self.assertIn("set data_quality = 'stale'", self.sql)


class UndatedNativeQuarantineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = UNDATED_NATIVE_QUARANTINE_MIGRATION.read_text(
            encoding="utf-8",
        ).lower()

    def test_exact_undated_native_cohort_is_bound(self):
        for expected in (
            "04397d6c71da6ed50cfa1e80e99ce3a9",
            "804ad828c9c5245988263c5aadc872cdf5aeb1bf220539d4780357312b20527e",
            "408af9c924b69cfb7bce74250c401ed486a8ed251ce838661d2aadbe46ae41ba",
            "scrape_tour_native.py",
            "updated %, expected 5",
            "undated retired native-parser fragment",
        ):
            self.assertIn(expected, self.sql)

    def test_undated_quarantine_is_non_destructive(self):
        self.assertNotIn("delete from public.tour_stop_events", self.sql)
        self.assertIn("set data_quality = 'stale'", self.sql)


if __name__ == "__main__":
    unittest.main()
