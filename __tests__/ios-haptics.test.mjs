/**
 * iOS HAPTICS - the polyfill that makes forty-nine dead call sites work
 *
 * Measured 2026-09-05: 49 files in this repo call `navigator.vibrate(...)`,
 * every one of them correctly guarded with `if (navigator.vibrate)`, and every
 * one of them silently doing nothing on iOS - where WebKit has never shipped
 * the Vibration API. `src/lib/iosHaptics.js` supplies the function.
 *
 * Every assertion below is one of the four things an earlier attempt at this
 * technique (in the Club Arena repo) got WRONG, or one of the two ways this one
 * could hurt somebody if it over-reached. Read against
 * ios-vibrator-pro-max@3.0.3's source, which is where the technique comes from.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installIosHaptics, iosWebkitVersion, IOS_HAPTIC_MIN_VERSION } from '../src/lib/iosHaptics.js';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
// A home-screen install: no "Version/", no "Safari".
const IPHONE_PWA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36';

/** A window with just enough DOM for the trigger, recording every click. */
function fakeWindow({ userAgent, maxTouchPoints = 5, vibrate } = {}) {
  const clicks = [];
  const timers = [];
  const attached = [];
  const makeEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      attributes: {},
      children: [],
      checked: false,
      tabIndex: 0,
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
      },
      appendChild(c) {
        this.children.push(c);
        c.parent = this;
        return c;
      },
      click() {
        clicks.push(this);
      },
    };
    return el;
  };
  const nav = { userAgent, maxTouchPoints };
  if (vibrate) nav.vibrate = vibrate;
  return {
    navigator: nav,
    document: {
      createElement: makeEl,
      body: { appendChild: (c) => attached.push(c) },
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    _clicks: clicks,
    _timers: timers,
    _attached: attached,
  };
}

describe('reading the iOS version out of a user agent', () => {
  test('a Safari tab', () => {
    assert.equal(iosWebkitVersion(IPHONE_SAFARI, 5), 18.5);
  });

  test('A HOME-SCREEN INSTALL, which has no Version/ token at all', () => {
    // This is the shape most likely to be playing, and a Version/-only parse
    // reads it as null - the polyfill would never install for the people who
    // need it most.
    assert.equal(iosWebkitVersion(IPHONE_PWA, 5), 18.5);
  });

  test('an iPad reporting a Mac user agent, told apart by touch points', () => {
    assert.equal(iosWebkitVersion(IPAD_DESKTOP_UA, 5), 18.5);
    // The same user agent on an actual Mac has no touch points and is not iOS.
    assert.equal(iosWebkitVersion(IPAD_DESKTOP_UA, 0), null);
  });

  test('Android and desktop are not iOS', () => {
    assert.equal(iosWebkitVersion(ANDROID, 5), null);
    assert.equal(iosWebkitVersion(DESKTOP, 0), null);
    assert.equal(iosWebkitVersion('', 0), null);
    assert.equal(iosWebkitVersion(undefined, 0), null);
  });
});

describe('when it installs, and when it refuses', () => {
  test('installs on a modern iPhone that has no vibrate', () => {
    const win = fakeWindow({ userAgent: IPHONE_PWA });
    assert.equal(installIosHaptics(win), true);
    assert.equal(typeof win.navigator.vibrate, 'function');
  });

  test('NEVER OVERWRITES A REAL IMPLEMENTATION - Android is untouched', () => {
    const calls = [];
    const win = fakeWindow({
      userAgent: ANDROID,
      vibrate: (p) => {
        calls.push(p);
        return true;
      },
    });
    assert.equal(installIosHaptics(win), false);
    win.navigator.vibrate([15, 30, 15]);
    assert.deepEqual(calls, [[15, 30, 15]]);
    assert.equal(win._clicks.length, 0);
  });

  test('does nothing on a desktop, which already has the API', () => {
    const win = fakeWindow({ userAgent: DESKTOP, maxTouchPoints: 0, vibrate: () => false });
    assert.equal(installIosHaptics(win), false);
  });

  test('REFUSES BELOW THE VERSION FLOOR rather than installing something inert', () => {
    // Under 18.4 the only thing that works is the body reparent this file
    // refuses. Leaving `navigator.vibrate` absent keeps all 49 guarded call
    // sites doing exactly what they do today.
    const old = fakeWindow({ userAgent: IPHONE_PWA.replace('18_5', '18_3') });
    assert.equal(installIosHaptics(old), false);
    assert.equal(old.navigator.vibrate, undefined);

    const ok = fakeWindow({ userAgent: IPHONE_PWA.replace('18_5', '18_4') });
    assert.equal(installIosHaptics(ok), true);
    assert.equal(IOS_HAPTIC_MIN_VERSION, 18.4);
  });

  test('installs only once', () => {
    const win = fakeWindow({ userAgent: IPHONE_SAFARI });
    assert.equal(installIosHaptics(win), true);
    const first = win.navigator.vibrate;
    // A real navigator now has the function, so the first guard catches it too.
    assert.equal(installIosHaptics(win), false);
    assert.equal(win.navigator.vibrate, first);
  });

  test('survives a window with no document or navigator', () => {
    assert.equal(installIosHaptics(null), false);
    assert.equal(installIosHaptics({}), false);
    assert.equal(installIosHaptics({ navigator: {} }), false);
  });
});

