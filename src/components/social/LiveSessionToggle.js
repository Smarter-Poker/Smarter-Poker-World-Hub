/**
 * LiveSessionToggle — "I'm At The Table" Status Toggle
 * ═══════════════════════════════════════════════════════════════════════════
 * Floating action button for starting/managing a live poker session.
 * Shows on user's own profile. Includes venue/game selector, profit tracker,
 * privacy controls, and LiveKit video streaming toggle.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getAccessToken } from '../../lib/authUtils';

const T = {
  bg: '#0a0a0a',
  card: '#18191a',
  border: '#3E4042',
  text: '#E4E6EB',
  textSec: '#B0B3B8',
  textDim: '#65676B',
  green: '#2ECC71',
  red: '#E74C3C',
  gold: '#FFD700',
  accent: '#4facfe',
  blue: '#3b82f6',
};

function formatDuration(startedAt) {
  if (!startedAt) return '0:00';
  const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function LiveSessionToggle({ currentUser }) {
  const [session, setSession] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState('');

  // Form state for starting a session
  const [venueName, setVenueName] = useState('');
  const [gameType, setGameType] = useState('NLH');
  const [stakes, setStakes] = useState('$1/$2');
  const [privacy, setPrivacy] = useState('friends');
  const [profitInput, setProfitInput] = useState('');

  const intervalRef = useRef(null);

  // Fetch current active session
  const fetchSession = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch('/api/social/live-session?type=mine', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { session: s } = await res.json();
        setSession(s);
        if (s) setProfitInput(String(s.current_profit || 0));
      }
    } catch (err) {
      console.warn('[LiveSession] Fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Elapsed time ticker
  useEffect(() => {
    if (session?.started_at) {
      setElapsed(formatDuration(session.started_at));
      intervalRef.current = setInterval(() => {
        setElapsed(formatDuration(session.started_at));
      }, 30000); // update every 30s
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session?.started_at]);

  const apiCall = async (body) => {
    const token = getAccessToken();
    if (!token) return null;
    const res = await fetch('/api/social/live-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.ok ? res.json() : null;
  };

  const startSession = async () => {
    if (!venueName.trim()) return;
    setLoading(true);
    const result = await apiCall({
      action: 'start',
      venue_name: venueName.trim(),
      game_type: gameType,
      stakes,
      privacy,
    });
    if (result?.session) {
      setSession(result.session);
      setProfitInput('0');
    }
    setLoading(false);
  };

  const updateProfit = async () => {
    if (!session) return;
    setLoading(true);
    const result = await apiCall({
      action: 'update',
      session_id: session.id,
      current_profit: parseInt(profitInput, 10) || 0,
    });
    if (result?.session) setSession(result.session);
    setLoading(false);
  };

  const toggleBreak = async () => {
    if (!session) return;
    setLoading(true);
    const newStatus = session.status === 'break' ? 'active' : 'break';
    const result = await apiCall({
      action: 'update',
      session_id: session.id,
      status: newStatus,
    });
    if (result?.session) setSession(result.session);
    setLoading(false);
  };

  const endSession = async () => {
    if (!session) return;
    setLoading(true);
    await apiCall({ action: 'end', session_id: session.id });
    setSession(null);
    setShowPanel(false);
    setVenueName('');
    setProfitInput('');
    setLoading(false);
  };

  if (!currentUser) return null;

  const inputStyle = {
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: 'rgba(255,255,255,0.05)',
    color: T.text,
    fontSize: 14,
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const btnStyle = (bg, color) => ({
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: color || '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    flex: 1,
  });

  return (
    <>
      {/* Floating toggle button */}
      <div
        onClick={() => setShowPanel(!showPanel)}
        style={{
          background: session
            ? `linear-gradient(135deg, ${T.green}, #27ae60)`
            : 'linear-gradient(135deg, #3b82f6, #1e40af)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: session ? `0 0 20px ${T.green}33` : '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 20 }}>
            {session ? (
              '🟢'
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5.636 18.364a9 9 0 0 1 0-12.728" />
                <path d="M18.364 5.636a9 9 0 0 1 0 12.728" />
                <path d="M8.464 15.536a5 5 0 0 1 0-7.072" />
                <path d="M15.536 8.464a5 5 0 0 1 0 7.072" />
                <circle cx="12" cy="12" r="1" />
              </svg>
            )}
          </div>
          <div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
              {session ? 'LIVE AT THE TABLE' : 'Start Live Session'}
            </div>
            {session && (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                {session.venue_name} — {session.stakes} {session.game_type} — {elapsed}
              </div>
            )}
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 18 }}>{showPanel ? '▲' : '▼'}</div>
      </div>

      {/* Expanded panel */}
      {showPanel && (
        <div
          style={{
            background: T.card,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            border: `1px solid ${T.border}`,
          }}
        >
          {!session ? (
            // === START SESSION FORM ===
            <div>
              <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                Start A Live Session
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="Venue Name (e.g. Horseshoe Casino)"
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={gameType}
                    onChange={(e) => setGameType(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="NLH">No-Limit Hold'em</option>
                    <option value="PLO">Pot-Limit Omaha</option>
                    <option value="PLO5">PLO5</option>
                    <option value="Mixed">Mixed</option>
                    <option value="Limit">Limit Hold'em</option>
                    <option value="Stud">Stud</option>
                  </select>
                  <input
                    value={stakes}
                    onChange={(e) => setStakes(e.target.value)}
                    placeholder="$1/$2"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['public', 'friends', 'invisible'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPrivacy(p)}
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        borderRadius: 8,
                        border: privacy === p ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: privacy === p ? 'rgba(79,172,254,0.1)' : 'transparent',
                        color: privacy === p ? T.accent : T.textSec,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {p === 'public' ? 'Public' : p === 'friends' ? 'Friends Only' : 'Invisible'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={startSession}
                  disabled={loading || !venueName.trim()}
                  style={btnStyle('linear-gradient(135deg, #2ECC71, #27ae60)', '#fff')}
                >
                  {loading ? 'Starting...' : 'Go Live'}
                </button>
              </div>
            </div>
          ) : (
            // === ACTIVE SESSION CONTROLS ===
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>
                    {session.venue_name}
                  </div>
                  <div style={{ color: T.textSec, fontSize: 12 }}>
                    {session.stakes} {session.game_type} — {elapsed}
                    {session.status === 'break' && (
                      <span style={{ color: T.gold, marginLeft: 6 }}>ON BREAK</span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      session.status === 'break' ? 'rgba(255,215,0,0.15)' : 'rgba(46,204,113,0.15)',
                    color: session.status === 'break' ? T.gold : T.green,
                  }}
                >
                  {session.status === 'break' ? 'BREAK' : 'LIVE'}
                </div>
              </div>

              {/* Profit tracker */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    color: T.textDim,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Current Profit
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={profitInput}
                    onChange={(e) => setProfitInput(e.target.value)}
                    style={{
                      ...inputStyle,
                      flex: 1,
                      fontSize: 18,
                      fontWeight: 700,
                      textAlign: 'center',
                      color: parseInt(profitInput, 10) >= 0 ? T.green : T.red,
                    }}
                  />
                  <button
                    onClick={updateProfit}
                    disabled={loading}
                    style={{
                      ...btnStyle('rgba(79,172,254,0.15)', T.accent),
                      flex: 0,
                      padding: '10px 16px',
                      border: `1px solid ${T.accent}44`,
                    }}
                  >
                    Update
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={toggleBreak}
                  disabled={loading}
                  style={btnStyle(
                    session.status === 'break' ? 'rgba(46,204,113,0.15)' : 'rgba(255,215,0,0.15)',
                    session.status === 'break' ? T.green : T.gold
                  )}
                >
                  {session.status === 'break' ? 'Resume' : 'Take Break'}
                </button>
                <button
                  onClick={endSession}
                  disabled={loading}
                  style={{
                    ...btnStyle('rgba(231,76,60,0.15)', T.red),
                    border: `1px solid ${T.red}44`,
                  }}
                >
                  End Session
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
