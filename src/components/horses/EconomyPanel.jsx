import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './shared.module.css';
import { when } from '../../lib/horsesAdminTokens';
import { OPERATOR_TIMEOUT_MS } from './useOperatorFetch';
import EconomyExport from './EconomyExport';
import { abuseState, closeCalendar, conservationModel, dataOf, decimalText, economyAdminUrl, jobState, snapshotModel } from './economyAdmin';

const GROUPS = Object.freeze([
  ['supply', 'Supply'], ['diamonds', 'Diamonds'], ['treasury', 'Treasury'], ['control', 'Conservation'],
  ['payouts', 'Payout Oversight'], ['close', 'Close And Jobs'],
]);

function Note({ tone = 'info', children }) { return <div className={styles[`${tone}Note`] || styles.infoNote}>{children}</div>; }
function Fact({ label, value }) { return <div><span className={styles.opsFactLabel}>{label}</span><span className={styles.opsFactValue}>{value ?? 'Unknown'}</span></div>; }
function Rows({ rows = [], empty = 'No Rows Were Returned.', title, render }) {
  return <section className={styles.opsDetail}><div className={styles.opsDetailHead}><h3 className={styles.opsCardTitle}>{title}</h3><span>{rows.length} Returned</span></div>{rows.length ? <div className={styles.opsCardsAlways}>{rows.map((row, index) => render(row, index))}</div> : <div className={styles.stateNote}>{empty}</div>}</section>;
}
function exportComplete(page) { return page?.hasMore !== true && page?.truncated !== true && (page?.total === null || page?.total === undefined || Number(page.total) <= (page?.rows || []).length); }

function useEconomyRead(authFetch, sections, active = true, sectionParams = {}) {
  const [state, setState] = useState({ loading: true, data: {}, errors: {} });
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!active) return;
    const request = ++sequence.current;
    setState((old) => ({ ...old, loading: true }));
    const settled = await Promise.all(sections.map(async (section) => {
        try { return [section, dataOf(await authFetch(section === 'diamonds' ? '/api/horses/economy-stats' : economyAdminUrl(section, sectionParams[section]), { timeoutMs: OPERATOR_TIMEOUT_MS })), null]; }
      catch (error) { return [section, null, error?.message || 'Read Failed']; }
    }));
    if (request !== sequence.current) return;
    const data = {}; const errors = {};
    for (const [section, value, error] of settled) { if (error) errors[section] = error; else data[section] = value; }
    setState({ loading: false, data, errors });
  }, [active, authFetch, sectionParams, sections]);
  useEffect(() => { load(); return () => { sequence.current += 1; }; }, [load]);
  return { ...state, load };
}

