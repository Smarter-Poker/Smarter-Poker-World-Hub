/** Pure client model for Stable Admin Phase 8 Platform Operations. */
export const PLATFORM_ADMIN = '/api/horses/platform-admin';

export const PLATFORM_SECTIONS = Object.freeze([
  'engine', 'maintenance', 'breaks', 'releases', 'registry', 'crons', 'alerts', 'incidents',
]);

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value === null || value === undefined) continue;
    search.set(key, String(value));
  }
  return search;
}

export function platformAdminUrl(section, params = {}) {
  if (!PLATFORM_SECTIONS.includes(section)) throw new Error(`Unknown Platform Operations section: ${section}`);
  const search = query({ section, ...params });
  return `${PLATFORM_ADMIN}?${search.toString()}`;
}

export function incidentOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function incidentAcknowledgementPayload(row, action, note, operationId) {
  return {
    action,
    sourceTable: row.sourceTable,
    sourceIdentity: row.sourceIdentity,
    note: String(note || '').trim(),
    operationId,
  };
}

export function dataOf(body) {
  return body?.data && typeof body.data === 'object' ? body.data : body || {};
}

export function rowsOf(body, key = 'rows') {
  const value = dataOf(body);
  const page = value?.[key] ?? (key === 'rows' ? value : null);
  if (Array.isArray(page)) return page;
  if (Array.isArray(page?.rows)) return page.rows;
  return [];
}

export function pageOf(body, key = 'rows') {
  const value = dataOf(body);
  const page = value?.[key] ?? (key === 'rows' ? value : null);
  const rows = Array.isArray(page) ? page : Array.isArray(page?.rows) ? page.rows : [];
  const meta = Array.isArray(page) && key === 'rows' ? value : page;
  const numeric = (candidate) => candidate !== null && candidate !== undefined && Number.isFinite(Number(candidate)) ? Number(candidate) : null;
  return {
    rows,
    total: numeric(meta?.total),
    limit: numeric(meta?.limit),
    offset: numeric(meta?.offset) ?? 0,
    hasMore: meta?.hasMore === true,
    truncated: meta?.truncated === true,
    cap: meta?.cap && typeof meta.cap === 'object' ? {
      maxRows: numeric(meta.cap.maxRows),
      reached: meta.cap.reached === true,
    } : null,
  };
}

export function permissionRequiredSources(body) {
  const sources = dataOf(body)?.sources;
  if (!sources || typeof sources !== 'object') return [];
  return Object.entries(sources)
    .filter(([, source]) => source?.state === 'permission_required')
    .map(([name, source]) => ({ name, permission: text(source.permission) }));
}

export function known(value) {
  return value !== null && value !== undefined && value !== '';
}

export function text(value, fallback = 'Unknown') {
  return known(value) ? String(value) : fallback;
}

