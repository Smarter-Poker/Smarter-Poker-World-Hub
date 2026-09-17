import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { authedFetch, ensureAuthReady, getAuthUser } from '../../lib/authUtils';
import { useAvatar } from '../../contexts/AvatarContext';
import supabase from '../../lib/supabase';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import styles from './RewardTelemetryConsole.module.css';

const EMPTY_PROGRESS = {
  earnedToday: 0,
  dailyCap: 0,
  dailyRemaining: 0,
  earnedThisMonth: 0,
  monthlyCap: 0,
  monthlyRemaining: 0,
  loginStreak: 0,
  multiplier: 1,
  isVip: false,
  partial: false,
  timezone: 'America/Chicago',
};

const REWARD_TELEMETRY_TIMEOUT_MS = 20000;
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function clampPercent(value, maximum) {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / maximum) * 100)));
}

function Circuit({ label, earned, cap, remaining }) {
  const percent = clampPercent(earned, cap);
  return (
    <div className={styles.circuit}>
      <b className={styles.circuitGauge}>{percent}%</b>
      <div className={styles.circuitBody}>
        <div className={styles.circuitHeader}>
          <span>{label}</span>
          <strong>
            {Number(earned || 0).toLocaleString()} / {Number(cap || 0).toLocaleString()} Diamonds
          </strong>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label={`${label}: ${Number(earned || 0).toLocaleString()} Of ${Number(cap || 0).toLocaleString()} Diamonds`}
          aria-valuemin={0}
          aria-valuemax={Number(cap || 0)}
          aria-valuenow={Math.min(Number(earned || 0), Number(cap || 0))}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <small>
          {Number(remaining || 0).toLocaleString()} Diamonds Remain In This Verified Circuit.
        </small>
      </div>
    </div>
  );
}

