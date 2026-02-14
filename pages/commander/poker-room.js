/**
 * Poker Room Functions
 * /commander/poker-room
 * Central hub for poker room operations:
 * - Open/Close Room toggle
 * - Launch Tournament Director for active tournaments
 * - Game limits & rake configuration
 * - House rules
 * - Shift management
 * - Room status overview
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Power, PowerOff, Trophy, Clock, Users, DollarSign,
  Settings, FileText, Shield, ChevronRight, Loader2, RefreshCw,
  LayoutGrid, UserCheck, Wifi, WifiOff, AlertTriangle, CheckCircle2,
  Play, Pause, Tablet, ArrowRightLeft
} from 'lucide-react';

const STATUS_COLORS = {
  running: '#31A24C', registration: '#1877F2', registering: '#1877F2',
  paused: '#F59E0B', break: '#F59E0B', final_table: '#1877F2',
  scheduled: '#B0B3B8', completed: '#B0B3B8', cancelled: '#EF4444'
};

export default function PokerRoomFunctions() {
  const router = useRouter();
  const [roomOpen, setRoomOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch tournaments
      const tRes = await fetch('/api/commander/tournaments?status=active', { headers });
      const tJson = await tRes.json();
      if (tJson.success) setTournaments(tJson.data || []);

      // Fetch tables
      const tabRes = await fetch('/api/commander/tables', { headers });
      const tabJson = await tabRes.json();
      if (tabJson.success) {
        setTables(tabJson.data || []);
        if (tabJson.data?.[0]?.venue_id) setVenueId(tabJson.data[0].venue_id);
      }

      // Check room status from venue settings
      const vRes = await fetch('/api/commander/settings', { headers });
      const vJson = await vRes.json();
      if (vJson.success && vJson.data) {
        setRoomOpen(vJson.data.room_open || false);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const activeTournaments = tournaments.filter(t =>
    ['running', 'paused', 'break', 'final_table', 'registration', 'registering'].includes(t.status)
  );
  const upcomingTournaments = tournaments.filter(t => t.status === 'scheduled');
  const activeTables = tables.filter(t => t.status === 'active' || t.is_active);
  const totalSeated = tables.reduce((sum, t) => sum + (t.seated_count || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Head><title>Poker Room Functions | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/commander/dashboard')}
            className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
            <img src="/images/btn-back.png" alt="Back" style={{ height: 32, objectFit: 'contain' }} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Poker Room Functions</h1>
            <p className="text-xs text-[#B0B3B8]">Room operations and tournament director</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* Room Status Toggle */}
        <div className="px-4 py-4">
          <div className={`rounded-2xl border-2 p-5 flex items-center justify-between ${
            roomOpen
              ? 'bg-[#31A24C]/10 border-[#31A24C]/30'
              : 'bg-[#EF4444]/10 border-[#EF4444]/30'
          }`}>
            <div className="flex items-center gap-4">
              {roomOpen
                ? <Wifi className="w-8 h-8 text-[#31A24C]" />
                : <WifiOff className="w-8 h-8 text-[#EF4444]" />
              }
              <div>
                <h2 className="text-xl font-bold text-white">
                  Room is {roomOpen ? 'Open' : 'Closed'}
                </h2>
                <p className="text-sm text-[#B0B3B8]">
                  {roomOpen
                    ? `${activeTables.length} tables active — ${totalSeated} players seated`
                    : 'All operations paused'
                  }
                </p>
              </div>
            </div>
            <button onClick={toggleRoom} disabled={toggling}
              className={`w-16 h-16 rounded-2xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 ${
                roomOpen ? 'bg-[#EF4444]' : 'bg-[#31A24C]'
              }`}>
              {toggling
                ? <Loader2 className="w-7 h-7 text-white animate-spin" />
                : roomOpen
                  ? <PowerOff className="w-7 h-7 text-white" />
                  : <Power className="w-7 h-7 text-white" />
              }
            </button>
          </div>
        </div>

        {/* Tournament Director Section */}
        <div className="px-4 pb-2">
          <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">
            Tournament Director
          </h3>

          {activeTournaments.length > 0 ? (
            <div className="space-y-2">
              {activeTournaments.map(t => (
                <button key={t.id}
                  onClick={() => router.push(`/commander/td/${t.id}`)}
                  className="w-full bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 flex items-center gap-3 active:bg-[#3A3B3C] text-left">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${STATUS_COLORS[t.status]}20` }}>
                    <Tablet className="w-6 h-6" style={{ color: STATUS_COLORS[t.status] }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-white truncate">{t.name}</p>
                    <p className="text-xs text-[#B0B3B8]">
                      {t.status === 'running' ? 'Running' :
                       t.status === 'paused' ? 'Paused' :
                       t.status === 'break' ? 'On Break' :
                       t.status === 'final_table' ? 'Final Table' :
                       'Registration Open'}
                      {t.players_remaining !== undefined && ` — ${t.players_remaining} players`}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#B0B3B8]" />
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-6 text-center">
              <Trophy className="w-8 h-8 text-[#3A3B3C] mx-auto mb-2" />
              <p className="text-[#B0B3B8] text-sm">No active tournaments</p>
              <button onClick={() => router.push('/commander/tournaments')}
                className="mt-3 px-4 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium active:bg-[#1565D8]">
                Manage Tournaments
              </button>
            </div>
          )}

          {upcomingTournaments.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-[#B0B3B8]">Upcoming</p>
              {upcomingTournaments.slice(0, 3).map(t => (
                <button key={t.id}
                  onClick={() => router.push(`/commander/tournaments`)}
                  className="w-full bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 flex items-center gap-3 active:bg-[#3A3B3C] text-left">
                  <Clock className="w-5 h-5 text-[#B0B3B8]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#E4E6EB] truncate">{t.name}</p>
                    <p className="text-xs text-[#B0B3B8]">
                      {t.start_time ? new Date(t.start_time).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      }) : 'TBD'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#B0B3B8]" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">
            Room Management
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <QuickLink icon={LayoutGrid} label="Tables & Seats" path="/commander/tables" router={router} />
            <QuickLink icon={ArrowRightLeft} label="Must-Move" path="/commander/must-move" router={router} />
            <QuickLink icon={Users} label="Waitlist" path="/commander/waitlist" router={router} />
            <QuickLink icon={UserCheck} label="Members" path="/commander/members" router={router} />
            <QuickLink icon={Trophy} label="Tournaments" path="/commander/tournaments" router={router} />
            <QuickLink icon={DollarSign} label="Promotions" path="/commander/promotions" router={router} />
            <QuickLink icon={FileText} label="Reports" path="/commander/reports" router={router} />
            <QuickLink icon={Shield} label="Incidents" path="/commander/incidents" router={router} />
            <QuickLink icon={Settings} label="Settings" path="/commander/settings" router={router} />
          </div>
        </div>

        {/* Room Stats */}
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">
            Current Status
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <StatBlock label="Active Tables" value={activeTables.length} icon={LayoutGrid} />
            <StatBlock label="Players Seated" value={totalSeated} icon={Users} />
            <StatBlock label="Active Tournaments" value={activeTournaments.length} icon={Trophy} />
            <StatBlock label="Total Tables" value={tables.length} icon={LayoutGrid} />
          </div>
        </div>
      </div>
    </>
  );
}

function QuickLink({ icon: Icon, label, path, router }) {
  return (
    <button onClick={() => router.push(path)}
      className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 flex items-center gap-3 active:bg-[#3A3B3C] text-left">
      <Icon className="w-5 h-5 text-[#1877F2]" />
      <span className="text-sm font-medium text-[#E4E6EB]">{label}</span>
    </button>
  );
}

function StatBlock({ label, value, icon: Icon }) {
  return (
    <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 flex items-center gap-3">
      <Icon className="w-5 h-5 text-[#B0B3B8]" />
      <div>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-[10px] text-[#B0B3B8] uppercase">{label}</p>
      </div>
    </div>
  );
}
