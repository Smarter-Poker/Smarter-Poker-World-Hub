/**
 * Returning-Guest Continuity Pill (#SMARTERDESIGN).
 *
 * Loaded lazily inside GuestConversionBar via next/dynamic(..., { ssr: false })
 * so pages/_app.js stays strictly <= 100 static modules.
 *
 * Surfaces a compact, dismissible cloud-sync banner ONLY for unauthenticated
 * returning visitors (visitCount >= 2 && savedSpotCount >= 1 && !dismissed).
 * Zero static supabase/analytics imports, zero banned gold, zero em dashes.
 */

import { useEffect, useState } from 'react';
import { openQuickSignup } from './SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';

export const GUEST_VISIT_COUNT_KEY = 'sp_visit_count_v1';
export const GUEST_VISIT_SESSION_KEY = 'sp_visit_counted_session_v1';
export const RETURNING_PILL_DISMISSED_KEY = 'sp_returning_pill_dismissed_v1';
export const SAVED_SPOTS_STORAGE_KEY = 'sp_saved_spots_v1';

/**
 * Pure helper: increments and persists guest visit count in `storage['sp_visit_count_v1']`.
 */
export function recordGuestVisitCount(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return 0;
  }
  try {
    const raw = storage.getItem(GUEST_VISIT_COUNT_KEY);
    const parsed = Number(raw);
    const current = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
    const next = current + 1;
    storage.setItem(GUEST_VISIT_COUNT_KEY, String(next));
    return next;
  } catch (_) {
    return 0;
  }
}

/**
 * Pure helper: reads current guest visit count without mutating storage.
 */
