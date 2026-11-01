import React, { useEffect, useRef, useState } from 'react';
import { engineControlScope } from './engineControlScope';
import { cancellationIntent } from './tournamentCancellationIntent.mjs';
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
  const [retryReady, setRetryReady] = useState(false);
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
    setRetryReady(false);
    setMessage('Reading Retained Cancellation Storage...');
    (async () => {
      try {
        const actorId = accountScope.options.expectedOperatorId;
        if (!UUID.test(actorId || '')) throw new Error('actor_unknown');
        const key = `stable-tournament-cancel:${actorId}:${event.id}`;
        const prior = await cancellationIntent(key, 'read', null, () => current(active));
        if (!current(active)) return;
        storageKey.current = key;
        setMessage('');
        if (prior) { setIntent(prior); setReason(prior.reason); setMessage('A Previous Operation Is Retained. Read Its Outcome Before Continuing.'); }
        const result = await scopedFetch(`/api/horses/tournament-admin?tournamentId=${event.id}`);
        if (current(active)) setEligibility(result);
      } catch (failure) {
        if (current(active)) { setMessage(''); setError(failure?.message || 'Durable Operation Storage Is Unavailable Or Invalid. Its Contents Are Preserved. No New Request Can Be Sent.'); }
      }
    })();
    return () => { epoch.current += 1; };
  }, [authFetch, event.id, accountScope]);
  const updateStoredIntent = async (request, retain, active) => {
    const result = await cancellationIntent(storageKey.current, retain ? 'retain' : 'resolve', request, () => current(active));
    if (!current(active)) return false;
    setIntent(result);
    return true;
  };
  const readOutcome = async () => {
    if (busy || !intent || !storageKey.current || !accountScope.isCurrent() || !alive.current) return;
    const active = epoch.current;
    setBusy(true); setError(''); setRetryReady(false);
    try {
      const prior = await scopedFetch(`/api/horses/tournament-admin?opId=${intent.opId}`);
      if (!current(active)) return;
      const operation = prior.operation;
      if (operation && (operation.op_id !== intent.opId || operation.tournament_id !== event.id)) throw new Error('Stored Operation Identity Could Not Be Confirmed.');
      if (operation?.state === 'completed') {
        if (operation.result?.receipt?.fully_settled !== true || operation.result?.receipt?.tournament_id !== event.id) throw new Error('Stored Refund Evidence Could Not Be Confirmed. Keep This Operation ID.');
        if (!await updateStoredIntent(intent, false, active)) return; setMessage('Cancellation And Refunds Are Recorded. Event Evidence Has Been Refreshed.'); await onCompleted?.(); return;
      }
      if (operation !== null && operation?.state !== 'pending') throw new Error('Cancellation Outcome Is Unknown. Keep This Operation ID.');
      setRetryReady(true);
      setMessage(operation ? 'The Operation Is Pending. A Retry Requires Current Write Permission And Rechecks Its Approval.' : 'No Operation Receipt Is Recorded. A Retry Must Keep The Same Operation ID.');
    } catch (failure) {
      if (current(active)) setError(failure?.message || 'Cancellation Outcome Is Unknown. Keep This Operation ID.');
    } finally { if (current(active)) setBusy(false); }
  };
  const submit = async () => {
    if (busy || !storageKey.current || !alive.current || !accountScope.isCurrent() || !eligibility?.writable || (intent && !retryReady)) return;
    const active = epoch.current;
    const request = intent || { action: 'cancel_refund', tournamentId: event.id, reason: reason.trim(), opId: crypto.randomUUID() };
    setBusy(true); setError(''); setRetryReady(false);
    try {
      // Persist before dispatch. Lost responses and a closed tab keep identity.
      if (!await updateStoredIntent(request, true, active)) return;
      const r = await scopedFetch('/api/horses/tournament-admin', { method: 'POST', body: JSON.stringify(request) });
      if (!current(active)) return;
      const operation = r.operation;
      if (operation?.op_id !== request.opId || operation?.tournament_id !== event.id) throw new Error('Cancellation Receipt Was Not Confirmed. Keep The Same Operation ID.');
      if (operation.pending === true) { setMessage(`Approval ${operation.approval_id} Is Pending. Decide It In Approvals, Then Return Here And Retry This Operation. No Refund Has Been Applied.`); return; }
      if (operation.state !== 'completed' || operation.receipt?.fully_settled !== true) throw new Error('Refund Evidence Is Unknown. Read The Same Operation Before Retrying.');
      if (!await updateStoredIntent(request, false, active)) return; setMessage('Cancelled And Fully Refunded Through The Authoritative Receipt. Event Evidence Has Been Refreshed.'); await onCompleted?.();
    } catch (failure) {
      if (!current(active)) return;
      if (['cancel_review_changed', 'cancel_operation_conflict', 'cancel_ineligible', 'cancel_approval_refused'].includes(failure?.code)) {
        try { await updateStoredIntent(request, false, active); } catch { /* Preserve the old durable identity if storage fails. */ }
      }
      if (current(active)) setError(failure?.message || 'Cancellation Outcome Is Unknown. Read This Operation Before Retrying.');
    } finally { if (current(active)) setBusy(false); }
  };
  return <section className={styles.opsEvidence} aria-labelledby="cancel-refund-title"><h4 id="cancel-refund-title" className={styles.opsEvidenceTitle}>Cancel And Refund Before Play</h4>
    <p className={styles.fieldHint}>The Existing Authority Returns Paid Entries And Tickets To Their Original Owners. Started Or Awarded Events Must Be Resumed Or Settled.</p>
    {eligibility?.refusal ? <p role="status">{eligibility.refusal}</p> : null}
    {error ? <p className={styles.errorNote} role="alert">{error}</p> : null}{message ? <p className={styles.stateNote} role="status">{message}</p> : null}
    {intent ? <p className={styles.fieldHint}>Retained Operation: {intent.opId}</p> : null}
    <label className={styles.field}><span className={styles.fieldLabel}>Required Cancellation Reason</span><input className={styles.input} maxLength={500} value={reason} disabled={busy || !!intent} onChange={(e) => setReason(e.target.value)} /></label>
    {intent ? <button type="button" className={styles.btn} disabled={busy || !storageKey.current} onClick={readOutcome}>Read Outcome</button> : null}
    <button type="button" className={styles.btn} disabled={busy || !eligibility?.writable || (!!intent && !retryReady) || (!intent && (!eligibility?.eligible || reason.trim().length < 10)) || !storageKey.current} onClick={submit}>{busy ? 'Reading Authoritative Outcome...' : intent ? 'Retry Same Operation' : 'Cancel And Refund This Event'}</button>
  </section>;
}
