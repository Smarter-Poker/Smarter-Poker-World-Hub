/** Stable Admin economy and finance reporting with durable Phase 11 records. */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, forbidden } from '../../../src/lib/horses/apiEnvelope.js';
import { enumOf, int, text, uuid } from '../../../src/lib/horses/validate.js';
import { fetchAll, paging, runPaged, pagedResult } from '../../../src/lib/horses/paged.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';

export const ECONOMY_SECTIONS = Object.freeze([
  'supply', 'velocity', 'register', 'treasury', 'conservation', 'drift', 'burnin',
  'rakelaw', 'rakeback', 'leaderboard', 'bbj', 'promotions', 'abuse', 'close',
  'digest', 'pnl', 'invoices', 'jobs', 'exports',
]);
export const ECONOMY_ACTIONS = Object.freeze(['record_export_prepared', 'record_pnl_snapshot', 'sign_daily_close']);
const PAGE = { defaultLimit: 50, max: 200 };

function fail(error, sentence, code) {
  if (!error) return;
  console.error(`[horses.economy-admin] ${code}:`, error.message);
  throw new ApiError(503, sentence, code);
}

function sumDecimal(rows, key) {
  let cents = 0n;
  for (const row of rows || []) {
    const raw = String(row?.[key] ?? '0').trim();
    const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!match) continue;
    const fraction = `${match[3] || ''}00`.slice(0, 2);
    const value = BigInt(match[2]) * 100n + BigInt(fraction);
    cents += match[1] ? -value : value;
  }
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function sourceState(result, ready, unavailable) {
  return result?.error ? unavailable : ready;
}

async function pgCronEvidence() {
  return {
    state: 'jobs.pg_cron_unknown',
    jobs: [],
    disclosure: 'Pg Cron Evidence Is Not Exposed Through The Application Data API. Its Fourteen-Day History Cannot Be Claimed Here',
  };
}

async function attachRakeAuditTerms(db, rows) {
  const handIds = [...new Set((rows || []).map((row) => uuid(row?.metadata?.hand_id)).filter(Boolean))];
  if (!handIds.length) {
    return { rows: (rows || []).map((row) => ({ ...row, seat_count_in_force: null, max_rake_cap_in_force: null })), state: 'rakelaw.audit_terms_absent' };
  }
  const terms = await db.from('rake_records')
    .select('hand_id,seat_count_in_force,max_rake_cap_in_force')
    .in('hand_id', handIds);
  if (terms.error) {
    return { rows: (rows || []).map((row) => ({ ...row, seat_count_in_force: null, max_rake_cap_in_force: null })), state: 'rakelaw.audit_terms_unknown' };
  }
  const byHand = new Map((terms.data || []).map((row) => [row.hand_id, row]));
  return {
    state: 'rakelaw.audit_terms_read',
    rows: (rows || []).map((row) => {
      const term = byHand.get(uuid(row?.metadata?.hand_id));
      return {
        ...row,
        seat_count_in_force: term?.seat_count_in_force ?? null,
        max_rake_cap_in_force: term?.max_rake_cap_in_force ?? null,
      };
    }),
  };
}

async function supply(db) {
  const [snap, coverage, gaps, trend] = await Promise.all([
    db.from('ca_supply_snapshots').select('*').order('id', { ascending: false }).limit(2),
    db.from('ca_chip_store_coverage').select('store,treatment,counted_by,notes,added_at').order('store'),
    db.rpc('fn_ca_chip_store_coverage_gaps'),
    db.from('ca_supply_snapshots').select('id,taken_at,total,unexplained,basis_version').order('taken_at', { ascending: false }).limit(1001),
  ]);
  fail(snap.error, 'The Supply Meter Could Not Be Read', 'supply_unavailable');
  fail(coverage.error, 'Supply Coverage Could Not Be Read', 'supply_coverage_unavailable');
  const shapeSnapshot = (row) => row ? {
    ...row,
    basis: row.basis_version || null,
    stores: {
      member_wallets: row.member_wallets,
      member_promo: row.member_promo,
      felt: row.felt,
      treasuries: row.treasuries,
      chip_pools: row.chip_pools,
      club_wallets: row.club_wallets,
      union_wallets: row.union_wallets,
      agent_wallets: row.agent_wallets,
      bbj_pools: row.bbj_pools,
      spin_pools: row.spin_pools,
      tournament_liability: row.tournament_liability,
      leaderboard_liability: row.leaderboard_liability,
      cert_wallets: row.cert_wallets,
      club_promo: row.club_promo,
      club_insurance: row.club_insurance,
      agent_promo: row.agent_promo,
      ticket_escrow: row.ticket_escrow,
      pending_addons: row.pending_addons,
    },
  } : null;
  const trendRows = (trend.data || []).slice(0, 1000);
  return {
    state: snap.data?.length ? (gaps.error ? 'supply.partial' : gaps.data?.length ? 'supply.gap_uncovered' : 'supply.ready') : 'supply.unknown',
    snapshot: shapeSnapshot(snap.data?.[0]),
    previous: shapeSnapshot(snap.data?.[1]),
    coverage: coverage.data || [],
    coverageGaps: gaps.error ? null : gaps.data || [],
    coverageGapState: gaps.error ? 'supply.gaps_unknown' : gaps.data?.length ? 'supply.gap_uncovered' : 'supply.gaps_covered',
    trend: trend.error ? null : trendRows,
    trendTruncated: !trend.error && (trend.data || []).length > 1000,
    trendState: trend.error ? 'supply.trend_unknown' : 'supply.trend_ready',
    disclosure: 'The Supply Meter Is A Snapshot And Is Not Tamper-Evident',
  };
}

