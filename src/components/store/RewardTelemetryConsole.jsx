import Link from 'next/link';
import { Activity, Gauge, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { authedFetch, ensureAuthReady, getAuthUser } from '../../lib/authUtils';
import supabase from '../../lib/supabase';
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
      <small>{Number(remaining || 0).toLocaleString()} Diamonds remain in this verified circuit.</small>
    </div>
  );
}

export default function RewardTelemetryConsole({ reward, canonical }) {
  const [state, setState] = useState({ status: 'loading', data: EMPTY_PROGRESS, message: '' });

  const loadProgress = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', message: '' }));
    const user = getAuthUser() || (await ensureAuthReady(supabase));
    if (!user?.id) {
      setState({ status: 'signed-out', data: EMPTY_PROGRESS, message: '' });
      return;
    }

    try {
      const response = await authedFetch('/api/rewards/progress', {
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Reward telemetry is temporarily unavailable.');
      }
      setState({ status: 'ready', data: { ...EMPTY_PROGRESS, ...body }, message: '' });
    } catch (error) {
      setState({
        status: 'error',
        data: EMPTY_PROGRESS,
        message: error?.message || 'Reward telemetry is temporarily unavailable.',
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    const guardedLoad = async () => {
      if (!active) return;
      await loadProgress();
    };
    void guardedLoad();
    return () => { active = false; };
  }, [loadProgress]);

  const data = state.data;
  const loginHref = `/auth/login?redirect=${encodeURIComponent(canonical)}`;

  return (
    <section id="reward-telemetry" className={styles.console} aria-labelledby="reward-telemetry-title">
      <div className={styles.consoleHeader}>
        <div>
          <span className={styles.kicker}><Activity size={15} aria-hidden="true" /> Live Account Signal</span>
          <h2 id="reward-telemetry-title">Verified Reward Telemetry</h2>
          <p>Your server-owned earning caps, streak, and multiplier-read directly from the diamond ledger.</p>
        </div>
        <span className={styles.integrityBadge}><ShieldCheck size={16} aria-hidden="true" /> Ledger Verified</span>
      </div>

      {state.status === 'loading' && (
        <div className={styles.statePanel} role="status" aria-live="polite">
          <Gauge size={23} aria-hidden="true" /> Synchronizing your reward circuits…
        </div>
      )}

      {state.status === 'signed-out' && (
        <div className={styles.statePanel}>
          <Sparkles size={23} aria-hidden="true" />
          <div>
            <strong>Connect Your Diamond Ledger</strong>
            <p>Sign in to see your real cap usage, login streak, and multiplier for {reward.name}.</p>
            <Link href={loginHref}>Sign In To View My Telemetry</Link>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className={styles.statePanel} role="alert">
          <Gauge size={23} aria-hidden="true" />
          <div>
            <strong>Telemetry Link Interrupted</strong>
            <p>{state.message}</p>
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
