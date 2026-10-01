/**
 * THE INJECTION DIRECTIVES STAY ENFORCED.
 *
 * next.config.js has carried `Content-Security-Policy-Report-Only` since Phase
 * 6.1.14 with a comment saying it graduates to enforcing "once violations have
 * been monitored and confirmed zero". Nothing ever monitored it: the policy has
 * no reporting directive at all (a `report-uri` was added 2026-09-30), so a violation writes one line to one
 * browser console and is forgotten. The file says so itself, about the retired error provider
 * allowance that was missing for ten days.
 *
 * On 2026-09-11 four directives graduated - the ones that govern INJECTION
 * rather than resource loading. None of them names a resource this site
 * fetches, so none can break a page by being slightly incomplete, and each was
 * checked against the source before it moved. This file keeps those checks
 * true, because every one of them is an assumption about code somebody will
 * edit later:
 *
 *   object-src 'none'       assumes no <object> or <embed> is ever added.
 *   base-uri 'self'         assumes the only <base> tag on the platform is the
 *                           one pages/api/proxy.js injects into proxied HTML -
 *                           and that the proxy keeps setting its OWN enforced
 *                           policy, which REPLACES this header rather than
 *                           adding to it. Measured live on 2026-09-11:
 *                           /api/proxy returns the proxy's policy only. Delete
 *                           that res.setHeader and the reader breaks.
 *   form-action 'self'      assumes no form posts off-origin, and that the
 *                           proxy keeps rewriting proxied form actions back
 *                           through /api/proxy, which is same-origin.
 *   frame-ancestors 'self'  already true via X-Frame-Options: SAMEORIGIN.
 *
 * The resource-loading directives - script-src, style-src, connect-src,
 * img-src, font-src, media-src, frame-src, worker-src - are deliberately NOT
 * asserted as enforced. They stay report-only until Club Arena's
 * tests/e2e/production-csp-violations.spec.ts has watched production for
 * longer than one afternoon.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const CONFIG = readFileSync('next.config.js', 'utf8');
const PROXY = readFileSync('pages/api/proxy.js', 'utf8');

/** The `enforcedCsp` array literal, as written. */
const ENFORCED = (() => {
  const start = CONFIG.indexOf('const enforcedCsp = [');
  assert.notEqual(start, -1, 'next.config.js no longer defines enforcedCsp');
  const end = CONFIG.indexOf('].join(', start);
  return CONFIG.slice(start, end);
})();

const ROOTS = ['src', 'pages', 'public', 'app'];

/**
 * grep -rlE over SOURCE files only, returning [] rather than throwing when
 * nothing matches.
 *
 * -I (skip binaries) is not decoration. The first run of this file reported
 * four .mp3 files under public/audio as forms posting off-origin: compressed
 * audio contains every byte sequence eventually, `action="http` included. A
 * guard that cries wolf about an MP3 gets deleted.
 *
 * The --include list is what keeps this under a second instead of nineteen.
 */
const SOURCE = [
  '--include=*.js',
  '--include=*.jsx',
  '--include=*.ts',
  '--include=*.tsx',
  '--include=*.html',
];

