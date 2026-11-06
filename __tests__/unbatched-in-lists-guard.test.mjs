import test from 'node:test';
import assert from 'node:assert/strict';
import { unboundedInCalls, scan } from '../scripts/ci/check-unbatched-in-lists.mjs';
import { readFileSync } from 'node:fs';

test('flags an inbox-wide IN list and the pre-fix contacts lookup', () => {
    assert.equal(unboundedInCalls(".from('social_messages').select('x').in('conversation_id', ids).limit(500)").length, 1);
    assert.equal(unboundedInCalls(".in('conversation_id', conversationIds)\n.neq('user_id', userId)").length, 1);
});

test('accepts literal, sliced, batched and annotated lists', () => {
    assert.equal(unboundedInCalls(".in('role', ['agent', 'owner'])").length, 0);
    assert.equal(unboundedInCalls(".in('id', ids.slice(start, start + 100))").length, 0);
    assert.equal(unboundedInCalls("for (const batch of idBatches(ids)) {\n  q.in('id', batch)").length, 0);
    assert.equal(unboundedInCalls("// in-list: bounded one table's seats\nq.in('id', seatIds)").length, 0);
});

test('the committed baseline matches the tree, so the ratchet starts honest', () => {
    const baseline = JSON.parse(readFileSync(new URL('../scripts/ci/unbatched-in-baseline.json', import.meta.url), 'utf8'));
    const current = scan();
    for (const [file, count] of Object.entries(current)) assert.ok(count <= (baseline[file] || 0), `${file} grew to ${count}`);
});