function Diamonds({ value }) {
  const stats = value?.stats || {};
  const rows = value?.transactions || [];
  return <>
    {value?.failedSources?.length ? <Note tone="warn">Some Diamond Sources Could Not Be Read: {value.failedSources.join(', ')}.</Note> : null}
    <div className={styles.opsHero}><span className={styles.opsHeroLabel}>Diamond Purchase Revenue</span><strong className={styles.opsHeroValue}>${decimalText(stats.diamondPurchaseRevenueUsd)}</strong><span>{stats.diamondPurchaseTruncated ? 'Capped Purchase Read' : 'Purchase Rows Read Without A Cap Hit'}</span></div>
    <div className={styles.opsDetailGrid}><Fact label="Diamonds Sold" value={decimalText(stats.diamondsSold)} /><Fact label="Earned" value={decimalText(stats.totalDiamondsEarned)} /><Fact label={`Spent, ${stats.totalDiamondsSpentWindowLabel || 'Window Unknown'}`} value={decimalText(stats.totalDiamondsSpent)} /><Fact label="VIP Point Holders" value={value?.vipPoints?.holders ?? 'Unknown'} /></div>
    <section className={styles.opsDetail} aria-label="Diamond transaction log"><h3 className={styles.opsCardTitle}>Diamond Transaction Log</h3><div className={styles.opsCardsAlways}>{rows.map((row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{row.type || 'Unknown Type'}</h4><span>{when(row.created_at, true)}</span></div><div className={styles.opsFacts}><Fact label="Amount" value={decimalText(row.amount)} /><Fact label="Source" value={row.source || 'Unknown'} /><Fact label="Player" value={row.user_id || 'Unknown'} /><Fact label="Description" value={row.description || 'Not Recorded'} /></div></article>)}</div>{!rows.length ? <div className={styles.stateNote}>No Diamond Transactions Were Returned.</div> : null}</section>
  </>;
}

function Supply({ value, velocity, velocityHours, setVelocityHours, authFetch }) {
  const age = snapshotModel(value?.snapshot);
  const snapshot = value?.snapshot || {};
  const stores = Array.isArray(snapshot.stores) ? snapshot.stores : snapshot.stores && typeof snapshot.stores === 'object'
    ? Object.entries(snapshot.stores).map(([store, amount]) => ({ store, amount })) : [];
  const coverage = new Map((value?.coverage || []).map((row) => [row.store, row.treatment]));
  const uncovered = stores.filter((row) => !coverage.has(row.store));
  const coverageGaps = Array.isArray(value?.coverageGaps) ? value.coverageGaps : null;
  const trend = Array.isArray(value?.trend) ? [...value.trend].reverse() : [];
  const plotted = trend.filter((row) => Number.isFinite(Number(row.total)));
  const totals = plotted.map((row) => Number(row.total));
  const low = totals.length ? Math.min(...totals) : 0;
  const span = totals.length ? Math.max(...totals) - low : 0;
  const points = plotted.map((row, index) => `${plotted.length === 1 ? 50 : (index / (plotted.length - 1)) * 100},${span === 0 ? 15 : 29 - ((Number(row.total) - low) / span) * 28}`).join(' ');
  const trendStart = plotted[0];
  const trendEnd = plotted.at(-1);
  return <>
    <Note tone={age.state === 'supply.ready' ? 'info' : 'warn'}>Snapshot Age: {age.ageMinutes === null ? 'Unknown' : `${age.ageMinutes} Minutes`}. Basis: {snapshot.basis || 'Unknown'}.</Note>
    <div className={styles.opsHero}><span className={styles.opsHeroLabel}>Metered Chip Supply</span><strong className={styles.opsHeroValue}>{decimalText(snapshot.total ?? snapshot.total_supply ?? snapshot.total_chips)}</strong></div>
    <div className={styles.opsCardsAlways}>{stores.map((row) => <article className={styles.opsCard} key={row.store}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.store}</h3><span>{coverage.get(row.store) || 'Coverage Unknown'}</span></div><Fact label="Amount" value={decimalText(row.amount)} /></article>)}</div>
    <section className={styles.opsDetail}><div className={styles.opsDetailHead}><h3 className={styles.opsCardTitle}>Supply Trend Evidence</h3><span>{value?.trendTruncated ? 'History Capped' : `${trend.length} Snapshots`}</span></div><div className={styles.opsDetailGrid}><Fact label="Trend Start" value={trendStart ? when(trendStart.taken_at, true) : 'Unknown'} /><Fact label="Starting Total" value={trendStart ? decimalText(trendStart.total) : 'Unknown'} /><Fact label="Trend End" value={trendEnd ? when(trendEnd.taken_at, true) : 'Unknown'} /><Fact label="Ending Total" value={trendEnd ? decimalText(trendEnd.total) : 'Unknown'} /></div>{points ? <figure className={styles.opsTrend}><svg viewBox="0 0 100 30" role="img" aria-label={`Metered Chip Supply Across ${plotted.length} Snapshots`} preserveAspectRatio="none"><polyline points={points} /></svg><figcaption>The Line Covers Only The Returned Snapshot Window.</figcaption></figure> : <Note tone="warn">Supply Trend History Could Not Be Read.</Note>}</section>
    <Note tone={uncovered.length ? 'danger' : 'info'}>{uncovered.length ? `Snapshot Stores Missing A Returned Coverage Classification: ${uncovered.map((row) => row.store).join(', ')}.` : 'Every Snapshot Store Has A Returned Coverage Classification.'}</Note>
    <Note tone={coverageGaps === null ? 'warn' : coverageGaps.length ? 'danger' : 'info'}>{coverageGaps === null ? 'Coverage Gap Check Could Not Be Read.' : coverageGaps.length ? `${coverageGaps.length} Coverage Gaps Require Review.` : 'The Coverage Gap Check Returned No Gaps.'}</Note>
    {coverageGaps?.length ? <div className={styles.opsCardsAlways}>{coverageGaps.map((row, index) => <article className={styles.opsCard} key={row.store || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.store || `Gap ${index + 1}`}</h3><span>{row.treatment || row.gap || 'Coverage Gap'}</span></div><Fact label="Evidence" value={row.notes || row.reason || 'No Detail Returned'} /></article>)}</div> : null}
    <div className={styles.opsToolbar}><label className={styles.field}><span className={styles.fieldLabel}>Velocity Window</span><select className={styles.select} value={velocityHours} onChange={(event) => setVelocityHours(Number(event.target.value))}><option value={24}>24 Hours</option><option value={168}>7 Days</option><option value={720}>30 Days</option></select></label></div>
    <div className={styles.opsDetailGrid}><Fact label="Velocity Window" value={`${velocity?.hours ?? 'Unknown'} Hours`} /><Fact label="Rows Read" value={velocity?.rowCount ?? 'Unknown'} /><Fact label="Chips Moved" value={decimalText(velocity?.amount)} /><Fact label="Read State" value={velocity?.state || 'velocity.unknown'} /></div>
    {velocity?.truncated ? <Note tone="warn">Velocity Hit Its {velocity.cap} Row Safety Cap. The Amount Is A Floor.</Note> : null}
    <EconomyExport authFetch={authFetch} rows={stores.map((row) => ({ ...row, coverage: coverage.get(row.store) || 'unknown' }))} columns={[["store", "Store"], ["amount", "Amount"], ["coverage", "Coverage"]]} label="Export Supply Breakdown" filenamePrefix="economy-supply" complete={uncovered.length === 0} total={stores.length} />
  </>;
}

