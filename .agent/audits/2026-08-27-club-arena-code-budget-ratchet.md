# Club Arena code-budget ratchet

Date: 2026-08-27

## TL;DR

The Club Arena all-routes JS/CSS graph legitimately outgrew its 7.00 MB
ratchet. The budget passed at 6.9969 MB, first failed at 7.0003 MB, and reached
7.1390 MB after the day's shipped customization and gameplay work. All 321
chunks are referenced; there are zero orphan files and zero orphan bytes to
remove. The code budget is raised to 9.00 MB, following the check's existing
approximately 25% headroom policy. The 1.50 MB initial-load and 110.00 MB total
payload limits are unchanged.

## Evidence

- Last green World Hub sync: `73070080aa`, Club Arena source
  `d7f5e897935b1b9c3f69a6eb00909d9392e35e2f`, 7,336,826 code bytes
  (6.9969 MB), 321 chunks.
- First red World Hub sync: `b79a290ed8`, Club Arena source
  `7e56e92efa7ebb93839b5466f39f1d008dd316c2`, 7,340,332 code bytes
  (7.0003 MB), 321 chunks.
- Production bundle audited: World Hub sync `62d5b214a9`, Club Arena source
  `bd8dba5453bb066f460e1ccc731b69efda4ac30c`, 7,485,763 code bytes
  (7.1390 MB), 321 chunks.
- Current budget measurements: initial 1.17 MB, code 7.14 MB, payload
  34.80 MB.
- A scan of `index.html` plus every emitted JS/CSS file found references to
  every emitted JS/CSS filename: 321 referenced, 0 orphaned.

The net 148,937-byte growth from the last green bundle to production is
concentrated in shipped routes and shared modules: the entry graph grew about
72.8 KB, TablePage 48.0 KB, ThemeSettingsModal 24.5 KB, ClubHomePage 14.0 KB,
and new house-ad, hand-replay, notification, and user-table-settings modules
added the remainder, partly offset by removed standalone avatar and sound
chunks.

## Root cause

The 7.00 MB limit was derived from a 5.47 MB measurement on 2026-08-17. It was
a ratchet with headroom, not a product maximum. A sequence of real Club Arena
feature releases consumed that headroom. The first failure crossed the limit
by only 3,506 bytes; every subsequent Club Arena sync inherited the same red
check even though initial load and payload remained within budget.

This was not stale build residue. Hashed filenames changed between builds, but
the emitted import graph still referenced every file. Removing files to get
under 7.00 MB would break lazy-loaded routes.

## Resolution

Only the all-routes code budget in `scripts/ci/check-ca-bundle-size.mjs` is
raised, from 7.00 MB to 9.00 MB. At 7.1390 MB this leaves about 26% headroom,
matching the original ratchet policy. The initial-load budget remains 1.50 MB
so mobile first paint is still protected independently. The payload budget
remains 110.00 MB.

## Forward checks

- `Club Arena Budget` continues to run on every synced bundle and every change
  to the checker.
- A future code graph above 9.00 MB still fails and must be trimmed or
  deliberately re-ratcheted with new measurements.
- Initial-load growth above 1.50 MB still fails regardless of the code ratchet.
- Do not delete similarly named hashed chunks without proving they are
  unreferenced; the current graph has no orphans.
