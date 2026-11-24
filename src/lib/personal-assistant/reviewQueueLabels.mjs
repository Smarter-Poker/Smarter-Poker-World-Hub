/**
 * Pure presentation formatters for the leak review queue (zero JSX/browser deps
 * so they can be executed directly in Node unit tests and server contexts).
 */

export function dueInLabel(iso, nowMs) {
  const time = new Date(iso || '').getTime();
  if (!Number.isFinite(time) || !Number.isFinite(nowMs) || nowMs <= 0) return null;
  const diffMs = time - nowMs;
  if (diffMs <= 0) return 'today';
  const targetDay = new Date(time);
  const currentDay = new Date(nowMs);
  const startOfTarget = Date.UTC(targetDay.getUTCFullYear(), targetDay.getUTCMonth(), targetDay.getUTCDate());
  const startOfCurrent = Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate());
  const calendarDays = Math.round((startOfTarget - startOfCurrent) / 86_400_000);
  if (calendarDays <= 0) return 'today';
  if (calendarDays === 1) return 'tomorrow';
  if (calendarDays < 7) return `in ${calendarDays} days`;
  try {
    return `on ${targetDay.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  } catch (_) {
    return `in ${calendarDays} days`;
  }
}

export function queueReason(entry) {
  if (!entry) return '';
  if (entry.isNew) return 'Not drilled yet';
  if (entry.revived) return 'Detected again since your last review';
  const overdue = Math.floor(Number(entry.overdueDays) || 0);
  if (overdue >= 1) return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
  return 'Due today';
}
