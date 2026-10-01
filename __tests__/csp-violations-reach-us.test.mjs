/* The Report-Only policy has to be observable from here, or it can never be
   enforced. These pin the two halves of that: the headers carry a reporting
   destination, and the endpoint they point at can read what a browser sends
   without logging anything that could carry a token.

   next.config.js is read as text, not required: it pulls in webpack, which is
   not an installed dependency. That is the same approach
   the-injection-directives-stay-enforced.law.test.mjs takes on this file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cspModule = await import('../pages/api/security/csp-report.js');
const { safeUri, normalize, default: handler } = cspModule;
const CONFIG = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');

test('both policies say where to send a violation', () => {
    assert.match(
        CONFIG,
        /const reportingDirectives = `report-uri \$\{CSP_REPORT_PATH\}`/,
        'a reporting destination must be built',
    );
    assert.match(
        CONFIG,
        /key: 'Content-Security-Policy-Report-Only',\s*\n\s*value: `\$\{csp\}; \$\{reportingDirectives\}`/,
        'the staged policy must report',
    );
    const enforced = CONFIG.slice(CONFIG.indexOf('const enforcedCsp = ['));
    assert.match(
        enforced.slice(0, enforced.indexOf('].join')),
        /reportingDirectives/,
        'the enforced policy must report too',
    );
});

test('report-to stays out, because adding it stops reports arriving', () => {
    // Measured against production 2026-09-30, headless Chromium, on a page that
    // trips eight img-src violations: report-uri alone delivered 8 of 8, and
    // both spellings together delivered 0 of 8. Chromium abandons report-uri as
    // soon as report-to appears, then delivers nothing. Putting it back needs a
    // measurement showing it delivers, not a spec reference saying it should.
    assert.doesNotMatch(CONFIG, /report-to csp/, 'report-to suppresses the delivery that works');
    assert.doesNotMatch(CONFIG, /Reporting-Endpoints/, 'that header exists only to name a report-to group');
});

test('a report never carries a query string into the log', () => {
    // document-uri and blocked-uri can hold a recovery token or invite code.
    assert.equal(safeUri('https://smarter.poker/reset?token=SECRET', { keepPath: true }), 'https://smarter.poker/reset');
    assert.equal(safeUri('https://cdn.example.com/a/b.png?sig=SECRET'), 'https://cdn.example.com');
    assert.equal(safeUri('inline'), 'inline');
    assert.equal(safeUri(''), '');
});

test('both report shapes a browser can send are understood', () => {
    const legacy = normalize({
        'csp-report': {
            'effective-directive': 'img-src',
            'blocked-uri': 'https://thelodgepokerclub.com/photo.jpg?x=1',
            'document-uri': 'https://smarter.poker/hub/poker-near-me/venues?q=a',
        },
    });
    assert.deepEqual(legacy, [{
        directive: 'img-src',
        blocked: 'https://thelodgepokerclub.com',
        document: 'https://smarter.poker/hub/poker-near-me/venues',
        disposition: 'report',
    }]);

    const modern = normalize([{
        type: 'csp-violation',
        body: { effectiveDirective: 'script-src', blockedURL: 'https://evil.test/x.js', documentURL: 'https://smarter.poker/hub', disposition: 'enforce' },
    }]);
    assert.equal(modern.length, 1);
    assert.equal(modern[0].directive, 'script-src');
    assert.equal(modern[0].blocked, 'https://evil.test');
    assert.equal(modern[0].disposition, 'enforce');
});

test('a report that is not a CSP violation is ignored', () => {
    assert.deepEqual(normalize([{ type: 'deprecation', body: { id: 'x' } }]), []);
    assert.deepEqual(normalize(null), []);
    assert.deepEqual(normalize('nonsense'), []);
});

// ---- the handler itself, driven with real bodies ----

function drive(body, { contentType = 'application/csp-report', method = 'POST' } = {}) {
    const lines = [];
    const warn = console.warn;
    console.warn = (...a) => lines.push(a.join(' '));
    const chunks = [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
    const req = {
        method,
        headers: { 'content-type': contentType },
        on(ev, cb) {
            if (ev === 'data') chunks.forEach((c) => cb(c));
            if (ev === 'end') cb();
            return this;
        },
        destroy() { this.destroyed = true; },
    };
    let status = null, ended = false;
    const res = { status(c) { status = c; return this; }, end() { ended = true; return this; } };
    return handler(req, res).then(() => { console.warn = warn; return { lines, status, ended, req }; },
                                  (e) => { console.warn = warn; throw e; });
}

test('a report cannot forge extra log lines with a newline', async () => {
    const { lines } = await drive({
        'csp-report': {
            'effective-directive': 'img-src\n[csp-report] report script-src blocked=FORGED',
            'blocked-uri': 'javascript\nFORGED-SECOND-LINE',
            'document-uri': 'https://smarter.poker/x',
        },
    });
    const forged = lines.join('\n').split('\n').filter((l) => l.includes('[csp-report]'));
    assert.equal(forged.length, lines.length, 'one log line per report, no injected ones');
    assert.equal(/FORGED-SECOND-LINE/.test(lines.join(' ')) && lines.join('\n').includes('\n'), false);
    for (const l of lines) assert.doesNotMatch(l, /[\r\n]/, 'no control characters reach the log');
});

test('one request cannot write an unbounded number of lines', async () => {
    // 50 distinct shapes, which defeats per-shape deduplication by design.
    const body = Array.from({ length: 50 }, (_, i) => ({
        type: 'csp-violation',
        body: { effectiveDirective: `img-src${i}`, blockedURL: `https://uniq-${i}.test/x`, documentURL: 'https://smarter.poker/x' },
    }));
    const { lines } = await drive(body, { contentType: 'application/reports+json' });
    assert.ok(lines.length <= 5, `at most 5 lines, got ${lines.length}`);
});

test('an enforced block and a report-only violation do not alias', () => {
    const a = normalize({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://x.test/a', disposition: 'enforce' } });
    const b = normalize({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://x.test/a', disposition: 'report' } });
    assert.notEqual(a[0].disposition, b[0].disposition, 'disposition is carried, so the key can separate them');
});

test('every request is answered 204, including the hostile ones', async () => {
    for (const [body, ct] of [
        [{ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://a.test/x' } }, 'application/csp-report'],
        ['not json at all', 'application/csp-report'],
        ['', 'application/csp-report'],
        [{ 'csp-report': { junk: true } }, 'application/csp-report'],
    ]) {
        const { status, ended } = await drive(body, { contentType: ct });
        assert.equal(status, 204);
        assert.equal(ended, true);
    }
});

test('an oversized body is answered, not hung up on', async () => {
    const huge = JSON.stringify({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://a.test/' + 'x'.repeat(40000) } });
    const { status, ended, req } = await drive(huge);
    assert.equal(status, 204, 'still answers');
    assert.equal(ended, true);
    assert.notEqual(req.destroyed, true, 'the socket the 204 is written to must survive');
});

test('a GET writes nothing', async () => {
    const { lines, status } = await drive({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://a.test/x' } }, { method: 'GET' });
    assert.equal(status, 204);
    assert.equal(lines.length, 0);
});

// ── The two allow-list gaps measured on production, 2026-09-30 ──────────────
//
// Both were found by sweeping live routes for securitypolicyviolation events
// while the policy is still Report-Only, which is the whole reason it is
// staged. Neither is a hotlink: each is a host the policy plainly meant to
// permit and did not name.

test('img-src names the host YouTube actually serves thumbnails from', async () => {
    const { IMAGE_SOURCES, imgSrcDirective } = await import('../src/lib/security/imageHosts.js');
    assert.ok(IMAGE_SOURCES.includes('https://i.ytimg.com'),
        'i.ytimg.com is where the thumbnails come from; /hub/news reported five a load without it');
    assert.ok(imgSrcDirective().includes('https://i.ytimg.com'),
        'the directive is built from that list, so it must carry the host too');
});

test('script-src and style-src name the commander app proxied onto this origin', () => {
    const script = CONFIG.match(/"script-src [^"]+"/);
    const style = CONFIG.match(/"style-src [^"]+"/);
    assert.ok(script && style, 'both directives must exist');
    // vercel.json rewrites /commander/* to this app and its Next build uses an
    // absolute assetPrefix, so the proxied page loads nine cross-origin scripts
    // and a stylesheet. 'self' never matches a subdomain.
    assert.ok(script[0].includes('https://commander.smarter.poker'),
        'the proxied commander page reported 13 violations a load without this');
    assert.ok(style[0].includes('https://commander.smarter.poker'),
        'the same page loads its stylesheet from that host');
    // A wildcard here would authorise script execution from every subdomain.
    assert.ok(!script[0].includes('https://*.smarter.poker'),
        'script-src must name the exact host, never a wildcard over our subdomains');
});

// ── img-src is ENFORCED, not merely reported ───────────────────────────────

test('img-src stays out of the enforced policy until the signed-in surface is guarded', () => {
    const enforced = CONFIG.match(/const enforcedCsp = \[([\s\S]*?)\]\.join/);
    assert.ok(enforced, 'the enforced policy must exist');
    assert.ok(!/imgSrcDirective\(\)/.test(enforced[1]),
        'img-src was enforced on a sweep that never signed in. Measured afterwards: '
        + '16 profiles carry an lh3.googleusercontent.com avatar from Google sign-in, '
        + '187 of 187 social posts with a link_image were blocked, and the bankroll '
        + 'map lost its Leaflet pins. It goes back when the signed-in surface is '
        + 'guarded AND measured.');
    assert.ok(!/["']img-src [^"']+["']/.test(enforced[1]),
        'and never as a hand-written copy either');
});

test('img-src is still reported, so the evidence keeps accumulating', () => {
    const reportOnly = CONFIG.match(/const csp = \[([\s\S]*?)\]\.join/);
    assert.ok(reportOnly, 'the report-only policy must exist');
    assert.match(reportOnly[1], /imgSrcDirective\(\)/,
        'un-enforcing must not mean un-watching');
});

test('the enforced policy still says where to report, so a mistake is visible', () => {
    const enforced = CONFIG.match(/const enforcedCsp = \[([\s\S]*?)\]\.join/);
    assert.match(enforced[1], /reportingDirectives/,
        'enforcing without reporting means a blocked picture fails silently');
});

