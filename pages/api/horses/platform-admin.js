/**
 * Stable Admin Phase 8 platform observability.
 *
 * GET projects existing authorities. POST may only append an incident
 * ownership acknowledgement/release event; it never mutates source incident
 * resolution, source health, maintenance, release, or control state.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, conflict, notFound } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { pageFor, shapeList, sourceCollector } from '../../../src/lib/horses/listShape.js';
import { runPaged } from '../../../src/lib/horses/paged.js';
import { enumOf, text as validatedText, uuid } from '../../../src/lib/horses/validate.js';
import { floorDivergence, readEngineHealth } from '../../../src/lib/horses/floorAdmin.js';
import {
  MISSING_CONTROL_ROWS,
  PLATFORM_ADMIN_SECTIONS,
  PLATFORM_PAGE,
  applyIncidentAcknowledgements,
  boundedEvidence,
  boundedText,
  canReadFreezeAmounts,
  estimatedPlatformHandsPerSecond,
  maintenanceReconciliation,
  normalizeIncident,
  registryRow,
  scrubAlert,
  scrubBreakScorecard,
  scrubFault,
  scrubRelease,
  sourceState,
} from '../../../src/lib/horses/platformAdmin.js';

const ENGINE_HEALTH_URL = (process.env.GAME_SERVER_URL || process.env.ENGINE_URL || 'https://engine.smarter.poker').replace(/\/$/, '') + '/health';
const LIVE_TABLE_STATUSES = Object.freeze(['running', 'active', 'waiting']);
const COMBINED_PAGE_MAX_ROWS = 500;
const INCIDENT_ACK_ACTIONS = Object.freeze(['acknowledge', 'release']);
const INCIDENT_ACK_SOURCES = Object.freeze([
  'ca_drift_incidents',
  'operational_alert_events',
  'engine_alerts',
  'deploy_alerts',
  'financial_alerts',
]);

function meta(section, collector) {
  return {
    section,
    asOf: new Date().toISOString(),
    readOnly: true,
    authority: 'Existing Source Authorities',
    failedSources: collector.all(),
  };
}

function list(result, page, transform = (row) => row, extra = {}) {
  return shapeList(result, page, (result.data || []).map(transform), {
    state: sourceState(result),
    ...extra,
  });
}

function combinedPage(rows, lists, page) {
  const ordered = [...rows].slice(page.offset, page.offset + page.limit);
  const totals = lists.map((value) => value?.total).filter((value) => typeof value === 'number');
  const total = totals.length === lists.length ? totals.reduce((sum, value) => sum + value, 0) : null;
  const rawHasMore = total === null
    ? rows.length > page.offset + page.limit || lists.some((value) => value?.hasMore)
    : page.offset + ordered.length < total;
  const capped = page.offset + page.limit >= COMBINED_PAGE_MAX_ROWS && rawHasMore;
  return {
    rows: ordered,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: rawHasMore && !capped,
    truncated: rawHasMore || lists.some((value) => value?.truncated),
    cap: { maxRows: COMBINED_PAGE_MAX_ROWS, reached: capped },
  };
}

function combinedSourceWindow(page) {
  const limit = page.offset + page.limit;
  return { limit, offset: 0, rangeEnd: limit - 1 };
}

async function paged(db, table, columns, orderColumn, page, filters) {
  let query = db.from(table).select(columns, { count: 'exact' });
  if (typeof filters === 'function') query = filters(query);
  if (orderColumn) query = query.order(orderColumn, { ascending: false });
  return runPaged(query, page);
}

/**
 * HUMANS SEATED IS READ FROM THE LIVE TABLES, NOT FROM ENGINE MEMORY (launch
 * audit, 2026-10-07). This number used to be the engine's public
 * `/health.humansSeatedTotal`, which only covers tables the engine has loaded
 * (a waiting table with a person at it and no engine counted zero) and counts
 * a seat row whose status already says `left` while its `left_at` is still
 * open. The database is the authority: a person (not a horse) holding a chip
 * stack in an open, non-terminal, non-left seat at a running, active or
 * waiting table. Observers never hold a seat row, so they never count. Horses
 * are identified here as data only (CLAUDE.md 10.5); the occupied-seat total
 * beside it still counts every player.
 */
