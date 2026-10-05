import { PERMISSIONS } from './permissions.js';

export const FLOOR_ADMIN_SECTIONS = Object.freeze([
  'floor', 'table', 'tournaments', 'event', 'clubs', 'club',
  'unions', 'union', 'cashouts', 'chip_requests', 'rake', 'announcements',
]);

export const FLOOR_ADMIN_SECTION_PERMISSIONS = Object.freeze({
  floor: PERMISSIONS.CLUBS_READ,
  table: PERMISSIONS.CLUBS_READ,
  tournaments: PERMISSIONS.CLUBS_READ,
  event: PERMISSIONS.CLUBS_READ,
  clubs: PERMISSIONS.CLUBS_READ,
  club: PERMISSIONS.CLUBS_READ,
  unions: PERMISSIONS.CLUBS_READ,
  union: PERMISSIONS.CLUBS_READ,
  cashouts: PERMISSIONS.MONEY_READ,
  chip_requests: PERMISSIONS.MONEY_READ,
  rake: PERMISSIONS.MONEY_READ,
  announcements: PERMISSIONS.CONSOLE_READ,
});

const R = 'READ';
const L = 'LINK';
const E = 'EMBED';
const W = 'AUTHORITATIVE_WRITE';

export const FLOOR_ADMIN_CONTROL_MANIFEST = Object.freeze({
  floor: Object.freeze({ list: R, table_detail: R, engine_health: R, table_management: L }),
  table: Object.freeze({ detail: R, seats: R, table_management: L }),
  tournaments: Object.freeze({ schedule: R, engine_health: R, payout_window_audit: R, cancel: L, refund: L }),
  event: Object.freeze({ detail: R, payout_audit: R, cancellation_receipt: R, cancel: L, refund: L }),
  clubs: Object.freeze({ list: R, health: E, configure: L, suspend: 'AUTHORITATIVE_WRITE', fund: 'AUTHORITATIVE_WRITE' }),
  club: Object.freeze({ detail: R, members: R, health: E, configure: L, suspend: 'AUTHORITATIVE_WRITE', fund: 'AUTHORITATIVE_WRITE' }),
  unions: Object.freeze({ list: R, manage: L, settle: L }),
  union: Object.freeze({ detail: R, member_clubs: R, rake_share: R, settlement_rounds: R, applications: R, leave_requests: R, manage: L, settle: L }),
  cashouts: Object.freeze({ queue: R, approve: L, cancel: W, bulk_cancel: W }),
  chip_requests: Object.freeze({ queue: R, decide: 'AUTHORITATIVE_WRITE' }),
  rake: Object.freeze({ aggregate_reports: R, freshness: R, rate_history: R, engine_drift: R }),
  announcements: Object.freeze({ club_list: R, union_list: R, delivery_health: R, compose_club: L, compose_union: L }),
});

/** Product availability is separate from authority classification. */
export const FLOOR_ADMIN_CONTROL_AVAILABILITY = Object.freeze({
  floor: Object.freeze({ safe_boundary_control: 'DEFERRED' }),
  table: Object.freeze({ safe_boundary_control: 'DEFERRED' }),
  cashouts: Object.freeze({ bulk_approve: 'DEFERRED' }),
  rake: Object.freeze({ change_rate: 'DEFERRED', durable_export_jobs: 'DEFERRED' }),
  announcements: Object.freeze({ platform_broadcast: 'DEFERRED' }),
});

export const FLOOR_ADMIN_LINKS = Object.freeze({
  table_management: '/hub/club-arena',
  tournament_management: '/hub/club-arena',
  club_management: '/hub/club-arena',
  union_management: '/hub/club-arena',
  cashout_approval: '/hub/club-arena',
  club_announcements: '/hub/club-arena',
  union_announcements: '/hub/club-arena',
});

export function floorDivergence(databaseActive, engineActive, tolerance = 0) {
  if (!Number.isFinite(databaseActive) || !Number.isFinite(engineActive)) return null;
  const delta = databaseActive - engineActive;
  return { databaseActive, engineActive, delta, diverged: Math.abs(delta) > tolerance };
}

export function floorReadState({ databaseOk, engineOk, divergence, rowCount = 0 }) {
  if (!databaseOk && !engineOk) return 'floor.unknown';
  if (!databaseOk || !engineOk) return 'floor.partial';
  if (divergence?.diverged) return 'floor.diverged';
  if (rowCount === 0) return 'floor.empty_no_live_tables';
  return 'floor.ready';
}

export function queueReadState({ sourceOk, total, pending }) {
  if (!sourceOk) return 'queue.unknown';
  if (total === 0) return 'queue.empty_none_ever';
  if (pending === 0) return 'queue.empty_none_pending';
  return 'queue.ready';
}

export function deliveryHealthState({ sourceOk, pending, lastDrainAt, now = Date.now(), maxPending = 100, cadenceMs = 180000 }) {
  if (!sourceOk) return 'delivery.unknown';
  const last = lastDrainAt ? Date.parse(lastDrainAt) : NaN;
  if (Number(pending || 0) > maxPending || !Number.isFinite(last) || now - last > cadenceMs) return 'delivery.backlogged';
  return 'delivery.ok';
}

let engineCache = null;
const ENGINE_CACHE_MS = 15000;

export function clearFloorEngineCacheForTests() { engineCache = null; }

export async function readEngineHealth({ fetchImpl = globalThis.fetch, url, timeoutMs = 2500, now = Date.now() } = {}) {
  if (engineCache && now - engineCache.readAt < ENGINE_CACHE_MS) return { ...engineCache.value, cached: true };
  if (typeof fetchImpl !== 'function' || !url) return { ok: false, state: 'unknown', checkedAt: new Date(now).toISOString() };
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Engine health deadline exceeded'));
      }, timeoutMs);
    });
    const response = await Promise.race([
      (async () => {
        const fetched = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!fetched.ok) return fetched;
        const body = await fetched.json();
        return { ok: fetched.ok, boundedBody: body };
      })(),
      deadline,
    ]);
    if (!response.ok) return { ok: false, state: 'unknown', checkedAt: new Date(now).toISOString() };
    const raw = response.boundedBody;
    const value = {
      ok: true,
      state: 'ready',
      checkedAt: new Date(now).toISOString(),
      activeTables: Number.isFinite(Number(raw.activeTables)) ? Number(raw.activeTables) : null,
      dealableTableCount: Number.isFinite(Number(raw.dealableTableCount)) ? Number(raw.dealableTableCount) : null,
      stalledTableCount: Number.isFinite(Number(raw.stalledTableCount)) ? Number(raw.stalledTableCount) : null,
      activeTournaments: Number.isFinite(Number(raw.activeTournaments)) ? Number(raw.activeTournaments) : null,
      humansSeatedTotal: Number.isFinite(Number(raw.humansSeatedTotal)) ? Number(raw.humansSeatedTotal) : null,
      avgHandsPerHour: Number.isFinite(Number(raw.telemetry?.avgHandsPerHour)) ? Number(raw.telemetry.avgHandsPerHour) : null,
      rakeSpec: raw.rakeSpec && typeof raw.rakeSpec === 'object' ? {
        drifted: typeof raw.rakeSpec.drifted === 'boolean' ? raw.rakeSpec.drifted : null,
        detail: typeof raw.rakeSpec.detail === 'string' ? raw.rakeSpec.detail.slice(0, 240) : null,
      } : null,
    };
    engineCache = { readAt: now, value };
    return { ...value, cached: false };
  } catch {
    return { ok: false, state: 'unknown', checkedAt: new Date(now).toISOString() };
  } finally {
    clearTimeout(timer);
  }
}
