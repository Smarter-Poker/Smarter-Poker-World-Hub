import { hasPermission, PERMISSIONS } from '../../lib/horses/permissions';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './shared.module.css';
import { engineControlScope } from './engineControlScope';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = {
  floor: [
    ['pause', 'Pause All Tables'],
    ['park', 'Park All Tables And Stop New Seating'],
    ['resume', 'Release Operator Floor Hold'],
    ['close_cash', 'Close All Cash Tables After Their Current Hand'],
  ],
  maintenance: [
    ['start', 'Request Next Hourly Maintenance'],
    ['cancel', 'Cancel Unapplied Request'],
    ['end', 'Finish At Original Deadline'],
  ],
};
export default function EngineControlPanel(props) {
  const retainedScope = useRef({ scope: null, generation: 0 });
  let scope;
  try {
    scope = engineControlScope(props.authFetch, props.domain);
  } catch {
    return (
      <p role="status">The Operator Account Could Not Be Confirmed. Commands Are Unavailable.</p>
    );
  }
  if (!retainedScope.current.scope?.isCurrent() || retainedScope.current.scope.storageKey !== scope.storageKey) {
    retainedScope.current = { scope, generation: retainedScope.current.generation + 1 };
  }
  const account = retainedScope.current;
  return <AccountEngineControl key={`${account.scope.storageKey}:${account.generation}`} accountScope={account.scope} {...props} />;
}
function AccountEngineControl({ authFetch, domain, accountScope, permissions = [] }) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const captureScope = () => {
    accountScope.assertCurrent();
    const scope = engineControlScope(
      authFetch,
      domain,
      () => alive.current && accountScope.isCurrent()
    );
    if (scope.storageKey !== accountScope.storageKey)
      throw new Error('The Account Or View Changed. Read The Original Operation.');
    return scope;
  };
  const canWrite = hasPermission(
    permissions,
    domain === 'floor' ? PERMISSIONS.CLUBS_WRITE : PERMISSIONS.SETTINGS_WRITE
  );
  const [action, setAction] = useState(ACTIONS[domain][0][0]);
  const [reason, setReason] = useState('');
  const storageKey = captureScope().storageKey;
  const [operationId, setOperationId] = useState(() => {
    try {
      const retained =
        typeof window === 'undefined' ? '' : window.sessionStorage.getItem(storageKey) || '';
      return UUID.test(retained) ? retained : '';
    } catch {
      return '';
    }
  });
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const capabilitySequence = useRef(0);
  const [capabilityBusy, setCapabilityBusy] = useState(false);
  const refreshCapabilities = useCallback(async () => {
    const sequence = ++capabilitySequence.current;
    let scope;
    try {
      accountScope.assertCurrent();
      scope = engineControlScope(authFetch, domain, () =>
        alive.current && accountScope.isCurrent() && sequence === capabilitySequence.current
      );
    } catch {
      if (alive.current && accountScope.isCurrent()) setAvailable(false);
      return;
    }
    setCapabilityBusy(true);
    setAvailable(false);
    try {
      const value = await authFetch(`/api/horses/engine-control?domain=${domain}&capabilities=1`, scope.options);
      if (scope.isCurrent())
        setAvailable(value.capabilities?.[domain]?.includes(ACTIONS[domain][0][0]) === true);
    } catch {
      if (scope.isCurrent()) setAvailable(false);
    } finally {
      if (scope.isCurrent()) setCapabilityBusy(false);
    }
  }, [authFetch, domain, accountScope]);
  useEffect(() => {
    refreshCapabilities();
    return () => { capabilitySequence.current += 1; };
  }, [refreshCapabilities]);
  const [unknown, setUnknown] = useState(() => Boolean(operationId));
  const read = async () => {
    let scope;
    try {
      scope = captureScope();
      scope.assertCurrent();
    } catch {
      if (alive.current) setError('The Account Or View Changed. Read The Original Operation.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const value = await authFetch(
        `/api/horses/engine-control?domain=${domain}&operationId=${operationId}`,
        scope.options
      );
      if (!scope.isCurrent()) return;
      const absent = value.command === null && value.absent === true && value.operationId === operationId;
      if (!absent && (value.command?.id !== operationId || value.command?.domain !== domain || typeof value.command?.status !== 'string' || !value.command.status)) throw new Error('The Original Engine Receipt Could Not Be Confirmed');
      setReceipt(value.command);
      setUnknown(value.command?.status === 'unknown');
      if (absent)
        setError('This Operation Has No Durable Receipt. A New Operation Can Be Submitted.');
    } catch (failure) {
      if (!scope.isCurrent()) return;
      setError(failure.message || 'Operation Status Is Unknown');
      setUnknown(true);
    } finally {
      if (scope.isCurrent()) setBusy(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    let scope;
    try {
      scope = captureScope();
      scope.assertCurrent();
    } catch {
      if (alive.current) setError('The Account Or View Changed. Read The Original Operation.');
      return;
    }
    const existing = action === 'cancel' || action === 'end';
    const id = existing ? operationId : operationId || crypto.randomUUID();
    if (!UUID.test(id)) {
      setError('A Valid Operation ID Is Required.');
      return;
    }
    setOperationId(id);
    try {
      window.sessionStorage.setItem(storageKey, id);
    } catch {
      /* Durable server receipt remains authoritative. */
    }
    setBusy(true);
    setError('');
    try {
      const value = await authFetch('/api/horses/engine-control', {
        ...scope.options,
        method: 'POST',
        body: JSON.stringify({ domain, action, reason, operationId: id }),
        timeoutMs: 25000,
      });
      if (!scope.isCurrent()) return;
      if (value.command?.id !== id || value.command?.domain !== domain || typeof value.command?.status !== 'string' || !value.command.status) throw new Error('The Submitted Engine Receipt Could Not Be Confirmed');
      setReceipt(value.command);
      setUnknown(value.command?.status === 'unknown');
    } catch (failure) {
      if (!scope.isCurrent()) return;
      setError(failure.message || 'Outcome Unknown. Read This Operation Before Retrying');
      setUnknown(true);
    } finally {
      if (scope.isCurrent()) setBusy(false);
    }
  };
  return (
    <section className={styles.platformFrame} aria-label={`${domain} Operator Commands`}>
      <div className={styles.platformFrameHead}>
        <h3>
          {domain === 'floor' ? 'Global Floor Commands' : 'Authenticated Maintenance Commands'}
        </h3>
        <span>Durable Engine Owner</span>
      </div>
      <p>
        {domain === 'floor'
          ? 'Current Hands Settle Before Parking Or Cash Closure. Cash Closure Returns Each Stack Through Its Occupancy Cashout Owner. Tournament Closure Uses Tournament Cancellation.'
          : 'Requests Join The Next Existing Hourly Announcement. A Request Can Be Cancelled Before Application. End Refuses Before The Original Deadline And Uses The Existing Durable Thaw.'}
      </p>
      {!available ? (
        <p>
          Engine Command Contract Is Unverified. Submissions Remain Unavailable Until Its Durable
          Store And Owner Are Read Back.
        </p>
      ) : null}
      <button className={styles.btn} type="button" disabled={busy || capabilityBusy} onClick={refreshCapabilities}>
        {capabilityBusy ? 'Reading Engine Contract...' : 'Refresh Engine Contract'}
      </button>
      {!canWrite ? (
        <p>Read-Only. An Operator With The Required Permission Must Submit Commands.</p>
      ) : null}
      <form onSubmit={submit}>
        <label>
          Command
          <select
            value={action}
            disabled={busy}
            onChange={(event) => setAction(event.target.value)}
          >
            {ACTIONS[domain].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Audit Reason
          <textarea
            value={reason}
            disabled={busy}
            minLength={10}
            maxLength={500}
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label>
          Operation ID
          <input
            value={operationId}
            disabled={busy || Boolean(receipt) || (unknown && Boolean(operationId))}
            placeholder="Created When Submitted"
            onChange={(event) => setOperationId(event.target.value)}
          />
        </label>
        <button
          className={styles.btn}
          disabled={
            (Boolean(receipt) && action !== 'cancel' && action !== 'end') ||
            !available ||
            !canWrite ||
            busy ||
            unknown ||
            reason.trim().length < 10 ||
            ((action === 'cancel' || action === 'end') && !operationId)
          }
          type="submit"
        >
          {busy ? 'Reading Owner...' : 'Submit Command'}
        </button>
        <button className={styles.btn} type="button" disabled={busy || !operationId} onClick={read}>
          Read Durable Outcome
        </button>
        <button
          className={styles.btn}
          type="button"
          disabled={busy || unknown}
          onClick={() => {
            try {
              captureScope().assertCurrent();
            } catch {
              return;
            }
            setOperationId('');
            try {
              window.sessionStorage.removeItem(storageKey);
            } catch {
              /* Storage unavailable. */
            }
            setReceipt(null);
            setError('');
          }}
        >
          New Operation
        </button>
      </form>
      <div aria-live="polite">
        {error ? <p role="alert">{error}</p> : null}
        {receipt ? (
          <p>
            Operation {receipt.id}: {receipt.status}
            {receipt.announced_at
              ? `; Announcement ${new Date(receipt.announced_at).toLocaleString()}`
              : ''}
          </p>
        ) : null}
      </div>
    </section>
  );
}
