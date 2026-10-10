import React, { useEffect, useRef, useState } from 'react';
import { engineControlScope } from './engineControlScope';
import styles from './shared.module.css';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default function TournamentCancellationControls({ authFetch, event, onCompleted }) {
  const retainedScope = useRef({ scope: null, generation: 0 });
  let scope;
  try { scope = engineControlScope(authFetch, `tournament-cancel:${event.id}`); }
  catch { scope = null; }
  if (!scope) retainedScope.current.scope = null;
  else if (!retainedScope.current.scope?.isCurrent() || retainedScope.current.scope.storageKey !== scope.storageKey) {
    retainedScope.current = { scope, generation: retainedScope.current.generation + 1 };
  }
  const account = retainedScope.current.scope;
  if (!account) return <p role="alert">The Operator Account Could Not Be Confirmed.</p>;
  return <AccountTournamentCancellationControls key={`${account.storageKey}:${retainedScope.current.generation}`} accountScope={account} authFetch={authFetch} event={event} onCompleted={onCompleted} />;
}
function AccountTournamentCancellationControls({ authFetch, event, onCompleted, accountScope }) {
  const [eligibility, setEligibility] = useState(null), [reason, setReason] = useState('');
  const [intent, setIntent] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const epoch = useRef(0), storageKey = useRef(null);
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

  useEffect(() => {
    const active = ++epoch.current;
    setEligibility(null); setIntent(null); setReason(''); setError(''); setMessage(''); setBusy(false); storageKey.current = null;
    scopedFetch(`/api/horses/tournament-admin?tournamentId=${event.id}`).then((r) => {
      if (!current(active)) return;
      setEligibility(r);
      if (!UUID.test(r.actorId || '')) throw new Error('actor_unknown');
      const key = `stable-tournament-cancel:${r.actorId}:${event.id}`;
      storageKey.current = key;
      const prior = JSON.parse(localStorage.getItem(key) || 'null');
      if (prior?.tournamentId === event.id && UUID.test(prior.opId || '') && prior.action === 'cancel_refund' && typeof prior.reason === 'string' && prior.reason.length >= 10 && prior.reason.length <= 500) { setIntent(prior); setReason(prior.reason); setMessage('A Previous Operation Is Retained. Read Its Outcome Before Continuing.'); }
    }).catch(() => { if (current(active)) setError('Cancellation Eligibility Or Durable Operation Storage Is Unavailable. No New Request Can Be Sent.'); });
    return () => { epoch.current += 1; };
  }, [authFetch, event.id, accountScope]);
  const clear = () => { accountScope.assertCurrent(); if (!alive.current) return; localStorage.removeItem(storageKey.current); setIntent(null); };
  const submit = async () => {
    if (busy || !storageKey.current || !alive.current || !accountScope.isCurrent()) return;
    const active = epoch.current;
    const request = intent || { action: 'cancel_refund', tournamentId: event.id, reason: reason.trim(), opId: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      // Persist before dispatch. Lost responses and a closed tab keep identity.
      localStorage.setItem(storageKey.current, JSON.stringify(request)); setIntent(request);
      if (intent) {
        const prior = await scopedFetch(`/api/horses/tournament-admin?opId=${request.opId}`);
        if (!current(active)) return;
        if (prior.operation?.state === 'completed') {
          if (prior.operation.op_id !== request.opId || prior.operation.tournament_id !== event.id || prior.operation.result?.receipt?.fully_settled !== true) throw new Error('Stored Refund Evidence Could Not Be Confirmed. Keep This Operation ID.');
          clear(); setMessage('Cancellation And Refunds Are Recorded. Event Evidence Has Been Refreshed.'); await onCompleted?.(); return;
        }
      }
      const r = await scopedFetch('/api/horses/tournament-admin', { method: 'POST', body: JSON.stringify(request) });
      if (!current(active)) return;
      const operation = r.operation;
      if (operation?.op_id !== request.opId || operation?.tournament_id !== event.id) throw new Error('Cancellation Receipt Was Not Confirmed. Keep The Same Operation ID.');
      if (operation.pending === true) { setMessage(`Approval ${operation.approval_id} Is Pending. Decide It In Approvals, Then Return Here And Retry This Operation. No Refund Has Been Applied.`); return; }
      if (operation.state !== 'completed' || operation.receipt?.fully_settled !== true) throw new Error('Refund Evidence Is Unknown. Read The Same Operation Before Retrying.');
      clear(); setMessage('Cancelled And Fully Refunded Through The Authoritative Receipt. Event Evidence Has Been Refreshed.'); await onCompleted?.();
    } catch (failure) {
      if (!current(active)) return;
      if (['cancel_review_changed', 'cancel_operation_conflict', 'cancel_ineligible', 'cancel_approval_refused'].includes(failure?.code) || failure?.status === 403 || failure?.status === 400) {
        try { clear(); } catch { /* Preserve the old durable identity if storage fails. */ }
      }
      setError(failure?.message || 'Cancellation Outcome Is Unknown. Read This Operation Before Retrying.');
    } finally { if (current(active)) setBusy(false); }
  };
  return <section className={styles.opsEvidence} aria-labelledby="cancel-refund-title"><h4 id="cancel-refund-title" className={styles.opsEvidenceTitle}>Cancel And Refund Before Play</h4>
    <p className={styles.fieldHint}>The Existing Authority Returns Paid Entries And Tickets To Their Original Owners. Started Or Awarded Events Must Be Resumed Or Settled.</p>
    {eligibility?.refusal ? <p role="status">{eligibility.refusal}</p> : null}
    {error ? <p className={styles.errorNote} role="alert">{error}</p> : null}{message ? <p className={styles.stateNote} role="status">{message}</p> : null}
    {intent ? <p className={styles.fieldHint}>Retained Operation: {intent.opId}</p> : null}
    <label className={styles.field}><span className={styles.fieldLabel}>Required Cancellation Reason</span><input className={styles.input} maxLength={500} value={reason} disabled={busy || !!intent} onChange={(e) => setReason(e.target.value)} /></label>
    <button type="button" className={styles.btn} disabled={busy || !eligibility?.writable || (!intent && (!eligibility?.eligible || reason.trim().length < 10)) || !storageKey.current} onClick={submit}>{busy ? 'Reading Authoritative Outcome...' : intent ? 'Read Outcome And Retry Same Operation' : 'Cancel And Refund This Event'}</button>
  </section>;
}
