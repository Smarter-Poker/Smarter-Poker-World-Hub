/** Pure client contract for Stable Admin Phase 7 economy reporting. */
export const ECONOMY_ADMIN = '/api/horses/economy-admin';

export const ECONOMY_SECTIONS = Object.freeze([
  'supply', 'velocity', 'register', 'treasury', 'conservation', 'drift', 'burnin',
  'rakelaw', 'rakeback', 'leaderboard', 'bbj', 'promotions', 'abuse', 'close',
  'digest', 'pnl', 'invoices', 'jobs', 'exports',
]);

export const ECONOMY_CONTROLS = Object.freeze({
  supply: 'READ', velocity: 'READ', register: 'READ', treasury: 'READ',
  conservation: 'READ', drift: 'READ', burnin: 'READ', rakelaw: 'READ',
  rakeback: 'READ', leaderboard: 'READ', bbj: 'READ', promotions: 'READ',
  abuse: 'READ', close: 'READ', digest: 'READ', pnl: 'EMBED', invoices: 'READ',
  jobs: 'READ', exports: 'READ', mint: 'LINK', fundClub: 'LINK',
});

function query(params = {}) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value === null || value === undefined) continue;
    out.set(key, String(value));
  }
  return out;
}

export function economyAdminUrl(section, params = {}) {
  return `${ECONOMY_ADMIN}?${query({ section, ...params }).toString()}`;
}

export function dataOf(body) { return body?.data ?? body ?? null; }
export function rowsOf(body, key = 'rows') {
  const data = dataOf(body);
  const value = key ? data?.[key] : data;
  return Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : [];
}

export function decimalText(value, digits = 2) {
  if (value === null || value === undefined || value === '') return 'Unknown';
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return 'Unknown';
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  return `${negative ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(fraction + '0'.repeat(digits)).slice(0, digits)}`;
}

export function conservationModel(input) {
  if (!input || input.register_net_at_meter === null || input.meter_total === null) {
    return { state: 'conservation.unknown', balanced: null, residue: null };
  }
  const difference = Number(input.difference);
  const baseline = Number(input.unexplained_since_baseline);
  if (!Number.isFinite(difference) || !Number.isFinite(baseline)) {
    return { state: 'conservation.unknown', balanced: null, residue: null };
  }
  const residue = Math.round((difference - baseline) * 100) / 100;
  return { state: Math.abs(residue) < 0.005 ? 'conservation.balanced' : 'conservation.residue', balanced: Math.abs(residue) < 0.005, residue: residue.toFixed(2) };
}

export function snapshotModel(snapshot, staleAfterMinutes = 30, now = Date.now()) {
  if (!snapshot?.taken_at && !snapshot?.meter_taken_at && !snapshot?.snapshot_at && !snapshot?.created_at) return { state: 'supply.unknown', ageMinutes: null };
  const stamp = new Date(snapshot.taken_at || snapshot.meter_taken_at || snapshot.snapshot_at || snapshot.created_at).getTime();
  if (!Number.isFinite(stamp)) return { state: 'supply.unknown', ageMinutes: null };
  const ageMinutes = Math.max(0, Math.floor((now - stamp) / 60000));
  return { state: ageMinutes > staleAfterMinutes ? 'supply.stale' : 'supply.ready', ageMinutes };
}

export function abuseState(rows, lastRun) {
  if (!Array.isArray(rows)) return 'abuse.unknown';
  if (!lastRun) return 'abuse.detector_never_fired';
  return rows.length ? 'abuse.findings' : 'abuse.nothing_detected';
}

export function jobState(row) {
  if (!row) return 'job.no_evidence';
  if (row.status === 'error' || row.status === 'failed') return 'job.failed';
  const result = row.result;
  if (result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0) return 'job.invocation_only';
  return 'job.evidence_recorded';
}

export function closeCalendar(manifests, fromDay, toDay) {
  const rows = Array.isArray(manifests) ? manifests : [];
  const byDay = new Map(rows.map((row) => [String(row.day || row.manifest_day || '').slice(0, 10), row]));
  const out = [];
  const cursor = new Date(`${fromDay}T00:00:00Z`);
  const end = new Date(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(end.getTime())) return out;
  while (cursor <= end && out.length < 1000) {
    const day = cursor.toISOString().slice(0, 10);
    out.push({ day, state: byDay.has(day) ? 'close.manifest_only' : 'close.day_missing', manifest: byDay.get(day) || null });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
