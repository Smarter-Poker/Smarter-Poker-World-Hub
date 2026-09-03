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

export const BOTTOM_NAV_Z = 90;
export const BOTTOM_NAV_H =
  'calc(clamp(72px, 7.5vw, 98px) + env(safe-area-inset-bottom, 0px))';
export const BOTTOM_NAV_CLEARANCE =
  'calc(clamp(72px, 7.5vw, 98px) + 14px + env(safe-area-inset-bottom, 0px))';

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

function BottomNavBar({ config = null, theme = 'auto', noSafeArea = false }) {
  const router = useRouter();
  const path = router.asPath || router.pathname || '/';
  const { notificationCount } = useUnreadCount() || {};
  const footer = config || resolveWorldFooter(path) || getFallbackFooter();
  const items = footer.items || [];
  const resolvedTheme = theme === 'auto' ? footer.theme || 'light' : theme;
  const base = THEMES[resolvedTheme] || THEMES.light;
  const c = { ...base, active: footer.accent || base.active };
  const isPremium = footer.visual === 'premium';
  const secondary = footer.secondary || c.active;
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

  return (
    <nav
      aria-label={`${footer.label} footer`}
      className="bn-nav"
      data-global-bottom-nav="true"
      data-footer-world={footer.id}
      data-footer-visual={isPremium ? 'premium' : 'standard'}
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
        minHeight: isPremium ? 'clamp(72px, 7.5vw, 98px)' : 56,
        background: isPremium
          ? `
              radial-gradient(ellipse at 50% -24%, ${c.active}4a 0%, transparent 44%) padding-box,
              linear-gradient(180deg, #13161a 0%, #030405 100%) padding-box,
              linear-gradient(180deg, #ffffff 0%, #777d84 12%, #e9edf0 28%, #272b30 48%, #fafafa 67%, #565c63 82%, #dfe4e8 100%) border-box
            `
          : `linear-gradient(180deg, ${c.active}18 0%, ${c.bg} 42%)`,
        backgroundColor: '#050607',
        backgroundClip: isPremium ? 'padding-box, padding-box, border-box' : undefined,
        border: isPremium ? '3px solid transparent' : 0,
        borderBottom: isPremium ? '3px solid transparent' : undefined,
        borderTop: isPremium ? '3px solid transparent' : `1px solid ${c.border}`,
        borderRadius: isPremium ? 'clamp(17px, 2vw, 28px)' : 0,
        boxShadow: isPremium
          ? `0 -8px 28px rgba(0,0,0,.78), 0 -2px 18px ${c.active}38, inset 0 2px 0 rgba(255,255,255,.46), inset 0 0 0 1px rgba(255,255,255,.22), inset 0 0 0 5px rgba(0,0,0,.72)`
          : 'none',
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        alignItems: 'stretch',
        zIndex: BOTTOM_NAV_Z,
        paddingBottom: noSafeArea ? 0 : 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: isPremium
          ? 'max(5px, env(safe-area-inset-left, 0px))'
          : 'env(safe-area-inset-left, 0px)',
        paddingRight: isPremium
          ? 'max(5px, env(safe-area-inset-right, 0px))'
          : 'env(safe-area-inset-right, 0px)',
        transform: 'none',
        translate: 'none',
        transition: 'none',
        animation: 'none',
        ['--bn-active']: c.active,
        ['--bn-secondary']: secondary,
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
            className={`bn-tab${isPremium ? ' bn-tab--premium' : ''}`}
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
              minHeight: isPremium ? 0 : 56,
              padding: isPremium ? '5px 1px 3px' : '5px 1px 4px',
              position: 'relative',
              boxSizing: 'border-box',
              ['--bn-tone']: item.tone || c.active,
            }}
          >
            <span
              className="bn-active-rail"
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: isPremium ? 2 : 0,
                left: isPremium ? '27%' : '20%',
                right: isPremium ? '27%' : '20%',
                height: isPremium ? 2 : 3,
                borderRadius: 999,
                background: active
                  ? `linear-gradient(90deg, transparent, ${item.tone || c.active}, #fff, ${item.tone || c.active}, transparent)`
                  : 'transparent',
              }}
            />
            <span className="bn-icon-medallion" aria-hidden="true">
              <span className="bn-icon-stack">
                <Icon className="bn-icon bn-icon--shadow" size={22} strokeWidth={4.4} />
                <Icon className="bn-icon bn-icon--color" size={22} strokeWidth={2.15} />
              </span>
            </span>
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
        .bn-icon-medallion {
          position: relative;
          display: grid;
          flex: 0 0 auto;
          place-items: center;
        }
        .bn-icon-stack {
          position: relative;
          display: grid;
          place-items: center;
        }
        .bn-icon {
          grid-area: 1 / 1;
          display: block;
          flex: 0 0 auto;
          width: clamp(18px, 5.8vw, 22px);
          height: clamp(18px, 5.8vw, 22px);
        }
        .bn-icon--shadow { color: rgba(0, 0, 0, .9); }
        .bn-icon--color { color: currentColor; }
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
        .bn-nav[data-footer-visual="premium"]::before,
        .bn-nav[data-footer-visual="premium"]::after {
          content: '';
          position: absolute;
          left: clamp(17px, 2vw, 29px);
          right: clamp(17px, 2vw, 29px);
          z-index: 0;
          pointer-events: none;
        }
        .bn-nav[data-footer-visual="premium"]::before {
          top: 7px;
          bottom: 6px;
          border: 1px solid rgba(238, 244, 248, .5);
          border-radius: clamp(12px, 1.55vw, 22px);
          background-color: #08090b;
          background-image:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.12) 0 1px, transparent 1.4px),
            linear-gradient(135deg, rgba(255,255,255,.045) 25%, transparent 25%),
            linear-gradient(225deg, rgba(255,255,255,.038) 25%, transparent 25%),
            linear-gradient(45deg, rgba(0,0,0,.56) 25%, transparent 25%),
            linear-gradient(315deg, rgba(0,0,0,.7) 25%, #0b0d10 25%);
          background-position: 12px 12px, 0 0, 0 0, 0 0, 0 0;
          background-size: 24px 24px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 26px rgba(0,0,0,.95);
        }
        .bn-nav[data-footer-visual="premium"]::after {
          top: 0;
          height: 4px;
          background: linear-gradient(90deg, transparent, var(--bn-active), #fff, var(--bn-secondary), transparent);
          opacity: .74;
          filter: blur(.2px) drop-shadow(0 0 5px var(--bn-active));
        }
        .bn-tab--premium {
          z-index: 1;
          color: rgba(237, 241, 245, .86) !important;
          text-shadow: 0 1px 2px #000, 0 0 8px rgba(255,255,255,.14);
        }
        .bn-tab--premium + .bn-tab--premium::before {
          content: '';
          position: absolute;
          left: 0;
          top: 20%;
          bottom: 16%;
          width: 1px;
          background: linear-gradient(180deg, transparent, rgba(255,255,255,.13), transparent);
        }
        .bn-tab--premium .bn-icon-medallion {
          width: clamp(34px, 4.55vw, 54px);
          height: clamp(34px, 4.55vw, 54px);
          border: 1px solid transparent;
          border-radius: 50%;
          background:
            radial-gradient(circle at 35% 27%, rgba(255,255,255,.27), transparent 22%) padding-box,
            radial-gradient(circle at 50% 62%, color-mix(in srgb, var(--bn-tone) 29%, #050608), #060709 68%) padding-box,
            linear-gradient(145deg, #ffffff, #555b62 25%, #f6f6f6 49%, #272b30 72%, #dfe4e8) border-box;
          box-shadow:
            0 3px 8px rgba(0,0,0,.82),
            0 0 14px color-mix(in srgb, var(--bn-tone) 38%, transparent),
            inset 0 0 0 2px #050608,
            inset 0 0 12px rgba(0,0,0,.75);
        }
        .bn-tab--premium .bn-icon {
          width: clamp(22px, 3vw, 36px);
          height: clamp(22px, 3vw, 36px);
        }
        .bn-tab--premium .bn-icon--color {
          color: var(--bn-tone);
          filter: drop-shadow(0 0 2px rgba(255,255,255,.55)) drop-shadow(0 0 5px var(--bn-tone));
        }
        .bn-tab--premium .bn-label {
          margin-top: 1px;
          color: #f0f2f4;
          font-family: "Arial Narrow", "Roboto Condensed", system-ui, sans-serif;
          font-size: clamp(7px, 1.06vw, 13px);
          font-weight: 760;
          letter-spacing: .055em;
          line-height: 1;
          text-transform: uppercase;
        }
        .bn-tab--premium[aria-current="page"] .bn-icon-medallion {
          box-shadow:
            0 3px 8px rgba(0,0,0,.86),
            0 0 6px #fff,
            0 0 20px color-mix(in srgb, var(--bn-tone) 72%, transparent),
            inset 0 0 0 2px #050608,
            inset 0 0 13px color-mix(in srgb, var(--bn-tone) 22%, #000);
        }
        .bn-tab--premium:hover .bn-icon-medallion {
          filter: brightness(1.16);
        }
        .bn-tab--premium:focus-visible {
          outline-color: var(--bn-tone);
          outline-offset: -5px;
        }
        @media (min-width: 640px) {
          .bn-label { font-size: 12px; letter-spacing: 0; }
          .bn-tab--premium .bn-label { font-size: clamp(10px, 1.06vw, 13px); letter-spacing: .055em; }
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