async function velocity(db, query) {
  const hours = Math.min(720, Math.max(1, int(query.hours, { fallback: 24, min: 1, max: 720 })));
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const cap = 10000;
  const result = await db.from('chip_ledger').select('amount,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(cap + 1);
  fail(result.error, 'Chip Velocity Could Not Be Read', 'velocity_unavailable');
  const rows = result.data || [];
  const truncated = rows.length > cap;
  const included = rows.slice(0, cap);
  return { state: truncated ? 'velocity.truncated' : 'velocity.ready', hours, rowCount: included.length, amount: sumDecimal(included, 'amount'), truncated, cap, since };
}

async function register(db, query) {
  const page = paging(query, PAGE);
  const [rows, reconciliation, approvals, audit] = await Promise.all([
    runPaged(db.from('ca_mint_ledger').select('*', { count: 'exact' }).order('created_at', { ascending: false }), page),
    db.rpc('fn_ca_mint_register_vs_supply'),
    db.from('ca_operator_approvals').select('id', { count: 'exact', head: true }),
    db.from('admin_audit_log').select('id', { count: 'exact', head: true }).in('action', ['mint', 'burn', 'chips.mint', 'chips.burn']),
  ]);
  fail(rows.error, 'The Issuance Register Could Not Be Read', 'register_unavailable');
  fail(reconciliation.error, 'The Register Reconciliation Could Not Be Read', 'register_reconciliation_unavailable');
  return { ...pagedResult(rows, page), reconciliation: reconciliation.data || null, approvalCount: approvals.error ? null : approvals.count, auditCount: audit.error ? null : audit.count, auditState: audit.error ? 'mint.audit_unknown' : audit.count === 0 ? 'mint.no_audit_trail' : 'mint.audit_present', disclosure: approvals.error ? 'Issuance Approval Coverage Is Unknown' : approvals.count === 0 ? 'Approvals Have Never Been Enabled For Money On This Platform' : 'Approval Rows Exist. Review Their Outcomes Before Relying On Coverage', unregisteredPaths: null, grantState: 'unknown' };
}

async function treasury(db) {
  const result = await db.rpc('fn_ca_treasury_positions');
  fail(result.error, 'Treasury Positions Could Not Be Read', 'treasury_unavailable');
  return { state: 'treasury.ready', rows: Array.isArray(result.data) ? result.data : result.data ? [result.data] : [], disclosure: 'Stored Treasury Balances Are Mutable Columns. Ledger Values Are Shown Beside Them' };
}

async function conservation(db) {
  const result = await db.rpc('fn_ca_mint_register_vs_supply');
  fail(result.error, 'Conservation Could Not Be Read', 'conservation_unavailable');
  return { state: result.data ? 'conservation.measured' : 'conservation.unknown', operands: result.data || null };
}

async function drift(db, query) {
  const page = paging(query, PAGE);
  const [metrics, incidents, health, alerts, reconcile, clubProfit] = await Promise.all([
    db.rpc('fn_ca_drift_metrics'),
    runPaged(db.from('ca_drift_incidents').select('*', { count: 'exact' }).order('detected_at', { ascending: false }), page),
    db.from('financial_health_checks').select('*').order('created_at', { ascending: false }).limit(1),
    db.from('financial_alerts').select('*', { count: 'exact' }).is('resolved_at', null).limit(50),
    db.from('ledger_reconcile_log').select('id,run_date,run_ts,entity_type,entity_id,ledger_balance,stored_balance,drift,metadata,notes,created_at').eq('entity_type', 'chip_circulation').order('created_at', { ascending: false }).limit(20),
    db.from('club_profit_reconcile_log').select('*').order('ran_at', { ascending: false }).limit(20),
  ]);
  fail(metrics.error, 'Drift Metrics Could Not Be Read', 'drift_unavailable');
  fail(incidents.error, 'Drift Incidents Could Not Be Read', 'drift_incidents_unavailable');
  const healthRow = health.error ? null : health.data?.[0] || null;
  const healthAt = healthRow?.created_at ? new Date(healthRow.created_at).getTime() : NaN;
  const healthState = health.error ? 'health.unknown' : !healthRow ? 'health.never_recorded' : Date.now() - healthAt > 48 * 3600000 ? 'health.dead_source' : 'health.recorded';
  return {
    state: 'drift.ready',
    metrics: metrics.data || null,
    incidents: pagedResult(incidents, page),
    health: healthRow,
    healthState,
    unresolvedAlerts: alerts.error ? null : alerts.count,
    alertsState: sourceState(alerts, 'alerts.recorded', 'alerts.unknown'),
    reconciliation: reconcile.error ? null : reconcile.data || [],
    reconciliationState: sourceState(reconcile, 'reconcile.disclosed', 'reconcile.unknown'),
    clubProfitReconciliation: clubProfit.error ? null : clubProfit.data || [],
    clubProfitReconciliationState: sourceState(clubProfit, 'reconcile.recorded', 'reconcile.unknown'),
    reconciliationDisclosure: 'Chip Circulation Rows Compare Different Quantities. Their Stored Severity Is Not A Verdict',
  };
}

async function burnin(db, query) {
  const hours = Math.min(168, Math.max(1, int(query.hours, { fallback: 24, min: 1, max: 168 })));
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const [openCriticals, newCriticals, unresolvedUnknowns, suspense, writeFailures, mintIncidents, failedSettlements, stuckSettlements, chain, guards, rpcDetector, supplySnapshot, conservationAlerts] = await Promise.all([
    db.from('ca_drift_incidents').select('id', { count: 'exact', head: true }).neq('status', 'resolved').eq('severity', 'critical'),
    db.from('ca_drift_incidents').select('id', { count: 'exact', head: true }).eq('severity', 'critical').gt('detected_at', since),
    db.from('ca_drift_incidents').select('id', { count: 'exact', head: true }).neq('status', 'resolved').eq('classification', 'unknown').neq('severity', 'info'),
    db.from('chip_ledger').select('amount,from_type,to_type').or('from_type.eq.settlement_suspense,to_type.eq.settlement_suspense').gt('created_at', since).limit(10001),
    db.from('ca_ledger_write_failures').select('id', { count: 'exact', head: true }).gt('occurred_at', since),
    db.from('ca_drift_incidents').select('id', { count: 'exact', head: true }).like('dedupe_key', 'tourney-cashout-blocked:%').gt('detected_at', since).neq('status', 'resolved'),
    db.from('ca_settlements').select('id', { count: 'exact', head: true }).eq('state', 'failed').gt('updated_at', since),
    db.from('ca_settlements').select('id', { count: 'exact', head: true }).not('state', 'in', '(final,failed)').lt('updated_at', new Date(Date.now() - 10 * 60000).toISOString()).gt('updated_at', since),
    db.rpc('fn_ca_verify_ledger_chain', { p_limit: 50000 }),
    db.from('ca_guard_inventory').select('id', { count: 'exact', head: true }).eq('active', true),
    db.from('ca_detector_runs').select('ran_at,detail').eq('detector', 'fn_ca_money_rpc_drift').order('ran_at', { ascending: false }).limit(1),
    db.from('ca_supply_snapshots').select('unexplained,taken_at').order('taken_at', { ascending: false }).limit(1),
    db.from('financial_alerts').select('id', { count: 'exact', head: true }).in('source', ['fn_tournament_chip_conservation_check', 'fn_spin_chip_conservation_check']).gt('created_at', since),
  ]);
  const required = [openCriticals, newCriticals, unresolvedUnknowns, suspense, writeFailures, mintIncidents, failedSettlements, stuckSettlements, chain, supplySnapshot, conservationAlerts];
  if (required.some((value) => value.error)) throw new ApiError(503, 'The Burn-In Evidence Could Not Be Read', 'burnin_unavailable');
  const suspenseRows = (suspense.data || []).slice(0, 10000);
  const suspenseTruncated = (suspense.data || []).length > 10000;
  const suspenseAmount = suspenseRows.reduce((sum, row) => sum + (row.to_type === 'settlement_suspense' ? Number(row.amount) || 0 : -(Number(row.amount) || 0)), 0);
  const chainRow = Array.isArray(chain.data) ? chain.data[0] : chain.data;
  const supplyRow = supplySnapshot.data?.[0] || null;
  const detectorRow = rpcDetector.error ? null : rpcDetector.data?.[0] || null;
  const detectorFindings = Number(detectorRow?.detail?.with_findings);
  const check = (name, pass, value, evidence = 'live_read') => ({ name, pass, value, evidence });
  const checks = [
    check('No Open Critical Incidents', openCriticals.count === 0, openCriticals.count),
    check('No New Criticals In Window', newCriticals.count === 0, newCriticals.count),
    check('No Unresolved Unknowns', unresolvedUnknowns.count === 0, unresolvedUnknowns.count),
    check('Zero Suspense Flow', suspenseTruncated ? null : Math.abs(suspenseAmount) < 0.005, suspenseTruncated ? 'Unknown, Row Cap Reached' : suspenseAmount.toFixed(2)),
    check('Zero Ledger Write Failures', writeFailures.count === 0, writeFailures.count),
    check('Zero Blocked Tournament Mints', mintIncidents.count === 0, mintIncidents.count),
    check('No Failed Or Stuck Settlements', failedSettlements.count === 0 && stuckSettlements.count === 0, `${failedSettlements.count || 0} Failed, ${stuckSettlements.count || 0} Stuck`),
    check('Ledger Chain Clean', Number(chainRow?.breaks) === 0, `${chainRow?.breaks ?? 'Unknown'} Breaks Across ${chainRow?.checked ?? 'Unknown'} Rows`),
    check('All Structural Guards Present', null, guards.error ? 'Unknown' : `${guards.count ?? 'Unknown'} Active Inventory Rows`, 'inventory_only'),
    check('No Unregistered Money RPCs', Number.isFinite(detectorFindings) ? detectorFindings === 0 : null, Number.isFinite(detectorFindings) ? detectorFindings : 'No Detector Evidence', detectorRow?.ran_at || 'never_run'),
    check('Last Supply Snapshot Explained', supplyRow ? Math.abs(Number(supplyRow.unexplained) || 0) <= 100 : null, supplyRow?.unexplained ?? 'Unknown', supplyRow?.taken_at || 'no_snapshot'),
    check('Play Chip Conservation Clean', conservationAlerts.count === 0, conservationAlerts.count),
  ];
  const knownChecks = checks.filter((item) => item.pass !== null);
  const pass = knownChecks.some((item) => item.pass === false) ? false : knownChecks.length === checks.length ? true : null;
  return { state: pass === true ? 'burnin.pass' : pass === false ? 'burnin.fail' : 'burnin.unknown', hours, result: { pass, gate: pass === true ? 'PASS' : pass === false ? 'FAIL' : 'UNKNOWN', checks, checked_at: new Date().toISOString() }, restartAvailable: false, disclosure: 'This Is A Read-Only Reconstruction. Inventory-Only Evidence Stays Unknown Instead Of Running A Detector That Writes Incidents' };
}

async function rakeLaw(db, query) {
  const page = paging(query, PAGE);
  const [law, findings, allFindings] = await Promise.all([
    db.from('ca_rake_rules').select('*').order('id').limit(1),
    runPaged(db.from('ledger_reconcile_log').select('*', { count: 'exact' }).eq('entity_type', 'rake_law').order('created_at', { ascending: false }), page),
    fetchAll(() => db.from('ledger_reconcile_log').select('severity,metadata,stored_balance,ledger_balance,created_at').eq('entity_type', 'rake_law').order('created_at', { ascending: false }), { maxRows: 20000 }),
  ]);
  fail(law.error, 'The Rake Law Could Not Be Read', 'rake_law_unavailable');
  fail(findings.error, 'Rake Law Findings Could Not Be Read', 'rake_findings_unavailable');
  const terms = await attachRakeAuditTerms(db, findings.data || []);
  const shaped = pagedResult({ ...findings, data: terms.rows }, page);
  const kindOf = (row) => row?.finding || row?.kind || row?.metadata?.finding || row?.metadata?.kind || row?.metadata?.violation_type || null;
  const counts = { under_spec: 0, over_spec: 0, warnings: 0 };
  for (const row of allFindings.rows || []) {
    const kind = kindOf(row);
    if (kind === 'under_spec') counts.under_spec += 1;
    else if (kind === 'over_spec') counts.over_spec += 1;
    else counts.warnings += 1;
  }
  const lastFindingAt = allFindings.rows?.[0]?.created_at || null;
  const ageMs = lastFindingAt ? Date.now() - new Date(lastFindingAt).getTime() : null;
  const freshnessState = !lastFindingAt ? 'rakelaw.never_run' : Number.isFinite(ageMs) && ageMs > 2 * 3600000 ? 'rakelaw.stale' : 'rakelaw.fresh';
  return {
    state: allFindings.error ? 'rakelaw.partial' : counts.under_spec + counts.over_spec > 0 ? 'rakelaw.findings_open' : 'rakelaw.ready',
    law: law.data?.[0] || null,
    findings: shaped,
    auditTermsState: terms.state,
    counts,
    countsTruncated: allFindings.truncated,
    overSpec: allFindings.error ? null : counts.over_spec,
    lastFindingAt,
    freshnessState,
    disclosure: 'Findings Without Recorded Seat And Cap Values Were Recomputed From Today\'s Table Configuration',
  };
}

async function rakeback(db, query) {
  const page = paging(query, PAGE);
  const [periodPage, allPeriods, allPending, payouts, runs] = await Promise.all([
    runPaged(db.from('rakeback_periods').select('*', { count: 'exact' }).order('period_end', { ascending: false }), page),
    fetchAll(() => db.from('rakeback_periods').select('status,rakeback_amount,period_end').order('period_end', { ascending: false }), { maxRows: 20000 }),
    fetchAll(() => db.from('rakeback_periods').select('rakeback_amount').eq('status', 'pending'), { maxRows: 20000 }),
    db.from('rakeback_period_payouts').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('cron_execution_log').select('*').eq('job_name', '/cron/rakeback-period-settle').order('started_at', { ascending: false }).limit(20),
  ]);
  fail(periodPage.error, 'Rakeback Periods Could Not Be Read', 'rakeback_unavailable');
  fail(allPending.error, 'Pending Rakeback Could Not Be Totalled', 'rakeback_pending_unavailable');
  const statusSummary = {};
  for (const row of allPeriods.rows || []) {
    const status = row.status || 'unknown';
    if (!statusSummary[status]) statusSummary[status] = { count: 0, amount: '0.00' };
    statusSummary[status].count += 1;
  }
  for (const status of Object.keys(statusSummary)) {
    statusSummary[status].amount = sumDecimal((allPeriods.rows || []).filter((row) => (row.status || 'unknown') === status), 'rakeback_amount');
  }
  const lastRun = runs.error ? null : runs.data?.[0] || null;
  const lastRunAt = lastRun?.finished_at || lastRun?.started_at || null;
  const runAge = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : null;
  const runState = runs.error ? 'rakeback.run_unknown' : !lastRunAt ? 'rakeback.run_never_recorded' : runAge > 8 * 86400000 ? 'rakeback.run_missed' : 'rakeback.run_recorded';
  return {
    state: runState === 'rakeback.run_missed' ? runState : 'rakeback.ready',
    periods: pagedResult(periodPage, page),
    statusSummary: allPeriods.error ? null : statusSummary,
    statusSummaryTruncated: allPeriods.truncated,
    pendingCount: allPending.rows.length,
    pendingAmount: sumDecimal(allPending.rows, 'rakeback_amount'),
    pendingTruncated: allPending.truncated,
    payouts: payouts.error ? null : payouts.data || [],
    payoutState: sourceState(payouts, 'rakeback.payouts_recorded', 'rakeback.payouts_unknown'),
    runs: runs.error ? null : runs.data || [],
    runState,
    lastRunAt,
    recordState: 'rakeback.record_mutable',
    disclosure: 'Pending Means Recorded As Pending. It Does Not Mean Owed, Due Or Scheduled',
  };
}

async function leaderboard(db) {
  const [payouts, batches, cron] = await Promise.all([
    db.from('leaderboard_payouts').select('*').order('awarded_at', { ascending: false }).limit(100),
    db.from('leaderboard_payout_batches').select('*').order('settled_at', { ascending: false }).limit(50),
    pgCronEvidence(db, ['leaderboard-payout-waterfall-daily']),
  ]);
  fail(payouts.error, 'Leaderboard Payouts Could Not Be Read', 'leaderboard_unavailable');
  return {
    state: batches.error ? 'leaderboard.partial' : 'leaderboard.unguarded',
    payouts: payouts.data || [],
    batches: batches.error ? null : batches.data || [],
    batchState: sourceState(batches, 'leaderboard.batches_recorded', 'leaderboard.batches_unknown'),
    scheduler: cron,
    mutabilityState: 'leaderboard.unguarded',
    disclosure: 'Leaderboard Payout Rows Are Mutable And Ledger Category Is Not Used To Compute Totals',
  };
}

async function bbj(db, query) {
  const page = paging(query, PAGE);
  const [pools, payouts, contributions, law] = await Promise.all([
    db.from('bbj_pools').select('*').order('created_at', { ascending: false }),
    runPaged(db.from('bbj_payouts').select('*', { count: 'exact' }).order('created_at', { ascending: false }), page),
    db.from('bbj_contributions').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('ca_rake_rules').select('bbj_min_players_dealt').order('id').limit(1),
  ]);
  fail(pools.error, 'Bad Beat Jackpot Pools Could Not Be Read', 'bbj_unavailable');
  return {
    state: payouts.error || contributions.error || law.error ? 'bbj.partial' : 'bbj.ready',
    pools: pools.data || [],
    payouts: payouts.error ? null : pagedResult(payouts, page),
    payoutState: sourceState(payouts, 'bbj.payouts_recorded', 'bbj.payouts_unknown'),
    contributions: contributions.error ? null : contributions.data || [],
    contributionState: sourceState(contributions, 'bbj.contributions_recorded', 'bbj.contributions_unknown'),
    minimumPlayersDealt: law.error ? null : law.data?.[0]?.bbj_min_players_dealt ?? null,
    disclosure: 'Main And Backup Pools Are Separate Positions And Are Never Added Together',
  };
}

async function promotions(db, query) {
  const page = paging(query, PAGE);
  const awards = await runPaged(db.from('commander_promotion_awards').select('*', { count: 'exact' }).order('created_at', { ascending: false }), page);
  fail(awards.error, 'Promotion Awards Could Not Be Read', 'promotions_unavailable');
  return { state: 'promotions.ready', ...pagedResult(awards, page), disclosure: 'Promotion Awards Are Read-Only Here' };
}

async function abuse(db) {
  const [abuseRows, signupRows] = await Promise.all([
    db.from('abuse_logs').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('signup_abuse_log').select('id,user_id,signup_count,welcome_package_granted,deleted_account_count,first_signup_at,last_signup_at,last_deleted_at,abuse_flags,notes').order('last_signup_at', { ascending: false }).limit(100),
  ]);
  return {
    state: abuseRows.error && signupRows.error ? 'abuse.unknown' : 'abuse.detector_never_fired',
    abuseLogs: abuseRows.error ? null : abuseRows.data || [],
    abuseLogState: sourceState(abuseRows, 'abuse.rows_read', 'abuse.rows_unknown'),
    signupLogs: signupRows.error ? null : signupRows.data || [],
    signupLogState: sourceState(signupRows, 'abuse.signup_rows_read', 'abuse.signup_rows_unknown'),
    lastRun: null,
    disclosure: 'Zero Rows Does Not Prove That No Abuse Occurred. Detector Liveness Is Unknown',
  };
}

async function close(db) {
  const [manifests, restatements, closes, epochs] = await Promise.all([
    db.from('ca_ledger_day_manifests').select('*').order('day', { ascending: true }).limit(1000),
    db.from('ca_ledger_day_manifest_restatements').select('*').order('restated_at', { ascending: false }).limit(100),
    db.from('ca_daily_closes').select('id,close_day,manifest_sha256,manifest_row_count,manifest_net_amount,exceptions,signed_by,signed_at,op_id,approval_id,request_id', { count: 'exact' }).order('close_day', { ascending: false }).limit(1000),
    db.from('ca_financial_epochs').select('*').order('id', { ascending: false }).limit(10),
  ]);
  fail(manifests.error, 'Manifest Coverage Could Not Be Read', 'manifest_unavailable');
  const lastDay = manifests.data?.at(-1)?.day || new Date().toISOString().slice(0, 10);
  const firstDay = manifests.data?.[0]?.day || lastDay;
  return {
    state: closes.error ? 'close.signature_state_unknown' : closes.count > 0 ? 'close.signed' : 'close.not_closed',
    manifests: manifests.data || [],
    manifestCount: manifests.data?.length || 0,
    restatements: restatements.error ? null : restatements.data || [],
    restatementState: sourceState(restatements, 'close.restatements_recorded', 'close.restatements_unknown'),
    financialEpochs: epochs.error ? null : epochs.data || [],
    epochState: sourceState(epochs, 'close.epochs_recorded', 'close.epochs_unknown'),
    fromDay: firstDay,
    toDay: lastDay,
    closes: closes.error ? null : closes.data || [],
    signedCount: closes.error ? null : closes.count,
    disclosure: closes.error ? 'Daily Close Signatures Could Not Be Read' : closes.count ? 'Signed Days Bind The Exact Journal Manifest SHA Recorded At Signature Time' : 'No Day Has Been Operator-Signed',
  };
}

async function digest(db) {
  const [durable, result, cron] = await Promise.all([
    db.from('ca_weekly_revenue_digest_runs').select('id,run_key,window_start,window_end,gross_revenue,net_revenue,rake_revenue,recipient_count,scheduler,outcome,figures,first_recorded_at,last_recorded_at').order('window_end', { ascending: false }).limit(100),
    db.from('notifications').select('id,user_id,data,created_at').contains('data', { kind: 'weekly_revenue_digest' }).order('created_at', { ascending: false }).limit(50),
    pgCronEvidence(db, ['ca-revenue-digest-weekly']),
  ]);
  if (durable.error && result.error) return { state: 'digest.unknown', rows: [], disclosure: 'Digest History Could Not Be Read' };
  const rows = result.data || [];
  return {
    state: durable.error ? 'digest.durable_record_unknown' : durable.data?.length ? 'digest.durable_runs' : rows.length ? 'digest.legacy_evidence_only' : 'digest.run_missed',
    runs: durable.error ? null : durable.data || [],
    rows,
    recipientCount: new Set(rows.map((row) => row.user_id).filter(Boolean)).size,
    lastNotificationAt: rows[0]?.created_at || null,
    scheduler: cron,
    disclosure: durable.error ? 'Durable Digest Runs Could Not Be Read. Notification Evidence Is Shown Separately' : 'Digest Run Figures And Recipients Are Durable. Notification Creation Still Does Not Confirm Human Receipt',
  };
}

async function pnl(db, query) {
  const scope = enumOf(query.scope, ['club', 'union']) || 'club';
  const clubId = uuid(query.clubId);
  const unionId = uuid(query.unionId);
  if (scope === 'club' && !clubId) throw badRequest('Pick A Club To Compute Profit And Loss', 'club_required');
  if (scope === 'union' && !unionId) throw badRequest('Pick A Union To Compute Profit And Loss', 'union_required');
  const days = Math.min(366, Math.max(1, int(query.days, { fallback: 30, min: 1, max: 366 })));
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(); fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);
  const from = fromDate.toISOString().slice(0, 10);
  const result = scope === 'union'
    ? await db.rpc('fn_union_pnl_all_clubs', { p_union_id: unionId, p_start: `${from}T00:00:00Z`, p_end: `${to}T23:59:59.999Z`, p_include_horses: true })
    : await db.rpc('fn_ca_fleet_pnl', { p_from: from, p_to: to, p_club_id: clubId });
  const deadSource = await db.from('club_financial_summary').select('*').order('updated_at', { ascending: false }).limit(1);
  fail(result.error, 'Club Profit And Loss Could Not Be Computed', 'pnl_unavailable');
  return {
    state: 'pnl.on_demand_only',
    scope,
    clubId: scope === 'club' ? clubId : null,
    unionId: scope === 'union' ? unionId : null,
    includesHorses: true,
    from,
    to,
    result: result.data || null,
    deadSource: deadSource.error ? null : deadSource.data?.[0] || null,
    deadSourceState: deadSource.error ? 'pnl.dead_source_unknown' : deadSource.data?.length ? 'pnl.dead_source' : 'pnl.dead_source_absent',
    disclosure: 'Computed At Request Time. No Durable Per-Club Profit And Loss Record Exists',
  };
}

