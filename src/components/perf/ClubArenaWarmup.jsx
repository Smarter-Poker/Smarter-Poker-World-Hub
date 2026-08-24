/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ClubArenaWarmup — put Club Arena on the device BEFORE the player taps it
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The complaint this exists for: tapping Club Arena in the World Hub and then
 * waiting. It is a hard navigation into a separate SPA (see HARD_NAV_PREFIXES
 * in HamburgerMenu), so at the moment of the tap the browser has to fetch an
 * HTML shell, then an entry chunk, then React, then Supabase, then a route
 * chunk — none of which it has ever seen. Every one of those is a round trip
 * the player watches.
 *
 * None of it needs to happen at tap time. While the player is reading a World
 * Hub page the connection is idle, so this registers Club Arena's own service
 * worker from here. Registration runs that worker's `install` handler
 * immediately, and that handler precaches the shell together with the exact
 * hashed chunks the shell references for this deploy. By the time the tap
 * happens the entire boot set is on disk and the navigation is answered
 * without touching the network.
 *
 * A registration is persistent, so on every later visit this is a no-op that
 * costs one `update()` check.
 *
 * SCOPE. `/hub/club-arena`, deliberately without a trailing slash, so it also
 * covers the bare URL the header tile links to. That is wider than the
 * worker script's own directory, so it depends on
 * `Service-Worker-Allowed: /hub/club-arena` (vercel.json). If that header is
 * missing the registration rejects, and we fall back to prefetching the shell
 * and its scripts into the ordinary HTTP cache — slower than a warm service
 * worker, still far better than a cold tap.
 *
 * It does not run when the player has asked the browser to save data, on a
 * 2g-class connection, or when they are already inside Club Arena.
 */

import { useEffect } from 'react';

const SW_URL = '/hub/club-arena/sw-bus.js';
const SW_SCOPE = '/hub/club-arena';
const SHELL_URL = '/hub/club-arena';

/** Respect Data Saver and genuinely slow links — this is speculative work. */
function connectionAllowsWarmup() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return true; // no signal: assume a normal connection
  if (c.saveData) return false;
  return !/(^|-)2g$/.test(c.effectiveType || '');
}

/**
 * Fallback for browsers where the service worker will not take the scope:
 * read the shell, pull the scripts and stylesheets it declares, and prefetch
 * them. Every one of those URLs is content-hashed and served immutable, so a
 * prefetch lands in the HTTP cache and survives until the next deploy.
 *
 * The shell itself is `no-cache, must-revalidate` rather than `no-store`
 * precisely so this fetch is storable; under `no-store` the browser is
 * forbidden from keeping any of it and the whole exercise is wasted bytes.
 */
async function prefetchShellAssets() {
  const res = await fetch(SHELL_URL, { credentials: 'same-origin' });
  if (!res.ok) return;
  const html = await res.text();
  const urls = new Set();
  const pattern = /(?:src|href)="(\/hub\/club-arena\/(?:assets|fonts)\/[^"]+)"/g;
  let m;
  while ((m = pattern.exec(html)) !== null) urls.add(m[1]);

  urls.forEach((href) => {
    if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

export default function ClubArenaWarmup() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    // Already inside Club Arena: it warms itself, and re-registering from here
    // would race its own registration.
    if (window.location.pathname.startsWith('/hub/club-arena')) return undefined;
    if (!connectionAllowsWarmup()) return undefined;

    let cancelled = false;

    const warm = () => {
      if (cancelled) return;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register(SW_URL, { scope: SW_SCOPE })
          .then((reg) => {
            // Pick up a worker shipped by a deploy that landed while this tab
            // has been open, so the precache matches what the server serves.
            reg.update().catch(() => {});
          })
          .catch(() => {
            prefetchShellAssets().catch(() => {});
          });
      } else {
        prefetchShellAssets().catch(() => {});
      }
    };

    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warm, { timeout: 4000 });
      } else {
        window.setTimeout(warm, 2000);
      }
    };

    // Never compete with the page the player is actually looking at.
    if (document.readyState === 'complete') {
      schedule();
    } else {
      window.addEventListener('load', schedule, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
    };
  }, []);

  return null;
}
