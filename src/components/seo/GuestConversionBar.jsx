import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { openQuickSignup } from './SmarterQuickSignupSheet';
import { VENUE_COUNT_LABEL } from '../../lib/venueCount.mjs';
import { getAiWelcomeContext } from '../../lib/seo/seoExperiment';

const SmarterGoogleOneTap = dynamic(() => import('./SmarterGoogleOneTap'), {
  ssr: false,
});

export const GUEST_BAR_DISMISSED_KEY = 'sp_guest_conversion_bar_dismissed_v1';

function guestBarCopyForPath(path) {
  if (path.startsWith('/tools')) {
    return 'Save Custom Ranges, Compare Villain Equity & Unlock 107 Free GTO Drills';
  }
  if (path.startsWith('/learn')) {
    return 'Unlock Full Multi-Position Solver Matrices & Save Guides To Your Study Deck';
  }
  if (
    path.startsWith('/hub/venues') ||
    path.startsWith('/hub/series') ||
    path.startsWith('/hub/poker-near-me') ||
    path.startsWith('/poker-rooms')
  ) {
    return `Save Favorite Rooms, Track Series Schedules & Follow ${VENUE_COUNT_LABEL} Poker Rooms`;
  }
  if (path.startsWith('/hub/video-library')) {
    return 'Bookmark Key Hands, Follow Pro Channels & Drill Video Spots Free';
  }
  if (path.startsWith('/hub/training')) {
    return 'Track Your GTO Accuracy, Leak Score & Daily Streaks With A Free Account';
  }
  return `Unlock Full GTO Tools, ${VENUE_COUNT_LABEL} Poker Rooms & Free Bankroll Tracking`;
}

