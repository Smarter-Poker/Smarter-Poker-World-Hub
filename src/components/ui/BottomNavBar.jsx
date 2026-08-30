/**
 * BottomNavBar — Platform-Wide Fixed Bottom Navigation
 * Per Mobile Layout Standard + PA_DESIGN_SPEC v1
 *
 * 56px fixed bar with 6 tabs: Home, Coach, Friends, Pages, Alerts, Profile.
 * Includes env(safe-area-inset-*) for iPhone notch/home-indicator safety.
 *
 * MOUNTING CONTRACT: pages/_app.js is the only place allowed to render this
 * component. src/config/bottom-nav-routes.json controls route visibility and
 * the app shell renders BottomNavSpacer beside it. Individual pages must not
 * mount the footer or guess their own footer clearance.
 *
 * Z-INDEX CONTRACT: this bar sits at BOTTOM_NAV_Z (90) — deliberately LOW.
 * Every fixed overlay (sheets, modals, pickers, tours) must render at >= 900
 * so it paints above the bar. Do not raise the bar to fix an overlay bug.
 *
 * POSITION CONTRACT: the bar never auto-hides, translates, animates, or follows
 * page scroll. It remains welded to the viewport bottom on every route that
 * renders it. Preserve this in the shared component instead of adding
 * route-specific movement.
 */

import React, { memo, useCallback } from 'react';
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

/** App-shell spacer: navigation height + breathing room + device safe area. */
export const BottomNavSpacer = () => (
  <div
    aria-hidden="true"
    data-bottom-nav-clearance="true"
    style={{ height: BOTTOM_NAV_CLEARANCE, minHeight: BOTTOM_NAV_CLEARANCE, flexShrink: 0 }}
  />
);

const THEMES = {
  light: {
    bg: '#ffffff',
    border: '#dddfe2',
    inactive: '#65676b',
    active: '#1877f2',
    badge: '#f02849',
    badgeText: '#ffffff',
  },
  dark: {
    bg: '#242526',
    border: '#3A3B3C',
    inactive: '#B0B3B8',
    active: '#4599FF',
    badge: '#EF4444',
    badgeText: '#ffffff',
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

function BottomNavBar({ theme = 'auto', noSafeArea = false }) {
  const router = useRouter();
  const path = router.asPath || '';
  const { notificationCount } = useUnreadCount() || {};

  const isPaSurface = DARK_ROUTE_PREFIXES.some((p) => path.startsWith(p));
  const resolvedTheme =
    theme === 'dark' || theme === 'pa'
      ? 'dark'
      : theme === 'light'
        ? 'light'
        : isPaSurface
          ? 'dark'
          : 'light';
  const c = THEMES[resolvedTheme];

  // Determine which tab is active based on current path
  const isActive = useCallback(
    (href) => {
      // Reels lost its own tab when Coach replaced it. Without this branch
      // /hub/reels highlighted nothing at all — six inactive tabs and no
      // aria-current="page" anywhere — so it maps onto the social tab.
      if (href === '/hub/social-media') {
        return (
          path === '/hub/social-media' ||
          path.startsWith('/hub/social-media/') ||
          path.startsWith('/hub/social-media?') ||
          path === '/hub/reels' ||
          path.startsWith('/hub/reels/') ||
          path.startsWith('/hub/reels?')
        );
      }
      if (href === '/hub/social-pages') return path.startsWith('/hub/social-pages');
      if (href === '/hub/personal-assistant')
        return path.startsWith('/hub/personal-assistant') || path.startsWith('/sandbox');
      if (href === '/hub/friends') return path.startsWith('/hub/friends');
      if (href === '/hub/notifications') return path === '/hub/notifications';
      if (href === '/hub/profile') return path === '/hub/profile';
      return false;
    },
    [path]
  );

  // Next.js prefetches every in-viewport <Link> in production. Six permanently
  // visible tabs = six extra route bundles on every page load. Prefetch on
  // intent instead.
  const warm = useCallback(
    (href) => {
      try {
        router.prefetch(href);
      } catch (_) {
        /* prefetch is best-effort */
      }
    },
    [router]
  );

  const count = Number(notificationCount) || 0;

  return (
    <nav
      aria-label="Primary"
      className="bn-nav"
      data-global-bottom-nav="true"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: '100vw',
        margin: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
        minHeight: 56,
        background: c.bg,
        borderTop: `1px solid ${c.border}`,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'stretch',
        zIndex: BOTTOM_NAV_Z,
        paddingBottom: noSafeArea ? 0 : 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        transform: 'none',
        translate: 'none',
        transition: 'none',
        animation: 'none',
        // consumed by the .bn-tab:focus-visible rule in the <style> block below
        ['--bn-active']: c.active,
      }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(href);
        const isAlerts = href === '/hub/notifications';
        const ariaLabel =
          isAlerts && count > 0
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
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: active ? c.active : c.inactive,
              flex: 1,
              minWidth: 0,
              minHeight: 56,
              padding: '6px 2px',
              position: 'relative',
            }}
          >
            {/* Active state must not be colour-only */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: '22%',
                right: '22%',
                height: 3,
                borderRadius: 999,
                background: active ? c.active : 'transparent',
              }}
            />
            <Icon size={24} strokeWidth={2} aria-hidden="true" />
            {isAlerts && count > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 'calc(50% - 20px)',
                  background: c.badge,
                  color: c.badgeText,
                  borderRadius: 999,
                  minWidth: 18,
                  height: 18,
                  fontSize: 12,
                  lineHeight: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  padding: '0 5px',
                }}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
            <span
              style={{
                fontSize: 12,
                marginTop: 2,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
                fontWeight: active ? 700 : 500,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}

      {/* Raw <style> injection, NOT styled-jsx. A large global styled-jsx block on
          this surface deadlocked the SWC compiler for 45 minutes and broke production
          deploys (maintainer fix 17409efc08). Never reintroduce styled-jsx here.
          The CSS is emitted verbatim and unscoped, exactly as `<style jsx global>`
          emitted it — but styled-jsx hoisted global styles into <head> and this tag
          renders inline in the body, so these rules now sit later in the cascade and
          win same-specificity ties against head stylesheets they used to lose. If a
          rule ever needs to lose such a tie, bump the other rule's specificity
          explicitly instead of relying on document order. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
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
      `,
        }}
      />
    </nav>
  );
}

// Depends only on the route + unread count; never needs to re-render with a parent.
export default memo(BottomNavBar);
