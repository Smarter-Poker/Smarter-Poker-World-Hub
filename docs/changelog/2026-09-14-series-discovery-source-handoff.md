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
contracts run in required CI and before the scheduled series pipeline.

The failed September 14 series run still requires separate qualification of
legacy NULL parent UIDs, alternate IDs for the same source and unsuccessful
source extraction. This correction does not claim those issues are fixed.