export function numberText(value, fallback = 'Unknown') {
  if (!known(value) || !Number.isFinite(Number(value))) return fallback;
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function booleanState(value) {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  return 'Unknown';
}

export function timestamp(value) {
  if (!known(value)) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unknown' : date.toLocaleString();
}

export function stateOf(body, fallback = 'Unknown') {
  const value = dataOf(body);
  return text(value.state ?? value.status, fallback);
}

export function sourceFailures(body) {
  const value = dataOf(body);
  const failures = value.failedSources ?? value.sourceFailures ?? value.failures;
  if (Array.isArray(failures)) return failures.map((failure) => typeof failure === 'string' ? failure : text(failure?.source ?? failure?.name));
  if (failures && typeof failures === 'object') return Object.entries(failures).filter(([, failure]) => Boolean(failure)).map(([source]) => source);
  return [];
}

export function toneForState(state) {
  const normalized = String(state || '').toLowerCase();
  if (/missing|unknown|unreachable|failed|error|critical|diverg|stale|violation|freeze authority/.test(normalized)) return 'danger';
  if (/degraded|partial|warning|warn|acknowledged|truncated/.test(normalized)) return 'warn';
  if (/healthy|ready|aligned|success|active|clear|available|pass/.test(normalized)) return 'good';
  return 'info';
}

export function engineModel(body) {
  const value = dataOf(body);
  const engine = value.engine ?? value.health ?? value;
  const database = value.database ?? value.platform ?? {};
  const estimated = value.estimatedPlatformHandsPerSecond
    ?? value.estimated_platform_hands_per_second
    ?? engine.estimatedPlatformHandsPerSecond
    ?? engine.estimated_platform_hands_per_second;
  return {
    state: stateOf(body),
    reachable: engine.reachable,
    liveness: engine.liveness ?? engine.live ?? engine.status,
    version: engine.version,
    releaseSha: engine.releaseSha ?? engine.release_sha ?? engine.sha,
    instance: engine.instance ?? engine.instanceId ?? engine.instance_id,
    uptime: engine.uptime ?? engine.uptimeSeconds ?? engine.uptime_seconds,
    activeTables: engine.activeTables ?? engine.active_tables,
    dealableTables: engine.dealableTableCount ?? engine.dealableTables ?? engine.dealable_tables,
    stalledTables: engine.stalledTableCount ?? engine.stalledTables ?? engine.stalled_tables,
    tournaments: engine.activeTournaments ?? engine.active_tournaments,
    humansSeated: database.humansSeated ?? database.humans_seated,
    occupiedSeats: database.occupiedSeats ?? database.occupied_seats,
    averageHandsPerHour: engine.avgHandsPerHour ?? engine.averageHandsPerHour ?? engine.average_hands_per_hour,
    estimatedHandsPerSecond: estimated,
    actionLatency: engine.averageActionLatencyMs ?? engine.avgActionLatencyMs ?? engine.average_action_latency_ms,
    latencySample: engine.actionLatencySample ?? engine.action_latency_sample ?? value.latencySample,
    latencyViolations: engine.actionLatencyViolations ?? engine.action_latency_violations ?? value.latencyViolations,
    checkedAt: value.checkedAt ?? value.checked_at ?? engine.checkedAt ?? engine.checked_at,
    cache: value.cache ?? engine.cache,
    stale: value.stale ?? engine.stale,
    failures: sourceFailures(body),
  };
}

export function maintenanceModel(body) {
  const value = dataOf(body);
  return {
    state: stateOf(body),
    runtime: value.runtime ?? value.engine?.maintenance ?? value.health?.maintenance ?? null,
    durable: value.durable ?? value.break ?? value.engineMaintenanceBreak ?? value.engine_maintenance_break ?? null,
    thaw: value.latestThaw ?? value.latest_thaw ?? value.thaw ?? null,
    authorityGap: value.authorityGap ?? value.authority_gap ?? value.disclosure ?? null,
    failures: sourceFailures(body),
  };
}

export function registryRows(body) {
  return rowsOf(body).map((row) => ({
    ...row,
    key: text(row.key),
    domain: text(row.domain),
    kind: text(row.kind),
    state: text(row.state ?? (typeof row.enabled === 'boolean' ? booleanState(row.enabled) : null)),
    rolloutPercent: known(row.rolloutPercent ?? row.rollout_percent) ? Number(row.rolloutPercent ?? row.rollout_percent) : null,
    writable: row.writable === true,
    sourceHealth: text(row.sourceHealth ?? row.source_health),
  }));
}

export function incidentDisposition(row = {}) {
  if (row.ownershipState === 'acknowledged') return 'Acknowledged, Not Resolved';
  if (row.ownershipState === 'released') return 'Ownership Released';
  const acknowledged = row.acknowledged === true || known(row.acknowledgedAt ?? row.acknowledged_at) || String(row.status || '').toLowerCase() === 'acknowledged';
  if (acknowledged) return 'Acknowledged, Not Resolved';
  if (String(row.status || '').toLowerCase() === 'resolved') return 'Source Reports Resolved';
  return text(row.status, 'Unknown');
}