function Treasury({ value }) {
  return <><Note tone="warn">{value?.disclosure || 'Treasury Source Unknown'}</Note><div className={styles.opsCardsAlways}>{(value?.rows || []).map((row, index) => <article className={styles.opsCard} key={row.club_id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.club_name || row.club_id || `Club ${index + 1}`}</h3><span>{row.status || 'Unknown'}</span></div><div className={styles.opsFacts}><Fact label="Stored" value={decimalText(row.stored_balance)} /><Fact label="Ledger" value={decimalText(row.ledger_balance)} /><Fact label="Difference" value={decimalText(row.difference ?? row.drift)} /></div></article>)}</div></>;
}

function Control({ conservation, burnin, drift, authFetch }) {
  const model = conservationModel(conservation?.operands);
  const gate = burnin?.result;
  const checks = Array.isArray(gate?.checks) ? gate.checks : [];
  return <>
    <Note tone={model.balanced ? 'good' : 'danger'}>{model.balanced ? 'Every Chip Is Accounted For' : model.state === 'conservation.unknown' ? 'Conservation Is Unknown' : `The Register And Meter Leave ${decimalText(model.residue)} Chips Unexplained`}</Note>
    <div className={styles.opsDetailGrid}><Fact label="Register At Meter" value={decimalText(conservation?.operands?.register_net_at_meter)} /><Fact label="Meter Total" value={decimalText(conservation?.operands?.meter_total)} /><Fact label="Difference" value={decimalText(conservation?.operands?.difference)} /><Fact label="Baseline Drift" value={decimalText(conservation?.operands?.unexplained_since_baseline)} /></div>
    <Note tone={burnin?.state === 'burnin.pass' ? 'good' : burnin?.state === 'burnin.fail' ? 'danger' : 'warn'}>Burn-In Gate: {gate?.gate || 'Unknown'}. No Restart Control Is Available Here. {burnin?.disclosure || ''}</Note>
    {checks.length ? <div className={styles.opsCardsAlways}>{checks.map((check, index) => <article className={styles.opsCard} key={check.name || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{String(check.name || `Check ${index + 1}`).replace(/_/g, ' ')}</h3><span>{check.pass === true ? 'Pass' : check.pass === false ? 'Fail' : 'Unknown'}</span></div><Fact label="Value" value={String(check.value ?? 'Unknown')} /><Fact label="Evidence" value={String(check.evidence ?? 'Unknown')} /></article>)}</div> : null}
    <Note tone="warn">{drift?.reconciliationDisclosure || 'Nightly Reconciliation State Unknown'}</Note>
    <div className={styles.opsDetailGrid}><Fact label="Open Drift" value={drift?.metrics?.open_total ?? drift?.metrics?.openTotal ?? 'Unknown'} /><Fact label="Open Critical" value={drift?.metrics?.open_critical ?? drift?.metrics?.openCritical ?? 'Unknown'} /><Fact label="Past Target" value={drift?.metrics?.past_target ?? drift?.metrics?.pastTarget ?? 'Unknown'} /><Fact label="Worst Open Drift" value={decimalText(drift?.metrics?.worst_open_drift ?? drift?.metrics?.worstOpenDrift)} /><Fact label="Unresolved Alerts" value={drift?.unresolvedAlerts ?? 'Unknown'} /><Fact label="Health Last Written" value={drift?.health ? when(drift.health.created_at, true) : 'Unknown'} /></div>
    {drift?.health ? <Note tone="warn">Financial Health Is Historical Evidence From {when(drift.health.created_at, true)}. It Is Not A Current Verdict.</Note> : <Note tone="warn">Financial Health Evidence Could Not Be Read.</Note>}
    <Rows title="Open Drift Incident Evidence" rows={drift?.incidents?.rows || []} empty="No Drift Incident Rows Were Returned. This Does Not Prove There Are No Open Incidents." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.classification || row.dedupe_key || 'Drift Incident'}</h3><span>{row.status || 'Unknown'}</span></div><div className={styles.opsFacts}><Fact label="Detected" value={when(row.detected_at || row.created_at, true)} /><Fact label="Drift" value={decimalText(row.drift ?? row.amount)} /><Fact label="Severity" value={row.severity || 'Unknown'} /><Fact label="Club" value={row.club_id || 'Not Recorded'} /></div></article>} />
    <Rows title="Chip Circulation Composition Evidence" rows={drift?.reconciliation || []} empty="No Chip Circulation Composition Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.entity_id || `Composition ${index + 1}`}</h3><span>Not A Variance</span></div><div className={styles.opsFacts}><Fact label="Chips On Felt" value={decimalText(row.ledger_balance)} /><Fact label="Total Club Chips" value={decimalText(row.stored_balance)} /><Fact label="Arithmetic Difference" value={decimalText(row.drift)} /><Fact label="Recorded" value={when(row.created_at, true)} /></div></article>} />
    <EconomyExport authFetch={authFetch} rows={drift?.incidents?.rows || []} columns={[["id", "Incident ID"], ["classification", "Classification"], ["status", "Status"], ["severity", "Severity"], ["drift", "Drift"], ["created_at", "Created"]]} label="Export Returned Drift Incidents" filenamePrefix="economy-drift-incidents" complete={exportComplete(drift?.incidents)} total={drift?.incidents?.total} />
    <EconomyExport authFetch={authFetch} rows={drift?.reconciliation || []} columns={[["entity_id", "Entity"], ["ledger_balance", "Chips On Felt"], ["stored_balance", "Total Club Chips"], ["drift", "Arithmetic Difference"], ["created_at", "Recorded"]]} label="Export Composition Evidence" filenamePrefix="economy-chip-composition" total={(drift?.reconciliation || []).length} />
  </>;
}

