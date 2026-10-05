import React, { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from './DataTable';
import Pager from './Pager';
import exportAllCsv from './exportAllCsv';
import styles from './shared.module.css';
import { TOURNAMENT_COLUMNS, clubArenaLink, eventUrl, evidenceEntries, exportState, moneyText, pageOf, recordExportCompletion, tournamentsUrl } from './floorAdmin';

const LIMIT = 100;

function EvidencePanel({ title, value, empty }) {
  const rows = evidenceEntries(value);
  return <section className={styles.opsEvidence}><h4 className={styles.opsEvidenceTitle}>{title}</h4>{rows.length ? <div className={styles.opsEvidenceRows}>{rows.map((row) => <div key={row.key}><span className={styles.opsFactLabel}>{row.label}</span><span className={styles.opsFactValue}>{row.value}</span></div>)}</div> : <span className={styles.fieldHint}>{empty}</span>}</section>;
}

export default function TournamentsPanel({ authFetch }) {
  const [body, setBody] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [offset, setOffset] = useState(0);
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; detailSequence.current += 1; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setError('');
    try { const next = await authFetch(tournamentsUrl({ tournamentsLimit: LIMIT, tournamentsOffset: offset })); if (current === sequence.current) setBody(next); }
    catch (readError) { console.warn('Tournament oversight read failed', readError); if (current === sequence.current) setError('Tournament Oversight Could Not Be Read. Retry.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [authFetch, offset]);
  useEffect(() => { load(); }, [load]);
  const tournaments = pageOf(body, 'tournaments');
  const diverged = body?.divergence?.diverged === true || body?.state === 'tournaments.diverged';
  const unavailable = Array.isArray(body?.failedSources) && body.failedSources.length > 0;
  const runExport = async () => {
    setExportResult({ running: true, fetched: 0, total: tournaments.total });
    try {
      const result = await exportAllCsv({ filenamePrefix: 'stable-tournaments', columns: TOURNAMENT_COLUMNS,
        fetchPage: async (offset, limit) => { const result = pageOf(await authFetch(tournamentsUrl({ tournamentsLimit: limit, tournamentsOffset: offset })), 'tournaments'); return { ...result, rows: result.rows.map((row) => ({ ...row, guarantee: row.guaranteed_prize, registered_count: row.registered_count, overlay: 'Open Event Detail' })) }; },
        onProgress: (progress) => setExportResult({ running: true, ...progress }),
        recordCompletion: (receipt) => recordExportCompletion(authFetch, { section: 'tournaments', filters: { visibility: 'operator_schedule' }, ...receipt }),
      });
      setExportResult(result);
    } catch (exportError) { console.warn('Tournament export failed', exportError); setExportResult({ error: true }); }
  };
  const exportView = exportState(exportResult);
  const openEvent = async (row) => {
    const tournamentId = row.id || row.tournament_id;
    if (!tournamentId) return;
    const current = ++detailSequence.current;
    setDetailLoading(true); setDetailError(''); setDetail(null);
    try {
      const next = await authFetch(eventUrl(tournamentId));
      if (current === detailSequence.current) setDetail(next);
    } catch (readError) {
      console.warn('Tournament event drill-down failed', readError);
      if (current === detailSequence.current) setDetailError('Event Evidence Could Not Be Read. Money Read Permission May Be Required.');
    } finally {
      if (current === detailSequence.current) setDetailLoading(false);
    }
  };
  const closeDetail = () => { detailSequence.current += 1; setDetail(null); setDetailError(''); setDetailLoading(false); };
  const columns = [
    { key: 'name', header: 'Tournament', render: (row) => row.name || row.title || row.id },
    { key: 'status', header: 'State', render: (row) => row.status || 'Unknown' },
    { key: 'field', header: 'Registered', render: (row) => row.current_players ?? 'Not Read' },
    { key: 'guarantee', header: 'Guarantee', render: (row) => moneyText(row.guaranteed_prize ?? row.guarantee) },
    { key: 'pool', header: 'Prize Pool', render: (row) => moneyText(row.prize_pool) },
    { key: 'overlay', header: 'Overlay', render: () => 'Open Event Detail' },
    { key: 'detail', header: 'Evidence', render: (row) => <button type="button" className={styles.btn} onClick={() => openEvent(row)}>View Event Evidence</button> },
    { key: 'manage', header: 'Club Arena', render: (row) => <a className={styles.opsLink} href={clubArenaLink('tournament', row)}>Open Engine-Owned Management</a> },
  ];
  return <section className={styles.panel} aria-labelledby="tournaments-title">
    <div className={styles.panelHead}><div><h2 id="tournaments-title" className={styles.panelTitle}>Tournaments</h2><p className={styles.panelIntro}>Schedule, Field, Overlay Exposure And Payout Audit Reads. Cancellation And Refund Remain Engine-Owned.</p></div><button type="button" className={styles.btn} onClick={load} disabled={loading}>Refresh</button></div>
    <div className={styles.opsDisclosure} role={unavailable ? 'alert' : 'status'}><strong>{diverged ? 'Database And Engine Tournament Counts Disagree' : unavailable ? 'Tournament Oversight Is Partial' : 'Tournament Oversight Is Read-Only'}</strong><span>{diverged ? `Database Live: ${body?.divergence?.databaseActive ?? 'Unknown'}. Engine Live: ${body?.divergence?.engineActive ?? 'Unknown'}.` : unavailable ? 'At Least One Source Could Not Be Read. Missing Figures Stay Unknown.' : 'Payout Audits Are Dry Runs. This Tab Never Cancels, Refunds Or Applies A Payout.'}</span></div>
    <div className={styles.opsDisclosure} role={body?.payoutWindowAuditState === 'unknown' ? 'alert' : 'status'}><strong>Payout Window Audit</strong><span>{body?.payoutWindowAuditState === 'ready' ? `${body.payoutWindowAuditDays} Day Dry Run Completed With Apply Set To False.` : body?.payoutWindowAuditState === 'permission_required' ? 'Money Read Permission Is Required For The Window Audit. The Schedule Remains Available.' : 'The Window Audit Is Unavailable. No Applying Form Was Called.'}</span></div>
    {error ? <div className={styles.errorNote} role="alert">{error}</div> : null}
    {detailLoading ? <div className={styles.stateNote} role="status">Reading Event Evidence...</div> : null}
    {detailError ? <div className={styles.errorNote} role="alert">{detailError}</div> : null}
    {detail ? <section className={styles.opsDetail} aria-labelledby="event-detail-title">
      <div className={styles.opsDetailHead}><div><h3 id="event-detail-title" className={styles.opsCardTitle}>{detail.event?.name || 'Event Evidence'}</h3><span className={styles.fieldHint}>Audit Evidence Only. Cancellation, Refund And Payout Application Remain Engine-Owned.</span></div><button type="button" className={styles.btn} onClick={closeDetail}>Close Detail</button></div>
      <div className={styles.opsDetailGrid}><div><span className={styles.opsFactLabel}>Event State</span><span className={styles.opsFactValue}>{detail.event?.status || 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Registrations</span><span className={styles.opsFactValue}>{detail.registrations ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Overlay Source</span><span className={styles.opsFactValue}>{detail.overlayState === 'recorded' ? 'Recorded' : detail.overlayState === 'not_recorded' ? 'No Overlay Record' : 'Unknown'}</span></div></div>
      <EvidencePanel title="Overlay Evidence" value={detail.overlay} empty={detail.overlayState === 'not_recorded' ? 'No Overlay Record Exists For This Event.' : 'Overlay Evidence Is Unavailable.'} />
      <EvidencePanel title="Cancellation And Refund Receipt" value={detail.cancellationReceipt} empty="No Cancellation Receipt Is Recorded For This Event." />
      <EvidencePanel title="Payout Reconciliation" value={detail.payoutAudit} empty={detail.state === 'event.audit_unavailable' ? 'The Payout Audit Source Is Unavailable.' : 'The Dry-Run Audit Returned No Detail Rows.'} />
      <div className={styles.opsDisclosure} role="status"><strong>Dry Run Only</strong><span>The Server Called The Payout Reconciliation With Apply Set To False. No Chips, Payouts Or Event State Were Changed.</span></div>
      <a className={styles.opsLink} href={clubArenaLink('tournament', detail.event || {})}>Open Engine-Owned Management</a>
    </section> : null}
    <div className={styles.opsToolbar}><span className={styles.fieldHint}>Running, Late Registration And Upcoming Events Are Kept Distinct.</span><button type="button" className={`${styles.btn} ${styles.btnGo}`} onClick={runExport} disabled={exportResult?.running === true}>Export Full Schedule</button></div>
    {exportView.message ? <div className={styles.exportStatus} role={exportView.state === 'export.truncated' ? 'alert' : 'status'}>{exportView.message}</div> : null}
    <div className={styles.opsCards}>{tournaments.rows.map((row) => <article className={styles.opsCard} key={row.id || row.tournament_id}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.name || row.title || 'Unnamed Tournament'}</h3><span>{row.status || 'Unknown'}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Registered</span><span className={styles.opsFactValue}>{row.current_players ?? 'Not Read'}</span></div><div><span className={styles.opsFactLabel}>Guarantee</span><span className={styles.opsFactValue}>{moneyText(row.guaranteed_prize ?? row.guarantee)}</span></div><div><span className={styles.opsFactLabel}>Prize Pool</span><span className={styles.opsFactValue}>{moneyText(row.prize_pool)}</span></div><div><span className={styles.opsFactLabel}>Overlay</span><span className={styles.opsFactValue}>Open Event Detail</span></div></div><div className={styles.opsActions}><button type="button" className={styles.btn} onClick={() => openEvent(row)}>View Event Evidence</button><a className={styles.opsLink} href={clubArenaLink('tournament', row)}>Open Engine-Owned Management</a></div></article>)}</div>
    <div className={styles.opsDesktop}><DataTable rows={tournaments.rows} columns={columns} loading={loading} empty={body?.state === 'tournaments.empty_none_scheduled' ? 'No Tournaments Are Scheduled.' : 'No Tournament Rows Are Available.'} caption="All Tournaments, Including Horse-Only Fields" /></div>
    <Pager offset={tournaments.offset} limit={tournaments.limit || LIMIT} count={tournaments.rows.length} total={tournaments.total} hasMore={tournaments.hasMore} loading={loading} noun="Tournaments" onPrevious={() => setOffset(Math.max(0, offset - LIMIT))} onNext={() => setOffset(offset + LIMIT)} />
  </section>;
}