export function humansSeatedQuery(db) {
  return db.from('table_seats')
    .select('id, profiles!fk_table_seats_user_id_profiles!inner(is_horse), tables!inner(status)', { count: 'exact', head: true })
    .is('left_at', null)
    .is('terminal_closed_at', null)
    .neq('status', 'left')
    .gt('stack', 0)
    .not('profiles.is_horse', 'is', true)
    .in('tables.status', LIVE_TABLE_STATUSES);
}

async function sectionEngine(db, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const [engine, tableCount, seatCount, humanCount] = await Promise.all([
    readEngineHealth({ url: ENGINE_HEALTH_URL }),
    db.from('tables').select('id', { count: 'exact', head: true }).in('status', LIVE_TABLE_STATUSES),
    db.from('table_seats').select('id', { count: 'exact', head: true }).is('left_at', null),
    humansSeatedQuery(db),
  ]);
  c.check('tables', tableCount);
  c.check('table_seats', seatCount);
  c.check('table_seats_humans', humanCount);
  if (!engine.ok) c.fail('engine_health', new Error('Engine health unavailable'));

  const databaseActiveTables = tableCount.error ? null : tableCount.count;
  const occupiedSeats = seatCount.error ? null : seatCount.count;
  const humansSeated = humanCount.error || typeof humanCount.count !== 'number' ? null : humanCount.count;
  const divergence = floorDivergence(databaseActiveTables, engine.ok ? engine.activeTables : null);
  const estimated = estimatedPlatformHandsPerSecond(engine.activeTables, engine.avgHandsPerHour);
  return {
    ...meta('engine', c),
    state: !engine.ok && tableCount.error && seatCount.error
      ? 'engine.unknown'
      : !engine.ok || tableCount.error || seatCount.error || humanCount.error
        ? 'engine.partial'
        : engine.state === 'degraded' ? 'engine.degraded'
        : divergence?.diverged ? 'engine.diverged' : 'engine.ready',
    engine: {
      ...engine,
      source: 'engine:/health',
      reachable: engine.ok === true,
      liveness: engine.liveness ?? null,
      version: engine.version ?? null,
      releaseSha: engine.releaseSha ?? null,
      instanceId: engine.instanceId ?? null,
      uptimeSeconds: engine.uptimeSeconds ?? null,
      averageActionProcessingMs: engine.averageActionProcessingMs ?? null,
      actionProcessingSamples: engine.actionProcessingSamples ?? null,
      actionProcessingThresholdViolations: engine.actionProcessingThresholdViolations ?? null,
      averageActionLatencyMs: engine.averageActionProcessingMs ?? null,
      actionLatencySample: engine.actionProcessingSamples ?? null,
      actionLatencyViolations: engine.actionProcessingThresholdViolations ?? null,
      cache: engine.cached === true ? 'Cached' : engine.cached === false ? 'Fresh' : null,
      stale: null,
      maintenance: engine.maintenance ?? null,
      estimatedPlatformHandsPerSecond: estimated,
      throughputLabel: 'Estimated Platform Hands Per Second',
      throughputAuthority: 'Derived From Active Tables And Average Measured-Table Hands Per Hour',
    },
    database: {
      source: 'public.tables + public.table_seats',
      state: tableCount.error || seatCount.error ? 'unknown' : 'ready',
      activeTables: databaseActiveTables,
      occupiedSeats,
      includesHorses: true,
      humansSeated,
      humansSeatedSource: 'public.table_seats: open, non-left, non-terminal seats with chips at live tables, people only',
    },
    divergence,
    unavailableContractFields: [
      'Authoritative Rolling Platform Hands Per Second',
      'P95 Action Processing Latency In JSON Health',
      'Total Engine Seats Across Humans And Horses',
    ],
  };
}

async function readMaintenanceSources(db) {
  return Promise.all([
    db.from('engine_maintenance_break')
      .select('id, phase, announced_at, break_started_at, break_ends_at, reason, declared_by, updated_at, enforce_freeze, ownership_token')
      .eq('id', true).maybeSingle(),
    db.from('engine_maintenance_thaws')
      .select('freeze_started_at, thawed_at, frozen_seconds, thawed_by, announced_at, ownership_token, contract_version, release_target_at, release_generation')
      .order('thawed_at', { ascending: false }).limit(1).maybeSingle(),
    readEngineHealth({ url: ENGINE_HEALTH_URL }),
  ]);
}

