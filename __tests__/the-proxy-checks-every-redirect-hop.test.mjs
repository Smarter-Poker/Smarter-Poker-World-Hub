/* The article reader proxy validated the caller's URL and then fetched it with
   `redirect: 'follow'`. That made the check decorative: a page on an allowed
   domain answering `302 Location: http://169.254.169.254/...` walked straight
   past every blocked host and metadata address in the file, and the response
   came back to the caller.

   The handler cannot be imported here (its imports are extensionless, which
   Next resolves and bare node does not), so this pins the source, the same way
   the-injection-directives-stay-enforced.law.test.mjs pins next.config.js. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'pages/api/proxy.js'), 'utf8');

test('redirects are followed by us, so every hop is checked', () => {
    assert.match(SRC, /async function fetchGuarded\(/, 'a guarded follower must exist');
    assert.match(SRC, /redirect: 'manual'/, 'hops must not be followed by the platform');
    assert.doesNotMatch(
        SRC,
        /redirect: 'follow'/,
        'a blind follow makes the SSRF check below it decorative',
    );
    assert.match(SRC, /maxHops = 5/, 'the chain must be capped');
});

test('the hop check is the same predicate as the up-front check', () => {
    // Two copies of this rule would drift, and the copy on the redirect path is
    // the one nobody would notice going stale.
    assert.match(SRC, /function isFetchableUrl\(parsed\)/, 'one shared predicate');
    assert.match(SRC, /isPrivateOrReservedHost\(parsed\.hostname\)/, 'which keeps the private range check');
    assert.match(SRC, /CONFIG\.ALLOWED_PROTOCOLS\.includes\(parsed\.protocol\)/, 'and the protocol check');
    assert.match(SRC, /if \(!isFetchableUrl\(next\)\)/, 'applied to each redirect target');
    assert.match(SRC, /if \(!isFetchableUrl\(parsed\)\)/, 'and to the URL the caller supplied');
});

test('a relative Location is resolved before it is judged', () => {
    // `Location: /admin` is legal and common. Judging the raw string rather than
    // the resolved URL would let a relative hop skip the check entirely.
    assert.match(SRC, /new URL\(location, current\)/, 'resolve against the current URL');
});

test('a refused redirect is not retried into three outbound requests', () => {
    assert.match(SRC, /error\.code === 'BLOCKED_REDIRECT'/, 'refusal is a decision, not a transient failure');
    assert.match(SRC, /'TOO_MANY_REDIRECTS'/, 'and so is an endless chain');
});

test('the metadata addresses this protects are still listed', () => {
    for (const host of ['169.254.169.254', 'metadata.google.internal', '100.100.100.200']) {
        assert.ok(SRC.includes(host), `${host} must stay blocked`);
    }
});
