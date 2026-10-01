# Preserve stored series sources in the discovery handoff

Discovery selected only each database series name and UID when exporting the
master catalog. It dropped stored source URLs and attribution, leaving the
next stage a name-only record. The export now retains the stored source URL,
with the existing scrape URL as its fallback, and source attribution.
Missing URLs and parent identities remain missing; this does not manufacture
provenance, rename database rows, or relax source quarantine.

Five offline contracts execute the actual database projection, JSON export
and downstream cohort loader. Four fail on the previous source; all five
pass with this change, including the unchanged quarantine control. The
contracts run on pull requests and before the scheduled series pipeline.

The failed September 14 series run still requires separate qualification of
legacy NULL parent UIDs, alternate IDs for the same source and unsuccessful
source extraction. This correction does not claim those issues are fixed.

## Reapplied 2026-09-27

The September 13 restoration (#1821) returned `fetch_db_known_series` to its
name-and-UID projection and removed this test and its CI step, so the defect
was live again. This reapplies the same code change unchanged. The contracts
run in two places. `series-discovery-contracts.yml` runs them on every pull
request that touches the scraper or the test; it is not a required check, so a
red run blocks nothing on its own. The daily auto-pilot
(`poker-series-auto-pilot.yml`) runs them again as its first step, before the
discovery sweep, and stops the run and sends the step alert if they fail, as
#1778 originally did. They are no longer part of `build-safety-gate.yml`.
Measured before reapplying: 4 of the 5 contracts fail against main's scraper;
all 5 pass with this change.
