/**
 * Table Status TV Display
 * /commander/displays/tables
 * Full-screen display for TV via wireless HDMI transmitter
 * Shows: all tables, game type, stakes, players seated, open seats
 * Color-coded: green = open seats, blue = full, grey = inactive
 * Auto-refreshes every 5 seconds
 */
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';

function getSeatPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    positions.push({ x: 50 + Math.cos(angle) * 40, y: 50 + Math.sin(angle) * 38 });
  }
  return positions;
}

export default function TablesDisplay() {
  const [tables, setTables] = useState([]);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/commander/tables');
        const json = await res.json();
        if (json.success) setTables(json.data || []);
      } catch (err) { console.error(err); }
      setNow(new Date());
    };
    fetchData();
    const poll = setInterval(fetchData, 5000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  // Wake lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) { }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const goFullscreen = () => document.documentElement.requestFullscreen?.();

  const activeTables = tables.filter(t => t.is_active !== false);
  const totalSeated = activeTables.reduce((sum, t) => {
    const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
    return sum + (t.seated_count || seated);
  }, 0);
  const totalOpen = activeTables.reduce((sum, t) => {
    const max = t.max_seats || 9;
    const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
    return sum + (max - (t.seated_count || seated));
  }, 0);

  return (
    <CommanderLayout title="Table Status Display">

      <div onClick={goFullscreen}
        className="min-h-screen bg-black text-white font-['Inter'] select-none overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-[#1877F2] px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-3xl font-bold tracking-wide">TABLE STATUS</h1>
            <div className="flex gap-4">
              <span className="text-lg opacity-90">
                <strong>{activeTables.length}</strong> Tables
              </span>
              <span className="text-lg opacity-90">
                <strong>{totalSeated}</strong> Playing
              </span>
              <span className="text-lg opacity-90">
                <strong className={totalOpen > 0 ? 'text-[#31A24C]' : ''}>{totalOpen}</strong> Open
              </span>
            </div>
          </div>
          <p className="text-3xl font-mono font-bold tabular-nums">
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>

        {/* Table Grid */}
        <div className="flex-1 p-6 overflow-hidden">
          {activeTables.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-4xl font-bold text-white/15">No Active Tables</p>
            </div>
          ) : (
            <div className={`grid gap-4 h-full ${activeTables.length <= 6 ? 'grid-cols-3 grid-rows-2' :
                activeTables.length <= 9 ? 'grid-cols-3 grid-rows-3' :
                  activeTables.length <= 12 ? 'grid-cols-4 grid-rows-3' :
                    activeTables.length <= 16 ? 'grid-cols-4 grid-rows-4' :
                      'grid-cols-5 grid-rows-4'
              }`}>
              {activeTables.map(table => {
                const maxSeats = table.max_seats || 9;
                const seats = table.seats || [];
                const seated = seats.filter(s => s.status === 'occupied').length || (table.seated_count || 0);
                const open = maxSeats - seated;
                const isFull = open === 0;
                const isEmpty = seated === 0;
                const seatPositions = getSeatPositions(maxSeats);

                return (
                  <div key={table.id || table.table_number}
                    className={`relative rounded-2xl p-3 flex flex-col items-center justify-center border-2 ${isEmpty ? 'bg-white/3 border-white/10' :
                        isFull ? 'bg-[#1877F2]/10 border-[#1877F2]/30' :
                          'bg-[#31A24C]/10 border-[#31A24C]/30'
                      }`}>

                    {/* Mini seat ring */}
                    <div className="relative w-20 h-16 mb-1">
                      <div className={`absolute inset-[15%] rounded-[50%] border ${isEmpty ? 'border-white/10' : isFull ? 'border-[#1877F2]/20' : 'border-[#31A24C]/20'
                        }`} />
                      {seatPositions.map((pos, i) => {
                        const seatData = seats.find(s => s.seat_number === i + 1);
                        const isOccupied = seatData?.status === 'occupied' || i < seated;
                        return (
                          <div key={i}
                            className={`absolute w-2.5 h-2.5 rounded-full ${isOccupied ? 'bg-[#1877F2]' : 'bg-white/15'
                              }`}
                            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }} />
                        );
                      })}
                    </div>

                    {/* Table number */}
                    <p className="text-2xl font-bold text-white">T{table.table_number}</p>

                    {/* Game info */}
                    <p className="text-xs text-white/50 truncate max-w-full">
                      {table.game_type || 'NLH'} {table.stakes || ''}
                    </p>

                    {/* Seat count */}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-white/70">{seated}/{maxSeats}</span>
                      {open > 0 && (
                        <span className="text-xs font-bold text-[#31A24C] bg-[#31A24C]/20 px-2 py-0.5 rounded-full">
                          {open} OPEN
                        </span>
                      )}
                      {isFull && !isEmpty && (
                        <span className="text-xs font-bold text-[#1877F2] bg-[#1877F2]/20 px-2 py-0.5 rounded-full">
                          FULL
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-8 py-2 flex items-center justify-between">
          <p className="text-sm text-white/20">See the front desk or join the waitlist for an open seat</p>
          <p className="text-white/15 text-xs tracking-wider">Powered by Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
