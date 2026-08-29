/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  public-shell-precache.js — which files from public/ the service worker
 *  precaches, and nothing else.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * Measured on production 2026-08-29: the root service worker's precache held
 * 826 entries, and 200 of them came from `public/` and weighed **34.7 MB**:
 *
 *     icons/       33 files   13.2 MB
 *     usrobots/    12 files   10.2 MB   a marketing slideshow
 *     root files   66 files    8.0 MB   31 *-review.html dev pages,
 *                                       OneSignalSDKWorker.js (the vendor was
 *                                       removed on 2026-08-19), and
 *                                       message-icon.png at 1 MB, referenced
 *                                       by nothing in the codebase
 *
 * All of it downloaded, in full, before `install` resolves. And for a Club
 * Arena player `install` is triggered by the tap on Enable Notifications —
 * that app never loads a hub page, so the tap is what registers this worker for
 * the first time. A first-ever install measured about 55 SECONDS on a fast
 * desktop connection.
 *
 * None of it bought anything. Images and fonts are CacheFirst at runtime, so
 * they land in the cache the first time they are actually used, and the app
 * cannot work offline regardless — it is a live poker client on a Supabase
 * realtime socket.
 *
 * WHY AN ALLOWLIST, AND WHY HERE
 * ─────────────────────────────────────────────────────────────────────────
 * A denylist of heavy folders would be wrong within a month: the next person to
 * drop a video directory into public/ would silently put it back on the install
 * path, and nobody would notice, because the only symptom is that enrolling for
 * notifications got slower.
 *
 * So public/ is opt-IN. `publicExcludes: ['!**\/*']` in next.config.js tells
 * next-pwa to glob nothing out of public/, and this module hands back the
 * handful of files that genuinely belong to the shell, as explicit
 * `additionalManifestEntries`.
 *
 * It has to be additionalManifestEntries rather than a manifestTransform:
 * workbox pushes `additionalManifestEntriesTransform` LAST
 * (workbox-build/build/lib/transform-manifest.js), after every user transform,
 * so entries added that way are invisible to filtering. That is also why the
 * first attempt at this filtered the page chunks correctly and left all 199
 * public files in place.
 *
 * Kept in its own module, rather than inline in next.config.js, so it can be
 * unit tested — see __tests__/public-shell-precache.test.mjs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * The only files from public/ that are part of the app shell.
 *
 * Deliberately tiny, and every line has to earn itself:
 *
 *   manifest.json / commander-manifest.json
 *       what a PWA install reads. If it is not there when the browser asks,
 *       the install prompt has nothing to describe.
 *   offline.html
 *       the fallback document. Precaching the offline page at runtime, after
 *       the network has already gone, does not work.
 *   notification-icon.png
 *       the icon EVERY push renders with (worker/index.js, and
 *       src/lib/push/web-push.js as DEFAULT_ICON and DEFAULT_BADGE). A
 *       notification arrives when the tab is closed; there is no runtime fetch
 *       to lazily populate it, so if it is not precached the notification
 *       renders with the browser's generic bell.
 *   default-avatar.png
 *       the fallback behind every missing profile image in the app, so it is
 *       requested on essentially every screen.
 *   favicon.ico
 *       small, and requested before anything else on the page.
 *
 * Adding to this list is a real decision: every entry is bytes a person waits
 * for before they can turn on notifications, and one 404 among them takes web
 * push down for the whole origin (that is not hypothetical — it is what
 * happened on 2026-08-29, see .agent/audits/).
 */
const PUBLIC_SHELL = Object.freeze([
  'manifest.json',
  'commander-manifest.json',
  'offline.html',
  'notification-icon.png',
  'default-avatar.png',
  // NOT favicon.ico — this app does not have one (Next serves the icon from
  // app metadata), and listing a file that is not there is precisely the 404
  // this whole module exists to prevent. Left as a comment rather than a live
  // entry so the next person does not add it back on the assumption it was an
  // oversight.
]);

/**
 * Build the precache entries for the shell files that actually exist.
 *
 * A missing file is SKIPPED rather than emitted, and that is the whole point:
 * an entry pointing at a file that is not there is exactly the 404 that killed
 * install() and with it every web push on the origin. A build that quietly
 * precaches one fewer icon is survivable; a build that ships a broken manifest
 * is not.
 *
 * `revision` is a content hash, so workbox re-fetches the file when it changes
 * and leaves it alone when it has not.
 *
 * @param {string} projectRoot absolute path to the Next project root
 * @param {(msg: string) => void} [warn] where to report a missing shell file
 * @returns {{url: string, revision: string}[]}
 */
function publicShellManifestEntries(projectRoot, warn = console.warn) {
  const publicDir = path.join(projectRoot, 'public');
  const entries = [];

  for (const name of PUBLIC_SHELL) {
    const file = path.join(publicDir, name);
    let contents;
    try {
      contents = fs.readFileSync(file);
    } catch {
      warn(
        `[pwa] public/${name} is in the precache allowlist but does not exist. ` +
          `Skipping it — precaching a missing file rejects install() and takes ` +
          `web push down for the whole origin. Remove it from PUBLIC_SHELL in ` +
          `scripts/pwa/public-shell-precache.js, or restore the file.`
      );
      continue;
    }
    entries.push({
      url: `/${name}`,
      revision: crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16),
    });
  }

  return entries;
}

module.exports = { PUBLIC_SHELL, publicShellManifestEntries };
