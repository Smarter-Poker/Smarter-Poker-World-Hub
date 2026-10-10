import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './shared.module.css';
import ConfirmDialog from './ConfirmDialog';
import Pager from './Pager';
import { requestExportArtifact } from './exportArtifactClient';
import { hasPermission } from './operatorPermissions';
import { thresholdDecision } from './approvalModel';
import { dataOf, decimalText, conservationModel, economyAdminUrl } from './economyAdmin';

const PAGE = 50;
const EXPORT_PAGE = 500;
const EXPORT_MAX_PAGES = 200;
const EMPTY_FILTERS = Object.freeze({ asset: '', action: '', origin: '', holderId: '' });
const REGISTER_COLUMNS = Object.freeze([
  ['created_at', 'When'],
  ['action', 'Operation'],
  ['asset', 'Asset'],
  ['holder_type', 'Holder Type'],
  ['holder_label', 'Holder'],
  ['holder_id', 'Holder Id'],
  ['origin', 'Origin'],
  ['amount', 'Amount'],
  ['balance_before', 'Balance Before'],
  ['balance_after', 'Balance After'],
  ['supply_after', 'Net Issued Supply After'],
  ['reason', 'Reason'],
  ['performed_by_label', 'By'],
  ['op_id', 'Operation Id'],
]);

