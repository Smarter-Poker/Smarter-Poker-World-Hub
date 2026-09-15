# Local production build input check

A Vercel pull can retain sensitive variables as the literal `[SENSITIVE]`.
Nonempty redactions satisfy ordinary presence checks. Static generation can
then log `ISR Build Failed: Invalid API key`, return degraded data, and still
exit successfully; public inputs can also be baked into invalid browser code.

Run only in an ordinary dedicated CI/publisher release clone on the approved
local runner, never in an agent worktree. Dependencies and caches stay in that
runner's designated directories. With Node 24 or later, use this finite guarded
entry from the **same environment and resolved project root** as the build:

```sh
git diff --exit-code HEAD -- package-lock.json &&
  node scripts/check-local-production-build-env.mjs --build-env-file .vercel/.env.production.local &&
  vercel build --prod &&
  git diff --exit-code HEAD -- package-lock.json
```

The `&&` chain stops before the build when the checker rejects. It also rejects
pre-existing or build-time lock drift. Preserve a changed lock for diagnosis;
do not bless it as the selected source or repair it with `npm install`.
The checker alone does not start a build or change `npm run build` /
`scripts/vercel-safe.sh`.
Exit 0 checks presence and unresolved markers only; it does not authenticate
credentials or certify the application.

`vercel.json` pins `installCommand` to `npm ci --no-audit --no-fund`. The default
`npm install` changed the first local release clone's lockfile (65 libc metadata
arrays removed). `npm ci` must consume the committed lock and fail on dependency
manifest disagreement. The application build command is unchanged. The existing
`vercel-safe.sh` is a macOS credential wrapper, not this Linux publisher entry;
this procedure does not change CLI authentication or hosted runtime settings.

Vercel CLI's local `build --prod` and `build --target=production` select
`.vercel/.env.production.local` under the resolved project root. A different
target selects a different file; `--cwd` / configured rootDirectory affect
that root. Pass the exact selected path (quoted if it contains spaces), not
an unrelated `.env.local`. The checker itself accepts only `--build-env-file PATH`.
The deployment-ID build mode fetches inputs separately and is not covered.

Like Vercel's dotenv loader, inherited process variables take precedence over
file variables, even when empty. A valid inherited value can resolve a
redacted file value. A redacted inherited value still fails even if the file
has a usable value. Keep the checker and build environments identical; do not
introduce later environment overrides. The checker does not source or expand
shell expressions, discover other files, or modify the selected file.

Required inputs are `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (static generation),
and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (active push readers). Other runtime-only
secrets need not be present. Remove their unresolved rows from local build
inputs rather than changing their hosted runtime settings. Unused
`NEXT_PUBLIC_TWILIO_PHONE_NUMBER` is not required. Every remaining effective
`[SENSITIVE]` marker fails. Diagnostics contain variable names and reasons only.

Run the dependency-free regression check explicitly:

```sh
node --test __tests__/vercel-json-is-deployable.law.test.mjs
```

That existing prebuild law imports the synthetic environment tests and also
asserts the maintained install command. No package install or application build
is needed to run these checks.

## Upload the same local output, then verify the candidate

The verified local `54fd` output contained 34,902 files. A plain prebuilt upload
was rejected before deployment with `missing_archive`: it exceeded the 15,000
file request limit. Use the CLI's archive transport for this application's
prebuilt output:

```sh
vercel deploy --prebuilt --archive=tgz --prod --skip-domain
```

Run from the same dedicated release clone containing the verified Mac-built
`.vercel/output`. Archive transport packages that existing output; it is not
permission to rebuild on Vercel or upload a different source revision. Retain
the original build/source identity and the candidate URL returned by this
upload. `--skip-domain` keeps production domains off the candidate while it is
checked. Verify the candidate's exact served source identity, health and the
release's required routes before the separate promotion step. After promotion,
verify the public domain against that same identity. Upload success alone is
not publication or runtime verification.
