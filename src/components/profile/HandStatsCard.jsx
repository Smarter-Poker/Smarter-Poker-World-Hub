/**
 * HandStatsCard: "At The Tables", the real hand numbers on every public profile.
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 8 "Discovery and the feed". Four tiles over the last 30 days (Hands,
 * Sessions, Days Active, Biggest Pot), the month-to-date hands and the last
 * day played, all from GET /api/profile/hand-stats?user_id=<uuid>
 * (pages/api/profile/hand-stats.js, one aggregate over club_member_daily_stats).
 *
 * The markup is identical for every profile. Horses are players: there is no
 * is_horse prop, no branch on who the player is, and nothing here reads the
 * viewer. Mounted in the ALL tab of pages/hub/user/[username].js directly
 * after PokerResumeBadge.
 *
 * States: skeleton while loading, the tiles once loaded, the empty line when
 * the player has no hands in the window, and nothing at all when the route
 * answers 503 (or cannot be reached): a card that cannot be filled is not
 * shown. Copy is rendered from HAND_STATS_COPY so it stays exactly as
 * written; no emoji, no em dash.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from 'react';

export const HAND_STATS_COPY = {
  title: 'At The Tables',
  caption: 'Last 30 days',
  hands: 'Hands',
  sessions: 'Sessions',
  daysActive: 'Days Active',
  biggestPot: 'Biggest Pot',
  thisMonth: 'This month:',
  handsWord: 'hands',
  lastPlayed: 'Last played',
  empty: 'No hands recorded yet.',
};

export const HAND_STATS_ENDPOINT = '/api/profile/hand-stats';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 4321 -> "4,321"; anything that is not a finite number -> "0". */
export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

/** Chips as written in the ledger: 283467.5 -> "283,467.5", 5000 -> "5,000". */
export function formatChips(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** "2026-09-29" -> "Sep 29, 2026", read as a calendar date, never shifted by a time zone. */
export function formatPlayedDate(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

const STYLE = {
  card: {
    background: '#0d1117',
    borderRadius: 12,
    padding: 20,
    color: '#c9d1d9',
    marginBottom: 16,
    border: '1px solid #30363d',
    boxShadow: '0 8px 32px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  title: { margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff', letterSpacing: 0.2 },
  caption: { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },
  tile: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 10,
    padding: 12,
    textAlign: 'center',
    minHeight: 64,
  },
  value: { fontSize: 24, fontWeight: 800, color: '#00f2fe', lineHeight: 1.1, wordBreak: 'break-word' },
  label: { fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  lines: { marginTop: 12, fontSize: 13, color: '#c9d1d9', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' },
  empty: { textAlign: 'center', padding: 16, fontSize: 14, color: '#8b949e' },
  bone: { height: 22, borderRadius: 6, background: '#21262d', margin: '4px auto 8px', width: '60%' },
  boneLabel: { height: 10, borderRadius: 4, background: '#21262d', margin: '0 auto', width: '40%' },
};

/**
 * Ask the route for one player's numbers. Resolves to { status, stats }:
 * 'ready' with the stats on a 200 { success: true, stats }, 'hidden' on
 * anything else (503, 404, a bad body, no network). Never throws.
 */
export async function loadHandStats(userId, fetchImpl = typeof fetch === 'function' ? fetch : null) {
  if (!userId || typeof fetchImpl !== 'function') return { status: 'hidden', stats: null };
  try {
    const res = await fetchImpl(`${HAND_STATS_ENDPOINT}?user_id=${encodeURIComponent(userId)}`);
    if (!res || !res.ok) return { status: 'hidden', stats: null };
    const body = await res.json();
    if (body && body.success && body.stats && typeof body.stats === 'object') {
      return { status: 'ready', stats: body.stats };
    }
  } catch (_error) {
    // A route that cannot be reached is the same as a 503: the card hides.
  }
  return { status: 'hidden', stats: null };
}

const TILES = [
  { key: 'hands30d', label: HAND_STATS_COPY.hands, format: formatCount },
  { key: 'sessions30d', label: HAND_STATS_COPY.sessions, format: formatCount },
  { key: 'daysActive30d', label: HAND_STATS_COPY.daysActive, format: formatCount },
  { key: 'biggestPotWon30d', label: HAND_STATS_COPY.biggestPot, format: formatChips },
];

export default function HandStatsCard({ userId, isOwnProfile = false }) {
  const [status, setStatus] = useState('loading');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!userId) {
      setStatus('hidden');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    setStats(null);
    loadHandStats(userId).then((next) => {
      if (cancelled) return;
      setStats(next.stats);
      setStatus(next.status);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (status === 'hidden') return null;

  const loading = status === 'loading';
  const hands = loading ? 0 : Number(stats?.hands30d) || 0;
  const empty = !loading && hands <= 0;
  const playedDate = loading ? null : formatPlayedDate(stats?.lastPlayed);

  return (
    <section
      data-hand-stats-card=""
      data-state={loading ? 'loading' : empty ? 'empty' : 'ready'}
      aria-busy={loading ? 'true' : 'false'}
      aria-label={HAND_STATS_COPY.title}
      style={STYLE.card}
    >
      <div style={STYLE.head}>
        <h3 style={STYLE.title}>{HAND_STATS_COPY.title}</h3>
        <span style={STYLE.caption}>{HAND_STATS_COPY.caption}</span>
      </div>

      {empty ? (
        <div style={STYLE.empty}>{HAND_STATS_COPY.empty}</div>
      ) : (
        <>
          <div style={STYLE.grid}>
            {TILES.map((tile) => (
              <div key={tile.key} style={STYLE.tile} data-stat={tile.key}>
                {loading ? (
                  <>
                    <div style={STYLE.bone} />
                    <div style={STYLE.boneLabel} />
                  </>
                ) : (
                  <>
                    <div style={STYLE.value}>{tile.format(stats?.[tile.key])}</div>
                    <div style={STYLE.label}>{tile.label}</div>
                  </>
                )}
              </div>
            ))}
          </div>
          {loading ? (
            <div style={STYLE.lines} aria-hidden="true">
              <span style={{ ...STYLE.boneLabel, width: 140, margin: 0 }} />
              <span style={{ ...STYLE.boneLabel, width: 120, margin: 0 }} />
            </div>
          ) : (
            <div style={STYLE.lines}>
              <span data-line="this-month">
                {HAND_STATS_COPY.thisMonth} {formatCount(stats?.handsThisMonth)} {HAND_STATS_COPY.handsWord}
              </span>
              {playedDate ? (
                <span data-line="last-played">
                  {HAND_STATS_COPY.lastPlayed} {playedDate}
                </span>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
