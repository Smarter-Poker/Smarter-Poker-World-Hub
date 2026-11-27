import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';
import {
  VIP_SCENE_SRC,
  VipCrest,
  VipCta,
  VipGhost,
  VipLead,
  VipMasthead,
  VipPricePlate,
  VipSeal,
  vipKitStyles as k,
} from '../../../src/components/vip/VipKit';
import m from '../../../src/components/vip/VipManage.module.css';
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
const BILLING_PORTAL_HOST = 'billing.stripe.com';
const CANCEL_DETAILS_MAX_LENGTH = 500;
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

function verifiedBillingPortalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === BILLING_PORTAL_HOST
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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
  const [cancelDetails, setCancelDetails] = useState('');
  const [portal, setPortal] = useState({ status: 'idle', message: '' });
  const [portalOwnerId, setPortalOwnerId] = useState(null);
  const portalBusyRef = useRef(false);
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
    setCancelDetails('');
    portalBusyRef.current = false;
    setPortalOwnerId(committedAccountId);
    setPortal({ status: 'idle', message: '' });
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
        dialogRef.current?.querySelectorAll(
          'button:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'
        ) || []
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

  const scheduleCancellation = () => {
    const details = cancelDetails.trim().slice(0, CANCEL_DETAILS_MAX_LENGTH);
    return runAction(
      '/api/store/cancel-vip',
      details ? { reason: cancelReason, reasonText: details } : { reason: cancelReason },
      { cancelAtPeriodEnd: true, canCancel: false, canSwitch: false }
    );
  };

  // Opens Stripe's own card page for this member's customer. The server picks
  // the customer from the signed-in profile; this only follows a verified
  // billing.stripe.com address.
  const openBillingPortal = async () => {
    const expectedAccountId = committedAccountId;
    if (
      portalBusyRef.current ||
      !expectedAccountId ||
      activeAccountIdRef.current !== expectedAccountId ||
      getAuthUser()?.id !== expectedAccountId
    )
      return;
    portalBusyRef.current = true;
    setPortalOwnerId(expectedAccountId);
    setPortal({ status: 'busy', message: '' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MEMBERSHIP_ACTION_TIMEOUT_MS);
    try {
      const response = await authedFetch('/api/store/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (activeAccountIdRef.current !== expectedAccountId) return;
      if (getAuthUser()?.id !== expectedAccountId) return;
      const url = verifiedBillingPortalUrl(payload?.url);
      if (!response.ok || !payload?.success || !url) {
        throw new Error(payload?.error || 'The Card Update Page Could Not Be Opened.');
      }
      setPortal({ status: 'leaving', message: 'Opening The Secure Card Page.' });
      window.location.assign(url);
    } catch (error) {
      if (activeAccountIdRef.current !== expectedAccountId) return;
      setPortal({
        status: 'error',
        message:
          error?.name === 'AbortError'
            ? 'The Card Update Page Timed Out. Please Try Again.'
            : error?.message || 'The Card Update Page Could Not Be Opened.',
      });
    } finally {
      clearTimeout(timer);
      portalBusyRef.current = false;
    }
  };

  const accountPortal =
    portalOwnerId === committedAccountId ? portal : { status: 'idle', message: '' };
  const accessEndLabel = formatDate(
    accountView.membership.currentPeriodEnd || accountView.membership.expiresAt
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

  const busyPortal = accountPortal.status === 'busy' || accountPortal.status === 'leaving';
  const renewalLabel = membership.cancelAtPeriodEnd
    ? 'Access Ends'
    : membership.recurring
      ? 'Next Renewal'
      : 'Expiration';

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
      masthead={
        <div>
          <VipMasthead
            parent="Smarter.Poker VIP"
            title="VIP Command Center"
            helpHref="/hub/vip-membership#vip-faq"
            helpLabel="VIP Command Center Help And Frequently Asked Questions"
          />
          <VipLead
            actions={
              <>
                <VipGhost href="/hub/vip-membership">VIP Storefront</VipGhost>
                <VipGhost href="/hub/vip-membership/compare">Compare Plans</VipGhost>
              </>
            }
          >
            <span className={m.stateChip} data-state={membership.isVip ? 'on' : 'off'}>
              {stateLabel}
            </span>{' '}
            Your Renewal, Plan And Card, Read From Your Verified Account.
          </VipLead>
        </div>
      }
      structuredData={schema}
      noindex
    >
      {accountView.status === 'loading' && (
        <section className={`${k.kit} ${k.frame} ${m.panel}`} role="status" aria-live="polite">
          <h2 className={m.panelTitle}>Synchronizing VIP Record</h2>
          <p className={m.copy}>Reading Your Private Entitlement And Recurring Billing State…</p>
        </section>
      )}

      {accountView.status === 'signed-out' && (
        <section className={`${k.kit} ${k.frame} ${m.panel}`}>
          <div className={m.panelHead}>
            <VipCrest />
            <h2 className={m.panelTitle}>Connect Your Private Membership Record</h2>
          </div>
          <p className={m.copy}>
            Sign In To Review Your VIP Source, Renewal Date, Plan, And Secure Management Controls.
          </p>
          <VipCta href={`/auth/login?redirect=${encodeURIComponent(canonical)}`}>
            Sign In To Manage VIP
          </VipCta>
        </section>
      )}

      {accountView.status === 'error' && (
        <section className={`${k.kit} ${k.frame} ${m.panel}`} role="alert">
          <h2 className={m.panelTitle}>Membership Link Interrupted</h2>
          <p className={m.copy}>{marketplaceCopy(accountView.message)}</p>
          <VipCta onClick={loadMembership}>Retry Secure Read</VipCta>
        </section>
      )}

      {accountView.status === 'ready' && (
        <div className={m.console}>
          <section
            className={`${k.kit} ${k.frame} ${m.panel}`}
            aria-labelledby="entitlement-signal-title"
          >
            <div className={m.panelHead}>
              <VipCrest />
              <div>
                <h2 id="entitlement-signal-title" className={m.panelTitle}>
                  Your Membership
                </h2>
                <p className={m.sub}>
                  The Server, Not This Browser, Decides Whether Your VIP Access Is Active.
                </p>
              </div>
            </div>
            <dl className={m.readouts}>
              <div>
                <dt>Access State</dt>
                <dd>{membership.isVip ? 'Active' : 'Inactive'}</dd>
              </div>
              <div>
                <dt>Settlement Source</dt>
                <dd>{sourceLabel(membership.source)}</dd>
              </div>
              <div>
                <dt>Current Tier</dt>
                <dd>{marketplaceCopy(membership.tier || 'None')}</dd>
              </div>
              <div>
                <dt>{renewalLabel}</dt>
                <dd>{formatDate(membership.currentPeriodEnd || membership.expiresAt)}</dd>
              </div>
            </dl>
            {membership.cancelAtPeriodEnd && (
              <p className={m.notice}>
                Cancellation Is Scheduled. VIP Remains Active Through The Date Shown Above And No
                New Renewal Will Be Created.
              </p>
            )}
            {membership.partial && (
              <p className={m.notice}>
                Your Entitlement Is Verified, But Detailed Subscription Telemetry Is Temporarily
                Partial.
              </p>
            )}
          </section>

          <section
            className={`${k.kit} ${k.frame} ${m.panel}`}
            aria-labelledby="secure-controls-title"
          >
            <h2 id="secure-controls-title" className={m.panelTitle}>
              Secure Controls
            </h2>
            {!membership.isVip && (
              <>
                <p className={m.copy}>
                  No Active VIP Entitlement Was Found. Choose A Monthly, Yearly, Or Lifetime Plan To
                  Activate The Suite.
                </p>
                <VipCta href="/hub/vip-membership">Choose A VIP Plan</VipCta>
                <p className={m.notice}>
                  Did A Renewal Payment Fail? VIP From A Card Subscription Turns Off Until The
                  Payment Succeeds. Update Your Card And VIP Returns When The Payment Goes Through.
                </p>
                <VipGhost disabled={busyPortal} onClick={openBillingPortal}>
                  {accountPortal.status === 'busy' ? 'Opening…' : 'Update Payment Card'}
                </VipGhost>
              </>
            )}

            {membership.isVip && !membership.recurring && (
              <>
                <p className={m.copy}>
                  {marketplaceCopy(
                    membership.source === 'lifetime'
                      ? 'Lifetime VIP has no recurring bill to manage.'
                      : 'Diamond VIP passes expire automatically and never renew a card.'
                  )}
                </p>
                <p className={m.notice}>No Cancellation Is Needed For This Membership Source.</p>
              </>
            )}

            {membership.recurring && (
              <>
                <p className={m.copy}>
                  Switching Plans Keeps Your Renewal Date. Stripe Applies Unused Paid Time As A
                  Prorated Credit To The Next Invoice.
                </p>
                <div className={m.planGrid} role="group" aria-label="VIP Recurring Plan Controls">
                  <div
                    className={`${m.plan} ${membership.tier === 'monthly' ? m.planCurrent : ''}`}
                  >
                    <VipPricePlate
                      compact
                      tag={membership.tier === 'monthly' ? 'Your Current Plan' : 'Flexible Access'}
                      amount="$20"
                      unit="/Month"
                      note="Monthly Renewal With Full VIP Access."
                    />
                    <VipGhost
                      disabled={
                        !membership.canSwitch ||
                        membership.tier === 'monthly' ||
                        accountAction.status === 'busy'
                      }
                      onClick={() => setPendingPlan('monthly')}
                    >
                      {membership.tier === 'monthly' ? 'Current Plan' : 'Switch To Monthly'}
                    </VipGhost>
                  </div>
                  <div
                    className={`${m.plan} ${membership.tier === 'yearly' ? m.planCurrent : ''}`}
                  >
                    <VipPricePlate
                      compact
                      tag={membership.tier === 'yearly' ? 'Your Current Plan' : 'Best Card Rate'}
                      amount="$200"
                      unit="/Year"
                      note="Yearly Renewal With The Same Full VIP Suite."
                    />
                    <VipCta
                      disabled={
                        !membership.canSwitch ||
                        membership.tier === 'yearly' ||
                        accountAction.status === 'busy'
                      }
                      onClick={() => setPendingPlan('yearly')}
                    >
                      {membership.tier === 'yearly' ? 'Current Plan' : 'Switch To Yearly'}
                    </VipCta>
                  </div>
                </div>
                {membership.tier === 'monthly' && !membership.cancelAtPeriodEnd && (
                  <p className={m.notice}>
                    $200/Year Is Two Months Free Versus Monthly. After Your First Renewal You Can
                    Switch To Yearly.
                  </p>
                )}
                <div className={m.actions}>
                  <VipGhost disabled={busyPortal} onClick={openBillingPortal}>
                    {accountPortal.status === 'busy' ? 'Opening…' : 'Update Payment Card'}
                  </VipGhost>
                  {membership.canCancel && (
                    <VipGhost ref={cancelTriggerRef} onClick={() => setConfirmOpen(true)}>
                      Schedule End Of Membership
                    </VipGhost>
                  )}
                </div>
                <p className={m.finePrint}>
                  Plan Changes And Cancellations Require Your Verified Session. Cancellation Takes
                  Effect At The End Of The Paid Billing Period.
                </p>
              </>
            )}

            {accountPortal.message && (
              <p
                className={`${m.notice} ${accountPortal.status === 'error' ? m.noticeError : ''}`}
                role={accountPortal.status === 'error' ? 'alert' : 'status'}
                aria-live="polite"
              >
                {marketplaceCopy(accountPortal.message)}
              </p>
            )}

            {accountAction.message && (
              <p
                className={`${m.notice} ${accountAction.status === 'error' ? m.noticeError : ''}`}
                role={accountAction.status === 'error' ? 'alert' : 'status'}
                aria-live="polite"
              >
                {marketplaceCopy(accountAction.message)}
              </p>
            )}
          </section>
        </div>
      )}

      {accountView.status === 'ready' && (confirmOpen || pendingPlan) && (
        <div className={`${k.kit} ${k.backdrop}`}>
          <section
            ref={dialogRef}
            className={`${k.frame} ${k.dialog} ${m.dialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vip-action-title"
            aria-describedby="vip-action-copy"
          >
            <div className={k.dialogHead}>
              <img
                className={k.scene}
                src={VIP_SCENE_SRC}
                alt=""
                width="620"
                height="196"
                decoding="async"
                aria-hidden="true"
              />
              <VipSeal />
              <div className={k.mastCopy}>
                <p className={k.parent}>VIP Command Center</p>
                <h2
                  id="vip-action-title"
                  className={k.dialogTitle}
                  ref={dialogTitleRef}
                  tabIndex={-1}
                >
                  {pendingPlan ? 'Confirm Plan Switch' : 'Confirm End Of Membership'}
                </h2>
              </div>
            </div>
            <div className={`${k.dialogBody} ${m.dialogBody}`}>
              <p id="vip-action-copy" className={k.dialogLead}>
                {pendingPlan
                  ? `Switch To The ${marketplaceCopy(pendingPlan)} Plan While Keeping Your Current Renewal Date? Stripe Will Apply Eligible Unused Paid Time As A Prorated Credit On Your Next Invoice.`
                  : marketplaceCopy(
                      'Your card will not renew. VIP access stays active until the current paid period ends.'
                    )}
              </p>
              {confirmOpen && (
                <>
                  <ul className={k.checks}>
                    <li>Every VIP Benefit Stays On Through {accessEndLabel}.</li>
                    <li>
                      After That Date VIP Turns Off And Your Account Returns To Standard Access.
                    </li>
                    <li>Your Card Is Not Charged Again.</li>
                    <li>
                      Coming Back Later Is At The Regular Price. The $1 First Month Is One Time Per
                      Account.
                    </li>
                  </ul>
                  <p className={m.dialogNote}>
                    {membership.tier === 'monthly'
                      ? 'Staying Costs Less On Yearly: $200/Year Is Two Months Free Versus Monthly. After Your First Renewal You Can Switch To Yearly. A Diamond VIP Pass Is Another Way Back, And It Never Renews A Card.'
                      : 'A Diamond VIP Pass Is Another Way Back Later, And It Never Renews A Card.'}{' '}
                    <Link href="/hub/vip-membership/compare">See Every VIP Benefit</Link>
                  </p>
                  <label className={m.label} htmlFor="cancel-reason">
                    Why Are You Leaving?
                  </label>
                  <select
                    id="cancel-reason"
                    className={m.field}
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                  >
                    <option value="not_using">Not Using It Enough</option>
                    <option value="too_expensive">Price</option>
                    <option value="missing_features">Missing Features</option>
                    <option value="found_alternative">Found Something Else</option>
                    <option value="technical_issues">Technical Issues</option>
                    <option value="other">Other</option>
                  </select>
                  <label className={m.label} htmlFor="cancel-details">
                    Anything We Should Know? (Optional)
                  </label>
                  <textarea
                    id="cancel-details"
                    className={m.field}
                    value={cancelDetails}
                    maxLength={CANCEL_DETAILS_MAX_LENGTH}
                    rows={3}
                    onChange={(event) => setCancelDetails(event.target.value)}
                  />
                </>
              )}
              {accountAction.status === 'error' && (
                <p className={`${m.notice} ${m.noticeError}`} role="alert">
                  {marketplaceCopy(accountAction.message)}
                </p>
              )}
              <div className={k.dialogPair}>
                <VipCta
                  disabled={accountAction.status === 'busy'}
                  onClick={() => {
                    setConfirmOpen(false);
                    setPendingPlan(null);
                  }}
                >
                  {pendingPlan ? 'Keep Current Plan' : 'Keep Membership'}
                </VipCta>
                {pendingPlan ? (
                  <VipGhost
                    disabled={accountAction.status === 'busy'}
                    onClick={() => switchPlan(pendingPlan)}
                  >
                    {accountAction.status === 'busy'
                      ? 'Switching…'
                      : `Confirm ${marketplaceCopy(pendingPlan)} Plan`}
                  </VipGhost>
                ) : (
                  <VipGhost
                    disabled={accountAction.status === 'busy'}
                    onClick={scheduleCancellation}
                  >
                    {accountAction.status === 'busy' ? 'Scheduling…' : 'Confirm End At Renewal'}
                  </VipGhost>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </MarketplaceDetailExperience>
  );
}