async function sectionMaintenance(db, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const [durableResult, thawResult, engine] = await readMaintenanceSources(db);
  c.check('engine_maintenance_break', durableResult);
  c.check('engine_maintenance_thaws', thawResult);
  if (!engine.ok) c.fail('engine_health', new Error('Engine health unavailable'));
  const runtime = engine.ok ? engine.maintenance ?? null : null;
  const durableRow = durableResult.error ? null : durableResult.data;
  const durable = durableRow ? {
    ...durableRow,
    active: true,
    declaredBy: durableRow.declared_by ?? null,
    ownershipToken: durableRow.ownership_token ?? null,
    freezeEnforced: durableRow.enforce_freeze === true,
  } : null;
  const state = maintenanceReconciliation({ engineOk: engine.ok, runtime, durable });
  return {
    ...meta('maintenance', c),
    state,
    runtime,
    runtimeSource: { source: 'engine:/health.maintenance', state: !engine.ok ? 'unknown' : runtime ? 'ready' : 'unsupported' },
    durable,
    durableSource: { source: 'public.engine_maintenance_break', state: durableResult.error ? 'unknown' : 'ready' },
    latestThaw: thawResult.error ? null : thawResult.data,
    thawSource: { source: 'public.engine_maintenance_thaws', state: thawResult.error ? 'unknown' : 'ready' },
    authorityGap: 'No Safe Authenticated Contract Exists Here To Start, Cancel Or End A Global Break. Status Is Read-Only.',
    controls: {
      available: false,
      state: 'not_implemented_in_authoritative_path',
      reason: 'No Safe Authenticated Engine Contract Exists For Starting, Cancelling Or Ending A Global Break',
    },
  };
}

async function sectionBreaks(db, op, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const canReadMoney = canReadFreezeAmounts(op);
  const scorecardPage = pageFor(query, 'scorecards', PLATFORM_PAGE);
  const logPage = pageFor(query, 'breakLogs', PLATFORM_PAGE);
  const faultPage = pageFor(query, 'faults', PLATFORM_PAGE);
  const thawPage = pageFor(query, 'thaws', PLATFORM_PAGE);
  const markPage = pageFor(query, 'freezeMarks', PLATFORM_PAGE);
  const scorecardColumns = canReadMoney
    ? 'break_ended_at, break_started_at, hands_in_window, tables_dealing_in_window, thaw_ran, thaw_frozen_seconds, kill_rebuilds_after, recovery_seconds, pre_break_tables, shipped_sha, shipped, freeze_conserved, freeze_delta, verdict, detail, recorded_at, unparked_at_countdown, peak_unparked, ready_for_restart_at, gate_opened'
    : 'break_ended_at, break_started_at, hands_in_window, tables_dealing_in_window, thaw_ran, thaw_frozen_seconds, kill_rebuilds_after, recovery_seconds, pre_break_tables, shipped_sha, shipped, freeze_conserved, verdict, detail, recorded_at, unparked_at_countdown, peak_unparked, ready_for_restart_at, gate_opened';
  const [scorecards, logs, faults, thaws, marks] = await Promise.all([
    paged(db, 'ca_break_scorecards', scorecardColumns, 'break_ended_at', scorecardPage),
    paged(db, 'engine_maintenance_break_log', 'break_started_at, break_ended_at, unparked_at_countdown, peak_unparked, ready_for_restart_at, tables_resumed, thaw_ok, engine_version, recorded_at', 'break_started_at', logPage),
    paged(db, 'engine_maintenance_break_faults', 'id, announced_at, stage, outcome, error, engine_version, recorded_at', 'announced_at', faultPage),
    paged(db, 'engine_maintenance_thaws', 'freeze_started_at, thawed_at, frozen_seconds, thawed_by, announced_at, ownership_token, contract_version, release_target_at, release_generation', 'thawed_at', thawPage),
    canReadMoney
      ? paged(db, 'ca_freeze_circulation_marks', 'mark_at, window_hour, kind, member_wallets, on_the_felt, total', 'mark_at', markPage)
      : Promise.resolve({ data: [], count: null, error: null, permissionRequired: true }),
  ]);
  c.check('ca_break_scorecards', scorecards);
  c.check('engine_maintenance_break_log', logs);
  c.check('engine_maintenance_break_faults', faults);
  c.check('engine_maintenance_thaws', thaws);
  if (canReadMoney) c.check('ca_freeze_circulation_marks', marks);
  return {
    ...meta('breaks', c),
    state: c.all().length ? 'breaks.partial' : 'breaks.ready',
    scorecards: list(scorecards, scorecardPage, (row) => scrubBreakScorecard(row, canReadMoney), { source: 'public.ca_break_scorecards' }),
    breakLog: list(logs, logPage, (row) => row, { source: 'public.engine_maintenance_break_log' }),
    faults: list(faults, faultPage, scrubFault, { source: 'public.engine_maintenance_break_faults' }),
    thaws: list(thaws, thawPage, (row) => row, { source: 'public.engine_maintenance_thaws' }),
    circulationMarks: canReadMoney
      ? list(marks, markPage, (row) => row, { source: 'public.ca_freeze_circulation_marks' })
      : { rows: [], total: null, limit: markPage.limit, offset: markPage.offset, hasMore: false, truncated: false, state: 'permission_required', permission: PERMISSIONS.MONEY_READ, source: 'public.ca_freeze_circulation_marks' },
  };
}

