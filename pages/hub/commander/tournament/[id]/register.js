/**
 * Player Tournament Registration Page
 * Allows players to register for tournaments from their phone
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../../src/components/seo/SEOHead';
import { Trophy, Calendar, Users, DollarSign, Clock, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../../../../src/lib/supabase';
// 2026-07-25 audit fix: added getAuthUser for the entries-list fallback check.
import { getAccessToken, getAuthUser, getFreshAccessToken } from '../../../../../src/lib/authUtils';
import CommanderPageShell from '../../../../../src/components/commander/CommanderPageShell';

const parseBlinds = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) { try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch (e) { console.warn('[App] Handled exception:', e); } }
  return [];
};

export default function TournamentRegisterPage() {
  const router = useRouter();
  const { id } = router.query;

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState(null);
  const [myEntry, setMyEntry] = useState(null);

  // Fetch tournament
  useEffect(() => {

  if (!router.isReady) return null;

    if (id) fetchTournament();
  }, [id]);
  // Realtime listener — live updates for tournament/[id]/register.js
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`td-register:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commander_tournaments', filter: `id=eq.${id}` }, () => { fetchTournament(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commander_tournament_entries', filter: `tournament_id=eq.${id}` }, () => { fetchTournament(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function fetchTournament(signal) {
    try {
      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [tournamentRes, entriesRes] = await Promise.all([
        fetch(`/api/commander/tournaments/${id}`, { headers }).catch(() => ({ ok: false })),
        fetch(`/api/commander/tournaments/${id}/entries?check_my_entry=true`, { headers }).catch(() => ({ ok: false }))
      ]);

      const [tournamentData, entriesData] = await Promise.all([
        tournamentRes.json(),
        entriesRes.json()
      ]);

      if (tournamentData.success) {
        setTournament(tournamentData.data.tournament);
      }

      // 2026-07-25 audit fix: keep ?check_my_entry=true but also fall back to
      // scanning data.entries for the caller's own entry by player_id.
      if (entriesData.success) {
        let entry = entriesData.data?.my_entry || null;
        if (!entry) {
          const userId = getAuthUser()?.id;
          const entries = entriesData.data?.entries || [];
          if (userId) {
            entry = entries.find(e => e.player_id === userId && e.status !== 'cancelled') || null;
          }
        }
        if (entry) {
          setMyEntry(entry);
          setRegistered(true);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch tournament:', err);
      setError('Failed To Load Tournament');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(signal) {
    const token = await getFreshAccessToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/tournament/${id}/register`);
      return;
    }

    setRegistering(true);
    setError(null);

    try {
      const res = await fetch(`/api/commander/tournaments/${id}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          source: 'app'
        })
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();

      if (data.success) {
        setRegistered(true);
        setMyEntry(data.data?.entry || null);
      } else {
        setError(data.error?.message || 'Failed To Register');
      }
    } catch (err) {
      setError('Connection Error. Please Try Again.');
    } finally {
      setRegistering(false);
    }
  }

  async function handleUnregister(signal) {
    if (!myEntry) return;

    const token = await getFreshAccessToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/tournament/${id}/register`);
      return;
    }

    setRegistering(true);
    setError(null);

    try {
      // 2026-07-25 audit fix: entries DELETE lives at .../entries and reads
      // {entry_id} from the JSON body (the /entries/:entryId route does not exist).
      const res = await fetch(`/api/commander/tournaments/${id}/entries`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ entry_id: myEntry.id })
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();

      if (data.success) {
        setRegistered(false);
        setMyEntry(null);
      } else {
        setError(data.error?.message || 'Failed To Unregister');
      }
    } catch (err) {
      setError('Connection Error. Please Try Again.');
    } finally {
      setRegistering(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1426] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#0B1426] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-[#EF4444] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white">Tournament Not Found</h1>
        </div>
      </div>
    );
  }

  const canRegister = tournament.status === 'registering' || tournament.status === 'scheduled';
  const isFull = tournament.max_entries && tournament.current_entries >= tournament.max_entries;

  return (
    // 2026-07-25 audit fix: CommanderPageShell moved here from DetailRow, which
    // wrapped every detail row in its own shell (stacking fixed hamburger menus).
    <CommanderPageShell>
    <>
      <SEOHead
                title="Tournament Registration"
                description="Smarter.Poker - The Future Of The Game."
                noindex={true}
            />

      <div className="cmd-page">
        {/* Hero */}
        <div className="cmd-header-full text-white p-6 pb-12">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="cmd-icon-box bg-white/10">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{tournament.name}</h1>
                <p className="text-white/80">{tournament.venue?.name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="max-w-lg mx-auto px-4 -mt-6">
          {/* Main Card */}
          <div className="cmd-panel overflow-hidden">
            {/* Status Badge */}
            <div className="p-4 border-b border-[#4A5E78]">
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  tournament.status === 'registering' ? 'bg-[#22D3EE]/10 text-[#22D3EE]' :
                  tournament.status === 'running' ? 'bg-[#10B981]/10 text-[#10B981]' :
                  tournament.status === 'completed' ? 'bg-[#4A5E78]/20 text-[#64748B]' :
                  'bg-[#F59E0B]/10 text-[#F59E0B]'
                }`}>
                  {tournament.status === 'registering' ? 'Registration Open' :
                   tournament.status === 'running' ? 'In Progress' :
                   tournament.status === 'completed' ? 'Completed' :
                   'Scheduled'}
                </span>
                {registered && (
                  <span className="flex items-center gap-1 text-[#10B981] text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Registered
                  </span>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="p-4 space-y-4">
              <DetailRow
                icon={Calendar}
                label="Start Time"
                value={formatDate(tournament.scheduled_start)}
              />
              <DetailRow
                icon={DollarSign}
                label="Buy-In"
                value={`$${(tournament.buyin_amount ?? 0).toLocaleString()} + $${(tournament.buyin_fee ?? 0).toLocaleString()} Fee`}
              />
              <DetailRow
                icon={Users}
                label="Entries"
                value={`${tournament.current_entries || 0}${tournament.max_entries ? ` / ${tournament.max_entries}` : ''} Players`}
              />
              <DetailRow
                icon={Trophy}
                label="Prize Pool"
                value={`$${(tournament.actual_prizepool || tournament.guaranteed_pool || 0).toLocaleString()}${tournament.guaranteed_pool ? ' GTD' : ''}`}
              />
              <DetailRow
                icon={Clock}
                label="Starting Stack"
                value={`${(tournament.starting_chips ?? 0).toLocaleString()} Chips`}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mx-4 mb-4 p-3 bg-[#EF4444]/10 rounded-lg">
                <p className="text-sm text-[#EF4444]">{error}</p>
              </div>
            )}

            {/* Action */}
            <div className="p-4 border-t border-[#4A5E78]">
              {registered ? (
                <div className="space-y-3">
                  <div className="p-4 bg-[#10B981]/10 rounded-lg text-center">
                    <CheckCircle className="w-8 h-8 text-[#10B981] mx-auto mb-2" />
                    <p className="font-semibold text-[#10B981]">You're Registered!</p>
                    <p className="text-sm text-[#10B981]/80 mt-1">
                      Entry #{myEntry?.entry_number || '?'}
                    </p>
                  </div>
                  {canRegister && (
                    <button
                      onClick={handleUnregister}
                      disabled={registering}
                      className="cmd-btn cmd-btn-danger w-full h-12 disabled:opacity-50"
                    >
                      {registering ? 'Processing...' : 'Cancel Registration'}
                    </button>
                  )}
                </div>
              ) : canRegister && !isFull ? (
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  className="cmd-btn cmd-btn-primary w-full h-12 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {registering ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Trophy className="w-5 h-5" />
                      Register Now
                    </>
                  )}
                </button>
              ) : isFull ? (
                <div className="p-4 bg-[#F59E0B]/10 rounded-lg text-center">
                  <p className="font-medium text-[#F59E0B]">Tournament Full</p>
                  <p className="text-sm text-[#F59E0B]/80 mt-1">Registration Is Closed</p>
                </div>
              ) : (
                <div className="p-4 bg-[#0D192E] rounded-lg text-center">
                  <p className="font-medium text-[#64748B]">Registration Closed</p>
                </div>
              )}
            </div>
          </div>

          {/* Blind Structure Preview */}
          {(() => {
            const blinds = parseBlinds(tournament.blind_structure);
            if (blinds.length === 0) return null;
            // Break-aware level numbering: breaks occupy structure slots but do
            // not consume a level number.
            let levelNumber = 0;
            const numbered = blinds.map((level) => {
              if (!level?.is_break) levelNumber++;
              return { level, displayNumber: levelNumber };
            });
            return (
              <div className="mt-6 cmd-panel p-4">
                <h3 className="font-semibold text-white mb-3">Blind Structure</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {numbered.slice(0, 10).map(({ level, displayNumber }, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                        level.is_break ? 'bg-[#F59E0B]/10' : 'bg-[#0D192E]'
                      }`}
                    >
                      <span className="text-sm text-[#64748B]">
                        {level.is_break ? 'BREAK' : `Level ${displayNumber}`}
                      </span>
                      <span className="text-sm font-medium text-white">
                        {level.is_break ? `${level.duration ?? level.duration_minutes ?? 0} Min` :
                          `${(level.small_blind ?? 0).toLocaleString()}/${(level.big_blind ?? 0).toLocaleString()}${level.ante ? `/${level.ante.toLocaleString()}` : ''}`
                        }
                      </span>
                    </div>
                  ))}
                  {blinds.length > 10 && (
                    <p className="text-xs text-[#4A5E78] text-center pt-2">
                      +{blinds.length - 10} More Levels
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </main>
      </div>
    </>
    </CommanderPageShell>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 text-[#64748B]">
        <Icon className="w-5 h-5" />
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
