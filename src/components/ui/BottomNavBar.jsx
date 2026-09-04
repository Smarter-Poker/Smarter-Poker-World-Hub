/**
 * BottomNavBar — centralized, route-aware World Hub footer navigation.
 *
 * MOUNTING CONTRACT: pages/_app.js is the only owner. Individual pages and
 * feature shells must never import or mount this component. The app shell
 * resolves the active world from src/config/world-footer-navigation.json and
 * renders one fixed footer plus one clearance spacer.
 *
 * POSITION CONTRACT: the footer is welded to the viewport bottom. It never
 * animates and never becomes horizontally scrollable. It translates on the Y
 * axis for exactly one reason: the Facebook reading behaviour described below,
 * which every footer has. No other movement is permitted.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { openPageOverlay } from '../../stores/pageOverlayStore';
import { getFallbackFooter, resolveWorldFooter } from '../../config/worldFooterNavigation';

// Keep navigation above ordinary page content but below dialogs and other
// intentional overlays. A near-integer-max z-index made the footer's six real
// link hit zones cover confirmation buttons even though its artwork frame was
// pointer-transparent.
export const BOTTOM_NAV_Z = 900;
export const BOTTOM_NAV_H = 'calc(56px + env(safe-area-inset-bottom, 0px))';
export const BOTTOM_NAV_CLEARANCE = 'calc(56px + 16px + env(safe-area-inset-bottom, 0px))';

/**
 * THE FOOTER GETS OUT OF THE WAY WHILE YOU READ (Dan, 2026-09-04, binding).
 *
 * Dan, verbatim: "the footer on social media needs to disappear when you
 * scroll up and reappear when you scroll down like it does on facebook. it
 * needs to be real time instant change." Then, once he had it: "any other
 * pages that you can 'scroll up to see more' need this same disappearing
 * footer functionality... implement this everywhere its needed."
 *
 * So it is EVERY world, and the fallback footer too. It shipped for a day as
 * an opt-in `hideOnScroll` flag on one world; the flag survives only as an
 * explicit `false` escape hatch, and no footer sets it.
 *
 * "Everywhere it's needed" is self-limiting and needs no route list: a page
 * that does not scroll never fires a scroll event, so its footer never moves.
 *
 * That is Facebook's rule exactly: a swipe up (reading further down the page)
 * drops the bar; a swipe back down brings it straight back. This replaces the
 * older blanket "never auto-hides" clause of the position contract, which was
 * written to stop the bar coming UNSTUCK from the viewport on iOS — a
 * different failure. Everything that clause was defending is still defended:
 * the bar stays `position: fixed` at `bottom: 0`, it is never a scroller, and
 * the clearance spacer never moves, so no content reflows when it goes.
 *
 * "REAL TIME INSTANT" IS PART OF THE REQUIREMENT, NOT A DETAIL. There is no
 * transition, no easing and no timer anywhere in this path — the transform is
 * applied on the animation frame that follows the scroll event that caused it,
 * which is the same frame the browser was going to paint anyway. Do not add a
 * `transition` here to make it "smoother": smooth is the thing Dan rejected.
 */
const HIDE_ON_SCROLL_THRESHOLD = 4;

const isDocumentScroller = (source) =>
  !source ||
  source === window ||
  source === document ||
  source === document.documentElement ||
  source === document.body;

const scrollTopOf = (source) => {
  if (typeof window === 'undefined') return 0;
  if (isDocumentScroller(source)) {
    return (
      window.scrollY ||
      document.documentElement?.scrollTop ||
      document.body?.scrollTop ||
      0
    );
  }
  return source.scrollTop || 0;
};

const scrollLimitOf = (source) => {
  if (typeof window === 'undefined') return 0;
  if (isDocumentScroller(source)) {
    const doc = document.documentElement;
    return doc ? Math.max(0, doc.scrollHeight - window.innerHeight) : 0;
  }
  return Math.max(0, (source.scrollHeight || 0) - (source.clientHeight || 0));
};

