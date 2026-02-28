/**
 * Tournament Director — Registration Desk
 * /commander/td/[tournamentId]/register
 * Quick register new players, process rebuys/re-entries, auto-seat assignment
 * Shows late reg timer, alternate list, entry counts
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import CommanderLayout from '../../../../src/components/commander/shared/CommanderLayout';
import {
  Trophy, LayoutGrid, Users, Scale, UserPlus, Monitor,
  Loader2, RefreshCw, Search, CheckCircle2, AlertTriangle,
  UserCheck, DollarSign, Clock, X, ListOrdered, Coins
} from 'lucide-react';

const NAV_ITEMS = [
  { key: 'control', path: '' }, { key: 'tables', path: '/tables' },
  { key: 'players', path: '/players' }, { key: 'balance', path: '/balance' },
  { key: 'register', path: '/register' }, { key: 'clock', path: '/clock' },
];
const NAV_ICONS = { control: Trophy, tables: LayoutGrid, players: Users, balance: Scale, register: UserPlus, clock: Monitor };

function formatMoney(n) { return n ? '$' + n.toLocaleString() : '$0'; }

export default function TDRegister() {
  const router = useRouter();
  const { tournamentId } = router.query;
  const [floor, setFloor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [manualTable, setManualTable] = useState('');
  const [manualSeat, setManualSeat] = useState('');
  const [autoSeat, setAutoSeat] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [searchingMembers, setSearchingMembers] = useState(false);

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

  useEffect(() => { fetchFloor(); const i = setInterval(fetchFloor, 8000); return () => clearInterval(i); }, [fetchFloor]);

  const searchMembers = async (q) => {
    if (!q || q.length < 2) { setMemberResults([]); return; }
    setSearchingMembers(true);
    try {
      const res = await fetch(`/api/commander/members/search?q=${encodeURIComponent(q)}&limit=5`, {
        headers: { 'x-staff-session': getToken() }
      });
      const json = await res.json();
      if (json.success) setMemberResults(json.data || []);
    } catch (err) { console.error(err); }
    finally { setSearchingMembers(false); }
  };

  const handleMemberSearchChange = (val) => {
    setMemberSearch(val);
    searchMembers(val);
  };

  const selectMember = (member) => {
    setPlayerName(member.name || `${member.first_name || ''} ${member.last_name || ''}`.trim());
    setPlayerPhone(member.phone || '');
    setMemberSearch('');
    setMemberResults([]);
  };

  // Auto-seat: find table with fewest players, first open seat
  const getAutoSeatAssignment = () => {
    const tables = floor?.tables || [];
    if (tables.length === 0) return null;
    const available = tables.filter(t => t.available_seats > 0).sort((a, b) => a.player_count - b.player_count);
    if (available.length === 0) return null;
    const target = available[0];
    const occupied = target.players.map(p => p.seat_number);
    for (let s = 1; s <= target.max_seats; s++) {
      if (!occupied.includes(s)) return { table: target.table_number, seat: s };
    }
    return null;
  };

  const handleRegister = async () => {
    if (!playerName.trim()) return;
    setRegistering(true);
    setLastResult(null);

    let tableNum, seatNum;
    if (autoSeat) {
      const assignment = getAutoSeatAssignment();
      if (assignment) {
        tableNum = assignment.table;
        seatNum = assignment.seat;
      }
    } else {
      tableNum = manualTable ? parseInt(manualTable) : undefined;
      seatNum = manualSeat ? parseInt(manualSeat) : undefined;
    }

    try {
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
        body: JSON.stringify({
          player_name: playerName.trim(),
          player_phone: playerPhone.trim() || undefined,
          table_number: tableNum,
          seat_number: seatNum
        })
      });
      const json = await res.json();
      if (res.ok) {
        setLastResult({ success: true, entry: json.entry });
        setPlayerName('');
        setPlayerPhone('');
        setManualTable('');
        setManualSeat('');
        await fetchFloor();
      } else {
        setLastResult({ success: false, error: json.error || 'Registration failed' });
      }
    } catch (err) {
      setLastResult({ success: false, error: 'Registration failed' });
    } finally {
      setRegistering(false);
    }
  };

  const navigateTo = (path) => router.push(`/commander/td/${tournamentId}${path}`);

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  const stats = floor?.stats || {};
  const tournament = floor?.tournament || {};
  const autoAssignment = getAutoSeatAssignment();

  return (
    <CommanderLayout title="Commander — Register" backHref={`/commander/td/${tournamentId}`}>
      <SEOHead
        title="Commander — Register"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] pb-20 font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3">
          <h1 className="text-lg font-bold text-white">Registration</h1>
          <div className="flex items-center gap-3 text-xs text-[#B0B3B8] mt-1">
            <span>{stats.total_entries || 0} entries</span>
            <span>{stats.total_rebuys || 0} rebuys</span>
            <span>{stats.total_addons || 0} add-ons</span>
            {stats.late_reg_open && (
              <span className="text-[#1877F2] font-medium">Late reg: {stats.levels_until_late_reg_closes}L left</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-[#B0B3B8] mt-1">
            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{formatMoney(tournament.buyin_amount)}{tournament.buyin_fee ? ` + ${formatMoney(tournament.buyin_fee)} fee` : ''}</span>
            <span className="flex items-center gap-1"><Coins className="w-3 h-3" />{(tournament.starting_chips || 0).toLocaleString()} chips</span>
          </div>
        </div>

        {/* Entry Info */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 text-center">
              <p className="text-lg font-bold text-white">{formatMoney(tournament.buyin_amount)}</p>
              <p className="text-[10px] text-[#B0B3B8] uppercase">Buy-In</p>
            </div>
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 text-center">
              <p className="text-lg font-bold text-white">{formatMoney(tournament.rebuy_cost)}</p>
              <p className="text-[10px] text-[#B0B3B8] uppercase">Rebuy</p>
            </div>
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 text-center">
              <p className="text-lg font-bold text-[#F59E0B]">{tournament.starting_chips ? formatMoney(tournament.starting_chips).replace('$', '') : '--'}</p>
              <p className="text-[10px] text-[#B0B3B8] uppercase">Start Chips</p>
            </div>
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-3 text-center">
              <p className="text-lg font-bold text-white">{formatMoney(stats.prize_pool)}</p>
              <p className="text-[10px] text-[#B0B3B8] uppercase">Prize Pool</p>
            </div>
          </div>
          {/* Max entries indicator */}
          {tournament.max_entries && (
            <div className={`mt-2 text-xs text-center py-1.5 rounded-lg ${stats.total_entries >= tournament.max_entries
              ? 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30'
              : 'bg-[#3A3B3C]/50 text-[#B0B3B8]'
              }`}>
              {stats.total_entries >= tournament.max_entries
                ? `MAX CAPACITY REACHED (${tournament.max_entries})`
                : `${tournament.max_entries - (stats.total_entries || 0)} of ${tournament.max_entries} spots remaining`
              }
            </div>
          )}
        </div>

        {/* Registration Form */}
        <div className="px-4 py-2">
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 space-y-4">
            <h2 className="text-base font-bold text-white">Register Player</h2>

            {/* Member Search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={e => handleMemberSearchChange(e.target.value)}
                  placeholder="Search Existing Members..."
                  className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl pl-10 pr-4 py-3 text-[#E4E6EB] text-base placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]"
                />
              </div>
              {memberResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-[#3A3B3C] rounded-xl border border-[#4A4B4C] z-10 overflow-hidden">
                  {memberResults.map(m => (
                    <button key={m.id} onClick={() => selectMember(m)}
                      className="w-full text-left px-4 py-3 hover:bg-[#4A4B4C] active:bg-[#4A4B4C] border-b border-[#4A4B4C] last:border-0">
                      <p className="text-sm text-[#E4E6EB]">{m.name || `${m.first_name} ${m.last_name}`}</p>
                      {m.phone && <p className="text-xs text-[#B0B3B8]">{m.phone}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="text-xs text-[#B0B3B8] mb-1 block">Player Name</label>
              <input
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-[#E4E6EB] text-base placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs text-[#B0B3B8] mb-1 block">Phone (optional)</label>
              <input
                type="tel"
                value={playerPhone}
                onChange={e => setPlayerPhone(e.target.value)}
                placeholder="Phone Number"
                className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-[#E4E6EB] text-base placeholder-[#B0B3B8]/50 focus:outline-none focus:border-[#1877F2]"
              />
            </div>

            {/* Seat Assignment Toggle */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <button onClick={() => setAutoSeat(true)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${autoSeat ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'
                    }`}>Auto Seat</button>
                <button onClick={() => setAutoSeat(false)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${!autoSeat ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'
                    }`}>Manual</button>
              </div>

              {autoSeat ? (
                <div className="bg-[#3A3B3C]/50 rounded-lg px-3 py-2 text-sm text-[#B0B3B8]">
                  {autoAssignment
                    ? <>Will seat at Table {autoAssignment.table} Seat {autoAssignment.seat}</>
                    : 'No available seats'
                  }
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#B0B3B8] mb-1 block">Table</label>
                    <input type="number" value={manualTable} onChange={e => setManualTable(e.target.value)}
                      placeholder="#" className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-center focus:outline-none focus:border-[#1877F2]" />
                  </div>
                  <div>
                    <label className="text-xs text-[#B0B3B8] mb-1 block">Seat</label>
                    <input type="number" value={manualSeat} onChange={e => setManualSeat(e.target.value)}
                      placeholder="#" className="w-full bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl px-4 py-3 text-white text-center focus:outline-none focus:border-[#1877F2]" />
                  </div>
                </div>
              )}
            </div>

            {/* Register Button */}
            <button onClick={handleRegister}
              disabled={!playerName.trim() || registering || (autoSeat && !autoAssignment)}
              className="w-full py-4 rounded-xl bg-[#31A24C] text-white text-base font-semibold flex items-center justify-center gap-2 active:bg-[#28883F] disabled:opacity-50">
              {registering
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Registering...</>
                : <><UserPlus className="w-5 h-5" /> Register Player</>
              }
            </button>

            {/* Add to Alternate List (when no seats) */}
            {!autoAssignment && playerName.trim() && (
              <button onClick={async () => {
                setRegistering(true);
                try {
                  const res = await fetch(`/api/commander/tournaments/${tournamentId}/entries`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-staff-session': getToken() },
                    body: JSON.stringify({
                      player_name: playerName.trim(),
                      player_phone: playerPhone.trim() || undefined,
                      status: 'alternate'
                    })
                  });
                  const json = await res.json();
                  if (res.ok) {
                    setLastResult({ success: true, data: { alternate: true } });
                    setPlayerName('');
                    setPlayerPhone('');
                    await fetchFloor();
                  } else {
                    setLastResult({ success: false, error: json.error || 'Failed to add alternate' });
                  }
                } catch { setLastResult({ success: false, error: 'Failed to add alternate' }); }
                finally { setRegistering(false); }
              }}
                disabled={registering}
                className="w-full py-4 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-base font-semibold flex items-center justify-center gap-2 active:bg-[#F59E0B]/20 disabled:opacity-50">
                <ListOrdered className="w-5 h-5" /> Add to Alternate List
              </button>
            )}

            {/* Result */}
            {lastResult && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${lastResult.success ? 'bg-[#31A24C]/10 text-[#31A24C]' : 'bg-[#EF4444]/10 text-[#EF4444]'
                }`}>
                {lastResult.success
                  ? lastResult.data?.alternate
                    ? <><ListOrdered className="w-4 h-4" /> Added to alternate list</>
                    : <><CheckCircle2 className="w-4 h-4" /> Registered — T{lastResult.entry?.table_number || '?'} S{lastResult.entry?.seat_number || '?'}</>
                  : <><AlertTriangle className="w-4 h-4" /> {lastResult.error || 'Failed'}</>
                }
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {floor?.tables?.filter(t => t.available_seats > 0).map(t => (
              <div key={t.table_number}
                className="flex-shrink-0 bg-[#242526] rounded-xl border border-[#3A3B3C] px-3 py-2 text-center min-w-[70px]">
                <p className="text-xs text-[#B0B3B8]">T{t.table_number}</p>
                <p className="text-sm font-bold text-white">{t.available_seats}</p>
                <p className="text-[10px] text-[#B0B3B8]">Open</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#242526] border-t border-[#3A3B3C] z-40">
          <div className="flex items-center justify-around h-16 max-w-2xl mx-auto">
            {NAV_ITEMS.map(item => {
              const Icon = NAV_ICONS[item.key];
              const isActive = item.key === 'register';
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
