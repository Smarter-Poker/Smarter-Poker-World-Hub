import { PERMISSIONS, hasPermission } from './permissions.js';

export const PLATFORM_ADMIN_SECTIONS = Object.freeze([
  'engine',
  'maintenance',
  'breaks',
  'releases',
  'crons',
  'alerts',
  'incidents',
  'registry',
]);

export const PLATFORM_PAGE = Object.freeze({ defaultLimit: 30, max: 100 });
export const PLATFORM_EVIDENCE_LIMIT = 4_000;
export const PLATFORM_TEXT_LIMIT = 600;

export function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function boundedText(value, max = PLATFORM_TEXT_LIMIT) {
  if (value === null || value === undefined) return null;
  const string = String(value);
  return string.length > max ? `${string.slice(0, max)}...` : string;
}

/**
 * Evidence is useful to operators, but it is not trusted UI copy. Keep the
 * original JSON shape when it is small and replace oversized documents with a
 * bounded preview. This also prevents a historical alert payload from turning
 * one console request into an unbounded response.
 */
export function boundedEvidence(value, max = PLATFORM_EVIDENCE_LIMIT) {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length <= max) return JSON.parse(json);
    return { truncated: true, preview: json.slice(0, max) };
  } catch {
    return { truncated: true, preview: boundedText(value, max) };
  }
}

export function estimatedPlatformHandsPerSecond(activeTables, averageHandsPerHour) {
  const tables = finiteNumber(activeTables);
  const hands = finiteNumber(averageHandsPerHour);
  if (tables === null || hands === null || tables < 0 || hands < 0) return null;
  return Number(((tables * hands) / 3600).toFixed(4));
}

export function sourceState(result) {
  if (result?.error) return 'unknown';
  return 'ready';
}

export function maintenanceReconciliation({ engineOk, runtime, durable }) {
  if (!engineOk || !runtime || typeof runtime.active !== 'boolean') return 'maintenance.unknown';
  const durableActive = Boolean(durable);
  if (runtime.active && !durableActive) return 'maintenance.freeze_authority_missing';
  if (!runtime.active && durableActive) return 'maintenance.divergence';
  if (runtime.active && durableActive) return 'maintenance.active';
  return 'maintenance.inactive';
}

export function scrubBreakScorecard(row, canReadMoney) {
  if (!row) return row;
  const shaped = {
    ...row,
    detail: boundedEvidence(row.detail),
  };
  if (!canReadMoney) delete shaped.freeze_delta;
  return shaped;
}

export function scrubFault(row) {
  return row ? { ...row, error: boundedText(row.error) } : row;
}

export function scrubRelease(row) {
  return row ? {
    id: row.id,
    at: row.at,
    run_id: boundedText(row.run_id, 180),
    target_sha: boundedText(row.target_sha, 80),
    shipped: row.shipped === true,
    reason: boundedText(row.reason),
    actor: boundedText(row.actor, 180),
  } : row;
}