function useHideOnScroll(enabled, resetKey) {
  const [hidden, setHidden] = useState(false);
  const reveal = useCallback(() => setHidden(false), []);

  // A route change always hands the reader a fresh screen, and the bar belongs
  // on it. Without this, arriving at a new page from a scrolled one inherits
  // the hidden state and the footer looks broken until the reader scrolls.
  useEffect(() => {
    setHidden(false);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setHidden(false);
      return undefined;
    }

    // Not every hub page scrolls the document. Several put the scroll on an
    // inner panel, and a scroll event on an element does not bubble — so this
    // listens on the CAPTURE phase at the document, which sees a scroll from
    // any scroller on the page, and tracks each one's position separately so
    // switching between two panels cannot read as a jump.
    const travel = new Map();
    let frame = 0;
    let pending = null;

    // THE FIRST FLICK MUST COUNT (2026-09-04). The first scroll event from a
    // scroller used to do nothing but record where it was, so the bar could
    // not hide until the SECOND settle. A real flick fires dozens of events
    // and nobody noticed on a phone - but a fresh page that receives one
    // burst of scrolling (the footer contract in e2e/global-footer-visual
    // does exactly that, and so does a programmatic jump) never hid at all,
    // and that check has been red on main since it landed. The document's
    // starting position is known at install, so it is seeded here; any other
    // scroller is seeded at its top, which is where a panel is when it mounts.
    const seed = (source, y) => {
      travel.set(source, { last: y, anchor: y, direction: 0 });
    };
    seed(document, scrollTopOf(document));

    const settle = () => {
      frame = 0;
      const source = pending;
      pending = null;

      const y = scrollTopOf(source);
      let state = travel.get(source);
      if (!state) {
        seed(source, 0);
        state = travel.get(source);
      }

      const direction = y > state.last ? 1 : y < state.last ? -1 : 0;
      if (direction !== 0 && direction !== state.direction) {
        // Where the current run of travel in one direction began. Measuring
        // the threshold from here rather than from the previous event means a
        // single fast flick still flips immediately, while sub-pixel jitter
        // inside a momentum scroll cannot rattle the bar open and shut.
        state.anchor = state.last;
        state.direction = direction;
      }
      const anchor = state.anchor;
      state.last = y;

      // At the top of the page the bar is always present.
      if (y <= 0) {
        setHidden(false);
        return;
      }
      // Rubber-band overscroll past the end is not a reader travelling further
      // down, so it must not hide anything.
      if (y >= scrollLimitOf(source)) return;

      if (direction === 1 && y - anchor > HIDE_ON_SCROLL_THRESHOLD) setHidden(true);
      else if (direction === -1 && anchor - y > HIDE_ON_SCROLL_THRESHOLD) setHidden(false);
    };

    const onScroll = (event) => {
      pending = event?.target || null;
      if (frame) return;
      frame = window.requestAnimationFrame(settle);
    };

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onScroll, { capture: true });
      travel.clear();
    };
  }, [enabled]);

  return { hidden: enabled && hidden, reveal };
}

const artworkDisplayBounds = (artwork) =>
  artwork.cropToContentBounds !== false && artwork.contentBounds
    ? artwork.contentBounds
    : { x: 0, y: 0, width: artwork.width, height: artwork.height };

/**
 * CLUB ARENA'S FOOTER IS THE GOLD STANDARD (Dan, 2026-09-04, binding).
 *
 * Dan, verbatim: "the footer inside the club arena is perfect, by size height
 * and length an how it fits perfectly edge to edge. i need you to replicate
 * this size, and placement on every footer, using this as the GOLD STANDARD on
 * how footers are supposed to look and fit."
 *
 * This value IS Club Arena's, copied from `--bottom-nav-height` in
 * src/styles/globals.css of that repo. Keep the two in step: if one moves, the
 * estate stops looking like one product, which is the entire complaint.
 *
 * These stages used to size themselves by `aspect-ratio` off each world's
 * measured frame instead, which meant fourteen different footer heights that
 * all grew without limit on a desktop — 174px of social-media footer against
 * Club Arena's 132px on the same 1140px screen, and worse the wider the
 * window. One clamped height, full bleed, is what makes them match.
 */
export const FOOTER_ARTWORK_HEIGHT = 'clamp(44px, 13.72vw, 132px)';

const artworkStageStyle = () => ({
  width: '100%',
  maxWidth: '100%',
  height: FOOTER_ARTWORK_HEIGHT,
  flex: '0 0 auto',
});

const artworkImageStyle = (artwork) => {
  const display = artworkDisplayBounds(artwork);
  return {
    left: `${(-display.x / display.width) * 100}%`,
    top: `${(-display.y / display.height) * 100}%`,
    width: `${(artwork.width / display.width) * 100}%`,
    height: `${(artwork.height / display.height) * 100}%`,
    // THE GLOBAL `img, video { max-width: 100% }` RESET BREAKS THIS CROP.
    // Every width above is deliberately LARGER than the stage — the stage is
    // the measured frame, the image is the whole source canvas, and the
    // overflow is the margin being cropped away. The reset clamped that width
    // back to 100%, which left `object-fit: contain` letterboxing the artwork
    // inside its own box: the frame rendered ~2.5% small, ~4px low, and the
    // measured crop no longer lined up with the stage — a black strip down the
    // right edge and a shaved, misaligned bottom bevel. Opting out of the
    // reset is what makes the arithmetic above mean what it says.
    maxWidth: 'none',
    maxHeight: 'none',
  };
};

