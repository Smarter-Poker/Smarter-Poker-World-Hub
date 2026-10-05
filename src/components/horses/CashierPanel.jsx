import React, { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from './DataTable';
import ConfirmDialog from './ConfirmDialog';
import exportAllCsv from './exportAllCsv';
import styles from './shared.module.css';
import { retainCashoutTerminalIntent } from '../../lib/club-arena/cashoutTerminalIntent.mjs';
import {
  CASHIER_COLUMNS, cashoutsUrl, chipRequestsUrl, clubArenaLink, exportState,
  decideChipRequest, moneyText, pageOf, recordExportCompletion,
} from './floorAdmin';

const LIMIT = 50;
const STATUS_FILTERS = [['pending', 'Pending'], ['', 'All States'], ['approved', 'Approved'], ['cancelled', 'Cancelled']];
const AGE_FILTERS = [['', 'Any Age'], ['recent', 'Under 24 Hours'], ['warning', '24 To 48 Hours'], ['overdue', 'Over 48 Hours']];

function ageLabel(row) {
  if (row.age_hours === null || row.age_hours === undefined) return 'Age Unknown';
  return `${row.age_hours} Hours, ${row.sla_state === 'overdue' ? 'Overdue' : row.sla_state === 'warning' ? 'Approaching SLA' : 'Within SLA'}`;
}

function QueueCards({ rows, kind, selected, toggle, selectionMode, beginSingleCancel, requestChipDecision, decisionRunning }) {
  return <div className={styles.opsCards}>{rows.map((row) => <article className={styles.opsCard} key={`${kind}-${row.id}`}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.player_name || row.player_id || row.requester_id || 'Unknown Player'}</h3><span>{row.status || 'Unknown'}</span></div>{selectionMode ? <label className={styles.checkRow}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} /><span>Select For Cancellation Review</span></label> : null}<div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Queue</span><span className={styles.opsFactValue}>{kind}</span></div><div><span className={styles.opsFactLabel}>Amount</span><span className={styles.opsFactValue}>{moneyText(row.amount)}</span></div><div><span className={styles.opsFactLabel}>Age</span><span className={styles.opsFactValue}>{ageLabel(row)}</span></div><div><span className={styles.opsFactLabel}>Club</span><span className={styles.opsFactValue}>{row.club_id || 'Unknown'}</span></div></div><div className={styles.opsActions}>{kind === 'Cashout' && ['pending', 'requested'].includes(row.status) ? <button type="button" className={styles.btn} onClick={() => beginSingleCancel(row)}>Review Cancellation</button> : null}{kind === 'Chip Request' && row.status === 'pending' ? <><button type="button" className={`${styles.btn} ${styles.btnGo}`} disabled={decisionRunning === row.id} onClick={() => requestChipDecision(row, 'approve')}>Approve And Fund Club</button><button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={decisionRunning === row.id} onClick={() => requestChipDecision(row, 'deny')}>Deny Request</button></> : null}<a className={styles.opsLink} href={clubArenaLink('cashier', row)}>Open Authoritative Cashier</a></div></article>)}</div>;
}

function Pager({ page, setOffset }) {
  const start = page.rows.length ? page.offset + 1 : 0;
  const end = page.offset + page.rows.length;
  return <div className={styles.pager}><button type="button" className={styles.pagerBtn} disabled={page.offset <= 0} onClick={() => setOffset(Math.max(0, page.offset - LIMIT))}>Previous</button><span className={styles.pagerInfo}>{start} To {end} Of {page.total ?? 'Unknown'}</span><button type="button" className={styles.pagerBtn} disabled={!page.hasMore} onClick={() => setOffset(page.offset + LIMIT)}>Next</button></div>;
}

