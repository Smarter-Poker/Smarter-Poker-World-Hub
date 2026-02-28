/**
 * Must-Move Games Manager
 * /commander/must-move
 * Floor manager sets which tables are must-move feeders,
 * moves players when seats open at the main game.
 * Shows FIFO queue for each must-move table.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  ArrowRightLeft, Loader2, RefreshCw, Users, Link2, Unlink,
  CheckCircle2, AlertTriangle, ChevronRight, Crown, ArrowRight,
  Clock, User, Hash, List
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const GAME_LABELS = { nlh: 'NLH', plo: 'PLO', plo5: 'PLO5', NLH: 'NLH', PLO: 'PLO', mixed: 'Mixed', limit: 'Limit', stud: 'Stud', razz: 'Razz', other: 'Other' };

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

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
    } catch { }
  }, []);

  const getToken = () => localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
  const getStaffSession = () => localStorage.getItem('commander_staff') || '';

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/commander/games/must-move-status?venue_id=${venueId}`, {
        headers: { Authorization: `Bearer ${getToken()}`, 'x-staff-session': getStaffSession() }
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!venueId) return;
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [venueId, fetchData]);

  // Link a game as must-move to parent
  const linkMustMove = async (gameId, parentGameId) => {
    setActionLoading(gameId);
    try {
      const res = await fetch(`/api/commander/games/${gameId}/must-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': getStaffSession() },
        body: JSON.stringify({ parent_game_id: parentGameId })
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Must-Move Link Created' });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error?.message || 'Failed to link' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(null); }
  };

  // Unlink must-move
  const unlinkMustMove = async (gameId) => {
    setActionLoading(gameId);
    try {
      const res = await fetch(`/api/commander/games/${gameId}/must-move`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}`, 'x-staff-session': getStaffSession() }
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Must-Move Removed' });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error?.message || 'Failed to unlink' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setActionLoading(null); }
  };

  // Move next player from must-move to main
  const movePlayer = async (mustMoveGameId, mainGameId) => {
    setMoveLoading(mustMoveGameId);
    try {
      const res = await fetch('/api/commander/games/must-move-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-staff-session': getStaffSession() },
        body: JSON.stringify({ must_move_game_id: mustMoveGameId, main_game_id: mainGameId })
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: json.data.message });
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to move player' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network Error' }); }
    finally { setMoveLoading(null); }
  };

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 5000); return () => clearTimeout(t); }
  }, [message]);

  const groups = data?.must_move_groups || [];
  const singles = data?.single_games || [];

  return (
    <CommanderLayout title="Must-Move Games" backHref="/commander/dashboard?card=floor">
      <SEOHead
        title="Commander — Must-Move Games"
        description="Club Commander Must-Move Games Management."
        noindex={true}
      />
      <div style={{ minHeight: '100vh', background: '#0A0F1C', color: '#E4E6EB', fontFamily: "'Inter', sans-serif" }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30,58,95,0.6) 0%, rgba(15,23,42,0.9) 100%)',
          borderBottom: '1px solid #1E3A5F', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <ArrowRightLeft size={22} color="#F59E0B" />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Must-Move Games</h1>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
              {data?.total_active || 0} active games · {groups.length} must-move groups
            </p>
          </div>
          <button onClick={fetchData} style={{
            padding: 8, borderRadius: 8, background: 'rgba(30,58,95,0.5)', border: '1px solid #1E3A5F',
            cursor: 'pointer', color: '#94A3B8',
          }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Message Toast */}
        {message && (
          <div style={{
            margin: '12px 16px', padding: '12px 16px', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
            background: message.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: message.type === 'success' ? '#10B981' : '#EF4444',
            border: `1px solid ${message.type === 'success' ? '#10B98130' : '#EF444430'}`,
          }}>
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {message.text}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <Loader2 size={32} color="#3B82F6" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* How Must-Move Works */}
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 16, padding: '14px 16px',
            }}>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>
                <span style={{ color: '#F59E0B', fontWeight: 700 }}>How it works:</span> When 2+ tables run the same game,
                the newer table becomes <strong style={{ color: '#F59E0B' }}>must-move</strong>.
                The longest-sitting player at the must-move table moves to the main game when a seat opens (FIFO order).
              </p>
            </div>

            {/* Must-Move Groups */}
            {groups.length > 0 ? groups.map((group, gi) => {
              const mainGame = group.main;
              const mainOpenSeats = mainGame ? (mainGame.max_seats - mainGame.player_count) : 0;
              const mustMoveGames = group.all.filter(g => g.id !== mainGame?.id);

              return (
                <div key={gi} style={{
                  background: 'rgba(15,23,42,0.8)', border: '1px solid #1E3A5F',
                  borderRadius: 16, overflow: 'hidden',
                }}>
                  {/* Group Header */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(30,58,95,0.4) 0%, rgba(15,23,42,0.6) 100%)',
                    padding: '14px 16px', borderBottom: '1px solid #1E3A5F',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                        {GAME_LABELS[group.game_type] || group.game_type} {group.stakes}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        {group.all.length} tables running
                      </div>
                    </div>
                    {group.waitlist_count > 0 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 8,
                        background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
                        color: '#A855F7', fontSize: 11, fontWeight: 700,
                      }}>
                        <List size={12} /> {group.waitlist_count} waiting
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* ── MAIN GAME ── */}
                    {mainGame && (
                      <div style={{
                        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                        borderRadius: 12, padding: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Crown size={18} color="#10B981" />
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Table {mainGame.table_number}</div>
                              <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>MAIN GAME</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                              {mainGame.player_count}/{mainGame.max_seats}
                            </div>
                            <div style={{
                              fontSize: 11, fontWeight: 700,
                              color: mainOpenSeats > 0 ? '#10B981' : '#EF4444',
                            }}>
                              {mainOpenSeats > 0 ? `${mainOpenSeats} OPEN` : 'FULL'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── MUST-MOVE TABLES ── */}
                    {mustMoveGames.map(game => {
                      const isLinked = game.is_must_move && game.parent_game_id;
                      const canMove = isLinked && mainOpenSeats > 0 && game.seats.length > 0;
                      const nextPlayer = game.seats.length > 0 ? game.seats[0] : null;

                      return (
                        <div key={game.id} style={{
                          border: `1px solid ${isLinked ? 'rgba(245,158,11,0.3)' : '#1E3A5F'}`,
                          background: isLinked ? 'rgba(245,158,11,0.06)' : 'rgba(30,58,95,0.2)',
                          borderRadius: 12, overflow: 'hidden',
                        }}>
                          {/* Must-Move Table Header */}
                          <div style={{ padding: 12, borderBottom: '1px solid rgba(30,58,95,0.4)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {isLinked && <ArrowRightLeft size={16} color="#F59E0B" />}
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Table {game.table_number}</div>
                                  {isLinked
                                    ? <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>MUST-MOVE → Table {mainGame?.table_number}</div>
                                    : <div style={{ fontSize: 11, color: '#64748B' }}>Not Linked</div>
                                  }
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{game.player_count}/{game.max_seats}</div>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: 8 }}>
                              {isLinked ? (
                                <>
                                  <button onClick={() => movePlayer(game.id, mainGame.id)}
                                    disabled={!canMove || moveLoading === game.id}
                                    style={{
                                      flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                                      cursor: canMove ? 'pointer' : 'not-allowed',
                                      background: canMove ? 'linear-gradient(135deg, #3B82F6, #2563EB)' : 'rgba(30,58,95,0.4)',
                                      color: canMove ? '#fff' : '#475569',
                                      border: canMove ? '1px solid #3B82F640' : '1px solid #1E3A5F',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                      opacity: moveLoading === game.id ? 0.6 : 1,
                                    }}>
                                    {moveLoading === game.id
                                      ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                      : <ArrowRight size={14} />}
                                    {canMove
                                      ? `Move ${nextPlayer?.player_name || 'Next'} → T${mainGame?.table_number}`
                                      : mainOpenSeats === 0 ? 'Main Table Full' : 'No Players'}
                                  </button>
                                  <button onClick={() => unlinkMustMove(game.id)}
                                    disabled={actionLoading === game.id}
                                    style={{
                                      padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                      background: 'rgba(30,58,95,0.4)', color: '#94A3B8',
                                      border: '1px solid #1E3A5F', fontSize: 12, fontWeight: 600,
                                      display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                    {actionLoading === game.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Unlink size={12} />}
                                    Unlink
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => linkMustMove(game.id, mainGame.id)}
                                  disabled={actionLoading === game.id}
                                  style={{
                                    flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer',
                                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                                    color: '#000', border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  }}>
                                  {actionLoading === game.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={14} />}
                                  Set as Must-Move → T{mainGame?.table_number}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* ── MUST-MOVE QUEUE (FIFO) ── */}
                          {isLinked && game.seats.length > 0 && (
                            <div style={{ padding: '8px 12px 12px' }}>
                              <div style={{
                                fontSize: 11, fontWeight: 700, color: '#64748B',
                                textTransform: 'uppercase', letterSpacing: 1,
                                marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                <Users size={12} /> Move Order (First In → First Out)
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {game.seats.map((seat, idx) => {
                                  const isNext = idx === 0;
                                  return (
                                    <div key={seat.id} style={{
                                      display: 'flex', alignItems: 'center', gap: 8,
                                      padding: '8px 10px', borderRadius: 8,
                                      background: isNext ? 'rgba(59,130,246,0.12)' : 'rgba(30,58,95,0.2)',
                                      border: isNext ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                                    }}>
                                      {/* Position */}
                                      <div style={{
                                        width: 24, height: 24, borderRadius: 6,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, fontWeight: 800,
                                        background: isNext ? '#3B82F6' : 'rgba(30,58,95,0.5)',
                                        color: isNext ? '#fff' : '#64748B',
                                      }}>
                                        {idx + 1}
                                      </div>
                                      {/* Player */}
                                      <div style={{ flex: 1 }}>
                                        <div style={{
                                          fontSize: 13, fontWeight: isNext ? 700 : 500,
                                          color: isNext ? '#fff' : '#94A3B8',
                                        }}>
                                          {seat.player_name || 'Unknown'}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#475569', display: 'flex', gap: 8 }}>
                                          <span>Seat {seat.seat_number}</span>
                                          <span>· {timeAgo(seat.seated_at)} at table</span>
                                        </div>
                                      </div>
                                      {/* Badge */}
                                      {isNext && (
                                        <div style={{
                                          padding: '3px 8px', borderRadius: 6,
                                          background: mainOpenSeats > 0 ? '#3B82F6' : 'rgba(239,68,68,0.2)',
                                          color: mainOpenSeats > 0 ? '#fff' : '#EF4444',
                                          fontSize: 10, fontWeight: 800,
                                          textTransform: 'uppercase', letterSpacing: 0.5,
                                        }}>
                                          {mainOpenSeats > 0 ? 'NEXT TO MOVE' : 'WAITING'}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }) : (
              <div style={{
                background: 'rgba(15,23,42,0.8)', border: '1px solid #1E3A5F',
                borderRadius: 16, padding: 40, textAlign: 'center',
              }}>
                <ArrowRightLeft size={40} color="#1E3A5F" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: '#94A3B8', fontSize: 14, margin: '0 0 4px' }}>No Must-Move Games Active</p>
                <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>
                  Must-move activates when 2+ tables run the same game type and stakes
                </p>
              </div>
            )}

            {/* Single-Table Games */}
            {singles.length > 0 && (
              <div style={{
                background: 'rgba(15,23,42,0.8)', border: '1px solid #1E3A5F',
                borderRadius: 16, padding: 16,
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: '#94A3B8',
                  marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Hash size={14} /> Single-Table Games ({singles.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {singles.map(g => (
                    <div key={g.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', background: 'rgba(30,58,95,0.2)', borderRadius: 8,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                          {GAME_LABELS[g.game_type] || g.game_type} {g.stakes}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Table {g.table_number}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                        {g.player_count}/{g.max_seats}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </CommanderLayout>
  );
}
