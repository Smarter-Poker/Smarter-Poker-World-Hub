# Forty-nine haptic call sites, none of which worked on iOS

2026-09-05. Dan, testing the Club Arena card peel on his phone: "NO HAPTIC OR
VIBRATION WHEN TESTED ... YOU NEED TO GO THROUGH THE CLUB ARENA AND ALL OF THE
WORLD HUB PAGES, AND MAKE SURE THAT THIS IS IMPLEMENTED GLOBALLY."

## What was measured

```
grep -rn 'navigator.vibrate' pages/ src/ | wc -l   ->  49
```

Forty-nine call sites across the trivia games, the reels feed, the diamond
store, the personal assistant sandbox, the live poker table, the cinematic
intro, the launch pad, poker-near-me, the gates, and `userPreferences`'
`triggerHaptic`. There is no vibration gate or util in this repo; each site
calls the API directly.

Every one is correctly guarded - `if (navigator.vibrate)`,
`navigator.vibrate?.(...)`, `'vibrate' in navigator` - and **that is exactly why
nobody noticed.** Apple has never shipped the Vibration API in WebKit, every
browser on iOS is WebKit, so on iPhone and iPad all forty-nine guards are false
and all forty-nine haptics silently do nothing. No error, no warning, no
console line. The feature has never worked on the platform most of our players
hold.

## What was done

`src/lib/iosHaptics.js`, imported for its side effect at the top of
`pages/_app.js`. It supplies `navigator.vibrate` on iOS and nowhere else, so all
forty-nine call sites start working **without one of them being edited** - which
is also the argument for doing it this way rather than converting forty-nine
files to a new helper.

The mechanism: activating a native switch control (`<input type="checkbox"
switch>`) plays the system haptic. That is the trick behind
`ios-vibrator-pro-max` (ISC, https://vibrator.dev), and this file is the trick
alone.

**We do not import that library.** To make vibration work with NO user gesture
at all it reparents `document.body` into a `<label>`, redefines `document.body`
with a getter, and runs two MutationObservers over the whole subtree. Against a
repo with a fixed-elements law, a service-worker precache test and pages that
measure the DOM, that is not a trade worth making for a buzz - and we do not
need the no-gesture case, because all forty-nine calls already sit inside a
click, tap or keypress handler.

## The four things read out of the library's source, not out of a description

An earlier attempt at this technique in the Club Arena repo was written from the
description and did not work. All four are pinned in
`__tests__/ios-haptics.test.mjs`:

1. **Click the LABEL, never the input** (`dist/methods/click-grant/index.js`:
   `hiddenTrigger.label.click()`).
2. **Never touch `.checked`.** `click()`'s own activation behaviour toggles it;
   setting it first means the control ends where it began.
3. **The trigger stays DETACHED** and is never added to the document; the input
   inside carries `display: none !important` (`dist/vibration.js`).
4. **There is a version floor**: iOS/Safari **>= 18.4**
   (`dist/utils/supported-versions.js`). Below that, the only thing that works
   is the body reparent we have refused. Under the floor we install nothing, so
   `navigator.vibrate` stays absent and every guarded call site behaves exactly
   as it does today.

And one more, which would have hidden the fix even after the fix: **a
home-screen install has no `Version/` token and no `Safari` in its user agent**,
just `CPU iPhone OS 18_5`. A `Version/`-only parse reads a PWA as "not iOS", so
the polyfill would have skipped the people most likely to be playing. The OS
token is read first, with `Version/` as the fallback for the desktop-class iPad
UA that has no OS token.

## What cannot change

- **A real implementation always wins.** If `navigator.vibrate` exists - every
  Android phone, every desktop Chrome - the module returns immediately and
  nothing about those devices changes.
- **Install happens once**, and a frozen `navigator` in an embedded webview is
  caught and declined rather than thrown.
- **`vibrate(0)` and `vibrate([])` still mean cancel**, and a malformed pattern
  is still rejected, so the polyfill honours the same contract the call sites
  were written against.

## Verification

`node --test __tests__/ios-haptics.test.mjs` - 19 tests, 3 suites, 0 failures.
Added to the `prebuild` gate, so a regression fails the build.

## The other half

Club Arena is a separate repo and already funnels every haptic through one
`vibrationGate`; its own fix (and three capability checks that reported "this
device cannot vibrate" on every iPhone) is in
`docs/changelog/2026-09-05-peel-v2-and-ios-haptics.md` there.
