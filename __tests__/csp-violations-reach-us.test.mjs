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
