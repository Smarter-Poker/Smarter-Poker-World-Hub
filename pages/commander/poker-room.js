/**
 * Poker Room Functions — Live Command Center
 * /commander/poker-room
 * Real-time room operations dashboard:
 * - Open/Close Room toggle
 * - Live table grid with game types, stakes, player counts
 * - Room statistics at a glance
 * - Quick actions for room-specific operations only
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  Power, PowerOff, Users, DollarSign,
  Settings, ChevronRight, Loader2, RefreshCw,
  LayoutGrid, Wifi, WifiOff, Clock,
  ArrowRightLeft, AlertTriangle, Zap
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

export default function PokerRoomFunctions() {
  const router = useRouter();
  const [roomOpen, setRoomOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Get settings (room open/close state + venue_id)
      const vRes = await fetch('/api/commander/settings', { headers });
      const vJson = await vRes.json();
      let vid = venueId;
      if (vJson.success && vJson.data) {
        setRoomOpen(vJson.data.room_open || false);
        vid = vJson.data.venue_id || vid;
        if (vid) setVenueId(vid);
      }

      // Fetch tables with game data
      if (vid) {
        const tabRes = await fetch(`/api/commander/tables?venue_id=${vid}`, { headers });
        const tabJson = await tabRes.json();
        if (tabJson.success) {
          const tList = tabJson.data?.tables || (Array.isArray(tabJson.data) ? tabJson.data : []);
          setTables(tList);
        }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i); }, [fetchData]);

  const toggleRoom = async () => {
    setToggling(true);
    try {
      const token = getToken();
      await fetch('/api/commander/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ room_open: !roomOpen })
      });
      setRoomOpen(!roomOpen);
    } catch (err) { console.error(err); }
    finally { setToggling(false); }
  };

  const activeTables = tables.filter(t => t.status === 'active' || t.is_active);
  const totalSeated = tables.reduce((sum, t) => sum + (t.current_players || t.seated_count || 0), 0);
  const totalCapacity = tables.reduce((sum, t) => sum + (t.max_seats || 9), 0);
  const occupancyPct = totalCapacity > 0 ? Math.round((totalSeated / totalCapacity) * 100) : 0;

  // Group tables by game type
  const gameGroups = {};
  activeTables.forEach(t => {
    const game = t.game_type || t.commander_games?.game_type || 'Cash Game';
    const stakes = t.stakes || t.commander_games?.stakes || '';
    const key = `${game}${stakes ? ` ${stakes}` : ''}`;
    if (!gameGroups[key]) gameGroups[key] = { tables: 0, players: 0 };
    gameGroups[key].tables++;
    gameGroups[key].players += (t.current_players || t.seated_count || 0);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
      </div>
    );
  }

  return (
    <CommanderLayout title="Poker Room" backHref="/commander/dashboard?card=staff">
      <>
        <SEOHead title="Commander — Poker Room" description="Club Commander Poker Room Management Tool." noindex={true} />
        <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

          {/* Room Status Banner */}
          <div className="px-4 pt-4 pb-2">
            <button onClick={toggleRoom} disabled={toggling}
              className={`w-full rounded-2xl border-2 p-5 flex items-center justify-between active:scale-[0.99] transition-transform ${roomOpen
                ? 'bg-[#31A24C]/10 border-[#31A24C]/40'
                : 'bg-[#EF4444]/10 border-[#EF4444]/40'
                }`}>
              <div className="flex items-center gap-4">
                {roomOpen
                  ? <div className="w-14 h-14 rounded-2xl bg-[#31A24C]/20 flex items-center justify-center">
                    <Wifi className="w-7 h-7 text-[#31A24C]" />
                  </div>
                  : <div className="w-14 h-14 rounded-2xl bg-[#EF4444]/20 flex items-center justify-center">
                    <WifiOff className="w-7 h-7 text-[#EF4444]" />
                  </div>
                }
                <div className="text-left">
                  <h2 className="text-xl font-bold text-white">
                    Room {roomOpen ? 'Open' : 'Closed'}
                  </h2>
                  <p className="text-sm text-[#B0B3B8]">
                    {roomOpen
                      ? `${activeTables.length} tables running • ${totalSeated} seated`
                      : 'Tap to open the room'
                    }
                  </p>
                </div>
              </div>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${roomOpen ? 'bg-[#EF4444]' : 'bg-[#31A24C]'}`}>
                {toggling
                  ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                  : roomOpen
                    ? <PowerOff className="w-6 h-6 text-white" />
                    : <Power className="w-6 h-6 text-white" />
                }
              </div>
            </button>
          </div>

          {/* Live Stats Bar */}
          <div className="px-4 py-2">
            <div className="grid grid-cols-4 gap-2">
              <StatCard value={activeTables.length} label="Active" icon={LayoutGrid} color="#1877F2" />
              <StatCard value={totalSeated} label="Players" icon={Users} color="#31A24C" />
              <StatCard value={tables.length} label="Total" icon={LayoutGrid} color="#B0B3B8" />
              <StatCard value={`${occupancyPct}%`} label="Full" icon={Zap}
                color={occupancyPct > 80 ? '#EF4444' : occupancyPct > 50 ? '#F59E0B' : '#31A24C'} />
            </div>
          </div>

          {/* Active Games Breakdown */}
          {Object.keys(gameGroups).length > 0 && (
            <div className="px-4 py-2">
              <h3 className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Active Games</h3>
              <div className="space-y-1.5">
                {Object.entries(gameGroups).map(([game, data]) => (
                  <div key={game} className="bg-[#242526] rounded-xl border border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#31A24C] animate-pulse" />
                      <span className="text-sm font-medium text-white">{game}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[#B0B3B8]">{data.tables} table{data.tables !== 1 ? 's' : ''}</span>
                      <span className="text-sm font-bold text-[#1877F2]">{data.players} <span className="text-[#B0B3B8] font-normal text-xs">players</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Table Grid */}
          <div className="px-4 py-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider">Table Floor</h3>
              <button onClick={fetchData} className="flex items-center gap-1 text-xs text-[#1877F2] active:text-[#1565D8]">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {tables.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {tables
                  .sort((a, b) => (a.table_number || 0) - (b.table_number || 0))
                  .map(table => {
                    const isActive = table.status === 'active' || table.is_active;
                    const players = table.current_players || table.seated_count || 0;
                    const maxSeats = table.max_seats || 9;
                    const fillPct = maxSeats > 0 ? Math.round((players / maxSeats) * 100) : 0;
                    const game = table.game_type || table.commander_games?.game_type || '';
                    const stakes = table.stakes || table.commander_games?.stakes || '';

                    return (
                      <button key={table.id || table.table_number}
                        onClick={() => router.push(`/commander/table/${table.id || table.table_number}`)}
                        className={`rounded-xl border p-3 text-center active:scale-[0.97] transition-transform ${isActive
                          ? 'bg-[#242526] border-[#31A24C]/30'
                          : 'bg-[#1E1F20] border-[#3A3B3C]/50 opacity-50'
                          }`}>
                        <div className="text-lg font-bold text-white">T{table.table_number}</div>
                        {isActive ? (
                          <>
                            <div className={`text-xl font-black ${fillPct >= 90 ? 'text-[#EF4444]' :
                              fillPct >= 60 ? 'text-[#F59E0B]' : 'text-[#31A24C]'
                              }`}>
                              {players}/{maxSeats}
                            </div>
                            {game && <div className="text-[9px] text-[#B0B3B8] truncate mt-0.5">{game}</div>}
                            {stakes && <div className="text-[10px] text-[#31A24C] font-medium">{stakes}</div>}
                            {/* Fill bar */}
                            <div className="mt-1.5 h-1 bg-[#3A3B3C] rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${fillPct >= 90 ? 'bg-[#EF4444]' :
                                fillPct >= 60 ? 'bg-[#F59E0B]' : 'bg-[#31A24C]'
                                }`} style={{ width: `${fillPct}%` }} />
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-[#666] mt-1">
                            {table.status === 'maintenance' ? 'Maintenance' :
                              table.status === 'reserved' ? 'Reserved' : 'Available'}
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            ) : (
              <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-8 text-center">
                <LayoutGrid className="w-10 h-10 text-[#3A3B3C] mx-auto mb-2" />
                <p className="text-[#B0B3B8] text-sm">No tables configured</p>
                <button onClick={() => router.push('/commander/tables')}
                  className="mt-3 px-4 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium active:bg-[#1565D8]">
                  Set Up Tables
                </button>
              </div>
            )}
          </div>

          {/* Quick Actions — Room-specific only */}
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction icon={LayoutGrid} label="Manage Tables" desc="Add, edit, close tables" path="/commander/tables" router={router} />
              <QuickAction icon={ArrowRightLeft} label="Must-Move" desc="Move players between games" path="/commander/must-move" router={router} />
              <QuickAction icon={Users} label="Waitlists" desc="Manage game waitlists" path="/commander/waitlist/desk" router={router} />
              <QuickAction icon={Settings} label="Room Presets" desc="Game configs & defaults" path="/commander/room-presets" router={router} />
            </div>
          </div>

          {/* Capacity Alert */}
          {occupancyPct >= 80 && roomOpen && (
            <div className="px-4 pb-4">
              <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-[#F59E0B] flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#F59E0B]">High Occupancy</p>
                  <p className="text-xs text-[#B0B3B8]">{occupancyPct}% of seats filled — consider opening more tables</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </>
    </CommanderLayout>
  );
}

function StatCard({ value, label, icon: Icon, color }) {
  return (
    <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-2.5 text-center">
      <Icon className="w-4 h-4 mx-auto mb-1" style={{ color }} />
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[9px] text-[#B0B3B8] uppercase">{label}</p>
    </div>
  );
}

function QuickAction({ icon: Icon, label, desc, path, router }) {
  return (
    <button onClick={() => router.push(path)}
      className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3.5 flex items-start gap-3 active:bg-[#3A3B3C] text-left">
      <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4.5 h-4.5 text-[#1877F2]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-[10px] text-[#B0B3B8]">{desc}</p>
      </div>
    </button>
  );
}
