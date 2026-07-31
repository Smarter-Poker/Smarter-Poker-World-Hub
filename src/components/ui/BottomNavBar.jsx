/**
 * BottomNavBar — Platform-Wide Fixed Bottom Navigation
 * Per Mobile Layout Standard + PA_DESIGN_SPEC v1
 *
 * 56px fixed bar with 6 tabs: Home, Coach, Friends, Pages, Alerts, Profile.
 * Includes env(safe-area-inset-*) for iPhone notch/home-indicator safety.
 *
 * USAGE: Import and render at the bottom of any hub page:
 *   import BottomNavBar, { BottomNavSpacer, BOTTOM_NAV_CLEARANCE } from '../../src/components/ui/BottomNavBar';
 *   // ... inside return:
 *   <BottomNavBar />
 *
 * IMPORTANT: The parent page container MUST end with
 *   paddingBottom: BOTTOM_NAV_CLEARANCE   // 'calc(56px + 16px + env(safe-area-inset-bottom, 0px))'
 * (or render <BottomNavSpacer /> as the last child) so page content is never
 * trapped behind the bar. A hardcoded `paddingBottom: 70` is NOT enough on
 * notched iPhones, where the bar grows to ~90px.
 *
 * Z-INDEX CONTRACT: this bar sits at BOTTOM_NAV_Z (90) — deliberately LOW.
 * Every fixed overlay (sheets, modals, pickers, tours) must render at >= 900
 * so it paints above the bar. Do not raise the bar to fix an overlay bug.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Home, Brain, Users, LayoutGrid, Bell, User } from 'lucide-react';
import { useUnreadCount } from '../../hooks/useUnreadCount';
// BUG-FIX-LIVE-6: useUnreadCount now exposes notificationCount + messageCount
// separately. The "Alerts" tab badge reflects unread NOTIFICATIONS, not
// messages — keeping it in sync with the global header notification bell.

export const BOTTOM_NAV_Z = 90;
export const BOTTOM_NAV_H = 'calc(56px + env(safe-area-inset-bottom, 0px))';
export const BOTTOM_NAV_CLEARANCE = 'calc(56px + 16px + env(safe-area-inset-bottom, 0px))';

/** Drop-in spacer for pages that would rather not manage paddingBottom. */
export const BottomNavSpacer = () => (
  <div aria-hidden="true" style={{ height: BOTTOM_NAV_H, flexShrink: 0 }} />
);

const THEMES = {
  light: {
    bg: '#ffffff', border: '#dddfe2', inactive: '#65676b',
    active: '#1877f2', badge: '#f02849', badgeText: '#ffffff',
  },
  dark: {
    bg: '#242526', border: '#3A3B3C', inactive: '#B0B3B8',
    active: '#4599FF', badge: '#EF4444', badgeText: '#ffffff',
  },
};

// Routes that are part of the dark "Neon Slate" Personal Assistant world.
const DARK_ROUTE_PREFIXES = ['/hub/personal-assistant', '/sandbox'];

const TABS = [
  { href: '/hub/social-media', label: 'Home', Icon: Home },
  { href: '/hub/personal-assistant', label: 'Coach', Icon: Brain },
  { href: '/hub/friends', label: 'Friends', Icon: Users },
  { href: '/hub/social-pages', label: 'Pages', Icon: LayoutGrid },
  { href: '/hub/notifications', label: 'Alerts', Icon: Bell },
  { href: '/hub/profile', label: 'Profile', Icon: User },
];