async function invoices(db, query) {
  const page = paging(query, PAGE);
  const result = await runPaged(db.from('settlement_invoices').select('*', { count: 'exact' }).order('created_at', { ascending: false }), page);
  fail(result.error, 'Invoices Could Not Be Read', 'invoices_unavailable');
  const invoiceIds = (result.data || []).map((row) => uuid(row.id)).filter(Boolean);
  const deliveries = invoiceIds.length
    ? await db.from('accounting_invoice_deliveries').select('invoice_id,recipient_id,message_id,notification_id,delivered_at,delivery_mode').in('invoice_id', invoiceIds).order('delivered_at', { ascending: false })
    : { data: [], error: null };
  return {
    ...pagedResult(result, page),
    deliveries: deliveries.error ? null : deliveries.data || [],
    deliveryState: deliveries.error ? 'invoice.delivery_unknown' : 'invoice.recorded_not_confirmed',
    refusalCodesState: 'invoice.refusal_codes_not_persisted',
    disclosure: 'A Delivery Row Records An Attempt. It Does Not Confirm Receipt',
  };
}

async function jobs(db) {
  const names = ['/cron/rakeback-period-settle', '/cron/vip-stipend', '/cron/auto-settlement', '/cron/auto-settlement-distribute', '/cron/ledger-reconcile'];
  const [result, pgCron] = await Promise.all([
    db.from('cron_execution_log').select('*').in('job_name', names).order('started_at', { ascending: false }).limit(200),
    pgCronEvidence(db, ['ca-ledger-day-manifest', 'ca-revenue-digest-weekly', 'leaderboard-payout-waterfall-daily', 'club-profit-reconcile', 'ca-settlement-correctness-30m']),
  ]);
  const rows = names.map((jobName) => ({ jobName, scheduler: 'Open Claw', evidence: result.error ? null : (result.data || []).find((row) => row.job_name === jobName) || null }));
  return {
    state: result.error && pgCron.state === 'jobs.pg_cron_unknown' ? 'jobs.unknown' : result.error || pgCron.state !== 'jobs.pg_cron_ready' ? 'jobs.partial' : 'jobs.ready',
    rows,
    openClawState: result.error ? 'jobs.open_claw_unknown' : 'jobs.open_claw_ready',
    pgCron,
    retentionDisclosure: 'Pg Cron History Is Retained For Fourteen Days',
  };
}

