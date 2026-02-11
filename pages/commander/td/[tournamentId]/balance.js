/**
 * Tournament Director — Table Balancing
 * /commander/td/[tournamentId]/balance
 * Shows player count bars per table, imbalance detection
 * Auto-Suggest runs algorithm, TD reviews/edits moves, Execute All batch-updates
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Trophy, LayoutGrid, Users, Scale, UserPlus, Monitor,
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight,
  Zap, X, ChevronRight, Play
} from 'lucide-react';

const NAV_ITEMS = [
  { key: 'control', path: '' }, { key: 'tables', path: '/tables' },
  { key: 'players', path: '/players' }, { key: 'balance', path: '/balance' },
  { key: 'register', path: '/register' }, { key: 'clock', path: '/clock' },
];
const NAV_ICONS = { control: Trophy, tables: LayoutGrid, players: Users, balance: Scale, register: UserPlus, clock: Monitor };

export default function TDBalance() {
  const router = useRouter();
  const { tournamentId } = router.query;
  const [floor, setFloor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const fetchFloor = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/floor-view`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) setFloor(json.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tournamentId]);

  useEffect(() => { fetchFloor(); const i = setInterval(fetchFloor, 8000); return () => clearInterval(i); }, [fetchFloor]);

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestion(null);
    setResult(null);
    try {
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/balance-suggest`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) setSuggestion(json.data);
    } catch (err) { console.error(err); }
    finally { setSuggesting(false); }
  };

  const handleExecute = async () => {
    if (!suggestion?.moves?.length) return;
    setExecuting(true);
    setResult(null);
    try {
      const url = suggestion.type === 'break'
        ? `/api/commander/tournaments/${tournamentId}/break-table`
        : `/api/commander/tournaments/${tournamentId}/balance-execute`;

      const body = suggestion.type === 'break'
        ? { table_number: suggestion.table_to_break, assignments: suggestion.moves.map(m => ({ entry_id: m.entry_id, to_table: m.to_table, to_seat: m.to_seat })) }
        : { moves: suggestion.moves };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      setResult(json);
      setSuggestion(null);
      await fetchFloor();
    } catch (err) { console.error(err); setResult({ success: false, error: 'Failed to execute' }); }
    finally { setExecuting(false); }
  };

  const handleRemoveMove = (idx) => {
    if (!suggestion) return;
    const newMoves = [...suggestion.moves];
    newMoves.splice(idx, 1);
    setSuggestion({ ...suggestion, moves: newMoves });
  };

  const navigateTo = (path) => router.push(`/commander/td/${tournamentId}${path}`);

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  const tables = floor?.tables || [];
  const maxPlayers = Math.max(...tables.map(t => t.player_count), 1);
  const isBalanced = !floor?.alerts?.imbalanced;

  return (
    <>
      <Head><title>TD Balance | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] pb-20 font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Table Balance</h1>
            <p className="text-xs text-[#B0B3B8]">
              {isBalanced
                ? 'Tables are balanced'
                : `Imbalanced — ${floor?.alerts?.can_break_table ? 'table can be broken' : 'needs balancing'}`
              }
            </p>
          </div>
          <button onClick={fetchFloor} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="px-4 py-3">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
            isBalanced ? 'bg-[#31A24C]/10 border border-[#31A24C]/30' : 'bg-[#EF4444]/10 border border-[#EF4444]/30'
          }`}>
            {isBalanced
              ? <CheckCircle2 className="w-5 h-5 text-[#31A24C]" />
              : <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
            }
            <span className={`text-sm font-medium ${isBalanced ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>
              {isBalanced ? 'All tables balanced' : 'Tables need attention'}
            </span>
          </div>
        </div>

        {/* Table Bars */}
        <div className="px-4 py-2 space-y-2">
          {tables.map(table => {
            const pct = (table.player_count / table.max_seats) * 100;
            const barColor = table.color === 'red' ? '#EF4444' :
              table.color === 'yellow' ? '#F59E0B' :
              table.color === 'blue' ? '#1877F2' : '#31A24C';
            return (
              <div key={table.table_number} className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">Table {table.table_number}</span>
                  <span className="text-sm font-bold" style={{ color: barColor }}>
                    {table.player_count}/{table.max_seats}
                  </span>
                </div>
                <div className="h-3 bg-[#3A3B3C] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Auto-Suggest Button */}
        <div className="px-4 py-3">
          <button onClick={handleSuggest} disabled={suggesting || tables.length < 2}
            className="w-full py-4 rounded-xl bg-[#1877F2] text-white text-base font-semibold flex items-center justify-center gap-2 active:bg-[#1565D8] disabled:opacity-50">
            {suggesting
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Calculating...</>
              : <><Zap className="w-5 h-5" /> Auto-Suggest Moves</>
            }
          </button>
        </div>

        {/* Suggestion Card */}
        {suggestion && (
          <div className="px-4 pb-3">
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#3A3B3C] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {suggestion.type === 'break' ? `Break Table ${suggestion.table_to_break}` :
                     suggestion.type === 'balance' ? 'Balance Move' : 'No Action Needed'}
                  </h3>
                  <p className="text-xs text-[#B0B3B8]">{suggestion.message}</p>
                </div>
                <button onClick={() => setSuggestion(null)}
                  className="w-8 h-8 rounded-full bg-[#3A3B3C] flex items-center justify-center">
                  <X className="w-4 h-4 text-[#B0B3B8]" />
                </button>
              </div>

              {suggestion.moves?.length > 0 && (
                <div className="divide-y divide-[#3A3B3C]">
                  {suggestion.moves.map((move, idx) => (
                    <div key={idx} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#E4E6EB] truncate">{move.player_name}</p>
                        <div className="flex items-center gap-2 text-xs text-[#B0B3B8]">
                          <span>T{move.from_table}-S{move.from_seat}</span>
                          <ArrowRight className="w-3 h-3 text-[#1877F2]" />
                          <span className="text-[#1877F2] font-medium">T{move.to_table}-S{move.to_seat}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveMove(idx)}
                        className="w-8 h-8 rounded-full bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
                        <X className="w-3.5 h-3.5 text-[#B0B3B8]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {suggestion.moves?.length > 0 && (
                <div className="p-4 border-t border-[#3A3B3C]">
                  <button onClick={handleExecute} disabled={executing}
                    className="w-full py-4 rounded-xl bg-[#31A24C] text-white text-base font-semibold flex items-center justify-center gap-2 active:bg-[#28883F] disabled:opacity-50">
                    {executing
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Executing...</>
                      : <><Play className="w-5 h-5" /> Execute {suggestion.moves.length} Move{suggestion.moves.length !== 1 ? 's' : ''}</>
                    }
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="px-4 pb-3">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
              result.success ? 'bg-[#31A24C]/10 border border-[#31A24C]/30' : 'bg-[#EF4444]/10 border border-[#EF4444]/30'
            }`}>
              {result.success
                ? <CheckCircle2 className="w-5 h-5 text-[#31A24C]" />
                : <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
              }
              <span className={`text-sm font-medium ${result.success ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>
                {result.success
                  ? `${result.data?.executed || result.data?.players_moved || 0} players moved successfully`
                  : (result.error || 'Execution failed')
                }
              </span>
            </div>
          </div>
        )}

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#242526] border-t border-[#3A3B3C] z-40">
          <div className="flex items-center justify-around h-16 max-w-2xl mx-auto">
            {NAV_ITEMS.map(item => {
              const Icon = NAV_ICONS[item.key];
              const isActive = item.key === 'balance';
              return (
                <button key={item.key} onClick={() => navigateTo(item.path)}
                  className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-lg ${
                    isActive ? 'text-[#1877F2]' : 'text-[#B0B3B8] active:text-[#E4E6EB]'
                  }`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium capitalize">{item.key}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}