async function sectionReleases(db, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const page = pageFor(query, 'releases', PLATFORM_PAGE);
  const [result, latestShippedResult, engine] = await Promise.all([
    paged(db, 'ca_engine_deploy_attempts', 'id, at, run_id, target_sha, shipped, reason, actor', 'at', page),
    db.from('ca_engine_deploy_attempts')
      .select('id, at, run_id, target_sha, shipped, reason, actor')
      .eq('shipped', true).order('at', { ascending: false }).limit(1).maybeSingle(),
    readEngineHealth({ url: ENGINE_HEALTH_URL }),
  ]);
  c.check('ca_engine_deploy_attempts', result);
  c.check('ca_engine_deploy_attempts_latest_shipped', latestShippedResult);
  if (!engine.ok) c.fail('engine_health', new Error('Engine health unavailable'));
  const rows = (result.data || []).map(scrubRelease);
  const latestShipped = latestShippedResult.error ? null : scrubRelease(latestShippedResult.data);
  const releaseSha = engine.releaseSha ?? null;
  const receipts = shapeList(result, page, rows, { state: sourceState(result), source: 'public.ca_engine_deploy_attempts' });
  return {
    ...meta('releases', c),
    ...receipts,
    state: result.error && latestShippedResult.error && !engine.ok
      ? 'releases.unknown'
      : result.error || latestShippedResult.error || !engine.ok ? 'releases.partial' : 'releases.ready',
    receipts,
    currentEngineSha: releaseSha,
    latestShippedSha: latestShipped?.target_sha ?? null,
    currentEngineReleaseSha: releaseSha,
    latestShippedReceipt: latestShipped,
    releaseMatchesLatestShipped: releaseSha && latestShipped?.target_sha ? releaseSha === latestShipped.target_sha : null,
    controls: { dispatch: false, retry: false, authority: 'Provider Owned' },
  };
}

async function sectionCrons(db, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const healthPage = pageFor(query, 'cronHealth', PLATFORM_PAGE);
  const stalePage = pageFor(query, 'jobStaleness', PLATFORM_PAGE);
  const executionPage = pageFor(query, 'cronExecutions', PLATFORM_PAGE);
  const [health, staleness, executions] = await Promise.all([
    paged(db, 'cron_health_log', 'id, cron_name, last_run_at, last_status, last_duration_ms, error_message, metadata', 'last_run_at', healthPage),
    paged(db, 'v_openclaw_job_staleness', 'job_name, last_success_at, successes_30d, silent_minutes, p90_gap_minutes, threshold_minutes, is_stale', 'last_success_at', stalePage),
    paged(db, 'cron_execution_log', 'id, job_name, status, started_at, completed_at, result, error, duration_ms', 'started_at', executionPage),
  ]);
  c.check('cron_health_log', health);
  c.check('v_openclaw_job_staleness', staleness);
  c.check('cron_execution_log', executions);
  const healthList = list(health, healthPage, (row) => ({ ...row, error_message: boundedText(row.error_message), metadata: boundedEvidence(row.metadata) }), { source: 'public.cron_health_log' });
  const stalenessList = list(staleness, stalePage, (row) => ({
    ...row,
    scheduler: 'Open Claw',
    state: row.is_stale === true ? 'stale' : row.is_stale === false ? 'ready' : 'unknown',
    staleness: row.is_stale === true ? `${row.silent_minutes} Minutes Silent` : row.is_stale === false ? 'Within Observed Cadence' : 'Unknown',
  }), { source: 'public.v_openclaw_job_staleness', coverage: 'Only Jobs With Enough Successful History' });
  const executionList = list(executions, executionPage, (row) => ({ ...row, result: boundedEvidence(row.result), error: boundedText(row.error) }), { source: 'public.cron_execution_log' });
  return {
    ...meta('crons', c),
    ...stalenessList,
    state: c.all().length ? 'crons.partial' : 'crons.ready',
    schedulerAuthority: 'Open Claw Or Route Owner As Named By Source Evidence',
    health: healthList,
    staleness: stalenessList,
    executions: executionList,
  };
}

