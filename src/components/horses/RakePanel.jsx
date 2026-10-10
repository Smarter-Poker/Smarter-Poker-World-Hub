import React, { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from './DataTable';
import exportAllCsv from './exportAllCsv';
import Pager from './Pager';
import EconomyExport from './EconomyExport';
import styles from './shared.module.css';
import { RAKE_COLUMNS, exactDecimalText, exportState, pageOf, rakeUrl, recordExportCompletion } from './floorAdmin';
import { dataOf, economyAdminUrl } from './economyAdmin';
import { findingStability } from './economyModel';

const DIMENSIONS = ['club', 'union', 'stake', 'date'];
const DAYS = 30;
const titleCase = (value) => value[0].toUpperCase() + value.slice(1);

export default function RakePanel({ authFetch }) {
  const [dimension, setDimension] = useState('club');
  const [body, setBody] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [offset, setOffset] = useState(0);
  const [oversight, setOversight] = useState({});
  const [oversightError, setOversightError] = useState('');
  const sequence = useRef(0);

  useEffect(() => () => { sequence.current += 1; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const next = await authFetch(rakeUrl({ days: DAYS, dimension, rakeLimit: 100, rakeOffset: offset }));
      if (current === sequence.current) setBody(next);
    } catch (readError) {
      console.warn('Rake report read failed', readError);
      if (current === sequence.current) setError('The Rake Report Could Not Be Read. Retry.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [authFetch, dimension, offset]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let alive = true;
    Promise.all(['rakelaw', 'rakeback', 'leaderboard', 'bbj', 'promotions', 'abuse'].map(async (section) => {
      try { return [section, dataOf(await authFetch(economyAdminUrl(section)))]; }
      catch { return [section, null]; }
    })).then((entries) => {
      if (!alive) return;
      const next = Object.fromEntries(entries);
      setOversight(next);
      if (entries.some(([, value]) => !value)) setOversightError('Some Economy Oversight Sources Could Not Be Read. Missing Figures Stay Unknown.');
    });
    return () => { alive = false; };
  }, [authFetch]);

  const rake = pageOf(body, 'rake');
  const drift = body?.drift ?? null;
  const freshness = body?.freshness ?? null;
  const window = body?.window ?? null;
  const history = pageOf(body, 'rateHistory');
  const rakeUnknown = body?.state === 'rake.unknown';
  const rakePartial = body?.state === 'rake.partial';
  const rakeStale = body?.state === 'rake.stale';
  const aggregateComplete = body?.rake?.aggregateWindowComplete === true;

  const runExport = async () => {
    setExportResult({ running: true, fetched: 0, total: rake.total });
    try {
      setExportResult(await exportAllCsv({
        filenamePrefix: `stable-rake-${dimension}`,
        authFetch, artifactSurface: 'stable-rake', artifactFilters: { days: DAYS, dimension },
        columns: RAKE_COLUMNS,
        fetchPage: async (offset, limit) => pageOf(await authFetch(rakeUrl({ days: DAYS, dimension, rakeLimit: limit, rakeOffset: offset })), 'rake'),
        onProgress: (progress) => setExportResult({ running: true, ...progress }),
        recordCompletion: (receipt) => recordExportCompletion(authFetch, { section: 'rake', filters: { days: DAYS, dimension, includesHorses: true }, ...receipt }),
      }));
    } catch (exportError) {
      console.warn('Rake export failed', exportError);
      setExportResult({ error: true });
    }
  };
  const exportView = exportState(exportResult);
  const columns = [
    { key: 'label', header: titleCase(dimension), render: (row) => row.label || 'Unknown' },
    { key: 'rake_amount', header: 'Rake', render: (row) => exactDecimalText(row.rake_amount) },
    { key: 'bbj_contribution', header: 'BBJ', render: (row) => exactDecimalText(row.bbj_contribution) },
    { key: 'record_count', header: 'Records', render: (row) => exactDecimalText(row.record_count) },
    { key: 'last_recorded_at', header: 'Latest Record', render: (row) => row.last_recorded_at || 'Unknown' },
  ];
  const staleDays = Array.isArray(freshness?.staleDays) ? freshness.staleDays : [];

  return <section className={styles.panel} aria-labelledby="rake-title">
    <div className={styles.panelHead}><div><h2 id="rake-title" className={styles.panelTitle}>Rake</h2><p className={styles.panelIntro}>Exact Thirty-Day Aggregates By Club, Union, Stake Or UTC Date. Every Report Includes Horses.</p></div><button type="button" className={styles.btn} onClick={load} disabled={loading}>Refresh</button></div>
    <div className={styles.opsDisclosure} role={!drift || drift.state === 'drift.unknown' ? 'alert' : 'status'}><strong>{drift?.state === 'drift.drifted' ? 'Engine And Database Rake Specifications Disagree' : drift?.state === 'drift.ok' ? 'Engine And Database Rake Specifications Agree' : 'Rake Specification Drift Is Unknown'}</strong><span>{drift?.data?.detail || 'The Engine Drift Report Could Not Be Read. Unknown Is Never Rendered As Agreement.'}</span></div>
    {freshness?.state === 'freshness.stale' ? <div className={styles.errorNote} role="alert"><strong>Rake Rollups Are Stale.</strong> Missing UTC Days: {staleDays.join(', ')}. The Aggregate Below Still Comes From The Full Raw-Record Window; No Repair Job Was Triggered.</div> : freshness?.state === 'freshness.unknown' ? <div className={styles.errorNote} role="alert">Rake Rollup Freshness Is Unknown. The Aggregate And Freshness Claims Remain Separate.</div> : <div className={styles.stateNote} role="status">{freshness?.state === 'freshness.fresh' ? 'Every Union Rollup Day In The Checked Window Is Fresh.' : 'No Union-Scoped Rollup Applied To This Window.'}</div>}
    {error ? <div className={styles.errorNote}>{error}</div> : null}

    <div className={styles.rakeDimensionTabs} role="tablist" aria-label="Rake Report Dimension">{DIMENSIONS.map((item) => <button type="button" role="tab" aria-selected={dimension === item} className={styles.btn} key={item} onClick={() => { setOffset(0); setDimension(item); }}>{titleCase(item)}</button>)}</div>
    <div className={styles.opsToolbar}><label className={`${styles.field} ${styles.rakeDimensionSelect}`}><span className={styles.fieldLabel}>Report Dimension</span><select className={styles.select} value={dimension} onChange={(event) => { setOffset(0); setDimension(event.target.value); }}>{DIMENSIONS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label><button type="button" className={`${styles.btn} ${styles.btnGo}`} onClick={runExport} disabled={rakeUnknown || !aggregateComplete || exportResult?.running === true}>Export Full Report</button></div>
    {window ? <div className={styles.opsEvidence} role="status"><h3 className={styles.opsEvidenceTitle}>Report Evidence</h3><div className={styles.opsEvidenceRows}><div><span className={styles.opsFactLabel}>Window</span><span className={styles.opsFactValue}>{window.since} To {window.until}</span></div><div><span className={styles.opsFactLabel}>As Of</span><span className={styles.opsFactValue}>{window.asOf}</span></div><div><span className={styles.opsFactLabel}>Inclusion</span><span className={styles.opsFactValue}>Includes Horses</span></div><div><span className={styles.opsFactLabel}>Source Records</span><span className={styles.opsFactValue}>{exactDecimalText(body?.rake?.windowRecordCount)}</span></div></div></div> : null}
    {exportView.message ? <div className={styles.exportStatus} role={exportView.state === 'export.truncated' ? 'alert' : 'status'}>{exportView.message}</div> : null}
    {!loading && rakeUnknown ? <div className={styles.errorNote} role="alert">Rake Aggregate State Is Unknown. No Empty Window Or Total Is Claimed.</div> : rakePartial ? <div className={styles.errorNote} role="alert">The Aggregate Is Complete, But Freshness, Drift Or Rate-History Evidence Is Partial.</div> : rakeStale ? <div className={styles.errorNote} role="alert">The Report Is Marked Stale Because Named Union Rollup Days Are Missing.</div> : null}

    <div className={styles.opsCards}>{rake.rows.map((row, index) => <article className={styles.opsCard} key={row.id || `${dimension}-${index}`}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.label || 'Unknown'}</h3><span>Includes Horses</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Rake</span><span className={styles.opsFactValue}>{exactDecimalText(row.rake_amount)}</span></div><div><span className={styles.opsFactLabel}>BBJ</span><span className={styles.opsFactValue}>{exactDecimalText(row.bbj_contribution)}</span></div><div><span className={styles.opsFactLabel}>Records</span><span className={styles.opsFactValue}>{exactDecimalText(row.record_count)}</span></div><div><span className={styles.opsFactLabel}>As Of</span><span className={styles.opsFactValue}>{row.as_of || 'Unknown'}</span></div></div><div className={styles.opsFactLabel}>Window: {row.window_start || 'Unknown'} To {row.window_end || 'Unknown'}</div></article>)}</div>
    <div className={styles.opsDesktop}><DataTable rows={rake.rows} columns={columns} loading={loading} empty={rakeUnknown ? 'Rake Aggregate State Is Unknown.' : 'No Rake Was Recorded In This Window.'} caption={`${titleCase(dimension)} Rake Aggregates For ${window?.label || 'The Selected Window'}, As Of ${window?.asOf || 'Unknown'}, Includes Horses`} /></div>
    <Pager offset={rake.offset} limit={rake.limit || 100} count={rake.rows.length} total={rake.total} hasMore={rake.hasMore} loading={loading} noun="Aggregate Rows" onPrevious={() => setOffset(Math.max(0, offset - 100))} onNext={() => setOffset(offset + (rake.limit || 100))} />
    <div className={styles.card}><h3 className={styles.cardTitle}>Rate Change History</h3>{body?.rateHistory?.state === 'history.unknown' ? <div className={styles.errorNote} role="alert">Rate Change History Is Unknown.</div> : history.rows.length === 0 ? <div className={styles.stateNote}>No Rate Change Has Ever Been Filed. This Does Not Prove There Is No Drift.</div> : <DataTable rows={history.rows} columns={[{ key: 'created_at', header: 'Changed' }, { key: 'old_rate', header: 'Old Rate' }, { key: 'new_rate', header: 'New Rate' }, { key: 'notes', header: 'Notes' }]} />}</div>
    <section className={styles.opsDetail} aria-labelledby="rake-law-title">
      <div className={styles.opsDetailHead}><h3 id="rake-law-title" className={styles.opsCardTitle}>Rake Law And Payout Oversight</h3><span>Reporting Only</span></div>
      {oversightError ? <div className={styles.errorNote} role="alert">{oversightError}</div> : null}
      <div className={styles.opsDetailGrid}>
        <div><span className={styles.opsFactLabel}>Maximum Rake</span><span className={styles.opsFactValue}>{exactDecimalText(oversight.rakelaw?.law?.max_rake_percent)}%</span></div>
        <div><span className={styles.opsFactLabel}>Maximum Cap</span><span className={styles.opsFactValue}>{exactDecimalText(oversight.rakelaw?.law?.max_rake_cap_bb)} BB</span></div>
        <div><span className={styles.opsFactLabel}>Heads-Up Percent</span><span className={styles.opsFactValue}>{exactDecimalText(oversight.rakelaw?.law?.heads_up_percent)}%</span></div>
        <div><span className={styles.opsFactLabel}>Over-Spec</span><span className={styles.opsFactValue}>{oversight.rakelaw?.overSpec === 0 ? 'No Hand Was Over-Raked' : oversight.rakelaw?.overSpec ?? 'Unknown'}</span></div>
        <div><span className={styles.opsFactLabel}>Pending Rakeback</span><span className={styles.opsFactValue}>{exactDecimalText(oversight.rakeback?.pendingAmount)}</span></div>
        <div><span className={styles.opsFactLabel}>Pending Rows</span><span className={styles.opsFactValue}>{oversight.rakeback?.pendingCount ?? 'Unknown'}</span></div>
      </div>
      <div className={styles.warnNote}>{oversight.rakelaw?.disclosure || 'Rake Finding Stability Is Unknown.'}</div>
      <div className={styles.opsCardsAlways}>{(oversight.rakelaw?.findings?.rows || []).slice(0, 20).map((row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{row.finding || row.kind || 'Rake Finding'}</h4><span>{findingStability(row)}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Table</span><span className={styles.opsFactValue}>{row.table_id || 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Recorded</span><span className={styles.opsFactValue}>{row.created_at || 'Unknown'}</span></div></div></article>)}</div>
      <EconomyExport authFetch={authFetch} rows={oversight.rakelaw?.findings?.rows || []} columns={[["id", "Finding ID"], ["entity_id", "Entity"], ["stored_balance", "Recorded Rake"], ["ledger_balance", "Expected Rake"], ["created_at", "Recorded"], ["metadata", "Finding Metadata"]]} label="Export Returned Rake Findings" filenamePrefix="rake-law-findings" complete={oversight.rakelaw?.findings?.hasMore !== true && oversight.rakelaw?.findings?.truncated !== true && (oversight.rakelaw?.findings?.total == null || Number(oversight.rakelaw.findings.total) <= (oversight.rakelaw?.findings?.rows || []).length)} total={oversight.rakelaw?.findings?.total} />
      <div className={styles.warnNote}>{oversight.rakeback?.disclosure || 'Rakeback Evidence Is Unknown.'}</div>
      <div className={styles.opsDetailGrid}>
        <div><span className={styles.opsFactLabel}>Periods Returned</span><span className={styles.opsFactValue}>{oversight.rakeback?.periods?.rows?.length ?? 'Unknown'}</span></div>
        <div><span className={styles.opsFactLabel}>Payouts Returned</span><span className={styles.opsFactValue}>{oversight.rakeback?.payouts?.length ?? 'Unknown'}</span></div>
        <div><span className={styles.opsFactLabel}>Settle Runs Returned</span><span className={styles.opsFactValue}>{oversight.rakeback?.runs?.length ?? 'Unknown'}</span></div>
      </div>
      <div className={styles.opsCardsAlways}>{(oversight.rakeback?.runs || []).map((run, index) => <article className={styles.opsCard} key={run.id || index}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>Rakeback Settle Evidence</h4><span>{run.status || 'Unknown'}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Started</span><span className={styles.opsFactValue}>{run.started_at || run.created_at || 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Result Fields</span><span className={styles.opsFactValue}>{run.result && typeof run.result === 'object' ? Object.keys(run.result).length : 'Unknown'}</span></div></div></article>)}</div>
      <EconomyExport authFetch={authFetch} rows={oversight.rakeback?.periods?.rows || []} columns={[["id", "Period ID"], ["period_start", "Period Start"], ["period_end", "Period End"], ["status", "Status"], ["rakeback_amount", "Amount"], ["user_id", "Player"], ["club_id", "Club"]]} label="Export Returned Rakeback Periods" filenamePrefix="rakeback-periods" complete={oversight.rakeback?.periods?.hasMore !== true && oversight.rakeback?.periods?.truncated !== true && (oversight.rakeback?.periods?.total == null || Number(oversight.rakeback.periods.total) <= (oversight.rakeback?.periods?.rows || []).length)} total={oversight.rakeback?.periods?.total} />
      <div className={styles.warnNote}>{oversight.leaderboard?.disclosure || 'Leaderboard Mutability Is Unknown.'}</div>
      <div className={styles.opsCardsAlways}>{(oversight.leaderboard?.payouts || []).map((row, index) => <article className={styles.opsCard} key={row.id || index}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{row.leaderboard_id || 'Leaderboard Payout'}</h4><span>{row.status || 'Recorded'}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Amount</span><span className={styles.opsFactValue}>{exactDecimalText(row.amount ?? row.payout_amount)}</span></div><div><span className={styles.opsFactLabel}>Awarded</span><span className={styles.opsFactValue}>{row.awarded_at || row.created_at || 'Unknown'}</span></div></div></article>)}</div>
      <EconomyExport authFetch={authFetch} rows={oversight.leaderboard?.payouts || []} columns={[["id", "Payout ID"], ["leaderboard_id", "Leaderboard"], ["player_id", "Player"], ["amount", "Amount"], ["status", "Status"], ["awarded_at", "Awarded"]]} label="Export Leaderboard Payouts" filenamePrefix="leaderboard-payouts" total={(oversight.leaderboard?.payouts || []).length} />
      <div className={styles.warnNote}>{oversight.bbj?.disclosure || 'Bad Beat Jackpot State Is Unknown.'}</div>
      <div className={styles.opsCardsAlways}>{(oversight.bbj?.pools || []).map((pool, index) => <article className={styles.opsCard} key={pool.id || index}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{pool.club_id ? 'Club Pool' : 'Union Pool'}</h4><span>{pool.status || 'Unknown'}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Main, Separate</span><span className={styles.opsFactValue}>{exactDecimalText(pool.main_balance)}</span></div><div><span className={styles.opsFactLabel}>Backup, Separate</span><span className={styles.opsFactValue}>{exactDecimalText(pool.backup_balance)}</span></div></div></article>)}</div>
      <EconomyExport authFetch={authFetch} rows={oversight.bbj?.payouts?.rows || []} columns={[["id", "Payout ID"], ["payout_type", "Type"], ["amount", "Amount"], ["status", "Status"], ["created_at", "Recorded"]]} label="Export Returned Jackpot Payouts" filenamePrefix="bbj-payouts" complete={oversight.bbj?.payouts?.hasMore !== true && oversight.bbj?.payouts?.truncated !== true && (oversight.bbj?.payouts?.total == null || Number(oversight.bbj.payouts.total) <= (oversight.bbj?.payouts?.rows || []).length)} total={oversight.bbj?.payouts?.total} />
      <div className={styles.warnNote}>{oversight.abuse?.disclosure || 'Promotion Abuse Detector Liveness Is Unknown.'}</div>
      <div className={styles.stateNote}>Promotion Award Rows: {oversight.promotions?.rows?.length ?? 'Unknown'}. Promotion Awards Are Read-Only Here.</div>
      <EconomyExport authFetch={authFetch} rows={oversight.promotions?.rows || []} columns={[["id", "Award ID"], ["promotion_id", "Promotion"], ["user_id", "Player"], ["amount", "Amount"], ["status", "Status"], ["created_at", "Recorded"]]} label="Export Promotion Awards" filenamePrefix="promotion-awards" total={(oversight.promotions?.rows || []).length} />
    </section>
  </section>;
}
