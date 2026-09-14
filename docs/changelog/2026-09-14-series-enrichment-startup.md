# Check series enrichment before the long scrape

Run 34799912678 saved 139 events, then date enrichment crashed while reading its credential because `os` was not imported. The later venue and PDF entry points contained the same initialization error; PDF imported `os` only after reading it.

All three scripts now import `os` before reading configuration and reject a missing or blank service credential before making a database request. Date enrichment uses the dependencies already installed by the workflow and no longer attempts a runtime package installation.

Six startup tests execute the actual entry points against an empty database response and reject writes, browser processes, and installs. The general release check isolates optional third-party imports. The production workflow repeats these tests with its real installed dependencies before discovery, so startup failures do not wait behind another long scrape. Failures use the existing operational inbox route.

This fixes initialization and adds an early check. It does not certify extraction, source availability, historical parent identity, or completion of the full series cohort.