const ALERT_SOURCES = Object.freeze([
  Object.freeze({ key: 'operational', table: 'operational_alert_events', order: 'last_received_at', columns: 'id, source, event_key, alertname, status, severity, payload, received_at, last_received_at, delivery_count, investigation_status, investigation' }),
  Object.freeze({ key: 'engine', table: 'engine_alerts', order: 'received_at', columns: 'id, fingerprint, alertname, severity, component, status, summary, description, labels, starts_at, ends_at, received_at, notified_via' }),
  Object.freeze({ key: 'deploy', table: 'deploy_alerts', order: 'created_at', columns: 'alert_key, expires_at, created_at' }),
  Object.freeze({ key: 'financial', table: 'financial_alerts', order: 'created_at', columns: 'id, severity, source, message, context, resolved, resolved_at, created_at', permission: PERMISSIONS.MONEY_READ }),
]);

async function readAlertSources(db, page, canReadMoney) {
  const window = combinedSourceWindow(page);
  return Promise.all(ALERT_SOURCES.map(async (source) => {
    if (source.permission === PERMISSIONS.MONEY_READ && !canReadMoney) {
      return { source, page: window, result: { data: [], count: null, error: null, permissionRequired: true } };
    }
    const result = await paged(db, source.table, source.columns, source.order, window);
    return { source, page: window, result };
  }));
}

function permissionScopedAlertList(source, page, result) {
  if (result.permissionRequired) {
    return { rows: [], total: null, limit: page.limit, offset: page.offset, hasMore: false, truncated: false, state: 'permission_required', permission: source.permission, source: `public.${source.table}` };
  }
  return list(result, page, (row) => scrubAlert(source.table, row), { source: `public.${source.table}` });
}

async function sectionAlerts(db, op, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const page = pageFor(query, 'alerts', { ...PLATFORM_PAGE, maxOffset: 400 });
  const reads = await readAlertSources(db, page, canReadFreezeAmounts(op));
  const sources = {};
  for (const { source, page, result } of reads) {
    if (!result.permissionRequired) c.check(source.table, result);
    sources[source.key] = permissionScopedAlertList(source, page, result);
  }
  const visibleSources = Object.values(sources).filter((value) => value.state !== 'permission_required');
  const combined = combinedPage(
    visibleSources.flatMap((value) => value.rows || []).sort((a, b) => String(b.last_received_at || b.received_at || b.created_at || '').localeCompare(String(a.last_received_at || a.received_at || a.created_at || ''))),
    visibleSources,
    page
  );
  return {
    ...meta('alerts', c),
    ...combined,
    state: c.all().length ? 'alerts.partial' : 'alerts.ready',
    sources,
    disclosure: 'A Resolved Source Signal Is Not An Investigation Or A Verified Fix',
  };
}

