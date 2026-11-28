/**
 * Post-signup unlock continuity & activation welcome banner.
 *
 * Bridges the moment a guest finishes creating a free account from any SEO
 * unlock gate, calculator save bar, or quick-signup sheet directly into active
 * product usage (107 GTO Training Games + Claim 30-Day VIP & 500 Diamonds).
 *
 * Zero static analytics.js imports (uses lightweight sendBeacon telemetry).
 * House style: #SMARTERDESIGN, Title Case, zero em dashes.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import styles from './SmarterSeoKit.module.css';

export const PENDING_UNLOCK_KEY = 'sp_pending_unlock_v1';
export const JUST_UNLOCKED_KEY = 'sp_just_unlocked_v1';

const UNLOCK_COPY_MAP = {
  'solver-matrix': 'Your Full GTO Preflop & Postflop Solver Library Is Now Unlocked.',
  'calculator-pro': 'Cloud Spot Saving & Multi-Scenario Sync Are Now Active On Your Account.',
  'live-venue-intel': 'Live Poker Room Alerts, Waitlist Tracking & Saved Cardrooms Are Now Active.',
  'venue-intel': 'Live Poker Room Alerts, Waitlist Tracking & Saved Cardrooms Are Now Active.',
  'series-alerts': 'Tournament Series Reminders & Schedule Tracking Are Now Active.',
  'video-drill': 'Interactive Video Hand Quizzes, Study Playlists & Pro Bookmarks Are Now Active.',
  'study-deck': 'Your Personal Poker Study Deck, Leak Tracker & 107 GTO Games Are Unlocked.',
  'dataset-export': 'Full Interactive Filter Matrix, Benchmark Tables & CSV Exports Are Now Active.',
  'editorial-wire': 'Weekly GTO Strategy Polls, Full Wire Archives & Pro Alerts Are Now Active.',
  'masthead': 'Your Free Smarter.Poker Pro Console, 107 GTO Games & Live Venue Intel Are Active.',
};

function hasStoredAuthSession() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('smarter-poker-auth');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && (parsed.access_token || parsed.user));
  } catch (_) {
    return false;
  }
}

export function recordPendingSeoUnlock({ unlockKey = 'free-account', source = 'seo-unlock', redirectPath = '/hub' } = {}) {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      unlockKey: String(unlockKey || 'free-account').slice(0, 64),
      source: String(source || 'seo-unlock').slice(0, 64),
      redirectPath: String(redirectPath || '/hub').slice(0, 200),
      recordedAt: Date.now(),
    };
    window.sessionStorage.setItem(PENDING_UNLOCK_KEY, JSON.stringify(payload));
  } catch (_) {
    /* storage may be unavailable */
  }
}

export function promotePendingSeoUnlock(explicitUnlockKey = '') {
  if (typeof window === 'undefined') return;
  try {
    let pending = null;
    const raw = window.sessionStorage.getItem(PENDING_UNLOCK_KEY);
    if (raw) {
      pending = JSON.parse(raw);
      window.sessionStorage.removeItem(PENDING_UNLOCK_KEY);
    }
    const cleanExplicit = String(explicitUnlockKey || '').trim().slice(0, 64);
    const unlockKey = cleanExplicit || pending?.unlockKey || '';
    if (!unlockKey) return;
    window.sessionStorage.setItem(
      JUST_UNLOCKED_KEY,
      JSON.stringify({
        unlockKey,
        source: pending?.source || 'seo-unlock',
        activatedAt: Date.now(),
      }),
    );
  } catch (_) {
    /* storage may be unavailable */
  }
}

function resolveWelcomeBody(unlockKey) {
  const key = String(unlockKey || '').toLowerCase();
  for (const [prefix, message] of Object.entries(UNLOCK_COPY_MAP)) {
    if (key.includes(prefix)) return message;
  }
  if (key.includes('calc-save') || key.includes('preflop')) {
    return 'Cloud Range & Calculation Sync Is Live. Claim Your Welcome Bonus Or Jump Into GTO Drills.';
  }
  return 'Your Free Smarter.Poker Account Is Active. Claim Your Welcome Package Or Start 107 GTO Games.';
}

export default function SmarterUnlockedWelcomeBanner() {
  const router = useRouter();
  const [bannerState, setBannerState] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = String(router?.asPath || window.location.pathname || '').split('?')[0];
    if (path.startsWith('/auth') || path.startsWith('/hub/verify-phone')) {
      setBannerState(null);
      return;
    }
    if (!hasStoredAuthSession()) {
      setBannerState(null);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(JUST_UNLOCKED_KEY);
      if (!raw) {
        setBannerState(null);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.unlockKey) {
        setBannerState(null);
        return;
      }
      setBannerState(parsed);
      trackSeoFunnelEvent('seo_post_signup_activation_shown', {
        unlock_key: parsed.unlockKey,
        source: parsed.source || 'seo-unlock',
        pathname: path,
      });
    } catch (_) {
      setBannerState(null);
    }
  }, [router?.asPath]);

  const dismiss = (reason = 'dismiss') => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(JUST_UNLOCKED_KEY);
      }
    } catch (_) {
      /* ignore */
    }
    if (bannerState) {
      trackSeoFunnelEvent(
        reason === 'dismiss' ? 'seo_post_signup_activation_dismissed' : 'seo_post_signup_activation_click',
        {
          action: reason,
          unlock_key: bannerState.unlockKey,
          source: bannerState.source || 'seo-unlock',
        },
      );
    }
    setBannerState(null);
  };

  if (!bannerState) return null;

  return (
    <aside
      className={`${styles.kit} ${styles.frameActive} ${styles.unlockedBanner}`}
      role="status"
      aria-live="polite"
      aria-label="Free Smarter.Poker Account Activated"
      data-testid="unlocked-welcome-banner"
    >
      <div className={styles.unlockedBannerRow}>
        <div className={styles.unlockedBannerCopy}>
          <span className={styles.eyebrowTag}>Account Unlocked</span>
          <div className={styles.unlockedBannerTitle}>Welcome To Smarter.Poker</div>
          <p className={styles.unlockedBannerBody}>{resolveWelcomeBody(bannerState.unlockKey)}</p>
        </div>

        <div className={styles.unlockedBannerActions}>
          <Link
            href="/hub/verify-phone?welcome=1"
            className={styles.ctaPrimary}
            data-testid="unlocked-banner-claim-vip"
            onClick={() => dismiss('claim-vip')}
          >
            Claim 30-Day VIP + 500 Diamonds
          </Link>
          <Link
            href="/hub/training"
            className={styles.ctaSecondary}
            data-testid="unlocked-banner-launch-training"
            onClick={() => dismiss('launch-training')}
          >
            Launch 107 GTO Games
          </Link>
          <button
            type="button"
            className={styles.engagedNudgeClose}
            aria-label="Dismiss Account Unlocked Banner"
            data-testid="unlocked-banner-dismiss"
            onClick={() => dismiss('dismiss')}
          >
            ×
          </button>
        </div>
      </div>
    </aside>
  );
}