export function readGuestVisitCount(storage) {
  if (!storage || typeof storage.getItem !== 'function') return 0;
  try {
    const parsed = Number(storage.getItem(GUEST_VISIT_COUNT_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Pure helper: reads saved guest spot count from `storage['sp_saved_spots_v1']`.
 */
export function readSavedSpotCount(storage) {
  if (!storage || typeof storage.getItem !== 'function') return 0;
  try {
    const raw = storage.getItem(SAVED_SPOTS_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Pure gate: returns true ONLY when visitCount >= 2, savedSpotCount >= 1, and !dismissed.
 */
export function shouldShowReturningGuestPill({
  visitCount = 0,
  savedSpotCount = 0,
  dismissed = false,
} = {}) {
  const visits = Number(visitCount);
  const spots = Number(savedSpotCount);
  return Boolean(
    Number.isFinite(visits) &&
      visits >= 2 &&
      Number.isFinite(spots) &&
      spots >= 1 &&
      !dismissed,
  );
}

function hasStoredAuthSession() {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;
    const explicit = storage.getItem('smarter-poker-auth');
    if (explicit) {
      try {
        const parsed = JSON.parse(explicit);
        if (parsed && (parsed.access_token || parsed.user)) return true;
      } catch (_) {
        if (explicit.length > 10) return true;
      }
    }
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        const raw = storage.getItem(key);
        if (raw && raw !== '{}' && raw !== 'null') return true;
      }
    }
  } catch (_) {
    return false;
  }
  return false;
}

export default function ReturningGuestSyncPill({ currentPath = '/', signedIn = false } = {}) {
  const [visitCount, setVisitCount] = useState(0);
  const [savedSpotCount, setSavedSpotCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [isAuthed, setIsAuthed] = useState(Boolean(signedIn));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const evaluate = (shouldCountVisit) => {
      const authed = Boolean(signedIn) || hasStoredAuthSession();
      setIsAuthed(authed);
      if (authed) return;

      let pillDismissed = false;
      try {
        pillDismissed = window.sessionStorage?.getItem(RETURNING_PILL_DISMISSED_KEY) === '1';
      } catch (_) {
        pillDismissed = false;
      }
      setDismissed(pillDismissed);

      let visits = readGuestVisitCount(window.localStorage);
      if (shouldCountVisit) {
        let alreadyCountedSession = false;
        try {
          alreadyCountedSession = window.sessionStorage?.getItem(GUEST_VISIT_SESSION_KEY) === '1';
        } catch (_) {
          alreadyCountedSession = false;
        }
        if (!alreadyCountedSession) {
          visits = recordGuestVisitCount(window.localStorage);
          try {
            window.sessionStorage?.setItem(GUEST_VISIT_SESSION_KEY, '1');
          } catch (_) {
            /* ignore storage restrictions */
          }
        }
      }
      setVisitCount(visits);
      setSavedSpotCount(readSavedSpotCount(window.localStorage));
    };

    evaluate(true);
    const onStorage = () => evaluate(false);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [signedIn]);

  if (isAuthed || !shouldShowReturningGuestPill({ visitCount, savedSpotCount, dismissed })) {
    return null;
  }

  const copy = `Welcome Back - Sync Your ${savedSpotCount} Saved Spot${savedSpotCount === 1 ? '' : 's'} & Claim Free 30-Day VIP`;

  const handleSyncClick = () => {
    trackSeoFunnelEvent('seo_calculator_save_bar_click', {
      source: 'returning-guest-pill',
      unlock_key: 'returning-guest-sync',
      saved_spot_count: savedSpotCount,
      visit_count: visitCount,
      pathname: currentPath || '/',
    });
    openQuickSignup({
      unlockKey: 'returning-guest-sync',
      eyebrow: 'Returning Visitor Sync',
      title: `Sync Your ${savedSpotCount} Saved Spot${savedSpotCount === 1 ? '' : 's'} Free`,
      subtitle: copy,
      redirectPath: currentPath || '/hub',
      source: 'returning-guest-pill',
    });
  };

  const handleDismiss = () => {
    try {
      window.sessionStorage?.setItem(RETURNING_PILL_DISMISSED_KEY, '1');
    } catch (_) {
      /* ignore storage restrictions */
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Returning Visitor Saved Spots Sync"
      data-testid="returning-guest-sync-pill"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        background: '#0b1120',
        borderTop: '1px solid #38bdf8',
        borderBottom: '1px solid #38bdf8',
        borderLeft: '1px solid #38bdf8',
        borderRight: '1px solid #38bdf8',
        borderRadius: 0,
        color: '#f2f7ff',
      }}
    >
      <div
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 1280,
          margin: '0 auto',
          padding: '6px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px 12px',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px 10px',
            minWidth: 0,
            flex: '1 1 220px',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 7px',
              borderRadius: 0,
              border: '1px solid #38bdf8',
              background: '#082341',
              color: '#86daff',
              fontFamily: "var(--font-roboto-condensed, 'Arial Narrow'), Arial, sans-serif",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            Cloud Sync Ready
          </span>
          <span
            data-testid="returning-guest-sync-copy"
            style={{
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.35,
              color: '#f2f7ff',
              minWidth: 0,
              overflowWrap: 'break-word',
            }}
          >
            {copy}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: 0,
            border: '1px solid #38bdf8',
            background: '#06101c',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            data-testid="returning-guest-sync-cta"
            onClick={handleSyncClick}
            style={{
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              padding: '8px 14px',
              borderRadius: 0,
              border: 0,
              borderRight: '1px solid #38bdf8',
              background: 'linear-gradient(180deg, #1f6feb 0%, #11449e 100%)',
              color: '#ffffff',
              fontFamily: "var(--font-roboto-condensed, 'Arial Narrow'), Arial, sans-serif",
              fontSize: 13.5,
              fontWeight: 800,
              letterSpacing: '0.05em',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            Sync Free In 1 Tap
          </button>
          <button
            type="button"
            data-testid="returning-guest-sync-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss Returning Visitor Sync Banner"
            title="Dismiss Returning Visitor Sync Banner"
            style={{
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 44,
              minHeight: 44,
              width: 44,
              height: 44,
              padding: 0,
              borderRadius: 0,
              border: 0,
              background: '#0b1120',
              color: '#bdd0e2',
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1,
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
