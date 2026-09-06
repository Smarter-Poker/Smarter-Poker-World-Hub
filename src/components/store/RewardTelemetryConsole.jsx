import Link from 'next/link';
import { Activity, Gauge, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authedFetch, ensureAuthReady, getAuthUser } from '../../lib/authUtils';
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

function clampPercent(value, maximum) {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / maximum) * 100)));
}

function Circuit({ label, earned, cap, remaining }) {
  const percent = clampPercent(earned, cap);
  return (
    <div className={styles.circuit}>
      <div className={styles.circuitHeader}>
        <div>
          <span>{label}</span>
          <strong>{Number(earned || 0).toLocaleString()} / {Number(cap || 0).toLocaleString()} Diamonds</strong>
        </div>
        <b>{percent}%</b>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={`${label}: ${Number(earned || 0).toLocaleString()} of ${Number(cap || 0).toLocaleString()} Diamonds`}
        aria-valuemin={0}
        aria-valuemax={Number(cap || 0)}
        aria-valuenow={Math.min(Number(earned || 0), Number(cap || 0))}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{Number(remaining || 0).toLocaleString()} Diamonds Remain In This Verified Circuit.</small>
    </div>
  );
}

export default function RewardTelemetryConsole({ reward, canonical }) {
  const [state, setState] = useState({ status: 'loading', data: EMPTY_PROGRESS, message: '' });
  const requestRef = useRef(0);
  const abortRef = useRef(null);

  const loadProgress = useCallback(async () => {
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
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
    setState((current) => ({ ...current, status: 'loading', message: '' }));
    try {
      const user = getAuthUser() || (await Promise.race([ensureAuthReady(supabase), deadline]));
      if (requestId !== requestRef.current) return;
      if (!user?.id) {
        setState({ status: 'signed-out', data: EMPTY_PROGRESS, message: '' });
        return;
      }
      const response = await Promise.race([
        authedFetch('/api/rewards/progress', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        }),
        deadline,
      ]);
      const body = await response.json().catch(() => null);
      if (requestId !== requestRef.current) return;
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Reward telemetry is temporarily unavailable.');
      }
      setState({ status: 'ready', data: { ...EMPTY_PROGRESS, ...body }, message: '' });
    } catch (error) {
      if (requestId !== requestRef.current) return;
      if (error?.name === 'AbortError' && !timedOut) return;
      setState({
        status: 'error',
        data: EMPTY_PROGRESS,
        message: timedOut
          ? 'Reward Telemetry Timed Out. Retry The Secure Ledger Read.'
          : error?.message || 'Reward telemetry is temporarily unavailable.',
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadProgress();
    return () => {
      requestRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [loadProgress]);

  const data = state.data;
  const loginHref = `/auth/login?redirect=${encodeURIComponent(canonical)}`;

  return (
    <section id="reward-telemetry" className={styles.console} aria-labelledby="reward-telemetry-title">
      <div className={styles.consoleHeader}>
        <div>
          <span className={styles.kicker}><Activity size={15} aria-hidden="true" /> Live Account Signal</span>
          <h2 id="reward-telemetry-title">Verified Reward Telemetry</h2>
          <p>Your Server-Owned Earning Caps, Streak, And Multiplier: Read Directly From The Diamond Ledger.</p>
        </div>
        <span className={styles.integrityBadge}><ShieldCheck size={16} aria-hidden="true" /> Ledger Verified</span>
      </div>

      {state.status === 'loading' && (
        <div className={styles.statePanel} role="status" aria-live="polite">
          <Gauge size={23} aria-hidden="true" /> Synchronizing Your Reward Circuits…
        </div>
      )}

      {state.status === 'signed-out' && (
        <div className={styles.statePanel}>
          <Sparkles size={23} aria-hidden="true" />
          <div>
            <strong>Connect Your Diamond Ledger</strong>
            <p>Sign In To See Your Real Cap Usage, Login Streak, And Multiplier For {marketplaceCopy(reward.name)}.</p>
            <Link href={loginHref}>Sign In To View My Telemetry</Link>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className={styles.statePanel} role="alert">
          <Gauge size={23} aria-hidden="true" />
          <div>
            <strong>Telemetry Link Interrupted</strong>
            <p>{marketplaceCopy(state.message)}</p>
            <button type="button" onClick={loadProgress}><RefreshCw size={15} aria-hidden="true" /> Retry Secure Read</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
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

          <div className={styles.signalGrid} aria-label="Reward account signals">
            <div><span>Login Streak</span><strong>{Number(data.loginStreak || 0)} Days</strong></div>
            <div><span>Share Multiplier</span><strong>{Number(data.multiplier || 1).toFixed(2)}×</strong></div>
            <div><span>Cap Profile</span><strong>{data.isVip ? 'VIP 150' : 'Standard 110'}</strong></div>
            <div><span>Ledger Clock</span><strong>{data.timezone || 'America/Chicago'}</strong></div>
          </div>

          <div className={styles.rewardSignal}>
            <div>
              <span>Selected Reward Signal</span>
              <strong>{reward.name}</strong>
            </div>
            <p>
              {reward.countsTowardDailyCap
                ? 'This reward draws from the daily and monthly circuits shown above.'
                : 'This reward is tracked outside the standard daily-cap circuit.'}
              {data.partial ? ' Some ledger telemetry is temporarily partial.' : ' All displayed totals were verified.'}
            </p>
            <button type="button" onClick={loadProgress}><RefreshCw size={15} aria-hidden="true" /> Refresh Ledger</button>
          </div>
        </>
      )}
    </section>
  );
}
