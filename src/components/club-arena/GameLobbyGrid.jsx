/**
 * ═══════════════════════════════════════════════════════════
 * GAME LOBBY GRID — Club Arena
 * ═══════════════════════════════════════════════════════════
 *
 * Two-column responsive grid matching PokerBros lobby layout.
 * 8 cards visible per screen on standard mobile (375px wide).
 *
 * Features:
 *   • Loads games (tables + tournaments) from Club Arena APIs
 *   • Loads all sticker_assets from Supabase on mount
 *   • Filters: All | Hold'em | Omaha | Mixed | MTT | Spin-It | SNG
 *   • Real-time polling every 15s
 *   • Passes assetMap to every GameCard for sticker rendering
 *   • "NEW" badge on label_new games
 *   • Empty state per tab
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameCard from './GameCard';
import { buildStickerAssetMap } from '../../lib/stickerOrchestrator';

// ─────────────────────────────────────────────────────────────
// FILTER TABS
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'all',     label: 'ALL' },
  { id: 'holdem',  label: "Hold'em" },
  { id: 'omaha',   label: 'Omaha' },
  { id: 'mixed',   label: 'Mixed' },
  { id: 'mtt',     label: 'MTT' },
  { id: 'spin',    label: 'Spin-It' },
  { id: 'sng',     label: 'SNG' },
];

const HOLDEM_VARIANTS  = new Set(['nlh', 'flh', 'short_deck']);
const OMAHA_VARIANTS   = new Set(['plo4', 'plo5', 'plo6', 'plo8', 'flo']);
const MIXED_VARIANTS   = new Set(['mixed', 'ofc']);

function matchesTab(game, tabId) {
  if (tabId === 'all') return true;
  const v  = game.game_variant || game.variant || '';
  const gt = game.game_type    || game.type    || '';
  switch (tabId) {
    case 'holdem': return HOLDEM_VARIANTS.has(v)  && gt !== 'mtt' && gt !== 'sng' && gt !== 'spin';
    case 'omaha':  return OMAHA_VARIANTS.has(v)   && gt !== 'mtt' && gt !== 'sng' && gt !== 'spin';
    case 'mixed':  return MIXED_VARIANTS.has(v)   && gt !== 'mtt' && gt !== 'sng' && gt !== 'spin';
    case 'mtt':    return gt === 'mtt'  || gt === 'tournament';
    case 'spin':   return gt === 'spin' || v === 'spin';
    case 'sng':    return gt === 'sng';
    default:       return true;
  }
}

// ─────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────
async function fetchGames(clubId, token) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // Fetch tables (cash + SNG) and tournaments in parallel
  const [tablesRes, tourneysRes] = await Promise.all([
    fetch(`/api/club-arena/manage-table?clubId=${clubId}&action=list`, { headers }),
    fetch(`/api/club-arena/tournaments?action=list&clubId=${clubId}`,  { headers }),
  ]);

  const tablesJson  = tablesRes.ok  ? await tablesRes.json()  : {};
  const tourneysJson = tourneysRes.ok ? await tourneysRes.json() : {};

  const tables      = tablesJson.tables      || tablesJson.data || [];
  const tournaments = tourneysJson.tournaments || tourneysJson.data || [];

  return [...tables, ...tournaments];
}

async function fetchStickerAssets(token) {
  const res = await fetch('/api/club-arena/sticker-assets', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.stickers || json.data || [];
}

// ─────────────────────────────────────────────────────────────
// SORT — active first, then by player count desc
// ─────────────────────────────────────────────────────────────
function sortGames(games) {
  return [...games].sort((a, b) => {
    const aActive = a.status === 'active' ? 1 : 0;
    const bActive = b.status === 'active' ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    const aPlayers = a.current_players ?? a.registered_count ?? 0;
    const bPlayers = b.current_players ?? b.registered_count ?? 0;
    return bPlayers - aPlayers;
  });
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────
/**
 * GameLobbyGrid
 *
 * @param {string}   clubId      - Supabase club UUID
 * @param {string}   token       - Auth bearer token
 * @param {function} onGamePress - Called with game row when a card is tapped
 * @param {number}   [pollMs]    - Polling interval in ms (default 15000)
 */