async function sectionIncidents(db, op, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const page = pageFor(query, 'incidents', { ...PLATFORM_PAGE, maxOffset: 400 });
  const driftPage = combinedSourceWindow(page);
  const driftPromise = paged(
    db,
    'ca_drift_incidents',
    'id, detected_at, deadline_at, classification, severity, layer, status, source, occurrences, last_seen_at, acknowledged_by, acknowledged_at, resolution, resolved_at, metadata',
    'last_seen_at',
    driftPage
  );
  const [drift, alertReads] = await Promise.all([driftPromise, readAlertSources(db, page, canReadFreezeAmounts(op))]);
  c.check('ca_drift_incidents', drift);
  const sources = {
    drift: list(drift, driftPage, (row) => normalizeIncident('ca_drift_incidents', row), { source: 'public.ca_drift_incidents' }),
  };
  for (const { source, page, result } of alertReads) {
    if (!result.permissionRequired) c.check(source.table, result);
    sources[source.key] = result.permissionRequired
      ? permissionScopedAlertList(source, page, result)
      : list(result, page, (row) => normalizeIncident(source.table, row), { source: `public.${source.table}` });
  }
  const visibleSources = Object.values(sources).filter((value) => value.state !== 'permission_required');
  const combined = combinedPage(
    visibleSources.flatMap((value) => value.rows || []).sort((a, b) => String(b.lastSeenAt || b.occurredAt || b.last_received_at || b.received_at || b.created_at || '').localeCompare(String(a.lastSeenAt || a.occurredAt || a.last_received_at || a.received_at || a.created_at || ''))),
    visibleSources,
    page
  );
  const visibleIdentities = [...new Set(combined.rows.map((row) => row.sourceIdentity).filter(Boolean))];
  let acknowledgementRows = [];
  if (visibleIdentities.length) {
    const acknowledgements = await db
      .from('ca_operator_incident_ack_current')
      .select('source_table, source_identity, action, actor_id, note, request_id, operation_id, observed_status, observed_at, created_at')
      .in('source_identity', visibleIdentities);
    c.check('ca_operator_incident_ack_current', acknowledgements);
    if (!acknowledgements.error) acknowledgementRows = acknowledgements.data || [];
  }
  combined.rows = applyIncidentAcknowledgements(combined.rows, acknowledgementRows);
  return {
    ...meta('incidents', c),
    ...combined,
    state: c.all().length ? 'incidents.partial' : 'incidents.ready',
    sources,
    identityPolicy: 'Source Identities Remain Separate',
    acknowledgement: {
      available: hasPermission(op?.permissions, PERMISSIONS.INCIDENTS_ACK),
      permission: PERMISSIONS.INCIDENTS_ACK,
      meaning: 'Seen And Owned, Never Resolved',
      state: 'append_only_operator_ownership_overlay',
    },
  };
}

async function recordIncidentAcknowledgement({ req, op, db, body, requestId }) {
  const action = enumOf(body.action, INCIDENT_ACK_ACTIONS);
  const sourceTable = enumOf(body.sourceTable, INCIDENT_ACK_SOURCES);
  const sourceIdentity = validatedText(body.sourceIdentity, { min: 1, max: 512 });
  const note = validatedText(body.note, { min: 3, max: 500 });
  const operationId = uuid(body.operationId);
  if (!action) throw badRequest('Action Must Be Acknowledge Or Release', 'invalid_incident_ack_action');
  if (!sourceTable) throw badRequest('Pick A Valid Incident Source', 'invalid_incident_source');
  if (!sourceIdentity) throw badRequest('A Valid Incident Identity Is Required', 'invalid_incident_identity');
  if (!note) throw badRequest('A Note Of 3 To 500 Characters Is Required', 'invalid_incident_ack_note');
  if (!operationId) throw badRequest('A Valid Operation Id Is Required', 'invalid_operation_id');

  const { data, error } = await db.rpc('fn_ca_operator_record_incident_ack_event', {
    p_source_table: sourceTable,
    p_source_identity: sourceIdentity,
    p_action: action,
    p_actor_id: op.user.id,
    p_note: note,
    p_request_id: requestId,
    p_operation_id: operationId,
  });
  if (error) {
    if (error.code === 'P0002') throw notFound('Incident Source Row Not Found', 'incident_not_found');
    if (error.code === '23505') throw conflict('That Operation Id Was Already Used', 'operation_id_conflict');
    if (error.code === '22023') throw badRequest('Incident Acknowledgement Was Invalid', 'invalid_incident_acknowledgement');
    throw new ApiError(500, 'Incident Acknowledgement Could Not Be Recorded', 'incident_ack_write_failed');
  }

  const event = data?.event || null;
  if (data?.replayed !== true) {
    await auditOperatorAction(op, req, {
      action: `incident.${action}`,
      targetType: sourceTable,
      targetId: sourceIdentity,
      before: null,
      after: {
        ownershipState: action === 'acknowledge' ? 'acknowledged' : 'released',
        eventId: event?.id ?? null,
        operationId,
      },
      details: { note, sourceStatusUnchanged: true },
    });
  }

  return { acknowledgement: event, replayed: data?.replayed === true };
}

function sourceOk(c, name, result) {
  const ok = c.check(name, result);
  return { ok, health: ok ? 'ready' : 'unknown', rows: ok ? (result.data || []) : [] };
}