function Payouts({ rakeback, leaderboard, bbj, promotions, abuse, authFetch }) {
  const abuseStatus = abuseState(abuse?.abuseLogs, abuse?.lastRun);
  const periods = rakeback?.periods?.rows || [];
  const rakebackPayouts = rakeback?.payouts || [];
  const runs = rakeback?.runs || [];
  const leaderboardPayouts = leaderboard?.payouts || [];
  const leaderboardBatches = leaderboard?.batches || [];
  const bbjPayouts = bbj?.payouts?.rows || [];
  const contributions = bbj?.contributions || [];
  const awards = promotions?.rows || [];
  const abuseRows = abuse?.abuseLogs || [];
  const signupRows = abuse?.signupLogs || [];
  return <>
    <div className={styles.opsHero}><span className={styles.opsHeroLabel}>Pending Rakeback</span><strong className={styles.opsHeroValue}>{decimalText(rakeback?.pendingAmount)}</strong><span>{rakeback?.pendingCount ?? 'Unknown'} Rows</span></div>
    <Note tone="warn">{rakeback?.disclosure || 'Rakeback State Unknown'}</Note>
    <div className={styles.opsDetailGrid}><Fact label="Last Settle Evidence" value={runs[0] ? when(runs[0].started_at || runs[0].created_at, true) : 'No Evidence'} /><Fact label="Returned Periods" value={periods.length} /><Fact label="Returned Payouts" value={rakebackPayouts.length} /></div>
    <Rows title="Rakeback Periods" rows={periods} empty="No Rakeback Period Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.period_start || 'Period Start Unknown'}</h3><span>{row.status || 'Unknown'}</span></div><div className={styles.opsFacts}><Fact label="Period End" value={row.period_end || 'Unknown'} /><Fact label="Amount" value={decimalText(row.rakeback_amount)} /><Fact label="Player" value={row.user_id || row.player_id || 'Unknown'} /><Fact label="Club" value={row.club_id || 'Unknown'} /></div></article>} />
    <Rows title="Rakeback Payout Evidence" rows={rakebackPayouts} empty="No Rakeback Payout Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.period_id || 'Rakeback Payout'}</h3><span>{row.status || 'Unknown'}</span></div><div className={styles.opsFacts}><Fact label="Amount" value={decimalText(row.amount ?? row.payout_amount)} /><Fact label="Recorded" value={when(row.created_at || row.paid_at, true)} /></div></article>} />
    <Rows title="Rakeback Scheduler Evidence" rows={runs} empty="No Rakeback Settle Run Evidence Was Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>Open Claw Settle Run</h3><span>{jobState(row)}</span></div><div className={styles.opsFacts}><Fact label="Started" value={when(row.started_at || row.created_at, true)} /><Fact label="Status" value={row.status || 'Unknown'} /></div></article>} />
    <Note tone="warn">{leaderboard?.disclosure || 'Leaderboard State Unknown'}</Note>
    <Rows title="Leaderboard Payouts" rows={leaderboardPayouts} empty="No Leaderboard Payout Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.leaderboard_id || row.player_id || 'Leaderboard Payout'}</h3><span>{row.status || 'Recorded'}</span></div><div className={styles.opsFacts}><Fact label="Amount" value={decimalText(row.amount ?? row.payout_amount)} /><Fact label="Awarded" value={when(row.awarded_at || row.created_at, true)} /></div></article>} />
    <Rows title="Leaderboard Batches" rows={leaderboardBatches} empty="No Leaderboard Batch Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.id || `Batch ${index + 1}`}</h3><span>{row.status || 'Recorded'}</span></div><div className={styles.opsFacts}><Fact label="Settled" value={when(row.settled_at || row.created_at, true)} /><Fact label="Total" value={decimalText(row.total_amount ?? row.amount)} /></div></article>} />
    <Note tone="warn">{bbj?.disclosure || 'Bad Beat Jackpot State Unknown'}</Note>
    <div className={styles.opsCardsAlways}>{(bbj?.pools || []).map((pool, index) => <article className={styles.opsCard} key={pool.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{pool.club_id ? 'Club Pool' : 'Union Pool'}</h3><span>{pool.status || 'Unknown'}</span></div><div className={styles.opsFacts}><Fact label="Main, Separate" value={decimalText(pool.main_balance)} /><Fact label="Backup, Separate" value={decimalText(pool.backup_balance)} /><Fact label="Promotion" value={decimalText(pool.promo_balance)} /><Fact label="Minimum Players Dealt" value={bbj?.minimumPlayersDealt ?? 'Unknown'} /></div></article>)}</div>
    <Rows title="Bad Beat Jackpot Payouts" rows={bbjPayouts} empty="No Bad Beat Jackpot Payout Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.payout_type || row.kind || 'Jackpot Payout'}</h3><span>{row.status || 'Recorded'}</span></div><div className={styles.opsFacts}><Fact label="Amount" value={decimalText(row.amount ?? row.payout_amount)} /><Fact label="Recorded" value={when(row.created_at || row.paid_at, true)} /></div></article>} />
    <Rows title="Bad Beat Jackpot Contributions" rows={contributions} empty="No Contribution Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.hand_id || `Contribution ${index + 1}`}</h3><span>{when(row.created_at, true)}</span></div><Fact label="Amount" value={decimalText(row.amount ?? row.contribution)} /></article>} />
    <Note tone="warn">{promotions?.disclosure || 'Promotion Award State Unknown'}</Note>
    <Rows title="Promotion Awards" rows={awards} empty="No Promotion Award Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.promotion_id || row.promotion_name || 'Promotion Award'}</h3><span>{row.status || 'Recorded'}</span></div><div className={styles.opsFacts}><Fact label="Amount" value={decimalText(row.amount ?? row.value)} /><Fact label="Recorded" value={when(row.created_at, true)} /></div></article>} />
    <Note tone={abuseStatus === 'abuse.nothing_detected' ? 'info' : 'warn'}>{abuse?.disclosure || abuseStatus}</Note>
    <div className={styles.opsDetailGrid}><Fact label="Abuse Log Rows" value={Array.isArray(abuse?.abuseLogs) ? abuseRows.length : 'Unknown'} /><Fact label="Signup Abuse Rows" value={Array.isArray(abuse?.signupLogs) ? signupRows.length : 'Unknown'} /><Fact label="Detector State" value={abuseStatus} /></div>
    <EconomyExport authFetch={authFetch} rows={periods} columns={[["id", "Period ID"], ["period_start", "Period Start"], ["period_end", "Period End"], ["status", "Status"], ["rakeback_amount", "Amount"], ["user_id", "Player"], ["club_id", "Club"]]} label="Export Returned Rakeback Periods" filenamePrefix="economy-rakeback-periods" complete={exportComplete(rakeback?.periods)} total={rakeback?.periods?.total} />
    <EconomyExport authFetch={authFetch} rows={leaderboardPayouts} columns={[["id", "Payout ID"], ["leaderboard_id", "Leaderboard"], ["player_id", "Player"], ["amount", "Amount"], ["status", "Status"], ["awarded_at", "Awarded"]]} label="Export Leaderboard Payouts" filenamePrefix="economy-leaderboard-payouts" total={leaderboardPayouts.length} />
    <EconomyExport authFetch={authFetch} rows={bbjPayouts} columns={[["id", "Payout ID"], ["payout_type", "Type"], ["amount", "Amount"], ["status", "Status"], ["created_at", "Recorded"]]} label="Export Returned Jackpot Payouts" filenamePrefix="economy-bbj-payouts" complete={exportComplete(bbj?.payouts)} total={bbj?.payouts?.total} />
    <EconomyExport authFetch={authFetch} rows={awards} columns={[["id", "Award ID"], ["promotion_id", "Promotion"], ["user_id", "Player"], ["amount", "Amount"], ["status", "Status"], ["created_at", "Recorded"]]} label="Export Promotion Awards" filenamePrefix="economy-promotion-awards" total={awards.length} />
  </>;
}

function PnlProbe({ authFetch }) {
  const [scope, setScope] = useState('club');
  const [scopeId, setScopeId] = useState('');
  const [state, setState] = useState({ loading: false, value: null, error: '' });
  const run = async () => {
    setState({ loading: true, value: null, error: '' });
    try { setState({ loading: false, value: dataOf(await authFetch('/api/horses/economy-admin', { method: 'POST', body: JSON.stringify({ action: 'record_pnl_snapshot', scope, ...(scope === 'club' ? { clubId: scopeId } : { unionId: scopeId }), days: 30, opId: globalThis.crypto.randomUUID() }), timeoutMs: OPERATOR_TIMEOUT_MS })), error: '' }); }
    catch (error) { setState({ loading: false, value: null, error: error?.message || 'Profit And Loss Could Not Be Computed' }); }
  };
  return <section className={styles.opsDetail} aria-label="Club or union profit and loss"><h3 className={styles.opsCardTitle}>Durable Profit And Loss Snapshot</h3><div className={styles.opsToolbar}><label className={styles.field}><span className={styles.fieldLabel}>Scope</span><select className={styles.select} value={scope} onChange={(event) => { setScope(event.target.value); setScopeId(''); }}><option value="club">Club</option><option value="union">Union</option></select></label><label className={styles.field}><span className={styles.fieldLabel}>{scope === 'club' ? 'Club' : 'Union'} ID</span><input className={styles.input} value={scopeId} onChange={(event) => setScopeId(event.target.value)} placeholder={`${scope === 'club' ? 'Club' : 'Union'} UUID`} /></label><button type="button" className={styles.btn} onClick={run} disabled={state.loading || !scopeId}>Compute And Record Thirty Days</button></div>{state.error ? <Note tone="danger">{state.error}</Note> : null}{state.value ? <><Note tone="good">Snapshot {state.value.snapshot?.id || 'Recorded'} Bound To {state.value.snapshot?.source_function || 'Its Source Function'}.</Note><pre className={styles.opsCode}>{JSON.stringify(state.value.computed?.result, null, 2)}</pre></> : null}</section>;
}

function DailyCloseSigner({ manifests, closes, authFetch }) {
  const signedDays = new Set((closes || []).map((row) => row.close_day));
  const unsigned = manifests.filter((row) => !signedDays.has(row.day));
  const [day, setDay] = useState(unsigned.at(-1)?.day || '');
  const [exceptions, setExceptions] = useState('');
  const [state, setState] = useState({ busy: false, message: '', error: '' });
  const sign = async () => {
    const manifest = manifests.find((row) => row.day === day);
    if (!manifest) return;
    setState({ busy: true, message: '', error: '' });
    try {
      const answer = await authFetch('/api/horses/economy-admin', { method: 'POST', body: JSON.stringify({ action: 'sign_daily_close', day, manifestSha256: manifest.sha256, exceptions: exceptions.split('\n').map((row) => row.trim()).filter(Boolean), opId: globalThis.crypto.randomUUID() }) });
      setState({ busy: false, message: answer?.pending ? `Approval ${answer.approvalId || 'Pending'} Was Recorded` : `Daily Close ${answer?.close?.id || 'Signed'} Was Recorded`, error: '' });
    } catch (error) { setState({ busy: false, message: '', error: error?.message || 'The Daily Close Could Not Be Signed' }); }
  };
  return <section className={styles.opsDetail} aria-label="Daily close signing"><h3 className={styles.opsCardTitle}>Sign Daily Close</h3>{state.error ? <Note tone="danger">{state.error}</Note> : null}{state.message ? <Note tone="good">{state.message}</Note> : null}<div className={styles.opsToolbar}><label className={styles.field}><span className={styles.fieldLabel}>Unsigned Manifest Day</span><select className={styles.select} value={day} onChange={(event) => setDay(event.target.value)}><option value="">Select A Day</option>{unsigned.map((row) => <option value={row.day} key={row.day}>{row.day}</option>)}</select></label><label className={styles.field}><span className={styles.fieldLabel}>Reviewed Exceptions, One Per Line</span><textarea className={styles.input} value={exceptions} onChange={(event) => setExceptions(event.target.value)} placeholder="Leave Empty Only When There Are No Exceptions" /></label><button type="button" className={styles.btn} onClick={sign} disabled={state.busy || !day}>Sign Exact Manifest</button></div><Note tone="warn">The Signature Binds The Selected Day, Manifest Hash And Reviewed Exception List. A Second Approval Is Used When Policy Requires It.</Note></section>;
}

function CloseAndJobs({ close, digest, invoices, jobs, exportsValue, authFetch }) {
  const manifests = close?.manifests || [];
  const start = close?.fromDay || manifests[0]?.day || new Date(Date.now() - 187 * 86400000).toISOString().slice(0, 10);
  const end = close?.toDay || manifests.at(-1)?.day || new Date().toISOString().slice(0, 10);
  const calendar = closeCalendar(manifests, start, end);
  const restatements = close?.restatements || [];
  const digestRows = digest?.rows || [];
  const digestRuns = digest?.runs || [];
  const exportRows = exportsValue?.rows || [];
  const invoiceRows = invoices?.rows || [];
  const jobRows = jobs?.rows || [];
  return <>
    <Note tone="warn">{close?.disclosure || 'No Day Has Been Operator-Signed'}</Note>
    <div className={styles.opsDetailGrid}><Fact label="Manifest Days" value={calendar.filter((day) => day.state === 'close.manifest_only').length} /><Fact label="Missing Days" value={calendar.filter((day) => day.state === 'close.day_missing').length} /><Fact label="Coverage Start" value={start} /><Fact label="Coverage End" value={end} /></div>
    <div className={styles.opsDetailGrid}><Fact label="Restatements" value={close?.restatements?.length ?? 'Unknown'} /><Fact label="Unattributed Restatements" value={(close?.restatements || []).filter((row) => !row.restated_by).length} /><Fact label="Signature State" value={close?.state || 'close.unknown'} /></div>
    <DailyCloseSigner manifests={manifests} closes={close?.closes || []} authFetch={authFetch} />
    <Rows title="Signed Daily Closes" rows={close?.closes || []} empty="No Daily Close Signatures Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.close_day}</h3><span>Signed</span></div><div className={styles.opsFacts}><Fact label="Manifest SHA-256" value={row.manifest_sha256} /><Fact label="Rows" value={row.manifest_row_count} /><Fact label="Net Amount" value={decimalText(row.manifest_net_amount)} /><Fact label="Signed" value={when(row.signed_at, true)} /></div></article>} />
    <div className={styles.opsCardsAlways}>{calendar.map((day) => <article className={styles.opsCard} key={day.day}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{day.day}</h3><span>{day.state === 'close.manifest_only' ? 'Manifest Recorded' : 'Day Missing'}</span></div><Fact label="Net Amount" value={day.manifest ? decimalText(day.manifest.net_amount) : 'Unknown'} /></article>)}</div>
    <Rows title="Manifest Restatements" rows={restatements} empty="No Manifest Restatement Rows Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.day || row.manifest_day || 'Day Unknown'}</h3><span>{row.restated_by ? 'Identity Recorded' : 'Identity NULL'}</span></div><div className={styles.opsFacts}><Fact label="Restated By" value={row.restated_by || 'NULL'} /><Fact label="Application" value={row.application || 'NULL'} /><Fact label="Restated" value={when(row.restated_at, true)} /></div></article>} />
    <Note tone="warn">{digest?.disclosure || 'Digest History Unknown'}</Note>
    <Rows title="Durable Weekly Digest Runs" rows={digestRuns} empty="No Durable Weekly Digest Runs Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.run_key || `Run ${index + 1}`}</h3><span>{row.outcome || 'Recorded'}</span></div><div className={styles.opsFacts}><Fact label="Window" value={`${row.window_start || 'Unknown'} To ${row.window_end || 'Unknown'}`} /><Fact label="Recipients Recorded" value={row.recipient_count ?? 'Unknown'} /><Fact label="Net Revenue" value={decimalText(row.net_revenue)} /><Fact label="Last Recorded" value={when(row.last_recorded_at, true)} /></div></article>} />
    <Rows title="Weekly Digest Notification Evidence" rows={digestRows} empty="No Weekly Digest Notification Evidence Was Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.id || `Digest ${index + 1}`}</h3><span>{digest?.state || 'digest.unknown'}</span></div><div className={styles.opsFacts}><Fact label="Recipient" value={row.user_id || 'Unknown'} /><Fact label="Recorded" value={when(row.created_at, true)} /><Fact label="Durability" value="Notification Payload Only" /></div></article>} />
    <Note tone="warn">{invoices?.disclosure || 'Invoice Delivery State Unknown'}</Note>
    <div className={styles.opsDetailGrid}><Fact label="Invoice Rows Returned" value={invoiceRows.length} /><Fact label="Invoice Total" value={invoices?.total ?? 'Unknown'} /><Fact label="Delivery Evidence" value={invoices?.deliveryState || 'invoice.unknown'} /></div>
    <Rows title="Settlement Invoices" rows={invoiceRows} empty="No Settlement Invoice Rows Were Returned." render={(invoice, index) => <article className={styles.opsCard} key={invoice.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{invoice.invoice_type || 'Settlement Invoice'}</h3><span>{invoice.status || 'Unknown'}</span></div><div className={styles.opsFacts}><Fact label="Gross Amount" value={decimalText(invoice.gross_amount)} /><Fact label="Recorded" value={when(invoice.created_at, true)} /><Fact label="Delivery" value="Recorded, Not Confirmed" /><Fact label="Club" value={invoice.club_id || 'Unknown'} /></div></article>} />
    <Note tone="info">{jobs?.retentionDisclosure || 'Scheduler History Retention Is Unknown'}</Note>
    <Rows title="Money Job Evidence" rows={jobRows} empty="No Money Job Evidence Rows Were Returned." render={(row) => <article className={styles.opsCard} key={row.jobName}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.jobName}</h3><span>{jobState(row.evidence)}</span></div><div className={styles.opsFacts}><Fact label="Scheduler" value={row.scheduler} /><Fact label="Last Evidence" value={row.evidence ? when(row.evidence.started_at || row.evidence.created_at, true) : 'No Evidence'} /><Fact label="Status" value={row.evidence?.status || 'Unknown'} /><Fact label="Result Shape" value={row.evidence?.result && typeof row.evidence.result === 'object' ? `${Object.keys(row.evidence.result).length} Fields` : 'Not Recorded'} /></div></article>} />
    <Rows title="Prepared Export Receipts" rows={exportRows} empty="No Prepared Export Receipts Were Returned." render={(row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.surface || 'Export'}</h3><span>{row.state || 'Unknown'}</span></div><div className={styles.opsFacts}><Fact label="Rows" value={row.row_count ?? 'Unknown'} /><Fact label="SHA-256" value={row.content_sha256 || 'Unknown'} /><Fact label="Prepared" value={when(row.prepared_at, true)} /><Fact label="Delivery" value="Browser Download Not Confirmed" /></div></article>} />
    <EconomyExport authFetch={authFetch} rows={manifests} columns={[["day", "Day"], ["row_count", "Rows"], ["net_amount", "Net Amount"], ["sha256", "SHA-256"]]} label="Export Manifest Evidence" filenamePrefix="economy-manifests" total={manifests.length} />
    <EconomyExport authFetch={authFetch} rows={restatements} columns={[["day", "Day"], ["restated_by", "Restated By"], ["application", "Application"], ["restated_at", "Restated"]]} label="Export Restatement Evidence" filenamePrefix="economy-manifest-restatements" total={restatements.length} />
    <EconomyExport authFetch={authFetch} rows={digestRows} columns={[["id", "Digest Evidence ID"], ["user_id", "Recipient"], ["created_at", "Recorded"], ["data", "Notification Payload"]]} label="Export Digest Evidence" filenamePrefix="economy-digest-evidence" total={digestRows.length} />
    <EconomyExport authFetch={authFetch} rows={invoiceRows} columns={[["id", "Invoice ID"], ["club_id", "Club"], ["invoice_type", "Type"], ["status", "Status"], ["gross_amount", "Gross Amount"], ["created_at", "Recorded"]]} label="Export Returned Invoices" filenamePrefix="economy-invoices" complete={exportComplete(invoices)} total={invoices?.total} />
    <EconomyExport authFetch={authFetch} rows={jobRows.map((row) => ({ job_name: row.jobName, scheduler: row.scheduler, evidence_state: jobState(row.evidence), last_evidence: row.evidence?.started_at || row.evidence?.created_at || null, status: row.evidence?.status || null }))} columns={[["job_name", "Job"], ["scheduler", "Scheduler"], ["evidence_state", "Evidence State"], ["last_evidence", "Last Evidence"], ["status", "Status"]]} label="Export Job Evidence" filenamePrefix="economy-job-evidence" total={jobRows.length} />
    <PnlProbe authFetch={authFetch} />
  </>;
}

export default function EconomyPanel({ authFetch }) {
  const [group, setGroup] = useState('supply');
  const [velocityHours, setVelocityHours] = useState(24);
  const sections = useMemo(() => group === 'supply' ? ['supply', 'velocity'] : group === 'diamonds' ? ['diamonds'] : group === 'treasury' ? ['treasury'] : group === 'control' ? ['conservation', 'burnin', 'drift'] : group === 'payouts' ? ['rakeback', 'leaderboard', 'bbj', 'promotions', 'abuse'] : ['close', 'digest', 'invoices', 'jobs', 'exports'], [group]);
  const sectionParams = useMemo(() => ({ velocity: { hours: velocityHours } }), [velocityHours]);
  const read = useEconomyRead(authFetch, sections, true, sectionParams);
  return <div className={styles.opsPanel}>
    <header className={styles.opsHeader}><div><h2 className={styles.opsTitle}>Economy Command</h2><p className={styles.opsSubtitle}>Supply, Conservation, Treasury And Payout Evidence With Recorded Close And Export Receipts.</p></div><button type="button" className={styles.btn} onClick={read.load} disabled={read.loading}>Refresh</button></header>
    <nav className={styles.opsSubnav} aria-label="Economy sections">{GROUPS.map(([id, label]) => <button type="button" key={id} className={`${styles.opsSubnavBtn} ${group === id ? styles.opsSubnavActive : ''}`} onClick={() => setGroup(id)}>{label}</button>)}</nav>
    {Object.keys(read.errors).length ? <Note tone="danger">Some Sources Could Not Be Read: {Object.keys(read.errors).join(', ')}.</Note> : null}
    {read.loading ? <div className={styles.stateNote}>Reading Economy Evidence...</div> : group === 'supply' ? <Supply value={read.data.supply} velocity={read.data.velocity} velocityHours={velocityHours} setVelocityHours={setVelocityHours} authFetch={authFetch} /> : group === 'diamonds' ? <Diamonds value={read.data.diamonds} /> : group === 'treasury' ? <Treasury value={read.data.treasury} /> : group === 'control' ? <Control conservation={read.data.conservation} burnin={read.data.burnin} drift={read.data.drift} authFetch={authFetch} /> : group === 'payouts' ? <Payouts rakeback={read.data.rakeback} leaderboard={read.data.leaderboard} bbj={read.data.bbj} promotions={read.data.promotions} abuse={read.data.abuse} authFetch={authFetch} /> : <CloseAndJobs close={read.data.close} digest={read.data.digest} invoices={read.data.invoices} jobs={read.data.jobs} exportsValue={read.data.exports} authFetch={authFetch} />}
  </div>;
}
