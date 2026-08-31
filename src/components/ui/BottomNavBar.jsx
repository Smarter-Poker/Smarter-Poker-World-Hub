/**
 * BottomNavBar — centralized, route-aware World Hub footer navigation.
 *
 * MOUNTING CONTRACT: pages/_app.js is the only owner. Individual pages and
 * feature shells must never import or mount this component. The app shell
 * resolves the active world from src/config/world-footer-navigation.json and
 * renders one fixed footer plus one clearance spacer.
 *
 * POSITION CONTRACT: the footer is welded to the viewport bottom. It never
 * auto-hides, translates, animates, or becomes horizontally scrollable.
 */

import React, { memo, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  Brain,
  Calculator,
  CalendarDays,
  CircleHelp,
  CirclePlus,
  Clock3,
  Club,
  Coins,
  Crown,
  Download,
  Film,
  Flame,
  FlaskConical,
  Gamepad2,
  Gem,
  Globe2,
  GraduationCap,
  Grid3X3,
  Heart,
  History,
  Home,
  LayoutGrid,
  MapPin,
  MapPinned,
  Medal,
  MessageCircle,
  Newspaper,
  Package,
  Pencil,
  Percent,
  Play,
  Radar,
  ReceiptText,
  Route,
  Rss,
  ShieldCheck,
  Shirt,
  ShoppingCart,
  Sigma,
  Spade,
  Swords,
  Target,
  Timer,
  Trophy,
  User,
  Users,
  Vault,
  Video,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { getFallbackFooter, resolveWorldFooter } from '../../config/worldFooterNavigation';

// Keep navigation above ordinary page content but below dialogs and other
// intentional overlays. A near-integer-max z-index made the footer's six real
// link hit zones cover confirmation buttons even though its artwork frame was
// pointer-transparent.
export const BOTTOM_NAV_Z = 900;
export const BOTTOM_NAV_H = 'calc(56px + env(safe-area-inset-bottom, 0px))';
export const BOTTOM_NAV_CLEARANCE = 'calc(56px + 16px + env(safe-area-inset-bottom, 0px))';

const artworkDisplayBounds = (artwork) =>
  artwork.cropToContentBounds && artwork.contentBounds
    ? artwork.contentBounds
    : { x: 0, y: 0, width: artwork.width, height: artwork.height };

const artworkStageStyle = (artwork) => {
  const display = artworkDisplayBounds(artwork);
  return {
    width: `min(100%, ${display.width}px)`,
    maxWidth: '100%',
    aspectRatio: `${display.width} / ${display.height}`,
    flex: '0 0 auto',
  };
};

const artworkImageStyle = (artwork) => {
  const display = artworkDisplayBounds(artwork);
  return {
    left: `${(-display.x / display.width) * 100}%`,
    top: `${(-display.y / display.height) * 100}%`,
    width: `${(artwork.width / display.width) * 100}%`,
    height: `${(artwork.height / display.height) * 100}%`,
  };
};

export const BottomNavSpacer = ({ config = null, noSafeArea = false }) => {
  const artwork = config?.artwork;
  if (!artwork) {
    return (
      <div
        aria-hidden="true"
        data-bottom-nav-clearance="true"
        style={{ height: BOTTOM_NAV_CLEARANCE, minHeight: BOTTOM_NAV_CLEARANCE, flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      data-bottom-nav-clearance="true"
      data-footer-artwork-clearance={config.id}
      style={{
        width: '100%',
        maxWidth: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <div style={artworkStageStyle(artwork)} />
      <div
        style={{
          width: 1,
          height: noSafeArea
            ? 14
            : 'calc(14px + env(safe-area-inset-bottom, 0px))',
          flex: '0 0 auto',
        }}
      />
    </div>
  );
};

const THEMES = {
  light: {
    bg: '#ffffff',
    border: '#dddfe2',
    inactive: '#565b64',
    active: '#1877f2',
    badge: '#f02849',
    badgeText: '#ffffff',
  },
  dark: {
    bg: '#111318',
    border: '#343842',
    inactive: '#c2c7d0',
    active: '#4599ff',
    badge: '#ef4444',
    badgeText: '#ffffff',
  },
};

const ICONS = {
  bell: Bell,
  book: BookOpen,
  bookmark: Bookmark,
  brain: Brain,
  calculator: Calculator,
  calendar: CalendarDays,
  cards: Spade,
  chart: BarChart3,
  clock: Clock3,
  club: Club,
  coins: Coins,
  compose: Pencil,
  crown: Crown,
  download: Download,
  film: Film,
  flame: Flame,
  flask: FlaskConical,
  gamepad: Gamepad2,
  gem: Gem,
  globe: Globe2,
  graduation: GraduationCap,
  grid: Grid3X3,
  heart: Heart,
  help: CircleHelp,
  history: History,
  home: Home,
  layout: LayoutGrid,
  map: MapPin,
  mapPinned: MapPinned,
  medal: Medal,
  message: MessageCircle,
  newspaper: Newspaper,
  package: Package,
  percent: Percent,
  play: Play,
  plus: CirclePlus,
  radar: Radar,
  receipt: ReceiptText,
  route: Route,
  rss: Rss,
  shield: ShieldCheck,
  shirt: Shirt,
  shopping: ShoppingCart,
  sigma: Sigma,
  spade: Spade,
  swords: Swords,
  target: Target,
  timer: Timer,
  trophy: Trophy,
  user: User,
  users: Users,
  vault: Vault,
  video: Video,
  wallet: WalletCards,
  zap: Zap,
};

const parseLocation = (value) => {
  const [pathWithHash, queryWithHash = ''] = String(value || '/').split('?');
  const path = pathWithHash.split('#')[0].replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(queryWithHash.split('#')[0]);
  return { path, query };
};

const activeDestination = (items, currentLocation) => {
  const current = parseLocation(currentLocation);
  let winner = null;

  for (const item of items) {
    const target = parseLocation(item.href);
    const pathMatches =
      current.path === target.path || current.path.startsWith(`${target.path}/`);
    if (!pathMatches) continue;

    const expectedQuery = [...target.query.entries()];
    if (expectedQuery.some(([key, value]) => current.query.get(key) !== value)) continue;

    const score = target.path.length + expectedQuery.length * 1000;
    if (!winner || score > winner.score) winner = { href: item.href, score };
  }

  return winner?.href || items[0]?.href;
};

function ArtworkBottomNav({ footer, activeHref, noSafeArea, warm }) {
  const artwork = footer.artwork;
  const items = footer.items || [];
  const bounds = artwork.contentBounds || {
    x: 0,
    y: 0,
    width: artwork.width,
    height: artwork.height,
  };
  const displayBounds = artworkDisplayBounds(artwork);
  const segmentWidth = bounds.width / items.length;
  const topPercent = ((bounds.y - displayBounds.y) / displayBounds.height) * 100;
  const heightPercent = (bounds.height / displayBounds.height) * 100;

  return (
    <nav
      aria-label={`${footer.label} footer`}
      className="bn-nav bn-artwork-nav"
      data-global-bottom-nav="true"
      data-footer-world={footer.id}
      data-footer-artwork={artwork.src}
      data-footer-artwork-sha256={artwork.sha256}
      data-footer-cropped={artwork.cropToContentBounds ? 'true' : 'false'}
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
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        zIndex: BOTTOM_NAV_Z,
        paddingBottom: noSafeArea ? 0 : 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        transform: 'none',
        translate: 'none',
        transition: 'none',
        animation: 'none',
        // Only the authored controls should receive pointer input. Transparent
        // artwork capture margins must never become an invisible click shield.
        pointerEvents: 'none',
      }}
    >
      <div
        className="bn-artwork-stage"
        data-footer-source-width={artwork.width}
        data-footer-source-height={artwork.height}
        style={{
          ...artworkStageStyle(artwork),
          position: 'relative',
          minWidth: 0,
          // Only the six explicit destination hit zones should capture input.
          // The transparent remainder of the full artwork frame otherwise
          // blocks buttons and links near the bottom of marketplace pages.
          pointerEvents: 'none',
        }}
      >
        <img
          src={artwork.src}
          alt=""
          aria-hidden="true"
          draggable="false"
          decoding="async"
          className="bn-artwork-image"
          data-exact-approved-artwork="true"
          width={artwork.width}
          height={artwork.height}
          style={{
            position: 'absolute',
            ...artworkImageStyle(artwork),
            display: 'block',
            objectFit: 'contain',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />

        {items.map((item, index) => {
          const leftPercent =
            ((bounds.x - displayBounds.x + segmentWidth * index) / displayBounds.width) * 100;
          const widthPercent = (segmentWidth / displayBounds.width) * 100;
          const active = item.href === activeHref;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="bn-artwork-hit-zone"
              data-footer-control={index + 1}
              data-footer-destination={item.href}
              aria-label={item.title || item.label}
              aria-current={active ? 'page' : undefined}
              title={item.title || item.label}
              onTouchStart={() => warm(item.href)}
              onMouseEnter={() => warm(item.href)}
              style={{
                position: 'absolute',
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
                width: `${widthPercent}%`,
                height: `${heightPercent}%`,
                minHeight: 44,
                margin: 0,
                padding: 0,
                border: 0,
                background: 'transparent',
                boxShadow: 'none',
                textDecoration: 'none',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                pointerEvents: 'auto',
              }}
            />
          );
        })}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .bn-artwork-hit-zone:focus { outline: none; }
            .bn-artwork-hit-zone:focus-visible {
              outline: 2px solid rgba(255, 255, 255, .92);
              outline-offset: -4px;
            }
            @media (prefers-reduced-motion: reduce) {
              .bn-artwork-nav, .bn-artwork-hit-zone { transition: none !important; }
            }
            html {
              scroll-padding-bottom: calc(min(${((displayBounds.height / displayBounds.width) * 100).toFixed(4)}vw, ${displayBounds.height}px) + 16px + env(safe-area-inset-bottom, 0px));
            }
            :root {
              --active-world-footer-height: min(${((displayBounds.height / displayBounds.width) * 100).toFixed(4)}vw, ${displayBounds.height}px);
            }
          `,
        }}
      />
    </nav>
  );
}

function BottomNavBar({ config = null, theme = 'auto', noSafeArea = false }) {
  const router = useRouter();
  const path = router.asPath || router.pathname || '/';
  const { notificationCount } = useUnreadCount() || {};
  const footer = config || resolveWorldFooter(path) || getFallbackFooter();
  const items = footer.items || [];
  const resolvedTheme = theme === 'auto' ? footer.theme || 'light' : theme;
  const base = THEMES[resolvedTheme] || THEMES.light;
  const c = { ...base, active: footer.accent || base.active };
  const activeHref = useMemo(() => activeDestination(items, path), [items, path]);

  const warm = useCallback(
    (href) => {
      try {
        router.prefetch(href);
      } catch (_) {
        // Prefetch is best-effort; navigation itself remains a normal Link.
      }
    },
    [router]
  );

  const count = Number(notificationCount) || 0;

  if (footer.artwork) {
    return (
      <ArtworkBottomNav
        footer={footer}
        activeHref={activeHref}
        noSafeArea={noSafeArea}
        warm={warm}
      />
    );
  }

  return (
    <nav
      aria-label={`${footer.label} footer`}
      className="bn-nav"
      data-global-bottom-nav="true"
      data-footer-world={footer.id}
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
        background: `linear-gradient(180deg, ${c.active}18 0%, ${c.bg} 42%)`,
        borderTop: `1px solid ${c.border}`,
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        alignItems: 'stretch',
        zIndex: BOTTOM_NAV_Z,
        paddingBottom: noSafeArea ? 0 : 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        transform: 'none',
        translate: 'none',
        transition: 'none',
        animation: 'none',
        ['--bn-active']: c.active,
      }}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon] || LayoutGrid;
        const active = item.href === activeHref;
        const hasNotificationBadge = item.badge === 'notifications';
        const ariaLabel =
          hasNotificationBadge && count > 0
            ? `${item.title || item.label}, ${count} unread notification${count === 1 ? '' : 's'}`
            : item.title || item.label;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="bn-tab"
            data-footer-destination={item.href}
            aria-label={ariaLabel}
            aria-current={active ? 'page' : undefined}
            title={item.title || item.label}
            onTouchStart={() => warm(item.href)}
            onMouseEnter={() => warm(item.href)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: active ? c.active : c.inactive,
              minWidth: 0,
              minHeight: 56,
              padding: '5px 1px 4px',
              position: 'relative',
              boxSizing: 'border-box',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: '20%',
                right: '20%',
                height: 3,
                borderRadius: 999,
                background: active ? c.active : 'transparent',
              }}
            />
            <Icon className="bn-icon" size={22} strokeWidth={2} aria-hidden="true" />
            {hasNotificationBadge && count > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 'calc(50% - 20px)',
                  background: c.badge,
                  color: c.badgeText,
                  borderRadius: 999,
                  minWidth: 17,
                  height: 17,
                  fontSize: 11,
                  lineHeight: '17px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  padding: '0 4px',
                  boxSizing: 'border-box',
                }}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
            <span className="bn-label">{item.label}</span>
          </Link>
        );
      })}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .bn-tab {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform .12s ease, opacity .12s ease;
        }
        .bn-tab:active { opacity: .65; transform: scale(.94); }
        .bn-tab:focus-visible {
          outline: 2px solid var(--bn-active, #1877f2);
          outline-offset: -2px;
          border-radius: 8px;
        }
        .bn-icon {
          display: block;
          flex: 0 0 auto;
          width: clamp(18px, 5.8vw, 22px);
          height: clamp(18px, 5.8vw, 22px);
        }
        .bn-label {
          display: block;
          width: 100%;
          margin-top: 2px;
          padding-inline: 1px;
          box-sizing: border-box;
          overflow: visible;
          white-space: nowrap;
          text-align: center;
          font-size: clamp(8.5px, 2.55vw, 12px);
          line-height: 1;
          letter-spacing: -.025em;
          font-weight: 650;
        }
        @media (min-width: 640px) {
          .bn-label { font-size: 12px; letter-spacing: 0; }
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

export default memo(BottomNavBar);
