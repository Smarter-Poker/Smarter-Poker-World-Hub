/**
 * Pure UTC week-boundary helper for weekly leaderboards and digests.
 * Using UTC avoids host-timezone and DST drift (server-local getDay/setHours
 * shifted Monday boundaries depending on runtime TZ).
 */

export function utcMondayStartIso(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  const dayOfWeek = date.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const mondayMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday,
    0,
    0,
    0,
    0,
  );
  return new Date(mondayMs).toISOString();
}
