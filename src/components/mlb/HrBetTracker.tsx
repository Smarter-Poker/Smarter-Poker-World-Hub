import { useState, useEffect, useMemo, useCallback } from 'react';
import { DollarSign, Plus, Trash2, TrendingUp, TrendingDown, Target } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface Bet {
  id: number;
  player_id: number;
  bet_date: string;
  stake: number;
  american_odds: number;
  result: 'pending' | 'hit' | 'miss' | 'push';
  note: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Read the Supabase access token from the same-origin smarter-poker session.
function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('smarter-poker-auth');
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j?.access_token || j?.currentSession?.access_token || j?.session?.access_token || null;
  } catch {
    return null;
  }
}

// American odds → decimal multiplier on stake (profit-per-$1 = decimal - 1).
function decimalOdds(american: number): number {
  if (!american || Number.isNaN(american)) return 1;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

export default function HrBetTracker({
  playerId,
  playerName,
  teamId,
}: {
  playerId: number;
  playerName?: string;
  teamId?: number | null;
}) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('+450');

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = getAccessToken();
    if (!token) {
      setAuthed(false);
      throw new Error('not-authed');
    }
    return fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await authFetch(`/api/mlb/hr-bets?player_id=${playerId}`);
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      const j = await res.json();
      setBets(Array.isArray(j.bets) ? j.bets : []);
      setAuthed(true);
    } catch (e: any) {
      if (e?.message !== 'not-authed') setErr('Could not load your bets.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, playerId]);

  useEffect(() => {
    if (Number.isFinite(playerId)) load();
  }, [playerId, load]);

  const addBet = useCallback(async () => {
    const s = Number(stake);
    const o = parseInt(odds.replace(/\s/g, ''), 10);
    if (Number.isNaN(s) || s <= 0) return setErr('Enter a wager amount.');
    if (Number.isNaN(o) || o === 0) return setErr('Enter the odds (e.g. +450 or -120).');
    setBusy(true);
    setErr(null);
    try {
      const res = await authFetch('/api/mlb/hr-bets', {
        method: 'POST',
        body: JSON.stringify({
          player_id: playerId,
          player_name: playerName,
          team_id: teamId ?? null,
          stake: s,
          american_odds: o,
        }),
      });
      if (!res.ok) throw new Error('post-failed');
      setStake('');
      await load();
    } catch {
      setErr('Could not save the bet.');
    } finally {
      setBusy(false);
    }
  }, [stake, odds, authFetch, playerId, playerName, teamId, load]);

  const setResult = useCallback(
    async (id: number, result: Bet['result']) => {
      setBusy(true);
      try {
        const res = await authFetch('/api/mlb/hr-bets', {
          method: 'PATCH',
          body: JSON.stringify({ id, result }),
        });
        if (!res.ok) throw new Error('patch-failed');
        await load();
      } catch {
        setErr('Could not update the bet.');
      } finally {
        setBusy(false);
      }
    },
    [authFetch, load]
  );

  const removeBet = useCallback(
    async (id: number) => {
      setBusy(true);
      try {
        const res = await authFetch(`/api/mlb/hr-bets?id=${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete-failed');
        await load();
      } catch {
        setErr('Could not delete the bet.');
      } finally {
        setBusy(false);
      }
    },
    [authFetch, load]
  );

  // ── Running P&L + recovery math ──────────────────────────────────────────
  const summary = useMemo(() => {
    let totalStaked = 0;
    let settledNet = 0;
    let wins = 0;
    let settled = 0;
    let pendingStake = 0;
    for (const b of bets) {
      totalStaked += Number(b.stake);
      if (b.result === 'hit') {
        settledNet += Number(b.stake) * (decimalOdds(b.american_odds) - 1);
        wins++;
        settled++;
      } else if (b.result === 'miss') {
        settledNet -= Number(b.stake);
        settled++;
      } else if (b.result === 'push') {
        settled++;
      } else {
        pendingStake += Number(b.stake);
      }
    }
    // Recovery: if you're net-down on settled bets, how much must the NEXT bet (at the
    // entered odds) win to bring you back to net-positive across all bets on this player?
    const nextDec = decimalOdds(parseInt(odds.replace(/\s/g, ''), 10));
    const deficit = settledNet < 0 ? -settledNet : 0;
    const recoveryStake = deficit > 0 && nextDec > 1 ? deficit / (nextDec - 1) : 0;
    return { totalStaked, settledNet, wins, settled, pendingStake, recoveryStake, nextDec };
  }, [bets, odds]);

  // ── Not signed in ─────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5 text-center">
        <DollarSign className="w-7 h-7 text-[#00D4FF] mx-auto mb-2" />
        <div
          className="text-white font-extrabold text-[17px] tracking-wide"
          style={{ fontFamily: '"Rajdhani", sans-serif' }}
        >
          Sign In To Track Your HR Bets
        </div>
        <p className="text-slate-400 text-[14px] font-bold mt-1">
          Log your wagers on {playerName || 'this player'} to track profit and your recovery stake.
        </p>
      </div>
    );
  }

  const net = summary.settledNet;
  const netColor = net > 0 ? 'text-[#00ff88]' : net < 0 ? 'text-[#FF4444]' : 'text-slate-300';

  return (
    <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 text-center">
          <div className="text-[12px] font-extrabold text-slate-400 tracking-widest capitalize mb-1">
            Wagered
          </div>
          <div
            className="text-[22px] font-extrabold text-white"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            {money(summary.totalStaked)}
          </div>
        </div>
        <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 text-center">
          <div className="text-[12px] font-extrabold text-slate-400 tracking-widest capitalize mb-1">
            Net P&amp;L
          </div>
          <div
            className={`text-[22px] font-extrabold ${netColor} flex items-center justify-center gap-1`}
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            {net > 0 ? <TrendingUp size={18} /> : net < 0 ? <TrendingDown size={18} /> : null}
            {money(net)}
          </div>
        </div>
        <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 text-center">
          <div className="text-[12px] font-extrabold text-slate-400 tracking-widest capitalize mb-1">
            Record
          </div>
          <div
            className="text-[22px] font-extrabold text-white"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            {summary.wins}/{summary.settled}
          </div>
        </div>
      </div>

      {/* Recovery callout */}
      <div
        className={`rounded-lg p-3 mb-5 border ${summary.recoveryStake > 0 ? 'border-[#FFB800]/50 bg-[#FFB800]/10' : 'border-[#00ff88]/40 bg-[#00ff88]/5'}`}
      >
        <div className="flex items-start gap-2">
          <Target
            size={18}
            className={
              summary.recoveryStake > 0
                ? 'text-[#FFB800] mt-0.5 shrink-0'
                : 'text-[#00ff88] mt-0.5 shrink-0'
            }
          />
          <div className="text-[14px] font-bold text-slate-200 leading-snug">
            {summary.recoveryStake > 0 ? (
              <>
                You&apos;re down <span className="text-[#FF4444] font-extrabold">{money(net)}</span>{' '}
                on {playerName || 'this player'}. To get back to net-positive on a win at{' '}
                <span className="text-white font-extrabold">{odds || '+450'}</span>, bet at least{' '}
                <span className="text-[#FFB800] font-extrabold text-[16px]">
                  ${summary.recoveryStake.toFixed(2)}
                </span>{' '}
                next.
              </>
            ) : net > 0 ? (
              <>
                You&apos;re up <span className="text-[#00ff88] font-extrabold">{money(net)}</span>{' '}
                on {playerName || 'this player'} — any winning bet keeps you profitable.
              </>
            ) : (
              <>
                No settled bets yet. Log a wager and mark Hit/Miss to track profit and your recovery
                stake.
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add bet */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex-1">
          <label className="block text-[11px] font-extrabold text-slate-500 tracking-widest capitalize mb-1">
            Wager ($)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="50"
            className="w-full bg-[#1a2332] border-[2px] border-[#3d4f5f] rounded-lg py-2.5 px-3 text-white font-extrabold text-[16px] focus:outline-none focus:border-[#00D4FF]"
          />
        </div>
        <div className="w-full sm:w-32">
          <label className="block text-[11px] font-extrabold text-slate-500 tracking-widest capitalize mb-1">
            Odds
          </label>
          <input
            type="text"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
            placeholder="+450"
            className="w-full bg-[#1a2332] border-[2px] border-[#3d4f5f] rounded-lg py-2.5 px-3 text-white font-extrabold text-[16px] focus:outline-none focus:border-[#00D4FF]"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={addBet}
            disabled={busy}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1 bg-[#00D4FF]/15 border-[2px] border-[#00D4FF] text-[#00D4FF] font-extrabold text-[15px] tracking-widest capitalize px-4 py-2.5 rounded-lg hover:bg-[#00D4FF]/25 transition-colors disabled:opacity-50"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            <Plus size={16} /> Add Bet
          </button>
        </div>
      </div>
      {err && <div className="text-[#FF4444] text-[13px] font-bold mb-3">{err}</div>}

      {/* Bet history */}
      {loading ? (
        <div className="text-slate-500 text-[14px] font-bold text-center py-4">
          Loading your bets…
        </div>
      ) : bets.length === 0 ? (
        <div className="text-slate-500 text-[14px] font-bold text-center py-4">
          No bets logged yet for {playerName || 'this player'}.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bets.map((b) => {
            const dec = decimalOdds(b.american_odds);
            const payout = b.stake * (dec - 1);
            return (
              <div
                key={b.id}
                className="flex items-center justify-between bg-[#1a2332] border border-[#3d4f5f] rounded-lg px-3 py-2.5 gap-2"
              >
                <div className="min-w-0">
                  <div
                    className="text-white font-extrabold text-[15px]"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {money(b.stake)} @{' '}
                    {b.american_odds > 0 ? `+${b.american_odds}` : b.american_odds}
                    <span className="text-slate-500 text-[12px] font-bold ml-2">
                      → +{money(payout)} to win
                    </span>
                  </div>
                  <div className="text-slate-500 text-[12px] font-bold">{b.bet_date}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(['hit', 'miss', 'push'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setResult(b.id, r)}
                      disabled={busy}
                      className={`text-[12px] font-extrabold capitalize px-2 py-1 rounded border transition-colors ${
                        b.result === r
                          ? r === 'hit'
                            ? 'bg-[#00ff88]/15 border-[#00ff88] text-[#00ff88]'
                            : r === 'miss'
                              ? 'bg-[#FF4444]/15 border-[#FF4444] text-[#FF4444]'
                              : 'bg-slate-500/15 border-slate-400 text-slate-300'
                          : 'border-[#3d4f5f] text-slate-500 hover:border-[#4b637a]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                  <button
                    onClick={() => removeBet(b.id)}
                    disabled={busy}
                    aria-label="Delete bet"
                    className="text-slate-600 hover:text-[#FF4444] transition-colors p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
