/**
 * Peak-intent hardware Cloud-Save bar for flagship interactive poker calculators
 * (Preflop Ranges, Multiway Odds, Tournament ICM). Renders for anonymous guests
 * directly inside the workspace so they can save their active calculation into
 * a free Smarter.Poker cloud account with 1 tap.
 *
 * House style: #SMARTERDESIGN, Title Case, zero em dashes.
 */

import { useEffect, useRef, useState } from 'react';
import { openQuickSignup } from './SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import styles from './SmarterSeoKit.module.css';

export const CALC_ENGAGEMENTS_SESSION_KEY = 'sp_calc_engagements_v1';
const MAX_CALC_ENGAGEMENTS = 25;

export function recordCalcEngagement(spotKey, storage) {
  try {
    const store =
      storage ||
      (typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null);
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') {
      return 0;
    }

    let existing = [];
    const raw = store.getItem(CALC_ENGAGEMENTS_SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const seen = new Set();
          for (const entry of parsed) {
            if (typeof entry !== 'string') continue;
            const cleaned = entry.trim().slice(0, 120);
            if (!cleaned || seen.has(cleaned)) continue;
            seen.add(cleaned);
            existing.push(cleaned);
            if (existing.length >= MAX_CALC_ENGAGEMENTS) break;
          }
        }
      } catch (_) {
        existing = [];
      }
    }

    const cleanKey = typeof spotKey === 'string' ? spotKey.trim().slice(0, 120) : '';
    if (!cleanKey) {
      return existing.length;
    }

    const next = [cleanKey, ...existing.filter((item) => item !== cleanKey)].slice(
      0,
      MAX_CALC_ENGAGEMENTS,
    );
    store.setItem(CALC_ENGAGEMENTS_SESSION_KEY, JSON.stringify(next));
    return next.length;
  } catch (_) {
    return 0;
  }
}

