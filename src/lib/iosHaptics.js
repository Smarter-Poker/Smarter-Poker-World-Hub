/* ===========================================================================
   iOS HAPTICS - making navigator.vibrate exist on the platform that lacks it
   ===========================================================================

   THE PROBLEM, measured 2026-09-05. Forty-nine files in this repo call
   `navigator.vibrate(...)` directly - the trivia games, the reels feed, the
   diamond store, the personal assistant, the live poker table, the cinematic
   intro, the launch pad, poker-near-me, the gates. Every single one of them
   guards the call with `if (navigator.vibrate)` or `navigator.vibrate?.()`,
   which is correct and which is exactly why nobody noticed: on iOS that guard
   is false, so all forty-nine silently do nothing. Apple has never shipped the
   Vibration API in WebKit, and every browser on iOS is WebKit.

   THE ONE THING THAT DOES BUZZ on iOS is a native switch control being
   activated: `<input type="checkbox" switch>`. That is the mechanism behind
   `ios-vibrator-pro-max` (ISC, https://vibrator.dev), and this file is that
   mechanism and nothing else.

   WE DO NOT IMPORT THE LIBRARY, DELIBERATELY. To make vibration work with NO
   user gesture at all, it reparents `document.body` into a <label>, redefines
   `document.body` with a getter, and runs two MutationObservers over the whole
   subtree. This app has pages that measure the DOM, a fixed-elements law, and a
   service worker precache test; a global body reparent is not a thing to take
   on for a buzz. We do not need the no-gesture case either: every one of those
   forty-nine calls already sits inside a click, tap or keypress handler.

   Read out of that library's own source (`dist/vibration.js`,
   `dist/methods/click-grant/index.js`, `dist/utils/supported-versions.js`), and
   every point below is one an earlier attempt in the Club Arena repo got wrong:

     - CLICK THE LABEL, never the input.
     - NEVER touch `.checked`. `click()`'s own activation behaviour toggles it;
       setting it first means the control ends where it began.
     - THE TRIGGER STAYS DETACHED. It is never added to the document. The input
       inside carries `display: none !important`.
     - THERE IS A VERSION FLOOR. This path only works at iOS/Safari >= 18.4.
       Between 18.0 and 18.4 the only thing that works is the body reparent we
       have refused; below 18, nothing does. Under the floor we install nothing,
       so `navigator.vibrate` stays absent and all forty-nine guards keep doing
       what they do today.

   WE NEVER OVERWRITE A REAL IMPLEMENTATION. If `navigator.vibrate` exists -
   Android, desktop Chrome, anything - this file returns immediately and no
   Android player's haptics change by one millisecond.

   Imported for its side effect by `pages/_app.js`. Also exported piecewise so
   `__tests__/ios-haptics.test.mjs` can drive it without a browser.  */

/** The floor below which the click-inside-a-gesture technique does not work. */
export const IOS_HAPTIC_MIN_VERSION = 18.4;

/**
 * iOS/iPadOS version as a number, or null when this is not iOS WebKit.
 *
 * Two user-agent shapes, and the second is not an edge case - it is the one a
 * home-screen install has, which is the shape most likely to be playing:
 *
 *   Safari tab   "... Version/18.5 Mobile/15E148 Safari/604.1"
 *   PWA / Chrome  no "Version/" and no "Safari" at all, just
 *                "... CPU iPhone OS 18_5 like Mac OS X ... Mobile/15E148"
 *
 * So read the OS token FIRST and fall back to `Version/`, which is what the
 * desktop-class iPad user agent has instead.
 */
