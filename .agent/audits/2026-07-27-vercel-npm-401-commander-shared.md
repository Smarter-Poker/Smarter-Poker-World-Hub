# Production deploys blocked by a GitHub Packages 401 — 2026-07-27

## Symptom

Three consecutive production deployments failed on `hub-vanguard`, all at
`npm install`, before any application code was compiled:

| Deployment | Commit | Result |
|---|---|---|
| `dpl_AmNmU6veyh1uQyw2iaGSENN7E1kh` | `556d8b213a` | ERROR |
| `dpl_6pxUhMwkmgtUZY1GZCE6NMwFTs3W` | `47397db2ac` | ERROR |
| `dpl_7rX4mVWxb5RRSi9btvg79afUDgkq` | `78c81830e6` | ERROR |

```
npm error code E401
npm error 401 Unauthorized - GET https://npm.pkg.github.com/download/
  @smarter-poker/commander-shared/0.1.3/62cc038e...
  unauthenticated: User cannot be authenticated with the token provided.
Error: Command "npm install" exited with 1
```

Last good production deployment: `dpl_7mCKtUhg` / `a303b6fdf1`. The site stayed
up on that build the whole time — this blocked *shipping*, not serving.

## Root cause

`.npmrc` routed the `@smarter-poker` scope to `https://npm.pkg.github.com` and
authenticated with `${NPM_TOKEN}`. That token is not valid for the package on
Vercel's builders.

The reason this surfaced now, three commits after it actually broke, is the
build cache. The dependency sat at `^0.1.1` for months and Vercel restored
`node_modules` from the previous deployment on every build, so npm never had to
re-download the tarball and never exercised the token. Bumping the version to
`0.1.2` and then `0.1.3` forced a fresh fetch and exposed a credential that had
most likely been dead for some time. **A build that only passes because of a
warm cache is a build that has not been tested.**

Note also that GitHub Packages requires authentication for `npm` downloads even
when the package is marked public, so `47397db2`'s "publish as public" could not
have fixed this. The `commander-shared` repository is private in any case, so
pointing the dependency at a git URL would have hit the same wall.

## Fix

The dependency is now **vendored** and the private registry is off the
production build path entirely:

- `vendor/commander-shared/` — 91 files (`src/` plus `package.json`), copied
  from the installed `0.1.3` tarball. `publishConfig` stripped and `private`
  set, so nothing can accidentally republish it from here.
- `package.json` — `"@smarter-poker/commander-shared": "file:vendor/commander-shared"`.
- `package-lock.json` — regenerated; the entry resolves to `vendor/commander-shared`
  as a link. **Zero** `npm.pkg.github.com` references remain in the lockfile.
- `.npmrc` — registry and token lines removed. `legacy-peer-deps=true` is
  retained; it is load-bearing (eslint@8 vs eslint-config-next@16 peer conflict)
  and dropping it breaks `npm install` outright.

The package has no dependencies of its own — only peer deps on react,
react-dom, next and @supabase/supabase-js, all already direct dependencies of
this repo. So vendoring adds no transitive resolution risk.

Verified before commit: all **89** distinct `@smarter-poker/commander-shared`
import specifiers used across `pages/` and `src/` (90 importing files) resolve
to a real file under `vendor/commander-shared/src/`.

## Cost of this fix, stated honestly

`commander-shared` exists to be a single source of truth between World Hub and
Commander, and a vendored copy can drift. That is a real price. It is the right
trade anyway: a shared package is only worth having if it can be installed, and
this one took production deploys down. The pattern also already exists in this
repo — `public/hub/club-arena/` is a synced build output from another repo.

Treat `Smarter-Poker/commander-shared` as canonical and re-sync `vendor/` when
it changes. If the registry route is ever wanted back, the prerequisite is a
Vercel `NPM_TOKEN` that has been proven against a **cold** cache, not a warm one.