function normalizePath(rawPath) {
  const base = String(rawPath || '').split(/[?#]/, 1)[0].trim();
  if (!base || !base.startsWith('/')) return '/';
  if (base === '/') return '/';
  return base.replace(/\/+$/, '') || '/';
}

export function isGuestBarHiddenRoute(rawPath) {
  const path = normalizePath(rawPath);
  if (path === '/') return true;
  if (path === '/404' || path === '/500' || path === '/_error') return true;
  if (path === '/jurisdiction-blocked' || path.startsWith('/jurisdiction-blocked/')) return true;
  if (path === '/auth' || path.startsWith('/auth/')) return true;
  if (path === '/hub/club-arena' || path.startsWith('/hub/club-arena/')) return true;
  if (path === '/commander' || path.startsWith('/commander/')) return true;
  if (path === '/admin' || path.startsWith('/admin/')) return true;
  if (path === '/hub/admin' || path.startsWith('/hub/admin/')) return true;
  if (path === '/horses' || path.startsWith('/horses/')) return true;
  if (path === '/hub/magazine/print' || path.startsWith('/hub/magazine/print/')) return true;
  if (path === '/hub/magazine/table-tent' || path.startsWith('/hub/magazine/table-tent/')) return true;
  return false;
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

function readDismissed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage?.getItem(GUEST_BAR_DISMISSED_KEY) === '1';
  } catch (_) {
    return false;
  }
}

const STATIC_HEADER_PREFIXES = [
  '/hub',
  '/authors',
  '/facts',
  '/freerolls',
  '/games',
  '/poker-rooms',
  '/poker-series',
  '/press',
  '/rules',
  '/search',
  '/sitemap',
  '/learn/best-poker-players',
  '/learn/board-textures',
  '/learn/cheat-sheets',
  '/learn/famous-hands',
  '/learn/format-migration-guide',
  '/learn/formulas',
  '/learn/hud-stats',
  '/learn/leaks',
  '/learn/live-poker-tells',
  '/learn/matchups',
  '/learn/mental-game',
  '/learn/online-vs-live-poker',
  '/learn/player-types',
  '/learn/poker-as-a-business',
  '/learn/poker-hand-rankings',
  '/learn/poker-math',
  '/learn/poker-myths-debunked',
  '/learn/positions',
  '/learn/roadmaps',
  '/learn/stakes',
  '/learn/tournament-stages',
];

const STATIC_HEADER_EXACT = [
  '/compare',
  '/compare/decision-matrix',
];

function routeMountsApprovedHeader(path) {
  if (STATIC_HEADER_EXACT.includes(path)) return true;
  return STATIC_HEADER_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export default function GuestConversionBar() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [detectedHeader, setDetectedHeader] = useState(false);
  const [aiWelcome, setAiWelcome] = useState(null);

  const rawPath = router?.asPath || router?.pathname || '/';
  const currentPath = normalizePath(rawPath);
  const routeHidden = isGuestBarHiddenRoute(currentPath) || isGuestBarHiddenRoute(router?.pathname || '/');

  useEffect(() => {
    const syncState = () => {
      setSignedIn(hasStoredAuthSession());
      setDismissed(readDismissed());
      setAiWelcome(getAiWelcomeContext());
      if (typeof document !== 'undefined') {
        setDetectedHeader(Boolean(document.querySelector('.approved-global-header')));
      }
    };
    syncState();
    const timer = window.setTimeout(syncState, 250);
    window.addEventListener('storage', syncState);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('storage', syncState);
    };
  }, [currentPath]);

  if (routeHidden || signedIn || dismissed) return null;

  const encodedRedirect = encodeURIComponent(currentPath);
  const signupHref = `/auth/signup?redirect=${encodedRedirect}&src=guest-bar`;
  const loginHref = `/auth/login?redirect=${encodedRedirect}`;
  const belowHeader = routeMountsApprovedHeader(currentPath) || detectedHeader;

  const handleDismiss = () => {
    try {
      window.sessionStorage?.setItem(GUEST_BAR_DISMISSED_KEY, '1');
      window.dispatchEvent(new CustomEvent('sp:guest-bar-dismissed'));
    } catch (_) {
      /* ignore storage restrictions */
    }
    setDismissed(true);
  };

  const contextualCopy = aiWelcome
    ? `From ${aiWelcome.label}? Run Live GTO Solvers & Save Ranges Free`
    : guestBarCopyForPath(currentPath);

  const handleSignupClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openQuickSignup({
      unlockKey: 'guest-bar',
      eyebrow: 'Free Smarter.Poker Account',
      title: 'Create Your Free Smarter.Poker Account',
      subtitle: contextualCopy,
      redirectPath: currentPath,
      source: 'guest-bar',
    });
  };

  return (
    <aside
      className={`sd-guest-bar${belowHeader ? ' sd-guest-bar--below-header' : ''}`}
      aria-label="Free Smarter.Poker Account Bar"
      data-testid="guest-conversion-bar"
    >
      <div className="sd-guest-bar__inner">
        <div className="sd-guest-bar__copy">
          <span className="sd-guest-bar__brand">SMARTER.POKER</span>
          <span
            className="sd-guest-bar__text"
            data-testid={aiWelcome ? 'guest-bar-ai-copy' : 'guest-bar-copy'}
          >
            {contextualCopy}
          </span>
          {!aiWelcome ? (
            <span className="sd-guest-bar__vip" data-testid="guest-bar-vip-hook">
              + Free 30-Day VIP
            </span>
          ) : null}
        </div>

        <div className="sd-guest-bar__actions">
          <a href={signupHref} onClick={handleSignupClick} className="sd-guest-bar__signup">
            {aiWelcome ? 'Run Solvers Free' : 'Sign Up Free + 30-Day VIP'}
          </a>
          <Link href={loginHref} className="sd-guest-bar__login">
            Sign In
          </Link>
          <button
            type="button"
            className="sd-guest-bar__dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss Account Banner"
            title="Dismiss Account Banner"
          >
            &times;
          </button>
        </div>
      </div>

      <SmarterGoogleOneTap currentPath={currentPath} signedIn={signedIn} />
      <style jsx>{`
        .sd-guest-bar {
          position: sticky;
          top: 0;
          z-index: 850;
          box-sizing: border-box;
          padding-top: env(safe-area-inset-top, 0px);
          width: 100%;
          max-width: 100%;
          min-width: 0;
          background: linear-gradient(180deg, #10243a 0%, #071322 100%);
          border-top: 1px solid rgba(134, 218, 255, 0.28);
          border-bottom: 2px solid #2b4d70;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.58);
          color: #f2f7ff;
          font-family: var(--font-inter, Inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-variant-numeric: tabular-nums;
        }

        .sd-guest-bar--below-header {
          top: var(--sp-header-height, calc(100vw * 168 / 1648));
          padding-top: 0;
        }

        .sd-guest-bar__inner {
          box-sizing: border-box;
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 5px 12px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px 14px;
          min-width: 0;
        }

        .sd-guest-bar__copy {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px 10px;
          min-width: 0;
          flex: 1 1 240px;
        }

        .sd-guest-bar__brand {
          display: inline-flex;
          align-items: center;
          padding: 3px 9px;
          border-radius: 0;
          border: 1px solid #3a7fbd;
          background: linear-gradient(180deg, #12406f 0%, #082341 100%);
          box-shadow: inset 0 1px 0 rgba(134, 218, 255, 0.42);
          color: #86daff;
          font-family: var(--font-roboto-condensed, 'Arial Narrow'), Arial, sans-serif;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          line-height: 1.2;
          white-space: nowrap;
        }

        .sd-guest-bar__text {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
          color: #bdd0e2;
          min-width: 0;
          overflow-wrap: break-word;
        }

        .sd-guest-bar__vip {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 0;
          border: 1px solid #3a7fbd;
          background: rgba(16, 56, 102, 0.85);
          color: #86daff;
          font-family: var(--font-roboto-condensed, 'Arial Narrow'), Arial, sans-serif;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.05em;
          line-height: 1.2;
          white-space: nowrap;
        }

        .sd-guest-bar__actions {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 0;
          border: 1px solid #355270;
          background: #06101c;
          flex-shrink: 0;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup),
        .sd-guest-bar :global(.sd-guest-bar__login) {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 8px 16px;
          border-radius: 0;
          font-family: var(--font-roboto-condensed, 'Arial Narrow'), Arial, sans-serif;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.05em;
          line-height: 1.1;
          text-decoration: none;
          white-space: nowrap;
          transition: background-color 140ms ease, border-color 140ms ease, filter 140ms ease;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup) {
          background: linear-gradient(180deg, #1f6feb 0%, #11449e 100%);
          border: 0;
          border-right: 1px solid #4895d9;
          box-shadow: inset 0 1px 0 rgba(186, 234, 255, 0.55);
          color: #ffffff;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup:hover) {
          filter: brightness(1.1);
        }

        .sd-guest-bar :global(.sd-guest-bar__login) {
          background: linear-gradient(180deg, #14273c 0%, #091524 100%);
          border: 0;
          border-right: 1px solid #2b4560;
          color: #86daff;
        }

        .sd-guest-bar :global(.sd-guest-bar__login:hover) {
          color: #ffffff;
          background: linear-gradient(180deg, #1b3450 0%, #0e2034 100%);
        }

        .sd-guest-bar__dismiss {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          min-height: 44px;
          width: 44px;
          height: 44px;
          padding: 0;
          border-radius: 0;
          border: 0;
          background: #071321;
          color: #bdd0e2;
          font-size: 20px;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          flex: 0 0 auto;
          transition: color 140ms ease, background-color 140ms ease;
        }

        .sd-guest-bar__dismiss:hover {
          color: #ffffff;
          background: #10243a;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup:focus-visible),
        .sd-guest-bar :global(.sd-guest-bar__login:focus-visible),
        .sd-guest-bar__dismiss:focus-visible {
          outline: 2px solid #86daff;
          outline-offset: -2px;
        }

        @media (max-width: 640px) {
          .sd-guest-bar__inner {
            padding: 4px 8px;
            gap: 6px;
          }

          .sd-guest-bar__copy {
            display: none;
          }

          .sd-guest-bar__actions {
            width: 100%;
          }

          .sd-guest-bar :global(.sd-guest-bar__signup) {
            flex: 1 1 auto;
            min-width: 0;
            padding: 8px 10px;
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .sd-guest-bar :global(.sd-guest-bar__login) {
            flex: 0 1 auto;
            padding: 8px 10px;
            font-size: 13px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sd-guest-bar :global(.sd-guest-bar__signup),
          .sd-guest-bar :global(.sd-guest-bar__login),
          .sd-guest-bar__dismiss {
            transition: none;
          }
        }
      `}</style>
    </aside>
  );
}