export function iosWebkitVersion(userAgent, maxTouchPoints = 0) {
  const ua = userAgent || '';
  if (!ua) return null;
  // iPadOS 13+ reports a Mac user agent and is told apart by having touch points.
  const iPadOS = /Macintosh/.test(ua) && maxTouchPoints > 1;
  if (!/iPhone|iPad|iPod/.test(ua) && !iPadOS) return null;
  if (!/AppleWebKit/.test(ua)) return null;

  const os = /(?:iPhone|CPU) OS (\d+)(?:_(\d+))?/.exec(ua);
  if (os) return Number.parseFloat(`${os[1]}.${os[2] || 0}`);
  const ver = /Version\/(\d+)(?:\.(\d+))?/.exec(ua);
  if (ver) return Number.parseFloat(`${ver[1]}.${ver[2] || 0}`);
  return null;
}

/** Build the detached trigger: a label wrapping a hidden native switch. */
function createTrigger(doc) {
  const label = doc.createElement('label');
  const input = doc.createElement('input');
  input.type = 'checkbox';
  // `switch` is what makes WebKit render - and haptically announce - this as a
  // native switch rather than a tick box.
  input.setAttribute('switch', '');
  input.setAttribute('style', 'display: none !important');
  input.tabIndex = -1;
  label.tabIndex = -1;
  label.appendChild(input);
  // Deliberately NOT appended to the document.
  return label;
}

/**
 * Install the polyfill on a window, if this is a device that needs it and can
 * use it. Returns true when it installed, false when it declined - and the
 * false cases are the interesting ones, so they are all explicit.
 */
export function installIosHaptics(win) {
  if (!win || !win.navigator || !win.document) return false;
  const nav = win.navigator;
  // 1. A real implementation always wins. Android and desktop are untouched.
  if (typeof nav.vibrate === 'function') return false;
  // 2. Only ever install once.
  if (win.__iosHapticsInstalled) return false;

  const version = iosWebkitVersion(nav.userAgent, nav.maxTouchPoints || 0);
  // 3. Not iOS, or an iOS too old for this technique to do anything.
  if (version === null || version < IOS_HAPTIC_MIN_VERSION) return false;

  let trigger = null;

  /**
   * One label click per PULSE. A Vibration API pattern alternates buzz/pause
   * starting with a buzz, so even indices are pulses and odd ones are gaps.
   *
   * The first pulse is synchronous - that is the one still inside the user's
   * gesture. Later pulses are scheduled and land while the platform's
   * activation grant is open, measured at ~850ms in the reference
   * implementation, which every pattern this app sends is well inside.
   */
  function vibrate(input) {
    const list = typeof input === 'number' ? [input] : Array.isArray(input) ? input : null;
    // Match the spec's own validation: a non-numeric entry is a rejected call.
    if (!list || list.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return false;
    // `vibrate(0)` / `vibrate([])` means CANCEL. There is nothing to cancel
    // here - a system haptic is instantaneous - so it succeeds having done
    // nothing, which is what a caller clearing a pattern expects.
    if (list.length === 0 || (list.length === 1 && list[0] <= 0)) return true;

    try {
      if (!trigger) trigger = createTrigger(win.document);
    } catch {
      return false;
    }

    const toggle = () => {
      try {
        trigger.click();
      } catch {
        /* never let a buzz break the caller */
      }
    };
    toggle();

    // Cap the tail. The longest pattern in this repo is five entries, and an
    // unbounded loop over a caller-supplied array is a timer leak waiting to
    // happen.
    let offset = 0;
    let fired = 1;
    for (let i = 0; i < list.length - 1 && fired < 3; i += 2) {
      offset += (list[i] || 0) + (list[i + 1] || 0);
      fired += 1;
      win.setTimeout(toggle, offset);
    }
    return true;
  }

  try {
    // A plain assignment, because `vibrate` is absent here rather than
    // inherited - there is nothing to shadow and nothing to redefine.
    nav.vibrate = vibrate;
  } catch {
    // Some embedded webviews freeze navigator. Nothing to do, and nothing
    // broken: the guards in the call sites keep doing what they do today.
    return false;
  }
  win.__iosHapticsInstalled = true;
  return true;
}

if (typeof window !== 'undefined') {
  installIosHaptics(window);
}
