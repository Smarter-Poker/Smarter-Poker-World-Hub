import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';
import styles from '../../../src/components/store/VipMembershipConsole.module.css';
import { authedFetch, ensureAuthReady, getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { acquireScrollLock } from '../../../src/lib/scrollLock';
import supabase from '../../../src/lib/supabase';

const EMPTY_MEMBERSHIP = {
  isVip: false,
  tier: null,
  expiresAt: null,
  source: 'none',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  recurring: false,
  canSwitch: false,
  canCancel: false,
  partial: false,
};

const MEMBERSHIP_ACTION_TIMEOUT_MS = 20_000;
const MEMBERSHIP_READ_TIMEOUT_MS = 20_000;
const MAX_RETAINED_MEMBERSHIP_ACTIONS = 32;
const membershipActionKeys = new Map();
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function createMembershipActionKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `vip-action-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function retainedMembershipAction(accountId, endpoint, body) {
  const identity = JSON.stringify({ accountId, endpoint, body });
  const retainedKey = membershipActionKeys.get(identity);
  if (retainedKey) return { identity, key: retainedKey };
  if (membershipActionKeys.size >= MAX_RETAINED_MEMBERSHIP_ACTIONS) {
    throw new Error(
      'Too Many Membership Changes Are Awaiting Verification. Reload After They Are Resolved.'
    );
  }
  const key = createMembershipActionKey();
  membershipActionKeys.set(identity, key);
  return { identity, key };
}

function clearRetainedMembershipAction(identity, key) {
  if (membershipActionKeys.get(identity) === key) membershipActionKeys.delete(identity);
}

function formatDate(value) {
  if (!value) return 'No Expiration Recorded';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Pending Verification';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function sourceLabel(source) {
  if (source === 'card') return 'Card Subscription';
  if (source === 'diamonds') return 'Diamond Pass';
  if (source === 'lifetime') return 'Lifetime Entitlement';
  return 'No Active Settlement';
}

export default function VipManagePage() {
  const canonical = '/hub/vip-membership/manage';
  const { user: contextUser, initializing: authInitializing } = useAvatar();
  const synchronousAccountId = getAuthUser()?.id || null;
  const committedAccountId =
    contextUser?.id === synchronousAccountId
      ? contextUser.id
      : authInitializing
        ? synchronousAccountId
        : null;
  const [view, setView] = useState({
    status: 'loading',
    membership: EMPTY_MEMBERSHIP,
    message: '',
  });
  const [viewOwnerId, setViewOwnerId] = useState(null);
  const [action, setAction] = useState({ status: 'idle', message: '' });
  const [actionOwnerId, setActionOwnerId] = useState(null);
  const accountView =
    viewOwnerId === committedAccountId
      ? view
      : {
          status: committedAccountId ? 'loading' : 'signed-out',
          membership: EMPTY_MEMBERSHIP,
          message: '',
        };
  const accountAction =
    actionOwnerId === committedAccountId ? action : { status: 'idle', message: '' };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [cancelReason, setCancelReason] = useState('not_using');
  const dialogTitleRef = useRef(null);
  const dialogRef = useRef(null);
  const cancelTriggerRef = useRef(null);
  const dialogReturnFocusRef = useRef(null);
  const activeAccountIdRef = useRef(committedAccountId);
  const actionBusyRef = useRef(false);
  const actionControllerRef = useRef(null);
  const actionGenerationRef = useRef(0);
  const membershipRequestRef = useRef(0);
  const membershipControllerRef = useRef(null);

  useIsomorphicLayoutEffect(() => {
    activeAccountIdRef.current = committedAccountId;
    membershipRequestRef.current += 1;
    membershipControllerRef.current?.abort();
    membershipControllerRef.current = null;
    actionGenerationRef.current += 1;
    actionControllerRef.current?.abort();
    actionControllerRef.current = null;
    actionBusyRef.current = false;
    setViewOwnerId(committedAccountId);
    setView({
      status: committedAccountId ? 'loading' : 'signed-out',
      membership: EMPTY_MEMBERSHIP,
      message: '',
    });
    setActionOwnerId(committedAccountId);
    setAction({ status: 'idle', message: '' });
    setConfirmOpen(false);
    setPendingPlan(null);
  }, [committedAccountId]);

  const loadMembership = useCallback(async () => {
    const expectedAccountId = committedAccountId;
    if (!expectedAccountId || activeAccountIdRef.current !== expectedAccountId) return;
    const requestId = ++membershipRequestRef.current;
    membershipControllerRef.current?.abort();
    const controller = new AbortController();
    membershipControllerRef.current = controller;
    const generationOwnsCurrentAccount = () =>
      membershipRequestRef.current === requestId &&
      activeAccountIdRef.current === expectedAccountId;
    const operationOwnsCurrentAccount = () =>
      generationOwnsCurrentAccount() && membershipControllerRef.current === controller;
    const attemptOwnsCurrentAccount = () =>
      !controller.signal.aborted &&
      operationOwnsCurrentAccount() &&
      getAuthUser()?.id === expectedAccountId;
    const commitIsCurrent = () =>
      !controller.signal.aborted &&
      generationOwnsCurrentAccount() &&
      getAuthUser()?.id === expectedAccountId;
    let timedOut = false;
    let authResolvedForExpectedAccount = false;
    let timer = null;
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        const error = new Error('Membership Read Timed Out. Retry The Secure Read.');
        error.name = 'CommerceTimeoutError';
        reject(error);
      }, MEMBERSHIP_READ_TIMEOUT_MS);
    });
    setView((current) =>
      generationOwnsCurrentAccount() ? { ...current, status: 'loading', message: '' } : current
    );
    try {
      const currentUser =
        getAuthUser() || (await Promise.race([ensureAuthReady(supabase), deadline]));
      if (!operationOwnsCurrentAccount()) return;
      if (currentUser?.id !== expectedAccountId || getAuthUser()?.id !== expectedAccountId) return;
      authResolvedForExpectedAccount = true;
      const response = await Promise.race([
        authedFetch('/api/store/vip-membership-status', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        }),
        deadline,
      ]);
      if (!attemptOwnsCurrentAccount()) return;
      const body = await Promise.race([response.json().catch(() => null), deadline]);
      if (!attemptOwnsCurrentAccount()) return;
      if (!response.ok || !body?.success)
        throw new Error(body?.error || 'Could not read your membership record.');
      if (!attemptOwnsCurrentAccount()) return;
      setView((current) =>
        commitIsCurrent()
          ? {
              status: 'ready',
              membership: { ...EMPTY_MEMBERSHIP, ...body.membership },
              message: '',
            }
          : current
      );
    } catch (error) {
      if (!operationOwnsCurrentAccount()) return;
      if (error?.name === 'AbortError' && !timedOut) return;
      if (authResolvedForExpectedAccount && getAuthUser()?.id !== expectedAccountId) return;
      setView((current) => {
        if (!generationOwnsCurrentAccount()) return current;
        if (authResolvedForExpectedAccount && getAuthUser()?.id !== expectedAccountId)
          return current;
        return {
          status: 'error',
          membership: EMPTY_MEMBERSHIP,
          message: timedOut
            ? 'Membership Read Timed Out. Retry The Secure Read.'
            : error?.message || 'Could not read your membership record.',
        };
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (
        membershipRequestRef.current === requestId &&
        membershipControllerRef.current === controller
      ) {
        membershipControllerRef.current = null;
        setView((current) =>
          generationOwnsCurrentAccount() && current.status === 'loading'
            ? {
                status: 'error',
                membership: EMPTY_MEMBERSHIP,
                message:
                  'Your Account Changed Before Membership Could Be Verified. Retry The Secure Read.',
              }
            : current
        );
      }
    }
  }, [committedAccountId]);

  useEffect(() => {
    if (authInitializing || !committedAccountId) return;
    void loadMembership();
  }, [authInitializing, committedAccountId, loadMembership]);

  useEffect(
    () => () => {
      membershipRequestRef.current += 1;
      membershipControllerRef.current?.abort();
      membershipControllerRef.current = null;
      actionGenerationRef.current += 1;
      actionControllerRef.current?.abort();
      actionControllerRef.current = null;
      actionBusyRef.current = false;
    },
    []
  );

  useEffect(() => {
    if (!confirmOpen && !pendingPlan) return undefined;
    const releaseScrollLock = acquireScrollLock('VipMembershipCancelDialog');
    dialogReturnFocusRef.current = document.activeElement;
    dialogTitleRef.current?.focus();
    const handleDialogKey = (event) => {
      if (event.key === 'Escape') {
        setConfirmOpen(false);
        setPendingPlan(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll('button:not(:disabled), select:not(:disabled)') || []
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogTitleRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKey);
    return () => {
      document.removeEventListener('keydown', handleDialogKey);
      releaseScrollLock();
      dialogReturnFocusRef.current?.focus?.();
    };
  }, [confirmOpen, pendingPlan]);

  const runAction = async (endpoint, body, successUpdate) => {
    const expectedAccountId = committedAccountId;
    if (
      actionBusyRef.current ||
      !expectedAccountId ||
      viewOwnerId !== expectedAccountId ||
      accountView.status !== 'ready' ||
      activeAccountIdRef.current !== expectedAccountId ||
      getAuthUser()?.id !== expectedAccountId
    )
      return;
    const actionId = ++actionGenerationRef.current;
    actionControllerRef.current?.abort();
    const controller = new AbortController();
    actionControllerRef.current = controller;
    actionBusyRef.current = true;
    setAction({ status: 'busy', message: '' });
    let retainedAction;
    try {
      retainedAction = retainedMembershipAction(expectedAccountId, endpoint, body);
    } catch (error) {
      if (actionControllerRef.current === controller) {
        controller.abort();
        actionControllerRef.current = null;
      }
      actionBusyRef.current = false;
      setAction({
        status: 'error',
        message: error?.message || 'The Membership Change Could Not Be Protected For Retry.',
      });
      return;
    }
    const { identity: intentIdentity, key: intentKey } = retainedAction;
    const generationOwnsCurrentAccount = () =>
      actionGenerationRef.current === actionId && activeAccountIdRef.current === expectedAccountId;
    const operationOwnsCurrentAccount = () =>
      generationOwnsCurrentAccount() && actionControllerRef.current === controller;
    const attemptOwnsCurrentAccount = () =>
      !controller.signal.aborted &&
      operationOwnsCurrentAccount() &&
      getAuthUser()?.id === expectedAccountId;
    const commitOwnsCurrentAccount = () =>
      !controller.signal.aborted &&
      generationOwnsCurrentAccount() &&
      getAuthUser()?.id === expectedAccountId;
    let timedOut = false;
    let timer = null;
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        const error = new Error('Membership Change Timed Out.');
        error.name = 'CommerceTimeoutError';
        reject(error);
      }, MEMBERSHIP_ACTION_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([
        authedFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Idempotency-Key': intentKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        deadline,
      ]);
      if (!attemptOwnsCurrentAccount()) return;
      const payload = await Promise.race([response.json().catch(() => null), deadline]);
      if (!attemptOwnsCurrentAccount()) return;
      if (!response.ok || !payload?.success)
        throw new Error(payload?.error || 'The membership change could not be completed.');
      if (!attemptOwnsCurrentAccount()) return;
      setView((current) => {
        if (!commitOwnsCurrentAccount()) return current;
        return { ...current, membership: { ...current.membership, ...successUpdate } };
      });
      setAction((current) =>
        commitOwnsCurrentAccount()
          ? { status: 'success', message: payload.message || 'Your membership record was updated.' }
          : current
      );
      clearRetainedMembershipAction(intentIdentity, intentKey);
      setConfirmOpen(false);
      setPendingPlan(null);
    } catch (error) {
      if (!operationOwnsCurrentAccount() || getAuthUser()?.id !== expectedAccountId) return;
      if (error?.name === 'AbortError' && !timedOut) return;
      setAction((current) => {
        if (!generationOwnsCurrentAccount() || getAuthUser()?.id !== expectedAccountId)
          return current;
        return {
          status: 'error',
          message:
            timedOut || error?.name === 'AbortError'
              ? 'Membership Change Timed Out. No Result Was Assumed. Retry To Safely Verify The Same Request.'
              : error?.message || 'The membership change could not be completed.',
        };
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (actionGenerationRef.current === actionId && actionControllerRef.current === controller) {
        actionControllerRef.current = null;
        actionBusyRef.current = false;
        setAction((current) =>
          generationOwnsCurrentAccount() && current.status === 'busy'
            ? {
                status: 'error',
                message:
                  'Your Account Changed Before The Membership Result Was Verified. Retry To Safely Reuse The Same Request.',
              }
            : current
        );
      }
    }
  };

  const switchPlan = (plan) =>
    runAction(
      '/api/store/switch-vip-plan',
      { plan },
      { tier: plan, cancelAtPeriodEnd: false, canCancel: true, canSwitch: true }
    );

  const scheduleCancellation = () =>
    runAction(
      '/api/store/cancel-vip',
      { reason: cancelReason },
      { cancelAtPeriodEnd: true, canCancel: false, canSwitch: false }
    );

  const membership = accountView.membership;
  const stateLabel =
    accountView.status === 'loading'
      ? 'Checking Membership'
      : membership.isVip
        ? membership.cancelAtPeriodEnd
          ? 'VIP Ending At Renewal'
          : 'VIP Active'
        : 'No Active VIP';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Manage Smarter.Poker VIP Membership',
    description: 'Review VIP entitlement status and securely manage an eligible card subscription.',
    url: `https://smarter.poker${canonical}`,
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title="VIP Command Center"
      description="Review your verified entitlement, billing circuit, expiration signal, and eligible subscription controls without leaving the marketplace."
      eyebrow="High Limit Access / Membership Record"
      image="/images/store-v3/vip-hero.webp"
      imageAlt="Smarter.Poker VIP command platform"
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'VIP Membership', href: '/hub/vip-membership' },
        { label: 'Manage', href: canonical },
      ]}
      status={stateLabel}
      presentation="membership"
      actions={
        <>
          <Link href="/hub/vip-membership">VIP Storefront</Link>
          <Link href="/hub/vip-membership/compare">Compare Plans</Link>
        </>
      }
      structuredData={schema}
      noindex
    >
      {accountView.status === 'loading' && (
        <section className={`${styles.panel} ${styles.loading}`} role="status" aria-live="polite">
          <h2>Synchronizing VIP Record</h2>
          <p>Reading Your Private Entitlement And Recurring Billing State…</p>
        </section>
      )}

      {accountView.status === 'signed-out' && (
        <section className={styles.signedOut}>
          <h2>Connect Your Private Membership Record</h2>
          <p>
            Sign In To Review Your VIP Source, Renewal Date, Plan, And Secure Management Controls.
          </p>
          <Link href={`/auth/login?redirect=${encodeURIComponent(canonical)}`}>
            Sign In To Manage VIP
          </Link>
        </section>
      )}

      {accountView.status === 'error' && (
        <section className={styles.signedOut} role="alert">
          <h2>Membership Link Interrupted</h2>
          <p>{marketplaceCopy(accountView.message)}</p>
          <button className={styles.button} type="button" onClick={loadMembership}>
            Retry Secure Read
          </button>
        </section>
      )}

      {accountView.status === 'ready' && (
        <div className={styles.console}>
          <section
            className={`${styles.panel} ${styles.panelGold}`}
            aria-labelledby="entitlement-signal-title"
          >
            <h2 id="entitlement-signal-title">Entitlement Signal</h2>
            <p>The Server, Not This Browser, Decides Whether Your VIP Access Is Active.</p>
            <div className={styles.statusLine}>
              <div>
                <span>Access State</span>
                <strong>{membership.isVip ? 'Active' : 'Inactive'}</strong>
              </div>
              <div>
                <span>Settlement Source</span>
                <strong>{sourceLabel(membership.source)}</strong>
              </div>
              <div>
                <span>Current Tier</span>
                <strong>{marketplaceCopy(membership.tier || 'None')}</strong>
              </div>
              <div>
                <span>
                  {membership.cancelAtPeriodEnd
                    ? 'Access Ends'
                    : membership.recurring
                      ? 'Next Renewal'
                      : 'Expiration'}
                </span>
                <strong>{formatDate(membership.currentPeriodEnd || membership.expiresAt)}</strong>
              </div>
            </div>
            {membership.cancelAtPeriodEnd && (
              <div className={styles.notice}>
                Cancellation Is Scheduled. VIP Remains Active Through The Date Shown Above And No
                New Renewal Will Be Created.
              </div>
            )}
            {membership.partial && (
              <div className={styles.notice}>
                Your Entitlement Is Verified, But Detailed Subscription Telemetry Is Temporarily
                Partial.
              </div>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="secure-controls-title">
            <h2 id="secure-controls-title">Secure Controls</h2>
            {!membership.isVip && (
              <>
                <p>
                  No Active VIP Entitlement Was Found. Choose A Monthly, Yearly, Or Lifetime Plan To
                  Activate The Suite.
                </p>
                <p>
                  <Link href="/hub/vip-membership">Choose A VIP Plan</Link>
                </p>
              </>
            )}

            {membership.isVip && !membership.recurring && (
              <>
                <p>
                  {marketplaceCopy(
                    membership.source === 'lifetime'
                      ? 'Lifetime VIP has no recurring bill to manage.'
                      : 'Diamond VIP passes expire automatically and never renew a card.'
                  )}
                </p>
                <div className={styles.notice}>
                  No Cancellation Is Needed For This Membership Source.
                </div>
              </>
            )}

            {membership.recurring && (
              <>
                <p>
                  Switching Plans Keeps Your Renewal Date. Stripe Applies Unused Paid Time As A
                  Prorated Credit To The Next Invoice.
                </p>
                <div className={styles.planGrid} aria-label="VIP Recurring Plan Controls">
                  <div
                    className={`${styles.plan} ${membership.tier === 'monthly' ? styles.planActive : ''}`}
                  >
                    <span className={styles.planLabel}>Flexible Access</span>
                    <strong>$19.99 / Month</strong>
                    <p>Monthly Renewal With Full VIP Access.</p>
                    <button
                      className={styles.button}
                      type="button"
                      disabled={
                        !membership.canSwitch ||
                        membership.tier === 'monthly' ||
                        accountAction.status === 'busy'
                      }
                      onClick={() => setPendingPlan('monthly')}
                    >
                      Switch To Monthly
                    </button>
                  </div>
                  <div
                    className={`${styles.plan} ${membership.tier === 'yearly' ? styles.planActive : ''}`}
                  >
                    <span className={styles.planLabel}>Best Card Rate</span>
                    <strong>$199.99 / Year</strong>
                    <p>Yearly Renewal With The Same Full VIP Suite.</p>
                    <button
                      className={styles.button}
                      type="button"
                      disabled={
                        !membership.canSwitch ||
                        membership.tier === 'yearly' ||
                        accountAction.status === 'busy'
                      }
                      onClick={() => setPendingPlan('yearly')}
                    >
                      Switch To Yearly
                    </button>
                  </div>
                </div>
                {membership.canCancel && (
                  <button
                    ref={cancelTriggerRef}
                    className={styles.dangerButton}
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                  >
                    Schedule End Of Membership
                  </button>
                )}
                <p className={styles.finePrint}>
                  Plan Changes And Cancellations Require Your Verified Session. Cancellation Takes
                  Effect At The End Of The Paid Billing Period.
                </p>
              </>
            )}

            {accountAction.message && (
              <div
                className={`${styles.notice} ${accountAction.status === 'error' ? styles.noticeError : ''}`}
                role={accountAction.status === 'error' ? 'alert' : 'status'}
                aria-live="polite"
              >
                {marketplaceCopy(accountAction.message)}
              </div>
            )}
          </section>
        </div>
      )}

      {accountView.status === 'ready' && (confirmOpen || pendingPlan) && (
        <div className={styles.dialogBackdrop}>
          <section
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vip-action-title"
            aria-describedby="vip-action-copy"
          >
            <h2 id="vip-action-title" ref={dialogTitleRef} tabIndex={-1}>
              {pendingPlan ? 'Confirm Plan Switch' : 'Confirm End Of Membership'}
            </h2>
            <p id="vip-action-copy">
              {pendingPlan
                ? `Switch To The ${marketplaceCopy(pendingPlan)} Plan While Keeping Your Current Renewal Date? Stripe Will Apply Eligible Unused Paid Time As A Prorated Credit On Your Next Invoice.`
                : marketplaceCopy(
                    'Your card will not renew. VIP access stays active until the current paid period ends.'
                  )}
            </p>
            {confirmOpen && (
              <>
                <label htmlFor="cancel-reason">Why Are You Leaving?</label>
                <select
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                >
                  <option value="not_using">Not Using It Enough</option>
                  <option value="too_expensive">Price</option>
                  <option value="missing_features">Missing Features</option>
                  <option value="technical_issues">Technical Issues</option>
                  <option value="other">Other</option>
                </select>
              </>
            )}
            {accountAction.status === 'error' && (
              <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                {marketplaceCopy(accountAction.message)}
              </div>
            )}
            <div className={styles.dialogActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={accountAction.status === 'busy'}
                onClick={() => {
                  setConfirmOpen(false);
                  setPendingPlan(null);
                }}
              >
                {pendingPlan ? 'Keep Current Plan' : 'Keep Membership'}
              </button>
              {pendingPlan ? (
                <button
                  className={styles.button}
                  type="button"
                  disabled={accountAction.status === 'busy'}
                  onClick={() => switchPlan(pendingPlan)}
                >
                  {accountAction.status === 'busy'
                    ? 'Switching…'
                    : `Confirm ${marketplaceCopy(pendingPlan)} Plan`}
                </button>
              ) : (
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={accountAction.status === 'busy'}
                  onClick={scheduleCancellation}
                >
                  {accountAction.status === 'busy' ? 'Scheduling…' : 'Confirm End At Renewal'}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </MarketplaceDetailExperience>
  );
}
