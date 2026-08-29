/**
 * THE PRECACHE IS AN ALLOWLIST, AND public/ IS NOT IN IT.
 *
 * On 2026-08-29 the root service worker's precache carried 200 files out of
 * public/, weighing 34.7 MB — a marketing slideshow, 31 dev review pages, an
 * unreferenced 1 MB icon, a service worker for a vendor removed ten days
 * earlier. Every byte is downloaded before `install` resolves, and for a Club
 * Arena player that install is what happens when they tap Enable
 * Notifications. It measured about 55 seconds on a fast desktop connection.
 *
 * These tests pin the two properties that keep it that way:
 *   1. public/ is opt-in — nothing is globbed in.
 *   2. the allowlist never names a file that is not there, because ONE 404 in
 *      an atomically-precached manifest rejects install() and takes web push
 *      down for the entire origin. That is not a hypothetical; see
 *      .agent/audits/2026-08-29-root-service-worker-never-installed.md
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { PUBLIC_SHELL, publicShellManifestEntries } = require(
  path.join(ROOT, 'scripts/pwa/public-shell-precache.js')
);

test('every file on the allowlist actually exists in public/', () => {
  for (const name of PUBLIC_SHELL) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'public', name)),
      `public/${name} is on the precache allowlist but is not in the repo. ` +
        `Workbox precaches atomically: this single missing file rejects install(), ` +
        `the root worker never activates, and web push dies for every user of ` +
        `smarter.poker and Club Arena — silently, because register() still resolves.`
    );
  }
});

test('a missing shell file is skipped, not emitted', () => {
  // The generator must fail SAFE. If somebody deletes an asset, the build
  // should lose one precached icon, not ship a manifest that cannot install.
  const warnings = [];
  const entries = publicShellManifestEntries(
    path.join(ROOT, '__tests__', '__does_not_exist__'),
    (m) => warnings.push(m)
  );
  assert.equal(entries.length, 0, 'nothing should be emitted for a directory with no shell files');
  assert.equal(warnings.length, PUBLIC_SHELL.length, 'each missing file must be reported');
  assert.match(warnings[0], /does not exist/);
});

test('entries are content-addressed, so a changed asset is re-fetched', () => {
  const entries = publicShellManifestEntries(ROOT, () => {});
  assert.ok(entries.length > 0, 'the shell cannot be empty');
  for (const entry of entries) {
    assert.match(entry.url, /^\/[^/]/, `${entry.url} must be a root-relative url`);
    assert.match(
      entry.revision,
      /^[0-9a-f]{16}$/,
      `${entry.url} has revision "${entry.revision}"; it must be a content hash, or workbox ` +
        `will serve a stale copy of it forever`
    );
  }
});

test('the icon every push renders with is precached', () => {
  // A notification arrives when the tab is closed. There is no runtime fetch
  // to lazily populate this one, so if it is not in the precache the
  // notification renders with the browser's generic bell.
  const entries = publicShellManifestEntries(ROOT, () => {});
  assert.ok(
    entries.some((e) => e.url === '/notification-icon.png'),
    'notification-icon.png must be precached — worker/index.js and src/lib/push/web-push.js both point at it'
  );
});

test('notification-icon.png is small enough to sit on the install path', () => {
  // It was 1024x1024 and 794 KB on 2026-08-29, for something that renders at
  // at most 192px. Resized and quantised to 512x512 / ~52 KB, with an RMSE of
  // 0.28% against the original at render size.
  const bytes = fs.statSync(path.join(ROOT, 'public/notification-icon.png')).size;
  assert.ok(
    bytes < 150 * 1024,
    `notification-icon.png is ${(bytes / 1024).toFixed(0)} KB. It is on the install path that ` +
      `gates enrolling for notifications, and it renders at 192px at most — there is no ` +
      `version of this file that needs to be bigger than that.`
  );
});

test('public/ is opt-in: the shell allowlist replaces next-pwa public globbing', () => {
  const config = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');
  // next-pwa feeds the files it globs out of public/ into workbox as
  // additionalManifestEntries. Setting the option REPLACES that list, which is
  // the whole mechanism: delete this line and all 200 public files (34.7 MB)
  // come straight back onto the path that gates enrolling for notifications.
  assert.match(
    config,
    /additionalManifestEntries:\s*publicShellManifestEntries\(__dirname\)/,
    'the shell allowlist must be wired into workboxOptions.additionalManifestEntries'
  );
  // And exactly one option-level publicExcludes: a second one is a duplicate
  // key that JS resolves silently, which is how an inert config line can look
  // like it is doing the work.
  const publicExcludes = config.match(/^ {2}publicExcludes:/gm) || [];
  assert.equal(
    publicExcludes.length,
    1,
    `next.config.js has ${publicExcludes.length} option-level publicExcludes keys; duplicates in one object literal are silently resolved and read as if both applied`
  );
});

test('page JS chunks stay out of the precache', () => {
  // runtimeCaching declares /_next/static/chunks/pages/*.js NetworkOnly, to
  // stop mobile Safari serving a stale chunk after a deploy (the
  // Dan-fix/mobile-white-screen mitigation). precacheAndRoute registers its
  // route FIRST and workbox matches in registration order, so a precached page
  // chunk was served from the precache and that rule never got a look in.
  const config = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');
  assert.match(config, /chunks\\\/pages\\\//, 'the manifestTransform must drop page chunks');
  assert.match(config, /dynamic-css-manifest/, 'the manifestTransform must drop the 404 build artifact');
});
