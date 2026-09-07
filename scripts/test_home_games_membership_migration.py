#!/usr/bin/env python3
"""Disposable-PostgreSQL contracts for the Home Games membership migration."""

import concurrent.futures
import json
import re
import shutil
import socket
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = sorted(
    (PROJECT_ROOT / 'supabase' / 'migrations').glob('*_home_games_membership_and_rsvp_gate.sql')
)
if len(MIGRATIONS) != 1:
    raise RuntimeError(f'expected one Home Games gate migration, found {MIGRATIONS}')
MIGRATION = MIGRATIONS[0]
SNAPSHOT = PROJECT_ROOT / 'supabase' / 'migrations' / 'ZZZZ_snapshot_home_games_schema.sql'


def _postgres_program(name):
    found = shutil.which(name)
    if found and (name not in {'initdb', 'pg_ctl'} or (Path(found).resolve().parent / 'postgres').exists()):
        return found
    candidates = []
    for base in (Path('/opt/homebrew/opt'), Path('/usr/local/opt')):
        candidates.extend(sorted(base.glob(f'postgresql*/bin/{name}'), reverse=True))
    return str(candidates[0]) if candidates else None


def _snapshot_function(name):
    source = SNAPSHOT.read_text()
    match = re.search(
        rf'CREATE OR REPLACE FUNCTION public\.{re.escape(name)}\([^\n]*\)'
        rf'[\s\S]*?AS \$function\$[\s\S]*?\$function\$',
        source,
    )
    if not match:
        raise RuntimeError(f'{name} not found in schema snapshot')
    return match.group(0) + ';'


LEGACY_CONVERSATION_FUNCTION = r'''
CREATE OR REPLACE FUNCTION public.fn_add_member_to_group_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_conv_id uuid; v_current_ids uuid[];
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'approved' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND (OLD.status = 'approved' OR NEW.status <> 'approved') THEN RETURN NEW; END IF;
    SELECT messenger_conversation_id INTO v_conv_id FROM commander_home_groups WHERE id = NEW.group_id;
    IF v_conv_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO messenger_participants (conversation_id, user_id, role, joined_at)
    VALUES (v_conv_id, NEW.user_id, CASE WHEN NEW.role IN ('owner','admin') THEN 'admin' ELSE 'member' END, NOW())
    ON CONFLICT DO NOTHING;
    SELECT participant_ids INTO v_current_ids FROM conversations WHERE id = v_conv_id;
    IF NOT (NEW.user_id = ANY(v_current_ids)) THEN
        UPDATE conversations SET participant_ids = array_append(participant_ids, NEW.user_id), updated_at = NOW() WHERE id = v_conv_id;
    END IF;
    RETURN NEW;
END; $function$;
'''


class HomeGamesMembershipMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.initdb = _postgres_program('initdb')
        cls.pg_ctl = _postgres_program('pg_ctl')
        cls.psql = _postgres_program('psql')
        if not all((cls.initdb, cls.pg_ctl, cls.psql)):
            raise unittest.SkipTest('PostgreSQL initdb, pg_ctl, and psql are required')

        cls.tempdir = tempfile.TemporaryDirectory(prefix='home-games-gate-pg-')
        cls.data_dir = Path(cls.tempdir.name) / 'data'
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            cls.port = listener.getsockname()[1]

        initialized = subprocess.run(
            [cls.initdb, '-D', str(cls.data_dir), '-A', 'trust', '-U', 'postgres', '--no-locale'],
            text=True,
            capture_output=True,
        )
        if initialized.returncode:
            cls.tempdir.cleanup()
            raise RuntimeError(initialized.stderr or initialized.stdout)

        started = subprocess.run(
            [
                cls.pg_ctl,
                '-D', str(cls.data_dir),
                '-l', str(Path(cls.tempdir.name) / 'postgres.log'),
                '-o', f'-F -p {cls.port} -h 127.0.0.1',
                '-w', 'start',
            ],
            text=True,
            capture_output=True,
        )
        if started.returncode:
            cls.tempdir.cleanup()
            raise RuntimeError(started.stderr or started.stdout)
        cls._sql('postgres', 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, 'pg_ctl', None) and getattr(cls, 'data_dir', None):
            subprocess.run(
                [cls.pg_ctl, '-D', str(cls.data_dir), '-m', 'fast', '-w', 'stop'],
                text=True,
                capture_output=True,
            )
        if getattr(cls, 'tempdir', None):
            cls.tempdir.cleanup()

    @classmethod
    def _psql_command(cls, database, *extra):
        return [
            cls.psql, '-X', '-h', '127.0.0.1', '-p', str(cls.port),
            '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', *extra,
        ]

    @classmethod
    def _sql(cls, database, sql, *, check=True):
        completed = subprocess.run(
            cls._psql_command(database, '-At', '-c', sql),
            text=True,
            capture_output=True,
        )
        if check and completed.returncode:
            raise AssertionError(completed.stderr or completed.stdout)
        return completed

    def setUp(self):
        self.database = f'home_gate_{uuid.uuid4().hex[:12]}'
        self._sql('postgres', f'CREATE DATABASE {self.database}')
        self._install_fixture()

    def _install_fixture(self):
        fixture = r'''
          CREATE SCHEMA auth;
          CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
          $$;

          CREATE TABLE public.commander_home_groups (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL DEFAULT 'Test Group',
            owner_id uuid NOT NULL,
            club_code text UNIQUE,
            invite_code text UNIQUE,
            is_private boolean DEFAULT true,
            requires_approval boolean DEFAULT true,
            settings jsonb DEFAULT '{}'::jsonb,
            is_active boolean DEFAULT true,
            messenger_conversation_id uuid,
            timezone text NOT NULL DEFAULT 'America/New_York',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
          CREATE TABLE public.commander_home_members (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            group_id uuid NOT NULL REFERENCES public.commander_home_groups(id),
            user_id uuid,
            display_name text,
            is_roster_only boolean NOT NULL DEFAULT false,
            role text NOT NULL DEFAULT 'member',
            status text NOT NULL DEFAULT 'pending',
            can_host boolean DEFAULT false,
            invited_by uuid,
            joined_at timestamptz,
            created_at timestamptz DEFAULT now()
          );
          CREATE UNIQUE INDEX commander_home_members_group_user_unique_active
            ON public.commander_home_members USING btree (group_id, user_id)
            WHERE (user_id IS NOT NULL);
          CREATE TABLE public.commander_home_games (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            group_id uuid NOT NULL REFERENCES public.commander_home_groups(id),
            host_id uuid NOT NULL,
            status text NOT NULL DEFAULT 'scheduled',
            scheduled_date date NOT NULL DEFAULT (current_date + 1),
            start_time time NOT NULL DEFAULT '20:00',
            max_players integer,
            allow_guests boolean DEFAULT false,
            guest_limit integer DEFAULT 1,
            cancelled_at timestamptz,
            rsvp_closes_at timestamptz,
            rsvps_closed boolean DEFAULT false,
            timezone text
          );
          CREATE TABLE public.commander_home_game_tables (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            game_id uuid NOT NULL REFERENCES public.commander_home_games(id),
            status text NOT NULL DEFAULT 'open_for_rsvp',
            max_seats integer NOT NULL DEFAULT 9
          );
          CREATE TABLE public.commander_home_rsvps (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            game_id uuid NOT NULL REFERENCES public.commander_home_games(id),
            user_id uuid NOT NULL,
            response text NOT NULL,
            bringing_guests integer DEFAULT 0,
            guest_names text[],
            message text,
            seat_number integer,
            is_confirmed boolean DEFAULT false,
            responded_at timestamptz,
            updated_at timestamptz DEFAULT now(),
            UNIQUE (game_id, user_id)
          );
          CREATE TABLE public.commander_home_seat_reservations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            table_id uuid NOT NULL REFERENCES public.commander_home_game_tables(id),
            seat_number integer NOT NULL,
            user_id uuid,
            member_id uuid REFERENCES public.commander_home_members(id),
            guest_name text,
            is_guest boolean NOT NULL DEFAULT false,
            claimed_by_user_id uuid,
            status text NOT NULL DEFAULT 'reserved',
            released_at timestamptz,
            updated_at timestamptz DEFAULT now(),
            UNIQUE (table_id, seat_number)
          );
          CREATE TABLE public.commander_home_seats (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            reservation_id uuid REFERENCES public.commander_home_seat_reservations(id)
          );
          CREATE TABLE public.commander_home_join_attempts (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL,
            group_id uuid NOT NULL,
            succeeded boolean NOT NULL,
            attempted_at timestamptz DEFAULT now()
          );
          CREATE TABLE public.commander_home_audit_log (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            group_id uuid NOT NULL,
            actor_id uuid NOT NULL,
            target_type text NOT NULL,
            target_id uuid NOT NULL,
            action text NOT NULL,
            metadata jsonb NOT NULL,
            created_at timestamptz DEFAULT now()
          );
          CREATE TABLE public.social_pages (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            page_type text NOT NULL,
            is_public boolean DEFAULT true,
            linked_entity_type text,
            linked_entity_id text
          );
          CREATE TABLE public.conversations (
            id uuid PRIMARY KEY,
            participant_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
            updated_at timestamptz DEFAULT now()
          );
          CREATE TABLE public.messenger_participants (
            conversation_id uuid NOT NULL REFERENCES public.conversations(id),
            user_id uuid NOT NULL,
            role text,
            joined_at timestamptz,
            PRIMARY KEY (conversation_id, user_id)
          );

          CREATE FUNCTION public.fn_home_is_group_staff(p_user_id uuid, p_group_id uuid)
          RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
            SELECT EXISTS (
              SELECT 1 FROM public.commander_home_members
               WHERE group_id = p_group_id AND user_id = p_user_id
                 AND status = 'approved' AND role IN ('owner', 'admin')
            )
          $$;
        '''
        self._sql(self.database, fixture)
        for name in (
            'join_home_group',
            'manage_home_group_member',
            'rpc_hg_host_claim_for_member',
            'fn_hg_enforce_rsvp_capacity',
        ):
            self._sql(self.database, _snapshot_function(name))
        self._sql(self.database, LEGACY_CONVERSATION_FUNCTION)
        self._sql(
            self.database,
            '''
              CREATE TRIGGER trg_add_member_to_group_conversation
              AFTER INSERT OR UPDATE OF status ON public.commander_home_members
              FOR EACH ROW EXECUTE FUNCTION fn_add_member_to_group_conversation();
              CREATE TRIGGER trg_hg_enforce_rsvp_capacity
              BEFORE INSERT OR UPDATE OF response ON public.commander_home_rsvps
              FOR EACH ROW EXECUTE FUNCTION fn_hg_enforce_rsvp_capacity();
              REVOKE ALL ON FUNCTION public.join_home_group(uuid,uuid,text) FROM PUBLIC, anon;
              GRANT EXECUTE ON FUNCTION public.join_home_group(uuid,uuid,text) TO authenticated, service_role;
              REVOKE ALL ON FUNCTION public.manage_home_group_member(uuid,uuid,text,uuid) FROM PUBLIC, anon;
              GRANT EXECUTE ON FUNCTION public.manage_home_group_member(uuid,uuid,text,uuid) TO authenticated, service_role;
              REVOKE ALL ON FUNCTION public.rpc_hg_host_claim_for_member(uuid,integer,uuid) FROM PUBLIC, anon;
              GRANT EXECUTE ON FUNCTION public.rpc_hg_host_claim_for_member(uuid,integer,uuid) TO authenticated, service_role;
            ''',
        )

        hashes = self._sql(
            self.database,
            '''
              SELECT string_agg(md5(pg_get_functiondef(p)), ',' ORDER BY p::text)
                FROM unnest(ARRAY[
                  'public.fn_add_member_to_group_conversation()'::regprocedure,
                  'public.join_home_group(uuid,uuid,text)'::regprocedure,
                  'public.manage_home_group_member(uuid,uuid,text,uuid)'::regprocedure,
                  'public.rpc_hg_host_claim_for_member(uuid,integer,uuid)'::regprocedure,
                  'public.fn_hg_enforce_rsvp_capacity()'::regprocedure
                ]) p
            ''',
        ).stdout.strip()
        self.assertEqual(
            set(hashes.split(',')),
            {
                '751dcefdaa47d088e6b952919a1e36c2',
                '3d6ce5292248176e19b638a4e9ff2987',
                'd6807093d02d838d7c0031742f2ca42a',
                'ae78c2d52c92c6165e5d29d4cc9f6cfb',
                'a3ca80ed46f386c8a0f65fbaad97d4b4',
            },
        )

    def _apply_migration(self, *, check=True):
        completed = subprocess.run(
            self._psql_command(self.database, '-f', str(MIGRATION)),
            text=True,
            capture_output=True,
        )
        if check and completed.returncode:
            raise AssertionError(completed.stderr or completed.stdout)
        return completed

    def test_claims_invites_and_audit_rollback_are_atomic(self):
        self._apply_migration()
        owner = '00000000-0000-0000-0000-000000000001'
        group = '00000000-0000-0000-0000-000000000010'
        conversation = '00000000-0000-0000-0000-000000000011'
        game = '00000000-0000-0000-0000-000000000020'
        table = '00000000-0000-0000-0000-000000000021'
        registered = '00000000-0000-0000-0000-000000000030'
        registered_member = '00000000-0000-0000-0000-000000000031'
        roster_member = '00000000-0000-0000-0000-000000000041'
        banned_member = '00000000-0000-0000-0000-000000000042'
        declined_member = '00000000-0000-0000-0000-000000000043'
        invited = '00000000-0000-0000-0000-000000000050'
        rejected_invite = '00000000-0000-0000-0000-000000000051'

        self._sql(
            self.database,
            f'''
              INSERT INTO public.conversations(id) VALUES ('{conversation}');
              INSERT INTO public.commander_home_groups
                (id, owner_id, messenger_conversation_id, is_private, requires_approval)
              VALUES ('{group}', '{owner}', '{conversation}', true, true);
              INSERT INTO public.commander_home_games(id, group_id, host_id, status)
              VALUES ('{game}', '{group}', '{owner}', 'scheduled');
              INSERT INTO public.commander_home_game_tables(id, game_id, status, max_seats)
              VALUES ('{table}', '{game}', 'open_for_rsvp', 9);
              INSERT INTO public.commander_home_members
                (id, group_id, user_id, display_name, is_roster_only, role, status)
              VALUES
                ('{registered_member}', '{group}', '{registered}', 'Registered', false, 'member', 'approved'),
                ('{roster_member}', '{group}', NULL, 'Roster Approved', true, 'member', 'approved'),
                ('{banned_member}', '{group}', NULL, 'Roster Banned', true, 'member', 'banned'),
                ('{declined_member}', '{group}', NULL, 'Roster Declined', true, 'member', 'declined');
            ''',
        )

        claim_results = self._sql(
            self.database,
            f'''
              SELECT set_config('request.jwt.claim.sub', '{owner}', false);
              SELECT public.rpc_hg_host_claim_for_member('{table}', 1, '{roster_member}') IS NOT NULL;
              SELECT public.rpc_hg_host_claim_for_member('{table}', 2, '{registered_member}') IS NOT NULL;
            ''',
        ).stdout.strip().splitlines()
        self.assertEqual(claim_results[-2:], ['t', 't'])
        self.assertEqual(
            self._sql(
                self.database,
                f"SELECT count(*), count(*) FILTER (WHERE member_id = '{roster_member}') FROM public.commander_home_seat_reservations",
            ).stdout.strip(),
            '2|1',
        )
        self.assertEqual(
            self._sql(
                self.database,
                f"SELECT response, is_confirmed FROM public.commander_home_rsvps WHERE user_id = '{registered}'",
            ).stdout.strip(),
            'yes|t',
        )

        for member in (banned_member, declined_member):
            failed = self._sql(
                self.database,
                f"SELECT set_config('request.jwt.claim.sub', '{owner}', false); "
                f"SELECT public.rpc_hg_host_claim_for_member('{table}', 3, '{member}');",
                check=False,
            )
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('MEMBER_NOT_APPROVED', failed.stderr)
        self.assertEqual(
            self._sql(self.database, 'SELECT count(*) FROM public.commander_home_seat_reservations').stdout.strip(),
            '2',
        )

        invite_result = self._sql(
            self.database,
            f"SELECT set_config('request.jwt.claim.sub', '{owner}', false); "
            f"SELECT public.manage_home_group_member('{group}', '{invited}', 'invite', '{owner}')->>'action';",
        ).stdout.strip().splitlines()[-1]
        self.assertEqual(invite_result, 'invite')
        self.assertEqual(
            self._sql(
                self.database,
                f'''
                  SELECT
                    (SELECT count(*) FROM public.commander_home_members WHERE user_id = '{invited}'),
                    (SELECT count(*) FROM public.messenger_participants WHERE user_id = '{invited}'),
                    (SELECT count(*) FROM public.commander_home_audit_log
                      WHERE action = 'member_invited' AND metadata ->> 'member_user_id' = '{invited}')
                ''',
            ).stdout.strip(),
            '1|1|1',
        )
        duplicate = self._sql(
            self.database,
            f"SELECT set_config('request.jwt.claim.sub', '{owner}', false); "
            f"SELECT public.manage_home_group_member('{group}', '{invited}', 'invite', '{owner}');",
            check=False,
        )
        self.assertNotEqual(duplicate.returncode, 0)
        self.assertIn('ALREADY_MEMBER', duplicate.stderr)

        self._sql(
            self.database,
            '''
              CREATE FUNCTION public.reject_member_invite_audit() RETURNS trigger
              LANGUAGE plpgsql AS $$ BEGIN
                IF NEW.action = 'member_invited' THEN RAISE EXCEPTION 'AUDIT_UNAVAILABLE'; END IF;
                RETURN NEW;
              END $$;
              CREATE TRIGGER reject_member_invite_audit
              BEFORE INSERT ON public.commander_home_audit_log
              FOR EACH ROW EXECUTE FUNCTION public.reject_member_invite_audit();
            ''',
        )
        failed_audit = self._sql(
            self.database,
            f"SELECT set_config('request.jwt.claim.sub', '{owner}', false); "
            f"SELECT public.manage_home_group_member('{group}', '{rejected_invite}', 'invite', '{owner}');",
            check=False,
        )
        self.assertNotEqual(failed_audit.returncode, 0)
        self.assertIn('AUDIT_UNAVAILABLE', failed_audit.stderr)
        self.assertEqual(
            self._sql(
                self.database,
                f'''
                  SELECT
                    (SELECT count(*) FROM public.commander_home_members WHERE user_id = '{rejected_invite}'),
                    (SELECT count(*) FROM public.messenger_participants WHERE user_id = '{rejected_invite}')
                ''',
            ).stdout.strip(),
            '0|0',
        )

    def test_exact_preflight_rejects_function_drift_without_mutation(self):
        self._sql(
            self.database,
            "COMMENT ON FUNCTION public.join_home_group(uuid,uuid,text) IS 'comment does not alter definition'; "
            "ALTER FUNCTION public.join_home_group(uuid,uuid,text) SET search_path TO public, pg_temp;",
        )
        failed = self._apply_migration(check=False)
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn('join_home_group drifted from the exact audited live definition', failed.stderr)
        self.assertEqual(
            self._sql(
                self.database,
                "SELECT to_regprocedure('public.fn_hg_enforce_rsvp_membership_state()') IS NULL",
            ).stdout.strip(),
            't',
        )

    def test_public_request_rpc_enforces_link_membership_and_atomic_rollback(self):
        self._apply_migration()
        owner = '10000000-0000-0000-0000-000000000001'
        group = '10000000-0000-0000-0000-000000000010'
        game = '10000000-0000-0000-0000-000000000020'
        requester = '10000000-0000-0000-0000-000000000030'
        banned = '10000000-0000-0000-0000-000000000031'
        declined = '10000000-0000-0000-0000-000000000032'
        rollback_user = '10000000-0000-0000-0000-000000000033'

        self._sql(
            self.database,
            f'''
              INSERT INTO public.commander_home_groups(id, owner_id, settings)
              VALUES ('{group}', '{owner}', '{{}}'::jsonb);
              INSERT INTO public.commander_home_games
                (id, group_id, host_id, max_players, allow_guests, guest_limit)
              VALUES ('{game}', '{group}', '{owner}', 4, true, 2);
              INSERT INTO public.commander_home_members
                (group_id, user_id, status, role)
              VALUES
                ('{group}', '{banned}', 'banned', 'member'),
                ('{group}', '{declined}', 'declined', 'member');
            ''',
        )

        no_link = self._sql(
            self.database,
            f"SELECT set_config('request.jwt.claim.sub', '{requester}', false); "
            f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{requester}', 0, ARRAY[]::text[], NULL);",
            check=False,
        )
        self.assertNotEqual(no_link.returncode, 0)
        self.assertIn('PUBLIC_HOME_GAME_NOT_FOUND', no_link.stderr)
        self.assertEqual(
            self._sql(
                self.database,
                f"SELECT count(*) FROM public.commander_home_members WHERE user_id = '{requester}'",
            ).stdout.strip(),
            '0',
        )

        self._sql(
            self.database,
            f'''
              INSERT INTO public.social_pages
                (page_type, is_public, linked_entity_type, linked_entity_id)
              VALUES ('home_game', true, 'home_group', '{group}');
            ''',
        )

        long_message = 'x' * 550
        result_text = self._sql(
            self.database,
            f"SELECT set_config('request.jwt.claim.sub', '{requester}', false); "
            f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{requester}', "
            f"99, ARRAY['  Alice  ','Bob','Ignored'], '{long_message}')::text;",
        ).stdout.strip().splitlines()[-1]
        result = json.loads(result_text)
        self.assertTrue(result['success'])
        self.assertEqual(result['membership']['status'], 'pending')
        self.assertTrue(result['membership']['is_new'])
        self.assertEqual(result['rsvp']['response'], 'yes')
        self.assertEqual(result['rsvp']['bringing_guests'], 2)
        self.assertEqual(result['rsvp']['guest_names'], ['Alice', 'Bob'])
        self.assertEqual(len(result['rsvp']['message']), 500)
        self.assertEqual(
            self._sql(
                self.database,
                f'''
                  SELECT
                    (SELECT count(*) FROM public.commander_home_members
                      WHERE user_id = '{requester}' AND status = 'pending'),
                    (SELECT count(*) FROM public.commander_home_rsvps
                      WHERE user_id = '{requester}' AND response = 'yes'),
                    (SELECT count(*) FROM public.commander_home_audit_log
                      WHERE actor_id = '{requester}' AND action = 'member_requested')
                ''',
            ).stdout.strip(),
            '1|1|1',
        )

        owner_result = json.loads(
            self._sql(
                self.database,
                f"SELECT set_config('request.jwt.claim.sub', '{owner}', false); "
                f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{owner}', 0, ARRAY[]::text[], NULL)::text;",
            ).stdout.strip().splitlines()[-1]
        )
        self.assertEqual(owner_result['membership']['status'], 'owner')
        self.assertIsNone(owner_result['membership']['id'])
        self.assertEqual(
            self._sql(
                self.database,
                f"SELECT count(*) FROM public.commander_home_members WHERE user_id = '{owner}'",
            ).stdout.strip(),
            '0',
        )

        for blocked_user, error in ((banned, 'MEMBERSHIP_BANNED'), (declined, 'MEMBERSHIP_DECLINED')):
            failed = self._sql(
                self.database,
                f"SELECT set_config('request.jwt.claim.sub', '{blocked_user}', false); "
                f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{blocked_user}', 0, ARRAY[]::text[], NULL);",
                check=False,
            )
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn(error, failed.stderr)

        # A JSON string is not the explicit boolean opt-in.
        self._sql(
            self.database,
            f"UPDATE public.commander_home_groups SET settings = '{{\"allow_declined_re_request\":\"true\"}}' WHERE id = '{group}'",
        )
        still_declined = self._sql(
            self.database,
            f"SELECT set_config('request.jwt.claim.sub', '{declined}', false); "
            f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{declined}', 0, ARRAY[]::text[], NULL);",
            check=False,
        )
        self.assertNotEqual(still_declined.returncode, 0)
        self.assertIn('MEMBERSHIP_DECLINED', still_declined.stderr)

        self._sql(
            self.database,
            f"UPDATE public.commander_home_groups SET settings = '{{\"allow_declined_re_request\":true}}' WHERE id = '{group}'",
        )
        reopened = json.loads(
            self._sql(
                self.database,
                f"SELECT set_config('request.jwt.claim.sub', '{declined}', false); "
                f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{declined}', 0, ARRAY[]::text[], NULL)::text;",
            ).stdout.strip().splitlines()[-1]
        )
        self.assertEqual(reopened['membership']['status'], 'pending')
        self.assertTrue(reopened['membership']['re_requested'])

        self._sql(
            self.database,
            '''
              CREATE FUNCTION public.reject_public_request_audit() RETURNS trigger
              LANGUAGE plpgsql AS $$ BEGIN
                IF NEW.action = 'member_requested' THEN RAISE EXCEPTION 'AUDIT_UNAVAILABLE'; END IF;
                RETURN NEW;
              END $$;
              CREATE TRIGGER reject_public_request_audit
              BEFORE INSERT ON public.commander_home_audit_log
              FOR EACH ROW EXECUTE FUNCTION public.reject_public_request_audit();
            ''',
        )
        failed_audit = self._sql(
            self.database,
            f"SELECT set_config('request.jwt.claim.sub', '{rollback_user}', false); "
            f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{rollback_user}', 0, ARRAY[]::text[], NULL);",
            check=False,
        )
        self.assertNotEqual(failed_audit.returncode, 0)
        self.assertIn('AUDIT_UNAVAILABLE', failed_audit.stderr)
        self.assertEqual(
            self._sql(
                self.database,
                f'''
                  SELECT
                    (SELECT count(*) FROM public.commander_home_members WHERE user_id = '{rollback_user}'),
                    (SELECT count(*) FROM public.commander_home_rsvps WHERE user_id = '{rollback_user}')
                ''',
            ).stdout.strip(),
            '0|0',
        )

    def test_guest_capacity_is_serialized_and_confirmed_resubmit_is_safe(self):
        self._apply_migration()
        owner = '20000000-0000-0000-0000-000000000001'
        group = '20000000-0000-0000-0000-000000000010'
        game = '20000000-0000-0000-0000-000000000020'
        first = '20000000-0000-0000-0000-000000000030'
        second = '20000000-0000-0000-0000-000000000031'
        self._sql(
            self.database,
            f'''
              INSERT INTO public.commander_home_groups(id, owner_id)
              VALUES ('{group}', '{owner}');
              INSERT INTO public.social_pages
                (page_type, is_public, linked_entity_type, linked_entity_id)
              VALUES ('home_game', true, 'home_group', '{group}');
              INSERT INTO public.commander_home_games
                (id, group_id, host_id, max_players, allow_guests, guest_limit)
              VALUES ('{game}', '{group}', '{owner}', 3, true, 2);
              INSERT INTO public.commander_home_members(group_id, user_id, status, role)
              VALUES
                ('{group}', '{first}', 'approved', 'member'),
                ('{group}', '{second}', 'approved', 'member');
            ''',
        )

        def request(user):
            return self._sql(
                self.database,
                f"BEGIN; SELECT set_config('request.jwt.claim.sub', '{user}', true); "
                f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{user}', 1, ARRAY['Guest'], NULL); "
                "SELECT pg_sleep(0.25); COMMIT;",
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(request, (first, second)))
        self.assertTrue(all(result.returncode == 0 for result in results))
        self.assertEqual(
            self._sql(
                self.database,
                f'''
                  SELECT
                    count(*) FILTER (WHERE response = 'yes'),
                    count(*) FILTER (WHERE response = 'waitlist'),
                    coalesce(sum(1 + bringing_guests) FILTER (WHERE response = 'yes'), 0)
                  FROM public.commander_home_rsvps WHERE game_id = '{game}'
                ''',
            ).stdout.strip(),
            '1|1|2',
        )

        winner = self._sql(
            self.database,
            f"SELECT user_id FROM public.commander_home_rsvps WHERE game_id = '{game}' AND response = 'yes'",
        ).stdout.strip()
        self._sql(
            self.database,
            f"UPDATE public.commander_home_rsvps SET is_confirmed = true, seat_number = 2 "
            f"WHERE game_id = '{game}' AND user_id = '{winner}'",
        )
        reduced = json.loads(
            self._sql(
                self.database,
                f"SELECT set_config('request.jwt.claim.sub', '{winner}', false); "
                f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{winner}', 0, ARRAY[]::text[], NULL)::text;",
            ).stdout.strip().splitlines()[-1]
        )
        self.assertEqual(reduced['rsvp']['response'], 'yes')
        self.assertTrue(reduced['rsvp']['is_confirmed'])

        forced_waitlist = json.loads(
            self._sql(
                self.database,
                f"SELECT set_config('request.jwt.claim.sub', '{winner}', false); "
                f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{winner}', 2, ARRAY['A','B'], NULL)::text;",
            ).stdout.strip().splitlines()[-1]
        )
        # The other caller is still waitlisted, so three seats exactly fit.
        self.assertEqual(forced_waitlist['rsvp']['response'], 'yes')
        self.assertFalse(forced_waitlist['rsvp']['is_confirmed'])

        # A host capacity reduction makes the same +2 request too large. The
        # trigger must demote it and cannot retain confirmation/seat number.
        self._sql(
            self.database,
            f"UPDATE public.commander_home_games SET max_players = 2 WHERE id = '{game}'",
        )
        demoted = json.loads(
            self._sql(
                self.database,
                f"SELECT set_config('request.jwt.claim.sub', '{winner}', false); "
                f"SELECT public.request_public_home_game_seat('{group}', '{game}', '{winner}', 2, ARRAY['A','B'], NULL)::text;",
            ).stdout.strip().splitlines()[-1]
        )
        self.assertEqual(demoted['rsvp']['response'], 'waitlist')
        self.assertFalse(demoted['rsvp']['is_confirmed'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
