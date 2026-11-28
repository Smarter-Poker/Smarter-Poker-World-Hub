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

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import styles from './SmarterSeoKit.module.css';

export const PENDING_UNLOCK_KEY = 'sp_pending_unlock_v1';
export const JUST_UNLOCKED_KEY = 'sp_just_unlocked_v1';
export const SAVED_SPOTS_STORAGE_KEY = 'sp_saved_spots_v1';
export const SPOTS_SYNCED_SESSION_KEY = 'sp_spots_synced_v1';
export const DAY0_WINS_STORAGE_KEY = 'sp_day0_wins_v1';

export function buildMemberShareReferralUrl({ userId, playerNumber, siteUrl = 'https://smarter.poker' } = {}) {
  const base = String(siteUrl || 'https://smarter.poker').trim().replace(/\/+$/, '') || 'https://smarter.poker';
  const rawCode = playerNumber != null ? String(playerNumber).trim() : '';
  const isValidNumeric = /^\d+$/.test(rawCode) && Number(rawCode) > 0;
  const cleanCode = isValidNumeric ? String(Number(rawCode)) : '';
  if (cleanCode) {
    return `${base}/auth/signup?ref=${encodeURIComponent(cleanCode)}&utm_source=member_share&utm_medium=referral&utm_campaign=day0_invite`;
  }
  void userId;
  return `${base}/auth/signup?src=member-share&utm_source=member_share&utm_medium=referral&utm_campaign=day0_invite`;
}

let spotsSyncInflight = false;

