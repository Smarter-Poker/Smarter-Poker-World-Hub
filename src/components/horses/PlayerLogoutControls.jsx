import React, { useEffect, useRef, useState } from 'react';
import { engineControlScope } from './engineControlScope';
import { newRestrictionOpId } from './playerAdmin';
import { logoutIntentKey, validLogoutIntent, recoverPlayerLogout } from './playerLogoutRecovery';
import styles from './shared.module.css';

export default function PlayerLogoutControls(props) {
  const retained = useRef({ scope: null, generation: 0 });
  let scope;
  try { scope = engineControlScope(props.authFetch, 'player-logout'); } catch { scope = null; }
  if (!scope) retained.current.scope = null;
  else if (!retained.current.scope?.isCurrent()) retained.current = { scope, generation: retained.current.generation + 1 };
  if (!retained.current.scope) return <p role="alert">The Operator Account Could Not Be Confirmed.</p>;
  return <ScopedLogout key={`${retained.current.scope.storageKey}:${retained.current.generation}:${props.userId}`} {...props} scope={retained.current.scope} />;
}
function ScopedLogout({ authFetch, userId, enforced, scope, onComplete, canModerate }) {
  const actorId = scope.options.expectedOperatorId;
  const key = logoutIntentKey(actorId, userId);
  const [draft, setDraft] = useState(null), [intent, setIntent] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [retryAllowed, setRetryAllowed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    try {
      const raw = localStorage.getItem(key);
      const stored = raw === null ? null : JSON.parse(raw);
      if (raw !== null && !validLogoutIntent(stored, actorId, userId)) throw new Error('The Stored Logout Decision Could Not Be Confirmed');
      if (stored) setIntent(stored);
    } catch (failure) { setError(failure.message || 'The Original Logout Decision Could Not Be Read'); }
    return () => { alive.current = false; };
  }, [key, actorId, userId]);
  const current = () => alive.current && scope.isCurrent();
  const submit = async (retry = false) => {
    if (busy || !current()) return;
    const original = intent || { actorId, userId, note: draft.note.trim(), opId: draft.opId };
    setBusy(true); setError(''); setRetryAllowed(false);
    try {
      scope.assertCurrent();
      localStorage.setItem(key, JSON.stringify(original));
      setIntent(original); setDraft(null);
      const result = await recoverPlayerLogout(authFetch, { ...scope,
        options: { ...scope.options, isCurrent: current },
        assertCurrent: () => { if (!current()) throw new Error('The Account Or View Changed'); } }, original, !intent || retry);
      if (!current()) return;
      if (result.pending) { setRetryAllowed(result.writable === true && canModerate === true); setMessage('No Receipt Was Found. The Original Decision Is Retained.'); return; }
      localStorage.removeItem(key); setIntent(null);
      setMessage(result.enforced === true ? 'Existing Sessions Were Ended. The Player Can Sign In Again' : 'Enforcement Is Off. Logout Was Recorded And No Session Was Ended');
      onComplete?.();
    } catch (failure) {
      if (current()) setError(`${failure.message || 'Outcome Is Unknown'}. Keep This Operation Id And Read Its Receipt Before Retrying.`);
    } finally { if (current()) setBusy(false); }
  };
  return <div className={styles.card}>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {intent ? <><p role="status">Logout Operation {intent.opId} Is Retained For This Player.</p>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => submit(false)}>Read Logout Receipt</button>
      <button type="button" className={styles.btnDanger} disabled={busy || !retryAllowed || !canModerate} onClick={() => submit(true)}>Retry Same Logout</button></>
      : draft ? <div role="group" aria-label="End Existing Sessions">
        <p>{enforced === true ? 'Existing Sessions Will Be Ended. The Player Can Sign In Again.' : enforced === false ? 'Enforcement Is Off. This Request Will Be Recorded And No Session Will Be Ended.' : 'Enforcement State Is Unknown. The Authority Will Check It Before Acting.'}</p>
        <label className={styles.fieldLabel} htmlFor={`logout-reason-${userId}`}>Reason</label>
        <textarea id={`logout-reason-${userId}`} className={styles.input} value={draft.note} maxLength={2000} disabled={busy} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <button type="button" className={styles.btnDanger} disabled={busy || !canModerate || !draft.note.trim()} onClick={() => submit(true)}>{enforced === true ? 'End Existing Sessions' : 'Record Logout Request'}</button>
        <button type="button" className={styles.btn} disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
      </div> : canModerate ? <button type="button" className={styles.btnDanger} disabled={busy || !!error} onClick={() => setDraft({ note: '', opId: newRestrictionOpId() })}>End Existing Sessions</button> : null}
  </div>;
}
