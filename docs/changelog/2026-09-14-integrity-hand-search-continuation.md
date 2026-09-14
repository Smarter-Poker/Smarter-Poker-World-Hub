# Integrity hand searches retain older evidence

A player search filtered only the newest 500 candidate hands and returned no cursor when that window had too few matches. A match in hand 551 was unreachable, and the panel described the empty window as a completed search.

The reader now continues after the last scanned candidate when needed, while dense result pages continue after their last returned match. Each read retains the 500-candidate and 50-result bounds. Empty windows disclose remaining history and keep Next available; Previous remains available after exhaustion. Window labels avoid inventing global match offsets. Horse and human inclusion, filters, and service-only access remain unchanged.

The guarded migration refuses an unexpected live definition. The PostgreSQL 17 regression runner reproduces the exact old failure and checks sparse and paired searches, dense paging, microsecond ties, invalid cursors, access, replay, and drift refusal. Required CI runs the native proof; client contracts cover search metadata and navigation wiring. Deployment and served UI verification are separate acceptance checks.
