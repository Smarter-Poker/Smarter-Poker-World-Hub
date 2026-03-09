/**
 * HMR Reconnect Guard — Prevents the Infinite Reload Death Loop
 * 
 * PROBLEM: When the dev server restarts, browser tabs with stale HMR hashes
 * enter an infinite loop: request old hash → 404 → Fast Refresh full reload →
 * request old hash again → 404 → reload → forever.
 * 
 * FIX: Track reload count. If the page reloads more than 3 times in 10 seconds,
 * stop reloading and show a "Server restarted" banner with a manual reload button.
 * This breaks the death loop while still allowing normal Hot Module Replacement.
 * 
 * Only active in development mode.
 */

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const RELOAD_KEY = '__hmr_reload_count';
  const RELOAD_TS_KEY = '__hmr_reload_ts';
  const MAX_RELOADS = 3;
  const WINDOW_MS = 10000; // 10 seconds

  const now = Date.now();
  let lastTs = 0;
  let count = 0;
  let storageAvailable = false;

  try {
    storageAvailable = typeof sessionStorage !== 'undefined';
    if (storageAvailable) {
      lastTs = parseInt(sessionStorage.getItem(RELOAD_TS_KEY) || '0', 10);
      count = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
    }
  } catch (e) {
    // Agent headless browsers might throw SecurityError when accessing storage
    console.warn('[HMR Guard] sessionStorage access blocked, disabling infinite reload guard');
    storageAvailable = false;
  }

  if (storageAvailable) {
    // Reset counter if outside the window
    if (now - lastTs > WINDOW_MS) {
      count = 0;
    }

    count++;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(count));
      sessionStorage.setItem(RELOAD_TS_KEY, String(now));
    } catch (e) {
      // Ignore
    }
  }

  if (storageAvailable && count > MAX_RELOADS) {
    // Stop the infinite reload — show banner instead
    console.warn(`[HMR Guard] Detected ${count} reloads in ${WINDOW_MS / 1000}s — stopping reload loop`);

    // Reset counter so next manual reload works
    sessionStorage.removeItem(RELOAD_KEY);
    sessionStorage.removeItem(RELOAD_TS_KEY);

    // Inject a reconnect banner
    window.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('div');
      banner.id = 'hmr-reconnect-banner';
      banner.innerHTML = `
        <div style="
          position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          color: #e94560; padding: 16px 24px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px; display: flex; align-items: center;
          justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          border-bottom: 2px solid #e94560;
        ">
          <span>
            🔄 <strong>Dev server restarted.</strong>
            The page was caught in a reload loop and stopped automatically.
          </span>
          <button onclick="sessionStorage.removeItem('${RELOAD_KEY}'); sessionStorage.removeItem('${RELOAD_TS_KEY}'); window.location.reload()" style="
            background: #e94560; color: white; border: none; padding: 8px 20px;
            border-radius: 6px; cursor: pointer; font-weight: 600;
            font-size: 13px; white-space: nowrap;
          ">
            Reload Now
          </button>
        </div>
      `;
      document.body.prepend(banner);
    });

    // Also prevent any further programmatic reloads for 5 seconds
    const origReload = window.location.reload.bind(window.location);
    let blocked = true;
    window.location.reload = function () {
      if (blocked) {
        console.warn('[HMR Guard] Blocked programmatic reload');
        return;
      }
      return origReload();
    };
    setTimeout(() => { blocked = false; }, 5000);

  } else {
    // Normal load — clear counter after successful page load
    window.addEventListener('load', () => {
      // If the page loaded successfully and stayed for 5 seconds, reset the counter
      setTimeout(() => {
        sessionStorage.removeItem(RELOAD_KEY);
        sessionStorage.removeItem(RELOAD_TS_KEY);
      }, 5000);
    });
  }
}
