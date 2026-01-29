/**
 * Player Tournament Registration Page
 * Allows players to register for tournaments from their phone
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Trophy, Calendar, Users, DollarSign, Clock, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

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
    if (id) fetchTournament();
  }, [id]);

  async function fetchTournament() {
    try {
      const [tournamentRes, entriesRes] = await Promise.all([
        fetch(`/api/club-commander/tournaments/${id}`),
        fetch(`/api/club-commander/tournaments/${id}/entries?check_my_entry=true`)
      ]);

      const [tournamentData, entriesData] = await Promise.all([
        tournamentRes.json(),
        entriesRes.json()
      ]);

      if (tournamentData.success) {
        setTournament(tournamentData.data.tournament);
      }

      if (entriesData.success && entriesData.data.my_entry) {
        setMyEntry(entriesData.data.my_entry);
        setRegistered(true);
      }
    } catch (err) {
      console.error('Failed to fetch tournament:', err);
      setError('Failed to load tournament');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    setRegistering(true);
    setError(null);

    try {
      const res = await fetch(`/api/club-commander/tournaments/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'app'
        })
      });

      const data = await res.json();

      if (data.success) {
        setRegistered(true);
        setMyEntry(data.data.entry);
      } else {
        setError(data.error?.message || 'Failed to register');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setRegistering(false);
    }
  }

  async function handleUnregister() {
    if (!myEntry) return;

    setRegistering(true);
    setError(null);

    try {
      const res = await fetch(`/api/club-commander/tournaments/${id}/entries/${myEntry.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setRegistered(false);
        setMyEntry(null);
      } else {
        setError(data.error?.message || 'Failed to unregister');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-[#EF4444] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[#1F2937]">Tournament Not Found</h1>
        </div>
      </div>
    );
  }

  const canRegister = tournament.status === 'registering' || tournament.status === 'scheduled';
  const isFull = tournament.max_entries && tournament.current_entries >= tournament.max_entries;

  return (
    <>
      <Head>
        <title>{tournament.name} | Register</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Hero */}
        <div className="bg-[#1877F2] text-white p-6 pb-12">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
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
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            {/* Status Badge */}
            <div className="p-4 border-b border-[#E5E7EB]">
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  tournament.status === 'registering' ? 'bg-[#DBEAFE] text-[#2563EB]' :
                  tournament.status === 'running' ? 'bg-[#D1FAE5] text-[#059669]' :
                  tournament.status === 'completed' ? 'bg-[#F3F4F6] text-[#6B7280]' :
                  'bg-[#FEF3C7] text-[#D97706]'
                }`}>
                  {tournament.status === 'registering' ? 'Registration Open' :
                   tournament.status === 'running' ? 'In Progress' :
                   tournament.status === 'completed' ? 'Completed' :
                   'Scheduled'}
                </span>
                {registered && (
                  <span className="flex items-center gap-1 text-[#059669] text-sm font-medium">
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
                label="Buy-in"
                value={`$${tournament.buyin_amount} + $${tournament.buyin_fee} fee`}
              />
              <DetailRow
                icon={Users}
                label="Entries"
                value={`${tournament.current_entries || 0}${tournament.max_entries ? ` / ${tournament.max_entries}` : ''} players`}
              />
              <DetailRow
                icon={Trophy}
                label="Prize Pool"
                value={`$${(tournament.actual_prizepool || tournament.guaranteed_pool || 0).toLocaleString()}${tournament.guaranteed_pool ? ' GTD' : ''}`}
              />
              <DetailRow
                icon={Clock}
                label="Starting Stack"
                value={`${tournament.starting_chips?.toLocaleString()} chips`}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mx-4 mb-4 p-3 bg-[#FEF2F2] rounded-lg">
                <p className="text-sm text-[#EF4444]">{error}</p>
              </div>
            )}

            {/* Action */}
            <div className="p-4 border-t border-[#E5E7EB]">
              {registered ? (
                <div className="space-y-3">
                  <div className="p-4 bg-[#D1FAE5] rounded-lg text-center">
                    <CheckCircle className="w-8 h-8 text-[#059669] mx-auto mb-2" />
                    <p className="font-semibold text-[#059669]">You're Registered!</p>
                    <p className="text-sm text-[#059669]/80 mt-1">
                      Entry #{myEntry?.entry_number || '?'}
                    </p>
                  </div>
                  {canRegister && (
                    <button
                      onClick={handleUnregister}
                      disabled={registering}
                      className="w-full h-12 border border-[#EF4444] text-[#EF4444] font-medium rounded-lg hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
                    >
                      {registering ? 'Processing...' : 'Cancel Registration'}
                    </button>
                  )}
                </div>
              ) : canRegister && !isFull ? (
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                <div className="p-4 bg-[#FEF3C7] rounded-lg text-center">
                  <p className="font-medium text-[#D97706]">Tournament Full</p>
                  <p className="text-sm text-[#D97706]/80 mt-1">Registration is closed</p>
                </div>
              ) : (
                <div className="p-4 bg-[#F3F4F6] rounded-lg text-center">
                  <p className="font-medium text-[#6B7280]">Registration Closed</p>
                </div>
              )}
            </div>
          </div>

          {/* Blind Structure Preview */}
          {tournament.blind_structure && tournament.blind_structure.length > 0 && (
            <div className="mt-6 bg-white rounded-xl border border-[#E5E7EB] p-4">
              <h3 className="font-semibold text-[#1F2937] mb-3">Blind Structure</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tournament.blind_structure.slice(0, 10).map((level, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                      level.is_break ? 'bg-[#FEF3C7]' : 'bg-[#F3F4F6]'
                    }`}
                  >
                    <span className="text-sm text-[#6B7280]">
                      {level.is_break ? 'BREAK' : `Level ${idx + 1}`}
                    </span>
                    <span className="text-sm font-medium text-[#1F2937]">
                      {level.is_break ? `${level.duration} min` :
                        `${level.small_blind}/${level.big_blind}${level.ante ? `/${level.ante}` : ''}`
                      }
                    </span>
                  </div>
                ))}
                {tournament.blind_structure.length > 10 && (
                  <p className="text-xs text-[#9CA3AF] text-center pt-2">
                    +{tournament.blind_structure.length - 10} more levels
                  </p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 text-[#6B7280]">
        <Icon className="w-5 h-5" />
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-medium text-[#1F2937]">{value}</span>
    </div>
  );
}
