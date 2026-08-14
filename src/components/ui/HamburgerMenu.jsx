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

export default function HamburgerMenu({
  isOpen,
  onClose,
  direction = 'left',
  theme = 'light',
  user = null,
  menuItems = [],
  showProfile = true,
  profileExtras = null,
  bottomLinks = [],
  width = 320,
  shortcuts = null, // External shortcuts array: [{ id, name, avatar_url, href, isArena, page }]
  menuKey = null,   // Optional stable key for persisting collapse/favourite state
}) {
  const router = useRouter();
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

  const [query, setQuery] = useState('');
  const [editFavs, setEditFavs] = useState(false);
  const [favs, setFavs] = useState([]);
  const [recents, setRecents] = useState([]);
  const [collapseOverrides, setCollapseOverrides] = useState({});
  const [online, setOnline] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Latch: only mount the heavy in-drawer widgets once the menu has been opened.
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => { setLocalUser(getAuthUser()); }, []);
  useEffect(() => { if (isOpen) setEverOpened(true); }, [isOpen]);

  const activeUser = user || localUser;

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
      restoreFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
      const t = setTimeout(() => { try { closeBtnRef.current?.focus(); } catch (_) {} }, 60);
      return () => clearTimeout(t);
    }
    const prev = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (prev && typeof prev.focus === 'function') {
      try { prev.focus(); } catch (_) {}
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
    if (theme === 'light') {
      return {
        bg: '#FFFFFF', text: '#050505', textSec: '#65676B', border: '#DADDE1',
        blue: '#1877F2', blueHover: '#166FE5', cardBg: '#F0F2F5', hoverBg: '#F2F3F5',
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
      bg: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)', text: '#FFFFFF',
      textSec: '#94a3b8', border: 'rgba(59, 130, 246, 0.2)', blue: '#3b82f6',
      blueHover: '#2563eb', cardBg: 'rgba(30, 58, 95, 0.5)',
      hoverBg: 'rgba(59, 130, 246, 0.1)', tileBg: 'rgba(30, 58, 95, 0.5)',
      inputBg: 'rgba(255,255,255,0.08)', danger: '#EF4444',
    };
  }, [theme]);

  // ── Derived menu structure ────────────────────────────────────────────────
  const actionableCount = useMemo(() => countActionable(menuItems), [menuItems]);
  const showSearch = actionableCount > 12;
  const autoCollapse = actionableCount > 20;
  const groups = useMemo(() => buildGroups(menuItems), [menuItems]);
  const linkables = useMemo(() => collectLinkables(menuItems), [menuItems]);
  const currentPath = router?.asPath || '';

  const groupHasActiveRoute = useCallback(
    (group) => group.items.some(({ item }) => item?.href && currentPath.split('?')[0] === item.href.split('?')[0]),
    [currentPath],
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
          if (labelOf(g).toLowerCase().includes(q)) {
            out.push({
              item: { type: g.href ? 'navigation' : 'action', label: g.label, href: g.href, icon: g.icon, onClick: g.onClick, hardNav: g.hardNav },
              index: `g-${index}-${gi}`,
            });
          }
        });
        return;
      }
      if (!ACTIONABLE.has(item?.type)) return;
      if (labelOf(item).toLowerCase().includes(q)) out.push({ item, index });
    });
    return out;
  }, [query, menuItems]);

  const favItems = useMemo(
    () => favs.map((href) => linkables.find((l) => l.href === href)).filter(Boolean),
    [favs, linkables],
  );

  const recentItems = useMemo(
    () => (recents || [])
      .filter((r) => r?.href && r.href.split('?')[0] !== currentPath.split('?')[0])
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
    const isCurrent = item.href && currentPath.split('?')[0] === item.href.split('?')[0];
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
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500 }}>{item.label}</span>
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
      if (item.onClick) item.onClick();
      rememberRecent(item);
      onClose?.();
    };

    const aria = {
      'aria-current': isCurrent ? 'page' : undefined,
      'aria-disabled': disabled ? 'true' : undefined,
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
            onClick={() => item.onChange && item.onChange(!item.checked)}
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
        const isStub = !item.onClick && !item.openInviteModal && !item.href;
        const isFlat = item.variant === 'flat' || item.noBorder;
        return (
          <button
            key={key}
            type="button"
            disabled={isStub}
            aria-disabled={isStub ? 'true' : undefined}
            className="sp-menu-row"
            onClick={() => {
              if (isStub) return;
              if (item.openInviteModal) {
                onClose?.();
                setShowInviteModal(true);
                return;
              }
              if (item.onClick) item.onClick();
              if (item.closeOnClick !== false) onClose?.();
            }}
            style={{
              ...rowBase,
              padding: isFlat ? '10px 0' : '8px 16px',
              background: item.primary ? colors.blue : 'transparent',
              border: item.primary || isFlat ? '1px solid transparent' : `1px solid ${colors.border}`,
              borderRadius: isFlat ? 0 : 8,
              color: item.primary ? '#fff' : colors.text,
              opacity: isStub ? 0.45 : 1,
              cursor: isStub ? 'not-allowed' : 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon || null}
            </span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontWeight: 500 }}>{item.label}</span>
            {isStub ? (
              <span style={{ fontSize: 12, color: colors.textSec, flexShrink: 0 }}>Unavailable</span>
            ) : null}
          </button>
        );
      }

      case 'divider':
        return <div key={key} style={{ height: 1, background: colors.border, margin: '12px 16px' }} />;

      case 'grid':
        return (
          <div
            key={key}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${item.columns || 2}, minmax(0, 1fr))`,
              gap: 8,
              padding: '0 16px',
              marginBottom: 16,
            }}
          >
            {(item.items || []).map((gridItem, gridIndex) => {
              const tileStyle = {
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                justifyContent: 'center', gap: 6,
                minHeight: 64, padding: '12px 10px', minWidth: 0,
                background: colors.tileBg, borderRadius: 8, textDecoration: 'none',
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
                <span style={{ fontSize: 14, fontWeight: 600, color: colors.text, lineHeight: 1.2, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {gridItem.label}
                </span>
              );

              if (!gridItem.href) {
                const stub = !gridItem.onClick;
                return (
                  <button
                    key={gridIndex}
                    type="button"
                    className="sp-grid-tile"
                    disabled={stub}
                    aria-disabled={stub ? 'true' : undefined}
                    onClick={() => {
                      if (stub) return;
                      gridItem.onClick();
                      onClose?.();
                    }}
                    style={{ ...tileStyle, opacity: stub ? 0.45 : 1, cursor: stub ? 'not-allowed' : 'pointer' }}
                  >
                    {iconSlot}
                    {labelSlot}
                  </button>
                );
              }

              const tileBlocked = isBlockedOffline(gridItem);
              const onTile = (e) => {
                if (tileBlocked) { e.preventDefault(); return; }
                if (gridItem.onClick) gridItem.onClick();
                rememberRecent(gridItem);
                onClose?.();
              };
              if (needsHardNav(gridItem)) {
                return (
                  <a key={gridIndex} href={gridItem.href} className="sp-grid-tile" style={{ ...tileStyle, opacity: tileBlocked ? 0.45 : 1 }} onClick={onTile} aria-disabled={tileBlocked ? 'true' : undefined}>
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
                >
                  {iconSlot}
                  {labelSlot}
                </Link>
              );
            })}
          </div>
        );

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
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)',
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
        aria-label="Main menu"
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
          maxWidth: `min(${width}px, 88vw)`,
          height: '100dvh',
          maxHeight: '100dvh',
          background: colors.bg,
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
        }}
      >
        {/* Header row: edit favourites + close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
          <button
            type="button"
            className="sp-icon-btn"
            onClick={() => setEditFavs((v) => !v)}
            aria-pressed={editFavs}
            aria-label={editFavs ? 'Done pinning menu items' : 'Pin menu items to favourites'}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none', padding: 0,
              background: editFavs ? colors.blue : (theme === 'light' ? '#f0f0f0' : 'rgba(255,255,255,0.1)'),
              color: editFavs ? '#fff' : colors.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            {editFavs ? <Star size={18} aria-hidden="true" /> : <Pencil size={18} aria-hidden="true" />}
          </button>
          <button
            ref={closeBtnRef}
            type="button"
            className="sp-icon-btn"
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none', padding: 0,
              background: theme === 'light' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.1)',
              color: colors.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

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
            <span style={{ minWidth: 0 }}>You are offline. Cached pages still open — anything that needs the network will wait.</span>
          </div>
        )}

        {/* Search */}
        {showSearch && (
          <div style={{ padding: '0 16px 12px', position: 'sticky', top: 0, zIndex: 2, background: colors.bg }}>
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
                  No matches
                </div>
                Nothing in this menu matches &ldquo;{query.trim()}&rdquo;. Try a shorter word.
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
                      <div style={{ fontSize: 12, marginTop: 6 }}>See all</div>
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
                  background: theme === 'light' ? colors.bg : colors.cardBg,
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
                      background: theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.2)',
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
                              background: theme === 'light' ? '#eee' : '#333', flexShrink: 0,
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
                    Tap any link below to pin it here, then tap the star button again when you are done.
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
                    Nothing here yet
                  </div>
                  Use the links below to get back to the hub.
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
                const stub = !link.onClick && !link.openInviteModal;
                return (
                  <button
                    key={index}
                    type="button"
                    className="sp-menu-row"
                    disabled={stub}
                    aria-disabled={stub ? 'true' : undefined}
                    onClick={() => {
                      if (stub) return;
                      if (link.openInviteModal) {
                        onClose?.();
                        setShowInviteModal(true);
                        return;
                      }
                      if (link.onClick) link.onClick();
                      onClose?.();
                    }}
                    style={{ ...commonStyle, background: 'none', border: 'none', cursor: stub ? 'not-allowed' : 'pointer', opacity: stub ? 0.45 : 1 }}
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
        .sp-menu-row,
        .sp-grid-tile,
        .sp-sc-tile,
        .sp-icon-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: background 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
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
          border-radius: 8px;
        }
        @media (hover: hover) {
          .sp-menu-row:hover { background: rgba(127, 148, 190, 0.14) !important; }
          .sp-grid-tile:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.18); }
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
