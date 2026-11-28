# Capture tooling for the #SMARTERDESIGN Training rollout

Sandbox setup (8 GB, 2 cores):

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. The lockfile was written on macOS, so the Linux SWC binary is missing:
   `npm install --no-save --ignore-scripts --no-audit --no-fund @next/swc-linux-x64-gnu@16.3.3`
3. Next 16.3.3 dev crashes on boot ("The 'to' argument must be of type string") because of the
   app/ + pages/ conflict reporter. Patch the local copy only (never committed):
   `sed -i 's/_path.default.relative(dir, appPageFilePaths.get(p));/_path.default.relative(dir, appPageFilePaths.get(p) || p);/; s/_path.default.relative(dir, pagesPageFilePaths.get(p));/_path.default.relative(dir, pagesPageFilePaths.get(p) || p);/' node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js`
4. Turbopack dev server:
   `NEXT_PUBLIC_SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy NODE_OPTIONS='--max-old-space-size=5000' node node_modules/next/dist/bin/next dev -p 3100`
5. Capture: `node .agent/handoffs/2026-11-27-smarterdesign-tools/batch.mjs <outdir> <routesFile> [width]`
   (signed-in stub session, Supabase aborted; writes `<name>.png` plus `report.json` with header, art,
   help icon, help-icon gap to the header edge, back-inside-header, h1 list, forbidden ink, overflow).
6. Pair sheets: `python3 .agent/handoffs/2026-11-27-smarterdesign-tools/sheets.py BEFORE_DIR AFTER_DIR OUT_DIR`.

A Turbopack build error in any module shows a global overlay on every page, so a broken import
poisons a whole capture run: look at the PNGs, not just report.json.
Run `git checkout next-env.d.ts` before committing.
