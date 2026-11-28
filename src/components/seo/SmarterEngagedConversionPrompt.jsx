import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import { isGuestBarHiddenRoute } from './GuestConversionBar';
import { openQuickSignup, QUICK_SIGNUP_STATE_EVENT } from './SmarterQuickSignupSheet';
import styles from './SmarterSeoKit.module.css';
import { VENUE_COUNT_LABEL } from '../../lib/venueCount.mjs';

function trackFunnelEvent(event, props) {
  trackSeoFunnelEvent(event, props);
}

export const ENGAGED_PROMPT_SHOWN_KEY = 'sp_engaged_prompt_shown_v1';
export const SEO_TOOL_ENGAGED_EVENT = 'sp:seo-tool-engaged';

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

function promptCopyForPath(path) {
  if (path.startsWith('/tools')) {
    return {
      eyebrow: 'Save Your Calculations Free',
      title: 'Keep Your Poker Math & Unlock 107 GTO Drills',
      body: 'Create Your Free Smarter.Poker Account In 10 Seconds To Save Scenarios, Compare Ranges & Train Live.',
      cta: 'Save Free With Account',
      unlockKey: 'engaged-tools',
    };
  }
  if (path.startsWith('/learn') || path.startsWith('/glossary') || path.startsWith('/rules') || path.startsWith('/games')) {
    return {
      eyebrow: 'Free Study Account',
      title: 'Save This Guide & Practice The Exact GTO Spot',
      body: 'Bookmark Starting Hands, Unlock Full Multi-Position Solver Matrices & Drill 107 Interactive Games Free.',
      cta: 'Create Free Study Account',
      unlockKey: 'engaged-learn',
    };
  }
  if (
    path.startsWith('/poker-rooms') ||
    path.startsWith('/poker-series') ||
    path.startsWith('/hub/venues') ||
    path.startsWith('/hub/series') ||
    path.startsWith('/hub/poker-near-me') ||
    path.startsWith('/hub/poker-tours') ||
    path.startsWith('/hub/daily-tournaments')
  ) {
    return {
      eyebrow: 'Free Live Poker Intel',
      title: 'Unlock Live Waitlists, Peak Hours & Seat Alerts',
      body: `Track ${VENUE_COUNT_LABEL} Verified Poker Rooms, Save Favorite Venues & Sync Live Series Schedules To Your Free Account.`,
      cta: 'Unlock Live Intel Free',
      unlockKey: 'engaged-venues',
    };
  }
  return {
    eyebrow: 'Free Smarter.Poker Account',
    title: 'Unlock Full Tools, Poker Rooms & Bankroll Tracking',
    body: '100% Free Forever - Zero Credit Card Needed. 1-Tap Google, Facebook, Or Email Sign Up.',
    cta: 'Create Free Account',
    unlockKey: 'engaged-seo',
  };
}

export default function SmarterEngagedConversionPrompt() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [triggerKind, setTriggerKind] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const rawPath = router?.asPath || router?.pathname || '/';
  const currentPath = String(rawPath).split(/[?#]/, 1)[0].trim() || '/';
  const routeHidden = isGuestBarHiddenRoute(currentPath) || isGuestBarHiddenRoute(router?.pathname || '/');

  useEffect(() => {
    if (typeof window === 'undefined' || routeHidden) return undefined;
    if (hasStoredAuthSession()) return undefined;
    try {
      if (window.sessionStorage.getItem(ENGAGED_PROMPT_SHOWN_KEY) === '1') return undefined;
    } catch (_) {
      /* ignore */
    }

    const mountedAt = Date.now();
    let fired = false;
    let currentSheetOpen = false;

    const triggerOnce = (kind) => {
      if (fired || currentSheetOpen || hasStoredAuthSession()) return;
      try {
        if (window.sessionStorage.getItem(ENGAGED_PROMPT_SHOWN_KEY) === '1') return;
        window.sessionStorage.setItem(ENGAGED_PROMPT_SHOWN_KEY, '1');
      } catch (_) {
        /* ignore */
      }
      fired = true;
      setTriggerKind(kind);
      setVisible(true);
      try {
        trackFunnelEvent('seo_engaged_prompt_shown', {
          trigger: kind,
          path: currentPath,
        });
      } catch (_) {
        /* non-blocking */
      }
    };

    const onSheetState = (ev) => {
      currentSheetOpen = Boolean(ev?.detail?.open);
      setSheetOpen(currentSheetOpen);
      if (currentSheetOpen) {
        setVisible(false);
      }
    };

    const onMouseLeave = (ev) => {
      if (ev.clientY > 6) return;
      if (Date.now() - mountedAt < 10000) return;
      triggerOnce('exit-intent');
    };

    const onScroll = () => {
      if (Date.now() - mountedAt < 15000) return;
      const docHeight = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1
      );
      const ratio = window.scrollY / docHeight;
      if (ratio >= 0.72) {
        triggerOnce('deep-scroll');
      }
    };

    const onToolEngaged = () => {
      if (Date.now() - mountedAt < 8000) return;
      triggerOnce('tool-engaged');
    };

    window.addEventListener(QUICK_SIGNUP_STATE_EVENT, onSheetState);
    document.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener(SEO_TOOL_ENGAGED_EVENT, onToolEngaged);

    return () => {
      window.removeEventListener(QUICK_SIGNUP_STATE_EVENT, onSheetState);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener(SEO_TOOL_ENGAGED_EVENT, onToolEngaged);
    };
  }, [currentPath, routeHidden]);

  if (!visible || routeHidden || sheetOpen) return null;

  const copy = promptCopyForPath(currentPath);

  const handleDismiss = () => {
    setVisible(false);
    try {
      trackFunnelEvent('seo_engaged_prompt_dismissed', {
        trigger: triggerKind,
        path: currentPath,
      });
    } catch (_) {
      /* non-blocking */
    }
  };

  const handleAccept = () => {
    setVisible(false);
    try {
      trackFunnelEvent('seo_engaged_prompt_clicked', {
        trigger: triggerKind,
        path: currentPath,
      });
    } catch (_) {
      /* non-blocking */
    }
    openQuickSignup({
      unlockKey: copy.unlockKey,
      eyebrow: copy.eyebrow,
      title: copy.title,
      subtitle: copy.body,
      redirectPath: currentPath,
      source: `engaged-prompt-${triggerKind || 'scroll'}`,
    });
  };

  return (
    <aside
      className={`${styles.kit} ${styles.frameActive} ${styles.engagedNudge}`}
      aria-label="Free Account Quick Unlock"
      data-testid="engaged-conversion-prompt"
    >
      <div className={styles.engagedNudgeHead}>
        <span className={styles.eyebrowTag}>{copy.eyebrow}</span>
        <button
          type="button"
          className={styles.engagedNudgeClose}
          onClick={handleDismiss}
          aria-label="Dismiss Free Account Prompt"
        >
          ×
        </button>
      </div>
      <h3 className={styles.engagedNudgeTitle}>{copy.title}</h3>
      <p className={styles.engagedNudgeBody}>{copy.body}</p>
      <div className={styles.engagedNudgeActions}>
        <button
          type="button"
          className={styles.btnSharpPrimary}
          style={{ flex: '1 1 auto' }}
          onClick={handleAccept}
          data-testid="engaged-prompt-cta"
        >
          {copy.cta}
        </button>
        <button
          type="button"
          className={styles.btnSharpSecondary}
          onClick={handleDismiss}
        >
          No Thanks
        </button>
      </div>
    </aside>
  );
}