async function exportsSection(db, query) {
  const page = paging(query, PAGE);
  const result = await runPaged(db.from('ca_operator_export_jobs')
    .select('id,requester_id,request_id,surface,permission,filters,format,state,row_count,complete,content_sha256,byte_size,error_code,prepared_at,expires_at,op_id', { count: 'exact' })
    .order('prepared_at', { ascending: false }), page);
  fail(result.error, 'Export Receipts Could Not Be Read', 'exports_unavailable');
  return {
    state: 'export.receipts_recorded',
    ...pagedResult(result, page),
    cap: 100000,
    disclosure: 'A Prepared Receipt Binds The Requested Browser File. It Does Not Prove That The Browser Saved Or Delivered It',
  };
}

function objectOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 40));
}

async function recordExportPrepared(db, op, req, body, requestId) {
  const opId = uuid(body.opId);
  const surface = text(body.surface, { max: 80 });
  const rowCount = int(body.rowCount, { min: 0, max: 10000000 });
  const complete = body.complete === true;
  const contentSha256 = typeof body.contentSha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.contentSha256) ? body.contentSha256.toLowerCase() : null;
  const byteSize = int(body.byteSize, { min: 0, max: 1000000000 });
  if (!opId || !surface || rowCount === null || !contentSha256 || byteSize === null) {
    throw badRequest('The Export Receipt Is Incomplete', 'export_receipt_invalid');
  }
  const expected = {
    requester_id: op.user.id, request_id: requestId, surface, permission: PERMISSIONS.MONEY_READ,
    filters: objectOf(body.filters), format: 'csv', state: complete ? 'prepared' : 'truncated',
    row_count: rowCount, complete, content_sha256: contentSha256, byte_size: byteSize, op_id: opId,
  };
  const prior = await db.from('ca_operator_export_jobs').select('*').eq('op_id', opId).maybeSingle();
  fail(prior.error, 'The Export Receipt Could Not Be Checked', 'export_receipt_unavailable');
  let receipt = prior.data;
  if (receipt) {
    const same = receipt.requester_id === expected.requester_id && receipt.surface === surface
      && Number(receipt.row_count) === rowCount && receipt.complete === complete
      && receipt.content_sha256 === contentSha256 && Number(receipt.byte_size) === byteSize;
    if (!same) throw new ApiError(409, 'That Export Key Belongs To A Different File', 'export_op_id_reused');
  } else {
    const inserted = await db.from('ca_operator_export_jobs').insert(expected).select('*').maybeSingle();
    fail(inserted.error, 'The Export Receipt Could Not Be Recorded', 'export_receipt_unavailable');
    if (!inserted.data) throw new ApiError(503, 'The Export Receipt Could Not Be Recorded', 'export_receipt_unavailable');
    receipt = inserted.data;
    await auditOperatorAction(op, req, { action: 'economy.export_prepared', targetType: 'operator_export', targetId: receipt.id, after: receipt, details: { surface, complete, row_count: rowCount } });
  }
  return { state: 'export.prepared', receipt, disclosure: 'The Receipt Was Recorded Before The Browser Download Was Requested' };
}

