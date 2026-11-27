/**
 * Peak-intent hardware Cloud-Save bar for flagship interactive poker calculators
 * (Preflop Ranges, Multiway Odds, Tournament ICM). Renders for anonymous guests
 * directly inside the workspace so they can save their active calculation into
 * a free Smarter.Poker cloud account with 1 tap.
 *
 * House style: #SMARTERDESIGN, Title Case, zero em dashes.
 */

import { useEffect, useState } from 'react';
import { openQuickSignup } from './SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import styles from './SmarterSeoKit.module.css';

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
  redirectPath = '/tools',
  unlockKey = '',
}) {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    setIsSignedIn(hasStoredAuthSession());
  }, []);

  if (isSignedIn) return null;

  const resolvedUnlockKey = unlockKey || `calc-save-${toolSlug}`;

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
      </div>
    </div>
  );
}
