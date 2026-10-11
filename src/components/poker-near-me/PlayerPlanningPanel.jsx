import { useCallback, useEffect, useId, useState } from 'react';
import { getAuthUser } from '../../lib/authUtils';
import { listPlayerPlans } from '../../services/pokerNearMePlayerPlanning';
import { readPendingPreference, checkPendingPreference, retryPendingPreference } from '../../services/pokerNearMePreferences';
import { buildSavedSearchUrl } from '../../lib/poker-near-me/playerPlanning';
import { PokerNearMePanelShell } from './PokerNearMeConsole';
import usePlayerPlanningWrite from './usePlayerPlanningWrite';
import styles from './PlayerPlanningPanel.module.css';

export function PlanningButton(props) { return <button type="button" className={styles.button} {...props} />; }
export function PlanningWriteState({ writer }) {
  return <>
    {writer.error && <p className={`${styles.copy} ${styles.error}`} role="alert">{writer.error}</p>}
    {writer.notice && <p className={styles.copy} role="status">{writer.notice}</p>}
    {writer.pending && <div className={styles.item}>
      <p className={styles.copy}>Unconfirmed Request: {writer.pending.request.operation_id}</p>
      <PlanningButton onClick={writer.check} disabled={writer.busy}>Check Original Request</PlanningButton>
      {writer.retryable && <PlanningButton onClick={writer.retry} disabled={writer.busy}>Retry Original Request</PlanningButton>}
    </div>}
  </>;
}

export function SavePlayerPlan({ kind, document, context, defaultName = '', onSaved }) {
  const [name, setName] = useState(defaultName.slice(0, 80));
  const id = useId();
  const writer = usePlayerPlanningWrite(context, onSaved);
  const submit = async (event) => {
    event.preventDefault();
    await writer.submit({ action: 'create', id: crypto.randomUUID(), kind, name: (name || defaultName).trim(), document });
  };
  return <div className={styles.body} data-player-planning="save">
    <form onSubmit={submit} className={styles.item}>
      <label className={styles.field} htmlFor={id}>Private Plan Name
        <span className={styles.well}><input id={id} className={styles.input} maxLength={80} required value={name} placeholder={defaultName.slice(0, 80)} onChange={(event) => setName(event.target.value)} disabled={writer.busy || !!writer.pending} /></span>
      </label>
      <PlanningButton type="submit" disabled={writer.busy || !!writer.pending || writer.storageBlocked}>{writer.busy ? 'Saving...' : kind === 'search' ? 'Save Search To Account' : 'Save Trip To Account'}</PlanningButton>
    </form>
    <PlanningWriteState writer={writer} />
  </div>;
}

export function PreferenceRecovery({ userId }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const refresh = useCallback(() => {
    setPending(null); setError(''); setRetryable(false); setBusy(false);
    if (getAuthUser()?.id !== userId) return;
    try { setPending(readPendingPreference(userId)); } catch (cause) { setError(cause.message); }
  }, [userId]);
  useEffect(() => { refresh(); window.addEventListener('pnm-preference-request', refresh); window.addEventListener('storage', refresh); return () => { window.removeEventListener('pnm-preference-request', refresh); window.removeEventListener('storage', refresh); }; }, [refresh]);
  const recover = async (retry = false) => {
    if (busy || !pending || getAuthUser()?.id !== userId) return;
    setBusy(true); setError('');
    try {
      const receipt = await (retry ? retryPendingPreference(userId) : checkPendingPreference(userId));
      if (getAuthUser()?.id !== userId) return;
      if (receipt) { setPending(null); setRetryable(false); setError('Original Preference Write Confirmed. Reload To Read The Current Settings.'); }
      else { setRetryable(true); setError('No Committed Receipt Found. You May Retry Only The Original Preference Request.'); }
    } catch (cause) { if (getAuthUser()?.id === userId) setError(cause.message); }
    finally { if (getAuthUser()?.id === userId) setBusy(false); }
  };
  if (!pending && !error) return null;
  return <div className={styles.body} data-player-planning="preferences">
    <h3 className={styles.title}>Preference Request Recovery</h3>
    {error && <p className={styles.copy} role="status">{error}</p>}
    {pending && <><p className={styles.copy}>Original Preference Request: {pending.operation_id}</p><PlanningButton disabled={busy} onClick={() => recover()}>Check Original Preference Request</PlanningButton>{retryable && <PlanningButton disabled={busy} onClick={() => recover(true)}>Retry Original Preference Request</PlanningButton>}</>}
  </div>;
}

