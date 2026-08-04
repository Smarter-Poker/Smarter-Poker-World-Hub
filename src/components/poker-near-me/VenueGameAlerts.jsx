/**
 * VenueGameAlerts — "Alert me when my game drops"
 * Allows users to subscribe to push notifications when specific 
 * game types start running at their favorite venues.
 * 
 * Includes "Currently Running" live context section.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { normalizeGameName } from './normalize-game';

// Venue display names differ between poker_venues (alert rows) and the
// live-tables feed (resolveVenueName(cleanVenueName(...))). Compare on a
// punctuation/whitespace-insensitive key instead of the raw string.
function venueKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|casino|resort|hotel|poker|room|club|spa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// GAME_TYPES uses the site's short codes. normalizeGameName() recognises "NLH"
// and "PLO" but has no pattern for the bare "LHE" prefix, so "LHE 3/6" resolved
// to type 'Unknown' and could never equal the 'LHE' a live "3/6 Limit Hold'em"
// row resolves to. Expand the prefix to the long form the parser understands
// before normalizing the alert side.
const ALERT_TYPE_ALIASES = {
  LHE: 'Limit Holdem',
  NLH: 'No Limit Holdem',
  PLO: 'Pot Limit Omaha',
};

function expandAlertGameType(gameType) {
  return String(gameType || '').replace(
    /^(LHE|NLH|PLO)\b/i,
    (m) => ALERT_TYPE_ALIASES[m.toUpperCase()] || m
  );
}

export default function VenueGameAlerts({ userId, venues = [] }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [selectedGame, setSelectedGame] = useState('');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [liveGames, setLiveGames] = useState([]);
  const [liveLoading, setLiveLoading] = useState(true);

  const GAME_TYPES = ['NLH 1/2', 'NLH 1/3', 'NLH 2/5', 'NLH 5/10', 'PLO 1/2', 'PLO 1/3', 'PLO 2/5', 'LHE 3/6', 'LHE 4/8', 'LHE 6/12', 'Mixed Game'];

  // The API derives identity from the Bearer JWT and ignores any client-supplied
  // user_id, so every request must carry a fresh access token.
  const loadAlerts = useCallback(async (signal, mounted = { current: true }) => {
    if (!userId) { if (mounted.current) { setAlerts([]); setLoading(false); } return; }
    try {
      const token = await getFreshAccessToken();
      if (!token) { if (mounted.current) { setAlerts([]); setLoading(false); } return; }
      const res = await fetch('/api/poker/venue-alerts', {
        headers: { Authorization: `Bearer ${token}` },
        ...(signal ? { signal } : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!mounted.current) return;
      if (res.ok) setAlerts(d.alerts || []);
      setLoading(false);
    } catch (e) {
      if (mounted.current && e?.name !== 'AbortError') setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    const mounted = { current: true };
    if (!userId) {
      setAlerts([]);
      setLoading(false);
    } else {
      loadAlerts(controller.signal, mounted);
    }
    return () => { mounted.current = false; controller.abort(); };
  }, [loadAlerts, userId]);

  // Fetch live game data for context
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    fetch('/api/poker/live-tables', { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (!mounted) return;
        const games = [];
        (d.venues || []).forEach(v => {
          (v.games || []).forEach(g => {
            if (g.tables_running > 0) {
              // Carry the modelled-data flags through: live-tables tags every
              // estimated row with is_simulated and every venue with data_mode
              // so consumers never present modelled counts as observed reality.
              games.push({
                venue: v.venue_name,
                game: g.game || g.game_name,
                tables: g.tables_running,
                isSimulated: !!g.is_simulated,
                dataMode: v.data_mode || null,
              });
            }
          });
        });
        setLiveGames(games);
        setLiveLoading(false);
      })
      .catch(e => { if (mounted && e.name !== 'AbortError') setLiveLoading(false); });
    return () => { mounted = false; controller.abort(); };
  }, []);

  // Count unique game types currently running for quick-add buttons.
  // Rows tagged is_simulated are modelled from history, not observed, so the
  // chip is labelled "est." rather than asserted as a live table count.
  const liveGameTypes = useMemo(() => {
    const counts = {};
    liveGames.forEach(g => {
      const key = g.game || 'Unknown';
      if (!counts[key]) counts[key] = { tables: 0, observed: 0 };
      counts[key].tables += g.tables;
      if (!g.isSimulated) counts[key].observed += g.tables;
    });
    return Object.entries(counts)
      .map(([game, c]) => ({ game, count: c.tables, estimated: c.observed === 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [liveGames]);

  const hasObservedGames = useMemo(
    () => liveGames.some(g => !g.isSimulated),
    [liveGames]
  );

  const createAlert = async () => {
    if (!selectedVenue || !selectedGame || !userId) return;
    setCreating(true);
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        setFeedback({ type: 'error', msg: 'Sign in again to create alerts.' });
        setCreating(false);
        setTimeout(() => setFeedback(null), 3000);
        return;
      }
      const res = await fetch('/api/poker/venue-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ venue_name: selectedVenue, game_type: selectedGame }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback({ type: 'success', msg: data.message || 'Alert created. You will be notified when this game starts.' });
        setShowCreate(false);
        setSelectedVenue('');
        setSelectedGame('');
        loadAlerts();
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Failed to create alert' });
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Failed to create alert' });
    }
    setCreating(false);
    setTimeout(() => setFeedback(null), 3000);
  };

  const deleteAlert = async (alertId) => {
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        setFeedback({ type: 'error', msg: 'Sign in again to remove alerts.' });
        setTimeout(() => setFeedback(null), 3000);
        return;
      }
      const res = await fetch('/api/poker/venue-alerts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: alertId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ type: 'error', msg: data.error || 'Failed to remove alert' });
        setTimeout(() => setFeedback(null), 3000);
        return;
      }
      loadAlerts();
    } catch (err) {
      console.warn('Delete alert failed:', err);
      setFeedback({ type: 'error', msg: 'Failed to remove alert' });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Unique venue names from current live data
  const venueOptions = [...new Set(venues.map(v => v.venue_name || v.name).filter(Boolean))].sort();

  // Check if an alerted game is currently running.
  // Alert game types come from GAME_TYPES ("NLH 1/2"); live rows carry raw
  // scraped names ("1/2 No Limit Hold'em"). Substring matching never matched,
  // so normalize both sides and compare type (+ stakes when the alert has them).
  // Returns 'live' for observed rows, 'estimated' for modelled rows, null otherwise.
  const getRunningState = (venueName, gameType) => {
    const vKey = venueKey(venueName);
    if (!vKey || !gameType) return null;
    const want = normalizeGameName(expandAlertGameType(gameType));
    if (want.type === 'Unknown') return null;
    let estimated = false;
    for (const g of liveGames) {
      if (venueKey(g.venue) !== vKey) continue;
      const have = normalizeGameName(g.game);
      if (have.type !== want.type) continue;
      if (want.stakes && have.stakes && want.stakes !== have.stakes) continue;
      if (!g.isSimulated) return 'live';
      estimated = true;
    }
    return estimated ? 'estimated' : null;
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
      borderRadius: 16, padding: 20, border: '1px solid rgba(0,212,255,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>Game Alerts</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            background: showCreate ? 'rgba(239,68,68,0.2)' : 'rgba(0,212,255,0.15)',
            border: `1px solid ${showCreate ? 'rgba(239,68,68,0.3)' : 'rgba(0,212,255,0.3)'}`,
            borderRadius: 8, padding: '6px 14px', fontSize: 13,
            color: showCreate ? '#f87171' : '#00d4ff', cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {showCreate ? 'Cancel' : '+ New Alert'}
        </button>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
          background: feedback.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: feedback.type === 'success' ? '#4ade80' : '#f87171',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16,
          border: '1px solid rgba(0,212,255,0.1)',
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>Venue</label>
            <select
              value={selectedVenue}
              onChange={e => setSelectedVenue(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(0,212,255,0.2)',
                color: '#fff', fontSize: 14, outline: 'none',
              }}
            >
              <option value="">Select venue...</option>
              {venueOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>Game Type</label>
            <select
              value={selectedGame}
              onChange={e => setSelectedGame(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(0,212,255,0.2)',
                color: '#fff', fontSize: 14, outline: 'none',
              }}
            >
              <option value="">Select game type...</option>
              {GAME_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button
            onClick={createAlert}
            disabled={!selectedVenue || !selectedGame || creating}
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 8,
              background: selectedVenue && selectedGame ? 'linear-gradient(135deg, #00d4ff, #0099cc)' : 'rgba(100,116,139,0.3)',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: selectedVenue && selectedGame ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
            }}
          >
            {creating ? 'Creating...' : 'Create Alert'}
          </button>
        </div>
      )}

      {/* Active alerts list */}
      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 24, color: '#64748b', fontSize: 14,
        }}>
          {userId 
            ? 'No active alerts. Create one to get notified when your game drops.'
            : 'Sign in to create game alerts and get notified when your game starts running.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map(alert => {
            const state = getRunningState(alert.venue_name, alert.game_type);
            const running = state === 'live';
            const estimated = state === 'estimated';
            const dot = running ? '#4ade80' : estimated ? '#fbbf24' : '#64748b';
            return (
              <div key={alert.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                background: running ? 'rgba(34,197,94,0.06)' : estimated ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0.03)',
                border: running ? '1px solid rgba(34,197,94,0.15)' : estimated ? '1px solid rgba(251,191,36,0.15)' : '1px solid transparent',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: dot, flexShrink: 0,
                  boxShadow: running ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
                  animation: running ? 'vga-pulse 2s infinite' : 'none',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{alert.venue_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#00d4ff', fontSize: 12 }}>{alert.game_type}</span>
                    {running && (
                      <span style={{
                        fontSize: 10, color: '#4ade80', fontWeight: 700,
                        background: 'rgba(34,197,94,0.15)', padding: '1px 6px', borderRadius: 4,
                      }}>LIVE NOW</span>
                    )}
                    {estimated && (
                      <span style={{
                        fontSize: 10, color: '#fbbf24', fontWeight: 700,
                        background: 'rgba(251,191,36,0.12)', padding: '1px 6px', borderRadius: 4,
                      }} title="Modelled from historical activity, not a live count">LIKELY RUNNING (EST.)</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  style={{
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 6, padding: '4px 10px', fontSize: 12,
                    color: '#f87171', cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Currently Running Games — Live Context */}
      {!liveLoading && liveGameTypes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'rgba(200,214,229,0.5)',
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
          }}>
            {hasObservedGames ? 'Popular Games Running Now' : 'Popular Games - Estimated Activity'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {liveGameTypes.map(({ game, count, estimated }) => (
              <div key={game} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11,
                background: estimated ? 'rgba(251,191,36,0.07)' : 'rgba(0,212,255,0.08)',
                border: `1px solid ${estimated ? 'rgba(251,191,36,0.18)' : 'rgba(0,212,255,0.15)'}`,
                color: '#94a3b8', cursor: 'default',
              }} title={estimated ? 'Estimated from historical activity' : 'Reported table count'}>
                {game}{' '}
                <span style={{ color: estimated ? '#fbbf24' : '#00d4ff', fontWeight: 600 }}>
                  ({count}{estimated ? ' est.' : ''})
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(148,163,184,0.55)' }}>
            Counts marked &quot;est.&quot; are modelled from historical activity, not a live table count.
          </div>
        </div>
      )}

      <style>{`@keyframes vga-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