export const BottomNavSpacer = ({ config = null }) => {
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
      <div style={artworkStageStyle()} />
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

/**
 * NOTIFICATIONS OPENS A POPUP, IT DOES NOT NAVIGATE (Dan, 2026-09-02, verbatim):
 * "WHEN YOU CLICK ON NOTIFICATIONS, IT SHOULDN'T OPEN TO ITS OWN PAGE, IT
 * SHOULD CREATE A 'FULL SCREEN POP UP' SO YOU STAY ON THE PAGE YOU WERE ON."
 *
 * The header bell has behaved this way for a while. This footer did not — the
 * "Alerts" tab was a plain <Link>, so the same word did two different things
 * depending on which control you touched, and the footer is the one most
 * players reach for on a phone.
 *
 * It stays a real <Link href="/hub/notifications">: the popup has no address,
 * and a modified click (cmd, ctrl, shift, alt, middle button) should still do
 * what the browser promises and open the page in a new tab. Only a plain left
 * click is intercepted.
 */
const NOTIFICATIONS_HREF = '/hub/notifications';

const openAsOverlayIfNotifications = (href) => (event) => {
  if (href !== NOTIFICATIONS_HREF) return;
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  openPageOverlay('notifications');
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

function ArtworkBottomNav({ footer, activeHref, warm, hidden = false, reveal }) {
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
      data-footer-cropped={artwork.contentBounds && artwork.cropToContentBounds !== false ? 'true' : 'false'}
      data-footer-hide-on-scroll={footer.hideOnScroll === false ? 'false' : 'true'}
      data-footer-hidden={hidden ? 'true' : 'false'}
      // Keyboard focus has no scroll direction to read, so tabbing into a
      // footer that scroll has parked off-screen would move focus somewhere
      // invisible. Reaching it brings it back.
      onFocusCapture={reveal}
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
        padding: 0,
        background: 'transparent',
        // Its own height, straight down, and nothing else. See
        // useHideOnScroll: no transition, by requirement.
        transform: hidden ? 'translateY(100%)' : 'none',
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
          ...artworkStageStyle(),
          position: 'relative',
          minWidth: 0,
          overflow: 'hidden',
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
            // Club Arena's artwork has no object-fit at all, which is `fill`:
            // the frame is stretched to the footer box. `contain` would
            // letterbox it back inside its own aspect and reintroduce exactly
            // the dead strips this pass exists to remove.
            objectFit: 'fill',
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
              onClick={openAsOverlayIfNotifications(item.href)}
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
              scroll-padding-bottom: calc(${FOOTER_ARTWORK_HEIGHT} + 16px + env(safe-area-inset-bottom, 0px));
            }
            :root {
              --active-world-footer-height: ${FOOTER_ARTWORK_HEIGHT};
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
  // Every footer hides while you read (Dan, 2026-09-04). `hideOnScroll: false`
  // is the only way out and nothing sets it.
  const { hidden, reveal } = useHideOnScroll(footer.hideOnScroll !== false, path);

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
        warm={warm}
        hidden={hidden}
        reveal={reveal}
      />
    );
  }

  // The plain footer is the legacy fallback ("global") on pages no world owns.
  // It reads while you scroll like any other page, so it hides like any other
  // footer; the weld underneath it is identical to the artwork nav's.
  return (
    <nav
      aria-label={`${footer.label} footer`}
      className="bn-nav"
      data-global-bottom-nav="true"
      data-footer-world={footer.id}
      data-footer-hide-on-scroll={footer.hideOnScroll === false ? 'false' : 'true'}
      data-footer-hidden={hidden ? 'true' : 'false'}
      onFocusCapture={reveal}
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
        transform: hidden ? 'translateY(100%)' : 'none',
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
            onClick={openAsOverlayIfNotifications(item.href)}
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
        /* NO BOXES OVER FOOTER ICONS (Dan, 2026-09-01, binding). Same law as
           the global header: the icon is the control, an outline on top of it
           is a rectangle on the artwork. Focus stays visible as a soft glow. */
        .bn-tab:focus,
        .bn-tab:focus-visible {
          outline: none;
          box-shadow: none;
        }
        .bn-tab:focus-visible {
          background: radial-gradient(
            closest-side,
            rgba(24, 119, 242, 0.26),
            rgba(24, 119, 242, 0) 78%
          );
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
