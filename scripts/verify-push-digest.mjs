/**
 * Verifies the digest grouping logic used by /api/cron/push-dispatch.
 *
 * The rule under test: when one dispatch run holds DIGEST_THRESHOLD or more
 * notifications of the SAME type for the SAME person, they collapse into a
 * single "N new messages" push and the rest are suppressed as
 * `digested_into:<carrier>`. The in-app bell keeps every individual row -- this
 * only collapses the interrupt.
 *
 * Run: node scripts/verify-push-digest.mjs
 */

const DIGEST_THRESHOLD = 3;
const DIGEST_LABEL = {
    new_message: 'messages',
    friend_request: 'friend requests',
};

/** Mirror of the grouping in push-dispatch.js. */
function planDigests(rows) {
    const groups = new Map();
    for (const row of rows) {
        if (!row.recipient_user_id || !row.event) continue;
        const key = `${row.recipient_user_id}|${row.event}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    const absorbed = new Set();
    const carriers = [];
    for (const [, group] of groups) {
        if (group.length < DIGEST_THRESHOLD) continue;
        group.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
        const carrier = group[0];
        const label = DIGEST_LABEL[carrier.event] || 'notifications';
        carrier.title = `${group.length} new ${label}`;
        carrier.tag = `digest:${carrier.event}:${carrier.recipient_user_id}`;
        for (const r of group.slice(1)) absorbed.add(r.id);
        carriers.push(carrier);
    }
    return { absorbed, carriers };
}

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) { failures++; console.log(`  FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
    else console.log(`  ok   ${name}`);
}

const row = (id, user, event, minutesAgo) => ({
    id, recipient_user_id: user, event,
    created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    title: 'x', body: 'hello',
});

console.log('Below threshold stays individual:');
{
    const rows = [row('a', 'u1', 'new_message', 3), row('b', 'u1', 'new_message', 2)];
    const { absorbed, carriers } = planDigests(rows);
    check('2 messages -> nothing absorbed', absorbed.size, 0);
    check('2 messages -> no carrier', carriers.length, 0);
}

console.log('\nAt threshold collapses:');
{
    const rows = [
        row('a', 'u1', 'new_message', 5),
        row('b', 'u1', 'new_message', 3),
        row('c', 'u1', 'new_message', 1),
    ];
    const { absorbed, carriers } = planDigests(rows);
    check('3 messages -> 2 absorbed', absorbed.size, 2);
    check('newest is the carrier', carriers[0].id, 'c');
    check('carrier title counts all', carriers[0].title, '3 new messages');
    check('carrier tag is per user+type', carriers[0].tag, 'digest:new_message:u1');
    check('older rows absorbed', [absorbed.has('a'), absorbed.has('b')], [true, true]);
    check('carrier not absorbed', absorbed.has('c'), false);
}

console.log('\nDifferent users never merge:');
{
    const rows = [
        row('a', 'u1', 'new_message', 3), row('b', 'u1', 'new_message', 2),
        row('c', 'u2', 'new_message', 3), row('d', 'u2', 'new_message', 2),
    ];
    const { absorbed } = planDigests(rows);
    check('2 each, no collapse', absorbed.size, 0);
}

console.log('\nDifferent types never merge:');
{
    const rows = [
        row('a', 'u1', 'new_message', 3),
        row('b', 'u1', 'friend_request', 2),
        row('c', 'u1', 'like', 1),
    ];
    const { absorbed } = planDigests(rows);
    check('3 different types stay separate', absorbed.size, 0);
}

console.log('\nTwo groups collapse independently:');
{
    const rows = [
        row('a', 'u1', 'new_message', 5), row('b', 'u1', 'new_message', 4), row('c', 'u1', 'new_message', 3),
        row('d', 'u1', 'friend_request', 5), row('e', 'u1', 'friend_request', 4), row('f', 'u1', 'friend_request', 3),
    ];
    const { absorbed, carriers } = planDigests(rows);
    check('4 absorbed across 2 groups', absorbed.size, 4);
    check('2 carriers', carriers.length, 2);
    check('labels are type-specific',
        carriers.map((c) => c.title).sort(),
        ['3 new friend requests', '3 new messages']);
}

console.log('\nUnknown type falls back to a generic label:');
{
    const rows = [
        row('a', 'u1', 'weird_event', 3), row('b', 'u1', 'weird_event', 2), row('c', 'u1', 'weird_event', 1),
    ];
    const { carriers } = planDigests(rows);
    check('generic label', carriers[0].title, '3 new notifications');
}

console.log('\nRows with no recipient or event are ignored:');
{
    const rows = [
        { id: 'a', recipient_user_id: null, event: 'new_message', created_at: new Date().toISOString() },
        { id: 'b', recipient_user_id: 'u1', event: null, created_at: new Date().toISOString() },
    ];
    const { absorbed, carriers } = planDigests(rows);
    check('nothing grouped', [absorbed.size, carriers.length], [0, 0]);
}

console.log(failures === 0 ? '\nPASS: digest logic behaves correctly' : `\nFAIL: ${failures} case(s)`);
process.exit(failures === 0 ? 0 : 1);
