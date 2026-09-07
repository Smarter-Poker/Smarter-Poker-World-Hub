# 2026-09-07 - CORS for the Club Arena native app

Club Arena is being shipped as a Capacitor app (Club Arena repo,
`docs/changelog/2026-09-07-capacitor-shell.md` and
`2026-09-07-native-auth-and-links.md`). Its webview origin is
`capacitor://localhost` (iOS) / `https://localhost` (Android). It calls the same
Hub API routes the web app calls - `/api/club-arena/*`, `/api/store/*`,
`/api/vip/*`, `/api/notifications/*`, `/api/push/*`, `/api/rewards/*`,
`/api/poy/*`, `/api/avatars`, `/api/auth/delete-account` - with the same Bearer
session, but cross-origin, so each is preflighted.

`middleware.ts` section 0 answers the preflight (204) and stamps
`Access-Control-Allow-Origin: <that origin>` on the response, for exactly those
two origins and exactly those prefixes. The prefixes were not in the matcher
before, so nothing in the middleware ever ran on them; the section returns
early so nothing else starts to. Any other origin on those paths is passed
through untouched. `__tests__/native-app-cors.test.mjs` pins the origins, the
prefix/matcher agreement, the early return and the preflight, and runs in the
build safety gate.

Nothing changes for smarter.poker in a browser: same-origin requests carry no
cross-origin `Origin` match and take the untouched branch.
