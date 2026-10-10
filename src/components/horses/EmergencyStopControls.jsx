import React, { useCallback, useEffect, useRef, useState } from 'react';
import { engineControlScope } from './engineControlScope';
import styles from './shared.module.css';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EmergencyStopControls({ authFetch }) {
  const retainedScope = useRef({ scope: null, generation: 0 });
  let scope;
  try { scope = engineControlScope(authFetch, 'emergency-stops'); }
  catch { scope = null; }
  if (!scope) retainedScope.current.scope = null;
  else if (!retainedScope.current.scope?.isCurrent() || retainedScope.current.scope.storageKey !== scope.storageKey) {
    retainedScope.current = { scope, generation: retainedScope.current.generation + 1 };
  }
  const account = retainedScope.current.scope;
  if (!account) return <p role="alert">The Operator Account Could Not Be Confirmed.</p>;
  return <AccountEmergencyStopControls key={`${account.storageKey}:${retainedScope.current.generation}`} accountScope={account} authFetch={authFetch} />;
}
function AccountEmergencyStopControls({ authFetch, accountScope }) {
  const [rows, setRows] = useState(null), [error, setError] = useState('');
  const [reason, setReason] = useState(''), [intent, setIntent] = useState(null), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const epoch = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scopedFetch = async (url, options = {}) => {
    accountScope.assertCurrent();
    if (!alive.current) throw new Error('view_changed');
    const result = await authFetch(url, { ...options, ...accountScope.options, isCurrent: () => alive.current && accountScope.isCurrent() });
    accountScope.assertCurrent();
    if (!alive.current || result.actorId !== accountScope.options.expectedOperatorId) throw new Error('actor_unknown');
    return result;
  };
  const current = (active) => alive.current && accountScope.isCurrent() && active === epoch.current;

  const storageKey = useRef(null);
  const read = useCallback(async () => {
    const active = epoch.current;
    try { const r = await scopedFetch('/api/horses/emergency-stops'); if (current(active)) {
      if (!UUID.test(r.actorId || '')) throw new Error('actor_unknown');
      const key = `stable-emergency-stop:${r.actorId}`;
      const prior = JSON.parse(localStorage.getItem(key) || 'null'); storageKey.current = key;
      if (prior && ['tournament_registration','positive_issuance','cashout'].includes(prior.path) && UUID.test(prior.opId || '') && typeof prior.stopped === 'boolean' && Number.isSafeInteger(prior.expectedVersion) && prior.expectedVersion >= 0 && typeof prior.reason === 'string' && prior.reason.length >= 10 && prior.reason.length <= 500) { setIntent(prior); setReason(prior.reason); }
      setRows(r.stops); setError('');
    } }
    catch { if (current(active)) { setRows(null); setError('Emergency Stop State Is Unknown. Refresh To Read The Authority.'); } }
  }, [authFetch, accountScope]);
  useEffect(() => { epoch.current += 1; storageKey.current = null; setIntent(null); setReason(''); setMessage(''); setBusy(false); read(); return () => { epoch.current += 1; }; }, [read]);
  const clear = () => { accountScope.assertCurrent(); if (!alive.current) return; localStorage.removeItem(storageKey.current); setIntent(null); };
  const submit = async (row) => {
    if (busy || !storageKey.current || !alive.current || !accountScope.isCurrent()) return;
    const active = epoch.current;
    const request = intent || { path: row.path, stopped: !row.stopped, expectedVersion: row.version, reason: reason.trim(), opId: crypto.randomUUID() };
    setIntent(request); setBusy(true); setError('');
    try {
      localStorage.setItem(storageKey.current, JSON.stringify(request));
      // A retained uncertain operation reads its durable outcome first.
      if (intent) {
        const prior = await scopedFetch(`/api/horses/emergency-stops?opId=${request.opId}`);
        if (!current(active)) return;
        if (prior.operation) {
          if (prior.operation.op_id !== request.opId || prior.operation.path !== request.path || prior.operation.stopped !== request.stopped || prior.operation.result?.ok !== true) throw new Error('The Stored Stop Receipt Could Not Be Confirmed. Keep This Operation ID.');
          setMessage('The Recorded Stop Operation Completed. Current State Has Been Refreshed.'); clear(); await read(); return;
        }
      }
      const r = await scopedFetch('/api/horses/emergency-stops', { method: 'POST', body: JSON.stringify(request) });
      if (!current(active)) return;
      if (r.operation?.ok !== true || r.operation?.op_id !== request.opId) throw new Error('unverified_receipt');
      setMessage(request.stopped ? 'Stop Applied. Earlier Admitted Transactions Finished Before This Receipt.' : 'Stop Released. New Operations May Proceed.');
      clear(); setReason(''); await read();
    } catch (failure) {
      if (!current(active)) return;
      if (failure?.code === 'stop_version_changed' || failure?.code === 'stop_operation_conflict' || failure?.status === 403 || failure?.status === 400) { try { clear(); } catch { /* Keep durable identity when storage is unavailable. */ } await read(); }
      setError(failure?.message || 'Outcome Is Unknown. Keep This Operation And Read Its Receipt Before Retrying.');
    } finally { if (current(active)) setBusy(false); }
  };
  return <section className={styles.opsDetail} aria-labelledby="emergency-stop-title">
    <h3 id="emergency-stop-title" className={styles.opsCardTitle}>Emergency Stops</h3>
    <p className={styles.fieldHint}>Each Stop Applies At The Authoritative Transaction. Existing Hands And Funded Refunds Continue.</p>
    <label className={styles.field}><span className={styles.fieldLabel}>Required Reason</span><input className={styles.input} value={reason} maxLength={500} disabled={busy || !!intent} onChange={(event) => setReason(event.target.value)} /></label>
    {error ? <p role="alert" className={styles.errorNote}>{error}</p> : null}
    {message ? <p role="status" className={styles.stateNote}>{message}</p> : null}
    {intent ? <p role="status" className={styles.fieldHint}>Operation {intent.opId} Is Retained Until Its Outcome Is Known.</p> : null}
    <div className={styles.opsCardsAlways}>{rows?.map((row) => <article className={styles.opsCard} key={row.path}><h4 className={styles.opsCardTitle}>{row.label}</h4><p>{row.stopped === true ? 'Stopped' : row.stopped === false ? 'Open' : 'Unknown'}</p><p className={styles.fieldHint}>{row.exemption}</p><button type="button" className={styles.btn} disabled={busy || !row.writable || (!intent && reason.trim().length < 10) || (!!intent && intent.path !== row.path)} onClick={() => submit(row)}>{intent?.path === row.path ? 'Read Receipt And Retry Same Operation' : row.stopped ? 'Release Stop' : 'Apply Stop'}</button></article>)}</div>
    <button type="button" className={styles.btn} disabled={busy} onClick={read}>Refresh Stop State</button>
  </section>;
}
