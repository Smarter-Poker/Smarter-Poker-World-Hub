/**
 * Table Assignments — Floor Manager Control Center
 * /commander/table-assignments
 *
 * Each physical table (with a tablet) gets assigned to:
 *   - Inactive (table not in use, tablet shows idle screen)
 *   - Cash Game (game type + stakes, tablet shows cash dealer mode)
 *   - Tournament (linked to active tournament, tablet shows bust-out mode)
 *
 * The dealer tablet reads its table's mode on load and shows the correct interface.
 * Floor manager can change assignments at any time from this page.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Loader2, RefreshCw, Table2, Trophy, DollarSign,
  Power, ChevronRight, X, Check, AlertTriangle, Users, Wifi
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const GAME_TYPES = [
  { type: 'NLH', name: "No Limit Hold'em" },
  { type: 'PLO', name: 'Pot Limit Omaha' },
  { type: 'Mixed', name: 'Mixed Game' },
  { type: 'Omaha', name: 'Omaha Hi-Lo' },
  { type: 'Stud', name: '7-Card Stud' },
];

const STAKES_MAP = {
  NLH: ['$1/$2', '$1/$3', '$2/$5', '$5/$10', '$10/$25'],
  PLO: ['$1/$2', '$2/$5', '$5/$10', '$5/$25'],
  Mixed: ['$2/$4', '$4/$8', '$10/$20'],
  Omaha: ['$2/$4', '$4/$8', '$5/$10'],
  Stud: ['$1/$3', '$2/$4', '$3/$6'],
};

const MODE_COLORS = {
  inactive: { bg: '#3A3B3C', border: '#4A4B4C', text: '#B0B3B8', icon: Power },
  cash: { bg: '#31A24C', border: '#28883F', text: '#fff', icon: DollarSign },
  tournament: { bg: '#F59E0B', border: '#D97706', text: '#fff', icon: Trophy },
};

export default function TableAssignments() {
  const router = useRouter();
  const [tables, setTables] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [assignMode, setAssignMode] = useState(null); // 'inactive' | 'cash' | 'tournament'
  const [cashGame, setCashGame] = useState('NLH');
  const [cashStakes, setCashStakes] = useState('');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/commander/table-assignments', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) {
        setTables(json.data.tables || []);
        setTournaments(json.data.tournaments || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAssign = (table) => {
    setSelectedTable(table);
    setAssignMode(table.mode || 'inactive');
    setCashGame(table.game_type || 'NLH');
    setCashStakes(table.stakes || '');
    setSelectedTournament(table.tournament_id || null);
  };

  const saveAssignment = async () => {
    if (!selectedTable) return;
    setSaving(true);
    try {
      const body = { table_id: selectedTable.id, mode: assignMode };
      if (assignMode === 'cash') {
        body.game_type = cashGame;
        body.stakes = cashStakes || STAKES_MAP[cashGame]?.[0] || '$1/$2';
      }
      if (assignMode === 'tournament') {
        body.tournament_id = selectedTournament;
      }
      await fetch('/api/commander/table-assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body)
      });
      setSelectedTable(null);
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const closeTable = async (table) => {
    setClosing(table.id);
    try {
      await fetch('/api/commander/table-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ table_id: table.id })
      });
      await fetchData();
    } catch (err) { console.error(err); }
    finally { setClosing(null); }
  };

  // Stats
  const activeCash = tables.filter(t => t.mode === 'cash').length;
  const activeTournament = tables.filter(t => t.mode === 'tournament').length;
  const inactive = tables.filter(t => t.mode === 'inactive' || !t.mode).length;
  const totalPlayers = tables.reduce((s, t) => s + (t.active_players || 0), 0);

  if (loading) return (
    <CommanderLayout title="Table Assignments" backHref="/commander/dashboard">
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
    </div>
  );

  return (
    <><div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
<div className="flex-1">
            <h1 className="text-lg font-bold text-white">Table Assignments</h1>
            <p className="text-xs text-[#B0B3B8]">Assign tables to cash games or tournaments</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="px-4 py-3 flex gap-2">
          <div className="flex-1 bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-[#31A24C]">{activeCash}</p>
            <p className="text-[10px] text-[#31A24C]/80">Cash</p>
          </div>
          <div className="flex-1 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-[#F59E0B]">{activeTournament}</p>
            <p className="text-[10px] text-[#F59E0B]/80">Tournament</p>
          </div>
          <div className="flex-1 bg-[#3A3B3C]/50 border border-[#3A3B3C] rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-[#B0B3B8]">{inactive}</p>
            <p className="text-[10px] text-[#B0B3B8]/80">Inactive</p>
          </div>
          <div className="flex-1 bg-[#1877F2]/10 border border-[#1877F2]/30 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-[#1877F2]">{totalPlayers}</p>
            <p className="text-[10px] text-[#1877F2]/80">Players</p>
          </div>
        </div>

        {/* Table Grid */}
        <div className="px-4 pb-4 grid grid-cols-2 gap-3">
          {tables.map(table => {
            const mode = table.mode || 'inactive';
            const mc = MODE_COLORS[mode] || MODE_COLORS.inactive;
            const Icon = mc.icon;
            const isClosing = closing === table.id;

            return (
              <div key={table.id}
                className="rounded-2xl border-2 overflow-hidden"
                style={{ borderColor: mc.border, background: '#242526' }}>

                {/* Mode badge bar */}
                <div className="px-3 py-2 flex items-center gap-2"
                  style={{ background: mc.bg + (mode === 'inactive' ? '' : '30') }}>
                  <Icon className="w-4 h-4" style={{ color: mc.text === '#fff' && mode !== 'inactive' ? mc.bg : mc.text }} />
                  <span className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: mc.text === '#fff' && mode !== 'inactive' ? mc.bg : mc.text }}>
                    {mode === 'inactive' ? 'Inactive' : mode === 'cash' ? 'Cash Game' : 'Tournament'}
                  </span>
                </div>

                {/* Table info */}
                <div className="px-3 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-bold text-white">T{table.table_number}</span>
                    <span className="text-xs text-[#B0B3B8]">{table.max_seats} seats</span>
                  </div>

                  {mode === 'cash' && (
                    <div className="mb-2">
                      <p className="text-sm font-semibold text-[#31A24C]">{table.game_type} {table.stakes}</p>
                      <p className="text-xs text-[#B0B3B8]">
                        {table.active_players || 0} player{(table.active_players || 0) !== 1 ? 's' : ''} seated
                      </p>
                    </div>
                  )}

                  {mode === 'tournament' && (
                    <div className="mb-2">
                      <p className="text-sm font-semibold text-[#F59E0B] truncate">
                        {tournaments.find(t => t.id === table.tournament_id)?.name || 'Tournament'}
                      </p>
                      <p className="text-xs text-[#B0B3B8]">
                        {table.active_players || 0}/{table.max_seats} seated
                      </p>
                    </div>
                  )}

                  {mode === 'inactive' && (
                    <p className="text-xs text-[#6A6B6D] mb-2">Not assigned</p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button onClick={() => openAssign(table)}
                      className="flex-1 py-2 rounded-lg bg-[#1877F2] text-white text-xs font-semibold flex items-center justify-center gap-1 active:bg-[#1565D8]">
                      <Table2 className="w-3.5 h-3.5" /> Assign
                    </button>
                    {mode !== 'inactive' && (table.active_players || 0) === 0 && (
                      <button onClick={() => closeTable(table)} disabled={isClosing}
                        className="py-2 px-3 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-xs font-semibold flex items-center justify-center gap-1 active:bg-[#EF4444]/20 disabled:opacity-50">
                        {isClosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {tables.length === 0 && (
            <div className="col-span-2 text-center py-16">
              <Table2 className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
              <p className="text-[#B0B3B8]">No tables configured</p>
              <p className="text-xs text-[#6A6B6D] mt-1">Add tables in the Tables section first</p>
            </div>
          )}
        </div>

        {/* ===== ASSIGNMENT MODAL ===== */}
        {selectedTable && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={() => setSelectedTable(null)}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

              {/* Modal header */}
              <div className="sticky top-0 bg-[#242526] border-b border-[#3A3B3C] px-5 py-4 flex items-center justify-between z-10">
                <div>
                  <h3 className="text-lg font-bold text-white">Assign Table {selectedTable.table_number}</h3>
                  <p className="text-xs text-[#B0B3B8]">{selectedTable.max_seats} seats</p>
                </div>
                <button onClick={() => setSelectedTable(null)} className="p-2 rounded-lg active:bg-[#3A3B3C]">
                  <X className="w-5 h-5 text-[#B0B3B8]" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Warning if players seated */}
                {(selectedTable.active_players || 0) > 0 && selectedTable.mode !== 'inactive' && assignMode !== selectedTable.mode && (
                  <div className="p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#F59E0B]">
                      {selectedTable.active_players} player{selectedTable.active_players !== 1 ? 's are' : ' is'} currently at this table.
                      Changing mode will affect active sessions.
                    </p>
                  </div>
                )}

                {/* Mode Selection */}
                <div>
                  <p className="text-xs text-[#B0B3B8] mb-2 font-medium uppercase tracking-wider">Table Mode</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { mode: 'inactive', label: 'Inactive', icon: Power, color: '#B0B3B8' },
                      { mode: 'cash', label: 'Cash Game', icon: DollarSign, color: '#31A24C' },
                      { mode: 'tournament', label: 'Tournament', icon: Trophy, color: '#F59E0B' },
                    ].map(opt => (
                      <button key={opt.mode} onClick={() => setAssignMode(opt.mode)}
                        className={`py-4 rounded-xl border-2 flex flex-col items-center gap-2 ${
                          assignMode === opt.mode
                            ? 'border-[' + opt.color + '] bg-[' + opt.color + ']/10'
                            : 'border-[#3A3B3C] bg-[#3A3B3C]/30 active:bg-[#3A3B3C]'
                        }`}
                        style={assignMode === opt.mode ? { borderColor: opt.color, background: opt.color + '15' } : {}}>
                        <opt.icon className="w-6 h-6" style={{ color: assignMode === opt.mode ? opt.color : '#B0B3B8' }} />
                        <span className="text-xs font-semibold"
                          style={{ color: assignMode === opt.mode ? opt.color : '#B0B3B8' }}>
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cash Game Options */}
                {assignMode === 'cash' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-[#B0B3B8] mb-2 font-medium">Game Type</p>
                      <div className="flex flex-wrap gap-2">
                        {GAME_TYPES.map(g => (
                          <button key={g.type} onClick={() => { setCashGame(g.type); setCashStakes(''); }}
                            className={`px-4 py-2.5 rounded-xl text-sm font-medium ${
                              cashGame === g.type ? 'bg-[#31A24C] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
                            }`}>
                            {g.type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-[#B0B3B8] mb-2 font-medium">Stakes</p>
                      <div className="flex flex-wrap gap-2">
                        {(STAKES_MAP[cashGame] || []).map(s => (
                          <button key={s} onClick={() => setCashStakes(s)}
                            className={`px-4 py-2.5 rounded-xl text-sm font-medium ${
                              cashStakes === s ? 'bg-[#31A24C] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
                            }`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tournament Selection */}
                {assignMode === 'tournament' && (
                  <div>
                    <p className="text-xs text-[#B0B3B8] mb-2 font-medium">Select Tournament</p>
                    {tournaments.length === 0 ? (
                      <div className="p-4 bg-[#3A3B3C]/30 rounded-xl text-center">
                        <Trophy className="w-8 h-8 text-[#3A3B3C] mx-auto mb-2" />
                        <p className="text-sm text-[#B0B3B8]">No active tournaments</p>
                        <p className="text-xs text-[#6A6B6D] mt-1">Create a tournament first</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tournaments.map(t => (
                          <button key={t.id} onClick={() => setSelectedTournament(t.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl border-2 ${
                              selectedTournament === t.id
                                ? 'border-[#F59E0B] bg-[#F59E0B]/10'
                                : 'border-[#3A3B3C] bg-[#3A3B3C]/30 active:bg-[#3A3B3C]'
                            }`}>
                            <p className={`text-sm font-semibold ${selectedTournament === t.id ? 'text-[#F59E0B]' : 'text-white'}`}>
                              {t.name}
                            </p>
                            <p className="text-xs text-[#B0B3B8]">
                              {t.game_type} — {t.status} — ${t.buyin_amount || 0} buy-in
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Save button */}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setSelectedTable(null)}
                    className="flex-1 py-3.5 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-semibold active:bg-[#4A4B4C]">
                    Cancel
                  </button>
                  <button onClick={saveAssignment} disabled={saving || (assignMode === 'tournament' && !selectedTournament)}
                    className="flex-1 py-3.5 rounded-xl bg-[#1877F2] text-white font-semibold active:bg-[#1565D8] disabled:opacity-50 flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Save Assignment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    <style jsx>{`
      `}</style>
    </>
    </CommanderLayout>
  );
}