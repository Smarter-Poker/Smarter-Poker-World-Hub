/**
 * Keep feed grouping presentation-only. Rows stay intact so their individual
 * read, delete, authorization, and routing behavior remains authoritative.
 */
const dayStart = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export function notificationDateLabel(createdAt, now = new Date()) {
  const date = dayStart(createdAt);
  const today = dayStart(now);
  if (!date || !today) return 'Earlier';

  const daysAgo = Math.round((today - date) / 86_400_000);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return 'Earlier This Week';
  return 'Earlier';
}

export function groupNotificationsByDate(notifications, now = new Date()) {
  const groups = [];
  const byLabel = new Map();
  for (const notification of notifications || []) {
    const label = notificationDateLabel(notification?.created_at, now);
    let group = byLabel.get(label);
    if (!group) {
      group = { label, notifications: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.notifications.push(notification);
  }
  return groups;
}