describe('what the installed vibrate() actually does', () => {
  function installed() {
    const win = fakeWindow({ userAgent: IPHONE_SAFARI });
    installIosHaptics(win);
    return win;
  }

  test('CLICKS THE LABEL, NOT THE INPUT', () => {
    const win = installed();
    assert.equal(win.navigator.vibrate(20), true);
    assert.equal(win._clicks.length, 1);
    assert.equal(win._clicks[0].tagName, 'LABEL');
  });

  test('the label wraps a native switch input that is display:none', () => {
    const win = installed();
    win.navigator.vibrate(20);
    const label = win._clicks[0];
    const input = label.children[0];
    assert.equal(input.tagName, 'INPUT');
    assert.equal(input.type, 'checkbox');
    assert.equal(input.getAttribute('switch'), '');
    assert.match(input.getAttribute('style'), /display:\s*none/);
  });

  test('NEVER touches .checked - the click is the whole state change', () => {
    const win = installed();
    win.navigator.vibrate(20);
    // click() is recorded rather than executed here, so if the polyfill were
    // setting `.checked` itself this would be true - and on a real device the
    // click that follows would toggle it straight back to where it started.
    assert.equal(win._clicks[0].children[0].checked, false);
  });

  test('THE TRIGGER IS DETACHED - nothing is added to the document', () => {
    const win = installed();
    win.navigator.vibrate(20);
    assert.deepEqual(win._attached, []);
    assert.equal(win._clicks[0].parent, undefined);
  });

  test('reuses one trigger across many buzzes', () => {
    const win = installed();
    win.navigator.vibrate(10);
    win.navigator.vibrate(10);
    assert.equal(win._clicks.length, 2);
    assert.equal(win._clicks[0], win._clicks[1]);
  });

  test('one click per pulse, capped at three, scheduled on the pattern gaps', () => {
    const win = installed();
    assert.equal(win.navigator.vibrate([10, 20, 10, 20, 10, 20, 10]), true);
    assert.equal(win._clicks.length, 1, 'the first pulse is synchronous');
    assert.equal(win._timers.length, 2, 'capped at three total');
    assert.deepEqual(
      win._timers.map((t) => t.ms),
      [30, 60]
    );
    for (const t of win._timers) t.fn();
    assert.equal(win._clicks.length, 3);
    assert.ok(win._clicks.every((c) => c.tagName === 'LABEL'));
  });

  test('vibrate(0) and vibrate([]) mean CANCEL: succeed, buzz nothing', () => {
    const win = installed();
    assert.equal(win.navigator.vibrate(0), true);
    assert.equal(win.navigator.vibrate([]), true);
    assert.equal(win._clicks.length, 0);
  });

  test('rejects a malformed pattern the way the spec does', () => {
    const win = installed();
    assert.equal(win.navigator.vibrate('buzz'), false);
    assert.equal(win.navigator.vibrate([10, 'x']), false);
    assert.equal(win.navigator.vibrate([10, NaN]), false);
    assert.equal(win._clicks.length, 0);
  });

  test('a click that throws never reaches the caller', () => {
    const win = installed();
    win.navigator.vibrate(10);
    win._clicks[0].click = () => {
      throw new Error('WebKit said no');
    };
    assert.doesNotThrow(() => win.navigator.vibrate(10));
  });
});