function filesMatching(pattern, roots = ROOTS) {
  try {
    return execFileSync(
      'grep',
      [
        '-rlIE',
        ...SOURCE,
        '--exclude-dir=node_modules',
        '--exclude-dir=.next',
        '--',
        pattern,
        ...roots,
      ],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

test('the four injection directives are in the ENFORCED policy', () => {
  for (const directive of [
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ]) {
    assert.ok(
      ENFORCED.includes(directive),
      `${directive} left the enforced policy. It is enforced on purpose - see the ` +
        'comment above enforcedCsp in next.config.js for what was checked.',
    );
  }
});

test('the enforced header is served everywhere, not only on Vercel', () => {
  // It used to sit inside `...(process.env.VERCEL ? [...] : [])`, which left
  // localhost and any non-Vercel deployment with no enforced policy at all.
  // Only upgrade-insecure-requests is still conditional, and it is conditional
  // INSIDE the list, for the WebKit-on-HTTP reason the file gives.
  const block = CONFIG.slice(CONFIG.indexOf("key: 'Content-Security-Policy-Report-Only'"));
  const enforcedKey = block.indexOf("key: 'Content-Security-Policy',");
  assert.notEqual(enforcedKey, -1, 'the enforced Content-Security-Policy header is gone');
  assert.ok(
    !/\.\.\.\(process\.env\.VERCEL\s*$/m.test(block.slice(0, enforcedKey).trimEnd()),
    'the enforced header went back behind a VERCEL-only spread',
  );
  assert.ok(
    ENFORCED.includes("process.env.VERCEL ? ['upgrade-insecure-requests']"),
    'upgrade-insecure-requests must stay Vercel-only: next start serves HTTP and ' +
      'WebKit upgrades every same-origin chunk, leaving the page blank.',
  );
});

test('the resource-loading directives are still only report-only', () => {
  // Graduating one of these by accident is the failure the staged rollout
  // exists to avoid: they name hosts, and a missing host takes the feature with
  // it. retired error provider was missing for ten days under this very policy.
  for (const directive of ['script-src', 'connect-src', 'img-src', 'style-src', 'font-src']) {
    assert.ok(
      !ENFORCED.includes(directive),
      `${directive} was added to the enforced policy. It belongs in the report-only ` +
        'one until production has been watched for longer than an afternoon.',
    );
  }
});

test('and a composed directive cannot slip past the check above', () => {
  // THIS LAW ALREADY EXISTED AND DID NOT HOLD (2026-09-30).
  //
  // img-src was enforced for several hours. The check above greps the array's
  // text for the literal string `img-src`, and the change added
  // `imgSrcDirective()` instead - a function that RETURNS the directive. The
  // literal never appeared, the law passed, and the policy shipped.
  //
  // What it cost: 16 people who sign in with Google have an
  // lh3.googleusercontent.com avatar, and it was blocked. 187 of the 187
  // social posts carrying a link_image were blocked. The bankroll map lost
  // its Leaflet pins. None of it is reachable signed out, so the sweep that
  // cleared the change never saw any of it.
  //
  // A builder is exactly how a resource directive will arrive next time, so
  // the law has to read the call as well as the string.
  const BUILDERS = [
    ['imgSrcDirective', 'img-src'],
    ['scriptSrcDirective', 'script-src'],
    ['styleSrcDirective', 'style-src'],
    ['connectSrcDirective', 'connect-src'],
    ['fontSrcDirective', 'font-src'],
  ];
  for (const [fn, directive] of BUILDERS) {
    assert.ok(
      !new RegExp(`${fn}\\s*\\(`).test(ENFORCED),
      `${fn}() composes ${directive}, and calling it inside enforcedCsp enforces ` +
        `${directive} without ever writing the words. That is how it shipped last ` +
        'time. Put it in the report-only policy, or change this law deliberately.',
    );
  }
  // Anything that reads like a directive builder, including one not yet
  // written, so the next spelling is caught too.
  const unknown = [...ENFORCED.matchAll(/([A-Za-z]+(?:Src|Source)[A-Za-z]*Directive)\s*\(/g)]
    .map((m) => m[1])
    .filter((name) => !BUILDERS.some(([fn]) => fn === name));
  assert.deepEqual(unknown, [],
    'an unrecognised directive builder is being called inside enforcedCsp: '
    + `${unknown.join(', ')}. Add it to BUILDERS above, or do not enforce it.`);
});

test('the proxy still sets its own enforced policy, which is what makes base-uri safe', () => {
  assert.ok(
    /res\.setHeader\(\s*['"]Content-Security-Policy['"]/.test(PROXY),
    'pages/api/proxy.js stopped setting its own Content-Security-Policy. It injects ' +
      "a cross-origin <base> tag into proxied HTML, and base-uri 'self' in the global " +
      'enforced policy would now block it, breaking every proxied article.',
  );
  assert.ok(
    /["']base-uri https:["']/.test(PROXY),
    "the proxy's own policy no longer allows a cross-origin base-uri, so the <base> " +
      'tag it injects cannot work.',
  );
  assert.ok(
    /<base href="\$\{originUrl\}\/">/.test(PROXY),
    'the proxy no longer injects a <base> tag - if that is deliberate, the assertions ' +
      "above can go and base-uri 'self' becomes unconditionally safe.",
  );
});

test("nothing uses <object> or <embed>, which is what makes object-src 'none' safe", () => {
  // The leading (^|[^A-Za-z]) is load-bearing. Without it this matched
  // `@returns {Promise<object>}` in three JSDoc blocks and reported the OCR
  // library as a Flash embed.
  const hits = filesMatching('(^|[^A-Za-z])<(object|embed)[ />]');
  assert.deepEqual(
    hits,
    [],
    "these files use <object> or <embed>, which the enforced object-src 'none' now blocks",
  );
});

test('no form posts off-origin, which is what makes form-action safe', () => {
  const hits = filesMatching('<form[^>]*action=["\']https?://');
  assert.deepEqual(
    hits,
    [],
    "these files submit a form to an absolute URL, which the enforced form-action 'self' " +
      'now blocks. Either the destination is same-origin and should be written as a path, ' +
      'or form-action has to leave the enforced policy.',
  );
});

test('X-Frame-Options is still there, because frame-ancestors is only its modern spelling', () => {
  assert.ok(
    /key: 'X-Frame-Options'/.test(CONFIG),
    'X-Frame-Options was removed. frame-ancestors covers modern browsers, but legacy ' +
      'browsers and some embedded webviews only honour XFO, and this platform is opened ' +
      'inside a native app webview.',
  );
});
