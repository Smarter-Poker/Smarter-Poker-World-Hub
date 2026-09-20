const count = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const rate = (value, numerator, denominator) => denominator === 0
    ? value === null : value === Math.round(100 * numerator / denominator);

// Missing data is an unavailable health check, never a healthy zero.
export function isPushHealthSnapshot(data) {
    if (!data || data.schemaVersion !== 1 || data.windowDays !== 7 || !timestamp(data.observedAt)) return false;
    const { subscriptions: s, outbox: o, funnel: f, dispatch: d } = data;
    if (!s || !o || !f || !d) return false;
    if (!['total', 'active', 'zombies'].every(key => count(s[key])) || s.active > s.total || s.zombies > s.active) return false;
    if (!['pending', 'processing', 'failed', 'skipped', 'sentLast24h'].every(key => count(o[key]))) return false;
    if (f.windowHours !== 24 || !['queued', 'sent', 'suppressed', 'unreachable', 'addressable', 'devicesPushed', 'devicesConfirmed'].every(key => count(f[key]))) return false;
    if (f.sent + f.suppressed > f.queued || f.devicesConfirmed > f.devicesPushed || f.devicesPushed > s.active) return false;
    // Keep validating the legacy RPC rate, but display only the independently
    // bound addressable rate. An old/missing field is unavailable, not zero.
    if (f.unreachable > f.suppressed || f.addressable !== f.queued - f.unreachable || f.sent > f.addressable) return false;
    if (!rate(f.confirmRate, f.devicesConfirmed, f.devicesPushed) || !rate(f.deliveryRate, f.sent, f.queued)
        || !rate(f.addressableDeliveryRate, f.sent, f.addressable)) return false;
    if (d.lastRunAt === null ? d.minutesSince !== null : !timestamp(d.lastRunAt) || !count(d.minutesSince)) return false;
    if (!Array.isArray(d.recent) || d.recent.length > 10 || !d.recent.every(row => timestamp(row.started_at)
        && ['claimed', 'sent', 'failed', 'skipped'].every(key => count(row[key])))) return false;
    if (!Array.isArray(data.byType) || !data.byType.every(row => typeof row.event === 'string' && count(row.total) && count(row.sent) && row.sent <= row.total)) return false;
    if (!Array.isArray(data.skipReasons) || !data.skipReasons.every(row => typeof row.reason === 'string' && count(row.count)
        && ['user_choice', 'not_enrolled', 'throttled', 'fault'].includes(row.kind)
        && (row.reason !== 'no_subscription' || row.kind === 'not_enrolled'))) return false;
    return Array.isArray(data.staff) && data.staff.every(row => typeof row.id === 'string'
        && ['ok', 'zombie', 'subscription_dead', 'never_enabled'].includes(row.status)
        && count(row.devices) && count(row.totalDevices) && row.devices <= row.totalDevices
        && (row.status !== 'ok' || row.devices > 0 && timestamp(row.lastReceiptAt)));
}