export default function PlayerPlanningPanel({ userId }) {
  // The server and first client render share the signed-out shell. Read device
  // auth only after mount, never while hydrating the prerendered markup.
  const [account, setAccount] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const account = getAuthUser()?.id;
    if (!account || (userId && userId !== account)) { setPlans([]); return; }
    setLoading(true); setError('');
    try { const rows = await listPlayerPlans(undefined, fetch, account); if (getAuthUser()?.id === account) setPlans(rows); }
    catch (cause) { if (getAuthUser()?.id === account) setError(cause.message || 'Your Plans Could Not Be Loaded.'); }
    finally { if (getAuthUser()?.id === account) setLoading(false); }
  }, [userId]);
  const writer = usePlayerPlanningWrite('saved-library', load);
  useEffect(() => { setAccount(getAuthUser()?.id || null); setPlans([]); load(); const changed = () => { setAccount(getAuthUser()?.id || null); setPlans([]); load(); }; window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed); }, [load]);
  return <PokerNearMePanelShell as="section" bodyClassName={styles.body} aria-label="Player Planning" data-player-planning="library">
    <h2 className={styles.title}>Player Planning</h2>
    <p className={styles.copy}>Private Account-Owned Searches And Trip Plans. Device Trips Are Imported Only When You Explicitly Choose To Import Them.</p>
    {!account ? <p className={styles.copy}>Sign In To Read Your Private Account Plans.</p> : <>
      {loading && <p role="status" className={styles.copy}>Loading Account Plans...</p>}
      {error && <p role="alert" className={`${styles.copy} ${styles.error}`}>{error}</p>}
      <PlanningButton onClick={load} disabled={loading || writer.busy}>Refresh Account Plans</PlanningButton>
      {['search', 'trip'].map((kind) => <div key={kind} className={styles.body}>
        <h3 className={styles.title}>{kind === 'search' ? 'Saved Searches' : 'Saved Trip Plans'}</h3>
        {!loading && !error && !plans.some((plan) => plan.kind === kind) && <p className={styles.copy}>No Saved {kind === 'search' ? 'Searches' : 'Trip Plans'} Yet.</p>}
        <ul className={styles.list}>{plans.filter((plan) => plan.kind === kind).map((plan) => <li key={plan.id} className={styles.item}>
          <strong>{plan.name}</strong>
          <p className={styles.copy}>{kind === 'search' ? plan.document.query : `${plan.document.origin} To ${plan.document.destination}`}</p>
          <div className={styles.actions}>
            <a className={styles.button} href={kind === 'search' ? buildSavedSearchUrl(plan.document) : `/hub/poker-near-me/roadtrip?accountPlan=${encodeURIComponent(plan.id)}`}>{kind === 'search' ? 'Run Saved Search' : 'Load Account Trip'}</a>
            <PlanningButton disabled={writer.busy || !!writer.pending} onClick={() => writer.submit({ action: 'delete', id: plan.id, expected_revision: plan.revision })}>Delete {kind === 'search' ? 'Search' : 'Trip'}</PlanningButton>
          </div>
        </li>)}</ul>
      </div>)}
      <PlanningWriteState writer={writer} />
      <PreferenceRecovery userId={account} />
    </>}
  </PokerNearMePanelShell>;
}
