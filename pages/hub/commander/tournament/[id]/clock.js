/**
 * Public Live Tournament Page (PokerAtlas Style)
 * Tabs: Clock | Structure | Chips | Payouts
 * UI: Dark industrial sci-fi gaming theme, cyan accents, mobile-first
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../../src/components/seo/SEOHead';
import { Users, Trophy, Clock, DollarSign } from 'lucide-react';
import { useCommanderSync } from '../../../../../src/lib/commander/useCommanderSync';
import { supabase } from '../../../../../src/lib/supabase';
import CommanderPageShell from '../../../../../src/components/commander/CommanderPageShell';

const TABS = [
  { id: 'clock', label: 'Clock' },
  { id: 'structure', label: 'Structure' },
  { id: 'chips', label: 'Chips' },
  { id: 'payouts', label: 'Payouts' }
];

// Format seconds as MM:SS
function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 11 -> 11th
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// ISO timestamp -> "5 Minutes Ago"
function relativeTime(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return null;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just Now';
  if (mins === 1) return '1 Minute Ago';
  if (mins < 60) return `${mins} Minutes Ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return '1 Hour Ago';
  if (hours < 24) return `${hours} Hours Ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 Day Ago' : `${days} Days Ago`;
}

export default function TournamentLivePage() {
  const router = useRouter();
  const { id } = router.query;

  const [tournament, setTournament] = useState(null);
  const [clock, setClock] = useState(null);
  const [clockState, setClockState] = useState({
    currentLevel: 1,
    secondsRemaining: 0,
    isRunning: false,
    isOnBreak: false
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('clock');

  // Fetch tournament data.
  // Static fields (buy-in, prize pool, chips) come from the plain tournament GET;
  // the live clock (computed time remaining + current/next blinds + structure +
  // chip counts + payouts) comes from the dedicated public /clock endpoint.
  // Both are public reads.
  const fetchTournament = useCallback(async (signal) => {
    if (!id) return;
    try {
      const opts = signal ? { signal } : {};
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/commander/tournaments/${id}`, opts).catch(() => ({ ok: false })),
        fetch(`/api/commander/tournaments/${id}/clock?include=chips,payouts`, opts).catch(() => ({ ok: false }))
      ]);

      if (tRes.ok) {
        const tData = await tRes.json();
        if (tData.success && tData.data?.tournament) {
          setTournament(prev => ({ ...(prev || {}), ...tData.data.tournament }));
        }
      }

      if (cRes.ok) {
        const cData = await cRes.json();
        if (cData.success && cData.data) {
          const c = cData.data;
          setClock(c);
          setClockState({
            currentLevel: c.currentBlind?.level || ((c.tournament?.current_level || 0) + 1),
            secondsRemaining: c.clock?.timeRemaining || 0,
            isRunning: !!c.clock?.isRunning,
            isOnBreak: !!c.currentBlind?.isBreak
          });
          // Merge the live subset (players remaining, entries, avg stack) onto the
          // static tournament record so the stat row stays current.
          if (c.tournament) setTournament(prev => ({ ...(prev || {}), ...c.tournament }));
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Failed to fetch tournament:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Poll every 15 seconds; pause while the tab is hidden, refetch on return.
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let interval = null;

    const startPolling = () => {
      if (interval) return;
      fetchTournament(controller.signal);
      interval = setInterval(() => fetchTournament(controller.signal), 15000);
    };
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        stopPolling();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [id, fetchTournament]);

  // Realtime listener - live updates for tournament/[id]/clock.js
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`td-clock:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commander_tournaments', filter: `id=eq.${id}` }, () => { fetchTournament(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, fetchTournament]);

  // Commander Data Bus - instant sync when tournament state changes (clock, entries, etc.)
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });
  useCommanderSync(venueId || '', fetchTournament, { entities: ['tournaments'] });

  // Client-side countdown tick between polls
  useEffect(() => {
    if (!clockState.isRunning) return;
    const timer = setInterval(() => {
      setClockState(prev => ({
        ...prev,
        secondsRemaining: Math.max(0, prev.secondsRemaining - 1)
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [clockState.isRunning]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1426] flex items-center justify-center">
        <Clock className="w-12 h-12 text-white animate-pulse" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#0B1426] flex items-center justify-center">
        <p className="text-white text-xl">Tournament Not Found</p>
      </div>
    );
  }

  const currentBlind = clock?.currentBlind || null;
  const nextBlind = clock?.nextBlind || null;
  const blindStructure = clock?.blindStructure || [];
  const chips = clock?.chips || null;
  const payouts = clock?.payouts || null;
  const currentMessage = clock?.currentMessage || null;

  const playersRemaining = tournament.players_remaining ?? 0;
  const currentEntries = tournament.current_entries || tournament.total_entries || 0;
  const avgStack = tournament.average_stack
    || (playersRemaining && currentEntries && tournament.starting_chips
      ? Math.round((currentEntries * tournament.starting_chips) / playersRemaining)
      : tournament.starting_chips || 0);

  const prizePool = payouts?.prize_pool
    || tournament.actual_prizepool
    || tournament.guaranteed_pool
    || tournament.guaranteed_prizepool
    || 0;

  return (
    // 2026-07-25 audit fix: CommanderPageShell stays at page level (never inside
    // repeated tiles, which stacked fixed hamburger menus).
    <CommanderPageShell>
    <>
      <SEOHead
        title="Tournament Clock"
        description="Smarter.Poker - The Future Of The Game."
        noindex={true}
      />

      <div className="min-h-screen bg-[#0B1426] text-white flex flex-col">
        {/* Header */}
        <header className="text-center px-4 pt-6 pb-4 relative">
          <h1 className="text-2xl sm:text-4xl font-bold text-white">{tournament.name}</h1>
          <p className="text-base sm:text-xl text-[#64748B] mt-2">
            ${(tournament.buyin_amount ?? 0).toLocaleString()} + ${(tournament.buyin_fee ?? 0).toLocaleString()} {tournament.tournament_type?.toUpperCase()}
          </p>
          {!clockState.isRunning && tournament.status === 'running' && (
            <span className="inline-block mt-2 px-3 py-1 bg-[#EF4444] text-white text-sm font-semibold rounded-lg animate-pulse">
              PAUSED
            </span>
          )}
        </header>

        {/* Floor Announcement Banner */}
        {currentMessage && (
          <div className="mx-4 mb-3 px-4 py-3 rounded-lg bg-[#F59E0B]/15 border-2 border-[#F59E0B] text-[#F59E0B] text-center font-semibold text-sm sm:text-base">
            {currentMessage}
          </div>
        )}

        {/* Tab Bar */}
        <div className="border-b-2 border-[#4A5E78] bg-[#0F1C32]">
          <div className="max-w-4xl mx-auto px-2 sm:px-4">
            <div className="flex gap-1 sm:gap-2 overflow-x-auto py-2">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[80px] px-3 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors border-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-[#132240] text-[#22D3EE] border-[#22D3EE]'
                      : 'bg-[#0F1C32] text-[#64748B] border-[#4A5E78] hover:border-[#7A8EA8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
          {activeTab === 'clock' && (
            <ClockTab
              clockState={clockState}
              currentBlind={currentBlind}
              nextBlind={nextBlind}
              playersRemaining={playersRemaining}
              currentEntries={currentEntries}
              avgStack={avgStack}
              prizePool={prizePool}
            />
          )}
          {activeTab === 'structure' && (
            <StructureTab blindStructure={blindStructure} />
          )}
          {activeTab === 'chips' && (
            <ChipsTab chips={chips} />
          )}
          {activeTab === 'payouts' && (
            <PayoutsTab payouts={payouts} fallbackPrizePool={prizePool} />
          )}
        </div>
      </div>
    </>
    </CommanderPageShell>
  );
}

