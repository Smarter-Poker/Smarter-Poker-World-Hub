# vercel-build-node-scheme-in-client-bundle (2026-11-25)

Store row 449069 (`workers.deploy-error-poll`, `VercelDeploymentFailed`, 22:56Z).

- `dpl_6b4YjEADH61aXZP22zyJE1JkTVBQ` (db0bd6aa, #3010): ERROR.
- `dpl_4x4tBdA3KHjKsjddrWjfYdFnpRcb` (98842721, #3009, main HEAD): ERROR, same cause.
- Production stayed on `dpl_4au4RsR5TR6Q8pUnLz9LbxuwCyZT` (e7683057, #3008).

Build log (bld_nbtizkjyy):

    Module build failed: UnhandledSchemeError: Reading from "node:dns/promises" is not handled by plugins (Unhandled scheme).
    Import trace: node:dns/promises <- ./src/lib/security/fetchableUrl.js <- ./src/lib/newsletter/emailImageProxy.mjs
    (and node:crypto <- ./src/lib/newsletter/emailImageProxy.mjs)
    > Build failed because of webpack errors

Cause: #3010 added `emailImageProxy.buildSpotCardImageUrl(...)` inside the
`WeeklyWireEditionPage` component in `pages/hub/wire/[edition].js`. Next drops a
page import from the client bundle only when the data functions alone use it.

Regression test: `__tests__/server-only-modules-stay-out-of-page-components.law.test.mjs`

- on 98842721 (pre-fix): 0 pass, 2 fail (`component uses "emailImageProxy"`).
- on e7683057 (last good build) the all-pages law passes: no other page violates it.
- with the fix: 2 pass, 0 fail.

## Update 2026-11-26T00:10Z

#3011 (`aca9e106`) merged an equivalent page fix first (prop name `imageUrl`), and production
`dpl_HJGLNGeVcZmkNuixWQUz85j4714t` is READY on it. This branch was rebased onto that main and now
carries only the hardening: the all-pages law, the Weekly Wire pin (updated to `imageUrl`) and the
CI gate step. Law on rebased main: 2 pass, 0 fail. Law with the pre-fix page from `98842721`: 0 pass, 2 fail.
