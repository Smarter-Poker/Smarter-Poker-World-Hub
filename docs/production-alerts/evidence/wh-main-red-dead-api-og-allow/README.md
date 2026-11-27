# wh-main-red-dead-api-og-allow

- Symptom: `Chromium and WebKit footer contract` red on World Hub main since #3103 (72341328, 2026-11-27 01:27Z); every PR inherits it (seen on draft #3128, job 140364830669).
- Cause: #3103 added `'/api/og/'` to `AUTH_ALWAYS_ALLOW` in `middleware.ts` and MAG LAW 22 (`smarter-poker-magazine.law.test.mjs`) pins it there; `shared-game-links.test.mjs` asserted the whole file never names `/api/og`. Two laws demanded opposite text.
- Ruling: the shared-game-links test's own comment states its intent ("not in auth-required or explicit API matchers"). An always-allow entry neither gates nor matches, so the assertion is narrowed to that intent: the matcher config must never name `/api/og`, and the only permitted mention is the single always-allow line.
- Pre-fix (main 7a0605ba): `prefix-main-7a0605ba.txt` fail 1/10. Fixed: `fixed.txt` pass 10/10.
- Negative probes (not committed): adding `'/api/og/:path*'` to the matcher -> fail 1; adding `'/api/og/club-game'` to a gate list -> fail 1.
