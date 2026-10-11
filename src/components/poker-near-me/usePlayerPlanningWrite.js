import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthUser } from '../../lib/authUtils';
import { mutatePlayerPlan, checkPlanningOperation } from '../../services/pokerNearMePlayerPlanning';

/** Retain an account-scoped operation before writing. Never replay automatically. */
export default function usePlayerPlanningWrite(context, onConfirmed) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  const owner = useRef(null);
  const confirmed = useRef(onConfirmed);
  confirmed.current = onConfirmed;
  const keyFor = useCallback((id) => id ? `pnm-planning-pending:${id}:${context}` : null, [context]);

  useEffect(() => {
    mounted.current = true;
    const restore = () => {
      owner.current = getAuthUser()?.id || null;
      setError(''); setNotice(''); setRetryable(false); setBusy(false); setStorageBlocked(false);
      try {
        const value = JSON.parse(sessionStorage.getItem(keyFor(owner.current)) || 'null');
        setPending(value?.account_id === owner.current && value?.request?.operation_id ? value : null);
      } catch (_) { setPending(null); setStorageBlocked(true); setError('The Retained Request Could Not Be Read. Account Writes Are Paused Until The Original Receipt Can Be Recovered.'); }
    };
    restore();
    const changed = (event) => { if (!event.key || event.key === 'smarter-poker-auth') restore(); };
    window.addEventListener('storage', changed);
    return () => { mounted.current = false; window.removeEventListener('storage', changed); };
  }, [keyFor]);

  const owns = useCallback((record) => mounted.current && owner.current === record.account_id && getAuthUser()?.id === record.account_id, []);
  const finish = useCallback(async (receipt, record) => {
    if (receipt?.operation_id !== record.request.operation_id || receipt.action !== record.request.action || (receipt.action === 'delete' ? receipt.id !== record.request.id : receipt.plan?.id !== record.request.id)) throw new Error('The Original Request Receipt Could Not Be Verified.');
    let cleanupError = false;
    try {
      const stored = JSON.parse(sessionStorage.getItem(keyFor(record.account_id)) || 'null');
      if (stored?.request?.operation_id === record.request.operation_id) sessionStorage.removeItem(keyFor(record.account_id));
    } catch (_) { cleanupError = true; }
    if (!owns(record)) return;
    setPending(null); setRetryable(false); setError(''); setNotice('Your Account Plan Was Saved.');
    if (cleanupError) { setStorageBlocked(true); setError('Your Write Was Recorded. The Local Receipt Could Not Be Cleared; Reload And Check It Before Another Write.'); }
    try { await confirmed.current?.(receipt); }
    catch (_) { if (owns(record)) setError('The Write Was Recorded, But The Latest View Could Not Be Refreshed. Reload To Read It.'); }
  }, [keyFor, owns]);
  const failure = useCallback((cause, record) => {
    if (!owns(record)) return;
    if (cause.confirmedRefusal || (cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status))) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(keyFor(record.account_id)) || 'null');
        if (stored?.request?.operation_id === record.request.operation_id) sessionStorage.removeItem(keyFor(record.account_id));
      } catch (_) { setStorageBlocked(true); }
      setPending(null); setRetryable(false); setError(cause.message);
    } else {
      setPending(record); setRetryable(false); setError('The Result Is Not Confirmed. Check The Original Request Before Saving Again.');
    }
  }, [keyFor, owns]);
  const submit = useCallback(async (request) => {
    if (lock.current || pending || storageBlocked) return;
    const account = getAuthUser()?.id;
    if (!account) { setError('Sign In To Save Plans To Your Account.'); return; }
    let record;
    try {
      record = { account_id: account, request: { ...request, operation_id: crypto.randomUUID() } };
      sessionStorage.setItem(keyFor(account), JSON.stringify(record));
    } catch (_) { setError('This Browser Cannot Retain A Secure Request Receipt. Enable Session Storage Before Saving.'); return; }
    owner.current = account; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await finish(await mutatePlayerPlan(record.request, fetch, record.account_id), record); }
    catch (cause) { failure(cause, record); }
    finally { lock.current = false; if (owns(record)) setBusy(false); }
  }, [failure, finish, keyFor, owns, pending, storageBlocked]);
  const check = useCallback(async () => {
    if (!pending || lock.current || !owns(pending)) return;
    const record = pending; lock.current = true; setBusy(true); setError('');
    try {
      const receipt = await checkPlanningOperation(record.request.operation_id, { kind: 'plan', expectedUserId: record.account_id });
      if (!owns(record)) return;
      if (receipt) await finish(receipt, record);
      else { setRetryable(true); setError('No Committed Receipt Was Found. Retry Only The Original Request With Its Unchanged ID And Details.'); }
    } catch (cause) { if (owns(record)) setError(cause.message || 'The Original Request Could Not Be Checked.'); }
    finally { lock.current = false; if (owns(record)) setBusy(false); }
  }, [finish, owns, pending]);
  const retry = useCallback(async () => {
    if (!pending || !retryable || lock.current || !owns(pending)) return;
    const record = pending; lock.current = true; setBusy(true); setRetryable(false);
    try { await finish(await mutatePlayerPlan(record.request, fetch, record.account_id), record); }
    catch (cause) { failure(cause, record); }
    finally { lock.current = false; if (owns(record)) setBusy(false); }
  }, [failure, finish, owns, pending, retryable]);
  return { submit, check, retry, busy, pending, retryable, error, notice, storageBlocked };
}
