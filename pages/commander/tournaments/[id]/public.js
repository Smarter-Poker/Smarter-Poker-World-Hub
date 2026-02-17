/**
 * Tournament Public Page
 * /commander/tournaments/[id]/public
 * 
 * Player-facing tournament info page (linked from QR codes, texts, etc).
 * Shows:
 * - Tournament name, date, buy-in
 * - Registration status (open/closed)
 * - Current blind level & clock (if running)
 * - Player's entry status if registered
 * - Blind structure overview
 * - Payout structure
 * 
 * No staff login required.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import {
  Clock, Users, DollarSign, Trophy, Loader2,
  ChevronDown, ChevronUp, Timer
} from 'lucide-react';

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const STATUS_CONFIG = {
  scheduled: { color: '#B0B3B8', label: 'Upcoming', bg: '#B0B3B8' },
  registering: { color: '#1877F2', label: 'Registration Open', bg: '#1877F2' },
  registration: { color: '#1877F2', label: 'Registration Open', bg: '#1877F2' },
  running: { color: '#31A24C', label: 'In Progress', bg: '#31A24C' },
  break: { color: '#F59E0B', label: 'On Break', bg: '#F59E0B' },
  final_table: { color: '#A855F7', label: 'Final Table', bg: '#A855F7' },
  completed: { color: '#B0B3B8', label: 'Completed', bg: '#B0B3B8' },
  cancelled: { color: '#EF4444', label: 'Cancelled', bg: '#EF4444' }
};

export default function TournamentPublic() {
  const router = useRouter();
  const { id } = router.query;
  const [tournament, setTournament] = useState(null);
  const [clock, setClock] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStructure, setShowStructure] = useState(false);
  const [showPayouts, setShowPayouts] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchData();
    const poll = setInterval(fetchData, 10000);
    return () => clearInterval(poll);
  }, [id]);

  // Local clock tick
  useEffect(() => {
    if (!clock?.is_running) return;
    const tick = setInterval(() => {
      setClock(prev => prev ? ({
        ...prev,
        time_remaining: Math.max(0, (prev.time_remaining || 0) - 1)
      }) : null);
    }, 1000);
    return () => clearInterval(tick);
  }, [clock?.is_running, clock?.current_level]);

  const fetchData = async () => {
    try {
      const [tRes, cRes, eRes] = await Promise.all([
        fetch(`/api/commander/tournaments/${id}`).then(r => r.json()),
        fetch(`/api/commander/tournaments/${id}/clock`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/commander/tournaments/${id}/entries`).then(r => r.json()).catch(() => ({ data: [] }))
      ]);
      if (tRes.data || tRes.success) setTournament(tRes.data || tRes);
      if (cRes.data || cRes.success) setClock(cRes.data || cRes);
      if (eRes.data) setEntries(eRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
    </div>
  );

  if (!tournament) return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-6">
      <p className="text-[#B0B3B8] text-lg">Tournament Not Found</p>
    </div>
  );

  const t = tournament;
  const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.scheduled;
  const activeEntries = entries.filter(e => e.status === 'active' || e.status === 'playing' || e.status === 'registered');
  const eliminatedEntries = entries.filter(e => e.status === 'eliminated' || e.status === 'busted');
  const blindStructure = t.blind_structure || [];
  const payoutStructure = t.payout_structure || t.custom_payouts || [];
  const prizePool = activeEntries.length * (t.buyin_amount || 0);

  return (
    <>
      <SEOHead
                title="Commander — Public"
                description="Club Commander Poker Room Management Tool."
                noindex={true}
            />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] pb-12">

        {/* Header */}
        <div className="px-6 py-6 text-center" style={{ backgroundColor: `${sc.bg}10` }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-3"
            style={{ backgroundColor: `${sc.bg}20`, color: sc.color }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sc.bg }} />
            {sc.label}
          </div>
          <h1 className="text-2xl font-bold text-white">{t.name}</h1>
          {t.scheduled_start && (
            <p className="text-sm text-[#B0B3B8] mt-1">
              {new Date(t.scheduled_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {' at '}
              {new Date(t.scheduled_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Live Clock (if running) */}
        {clock && ['running', 'break', 'final_table'].includes(t.status) && (
          <div className="mx-4 mt-4 bg-[#242526] border border-[#3A3B3C] rounded-2xl p-5 text-center">
            <p className="text-xs text-[#B0B3B8] uppercase tracking-wider mb-1">
              {t.status === 'break' ? 'Break' : `Level ${clock.current_level || '?'}`}
            </p>
            <p className="text-5xl font-mono font-bold text-white mb-2">
              {formatTime(clock.time_remaining)}
            </p>
            {clock.blinds && (
              <p className="text-lg text-[#1877F2] font-semibold">
                Blinds: {clock.blinds.small_blind?.toLocaleString()}/{clock.blinds.big_blind?.toLocaleString()}
                {clock.blinds.ante > 0 && ` (ante ${clock.blinds.ante?.toLocaleString()})`}
              </p>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="px-4 mt-4 grid grid-cols-3 gap-2">
          <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
            <DollarSign className="w-5 h-5 text-[#31A24C] mx-auto mb-1" />
            <p className="text-lg font-bold text-white">
              ${t.buyin_amount || 0}{t.buyin_fee ? `+$${t.buyin_fee}` : ''}
            </p>
            <p className="text-[10px] text-[#B0B3B8]">Buy-In</p>
          </div>
          <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
            <Users className="w-5 h-5 text-[#1877F2] mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{activeEntries.length}</p>
            <p className="text-[10px] text-[#B0B3B8]">
              {['running', 'break', 'final_table'].includes(t.status) ? 'Remaining' : 'Registered'}
            </p>
          </div>
          <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
            <Trophy className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
            <p className="text-lg font-bold text-white">${prizePool.toLocaleString()}</p>
            <p className="text-[10px] text-[#B0B3B8]">Prize Pool</p>
          </div>
        </div>

        {/* Info cards */}
        <div className="px-4 mt-4 space-y-2">
          {t.starting_chips && (
            <div className="flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
              <span className="text-sm text-[#B0B3B8]">Starting Chips</span>
              <span className="text-sm font-bold text-white">{t.starting_chips?.toLocaleString()}</span>
            </div>
          )}
          {t.tournament_type && (
            <div className="flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
              <span className="text-sm text-[#B0B3B8]">Format</span>
              <span className="text-sm font-bold text-white capitalize">{t.tournament_type}</span>
            </div>
          )}
          {t.late_registration_level && (
            <div className="flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
              <span className="text-sm text-[#B0B3B8]">Late Reg</span>
              <span className="text-sm font-bold text-white">Through Level {t.late_registration_level}</span>
            </div>
          )}
          {t.guarantee_amount > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl">
              <span className="text-sm text-[#F59E0B]">Guaranteed</span>
              <span className="text-sm font-bold text-[#F59E0B]">${t.guarantee_amount?.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Blind Structure (collapsible) */}
        {blindStructure.length > 0 && (
          <div className="px-4 mt-4">
            <button onClick={() => setShowStructure(!showStructure)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
              <span className="text-sm font-semibold text-white">Blind Structure ({blindStructure.length} levels)</span>
              {showStructure ? <ChevronUp className="w-4 h-4 text-[#B0B3B8]" /> : <ChevronDown className="w-4 h-4 text-[#B0B3B8]" />}
            </button>
            {showStructure && (
              <div className="mt-1 bg-[#242526] border border-[#3A3B3C] rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#3A3B3C] text-[#B0B3B8]">
                      <th className="px-3 py-2 text-left">Lvl</th>
                      <th className="px-3 py-2 text-right">SB</th>
                      <th className="px-3 py-2 text-right">BB</th>
                      <th className="px-3 py-2 text-right">Ante</th>
                      <th className="px-3 py-2 text-right">Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blindStructure.map((level, i) => {
                      const isCurrent = clock?.current_level === (i + 1);
                      const isBreak = level.is_break;
                      return (
                        <tr key={i} className={`border-b border-[#3A3B3C]/50 ${isCurrent ? 'bg-[#1877F2]/10 text-[#1877F2]' :
                            isBreak ? 'bg-[#F59E0B]/5 text-[#F59E0B]' : 'text-white'
                          }`}>
                          <td className="px-3 py-2 font-medium">
                            {isBreak ? 'Break' : i + 1}{isCurrent ? ' *' : ''}
                          </td>
                          <td className="px-3 py-2 text-right">{isBreak ? '-' : level.small_blind?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{isBreak ? '-' : level.big_blind?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{isBreak ? '-' : (level.ante || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{level.duration || 20}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Payouts (collapsible) */}
        {payoutStructure.length > 0 && (
          <div className="px-4 mt-3">
            <button onClick={() => setShowPayouts(!showPayouts)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
              <span className="text-sm font-semibold text-white">Payouts ({payoutStructure.length} places)</span>
              {showPayouts ? <ChevronUp className="w-4 h-4 text-[#B0B3B8]" /> : <ChevronDown className="w-4 h-4 text-[#B0B3B8]" />}
            </button>
            {showPayouts && (
              <div className="mt-1 space-y-1">
                {payoutStructure.map((p, i) => {
                  const placeColors = ['#F59E0B', '#B0B3B8', '#CD7F32'];
                  const color = placeColors[i] || '#B0B3B8';
                  const amount = p.amount || (prizePool * (p.percentage || 0) / 100);
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-2 bg-[#242526] border border-[#3A3B3C] rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color }}>
                          {i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-white">${amount.toLocaleString()}</span>
                        {p.percentage && <span className="text-[10px] text-[#B0B3B8] ml-1">({p.percentage}%)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Branding */}
        <div className="mt-8 text-center">
          <p className="text-white/10 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </>
  );
}
