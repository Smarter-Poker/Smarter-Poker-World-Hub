/**
 * Dealer Tablet
 * /commander/dealer/[tableNumber]
 * Table-level view for dealers:
 * - Current game info (type, stakes, table number)
 * - Seat map with player names and chip counts
 * - Hand counter / shuffle tracker
 * - Request Floor button
 * - Break timer
 * - Quick actions (seat open, player away, color up)
 * Designed for small tablet mounted at dealer position
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  AlertTriangle, Coffee, Hand, Hash, Loader2, RefreshCw,
  UserX, UserPlus, Clock, Bell, ChevronUp, RotateCcw
} from 'lucide-react';

function getSeatPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    positions.push({ x: 50 + Math.cos(angle) * 42, y: 50 + Math.sin(angle) * 35, seat: i + 1 });
  }
  return positions;
}

function formatChips(n) {
  if (!n) return '';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return n.toLocaleString();
}

export default function DealerTablet() {
  const router = useRouter();
  const { tableNumber } = router.query;
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [handCount, setHandCount] = useState(0);
  const [floorRequested, setFloorRequested] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [breakTimer, setBreakTimer] = useState(null);
  const [breakSeconds, setBreakSeconds] = useState(0);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const fetchTable = useCallback(async () => {
    if (!tableNumber) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/tables/by-number?tableNumber=${tableNumber}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) setTable(json.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tableNumber]);

  useEffect(() => { fetchTable(); const i = setInterval(fetchTable, 10000); return () => clearInterval(i); }, [fetchTable]);

  // Break timer countdown
  useEffect(() => {
    if (!breakTimer) return;
    const i = setInterval(() => {
      const elapsed = Math.floor((Date.now() - breakTimer) / 1000);
      setBreakSeconds(elapsed);
    }, 1000);
    return () => clearInterval(i);
  }, [breakTimer]);

  const requestFloor = async () => {
    setFloorRequested(true);
    try {
      const token = getToken();
      await fetch('/api/commander/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'floor_call',
          table_number: parseInt(tableNumber),
          description: `Floor requested at Table ${tableNumber}`,
          priority: 'normal'
        })
      });
    } catch (err) { console.error(err); }
    setTimeout(() => setFloorRequested(false), 30000);
  };

  const markSeatAction = async (seatNum, action) => {
    try {
      const token = getToken();
      await fetch(`/api/commander/tables/${tableNumber}/seats/${seatNum}`, { // TODO: wire up seats API
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      setSelectedSeat(null);
      await fetchTable();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  const seats = table?.seats || [];
  const maxSeats = table?.max_seats || 9;
  const seatPositions = getSeatPositions(maxSeats);
  const occupiedCount = seats.filter(s => s.status === 'occupied').length;

  return (
    <>
      <Head><title>Table {tableNumber} | Dealer</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] flex flex-col">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Table {tableNumber}</h1>
            <p className="text-xs text-[#B0B3B8]">
              {table?.game_type || 'No Limit Hold\'em'} —
              {table?.stakes || '$1/$2'} —
              {occupiedCount}/{maxSeats} seated
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-[#3A3B3C] rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-[#B0B3B8]" />
              <span className="text-sm font-mono font-bold text-white">{handCount}</span>
            </div>
            <button onClick={fetchTable} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>
        </div>

        {/* Seat Map */}
        <div className="flex-1 relative p-4">
          <div className="relative w-full max-w-md mx-auto aspect-[4/3]">
            {/* Table oval */}
            <div className="absolute inset-[15%] rounded-[50%] bg-[#31A24C]/10 border-2 border-[#31A24C]/30" />

            {/* Center: dealer position indicator */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-xs text-[#B0B3B8] uppercase tracking-wider">Dealer</p>
              {breakTimer && (
                <p className="text-lg font-mono font-bold text-[#F59E0B]">
                  {Math.floor(breakSeconds / 60)}:{(breakSeconds % 60).toString().padStart(2, '0')}
                </p>
              )}
            </div>

            {/* Seats */}
            {seatPositions.map(pos => {
              const seatData = seats.find(s => s.seat_number === pos.seat);
              const occupied = seatData?.status === 'occupied';
              const away = seatData?.status === 'away';
              const isSelected = selectedSeat === pos.seat;

              return (
                <button key={pos.seat}
                  onClick={() => setSelectedSeat(isSelected ? null : pos.seat)}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold border-2 ${isSelected ? 'border-[#1877F2] ring-2 ring-[#1877F2]/30' :
                      occupied ? 'bg-[#1877F2]/20 border-[#1877F2]/50 text-[#1877F2]' :
                        away ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' :
                          'bg-[#3A3B3C]/50 border-[#3A3B3C] text-[#B0B3B8]'
                    }`}>
                    {pos.seat}
                  </div>
                  {occupied && seatData?.player_name && (
                    <span className="text-[9px] text-[#B0B3B8] mt-0.5 max-w-[60px] truncate text-center">
                      {seatData.player_name.split(' ')[0]}
                    </span>
                  )}
                  {away && <span className="text-[9px] text-[#F59E0B]">Away</span>}
                </button>
              );
            })}
          </div>

          {/* Seat Action Sheet */}
          {selectedSeat && (
            <div className="absolute bottom-0 left-0 right-0 bg-[#242526] border-t border-[#3A3B3C] p-4 rounded-t-2xl shadow-xl">
              <p className="text-sm font-bold text-white mb-3">Seat {selectedSeat}</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => markSeatAction(selectedSeat, 'open')}
                  className="py-3 rounded-xl bg-[#31A24C]/10 text-[#31A24C] text-xs font-medium flex flex-col items-center gap-1 active:bg-[#31A24C]/20">
                  <UserPlus className="w-5 h-5" /> Seat Open
                </button>
                <button onClick={() => markSeatAction(selectedSeat, 'away')}
                  className="py-3 rounded-xl bg-[#F59E0B]/10 text-[#F59E0B] text-xs font-medium flex flex-col items-center gap-1 active:bg-[#F59E0B]/20">
                  <Clock className="w-5 h-5" /> Away
                </button>
                <button onClick={() => markSeatAction(selectedSeat, 'empty')}
                  className="py-3 rounded-xl bg-[#EF4444]/10 text-[#EF4444] text-xs font-medium flex flex-col items-center gap-1 active:bg-[#EF4444]/20">
                  <UserX className="w-5 h-5" /> Remove
                </button>
              </div>
              <button onClick={() => setSelectedSeat(null)}
                className="w-full mt-2 py-2 text-[#B0B3B8] text-sm active:text-white">Cancel</button>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="bg-[#242526] border-t border-[#3A3B3C] px-4 py-3 space-y-2">
          {/* Primary row */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setHandCount(h => h + 1)}
              className="py-4 rounded-xl bg-[#1877F2] text-white text-sm font-semibold flex items-center justify-center gap-2 active:bg-[#1565D8]">
              <Hash className="w-5 h-5" /> Hand +1
            </button>
            <button onClick={requestFloor} disabled={floorRequested}
              className={`py-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${floorRequested
                  ? 'bg-[#F59E0B] text-white animate-pulse'
                  : 'bg-[#EF4444] text-white active:bg-[#DC2626]'
                }`}>
              <Bell className="w-5 h-5" />
              {floorRequested ? 'Called' : 'Floor!'}
            </button>
            <button onClick={() => setBreakTimer(breakTimer ? null : Date.now())}
              className={`py-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${breakTimer
                  ? 'bg-[#F59E0B] text-white'
                  : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'
                }`}>
              <Coffee className="w-5 h-5" />
              {breakTimer ? 'On Break' : 'Break'}
            </button>
          </div>

          {/* Secondary row */}
          <div className="flex gap-2">
            <button onClick={() => setHandCount(0)}
              className="flex-1 py-2.5 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs font-medium flex items-center justify-center gap-1 active:bg-[#4A4B4C]">
              <RotateCcw className="w-3.5 h-3.5" /> Reset Hands
            </button>
            <button onClick={() => router.push('/commander/poker-room')}
              className="flex-1 py-2.5 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs font-medium active:bg-[#4A4B4C]">
              Exit Dealer View
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