async function sectionRegistry(db, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.platform-admin' });
  const [clubFlagsResult, fleetResult, policyResult, videoResult, arenaResult, payoutResult, triviaResult] = await Promise.all([
    db.from('club_entry_feature_flags').select('key, enabled, rollout_percent, updated_at'),
    db.from('ca_horse_fleet_policy').select('scope, scope_id, pause_new_seatings, updated_at').eq('scope', 'global').is('scope_id', null).maybeSingle(),
    db.from('ca_operator_policy').select('approvals_enabled, allow_self_approve_when_alone, enforce_named_roles, restrictions_enforced, updated_at').eq('id', true).maybeSingle(),
    db.from('video_reels_pipeline_controls').select('control_key, enabled, reason, updated_at').order('control_key'),
    db.from('ca_arena_settings').select('cash_games_enabled, tournaments_enabled, updated_at').eq('id', 1).maybeSingle(),
    db.from('ca_payout_freeze').select('id, scope, reason, opened_at, cleared_at').is('cleared_at', null).order('opened_at', { ascending: false }).limit(100),
    db.from('trivia_ledger_switches').select('key, enabled, reason, updated_at').order('key'),
  ]);
  const clubFlags = sourceOk(c, 'club_entry_feature_flags', clubFlagsResult);
  const fleet = sourceOk(c, 'ca_horse_fleet_policy', fleetResult);
  const policy = sourceOk(c, 'ca_operator_policy', policyResult);
  const video = sourceOk(c, 'video_reels_pipeline_controls', videoResult);
  const arena = sourceOk(c, 'ca_arena_settings', arenaResult);
  const payout = sourceOk(c, 'ca_payout_freeze', payoutResult);
  const trivia = sourceOk(c, 'trivia_ledger_switches', triviaResult);
  const rows = [];

  for (const row of clubFlags.rows.filter((item) => ['create_club', 'find_player', 'join_club'].includes(item.key))) {
    rows.push(registryRow({ key: row.key, domain: 'club_entry', kind: 'percentage_rollout', enabled: row.enabled, rolloutPercent: row.rollout_percent, sourceTable: 'club_entry_feature_flags', sourceField: 'enabled + rollout_percent', consumer: 'fn_get_club_entry_flags', writable: false, writeAuthority: 'Club Entry Owner', updatedAt: row.updated_at, auditSource: 'updated_by', sourceHealth: clubFlags.health }));
  }
  if (!clubFlags.ok) {
    for (const key of ['create_club', 'find_player', 'join_club']) rows.push(registryRow({ key, domain: 'club_entry', kind: 'percentage_rollout', sourceTable: 'club_entry_feature_flags', sourceField: 'enabled + rollout_percent', consumer: 'fn_get_club_entry_flags', writable: false, writeAuthority: 'Club Entry Owner', sourceHealth: 'unknown' }));
  }

  rows.push(registryRow({ key: 'pause_new_seatings', domain: 'fleet', kind: 'kill_switch', enabled: fleet.ok && fleetResult.data ? fleetResult.data.pause_new_seatings : null, sourceTable: 'ca_horse_fleet_policy', sourceField: 'pause_new_seatings', consumer: 'Horse Fleet Manager', writable: false, writeAuthority: 'Fleet Command', updatedAt: fleetResult.data?.updated_at, auditSource: 'admin_audit_log', sourceHealth: fleet.health, blastRadius: 'Stops New Horse Seatings Only; Never Removes A Seated Player Or Interrupts A Hand' }));

  const policyFields = [
    ['approvals_enabled', 'Maker Checker Approvals'],
    ['allow_self_approve_when_alone', 'Owner Alone Rule'],
    ['enforce_named_roles', 'Named Role Enforcement'],
    ['restrictions_enforced', 'Player Restriction Enforcement'],
  ];
  for (const [field, label] of policyFields) rows.push(registryRow({ key: field, domain: 'operator_governance', enabled: policy.ok && policyResult.data ? policyResult.data[field] : null, sourceTable: 'ca_operator_policy', sourceField: field, consumer: label, writable: false, writeAuthority: 'Staff And Roles', updatedAt: policyResult.data?.updated_at, auditSource: 'admin_audit_log', sourceHealth: policy.health }));

  for (const row of video.rows) rows.push(registryRow({ key: row.control_key, domain: 'video_pipeline', kind: 'pipeline_control', enabled: row.enabled, sourceTable: 'video_reels_pipeline_controls', sourceField: 'enabled', consumer: 'Video Pipeline', writable: false, writeAuthority: 'Video Operations', updatedAt: row.updated_at, auditSource: 'video operations receipts', sourceHealth: video.health }));
  if (!video.ok) rows.push(registryRow({ key: 'video_pipeline_controls', domain: 'video_pipeline', kind: 'pipeline_control', sourceTable: 'video_reels_pipeline_controls', consumer: 'Video Pipeline', writable: false, writeAuthority: 'Video Operations', sourceHealth: 'unknown' }));

  for (const field of ['cash_games_enabled', 'tournaments_enabled']) rows.push(registryRow({ key: `arena_${field}`, domain: 'diamond_arena', kind: 'release_gate', enabled: arena.ok && arenaResult.data ? arenaResult.data[field] : null, sourceTable: 'ca_arena_settings', sourceField: field, consumer: 'Club Arena Engine', writable: false, writeAuthority: 'Human Owner Only', updatedAt: arenaResult.data?.updated_at, auditSource: 'Applied Human Change', sourceHealth: arena.health, blastRadius: field === 'cash_games_enabled' ? 'Diamond Arena Cash Games Only' : 'Diamond Arena Tournaments Only' }));

  const activePayoutScopes = new Set(payout.rows.map((row) => row.scope));
  const payoutScopes = new Set(['tournament_payouts', ...activePayoutScopes]);
  for (const scope of payoutScopes) rows.push(registryRow({ key: `payout_freeze_${scope}`, domain: 'payouts', kind: 'kill_switch', enabled: payout.ok ? activePayoutScopes.has(scope) : null, sourceTable: 'ca_payout_freeze', sourceField: 'cleared_at', consumer: 'Scope-Specific Money RPCs', writable: false, writeAuthority: 'Human Finance Authority Only', updatedAt: payout.rows.find((row) => row.scope === scope)?.opened_at, auditSource: 'ca_payout_freeze', sourceHealth: payout.health, blastRadius: `Payout Scope: ${boundedText(scope, 80)}` }));

  for (const row of trivia.rows.filter((item) => item.key === 'solo_journal')) rows.push(registryRow({ key: `trivia_${row.key}`, domain: 'trivia', kind: 'ledger_switch', enabled: row.enabled, sourceTable: 'trivia_ledger_switches', sourceField: 'enabled', consumer: 'Trivia Ledger Solo Paths', writable: false, writeAuthority: 'Written Human-Only Trivia Authority', updatedAt: row.updated_at, auditSource: 'trivia_ledger_switch_history', sourceHealth: trivia.health }));
  if (!trivia.ok) rows.push(registryRow({ key: 'trivia_solo_journal', domain: 'trivia', kind: 'ledger_switch', sourceTable: 'trivia_ledger_switches', sourceField: 'enabled', consumer: 'Trivia Ledger Solo Paths', writable: false, writeAuthority: 'Written Human-Only Trivia Authority', auditSource: 'trivia_ledger_switch_history', sourceHealth: 'unknown' }));

  rows.push(...MISSING_CONTROL_ROWS);
  return {
    ...meta('registry', c),
    state: c.all().length ? 'registry.partial' : 'registry.ready',
    rows,
    allowlisted: true,
    genericUpdater: false,
    excludedSources: ['Environment Values', 'Secrets', 'vip_plan_switches Audit History'],
  };
}