function BottomNavBar({ theme = 'auto', autoHide = 'auto' }) {
  const router = useRouter();
  const path = router.asPath || '';
  const { notificationCount } = useUnreadCount() || {};

  const isPaSurface = DARK_ROUTE_PREFIXES.some((p) => path.startsWith(p));
  const resolvedTheme =
    theme === 'dark' || theme === 'pa' ? 'dark'
      : theme === 'light' ? 'light'
        : isPaSurface ? 'dark' : 'light';
  const c = THEMES[resolvedTheme];

  // ── Reduced motion ────────────────────────────────────────────────────────
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduceMotion(m.matches);
    on();
    if (m.addEventListener) m.addEventListener('change', on);
    else if (m.addListener) m.addListener(on);
    return () => {
      if (m.removeEventListener) m.removeEventListener('change', on);
      else if (m.removeListener) m.removeListener(on);
    };
  }, []);

  // ── Scroll-aware auto-hide (reclaims 56px during long PA scrolls) ─────────
  const autoHideOn = (autoHide === 'auto' ? isPaSurface : !!autoHide) && !reduceMotion;
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (!autoHideOn) { setHidden(false); return undefined; }
    lastY.current = window.scrollY || 0;
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        ticking.current = false;
        const y = window.scrollY || 0;
        const dy = y - lastY.current;
        if (y < 80) setHidden(false);
        else if (dy > 8) setHidden(true);
        else if (dy < -6) setHidden(false);
        if (Math.abs(dy) > 4) lastY.current = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [autoHideOn]);

  // Never leave the bar hidden across a route change.
  useEffect(() => { setHidden(false); }, [path]);

  // Determine which tab is active based on current path
  const isActive = useCallback((href) => {
    // Reels lost its own tab when Coach replaced it. Without this branch
    // /hub/reels highlighted nothing at all — six inactive tabs and no
    // aria-current="page" anywhere — so it maps onto the social tab.
    if (href === '/hub/social-media') {
      return path === '/hub/social-media'
        || path.startsWith('/hub/social-media/')
        || path.startsWith('/hub/social-media?')
        || path === '/hub/reels'
        || path.startsWith('/hub/reels/')
        || path.startsWith('/hub/reels?');
    }
    if (href === '/hub/social-pages') return path.startsWith('/hub/social-pages');
    if (href === '/hub/personal-assistant') return path.startsWith('/hub/personal-assistant') || path.startsWith('/sandbox');
    if (href === '/hub/friends') return path.startsWith('/hub/friends');
    if (href === '/hub/notifications') return path === '/hub/notifications';
    if (href === '/hub/profile') return path === '/hub/profile';
    return false;
  }, [path]);

  // Next.js prefetches every in-viewport <Link> in production. Six permanently
  // visible tabs = six extra route bundles on every page load. Prefetch on
  // intent instead.
  const warm = useCallback((href) => {
    try { router.prefetch(href); } catch (_) { /* prefetch is best-effort */ }
  }, [router]);

  const count = Number(notificationCount) || 0;

  return (
    <nav
      aria-label="Primary"
      className="bn-nav"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        minHeight: 56,
        background: c.bg,
        borderTop: `1px solid ${c.border}`,
        display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
        zIndex: BOTTOM_NAV_Z,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        transform: hidden ? 'translateY(110%)' : 'translateY(0)',
        transition: reduceMotion ? 'none' : 'transform .22s ease',
        // consumed by the styled-jsx rules below
        ['--bn-active']: c.active,
      }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(href);
        const isAlerts = href === '/hub/notifications';
        const ariaLabel = isAlerts && count > 0
          ? `${label}, ${count} unread notification${count === 1 ? '' : 's'}`
          : label;
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="bn-tab"
            aria-label={ariaLabel}
            aria-current={active ? 'page' : undefined}
            onTouchStart={() => warm(href)}
            onMouseEnter={() => warm(href)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', color: active ? c.active : c.inactive,
              flex: 1, minWidth: 0, minHeight: 56, padding: '6px 2px', position: 'relative',
            }}
          >
            {/* Active state must not be colour-only */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', top: 0, left: '22%', right: '22%', height: 3,
                borderRadius: 999,
                background: active ? c.active : 'transparent',
              }}
            />
            <Icon size={24} strokeWidth={2} aria-hidden="true" />
            {isAlerts && count > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', top: 4, right: 'calc(50% - 20px)',
                  background: c.badge, color: c.badgeText, borderRadius: 999,
                  minWidth: 18, height: 18, fontSize: 12, lineHeight: '18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, padding: '0 5px',
                }}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
            <span
              style={{
                fontSize: 12, marginTop: 2, lineHeight: 1.1, letterSpacing: '-0.01em',
                fontWeight: active ? 700 : 500,
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}

      <style jsx global>{`
        .bn-tab {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform .12s ease, opacity .12s ease;
        }
        .bn-tab:active { opacity: .6; transform: scale(.94); }
        .bn-tab:focus-visible {
          outline: 2px solid var(--bn-active, #1877f2);
          outline-offset: -2px;
          border-radius: 8px;
        }
        @media (prefers-reduced-motion: reduce) {
          .bn-tab, .bn-nav { transition: none !important; }
          .bn-tab:active { transform: none; }
        }
      `}</style>
    </nav>
  );
}

// Depends only on the route + unread count; never needs to re-render with a parent.
export default memo(BottomNavBar);
