/**
 * Waitlist Desk View — The Board
 * /commander/waitlist/desk
 * Professional Bravo Poker-style grid: black background, uniform colored headers,
 * table numbers sub-row, venue branding, scrolling ticker.
 * 4 games per page, auto-rotates every 10s if more games exist.
 * Click a player name → action buttons. Real-time via Supabase + 15s polling.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRealtimeUpdates } from '../../../src/lib/commander/useRealtimeUpdates';
import {
  RefreshCw, Loader2, Users, UserPlus, ArrowLeft,
  PhoneCall, Armchair, SkipForward, Trash2,
  MessageSquare, Phone, X
} from 'lucide-react';

// Single uniform header color — professional, classy
const HEADER_COLOR = '#B8860B';
const GAMES_PER_PAGE = 4;
const ROTATE_INTERVAL = 10000; // 10 seconds

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
  const [venueName, setVenueName] = useState('');
  const [venueLogo, setVenueLogo] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const getStaffSession = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_staff') || '' : '';

  // Load venue info
  useEffect(() => {
    try {
      const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      if (staff.venue_name) setVenueName(staff.venue_name);
      const venue = JSON.parse(localStorage.getItem('commander_venue') || '{}');
      if (venue.logo_url) setVenueLogo(venue.logo_url);
      else if (venue.logo) setVenueLogo(venue.logo);
    } catch { }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const vid = staffData.venue_id || '';
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };
      const [tabRes, wlRes] = await Promise.all([
        fetch(`/api/commander/tables?venue_id=${vid}`, { headers }),
        fetch(`/api/commander/waitlist?venue_id=${vid}`, { headers })
      ]);
      const tabJson = await tabRes.json();
      const wlJson = await wlRes.json();
      if (tabJson.success) setTables(tabJson.data?.tables || tabJson.data || []);
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

  // ── ACTION HANDLERS ─────────────────────────────────────────────
  const handleCall = async (entry) => {
    setCallLoading(entry.id); setSmsStatus(null);
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      const res = await fetch('/api/commander/waitlist/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ waitlist_id: entry.id })
      });
      const json = await res.json();
      if (json.data?.sms_sent) setSmsStatus({ type: 'sent', text: `SMS sent to ${entry.player_name}` });
      else if (json.data?.sms_status === 'no_phone') setSmsStatus({ type: 'none', text: 'No Phone — Verbal Page Only' });
      else setSmsStatus({ type: 'none', text: 'Called — SMS Unavailable' });
      setSelectedPlayer(null); await fetchData();
      setTimeout(() => setSmsStatus(null), 3000);
    } catch (err) { console.error(err); }
    finally { setCallLoading(null); }
  };

  const handleSeat = async (entry, tableNumber, seatNumber) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch('/api/commander/waitlist/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ waitlist_id: entry.id, table_number: tableNumber, seat_number: seatNumber })
      });
      setSeatModal(null); setSelectedPlayer(null); await fetchData();
    } catch (err) { console.error(err); }
  };

  const handlePass = async (entry) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch(`/api/commander/waitlist/${entry.id}/pass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession }
      });
      setSelectedPlayer(null); await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleRemove = async (entry) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      await fetch(`/api/commander/waitlist/${entry.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession }
      });
      setSelectedPlayer(null); await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleAddWalkIn = async (playerData) => {
    try {
      const token = getToken();
      const staffSession = getStaffSession();
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const parts = (playerData.game_type || 'NLH 1/3').split(' ');
      const res = await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({
          venue_id: staffData.venue_id, player_name: playerData.player_name,
          game_type: parts[0] || 'NLH', stakes: parts.slice(1).join(' ') || '1/3',
          player_phone: playerData.phone || null, signup_method: 'staff'
        })
      });
      const json = await res.json();
      if (json.success) { setShowAddWalkIn(false); await fetchData(); }
    } catch (err) { console.error(err); }
  };

  // ── GROUP & SORT ────────────────────────────────────────────────
  const waitlistByGame = {};
  waitlists.filter(w => w.status === 'waiting' || w.status === 'called').forEach(w => {
    const key = w.stakes ? `${(w.game_type || 'NLH').toUpperCase()} ${w.stakes}` : (w.game_type || 'Unknown').toUpperCase();
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

  const getTableNums = (gameLabel) => {
    const parts = gameLabel.split(' ');
    const gameType = parts[0];
    const stakes = parts.slice(1).join(' ');
    return tables
      .filter(t => {
        if (t.is_active === false || t.status === 'maintenance') return false;
        const tGame = (t.game_type || '').toUpperCase();
        const tStakes = (t.stakes || '').trim();
        if (tGame === gameType && tStakes === stakes) return true;
        if (tGame === gameType && !tStakes) return true;
        return `${tGame} ${tStakes}`.trim() === gameLabel;
      })
      .map(t => t.table_number)
      .sort((a, b) => a - b);
  };

  const breakTables = tables
    .filter(t => t.status === 'break' || t.status === 'dealer_break')
    .map(t => t.table_number)
    .sort((a, b) => a - b);

  const activeTables = tables.filter(t => t.is_active !== false && t.status !== 'maintenance');
  const totalWaiting = waitlists.filter(w => w.status === 'waiting').length;
  const gameEntries = Object.entries(waitlistByGame);

  // ── PAGINATION: 4 per page, auto-rotate ─────────────────────────
  const totalPages = Math.max(1, Math.ceil(gameEntries.length / GAMES_PER_PAGE));
  const visibleGames = gameEntries.slice(
    currentPage * GAMES_PER_PAGE,
    (currentPage + 1) * GAMES_PER_PAGE
  );

  // Auto-rotate pages every 10 seconds
  useEffect(() => {
    if (totalPages <= 1) return;
    const timer = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [totalPages]);

  // Reset page if games change
  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(0);
  }, [totalPages, currentPage]);

  // Ticker message
  const tickerParts = [];
  if (breakTables.length > 0) tickerParts.push(`BREAK ${breakTables.join('--')}`);
  tickerParts.push('Download the Smarter Poker App for live waitlist updates');
  tickerParts.push(`${totalWaiting} players currently waiting`);
  const tickerMessage = tickerParts.join('   \u00A0\u00A0\u00A0-\u00A0\u00A0\u00A0   ');

  if (loading) {
    return <div style={S.loadingWrap}><Loader2 className="animate-spin" size={32} color="#D4AF37" /></div>;
  }

  return (
    <>
      <SEOHead title="The Board — Poker Waiting List" noindex={true} />
      <div style={S.page}>

        {/* ═══ TOP BAR ═══ */}
        <div style={S.topBar}>
          <div style={S.topLeft}>
            <button onClick={() => router.back()} style={S.backBtn}>
              <ArrowLeft size={16} color="#D4AF37" />
            </button>
            {venueLogo && <img src={venueLogo} alt="" style={S.venueLogo} />}
            <span style={S.venueNameText}>{venueName || 'Poker Room'}</span>
          </div>

          <div style={S.topCenter}>
            <span style={S.titleText}>POKER WAITING LIST</span>
          </div>

          <div style={S.topRight}>
            <span style={S.poweredBy}>Powered By<br /><strong>Club Commander</strong></span>
          </div>
        </div>

        {/* ═══ CONTROLS BAR ═══ */}
        <div style={S.controls}>
          <span style={S.controlInfo}>
            {totalWaiting} waiting &bull; {gameEntries.length} game{gameEntries.length !== 1 ? 's' : ''}
            {totalPages > 1 && <span style={{ marginLeft: '8px', color: '#D4AF37' }}>Page {currentPage + 1}/{totalPages}</span>}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowAddWalkIn(true)} style={S.addBtn}>
              <UserPlus size={18} /> Add Player
            </button>
            <button onClick={() => { /* phone call-in modal placeholder */ }} style={S.addBtn}>
              <Phone size={18} /> Call-In
            </button>
            <button onClick={fetchData} style={S.refreshBtn}><RefreshCw size={18} /></button>
          </div>
        </div>

        {/* ═══ SMS TOAST ═══ */}
        {smsStatus && (
          <div style={S.toast}>
            {smsStatus.type === 'sent' ? <MessageSquare size={14} /> : <Phone size={14} />}
            {smsStatus.text}
          </div>
        )}

        {/* ═══ BRAVO GRID ═══ */}
        {gameEntries.length === 0 ? (
          <div style={S.emptyState}>
            <Users size={40} color="#333" />
            <p style={{ color: '#666', marginTop: '12px', fontSize: '16px' }}>No Players Waiting</p>
          </div>
        ) : (
          <div style={S.grid}>
            {visibleGames.map(([gameLabel, entries]) => {
              const tableNums = getTableNums(gameLabel);

              return (
                <div key={gameLabel} style={S.column}>
                  {/* Header */}
                  <div style={S.colHeader}>
                    {gameLabel}
                  </div>

                  {/* Table Numbers */}
                  <div style={S.colTableNums}>
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
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {hasApp && <span style={{ color: '#D4AF37', fontSize: '16px' }}>♦</span>}
                              <span style={{ ...S.playerName, color: isCalled ? '#D4AF37' : '#E0E0E0' }}>
                                {entry.player_name}
                              </span>
                            </span>
                            {isCalled && <span style={S.calledBadge}>CALLED</span>}
                          </div>

                          {isSelected && (
                            <div style={S.actionBar}>
                              {entry.status !== 'called' && (
                                <button onClick={(e) => { e.stopPropagation(); handleCall(entry); }}
                                  disabled={callLoading === entry.id} style={S.actionBtn}>
                                  {callLoading === entry.id ? <Loader2 size={18} className="animate-spin" /> : <PhoneCall size={18} />}
                                  Call
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); setSeatModal(entry); }} style={S.actionBtnGreen}>
                                <Armchair size={18} /> Seat
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handlePass(entry); }} style={S.actionBtn}>
                                <SkipForward size={18} /> Pass
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleRemove(entry); }} style={S.actionBtnRed}>
                                <Trash2 size={18} />
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

        {/* ═══ PAGE DOTS ═══ */}
        {totalPages > 1 && (
          <div style={S.pageDots}>
            {Array.from({ length: totalPages }, (_, i) => (
              <span
                key={i}
                onClick={() => setCurrentPage(i)}
                style={{
                  ...S.dot,
                  background: i === currentPage ? '#D4AF37' : '#333',
                  transform: i === currentPage ? 'scale(1.3)' : 'scale(1)'
                }}
              />
            ))}
          </div>
        )}

        {/* ═══ SCROLLING TICKER ═══ */}
        <div style={S.ticker}>
          <div style={S.tickerTrack}>
            <span style={S.tickerContent}>{tickerMessage}</span>
            <span style={S.tickerContent}>{tickerMessage}</span>
          </div>
        </div>

        {/* ═══ SEAT MODAL ═══ */}
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

        {/* ═══ ADD PLAYER MODAL ═══ */}
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

      <style jsx>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </>
  );
}

// ── WALK-IN FORM ──────────────────────────────────────────────────
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
              }}>{g}</button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={!name.trim() || submitting} style={S.formSubmit}>
        {submitting ? 'Adding...' : 'Add to Waitlist'}
      </button>
    </form>
  );
}

