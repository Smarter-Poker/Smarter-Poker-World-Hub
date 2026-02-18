/**
 * Waitlist Desk View — The Board (Bravo-Style)
 * /commander/waitlist/desk
 * Bravo Poker-inspired columnar waitlist display with staff action controls.
 * Each game type gets its own vertical column with player names listed underneath.
 * Click a player name to reveal action buttons (call, seat, pass, remove).
 * Real-time updates via Supabase subscriptions + 15s polling fallback.
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

const COLUMN_COLORS = [
  '#1565C0', '#7B1FA2', '#2E7D32', '#E65100',
  '#00838F', '#C62828', '#283593', '#4E342E',
  '#AD1457', '#00695C'
];

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

  // ─── ACTION HANDLERS ───────────────────────────────────────────────
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

  // ─── GROUP WAITLISTS BY GAME TYPE ──────────────────────────────────
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

  const activeTables = tables.filter(t => t.is_active !== false && t.status !== 'maintenance');
  const totalWaiting = waitlists.filter(w => w.status === 'waiting').length;

  if (loading) {
    return <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1E88E5] animate-spin" /></div>;
  }

  const gameEntries = Object.entries(waitlistByGame);

  return (
    <>
      <SEOHead title="The Board — Poker Waiting List" description="Bravo-style poker room waitlist management" noindex={true} />

      <div className="min-h-screen text-white" style={{ background: '#0D1B2A', fontFamily: "'Inter', sans-serif" }}>

        {/* ─── HEADER ─── */}
        <div style={{
          background: 'linear-gradient(180deg, #162A3E 0%, #0D1B2A 100%)',
          borderBottom: '3px solid #1E88E5',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <button onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-white/5 active:bg-white/10">
            <ArrowLeft className="w-5 h-5 text-[#90CAF9]" />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '1px', margin: 0 }}>
              POKER WAITING LIST
            </h1>
            <p style={{ fontSize: '12px', color: '#64B5F6', margin: '2px 0 0' }}>
              {totalWaiting} waiting &bull; {gameEntries.length} games
            </p>
          </div>
          <button onClick={() => setShowAddWalkIn(true)}
            className="px-4 py-2 rounded-lg bg-[#1E88E5] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#1976D2] active:bg-[#1565C0]">
            <UserPlus className="w-4 h-4" /> Add Player
          </button>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-white/5 active:bg-white/10">
            <RefreshCw className="w-5 h-5 text-[#64B5F6]" />
          </button>
        </div>

        {/* ─── SMS TOAST ─── */}
        {smsStatus && (
          <div style={{
            margin: '12px 16px 0', padding: '10px 16px', borderRadius: '8px',
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '14px', fontWeight: 600,
            background: smsStatus.type === 'sent' ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)',
            color: smsStatus.type === 'sent' ? '#4ADE80' : '#FBBF24',
            border: `1px solid ${smsStatus.type === 'sent' ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`
          }}>
            {smsStatus.type === 'sent' ? <MessageSquare size={16} /> : <Phone size={16} />}
            {smsStatus.text}
          </div>
        )}

        {/* ─── BRAVO-STYLE COLUMNS ─── */}
        {gameEntries.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
            <Users size={56} color="#1E3A5F" />
            <p style={{ fontSize: '18px', fontWeight: 600, color: '#64B5F6', marginTop: '16px' }}>No Players Waiting</p>
            <p style={{ fontSize: '14px', color: '#3A5A7C', marginTop: '4px' }}>Players will appear here when they join the waitlist</p>
          </div>
        ) : (
          <div style={{
            display: 'flex', overflowX: 'auto', padding: '16px',
            gap: '0', minHeight: 'calc(100vh - 80px)', alignItems: 'flex-start'
          }}>
            {gameEntries.map(([gameType, entries], colIdx) => {
              const color = COLUMN_COLORS[colIdx % COLUMN_COLORS.length];
              const isLast = colIdx === gameEntries.length - 1;

              return (
                <div key={gameType} style={{ flex: '1 1 0', minWidth: '160px', maxWidth: '280px', display: 'flex', flexDirection: 'column' }}>
                  {/* Column Header Tab */}
                  <div style={{
                    backgroundColor: color, padding: '10px 14px',
                    textAlign: 'center', fontWeight: 700, fontSize: '14px',
                    letterSpacing: '0.5px', textTransform: 'uppercase', color: '#fff',
                    borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.1)'
                  }}>
                    {gameType}
                  </div>

                  {/* Player List */}
                  <div style={{
                    flex: 1, backgroundColor: '#0F2640',
                    borderRight: isLast ? 'none' : '1px solid #1A3050'
                  }}>
                    {entries.map((entry) => {
                      const isCalled = entry.status === 'called';
                      const isSelected = selectedPlayer?.id === entry.id;

                      return (
                        <div key={entry.id}>
                          <div
                            onClick={() => setSelectedPlayer(isSelected ? null : entry)}
                            style={{
                              padding: '8px 12px', borderBottom: '1px solid #162D47',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              backgroundColor: isCalled ? 'rgba(251,191,36,0.12)' : isSelected ? `${color}22` : 'transparent',
                              transition: 'background-color 0.15s'
                            }}
                          >
                            <span style={{
                              fontSize: '14px', fontWeight: isCalled ? 700 : 500,
                              color: isCalled ? '#FBBF24' : '#D4D4D8',
                              textTransform: 'uppercase', letterSpacing: '0.3px'
                            }}>
                              {entry.player_name}
                            </span>
                            {isCalled && (
                              <span style={{
                                fontSize: '9px', fontWeight: 800, color: '#92400E',
                                backgroundColor: '#FBBF24', padding: '1px 5px',
                                borderRadius: '3px', letterSpacing: '0.5px'
                              }}>CALLED</span>
                            )}
                          </div>

                          {/* Action bar when selected */}
                          {isSelected && (
                            <div style={{
                              display: 'flex', padding: '6px 8px', gap: '4px',
                              backgroundColor: '#162D47', borderBottom: '1px solid #162D47',
                              flexWrap: 'wrap'
                            }}>
                              {entry.status !== 'called' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCall(entry); }}
                                  disabled={callLoading === entry.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    padding: '5px 10px', borderRadius: '4px', border: 'none',
                                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                    background: 'rgba(251,191,36,0.15)', color: '#FBBF24'
                                  }}>
                                  {callLoading === entry.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <PhoneCall size={12} />}
                                  Call
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setSeatModal(entry); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  padding: '5px 10px', borderRadius: '4px', border: 'none',
                                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                  background: 'rgba(34,197,94,0.15)', color: '#4ADE80'
                                }}>
                                <Armchair size={12} /> Seat
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePass(entry); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  padding: '5px 10px', borderRadius: '4px', border: 'none',
                                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                  background: 'rgba(107,114,128,0.15)', color: '#9CA3AF'
                                }}>
                                <SkipForward size={12} /> Pass
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemove(entry); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  padding: '5px 10px', borderRadius: '4px', border: 'none',
                                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                  background: 'rgba(239,68,68,0.15)', color: '#F87171'
                                }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer - Total Count */}
                  <div style={{
                    backgroundColor: '#0F2640', padding: '8px 12px',
                    textAlign: 'center', fontSize: '12px', fontWeight: 700,
                    color: '#64B5F6', borderTop: '2px solid #1A3050',
                    borderRight: isLast ? 'none' : '1px solid #1A3050',
                    letterSpacing: '0.5px', textTransform: 'uppercase'
                  }}>
                    Total Count: {entries.length}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── SEAT PLAYER MODAL ─── */}
        {seatModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={() => setSeatModal(null)}>
            <div style={{ background: '#162A3E', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '20px', border: '1px solid #1E3A5F' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>Seat Player</h3>
                  <p style={{ fontSize: '14px', color: '#64B5F6', margin: '2px 0 0' }}>{seatModal.player_name}</p>
                </div>
                <button onClick={() => setSeatModal(null)}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1E3A5F', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={16} color="#90CAF9" />
                </button>
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                    <div key={table.table_number} style={{ background: 'rgba(30,58,95,0.5)', borderRadius: '12px', padding: '12px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>
                        Table {table.table_number}
                        {table.game_type && <span style={{ color: '#64B5F6' }}> — {table.game_type}</span>}
                      </p>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {openSeats.map(seat => (
                          <button key={seat}
                            onClick={() => handleSeat(seatModal, table.table_number, seat)}
                            style={{
                              width: '40px', height: '40px', borderRadius: '8px',
                              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '14px', fontWeight: 700, color: '#4ADE80', cursor: 'pointer'
                            }}>
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

        {/* ─── ADD WALK-IN MODAL ─── */}
        {showAddWalkIn && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={() => setShowAddWalkIn(false)}>
            <div style={{ background: '#162A3E', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '20px', border: '1px solid #1E3A5F' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>Add Player To Waitlist</h3>
                <button onClick={() => setShowAddWalkIn(false)}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1E3A5F', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={16} color="#90CAF9" />
                </button>
              </div>
              <WalkInForm onSubmit={handleAddWalkIn} activeTables={activeTables} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Player Name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g., Mike S." autoFocus required
          style={{
            width: '100%', height: '48px', padding: '0 12px', background: '#1E3A5F',
            border: '1px solid #2A4A6F', borderRadius: '12px', color: '#fff',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box'
          }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
          Phone <span style={{ color: '#4A6A8F' }}>(for SMS)</span>
        </label>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          style={{
            width: '100%', height: '48px', padding: '0 12px', background: '#1E3A5F',
            border: '1px solid #2A4A6F', borderRadius: '12px', color: '#fff',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box'
          }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Game</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {gameTypes.map(g => (
            <button key={g} type="button" onClick={() => setGameType(g)}
              style={{
                padding: '8px 16px', borderRadius: '20px', border: 'none',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: gameType === g ? '#1E88E5' : '#1E3A5F',
                color: gameType === g ? '#fff' : '#90CAF9'
              }}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={!name.trim() || submitting}
        style={{
          width: '100%', height: '48px', background: '#1E88E5', color: '#fff',
          borderRadius: '12px', border: 'none', fontWeight: 700, fontSize: '15px',
          cursor: 'pointer', opacity: (!name.trim() || submitting) ? 0.5 : 1
        }}>
        {submitting ? 'Adding...' : 'Add to Waitlist'}
      </button>
    </form>
  );
}
