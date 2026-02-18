/**
 * Waitlist Desk View — The Board
 * /commander/waitlist/desk
 * Professional Bravo Poker-style grid display.
 * Black background, white-bordered columns, cream headers, clean white player names.
 * Click a player name → action buttons. Real-time updates.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRealtimeUpdates } from '../../../src/lib/commander/useRealtimeUpdates';
import {
  RefreshCw, Loader2, Users, UserPlus, ArrowLeft,
  PhoneCall, Armchair, SkipForward, Trash2,
  MessageSquare, Phone, X
} from 'lucide-react';

export default function WaitlistDesk() {
  const router = useRouter();
  const [tables, setTables] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seatModal, setSeatModal] = useState(null);
  const [callLoading, setCallLoading] = useState(null);
  const [smsStatus, setSmsStatus] = useState(null);
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [tabRes, wlRes] = await Promise.all([
        fetch('/api/commander/tables', { headers }),
        fetch('/api/commander/waitlist', { headers })
      ]);
      const tabJson = await tabRes.json();
      const wlJson = await wlRes.json();
      if (tabJson.success) setTables(tabJson.data || []);
      if (wlJson.success) setWaitlists(wlJson.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });
  useRealtimeUpdates(venueId, () => fetchData(), !!venueId);

  const handleCall = async (entry) => {
    setCallLoading(entry.id);
    setSmsStatus(null);
    try {
      const token = getToken();
      const res = await fetch('/api/commander/waitlist/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ waitlist_id: entry.id })
      });
      const json = await res.json();
      if (json.data?.sms_sent) {
        setSmsStatus({ id: entry.id, type: 'sent', text: `SMS sent to ${entry.player_name}` });
      } else if (json.data?.sms_status === 'no_phone') {
        setSmsStatus({ id: entry.id, type: 'none', text: 'No Phone — Verbal Page Only' });
      } else {
        setSmsStatus({ id: entry.id, type: 'none', text: 'Called — SMS Unavailable' });
      }
      setSelectedPlayer(null);
      await fetchData();
      setTimeout(() => setSmsStatus(null), 3000);
    } catch (err) { console.error(err); }
    finally { setCallLoading(null); }
  };

  const handleSeat = async (entry, tableNumber, seatNumber) => {
    try {
      const token = getToken();
      await fetch('/api/commander/waitlist/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ waitlist_id: entry.id, table_number: tableNumber, seat_number: seatNumber })
      });
      setSeatModal(null);
      setSelectedPlayer(null);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handlePass = async (entry) => {
    try {
      const token = getToken();
      await fetch(`/api/commander/waitlist/${entry.id}/pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      setSelectedPlayer(null);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleRemove = async (entry) => {
    try {
      const token = getToken();
      await fetch(`/api/commander/waitlist/${entry.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedPlayer(null);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleAddWalkIn = async (playerData) => {
    try {
      const token = getToken();
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const parts = (playerData.game_type || 'NLH 1/3').split(' ');
      const res = await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          venue_id: staffData.venue_id,
          player_name: playerData.player_name,
          game_type: parts[parts.length - 1] || 'NLH',
          stakes: parts.length > 1 ? parts.slice(0, -1).join(' ') : '1/3',
          player_phone: playerData.phone || null,
          signup_method: 'staff'
        })
      });
      const json = await res.json();
      if (json.success) {
        setShowAddWalkIn(false);
        await fetchData();
      }
    } catch (err) { console.error(err); }
  };

  // Group waitlists by game type + stakes
  const waitlistByGame = {};
  waitlists.filter(w => w.status === 'waiting' || w.status === 'called').forEach(w => {
    const key = w.stakes
      ? `${(w.game_type || 'NLH').toUpperCase()} ${w.stakes}`
      : (w.game_type || 'Unknown').toUpperCase();
    if (!waitlistByGame[key]) waitlistByGame[key] = [];
    waitlistByGame[key].push(w);
  });
  Object.values(waitlistByGame).forEach(entries => {
    entries.sort((a, b) => {
      if (a.status === 'called' && b.status !== 'called') return -1;
      if (b.status === 'called' && a.status !== 'called') return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  });

  // Find matching table numbers for each game group
  const getTableNumbers = (gameType) => {
    return tables
      .filter(t => t.is_active !== false && t.status !== 'maintenance' && t.game_type === gameType)
      .map(t => t.table_number)
      .sort((a, b) => a - b);
  };

  const activeTables = tables.filter(t => t.is_active !== false && t.status !== 'maintenance');
  const totalWaiting = waitlists.filter(w => w.status === 'waiting').length;
  const gameEntries = Object.entries(waitlistByGame);

  if (loading) {
    return <div style={S.loadingWrap}><Loader2 className="animate-spin" size={32} color="#D4AF37" /></div>;
  }

  return (
    <>
      <SEOHead title="The Board — Poker Waiting List" noindex={true} />

      <div style={S.page}>
        {/* ── HEADER BAR ── */}
        <div style={S.header}>
          <button onClick={() => router.back()} style={S.backBtn}>
            <ArrowLeft size={18} color="#D4AF37" />
          </button>
          <div style={S.headerCenter}>
            <span style={S.headerTitle}>POKER WAITING LIST</span>
          </div>
          <div style={S.headerRight}>
            {/* Count boxes — one per game */}
            {gameEntries.map(([, entries], i) => (
              <span key={i} style={S.countBox}>{entries.length}</span>
            ))}
          </div>
        </div>

        {/* ── CONTROLS BAR ── */}
        <div style={S.controls}>
          <span style={S.controlInfo}>{totalWaiting} waiting &bull; {gameEntries.length} game{gameEntries.length !== 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowAddWalkIn(true)} style={S.addBtn}>
              <UserPlus size={14} /> Add Player
            </button>
            <button onClick={fetchData} style={S.refreshBtn}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* ── SMS TOAST ── */}
        {smsStatus && (
          <div style={{
            ...S.toast,
            borderColor: smsStatus.type === 'sent' ? '#4CAF50' : '#D4AF37'
          }}>
            {smsStatus.type === 'sent' ? <MessageSquare size={14} /> : <Phone size={14} />}
            {smsStatus.text}
          </div>
        )}

        {/* ── GRID ── */}
        {gameEntries.length === 0 ? (
          <div style={S.emptyState}>
            <Users size={40} color="#333" />
            <p style={{ color: '#666', marginTop: '12px', fontSize: '16px' }}>No Players Waiting</p>
          </div>
        ) : (
          <div style={S.grid}>
            {gameEntries.map(([gameLabel, entries], colIdx) => {
              // Parse game_type from label for table matching
              const gameParts = gameLabel.split(' ');
              const gameType = gameParts[gameParts.length - 1] || gameLabel;
              const tableNums = getTableNumbers(gameType);

              return (
                <div key={gameLabel} style={S.column}>
                  {/* Column Header — Game Type */}
                  <div style={S.colHeader}>
                    {gameLabel}
                  </div>

                  {/* Sub-header — Table Numbers */}
                  <div style={S.colSubHeader}>
                    {tableNums.length > 0 ? tableNums.join('-') : '—'}
                  </div>

                  {/* Player Names */}
                  <div style={S.colBody}>
                    {entries.map((entry) => {
                      const isCalled = entry.status === 'called';
                      const isSelected = selectedPlayer?.id === entry.id;
                      const hasApp = entry.signup_method === 'app';

                      return (
                        <div key={entry.id}>
                          <div
                            onClick={() => setSelectedPlayer(isSelected ? null : entry)}
                            style={{
                              ...S.playerRow,
                              backgroundColor: isCalled ? 'rgba(212,175,55,0.08)' : isSelected ? 'rgba(255,255,255,0.04)' : 'transparent'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {hasApp && <span style={{ color: '#D4AF37', fontSize: '10px' }}>♦</span>}
                              <span style={{
                                ...S.playerName,
                                color: isCalled ? '#D4AF37' : '#E0E0E0'
                              }}>
                                {entry.player_name}
                              </span>
                            </span>
                            {isCalled && <span style={S.calledBadge}>CALLED</span>}
                          </div>

                          {/* Action bar */}
                          {isSelected && (
                            <div style={S.actionBar}>
                              {entry.status !== 'called' && (
                                <button onClick={(e) => { e.stopPropagation(); handleCall(entry); }}
                                  disabled={callLoading === entry.id} style={S.actionBtn}>
                                  {callLoading === entry.id
                                    ? <Loader2 size={11} className="animate-spin" />
                                    : <PhoneCall size={11} />}
                                  Call
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); setSeatModal(entry); }} style={S.actionBtnGreen}>
                                <Armchair size={11} /> Seat
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handlePass(entry); }} style={S.actionBtn}>
                                <SkipForward size={11} /> Pass
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleRemove(entry); }} style={S.actionBtnRed}>
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── BOTTOM TICKER ── */}
        <div style={S.ticker}>
          <div style={S.tickerText}>
            ♦ Players with app notifications enabled &nbsp;&nbsp;|&nbsp;&nbsp; Auto-refresh every 15s &nbsp;&nbsp;|&nbsp;&nbsp; {totalWaiting} total waiting
          </div>
        </div>

        {/* ── SEAT MODAL ── */}
        {seatModal && (
          <div style={S.overlay} onClick={() => setSeatModal(null)}>
            <div style={S.modal} onClick={e => e.stopPropagation()}>
              <div style={S.modalHeader}>
                <div>
                  <h3 style={S.modalTitle}>Seat Player</h3>
                  <p style={S.modalSub}>{seatModal.player_name}</p>
                </div>
                <button onClick={() => setSeatModal(null)} style={S.modalClose}><X size={14} /></button>
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {activeTables.filter(t => {
                  const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
                  return seated < (t.max_seats || 9);
                }).map(table => {
                  const maxSeats = table.max_seats || 9;
                  const seats = table.seats || [];
                  const openSeats = [];
                  for (let s = 1; s <= maxSeats; s++) {
                    if (!seats.find(se => se.seat_number === s && se.status === 'occupied')) openSeats.push(s);
                  }
                  return (
                    <div key={table.table_number} style={S.modalTableGroup}>
                      <p style={S.modalTableLabel}>
                        Table {table.table_number}
                        {table.game_type && <span style={{ color: '#888' }}> — {table.game_type}</span>}
                      </p>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {openSeats.map(seat => (
                          <button key={seat} onClick={() => handleSeat(seatModal, table.table_number, seat)} style={S.seatBtn}>
                            {seat}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── ADD PLAYER MODAL ── */}
        {showAddWalkIn && (
          <div style={S.overlay} onClick={() => setShowAddWalkIn(false)}>
            <div style={S.modal} onClick={e => e.stopPropagation()}>
              <div style={S.modalHeader}>
                <h3 style={S.modalTitle}>Add Player To Waitlist</h3>
                <button onClick={() => setShowAddWalkIn(false)} style={S.modalClose}><X size={14} /></button>
              </div>
              <WalkInForm onSubmit={handleAddWalkIn} activeTables={activeTables} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── WALK-IN FORM ──────────────────────────────────────────────────────
function WalkInForm({ onSubmit, activeTables }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gameType, setGameType] = useState('NLH 1/3');
  const [submitting, setSubmitting] = useState(false);

  const gameTypes = [...new Set(activeTables.map(t => t.game_type).filter(Boolean))];
  if (gameTypes.length === 0) gameTypes.push('NLH 1/3', 'NLH 2/5', 'PLO 1/3');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    await onSubmit({ player_name: name.trim(), phone: phone.trim(), game_type: gameType });
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={S.formLabel}>Player Name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g., Mike S." autoFocus required style={S.formInput} />
      </div>
      <div>
        <label style={S.formLabel}>Phone <span style={{ color: '#555' }}>(for SMS)</span></label>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="(555) 123-4567" style={S.formInput} />
      </div>
      <div>
        <label style={S.formLabel}>Game</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {gameTypes.map(g => (
            <button key={g} type="button" onClick={() => setGameType(g)}
              style={{
                padding: '6px 14px', borderRadius: '4px', border: '1px solid #444',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: gameType === g ? '#D4AF37' : '#111',
                color: gameType === g ? '#000' : '#aaa'
              }}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={!name.trim() || submitting} style={S.formSubmit}>
        {submitting ? 'Adding...' : 'Add to Waitlist'}
      </button>
    </form>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh', background: '#000', color: '#E0E0E0',
    fontFamily: "'Inter', 'Segoe UI', sans-serif", display: 'flex', flexDirection: 'column'
  },
  loadingWrap: {
    minHeight: '100vh', background: '#000', display: 'flex',
    alignItems: 'center', justifyContent: 'center'
  },

  // Header
  header: {
    display: 'flex', alignItems: 'center', padding: '10px 16px',
    borderBottom: '1px solid #333', background: '#0a0a0a'
  },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
    display: 'flex', alignItems: 'center'
  },
  headerCenter: { flex: 1, textAlign: 'center' },
  headerTitle: {
    fontSize: '22px', fontWeight: 700, color: '#D4AF37',
    letterSpacing: '2px', textTransform: 'uppercase'
  },
  headerRight: { display: 'flex', gap: '4px', alignItems: 'center' },
  countBox: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '28px', height: '24px', fontSize: '13px', fontWeight: 700,
    color: '#fff', background: '#1a3a1a', border: '1px solid #2a5a2a',
    borderRadius: '3px'
  },

  // Controls
  controls: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 16px', borderBottom: '1px solid #222', background: '#050505'
  },
  controlInfo: { fontSize: '12px', color: '#888' },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
    background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px',
    color: '#D4AF37', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
  },
  refreshBtn: {
    display: 'flex', alignItems: 'center', padding: '5px 8px',
    background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px',
    color: '#888', cursor: 'pointer'
  },

  // Toast
  toast: {
    margin: '8px 16px 0', padding: '8px 14px', fontSize: '13px', fontWeight: 600,
    color: '#D4AF37', background: '#0a0a0a', border: '1px solid #333',
    borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px'
  },

  // Empty state
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '80px 20px'
  },

  // Grid
  grid: {
    flex: 1, display: 'flex', overflowX: 'auto', padding: '12px',
    gap: '0', alignItems: 'flex-start'
  },
  column: {
    flex: '1 1 0', minWidth: '150px', maxWidth: '260px',
    border: '1px solid #444', borderRight: 'none', display: 'flex', flexDirection: 'column'
  },
  colHeader: {
    padding: '8px 10px', textAlign: 'center', fontWeight: 700,
    fontSize: '13px', color: '#D4AF37', textTransform: 'uppercase',
    letterSpacing: '0.5px', borderBottom: '1px solid #444',
    background: '#0a0a0a'
  },
  colSubHeader: {
    padding: '4px 10px', textAlign: 'center', fontSize: '11px',
    color: '#888', borderBottom: '1px solid #333', background: '#050505'
  },
  colBody: { flex: 1, background: '#000' },

  // Player rows
  playerRow: {
    padding: '5px 10px', borderBottom: '1px solid #1a1a1a',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', transition: 'background-color 0.1s'
  },
  playerName: { fontSize: '14px', fontWeight: 500, letterSpacing: '0.2px' },
  calledBadge: {
    fontSize: '8px', fontWeight: 800, color: '#000', background: '#D4AF37',
    padding: '1px 4px', borderRadius: '2px', letterSpacing: '0.5px'
  },

  // Action bar
  actionBar: {
    display: 'flex', padding: '4px 6px', gap: '3px',
    background: '#111', borderBottom: '1px solid #222', flexWrap: 'wrap'
  },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px',
    borderRadius: '3px', border: '1px solid #333', fontSize: '10px',
    fontWeight: 600, cursor: 'pointer', background: '#1a1a1a', color: '#aaa'
  },
  actionBtnGreen: {
    display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px',
    borderRadius: '3px', border: '1px solid #2a5a2a', fontSize: '10px',
    fontWeight: 600, cursor: 'pointer', background: '#0a1a0a', color: '#4CAF50'
  },
  actionBtnRed: {
    display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px',
    borderRadius: '3px', border: '1px solid #5a2a2a', fontSize: '10px',
    fontWeight: 600, cursor: 'pointer', background: '#1a0a0a', color: '#E57373'
  },

  // Ticker
  ticker: {
    padding: '6px 16px', borderTop: '1px solid #333', background: '#050505',
    overflow: 'hidden', whiteSpace: 'nowrap'
  },
  tickerText: { fontSize: '11px', color: '#666', letterSpacing: '0.3px' },

  // Modals
  overlay: {
    position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
  },
  modal: {
    background: '#111', border: '1px solid #444', borderRadius: '8px',
    width: '100%', maxWidth: '420px', padding: '20px'
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '16px'
  },
  modalTitle: { fontSize: '16px', fontWeight: 700, color: '#D4AF37', margin: 0 },
  modalSub: { fontSize: '13px', color: '#888', margin: '2px 0 0' },
  modalClose: {
    width: '28px', height: '28px', borderRadius: '4px', background: '#222',
    border: '1px solid #444', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', color: '#888'
  },
  modalTableGroup: {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px',
    padding: '10px', marginBottom: '8px'
  },
  modalTableLabel: { fontSize: '13px', fontWeight: 600, color: '#ccc', margin: '0 0 8px' },
  seatBtn: {
    width: '36px', height: '36px', borderRadius: '4px', background: '#0a1a0a',
    border: '1px solid #2a5a2a', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '13px', fontWeight: 700,
    color: '#4CAF50', cursor: 'pointer'
  },

  // Form
  formLabel: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#ccc', marginBottom: '4px' },
  formInput: {
    width: '100%', height: '40px', padding: '0 10px', background: '#1a1a1a',
    border: '1px solid #444', borderRadius: '4px', color: '#fff',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  },
  formSubmit: {
    width: '100%', height: '40px', background: '#D4AF37', color: '#000',
    borderRadius: '4px', border: 'none', fontWeight: 700, fontSize: '14px',
    cursor: 'pointer', opacity: 1
  }
};
// Fix last column right border
if (typeof window !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    [data-desk-grid] > div:last-child { border-right: 1px solid #444 !important; }
    [data-desk-grid] > div:hover .player-row:hover { background: rgba(255,255,255,0.03); }
  `;
  if (!document.getElementById('desk-grid-fix')) {
    style.id = 'desk-grid-fix';
    document.head.appendChild(style);
  }
}