export default function MintPanel({
  authFetch,
  permissions = [],
  policy = null,
  aloneRule = null,
  approvalsAvailable = false,
  onNavigate = () => {},
  showNotification = () => {},
}) {
  const [overview, setOverview] = useState(null);
  const [ledger, setLedger] = useState({ entries: [], total: null, offset: 0 });
  const [targets, setTargets] = useState({ clubs: [], unions: [] });
  const [oversight, setOversight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ action: 'mint', asset: 'chips', target: 'club', targetId: '', amount: '', reason: '' });
  const [confirm, setConfirm] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [opId, setOpId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registerExport, setRegisterExport] = useState(null);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState([]);
  const [pickedPlayer, setPickedPlayer] = useState(null);
  const [playerSearching, setPlayerSearching] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const loadSeqRef = useRef(0);
  const canWrite = hasPermission(permissions, 'money.write');

  const newOpId = useCallback(() => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `mint-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }, []);
  const payloadKey = [form.action, form.asset, form.target, form.targetId, form.amount.trim(), form.reason.trim()].join('|');
  useEffect(() => { setOpId(newOpId()); }, [newOpId, payloadKey]);

  const load = useCallback(async (offset = 0, nextFilters = EMPTY_FILTERS) => {
    const seq = ++loadSeqRef.current;
    setLoading(true); setError('');
    try {
      const ledgerQuery = new URLSearchParams({ section: 'ledger', limit: String(PAGE), offset: String(offset) });
      for (const [key, value] of Object.entries(nextFilters)) if (value) ledgerQuery.set(key, value);
      const [o, l, t, r] = await Promise.all([
        authFetch('/api/horses/mint?section=overview'),
        authFetch(`/api/horses/mint?${ledgerQuery.toString()}`),
        authFetch('/api/horses/mint?section=targets&clubsLimit=500&unionsLimit=500'),
        authFetch(economyAdminUrl('register', { limit: 50, offset })),
      ]);
      if (seq !== loadSeqRef.current) return;
      setOverview(o?.data ?? o); setLedger(l?.data ?? l); setTargets(t?.data ?? t); setOversight(dataOf(r));
    } catch (cause) {
      if (seq === loadSeqRef.current) setError(cause?.message || 'The Mint Could Not Be Read');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [authFetch]);
  useEffect(() => { load(0, EMPTY_FILTERS); }, [load]);

  const rec = overview?.totals?.reconciliation;
  const model = conservationModel(rec);
  const destinationRows = form.asset === 'chips' ? (form.target === 'club' ? targets.clubs : targets.unions) : [];
  const selected = destinationRows.find((row) => row.id === form.targetId);
  const amountValid = form.asset === 'diamonds' ? /^\d+$/.test(form.amount) : /^\d+(?:\.\d{1,2})?$/.test(form.amount);
  const valid = canWrite && amountValid && Number(form.amount) > 0 && form.reason.trim().length >= 10 && form.targetId && opId;

  const searchPlayers = async () => {
    if (playerQuery.trim().length < 2) { setPlayerResults([]); return; }
    setPlayerSearching(true);
    try {
      const response = await authFetch(`/api/horses/mint?section=player_search&q=${encodeURIComponent(playerQuery.trim())}&limit=25`);
      const data = response?.data ?? response;
      setPlayerResults(data?.players || data?.rows || []);
    } catch (cause) {
      setError(cause?.message || 'Player Search Could Not Be Read');
      setPlayerResults([]);
    } finally { setPlayerSearching(false); }
  };

  const stage = () => {
    if (!valid) return;
    setError('');
    const amount = Number(form.amount);
    const balance = selected?.balance ?? pickedPlayer?.balance ?? null;
    setConfirm({
      ...form,
      amount,
      reason: form.reason.trim(),
      opId,
      label: selected?.label || pickedPlayer?.label || form.targetId,
      balance,
      projected: balance === null ? null : Number(balance) + (form.action === 'mint' ? amount : -amount),
      approval: thresholdDecision({ policy, kind: 'mint', amount, asset: form.asset, aloneRule }),
    });
  };
  const reverse = (row) => {
    const target = row.holder_type;
    setForm({
      action: row.action === 'mint' ? 'burn' : 'mint',
      asset: row.asset,
      target,
      targetId: row.holder_id,
      amount: String(row.amount),
      reason: `Reversing ${row.action === 'mint' ? 'Issuance' : 'Retirement'} From Operation ${row.op_id}: `,
    });
    setPickedPlayer(target === 'player' ? { id: row.holder_id, label: row.holder_label, balance: null } : null);
    setReceipt(null);
    setConfirm(null);
    showNotification('Loaded Into The Form. Add Why, Then Review.');
    globalThis.window?.scrollTo?.({ top: 0, behavior: 'smooth' });
  };
  const submit = async () => {
    if (!confirm || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await authFetch('/api/horses/mint', { method: 'POST', body: JSON.stringify(confirm) });
      const data = response?.data ?? response;
      const result = data?.result || {};
      setReceipt({
        ...result,
        pending: data?.pending === true,
        approvalId: data?.approvalId || null,
        action: confirm.action,
        asset: confirm.asset,
        amount: confirm.amount,
        targetLabel: confirm.label,
        targetId: confirm.targetId,
        opId: confirm.opId,
      });
      showNotification(data?.pending ? 'Sent For Approval. Nothing Has Moved Yet.' : result.replayed ? 'Already Done. Nothing Moved Again.' : `${confirm.action === 'mint' ? 'Issued' : 'Retired'} ${decimalText(confirm.amount)} ${confirm.asset}.`);
      setConfirm(null); setForm((old) => ({ ...old, amount: '', reason: '' }));
      if (!data?.pending) await load(0, filters);
    } catch (cause) {
      // Keep the immutable confirmation, including its opId, available for a
      // retry. A lost response can follow a committed write, so rotating the
      // key here could turn one intent into a second money movement.
      setError(cause?.message || 'Operation Outcome Unknown. Retry This Unchanged Confirmation To Reuse Its Operation ID.');
    } finally { setSubmitting(false); }
  };

  const exportRegister = async () => {
    if (registerExport?.running) return;
    setRegisterExport({ running: true });
    try {
      const result = await requestExportArtifact(authFetch, 'mint-register', filters);
      setRegisterExport(result);
    } catch (cause) { setRegisterExport({ error: cause?.message || 'The Export Outcome Could Not Be Confirmed' }); }
  };

  return <div className={styles.opsPanel}>
    <header className={styles.opsHeader}><div><h2 className={styles.opsTitle}>The Mint</h2><p className={styles.opsSubtitle}>Authorized Issuance And Retirement With An Append-Only Register.</p></div><button type="button" className={styles.btn} onClick={() => load(0, filters)} disabled={loading}>Refresh</button></header>
    {error ? <div className={styles.errorNote} role="alert">{error}</div> : null}
    {rec ? <div className={model.balanced ? styles.goodNote : styles.errorNote}><strong>{model.balanced ? 'Every Chip Is Accounted For.' : 'The Register And The Meter Disagree.'}</strong> Register At Meter: {decimalText(rec.register_net_at_meter)}. Meter: {decimalText(rec.meter_total)}. Residue: {decimalText(model.residue)}.</div> : <div className={styles.warnNote}>Conservation Could Not Be Read.</div>}
    <div className={styles.warnNote}>{oversight?.disclosure || 'Issuance Approval Coverage Is Unknown.'} No Issuance Figure Is Labelled Audited, Verified Or Reconciled.</div>
    {receipt ? <section className={receipt.pending ? styles.warnNote : styles.goodNote} aria-label="Mint receipt"><strong>{receipt.pending ? 'Awaiting Approval. Nothing Moved.' : receipt.replayed ? 'Previously Recorded. Nothing Moved Again.' : 'Operation Recorded.'}</strong> {receipt.action === 'mint' ? 'Issued' : 'Retired'} {decimalText(receipt.amount)} {receipt.asset} {receipt.action === 'mint' ? 'To' : 'From'} {receipt.targetLabel}. Operation ID: {receipt.opId}.{receipt.approvalId ? ` Approval ID: ${receipt.approvalId}.` : ''}{receipt.balance_before != null || receipt.balance_after != null ? ` Balance: ${decimalText(receipt.balance_before)} To ${decimalText(receipt.balance_after)}.` : ''}{receipt.pending && approvalsAvailable ? <button type="button" className={styles.btn} onClick={() => onNavigate('approvals')}>Open Approval {receipt.approvalId || ''}</button> : null}</section> : null}
    <div className={styles.opsDetailGrid}>
      <div><span className={styles.opsFactLabel}>Chips Issued</span><span className={styles.opsFactValue}>{decimalText(overview?.totals?.chips_issued)}</span></div>
      <div><span className={styles.opsFactLabel}>Diamonds Issued</span><span className={styles.opsFactValue}>{decimalText(overview?.totals?.diamonds_issued)}</span></div>
      <div><span className={styles.opsFactLabel}>Operations</span><span className={styles.opsFactValue}>{overview?.totals?.mint_operations ?? 'Unknown'}</span></div>
      <div><span className={styles.opsFactLabel}>Register Origin Classes</span><span className={styles.opsFactValue}>{Array.isArray(overview?.totals?.by_origin) ? overview.totals.by_origin.length : 'Unknown'}</span></div>
    </div>
    <section className={styles.opsDetail} aria-label="Mint operation">
      <h3 className={styles.opsCardTitle}>Prepare An Operation</h3>
      {!canWrite ? <div className={styles.warnNote}>Money Write Permission Is Required To Issue Or Retire Value.</div> : null}
      <div className={styles.opsToolbar}>
        <label className={styles.field}><span className={styles.fieldLabel}>Action</span><select className={styles.select} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}><option value="mint">Issue</option><option value="burn">Retire</option></select></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Asset</span><select className={styles.select} value={form.asset} onChange={(e) => { setForm({ ...form, asset: e.target.value, target: e.target.value === 'chips' ? 'club' : 'player', targetId: '' }); setPickedPlayer(null); setPlayerResults([]); setPlayerQuery(''); }}><option value="chips">Chips</option><option value="diamonds">Diamonds</option></select></label>
        {form.asset === 'chips' ? <label className={styles.field}><span className={styles.fieldLabel}>Destination Type</span><select className={styles.select} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value, targetId: '' })}><option value="club">Club Treasury</option><option value="union">Union Bank</option></select></label> : null}
        {form.asset === 'chips' ? <label className={styles.field}><span className={styles.fieldLabel}>Destination</span><select className={styles.select} value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })}><option value="">Pick A Destination</option>{destinationRows.map((row) => <option value={row.id} key={row.id}>{row.label} ({decimalText(row.balance)})</option>)}</select></label> : <div className={styles.field}><span className={styles.fieldLabel}>Player</span><div className={styles.opsActions}><input className={styles.input} value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPlayers(); } }} placeholder="Name, Username Or Player Number" /><button type="button" className={styles.btn} onClick={searchPlayers} disabled={playerSearching || playerQuery.trim().length < 2}>{playerSearching ? 'Searching' : 'Search'}</button></div>{pickedPlayer ? <div className={styles.goodNote}>Selected: {pickedPlayer.label}{pickedPlayer.playerNumber ? ` #${pickedPlayer.playerNumber}` : ''}. Balance: {decimalText(pickedPlayer.balance)} Diamonds.</div> : null}{playerResults.length ? <div className={styles.opsCardsAlways}>{playerResults.map((player) => <button type="button" className={styles.btn} key={player.id} onClick={() => { setPickedPlayer(player); setForm({ ...form, targetId: player.id }); setPlayerResults([]); }}>{player.label}{player.playerNumber ? ` #${player.playerNumber}` : ''}{player.isHorse ? ' | Horse' : ''}</button>)}</div> : null}</div>}
        <label className={styles.field}><span className={styles.fieldLabel}>Amount</span><input className={styles.input} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Reason</span><textarea className={styles.textarea} minLength={10} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Required, At Least 10 Characters" /></label>
      </div>
      <button type="button" className={`${styles.btn} ${styles.btnGo}`} disabled={!valid || submitting} onClick={stage}>Review Operation</button>
    </section>
    <section className={styles.opsDetail} aria-label="Issuance register"><h3 className={styles.opsCardTitle}>Issuance Register</h3><div className={styles.opsToolbar}><label className={styles.field}><span className={styles.fieldLabel}>Asset</span><select className={styles.select} value={filters.asset} onChange={(event) => setFilters({ ...filters, asset: event.target.value })}><option value="">All Assets</option><option value="chips">Chips</option><option value="diamonds">Diamonds</option></select></label><label className={styles.field}><span className={styles.fieldLabel}>Action</span><select className={styles.select} value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}><option value="">All Actions</option><option value="mint">Issued</option><option value="burn">Retired</option></select></label><label className={styles.field}><span className={styles.fieldLabel}>Origin</span><select className={styles.select} value={filters.origin} onChange={(event) => setFilters({ ...filters, origin: event.target.value })}><option value="">All Origins</option>{['operator', 'journal', 'baseline', 'diamond-mint', 'opening-grant', 'restoration', 'seed', 'deletion', 'purchase', 'reward', 'promotion', 'refund', 'adjustment', 'arena', 'spend', 'bridge', 'unclassified'].map((origin) => <option value={origin} key={origin}>{origin}</option>)}</select></label><label className={styles.field}><span className={styles.fieldLabel}>Holder ID</span><input className={styles.input} value={filters.holderId} onChange={(event) => setFilters({ ...filters, holderId: event.target.value.trim() })} placeholder="Optional UUID" /></label><div className={styles.opsActions}><button type="button" className={styles.btn} onClick={() => load(0, filters)} disabled={loading}>Apply Filters</button><button type="button" className={styles.btn} onClick={() => { setFilters(EMPTY_FILTERS); load(0, EMPTY_FILTERS); }} disabled={loading}>Clear</button></div></div><div className={styles.opsExportBox}><div className={styles.warnNote}>Private Export Jobs Record The Actor, Filters, Completeness, SHA-256 And Expiry.</div><button type="button" className={styles.btn} onClick={exportRegister} disabled={registerExport?.running === true}>{registerExport?.running ? `Preparing ${registerExport.fetched || 0} Of ${registerExport.total ?? 'Unknown'} Rows` : `Export Filtered Register (${ledger.total ?? 'Count Unknown'} Rows)`}</button><div className={styles.fieldHint}>Safety Cap: {(20000).toLocaleString()} Rows And 16 MB. The Server Reads The Register. Open Export Files For Status And A Verified Download.</div>{registerExport?.error ? <div className={styles.errorNote} role="alert">{registerExport.error}</div> : null}{registerExport?.queued ? <div className={styles.infoNote} role="status">Export Job {registerExport.jobId} Recorded. Open Export Files For Status.</div> : null}{registerExport?.complete ? <div className={styles.exportStatus} role="status">Prepared {registerExport.exported} Rows.</div> : null}{registerExport?.awaitingAcknowledgement ? <div className={styles.errorNote} role="alert">This Export Is Incomplete. Confirm The Safety-Cap Disclosure Before The Truncated File Is Produced.</div> : null}</div><div className={styles.opsCardsAlways}>{(ledger.entries || []).map((row) => <article className={styles.opsCard} key={row.id}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{row.holder_label || row.holder_id}</h4><span>{row.action} {row.asset}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Amount</span><span className={styles.opsFactValue}>{decimalText(row.amount)}</span></div><div><span className={styles.opsFactLabel}>Origin</span><span className={styles.opsFactValue}>{row.origin || 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Balance</span><span className={styles.opsFactValue}>{decimalText(row.balance_before)} To {decimalText(row.balance_after)}</span></div><div><span className={styles.opsFactLabel}>Net Issued After</span><span className={styles.opsFactValue}>{decimalText(row.supply_after)}</span></div><div><span className={styles.opsFactLabel}>Reason</span><span className={styles.opsFactValue}>{row.reason || 'Not Recorded'}</span></div><div><span className={styles.opsFactLabel}>Performed By</span><span className={styles.opsFactValue}>{row.performed_by_label || 'Not Recorded'}</span></div><div><span className={styles.opsFactLabel}>Operation ID</span><span className={styles.opsFactValue}>{row.op_id || 'Unknown'}</span></div></div>{canWrite ? <button type="button" className={styles.btn} onClick={() => reverse(row)}>Prepare Opposite Operation</button> : null}</article>)}</div><Pager offset={ledger.offset || 0} limit={ledger.limit || PAGE} count={(ledger.entries || []).length} total={ledger.total} loading={loading} label="Register Operations" onPrevious={() => load(Math.max(0, (ledger.offset || 0) - PAGE), filters)} onNext={() => load((ledger.offset || 0) + PAGE, filters)} /></section>
    {confirm ? <ConfirmDialog open title={`Confirm ${confirm.action === 'mint' ? 'Issuance' : 'Retirement'}`} tone={confirm.action === 'mint' ? 'go' : 'danger'} busy={submitting} sticky={submitting} blockEscape={submitting} confirmLabel={confirm.approval?.willRequest ? 'Send For Approval' : confirm.action === 'mint' ? 'Issue Value' : 'Retire Value'} requireTyped={confirm.asset.toUpperCase()} onConfirm={submit} onCancel={() => setConfirm(null)} note="This Is Recorded Permanently And Cannot Be Edited. If A Response Is Lost, Retry This Unchanged Confirmation So The Same Operation ID Is Reused."><p><strong>{confirm.approval?.headline}</strong> {confirm.approval?.detail}</p><p>{confirm.action === 'mint' ? 'Create' : 'Destroy'} <strong>{decimalText(confirm.amount)} {confirm.asset}</strong> {confirm.action === 'mint' ? 'and place it in' : 'from'} <strong>{confirm.label}</strong>.</p>{confirm.balance !== null ? <p>Projected Balance: <strong>{decimalText(confirm.balance)}</strong> Before, <strong>{decimalText(confirm.projected)}</strong> After.</p> : <p>The Current Balance Could Not Be Read, So A Projected Balance Is Not Claimed.</p>}<p>Reason: {confirm.reason}</p><p>Operation ID: {confirm.opId}</p>{error ? <div className={styles.errorNote} role="alert">{error}</div> : null}</ConfirmDialog> : null}

  </div>;
}