async function recordPnlSnapshot(db, op, req, body, requestId) {
  const opId = uuid(body.opId);
  if (!opId) throw badRequest('A Valid Profit And Loss Operation ID Is Required', 'op_id_required');
  const computed = await pnl(db, body);
  const scopeId = computed.scope === 'union' ? computed.unionId : computed.clubId;
  const sourceFunction = computed.scope === 'union' ? 'fn_union_pnl_all_clubs' : 'fn_ca_fleet_pnl';
  const prior = await db.from('ca_club_pnl_snapshots').select('*').eq('op_id', opId).maybeSingle();
  fail(prior.error, 'The Profit And Loss Receipt Could Not Be Checked', 'pnl_snapshot_unavailable');
  if (prior.data) {
    if (prior.data.scope !== computed.scope || prior.data.scope_id !== scopeId || prior.data.period_start !== computed.from || prior.data.period_end !== computed.to) {
      throw new ApiError(409, 'That Profit And Loss Key Belongs To A Different Request', 'pnl_op_id_reused');
    }
    return { state: 'pnl.snapshot_recorded', snapshot: prior.data, computed, idempotent: true };
  }
  const epoch = await db.from('ca_financial_epochs').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  const inserted = await db.from('ca_club_pnl_snapshots').insert({
    scope: computed.scope, scope_id: scopeId, period_start: computed.from, period_end: computed.to,
    source_function: sourceFunction, source_version: 'phase11-v1', financial_epoch_id: epoch.error ? null : epoch.data?.id ?? null,
    includes_horses: true, result: computed.result ?? {}, recorded_by: op.user.id, op_id: opId, request_id: requestId,
  }).select('*').maybeSingle();
  fail(inserted.error, 'The Profit And Loss Snapshot Could Not Be Recorded', 'pnl_snapshot_unavailable');
  if (!inserted.data) throw new ApiError(503, 'The Profit And Loss Snapshot Could Not Be Recorded', 'pnl_snapshot_unavailable');
  await auditOperatorAction(op, req, { action: 'economy.pnl_recorded', targetType: computed.scope, targetId: scopeId, after: inserted.data, details: { from: computed.from, to: computed.to, source_function: sourceFunction } });
  return { state: 'pnl.snapshot_recorded', snapshot: inserted.data, computed, idempotent: false };
}

