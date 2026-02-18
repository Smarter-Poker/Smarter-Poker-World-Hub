/**
 * Player Waitlist Join Page - Bravo Poker Live inspired redesign
 * URL: /hub/commander/waitlist/[venueId]
 * Compact tabular layout, multi-game selection, sticky green JOIN button
 * Hybrid: Bravo's proven UX patterns + Futuristic Metal aesthetic
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { Clock, Users, CheckCircle, MapPin, Loader2, Zap, ChevronDown, ChevronUp, X, AlertTriangle } from 'lucide-react';

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
  const [joining, setJoining] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [selectedGames, setSelectedGames] = useState(new Set());
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [seatPrefs, setSeatPrefs] = useState({ preferred_seats: '', left_handed: false, notes: '' });
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Fetch data
  useEffect(() => {
    if (venueId) {
      fetchData();
      const interval = setInterval(fetchData, 15000); // Bravo refreshes every 15s
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
        const v = publicData.data.venue;
        setVenue(v);
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
          // Flatten: API wraps each entry in { waitlist_entry: {...}, venue, game, position }
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
      setLastRefresh(Date.now());
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Multi-game join — sequential API calls
  async function handleJoinSelected() {
    const token = getAuthToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/waitlist/${venueId}`);
      return;
    }

    if (selectedGames.size === 0) return;

    setJoining(true);
    setError(null);
    setSuccess(null);

    const results = [];
    for (const key of selectedGames) {
      const [gameType, stakes] = key.split('::');
      try {
        const res = await fetch('/api/commander/waitlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            venue_id: parseInt(venueId),
            game_type: gameType,
            stakes: stakes,
            signup_method: 'app',
            seat_preferences: seatPrefs.preferred_seats || seatPrefs.left_handed || seatPrefs.notes ? {
              preferred_seats: seatPrefs.preferred_seats ? seatPrefs.preferred_seats.split(',').map(s => parseInt(s.trim())).filter(Boolean) : [],
              left_handed: seatPrefs.left_handed,
              notes: seatPrefs.notes || null
            } : undefined
          })
        });
        const data = await res.json();
        if (data.success) results.push(key);
      } catch (err) {
        // Continue with remaining games
      }
    }

    if (results.length > 0) {
      setSuccess(`Added to ${results.length} waitlist${results.length > 1 ? 's' : ''}`);
      setSelectedGames(new Set());
      fetchData();
      setTimeout(() => setSuccess(null), 4000);
    } else {
      setError('Failed to join waitlist. Please try again.');
    }

    setJoining(false);
    setShowPrefsModal(false);
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

  // Compute game rows
  const gameRows = games
    .filter(g => ['waiting', 'running'].includes(g.status))
    .reduce((acc, game) => {
      const key = `${game.game_type}::${game.stakes}`;
      if (!acc[key]) {
        acc[key] = {
          key,
          gameType: game.game_type,
          stakes: game.stakes,
          tableCount: 0,
          waitCount: 0
        };
      }
      acc[key].tableCount++;
      return acc;
    }, {});

  // Add waitlist counts
  waitlists.forEach(entry => {
    const key = `${entry.game_type}::${entry.stakes}`;
    if (gameRows[key]) {
      gameRows[key].waitCount++;
    }
  });

  const rows = Object.values(gameRows);
  const totalTables = rows.reduce((s, r) => s + r.tableCount, 0);
  const totalWaiting = rows.reduce((s, r) => s + r.waitCount, 0);

  // Check user's waitlist status
  function getMyEntry(gameType, stakes) {
    return myEntries.find(e =>
      e.venue_id === parseInt(venueId) &&
      e.game_type === gameType &&
      e.stakes === stakes &&
      e.status === 'waiting'
    );
  }

  function getMyCalledEntry(gameType, stakes) {
    return myEntries.find(e =>
      e.venue_id === parseInt(venueId) &&
      e.game_type === gameType &&
      e.stakes === stakes &&
      e.status === 'called'
    );
  }

  function toggleGame(key) {
    setSelectedGames(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // My active entries for this venue
  const myActiveEntries = myEntries.filter(e =>
    e.venue_id === parseInt(venueId) && ['waiting', 'called'].includes(e.status)
  );

  // Get label for game type
  function gameLabel(type) {
    return GAME_TYPES.find(g => g.value === type)?.short || type.toUpperCase();
  }

  // Calculate time since refresh
  function timeSinceRefresh() {
    const secs = Math.floor((Date.now() - lastRefresh) / 1000);
    return secs < 5 ? 'Just now' : `${secs}s ago`;
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingContainer}>
          <Loader2 style={{ width: 32, height: 32, color: '#22D3EE', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#64748B', marginTop: 12 }}>Loading Waitlist...</p>
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingContainer}>
          <MapPin style={{ width: 32, height: 32, color: '#64748B' }} />
          <h1 style={{ color: '#fff', fontSize: 20, marginTop: 12 }}>Venue Not Found</h1>
          <p style={{ color: '#64748B', fontSize: 14 }}>This Venue Doesn't Exist Or Isn't Using Commander.</p>
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

      <div style={styles.page}>
        {/* ═══ HEADER ═══ */}
        <header style={styles.header}>
          <div style={styles.headerInner}>
            <div style={styles.headerLeft}>
              <div style={styles.venueIcon}>
                <Zap style={{ width: 20, height: 20, color: '#22D3EE' }} />
              </div>
              <div>
                <h1 style={styles.venueName}>{venue.name}</h1>
                <p style={styles.venueLocation}>
                  <MapPin style={{ width: 12, height: 12 }} />
                  {venue.city}, {venue.state}
                </p>
              </div>
            </div>
            <div style={styles.headerRight}>
              <div style={styles.livePulse}>
                <span style={styles.liveDot} />
                LIVE
              </div>
            </div>
          </div>
          {/* Summary strip */}
          <div style={styles.summaryStrip}>
            <span style={styles.summaryItem}>
              <Users style={{ width: 14, height: 14 }} />
              {totalTables} Table{totalTables !== 1 ? 's' : ''}
            </span>
            <span style={styles.summarySep}>·</span>
            <span style={styles.summaryItem}>
              <Clock style={{ width: 14, height: 14 }} />
              {totalWaiting} Waiting
            </span>
          </div>
        </header>

        {/* ═══ ALERTS ═══ */}
        <div style={styles.content}>
          {/* Called seat alert */}
          {myActiveEntries.some(e => e.status === 'called') && (
            <div style={styles.calledAlert}>
              <AlertTriangle style={{ width: 20, height: 20, color: '#10B981', flexShrink: 0 }} />
              <div>
                <p style={styles.calledTitle}>YOUR SEAT IS READY!</p>
                <p style={styles.calledSub}>Please Check In at the Desk</p>
              </div>
            </div>
          )}

          {success && (
            <div style={styles.successAlert}>
              <CheckCircle style={{ width: 18, height: 18, color: '#10B981', flexShrink: 0 }} />
              <p style={{ color: '#10B981', fontSize: 14, fontWeight: 600 }}>{success}</p>
            </div>
          )}
          {error && (
            <div style={styles.errorAlert}>
              <p style={{ color: '#EF4444', fontSize: 14, fontWeight: 600 }}>{error}</p>
            </div>
          )}

          {/* ═══ GAME TABLE — Bravo-style ═══ */}
          <div style={styles.tableContainer}>
            {/* Table header */}
            <div style={styles.tableHeader}>
              <span style={{ ...styles.tableHeaderCell, flex: 2 }}>Game</span>
              <span style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'center' }}>Tables</span>
              <span style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'center' }}>Waiting</span>
              <span style={{ ...styles.tableHeaderCell, width: 60, textAlign: 'center' }}>Join</span>
            </div>

            {/* Table rows */}
            {rows.length === 0 ? (
              <div style={styles.emptyState}>
                <Users style={{ width: 24, height: 24, color: '#64748B', opacity: 0.5 }} />
                <p style={{ color: '#64748B', fontSize: 14, marginTop: 8 }}>No Games Running</p>
                <p style={{ color: '#4A5E78', fontSize: 12 }}>Check Back Later</p>
              </div>
            ) : (
              rows.map((row) => {
                const myEntry = getMyEntry(row.gameType, row.stakes);
                const calledEntry = getMyCalledEntry(row.gameType, row.stakes);
                const isSelected = selectedGames.has(row.key);
                const isOnList = !!myEntry;
                const isCalled = !!calledEntry;

                return (
                  <div
                    key={row.key}
                    style={{
                      ...styles.tableRow,
                      ...(isSelected ? styles.tableRowSelected : {}),
                      ...(isCalled ? styles.tableRowCalled : {}),
                      ...(isOnList ? styles.tableRowOnList : {}),
                    }}
                    onClick={() => {
                      if (!isOnList && !isCalled) toggleGame(row.key);
                    }}
                  >
                    {/* Game name */}
                    <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={styles.gameStakes}>{row.stakes}</span>
                      <span style={styles.gameType}>{gameLabel(row.gameType)}</span>
                    </div>

                    {/* Tables count */}
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <span style={styles.countBadge}>{row.tableCount}</span>
                    </div>

                    {/* Waiting count */}
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{
                        ...styles.countBadge,
                        ...(row.waitCount > 0 ? styles.countBadgeWaiting : {})
                      }}>{row.waitCount}</span>
                    </div>

                    {/* Action column */}
                    <div style={{ width: 60, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      {isCalled ? (
                        <span style={styles.calledBadge}>GO!</span>
                      ) : isOnList ? (
                        <div style={styles.positionBadge}>
                          <span style={styles.positionHash}>#</span>
                          <span style={styles.positionNum}>{myEntry.position}</span>
                        </div>
                      ) : (
                        <div style={{
                          ...styles.checkbox,
                          ...(isSelected ? styles.checkboxChecked : {})
                        }}>
                          {isSelected && <CheckCircle style={{ width: 16, height: 16, color: '#fff' }} />}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ═══ MY WAITLIST ENTRIES ═══ */}
          {myActiveEntries.length > 0 && (
            <div style={styles.mySection}>
              <h3 style={styles.sectionTitle}>YOUR WAITLIST</h3>
              {myActiveEntries.map(entry => (
                <div key={entry.id} style={styles.myEntry}>
                  <div>
                    <span style={styles.myGameText}>
                      {entry.stakes} <span style={{ color: '#22D3EE' }}>{gameLabel(entry.game_type)}</span>
                    </span>
                    <div style={styles.myMeta}>
                      {entry.status === 'called' ? (
                        <span style={{ color: '#10B981', fontWeight: 700 }}>SEAT READY</span>
                      ) : (
                        <span>Position <span style={{ color: '#22D3EE', fontWeight: 700 }}>#{entry.position}</span></span>
                      )}
                      {entry.created_at && (
                        <span style={{ marginLeft: 12 }}>
                          <Clock style={{ width: 12, height: 12, display: 'inline', verticalAlign: -2 }} />
                          {' '}{Math.round((Date.now() - new Date(entry.created_at).getTime()) / 60000)}m
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLeaveWaitlist(entry.id)}
                    style={styles.leaveBtn}
                  >
                    <X style={{ width: 14, height: 14 }} />
                    Leave
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ═══ HOW IT WORKS — Collapsible ═══ */}
          <button
            style={styles.howItWorksToggle}
            onClick={() => setShowHowItWorks(!showHowItWorks)}
          >
            How It Works
            {showHowItWorks
              ? <ChevronUp style={{ width: 16, height: 16 }} />
              : <ChevronDown style={{ width: 16, height: 16 }} />
            }
          </button>
          {showHowItWorks && (
            <div style={styles.howItWorksContent}>
              {[
                'Select the games you want to play',
                'Tap "Join Wait List" to add yourself',
                'You\'ll get a text when your seat is ready',
                'Check in at the desk within 5 minutes'
              ].map((step, idx) => (
                <div key={idx} style={styles.howItWorksStep}>
                  <div style={styles.stepNumber}>{idx + 1}</div>
                  <p style={styles.stepText}>{step}</p>
                </div>
              ))}
            </div>
          )}

          {/* Powered By */}
          <div style={styles.footer}>
            <p style={styles.footerLabel}>Powered By</p>
            <p style={styles.footerBrand}>CLUB COMMANDER</p>
          </div>
        </div>

        {/* ═══ STICKY JOIN BUTTON — Bravo-style green bar ═══ */}
        {rows.length > 0 && !myActiveEntries.some(e => e.status === 'called') && (
          <div style={styles.stickyFooter}>
            {selectedGames.size > 0 && (
              <button
                style={styles.prefsButton}
                onClick={() => setShowPrefsModal(true)}
              >
                ⚙ Seat Preferences
              </button>
            )}
            <button
              onClick={handleJoinSelected}
              disabled={selectedGames.size === 0 || joining}
              style={{
                ...styles.joinButton,
                ...(selectedGames.size === 0 ? styles.joinButtonDisabled : {}),
              }}
            >
              {joining ? (
                <Loader2 style={{ width: 22, height: 22, animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  JOIN WAIT LIST
                  {selectedGames.size > 0 && (
                    <span style={styles.joinCount}>({selectedGames.size})</span>
                  )}
                </>
              )}
            </button>
          </div>
        )}

        {/* ═══ SEAT PREFS MODAL ═══ */}
        {showPrefsModal && (
          <div style={styles.modalOverlay} onClick={() => setShowPrefsModal(false)}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
              <h3 style={styles.modalTitle}>Seat Preferences</h3>
              <p style={styles.modalSub}>Optional — let the floor know your seating preferences</p>

              <label style={styles.inputLabel}>Preferred Seats</label>
              <input
                type="text"
                placeholder="e.g. 1, 9"
                value={seatPrefs.preferred_seats}
                onChange={e => setSeatPrefs(p => ({ ...p, preferred_seats: e.target.value }))}
                style={styles.input}
              />

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={seatPrefs.left_handed}
                  onChange={e => setSeatPrefs(p => ({ ...p, left_handed: e.target.checked }))}
                />
                Left-Handed Seating
              </label>

              <label style={styles.inputLabel}>Notes</label>
              <input
                type="text"
                placeholder="Any other preferences..."
                value={seatPrefs.notes}
                onChange={e => setSeatPrefs(p => ({ ...p, notes: e.target.value }))}
                style={styles.input}
              />

              <div style={styles.modalActions}>
                <button
                  style={styles.modalCancel}
                  onClick={() => setShowPrefsModal(false)}
                >
                  Cancel
                </button>
                <button
                  style={styles.modalJoin}
                  onClick={handleJoinSelected}
                >
                  {joining
                    ? <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
                    : `Join ${selectedGames.size} Game${selectedGames.size > 1 ? 's' : ''}`
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 8px rgba(16, 185, 129, 0.6); } 50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.9); } }
        @keyframes live-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </>
  );
}

// ═══════════════════════════════════════════════
// STYLES — Bravo layout + Futuristic Metal skin
// ═══════════════════════════════════════════════
const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0A0E1A 0%, #0D1320 50%, #0A0E1A 100%)',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    paddingBottom: 100, // space for sticky footer
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  },

  // Header
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'linear-gradient(180deg, #0F1A2E 0%, #0A1225 100%)',
    borderBottom: '1px solid #1A2E4A',
    boxShadow: '0 2px 20px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(34, 211, 238, 0.15)',
    padding: '12px 16px 0',
  },
  headerInner: {
    maxWidth: 600,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  venueIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #132240, #1A2E4A)',
    border: '1px solid #22D3EE',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 12px rgba(34, 211, 238, 0.3)',
  },
  venueName: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.5px',
    margin: 0,
  },
  venueLocation: {
    fontSize: 12,
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  livePulse: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 800,
    color: '#10B981',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#10B981',
    animation: 'live-dot 1.5s ease-in-out infinite',
    boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
  },
  summaryStrip: {
    maxWidth: 600,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 0',
    borderTop: '1px solid rgba(34, 211, 238, 0.1)',
    marginTop: 10,
  },
  summaryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: 600,
  },
  summarySep: {
    color: '#4A5E78',
    fontSize: 16,
  },

  // Content
  content: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '16px 12px',
  },

  // Called seat alert
  calledAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    marginBottom: 16,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))',
    border: '2px solid #10B981',
    animation: 'pulse-glow 2s ease-in-out infinite',
  },
  calledTitle: {
    color: '#10B981',
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: '1px',
    margin: 0,
  },
  calledSub: {
    color: '#94A3B8',
    fontSize: 13,
    margin: 0,
    marginTop: 2,
  },

  // Success/Error alerts
  successAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    marginBottom: 12,
    borderRadius: 8,
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  errorAlert: {
    padding: '12px 16px',
    marginBottom: 12,
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },

  // Game Table
  tableContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #1A2E4A',
    background: 'linear-gradient(180deg, #0F1A2E, #0D1525)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(34, 211, 238, 0.08)',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    background: 'rgba(34, 211, 238, 0.06)',
    borderBottom: '1px solid #1A2E4A',
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: 800,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid rgba(26, 46, 74, 0.5)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tableRowSelected: {
    background: 'rgba(34, 211, 238, 0.08)',
    borderLeft: '3px solid #22D3EE',
    paddingLeft: 13,
  },
  tableRowCalled: {
    background: 'rgba(16, 185, 129, 0.1)',
    borderLeft: '3px solid #10B981',
    paddingLeft: 13,
  },
  tableRowOnList: {
    background: 'rgba(34, 211, 238, 0.04)',
    cursor: 'default',
  },
  gameStakes: {
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
  },
  gameType: {
    fontSize: 14,
    fontWeight: 700,
    color: '#22D3EE',
  },
  countBadge: {
    display: 'inline-block',
    minWidth: 28,
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    color: '#CBD5E1',
    background: 'rgba(100, 116, 139, 0.15)',
    textAlign: 'center',
  },
  countBadgeWaiting: {
    color: '#F59E0B',
    background: 'rgba(245, 158, 11, 0.12)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: '2px solid #4A5E78',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  checkboxChecked: {
    background: '#22D3EE',
    borderColor: '#22D3EE',
    boxShadow: '0 0 10px rgba(34, 211, 238, 0.4)',
  },
  positionBadge: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 1,
  },
  positionHash: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: 600,
  },
  positionNum: {
    fontSize: 18,
    color: '#22D3EE',
    fontWeight: 800,
    textShadow: '0 0 10px rgba(34, 211, 238, 0.5)',
  },
  calledBadge: {
    fontSize: 14,
    fontWeight: 800,
    color: '#10B981',
    background: 'rgba(16, 185, 129, 0.15)',
    padding: '4px 10px',
    borderRadius: 6,
    letterSpacing: '1px',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
  },

  // My Waitlist section
  mySection: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #1A2E4A',
    background: 'linear-gradient(180deg, #0F1A2E, #0D1525)',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 800,
    color: '#22D3EE',
    letterSpacing: '2px',
    padding: '10px 16px',
    margin: 0,
    background: 'rgba(34, 211, 238, 0.06)',
    borderBottom: '1px solid #1A2E4A',
  },
  myEntry: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(26, 46, 74, 0.5)',
  },
  myGameText: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
  },
  myMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  leaveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid rgba(239, 68, 68, 0.3)',
    background: 'rgba(239, 68, 68, 0.08)',
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // How It Works
  howItWorksToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '12px 0',
    marginTop: 16,
    background: 'none',
    border: 'none',
    color: '#4A5E78',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  howItWorksContent: {
    borderRadius: 10,
    border: '1px solid #1A2E4A',
    background: 'rgba(15, 26, 46, 0.5)',
    padding: '12px 16px',
    marginTop: 4,
  },
  howItWorksStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1E3A5F, #132240)',
    border: '1.5px solid #22D3EE',
    color: '#22D3EE',
    fontSize: 11,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepText: {
    color: '#94A3B8',
    fontSize: 13,
    margin: 0,
  },

  // Footer
  footer: {
    textAlign: 'center',
    padding: '24px 0',
    marginTop: 8,
  },
  footerLabel: {
    fontSize: 10,
    color: '#4A5E78',
    letterSpacing: '3px',
    textTransform: 'uppercase',
    margin: '0 0 4px 0',
  },
  footerBrand: {
    fontSize: 18,
    fontWeight: 800,
    background: 'linear-gradient(180deg, #CBD5E1, #64748B)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '3px',
    margin: 0,
  },

  // Sticky JOIN button
  stickyFooter: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    padding: '0 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    maxWidth: 600,
    margin: '0 auto',
  },
  prefsButton: {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid #1A2E4A',
    background: 'rgba(15, 26, 46, 0.95)',
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    backdropFilter: 'blur(12px)',
  },
  joinButton: {
    width: '100%',
    padding: '16px 24px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(180deg, #10B981, #059669)',
    color: '#fff',
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '1.5px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4), 0 0 40px rgba(16, 185, 129, 0.15)',
    transition: 'all 0.2s ease',
  },
  joinButtonDisabled: {
    background: 'linear-gradient(180deg, #1E293B, #0F172A)',
    color: '#4A5E78',
    boxShadow: 'none',
    cursor: 'default',
  },
  joinCount: {
    fontSize: 16,
    fontWeight: 600,
    opacity: 0.9,
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    background: 'linear-gradient(180deg, #0F1A2E, #0A1225)',
    border: '1px solid #1A2E4A',
    padding: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    margin: '0 0 4px 0',
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    margin: '0 0 20px 0',
  },
  inputLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#94A3B8',
    marginBottom: 6,
    marginTop: 12,
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #1A2E4A',
    background: '#0D1320',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 12,
    cursor: 'pointer',
  },
  modalActions: {
    display: 'flex',
    gap: 10,
    marginTop: 24,
  },
  modalCancel: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid #1A2E4A',
    background: 'transparent',
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalJoin: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(180deg, #10B981, #059669)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
};
