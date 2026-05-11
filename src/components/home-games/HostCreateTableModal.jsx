/**
 * ══════════════════════════════════════════════════════════════════════════
 *  HostCreateTableModal — phase 41 host-only "add another table" flow
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Props:
 *    gameId     : UUID (commander_home_games.id)
 *    defaults   : { gameType, stakes, format, maxSeats, buyinMin, buyinMax }
 *                 typically sourced from the existing default table so a host
 *                 adding a "second" table only has to change what's different
 *    onClose    : () => void
 *    onCreated  : () => void — parent refreshes after a successful create
 *
 *  POSTs to /api/home-games/tables with the full payload. On success the
 *  new table becomes immediately available for seat claims.
 */
import { useCallback, useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAccessToken } from '../../lib/authUtils';

const GAME_TYPES = [
  { value: 'NLH',    label: "No-Limit Hold'em" },
  { value: 'PLO',    label: 'Pot-Limit Omaha (4-card)' },
  { value: 'PLO5',   label: 'Pot-Limit Omaha (5-card)' },
  { value: 'PLO8',   label: 'Omaha Hi/Lo' },
  { value: 'MIXED',  label: 'Mixed games' },
  { value: 'STUD',   label: '7-Card Stud' },
  { value: 'OTHER',  label: 'Other' }
];

const FORMATS = [
  { value: 'cash',       label: 'Cash' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'sitngo',     label: 'Sit & Go' },
  { value: 'mixed',      label: 'Mixed' }
];

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

export default function HostCreateTableModal({
  gameId,
  defaults = {},
  onClose,
  onCreated
}) {
  const [name, setName]           = useState('');
  const [gameType, setGameType]   = useState(defaults.gameType || 'NLH');
  const [format, setFormat]       = useState(defaults.format || 'cash');
  const [stakes, setStakes]       = useState(defaults.stakes || '');
  const [maxSeats, setMaxSeats]   = useState(defaults.maxSeats || 9);
  const [buyinMin, setBuyinMin]   = useState(
    defaults.buyinMin != null ? String(defaults.buyinMin) : ''
  );
  const [buyinMax, setBuyinMax]   = useState(
    defaults.buyinMax != null ? String(defaults.buyinMax) : ''
  );
  const [saving, setSaving]       = useState(false);

  const submit = useCallback(async (e) => {
    e?.preventDefault?.();
    const seats = parseInt(maxSeats, 10);
    if (!Number.isFinite(seats) || seats < 2 || seats > 10) {
      toast.error('Max seats must be 2–10');
      return;
    }
    const parsedMin = buyinMin === '' ? null : parseInt(buyinMin, 10);
    const parsedMax = buyinMax === '' ? null : parseInt(buyinMax, 10);
    if (parsedMin != null && !Number.isFinite(parsedMin)) {
      toast.error('Minimum buy-in must be a number');
      return;
    }
    if (parsedMax != null && !Number.isFinite(parsedMax)) {
      toast.error('Maximum buy-in must be a number');
      return;
    }
    if (parsedMin != null && parsedMax != null && parsedMin > parsedMax) {
      toast.error('Minimum buy-in cannot exceed maximum');
      return;
    }

    setSaving(true);
    try {
      await jsonFetch('/api/home-games/tables', {
        method: 'POST',
        body: JSON.stringify({
          gameId,
          name:     name.trim() || null,
          gameType,
          format,
          stakes:   stakes.trim() || null,
          maxSeats: seats,
          buyinMin: parsedMin,
          buyinMax: parsedMax
        })
      });
      toast.success('Table added');
      onCreated?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not create table');
    } finally {
      setSaving(false);
    }
  }, [gameId, name, gameType, format, stakes, maxSeats, buyinMin, buyinMax, onCreated, onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[210] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hct-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <form
        onSubmit={submit}
        className="bg-gradient-to-b from-[#152036] to-[#0d1626] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl text-white"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="hct-title" className="text-xl font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" /> Add a table
            </h2>
            <p className="text-sm text-white/60 mt-1">
              Host a second (or third) table with its own stakes and format.
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

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="hct-name" className="block text-xs uppercase tracking-wider text-white/50 mb-1">
              Table name (optional)
            </label>
            <input
              id="hct-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="Big table, short-handed, etc."
              className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-indigo-400/60"
              maxLength={60}
            />
          </div>

          {/* Game type + Format */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="hct-gametype" className="block text-xs uppercase tracking-wider text-white/50 mb-1">
                Game
              </label>
              <select
                id="hct-gametype"
                value={gameType}
                onChange={(e) => setGameType(e.target.value)}
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-indigo-400/60"
              >
                {GAME_TYPES.map((g) => (
                  <option key={g.value} value={g.value} className="bg-[#0d1626]">{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hct-format" className="block text-xs uppercase tracking-wider text-white/50 mb-1">
                Format
              </label>
              <select
                id="hct-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-indigo-400/60"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value} className="bg-[#0d1626]">{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stakes */}
          <div>
            <label htmlFor="hct-stakes" className="block text-xs uppercase tracking-wider text-white/50 mb-1">
              Stakes
            </label>
            <input
              id="hct-stakes"
              type="text"
              value={stakes}
              onChange={(e) => setStakes(e.target.value.slice(0, 100))}
              placeholder="1/2, 2/5, $100 bounty, etc."
              className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-indigo-400/60"
              maxLength={100}
            />
          </div>

          {/* Max seats */}
          <div>
            <label htmlFor="hct-maxseats" className="block text-xs uppercase tracking-wider text-white/50 mb-1">
              Max seats (2–10)
            </label>
            <input
              id="hct-maxseats"
              type="number"
              min={2}
              max={10}
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
              className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-indigo-400/60"
              required
            />
          </div>

          {/* Buy-ins */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="hct-buyinmin" className="block text-xs uppercase tracking-wider text-white/50 mb-1">
                Min buy-in (optional)
              </label>
              <input
                id="hct-buyinmin"
                type="number"
                min={0}
                value={buyinMin}
                onChange={(e) => setBuyinMin(e.target.value)}
                placeholder="100"
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-indigo-400/60"
              />
            </div>
            <div>
              <label htmlFor="hct-buyinmax" className="block text-xs uppercase tracking-wider text-white/50 mb-1">
                Max buy-in (optional)
              </label>
              <input
                id="hct-buyinmax"
                type="number"
                min={0}
                value={buyinMax}
                onChange={(e) => setBuyinMax(e.target.value)}
                placeholder="300"
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-indigo-400/60"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/70"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white flex items-center gap-2 disabled:bg-indigo-500/40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Add table'}
          </button>
        </div>
      </form>
    </div>
  );
}
