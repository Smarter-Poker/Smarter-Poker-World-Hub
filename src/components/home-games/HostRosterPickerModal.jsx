/**
 * ══════════════════════════════════════════════════════════════════════════
 *  HostRosterPickerModal — phase 41 host-only seat-a-member flow
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Props:
 *    groupId     : UUID of the home-game group (commander_home_groups.id)
 *    tableId     : UUID of the table being seated
 *    seatNumber  : number 1..max_seats OR null (host will choose)
 *    maxSeats    : 2..10
 *    occupiedSeats: Set<number> — already-reserved seat numbers (used to hide
 *                  options when seatNumber is null)
 *    onClose     : () => void
 *    onSeated    : () => void — parent refreshes after a successful claim
 *
 *  Responsibilities:
 *    1. GET /api/home-games/roster?groupId=  to list approved members
 *    2. Filter-by-search
 *    3. Allow adding a NEW non-user member (displayName + optional phone)
 *       via POST /api/home-games/roster, then auto-select them
 *    4. If seatNumber is null, let host pick a seat from the available ones
 *    5. POST /api/home-games/tables/[tableId]/seat-member with the final
 *       { seatNumber, memberId }
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, UserPlus, Search, Loader2, Check, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAccessToken } from '../../lib/authUtils';

function authHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
               : { 'Content-Type': 'application/json' };
}

// bug-hunt-zero/B-SEAT-RES-{1,2,3}, B-ROSTER-PICK-{1,2}, B-CREATE-TBL-1:
// auto-inject X-Idempotency-Key on every mutating method so a timeout-then-
// retry doesn't double-claim a seat, double-add a roster member, or
// double-create a table. The header is cheap when the server doesn't yet
// honor it; it lets a future server-side dedupe land deterministically.
function makeIdemKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'idem_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function jsonFetch(url, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const extraHeaders = isMutation ? { 'X-Idempotency-Key': makeIdemKey() } : {};
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...extraHeaders, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const msg = body?.message || body?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = body?.error;
    err.status = res.status;
    throw err;
  }
  return body;
}

export default function HostRosterPickerModal({
  groupId,
  tableId,
  seatNumber: initialSeat,
  maxSeats = 9,
  occupiedSeats = new Set(),
  onClose,
  onSeated
}) {
  const [roster, setRoster]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [search, setSearch]               = useState('');
  const [selectedSeat, setSelectedSeat]   = useState(initialSeat || null);
  const [addingMember, setAddingMember]   = useState(false);
  const [newName, setNewName]             = useState('');
  const [newPhone, setNewPhone]           = useState('');
  const [saving, setSaving]               = useState(false);
  const [seatingMember, setSeatingMember] = useState(null); // member id being seated

  // ──────────────────────────── load roster ─────────────────────────────
  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await jsonFetch(
        `/api/home-games/roster?groupId=${encodeURIComponent(groupId)}`
      );
      setRoster(Array.isArray(body?.data) ? body.data : []);
    } catch (err) {
      setError(err.message || 'Could not load roster.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  // ──────────────────────────── add a new member ────────────────────────
  const submitNewMember = useCallback(async () => {
    const display = newName.trim();
    if (!display) {
      toast.error('Enter a name');
      return;
    }
    setSaving(true);
    try {
      const body = await jsonFetch('/api/home-games/roster', {
        method: 'POST',
        body: JSON.stringify({
          groupId,
          displayName: display.slice(0, 120),
          phone: newPhone.trim() || null
        })
      });
      const newId = body?.memberId;
      toast.success(`${display} added to the roster`);
      setAddingMember(false);
      setNewName('');
      setNewPhone('');
      await loadRoster();
      // Auto-seat the new member if the host already picked a seat
      if (newId && selectedSeat) {
        await seatMember(newId);
      }
    } catch (err) {
      toast.error(err.message || 'Could not add member');
    } finally {
      setSaving(false);
    }
  }, [groupId, newName, newPhone, selectedSeat, loadRoster]);

  // ──────────────────────────── seat a member ───────────────────────────
  const seatMember = useCallback(async (memberId) => {
    if (!selectedSeat) {
      toast.error('Pick a seat first');
      return;
    }
    if (!memberId) return;
    setSeatingMember(memberId);
    try {
      await jsonFetch(
        `/api/home-games/tables/${encodeURIComponent(tableId)}/seat-member`,
        {
          method: 'POST',
          body: JSON.stringify({
            seatNumber: selectedSeat,
            memberId
          })
        }
      );
      toast.success('Seated');
      onSeated?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not seat that member');
    } finally {
      setSeatingMember(null);
    }
  }, [selectedSeat, tableId, onSeated, onClose]);

  // ──────────────────────────── filtered roster ─────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((m) =>
      (m.display_name || '').toLowerCase().includes(q) ||
      (m.phone || '').toLowerCase().includes(q)
    );
  }, [roster, search]);

  // ──────────────────────────── seat picker options ─────────────────────
  const seatOptions = useMemo(() => {
    const out = [];
    for (let n = 1; n <= maxSeats; n += 1) {
      out.push({ n, occupied: occupiedSeats.has(n) });
    }
    return out;
  }, [maxSeats, occupiedSeats]);

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[210] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hrp-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-gradient-to-b from-[#152036] to-[#0d1626] border border-white/10 rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl text-white">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="hrp-title" className="text-xl font-bold">Seat a member</h2>
            <p className="text-sm text-white/60 mt-1">
              Pick an approved member (or add someone new) and drop them into a seat.
            </p>
          </div>
          <button
            type="button"
            className="text-white/60 hover:text-white rounded-full p-1 -m-1"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seat picker (only when seatNumber wasn't preselected) */}
        {!initialSeat && (
          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">
              Seat
            </label>
            <div className="flex flex-wrap gap-2">
              {seatOptions.map(({ n, occupied }) => {
                const active = selectedSeat === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={occupied}
                    onClick={() => setSelectedSeat(n)}
                    className={[
                      'w-10 h-10 rounded-lg border text-sm font-semibold transition-colors',
                      occupied
                        ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                        : active
                        ? 'bg-indigo-500 border-indigo-400 text-white'
                        : 'bg-white/5 border-white/20 text-white hover:bg-white/10'
                    ].join(' ')}
                    aria-label={`Seat ${n}${occupied ? ' (occupied)' : ''}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {initialSeat && (
          <p className="text-sm mb-4 text-white/80">
            Seating at <span className="font-semibold text-white">Seat {initialSeat}</span>.
          </p>
        )}

        {/* Search + Add-new */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roster…"
              className="w-full pl-9 pr-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-400/60"
            />
          </div>
          <button
            type="button"
            onClick={() => setAddingMember((v) => !v)}
            className={[
              'px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border transition-colors',
              addingMember
                ? 'bg-white/10 border-white/20 text-white'
                : 'bg-indigo-500/20 border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/30'
            ].join(' ')}
          >
            <UserPlus className="w-4 h-4" />
            {addingMember ? 'Cancel' : 'Add new'}
          </button>
        </div>

        {/* Add-new form */}
        {addingMember && (
          <div className="bg-black/30 border border-indigo-400/20 rounded-lg p-3 mb-3 space-y-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-white/50 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value.slice(0, 120))}
                placeholder="Alex Pappadopoulos"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-md text-sm focus:outline-none focus:border-indigo-400/60"
                maxLength={120}
                autoFocus
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/50 mb-1">
                <Phone className="w-3 h-3" /> Phone (optional)
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value.slice(0, 40))}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-md text-sm focus:outline-none focus:border-indigo-400/60"
                maxLength={40}
              />
            </div>
            <button
              type="button"
              onClick={submitNewMember}
              disabled={saving || !newName.trim()}
              className="w-full px-3 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/40 disabled:cursor-not-allowed rounded-md text-sm font-semibold flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {selectedSeat ? 'Add & seat at ' + selectedSeat : 'Add to roster'}
            </button>
          </div>
        )}

        {/* Roster list */}
        {loading ? (
          <div className="flex items-center justify-center py-10 text-white/50">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading roster…
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-200">
            {error}
            <button
              type="button"
              className="ml-2 underline hover:text-white"
              onClick={loadRoster}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-white/50">
            {search ? 'No matches.' : 'No approved members yet. Add someone new to get started.'}
          </div>
        ) : (
          <ul className="divide-y divide-white/5 border border-white/10 rounded-lg bg-black/20 overflow-hidden">
            {filtered.map((m) => {
              const canSeat = !!selectedSeat && seatingMember !== m.id;
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/40 to-violet-500/40 border border-white/10 flex items-center justify-center text-sm font-bold uppercase">
                    {(m.display_name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{m.display_name}</span>
                      {m.is_roster_only && (
                        <span className="text-[10px] uppercase tracking-wider bg-white/10 text-white/70 px-1.5 py-0.5 rounded">
                          Roster-only
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/50 truncate">
                      {m.phone || (m.user_id ? 'User' : 'No phone on file')}
                      {typeof m.games_attended === 'number' && m.games_attended > 0
                        ? ` · ${m.games_attended} game${m.games_attended === 1 ? '' : 's'}`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canSeat}
                    onClick={() => seatMember(m.id)}
                    className={[
                      'px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5',
                      canSeat
                        ? 'bg-indigo-500 hover:bg-indigo-400 text-white'
                        : 'bg-white/10 text-white/40 cursor-not-allowed'
                    ].join(' ')}
                  >
                    {seatingMember === m.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    {selectedSeat ? `Seat ${selectedSeat}` : 'Seat'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
