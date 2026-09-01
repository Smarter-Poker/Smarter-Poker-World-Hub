# World Menu Command Grid Release

Phase 1 intentionally reverses the three-bar global-header artwork restored by
commit `4da58d09f`. Three-bar menu artwork is prohibited across Smarter.Poker and
Club Arena. The approved menu identity is the premium six-tile command grid.

World Hub pull request #1175 restored the pinned command-grid source and crop,
wired all 84 commands across the 14 World Hub families, and added source,
asset, route, copy, footer, and browser regression laws. Club Arena pull
request #2429 removed the corresponding source and built-output violations.
Club Arena pull request #2431 made nested artifact deletions authoritative so
retired image files cannot survive a later World Hub sync.

The reversal is deliberate and reviewed. The retired three-bar artwork must
not be restored by conflict resolution, artifact overlay, or a later header
change.
