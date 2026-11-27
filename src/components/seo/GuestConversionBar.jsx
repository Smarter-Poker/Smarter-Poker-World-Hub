import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export const GUEST_BAR_DISMISSED_KEY = 'sp_guest_conversion_bar_dismissed_v1';

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

export default function GuestConversionBar() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const rawPath = router?.asPath || router?.pathname || '/';
  const currentPath = normalizePath(rawPath);
  const routeHidden = isGuestBarHiddenRoute(currentPath) || isGuestBarHiddenRoute(router?.pathname || '/');

  useEffect(() => {
    const syncState = () => {
      setSignedIn(hasStoredAuthSession());
      setDismissed(readDismissed());
    };
    syncState();
    window.addEventListener('storage', syncState);
    return () => {
      window.removeEventListener('storage', syncState);
    };
  }, [currentPath]);

  if (routeHidden || signedIn || dismissed) return null;

  const encodedRedirect = encodeURIComponent(currentPath);
  const signupHref = `/auth/signup?redirect=${encodedRedirect}&src=guest-bar`;
  const loginHref = `/auth/login?redirect=${encodedRedirect}`;
  const isHubRoute = currentPath === '/hub' || currentPath.startsWith('/hub/');

  const handleDismiss = () => {
    try {
      window.sessionStorage?.setItem(GUEST_BAR_DISMISSED_KEY, '1');
    } catch (_) {
      /* ignore storage restrictions */
    }
    setDismissed(true);
  };

  return (
    <aside
      className={`sd-guest-bar${isHubRoute ? ' sd-guest-bar--below-header' : ''}`}
      aria-label="Free Smarter.Poker Account Bar"
      data-testid="guest-conversion-bar"
    >
      <div className="sd-guest-bar__inner">
        <div className="sd-guest-bar__copy">
          <span className="sd-guest-bar__brand">Smarter.Poker</span>
          <span className="sd-guest-bar__text">
            Free GTO Tools, Live Poker Rooms &amp; Bankroll Tracker
          </span>
        </div>

        <div className="sd-guest-bar__actions">
          <Link href={signupHref} className="sd-guest-bar__signup">
            Sign Up Free
          </Link>
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

      <style jsx>{`
        .sd-guest-bar {
          position: sticky;
          top: 0;
          z-index: 850;
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          background: linear-gradient(90deg, #060d1a 0%, #081121 50%, #060d1a 100%);
          border-bottom: 1px solid rgba(148, 184, 224, 0.28);
          color: #ffffff;
          font-family: var(--font-inter, Inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-variant-numeric: tabular-nums;
        }

        .sd-guest-bar--below-header {
          top: var(--sp-header-height, calc(100vw * 168 / 1648));
        }

        .sd-guest-bar__inner {
          box-sizing: border-box;
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 6px 12px;
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
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(148, 184, 224, 0.28);
          background: #081121;
          color: #38bdf8;
          font-family: var(--font-rajdhani, 'Arial Narrow'), var(--font-inter, Inter), sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 1.25;
          white-space: nowrap;
        }

        .sd-guest-bar__text {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
          color: #cbd5e1;
          min-width: 0;
          overflow-wrap: break-word;
        }

        .sd-guest-bar__actions {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup),
        .sd-guest-bar :global(.sd-guest-bar__login) {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          text-decoration: none;
          white-space: nowrap;
          transition: background-color 140ms ease, border-color 140ms ease, filter 140ms ease;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup) {
          background: linear-gradient(180deg, #0284c7 0%, #1d4ed8 100%);
          border: 1px solid rgba(56, 189, 248, 0.5);
          color: #ffffff;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup:hover) {
          filter: brightness(1.08);
        }

        .sd-guest-bar :global(.sd-guest-bar__login) {
          background: #060d1a;
          border: 1px solid rgba(148, 184, 224, 0.28);
          color: #38bdf8;
        }

        .sd-guest-bar :global(.sd-guest-bar__login:hover) {
          border-color: rgba(56, 189, 248, 0.65);
          background: #081121;
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
          border-radius: 8px;
          border: 1px solid rgba(148, 184, 224, 0.28);
          background: #060d1a;
          color: #94a3b8;
          font-size: 20px;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          flex: 0 0 auto;
          transition: color 140ms ease, border-color 140ms ease, background-color 140ms ease;
        }

        .sd-guest-bar__dismiss:hover {
          color: #ffffff;
          border-color: rgba(56, 189, 248, 0.55);
          background: #081121;
        }

        .sd-guest-bar :global(.sd-guest-bar__signup:focus-visible),
        .sd-guest-bar :global(.sd-guest-bar__login:focus-visible),
        .sd-guest-bar__dismiss:focus-visible {
          outline: 2px solid #38bdf8;
          outline-offset: 2px;
        }

        @media (max-width: 600px) {
          .sd-guest-bar__inner {
            padding: 6px 10px;
            gap: 6px 8px;
          }

          .sd-guest-bar__copy {
            flex: 1 1 100%;
          }

          .sd-guest-bar__text {
            font-size: 12px;
          }

          .sd-guest-bar__actions {
            width: 100%;
            justify-content: space-between;
          }

          .sd-guest-bar :global(.sd-guest-bar__signup) {
            flex: 1 1 auto;
            padding: 8px 12px;
          }

          .sd-guest-bar :global(.sd-guest-bar__login) {
            flex: 0 1 auto;
            padding: 8px 12px;
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
