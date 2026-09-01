/**
 * Universal Hamburger Menu Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Reusable slide-out menu for all World Hub pages.
 * Supports navigation links, toggle switches, action buttons, grids, search,
 * collapsible sections, per-menu favourites and a "jump back in" recents list.
 *
 * Mobile-first (375x667 baseline) per PA_DESIGN_SPEC v1:
 *  - every row is >= 44px tall with >= 8px between adjacent targets
 *  - nothing renders below 12px; the search input is exactly 16px (no iOS zoom)
 *  - full safe-area padding, 100dvh, contained overscroll
 *  - real dialog semantics: role=dialog, focus trap, focus restore, Esc, backdrop
 *  - press feedback via CSS :active (never hover-only)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { X, Search, ChevronRight, ChevronDown, Star, Clock, WifiOff, Pencil } from 'lucide-react';
import InviteFriendsModal from './InviteFriendsModal';
import GeevesMenuWidget from './GeevesMenuWidget';
import ReportBugWidget from './ReportBugWidget';
import { useActiveIdentity } from '../../contexts/ActiveIdentityContext';
import { useAvatar } from '../../contexts/AvatarContext';
import { getAuthUser } from '../../lib/authUtils';
import { T } from '../sandbox/paTokens';
import { homeGamePageUrl } from '../../lib/home-games/urls';
import { resolveWorldMenu } from '../../config/worldMenuNavigation';
import { applyWorldMenuDeck, getMenuConfigForPath } from '../../config/hamburgerMenus';
import {
  sanitizeFallbackMenuConfig,
  sanitizeProvidedMenuConfig,
} from '../../config/fallbackMenuSafety.mjs';
import {
  evaluateWorldMenuActivation,
  getActiveWorldMenuHref,
  parseWorldMenuHref,
} from '../../lib/world-menu/navigationState.mjs';
import WorldCommandMenuBoundary from './WorldCommandMenuBoundary';

const FALLBACK_AVATAR = '/default-avatar.png';

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Club Arena / Commander are getServerSideProps SPAs — a client-side Next.js
 * transition into them leaves the app in a broken half-hydrated state, so they
 * need a real document load. Config items may also opt in with `hardNav: true`.
 */
const HARD_NAV_PREFIXES = ['/hub/club-arena', '/hub/commander'];
const needsHardNav = (item) =>
  !!item?.hardNav ||
  (typeof item?.href === 'string' && HARD_NAV_PREFIXES.some((p) => item.href.startsWith(p)));

const lsGet = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
};
const lsSet = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* quota / private mode */ }
};

const ACTIONABLE = new Set(['navigation', 'action', 'toggle', 'grid']);
const labelOf = (item) => (typeof item?.label === 'string' ? item.label : '');
const matchesId = (item, id) => item?.id === id;
const looksLikeSignOut = (item) => /sign\s*out|log\s*out|logout/i.test(labelOf(item));

/** Split a flat menu array into [{ label, items:[{item,index}] }] groups. */
function buildGroups(items) {
  const groups = [];
  let current = { key: '__top', label: null, items: [] };
  (items || []).forEach((item, index) => {
    if (item?.type === 'section') {
      if (current.items.length) groups.push(current);
      current = { key: `sec-${index}-${labelOf(item)}`, label: labelOf(item), items: [] };
    } else {
      current.items.push({ item, index });
    }
  });
  if (current.items.length) groups.push(current);
  return groups;
}

function countActionable(items) {
  return (items || []).reduce((n, item) => (ACTIONABLE.has(item?.type) ? n + 1 : n), 0);
}

/** Flatten every href-bearing entry (rows + grid tiles) so favourites resolve. */
function collectLinkables(items) {
  const out = [];
  (items || []).forEach((item) => {
    if (item?.type === 'navigation' && item.href) out.push(item);
    if (item?.type === 'grid') {
      (item.items || []).forEach((g) => {
        if (g?.href) out.push({ type: 'navigation', label: g.label, href: g.href, icon: g.icon, hardNav: g.hardNav });
      });
    }
  });
  return out;
}

