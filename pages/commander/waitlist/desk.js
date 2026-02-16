/**
 * Waitlist Desk View — The Board
 * /commander/waitlist/desk
 * The main operational view for the front desk staff
 * Combines: table grid with seat rings, active waitlists, call/seat actions
 * Real-time updates, designed for desktop/tablet at the podium
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRealtimeUpdates } from '../../../src/lib/commander/useRealtimeUpdates';
import {
  RefreshCw, Loader2, Users, Phone, UserPlus,
  ChevronRight, Clock, CheckCircle2, X, AlertTriangle,
  Armchair, PhoneCall, MessageSquare, ChevronDown, SkipForward, Trash2
} from 'lucide-react';
import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';

function getSeatPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    positions.push({ x: 50 + Math.cos(angle) * 40, y: 50 + Math.sin(angle) * 30, seat: i + 1 });
  }
  return positions;
}

export default function WaitlistDesk() {
  const router = useRouter();
  const [tables, setTables] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [seatModal, setSeatModal] = useState(null);
  const [callLoading, setCallLoading] = useState(null);

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
    const interval = setInterval(fetchData, 30000); // 30s fallback — realtime handles instant updates
    return () => clearInterval(interval);
  }, [fetchData]);

  // Realtime: instant updates when waitlist/tables change
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });
  useRealtimeUpdates(venueId, () => fetchData(), !!venueId);

  const [smsStatus, setSmsStatus] = useState(null);
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);

  const handleCall = async (waitlistEntry) => {
    setCallLoading(waitlistEntry.id);
    setSmsStatus(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/waitlist/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ waitlist_id: waitlistEntry.id })
      });
      const json = await res.json();
      if (json.data?.sms_sent) {
        setSmsStatus({ id: waitlistEntry.id, type: 'sent', text: `SMS sent to ${waitlistEntry.player_name}` });
      } else if (json.data?.sms_status === 'no_phone') {
        setSmsStatus({ id: waitlistEntry.id, type: 'none', text: 'No phone — verbal page only' });
      } else {
        setSmsStatus({ id: waitlistEntry.id, type: 'none', text: 'Called — SMS unavailable' });
      }
      await fetchData();
      setTimeout(() => setSmsStatus(null), 3000);
    } catch (err) { console.error(err); }
    finally { setCallLoading(null); }
  };

  const handleSeat = async (waitlistEntry, tableNumber, seatNumber) => {
    try {
      const token = getToken();
      await fetch(`/api/commander/waitlist/seat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          waitlist_id: waitlistEntry.id,
          table_number: tableNumber,
          seat_number: seatNumber
        })
      });
      setSeatModal(null);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handlePass = async (waitlistEntry) => {
    try {
      const token = getToken();
      await fetch(`/api/commander/waitlist/${waitlistEntry.id}/pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleRemove = async (waitlistEntry) => {
    try {
      const token = getToken();
      await fetch(`/api/commander/waitlist/${waitlistEntry.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleAddWalkIn = async (playerData) => {
    try {
      const token = getToken();
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const res = await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          venue_id: staffData.venue_id,
          player_name: playerData.player_name,
          game_type: playerData.game_type?.split(' ')[0] || 'NLH',
          stakes: playerData.game_type?.split(' ').slice(1).join(' ') || '1/3',
          player_phone: playerData.phone || null,
          party_size: playerData.party_size || 1,
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

  // Group waitlists by game type + stakes (TC shows "NLH 1/2", not just "NLH")
  const waitlistByGame = {};
  waitlists.filter(w => w.status === 'waiting' || w.status === 'called').forEach(w => {
    const key = w.stakes ? `${w.game_type || 'Unknown'} ${w.stakes}` : (w.game_type || 'Unknown');
    if (!waitlistByGame[key]) waitlistByGame[key] = [];
    waitlistByGame[key].push(w);
  });

  const activeTables = tables.filter(t => t.is_active !== false && t.status !== 'maintenance');

  if (loading) {
    return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;
  }

  return (
    <>
      <SEOHead
                title="Commander — Desk"
                description="Club Commander poker room management tool."
                noindex={true}
            />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">The Board</h1>
            <p className="text-xs text-[#B0B3B8]">
              {activeTables.length} tables — {waitlists.filter(w => w.status === 'waiting').length} waiting
            </p>
          </div>
          <button onClick={() => setShowAddWalkIn(true)}
            className="px-3 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium flex items-center gap-1.5 active:bg-[#1565D8]">
            <UserPlus className="w-4 h-4" /> Add Player
          </button>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* SMS notification toast */}
        {smsStatus && (
          <div className={`mx-4 mt-2 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all ${smsStatus.type === 'sent' ? 'bg-[#31A24C]/15 text-[#31A24C]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'
            }`}>
            {smsStatus.type === 'sent' ? <MessageSquare className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            {smsStatus.text}
          </div>
        )}

        <div className="flex flex-col lg:flex-row">
          {/* LEFT: Table Grid */}
          <div className="flex-1 p-4">
            <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-3">Tables</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {activeTables.map(table => {
                const maxSeats = table.max_seats || 9;
                const seats = table.seats || [];
                const seatedCount = seats.filter(s => s.status === 'occupied').length;
                const seatPositions = getSeatPositions(maxSeats);

                return (
                  <button key={table.id || table.table_number}
                    onClick={() => setSelectedTable(table)}
                    className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 aspect-square flex flex-col items-center justify-center active:bg-[#3A3B3C] relative">
                    {/* Seat ring */}
                    <div className="relative w-full h-full">
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[10px] text-[#B0B3B8] uppercase">Table</span>
                        <span className="text-2xl font-bold text-white">{table.table_number}</span>
                        <span className="text-xs text-[#B0B3B8]">{seatedCount}/{maxSeats}</span>
                        {table.game_type && (
                          <span className="text-[9px] text-[#1877F2] mt-0.5">{table.game_type}</span>
                        )}
                      </div>
                      {seatPositions.map(pos => {
                        const seatData = seats.find(s => s.seat_number === pos.seat);
                        const occupied = seatData?.status === 'occupied';
                        return (
                          <div key={pos.seat}
                            className={`absolute w-3.5 h-3.5 rounded-full border-2 ${occupied ? 'bg-[#31A24C] border-[#31A24C]/50' : 'bg-transparent border-[#3A3B3C]'
                              }`}
                            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                          />
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Waitlists */}
          <div className="lg:w-96 lg:border-l border-[#3A3B3C] p-4">
            <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-3">Waitlists</h2>

            {Object.keys(waitlistByGame).length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-[#3A3B3C] mx-auto mb-2" />
                <p className="text-sm text-[#B0B3B8]">No Players Waiting</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(waitlistByGame).map(([gameType, entries]) => (
                  <div key={gameType}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-white">{gameType}</h3>
                      <span className="text-xs text-[#B0B3B8] bg-[#3A3B3C] px-2 py-0.5 rounded-full">{entries.length}</span>
                    </div>
                    <div className="space-y-1">
                      {entries.map((entry, idx) => (
                        <div key={entry.id}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${entry.status === 'called'
                              ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30'
                              : 'bg-[#242526] border-[#3A3B3C]'
                            }`}>
                          <span className="w-6 h-6 rounded-full bg-[#3A3B3C] flex items-center justify-center text-xs font-bold text-[#B0B3B8]">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#E4E6EB] truncate">{entry.player_name}</p>
                            <p className="text-[10px] text-[#B0B3B8]">
                              {entry.status === 'called' ? 'Called' : 'Waiting'}
                              {entry.wait_time && ` — ${entry.wait_time}m`}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            {entry.status !== 'called' && (
                              <button onClick={() => handleCall(entry)}
                                disabled={callLoading === entry.id}
                                className="w-9 h-9 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center active:bg-[#F59E0B]/20 disabled:opacity-50"
                                title="Call player">
                                {callLoading === entry.id
                                  ? <Loader2 className="w-4 h-4 text-[#F59E0B] animate-spin" />
                                  : <PhoneCall className="w-4 h-4 text-[#F59E0B]" />
                                }
                              </button>
                            )}
                            <button onClick={() => setSeatModal(entry)}
                              className="w-9 h-9 rounded-lg bg-[#31A24C]/10 flex items-center justify-center active:bg-[#31A24C]/20"
                              title="Seat player">
                              <Armchair className="w-4 h-4 text-[#31A24C]" />
                            </button>
                            <button onClick={() => handlePass(entry)}
                              className="w-9 h-9 rounded-lg bg-[#6B7280]/10 flex items-center justify-center active:bg-[#6B7280]/20"
                              title="Pass">
                              <SkipForward className="w-4 h-4 text-[#6B7280]" />
                            </button>
                            <button onClick={() => handleRemove(entry)}
                              className="w-9 h-9 rounded-lg bg-[#EF4444]/10 flex items-center justify-center active:bg-[#EF4444]/20"
                              title="Remove from list">
                              <Trash2 className="w-4 h-4 text-[#EF4444]" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Seat Player Modal */}
        {seatModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end lg:items-center justify-center p-4"
            onClick={() => setSeatModal(null)}>
            <div className="bg-[#242526] rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Seat Player</h3>
                  <p className="text-sm text-[#B0B3B8]">{seatModal.player_name}</p>
                </div>
                <button onClick={() => setSeatModal(null)}
                  className="w-8 h-8 rounded-full bg-[#3A3B3C] flex items-center justify-center">
                  <X className="w-4 h-4 text-[#B0B3B8]" />
                </button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {activeTables.filter(t => {
                  const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
                  return seated < (t.max_seats || 9);
                }).map(table => {
                  const maxSeats = table.max_seats || 9;
                  const seats = table.seats || [];
                  const openSeats = [];
                  for (let s = 1; s <= maxSeats; s++) {
                    if (!seats.find(se => se.seat_number === s && se.status === 'occupied')) {
                      openSeats.push(s);
                    }
                  }
                  return (
                    <CommanderLayout title="The Board" backHref="/commander/dashboard">
                      <div key={table.table_number} className="bg-[#3A3B3C]/50 rounded-xl p-3">
                        <p className="text-sm font-medium text-white mb-2">
                          Table {table.table_number}
                          {table.game_type && <span className="text-[#B0B3B8]"> — {table.game_type}</span>}
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          {openSeats.map(seat => (
                            <button key={seat}
                              onClick={() => handleSeat(seatModal, table.table_number, seat)}
                              className="w-10 h-10 rounded-lg bg-[#31A24C]/10 border border-[#31A24C]/30 flex items-center justify-center text-sm font-bold text-[#31A24C] active:bg-[#31A24C]/20">
                              {seat}
                            </button>
                          ))}
                        </div>
                      </div>
                    </CommanderLayout>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Add Walk-In Modal */}
        {showAddWalkIn && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end lg:items-center justify-center p-4"
            onClick={() => setShowAddWalkIn(false)}>
            <div className="bg-[#242526] rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Add Player to Waitlist</h3>
                <button onClick={() => setShowAddWalkIn(false)}
                  className="w-8 h-8 rounded-full bg-[#3A3B3C] flex items-center justify-center">
                  <X className="w-4 h-4 text-[#B0B3B8]" />
                </button>
              </div>
              <WalkInForm
                onSubmit={handleAddWalkIn}
                activeTables={activeTables}
              />
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
`}</style>
    </>
  );
}

function WalkInForm({ onSubmit, activeTables }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gameType, setGameType] = useState('NLH 1/3');
  const [submitting, setSubmitting] = useState(false);

  // Derive game types from active tables
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-white mb-1">Player Name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g., Mike S." autoFocus required
          className="w-full h-12 px-3 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-white placeholder-[#6A6B6D] focus:border-[#1877F2] outline-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1">Phone <span className="text-[#6A6B6D]">(for SMS)</span></label>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full h-12 px-3 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-white placeholder-[#6A6B6D] focus:border-[#1877F2] outline-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1">Game</label>
        <div className="flex flex-wrap gap-2">
          {gameTypes.map(g => (
            <button key={g} type="button" onClick={() => setGameType(g)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${gameType === g ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={!name.trim() || submitting}
        className="w-full h-12 bg-[#1877F2] text-white rounded-xl font-semibold disabled:opacity-50">
        {submitting ? 'Adding...' : 'Add to Waitlist'}
      </button>
    </form>
  );
}
