import React, { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from './DataTable';
import exportAllCsv from './exportAllCsv';
import Pager from './Pager';
import styles from './shared.module.css';
import { RAKE_COLUMNS, exactDecimalText, exportState, pageOf, rakeUrl, recordExportCompletion } from './floorAdmin';

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
  </section>;
}
