/**
 * Commander Table Management Page
 * Unified view: clickable table grid with action panel
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { Plus, Edit2, Trash2, Table2, Users, Loader2, Play, Square, X, Save, Wrench, Clock } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_COLORS = {
  available: { bg: 'rgba(16,185,129,0.15)', border: '#10B981', text: '#10B981', label: 'Available' },
  in_use: { bg: 'rgba(34,211,238,0.15)', border: '#22D3EE', text: '#22D3EE', label: 'In Use' },
  reserved: { bg: 'rgba(245,158,11,0.15)', border: '#F59E0B', text: '#F59E0B', label: 'Reserved' },
  maintenance: { bg: 'rgba(107,114,128,0.15)', border: '#6B7280', text: '#6B7280', label: 'Maintenance' },
};

const GAME_TYPES = ['NLH', 'PLO', 'NLO8', 'PLO8', 'Mixed', 'Stud', 'Razz', 'Draw'];
const COMMON_STAKES = ['$1/$2', '$1/$3', '$2/$5', '$5/$10', '$10/$20', '$25/$50'];

export default function CommanderTablesPage() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [venue, setVenue] = useState(null);
  const [tables, setTables] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Start Game state
  const [showStartGame, setShowStartGame] = useState(false);
  const [newGameType, setNewGameType] = useState('NLH');
  const [newStakes, setNewStakes] = useState('$1/$2');
  const [newMaxPlayers, setNewMaxPlayers] = useState(9);

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) { router.push('/commander/login').catch(() => { }); return; }
    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) { router.push('/commander/login').catch(() => { }); return; }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) setVenue({ id: staffData.venue_id, name: staffData.venue_name });
    } catch { router.push('/commander/login').catch(() => { }); }
  }, [router]);

  // Fetch tables + games (each independently — one failure shouldn't block the other)
  const fetchTables = useCallback(async () => {
    if (!venueId) return;
    const staffSession = localStorage.getItem('commander_staff') || '';

    // Fetch tables
    try {
      const tablesRes = await fetch(`/api/commander/tables?venue_id=${venueId}`, { headers: { 'x-staff-session': staffSession } });
      const tablesData = await tablesRes.json();
      if (tablesData.success) {
        const tablesArr = Array.isArray(tablesData.data) ? tablesData.data
          : Array.isArray(tablesData.data?.tables) ? tablesData.data.tables
            : [];
        setTables(tablesArr);
      }
    } catch (err) { console.error('Failed to fetch tables:', err); }

    // Fetch games
    try {
      const gamesRes = await fetch(`/api/commander/games/venue/${venueId}`, { headers: { 'x-staff-session': staffSession } });
      const gamesData = await gamesRes.json();
      if (gamesData.success) {
        const gamesArr = Array.isArray(gamesData.data?.games) ? gamesData.data.games
          : Array.isArray(gamesData.data) ? gamesData.data
            : [];
        setGames(gamesArr);
      }
    } catch (err) { console.error('Failed to fetch games:', err); }

    setLoading(false);
  }, [venueId]);

  useEffect(() => { if (venueId) fetchTables(); }, [venueId, fetchTables]);

  // Auto-refresh every 15s
  useEffect(() => {
    if (!venueId) return;
    const interval = setInterval(fetchTables, 15000);
    return () => clearInterval(interval);
  }, [venueId, fetchTables]);

  // Get the game running on a table
  const getGameForTable = (table) => {
    // Check nested commander_games from join
    if (Array.isArray(table.commander_games) && table.commander_games.length > 0) {
      return table.commander_games.find(g => g.status !== 'closed') || null;
    }
    // Check games array
    return games.find(g => g.table_id === table.id && g.status !== 'closed') || null;
  };

  // ── ACTIONS ──
  const handleStartGame = async () => {
    if (!selectedTable) return;
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      // Create game
      const res = await fetch('/api/commander/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
        body: JSON.stringify({
          venue_id: venueId,
          table_id: selectedTable.id,
          game_type: newGameType,
          stakes: newStakes,
          max_players: newMaxPlayers,
          status: 'waiting'
        })
      });
      const data = await res.json();
      if (data.success || data.data) {
        // Update table status + game_type
        await fetch(`/api/commander/tables/${selectedTable.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
          body: JSON.stringify({ status: 'in_use', game_type: newGameType, stakes: newStakes })
        });
        setShowStartGame(false);
        await fetchTables();
      }
    } catch (err) { console.error('Start game error:', err); }
    finally { setActionLoading(false); }
  };

  const handleCloseGame = async (gameId) => {
    if (!confirm('Close this game? Players will be unseated.')) return;
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      await fetch(`/api/commander/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
        body: JSON.stringify({ status: 'closed' })
      });
      // Set table back to available + clear game_type
      if (selectedTable) {
        await fetch(`/api/commander/tables/${selectedTable.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
          body: JSON.stringify({ status: 'available', game_type: null, stakes: null })
        });
      }
      await fetchTables();
    } catch (err) { console.error('Close game error:', err); }
    finally { setActionLoading(false); }
  };

  const handleSetStatus = async (status) => {
    if (!selectedTable) return;
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const updates = { status };
      if (status === 'available' || status === 'maintenance') {
        updates.game_type = null;
        updates.stakes = null;
      }
      await fetch(`/api/commander/tables/${selectedTable.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
        body: JSON.stringify(updates)
      });
      await fetchTables();
    } catch (err) { console.error('Set status error:', err); }
    finally { setActionLoading(false); }
  };

  const handleDeleteTable = async () => {
    if (!selectedTable) return;
    if (!confirm(`Delete Table ${selectedTable.table_number}? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      await fetch(`/api/commander/tables/${selectedTable.id}`, {
        method: 'DELETE',
        headers: { 'x-staff-session': staffSession }
      });
      setSelectedTable(null);
      await fetchTables();
    } catch (err) { console.error('Delete table error:', err); }
    finally { setActionLoading(false); }
  };

  const handleAddTable = async (tableData) => {
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch('/api/commander/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
        body: JSON.stringify({ ...tableData, venue_id: venueId })
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        await fetchTables();
      }
    } catch (err) { console.error('Add table error:', err); }
  };

  const handleUpdateTable = async (tableId, tableData) => {
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch(`/api/commander/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
        body: JSON.stringify(tableData)
      });
      const data = await res.json();
      if (data.success) await fetchTables();
    } catch (err) { console.error('Update table error:', err); }
  };

  // Update selectedTable ref when tables refresh
  useEffect(() => {
    if (selectedTable) {
      const updated = tables.find(t => t.id === selectedTable.id);
      if (updated) setSelectedTable(updated);
      else setSelectedTable(null);
    }
  }, [tables]);

  if (!staff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center" style={{ minHeight: '100vh', background: '#0A1628' }}>
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  const game = selectedTable ? getGameForTable(selectedTable) : null;

  return (
    <CommanderLayout title={`Tables | ${venue?.name || 'Commander'}`} backHref="/commander/dashboard?card=floor">
      <>
        <SEOHead title="Commander — Table Management" description="Club Commander Poker Room Management Tool." noindex={true} />
        <div className="cmd-page" style={{ minHeight: '100vh', background: '#0A1628' }}>

          {/* Header */}
          <header style={{ position: 'sticky', top: 0, zIndex: 50, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #1E3A5F', background: '#0D1F38' }}>
            <div>
              <h1 style={{ color: '#fff', fontWeight: 700, fontSize: '18px', fontFamily: 'Inter, sans-serif' }}>Table Management</h1>
              <p style={{ color: '#64748B', fontSize: '13px' }}>{venue?.name} — {tables.length} Tables</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#22D3EE', color: '#0A1628', fontWeight: 600, fontSize: '14px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={16} /> Add Table
            </button>
          </header>

          {/* Main Content */}
          <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>

            {tables.length === 0 ? (
              <div style={{ background: '#132240', border: '2px solid #1E3A5F', borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
                <Table2 size={48} color="#3A3B3C" style={{ margin: '0 auto 16px' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>No Tables Yet</h2>
                <p style={{ color: '#64748B', marginBottom: '16px' }}>Add tables to start managing your poker room</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  style={{ padding: '10px 24px', background: '#22D3EE', color: '#0A1628', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                >
                  Add First Table
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* ═══ TABLE GRID ═══ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                  {tables.map(table => {
                    const tGame = getGameForTable(table);
                    const sc = STATUS_COLORS[table.status] || STATUS_COLORS.available;
                    const isSelected = selectedTable?.id === table.id;
                    return (
                      <button
                        key={table.id}
                        onClick={() => {
                          setSelectedTable(isSelected ? null : table);
                          setShowStartGame(false);
                        }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '14px',
                          background: isSelected ? 'rgba(34,211,238,0.1)' : '#132240',
                          border: `2px solid ${isSelected ? '#22D3EE' : '#1E3A5F'}`,
                          borderRadius: '10px', cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <div>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>
                              Table {table.table_number}
                            </div>
                            {table.table_name && (
                              <div style={{ color: '#64748B', fontSize: '12px', marginTop: '2px' }}>{table.table_name}</div>
                            )}
                          </div>
                          <span style={{
                            padding: '3px 8px', fontSize: '11px', fontWeight: 600, borderRadius: '6px',
                            background: sc.bg, color: sc.text, border: `1px solid ${sc.border}40`
                          }}>
                            {sc.label}
                          </span>
                        </div>

                        {/* Game info */}
                        {tGame && table.status === 'in_use' && (
                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1E3A5F' }}>
                            <div style={{ color: '#22D3EE', fontWeight: 600, fontSize: '14px' }}>
                              {(tGame.game_type || table.game_type || '').toUpperCase()} {tGame.stakes || table.stakes || ''}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', color: '#64748B', fontSize: '12px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Users size={12} /> {tGame.current_players || 0}/{table.max_seats || 9}
                              </span>
                              {tGame.started_at && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Clock size={12} /> {formatDuration(tGame.started_at)}
                                </span>
                              )}
                            </div>
                            {/* Seat visualization */}
                            <div style={{ display: 'flex', gap: '2px', marginTop: '6px' }}>
                              {Array.from({ length: table.max_seats || 9 }).map((_, i) => (
                                <div key={i} style={{
                                  flex: 1, height: '3px', borderRadius: '2px',
                                  background: i < (tGame.current_players || 0) ? '#22D3EE' : '#1E3A5F'
                                }} />
                              ))}
                            </div>
                          </div>
                        )}

                        {!tGame && table.status === 'available' && (
                          <div style={{ marginTop: '6px', color: '#64748B', fontSize: '12px' }}>
                            {table.max_seats || 9} seats — Ready
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* ═══ ACTION PANEL ═══ */}
                {selectedTable && (
                  <div style={{
                    background: '#132240', border: '2px solid #22D3EE', borderRadius: '12px',
                    padding: '20px', animation: 'fadeIn 0.2s'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                        Table {selectedTable.table_number}
                        {selectedTable.table_name && <span style={{ color: '#64748B', fontWeight: 400, marginLeft: '8px', fontSize: '14px' }}>({selectedTable.table_name})</span>}
                      </h3>
                      <button onClick={() => { setSelectedTable(null); setShowStartGame(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                        <X size={20} color="#64748B" />
                      </button>
                    </div>

                    {/* Active Game Info */}
                    {game && (
                      <div style={{
                        background: 'rgba(34,211,238,0.1)', border: '1px solid #22D3EE40',
                        borderRadius: '8px', padding: '12px', marginBottom: '16px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ color: '#22D3EE', fontWeight: 700, fontSize: '16px' }}>
                            {(game.game_type || selectedTable.game_type || '').toUpperCase()} {game.stakes || selectedTable.stakes || ''}
                          </div>
                          <div style={{ color: '#64748B', fontSize: '13px', marginTop: '2px' }}>
                            <Users size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                            {game.current_players || 0} / {game.max_players || selectedTable.max_seats || 9} players
                            {game.started_at && ` — Running ${formatDuration(game.started_at)}`}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCloseGame(game.id)}
                          disabled={actionLoading}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', background: 'rgba(239,68,68,0.15)', color: '#EF4444',
                            fontWeight: 600, fontSize: '13px', borderRadius: '8px', border: '1px solid #EF444440',
                            cursor: 'pointer', opacity: actionLoading ? 0.5 : 1
                          }}
                        >
                          <Square size={14} /> Close Game
                        </button>
                      </div>
                    )}

                    {/* Start Game Section */}
                    {!game && selectedTable.status !== 'maintenance' && (
                      <>
                        {!showStartGame ? (
                          <button
                            onClick={() => setShowStartGame(true)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                              padding: '12px', background: 'rgba(16,185,129,0.15)', color: '#10B981',
                              fontWeight: 600, fontSize: '14px', borderRadius: '8px', border: '1px solid #10B98140',
                              cursor: 'pointer', marginBottom: '16px'
                            }}
                          >
                            <Play size={16} /> Start Game on Table {selectedTable.table_number}
                          </button>
                        ) : (
                          <div style={{
                            background: '#0D1F38', borderRadius: '10px', padding: '16px',
                            marginBottom: '16px', border: '1px solid #1E3A5F'
                          }}>
                            <h4 style={{ color: '#fff', fontWeight: 600, fontSize: '15px', marginBottom: '12px' }}>Start New Game</h4>

                            {/* Game Type */}
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ display: 'block', color: '#64748B', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Game Type</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {GAME_TYPES.map(gt => (
                                  <button
                                    key={gt}
                                    onClick={() => setNewGameType(gt)}
                                    style={{
                                      padding: '6px 14px', fontSize: '13px', fontWeight: 600,
                                      borderRadius: '6px', border: 'none', cursor: 'pointer',
                                      background: newGameType === gt ? '#22D3EE' : '#1E3A5F',
                                      color: newGameType === gt ? '#0A1628' : '#94A3B8',
                                    }}
                                  >
                                    {gt}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Stakes */}
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ display: 'block', color: '#64748B', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Stakes</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {COMMON_STAKES.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => setNewStakes(s)}
                                    style={{
                                      padding: '6px 14px', fontSize: '13px', fontWeight: 600,
                                      borderRadius: '6px', border: 'none', cursor: 'pointer',
                                      background: newStakes === s ? '#22D3EE' : '#1E3A5F',
                                      color: newStakes === s ? '#0A1628' : '#94A3B8',
                                    }}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Max Players */}
                            <div style={{ marginBottom: '16px' }}>
                              <label style={{ display: 'block', color: '#64748B', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Max Players</label>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {[6, 8, 9, 10].map(n => (
                                  <button
                                    key={n}
                                    onClick={() => setNewMaxPlayers(n)}
                                    style={{
                                      padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                                      borderRadius: '6px', border: 'none', cursor: 'pointer',
                                      background: newMaxPlayers === n ? '#22D3EE' : '#1E3A5F',
                                      color: newMaxPlayers === n ? '#0A1628' : '#94A3B8',
                                    }}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button
                                onClick={() => setShowStartGame(false)}
                                style={{
                                  flex: 1, padding: '10px', background: '#1E3A5F', color: '#94A3B8',
                                  fontWeight: 600, fontSize: '14px', borderRadius: '8px', border: 'none', cursor: 'pointer'
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleStartGame}
                                disabled={actionLoading}
                                style={{
                                  flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                  padding: '10px', background: '#10B981', color: '#fff',
                                  fontWeight: 700, fontSize: '14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                  opacity: actionLoading ? 0.5 : 1
                                }}
                              >
                                <Play size={16} /> Start {newGameType} {newStakes}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Quick Actions */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {['available', 'reserved', 'maintenance'].filter(s => s !== selectedTable.status).map(status => {
                        const sc = STATUS_COLORS[status];
                        return (
                          <button
                            key={status}
                            onClick={() => handleSetStatus(status)}
                            disabled={actionLoading || (selectedTable.status === 'in_use' && status !== 'maintenance')}
                            style={{
                              padding: '8px 14px', fontSize: '13px', fontWeight: 600,
                              borderRadius: '8px', cursor: 'pointer',
                              background: sc.bg, color: sc.text, border: `1px solid ${sc.border}40`,
                              opacity: (actionLoading || (selectedTable.status === 'in_use' && status !== 'maintenance')) ? 0.4 : 1
                            }}
                          >
                            Set {sc.label}
                          </button>
                        );
                      })}
                      <button
                        onClick={handleDeleteTable}
                        disabled={actionLoading || selectedTable.status === 'in_use'}
                        style={{
                          padding: '8px 14px', fontSize: '13px', fontWeight: 600,
                          borderRadius: '8px', cursor: 'pointer', marginLeft: 'auto',
                          background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid #EF444430',
                          opacity: (actionLoading || selectedTable.status === 'in_use') ? 0.4 : 1
                        }}
                      >
                        <Trash2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* Add Table Modal */}
        {showAddModal && (
          <AddTableModal
            existingCount={tables.length}
            onClose={() => setShowAddModal(false)}
            onSubmit={handleAddTable}
          />
        )}

        <style jsx>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </>
    </CommanderLayout>
  );
}

function AddTableModal({ existingCount, onClose, onSubmit }) {
  const [tableNumber, setTableNumber] = useState(existingCount + 1);
  const [tableName, setTableName] = useState('');
  const [maxSeats, setMaxSeats] = useState(9);
  const [bulkCount, setBulkCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    if (bulkCount > 1) {
      // Bulk add
      for (let i = 0; i < bulkCount; i++) {
        await onSubmit({
          table_number: tableNumber + i,
          table_name: null,
          max_seats: maxSeats
        });
      }
    } else {
      await onSubmit({
        table_number: parseInt(tableNumber),
        table_name: tableName || null,
        max_seats: maxSeats
      });
    }
    setSubmitting(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
      <div style={{ background: '#132240', border: '2px solid #1E3A5F', borderRadius: '12px', width: '100%', maxWidth: '420px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #1E3A5F', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#fff', fontWeight: 700, fontSize: '16px' }}>Add Table</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#64748B" /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Bulk add option */}
          <div>
            <label style={{ display: 'block', color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Add Multiple Tables</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 5, 10, 20].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBulkCount(n)}
                  style={{
                    flex: 1, padding: '8px', fontSize: '14px', fontWeight: 600,
                    borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: bulkCount === n ? '#22D3EE' : '#1E3A5F',
                    color: bulkCount === n ? '#0A1628' : '#94A3B8'
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>
              {bulkCount > 1 ? `Starting Table Number (${bulkCount} tables: ${tableNumber} - ${tableNumber + bulkCount - 1})` : 'Table Number'}
            </label>
            <input
              type="number"
              value={tableNumber}
              onChange={e => setTableNumber(parseInt(e.target.value) || 1)}
              min="1"
              required
              style={{ width: '100%', height: '44px', padding: '0 12px', background: '#0D1F38', border: '1px solid #1E3A5F', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' }}
            />
          </div>

          {bulkCount <= 1 && (
            <div>
              <label style={{ display: 'block', color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Table Name (Optional)</label>
              <input
                type="text"
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                placeholder="e.g., Feature Table, VIP Table"
                style={{ width: '100%', height: '44px', padding: '0 12px', background: '#0D1F38', border: '1px solid #1E3A5F', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Max Seats Per Table</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[6, 8, 9, 10].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxSeats(n)}
                  style={{
                    flex: 1, padding: '8px', fontSize: '14px', fontWeight: 600,
                    borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: maxSeats === n ? '#22D3EE' : '#1E3A5F',
                    color: maxSeats === n ? '#0A1628' : '#94A3B8'
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '12px', background: '#1E3A5F', color: '#94A3B8', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 2, padding: '12px', background: '#22D3EE', color: '#0A1628',
                fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px',
                opacity: submitting ? 0.5 : 1
              }}
            >
              {submitting ? 'Adding...' : bulkCount > 1 ? `Add ${bulkCount} Tables` : 'Add Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDuration(startTime) {
  const start = new Date(startTime);
  const now = new Date();
  const minutes = Math.floor((now - start) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