async function signDailyClose(db, op, req, res, body, requestId) {
  if (!hasPermission(op.permissions, PERMISSIONS.MONEY_WRITE)) throw forbidden('Money Write Permission Is Required', 'permission_denied');
  const opId = uuid(body.opId);
  const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null;
  const manifestSha256 = typeof body.manifestSha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.manifestSha256) ? body.manifestSha256.toLowerCase() : null;
  const exceptions = Array.isArray(body.exceptions) ? body.exceptions.slice(0, 50).map((value) => String(value).trim().slice(0, 500)).filter(Boolean) : null;
  if (!opId || !day || !manifestSha256 || !exceptions) throw badRequest('The Daily Close Request Is Incomplete', 'daily_close_invalid');
  const requested = await db.rpc('fn_ca_operator_request_daily_close', { p_day: day, p_manifest_sha256: manifestSha256, p_requested_by: op.user.id, p_exceptions: exceptions, p_op_id: opId, p_request_id: requestId });
  fail(requested.error, 'The Daily Close Approval Could Not Be Recorded', 'daily_close_unavailable');
  const gate = requested.data || {};
  if (gate.ok === false) throw new ApiError(409, 'That Daily Close Request Cannot Be Reused', gate.error || 'daily_close_refused');
  if (gate.required) {
    await auditOperatorAction(op, req, { action: 'economy.close_requested', targetType: 'ledger_day', targetId: day, details: { approval_id: gate.approval_id, manifest_sha256: manifestSha256, exceptions } });
    res.status(202).json({ success: true, pending: true, approvalId: gate.approval_id, status: gate.status || 'pending', requestId, message: 'Daily Close Approval Is Pending' });
    return undefined;
  }
  const signed = await db.rpc('fn_ca_operator_sign_daily_close', { p_day: day, p_manifest_sha256: manifestSha256, p_signed_by: op.user.id, p_exceptions: exceptions, p_op_id: opId, p_approval_id: gate.approval_id, p_request_id: requestId });
  fail(signed.error, 'The Daily Close Could Not Be Signed', 'daily_close_unavailable');
  if (signed.data?.ok === false) throw new ApiError(409, 'The Daily Close Was Not Signed', signed.data.error || 'daily_close_refused');
  await auditOperatorAction(op, req, { action: 'economy.close_signed', targetType: 'ledger_day', targetId: day, after: signed.data?.close || null, details: { manifest_sha256: manifestSha256, approval_id: gate.approval_id } });
  return { state: 'close.signed', close: signed.data?.close || null, idempotent: signed.data?.idempotent === true };
}

export async function handle({ db, query, method, body, op, req, res, requestId }) {
  if (method === 'POST') {
    const action = enumOf(body.action, ECONOMY_ACTIONS);
    if (!action) throw badRequest('Choose A Valid Economy Action', 'action_required');
    if (action === 'record_export_prepared') return recordExportPrepared(db, op, req, body, requestId);
    if (action === 'record_pnl_snapshot') return recordPnlSnapshot(db, op, req, body, requestId);
    return signDailyClose(db, op, req, res, body, requestId);
  }
  const section = enumOf(query.section, ECONOMY_SECTIONS) || 'supply';
  const handlers = { supply, velocity, register, treasury, conservation, drift, burnin, rakelaw: rakeLaw, rakeback, leaderboard, bbj, promotions, abuse, close, digest, pnl, invoices, jobs, exports: exportsSection };
  return handlers[section](db, query);
}

export const handleEconomyAdmin = handle;

export const spec = Object.freeze({
  name: 'horses.economy-admin', methods: ['GET', 'POST'], permission: PERMISSIONS.MONEY_READ, limit: { GET: 'read', POST: 'write' },
});
export const economyAdminSpec = spec;

export default withOperatorRoute(spec, handle);