function SelectedAuthority({ rows, selected, running, confirmCancellation, clearSelection, outcomes }) {
  const chosen = rows.filter((row) => selected.has(row.id));
  if (!chosen.length) return null;
  return <div className={styles.opsDisclosure} role="alert"><strong>Confirm {chosen.length} Cashout {chosen.length === 1 ? 'Cancellation' : 'Cancellations'}</strong><span>Each Request Is Sent Separately Through The Existing Cashier Authority, Settlement Lock, Freeze Guard, Idempotency Receipt And Audit Trail. No Bulk Approval Is Available.</span><div className={styles.opsCardsAlways}>{chosen.map((row) => <div key={row.id} className={styles.opsFactValue}>{row.id}: {moneyText(row.amount)} Chips, Club {row.club_id || 'Unknown'}</div>)}</div><div className={styles.opsActions}><button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={running} onClick={() => confirmCancellation(chosen)}>{running ? 'Cancelling One At A Time...' : 'Confirm Listed Cancellations'}</button><button type="button" className={styles.btn} disabled={running} onClick={clearSelection}>Keep Requests Pending</button></div>{outcomes?.length ? <div className={styles.opsCardsAlways}>{outcomes.map((outcome) => <div key={outcome.id} className={outcome.ok ? styles.stateNote : styles.errorNote}>{outcome.id}: {outcome.ok ? 'Cancelled And Chips Returned' : outcome.message}</div>)}</div> : null}</div>;
}

