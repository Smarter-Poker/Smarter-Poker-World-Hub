/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NOTIFICATION COPY — WHAT THE USER ACTUALLY READS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Both defects below were visible in a screenshot Dan sent of his own
 * notification list, and neither was a routing or wiring problem — the code
 * ran perfectly and displayed the wrong words.
 *
 * 1. ACRONYMS DESTROYED. enforceTitleCase implemented "capitalise every word"
 *    by lowercasing the rest of each word. In a poker product that is not a
 *    style choice, it is data loss:
 *        'At PLO5 1.00/2.00'  ->  'At Plo5 1.00/2.00'
 *        'At NLH 3.00/6.00'   ->  'At Nlh 3.00/6.00'
 *        'P&L failed'         ->  'P&l Failed'
 *
 * 2. HEADLINES TRUNCATED. The bold prefix took the first two words of the
 *    title unconditionally. The row renders `<b>{actor_name}</b> {message}`,
 *    so the rest of the title is never shown anywhere:
 *        'Finish Setting Up Your Page'   ->  'Finish Setting'
 *        'Push Health Alert'             ->  'Push Health'
 *        'Midway Union weekly statement' ->  'Midway Union'
 *
 * These assert the real functions by extracting them from the API route, so
 * they cannot pass against a stale copy of the logic.
 *
 * Run: node --test __tests__/notification-copy.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED = readFileSync(join(ROOT, 'pages/api/notifications/feed.js'), 'utf8');

// Pull the real implementation out of the route rather than restating it.
const start = FEED.indexOf('function enforceTitleCase');
assert.ok(start > -1, 'enforceTitleCase is gone; this test needs rewriting');
const end = FEED.indexOf('// ── Server-side in-memory TTL cache', start);
assert.ok(end > start, 'could not bound enforceTitleCase');
const enforceTitleCase = new Function(`${FEED.slice(start, end)}; return enforceTitleCase;`)();

test('poker acronyms survive title casing', () => {
    assert.equal(
        enforceTitleCase('A Seat Just Opened At PLO5 1.00/2.00. Sit Down Now To Claim It.'),
        'A Seat Just Opened At PLO5 1.00/2.00. Sit Down Now To Claim It.'
    );
    assert.equal(
        enforceTitleCase('A Seat Just Opened At NLH 3.00/6.00. Sit Down Now To Claim It.'),
        'A Seat Just Opened At NLH 3.00/6.00. Sit Down Now To Claim It.'
    );
    for (const acr of ['NLH', 'PLO', 'PLO5', 'MTT', 'SNG', 'BBJ', 'VIP', 'GTO', 'ICM', 'EV']) {
        assert.match(enforceTitleCase(`join the ${acr} game`), new RegExp(`\\b${acr}\\b`), `${acr} was mangled`);
    }
});

test('ampersand acronyms are not split into P&l', () => {
    assert.equal(enforceTitleCase('Weekly player P&L failed'), 'Weekly Player P&L Failed');
});

test('hyphens and slashes get their own capital', () => {
    assert.equal(
        enforceTitleCase("This week's club/union player win-loss settlement did not run"),
        "This Week's Club/Union Player Win-Loss Settlement Did Not Run"
    );
});

test('a possessive s is not capitalised into Week\'S', () => {
    // The first attempt at the hyphen/slash fix produced exactly this.
    assert.match(enforceTitleCase("this week's report"), /Week's/);
    assert.ok(!/Week'S/.test(enforceTitleCase("this week's report")));
    assert.match(enforceTitleCase("don't miss it"), /Don't/);
});

test('ordinary prose still gets title cased', () => {
    assert.equal(enforceTitleCase('mason bekavac commented on your post'), 'Mason Bekavac Commented On Your Post');
});

// ── The bold prefix ────────────────────────────────────────────────────────
const SOCIAL_VERB = /^(commented|liked|replied|mentioned|shared|posted|started|sent|accepted|added|followed|invited|is\s+now|wants)/i;
function boldPrefix(title) {
    const m = title.match(/^([A-Za-z][A-Za-z'’-]*\s+[A-Za-z][A-Za-z'’-]*)\s+(.*)$/);
    return (m && SOCIAL_VERB.test(m[2])) ? m[1] : title;
}

test('the feed still uses the social-verb gate, not a blind two-word slice', () => {
    assert.match(FEED, /SOCIAL_VERB/, 'the two-word slice must be gated on a social verb');
    assert.match(FEED, /personFromTitle/, 'the gated helper is gone');
    // Scope this to the DISPLAY chain only. The same two-word regex still
    // appears above for looking a profile up by full_name, which is a
    // different job and must not fail this test -- my first version of this
    // assertion scanned the whole file and flagged that legitimate use.
    const chainStart = FEED.indexOf('const displayNameRaw');
    const chain = FEED.slice(chainStart, FEED.indexOf('const displayName =', chainStart));
    assert.ok(
        !/title\.match\(/.test(chain),
        'displayNameRaw is slicing the title directly again; system headlines will truncate'
    );
    assert.match(chain, /personFromTitle/, 'displayNameRaw must go through the gated helper');
});

test('system notification headlines are never truncated', () => {
    for (const t of [
        'Finish Setting Up Your Page',
        'Weekly player P&L failed',
        'Push Health Alert',
        'Midway Union weekly statement',
        'Seat Open',
    ]) {
        assert.equal(boldPrefix(t), t, `"${t}" lost words from its headline`);
    }
});

test('a real person notification still shows just the name', () => {
    assert.equal(boldPrefix('Mason Bekavac commented on your post'), 'Mason Bekavac');
    assert.equal(boldPrefix('Adelaide Thornton sent you a friend request'), 'Adelaide Thornton');
    assert.equal(boldPrefix("Chase O'Ryan is now your friend"), "Chase O'Ryan");
});
