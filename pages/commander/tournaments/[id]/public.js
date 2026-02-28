/**
 * Tournament Public Page
 * /commander/tournaments/[id]/public
 * 
 * Player-facing tournament info page (linked from QR codes, texts, clock display).
 * Features:
 * - Dynamic SEO/OG tags (shareable on social media)
 * - Tournament name, date, buy-in, status
 * - Live clock & blinds (when running)
 * - Chip counts leaderboard (during breaks)
 * - Final standings (when completed)
 * - Blind structure & payouts
 * - Share button (native share / clipboard copy)
 * - Post to My Smarter.Poker Page
 * 
 * No staff login required for viewing.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Clock, Users, DollarSign, Trophy, Loader2,
  ChevronDown, ChevronUp, Timer, Share2, CheckCircle2,
  Copy, Award
} from 'lucide-react';
import useTournamentRealtime from '../../../../src/hooks/useTournamentRealtime';

// Prefer real name from profiles over manually typed player_name (alias)
function getName(e) {
  return e?.profiles?.display_name || e?.player_name || 'Unknown';
}

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ordinal(n) {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const STATUS_CONFIG = {
  scheduled: { color: '#B0B3B8', label: 'Upcoming', bg: '#B0B3B8' },
  registering: { color: '#1877F2', label: 'Registration Open', bg: '#1877F2' },
  registration: { color: '#1877F2', label: 'Registration Open', bg: '#1877F2' },
  running: { color: '#31A24C', label: 'In Progress', bg: '#31A24C' },
  break: { color: '#F59E0B', label: 'On Break', bg: '#F59E0B' },
  final_table: { color: '#A855F7', label: 'Final Table', bg: '#A855F7' },
  completed: { color: '#31A24C', label: 'Completed', bg: '#31A24C' },
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
  const [showChipCounts, setShowChipCounts] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchData();
    const poll = setInterval(fetchData, 30000); // fallback — real-time sync handles instant updates
    return () => clearInterval(poll);
  }, [id, fetchData]);

  // Supabase Realtime — instant sync when tournament data changes
  useTournamentRealtime(id, fetchData);

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

  const fetchData = useCallback(async () => {
    try {
      const [tRes, cRes, eRes] = await Promise.all([
        fetch(`/api/commander/tournaments/${id}`).then(r => r.json()),
        fetch(`/api/commander/tournaments/${id}/clock`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/commander/tournaments/${id}/entries`).then(r => r.json()).catch(() => ({ entries: [] }))
      ]);

      // Tournament API returns { success, data: { tournament } }
      if (tRes.data?.tournament) setTournament(tRes.data.tournament);
      else if (tRes.data) setTournament(tRes.data);
      else if (tRes.success) setTournament(tRes);

      // Clock API returns { success, data: { clock, currentBlind, nextBlind, tournament } }
      // Normalize to flat clock object the render expects
      if (cRes.data) {
        const cd = cRes.data;
        setClock({
          current_level: cd.currentBlind?.level || cd.tournament?.current_level || null,
          time_remaining: cd.clock?.timeRemaining ?? null,
          is_running: cd.clock?.isRunning || false,
          blinds: cd.currentBlind ? {
            small_blind: cd.currentBlind.smallBlind,
            big_blind: cd.currentBlind.bigBlind,
            ante: cd.currentBlind.ante || 0
          } : null
        });
      }

      // Entries API returns { entries: [...] }
      if (eRes.entries) setEntries(eRes.entries);
      else if (eRes.data) setEntries(eRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [id]);

  // Share button handler
  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = tournament ? `${tournament.name} — Tournament Results` : 'Tournament';
    const text = tournament ? `Check out ${tournament.name} — $${tournament.buyin_amount || 0} buy-in tournament` : '';

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* ignore */ }
    }
  };

  // Post to My Smarter.Poker Page
  const handlePostToMyPage = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('sb-access-token') : null;
    if (!token) {
      // Redirect to login if not authenticated
      router.push(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
      return;
    }

    setPosting(true);
    try {
      const t = tournament;
      const url = typeof window !== 'undefined' ? window.location.href : '';
      const content = t.status === 'completed'
        ? `🏆 Tournament Results: ${t.name}\n💰 $${t.buyin_amount || 0} Buy-In | ${entries.length} Entries | $${prizePool.toLocaleString()} Prize Pool\n📊 ${url}`
        : `🃏 Playing in: ${t.name}\n💰 $${t.buyin_amount || 0} Buy-In | ${activeEntries.length} Players Remaining\n📊 ${url}`;

      const res = await fetch('/api/social/create-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content,
          content_type: 'tournament_result',
          visibility: 'public',
          metadata: {
            tournament_id: id,
            tournament_name: t.name,
            buyin: t.buyin_amount,
            entries: entries.length,
            prize_pool: prizePool
          }
        })
      });
      if (res.ok) {
        setPosted(true);
        setTimeout(() => setPosted(false), 3000);
      }
    } catch (err) { console.error('Post error:', err); }
    finally { setPosting(false); }
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
  const allEntries = entries.length || t.current_entries || 0;
  const prizePool = allEntries * (t.buyin_amount || 0);
  const isCompleted = t.status === 'completed';
  const isLive = ['running', 'break', 'final_table'].includes(t.status);

  // Final standings: entries with finish_position, sorted
  const finalStandings = entries
    .filter(e => e.finish_position)
    .sort((a, b) => a.finish_position - b.finish_position);

  // Dynamic SEO
  const pageTitle = t.name ? `${t.name} — ${isCompleted ? 'Results' : isLive ? 'Live' : 'Tournament'}` : 'Tournament';
  const pageDesc = `${t.name || 'Tournament'} — $${t.buyin_amount || 0} Buy-In | ${allEntries} Entries | $${prizePool.toLocaleString()} Prize Pool`;
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <>
      <Head>
        <title>{pageTitle} | Smarter.Poker</title>
        <meta name="description" content={pageDesc} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:site_name" content="Smarter.Poker" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
      </Head>
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
          {/* Share + Post buttons */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <button onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#242526] border border-[#3A3B3C] text-[#E4E6EB] text-xs font-semibold active:bg-[#3A3B3C]">
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-[#31A24C]" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? 'Link Copied!' : 'Share'}
            </button>
            <button onClick={handlePostToMyPage} disabled={posting || posted}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ${posted ? 'bg-[#31A24C]/20 border border-[#31A24C]/40 text-[#31A24C]' : 'bg-[#1877F2] text-white active:bg-[#1565D8]'} disabled:opacity-60`}>
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : posted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {posted ? 'Posted!' : 'Post to My Page'}
            </button>
          </div>
        </div>

        {/* Live Clock (if running) */}
        {clock && isLive && (
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

        {/* COMPLETED: Winner banner */}
        {isCompleted && finalStandings.length > 0 && (
          <div className="mx-4 mt-4 bg-gradient-to-r from-[#F59E0B]/20 to-[#F59E0B]/5 border border-[#F59E0B]/30 rounded-2xl p-5 text-center">
            <Trophy className="w-10 h-10 text-[#F59E0B] mx-auto mb-2" />
            <p className="text-xs text-[#F59E0B] uppercase tracking-wider mb-1">Champion</p>
            <p className="text-2xl font-bold text-white">{getName(finalStandings[0]) || 'TBD'}</p>
            {finalStandings[0]?.payout_amount > 0 && (
              <p className="text-lg font-semibold text-[#31A24C] mt-1">${finalStandings[0].payout_amount.toLocaleString()}</p>
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
            <p className="text-lg font-bold text-white">{isCompleted ? allEntries : activeEntries.length}</p>
            <p className="text-[10px] text-[#B0B3B8]">
              {isCompleted ? 'Total Entries' : isLive ? 'Remaining' : 'Registered'}
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

        {/* COMPLETED: Final Standings */}
        {isCompleted && finalStandings.length > 0 && (
          <div className="px-4 mt-4">
            <button onClick={() => setShowResults(!showResults)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
              <span className="text-sm font-semibold text-white">Final Standings ({finalStandings.length} places)</span>
              {showResults ? <ChevronUp className="w-4 h-4 text-[#B0B3B8]" /> : <ChevronDown className="w-4 h-4 text-[#B0B3B8]" />}
            </button>
            {showResults && (
              <div className="mt-1 space-y-1">
                {finalStandings.map((e, i) => (
                  <div key={e.id || i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${i === 0 ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30' :
                    i === 1 ? 'bg-[#B0B3B8]/10 border-[#B0B3B8]/20' :
                      i === 2 ? 'bg-[#CD7F32]/10 border-[#CD7F32]/20' :
                        'bg-[#242526] border-[#3A3B3C]'
                    }`}>
                    <span className={`w-8 text-center text-sm font-bold ${i === 0 ? 'text-[#F59E0B]' : i === 1 ? 'text-[#B0B3B8]' : i === 2 ? 'text-[#CD7F32]' : 'text-[#B0B3B8]'
                      }`}>
                      {ordinal(e.finish_position)}
                    </span>
                    <span className="flex-1 text-sm font-medium text-white">{getName(e)}</span>
                    {e.payout_amount > 0 && (
                      <span className="text-sm font-bold text-[#31A24C]">${e.payout_amount.toLocaleString()}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                      const isBreakLvl = level.is_break;
                      return (
                        <tr key={i} className={`border-b border-[#3A3B3C]/50 ${isCurrent ? 'bg-[#1877F2]/10 text-[#1877F2]' :
                          isBreakLvl ? 'bg-[#F59E0B]/5 text-[#F59E0B]' : 'text-white'
                          }`}>
                          <td className="px-3 py-2 font-medium">
                            {isBreakLvl ? 'Break' : i + 1}{isCurrent ? ' *' : ''}
                          </td>
                          <td className="px-3 py-2 text-right">{isBreakLvl ? '-' : level.small_blind?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{isBreakLvl ? '-' : level.big_blind?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{isBreakLvl ? '-' : (level.ante || 0).toLocaleString()}</td>
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
                          {ordinal(i + 1)}
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

        {/* Chip Counts Leaderboard (live — during running/break/final_table) */}
        {isLive && (() => {
          const chipEntries = entries
            .filter(e => (e.status === 'active' || e.status === 'playing' || e.status === 'seated') && e.current_chips > 0)
            .sort((a, b) => (b.current_chips || 0) - (a.current_chips || 0));
          if (chipEntries.length === 0) return null;
          return (
            <div className="px-4 mt-3">
              <button onClick={() => setShowChipCounts(!showChipCounts)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                <span className="text-sm font-semibold text-white">Chip Counts ({chipEntries.length} players)</span>
                {showChipCounts ? <ChevronUp className="w-4 h-4 text-[#B0B3B8]" /> : <ChevronDown className="w-4 h-4 text-[#B0B3B8]" />}
              </button>
              {showChipCounts && (
                <div className="mt-1 space-y-1">
                  {chipEntries.map((e, i) => (
                    <div key={e.id || i} className="flex items-center gap-3 px-4 py-2 bg-[#242526] border border-[#3A3B3C] rounded-lg">
                      <span className="w-8 text-center text-sm font-bold text-[#B0B3B8]">
                        {i + 1}.
                      </span>
                      <span className="flex-1 text-sm font-medium text-white">{getName(e)}</span>
                      <span className="text-sm font-bold text-[#31A24C] tabular-nums">{(e.current_chips || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Branding */}
        <div className="mt-8 text-center">
          <p className="text-white/10 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </>
  );
}