// ── STYLES ────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh', background: '#000', color: '#E0E0E0',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    display: 'flex', flexDirection: 'column'
  },
  loadingWrap: {
    minHeight: '100vh', background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },

  // ── TOP BAR ──
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px', borderBottom: '2px solid #333', background: '#050505'
  },
  topLeft: {
    display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto'
  },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
    display: 'flex', alignItems: 'center'
  },
  venueLogo: {
    height: '32px', width: 'auto', borderRadius: '4px', objectFit: 'contain'
  },
  venueNameText: {
    fontSize: '22px', fontWeight: 700, color: '#D4AF37',
    letterSpacing: '0.5px', textTransform: 'uppercase',
    maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  topCenter: { flex: 1, textAlign: 'center' },
  titleText: {
    fontSize: '36px', fontWeight: 800, color: '#D4AF37',
    letterSpacing: '4px', textTransform: 'uppercase',
    whiteSpace: 'nowrap'
  },
  topRight: {
    display: 'flex', alignItems: 'center', gap: '12px', flex: '0 0 auto'
  },
  poweredBy: {
    fontSize: '13px', color: '#666', textAlign: 'right',
    lineHeight: '1.3', letterSpacing: '0.3px', textTransform: 'uppercase'
  },

  // ── CONTROLS ──
  controls: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 16px', borderBottom: '1px solid #222', background: '#050505'
  },
  controlInfo: { fontSize: '18px', color: '#888', fontWeight: 600 },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    background: 'linear-gradient(180deg, #1a1a1a, #0a0a0a)', border: '2px solid #B8860B',
    borderRadius: '6px', color: '#D4AF37', fontSize: '16px', fontWeight: 700,
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(184,134,11,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
    textTransform: 'uppercase', letterSpacing: '0.5px'
  },
  refreshBtn: {
    display: 'flex', alignItems: 'center', padding: '8px 10px',
    background: 'linear-gradient(180deg, #1a1a1a, #0a0a0a)', border: '2px solid #555',
    borderRadius: '6px', color: '#999', cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
  },

  // ── TOAST ──
  toast: {
    margin: '6px 16px 0', padding: '6px 12px', fontSize: '12px', fontWeight: 600,
    color: '#D4AF37', background: '#0a0a0a', border: '1px solid #333',
    borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '6px'
  },

  // ── EMPTY STATE ──
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '80px 20px'
  },

  // ── GRID — columns with gaps ──
  grid: {
    flex: 1, display: 'flex', padding: '12px 16px',
    gap: '2px', alignItems: 'flex-start'
  },
  column: {
    flex: '1 1 0', minWidth: '140px',
    border: '3px solid #666', borderRadius: '4px',
    display: 'flex', flexDirection: 'column', overflow: 'hidden'
  },
  colHeader: {
    padding: '14px 10px', textAlign: 'center', fontWeight: 800,
    fontSize: '26px', color: '#fff', textTransform: 'uppercase',
    letterSpacing: '1px',
    background: `linear-gradient(180deg, #C5961F, ${HEADER_COLOR}, #8B6508)`,
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
    borderBottom: '2px solid #8B6508'
  },
  colTableNums: {
    padding: '4px 8px', textAlign: 'center', fontSize: '16px',
    color: '#999', borderBottom: '1px solid #333', background: '#0a0a0a',
    fontWeight: 600, letterSpacing: '0.5px'
  },
  colBody: { flex: 1, background: '#000' },

  // ── PLAYER ROWS ──
  playerRow: {
    padding: '8px 12px', borderBottom: '1px solid #1a1a1a',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', transition: 'background-color 0.1s'
  },
  playerName: { fontSize: '28px', fontWeight: 700, letterSpacing: '0.3px' },
  calledBadge: {
    fontSize: '14px', fontWeight: 800, color: '#000', background: '#D4AF37',
    padding: '2px 6px', borderRadius: '3px', letterSpacing: '0.5px'
  },

  // ── ACTIONS ──
  actionBar: {
    display: 'flex', padding: '8px 12px', gap: '8px',
    background: 'linear-gradient(180deg, #151515, #0a0a0a)',
    borderBottom: '2px solid #333', flexWrap: 'wrap'
  },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    borderRadius: '6px', border: '2px solid #555', fontSize: '18px',
    fontWeight: 700, cursor: 'pointer',
    background: 'linear-gradient(180deg, #2a2a2a, #1a1a1a)', color: '#ccc',
    boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
    textTransform: 'uppercase', letterSpacing: '0.5px'
  },
  actionBtnGreen: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    borderRadius: '6px', border: '2px solid #2E7D32', fontSize: '18px',
    fontWeight: 700, cursor: 'pointer',
    background: 'linear-gradient(180deg, #1a2e1a, #0a1a0a)', color: '#4CAF50',
    boxShadow: '0 3px 8px rgba(46,125,50,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
    textTransform: 'uppercase', letterSpacing: '0.5px'
  },
  actionBtnRed: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
    borderRadius: '6px', border: '2px solid #C62828', fontSize: '18px',
    fontWeight: 700, cursor: 'pointer',
    background: 'linear-gradient(180deg, #2a1a1a, #1a0a0a)', color: '#EF5350',
    boxShadow: '0 3px 8px rgba(198,40,40,0.3), inset 0 1px 0 rgba(255,255,255,0.05)'
  },

  // ── PAGE DOTS ──
  pageDots: {
    display: 'flex', justifyContent: 'center', gap: '6px',
    padding: '6px 0', background: '#050505'
  },
  dot: {
    width: '8px', height: '8px', borderRadius: '50%',
    cursor: 'pointer', transition: 'all 0.2s'
  },

  // ── TICKER ──
  ticker: {
    padding: '6px 0', borderTop: '2px solid #333', background: '#050505',
    overflow: 'hidden', whiteSpace: 'nowrap', position: 'relative'
  },
  tickerTrack: {
    display: 'inline-flex', animation: 'tickerScroll 30s linear infinite'
  },
  tickerContent: {
    fontSize: '13px', color: '#D4AF37', fontWeight: 600,
    letterSpacing: '0.5px', paddingRight: '100px', whiteSpace: 'nowrap'
  },

  // ── MODALS ──
  overlay: {
    position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
  },
  modal: {
    background: '#111', border: '1px solid #444', borderRadius: '8px',
    width: '100%', maxWidth: '420px', padding: '20px'
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px'
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
    justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#4CAF50', cursor: 'pointer'
  },

  // ── FORM ──
  formLabel: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#ccc', marginBottom: '4px' },
  formInput: {
    width: '100%', height: '40px', padding: '0 10px', background: '#1a1a1a',
    border: '1px solid #444', borderRadius: '4px', color: '#fff',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  },
  formSubmit: {
    width: '100%', height: '40px', background: '#D4AF37', color: '#000',
    borderRadius: '4px', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer'
  }
};
