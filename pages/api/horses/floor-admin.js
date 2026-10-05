/**
 * Phase 6 floor operations API.
 *
 * Reads compose durable Club Arena and engine state. The only mutations here
 * are the existing authoritative club status and funding paths plus an export
 * audit receipt; every other operation remains a labelled link or deferral.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, forbidden, notFound } from '../../../src/lib/horses/apiEnvelope.js';
import { pageFor, shapeList, sourceCollector } from '../../../src/lib/horses/listShape.js';
import { runPaged } from '../../../src/lib/horses/paged.js';
import { enumOf, money2dp, text, uuid } from '../../../src/lib/horses/validate.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { approvalPendingResponse, markApprovalExecuted, requireApproval, requiresApproval } from '../../../src/lib/horses/approvals.js';
import { mapDbError } from '../../../src/lib/horses/dbErrors.js';
import {
  FLOOR_ADMIN_CONTROL_MANIFEST,
  FLOOR_ADMIN_CONTROL_AVAILABILITY,
  FLOOR_ADMIN_LINKS,
  FLOOR_ADMIN_SECTIONS,
  FLOOR_ADMIN_SECTION_PERMISSIONS,
  deliveryHealthState,
  floorDivergence,
  floorReadState,
  queueReadState,
  readEngineHealth,
} from '../../../src/lib/horses/floorAdmin.js';

const PAGE = Object.freeze({ defaultLimit: 50, max: 200 });
const SEAT_PAGE = Object.freeze({ defaultLimit: 200, max: 500 });
const LIVE_TABLE_STATUSES = Object.freeze(['running', 'active', 'waiting']);
const VISIBLE_TOURNAMENT_STATUSES = Object.freeze(['scheduled', 'registering', 'upcoming', 'running', 'late_reg', 'in_progress']);
const LIVE_TOURNAMENT_STATUSES = Object.freeze(['running', 'late_reg', 'in_progress']);
const ENGINE_HEALTH_URL = (process.env.GAME_SERVER_URL || process.env.ENGINE_URL || 'https://engine.smarter.poker').replace(/\/$/, '') + '/health';
const CLUB_STATUSES = Object.freeze(['active', 'suspended']);
const MEMBER_CHIP_PAGE_SIZE = 1000;
const MEMBER_CHIP_MAX_ROWS = 100000;

function controls(section) {
  return { controls: FLOOR_ADMIN_CONTROL_MANIFEST[section], availability: FLOOR_ADMIN_CONTROL_AVAILABILITY[section] || {}, links: FLOOR_ADMIN_LINKS };
}

function requireSectionPermission(op, section) {
  const permission = FLOOR_ADMIN_SECTION_PERMISSIONS[section];
  if (!hasPermission(op?.permissions, permission)) throw forbidden(`Permission Required: ${permission}`, 'permission_denied');
}

function baseMeta(section, c) {
  return { section, asOf: new Date().toISOString(), failedSources: c.all(), ...controls(section) };
}

async function profileHorseMap(db, userIds, c) {
  const allIds = [...new Set((userIds || []).filter(Boolean))];
  const ids = allIds.slice(0, 1000);
  if (!ids.length) return { map: new Map(), ok: true, complete: true };
  const result = await db.from('profiles').select('id, is_horse').in('id', ids);
  if (!c.check('profiles', result)) return { map: new Map(), ok: false, complete: false };
  const map = new Map((result.data || []).map((row) => [row.id, row.is_horse === true ? 'horse' : row.is_horse === false ? 'human' : 'unknown']));
  return { map, ok: true, complete: allIds.length === ids.length && ids.every((id) => map.get(id) === 'horse' || map.get(id) === 'human') };
}

function composition(seats, profileRead, seatsComplete = true) {
  const list = seats || [];
  if (!seatsComplete) return { occupied: null, horses: null, humans: null, unknown: null };
  let knownHorses = 0;
  let knownHumans = 0;
  let unknown = 0;
  for (const seat of list) {
    const type = profileRead.map.get(seat.user_id);
    if (type === 'horse') knownHorses += 1;
    else if (type === 'human') knownHumans += 1;
    else unknown += 1;
  }
  if (!profileRead.ok || !profileRead.complete) return { occupied: list.length, horses: null, humans: null, unknown, knownHorses, knownHumans };
  return { occupied: list.length, horses: unknown ? null : knownHorses, humans: unknown ? null : knownHumans, unknown, knownHorses, knownHumans };
}

async function sectionFloor(db, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'tables', PAGE);
  const [tablesResult, databaseCount, engine] = await Promise.all([
    runPaged(db.from('tables')
      .select('id, name, club_id, status, small_blind, big_blind, max_players, tournament_id, created_at', { count: 'exact' })
      .in('status', LIVE_TABLE_STATUSES)
      .order('created_at', { ascending: false }), page),
    db.from('tables').select('id', { count: 'exact', head: true }).in('status', LIVE_TABLE_STATUSES),
    readEngineHealth({ url: ENGINE_HEALTH_URL }),
  ]);
  c.check('tables', tablesResult);
  c.check('table_count', databaseCount);
  const tableIds = (tablesResult.data || []).map((row) => row.id);
  const seatsResult = tableIds.length
    ? await db.from('table_seats').select('table_id, user_id, seat_number, joined_at', { count: 'exact' }).in('table_id', tableIds).is('left_at', null).limit(1000)
    : { data: [], count: 0, error: null };
  const seatsOk = c.check('table_seats', seatsResult);
  const seatsComplete = seatsOk && typeof seatsResult.count === 'number' && seatsResult.count === (seatsResult.data || []).length;
  const horseProfiles = await profileHorseMap(db, (seatsResult.data || []).map((row) => row.user_id), c);
  const seatsByTable = new Map();
  for (const seat of seatsResult.data || []) {
    const list = seatsByTable.get(seat.table_id) || [];
    list.push(seat);
    seatsByTable.set(seat.table_id, list);
  }
  const compositionComplete = seatsComplete && horseProfiles.complete;
  const rows = (tablesResult.data || []).map((row) => ({ ...row, composition: composition(seatsByTable.get(row.id), horseProfiles, compositionComplete) }));
  const databaseActive = typeof databaseCount.count === 'number' ? databaseCount.count : null;
  const divergence = floorDivergence(databaseActive, engine.ok ? engine.activeTables : null);
  return {
    ...baseMeta('floor', c),
    state: floorReadState({ databaseOk: !tablesResult.error && !databaseCount.error && compositionComplete, engineOk: engine.ok, divergence, rowCount: rows.length }),
    tables: shapeList(tablesResult, page, rows),
    database: { ok: !databaseCount.error, activeTables: databaseActive },
    engine,
    divergence,
    disclosure: divergence?.diverged ? 'The Database And Engine Report Different Live Table Counts' : null,
  };
}

async function sectionTable(db, query, requestId) {
  const tableId = uuid(query.tableId);
  if (!tableId) throw badRequest('Pick A Valid Table', 'invalid_table');
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'seats', SEAT_PAGE);
  const [tableResult, seatsResult] = await Promise.all([
    db.from('tables').select('id, name, club_id, status, small_blind, big_blind, max_players, tournament_id, created_at').eq('id', tableId).maybeSingle(),
    runPaged(db.from('table_seats').select('table_id, user_id, seat_number, joined_at', { count: 'exact' }).eq('table_id', tableId).is('left_at', null).order('seat_number'), page),
  ]);
  if (tableResult.error) c.fail('table', tableResult.error);
  if (!tableResult.error && !tableResult.data) throw notFound('That Table Was Not Found');
  const seatsOk = c.check('table_seats', seatsResult);
  const horseProfiles = await profileHorseMap(db, (seatsResult.data || []).map((row) => row.user_id), c);
  const seats = (seatsResult.data || []).map((row) => ({ ...row, playerType: seatsOk && horseProfiles.ok ? (horseProfiles.map.get(row.user_id) || 'unknown') : 'unknown' }));
  const seatPage = shapeList(seatsResult, page, seats);
  const completeSeats = seatsOk && !seatPage.hasMore;
  return { ...baseMeta('table', c), state: tableResult.data && completeSeats && horseProfiles.ok && horseProfiles.complete ? 'table.ready' : 'table.unknown', table: tableResult.data || null, composition: composition(seats, horseProfiles, completeSeats), seats: seatPage };
}

async function sectionTournaments(db, op, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'tournaments', PAGE);
  const auditDays = Math.min(90, Math.max(1, Number.parseInt(query.payoutAuditDays, 10) || 7));
  const canReadMoney = hasPermission(op?.permissions, PERMISSIONS.MONEY_READ);
  const payoutWindowPromise = canReadMoney
    ? db.rpc('fn_tournament_payout_sweep', { p_days: auditDays, p_apply: false, p_limit: 200 })
    : Promise.resolve({ data: null, error: null, permissionRequired: true });
  const [result, countResult, engine, payoutWindowResult] = await Promise.all([
    runPaged(db.from('tournaments')
      .select('id, name, status, start_time, buy_in_amount, prize_pool, guaranteed_prize, late_reg_mins, max_players, current_players, created_at', { count: 'exact' })
      .in('status', VISIBLE_TOURNAMENT_STATUSES).order('start_time'), page),
    db.from('tournaments').select('id', { count: 'exact', head: true }).in('status', LIVE_TOURNAMENT_STATUSES),
    readEngineHealth({ url: ENGINE_HEALTH_URL }),
    payoutWindowPromise,
  ]);
  c.check('tournaments', result); c.check('tournament_count', countResult);
  if (canReadMoney) c.check('payout_window_audit', payoutWindowResult);
  const databaseActive = typeof countResult.count === 'number' ? countResult.count : null;
  const divergence = floorDivergence(databaseActive, engine.ok ? engine.activeTournaments : null);
  const rows = (result.data || []).map((row) => ({ ...row, registered_count: row.current_players !== null && row.current_players !== undefined && row.current_players !== '' && Number.isFinite(Number(row.current_players)) ? Number(row.current_players) : null }));
  const state = result.error ? 'tournaments.unknown' : !engine.ok || (canReadMoney && payoutWindowResult.error) ? 'tournaments.partial' : rows.length ? 'tournaments.ready' : 'tournaments.empty_none_scheduled';
  return {
    ...baseMeta('tournaments', c), state, tournaments: shapeList(result, page, rows), engine, divergence,
    payoutWindowAudit: canReadMoney && !payoutWindowResult.error ? payoutWindowResult.data : null,
    payoutWindowAuditState: !canReadMoney ? 'permission_required' : payoutWindowResult.error ? 'unknown' : 'ready',
    payoutWindowAuditMode: 'dry_run', payoutWindowAuditDays: auditDays,
  };
}

async function sectionEvent(db, op, query, requestId) {
  const tournamentId = uuid(query.tournamentId);
  if (!tournamentId) throw badRequest('Pick A Valid Tournament', 'invalid_tournament');
  if (!hasPermission(op?.permissions, PERMISSIONS.MONEY_READ)) throw forbidden(`Permission Required: ${PERMISSIONS.MONEY_READ}`, 'permission_denied');
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const [eventResult, playersResult, overlayResult, receiptResult, payoutAuditResult] = await Promise.all([
    db.from('tournaments').select('id, name, status, start_time, buy_in_amount, prize_pool, guaranteed_prize, late_reg_mins, max_players, current_players, created_at').eq('id', tournamentId).maybeSingle(),
    db.from('tournament_players').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    db.from('tournament_guarantee_overlays').select('*').eq('tournament_id', tournamentId).maybeSingle(),
    db.from('tournament_cancellation_receipts').select('*').eq('tournament_id', tournamentId).maybeSingle(),
    db.rpc('fn_tournament_payout_reconcile', { p_tournament_id: tournamentId, p_apply: false }),
  ]);
  if (eventResult.error) c.fail('tournament', eventResult.error);
  if (!eventResult.error && !eventResult.data) throw notFound('That Tournament Was Not Found');
  c.check('tournament_players', playersResult); c.check('tournament_overlay', overlayResult);
  c.check('tournament_cancellation_receipt', receiptResult); c.check('payout_audit', payoutAuditResult);
  return {
    ...baseMeta('event', c),
    state: eventResult.error ? 'event.unknown' : c.all().length ? 'event.partial' : 'event.ready',
    event: eventResult.data,
    registrations: playersResult.count ?? null,
    overlay: overlayResult.data || null,
    overlayState: overlayResult.error ? 'unknown' : overlayResult.data ? 'recorded' : 'not_recorded',
    cancellationReceipt: receiptResult.data || null,
    cancellationReceiptState: receiptResult.error ? 'unknown' : receiptResult.data ? 'recorded' : 'not_recorded',
    payoutAudit: payoutAuditResult.error ? null : payoutAuditResult.data,
    payoutAuditState: payoutAuditResult.error ? 'unknown' : 'ready',
    payoutAuditMode: 'dry_run',
  };
}

async function sectionClubs(db, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'clubs', PAGE);
  const result = await runPaged(db.from('clubs').select('id, name, club_id, code, status, owner_id, union_id, chip_treasury, member_count, table_count, created_at', { count: 'exact' }).order('created_at', { ascending: false }), page);
  c.check('clubs', result);
  return { ...baseMeta('clubs', c), state: result.error ? 'clubs.unknown' : (result.data || []).length ? 'clubs.ready' : 'clubs.empty_no_clubs', clubs: shapeList(result, page) };
}

function addMoney2dp(totalCents, raw) {
  const value = String(raw ?? '').trim();
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return totalCents + (BigInt(match[1]) * 100n) + BigInt((match[2] || '').padEnd(2, '0'));
}

function centsText(cents) {
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}

async function readMemberChipTotal(db, clubId, c) {
  let total = 0n;
  let rowsRead = 0;
  for (let offset = 0; offset < MEMBER_CHIP_MAX_ROWS; offset += MEMBER_CHIP_PAGE_SIZE) {
    const result = await db.from('club_members').select('chip_balance').eq('club_id', clubId)
      .order('user_id').range(offset, offset + MEMBER_CHIP_PAGE_SIZE - 1);
    if (!c.check('club_member_chip_total', result)) return { state: 'unknown', amount: null, rowsRead, complete: false };
    const rows = result.data || [];
    for (const row of rows) {
      const next = addMoney2dp(total, row.chip_balance);
      if (next === null) {
        c.fail('club_member_chip_total', new Error('A member chip balance was not an exact two-decimal amount'));
        return { state: 'unknown', amount: null, rowsRead, complete: false };
      }
      total = next;
      rowsRead += 1;
    }
    if (rows.length < MEMBER_CHIP_PAGE_SIZE) return { state: 'ready', amount: centsText(total), rowsRead, complete: true };
  }
  return { state: 'truncated', amount: null, rowsRead, complete: false };
}

async function sectionClub(db, query, requestId) {
  const clubId = uuid(query.clubId);
  if (!clubId) throw badRequest('Pick A Valid Club', 'invalid_club');
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'members', PAGE);
  const [clubResult, membersResult, settlementResult, memberChips] = await Promise.all([
    db.from('clubs').select('id, name, club_id, code, status, owner_id, union_id, chip_treasury, member_count, table_count, created_at').eq('id', clubId).maybeSingle(),
    runPaged(db.from('club_members').select('club_id, user_id, role, status, chip_balance, joined_at', { count: 'exact' }).eq('club_id', clubId).order('joined_at', { ascending: false }), page),
    db.from('settlement_periods').select('*').eq('club_id', clubId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    readMemberChipTotal(db, clubId, c),
  ]);
  if (clubResult.error) c.fail('club', clubResult.error);
  if (!clubResult.error && !clubResult.data) throw notFound('That Club Was Not Found');
  c.check('club_members', membersResult); c.check('settlement_period', settlementResult);
  const meta = baseMeta('club', c);
  const state = clubResult.error ? 'club.unknown' : c.all().length || memberChips.state !== 'ready' ? 'club.partial' : 'club.ready';
  return {
    ...meta, state, club: clubResult.data, members: shapeList(membersResult, page), settlement: settlementResult.data || null,
    memberChips: { ...memberChips, asOf: meta.asOf, scope: 'all_members' },
    stopLossVsDeposit: { state: 'unavailable_no_authoritative_source', value: null,
      disclosure: 'No Authoritative Stop-Loss Versus Deposit Source Exists In The Measured Schema' },
    clubHealth: { state: 'unavailable_operator_authority_mismatch', value: null,
      disclosure: 'Club Health Is Owner-Scoped And Cannot Be Embedded For A Platform Operator Without New Authority' },
  };
}

async function sectionUnions(db, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'unions', PAGE);
  const result = await runPaged(db.from('unions').select('id, name, code, union_code, club_count, member_count, chip_balance, created_at', { count: 'exact' }).order('created_at', { ascending: false }), page);
  c.check('unions', result);
  return { ...baseMeta('unions', c), state: result.error ? 'unions.unknown' : (result.data || []).length ? 'unions.ready' : 'unions.empty_no_unions', unions: shapeList(result, page) };
}

async function sectionUnion(db, op, query, requestId) {
  const unionId = uuid(query.unionId);
  if (!unionId) throw badRequest('Pick A Valid Union', 'invalid_union');
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'unionRows', PAGE);
  const canReadMoney = hasPermission(op?.permissions, PERMISSIONS.MONEY_READ);
  const rakeSharePromise = canReadMoney
    ? db.rpc('fn_union_rake_by_club', { p_union_id: unionId, p_days: 30 })
    : Promise.resolve({ data: null, error: null, permissionRequired: true });
  const [unionResult, clubsResult, roundsResult, presettlementsResult, applicationsResult, leaveResult, rakeShareResult] = await Promise.all([
    db.from('unions').select('id, name, code, union_code, club_count, member_count, chip_balance, created_at').eq('id', unionId).maybeSingle(),
    runPaged(db.from('union_clubs').select('*', { count: 'exact' }).eq('union_id', unionId), page),
    runPaged(db.from('union_settlement_rounds').select('*', { count: 'exact' }).eq('union_id', unionId).order('executed_at', { ascending: false }), page),
    runPaged(db.from('union_presettlements').select('*', { count: 'exact' }).eq('union_id', unionId).order('created_at', { ascending: false }), page),
    runPaged(db.from('union_applications').select('*', { count: 'exact' }).eq('union_id', unionId).order('applied_at', { ascending: false }), page),
    runPaged(db.from('union_leave_requests').select('*', { count: 'exact' }).eq('union_id', unionId).order('requested_at', { ascending: false }), page),
    rakeSharePromise,
  ]);
  if (unionResult.error) c.fail('union', unionResult.error);
  if (!unionResult.error && !unionResult.data) throw notFound('That Union Was Not Found');
  c.check('union_clubs', clubsResult); c.check('union_settlement_rounds', roundsResult);
  c.check('union_presettlements', presettlementsResult); c.check('union_applications', applicationsResult); c.check('union_leave_requests', leaveResult);
  if (canReadMoney) c.check('union_rake_share', rakeShareResult);
  return {
    ...baseMeta('union', c), state: c.all().length ? 'unions.partial' : 'unions.ready', union: unionResult.data,
    memberClubs: shapeList(clubsResult, page), settlementRounds: shapeList(roundsResult, page),
    presettlements: shapeList(presettlementsResult, page), applications: shapeList(applicationsResult, page), leaveRequests: shapeList(leaveResult, page),
    rakeShare: canReadMoney && !rakeShareResult.error ? rakeShareResult.data : null,
    rakeShareState: !canReadMoney ? 'permission_required' : rakeShareResult.error ? 'unknown' : 'ready',
    rakeShareWindowDays: 30,
  };
}

async function queueSection(db, query, requestId, kind) {
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, kind, PAGE);
  const table = kind === 'cashouts' ? 'cashout_requests' : 'chip_requests';
  const fields = kind === 'cashouts'
    ? 'id, club_id, player_id, agent_id, amount, status, player_note, agent_note, created_at'
    : 'id, club_id, requester_id, approver_id, amount, note, status, responded_by, responded_at, created_at, op_id';
  let builder = db.from(table).select(fields, { count: 'exact' }).order('created_at', { ascending: false });
  if (query.status) builder = builder.eq('status', String(query.status).slice(0, 40));
  const clubId = query.clubId ? uuid(query.clubId) : null;
  if (query.clubId && !clubId) throw badRequest('Pick A Valid Club', 'invalid_club');
  if (clubId) builder = builder.eq('club_id', clubId);
  const age = enumOf(query.age, ['recent', 'warning', 'overdue']);
  const now = Date.now();
  if (age === 'recent') builder = builder.gte('created_at', new Date(now - 24 * 3600000).toISOString());
  if (age === 'warning') builder = builder.lt('created_at', new Date(now - 24 * 3600000).toISOString()).gte('created_at', new Date(now - 48 * 3600000).toISOString());
  if (age === 'overdue') builder = builder.lt('created_at', new Date(now - 48 * 3600000).toISOString());
  const [result, totalResult, pendingResult] = await Promise.all([
    runPaged(builder, page),
    db.from(table).select('id', { count: 'exact', head: true }),
    db.from(table).select('id', { count: 'exact', head: true }).in('status', ['pending', 'requested', 'pending_approval']),
  ]);
  c.check(table, result);
  c.check(`${table}_total`, totalResult);
  c.check(`${table}_pending`, pendingResult);
  const sourceOk = !result.error && !totalResult.error && !pendingResult.error;
  const total = sourceOk && typeof totalResult.count === 'number' ? totalResult.count : null;
  const pending = sourceOk && typeof pendingResult.count === 'number' ? pendingResult.count : null;
  const rows = (result.data || []).map((row) => {
    const created = Date.parse(row.created_at);
    const ageHours = Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / 3600000)) : null;
    return { ...row, age_hours: ageHours, sla_state: ageHours === null ? 'unknown' : ageHours >= 48 ? 'overdue' : ageHours >= 24 ? 'warning' : 'within_sla' };
  });
  return { ...baseMeta(kind, c), state: queueReadState({ sourceOk, total, pending }), queue: shapeList(result, page, rows), totals: { all: total, pending }, filters: { status: query.status || null, clubId, age: age || null }, sla: { warningHours: 24, overdueHours: 48 } };
}

async function sectionRake(db, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'rake', PAGE);
  const days = Math.min(90, Math.max(1, Number.parseInt(query.days, 10) || 7));
  const dimension = enumOf(query.dimension, ['club', 'union', 'stake', 'date']) || 'club';
  const asOf = new Date();
  const since = new Date(asOf.getTime() - days * 86400000).toISOString();
  const until = asOf.toISOString();
  const freshnessFrom = since.slice(0, 10);
  const freshnessToExclusive = until.slice(0, 10);
  const [reportResult, freshnessResult, historyResult, engine] = await Promise.all([
    db.rpc('fn_ca_operator_rake_report', {
      p_dimension: dimension,
      p_start: since,
      p_end: until,
      p_limit: page.limit,
      p_offset: page.offset,
    }),
    db.rpc('fn_ca_operator_rake_freshness', {
      p_start: freshnessFrom,
      p_to_exclusive: freshnessToExclusive,
    }),
    db.from('rake_rate_audit').select('id, club_id, changed_by, old_rate, new_rate, rate_type, notes, created_at').order('created_at', { ascending: false }).limit(200),
    readEngineHealth({ url: ENGINE_HEALTH_URL }),
  ]);
  c.check('rake_report', reportResult); c.check('rake_freshness', freshnessResult); c.check('rake_rate_audit', historyResult);
  const reportRows = (reportResult.data || []).map((row) => ({
    id: `${dimension}:${row.group_key}`,
    dimension_key: row.group_key,
    label: row.label,
    rake_amount: row.rake_amount,
    bbj_contribution: row.bbj_contribution,
    record_count: row.record_count,
    first_recorded_at: row.first_recorded_at,
    last_recorded_at: row.last_recorded_at,
    window_start: since,
    window_end: until,
    as_of: until,
  }));
  const reportedTotal = Number(reportResult.data?.[0]?.total_groups);
  const total = Number.isSafeInteger(reportedTotal) && reportedTotal >= 0 ? reportedTotal : (reportRows.length ? null : 0);
  const hasMore = total === null ? null : page.offset + reportRows.length < total;
  const windowRecordCount = reportResult.data?.[0]?.window_record_count ?? (reportRows.length ? null : '0');
  const freshnessRows = (freshnessResult.data || []).map((row) => ({
    union_id: row.union_id,
    union_name: row.union_name,
    stale_days: Array.isArray(row.stale_days) ? row.stale_days : [],
    checked_from: row.checked_from,
    checked_to_exclusive: row.checked_to_exclusive,
    checked_at: row.checked_at,
  }));
  const staleDays = [...new Set(freshnessRows.flatMap((row) => row.stale_days))].sort();
  const freshness = freshnessResult.error
    ? { state: 'freshness.unknown', rows: [], staleDays: null, complete: false }
    : !freshnessRows.length
      ? { state: 'freshness.not_applicable', rows: [], staleDays: [], complete: true }
      : staleDays.length
        ? { state: 'freshness.stale', rows: freshnessRows, staleDays, complete: true }
        : { state: 'freshness.fresh', rows: freshnessRows, staleDays: [], complete: true };
  const rake = {
    rows: reportRows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore,
    truncated: hasMore !== false,
    complete: hasMore === false,
    aggregateWindowComplete: !reportResult.error,
    windowRecordCount,
  };
  const state = reportResult.error ? 'rake.unknown'
    : freshness.state === 'freshness.stale' ? 'rake.stale'
      : !engine.ok || historyResult.error || freshnessResult.error ? 'rake.partial'
        : reportRows.length ? 'rake.ready' : 'rake.empty_no_rake_in_window';
  return {
    ...baseMeta('rake', c),
    state,
    dimension,
    includesHorses: true,
    window: { days, since, until, label: `Last ${days} Days`, asOf: until },
    rake,
    freshness,
    disclosure: reportResult.error ? 'The Aggregate Report Could Not Be Read. No Total Is Claimed.'
      : 'Every Figure Aggregates The Full Selected Window. The Current Page Only Limits Dimension Rows.',
    rateHistory: { state: historyResult.error ? 'history.unknown' : (historyResult.data || []).length ? 'history.ready' : 'history.empty_none_recorded', rows: historyResult.data || [] },
    drift: !engine.ok || !engine.rakeSpec ? { state: 'drift.unknown', data: null } : { state: engine.rakeSpec.drifted ? 'drift.drifted' : 'drift.ok', data: engine.rakeSpec },
  };
}

async function sectionAnnouncements(db, query, requestId) {
  const c = sourceCollector({ requestId, route: 'horses.floor-admin' });
  const page = pageFor(query, 'announcements', PAGE);
  const [clubsResult, unionsResult, outboxResult, drainResult] = await Promise.all([
    runPaged(db.from('club_announcements').select('id, club_id, title, content, priority, is_pinned, expires_at, created_at', { count: 'exact' }).order('created_at', { ascending: false }), page),
    runPaged(db.from('union_announcements').select('id, union_id, club_id, message, created_by, created_at', { count: 'exact' }).order('created_at', { ascending: false }), page),
    db.from('push_outbox').select('id', { count: 'exact', head: true }).in('status', ['pending', 'retry']),
    db.from('push_dispatch_runs').select('finished_at').not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  c.check('club_announcements', clubsResult); c.check('union_announcements', unionsResult);
  c.check('push_outbox', outboxResult); c.check('push_dispatch_runs', drainResult);
  const deliveryOk = !outboxResult.error && !drainResult.error;
  const state = clubsResult.error && unionsResult.error ? 'announcements.unknown' : c.all().length ? 'announcements.partial' : ((clubsResult.data || []).length || (unionsResult.data || []).length) ? 'announcements.ready' : 'announcements.empty_none_published';
  return { ...baseMeta('announcements', c), state, clubAnnouncements: shapeList(clubsResult, page), unionAnnouncements: shapeList(unionsResult, page), delivery: { state: deliveryHealthState({ sourceOk: deliveryOk, pending: outboxResult.count, lastDrainAt: drainResult.data?.finished_at }), pending: deliveryOk ? outboxResult.count : null, lastDrainAt: deliveryOk ? drainResult.data?.finished_at || null : null } };
}

function boundedExportFilters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, raw]) => [
    String(key).slice(0, 60),
    raw === null || raw === undefined ? null : String(raw).slice(0, 240),
  ]));
}

async function recordCompletedExport(op, req, body) {
  const section = enumOf(body.section, FLOOR_ADMIN_SECTIONS);
  const exportId = uuid(body.exportId);
  const rowCount = Number(body.rowCount);
  if (!section || !exportId || !Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > 10000000 || typeof body.complete !== 'boolean') {
    throw badRequest('A Valid Prepared Export Receipt Is Required', 'invalid_export_receipt');
  }
  requireSectionPermission(op, section);
  const filters = boundedExportFilters(body.filters);
  const audited = await auditOperatorAction(op, req, {
    action: 'floor.export_prepared',
    targetType: 'operator_export',
    targetId: exportId,
    before: null,
    after: { section, row_count: rowCount, complete: body.complete, delivery: 'browser_download_requested' },
    details: { section, filters, row_count: rowCount, complete: body.complete, delivery: 'browser_download_requested' },
  });
  return { recorded: audited.ok === true, exportId, section, rowCount, complete: body.complete };
}

async function setClubStatus(db, op, req, body) {
  if (!hasPermission(op?.permissions, PERMISSIONS.CLUBS_WRITE)) throw forbidden(`Permission Required: ${PERMISSIONS.CLUBS_WRITE}`, 'permission_denied');
  const clubId = uuid(body.clubId);
  const status = enumOf(body.status, CLUB_STATUSES);
  const reason = text(body.reason, { min: 10, max: 500 });
  if (!clubId) throw badRequest('Pick A Valid Club', 'invalid_club');
  if (!status) throw badRequest('Pick Active Or Suspended', 'invalid_status');
  if (!reason) throw badRequest('Give A Reason Of At Least 10 Characters', 'invalid_reason');
  const beforeResult = await db.from('clubs').select('id, name, status').eq('id', clubId).maybeSingle();
  if (beforeResult.error) throw mapDbError(beforeResult.error, 'That Club', { route: 'horses.floor-admin' });
  if (!beforeResult.data) throw notFound('That Club Was Not Found');
  if (!CLUB_STATUSES.includes(beforeResult.data.status)) {
    throw new ApiError(409, 'A Terminal Or Deleted Club Cannot Be Reactivated From Stable Admin', 'club_terminal');
  }
  const result = await db.from('clubs').update({ status, updated_at: new Date().toISOString() })
    .eq('id', clubId).eq('status', beforeResult.data.status).select('id, name, status').maybeSingle();
  if (result.error) throw mapDbError(result.error, 'That Club', { route: 'horses.floor-admin' });
  if (!result.data) throw new ApiError(409, 'That Club Changed. Reload Before Trying Again', 'club_changed');
  const audit = await auditOperatorAction(op, req, {
    action: 'club.set_status', targetType: 'club', targetId: clubId,
    before: { status: beforeResult.data.status, name: beforeResult.data.name },
    after: { status: result.data.status }, details: { reason },
  });
  return { action: 'set_club_status', club: result.data, reason, auditRecorded: audit?.ok === true,
    disclosure: status === 'suspended' ? 'The Club Is Suspended. Existing Tables Were Not Closed.' : 'The Club Is Active. No Table Was Opened.' };
}

async function fundClub(db, op, req, res, body) {
  if (!hasPermission(op?.permissions, PERMISSIONS.MONEY_WRITE)) throw forbidden(`Permission Required: ${PERMISSIONS.MONEY_WRITE}`, 'permission_denied');
  const clubId = uuid(body.clubId);
  const amount = money2dp(body.amount);
  const reason = text(body.reason, { min: 10, max: 500 });
  const opId = uuid(body.opId);
  if (!clubId) throw badRequest('Pick A Valid Club', 'invalid_club');
  if (amount === null) throw badRequest('Enter A Positive Amount With No More Than Two Decimal Places', 'invalid_amount');
  if (!reason) throw badRequest('Give A Reason Of At Least 10 Characters', 'invalid_reason');
  if (!opId) throw badRequest('A Secure Operation Identifier Is Required', 'invalid_operation_id');

  const clubResult = await db.from('clubs').select('id, name, status, chip_treasury').eq('id', clubId).maybeSingle();
  if (clubResult.error) throw mapDbError(clubResult.error, 'That Club', { route: 'horses.floor-admin' });
  if (!clubResult.data) throw notFound('That Club Was Not Found');
  if (!CLUB_STATUSES.includes(clubResult.data.status)) {
    throw new ApiError(409, 'A Terminal Or Deleted Club Cannot Be Funded From Stable Admin', 'club_terminal');
  }
  const approval = await requireApproval(op, req, {
    kind: 'fund_club', amount, asset: 'chips', targetType: 'club', targetId: clubId,
    reason, opId, payload: { clubId, amount, reason, opId },
  });
  if (approval.required) {
    await auditOperatorAction(op, req, {
      action: 'club.fund_request_approval', targetType: 'club', targetId: clubId,
      before: { chip_treasury: clubResult.data.chip_treasury ?? null },
      after: { status: approval.status, approval_id: approval.approvalId },
      details: { amount, reason, op_id: opId, threshold: approval.threshold },
    });
    return approvalPendingResponse(res, approval, { requestId: op.requestId,
      message: 'Sent For Approval. Another Operator Must Approve This Before Anything Moves',
      extra: { clubId, amount, opId } });
  }

  const result = await db.rpc('fn_ca_fund_club', {
    p_club_id: clubId, p_amount: amount, p_reason: reason, p_idempotency_key: opId,
  });
  if (result.error) {
    console.error('[horses.floor-admin] fund_club outcome unknown:', result.error.message);
    await auditOperatorAction(op, req, {
      action: 'club.fund_unknown_outcome', targetType: 'club', targetId: clubId,
      before: { chip_treasury: clubResult.data.chip_treasury ?? null }, after: { status: 'unknown_outcome' },
      details: { amount, reason, op_id: opId, approval_id: approval.approvalId },
    });
    throw new ApiError(503, 'The Outcome Is Unknown. Check The Club Ledger Before Retrying', 'fund_unknown_outcome');
  }
  if (!result.data || result.data.ok !== true) {
    const code = typeof result.data?.reason === 'string' ? result.data.reason : 'fund_refused';
    await markApprovalExecuted(op, approval.approvalId, { ok: false, error: code }, { status: 'failed' });
    throw new ApiError(409, `Club Funding Refused: ${code}`, code);
  }
  const mark = await markApprovalExecuted(op, approval.approvalId, result.data);
  const trailClosed = mark.ok === true;
  const audit = await auditOperatorAction(op, req, {
    action: 'club.fund', targetType: 'club', targetId: clubId,
    before: { chip_treasury: result.data.balance_before ?? clubResult.data.chip_treasury ?? null },
    after: { chip_treasury: result.data.balance_after ?? null, replayed: result.data.replayed === true },
    details: { amount, reason, op_id: opId, approval_id: approval.approvalId,
      trail_closed: trailClosed, mark_executed_refused: mark.refused === true, mark_executed_reason: mark.reason ?? null },
  });
  return { action: 'fund_club', clubId, amount, opId, funded: true, replayed: result.data.replayed === true,
    balanceAfter: result.data.balance_after ?? null, approvalId: approval.approvalId,
    approvalStatus: trailClosed ? 'executed' : approval.status, trailClosed, auditRecorded: audit?.ok === true };
}

async function decideChipRequest(db, op, req, res, body) {
  if (!hasPermission(op?.permissions, PERMISSIONS.CASHIER_WRITE)) throw forbidden(`Permission Required: ${PERMISSIONS.CASHIER_WRITE}`, 'permission_denied');
  const requestId = uuid(body.requestId);
  const decision = enumOf(body.decision, ['approve', 'deny']);
  if (!requestId) throw badRequest('Pick A Valid Chip Request', 'invalid_chip_request');
  if (!decision) throw badRequest('Pick Approve Or Deny', 'invalid_chip_decision');

  const beforeResult = await db.from('chip_requests')
    .select('id, club_id, requester_id, amount, status, responded_by, responded_at, op_id')
    .eq('id', requestId).maybeSingle();
  if (beforeResult.error) throw mapDbError(beforeResult.error, 'That Chip Request', { route: 'horses.floor-admin' });
  if (!beforeResult.data) throw notFound('That Chip Request Was Not Found');
  const before = beforeResult.data;
  const amount = money2dp(before.amount);
  const opId = uuid(before.op_id);
  if (amount === null || !opId) throw new ApiError(409, 'That Chip Request Has No Safe Amount Or Idempotency Key', 'chip_request_not_decidable');

  const approvalKind = decision === 'approve' ? 'fund_club' : 'cashout';
  if (decision === 'approve' && requiresApproval(op?.policy, 'fund_club', amount).required
      && !hasPermission(op?.permissions, PERMISSIONS.MONEY_WRITE)) {
    throw forbidden(`Permission Required At The Fund Threshold: ${PERMISSIONS.MONEY_WRITE}`, 'permission_denied');
  }
  const reason = decision === 'approve'
    ? `Approved chip request ${requestId}`
    : `Denied chip request ${requestId}`;
  const approval = await requireApproval(op, req, {
    kind: approvalKind,
    amount,
    asset: 'chips',
    targetType: 'chip_request',
    targetId: requestId,
    reason,
    opId,
    payload: decision === 'approve'
      ? { action: 'fund_club', clubId: before.club_id, amount, reason, opId, chipRequestId: requestId, actorId: op.user.id }
      : { action: 'cashout', chipRequestId: requestId, decision, amount, opId },
  });
  if (approval.required) {
    await auditOperatorAction(op, req, {
      action: 'chip_request.decision_pending', targetType: 'chip_request', targetId: requestId,
      before: { status: before.status, amount: before.amount, club_id: before.club_id },
      after: { status: 'pending_approval', decision, approval_id: approval.approvalId },
      details: { decision, amount, op_id: opId, approval_kind: approvalKind, threshold: approval.threshold },
    });
    return approvalPendingResponse(res, approval, {
      requestId: op.requestId,
      message: 'Sent For Approval. The Chip Request Is Still Pending And No Chips Moved',
      extra: { chipRequestId: requestId, decision },
    });
  }

  const result = await db.rpc('fn_ca_operator_decide_chip_request', {
    p_request_id: requestId,
    p_action: decision,
    p_actor_id: op.user.id,
    p_expected_op_id: opId,
    p_expected_amount: amount,
  });
  if (result.error || !result.data) {
    console.error('[horses.floor-admin] chip request outcome unknown:', result.error?.message || 'no receipt');
    await auditOperatorAction(op, req, {
      action: 'chip_request.unknown_outcome', targetType: 'chip_request', targetId: requestId,
      before: { status: before.status, amount: before.amount, club_id: before.club_id },
      after: { status: 'unknown_outcome' },
      details: { decision, amount, op_id: opId, approval_id: approval.approvalId },
    });
    throw new ApiError(503, 'The Outcome Is Unknown. Reload The Request And Club Ledger Before Retrying', 'chip_request_unknown_outcome');
  }
  if (result.data.ok !== true) {
    const code = typeof result.data.reason === 'string' ? result.data.reason : 'chip_request_refused';
    await markApprovalExecuted(op, approval.approvalId, result.data, { status: 'failed' });
    await auditOperatorAction(op, req, {
      action: 'chip_request.refused', targetType: 'chip_request', targetId: requestId,
      before: { status: before.status, amount: before.amount, club_id: before.club_id },
      after: { status: result.data.status || before.status },
      details: { decision, amount, op_id: opId, reason: code, approval_id: approval.approvalId },
    });
    throw new ApiError(409, `Chip Request Decision Refused: ${code}`, code);
  }

  const mark = await markApprovalExecuted(op, approval.approvalId, result.data);
  const audit = await auditOperatorAction(op, req, {
    action: `chip_request.${decision === 'approve' ? 'approve' : 'deny'}`,
    targetType: 'chip_request', targetId: requestId,
    before: { status: before.status, amount: before.amount, club_id: before.club_id },
    after: { status: result.data.status, replayed: result.data.replayed === true },
    details: { decision, amount, op_id: opId, approval_id: approval.approvalId,
      trail_closed: mark.ok === true, mark_executed_refused: mark.refused === true },
  });
  return { action: 'decide_chip_request', chipRequestId: requestId, decision,
    status: result.data.status, replayed: result.data.replayed === true,
    approvalId: approval.approvalId, trailClosed: mark.ok === true, auditRecorded: audit?.ok === true };
}

export async function handleFloorAdmin({ op, db, query, requestId, method = 'GET', req, res, body = {} }) {
  if (method === 'POST') {
    if (body.action === 'set_club_status') return setClubStatus(db, op, req, body);
    if (body.action === 'fund_club') return fundClub(db, op, req, res, body);
    if (body.action === 'decide_chip_request') return decideChipRequest(db, op, req, res, body);
    if (body.action === 'record_export_prepared') return recordCompletedExport(op, req, body);
    throw badRequest('Unknown Action', 'unknown_action');
  }
  const section = enumOf(query.section, FLOOR_ADMIN_SECTIONS) || 'floor';
  requireSectionPermission(op, section);
  if (section === 'floor') return sectionFloor(db, query, requestId);
  if (section === 'table') return sectionTable(db, query, requestId);
  if (section === 'tournaments') return sectionTournaments(db, op, query, requestId);
  if (section === 'event') return sectionEvent(db, op, query, requestId);
  if (section === 'clubs') return sectionClubs(db, query, requestId);
  if (section === 'club') return sectionClub(db, query, requestId);
  if (section === 'unions') return sectionUnions(db, query, requestId);
  if (section === 'union') return sectionUnion(db, op, query, requestId);
  if (section === 'cashouts') return queueSection(db, query, requestId, 'cashouts');
  if (section === 'chip_requests') return queueSection(db, query, requestId, 'chip_requests');
  if (section === 'rake') return sectionRake(db, query, requestId);
  return sectionAnnouncements(db, query, requestId);
}

export const floorAdminSpec = Object.freeze({
  name: 'horses.floor-admin',
  methods: ['GET', 'POST'],
  permission: { GET: PERMISSIONS.CONSOLE_READ, POST: PERMISSIONS.CONSOLE_READ },
  limit: { GET: 'read', POST: 'write' },
  durable: { POST: { max: 20, windowSeconds: 60 } },
});

export default withOperatorRoute(floorAdminSpec, handleFloorAdmin);
