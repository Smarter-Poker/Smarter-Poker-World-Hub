/**
 * Tournament Director — Players Management
 * /commander/td/[tournamentId]/players
 * Searchable player list with filter tabs (All/Active/Eliminated/Registered)
 * Tap player -> action sheet: Move, Eliminate, Rebuy, Add-on, Update Chips, Seat Change
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import CommanderLayout from '../../../../src/components/commander/shared/CommanderLayout';
import useTournamentRealtime from '../../../../src/hooks/useTournamentRealtime';
import { broadcastChange } from '../../../../src/lib/commander/useCommanderSync';
import {
  Trophy, LayoutGrid, Users, Monitor,
  Search, X, Loader2, RefreshCw, ChevronDown,
  ArrowRightLeft, UserX, RotateCcw, Star, Coins, Hash,
  DollarSign, FileText
} from 'lucide-react';

const NAV_ITEMS = [
  { key: 'control', path: '' }, { key: 'tables', path: '/tables' },
  { key: 'players', path: '/players' }, { key: 'payouts', path: '/payouts' },
  { key: 'reports', path: '/reports' }, { key: 'clock', path: '/clock' },
];
const NAV_ICONS = { control: Trophy, tables: LayoutGrid, players: Users, payouts: DollarSign, reports: FileText, clock: Monitor };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'eliminated', label: 'Out' },
  { key: 'registered', label: 'Registered' },
];

function formatChips(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return n.toLocaleString();
}

export default function TDPlayers() {
  const router = useRouter();
  const { tournamentId, move: moveEntryId } = router.query;
  const [floor, setFloor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [chipModal, setChipModal] = useState(null);
  const [chipValue, setChipValue] = useState('');
  const [moveModal, setMoveModal] = useState(null);
  const [moveTable, setMoveTable] = useState('');
  const [moveSeat, setMoveSeat] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // { type, player, message }

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_staff') || '' : '';

  const fetchFloor = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/floor-view`, {
        headers: { 'x-staff-session': getToken() }
      });
      const json = await res.json();
      if (json.success) setFloor(json.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tournamentId]);

  useTournamentRealtime(tournamentId, fetchFloor);
  useEffect(() => { fetchFloor(); const i = setInterval(fetchFloor, 300000); return () => clearInterval(i); }, [fetchFloor]); // 5-min fallback

  // Build flat player list from full entries array (all statuses)
  const allPlayers = [];
  if (floor) {
    // Use the full entries array from API (includes all statuses)
    if (floor.entries?.length > 0) {
      floor.entries.forEach(e => {
        allPlayers.push({
          ...e,
          status: e.status === 'seated' ? 'active' : e.status,
        });
      });
    } else {
      // Fallback to old table-based approach
      floor.tables?.forEach(t => {
        t.players.forEach(p => {
          allPlayers.push({ ...p, table_number: t.table_number, status: 'active' });
        });
      });
      floor.eliminated?.forEach(e => {
        allPlayers.push({ ...e, status: 'eliminated', current_chips: 0 });
      });
    }
  }

  const filtered = allPlayers.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search && !p.player_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return (a.player_name || '').localeCompare(b.player_name || '');
  });

  const apiCall = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
      body: JSON.stringify(body)
    });
    return res.json();
  };

  const confirmEliminate = (player) => {
    setConfirmAction({
      type: 'eliminate', player,
      message: `Eliminate ${player.player_name}?`,
      detail: `Position #${floor?.stats?.players_remaining || '?'} — This cannot be undone.`,
      color: '#EF4444',
    });
  };

  const confirmRebuy = (player) => {
    setConfirmAction({
      type: 'rebuy', player,
      message: `Rebuy for ${player.player_name}?`,
      detail: floor?.tournament?.rebuy_cost ? `Cost: $${floor.tournament.rebuy_cost} — Chips: ${formatChips(floor.tournament.rebuy_chips || floor.tournament.starting_chips)}` : 'Process rebuy for this player.',
      color: '#31A24C',
    });
  };

  const printBluetoothReceipt = (player, actionType, cost, chips) => {
    const pw = window.open('', '_blank', 'width=400,height=600');
    if (!pw) return;

    const tournamentName = floor?.tournament?.name || 'Tournament';
    const timestamp = new Date().toLocaleTimeString();

    pw.document.write(`<!DOCTYPE html><html><head><title>${actionType} Receipt</title>
      <style>@page{margin:0;size:80mm auto}body{font-family:'Courier New',monospace;margin:0;color:#000;-webkit-print-color-adjust:exact;}
      .r{width:72mm;padding:4mm;margin:0 auto;page-break-after:always;border-bottom:1px dashed #000}
      .r:last-child{page-break-after:avoid}.c{text-align:center}.b{font-weight:bold}
      .lg{font-size:20px}.md{font-size:14px}.sm{font-size:11px}
      .d{border-top:1px dashed #000;margin:3mm 0}.rw{display:flex;justify-content:space-between}
      </style></head><body>
      <div class="r">
        <div class="c b md">${tournamentName}</div>
        <div class="c sm">${actionType.toUpperCase()} RECEIPT</div><div class="d"></div>
        <div class="c b lg" style="margin:2mm 0">${player.player_name || 'Player'}</div><div class="d"></div>
        ${cost ? `<div class="rw md"><span>Cost:</span><span class="b">$${cost}</span></div>` : ''}
        ${chips ? `<div class="rw md"><span>Chips Added:</span><span class="b">${Number(chips).toLocaleString()}</span></div>` : ''}
        <div class="d"></div>
        <div class="c sm" style="margin-top:2mm;opacity:.6">${timestamp}</div>
        <div class="c sm" style="opacity:.4;margin-top:1mm">Smarter.Poker</div>
      </div></body></html>`);
    pw.document.close();
    setTimeout(() => { pw.print(); pw.close(); }, 500);
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    const { type, player } = confirmAction;
    setActionLoading(type);
    setConfirmAction(null);
    try {
      if (type === 'eliminate') {
        await apiCall(`/api/commander/tournaments/${tournamentId}/eliminate`, {
          entry_id: player.entry_id, finish_position: floor?.stats?.players_remaining || 0
        });
      } else if (type === 'rebuy') {
        const res = await apiCall(`/api/commander/tournaments/${tournamentId}/entries/${player.entry_id}/rebuy`, {});
        if (res.success) {
          printBluetoothReceipt(player, 'Rebuy', floor?.tournament?.rebuy_cost, floor?.tournament?.rebuy_chips || floor?.tournament?.starting_chips);
        }
      } else if (type === 'addon') {
        const res = await apiCall(`/api/commander/tournaments/${tournamentId}/entries/${player.entry_id}/addon`, {});
        if (res.success) {
          printBluetoothReceipt(player, 'Add-on', floor?.tournament?.addon_cost, floor?.tournament?.addon_chips || floor?.tournament?.starting_chips);
        }
      }
    } catch (err) { console.error(err); }
    setSelectedPlayer(null);
    setActionLoading(null);
    fetchFloor();
    broadcastChange('tournaments');
  };

  const handleEliminate = (player) => confirmEliminate(player);
  const handleRebuy = (player) => confirmRebuy(player);

  const handleAddon = (player) => {
    setConfirmAction({
      type: 'addon', player,
      message: `Add-on for ${player.player_name}?`,
      detail: floor?.tournament?.addon_cost ? `Cost: $${floor.tournament.addon_cost} — Chips: ${formatChips(floor.tournament.addon_chips || floor.tournament.starting_chips)}` : 'Process add-on for this player.',
      color: '#8B5CF6',
    });
  };

  const handleUpdateChips = async () => {
    if (!chipModal || !chipValue) return;
    setActionLoading('chips');
    await fetch(`/api/commander/tournaments/${tournamentId}/entries/${chipModal.entry_id}/chips`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
      body: JSON.stringify({ chips: parseInt(chipValue) })
    });
    setChipModal(null);
    setChipValue('');
    setSelectedPlayer(null);
    setActionLoading(null);
    fetchFloor();
    broadcastChange('tournaments');
  };

  const handleMove = async () => {
    if (!moveModal || !moveTable || !moveSeat) return;
    setActionLoading('move');
    await apiCall(`/api/commander/tournaments/${tournamentId}/move-player`, {
      entry_id: moveModal.entry_id, to_table: parseInt(moveTable), to_seat: parseInt(moveSeat)
    });
    setMoveModal(null);
    setMoveTable('');
    setMoveSeat('');
    setSelectedPlayer(null);
    setActionLoading(null);
    fetchFloor();
    broadcastChange('tournaments');
  };

  const navigateTo = (path) => router.push(`/commander/td/${tournamentId}${path}`);

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  return (
    <CommanderLayout title="Commander — Players" backHref={`/commander/td/${tournamentId}`}>
      <SEOHead
        title="Commander — Players"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] pb-20 font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3">
          <h1 className="text-lg font-bold text-white">Players</h1>
          <p className="text-xs text-[#B0B3B8]">{allPlayers.filter(p => p.status === 'active').length} active — {allPlayers.length} total</p>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Players..."
              className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl pl-10 pr-10 py-3 text-[#E4E6EB] text-base placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-5 h-5 text-[#B0B3B8]" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="px-4 flex gap-2 pb-3">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${filter === f.key
                ? 'bg-[#1877F2] text-white'
                : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
                }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Player List */}
        <div className="px-4 space-y-1">
          {filtered.map(player => (
            <button
              key={player.entry_id}
              onClick={() => setSelectedPlayer(player)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-[#242526] rounded-xl border border-[#3A3B3C] active:bg-[#3A3B3C] text-left"
            >
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2"
                  style={{ borderColor: player.status === 'active' ? '#1877F2' : player.status === 'eliminated' ? '#EF4444' : '#B0B3B8' }} />
              ) : (
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${player.status === 'active' ? 'bg-[#1877F2]/20 text-[#1877F2]' :
                  player.status === 'eliminated' ? 'bg-[#EF4444]/20 text-[#EF4444]' :
                    'bg-[#B0B3B8]/20 text-[#B0B3B8]'
                  }`}>
                  {player.player_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#E4E6EB] truncate">{player.player_name}</p>
                <p className="text-xs text-[#B0B3B8]">
                  {player.status === 'active'
                    ? `${formatChips(player.current_chips)} chips${player.rebuy_count > 0 ? ` — ${player.rebuy_count}R` : ''}${player.addon_taken ? ' — A' : ''}`
                    : player.status === 'eliminated'
                      ? `Eliminated${player.finish_position ? ` #${player.finish_position}` : ''}`
                      : 'Registered'
                  }
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-[#B0B3B8] rotate-[-90deg]" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-[#3A3B3C] mx-auto mb-2" />
              <p className="text-[#B0B3B8]">{search ? 'No players found' : 'No players in this category'}</p>
            </div>
          )}
        </div>

        {/* ===== PLAYER ACTION SHEET ===== */}
        {selectedPlayer && !chipModal && !moveModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setSelectedPlayer(null)}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#1877F2]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedPlayer.player_name}</h3>
                  <p className="text-xs text-[#B0B3B8]">
                    Table {selectedPlayer.table_number} Seat {selectedPlayer.seat_number}
                    {selectedPlayer.current_chips > 0 && ` — ${formatChips(selectedPlayer.current_chips)}`}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {selectedPlayer.status === 'active' && (
                  <>
                    <ActionBtn icon={ArrowRightLeft} label="Move Player" color="#1877F2"
                      onClick={() => { setMoveModal(selectedPlayer); }} />
                    <ActionBtn icon={Coins} label="Update Chips" color="#F59E0B"
                      onClick={() => { setChipModal(selectedPlayer); setChipValue(String(selectedPlayer.current_chips || '')); }} />
                    <ActionBtn icon={RotateCcw} label="Rebuy" color="#31A24C"
                      loading={actionLoading === 'rebuy'}
                      onClick={() => handleRebuy(selectedPlayer)} />
                    <ActionBtn icon={Star} label="Add-On" color="#B0B3B8"
                      loading={actionLoading === 'addon'}
                      onClick={() => handleAddon(selectedPlayer)} />
                    <ActionBtn icon={UserX} label="Eliminate" color="#EF4444" danger
                      loading={actionLoading === 'eliminate'}
                      onClick={() => handleEliminate(selectedPlayer)} />
                  </>
                )}
                {selectedPlayer.status === 'eliminated' && (
                  <ActionBtn icon={RotateCcw} label="Re-Entry" color="#31A24C"
                    onClick={() => navigateTo(`/register?reentry=${selectedPlayer.entry_id}`)} />
                )}
              </div>

              <button onClick={() => setSelectedPlayer(null)}
                className="w-full mt-3 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] text-base font-medium active:bg-[#4A4B4C]">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ===== CHIP UPDATE MODAL ===== */}
        {chipModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setChipModal(null)}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-1">Update Chip Count</h3>
              <p className="text-sm text-[#B0B3B8] mb-4">{chipModal.player_name}</p>
              <input
                type="number"
                value={chipValue}
                onChange={e => setChipValue(e.target.value)}
                placeholder="Enter Chip Count"
                className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-2xl font-mono text-center focus:outline-none focus:border-[#1877F2] mb-4"
                autoFocus
              />
              <div className="flex gap-2 flex-wrap mb-4">
                {[1000, 5000, 10000, 25000, 50000, 100000].map(v => (
                  <button key={v} onClick={() => setChipValue(String(v))}
                    className="px-3 py-2 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-sm active:bg-[#4A4B4C]">
                    {formatChips(v)}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setChipModal(null)}
                  className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">Cancel</button>
                <button onClick={handleUpdateChips}
                  disabled={!chipValue || actionLoading === 'chips'}
                  className="flex-1 py-3 rounded-xl bg-[#1877F2] text-white font-medium active:bg-[#1565D8] disabled:opacity-50">
                  {actionLoading === 'chips' ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== MOVE PLAYER MODAL ===== */}
        {moveModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setMoveModal(null)}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-1">Move Player</h3>
              <p className="text-sm text-[#B0B3B8] mb-4">
                {moveModal.player_name} — currently Table {moveModal.table_number} Seat {moveModal.seat_number}
              </p>
              {/* Quick table buttons */}
              {floor?.tables && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {floor.tables.filter(t => t.available_seats > 0).map(t => (
                    <button key={t.table_number} onClick={() => {
                      setMoveTable(String(t.table_number));
                      setMoveSeat('');
                    }}
                      className={`px-3 py-2 rounded-lg text-sm ${moveTable === String(t.table_number) ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
                        }`}>
                      T{t.table_number} ({t.available_seats} open)
                    </button>
                  ))}
                </div>
              )}
              {/* Visual seat grid */}
              {moveTable && (() => {
                const t = floor?.tables?.find(tbl => tbl.table_number === parseInt(moveTable));
                if (!t) return (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-xs text-[#B0B3B8] mb-1 block">Table</label>
                      <input type="number" value={moveTable} onChange={e => setMoveTable(e.target.value)}
                        placeholder="Table #"
                        className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg text-center focus:outline-none focus:border-[#1877F2]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#B0B3B8] mb-1 block">Seat</label>
                      <input type="number" value={moveSeat} onChange={e => setMoveSeat(e.target.value)}
                        placeholder="Seat #"
                        className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg text-center focus:outline-none focus:border-[#1877F2]" />
                    </div>
                  </div>
                );
                const occupied = t.players.map(p => p.seat_number);
                return (
                  <div className="mb-4">
                    <p className="text-xs text-[#B0B3B8] mb-2">Tap an open seat on Table {t.table_number}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {Array.from({ length: t.max_seats }, (_, i) => i + 1).map(s => {
                        const isOccupied = occupied.includes(s);
                        const player = t.players.find(p => p.seat_number === s);
                        const isSelected = moveSeat === String(s);
                        return (
                          <button key={s} onClick={() => !isOccupied && setMoveSeat(String(s))}
                            disabled={isOccupied}
                            className={`relative rounded-xl p-2 text-center border-2 transition-all ${isSelected ? 'bg-[#1877F2]/20 border-[#1877F2] text-[#1877F2]' :
                              isOccupied ? 'bg-[#3A3B3C]/40 border-[#3A3B3C] text-[#666] cursor-not-allowed' :
                                'bg-[#31A24C]/10 border-[#31A24C]/40 text-[#31A24C] active:bg-[#31A24C]/20'
                              }`}>
                            <div className="text-lg font-bold">{s}</div>
                            <div className="text-[9px] truncate">
                              {isOccupied ? (player?.player_name?.split(' ')[0] || '●') : 'Open'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {!moveTable && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-[#B0B3B8] mb-1 block">Table</label>
                    <input type="number" value={moveTable} onChange={e => setMoveTable(e.target.value)}
                      placeholder="Table #"
                      className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg text-center focus:outline-none focus:border-[#1877F2]"
                      autoFocus />
                  </div>
                  <div>
                    <label className="text-xs text-[#B0B3B8] mb-1 block">Seat</label>
                    <input type="number" value={moveSeat} onChange={e => setMoveSeat(e.target.value)}
                      placeholder="Seat #"
                      className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-lg text-center focus:outline-none focus:border-[#1877F2]" />
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setMoveModal(null)}
                  className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">Cancel</button>
                <button onClick={handleMove}
                  disabled={!moveTable || !moveSeat || actionLoading === 'move'}
                  className="flex-1 py-3 rounded-xl bg-[#1877F2] text-white font-medium active:bg-[#1565D8] disabled:opacity-50">
                  {actionLoading === 'move' ? 'Moving...' : 'Move'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== CONFIRMATION MODAL ===== */}
        {confirmAction && (
          <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center px-4" onClick={() => setConfirmAction(null)}>
            <div className="bg-[#242526] rounded-2xl w-full max-w-sm p-6 border border-[#3A3B3C]" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-4">
                <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${confirmAction.color}20` }}>
                  {confirmAction.type === 'eliminate'
                    ? <UserX className="w-7 h-7" style={{ color: confirmAction.color }} />
                    : confirmAction.type === 'addon'
                      ? <Coins className="w-7 h-7" style={{ color: confirmAction.color }} />
                      : <RotateCcw className="w-7 h-7" style={{ color: confirmAction.color }} />
                  }
                </div>
                <h3 className="text-lg font-bold text-white">{confirmAction.message}</h3>
                <p className="text-sm text-[#B0B3B8] mt-1">{confirmAction.detail}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmAction(null)}
                  className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">Cancel</button>
                <button onClick={executeConfirmedAction}
                  className="flex-1 py-3 rounded-xl text-white font-bold active:opacity-80"
                  style={{ backgroundColor: confirmAction.color }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#242526] border-t border-[#3A3B3C] z-40">
          <div className="flex items-center justify-around h-16 max-w-2xl mx-auto">
            {NAV_ITEMS.map(item => {
              const Icon = NAV_ICONS[item.key];
              const isActive = item.key === 'players';
              return (
                <button key={item.key} onClick={() => navigateTo(item.path)}
                  className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-lg ${isActive ? 'text-[#1877F2]' : 'text-[#B0B3B8] active:text-[#E4E6EB]'
                    }`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium capitalize">{item.key}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </CommanderLayout>
  );
}

function ActionBtn({ icon: Icon, label, color, danger, onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50 ${danger ? 'bg-[#EF4444]/10 border border-[#EF4444]/30' : 'bg-[#3A3B3C]/50 border border-[#3A3B3C]'
        }`}>
      {loading
        ? <Loader2 className="w-5 h-5 animate-spin" style={{ color }} />
        : <Icon className="w-5 h-5" style={{ color }} />
      }
      <span className="text-base font-medium text-[#E4E6EB]">{label}</span>
    </button>
  );
}
