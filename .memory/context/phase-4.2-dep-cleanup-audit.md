# Phase 4.2 — Dependency Cleanup Audit

**Date:** 2026-04-25
**Repo:** Smarter-Poker-World-Hub
**Auditor:** Claude (Phase 4 ongoing optimization, Task #47)
**Method:** `npx depcheck --skip-missing --json` + manual cross-checking

## Summary

depcheck identified 21 candidate unused packages. Manual verification narrowed
to **16 truly safe to remove** (12 deps + 4 devDeps). Five depcheck flags
were false positives (deps used at config-time or via dynamic-load patterns).

Estimated impact:
- node_modules size: ~1.1 MB shrinkage
- Production bundle: 200-300 KB if any were transitively bundled
- npm install time: marginal but measurable

## ✅ Safe to remove — 12 production deps

| Dep | Version | Source refs | Notes |
|---|---|---|---|
| `@eslint/eslintrc` | ^3.3.5 | 0 | ESLint config helper, eslint not invoked at runtime |
| `@fingerprintjs/fingerprintjs` | ^5.0.1 | 0 | Browser fingerprint lib — not used |
| `@next/env` | ^14.2.35 | 0 | Next.js handles env loading internally |
| `@stripe/react-stripe-js` | ^5.6.0 | 0 | No Stripe Elements usage |
| `@use-gesture/react` | ^10.3.1 | 0 | Gesture lib — not used |
| `ai` | ^6.0.39 | 0 | Vercel AI SDK — only substring matches in unrelated code |
| `clsx` | ^2.1.1 | 0 | Class-name helper — not imported anywhere |
| `docx` | ^9.6.0 | 0 | docx file generator — only substring matches in file-ext lists |
| `image-size` | ^2.0.2 | 0 | Image dimension reader — not used |
| `micro` | ^10.0.1 | 0 | Microservice helper — not used (Vercel handles routing) |
| `react-hook-form` | ^7.71.1 | 0 | Form lib — not imported anywhere |
| `tailwind-merge` | ^3.4.0 | 0 | Tailwind class merger — not imported |

## ✅ Safe to remove — 4 devDeps

| DevDep | Version | Refs | Notes |
|---|---|---|---|
| `cross-env` | ^10.1.0 | 0 | No package.json scripts use it |
| `eslint-plugin-unused-imports` | ^4.4.1 | 0 | Not in .eslintrc |
| `pg-protocol` | ^1.6.1 | 0 | No source or config refs |
| `ruflo` | ^3.5.48 | 0 | Legacy from antigravity-toolkit |

## ⚠ KEEP — depcheck false positives

| Package | Why depcheck flagged | Why keep |
|---|---|---|
| `posthog-js` | No `import` statement | Dynamic-loaded via CDN script tag; types needed for IDE intellisense (see comment in src/lib/analytics.js) |
| `autoprefixer` | No code import | Used in `postcss.config.js` as a plugin |
| `caniuse-lite` | Transitive dep | Explicitly declared for browserslist data freshness |
| `husky` | No code import | Used in `package.json` `prepare` script + `.husky/` hooks |
| `postcss` | No direct import | Required transitively by Tailwind / Next.js build |

## Recommended removal command

```bash
npm uninstall \
  @eslint/eslintrc \
  @fingerprintjs/fingerprintjs \
  @next/env \
  @stripe/react-stripe-js \
  @use-gesture/react \
  ai \
  clsx \
  docx \
  image-size \
  micro \
  react-hook-form \
  tailwind-merge

npm uninstall --save-dev \
  cross-env \
  eslint-plugin-unused-imports \
  pg-protocol \
  ruflo
```

## Pre-removal verification checklist

Before running the uninstall, confirm in CI:

1. **Build still passes**: `npm run build` — Next.js will catch any
   missing imports it actually relies on.
2. **Playwright E2E green**: full suite on a preview deployment.
3. **No dynamic-loaded usage**: search for the dep names as string
   literals in `src/lib/analytics.js`-style dynamic loaders. We did
   this for posthog-js (kept). Re-verify none of the removal candidates
   are loaded that way.
4. **Vercel preview deploy**: catches transient import paths the local
   build might miss.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| One of these is dynamic-loaded somewhere we missed | Low | High | Vercel preview deploy + Sentry watch |
| Breaking change in a leaf dep depending on one of these | Very Low | Low | npm uninstall warns about peer-dep mismatches |
| Removal triggers a re-bundle that exposes a different bug | Low | Medium | Diff bundle size before/after; if huge change, investigate |

## Out of scope for this audit

- Heavy production deps (puppeteer, three.js) that ARE used and represent
  optimization opportunities of a different kind (lazy-loading, devDeps,
  CDN-hosted) — see Phase 1 work already completed
- TypeScript type-only deps that depcheck can't detect — separate audit
- Lockfile pinning / outdated-version review — separate audit

## Execution recommendation

**Single PR**, removing all 16 in one commit so the bundle-size delta is
measurable in one diff. Watch CI + Sentry for 48h before considering it
complete.

Tracked as Task #47.