export default function CashierPanel({ authFetch, operatorId }) {
  const [cashouts, setCashouts] = useState(null); const [chips, setChips] = useState(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [status, setStatus] = useState('pending'); const [age, setAge] = useState('');
  const [cashoutOffset, setCashoutOffset] = useState(0); const [chipOffset, setChipOffset] = useState(0);
  const [cashoutSelected, setCashoutSelected] = useState(new Set()); const [chipSelected, setChipSelected] = useState(new Set());
  const [cashoutSelectionMode, setCashoutSelectionMode] = useState(false);
  const [cancelState, setCancelState] = useState({ running: false, outcomes: [] });
  const [chipDecision, setChipDecision] = useState({ runningId: null, message: '', error: '' });
  const [chipConfirm, setChipConfirm] = useState(null);
  const [cashoutExport, setCashoutExport] = useState(null); const [chipExport, setChipExport] = useState(null);
  const sequence = useRef(0); useEffect(() => () => { sequence.current += 1; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setError('');
    const filter = { ...(status ? { status } : {}), ...(age ? { age } : {}) };
    const results = await Promise.allSettled([
      authFetch(cashoutsUrl({ ...filter, cashoutsLimit: LIMIT, cashoutsOffset: cashoutOffset })),
      authFetch(chipRequestsUrl({ ...filter, chip_requestsLimit: LIMIT, chip_requestsOffset: chipOffset })),
    ]);
    if (current !== sequence.current) return;
    if (results[0].status === 'fulfilled') setCashouts(results[0].value); else { setCashouts(null); console.warn('Cashout queue read failed', results[0].reason); }
    if (results[1].status === 'fulfilled') setChips(results[1].value); else { setChips(null); console.warn('Chip request queue read failed', results[1].reason); }
    if (results.some((result) => result.status === 'rejected')) setError(results.every((result) => result.status === 'rejected') ? 'Neither Cashier Queue Could Be Read. Retry.' : 'One Cashier Queue Could Not Be Read. The Available Queue Is Shown.');
    setLoading(false);
  }, [age, authFetch, cashoutOffset, chipOffset, status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCashoutOffset(0); setChipOffset(0); setCashoutSelected(new Set()); setChipSelected(new Set()); }, [age, status]);
  const cashoutPage = pageOf(cashouts, 'queue'); const chipPage = pageOf(chips, 'queue');
  const cashoutsUnknown = cashouts?.state === 'queue.unknown'; const chipsUnknown = chips?.state === 'queue.unknown';
  const toggle = (setter) => (id) => setter((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const beginSingleCancel = (row) => { setCashoutSelectionMode(true); setCashoutSelected(new Set([row.id])); setCancelState({ running: false, outcomes: [] }); };
  const cancelCashouts = async (rows) => {
    if (!operatorId || cancelState.running) return;
    setCancelState({ running: true, outcomes: [] });
    const outcomes = [];
    for (const row of rows) {
      try {
        const note = 'Cancelled by platform operator';
        const operationId = await retainCashoutTerminalIntent({ actorId: operatorId, clubId: row.club_id, cashoutId: row.id, action: 'cancel', note }, { storage: globalThis.localStorage, locks: globalThis.navigator?.locks, randomUUID: () => globalThis.crypto.randomUUID(), isCurrent: () => true });
        const result = await authFetch('/api/club-arena/approve-cashout', { method: 'POST', headers: { 'X-Idempotency-Key': operationId }, body: JSON.stringify({ cashoutId: row.id, clubId: row.club_id, action: 'cancel', note, expectedActorId: operatorId }) });
        if (result?.receipt?.operationId !== operationId || result?.receipt?.request?.id !== row.id || result?.receipt?.cashier?.actor_user_id !== operatorId || result?.receipt?.cashier?.event_kind !== 'decline') throw new Error('Cancellation Receipt Could Not Be Confirmed. Retain This Request And Check Its Status.');
        outcomes.push({ id: row.id, ok: true });
      } catch (cancelError) {
        outcomes.push({ id: row.id, ok: false, message: cancelError?.message || 'Outcome Unknown. Check The Request Before Retrying.' });
      }
    }
    setCancelState({ running: false, outcomes });
    setCashoutSelected(new Set(outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.id)));
    await load();
  };
  const exportQueue = async (kind) => {
    const isCashout = kind === 'cashouts'; const setResult = isCashout ? setCashoutExport : setChipExport;
    const section = isCashout ? 'cashouts' : 'chip_requests';
    setResult({ running: true, fetched: 0, total: isCashout ? cashoutPage.total : chipPage.total });
    try {
      const result = await exportAllCsv({
        filenamePrefix: `stable-${kind}-${status || 'all'}`, columns: CASHIER_COLUMNS,
        fetchPage: async (offset, limit) => {
          const filters = { ...(status ? { status } : {}), ...(age ? { age } : {}) };
          const url = isCashout ? cashoutsUrl({ ...filters, cashoutsLimit: limit, cashoutsOffset: offset }) : chipRequestsUrl({ ...filters, chip_requestsLimit: limit, chip_requestsOffset: offset });
          const page = pageOf(await authFetch(url), 'queue');
          return { ...page, rows: page.rows.map((row) => ({ ...row, kind: isCashout ? 'Cashout' : 'Chip Request', player_name: row.player_name || row.player_id || row.requester_id || 'Unknown' })) };
        },
        onProgress: (progress) => setResult({ running: true, ...progress }),
        recordCompletion: (receipt) => recordExportCompletion(authFetch, { section, filters: { status: status || 'all', age: age || 'any' }, ...receipt }),
      });
      setResult(result);
    } catch (exportError) { console.warn(`${kind} export failed`, exportError); setResult({ error: true }); }
  };
  const cashoutExportView = exportState(cashoutExport); const chipExportView = exportState(chipExport);
  const submitChipDecision = async (row, decision) => {
    if (!row?.id || chipDecision.runningId) return;
    setChipDecision({ runningId: row.id, message: '', error: '' });
    try {
      const result = await decideChipRequest(authFetch, { requestId: row.id, decision });
      setChipConfirm(null);
      setChipDecision({ runningId: null, message: result?.pending === true ? 'Sent For Approval. The Request Is Still Pending And No Chips Moved.' : `Request ${result?.status === 'approved' ? 'Approved And Funded' : 'Denied'}.`, error: '' });
      await load();
    } catch (decisionError) {
      setChipDecision({ runningId: null, message: '', error: decisionError?.message || 'The Outcome Could Not Be Confirmed. Reload The Request And Club Ledger Before Retrying.' });
    }
  };
  const requestChipDecision = (row, decision) => setChipConfirm({ row, decision });
  const columns = (selected, toggleRow, selectionMode, kind) => [...(selectionMode ? [{ key: 'select', header: 'Select', render: (row) => <input aria-label={`Select ${row.id}`} type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} /> }] : []), { key: 'player', header: 'Player', render: (row) => row.player_name || row.player_id || row.requester_id || 'Unknown' }, { key: 'status', header: 'State' }, { key: 'age', header: 'Age And SLA', render: ageLabel }, { key: 'amount', header: 'Amount', render: (row) => moneyText(row.amount) }, { key: 'open', header: 'Authority', render: (row) => kind === 'cashout' && ['pending', 'requested'].includes(row.status) ? <button type="button" className={styles.btn} onClick={() => beginSingleCancel(row)}>Review Cancellation</button> : kind === 'chip' && row.status === 'pending' ? <div className={styles.opsActions}><button type="button" className={styles.btn} disabled={chipDecision.runningId === row.id} onClick={() => requestChipDecision(row, 'approve')}>Approve</button><button type="button" className={styles.btn} disabled={chipDecision.runningId === row.id} onClick={() => requestChipDecision(row, 'deny')}>Deny</button></div> : <a className={styles.opsLink} href={clubArenaLink('cashier', row)}>Open Cashier</a> }];
  const cashoutToggle = toggle(setCashoutSelected); const chipToggle = toggle(setChipSelected);
  return <section className={styles.panel} aria-labelledby="cashier-title">{chipConfirm ? <ConfirmDialog title={chipConfirm.decision === 'approve' ? 'Approve And Fund Chip Request' : 'Deny Chip Request'} busy={chipDecision.runningId === chipConfirm.row.id} sticky={chipDecision.runningId === chipConfirm.row.id} blockEscape={chipDecision.runningId === chipConfirm.row.id} confirmLabel={chipConfirm.decision === 'approve' ? 'Approve And Fund Club' : 'Deny Request'} tone={chipConfirm.decision === 'approve' ? 'go' : 'danger'} requireTyped={chipConfirm.decision === 'approve' ? 'FUND' : null} onConfirm={() => submitChipDecision(chipConfirm.row, chipConfirm.decision)} onCancel={() => setChipConfirm(null)}><p><strong>{moneyText(chipConfirm.row.amount)} Chips</strong></p><p>{chipConfirm.decision === 'approve' ? 'The Club Treasury Will Be Funded And The Request Will Close In One Transaction. Threshold Policy May Hold This For Another Operator.' : 'The Request Will Be Marked Declined. No Chips Will Move.'}</p><p>Club: {chipConfirm.row.club_id || 'Unknown'}</p></ConfirmDialog> : null}<div className={styles.panelHead}><div><h2 id="cashier-title" className={styles.panelTitle}>Cashier</h2><p className={styles.panelIntro}>Measured Queues With Paging, Age And SLA. Decisions Stay On Existing Club Arena Authority.</p></div><button type="button" className={styles.btn} onClick={load} disabled={loading}>Refresh</button></div>
    <div className={styles.opsDisclosure} role={error ? 'alert' : 'status'}><strong>{error ? 'Cashier Coverage Is Partial Or Unknown' : 'Read Here, Decide In Club Arena'}</strong><span>A Healthy Empty Queue Is Not The Same As An Unread Queue. Stable Admin Does Not Create A Second Money Path.</span></div>{error ? <div className={styles.errorNote} role="alert">{error}</div> : null}
    <div className={styles.opsToolbar}><label className={styles.field}><span className={styles.fieldLabel}>State</span><select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_FILTERS.map(([value, label]) => <option key={label} value={value}>{label}</option>)}</select></label><label className={styles.field}><span className={styles.fieldLabel}>Age And SLA</span><select className={styles.select} value={age} onChange={(event) => setAge(event.target.value)}>{AGE_FILTERS.map(([value, label]) => <option key={label} value={value}>{label}</option>)}</select></label></div>
    <div className={styles.card}><div className={styles.opsCardHead}><h3 className={styles.cardTitle}>Cashout Requests</h3><div className={styles.opsActions}><button type="button" className={styles.btn} onClick={() => { setCashoutSelectionMode((value) => !value); setCashoutSelected(new Set()); setCancelState({ running: false, outcomes: [] }); }}>{cashoutSelectionMode ? 'Exit Selection Mode' : 'Select Cancellations'}</button><button type="button" className={styles.btn} onClick={() => exportQueue('cashouts')} disabled={cashoutsUnknown || cashoutExport?.running === true}>Export Filtered Cashouts</button></div></div>{cashoutExportView.message ? <div className={styles.exportStatus} role={cashoutExportView.state === 'export.truncated' ? 'alert' : 'status'}>{cashoutExportView.message}</div> : null}{!loading && cashoutsUnknown ? <div className={styles.errorNote} role="alert">Cashout Queue State Is Unknown. No Empty Result Is Claimed.</div> : !loading && cashouts && cashoutPage.rows.length === 0 ? <div className={styles.stateNote}>{cashouts.state === 'queue.empty_none_ever' ? 'No Cashout Request Has Ever Been Recorded.' : 'No Cashout Request Matches These Filters.'}</div> : null}<SelectedAuthority rows={cashoutPage.rows} selected={cashoutSelected} running={cancelState.running} outcomes={cancelState.outcomes} confirmCancellation={cancelCashouts} clearSelection={() => { setCashoutSelected(new Set()); setCancelState({ running: false, outcomes: [] }); }} /><QueueCards rows={cashoutPage.rows} kind="Cashout" selected={cashoutSelected} toggle={cashoutToggle} selectionMode={cashoutSelectionMode} beginSingleCancel={beginSingleCancel} /><div className={styles.opsDesktop}><DataTable rows={cashoutPage.rows} columns={columns(cashoutSelected, cashoutToggle, cashoutSelectionMode, 'cashout')} loading={loading} empty={cashoutsUnknown ? 'Cashout Queue State Is Unknown.' : 'No Cashout Request Matches These Filters.'} /></div><Pager page={cashoutPage} setOffset={setCashoutOffset} /></div>
    <div className={styles.card}><div className={styles.opsCardHead}><h3 className={styles.cardTitle}>Chip Requests</h3><button type="button" className={styles.btn} onClick={() => exportQueue('chip-requests')} disabled={chipsUnknown || chipExport?.running === true}>Export Filtered Chip Requests</button></div>{chipExportView.message ? <div className={styles.exportStatus} role={chipExportView.state === 'export.truncated' ? 'alert' : 'status'}>{chipExportView.message}</div> : null}{chipDecision.message ? <div className={styles.stateNote} role="status">{chipDecision.message}</div> : null}{chipDecision.error ? <div className={styles.errorNote} role="alert">{chipDecision.error}</div> : null}{!loading && chipsUnknown ? <div className={styles.errorNote} role="alert">Chip Request Queue State Is Unknown. No Empty Result Is Claimed.</div> : !loading && chips && chipPage.rows.length === 0 ? <div className={styles.stateNote}>{chips.state === 'queue.empty_none_ever' ? 'No Chip Request Has Ever Been Recorded.' : 'No Chip Request Matches These Filters.'}</div> : null}<div className={styles.opsDisclosure} role="status"><strong>One Atomic Decision Per Request</strong><span>Approval Funds The Club Treasury And Closes The Request In One Database Transaction. Threshold Policy Can Hold It For A Second Operator. Denial Moves No Chips.</span></div><QueueCards rows={chipPage.rows} kind="Chip Request" selected={chipSelected} toggle={chipToggle} selectionMode={false} beginSingleCancel={() => {}} requestChipDecision={requestChipDecision} decisionRunning={chipDecision.runningId} /><div className={styles.opsDesktop}><DataTable rows={chipPage.rows} columns={columns(chipSelected, chipToggle, false, 'chip')} loading={loading} empty={chipsUnknown ? 'Chip Request Queue State Is Unknown.' : 'No Chip Request Matches These Filters.'} /></div><Pager page={chipPage} setOffset={setChipOffset} /></div>
  </section>;
}