function HamburgerMenuContent({
  isOpen,
  onClose,
  direction = 'left',
  theme = 'light',
  user = null,
  menuItems: providedMenuItems = [],
  showProfile = true,
  profileExtras = null,
  bottomLinks: providedBottomLinks = [],
  width = 320,
  shortcuts = null, // External shortcuts array: [{ id, name, avatar_url, href, isArena, page }]
  menuKey = null,   // Optional stable key for persisting collapse/favourite state
}) {
  const router = useRouter();
  const activeWorld = useMemo(
    () => resolveWorldMenu(router?.asPath || router?.pathname || ''),
    [router?.asPath, router?.pathname],
  );
  const worldAccent = activeWorld?.menuPalette?.accent || activeWorld?.accent || '#2e9bff';
  const isFacebookMenu = activeWorld?.menuPalette?.scheme === 'facebook';
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [localUser, setLocalUser] = useState(null);
  const {
    switchToPersonal = () => {},
    switchToClub = () => {},
    isClubMode = false,
    clubPage = null,
    ownedPages = [],
  } = useActiveIdentity() || {};
  const { notifications = [] } = useAvatar() || {};

  const storeKey = menuKey || router?.pathname || 'default';

  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const wasOpenRef = useRef(false);
  const navigationLockRef = useRef(null);
  const navigationTimerRef = useRef(null);

  const [query, setQuery] = useState('');
  const [editFavs, setEditFavs] = useState(false);
  const [favs, setFavs] = useState([]);
  const [recents, setRecents] = useState([]);
  const [collapseOverrides, setCollapseOverrides] = useState({});
  const [online, setOnline] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Latch: only mount the heavy in-drawer widgets once the menu has been opened.
  const [everOpened, setEverOpened] = useState(false);
  const [pendingHref, setPendingHref] = useState('');

  useEffect(() => { setLocalUser(getAuthUser()); }, []);
  useEffect(() => { if (isOpen) setEverOpened(true); }, [isOpen]);

  useEffect(() => {
    navigationLockRef.current = null;
    setPendingHref('');
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
  }, [router?.asPath, isOpen]);

  useEffect(() => () => {
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
  }, []);

  const activeUser = user || localUser;
  const automaticConfig = useMemo(
    () => sanitizeFallbackMenuConfig(
      getMenuConfigForPath(router?.asPath || router?.pathname || '/', activeUser)
    ),
    [router?.asPath, router?.pathname, activeUser],
  );
  const usesAutomaticConfig = providedMenuItems.length === 0;
  const providedConfig = useMemo(
    () => sanitizeProvidedMenuConfig(
      applyWorldMenuDeck(
        { menuItems: providedMenuItems, bottomLinks: providedBottomLinks },
        activeWorld
      )
    ),
    [providedMenuItems, providedBottomLinks, activeWorld]
  );
  const menuItems = usesAutomaticConfig ? automaticConfig.menuItems : providedConfig.menuItems;
  const bottomLinks = usesAutomaticConfig ? automaticConfig.bottomLinks : providedConfig.bottomLinks;

  // ── Persisted state ───────────────────────────────────────────────────────
  useEffect(() => {
    setFavs(lsGet(`sp-menu-favs:${storeKey}`, []) || []);
    setCollapseOverrides(lsGet(`sp-menu-collapsed:${storeKey}`, {}) || {});
  }, [storeKey]);

  useEffect(() => {
    if (isOpen) setRecents(lsGet('sp-menu-recents', []) || []);
  }, [isOpen]);

  // ── Connectivity ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined') return undefined;
    setOnline(navigator.onLine !== false);
    const goOn = () => setOnline(true);
    const goOff = () => setOnline(false);
    window.addEventListener('online', goOn);
    window.addEventListener('offline', goOff);
    return () => {
      window.removeEventListener('online', goOn);
      window.removeEventListener('offline', goOff);
    };
  }, []);

  // ── Reduced motion ────────────────────────────────────────────────────────
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

  const handleLogout = useCallback(async () => {
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Signout warning:', e);
    } finally {
      ['sp-social-user', 'sp-vip-status', 'smarter-poker-auth', 'sp-cached-header-user',
        'sp-cached-settings-profile', 'sp-notif-count'].forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      // window.top throws a SecurityError inside a cross-origin iframe.
      try { window.top.location.href = '/'; } catch (_) { window.location.href = '/'; }
    }
  }, []);

  // ── Close on ESC ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // ── Focus management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      if (typeof document !== 'undefined') {
        const activeElement = document.activeElement;
        restoreFocusRef.current = activeElement?.matches?.('[data-world-menu-trigger]')
          ? activeElement
          : document.querySelector('[data-world-menu-trigger="approved-header"]') || activeElement;
      }
      const t = setTimeout(() => { try { closeBtnRef.current?.focus(); } catch (_) {} }, 60);
      return () => clearTimeout(t);
    }
    // A closed drawer also renders on initial page load. Do not treat that
    // first render as a close event: focusing the menu trigger here steals
    // focus from route-owned status messages, dialogs, and form controls.
    if (!wasOpenRef.current) return undefined;
    wasOpenRef.current = false;
    const prev = restoreFocusRef.current;
    restoreFocusRef.current = null;
    const focusTarget = prev?.isConnected
      ? prev
      : document.querySelector('[data-world-menu-trigger="approved-header"]');
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try { focusTarget.focus(); } catch (_) {}
    }
    setQuery('');
    setEditFavs(false);
    return undefined;
  }, [isOpen]);

  const trapTab = useCallback((e) => {
    if (e.key !== 'Tab' || !drawerRef.current) return;
    const nodes = Array.from(drawerRef.current.querySelectorAll(FOCUSABLE))
      .filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, []);

  // ── Swipe-to-close (axis aware, ignores horizontal scrollers) ─────────────
  const touchStartRef = useRef(null);
  const handleTouchStart = (e) => {
    if (e.target?.closest?.('[data-hscroll]')) { touchStartRef.current = null; return; }
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = start.x - t.clientX;
    const dy = Math.abs(start.y - t.clientY);
    if (Math.abs(dx) < 60 || Math.abs(dx) < dy * 1.5) return; // not a decisive horizontal swipe
    if (direction === 'left' && dx > 0) onClose?.();
    if (direction === 'right' && dx < 0) onClose?.();
  };

  // ── Body scroll lock (iOS-safe, restores the original inline values) ──────
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const y = window.scrollY || window.pageYOffset || 0;
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, [isOpen]);

  // ── Palette ───────────────────────────────────────────────────────────────
  // NOTE: the 'light' and 'dark' objects are consumed by other worlds — do not
  // change them. 'pa' is the Neon Slate branch (PA_DESIGN_SPEC v1 §1).
  const colors = useMemo(() => {
    if (theme === 'light' || isFacebookMenu) {
      return {
        bg: '#FFFFFF', text: '#050505', textSec: '#65676B', border: '#DADDE1',
        blue: worldAccent, blueHover: activeWorld?.menuPalette?.accentPressed || '#166FE5',
        cardBg: '#F0F2F5', hoverBg: '#E7F3FF',
        tileBg: '#FFFFFF', inputBg: '#F0F2F5', danger: '#D93025',
      };
    }
    if (theme === 'pa') {
      return {
        bg: T.bg, text: T.text, textSec: T.textMuted, border: T.border,
        blue: T.accent, blueHover: T.accentPress, cardBg: T.surface,
        hoverBg: 'rgba(69,153,255,0.12)', tileBg: T.surface, inputBg: T.surface2,
        danger: T.danger,
      };
    }
    return {
      bg: '#03070b', text: '#edf4fb',
      textSec: '#8b9aaa', border: 'rgba(174, 194, 212, 0.24)', blue: worldAccent,
      blueHover: worldAccent, cardBg: 'rgba(12, 19, 26, 0.96)',
      hoverBg: `${worldAccent}18`, tileBg: 'linear-gradient(145deg, rgba(25, 34, 43, 0.96), rgba(4, 8, 12, 0.98))',
      inputBg: 'rgba(2, 6, 10, 0.94)', danger: '#ff697f',
    };
  }, [theme, worldAccent, isFacebookMenu, activeWorld?.menuPalette?.accentPressed]);

  // ── Derived menu structure ────────────────────────────────────────────────
  const actionableCount = useMemo(() => countActionable(menuItems), [menuItems]);
  const showSearch = Boolean(activeWorld) || actionableCount > 12;
  const autoCollapse = actionableCount > 20;
  const groups = useMemo(() => buildGroups(menuItems), [menuItems]);
  const linkables = useMemo(() => collectLinkables(menuItems), [menuItems]);
  const currentPath = router?.asPath || '';
  const activeMenuHref = useMemo(
    () => getActiveWorldMenuHref(currentPath, linkables),
    [currentPath, linkables],
  );

  const groupHasActiveRoute = useCallback(
    (group) => group.items.some(({ item }) => item?.href && item.href === activeMenuHref),
    [activeMenuHref],
  );

  const isCollapsed = useCallback((group, groupIdx) => {
    if (!group.label) return false;
    if (Object.prototype.hasOwnProperty.call(collapseOverrides, group.label)) {
      return !!collapseOverrides[group.label];
    }
    if (!autoCollapse) return false;
    // Long menus (>20 rows) open with only the first two sections expanded so
    // the drawer is scannable on a 667px screen; everything else is one tap or
    // one search away, and the choice persists per menu.
    const firstLabeled = groups.findIndex((g) => g.label);
    if (firstLabeled >= 0 && groupIdx <= firstLabeled + 1) return false;
    return !groupHasActiveRoute(group);
  }, [collapseOverrides, autoCollapse, groups, groupHasActiveRoute]);

  const toggleSection = (label) => {
    setCollapseOverrides((prev) => {
      const wasCollapsed = Object.prototype.hasOwnProperty.call(prev, label)
        ? !!prev[label]
        : autoCollapse;
      const next = { ...prev, [label]: !wasCollapsed };
      lsSet(`sp-menu-collapsed:${storeKey}`, next);
      return next;
    });
  };

  const toggleFav = (href) => {
    if (!href) return;
    setFavs((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href].slice(-8);
      lsSet(`sp-menu-favs:${storeKey}`, next);
      return next;
    });
  };

  const rememberRecent = useCallback((item) => {
    if (!item?.href) return;
    const entry = { href: item.href, label: labelOf(item) };
    if (!entry.label) return;
    const next = [entry, ...(lsGet('sp-menu-recents', []) || []).filter((r) => r?.href !== entry.href)]
      .slice(0, 5);
    lsSet('sp-menu-recents', next);
    setRecents(next);
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out = [];
    (menuItems || []).forEach((item, index) => {
      if (item?.type === 'grid') {
        (item.items || []).forEach((g, gi) => {
          if (`${labelOf(g)} ${g?.description || ''}`.toLowerCase().includes(q)) {
            out.push({
              item: { type: g.href ? 'navigation' : 'action', label: g.label, href: g.href, icon: g.icon, onClick: g.onClick, hardNav: g.hardNav },
              index: `g-${index}-${gi}`,
            });
          }
        });
        return;
      }
      if (!ACTIONABLE.has(item?.type)) return;
      if (`${labelOf(item)} ${item?.description || ''}`.toLowerCase().includes(q)) out.push({ item, index });
    });
    return out;
  }, [query, menuItems]);

  const favItems = useMemo(
    () => favs.map((href) => linkables.find((l) => l.href === href)).filter(Boolean),
    [favs, linkables],
  );

  const recentItems = useMemo(
    () => (recents || [])
      .filter((r) => r?.href && parseWorldMenuHref(r.href).pathname !== parseWorldMenuHref(currentPath).pathname)
      .slice(0, 4),
    [recents, currentPath],
  );

  // Offline is ADVISORY, not a lock. This is an installed PWA: the service
  // worker serves cached routes, so hard-disabling every link offline made the
  // whole menu dead. Destinations that genuinely need the network opt in with
  // `requiresNetwork: true` and only those are blocked.
  const isBlockedOffline = useCallback(
    (item) => !online && !!item?.requiresNetwork,
    [online],
  );

  const beginNavigation = useCallback((event, item) => {
    const decision = evaluateWorldMenuActivation({
      event,
      href: item?.href,
      lock: navigationLockRef.current,
    });
    if (!decision.allow) {
      event?.preventDefault?.();
      return decision;
    }
    if (decision.modified) return decision;

    navigationLockRef.current = decision.nextLock;
    setPendingHref(item?.href || '');
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    navigationTimerRef.current = setTimeout(() => {
      navigationLockRef.current = null;
      setPendingHref('');
    }, 1_200);
    return decision;
  }, []);

  // ── Row renderers ─────────────────────────────────────────────────────────
  const rowBase = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minHeight: 52,
    padding: '8px 16px',
    boxSizing: 'border-box',
    textDecoration: 'none',
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 15,
    textAlign: 'left',
    cursor: 'pointer',
  };

  const renderNavigation = (item, key) => {
    const isCurrent = item.href && item.href === activeMenuHref;
    const pinned = favs.includes(item.href);
    const disabled = isBlockedOffline(item);
    const content = (
      <>
        {/* Reserve the icon slot so every label shares one left edge */}
        <span
          aria-hidden="true"
          style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.danger ? colors.danger : 'inherit' }}
        >
          {item.icon || null}
        </span>
        <span className="sp-menu-row-copy" style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{item.label}</span>
          {item.description ? (
            <span style={{ display: 'block', marginTop: 3, color: colors.textSec, fontSize: 11, lineHeight: 1.3 }}>
              {item.description}
            </span>
          ) : null}
        </span>
        {item.badge ? (
          <span
            style={{
              background: colors.blue, color: '#fff', borderRadius: 10,
              minWidth: 20, height: 20, padding: '0 6px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}
          >
            {Number(item.badge) > 99 ? '99+' : item.badge}
          </span>
        ) : null}
        {editFavs ? (
          <Star
            size={18}
            aria-hidden="true"
            fill={pinned ? colors.blue : 'none'}
            color={pinned ? colors.blue : colors.textSec}
          />
        ) : (
          <ChevronRight size={16} aria-hidden="true" color={colors.textSec} />
        )}
      </>
    );

    const style = {
      ...rowBase,
      color: item.danger ? colors.danger : colors.text,
      background: isCurrent && !editFavs ? colors.hoverBg : 'transparent',
      opacity: disabled ? 0.45 : 1,
      ...(item.danger ? { marginTop: 8, borderTop: `1px solid ${colors.border}`, borderRadius: 0, paddingTop: 16 } : null),
    };

    const onActivate = (e) => {
      if (editFavs) {
        e.preventDefault();
        toggleFav(item.href);
        return;
      }
      if (disabled) { e.preventDefault(); return; }
      const activation = beginNavigation(e, item);
      if (!activation.allow || activation.modified) return;
      if (item.onClick) item.onClick();
      rememberRecent(item);
      onClose?.();
    };

    const aria = {
      'aria-current': isCurrent ? 'page' : undefined,
      'aria-disabled': disabled ? 'true' : undefined,
      'aria-busy': pendingHref === item.href ? 'true' : undefined,
      'data-command-pending': pendingHref === item.href ? 'true' : undefined,
      'aria-label': editFavs
        ? `${pinned ? 'Unpin' : 'Pin'} ${item.label}`
        : (item.badge ? `${item.label}, ${item.badge} new` : undefined),
    };

    if (editFavs) {
      return (
        <button key={key} type="button" className="sp-menu-row" style={style} onClick={onActivate} {...aria}>
          {content}
        </button>
      );
    }
    if (needsHardNav(item)) {
      return (
        <a key={key} href={item.href} className="sp-menu-row" style={style} onClick={onActivate} {...aria}>
          {content}
        </a>
      );
    }
    return (
      <Link key={key} href={item.href} prefetch={false} className="sp-menu-row" style={style} onClick={onActivate} {...aria}>
        {content}
      </Link>
    );
  };

  const renderMenuItem = (item, key) => {
    switch (item?.type) {
      case 'navigation':
        if (!item.href) return null;
        return renderNavigation(item, key);

      case 'toggle': {
        const isUnavailable = typeof item.onChange !== 'function';
        if (isUnavailable) return null;
        const hintId = item.hint ? `sp-hint-${String(key).replace(/[^a-zA-Z0-9]/g, '')}` : undefined;
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={!!item.checked}
            aria-label={item.label}
            aria-describedby={hintId}
            className="sp-menu-row"
            onClick={() => item.onChange(!item.checked)}
            style={{ ...rowBase, color: colors.text, alignItems: 'center' }}
          >
            <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon || null}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{item.label}</span>
              {item.hint ? (
                <span id={hintId} style={{ fontSize: 12, lineHeight: 1.35, color: colors.textSec }}>
                  {item.hint}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              style={{
                width: 52, height: 28, borderRadius: 999, padding: 2, flexShrink: 0,
                backgroundColor: item.checked ? '#22C55E' : '#64748b',
                transition: reduceMotion ? 'none' : 'background-color .2s ease',
                display: 'flex', alignItems: 'center', boxSizing: 'border-box',
              }}
            >
              <span
                style={{
                  width: 24, height: 24, borderRadius: '50%', backgroundColor: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transform: item.checked ? 'translateX(24px)' : 'translateX(0)',
                  transition: reduceMotion ? 'none' : 'transform .2s ease',
                }}
              />
            </span>
          </button>
        );
      }

      case 'action': {
        const isStub = typeof item.onClick !== 'function' && !item.openInviteModal && !item.href;
        if (isStub) return null;
        const isFlat = item.variant === 'flat' || item.noBorder;
        return (
          <button
            key={key}
            type="button"
            className="sp-menu-row"
            onClick={() => {
              if (item.openInviteModal) {
                onClose?.();
                setShowInviteModal(true);
                return;
              }
              if (typeof item.onClick === 'function') item.onClick();
              if (item.closeOnClick !== false) onClose?.();
            }}
            style={{
              ...rowBase,
              padding: isFlat ? '10px 0' : '8px 16px',
              background: item.primary ? colors.blue : 'transparent',
              border: item.primary || isFlat ? '1px solid transparent' : `1px solid ${colors.border}`,
              borderRadius: isFlat ? 0 : 8,
              color: item.primary ? '#fff' : colors.text,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon || null}
            </span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontWeight: 500 }}>{item.label}</span>
          </button>
        );
      }

      case 'divider':
        return <div key={key} style={{ height: 1, background: colors.border, margin: '12px 16px' }} />;

      case 'grid': {
        const activeGridHref = getActiveWorldMenuHref(currentPath, item.items || []);
        return (
          <div
            key={key}
            data-world-primary-commands={item.worldPrimary ? activeWorld?.id : undefined}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${item.columns || 2}, minmax(0, 1fr))`,
              gap: 8,
              padding: '0 16px',
              marginBottom: 16,
            }}
          >
            {(item.items || []).map((gridItem, gridIndex) => {
              const isCurrentGridItem = Boolean(gridItem.href && gridItem.href === activeGridHref);
              const isPendingGridItem = Boolean(gridItem.href && gridItem.href === pendingHref);
              const tileStyle = {
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                justifyContent: 'center', gap: 6,
                minHeight: 84, padding: '12px 11px', minWidth: 0,
                background: colors.tileBg, borderRadius: 3, textDecoration: 'none',
                border: `1px solid ${colors.border}`, color: colors.text,
                fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
                boxSizing: 'border-box', fontFamily: 'inherit',
              };
              const iconSlot = gridItem.icon ? (
                <span aria-hidden="true" style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {gridItem.icon}
                </span>
              ) : null;
              const labelSlot = (
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: colors.text, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                    {gridItem.label}
                  </span>
                  {gridItem.description ? (
                    <span style={{ display: 'block', marginTop: 4, color: colors.textSec, fontSize: 10, lineHeight: 1.25 }}>
                      {gridItem.description}
                    </span>
                  ) : null}
                </span>
              );

              if (!gridItem.href) {
                const stub = typeof gridItem.onClick !== 'function';
                if (stub) return null;
                return (
                  <button
                    key={gridIndex}
                    type="button"
                    className="sp-grid-tile"
                    onClick={() => {
                      gridItem.onClick();
                      onClose?.();
                    }}
                    style={{ ...tileStyle, cursor: 'pointer' }}
                  >
                    {iconSlot}
                    {labelSlot}
                  </button>
                );
              }

              const tileBlocked = isBlockedOffline(gridItem);
              const onTile = (e) => {
                if (tileBlocked) { e.preventDefault(); return; }
                const activation = beginNavigation(e, gridItem);
                if (!activation.allow || activation.modified) return;
                if (gridItem.onClick) gridItem.onClick();
                rememberRecent(gridItem);
                onClose?.();
              };
              if (needsHardNav(gridItem)) {
                return (
                  <a key={gridIndex} href={gridItem.href} className="sp-grid-tile" style={{ ...tileStyle, opacity: tileBlocked ? 0.45 : 1 }} onClick={onTile} aria-disabled={tileBlocked ? 'true' : undefined} aria-current={isCurrentGridItem ? 'page' : undefined} aria-busy={isPendingGridItem ? 'true' : undefined} data-command-target={gridItem.href} data-command-pending={isPendingGridItem ? 'true' : undefined}>
                    {iconSlot}
                    {labelSlot}
                  </a>
                );
              }
              return (
                <Link
                  key={gridIndex}
                  href={gridItem.href}
                  prefetch={false}
                  className="sp-grid-tile"
                  style={{ ...tileStyle, opacity: tileBlocked ? 0.45 : 1 }}
                  onClick={onTile}
                  aria-disabled={tileBlocked ? 'true' : undefined}
                  aria-current={isCurrentGridItem ? 'page' : undefined}
                  aria-busy={isPendingGridItem ? 'true' : undefined}
                  data-command-target={gridItem.href}
                  data-command-pending={isPendingGridItem ? 'true' : undefined}
                >
                  {iconSlot}
                  {labelSlot}
                </Link>
              );
            })}
          </div>
        );
      }

      default:
        return null;
    }
  };

  const renderSectionTitle = (label, extra = null) => (
    <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 13, fontWeight: 700, color: colors.textSec, margin: 0,
          textTransform: 'uppercase', letterSpacing: '0.6px', flex: 1, minWidth: 0,
        }}
      >
        {label}
      </span>
      {extra}
    </div>
  );

  // ── Bottom links (single source of truth for sign-out) ────────────────────
  const finalLinks = useMemo(() => {
    const links = [...(bottomLinks || [])];
    const hasSignOut = [...links, ...(menuItems || [])].some(
      (i) => matchesId(i, 'sign-out') || looksLikeSignOut(i),
    );
    if (!hasSignOut) {
      links.push({
        id: 'sign-out',
        label: 'Log Out',
        action: true,
        onClick: handleLogout,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        ),
      });
    }
    return links;
  }, [bottomLinks, menuItems, handleLogout]);

  const shortcutItems = useMemo(() => {
    if (shortcuts && shortcuts.length > 0) return shortcuts;
    return (ownedPages || []).map((p) => ({
      id: p.id,
      name: p.name,
      avatar_url: p.avatar_url,
      href:
        p.page_type === 'home_game'
          // audit 2026-08-14: `p.slug || p.id` pushed a social_pages.id into
          // the slug-only route — a 404. homeGamePageUrl falls back to
          // /hub/social-pages/<id>, which SSR-resolves and redirects.
          ? homeGamePageUrl(p)
          : p.page_type === 'club'
            ? '/hub/commander'
            : `/hub/social-pages/${p.id}`,
      isArena: p.page_type === 'club',
      page: p,
    }));
  }, [shortcuts, ownedPages]);

  const searching = !!(searchResults && query.trim());

  return (
    <>
      {/* Backdrop — always mounted so it can fade in step with the drawer */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="sp-command-backdrop"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 2, 5, 0.86)',
          zIndex: 10099,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          visibility: isOpen ? 'visible' : 'hidden',
          transition: reduceMotion ? 'none' : 'opacity .3s ease, visibility .3s ease',
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="sp-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${activeWorld?.label || 'Smarter.Poker'} Command Menu`}
        aria-busy={pendingHref ? 'true' : 'false'}
        data-world-command-menu={activeWorld?.id || 'global'}
        data-menu-symbol="command-grid"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={trapTab}
        style={{
          position: 'fixed',
          top: 0,
          // `bottom: 0` is the load-bearing constraint. Engines without `dvh`
          // (iOS Safari < 15.4, Chrome < 108) drop the height declaration
          // entirely, and a fixed element with height:auto never scrolls — the
          // Geeves widget, Report Bug and Log Out became unreachable.
          bottom: 0,
          [direction]: 0,
          width: '100%',
          maxWidth: `min(${Math.max(width, 400)}px, 100vw)`,
          height: '100dvh',
          maxHeight: '100dvh',
          background: colors.bg,
          borderRight: `1px solid ${colors.border}`,
          boxShadow:
            direction === 'left' ? '2px 0 10px rgba(0,0,0,0.2)' : '-4px 0 20px rgba(0, 0, 0, 0.5)',
          zIndex: 10100,
          transform: isOpen
            ? 'translateX(0)'
            : direction === 'left'
              ? 'translateX(-100%)'
              : 'translateX(100%)',
          transition: reduceMotion ? 'none' : 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
          // When closed, remove from hit-testing entirely so the off-screen
          // fixed drawer cannot capture wheel events on desktop.
          pointerEvents: isOpen ? 'auto' : 'none',
          visibility: isOpen ? 'visible' : 'hidden',
          '--world-accent': worldAccent,
        }}
      >
        {/* World command identity and utilities. The symbol is a six-node
            command grid. The approved header hamburger remains the menu trigger. */}
        <div className="sp-command-utility-rail" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px 9px' }}>
          <div className="sp-command-brand">
            <span className="sp-command-grid-mark" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
            </span>
            <span>
              <span className="sp-command-eyebrow">World Command</span>
              <strong className="sp-command-title">{activeWorld?.label || 'Smarter.Poker'}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <button
            type="button"
            className="sp-command-utility-button"
            onClick={() => setEditFavs((v) => !v)}
            aria-pressed={editFavs}
            aria-label={editFavs ? 'Done pinning menu items' : 'Pin menu items to favourites'}
            style={{
              width: 44, height: 44, borderRadius: 3, border: `1px solid ${colors.border}`, padding: 0,
              background: editFavs ? colors.blue : ((theme === 'light' || isFacebookMenu) ? '#f0f0f0' : 'rgba(255,255,255,0.1)'),
              color: editFavs ? '#fff' : colors.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            {editFavs ? <Star size={18} aria-hidden="true" /> : <Pencil size={18} aria-hidden="true" />}
          </button>
          <button
            ref={closeBtnRef}
            type="button"
            className="sp-command-utility-button"
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 72, height: 44, borderRadius: 3, border: `1px solid ${colors.border}`, padding: 0,
              background: (theme === 'light' || isFacebookMenu) ? '#f0f0f0' : 'rgba(255, 255, 255, 0.1)',
              color: colors.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={18} aria-hidden="true" />
            <span className="sp-command-close-label">Close</span>
          </button>
          </div>
        </div>

        {activeWorld ? (
          <div className="sp-command-context" style={{ '--world-accent': worldAccent }}>
            <span className="sp-command-status"><i aria-hidden="true" />{online ? 'Connected' : 'Offline Cache'}</span>
            <p>{activeWorld.purpose}</p>
          </div>
        ) : null}

        {/* Offline banner */}
        {!online && (
          <div
            role="status"
            style={{
              margin: '0 16px 12px', padding: '10px 12px', borderRadius: 8,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              color: colors.text, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <WifiOff size={18} aria-hidden="true" color={colors.danger} />
            <span style={{ minWidth: 0 }}>You Are Offline. Cached Pages Still Open - Anything That Needs The Network Will Wait.</span>
          </div>
        )}

        {/* Search */}
        {showSearch && (
          <div className="sp-command-search" style={{ padding: '0 14px 12px', position: 'sticky', top: 0, zIndex: 4, background: colors.bg }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={18} aria-hidden="true" color={colors.textSec} style={{ position: 'absolute', left: 12 }} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu"
                aria-label="Search menu"
                style={{
                  width: '100%', minHeight: 44, boxSizing: 'border-box',
                  padding: '0 40px 0 38px', borderRadius: 8,
                  border: `1px solid ${colors.border}`, background: colors.inputBg,
                  color: colors.text, fontSize: 16, fontFamily: 'inherit',
                }}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="sp-icon-btn"
                  style={{
                    position: 'absolute', right: 0, width: 44, height: 44, borderRadius: '50%',
                    border: 'none', background: 'transparent', color: colors.textSec,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {searching ? (
          <div style={{ flex: 1 }}>
            {searchResults.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.textSec, fontSize: 14, lineHeight: 1.45 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
                  No Matches
                </div>
                Nothing In This Menu Matches &ldquo;{query.trim()}&rdquo;. Try A Shorter Word.
              </div>
            ) : (
              <div role="group" aria-label="Search results">
                {searchResults.map(({ item, index }) => renderMenuItem(item, `s-${index}`))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── YOUR SHORTCUTS — ALWAYS FIRST ── */}
            {shortcutItems.length > 0 && (
              <div>
                {renderSectionTitle('Your Shortcuts')}
                <div
                  data-hscroll="true"
                  style={{
                    display: 'flex', gap: 12, overflowX: 'auto',
                    padding: '0 16px 16px',
                    scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {shortcutItems.slice(0, 6).map((sc) => {
                    const initial = (sc.name || '?').charAt(0).toUpperCase();
                    const inner = (
                      <>
                        <div
                          style={{
                            width: 56, height: 56, margin: '0 auto', borderRadius: 12,
                            background: 'linear-gradient(135deg, #1e3a5f 0%, #0e2440 100%)',
                            border: `2px solid ${colors.border}`,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0,
                            position: 'relative', overflow: 'hidden',
                          }}
                        >
                          <span aria-hidden="true">{initial}</span>
                          {sc.avatar_url ? (
                            <img
                              src={sc.avatar_url}
                              alt=""
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontSize: 12, marginTop: 6, color: colors.textSec,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            maxWidth: 72,
                          }}
                        >
                          {sc.name}
                        </div>
                      </>
                    );
                    const tileStyle = {
                      textAlign: 'center', textDecoration: 'none', color: 'inherit',
                      flexShrink: 0, width: 72, scrollSnapAlign: 'start',
                    };
                    if (sc.isArena) {
                      return (
                        <a
                          key={sc.id}
                          href={sc.href}
                          className="sp-sc-tile"
                          aria-label={`Open ${sc.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            if (sc.page) switchToClub(sc.page);
                            onClose?.();
                            window.location.href = sc.href;
                          }}
                          style={tileStyle}
                        >
                          {inner}
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={sc.id}
                        href={sc.href}
                        prefetch={false}
                        className="sp-sc-tile"
                        aria-label={`Open ${sc.name}`}
                        onClick={() => {
                          if (sc.page) switchToClub(sc.page);
                          onClose?.();
                        }}
                        style={tileStyle}
                      >
                        {inner}
                      </Link>
                    );
                  })}
                  {shortcutItems.length > 6 && (
                    <Link
                      href="/hub/social-pages"
                      prefetch={false}
                      className="sp-sc-tile"
                      aria-label="See all your pages"
                      onClick={() => onClose?.()}
                      style={{
                        textAlign: 'center', textDecoration: 'none', color: colors.textSec,
                        flexShrink: 0, width: 72, scrollSnapAlign: 'start',
                      }}
                    >
                      <div
                        style={{
                          width: 56, height: 56, margin: '0 auto', borderRadius: 12,
                          border: `2px dashed ${colors.border}`, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: colors.textSec,
                        }}
                      >
                        <ChevronRight size={20} aria-hidden="true" />
                      </div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>See All</div>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Active Identity Switcher */}
            {showProfile && activeUser && (
              <div
                style={{
                  margin: '0 12px 16px',
                  background: (theme === 'light' || isFacebookMenu) ? colors.bg : colors.cardBg,
                  borderRadius: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  border: `1px solid ${colors.border}`,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderBottom: ownedPages.length > 0 ? `1px solid ${colors.border}` : 'none',
                  }}
                >
                  <img
                    src={
                      isClubMode && clubPage
                        ? clubPage.avatar_url || FALLBACK_AVATAR
                        : activeUser.avatar || FALLBACK_AVATAR
                    }
                    alt=""
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_AVATAR; }}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700, fontSize: 16, color: isClubMode ? colors.blue : colors.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {isClubMode && clubPage ? clubPage.name : activeUser.name}
                    </div>
                    <Link
                      href={isClubMode && clubPage ? `/hub/social-pages/${clubPage.id}` : '/hub/profile'}
                      prefetch={false}
                      onClick={() => onClose?.()}
                      className="sp-menu-row"
                      style={{
                        display: 'inline-flex', alignItems: 'center', minHeight: 32,
                        fontSize: 13, color: colors.textSec, textDecoration: 'none',
                      }}
                    >
                      View Profile
                    </Link>
                  </div>
                  {(() => {
                    const unread = (notifications || []).filter((n) => !n.read).length;
                    if (!unread || isClubMode) return null;
                    return (
                      <div
                        aria-label={`${unread} unread notifications`}
                        role="status"
                        style={{
                          background: colors.blue, color: '#fff', borderRadius: 999,
                          minWidth: 24, height: 24, padding: '0 6px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}
                      >
                        {unread > 9 ? '9+' : unread}
                      </div>
                    );
                  })()}
                </div>

                {/* Switch Options */}
                {ownedPages.length > 0 && (
                  <div
                    style={{
                      background: (theme === 'light' || isFacebookMenu) ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.2)',
                      padding: '8px 0',
                    }}
                  >
                    <div style={{ padding: '0 16px 8px', fontSize: 12, fontWeight: 700, color: colors.textSec, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Switch Account
                    </div>

                    {isClubMode && (
                      <button
                        type="button"
                        className="sp-menu-row"
                        onClick={() => { switchToPersonal(); onClose?.(); }}
                        style={{ ...rowBase, minHeight: 48, color: colors.text }}
                      >
                        <img
                          src={activeUser.avatar || FALLBACK_AVATAR}
                          alt=""
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_AVATAR; }}
                          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, textAlign: 'left' }}>
                          {activeUser.name} (Personal)
                        </span>
                      </button>
                    )}

                    {ownedPages.map((page) => {
                      if (isClubMode && clubPage?.id === page.id) return null;
                      return (
                        <button
                          key={page.id}
                          type="button"
                          className="sp-menu-row"
                          onClick={() => {
                            switchToClub(page);
                            onClose?.();
                            if (page.page_type === 'home_game') {
                              router.push(homeGamePageUrl(page)); // audit 2026-08-14: was slug||id into the slug route
                            } else if (page.page_type === 'club') {
                              window.location.href = '/hub/commander';
                            } else {
                              router.push(`/hub/social-pages/${page.id}`);
                            }
                          }}
                          style={{ ...rowBase, minHeight: 48, color: colors.text }}
                        >
                          <img
                            src={page.avatar_url || FALLBACK_AVATAR}
                            alt=""
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_AVATAR; }}
                            style={{
                              width: 32, height: 32, borderRadius: '50%', objectFit: 'cover',
                              background: (theme === 'light' || isFacebookMenu) ? '#eee' : '#333', flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, textAlign: 'left' }}>
                            {page.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Profile Extras (e.g., Poker Resume) */}
            {profileExtras}

            {/* Favourites */}
            {(favItems.length > 0 || editFavs) && (
              <div role="group" aria-label="Favourites">
                {renderSectionTitle('Favourites')}
                {favItems.length === 0 ? (
                  <div style={{ padding: '0 16px 12px', fontSize: 13, color: colors.textSec, lineHeight: 1.45 }}>
                    Tap Any Link Below To Pin It Here, Then Tap The Star Button Again When You Are Done.
                  </div>
                ) : (
                  favItems.map((item, i) => renderNavigation(item, `fav-${i}`))
                )}
              </div>
            )}

            {/* Jump back in */}
            {recentItems.length > 0 && !editFavs && (
              <div role="group" aria-label="Recently visited">
                {renderSectionTitle('Jump Back In')}
                {recentItems.map((r, i) =>
                  renderNavigation(
                    { type: 'navigation', label: r.label, href: r.href, icon: <Clock size={18} aria-hidden="true" /> },
                    `rec-${i}`,
                  ),
                )}
              </div>
            )}

            {/* Menu Items */}
            <div style={{ flex: 1 }}>
              {groups.map((group, gi) => {
                if (!group.label) {
                  return (
                    <div key={group.key}>
                      {group.items.map(({ item, index }) => renderMenuItem(item, index))}
                    </div>
                  );
                }
                const collapsed = isCollapsed(group, gi);
                const panelId = `sp-sec-${gi}`;
                return (
                  <div key={group.key} role="group" aria-label={group.label}>
                    <button
                      type="button"
                      className="sp-menu-row"
                      onClick={() => toggleSection(group.label)}
                      aria-expanded={!collapsed}
                      aria-controls={panelId}
                      style={{
                        ...rowBase,
                        minHeight: 44,
                        padding: '10px 16px',
                        marginTop: gi > 0 ? 4 : 0,
                        color: colors.textSec,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'left' }}>
                        {group.label}
                      </span>
                      {collapsed
                        ? <ChevronRight size={16} aria-hidden="true" />
                        : <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                    {!collapsed && (
                      <div id={panelId}>
                        {group.items.map(({ item, index }) => renderMenuItem(item, index))}
                      </div>
                    )}
                  </div>
                );
              })}

              {menuItems.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.textSec, fontSize: 14, lineHeight: 1.45 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
                    Nothing Here Yet
                  </div>
                  Use The Links Below To Get Back To The Hub.
                </div>
              )}

            </div>
          </>
        )}

        {/* Geeves AI Help + Report Bug — mounted only after the first open, and
            kept mounted (hidden) during search so they never refetch. */}
        {everOpened && (
          <div style={{ display: searching ? 'none' : 'block' }}>
            <GeevesMenuWidget />
            <div style={{ padding: '8px 16px' }}>
              <ReportBugWidget />
            </div>
          </div>
        )}

        {/* Bottom Links */}
        {finalLinks.length > 0 && !searching && (
          <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${colors.border}` }}>
            {finalLinks.map((link, index) => {
              const commonStyle = {
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                minHeight: 48, padding: '10px 0', boxSizing: 'border-box',
                textDecoration: 'none', color: colors.text,
                borderTop: index > 0 ? `1px solid ${colors.border}` : 'none',
                fontSize: 15, fontFamily: 'inherit', textAlign: 'left',
              };
              const iconSlot = (
                <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {link.icon || null}
                </span>
              );

              if (link.action || link.openInviteModal) {
                const stub = typeof link.onClick !== 'function' && !link.openInviteModal;
                if (stub) return null;
                return (
                  <button
                    key={index}
                    type="button"
                    className="sp-menu-row"
                    onClick={() => {
                      if (link.openInviteModal) {
                        onClose?.();
                        setShowInviteModal(true);
                        return;
                      }
                      if (typeof link.onClick === 'function') link.onClick();
                      onClose?.();
                    }}
                    style={{ ...commonStyle, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {iconSlot}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, textAlign: 'left' }}>{link.label}</span>
                    <ChevronRight size={16} aria-hidden="true" color={colors.textSec} />
                  </button>
                );
              }

              if (needsHardNav(link)) {
                return (
                  <a key={index} href={link.href} className="sp-menu-row" onClick={() => onClose?.()} style={commonStyle}>
                    {iconSlot}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{link.label}</span>
                    <ChevronRight size={16} aria-hidden="true" color={colors.textSec} />
                  </a>
                );
              }

              return (
                <Link
                  key={index}
                  href={link.href}
                  prefetch={false}
                  className="sp-menu-row"
                  onClick={() => { rememberRecent(link); onClose?.(); }}
                  style={commonStyle}
                >
                  {iconSlot}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{link.label}</span>
                  <ChevronRight size={16} aria-hidden="true" color={colors.textSec} />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Invite Friends Modal — rendered outside the drawer's stacking context */}
      {everOpened && (
        <div style={{ position: 'relative', zIndex: 10200 }}>
          <InviteFriendsModal
            isOpen={showInviteModal}
            onClose={() => setShowInviteModal(false)}
            user={activeUser}
          />
        </div>
      )}

      {/* Raw <style> injection, NOT styled-jsx. A large global styled-jsx block on
          this surface deadlocked the SWC compiler for 45 minutes and broke production
          deploys (maintainer fix 17409efc08). Never reintroduce styled-jsx here.
          The CSS is emitted verbatim and unscoped, exactly as `<style jsx global>`
          emitted it — but styled-jsx hoisted global styles into <head> and this tag
          renders inline in the body, so these rules now sit later in the cascade and
          win same-specificity ties against head stylesheets they used to lose. If a
          rule ever needs to lose such a tie, bump the other rule's specificity
          explicitly instead of relying on document order. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sp-command-backdrop {
          backdrop-filter: blur(7px) saturate(.72);
          -webkit-backdrop-filter: blur(7px) saturate(.72);
        }
        .sp-drawer {
          isolation: isolate;
          overflow-x: hidden !important;
          background:
            linear-gradient(90deg, rgba(255,255,255,.045), transparent 2px),
            repeating-linear-gradient(135deg, rgba(255,255,255,.018) 0, rgba(255,255,255,.018) 1px, transparent 1px, transparent 5px),
            linear-gradient(180deg, rgba(5,10,15,.99), rgba(1,4,7,.995)) !important;
          box-shadow: 14px 0 48px rgba(0,0,0,.82), inset -12px 0 26px rgba(0,0,0,.5) !important;
          font-family: var(--font-inter), Inter, system-ui, sans-serif;
        }
        .sp-drawer::after {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: min(400px, 100vw);
          height: 2px;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, #d6e1ea 18%, var(--world-accent, #2e9bff) 50%, #d6e1ea 82%, transparent);
          box-shadow: 0 0 14px color-mix(in srgb, var(--world-accent, #2e9bff) 70%, transparent);
          z-index: 8;
        }
        .sp-command-utility-rail {
          position: sticky;
          top: 0;
          z-index: 6;
          min-height: 64px;
          background: linear-gradient(180deg, #070b10 74%, rgba(7,11,16,.86));
          border-bottom: 1px solid rgba(179,198,215,.16);
        }
        .sp-command-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .sp-command-grid-mark {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          display: grid;
          grid-template-columns: repeat(2, 8px);
          grid-template-rows: repeat(3, 8px);
          place-content: center;
          gap: 2px;
          border: 1px solid rgba(198,214,227,.48);
          border-radius: 3px;
          background: linear-gradient(145deg, #1a232c, #05080c);
          box-shadow: inset 0 1px rgba(255,255,255,.12), 0 0 12px rgba(46,155,255,.18);
        }
        .sp-command-grid-mark i {
          display: block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--world-accent, #2e9bff);
          box-shadow: inset 0 1px rgba(255,255,255,.6), 0 0 6px var(--world-accent, #2e9bff);
        }
        .sp-command-eyebrow, .sp-command-title { display: block; line-height: 1; }
        .sp-command-eyebrow {
          margin-bottom: 5px;
          color: #718395;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .2em;
          text-transform: uppercase;
        }
        .sp-command-title {
          overflow: hidden;
          color: #eef5fb;
          font-family: var(--font-rajdhani), Rajdhani, sans-serif;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: .08em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .sp-command-close-label { margin-left: 5px; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .sp-command-context {
          --world-accent: #2e9bff;
          margin: 10px 12px 12px;
          padding: 10px 12px;
          border: 1px solid rgba(150,173,194,.28);
          border-radius: 3px;
          background: linear-gradient(145deg, rgba(17,27,36,.97), rgba(3,7,11,.99));
          box-shadow: inset 0 1px rgba(255,255,255,.045);
        }
        .sp-command-context p { margin: 7px 0 0; color: #8fa0b2; font-size: 11px; line-height: 1.35; }
        .sp-command-status { display: flex; align-items: center; gap: 7px; color: #9fb0bf; font-size: 9px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
        .sp-command-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--world-accent); box-shadow: 0 0 9px var(--world-accent); }
        .sp-command-search input { border-radius: 2px !important; }
        .sp-menu-row,
        .sp-grid-tile,
        .sp-sc-tile,
        .sp-icon-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: background 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
        }
        .sp-menu-row {
          width: calc(100% - 8px) !important;
          margin: 0 4px 3px !important;
          border: 1px solid transparent !important;
          border-radius: 2px !important;
          background: linear-gradient(90deg, rgba(18,25,32,.86), rgba(5,9,13,.74)) !important;
        }
        .sp-menu-row[aria-current='page'] {
          border-color: color-mix(in srgb, var(--world-accent, #2e9bff) 52%, transparent) !important;
          box-shadow: inset 2px 0 var(--world-accent, #2e9bff), 0 0 15px rgba(0,0,0,.28);
        }
        .sp-grid-tile {
          position: relative;
          overflow: hidden;
          border-radius: 3px !important;
          box-shadow: inset 0 1px rgba(255,255,255,.05), 0 8px 18px rgba(0,0,0,.2);
        }
        .sp-grid-tile::after {
          content: '';
          position: absolute;
          right: 10px;
          bottom: 0;
          left: 10px;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--world-accent, #2e9bff), transparent);
          opacity: .72;
        }
        .sp-grid-tile[aria-current='page'] {
          border-color: color-mix(in srgb, var(--world-accent, #2e9bff) 74%, #dbe9f5) !important;
          background: linear-gradient(145deg, color-mix(in srgb, var(--world-accent, #2e9bff) 16%, #18222b), #05090d) !important;
          box-shadow: inset 3px 0 var(--world-accent, #2e9bff), inset 0 1px rgba(255,255,255,.13), 0 0 18px color-mix(in srgb, var(--world-accent, #2e9bff) 26%, transparent);
        }
        .sp-grid-tile[aria-current='page']::after { height: 2px; opacity: 1; }
        .sp-grid-tile[data-command-pending='true'] {
          cursor: progress !important;
          filter: saturate(1.2) brightness(1.08);
        }
        /* Poker Near Me uses one continuous machined frame per control. Avoid
           intersecting inset rails and decorative edge fragments: at narrow
           raster scales those read as broken corners instead of premium trim. */
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-command-grid-mark,
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-command-context,
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-icon-btn,
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-menu-row,
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-grid-tile {
          border-style: solid !important;
          border-width: 1px !important;
          border-radius: 3px !important;
          outline: 0;
        }
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-command-grid-mark,
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-command-context,
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-icon-btn {
          border-color: rgba(164, 188, 207, .34) !important;
          background: #0a1118 !important;
          box-shadow: inset 0 1px rgba(255, 255, 255, .055) !important;
        }
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-menu-row,
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-grid-tile {
          border-color: rgba(151, 177, 198, .28) !important;
          background: #090f15 !important;
          box-shadow: inset 0 1px rgba(255, 255, 255, .04), 0 8px 18px rgba(0, 0, 0, .22) !important;
        }
        .sp-drawer[data-world-command-menu='poker-near-me'] .sp-grid-tile::after {
          content: none;
        }
        .sp-drawer[data-world-command-menu='poker-near-me'] :is(.sp-menu-row, .sp-grid-tile)[aria-current='page'] {
          border-color: #48c7ff !important;
          background: #0a1822 !important;
          box-shadow: inset 0 0 0 1px rgba(72, 199, 255, .12), 0 8px 22px rgba(0, 0, 0, .3) !important;
        }
        .sp-drawer[data-world-command-menu='poker-near-me'] :is(.sp-menu-row, .sp-grid-tile, .sp-icon-btn):focus-visible {
          outline: 2px solid #78d8ff;
          outline-offset: 2px;
          border-radius: 3px;
        }
        .sp-drawer[data-world-command-menu='social-media'] {
          background:
            linear-gradient(90deg, rgba(24,119,242,.045), transparent 2px),
            linear-gradient(180deg, #ffffff, #f7f9fc) !important;
          box-shadow: 14px 0 44px rgba(13, 40, 77, .28), inset -1px 0 #dadde1 !important;
        }
        .sp-drawer[data-world-command-menu='social-media'] .sp-command-utility-rail {
          background: linear-gradient(180deg, #ffffff 74%, rgba(255,255,255,.92));
          border-bottom-color: #dadde1;
        }
        .sp-drawer[data-world-command-menu='social-media'] .sp-command-grid-mark {
          border-color: #b8c7db;
          background: linear-gradient(145deg, #ffffff, #e7f3ff);
          box-shadow: inset 0 1px #ffffff, 0 0 12px rgba(24,119,242,.2);
        }
        .sp-drawer[data-world-command-menu='social-media'] .sp-command-eyebrow { color: #65676b; }
        .sp-drawer[data-world-command-menu='social-media'] .sp-command-title { color: #050505; }
        .sp-drawer[data-world-command-menu='social-media'] .sp-command-context {
          border-color: #b8d7ff;
          background: linear-gradient(145deg, #f7fbff, #e7f3ff);
          box-shadow: inset 0 1px #ffffff;
        }
        .sp-drawer[data-world-command-menu='social-media'] .sp-command-context p,
        .sp-drawer[data-world-command-menu='social-media'] .sp-command-status { color: #4b4f56; }
        .sp-drawer[data-world-command-menu='social-media'] .sp-menu-row {
          background: linear-gradient(90deg, #ffffff, #f0f2f5) !important;
        }
        @media (hover: hover) {
          .sp-drawer[data-world-command-menu='social-media'] .sp-menu-row:hover {
            background: #e7f3ff !important;
          }
        }
        .sp-menu-row:active,
        .sp-icon-btn:active { transform: scale(0.985); filter: brightness(1.08); }
        .sp-grid-tile:active,
        .sp-sc-tile:active { transform: scale(0.97); filter: brightness(1.08); }
        .sp-menu-row:focus-visible,
        .sp-grid-tile:focus-visible,
        .sp-sc-tile:focus-visible,
        .sp-icon-btn:focus-visible {
          outline: 2px solid #4599FF;
          outline-offset: -2px;
          border-radius: 3px;
        }
        @media (hover: hover) {
          .sp-menu-row:hover { background: rgba(127, 148, 190, 0.14) !important; }
          .sp-grid-tile:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.18); }
        }
        @media (max-width: 420px) {
          .sp-command-title { max-width: 124px; font-size: 14px; }
          .sp-command-eyebrow { font-size: 8px; }
          .sp-command-close-label { display: none; }
          .sp-command-utility-rail .sp-icon-btn:last-child { width: 44px !important; }
        }
        .sp-drawer input[type='search']::-webkit-search-cancel-button { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .sp-drawer,
          .sp-drawer *,
          .sp-menu-row,
          .sp-grid-tile,
          .sp-sc-tile,
          .sp-icon-btn {
            transition: none !important;
            animation: none !important;
          }
          .sp-menu-row:active,
          .sp-grid-tile:active,
          .sp-sc-tile:active,
          .sp-icon-btn:active { transform: none; }
        }
      ` }} />
    </>
  );
}

export default function HamburgerMenu(props) {
  const router = useRouter();
  const currentRoute = router?.asPath || router?.pathname || '/';
  const recoveryWorld = useMemo(() => resolveWorldMenu(currentRoute), [currentRoute]);
  return (
    <WorldCommandMenuBoundary
      isOpen={props.isOpen}
      onClose={props.onClose}
      world={recoveryWorld}
      resetKey={`${props.isOpen ? 'open' : 'closed'}:${currentRoute}`}
    >
      <HamburgerMenuContent {...props} />
    </WorldCommandMenuBoundary>
  );
}
