/**
 * Live Floor Map
 * /commander/floor
 * 
 * Visual overview of ALL tables in the poker room.
 * Floor managers see at a glance:
 * - Which tables are running, which are empty
 * - What game each table is spreading
 * - How many seats occupied vs open
 * - Time billing countdowns per table
 * - Waitlist demand per game type
 * 
 * Designed for large tablets / desktop monitors at the floor podium.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRealtimeUpdates } from '../../src/lib/commander/useRealtimeUpdates';
import {
  RefreshCw, Users, Clock, AlertTriangle,
  ChevronRight, Loader2, Filter, Maximize2
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_COLORS = {
  in_use: { bg: '#31A24C', label: 'Active' },
  available: { bg: '#1877F2', label: 'Open' },
  maintenance: { bg: '#6B7280', label: 'Maintenance' },
  reserved: { bg: '#F59E0B', label: 'Reserved' },
  breaking: { bg: '#EF4444', label: 'Breaking' }
};

const GAME_COLORS = {
  'NLH': '#1877F2',
  'PLO': '#31A24C',
  'Mixed': '#F59E0B',
  'Tournament': '#A855F7',
  'Omaha': '#EF4444'
};

export default function FloorMap() {
  const router = useRouter();
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState({});
  const [waitlists, setWaitlists] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, active, open, closed
  const [now, setNow] = useState(new Date());

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  useEffect(() => {
    fetchAll();
    const poll = setInterval(fetchAll, 30000); // 30s fallback — realtime handles instant updates
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  // Realtime: instant table/game updates
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });
  useRealtimeUpdates(venueId, () => fetchAll(), !!venueId);

  const fetchAll = async () => {
    try {
      const token = getToken();
      const staffSession = localStorage.getItem('commander_staff') || '';
      const headers = { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession };
      const vid = venueId || '';
      const [tablesRes, waitlistRes] = await Promise.all([
        fetch(`/api/commander/tables?venue_id=${vid}`, { headers }).then(r => r.json()),
        fetch(`/api/commander/waitlist?venue_id=${vid}`, { headers }).then(r => r.json())
      ]);
      const rawTables = Array.isArray(tablesRes.data) ? tablesRes.data : (tablesRes.data?.tables || []);
      if (tablesRes.success) setTables(rawTables);
      if (waitlistRes.success) {
        // Group waitlist by game type
        const grouped = {};
        (waitlistRes.data || []).filter(w => w.status === 'waiting').forEach(w => {
          const game = w.game_type || 'Unknown';
          grouped[game] = (grouped[game] || 0) + 1;
        });
        setWaitlists(grouped);
      }

      // Fetch active sessions per table for countdown info
      const sessionData = {};
      const activeTables = rawTables.filter(t => t.status === 'in_use');
      await Promise.all(activeTables.map(async (t) => {
        try {
          const tNum = t.table_number || t.number;
          const res = await fetch(`/api/commander/dealer/sessions?table=${tNum}`, { headers });
          const json = await res.json();
          if (json.success) sessionData[tNum] = json.data || [];
        } catch { }
      }));
      setSessions(sessionData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const filtered = tables.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  }).sort((a, b) => (a.table_number || a.number || 0) - (b.table_number || b.number || 0));

  const activeCount = tables.filter(t => t.status === 'in_use').length;
  const openCount = tables.filter(t => t.status === 'available').length;
  const totalSeats = tables.reduce((s, t) => s + (t.max_seats || t.seats || 9), 0);
  const occupiedSeats = Object.values(sessions).reduce((s, arr) => s + arr.length, 0);
  const totalWaiting = Object.values(waitlists).reduce((s, n) => s + n, 0);

  return (
    <CommanderLayout title="Floor Map" backHref="/commander/dashboard?card=floor">
      <SEOHead
        title="Commander — Floor Management"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-white">Floor Map</h1>
              <p className="text-xs text-[#B0B3B8]">
                {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
            </button>
            <button onClick={() => router.push('/commander/displays/tables')} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <Maximize2 className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-4 py-3 flex gap-2 overflow-x-auto">
          <div className="bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl px-4 py-2 min-w-0">
            <p className="text-lg font-bold text-[#31A24C]">{activeCount}</p>
            <p className="text-[10px] text-[#B0B3B8]">Active</p>
          </div>
          <div className="bg-[#1877F2]/10 border border-[#1877F2]/30 rounded-xl px-4 py-2 min-w-0">
            <p className="text-lg font-bold text-[#1877F2]">{openCount}</p>
            <p className="text-[10px] text-[#B0B3B8]">Open</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 min-w-0">
            <p className="text-lg font-bold text-white">{occupiedSeats}/{totalSeats}</p>
            <p className="text-[10px] text-[#B0B3B8]">Seats</p>
          </div>
          <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-2 min-w-0">
            <p className="text-lg font-bold text-[#F59E0B]">{totalWaiting}</p>
            <p className="text-[10px] text-[#B0B3B8]">Waiting</p>
          </div>
        </div>

        {/* Waitlist demand */}
        {Object.keys(waitlists).length > 0 && (
          <div className="px-4 pb-3">
            <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-xl px-4 py-2 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B] flex-shrink-0" />
              <div className="flex gap-3 overflow-x-auto text-sm">
                {Object.entries(waitlists).map(([game, count]) => (
                  <span key={game} className="text-[#F59E0B] whitespace-nowrap font-medium">
                    {game}: {count} waiting
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="px-4 pb-3 flex gap-2">
          {['all', 'in_use', 'available', 'reserved', 'maintenance'].map(f => {
            const filterLabel = f === 'in_use' ? 'Active' : f === 'available' ? 'Open' : f === 'maintenance' ? 'Maint.' : f;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'
                  }`}>{filterLabel} {f === 'all' ? `(${tables.length})` : ''}</button>
            );
          })}
        </div>

        {/* Table Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
          </div>
        ) : (
          <div className="px-4 pb-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map(table => {
              const tNum = table.table_number || table.number;
              const status = table.status || 'available';
              const statusConfig = STATUS_COLORS[status] || STATUS_COLORS.available;
              const gameType = table.game_type || '';
              const gameColor = GAME_COLORS[gameType] || '#B0B3B8';
              const maxSeats = table.max_seats || table.seats || 9;
              const tableSessions = sessions[tNum] || [];
              const occupied = tableSessions.length;
              const hasLowTime = tableSessions.some(s => s.is_low || s.is_critical);
              const hasExpired = tableSessions.some(s => s.is_expired);
              const lowestTime = tableSessions.length > 0
                ? Math.min(...tableSessions.map(s => s.time_remaining ?? Infinity))
                : null;

              return (
                <button key={table.id || tNum}
                  onClick={() => router.push(`/commander/dealer/${tNum}`)}
                  className={`relative bg-[#242526] border rounded-xl p-3 text-left active:bg-[#2D2E2F] ${hasExpired ? 'border-[#EF4444]/50' :
                    hasLowTime ? 'border-[#F59E0B]/50' :
                      status === 'in_use' ? 'border-[#31A24C]/30' :
                        'border-[#3A3B3C]'
                    }`}>

                  {/* Table number + status dot */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-white">T{tNum}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusConfig.bg }} />
                      <span className="text-[10px] text-[#B0B3B8]">{statusConfig.label}</span>
                    </div>
                  </div>

                  {/* Game type */}
                  {gameType && (
                    <div className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold mb-2"
                      style={{ backgroundColor: `${gameColor}15`, color: gameColor }}>
                      {gameType} {table.stakes || ''}
                    </div>
                  )}

                  {/* Seats */}
                  <div className="flex items-center gap-1 mb-1">
                    <Users className="w-3.5 h-3.5 text-[#B0B3B8]" />
                    <span className="text-sm text-white font-medium">{occupied}/{maxSeats}</span>
                    {occupied > 0 && occupied < maxSeats && (
                      <span className="text-[10px] text-[#31A24C] ml-1">{maxSeats - occupied} open</span>
                    )}
                  </div>

                  {/* Time info */}
                  {occupied > 0 && lowestTime !== null && lowestTime !== Infinity && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" style={{ color: lowestTime <= 300 ? '#EF4444' : lowestTime <= 900 ? '#F59E0B' : '#31A24C' }} />
                      <span className="text-xs" style={{ color: lowestTime <= 300 ? '#EF4444' : lowestTime <= 900 ? '#F59E0B' : '#31A24C' }}>
                        {lowestTime <= 0 ? 'EXPIRED' : `${Math.floor(lowestTime / 60)}m low`}
                      </span>
                    </div>
                  )}

                  {/* Tap indicator */}
                  <ChevronRight className="absolute bottom-2 right-2 w-4 h-4 text-white/10" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <style jsx>{`
`}</style>
    </CommanderLayout>
  );
}