export function scrubAlert(source, row) {
  if (!row) return row;
  if (source === 'operational_alert_events') {
    return {
      id: row.id,
      source: boundedText(row.source, 120),
      event_key: boundedText(row.event_key, 512),
      alertname: boundedText(row.alertname, 240),
      status: boundedText(row.status, 40),
      severity: boundedText(row.severity, 40),
      received_at: row.received_at,
      last_received_at: row.last_received_at,
      delivery_count: finiteNumber(row.delivery_count),
      investigation_status: boundedText(row.investigation_status, 40),
      payload: boundedEvidence(row.payload),
      investigation: boundedEvidence(row.investigation),
    };
  }
  if (source === 'engine_alerts') {
    return {
      id: row.id,
      fingerprint: boundedText(row.fingerprint, 240),
      alertname: boundedText(row.alertname, 240),
      severity: boundedText(row.severity, 40),
      component: boundedText(row.component, 120),
      status: boundedText(row.status, 40),
      summary: boundedText(row.summary),
      description: boundedText(row.description),
      labels: boundedEvidence(row.labels),
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      received_at: row.received_at,
      notified_via: Array.isArray(row.notified_via) ? row.notified_via.slice(0, 20).map((item) => boundedText(item, 80)) : [],
    };
  }
  if (source === 'financial_alerts') {
    return {
      id: row.id,
      severity: boundedText(row.severity, 40),
      source: boundedText(row.source, 120),
      message: boundedText(row.message),
      context: boundedEvidence(row.context),
      resolved: row.resolved === true,
      resolved_at: row.resolved_at,
      created_at: row.created_at,
    };
  }
  return {
    alert_key: boundedText(row.alert_key, 512),
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

export function normalizeIncident(source, row) {
  if (!row) return row;
  if (source === 'ca_drift_incidents') {
    return {
      identity: `ca_drift_incidents:${row.id}`,
      sourceTable: source,
      sourceIdentity: String(row.id),
      id: row.id,
      occurredAt: row.detected_at,
      lastSeenAt: row.last_seen_at,
      severity: row.severity,
      status: row.status,
      classification: boundedText(row.classification, 120),
      source: boundedText(row.source, 120),
      layer: boundedText(row.layer, 80),
      occurrences: finiteNumber(row.occurrences),
      deadlineAt: row.deadline_at,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      resolution: boundedText(row.resolution),
      resolvedAt: row.resolved_at,
      metadata: boundedEvidence(row.metadata),
      acknowledgementMeaning: 'Operator Ownership Only',
    };
  }
  const alert = scrubAlert(source, row);
  const id = row.id ?? row.alert_key ?? row.fingerprint ?? row.event_key;
  return {
    identity: `${source}:${id}`,
    sourceTable: source,
    sourceIdentity: String(id),
    ...alert,
    acknowledgementMeaning: 'Read Only Until A Source-Specific Audited Contract Exists',
  };
}

export function applyIncidentAcknowledgements(rows, acknowledgementRows) {
  const current = new Map((acknowledgementRows || []).map((row) => [
    `${row.source_table}:${row.source_identity}`,
    row,
  ]));
  return (rows || []).map((row) => {
    const event = current.get(row.identity);
    if (!event) return { ...row, ownershipState: null };
    const acknowledged = event.action === 'acknowledge';
    return {
      ...row,
      ownershipState: acknowledged ? 'acknowledged' : 'released',
      acknowledged,
      acknowledgedAt: acknowledged ? event.created_at : null,
      acknowledgedBy: acknowledged ? event.actor_id : null,
      acknowledgementNote: event.note,
      acknowledgementOperationId: event.operation_id,
      acknowledgementObservedStatus: event.observed_status,
      acknowledgementObservedAt: event.observed_at,
      acknowledgementMeaning: 'Operator Ownership Only; Source Status And Resolution Are Unchanged',
    };
  });
}

export function canReadFreezeAmounts(op) {
  return hasPermission(op?.permissions, PERMISSIONS.MONEY_READ);
}

export const MISSING_CONTROL_ROWS = Object.freeze([
  Object.freeze({
    key: 'tournament_registration_global', domain: 'tournaments', kind: 'kill_switch',
    state: 'missing', enabled: null, rolloutPercent: null, scope: 'platform',
    sourceTable: null, sourceField: null, consumer: null, writable: false,
    writeAuthority: 'Not Implemented In The Authoritative Path', updatedAt: null,
    auditSource: null, sourceHealth: 'missing',
    blastRadius: 'No Complete Global Tournament Registration Kill Exists',
  }),
  Object.freeze({
    key: 'cashout_dedicated', domain: 'cashout', kind: 'kill_switch',
    state: 'missing', enabled: null, rolloutPercent: null, scope: 'platform',
    sourceTable: null, sourceField: null, consumer: null, writable: false,
    writeAuthority: 'Not Implemented In The Authoritative Path', updatedAt: null,
    auditSource: null, sourceHealth: 'missing',
    blastRadius: 'Scheduled Maintenance Freeze Is Not A Dedicated Cashout Kill Switch',
  }),
  Object.freeze({
    key: 'chip_issuance_positive', domain: 'chips', kind: 'kill_switch',
    state: 'missing', enabled: null, rolloutPercent: null, scope: 'platform',
    sourceTable: null, sourceField: null, consumer: null, writable: false,
    writeAuthority: 'Not Implemented In The Authoritative Path', updatedAt: null,
    auditSource: null, sourceHealth: 'missing',
    blastRadius: 'No Complete Positive Chip-Issuance Kill Exists',
  }),
]);

export function registryRow({
  key, domain, kind = 'feature', enabled = null, state, rolloutPercent = null,
  scope = 'platform', sourceTable, sourceField = 'enabled', consumer,
  writable = false, writeAuthority, updatedAt = null, auditSource = null,
  sourceHealth = 'ready', blastRadius = null,
}) {
  return {
    key, domain, kind, enabled,
    state: state || (typeof enabled === 'boolean' ? (enabled ? 'enabled' : 'disabled') : 'unknown'),
    rolloutPercent: Number.isInteger(rolloutPercent) ? rolloutPercent : null,
    scope, sourceTable, sourceField, consumer, writable,
    writeAuthority, updatedAt, auditSource, sourceHealth, blastRadius,
  };
}
