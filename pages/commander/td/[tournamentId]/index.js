/**
 * Tournament Director — Control Center
 * /commander/td/[tournamentId]
 * Main command screen for the TD holding a tablet on the floor
 * Shows: tournament header, clock, stats, alerts, activity feed
 * Bottom nav bar links to Tables, Players, Balance, Register, Clock screens
 * UI: Dark theme, Facebook colors, Inter font, 44px+ touch targets
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import {
  Play, Pause, SkipForward, SkipBack, Trophy, Users, DollarSign,
  Clock, AlertTriangle, ChevronRight, RefreshCw, Loader2,
  LayoutGrid, UserCheck, Scale, UserPlus, Monitor,
  Hand, Star, Coffee, MessageSquare, Volume2
} from 'lucide-react';

const STATUS_CONFIG = {
  scheduled: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', border: 'border-[#B0B3B8]/30', label: 'Scheduled' },
  registration: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', border: 'border-[#1877F2]/30', label: 'Registration' },
  registering: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', border: 'border-[#1877F2]/30', label: 'Registration' },
  running: { bg: 'bg-[#31A24C]/10', text: 'text-[#31A24C]', border: 'border-[#31A24C]/30', label: 'Running' },
  paused: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30', label: 'Paused' },
  break: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30', label: 'On Break' },
  final_table: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', border: 'border-[#1877F2]/30', label: 'Final Table' },
  hand_for_hand: { bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', border: 'border-[#EF4444]/30', label: 'Hand For Hand' },
  completed: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', border: 'border-[#B0B3B8]/30', label: 'Completed' },
  cancelled: { bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', border: 'border-[#EF4444]/30', label: 'Cancelled' }
};

const NAV_ITEMS = [
  { key: 'control', icon: Trophy, label: 'Control' },
  { key: 'tables', icon: LayoutGrid, label: 'Tables' },
  { key: 'players', icon: Users, label: 'Players' },
  { key: 'balance', icon: Scale, label: 'Balance' },
  { key: 'register', icon: UserPlus, label: 'Register' },
  { key: 'clock', icon: Monitor, label: 'Clock' },
];

function formatChips(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return n.toLocaleString();
}

function formatMoney(n) {
  if (!n) return '$0';
  return '$' + n.toLocaleString();
}

function formatClockTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBlinds(blinds) {
  if (!blinds) return '--/--';
  const { small_blind, big_blind, ante } = blinds;
  let str = `${formatChips(small_blind)}/${formatChips(big_blind)}`;
  if (ante) str += ` (${formatChips(ante)})`;
  return str;
}

export default function TDControlCenter() {
  const router = useRouter();
  const { tournamentId } = router.query;
  const [floor, setFloor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clockAction, setClockAction] = useState(null);
  const [clockSeconds, setClockSeconds] = useState(null);
  const [messageModal, setMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  const getToken = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
    }
    return null;
  }, []);

  const fetchFloor = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/floor-view`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setFloor(json.data);
        // Sync clock seconds from server
        const cs = json.data.clock?.clock_state;
        if (cs?.remaining_seconds !== undefined) {
          setClockSeconds(cs.remaining_seconds);
        }
        setError(null);
      } else {
        setError(json.error);
      }
    } catch (err) {
      setError('Failed to load tournament data');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, getToken]);

  // Initial load + polling every 5 seconds
  useEffect(() => {
    fetchFloor();
    pollRef.current = setInterval(fetchFloor, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchFloor]);

  // Client-side countdown
  useEffect(() => {
    const cs = floor?.clock?.clock_state;
    if (cs?.status === 'running' && clockSeconds > 0) {
      timerRef.current = setInterval(() => {
        setClockSeconds(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [floor?.clock?.clock_state?.status, clockSeconds]);

  const handleClockAction = async (action) => {
    setClockAction(action);
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/clock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      const json = await res.json();
      if (json.success) {
        await fetchFloor();
      }
    } catch (err) {
      console.error('Clock action failed:', err);
    } finally {
      setClockAction(null);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    setSendingMessage(true);
    try {
      const token = getToken();
      await fetch(`/api/commander/tournaments/${tournamentId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: messageText, type: 'announcement', duration_seconds: 60 })
      });
      setMessageText('');
      setMessageModal(false);
    } catch (err) {
      console.error('Send message failed:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleHandForHand = async () => {
    const isActive = floor?.alerts?.hand_for_hand;
    try {
      const token = getToken();
      await fetch(`/api/commander/tournaments/${tournamentId}/hand-for-hand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !isActive })
      });
      await fetchFloor();
    } catch (err) {
      console.error('H4H toggle failed:', err);
    }
  };

  const navigateTo = (screen) => {
    if (screen === 'control') return;
    router.push(`/commander/td/${tournamentId}/${screen}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
      </div>
    );
  }

  if (error || !floor) {
    return (
      <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-4">
        <div className="bg-[#242526] rounded-xl p-6 text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-[#F59E0B] mx-auto mb-3" />
          <p className="text-[#E4E6EB] text-lg mb-4">{error || 'Tournament not found'}</p>
          <button onClick={() => router.push('/commander/tournaments')}
            className="px-6 py-3 bg-[#1877F2] text-white rounded-lg text-base font-medium">
            Back to Tournaments
          </button>
        </div>
      </div>
    );
  }

  const { tournament, clock, stats, alerts, tables } = floor;
  const statusConf = STATUS_CONFIG[tournament.status] || STATUS_CONFIG.scheduled;
  const clockState = clock?.clock_state || {};
  const isRunning = clockState.status === 'running';
  const isPaused = clockState.status === 'paused';
  const displaySeconds = clockSeconds ?? clockState.remaining_seconds ?? 0;

  return (
    <>
      <SEOHead
                title="Commander — Index"
                description="Club Commander Poker Room Management Tool."
                noindex={true}
            />

      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] pb-20 font-['Inter']">

        {/* ===== TOURNAMENT HEADER ===== */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-white truncate">{tournament.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConf.bg} ${statusConf.text}`}>
                  {statusConf.label}
                </span>
                {alerts.hand_for_hand && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#EF4444]/10 text-[#EF4444]">
                    H4H
                  </span>
                )}
                {alerts.on_break && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#F59E0B]/10 text-[#F59E0B]">
                    Break
                  </span>
                )}
              </div>
            </div>
            <button onClick={fetchFloor} className="p-2 rounded-lg hover:bg-[#3A3B3C] active:bg-[#4A4B4C]">
              <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>
        </div>

        {/* ===== ALERT BANNER ===== */}
        {(alerts.imbalanced || alerts.can_break_table || stats.late_reg_open) && (
          <div className="px-4 py-2 space-y-2">
            {alerts.imbalanced && (
              <button onClick={() => navigateTo('balance')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-[#EF4444] flex-shrink-0" />
                <span className="text-[#EF4444] text-sm font-medium flex-1 text-left">Tables Are Imbalanced</span>
                <ChevronRight className="w-4 h-4 text-[#EF4444]" />
              </button>
            )}
            {alerts.can_break_table && (
              <button onClick={() => navigateTo('balance')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl">
                <LayoutGrid className="w-5 h-5 text-[#F59E0B] flex-shrink-0" />
                <span className="text-[#F59E0B] text-sm font-medium flex-1 text-left">A Table Can Be Broken</span>
                <ChevronRight className="w-4 h-4 text-[#F59E0B]" />
              </button>
            )}
            {stats.late_reg_open && (
              <div className="flex items-center gap-3 px-4 py-3 bg-[#1877F2]/10 border border-[#1877F2]/30 rounded-xl">
                <UserPlus className="w-5 h-5 text-[#1877F2] flex-shrink-0" />
                <span className="text-[#1877F2] text-sm font-medium">
                  Late registration open — {stats.levels_until_late_reg_closes} level{stats.levels_until_late_reg_closes !== 1 ? 's' : ''} remaining
                </span>
              </div>
            )}
          </div>
        )}

        {/* ===== CLOCK DISPLAY ===== */}
        <div className="px-4 py-3">
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
            {/* Level + Blinds */}
            <div className="text-center mb-3">
              <p className="text-[#B0B3B8] text-xs uppercase tracking-wider mb-1">
                Level {(clock.current_level || 0) + 1} of {clock.total_levels || '--'}
              </p>
              <p className="text-2xl font-bold text-white">
                {formatBlinds(clock.current_blinds)}
              </p>
              {clock.next_blinds && (
                <p className="text-xs text-[#B0B3B8] mt-1">
                  Next: {formatBlinds(clock.next_blinds)}
                </p>
              )}
            </div>

            {/* Countdown */}
            <div className="text-center mb-4">
              <p className={`text-5xl font-mono font-bold tabular-nums ${
                displaySeconds <= 60 ? 'text-[#EF4444]' :
                displaySeconds <= 120 ? 'text-[#F59E0B]' : 'text-white'
              }`}>
                {formatClockTime(displaySeconds)}
              </p>
            </div>

            {/* Clock Controls — large touch targets */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => handleClockAction('prev_level')}
                disabled={!!clockAction}
                className="w-14 h-14 rounded-xl bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C] disabled:opacity-50"
              >
                <SkipBack className="w-6 h-6 text-[#E4E6EB]" />
              </button>

              {isRunning ? (
                <button
                  onClick={() => handleClockAction('pause')}
                  disabled={!!clockAction}
                  className="w-20 h-20 rounded-2xl bg-[#F59E0B] flex items-center justify-center active:bg-[#D97706] disabled:opacity-50"
                >
                  {clockAction === 'pause'
                    ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                    : <Pause className="w-8 h-8 text-white" />
                  }
                </button>
              ) : (
                <button
                  onClick={() => handleClockAction(isPaused ? 'resume' : 'start')}
                  disabled={!!clockAction}
                  className="w-20 h-20 rounded-2xl bg-[#31A24C] flex items-center justify-center active:bg-[#28883F] disabled:opacity-50"
                >
                  {clockAction === 'start' || clockAction === 'resume'
                    ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                    : <Play className="w-8 h-8 text-white ml-1" />
                  }
                </button>
              )}

              <button
                onClick={() => handleClockAction('next_level')}
                disabled={!!clockAction}
                className="w-14 h-14 rounded-xl bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C] disabled:opacity-50"
              >
                <SkipForward className="w-6 h-6 text-[#E4E6EB]" />
              </button>
            </div>

            {/* Quick actions row */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={handleHandForHand}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                  alerts.hand_for_hand
                    ? 'bg-[#EF4444] text-white'
                    : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
                }`}
              >
                <Hand className="w-3.5 h-3.5" />
                {alerts.hand_for_hand ? 'End H4H' : 'Hand 4 Hand'}
              </button>

              <button
                onClick={() => handleClockAction('add_time')}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]"
              >
                +1 min
              </button>

              <button
                onClick={() => handleClockAction('subtract_time')}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]"
              >
                -1 min
              </button>

              <button
                onClick={() => setMessageModal(true)}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C] flex items-center gap-1.5"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Announce
              </button>
            </div>
          </div>
        </div>

        {/* ===== STATS GRID ===== */}
        <div className="px-4 py-2">
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={Users} label="Remaining" value={stats.players_remaining} color="#31A24C" />
            <StatCard icon={Trophy} label="Entries" value={stats.total_entries} color="#1877F2" />
            <StatCard icon={DollarSign} label="Prize Pool" value={formatMoney(stats.prize_pool)} color="#F59E0B" />
            <StatCard icon={RefreshCw} label="Rebuys" value={stats.total_rebuys} color="#B0B3B8" />
            <StatCard icon={Star} label="Add-Ons" value={stats.total_addons} color="#B0B3B8" />
            <StatCard icon={DollarSign} label="Avg Stack" value={formatChips(stats.average_stack)} color="#B0B3B8" />
          </div>
        </div>

        {/* ===== TABLES OVERVIEW (compact) ===== */}
        <div className="px-4 py-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider">
              Tables ({stats.tables_active})
            </h2>
            <button onClick={() => navigateTo('tables')}
              className="text-xs text-[#1877F2] font-medium flex items-center gap-1">
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {tables.map(table => (
              <button key={table.table_number}
                onClick={() => navigateTo('tables')}
                className={`flex-shrink-0 w-20 h-20 rounded-xl border flex flex-col items-center justify-center ${
                  table.color === 'red' ? 'bg-[#EF4444]/10 border-[#EF4444]/30' :
                  table.color === 'yellow' ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30' :
                  table.color === 'blue' ? 'bg-[#1877F2]/10 border-[#1877F2]/30' :
                  'bg-[#242526] border-[#3A3B3C]'
                }`}
              >
                <span className="text-xs text-[#B0B3B8]">Table</span>
                <span className="text-lg font-bold text-white">{table.table_number}</span>
                <span className={`text-xs font-medium ${
                  table.color === 'red' ? 'text-[#EF4444]' :
                  table.color === 'yellow' ? 'text-[#F59E0B]' :
                  'text-[#B0B3B8]'
                }`}>
                  {table.player_count}/{table.max_seats}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ===== RECENT ELIMINATIONS ===== */}
        {floor.eliminated && floor.eliminated.length > 0 && (
          <div className="px-4 py-2">
            <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">
              Recent Eliminations
            </h2>
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] divide-y divide-[#3A3B3C]">
              {floor.eliminated.slice(0, 5).map((e, i) => (
                <div key={e.entry_id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#B0B3B8] w-6 text-right">
                      {e.finish_position ? `#${e.finish_position}` : '--'}
                    </span>
                    <span className="text-sm text-[#E4E6EB]">{e.player_name}</span>
                  </div>
                  {e.payout_amount > 0 && (
                    <span className="text-sm font-medium text-[#31A24C]">
                      {formatMoney(e.payout_amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== BROADCAST MESSAGE MODAL ===== */}
        {messageModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4"
            onClick={() => setMessageModal(false)}>
            <div className="bg-[#242526] rounded-2xl w-full max-w-lg p-5 space-y-4"
              onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white">Broadcast Announcement</h3>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder="Enter Message For Clock Displays..."
                rows={3}
                className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-[#E4E6EB] text-base placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2] resize-none"
                autoFocus
              />
              <div className="flex gap-2 flex-wrap">
                {['Color Up', 'Break Time', 'Registration Closing', 'Final Table', 'Dealers Stand'].map(q => (
                  <button key={q} onClick={() => setMessageText(q)}
                    className="px-3 py-2 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs active:bg-[#4A4B4C]">
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setMessageModal(false)}
                  className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] text-base font-medium active:bg-[#4A4B4C]">
                  Cancel
                </button>
                <button onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                  className="flex-1 py-3 rounded-xl bg-[#1877F2] text-white text-base font-medium active:bg-[#1565D8] disabled:opacity-50 flex items-center justify-center gap-2">
                  {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                  Broadcast
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== BOTTOM NAV BAR ===== */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#242526] border-t border-[#3A3B3C] z-40">
          <div className="flex items-center justify-around h-16 max-w-2xl mx-auto">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = item.key === 'control';
              return (
                <button
                  key={item.key}
                  onClick={() => navigateTo(item.key)}
                  className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-lg ${
                    isActive ? 'text-[#1877F2]' : 'text-[#B0B3B8] active:text-[#E4E6EB]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 flex flex-col items-center">
      <Icon className="w-4 h-4 mb-1" style={{ color }} />
      <span className="text-lg font-bold text-white">{value}</span>
      <span className="text-[10px] text-[#B0B3B8] uppercase tracking-wider">{label}</span>
    </div>
  );
}
