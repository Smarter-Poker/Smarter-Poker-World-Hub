/**
 * Tournament Director — Clock & Broadcast
 * /commander/td/[tournamentId]/clock
 * Large countdown display optimized for TV casting via HDMI/Airplay
 * Full clock controls, break management, H4H, final table mode
 * Can open in fullscreen for projector display
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import CommanderLayout from '../../../../src/components/commander/shared/CommanderLayout';
import useTournamentRealtime from '../../../../src/hooks/useTournamentRealtime';
import { broadcastChange } from '../../../../src/lib/commander/useCommanderSync';
import {
  Trophy, LayoutGrid, Users, Monitor,
  Play, Pause, SkipForward, SkipBack, Loader2, RefreshCw,
  Maximize, Minimize, Coffee, Hand, Star, Volume2,
  Plus, Minus, Clock as ClockIcon, AlertTriangle
} from 'lucide-react';

const NAV_ITEMS = [
  { key: 'control', path: '' }, { key: 'tables', path: '/tables' },
  { key: 'players', path: '/players' }, { key: 'clock', path: '/clock' },
];
const NAV_ICONS = { control: Trophy, tables: LayoutGrid, players: Users, clock: Monitor };

function formatClockTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatChips(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return n.toLocaleString();
}

function formatBlinds(blinds) {
  if (!blinds) return '--/--';
  const { small_blind, big_blind, ante } = blinds;
  let str = `${formatChips(small_blind)}/${formatChips(big_blind)}`;
  if (ante) str += ` (${formatChips(ante)})`;
  return str;
}

export default function TDClock() {
  const router = useRouter();
  const { tournamentId } = router.query;
  const [floor, setFloor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clockSeconds, setClockSeconds] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showMessage, setShowMessage] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_staff') || '' : '';

  const fetchFloor = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/floor-view`, {
        headers: { 'x-staff-session': getToken() }
      });
      const json = await res.json();
      if (json.success) {
        setFloor(json.data);
        const cs = json.data.clock?.clock_state;
        if (cs?.remaining_seconds !== undefined) setClockSeconds(cs.remaining_seconds);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tournamentId]);

  useTournamentRealtime(tournamentId, fetchFloor);
  useEffect(() => { fetchFloor(); const i = setInterval(fetchFloor, 60000); return () => clearInterval(i); }, [fetchFloor]);

  // Client-side countdown — only restart interval when clock status changes (not on every tick)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const cs = floor?.clock?.clock_state;
    if (cs?.status === 'running') {
      timerRef.current = setInterval(() => {
        setClockSeconds(prev => {
          if (prev === 1) {
            // Play alert sound when level ends
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880;
              gain.gain.value = 0.3;
              osc.start();
              osc.stop(ctx.currentTime + 0.5);
              // Second beep
              setTimeout(() => {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.frequency.value = 1100;
                gain2.gain.value = 0.3;
                osc2.start();
                osc2.stop(ctx.currentTime + 0.5);
              }, 600);
            } catch (e) { /* Audio not available */ }
          }
          return prev > 0 ? prev - 1 : 0;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [floor?.clock?.clock_state?.status]);

  const clockAction = async (action) => {
    setActionLoading(action);
    try {
      await fetch(`/api/commander/tournaments/${tournamentId}/clock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
        body: JSON.stringify({ action })
      });
      await fetchFloor();
      broadcastChange('tournaments');
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const toggleH4H = async () => {
    const isActive = floor?.alerts?.hand_for_hand;
    await fetch(`/api/commander/tournaments/${tournamentId}/hand-for-hand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
      body: JSON.stringify({ active: !isActive })
    });
    await fetchFloor();
    broadcastChange('tournaments');
  };

  const triggerFinalTable = async () => {
    setActionLoading('final');
    try {
      await fetch(`/api/commander/tournaments/${tournamentId}/final-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
        body: JSON.stringify({ final_table_number: 1 })
      });
      await fetchFloor();
      broadcastChange('tournaments');
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const sendMessage = async () => {
    if (!messageText.trim()) return;
    await fetch(`/api/commander/tournaments/${tournamentId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
      body: JSON.stringify({ message: messageText, type: 'announcement', duration_seconds: 60 })
    });
    setMessageText('');
    setShowMessage(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const navigateTo = (path) => router.push(`/commander/td/${tournamentId}${path}`);

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  const clock = floor?.clock || {};
  const stats = floor?.stats || {};
  const alerts = floor?.alerts || {};
  const tournament = floor?.tournament || {};
  const clockState = clock.clock_state || {};
  const isRunning = clockState.status === 'running';
  const isPaused = clockState.status === 'paused';
  const displaySeconds = clockSeconds ?? clockState.remaining_seconds ?? 0;

  return (
    <CommanderLayout title="Commander — Clock" backHref={`/commander/td/${tournamentId}`}>
      <SEOHead
        title="Commander — Clock"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div ref={containerRef} className={`min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] flex flex-col ${isFullscreen ? '' : 'pb-20'}`}>

        {/* Fullscreen header bar */}
        {!isFullscreen && (
          <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">Clock Control</h1>
              <p className="text-xs text-[#B0B3B8]">{tournament.name}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={toggleFullscreen} className="p-2 rounded-lg active:bg-[#3A3B3C]">
                <Maximize className="w-5 h-5 text-[#B0B3B8]" />
              </button>
              <button onClick={fetchFloor} className="p-2 rounded-lg active:bg-[#3A3B3C]">
                <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
              </button>
            </div>
          </div>
        )}

        {/* Main Clock Mirror */}
        <div className={`w-full bg-black relative ${isFullscreen ? 'flex-1' : 'aspect-[16/9] min-h-[250px] max-h-[50vh]'}`}>
          <iframe
            src={`/commander/tournaments/${tournamentId}/clock-display?preview=true`}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            title="Clock Mirror"
            style={{ pointerEvents: 'none' }}
          />
          {isFullscreen && (
            <button onClick={toggleFullscreen} className="absolute top-4 right-4 z-50 p-3 bg-black/50 hover:bg-black/80 rounded-full backdrop-blur">
              <Minimize className="w-6 h-6 text-white" />
            </button>
          )}
        </div>

        {/* Controls Section */}
        {!isFullscreen && (
          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center">
            {/* Controls */}
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => clockAction('prev_level')} disabled={!!actionLoading}
                className="w-14 h-14 rounded-xl bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C] disabled:opacity-50">
                <SkipBack className="w-6 h-6 text-[#E4E6EB]" />
              </button>

              <button onClick={() => clockAction('subtract_time')} disabled={!!actionLoading}
                className="w-14 h-14 rounded-xl bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C] disabled:opacity-50">
                <Minus className="w-6 h-6 text-[#E4E6EB]" />
              </button>

              {isRunning ? (
                <button onClick={() => clockAction('pause')} disabled={!!actionLoading}
                  className="w-24 h-24 rounded-3xl bg-[#F59E0B] flex items-center justify-center active:bg-[#D97706] disabled:opacity-50 shadow-lg shadow-[#F59E0B]/20">
                  {actionLoading === 'pause' ? <Loader2 className="w-10 h-10 text-white animate-spin" /> : <Pause className="w-10 h-10 text-white" />}
                </button>
              ) : (
                <button onClick={() => clockAction(isPaused ? 'resume' : 'start')} disabled={!!actionLoading}
                  className="w-24 h-24 rounded-3xl bg-[#31A24C] flex items-center justify-center active:bg-[#28883F] disabled:opacity-50 shadow-lg shadow-[#31A24C]/20">
                  {actionLoading === 'start' || actionLoading === 'resume'
                    ? <Loader2 className="w-10 h-10 text-white animate-spin" />
                    : <Play className="w-10 h-10 text-white ml-1" />}
                </button>
              )}

              <button onClick={() => clockAction('add_time')} disabled={!!actionLoading}
                className="w-14 h-14 rounded-xl bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C] disabled:opacity-50">
                <Plus className="w-6 h-6 text-[#E4E6EB]" />
              </button>

              <button onClick={() => clockAction('next_level')} disabled={!!actionLoading}
                className="w-14 h-14 rounded-xl bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C] disabled:opacity-50">
                <SkipForward className="w-6 h-6 text-[#E4E6EB]" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              <ActionChip icon={Coffee} label="Break" onClick={() => clockAction('break')}
                active={alerts.on_break} activeColor="#F59E0B" />
              <ActionChip icon={Hand} label={alerts.hand_for_hand ? 'End H4H' : 'H4H'}
                onClick={toggleH4H} active={alerts.hand_for_hand} activeColor="#EF4444" />
              <ActionChip icon={Star} label="Final" onClick={triggerFinalTable}
                active={floor?.tournament?.status === 'final_table'} activeColor="#1877F2"
                disabled={stats.players_remaining > 10} />
              <ActionChip icon={Volume2} label="Announce" onClick={() => setShowMessage(true)} />
              <ActionChip icon={Maximize} label="Fullscreen" onClick={toggleFullscreen} />
            </div>
          </div>
        )}
        {/* Message Modal */}
        {showMessage && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4"
            onClick={() => setShowMessage(false)}>
            <div className="bg-[#242526] rounded-2xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white">Broadcast To Displays</h3>
              <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
                placeholder="Message To Show On Clock Displays..."
                rows={2}
                className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-[#E4E6EB] text-base placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2] resize-none"
                autoFocus />
              <div className="flex gap-2 flex-wrap">
                {['Color Up', 'Break Time', 'Last Hand', 'Seats Open', 'Registration Closed'].map(q => (
                  <button key={q} onClick={() => setMessageText(q)}
                    className="px-3 py-2 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs active:bg-[#4A4B4C]">{q}</button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowMessage(false)}
                  className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">Cancel</button>
                <button onClick={sendMessage} disabled={!messageText.trim()}
                  className="flex-1 py-3 rounded-xl bg-[#1877F2] text-white font-medium active:bg-[#1565D8] disabled:opacity-50 flex items-center justify-center gap-2">
                  <Volume2 className="w-4 h-4" /> Broadcast
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Nav (hidden in fullscreen) */}
        {!isFullscreen && (
          <nav className="fixed bottom-0 left-0 right-0 bg-[#242526] border-t border-[#3A3B3C] z-40">
            <div className="flex items-center justify-around h-16 max-w-2xl mx-auto">
              {NAV_ITEMS.map(item => {
                const Icon = NAV_ICONS[item.key];
                const isActive = item.key === 'clock';
                return (
                  <button key={item.key} onClick={() => navigateTo(item.path)}
                    className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-lg ${isActive ? 'text-[#1877F2]' : 'text-[#B0B3B8] active:text-[#E4E6EB]'
                      }`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium capitalize">{item.key}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </CommanderLayout>
  );
}

function ActionChip({ icon: Icon, label, onClick, active, activeColor, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-40 ${active
        ? `text-white`
        : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
        }`}
      style={active ? { backgroundColor: activeColor } : undefined}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