export function buildAttributedCalcSpotUrl({
  redirectPath = '/tools',
  siteUrl = 'https://smarter.poker',
  currentUrl = '',
} = {}) {
  const base = String(siteUrl || 'https://smarter.poker').trim().replace(/\/+$/, '') || 'https://smarter.poker';
  const rawTarget = String(currentUrl || redirectPath || '/tools').trim();
  let urlObj;
  try {
    if (/^https?:\/\//i.test(rawTarget)) {
      const parsed = new URL(rawTarget);
      urlObj = new URL(`${parsed.pathname}${parsed.search}`, base);
    } else {
      const normalizedPath = rawTarget.startsWith('/') ? rawTarget : `/${rawTarget}`;
      urlObj = new URL(normalizedPath, base);
    }
  } catch (_) {
    urlObj = new URL('/tools', base);
  }
  urlObj.searchParams.set('utm_source', 'player_share');
  urlObj.searchParams.set('utm_medium', 'referral');
  urlObj.searchParams.set('utm_campaign', 'calc_spot');
  return urlObj.toString();
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

export default function SmarterCalculatorSaveBar({
  toolSlug = 'poker-calculator',
  toolName = 'Poker Calculator',
  eyebrow = 'Free Cloud Sync',
  title = 'Save This Spot To Your Free Smarter.Poker Account',
  description = 'Sync Custom Calculations, Compare Multi-Position Ranges & Unlock 107 GTO Training Drills Free.',
  ctaLabel = 'Save Free With Account',
  summaryText = '',
  spotTitle = '',
  redirectPath = '/tools',
  unlockKey = '',
}) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [copiedSpot, setCopiedSpot] = useState(false);
  const [engagementCount, setEngagementCount] = useState(0);
  const [milestoneDismissed, setMilestoneDismissed] = useState(false);
  const copyTimerRef = useRef(null);

  const resolvedSpotTitle = String(spotTitle || summaryText || title || '').trim();
  const activeSpotKey = resolvedSpotTitle
    ? `${toolSlug}:${resolvedSpotTitle}`
    : String(toolSlug || 'poker-calculator').trim();

  useEffect(() => {
    const signedIn = hasStoredAuthSession();
    setIsSignedIn(signedIn);

    if (!signedIn) {
      setEngagementCount(recordCalcEngagement(activeSpotKey));
    }

    const handleToolEngaged = (event) => {
      if (hasStoredAuthSession()) {
        setIsSignedIn(true);
        return;
      }
      const detail = event?.detail || {};
      const detailTool = String(detail.toolSlug || detail.tool || toolSlug || 'poker-calculator').trim();
      const detailSpot = String(
        detail.spotKey || detail.spotTitle || detail.spot || detail.hand || detail.summaryText || '',
      ).trim();
      const eventSpotKey = detailSpot ? `${detailTool}:${detailSpot}` : detailTool;
      setEngagementCount(recordCalcEngagement(eventSpotKey));
    };

    const canListen =
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function' &&
      typeof window.removeEventListener === 'function';

    if (canListen) {
      window.addEventListener('sp:seo-tool-engaged', handleToolEngaged);
    }

    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (canListen) {
        window.removeEventListener('sp:seo-tool-engaged', handleToolEngaged);
      }
    };
  }, [activeSpotKey, toolSlug]);

  if (isSignedIn) return null;

  const resolvedUnlockKey = unlockKey || `calc-save-${toolSlug}`;

  const handleMilestoneUnlock = () => {
    trackSeoFunnelEvent('seo_calc_milestone_click', {
      tool_slug: toolSlug,
      count: engagementCount,
    });
    openQuickSignup({
      unlockKey: 'calc-session-milestone',
      source: 'calc-metered-milestone',
      redirectPath,
      eyebrow: 'Session Study Milestone',
      title: 'Save All Your Studied Spots Free',
      subtitle: `You Have Studied ${engagementCount} Spots This Session. Save Your Study History & Claim 30-Day Free VIP In 10 Seconds.`,
      benefits: [
        '100% Free Forever - Zero Credit Card Required',
        'Save Every Studied Spot & Custom Range To Your Cloud Library',
        'Includes 30-Day Free VIP + 500 Diamonds On Phone Verify',
      ],
    });
  };

  const handleSaveClick = () => {
    try {
      window.dispatchEvent(
        new CustomEvent('sp:seo-tool-engaged', { detail: { toolSlug } }),
      );
    } catch (_) {
      /* non-blocking */
    }
    trackSeoFunnelEvent('seo_calculator_save_bar_click', {
      tool_slug: toolSlug,
      unlock_key: resolvedUnlockKey,
      redirect_path: redirectPath,
    });
    const cleanSummary = String(summaryText || '').trim();
    openQuickSignup({
      unlockKey: resolvedUnlockKey,
      source: `calc-save-bar-${toolSlug}`,
      redirectPath,
      eyebrow: `${toolName} Cloud Sync`,
      title: `Save Your ${toolName} Spot Free`,
      subtitle: cleanSummary
        ? `Save "${cleanSummary.slice(0, 110)}" To Your Free Cloud Library And Unlock Unlimited Saved Spots Across Devices.`
        : 'Create Your Free Account In 10 Seconds To Save Calculations, Sync Across Devices & Unlock 107 GTO Drills.',
      benefits: [
        '100% Free Forever - Zero Credit Card Required',
        'Unlimited Saved Calculations, Ranges & Study Notes',
        '107 Interactive GTO Training Games & Leak Tracking',
      ],
    });
  };

  const handleShareSpot = async () => {
    const activePath =
      typeof window !== 'undefined' && window.location?.pathname && window.location.pathname !== '/'
        ? `${window.location.pathname}${window.location.search || ''}`
        : redirectPath;
    const shareUrl = buildAttributedCalcSpotUrl({
      redirectPath,
      currentUrl: activePath,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedSpot(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedSpot(false), 2400);
      }
      trackSeoFunnelEvent('seo_calculator_share_click', {
        tool_slug: toolSlug,
        unlock_key: resolvedUnlockKey,
        redirect_path: redirectPath,
      });
    } catch (_) {
      /* ignore clipboard refusal */
    }
  };

  return (
    <div
      className={`${styles.kit} ${styles.frameActive} ${styles.calcSaveBar} no-print`}
      data-testid={`calculator-save-bar-${toolSlug}`}
      role="region"
      aria-label={`${toolName} Free Cloud Save`}
    >
      <div className={styles.calcSaveCopy}>
        <span className={styles.eyebrowTag}>{eyebrow}</span>
        <div className={styles.calcSaveTitle}>{title}</div>
        <p className={styles.calcSaveDesc}>{description}</p>
      </div>
      <div className={styles.calcSaveActions}>
        <button
          type="button"
          className={styles.ctaPrimary}
          data-testid={`calculator-save-cta-${toolSlug}`}
          onClick={handleSaveClick}
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          className={styles.ctaSecondary}
          data-testid={`calculator-share-cta-${toolSlug}`}
          onClick={handleShareSpot}
        >
          {copiedSpot ? 'Spot Link Copied' : 'Share Spot'}
        </button>
      </div>
      {engagementCount >= 2 && !milestoneDismissed ? (
        <div
          data-testid="calc-metered-milestone"
          role="status"
          style={{
            flex: '1 0 100%',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px 12px',
            marginTop: 4,
            padding: '10px 12px',
            borderRadius: 0,
            border: '1px solid #2563eb',
            borderLeft: '3px solid #38bdf8',
            background: 'linear-gradient(90deg, #0b1120 0%, #111827 100%)',
          }}
        >
          <span
            style={{
              flex: '1 1 260px',
              minWidth: 0,
              color: '#f2f7ff',
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            {`Session Milestone: ${engagementCount} Spots Studied - Save Your Study History & Claim 30-Day Free VIP`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
            <button
              type="button"
              className={styles.btnSharpPrimary}
              data-testid="calc-milestone-unlock-cta"
              onClick={handleMilestoneUnlock}
              style={{ minHeight: 36, padding: '0 14px', borderRadius: 0 }}
            >
              Save Study History Free
            </button>
            <button
              type="button"
              data-testid="calc-milestone-dismiss-btn"
              aria-label="Dismiss Session Study Milestone"
              onClick={() => setMilestoneDismissed(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                border: '1px solid #3d5771',
                borderRadius: 0,
                background: '#0b1120',
                color: '#bdd0e2',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
