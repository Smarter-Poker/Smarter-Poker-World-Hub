// Platform incidents are private to the owner's two verified accounts.
// Club/player business notifications retain their own recipients.
import { OWNER_OPERATIONAL_ID, OWNER_OPERATIONAL_TYPES } from './ownerOperationalClassifier.mjs';
export const PLATFORM_ALERT_RECIPIENTS = Object.freeze([
  OWNER_OPERATIONAL_ID, '3bb71bfe-f723-427c-aac7-a853ba04a014',
]);
export const PLATFORM_ALERT_TITLES = Object.freeze([
  'Push Health Alert', 'Notifications May Not Be Reaching This Device',
  'Push Notifications Are Off', 'Money Check Failed', 'Engine Restart Storm',
  'Tables Have Stopped Dealing', 'Production Alerts Has Stopped Reading', 'Tournament Schedule Active',
]);
export function isPlatformAlert(row = {}) {
  const type = row.type || row.event;
  return type === 'platform_admin_alert' || row.data?.audience === 'platform_admin' || OWNER_OPERATIONAL_TYPES.has(type) || ((type === 'system' || !type) && (
    PLATFORM_ALERT_TITLES.includes(row.title)
    || /^Horse Fleet (?:Alert|Recovered): /.test(String(row.title || ''))
    || (row.data?.component === 'club-arena-engine' && typeof row.data?.alertname === 'string' && row.data.alertname.length > 0)
  ));
}
export function isPlatformAlertRecipient(userId) {
  return typeof userId === 'string' && PLATFORM_ALERT_RECIPIENTS.map(id => id.replace(/-/g, '')).includes(userId.trim().replace(/^\{([^{}]+)\}$/, '$1').replace(/-/g, '').toLowerCase());
}
export function mayDeliverNotification(userId, row) {
  return !isPlatformAlert(row) || isPlatformAlertRecipient(userId);
}
// Dan, 2026-10-09 and 2026-10-31: operational alerts go to Production Alerts and
// are fixed automatically; they are never pushed to a phone. Only notices about
// the recipient's own device still push. Mirrors the database guard
// public.fn_platform_push_recipient_guard (failure_reason
// 'routed_to_production_alerts'); this side stops the inline send that runs
// after the queue insert.
export const DEVICE_HEALTH_PUSH_TITLES = Object.freeze([
  'Push Health Alert', 'Notifications May Not Be Reaching This Device', 'Push Notifications Are Off',
]);
export function isRoutedToProductionAlerts(row = {}) {
  return isPlatformAlert(row) && !DEVICE_HEALTH_PUSH_TITLES.includes(row.title);
}
export function isPushOnlyNotification(row = {}) {
  return row.type === 'tournament_blinding_off' || row.event === 'tournament_blinding_off';
}