export async function handle({ req, op, db, body, method, query, requestId }) {
  if (method === 'POST') return recordIncidentAcknowledgement({ req, op, db, body, requestId });
  const section = enumOf(query.section, PLATFORM_ADMIN_SECTIONS);
  if (!section) throw badRequest('Pick A Valid Platform Operations Section', 'invalid_section');
  if (section === 'engine') return sectionEngine(db, requestId);
  if (section === 'maintenance') return sectionMaintenance(db, requestId);
  if (section === 'breaks') return sectionBreaks(db, op, query, requestId);
  if (section === 'releases') return sectionReleases(db, query, requestId);
  if (section === 'crons') return sectionCrons(db, query, requestId);
  if (section === 'alerts') return sectionAlerts(db, op, query, requestId);
  if (section === 'incidents') return sectionIncidents(db, op, query, requestId);
  return sectionRegistry(db, requestId);
}

export const handlePlatformAdmin = handle;

export const spec = Object.freeze({
  name: 'horses.platform-admin',
  methods: ['GET', 'POST'],
  permission: { GET: PERMISSIONS.CONSOLE_READ, POST: PERMISSIONS.INCIDENTS_ACK },
  limit: { GET: 'read', POST: 'write' },
  durable: { POST: { max: 60, windowSeconds: 60 } },
});

export const platformAdminSpec = spec;

export default withOperatorRoute(spec, handle);
