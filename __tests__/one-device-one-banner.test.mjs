/**
 * ONE DEVICE, ONE BANNER (2026-09-07).
 *
 * Dan received the Estate Digest and the engine-break alert twice on one
 * screen. The morning's fix retired the SILENT sibling of each pair, and by
 * 19:42 the same Mac had re-formed a pair - a fresh `deviceId` minted into
 * localStorage, a new row, and both rows confirming receipts.
 *
 * `selectRetirable` cannot see that shape by construction: it draws only from
 * `zombies`, and a zombie is a row that is NOT confirming. These pins hold
 * `selectDuplicateConfirmers` to the other half, and hold BOTH functions to
 * the rule that neither may ever take a device off notifications.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    deviceGroupKey,
    selectRetirable,
    selectDuplicateConfirmers,
} from '../src/lib/pushDeviceGroups.js';

const CUT = Date.parse('2026-09-06T00:00:00Z');
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605';

const mac = (id, receipt, created) => ({
    id, user_id: 'dan', endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    user_agent: MAC_UA, last_receipt_at: receipt, created_at: created,
});
const iphone = (id, receipt, created) => ({
    id, user_id: 'dan', endpoint: `https://web.push.apple.com/${id}`,
    user_agent: IPHONE_UA, last_receipt_at: receipt, created_at: created,
});

test('the live pair on Dan\'s Mac is one group despite two device ids', () => {
    const a = mac('ec90f0f1', '2026-09-07T17:12:01Z', '2026-09-07T03:55:22Z');
    const b = mac('5e1652b1', '2026-09-07T20:50:00Z', '2026-09-07T19:42:43Z');
    assert.equal(deviceGroupKey(a), deviceGroupKey(b));
});

test('two confirming rows in one group: the freshest receipt survives', () => {
    const older = mac('ec90f0f1', '2026-09-07T17:12:01Z', '2026-09-07T03:55:22Z');
    const newer = mac('5e1652b1', '2026-09-07T20:50:00Z', '2026-09-07T19:42:43Z');
    const out = selectDuplicateConfirmers([older, newer], CUT);
    assert.deepEqual(out.map((r) => r.id), ['ec90f0f1']);
});

test('it never empties a group - exactly one row always survives', () => {
    const rows = [
        mac('a', '2026-09-07T10:00:00Z', '2026-09-01T00:00:00Z'),
        mac('b', '2026-09-07T11:00:00Z', '2026-09-02T00:00:00Z'),
        mac('c', '2026-09-07T12:00:00Z', '2026-09-03T00:00:00Z'),
    ];
    const out = selectDuplicateConfirmers(rows, CUT);
    assert.equal(out.length, rows.length - 1);
    assert.ok(!out.some((r) => r.id === 'c'), 'the freshest confirmer is never retired');
});

test('a lone confirming row is never touched', () => {
    assert.equal(selectDuplicateConfirmers([mac('only', '2026-09-07T17:00:00Z', '2026-09-01T00:00:00Z')], CUT).length, 0);
});

test('a silent row is never in this set - that is selectRetirable\'s job', () => {
    const live = mac('live', '2026-09-07T17:00:00Z', '2026-09-01T00:00:00Z');
    const silent = mac('silent', null, '2026-09-01T00:00:00Z');
    assert.equal(selectDuplicateConfirmers([live, silent], CUT).length, 0);
});

test('a receipt older than the cutoff is not proof, so it is not a confirmer', () => {
    const stale = mac('stale', '2026-09-01T02:11:00Z', '2026-08-20T00:00:00Z');
    const live = mac('live', '2026-09-07T17:00:00Z', '2026-09-01T00:00:00Z');
    assert.equal(selectDuplicateConfirmers([stale, live], CUT).length, 0);
});

test('a Mac never authorises retiring a phone', () => {
    const macA = mac('mac-a', '2026-09-07T17:00:00Z', '2026-09-01T00:00:00Z');
    const macB = mac('mac-b', '2026-09-07T18:00:00Z', '2026-09-02T00:00:00Z');
    const phone = iphone('phone', '2026-09-07T17:12:02Z', '2026-09-05T00:00:00Z');
    const out = selectDuplicateConfirmers([macA, macB, phone], CUT);
    assert.deepEqual(out.map((r) => r.id), ['mac-a']);
});

test('one user never authorises retiring another user', () => {
    const dan = mac('dan-row', '2026-09-07T17:00:00Z', '2026-09-01T00:00:00Z');
    const other = { ...mac('other-row', '2026-09-07T18:00:00Z', '2026-09-01T00:00:00Z'), user_id: 'someone-else' };
    assert.equal(selectDuplicateConfirmers([dan, other], CUT).length, 0);
});

test('an unknown user agent is alone in its group and so is never retired', () => {
    const a = { ...mac('no-ua-a', '2026-09-07T17:00:00Z', '2026-09-01T00:00:00Z'), user_agent: '' };
    const b = { ...mac('no-ua-b', '2026-09-07T18:00:00Z', '2026-09-01T00:00:00Z'), user_agent: '   ' };
    assert.equal(selectDuplicateConfirmers([a, b], CUT).length, 0);
});

test('the state measured at 20:30Z retires nothing - the new row has not confirmed yet', () => {
    const confirming = mac('ec90f0f1', '2026-09-07T17:12:01Z', '2026-09-07T03:55:22Z');
    const brandNew = mac('5e1652b1', null, '2026-09-07T19:42:43Z');
    assert.equal(selectDuplicateConfirmers([confirming, brandNew], CUT).length, 0);
    // and selectRetirable also spares it, because it is the newest in its group
    const zombies = [brandNew];
    assert.equal(selectRetirable([confirming, brandNew], zombies, CUT).length, 0);
});

test('the two functions never select the same row', () => {
    const confirming = mac('live', '2026-09-07T18:00:00Z', '2026-09-01T00:00:00Z');
    const alsoConfirming = mac('live2', '2026-09-07T17:00:00Z', '2026-09-02T00:00:00Z');
    const silent = mac('silent', null, '2026-08-01T00:00:00Z');
    const all = [confirming, alsoConfirming, silent];
    const a = new Set(selectRetirable(all, [silent], CUT).map((r) => r.id));
    const b = new Set(selectDuplicateConfirmers(all, CUT).map((r) => r.id));
    for (const id of a) assert.ok(!b.has(id), `${id} selected by both`);
});
