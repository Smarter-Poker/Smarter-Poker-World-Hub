/**
 * Tournament Director — Tables Map
 * /commander/td/[tournamentId]/tables
 * Visual floor map showing all tournament tables as ovals
 * Seat dots: filled (occupied) / empty, color-coded by balance status
 * Tap table -> detail modal with player list, chip counts, break button
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import CommanderLayout from '../../../../src/components/commander/shared/CommanderLayout';
import {
  Trophy, LayoutGrid, Users, Scale, UserPlus, Monitor,
  X, ChevronRight, AlertTriangle, Loader2, RefreshCw,
  ArrowRightLeft, UserX, Coins, Printer
} from 'lucide-react';

const NAV_ITEMS = [
  { key: 'control', icon: Trophy, label: 'Control', path: '' },
  { key: 'tables', icon: LayoutGrid, label: 'Tables', path: '/tables' },
  { key: 'players', icon: Users, label: 'Players', path: '/players' },
  { key: 'balance', icon: Scale, label: 'Balance', path: '/balance' },
  { key: 'register', icon: UserPlus, label: 'Register', path: '/register' },
  { key: 'clock', icon: Monitor, label: 'Clock', path: '/clock' },
];

const COLOR_MAP = {
  green: { bg: 'bg-[#31A24C]/15', border: 'border-[#31A24C]/40', dot: 'bg-[#31A24C]', text: 'text-[#31A24C]' },
  yellow: { bg: 'bg-[#F59E0B]/15', border: 'border-[#F59E0B]/40', dot: 'bg-[#F59E0B]', text: 'text-[#F59E0B]' },
  red: { bg: 'bg-[#EF4444]/15', border: 'border-[#EF4444]/40', dot: 'bg-[#EF4444]', text: 'text-[#EF4444]' },
  blue: { bg: 'bg-[#1877F2]/15', border: 'border-[#1877F2]/40', dot: 'bg-[#1877F2]', text: 'text-[#1877F2]' },
  grey: { bg: 'bg-[#3A3B3C]/30', border: 'border-[#3A3B3C]', dot: 'bg-[#3A3B3C]', text: 'text-[#B0B3B8]' },
};

function formatChips(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return n.toLocaleString();
}

function getSeatPositions(maxSeats) {
  const positions = [];
  for (let i = 0; i < maxSeats; i++) {
    const angle = (i / maxSeats) * 2 * Math.PI - Math.PI / 2;
    const rx = 44;
    const ry = 28;
    positions.push({
      x: 50 + Math.cos(angle) * rx,
      y: 50 + Math.sin(angle) * ry,
      seat: i + 1
    });
  }
  return positions;
}

export default function TDTablesMap() {
  const router = useRouter();
  const { tournamentId } = router.query;
  const [floor, setFloor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [autoBreak, setAutoBreak] = useState(null);
  const [breakExecuting, setBreakExecuting] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_staff') || '' : '';

  const fetchFloor = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const headers = { 'x-staff-session': getToken() };
      const [floorRes, breakRes] = await Promise.all([
        fetch(`/api/commander/tournaments/${tournamentId}/floor-view`, { headers }),
        fetch(`/api/commander/tournaments/${tournamentId}/auto-break`, { headers }).catch(() => null)
      ]);
      const json = await floorRes.json();
      if (json.success) setFloor(json.data);
      if (breakRes) {
        const breakJson = await breakRes.json();
        if (breakJson.success) setAutoBreak(breakJson.data);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tournamentId]);

  useEffect(() => {
    fetchFloor();
    const interval = setInterval(fetchFloor, 30000);
    return () => clearInterval(interval);
  }, [fetchFloor]);

  const handleEliminate = async (entryId, playerName) => {
    setConfirmAction({
      type: 'eliminate',
      message: `Eliminate ${playerName || 'this player'}?`,
      detail: `Position #${floor?.stats?.players_remaining || '?'} — Cannot be undone.`,
      color: '#EF4444',
      onConfirm: async () => {
        setActionLoading(entryId);
        try {
          await fetch(`/api/commander/tournaments/${tournamentId}/eliminate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
            body: JSON.stringify({ entry_id: entryId, finish_position: floor?.stats?.players_remaining || 0 })
          });
          await fetchFloor();
          if (selectedTable) {
            const updated = floor?.tables?.find(t => t.table_number === selectedTable.table_number);
            if (updated) setSelectedTable(updated);
          }
        } catch (err) { console.error(err); }
        finally { setActionLoading(null); }
      }
    });
  };

  const navigateTo = (path) => {
    const base = `/commander/td/${tournamentId}`;
    router.push(path ? `${base}${path}` : base);
  };

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  const tables = floor?.tables || [];

  return (
    <CommanderLayout title="Commander — Tables" backHref={`/commander/td/${tournamentId}`}>
      <SEOHead
        title="Commander — Tables"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] pb-20 font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Table Map</h1>
            <p className="text-xs text-[#B0B3B8]">{tables.length} tables active — {floor?.stats?.players_remaining || 0} players</p>
          </div>
          <button onClick={fetchFloor} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* Auto-Break Alert */}
        {autoBreak?.should_break && (
          <div className="mx-4 mt-3 p-4 bg-[#F59E0B]/10 border-2 border-[#F59E0B]/40 rounded-2xl">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-[#F59E0B] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-base font-bold text-[#F59E0B]">Break Table {autoBreak.break_table}</h3>
                <p className="text-xs text-[#B0B3B8] mt-0.5">{autoBreak.reason}</p>
              </div>
            </div>
            {/* Assignment preview */}
            <div className="space-y-1 mb-3">
              {(autoBreak.assignments || []).map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-[#18191A]/60 rounded-lg text-xs">
                  <span className="text-white flex-1 truncate">{a.player_name}</span>
                  <span className="text-[#B0B3B8] font-mono">T{a.from_table}-S{a.from_seat}</span>
                  <span className="text-[#F59E0B]">→</span>
                  <span className="text-[#31A24C] font-bold font-mono">T{a.to_table}-S{a.to_seat}</span>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                setBreakExecuting(true);
                try {
                  const res = await fetch(`/api/commander/tournaments/${tournamentId}/auto-break`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
                    body: JSON.stringify({
                      break_table: autoBreak.break_table,
                      assignments: autoBreak.assignments
                    })
                  });
                  const json = await res.json();
                  if (json.success && json.data.receipts) {
                    // Print receipts
                    const receipts = json.data.receipts;
                    const pw = window.open('', '_blank', 'width=400,height=600');
                    if (pw) {
                      pw.document.write(`<!DOCTYPE html><html><head><title>Seat Receipts</title>
                        <style>@page{margin:0;size:80mm auto}body{font-family:'Courier New',monospace;margin:0}
                        .r{width:72mm;padding:4mm;margin:0 auto;page-break-after:always;border-bottom:1px dashed #000}
                        .r:last-child{page-break-after:avoid}.c{text-align:center}.b{font-weight:bold}
                        .lg{font-size:20px}.md{font-size:14px}.sm{font-size:11px}
                        .d{border-top:1px dashed #000;margin:3mm 0}.rw{display:flex;justify-content:space-between}
                        .ar{font-size:24px;text-align:center;margin:2mm 0}</style></head><body>
                        ${receipts.map(r => `<div class="r">
                          <div class="c b md">${r.tournament_name}</div>
                          <div class="c sm">TABLE BREAK</div><div class="d"></div>
                          <div class="c b md">${r.player_name}</div><div class="d"></div>
                          <div class="rw sm"><span>FROM:</span><span class="b">Table ${r.from_table}, Seat ${r.from_seat}</span></div>
                          <div class="ar">⬇</div>
                          <div class="rw"><span class="md">NEW SEAT:</span><span class="b lg">T${r.to_table} - S${r.to_seat}</span></div>
                          <div class="d"></div>
                          ${r.chips ? `<div class="rw sm"><span>Chips:</span><span class="b">${Number(r.chips).toLocaleString()}</span></div>` : ''}
                          <div class="sm c" style="margin-top:2mm;opacity:.6">${new Date(r.timestamp).toLocaleTimeString()}</div>
                          <div class="sm c" style="opacity:.4;margin-top:1mm">Smarter.Poker</div>
                        </div>`).join('')}</body></html>`);
                      pw.document.close();
                      setTimeout(() => { pw.print(); pw.close(); }, 500);
                    }
                  }
                  setAutoBreak(null);
                  await fetchFloor();
                } catch (err) { console.error(err); }
                finally { setBreakExecuting(false); }
              }}
              disabled={breakExecuting}
              className="w-full py-3.5 rounded-xl bg-[#F59E0B] text-black text-sm font-bold flex items-center justify-center gap-2 active:bg-[#D97706] disabled:opacity-50"
            >
              {breakExecuting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Breaking Table...</>
                : <><Printer className="w-4 h-4" /> Break Table & Print {(autoBreak.assignments || []).length} Receipts</>
              }
            </button>
          </div>
        )}

        {/* Tables Grid */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            {tables.map(table => {
              const colors = COLOR_MAP[table.color] || COLOR_MAP.green;
              const maxSeats = table.max_seats || 9;
              const seatPositions = getSeatPositions(maxSeats);
              const occupiedSeats = table.players.map(p => p.seat_number);

              return (
                <button
                  key={table.table_number}
                  onClick={() => setSelectedTable(table)}
                  className={`relative rounded-2xl border-2 p-4 aspect-[4/3] flex flex-col items-center justify-center ${colors.bg} ${colors.border} active:scale-[0.98] transition-transform`}
                >
                  {/* Oval table shape with seat dots */}
                  <div className="relative w-full h-full">
                    {/* Center table info */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs text-[#B0B3B8] uppercase tracking-wider">Table</span>
                      <span className="text-3xl font-bold text-white">{table.table_number}</span>
                      <span className={`text-sm font-semibold ${colors.text}`}>
                        {table.player_count}/{maxSeats}
                      </span>
                    </div>

                    {/* Seat dots positioned around oval */}
                    {seatPositions.map(pos => {
                      const isOccupied = occupiedSeats.includes(pos.seat);
                      return (
                        <div
                          key={pos.seat}
                          className={`absolute w-4 h-4 rounded-full border-2 ${isOccupied
                            ? `${colors.dot} border-white/30`
                            : 'bg-transparent border-[#3A3B3C]'
                            }`}
                          style={{
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            transform: 'translate(-50%, -50%)'
                          }}
                        />
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {tables.length === 0 && (
            <div className="text-center py-16">
              <LayoutGrid className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
              <p className="text-[#B0B3B8]">No Active Tables</p>
            </div>
          )}
        </div>

        {/* ===== TABLE DETAIL MODAL ===== */}
        {selectedTable && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => setSelectedTable(null)}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}>

              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3B3C]">
                <div>
                  <h3 className="text-lg font-bold text-white">Table {selectedTable.table_number}</h3>
                  <p className="text-xs text-[#B0B3B8]">
                    {selectedTable.player_count} players — {selectedTable.available_seats} seats open
                  </p>
                </div>
                <button onClick={() => setSelectedTable(null)}
                  className="w-10 h-10 rounded-full bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
                  <X className="w-5 h-5 text-[#E4E6EB]" />
                </button>
              </div>

              {/* Seat layout visual */}
              <div className="px-5 py-4">
                <div className="relative w-full aspect-[2/1] bg-[#31A24C]/10 rounded-[50%] border-2 border-[#31A24C]/30 mx-auto max-w-xs">
                  {getSeatPositions(selectedTable.max_seats || 9).map(pos => {
                    const player = selectedTable.players.find(p => p.seat_number === pos.seat);
                    return (
                      <div key={pos.seat} className="absolute flex flex-col items-center"
                        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}>
                        {player?.avatar_url ? (
                          <img src={player.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-white/30" />
                        ) : (
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${player ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'
                            }`}>
                            {player ? (player.player_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || pos.seat) : pos.seat}
                          </div>
                        )}
                        {player && (
                          <span className="text-[8px] text-[#B0B3B8] mt-0.5 max-w-[50px] truncate text-center">
                            {player.player_name?.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Player list */}
              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <div className="space-y-1">
                  {selectedTable.players
                    .sort((a, b) => a.seat_number - b.seat_number)
                    .map(player => (
                      <div key={player.entry_id}
                        className="flex items-center gap-3 px-3 py-3 bg-[#3A3B3C]/50 rounded-xl">
                        {player.avatar_url ? (
                          <img src={player.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-[#1877F2]/40 flex-shrink-0" />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-[#1877F2]/20 text-[#1877F2] flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {player.seat_number}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#E4E6EB] truncate">{player.player_name}</p>
                          <p className="text-xs text-[#B0B3B8]">
                            {formatChips(player.current_chips)} chips
                            {player.rebuy_count > 0 && ` — ${player.rebuy_count}R`}
                            {player.addon_taken && ' — A'}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => router.push(`/commander/td/${tournamentId}/players?move=${player.entry_id}`)}
                            className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]"
                            title="Move Player"
                          >
                            <ArrowRightLeft className="w-4 h-4 text-[#B0B3B8]" />
                          </button>
                          <button
                            onClick={() => handleEliminate(player.entry_id, player.player_name)}
                            disabled={actionLoading === player.entry_id}
                            className="w-10 h-10 rounded-lg bg-[#EF4444]/10 flex items-center justify-center active:bg-[#EF4444]/20 disabled:opacity-50"
                            title="Eliminate"
                          >
                            {actionLoading === player.entry_id
                              ? <Loader2 className="w-4 h-4 text-[#EF4444] animate-spin" />
                              : <UserX className="w-4 h-4 text-[#EF4444]" />
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Break Table button */}
                {selectedTable.players.length > 0 && (
                  <div className="px-5 pb-5">
                    <button
                      onClick={async () => {
                        if (!confirm(`Break Table ${selectedTable.table_number}? All ${selectedTable.players.length} players will need to be moved to other tables.`)) return;
                        setActionLoading('break');
                        try {
                          // Eliminate/remove all players from this table
                          for (const player of selectedTable.players) {
                            await fetch(`/api/commander/tournaments/${tournamentId}/move-player`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
                              body: JSON.stringify({
                                entry_id: player.entry_id,
                                from_table: selectedTable.table_number,
                                status: 'needs_seat'
                              })
                            }).catch(() => { });
                          }
                          // Mark table as broken
                          await fetch(`/api/commander/tables/${selectedTable.table_number || selectedTable.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
                            body: JSON.stringify({ status: 'closed' })
                          }).catch(() => { });
                          setSelectedTable(null);
                          await fetchFloor();
                        } catch (err) { console.error(err); }
                        finally { setActionLoading(null); }
                      }}
                      disabled={actionLoading === 'break'}
                      className="w-full py-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-base font-semibold active:bg-[#EF4444]/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'break'
                        ? <><Loader2 className="w-5 h-5 animate-spin" /> Breaking Table...</>
                        : <><UserX className="w-5 h-5" /> Break Table ({selectedTable.players.length} players)</>
                      }
                    </button>
                  </div>
                )}
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
                  <UserX className="w-7 h-7" style={{ color: confirmAction.color }} />
                </div>
                <h3 className="text-lg font-bold text-white">{confirmAction.message}</h3>
                <p className="text-sm text-[#B0B3B8] mt-1">{confirmAction.detail}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmAction(null)}
                  className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">Cancel</button>
                <button onClick={async () => { setConfirmAction(null); await confirmAction.onConfirm(); }}
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
              const Icon = item.icon;
              const isActive = item.key === 'tables';
              return (
                <button key={item.key} onClick={() => navigateTo(item.path)}
                  className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-lg ${isActive ? 'text-[#1877F2]' : 'text-[#B0B3B8] active:text-[#E4E6EB]'
                    }`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </CommanderLayout>
  );
}
