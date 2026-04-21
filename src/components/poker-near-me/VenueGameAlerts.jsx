/**
 * VenueGameAlerts — "Alert me when my game drops"
 * Allows users to subscribe to push notifications when specific 
 * game types start running at their favorite venues.
 * 
 * Includes "Currently Running" live context section.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

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

  const loadAlerts = useCallback((signal, mounted = { current: true }) => {
    if (!userId) return;
    fetch(`/api/poker/venue-alerts?user_id=${userId}`, signal ? { signal } : undefined)
      .then(r => r.json())
      .then(d => { if (mounted.current) { setAlerts(d.alerts || []); setLoading(false); } })
      .catch(e => { if (mounted.current && e.name !== 'AbortError') setLoading(false); });
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    const mounted = { current: true };
    loadAlerts(controller.signal, mounted);
    return () => { mounted.current = false; controller.abort(); };
  }, [loadAlerts]);

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
              games.push({ venue: v.venue_name, game: g.game || g.game_name, tables: g.tables_running });
            }
          });
        });
        setLiveGames(games);
        setLiveLoading(false);
      })
      .catch(e => { if (mounted && e.name !== 'AbortError') setLiveLoading(false); });
    return () => { mounted = false; controller.abort(); };
  }, []);

  // Count unique game types currently running for quick-add buttons
  const liveGameTypes = useMemo(() => {
    const counts = {};
    liveGames.forEach(g => {
      const key = g.game || 'Unknown';
      counts[key] = (counts[key] || 0) + g.tables;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [liveGames]);

  const createAlert = async () => {
    if (!selectedVenue || !selectedGame || !userId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/poker/venue-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, venue_name: selectedVenue, game_type: selectedGame }),
      });
      const data = await res.json();
      if (data.alert) {
        setFeedback({ type: 'success', msg: 'Alert created. You will be notified when this game starts.' });
        setShowCreate(false);
        setSelectedVenue('');
        setSelectedGame('');
        loadAlerts();
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Failed to create alert' });
    }
    setCreating(false);
    setTimeout(() => setFeedback(null), 3000);
  };

  const deleteAlert = async (alertId) => {
    try {
      await fetch('/api/poker/venue-alerts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, user_id: userId }),
      });
      loadAlerts();
    } catch (err) {
      console.error('Delete alert failed:', err);
    }
  };

  // Unique venue names from current live data
  const venueOptions = [...new Set(venues.map(v => v.venue_name || v.name).filter(Boolean))].sort();

  // Check if alerted game is currently running
  const isGameRunning = (venueName, gameType) => {
    return liveGames.some(g => 
      g.venue?.toLowerCase().trim() === venueName?.toLowerCase().trim() &&
      g.game?.toLowerCase().includes(gameType?.toLowerCase())
    );
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
            const running = isGameRunning(alert.venue_name, alert.game_type);
            return (
              <div key={alert.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                background: running ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
                border: running ? '1px solid rgba(34,197,94,0.15)' : '1px solid transparent',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: running ? '#4ade80' : '#64748b', flexShrink: 0,
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
            Popular Games Running Now
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {liveGameTypes.map(([game, count]) => (
              <div key={game} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11,
                background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)',
                color: '#94a3b8', cursor: 'default',
              }}>
                {game} <span style={{ color: '#00d4ff', fontWeight: 600 }}>({count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes vga-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