function ClockTab({ clockState, currentBlind, nextBlind, playersRemaining, currentEntries, avgStack, prizePool }) {
  return (
    <div className="flex flex-col items-center">
      {clockState.isOnBreak ? (
        <div className="text-center py-6">
          <p className="text-2xl sm:text-3xl text-[#F59E0B] font-semibold mb-4">
            {currentBlind?.label || 'Break'}
          </p>
          <div className="text-7xl sm:text-9xl font-bold leading-none text-[#F59E0B]">
            {formatTime(clockState.secondsRemaining)}
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          {/* Level Number (break-aware, from currentBlind.level) */}
          <p className="text-xl sm:text-3xl text-[#64748B] mb-2">
            LEVEL {currentBlind?.level ?? clockState.currentLevel}
          </p>

          {/* Time Remaining */}
          <div className={`text-7xl sm:text-9xl font-bold leading-none ${
            clockState.secondsRemaining <= 60 ? 'text-[#EF4444]' :
            clockState.secondsRemaining <= 300 ? 'text-[#F59E0B]' :
            'text-white'
          }`}>
            {formatTime(clockState.secondsRemaining)}
          </div>

          {/* Current Blinds */}
          {currentBlind && (
            <div className="mt-6 text-center">
              <p className="text-3xl sm:text-5xl font-bold text-[#10B981]">
                {(currentBlind.smallBlind ?? 0).toLocaleString()} / {(currentBlind.bigBlind ?? 0).toLocaleString()}
                {currentBlind.ante > 0 && ` / ${currentBlind.ante.toLocaleString()}`}
              </p>
              <p className="text-lg sm:text-2xl text-[#64748B] mt-2">BLINDS</p>
            </div>
          )}
        </div>
      )}

      {/* Next Level Preview */}
      <div className="w-full max-w-md mx-auto mt-2 mb-6 px-4 py-3 rounded-lg bg-[#132240] border-2 border-[#4A5E78] text-center">
        <p className="text-xs text-[#64748B] uppercase tracking-wide font-bold mb-1">Next Level</p>
        {nextBlind ? (
          nextBlind.isBreak ? (
            <p className="text-lg font-bold text-[#F59E0B]">{nextBlind.label || 'Break'}</p>
          ) : (
            <p className="text-lg font-bold text-white">
              {(nextBlind.smallBlind ?? 0).toLocaleString()} / {(nextBlind.bigBlind ?? 0).toLocaleString()}
              {nextBlind.ante > 0 && ` / ${nextBlind.ante.toLocaleString()}`}
            </p>
          )
        ) : (
          <p className="text-lg font-bold text-white">Final Level</p>
        )}
      </div>

      {/* Stat Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 w-full max-w-3xl mx-auto">
        <StatCard
          icon={Users}
          label="Players"
          value={`${playersRemaining} / ${currentEntries}`}
        />
        <StatCard
          icon={DollarSign}
          label="Prize Pool"
          value={`$${(prizePool || 0).toLocaleString()}`}
        />
        <StatCard
          icon={Trophy}
          label="Avg Stack"
          value={(avgStack || 0).toLocaleString()}
        />
        <StatCard
          icon={Clock}
          label="Entries"
          value={(currentEntries || 0).toLocaleString()}
        />
      </div>
    </div>
  );
}

function StructureTab({ blindStructure }) {
  if (!blindStructure || blindStructure.length === 0) {
    return (
      <div className="text-center py-12 text-[#64748B]">
        Blind Structure Is Not Available Yet
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-[#4A5E78] overflow-hidden">
      <table className="w-full text-sm sm:text-base">
        <thead>
          <tr className="bg-[#0F1C32] text-[#64748B] uppercase tracking-wide text-xs">
            <th className="px-3 py-3 text-left font-bold">Level</th>
            <th className="px-3 py-3 text-right font-bold">Blinds</th>
            <th className="px-3 py-3 text-right font-bold">Ante</th>
            <th className="px-3 py-3 text-right font-bold">Duration</th>
          </tr>
        </thead>
        <tbody>
          {blindStructure.map((lvl, idx) => {
            if (lvl.isBreak) {
              return (
                <tr
                  key={`break-${idx}`}
                  className={`bg-[#F59E0B]/10 border-t border-[#4A5E78]/50 ${lvl.isCurrent ? 'outline outline-2 outline-[#22D3EE] -outline-offset-2' : ''}`}
                >
                  <td colSpan={3} className="px-3 py-3 font-bold text-[#F59E0B]">
                    {lvl.label || 'Break'}
                  </td>
                  <td className="px-3 py-3 text-right text-[#F59E0B] font-semibold">
                    {lvl.duration ? `${lvl.duration} Min` : ''}
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={`level-${lvl.level}-${idx}`}
                className={`border-t border-[#4A5E78]/50 ${
                  lvl.isCurrent
                    ? 'bg-[#132240] text-[#22D3EE] font-bold outline outline-2 outline-[#22D3EE] -outline-offset-2'
                    : 'text-[#CBD5E1]'
                }`}
              >
                <td className="px-3 py-3">{lvl.level}</td>
                <td className="px-3 py-3 text-right">
                  {(lvl.smallBlind ?? 0).toLocaleString()} / {(lvl.bigBlind ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right">
                  {lvl.ante > 0 ? lvl.ante.toLocaleString() : '-'}
                </td>
                <td className="px-3 py-3 text-right">
                  {lvl.duration ? `${lvl.duration} Min` : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChipsTab({ chips }) {
  const players = chips?.players || [];
  const updated = relativeTime(chips?.updated_at);

  if (players.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-10 h-10 text-[#64748B] mx-auto mb-3" />
        <p className="text-[#64748B]">Chip Counts Will Appear Once Players Are Seated</p>
      </div>
    );
  }

  return (
    <div>
      {updated && (
        <p className="text-xs text-[#64748B] uppercase tracking-wide font-bold mb-3 text-right">
          Last Updated: {updated}
        </p>
      )}
      <div className="rounded-xl border-2 border-[#4A5E78] overflow-hidden">
        <table className="w-full text-sm sm:text-base">
          <thead>
            <tr className="bg-[#0F1C32] text-[#64748B] uppercase tracking-wide text-xs">
              <th className="px-3 py-3 text-left font-bold">Rank</th>
              <th className="px-3 py-3 text-left font-bold">Player</th>
              <th className="px-3 py-3 text-right font-bold">Table / Seat</th>
              <th className="px-3 py-3 text-right font-bold">Chips</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, idx) => (
              <tr key={`${p.player_name}-${idx}`} className="border-t border-[#4A5E78]/50 text-[#CBD5E1]">
                <td className="px-3 py-3 font-bold text-white">{idx + 1}</td>
                <td className="px-3 py-3">{p.player_name}</td>
                <td className="px-3 py-3 text-right">
                  {p.table_number != null ? `${p.table_number} / ${p.seat_number ?? '-'}` : '-'}
                </td>
                <td className="px-3 py-3 text-right font-bold text-[#10B981]">
                  {(p.chips ?? 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayoutsTab({ payouts, fallbackPrizePool }) {
  const places = payouts?.places || [];
  const prizePool = payouts?.prize_pool || fallbackPrizePool || 0;
  const guaranteed = payouts?.guaranteed_pool || 0;
  const overlay = payouts?.overlay_amount || 0;
  const hasPercentages = places.some(p => p.percentage != null);

  return (
    <div>
      {/* Prize Pool Headline */}
      <div className="text-center mb-6">
        <p className="text-xs text-[#64748B] uppercase tracking-wide font-bold mb-1">Prize Pool</p>
        <p className="text-4xl sm:text-5xl font-bold text-[#10B981]">
          ${prizePool.toLocaleString()}
        </p>
        {guaranteed > 0 && (
          <p className="text-sm text-[#64748B] mt-2">
            ${guaranteed.toLocaleString()} Guaranteed
          </p>
        )}
        {overlay > 0 && (
          <p className="text-sm text-[#F59E0B] mt-1 font-semibold">
            Overlay: ${overlay.toLocaleString()}
          </p>
        )}
        {payouts?.is_deal && (
          <span className="inline-block mt-3 px-3 py-1 rounded-lg bg-[#22D3EE]/15 border-2 border-[#22D3EE] text-[#22D3EE] text-sm font-bold uppercase tracking-wide">
            Deal Made
          </span>
        )}
      </div>

      {/* Places Table */}
      {places.length === 0 ? (
        <div className="text-center py-8">
          <DollarSign className="w-10 h-10 text-[#64748B] mx-auto mb-3" />
          <p className="text-[#64748B]">Payouts Will Be Posted Once The Prize Pool Is Set</p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-[#4A5E78] overflow-hidden max-w-md mx-auto">
          <table className="w-full text-sm sm:text-base">
            <thead>
              <tr className="bg-[#0F1C32] text-[#64748B] uppercase tracking-wide text-xs">
                <th className="px-3 py-3 text-left font-bold">Place</th>
                {hasPercentages && (
                  <th className="px-3 py-3 text-right font-bold">Share</th>
                )}
                <th className="px-3 py-3 text-right font-bold">Payout</th>
              </tr>
            </thead>
            <tbody>
              {places.map((p, idx) => (
                <tr key={`place-${p.position}-${idx}`} className="border-t border-[#4A5E78]/50 text-[#CBD5E1]">
                  <td className="px-3 py-3 font-bold text-white">{ordinal(p.position)}</td>
                  {hasPercentages && (
                    <td className="px-3 py-3 text-right">
                      {p.percentage != null ? `${p.percentage}%` : '-'}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right font-bold text-[#10B981]">
                    ${(p.amount ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="text-center">
      <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-[#64748B] mx-auto mb-2" />
      <p className="text-xl sm:text-3xl font-bold text-white">{value}</p>
      <p className="text-xs sm:text-sm text-[#64748B] uppercase tracking-wide">{label}</p>
    </div>
  );
}
