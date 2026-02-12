/**
 * Must-Move Games Manager
 * /commander/must-move
 * Floor manager sets which tables are must-move feeders,
 * moves players when seats open at the main game
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, ArrowRightLeft, Loader2, RefreshCw, Users, Link2, Unlink,
  CheckCircle2, AlertTriangle, ChevronRight, Crown, ArrowRight
} from 'lucide-react';

const GAME_LABELS = { nlh: 'NLH', plo: 'PLO', plo5: 'PLO5', mixed: 'Mixed', limit: 'Limit', stud: 'Stud', razz: 'Razz', other: 'Other' };

export default function MustMoveManager() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [moveLoading, setMoveLoading] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      if (s.venue_id) setVenueId(s.venue_id);
    } catch {}
  }, []);

  const getToken = () => localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/commander/games/must-move-status?venue_id=${venueId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Link a game as must-move to parent
  const linkMustMove = async (gameId, parentGameId) => {
    setActionLoading(gameId);
    try {
      const res = await fetch(`/api/commander/games/${gameId}/must-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ parent_game_id: parentGameId })
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Must-move link created' });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error?.message || 'Failed to link' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network error' }); }
    finally { setActionLoading(null); }
  };

  // Unlink must-move
  const unlinkMustMove = async (gameId) => {
    setActionLoading(gameId);
    try {
      const res = await fetch(`/api/commander/games/${gameId}/must-move`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Must-move removed' });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error?.message || 'Failed to unlink' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network error' }); }
    finally { setActionLoading(null); }
  };

  // Move next player from must-move to main
  const movePlayer = async (mustMoveGameId, mainGameId) => {
    setMoveLoading(mustMoveGameId);
    try {
      const res = await fetch('/api/commander/games/must-move-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ must_move_game_id: mustMoveGameId, main_game_id: mainGameId })
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: json.data.message });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to move player' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network error' }); }
    finally { setMoveLoading(null); }
  };

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  const groups = data?.must_move_groups || [];
  const singles = data?.single_games || [];

  return (
    <>
      <Head><title>Must-Move Games | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/commander/poker-room')} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <ArrowLeft className="w-5 h-5 text-[#B0B3B8]" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Must-Move Games</h1>
            <p className="text-xs text-[#B0B3B8]">{data?.total_active || 0} active games</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]"><RefreshCw className="w-5 h-5 text-[#B0B3B8]" /></button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-4 mt-3 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium ${
            message.type === 'success' ? 'bg-[#31A24C]/15 text-[#31A24C]' : 'bg-[#EF4444]/15 text-[#EF4444]'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {/* Explanation */}
            <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
              <p className="text-sm text-[#B0B3B8]">
                When 2+ tables run the same game, the newer table becomes <span className="text-[#F59E0B] font-semibold">must-move</span>.
                Players at the must-move table transfer to the main game as seats open.
              </p>
            </div>

            {/* Groups with 2+ tables */}
            {groups.length > 0 ? groups.map((group, gi) => {
              const mainGame = group.main;
              const mainOpenSeats = mainGame ? (mainGame.max_seats - mainGame.player_count) : 0;

              return (
                <div key={gi} className="bg-[#242526] border border-[#3A3B3C] rounded-2xl overflow-hidden">
                  {/* Group header */}
                  <div className="bg-[#3A3B3C]/30 px-4 py-3 border-b border-[#3A3B3C]">
                    <p className="text-base font-bold text-white">
                      {GAME_LABELS[group.game_type] || group.game_type} {group.stakes}
                    </p>
                    <p className="text-xs text-[#B0B3B8]">{group.all.length} tables running</p>
                  </div>

                  <div className="p-3 space-y-2">
                    {/* Main game */}
                    {mainGame && (
                      <div className="bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Crown className="w-5 h-5 text-[#31A24C]" />
                            <div>
                              <p className="text-sm font-bold text-white">Table {mainGame.table_number}</p>
                              <p className="text-xs text-[#31A24C] font-medium">MAIN GAME</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-white">{mainGame.player_count}/{mainGame.max_seats}</p>
                            <p className="text-xs text-[#B0B3B8]">{mainOpenSeats} open</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Must-move tables and unlinked tables */}
                    {group.all.filter(g => g.id !== mainGame?.id).map(game => {
                      const isLinked = game.is_must_move && game.parent_game_id;
                      const canMove = isLinked && mainOpenSeats > 0 && game.player_count > 0;

                      return (
                        <div key={game.id} className={`rounded-xl p-3 ${
                          isLinked ? 'bg-[#F59E0B]/10 border border-[#F59E0B]/30' : 'bg-[#3A3B3C]/30 border border-[#3A3B3C]'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isLinked && <ArrowRightLeft className="w-4 h-4 text-[#F59E0B]" />}
                              <div>
                                <p className="text-sm font-bold text-white">Table {game.table_number}</p>
                                {isLinked
                                  ? <p className="text-xs text-[#F59E0B] font-medium">MUST-MOVE → T{mainGame?.table_number}</p>
                                  : <p className="text-xs text-[#B0B3B8]">Not linked</p>
                                }
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{game.player_count}/{game.max_seats}</p>
                              <p className="text-xs text-[#B0B3B8]">{game.player_count} players</p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {isLinked ? (
                              <>
                                {/* Move next player button */}
                                <button onClick={() => movePlayer(game.id, mainGame.id)} disabled={!canMove || moveLoading === game.id}
                                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                                    canMove ? 'bg-[#1877F2] text-white active:bg-[#1565D8]' : 'bg-[#3A3B3C] text-[#6A6B6D]'
                                  }`}>
                                  {moveLoading === game.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <ArrowRight className="w-3 h-3" />
                                  }
                                  {canMove ? 'Move Next Player' : mainOpenSeats === 0 ? 'Main Table Full' : 'No Players'}
                                </button>
                                {/* Unlink */}
                                <button onClick={() => unlinkMustMove(game.id)} disabled={actionLoading === game.id}
                                  className="px-3 py-2.5 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs font-bold active:bg-[#4A4B4C] flex items-center gap-1">
                                  {actionLoading === game.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                                  Remove
                                </button>
                              </>
                            ) : (
                              /* Link as must-move */
                              <button onClick={() => linkMustMove(game.id, mainGame.id)} disabled={actionLoading === game.id}
                                className="flex-1 py-2.5 rounded-lg bg-[#F59E0B] text-black text-xs font-bold flex items-center justify-center gap-1.5 active:bg-[#D97706]">
                                {actionLoading === game.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                                Set as Must-Move → T{mainGame?.table_number}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }) : (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-8 text-center">
                <ArrowRightLeft className="w-10 h-10 text-[#3A3B3C] mx-auto mb-3" />
                <p className="text-[#B0B3B8] text-sm">No duplicate games running</p>
                <p className="text-[#6A6B6D] text-xs mt-1">Must-move activates when 2+ tables run the same game type and stakes</p>
              </div>
            )}

            {/* Single games for reference */}
            {singles.length > 0 && (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                <h3 className="text-sm font-bold text-white mb-2">Single-Table Games</h3>
                <div className="space-y-2">
                  {singles.map(g => (
                    <div key={g.id} className="flex items-center justify-between px-3 py-2 bg-[#3A3B3C]/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-white">{GAME_LABELS[g.game_type] || g.game_type} {g.stakes}</p>
                        <p className="text-xs text-[#B0B3B8]">Table {g.table_number}</p>
                      </div>
                      <span className="text-sm font-bold text-white">{g.player_count}/{g.max_seats}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