export default function GameLobbyGrid({ clubId, token, onGamePress, pollMs = 15000 }) {
  const [activeTab, setActiveTab]   = useState('all');
  const [games, setGames]           = useState([]);
  const [assetMap, setAssetMap]     = useState({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const pollRef                     = useRef(null);

  // ── Load sticker assets once ──
  useEffect(() => {
    if (!token) return;
    fetchStickerAssets(token)
      .then(rows => setAssetMap(buildStickerAssetMap(rows)))
      .catch(() => {}); // non-fatal
  }, [token]);

  // ── Load & poll games ──
  const loadGames = useCallback(async () => {
    if (!clubId || !token) return;
    try {
      const raw = await fetchGames(clubId, token);
      setGames(sortGames(raw));
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [clubId, token]);

  useEffect(() => {
    loadGames();
    pollRef.current = setInterval(loadGames, pollMs);
    return () => clearInterval(pollRef.current);
  }, [loadGames, pollMs]);

  // ── Filter ──
  const visible = games.filter(g => matchesTab(g, activeTab));

  // ── Tab counts ──
  const countForTab = (id) => id === 'all' ? games.length : games.filter(g => matchesTab(g, id)).length;

  return (
    <div style={styles.root}>

      {/* ── FILTER TABS ── */}
      <div style={styles.tabBar}>
        <div style={styles.tabScroll}>
          {TABS.map(tab => {
            const count  = countForTab(tab.id);
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...styles.tab,
                  color:      active ? '#fff'           : 'rgba(255,255,255,0.45)',
                  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  borderBottom: active ? '2px solid #F5A623' : '2px solid transparent',
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span style={{
                    ...styles.tabBadge,
                    background: active ? '#F5A623' : 'rgba(255,255,255,0.15)',
                    color:      active ? '#000'    : 'rgba(255,255,255,0.6)',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={styles.content}>
        {loading ? (
          <div style={styles.center}>
            <div style={styles.spinner} />
            <span style={styles.loadingText}>Loading games…</span>
          </div>
        ) : error ? (
          <div style={styles.center}>
            <span style={styles.errorText}>⚠️ {error}</span>
            <button onClick={loadGames} style={styles.retryBtn}>Retry</button>
          </div>
        ) : visible.length === 0 ? (
          <div style={styles.center}>
            <span style={{ fontSize: 32, marginBottom: 12 }}>🃏</span>
            <span style={styles.emptyText}>No {activeTab === 'all' ? '' : activeTab.toUpperCase() + ' '}games running</span>
          </div>
        ) : (
          <div style={styles.grid}>
            {visible.map(game => (
              <GameCard
                key={game.id}
                game={game}
                assetMap={assetMap}
                onPress={onGamePress}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// Card target: 8 per screen on 375px mobile
//   → 2 cols, gap 8px, padding 10px each side
//   → card width ≈ (375 - 20 - 8) / 2 = 173px
//   → card height (aspectRatio ~0.92) ≈ 159px
//   → 4 rows × 159px + 3 gaps × 8px = 660px content
//   → tab bar ~40px → total ~700px ✓ fits in 812px viewport
// ─────────────────────────────────────────────────────────────
const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0e1015',
    fontFamily: 'Inter, -apple-system, sans-serif',
  },
  tabBar: {
    background: '#16181d',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  tabScroll: {
    display: 'flex',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    gap: 0,
  },
  tab: {
    flexShrink: 0,
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    letterSpacing: 0.3,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'color 0.15s, background 0.15s',
    WebkitTapHighlightColor: 'transparent',
    whiteSpace: 'nowrap',
  },
  tabBadge: {
    fontSize: 9,
    fontWeight: 700,
    borderRadius: 8,
    padding: '1px 5px',
    minWidth: 16,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: '#F5A623',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  errorText: {
    fontSize: 13,
    color: '#E74C3C',
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    padding: '8px 20px',
    background: '#F5A623',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: '#000',
    cursor: 'pointer',
  },
};
