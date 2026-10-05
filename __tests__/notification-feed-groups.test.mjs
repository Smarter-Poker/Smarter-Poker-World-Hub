import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNotificationsByDate, notificationDateLabel } from '../src/lib/notificationFeedGroups.mjs';

const now = new Date(2026, 9, 5, 12);

test('notification date labels give the feed stable, human-sized sections', () => {
  assert.equal(notificationDateLabel('2026-10-05T01:00:00', now), 'Today');
  assert.equal(notificationDateLabel('2026-10-04T23:00:00', now), 'Yesterday');
  assert.equal(notificationDateLabel('2026-10-01T23:00:00', now), 'Earlier This Week');
  assert.equal(notificationDateLabel('2026-09-28T23:00:00', now), 'Earlier');
  assert.equal(notificationDateLabel('not-a-date', now), 'Earlier');
});

test('grouping preserves every row and its source order', () => {
  const rows = [
    { id: 'newest', created_at: '2026-10-05T11:00:00Z', read: false },
    { id: 'also-new', created_at: '2026-10-05T09:00:00Z', read: true },
    { id: 'yesterday', created_at: '2026-10-04T09:00:00Z', read: false },
    { id: 'older', created_at: '2026-09-20T09:00:00Z', read: false },
  ];
  const groups = groupNotificationsByDate(rows, now);
  assert.deepEqual(groups.map(group => [group.label, group.notifications.map(row => row.id)]), [
    ['Today', ['newest', 'also-new']],
    ['Yesterday', ['yesterday']],
    ['Earlier', ['older']],
  ]);
  assert.equal(groups.flatMap(group => group.notifications).filter(row => !row.read).length, 3);
});
