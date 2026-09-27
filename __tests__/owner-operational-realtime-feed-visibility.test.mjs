import test from 'node:test';
import assert from 'node:assert/strict';
import { isVisibleNotification } from '../src/lib/notificationVisibility.mjs';
import { isOwnerOperationalPush, isOwnerOperationalNotification, ALERT_OWNER_ID } from '../src/lib/push/operational-push-routing.mjs';
import { isOwnerOperationalRow, OWNER_OPERATIONAL_TYPES } from '../src/lib/notifications/ownerOperationalClassifier.mjs';

const ordinary = '00000000-0000-0000-0000-000000000002';

// `/api/notifications/feed` reads the `personal_notifications` view, which
// already excludes these rows for the owner (its own SQL WHERE clause, not an
// RLS policy, so it holds regardless of the querying role). But
// HubNotificationsFeed.jsx also paints notifications straight off a raw
// `postgres_changes` INSERT subscription on `public.notifications`
// (src/components/notifications/HubNotificationsFeed.jsx), which never goes
// through that view. Before this fix, isVisibleNotification only ever
// excluded `accounting_invoice_detail`, so any operational row that reached
// the socket — regardless of whether Realtime's RLS enforcement is airtight
// for this exact policy shape — was prepended straight into Dan's live feed.
for (const type of OWNER_OPERATIONAL_TYPES) {
  test(`realtime feed never paints the owner's own ${type} row even if it reaches the socket`, () => {
    const row = { id: 'x', user_id: ALERT_OWNER_ID, type, title: 'Original operational text' };
    assert.equal(isVisibleNotification(row, ALERT_OWNER_ID), false);
  });

  test(`${type} stays visible for a non-owner recipient (no unintended customer suppression)`, () => {
    const row = { id: 'x', user_id: ordinary, type, title: 'Same shape, different recipient' };
    assert.equal(isVisibleNotification(row, ordinary), true);
  });
}

for (const title of ['Push Health Alert', 'Notifications May Not Be Reaching This Device', 'Horse Fleet Alert: stale', 'Horse Fleet Recovered: current']) {
  test(`realtime feed never paints the owner's own legacy system title "${title}"`, () => {
    const row = { id: 'x', user_id: ALERT_OWNER_ID, type: 'system', title };
    assert.equal(isVisibleNotification(row, ALERT_OWNER_ID), false);
  });
}

test('realtime feed never paints a club-arena-engine structured system alert for the owner', () => {
  const row = { id: 'x', user_id: ALERT_OWNER_ID, type: 'system', title: 'Anything',
    data: { component: 'club-arena-engine', alertname: 'EngineRefusingSessions' } };
  assert.equal(isVisibleNotification(row, ALERT_OWNER_ID), false);
});

test('ordinary owner notifications remain visible (the fix is scoped, not a blanket owner mute)', () => {
  for (const row of [
    { id: 'a', user_id: ALERT_OWNER_ID, type: 'friend_accept', title: 'Someone accepted' },
    { id: 'b', user_id: ALERT_OWNER_ID, type: 'system', title: 'Your password was changed' },
    { id: 'c', user_id: ALERT_OWNER_ID, type: 'accounting_invoice', title: 'Invoice CA-1' },
  ]) {
    assert.equal(isVisibleNotification(row, ALERT_OWNER_ID), true);
  }
});

test('the pre-existing accounting_invoice_detail exclusion is preserved for every user', () => {
  assert.equal(isVisibleNotification({ id: 'd', user_id: ordinary, type: 'accounting_invoice_detail' }, ordinary), false);
  assert.equal(isVisibleNotification({ id: 'e', user_id: ALERT_OWNER_ID, type: 'accounting_invoice_detail' }, ALERT_OWNER_ID), false);
});

test('a null/undefined row and a missing userId never throw', () => {
  assert.equal(isVisibleNotification(null, ALERT_OWNER_ID), false);
  assert.equal(isVisibleNotification(undefined, ALERT_OWNER_ID), false);
  assert.equal(isVisibleNotification({ id: 'f', type: 'friend_accept' }, undefined), true);
});

// Drift guard (CLAUDE.md 10.84's "three lists" lesson): the push-routing
// module's public predicates must agree with the shared classifier for every
// type/title this suite knows about, because both now delegate to the same
// module — this test would catch a future edit that reintroduces a private
// copy of the type list in one file but not the other.
test('push-routing predicates agree with the shared classifier for every known operational shape', () => {
  for (const userId of [ALERT_OWNER_ID, ordinary]) {
    for (const type of OWNER_OPERATIONAL_TYPES) {
      const row = { type, title: 'x' };
      assert.equal(isOwnerOperationalPush(userId, { event: row.type, title: row.title }), isOwnerOperationalRow(userId, row));
      assert.equal(isOwnerOperationalNotification(userId, row), isOwnerOperationalRow(userId, row));
    }
  }
});
