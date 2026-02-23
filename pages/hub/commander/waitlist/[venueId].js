/**
 * Player Waitlist Join Page - Commander Desk Mirror
 * URL: /hub/commander/waitlist/[venueId]
 * Shows the SAME column-based layout as the Commander desk view
 * with per-game "Join List" buttons for online sign-up.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { Clock, Users, MapPin, Loader2, Zap, ChevronDown, ChevronUp, X, AlertTriangle, Globe, CheckCircle } from 'lucide-react';

const GAME_TYPES = [
  { value: 'nlh', label: 'No Limit Hold\'em', short: 'NLH' },
  { value: 'plo', label: 'Pot Limit Omaha', short: 'PLO' },
  { value: 'plo5', label: 'PLO Hi-Lo', short: 'PLO5' },
  { value: 'mixed', label: 'Mixed Games', short: 'MIX' },
  { value: 'limit', label: 'Limit Hold\'em', short: 'LHE' }
];

export default function PlayerWaitlistPage() {
  const router = useRouter();
  const { venueId } = router.query;

  const [venue, setVenue] = useState(null);
  const [games, setGames] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [myEntries, setMyEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningGame, setJoiningGame] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    if (venueId) {
      fetchData();
      const interval = setInterval(fetchData, 15000);
      return () => clearInterval(interval);
    }
  }, [venueId]);

  function getAuthToken() {
    let token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKeys.length > 0) token = localStorage.getItem(sbKeys[0]);
    }
    return token;
  }

  async function fetchData() {
    try {
      const [publicRes, waitlistRes] = await Promise.all([
        fetch(`/api/public/venue/${venueId}`),
        fetch(`/api/commander/waitlist/venue/${venueId}`)
      ]);

      const [publicData, waitlistData] = await Promise.all([
        publicRes.json(),
        waitlistRes.json()
      ]);

      if (publicData.success) {
        setVenue(publicData.data.venue);
        setGames(publicData.data.live_games || []);
      }
      if (waitlistData.success) setWaitlists(waitlistData.data.waitlists || []);

      const token = getAuthToken();
      if (token) {
        const myRes = await fetch('/api/commander/waitlist/my', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const myData = await myRes.json();
        if (myData.success) {
          const flat = (myData.data.entries || []).map(e => ({
            ...e.waitlist_entry,
            venue: e.venue,
            game: e.game,
            position: e.position,
            estimated_wait: e.estimated_wait
          }));
          setMyEntries(flat);
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Join a single game
  async function handleJoinGame(gameType, stakes) {
    const token = getAuthToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/waitlist/${venueId}`);
      return;
    }

    const gameKey = `${gameType}::${stakes}`;
    setJoiningGame(gameKey);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/commander/waitlist/public-join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          venue_id: parseInt(venueId),
          game_type: gameType,
          stakes: stakes,
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Added to ${gameLabel(gameType)} ${stakes}!`);
        fetchData();
        setTimeout(() => setSuccess(null), 4000);
      } else if (data.error?.code === 'ALREADY_ON_WAITLIST') {
        setError('You are already on this waitlist.');
        setTimeout(() => setError(null), 3000);
      } else {
        setError(data.error?.message || 'Failed to join.');
        setTimeout(() => setError(null), 3000);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setTimeout(() => setError(null), 3000);
    }

    setJoiningGame(null);
  }

  async function handleLeaveWaitlist(entryId) {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/commander/waitlist/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) fetchData();
    } catch (err) {
      console.error('Failed to leave waitlist:', err);
    }
  }

  // Group waitlists by game (same as desk view)
  const waitlistByGame = {};
  // First, create columns from active games
  games
    .filter(g => ['waiting', 'running'].includes(g.status))
    .forEach(game => {
      const label = `${gameLabel(game.game_type)} ${game.stakes}`;
      if (!waitlistByGame[label]) {
        waitlistByGame[label] = {
          gameType: game.game_type,
          stakes: game.stakes,
          tableCount: 0,
          entries: []
        };
      }
      waitlistByGame[label].tableCount++;
    });

  // Add waitlist entries to their game columns
  waitlists
    .filter(w => w.status === 'waiting' || w.status === 'called')
    .sort((a, b) => {
      if (a.status === 'called' && b.status !== 'called') return -1;
      if (b.status === 'called' && a.status !== 'called') return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    })
    .forEach(entry => {
      const label = `${gameLabel(entry.game_type)} ${entry.stakes}`;
      if (!waitlistByGame[label]) {
        waitlistByGame[label] = {
          gameType: entry.game_type,
          stakes: entry.stakes,
          tableCount: 0,
          entries: []
        };
      }
      waitlistByGame[label].entries.push(entry);
    });

  const gameColumns = Object.entries(waitlistByGame);
  const totalWaiting = waitlists.filter(w => w.status === 'waiting').length;

  function gameLabel(type) {
    return GAME_TYPES.find(g => g.value === type)?.short || type.toUpperCase();
  }

  function isMyEntry(gameType, stakes) {
    return myEntries.find(e =>
      e.venue_id === parseInt(venueId) &&
      e.game_type === gameType &&
      e.stakes === stakes &&
      (e.status === 'waiting' || e.status === 'called')
    );
  }

  // ═══ LOADING ═══
  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.loadingBox}>
          <Loader2 style={{ width: 32, height: 32, color: '#D4AF37', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#888', marginTop: 12 }}>Loading Waitlist...</p>
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div style={S.page}>
        <div style={S.loadingBox}>
          <MapPin style={{ width: 32, height: 32, color: '#888' }} />
          <h1 style={{ color: '#E0E0E0', fontSize: 20, marginTop: 12 }}>Venue Not Found</h1>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEOHead
        title={`${venue.name} Waitlist`}
        description={`Join the waitlist at ${venue.name} — powered by Club Commander`}
        noindex={true}
      />

      <div style={S.page}>
        {/* ═══ HEADER — matches desk ═══ */}
        <header style={S.header}>
          <div style={S.headerTop}>
            <div style={S.headerLeft}>
              <span style={S.backArrow}>←</span>
              <span style={S.clubName}>{venue.name?.toUpperCase()}</span>
            </div>
            <h1 style={S.headerTitle}>POKER WAITING LIST</h1>
            <div style={S.headerRight}>
              <span style={S.poweredBy}>POWERED BY</span>
              <span style={S.poweredBrand}>CLUB COMMANDER</span>
            </div>
          </div>
          <div style={S.headerStats}>
            <span style={S.statText}>{totalWaiting} waiting · {gameColumns.length} game{gameColumns.length !== 1 ? 's' : ''}</span>
            <span style={S.liveBadge}>
              <span style={S.liveDot} />
              LIVE
            </span>
          </div>
        </header>

        {/* ═══ ALERTS ═══ */}
        <div style={S.alertArea}>
          {success && (
            <div style={S.successAlert}>
              <CheckCircle style={{ width: 16, height: 16, color: '#10B981', flexShrink: 0 }} />
              <span style={{ color: '#10B981', fontSize: 14, fontWeight: 600 }}>{success}</span>
            </div>
          )}
          {error && (
            <div style={S.errorAlert}>
              <span style={{ color: '#EF4444', fontSize: 14, fontWeight: 600 }}>{error}</span>
            </div>
          )}
        </div>

        {/* ═══ GAME COLUMNS — mirrors desk view ═══ */}
        {gameColumns.length === 0 ? (
          <div style={S.emptyState}>
            <Users style={{ width: 40, height: 40, color: '#333', opacity: 0.5 }} />
            <p style={{ color: '#666', fontSize: 16, marginTop: 12 }}>No Games Running</p>
            <p style={{ color: '#444', fontSize: 13 }}>Check Back Later</p>
          </div>
        ) : (
          <div style={S.columnsScroll}>
            <div style={S.columnsGrid}>
              {gameColumns.map(([label, data]) => {
                const myEntry = isMyEntry(data.gameType, data.stakes);
                const gameKey = `${data.gameType}::${data.stakes}`;
                const isJoining = joiningGame === gameKey;

                return (
                  <div key={label} style={S.column}>
                    {/* Gold gradient header */}
                    <div style={S.columnHeader}>{label}</div>

                    {/* Table numbers */}
                    <div style={S.columnTableNums}>
                      {data.tableCount > 0 ? `${data.tableCount} table${data.tableCount > 1 ? 's' : ''}` : '—'}
                    </div>

                    {/* Player names */}
                    <div style={S.columnBody}>
                      {data.entries.length === 0 ? (
                        <div style={S.noPlayers}>No players waiting</div>
                      ) : (
                        data.entries.map((entry) => {
                          const isCalled = entry.status === 'called';
                          const isWeb = entry.signup_method === 'web';
                          const isMe = myEntries.find(m => m.id === entry.id);
                          return (
                            <div
                              key={entry.id}
                              style={{
                                ...S.playerRow,
                                ...(isCalled ? S.playerRowCalled : {}),
                                ...(isMe ? S.playerRowMe : {}),
                              }}
                            >
                              <span style={S.playerNameWrap}>
                                {isWeb && (
                                  <Globe style={{ width: 14, height: 14, color: '#3B82F6', flexShrink: 0 }} />
                                )}
                                <span style={{
                                  ...S.playerName,
                                  color: isCalled ? '#D4AF37' : isMe ? '#D4AF37' : '#E0E0E0',
                                }}>
                                  {entry.player_name}
                                </span>
                                {isMe && (
                                  <span style={S.youBadge}>YOU</span>
                                )}
                              </span>
                              {isCalled && (
                                <span style={S.calledBadge}>CALLED</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Join / Leave button at bottom */}
                    <div style={S.columnFooter}>
                      {myEntry ? (
                        <button
                          onClick={() => handleLeaveWaitlist(myEntry.id)}
                          style={S.leaveBtn}
                        >
                          <X style={{ width: 14, height: 14 }} />
                          Leave List
                        </button>
                      ) : (
                        <button
                          onClick={() => handleJoinGame(data.gameType, data.stakes)}
                          disabled={isJoining}
                          style={{
                            ...S.joinBtn,
                            ...(isJoining ? S.joinBtnDisabled : {}),
                          }}
                        >
                          {isJoining ? (
                            <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                          ) : (
                            'Join List'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ HOW IT WORKS ═══ */}
        <div style={S.bottomArea}>
          <button
            style={S.howItWorksToggle}
            onClick={() => setShowHowItWorks(!showHowItWorks)}
          >
            How It Works
            {showHowItWorks
              ? <ChevronUp style={{ width: 16, height: 16 }} />
              : <ChevronDown style={{ width: 16, height: 16 }} />
            }
          </button>
          {showHowItWorks && (
            <div style={S.howItWorksContent}>
              {[
                'Find your game and tap "Join List"',
                'Your name appears on the board instantly',
                'You\'ll get a text when your seat is ready',
                'Check in at the desk when you arrive'
              ].map((step, idx) => (
                <div key={idx} style={S.howStep}>
                  <div style={S.stepNum}>{idx + 1}</div>
                  <p style={S.stepText}>{step}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ TICKER — matches desk ═══ */}
        <div style={S.ticker}>
          <span style={S.tickerText}>
            — {totalWaiting} player{totalWaiting !== 1 ? 's' : ''} currently waiting
          </span>
          <span style={S.tickerText}>
            Download the Smarter Poker App
          </span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes live-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </>
  );
}

// ═══════════════════════════════════════════════
// STYLES — Commander Desk Mirror
// ═══════════════════════════════════════════════
const S = {
  page: {
    minHeight: '100vh',
    background: '#000',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  },

  // ── Header ──
  header: {
    background: '#050505',
    borderBottom: '2px solid #666',
    padding: '0',
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  backArrow: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: 700,
  },
  clubName: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  headerTitle: {
    color: '#E0E0E0',
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: '2px',
    textAlign: 'center',
    margin: 0,
    flex: 1,
  },
  headerRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 0,
  },
  poweredBy: {
    fontSize: 8,
    color: '#888',
    letterSpacing: '1px',
    fontWeight: 600,
  },
  poweredBrand: {
    fontSize: 10,
    color: '#D4AF37',
    fontWeight: 800,
    letterSpacing: '1px',
  },
  headerStats: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    background: '#050505',
    borderTop: '1px solid #222',
  },
  statText: {
    fontSize: 12,
    color: '#888',
    fontWeight: 600,
  },
  liveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 800,
    color: '#10B981',
    letterSpacing: '1.5px',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#10B981',
    animation: 'live-dot 1.5s ease-in-out infinite',
    boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
  },

  // ── Alerts ──
  alertArea: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '0 16px',
  },
  successAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    margin: '8px 0',
    borderRadius: 8,
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  errorAlert: {
    padding: '10px 16px',
    margin: '8px 0',
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },

  // ── Game Columns ──
  columnsScroll: {
    flex: 1,
    overflowX: 'auto',
    padding: '12px 16px',
    WebkitOverflowScrolling: 'touch',
  },
  columnsGrid: {
    display: 'flex',
    gap: 2,
    minWidth: 'min-content',
    alignItems: 'flex-start',
  },
  column: {
    flex: '1 1 200px',
    minWidth: 160,
    maxWidth: 280,
    border: '3px solid #666',
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#000',
  },
  columnHeader: {
    padding: '14px 10px',
    textAlign: 'center',
    fontWeight: 800,
    fontSize: 20,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    background: 'linear-gradient(180deg, #C5962E 0%, #B8860B 40%, #8B6508 100%)',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
    borderBottom: '2px solid #D4AF37',
  },
  columnTableNums: {
    padding: '4px 8px',
    textAlign: 'center',
    fontSize: 13,
    color: '#888',
    borderBottom: '1px solid #333',
    background: '#050505',
    fontWeight: 600,
  },
  columnBody: {
    flex: 1,
    background: '#000',
    minHeight: 60,
  },
  noPlayers: {
    padding: '16px 12px',
    textAlign: 'center',
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
  },
  playerRow: {
    padding: '8px 12px',
    borderBottom: '1px solid #1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerRowCalled: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
  },
  playerRowMe: {
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
  },
  playerNameWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  youBadge: {
    fontSize: 9,
    fontWeight: 800,
    color: '#000',
    background: '#D4AF37',
    padding: '1px 5px',
    borderRadius: 3,
    letterSpacing: '0.5px',
    flexShrink: 0,
  },
  calledBadge: {
    fontSize: 12,
    fontWeight: 800,
    color: '#000',
    background: '#D4AF37',
    padding: '2px 6px',
    borderRadius: 3,
    letterSpacing: '0.5px',
    flexShrink: 0,
  },

  // ── Column footer — Join button ──
  columnFooter: {
    padding: '8px',
    borderTop: '1px solid #333',
    background: '#050505',
  },
  joinBtn: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '2px solid #D4AF37',
    background: 'linear-gradient(180deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '1px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'all 0.15s ease',
  },
  joinBtnDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  leaveBtn: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid rgba(239, 68, 68, 0.4)',
    background: 'rgba(239, 68, 68, 0.08)',
    color: '#EF4444',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
  },

  // ── How It Works ──
  bottomArea: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '0 16px 12px',
    width: '100%',
    boxSizing: 'border-box',
  },
  howItWorksToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '12px 0',
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  howItWorksContent: {
    borderRadius: 10,
    border: '1px solid #333',
    background: '#050505',
    padding: '12px 16px',
    marginTop: 4,
  },
  howStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1a1a0a, #2a2510)',
    border: '1.5px solid #D4AF37',
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepText: {
    color: '#B0B0B0',
    fontSize: 13,
    margin: 0,
  },

  // ── Bottom ticker — matches desk ──
  ticker: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: '#050505',
    borderTop: '2px solid #666',
  },
  tickerText: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
};
