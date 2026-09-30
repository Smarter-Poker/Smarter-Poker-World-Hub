/* The article reader proxy validated the caller's URL and then let the platform
   follow redirects, so the check ran once and the platform went wherever that
   host pointed.

   The first repair checked the hostname STRING, which caught 169.254.169.254
   and missed six other spellings of the same address. These tests judge real
   URLs through the shipped predicate, so a predicate that stops working fails
   them, which source matching could not do. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFetchableUrl, isBlockedAddress, fetchGuarded } from '../src/lib/security/fetchableUrl.js';

const MUST_REFUSE = [
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata, plain'],
    ['http://[::ffff:169.254.169.254]/latest/meta-data/', 'cloud metadata, v4-mapped IPv6'],
    ['http://[::ffff:127.0.0.1]/', 'loopback, v4-mapped IPv6'],
    ['http://[::]/', 'unspecified address, reaches loopback'],
    ['http://[::1]/', 'IPv6 loopback'],
    ['http://[fe80::1]/', 'IPv6 link-local'],
    ['http://[fd00::1]/', 'IPv6 unique-local'],
    ['http://[fc00::1]/', 'IPv6 unique-local, low half'],
    ['http://127.0.0.1/', 'loopback'],
    ['http://10.0.0.5/', 'private'],
    ['http://192.168.1.1/', 'private'],
    ['http://172.16.0.1/', 'private'],
    ['http://100.64.0.1/', 'carrier grade NAT'],
    ['http://2130706433/', 'loopback, decimal'],
    ['http://0x7f000001/', 'loopback, hex'],
    ['http://metadata.google.internal./', 'metadata name with a trailing dot'],
    ['ftp://example.com/', 'protocol outside the allow list'],
];

for (const [url, why] of MUST_REFUSE) {
    test(`refuses ${url}  (${why})`, async () => {
        assert.equal(await assertFetchableUrl(new URL(url)), false);
    });
}

test('refuses a name that resolves to a blocked address', async () => {
    // Nothing about the TEXT of this name is suspicious, which is exactly why a
    // string check could never catch it. It resolves to the metadata address.
    const ok = await assertFetchableUrl(new URL('http://169.254.169.254.nip.io/'));
    assert.equal(ok, false);
});

test('still allows an ordinary publisher', async () => {
    assert.equal(await assertFetchableUrl(new URL('https://www.pokernews.com/')), true);
});

test('isBlockedAddress judges the address families directly', () => {
    for (const a of ['127.0.0.1', '::1', '::', '::ffff:127.0.0.1', 'fe80::1', 'fd00::1', '169.254.169.254', '224.0.0.1'])
        assert.equal(isBlockedAddress(a), true, `${a} must be blocked`);
    for (const a of ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])
        assert.equal(isBlockedAddress(a), false, `${a} must be allowed`);
});

test('a redirect to a blocked address is refused, and never dialled', async () => {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (u) => {
        calls.push(String(u));
        return { status: 302, headers: new Map([['location', 'http://[::ffff:169.254.169.254]/latest/meta-data/']]), body: null };
    };
    // Map#get is close enough to Headers#get for this, but must answer null.
    const patch = (m) => { const g = m.get.bind(m); m.get = (k) => g(String(k).toLowerCase()) ?? null; return m; };
    globalThis.fetch = async (u) => { calls.push(String(u)); return { status: 302, headers: patch(new Map([['location', 'http://[::ffff:169.254.169.254]/latest/meta-data/']])), body: null }; };
    try {
        await assert.rejects(
            () => fetchGuarded('https://www.pokernews.com/story', {}),
            (e) => e.code === 'BLOCKED_REDIRECT',
        );
        assert.equal(calls.length, 1, 'only the first URL is fetched');
        assert.equal(calls.some((c) => c.includes('169.254')), false, 'the blocked address is never dialled');
    } finally { globalThis.fetch = original; }
});

test('the redirect chain is capped at the number it claims', async () => {
    let n = 0;
    const original = globalThis.fetch;
    const patch = (m) => { const g = m.get.bind(m); m.get = (k) => g(String(k).toLowerCase()) ?? null; return m; };
    globalThis.fetch = async () => {
        n += 1;
        return { status: 302, headers: patch(new Map([['location', 'https://www.pokernews.com/next' + n]])), body: null };
    };
    try {
        await assert.rejects(() => fetchGuarded('https://www.pokernews.com/a', {}, 5), (e) => e.code === 'TOO_MANY_REDIRECTS');
        assert.equal(n, 5, 'maxHops of 5 means 5 outbound requests, not 6');
    } finally { globalThis.fetch = original; }
});

test('a non-redirect response is returned untouched', async () => {
    const original = globalThis.fetch;
    const patch = (m) => { const g = m.get.bind(m); m.get = (k) => g(String(k).toLowerCase()) ?? null; return m; };
    globalThis.fetch = async () => ({ status: 200, ok: true, headers: patch(new Map()), body: null });
    try {
        const r = await fetchGuarded('https://www.pokernews.com/', {});
        assert.equal(r.status, 200);
    } finally { globalThis.fetch = original; }
});