export default function RewardTelemetryConsole({ reward, canonical }) {
  const { user: contextUser, initializing: authInitializing } = useAvatar();
  const synchronousAccountId = getAuthUser()?.id || null;
  const committedAccountId =
    contextUser?.id === synchronousAccountId
      ? contextUser.id
      : authInitializing
        ? synchronousAccountId
        : null;
  const [state, setState] = useState({ status: 'loading', data: EMPTY_PROGRESS, message: '' });
  const [stateOwnerId, setStateOwnerId] = useState(null);
  const accountState =
    stateOwnerId === committedAccountId
      ? state
      : {
          status: committedAccountId ? 'loading' : 'signed-out',
          data: EMPTY_PROGRESS,
          message: '',
        };
  const activeAccountIdRef = useRef(committedAccountId);
  const requestRef = useRef(0);
  const abortRef = useRef(null);

  useIsomorphicLayoutEffect(() => {
    activeAccountIdRef.current = committedAccountId;
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStateOwnerId(committedAccountId);
    setState({
      status: committedAccountId ? 'loading' : 'signed-out',
      data: EMPTY_PROGRESS,
      message: '',
    });
  }, [committedAccountId]);

  const loadProgress = useCallback(async () => {
    const expectedAccountId = committedAccountId;
    if (!expectedAccountId || activeAccountIdRef.current !== expectedAccountId) return;
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generationOwnsCurrentAccount = () =>
      requestRef.current === requestId && activeAccountIdRef.current === expectedAccountId;
    const operationOwnsCurrentAccount = () =>
      generationOwnsCurrentAccount() && abortRef.current === controller;
    const attemptIsCurrent = () =>
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
        const error = new Error('Reward Telemetry Timed Out. Retry The Secure Ledger Read.');
        error.name = 'CommerceTimeoutError';
        reject(error);
      }, REWARD_TELEMETRY_TIMEOUT_MS);
    });
    setState((current) =>
      generationOwnsCurrentAccount() ? { ...current, status: 'loading', message: '' } : current
    );
    try {
      const user = getAuthUser() || (await Promise.race([ensureAuthReady(supabase), deadline]));
      if (!operationOwnsCurrentAccount()) return;
      if (user?.id !== expectedAccountId || getAuthUser()?.id !== expectedAccountId) return;
      authResolvedForExpectedAccount = true;
      const response = await Promise.race([
        authedFetch('/api/rewards/progress', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        }),
        deadline,
      ]);
      if (!attemptIsCurrent()) return;
      const body = await Promise.race([response.json().catch(() => null), deadline]);
      if (!attemptIsCurrent()) return;
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Reward telemetry is temporarily unavailable.');
      }
      if (!attemptIsCurrent()) return;
      setState((current) =>
        commitIsCurrent()
          ? { status: 'ready', data: { ...EMPTY_PROGRESS, ...body }, message: '' }
          : current
      );
    } catch (error) {
      if (!operationOwnsCurrentAccount()) return;
      if (error?.name === 'AbortError' && !timedOut) return;
      if (authResolvedForExpectedAccount && getAuthUser()?.id !== expectedAccountId) return;
      setState((current) => {
        if (!generationOwnsCurrentAccount()) return current;
        if (authResolvedForExpectedAccount && getAuthUser()?.id !== expectedAccountId)
          return current;
        return {
          status: 'error',
          data: EMPTY_PROGRESS,
          message: timedOut
            ? 'Reward Telemetry Timed Out. Retry The Secure Ledger Read.'
            : error?.message || 'Reward telemetry is temporarily unavailable.',
        };
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (requestRef.current === requestId && abortRef.current === controller) {
        abortRef.current = null;
        setState((current) =>
          generationOwnsCurrentAccount() && current.status === 'loading'
            ? {
                status: 'error',
                data: EMPTY_PROGRESS,
                message:
                  'Your Account Changed Before Reward Telemetry Could Be Verified. Retry The Secure Read.',
              }
            : current
        );
      }
    }
  }, [committedAccountId]);

  useEffect(() => {
    if (authInitializing || !committedAccountId) return;
    void loadProgress();
  }, [authInitializing, committedAccountId, loadProgress]);

  useEffect(
    () => () => {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    },
    []
  );

  const data = accountState.data;
  const loginHref = `/auth/login?redirect=${encodeURIComponent(canonical)}`;

  return (
    <section
      id="reward-telemetry"
      className={styles.console}
      aria-labelledby="reward-telemetry-title"
    >
      <div className={styles.consoleHeader}>
        <div>
          <span className={styles.kicker}>Live Account Signal</span>
          <h2 id="reward-telemetry-title">Verified Reward Telemetry</h2>
          <p>
            Your Server-Owned Earning Caps, Streak, And Multiplier: Read Directly From The Diamond
            Ledger.
          </p>
        </div>
        {accountState.status === 'ready' && (
          <span className={styles.integrityBadge}>Ledger Verified</span>
        )}
      </div>

      {accountState.status === 'loading' && (
        <div className={styles.statePanel} role="status" aria-live="polite">
          Synchronizing Your Reward Circuits…
        </div>
      )}

      {accountState.status === 'signed-out' && (
        <div className={styles.statePanel}>
          <div>
            <strong>Connect Your Diamond Ledger</strong>
            <p>
              Sign In To See Your Real Cap Usage, Login Streak, And Multiplier For{' '}
              {marketplaceCopy(reward.name)}.
            </p>
            <Link href={loginHref}>Sign In To View My Telemetry</Link>
          </div>
        </div>
      )}

      {accountState.status === 'error' && (
        <div className={styles.statePanel} role="alert">
          <div>
            <strong>Telemetry Link Interrupted</strong>
            <p>{marketplaceCopy(accountState.message)}</p>
            <button type="button" onClick={loadProgress}>
              Retry Secure Read
            </button>
          </div>
        </div>
      )}

      {accountState.status === 'ready' && (
        <>
          <div className={styles.circuitGrid}>
            <Circuit
              label="Daily Earning Circuit"
              earned={data.earnedToday}
              cap={data.dailyCap}
              remaining={data.dailyRemaining}
            />
            <Circuit
              label="Monthly Earning Circuit"
              earned={data.earnedThisMonth}
              cap={data.monthlyCap}
              remaining={data.monthlyRemaining}
            />
          </div>

          <div className={styles.signalGrid} aria-label="Reward Account Signals">
            <div>
              <span>Login Streak</span>
              <strong>{Number(data.loginStreak || 0)} Days</strong>
            </div>
            <div>
              <span>Share Multiplier</span>
              <strong>{Number(data.multiplier || 1).toFixed(2)}×</strong>
            </div>
            <div>
              <span>Cap Profile</span>
              <strong>{data.isVip ? 'VIP 150' : 'Standard 110'}</strong>
            </div>
            <div>
              <span>Ledger Clock</span>
              <strong data-preserve-case="true">{data.timezone || 'America/Chicago'}</strong>
            </div>
          </div>

          <div className={styles.rewardSignal}>
            <div>
              <span>Selected Reward Signal</span>
              <strong>{marketplaceCopy(reward.name)}</strong>
            </div>
            <p>
              {marketplaceCopy(
                reward.countsTowardDailyCap
                  ? 'This reward draws from the daily and monthly circuits shown above.'
                  : 'This reward is tracked outside the standard daily-cap circuit.'
              )}{' '}
              {marketplaceCopy(
                data.partial
                  ? 'Some ledger telemetry is temporarily partial.'
                  : 'All displayed totals were verified.'
              )}
            </p>
            <button type="button" onClick={loadProgress}>
              Refresh Ledger
            </button>
          </div>
        </>
      )}
    </section>
  );
}