function readStoredAccessToken(localStorageRef) {
  try {
    const raw = localStorageRef?.getItem('smarter-poker-auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const token = typeof parsed?.access_token === 'string' ? parsed.access_token.trim() : '';
    return token.length > 10 ? token : '';
  } catch (_) {
    return '';
  }
}

export function sanitizeGuestSpots(rawList) {
  if (!Array.isArray(rawList)) return [];
  const cleaned = [];
  for (const item of rawList.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue;
    const spot = {
      id: String(item.id || `spot_${cleaned.length}`).slice(0, 80),
      toolSlug: String(item.toolSlug || 'poker-tool').slice(0, 80),
      toolName: String(item.toolName || 'Smarter.Poker Calculator').slice(0, 140),
      summaryText: String(item.summaryText || '').slice(0, 320),
      url: String(item.url || '').slice(0, 320),
      savedAt: String(item.savedAt || '').slice(0, 40),
    };
    if (typeof item.kind === 'string' && item.kind.trim()) {
      spot.kind = item.kind.trim().slice(0, 48);
    }
    if (typeof item.label === 'string' && item.label.trim()) {
      spot.label = item.label.trim().slice(0, 140);
    }
    if (typeof item.eventDate === 'string' && item.eventDate.trim()) {
      spot.eventDate = item.eventDate.trim().slice(0, 40);
    }
    if (typeof item.startDate === 'string' && item.startDate.trim()) {
      spot.startDate = item.startDate.trim().slice(0, 40);
    }
    if (typeof item.seriesName === 'string' && item.seriesName.trim()) {
      spot.seriesName = item.seriesName.trim().slice(0, 140);
    }
    if (typeof item.venue === 'string' && item.venue.trim()) {
      spot.venue = item.venue.trim().slice(0, 140);
    }
    if (typeof item.path === 'string' && item.path.trim().startsWith('/')) {
      spot.path = item.path.trim().slice(0, 200);
    }
    if (typeof item.reminded_at === 'string' && item.reminded_at.trim()) {
      spot.reminded_at = item.reminded_at.trim().slice(0, 40);
    }
    cleaned.push(spot);
  }
  return cleaned;
}

export function mergeSavedSpotsPreservingReminders(existingSpots, incomingSpots) {
  const existingMap = new Map();
  if (Array.isArray(existingSpots)) {
    for (const spot of existingSpots) {
      if (spot && typeof spot === 'object' && spot.id) {
        existingMap.set(String(spot.id), spot);
      }
    }
  }
  const merged = [];
  const seen = new Set();
  for (const spot of sanitizeGuestSpots(incomingSpots)) {
    const prev = existingMap.get(spot.id);
    merged.push(
      prev?.reminded_at && !spot.reminded_at
        ? { ...spot, reminded_at: prev.reminded_at }
        : spot,
    );
    seen.add(spot.id);
  }
  if (Array.isArray(existingSpots)) {
    for (const spot of sanitizeGuestSpots(existingSpots)) {
      if (!seen.has(spot.id)) {
        merged.push(spot);
        seen.add(spot.id);
      }
    }
  }
  return merged.slice(0, 25);
}

/**
 * Non-blockingly syncs guest calculator saved spots (localStorage sp_saved_spots_v1)
 * to BOTH the authenticated player's cloud record (/api/training/tool-records) AND
 * auth.users.user_metadata.sp_saved_spots_v1 (so Phase D series event reminders
 * in organicWelcomeDripRunner.mjs can dispatch real upcoming event emails) once per
 * browser session (guarded by sessionStorage sp_spots_synced_v1).
 */
export async function syncGuestSavedSpotsToCloud(deps = {}) {
  const win = typeof window !== 'undefined' ? window : null;
  const localStore = deps.localStorage || win?.localStorage;
  const sessionStore = deps.sessionStorage || win?.sessionStorage;
  const fetchFn = deps.fetch || (typeof fetch === 'function' ? fetch : null);

  if (!localStore || !sessionStore || !fetchFn) return false;
  if (spotsSyncInflight && !deps.fetch) return false;

  try {
    if (sessionStore.getItem(SPOTS_SYNCED_SESSION_KEY)) return false;
    const accessToken = readStoredAccessToken(localStore);
    if (!accessToken) return false;

    const rawSpots = localStore.getItem(SAVED_SPOTS_STORAGE_KEY);
    if (!rawSpots) return false;
    const parsedSpots = JSON.parse(rawSpots);
    const spots = sanitizeGuestSpots(parsedSpots);
    if (spots.length === 0) return false;

    const payload = {
      toolId: 'calculator-saved-spots',
      recordType: 'saved_spots',
      recordKey: 'guest_spots_v1',
      data: {
        spots,
        syncedAt: new Date().toISOString(),
        source: 'seo-guest-bridge',
      },
    };
    if (JSON.stringify(payload.data).length > 60000) {
      payload.data.spots = spots.slice(0, 20);
    }

    spotsSyncInflight = true;
    const res = await fetchFn('/api/training/tool-records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res && res.ok) {
      // Mirror structured spots (including series-reminder eventDate/kind) into
      // auth.users.user_metadata.sp_saved_spots_v1 without adding static _app.js weight.
      try {
        if (typeof deps.updateUserMetadata === 'function') {
          await deps.updateUserMetadata(payload.data.spots);
        } else if (!deps.fetch && win) {
          const mod = await import('../../lib/supabase');
          const sb = mod?.supabase;
          if (sb?.auth && typeof sb.auth.getUser === 'function' && typeof sb.auth.updateUser === 'function') {
            const { data: userData } = await sb.auth.getUser();
            const existingMetaSpots = userData?.user?.user_metadata?.sp_saved_spots_v1;
            const mergedSpots = mergeSavedSpotsPreservingReminders(existingMetaSpots, payload.data.spots);
            await sb.auth.updateUser({
              data: { sp_saved_spots_v1: mergedSpots },
            });
          }
        }
      } catch (_) {
        /* non-blocking: tool-records sync already succeeded */
      }

      try {
        sessionStore.setItem(SPOTS_SYNCED_SESSION_KEY, '1');
      } catch (_) {
        /* ignore storage restrictions */
      }
      trackSeoFunnelEvent('seo_guest_spots_synced', {
        spot_count: payload.data.spots.length,
      });
      return true;
    }
    return false;
  } catch (_) {
    /* never disrupt signed-in render on auth or network failures */
    return false;
  } finally {
    spotsSyncInflight = false;
  }
}

const UNLOCK_COPY_MAP = {
  'solver-matrix': 'Your Full GTO Preflop & Postflop Solver Library Is Now Unlocked.',
  'calculator-pro': 'Cloud Spot Saving & Multi-Scenario Sync Are Now Active On Your Account.',
  'calc-session-milestone': 'Your Studied Calculator Spots & Cloud Study History Are Now Synced.',
  'live-venue-intel': 'Live Poker Room Alerts, Waitlist Tracking & Saved Cardrooms Are Now Active.',
  'venue-intel': 'Live Poker Room Alerts, Waitlist Tracking & Saved Cardrooms Are Now Active.',
  'venue-follow': 'Your Followed Poker Room Is Saved With Live Schedule & Waitlist Alerts.',
  'local-state-rooms': 'Your State Poker Room Guide, Saved Rooms & Session Tracker Are Active.',
  'local-city-rooms': 'Your Local City Poker Room Alerts, Schedules & Bankroll Tracker Are Active.',
  'local-game-rooms': 'Your Live Cash Game Room Alerts & Session Tracker Are Now Active.',
  'local-corridor-rooms': 'Your Poker Corridor Room Directory & Trip Tracker Are Now Active.',
  'series-alerts-event-reminder': 'Your Tournament Event Reminder Is Saved To Cloud & Ready For Start Alerts.',
  'series-alerts': 'Tournament Series Reminders & Schedule Tracking Are Now Active.',
  'video-practice': 'Practice This Strategy Spot Inside 107 Interactive GTO Training Games.',
  'video-bookmark': 'Your Strategy Video Is Bookmarked & Ready For Your Study Streak.',
  'video-drill': 'Interactive Video Hand Quizzes, Study Playlists & Pro Bookmarks Are Now Active.',
  'concept-bridge': 'Your Strategy Concept Bridge Is Unlocked Inside 107 Interactive GTO Games.',
  'study-deck': 'Your Personal Poker Study Deck, Leak Tracker & 107 GTO Games Are Unlocked.',
  'dataset-export': 'Full Interactive Filter Matrix, Benchmark Tables & CSV Exports Are Now Active.',
  'training-gto': 'Your Full 5-Category GTO Leak Matrix & 107 Interactive Training Games Are Unlocked.',
  'gto-leak-finder-report': 'Your Full 5-Category GTO Leak Matrix & Custom 107-Game Drill Plan Are Unlocked.',
  'editorial-wire': 'Weekly GTO Strategy Polls, Full Wire Archives & Pro Alerts Are Now Active.',
  'masthead': 'Your Free Smarter.Poker Pro Console, 107 GTO Games & Live Venue Intel Are Active.',
};

export function buildDay0ChecklistState({ savedSpotCount = 0, completedIds = [] } = {}) {
  const doneSet = new Set(Array.isArray(completedIds) ? completedIds : []);
  const hasSavedSpot = Number(savedSpotCount) > 0 || doneSet.has('save-first-spot');
  return [
    {
      id: 'save-first-spot',
      step: 1,
      label: 'Save Your First Spot Or Range',
      href: '/tools/gto-leak-finder',
      completed: hasSavedSpot,
    },
    {
      id: 'play-gto-hands',
      step: 2,
      label: 'Play 3 Free GTO Hands',
      href: '/hub/training',
      completed: doneSet.has('play-gto-hands'),
    },
    {
      id: 'follow-live-room',
      step: 3,
      label: 'Follow A Live Poker Room Or Series',
      href: '/hub/poker-near-me',
      completed: doneSet.has('follow-live-room'),
    },
  ];
}

export function resolveHubGravityLinks(unlockKey = '', pathname = '') {
  const key = String(unlockKey || '').toLowerCase();
  const path = String(pathname || '').toLowerCase();

  if (
    key.includes('venue') ||
    key.includes('series') ||
    path.startsWith('/hub/venues') ||
    path.startsWith('/hub/series') ||
    path.startsWith('/hub/poker-near-me') ||
    path.startsWith('/poker-rooms')
  ) {
    return [
      { href: '/tools/gto-leak-finder', label: '60-Second GTO Leak Finder', tag: 'Free Diagnostic' },
      { href: '/hub/bankroll-manager', label: 'Free Bankroll Manager', tag: 'Log Live Cash' },
    ];
  }

  if (
    key.includes('gto') ||
    key.includes('solver') ||
    key.includes('calc') ||
    key.includes('preflop') ||
    key.includes('training') ||
    path.startsWith('/tools') ||
    path.startsWith('/hub/training')
  ) {
    return [
      { href: '/hub/bankroll-manager', label: 'Free Bankroll Manager', tag: 'Track Sessions' },
      { href: '/hub/poker-near-me/lobby', label: 'Live Poker Near Me', tag: 'Find Live Games' },
    ];
  }

  if (
    key.includes('study') ||
    key.includes('video') ||
    key.includes('editorial') ||
    key.includes('dataset') ||
    path.startsWith('/learn') ||
    path.startsWith('/compare')
  ) {
    return [
      { href: '/tools/gto-leak-finder', label: '60-Second GTO Leak Finder', tag: '5-Hand Test' },
      { href: '/hub/poker-near-me/lobby', label: 'Live Poker Near Me', tag: 'Listed Rooms' },
    ];
  }

  return [
    { href: '/tools/gto-leak-finder', label: '60-Second GTO Leak Finder', tag: 'Free Diagnostic' },
    { href: '/hub/bankroll-manager', label: 'Free Bankroll Manager', tag: 'Track Profit' },
  ];
}

function readLocalSavedSpotCount() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(SAVED_SPOTS_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (_) {
    return 0;
  }
}

function readCompletedDay0Wins() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(DAY0_WINS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch (_) {
    return [];
  }
}

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

function readStoredMemberIdentity() {
  if (typeof window === 'undefined') return { userId: '', playerNumber: null };
  let userId = '';
  let playerNumber = null;
  try {
    const rawAuth = window.localStorage.getItem('smarter-poker-auth');
    if (rawAuth) {
      const parsed = JSON.parse(rawAuth);
      const user = parsed?.user || null;
      if (user?.id) userId = String(user.id);
      const authPlayerNum =
        user?.user_metadata?.player_number ??
        user?.player_number ??
        parsed?.player_number ??
        null;
      if (authPlayerNum != null && String(authPlayerNum).trim() !== '') {
        playerNumber = authPlayerNum;
      }
    }
    if (playerNumber == null) {
      const rawHeader = window.localStorage.getItem('sp-cached-header-user');
      if (rawHeader) {
        const cached = JSON.parse(rawHeader);
        const cachedNum = cached?.player_number ?? cached?.playerNumber ?? null;
        if (cachedNum != null && String(cachedNum).trim() !== '') {
          playerNumber = cachedNum;
        }
      }
    }
  } catch (_) {
    /* ignore storage restrictions */
  }
  return { userId, playerNumber };
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
  const [syncedSpotCount, setSyncedSpotCount] = useState(0);
  const [completedWinIds, setCompletedWinIds] = useState([]);
  const [memberIdentity, setMemberIdentity] = useState({ userId: '', playerNumber: null });
  const [copiedInvite, setCopiedInvite] = useState(false);
  const inviteTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current);
    };
  }, []);

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

    setSyncedSpotCount(readLocalSavedSpotCount());
    setCompletedWinIds(readCompletedDay0Wins());
    setMemberIdentity(readStoredMemberIdentity());
    void syncGuestSavedSpotsToCloud();

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
      const unlockKey = parsed.unlockKey;
      setBannerState(parsed);
      try {
        window.dispatchEvent(
          new CustomEvent('sp:peak-utility-pwa', {
            detail: { unlockKey },
          }),
        );
      } catch (_) {
        /* non-blocking */
      }
      trackSeoFunnelEvent('seo_post_signup_activation_shown', {
        unlock_key: unlockKey,
        source: parsed.source || 'seo-unlock',
        pathname: path,
      });
    } catch (_) {
      setBannerState(null);
    }
  }, [router?.asPath]);

  const handleCopyInviteLink = async () => {
    const referralUrl = buildMemberShareReferralUrl({
      userId: memberIdentity.userId,
      playerNumber: memberIdentity.playerNumber,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralUrl);
        setCopiedInvite(true);
        if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current);
        inviteTimerRef.current = setTimeout(() => setCopiedInvite(false), 2400);
      }
      trackSeoFunnelEvent('seo_member_referral_link_copied', {
        unlock_key: bannerState?.unlockKey || 'free-account',
        source: bannerState?.source || 'seo-unlock',
        has_player_number: Boolean(memberIdentity.playerNumber),
      });
    } catch (_) {
      /* ignore clipboard refusal */
    }
  };

  const markDay0Win = (winId) => {
    setCompletedWinIds((prev) => {
      const next = prev.includes(winId) ? prev : [...prev, winId];
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(DAY0_WINS_STORAGE_KEY, JSON.stringify(next));
        }
      } catch (_) {
        /* ignore */
      }
      return next;
    });
    if (bannerState) {
      trackSeoFunnelEvent('seo_post_signup_day0_win_click', {
        win_id: winId,
        unlock_key: bannerState.unlockKey,
        source: bannerState.source || 'seo-unlock',
      });
    }
  };

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

  const currentPath = String(router?.asPath || '').split('?')[0];
  const day0Items = buildDay0ChecklistState({
    savedSpotCount: syncedSpotCount,
    completedIds: completedWinIds,
  });
  const completedCount = day0Items.filter((item) => item.completed).length;
  const gravityLinks = resolveHubGravityLinks(bannerState.unlockKey, currentPath);

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

      <div
        data-testid="unlocked-banner-day0-checklist"
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid #243b54',
          display: 'grid',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            style={{
              color: '#86daff',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}
          >
            {`Day-0 First 3 Wins (${completedCount}/3 Completed)`}
          </span>
          {syncedSpotCount > 0 ? (
            <span style={{ color: '#22c55e', fontSize: 11, fontWeight: 700 }}>
              {`${syncedSpotCount} Saved Spot${syncedSpotCount === 1 ? '' : 's'} Synced`}
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 6,
          }}
        >
          {day0Items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              data-testid={`day0-win-${item.id}`}
              onClick={() => markDay0Win(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 0,
                border: `1px solid ${item.completed ? '#22c55e' : '#2b4663'}`,
                background: item.completed ? 'rgba(22, 101, 52, 0.25)' : 'rgba(11, 17, 32, 0.85)',
                color: '#f2f7ff',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                lineHeight: 1.3,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  color: item.completed ? '#22c55e' : '#38bdf8',
                  fontWeight: 800,
                  flex: 'none',
                }}
              >
                {item.completed ? '✓' : `${item.step}.`}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div
        data-testid="unlocked-banner-gravity-rail"
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid #1e354d',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            color: '#bdd0e2',
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Explore More Free On Smarter.Poker
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {gravityLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.btnSharpSecondary}
              data-testid={`gravity-link-${link.href.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`}
              onClick={() => dismiss(`gravity-${link.href}`)}
              style={{ minHeight: 34, padding: '0 10px', fontSize: 12 }}
            >
              <span>{link.label}</span>
              <span style={{ color: '#38bdf8', fontSize: 11 }}>{`· ${link.tag}`}</span>
            </Link>
          ))}
        </div>
      </div>

      <div
        data-testid="unlocked-banner-referral-bar"
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid #1e354d',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            color: '#bdd0e2',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Share Your Personal Invite Link With Poker Friends
        </span>
        <button
          type="button"
          className={styles.btnSharpSecondary}
          data-testid="unlocked-banner-invite-btn"
          onClick={handleCopyInviteLink}
          style={{ minHeight: 44, padding: '0 12px', fontSize: 12 }}
        >
          {copiedInvite
            ? 'Invite Link Copied'
            : 'Invite A Poker Friend (Free 30-Day VIP + 500 Diamonds)'}
        </button>
      </div>
    </aside>
  );
}
