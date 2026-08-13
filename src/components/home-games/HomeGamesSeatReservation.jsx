/**
 * ══════════════════════════════════════════════════════════════════════════
 *  HomeGamesSeatReservation — multi-table seat reservation surface (phase 41)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Single prop: gameId (uuid of the commander_home_games event row).
 *
 *  Responsibilities:
 *    1. Load tables + reservations via GET /api/home-games/tables
 *    2. Subscribe to Supabase Realtime on commander_home_seat_reservations
 *       and commander_home_game_tables, filtered by this game's tables
 *    3. Render one <SeatGridTable/> per table
 *    4. Route claim/release/change actions to the matching API endpoints
 *    5. Surface host-only affordances (seat-member, add-table)
 *
 *  Error model:
 *    Any 4xx/5xx from the API is shown as a toast and the component refetches
 *    to get back into a known-good state. No stale client-side state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import SeatGridTable from './SeatGridTable';
import { getAccessToken } from '../../lib/authUtils';
import { supabase } from '../../lib/supabase';

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

export default function HomeGamesSeatReservation({
  gameId,
  currentUserId,     // UUID from session, or null when signed-out
  isHost = false,
  onOpenRosterPicker, // optional ({tableId, seatNumber}) => void — opens a roster modal
  onCreateTable       // optional () => void — opens the Commander "Add Table" flow
}) {
  const [loading, setLoading]         = useState(true);
  const [tables, setTables]           = useState([]);
  const [error, setError]             = useState(null);
  const [busy, setBusy]               = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const channelsRef                   = useRef([]);

  // ────────────────────────────── data load ───────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!gameId) return;
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const body = await jsonFetch(`/api/home-games/tables?gameId=${encodeURIComponent(gameId)}`);
      setTables(body.data?.tables || []);
      setError(null);
    } catch (e) {
      if (e.code === 'AUTH_REQUIRED' || e.status === 401) {
        setError({ code: 'AUTH_REQUIRED',
                   message: 'Sign in to see who\'s playing.' });
      } else if (e.code === 'NOT_A_MEMBER') {
        setError({ code: 'NOT_A_MEMBER',
                   message: 'Follow or join this home game to see the seat list.' });
      } else {
        setError({ code: e.code || 'LOAD_FAILED', message: e.message });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  // ─────────────────────────── realtime subscribe ─────────────────────────
  // audit F-28: this effect used to depend on `tables.length`. A delete
  // plus an add between refetches leaves the count unchanged, so the
  // subscription stayed bound to a table_id that no longer exists and
  // silently stopped delivering seat updates. Key on the actual id set.
  const tableIdsKey = useMemo(
    () => tables.map(t => t.id).sort().join(','),
    [tables]
  );

  useEffect(() => {
    if (!gameId || tables.length === 0 || !supabase) return;

    // Clean up prior channels
    for (const ch of channelsRef.current) {
      try { supabase.removeChannel(ch); } catch (e) { console.warn('[App] Handled exception:', e); }
    }
    channelsRef.current = [];

    const tableIds = tables.map(t => t.id);

    // One channel for reservations on our tables, one for table-status flips
    const resChannel = supabase
      .channel(`hg-res-${gameId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'commander_home_seat_reservations',
            filter: `table_id=in.(${tableIds.join(',')})` },
          () => load(true))
      .subscribe();

    const tableChannel = supabase
      .channel(`hg-tables-${gameId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'commander_home_game_tables',
            filter: `game_id=eq.${gameId}` },
          () => load(true))
      .subscribe();

    channelsRef.current = [resChannel, tableChannel];

    return () => {
      for (const ch of channelsRef.current) {
        try { supabase.removeChannel(ch); } catch (e) { console.warn('[App] Handled exception:', e); }
      }
      channelsRef.current = [];
    };
  }, [gameId, tableIdsKey, load]);

  // ───────────────────────── mutation handlers ────────────────────────────
  const handleClaim = useCallback(async (tableId, seatNumber, isGuest) => {
    setBusy(`seat:${seatNumber}`);
    try {
      await jsonFetch('/api/home-games/seats/claim', {
        method: 'POST',
        body: JSON.stringify({ tableId, seatNumber, isGuest: !!isGuest })
      });
      toast.success(isGuest ? 'Guest seat locked up' : 'Seat locked up');
      await load(true);
    } catch (e) {
      toast.error(e.message || 'Failed to claim seat');
      await load(true); // refetch, another user may have taken it
    } finally {
      setBusy(null);
    }
  }, [load]);

  const handleRelease = useCallback(async (reservationId) => {
    setBusy(reservationId);
    try {
      await jsonFetch(`/api/home-games/seats/${encodeURIComponent(reservationId)}/release`, {
        method: 'POST'
      });
      toast.success('Seat released');
      await load(true);
    } catch (e) {
      toast.error(e.message || 'Failed to release seat');
      await load(true);
    } finally {
      setBusy(null);
    }
  }, [load]);

  const handleChange = useCallback(async (reservationId, newSeatNumber) => {
    setBusy(reservationId);
    try {
      await jsonFetch(`/api/home-games/seats/${encodeURIComponent(reservationId)}/change`, {
        method: 'POST',
        body: JSON.stringify({ newSeatNumber })
      });
      toast.success(`Moved to seat ${newSeatNumber}`);
      await load(true);
    } catch (e) {
      toast.error(e.message || 'Failed to change seat');
      await load(true);
    } finally {
      setBusy(null);
    }
  }, [load]);

  const handleHostSeatMember = useCallback((tableId, seatNumber) => {
    if (!onOpenRosterPicker) {
      // This stub was reachable in production because pages/hub/home-games/[slug].js
      // hardcoded isHost={false}. Kept as a guard for callers that genuinely
      // do not supply a picker, but it is no longer the host's only outcome.
      toast('Seating from the roster is available on the host dashboard.', { icon: 'ℹ️' });
      return;
    }
    // Look up the target table from our own state so the picker modal receives
    // authoritative context.  Previously we passed only {tableId, seatNumber}
    // and the caller hardcoded maxSeats=9 + occupiedSeats=empty, which meant:
    //   (a) 6-max tables would offer seats 7-9 that fail DB SEAT_OUT_OF_BOUNDS
    //   (b) already-claimed seats weren't dimmed in the picker
    const table = tables.find((t) => t.id === tableId);
    if (!table) {
      toast.error('Table not found');
      return;
    }
    const occupied = new Set(
      (table.reservations || [])
        .filter((r) => r.status === 'reserved' || r.status === 'seated')
        .map((r) => r.seat_number)
    );
    onOpenRosterPicker({
      tableId,
      seatNumber: seatNumber || null,
      maxSeats: table.max_seats || 9,
      occupiedSeats: occupied,
    });
  }, [onOpenRosterPicker, tables]);

  // ───────────────────────────── rendering ────────────────────────────────
  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center text-[#94A3B8]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading tables…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-[#F59E0B] mt-0.5" />
        <div className="flex-1">
          <div className="text-[#F59E0B] font-medium">Can't show the seat list</div>
          <div className="text-sm text-[#F59E0B]/80 mt-1">{error.message}</div>
        </div>
        <button onClick={() => load()} className="text-[#F59E0B] hover:text-[#FBBF24]">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="text-center py-8 text-[#94A3B8]">No tables yet for this event.</div>
    );
  }

  // ───────────────────────── host: start a table ──────────────────────────
  // POST /api/home-games/tables/[tableId]/start existed with ZERO callers, so
  // open_for_rsvp -> running could never happen from the product and
  // commander_home_seats was never materialised (audit F-08).
  //
  // Starting is irreversible, and rpc_hg_start_table deliberately seats only
  // players who hold a seat reservation — RSVP and seat assignment are
  // separate steps by design. A host could therefore start a table without
  // realising confirmed players were never seated. Production currently holds
  // 8 yes-RSVPs and 0 reservations, so this is live, not theoretical.
  // fn_home_game_unseated_confirmed (migration phase57) drives the warning.
  const handleStartTable = useCallback(async (tableId) => {
    const table = tables.find(t => t.id === tableId);
    const seated = (table?.reservations || []).filter(
      r => r.status === 'reserved' || r.status === 'seated'
    ).length;

    let warning = '';
    try {
      const j = await jsonFetch(`/api/home-games/tables/${tableId}/unseated`);
      {
        const n = j?.unseated?.length || 0;
        if (n > 0) {
          warning =
            `\n\n${n} player${n === 1 ? '' : 's'} RSVP'd yes but ${n === 1 ? 'is' : 'are'} not seated ` +
            `at any table. Starting now will leave ${n === 1 ? 'them' : 'them'} out.`;
        }
      }
    } catch (_e) { /* advisory only — never block the host on it */ }

    if (!window.confirm(
      `Start this table with ${seated} seated player${seated === 1 ? '' : 's'}?` +
      `${warning}\n\nThis cannot be undone.`
    )) return;

    setBusy(`start:${tableId}`);
    try {
      await jsonFetch(`/api/home-games/tables/${tableId}/start`, { method: 'POST' });
      toast.success('Table started');
      await load(true);
    } catch (err) {
      toast.error(err?.message || 'Could not start the table');
    } finally {
      setBusy(null);
    }
  }, [tables, load]);

  return (
    <div className="space-y-6">
      {refreshing && (
        <div className="text-[10px] uppercase tracking-widest text-[#22D3EE]/70
                        flex items-center gap-1 justify-end">
          <Loader2 className="w-3 h-3 animate-spin" /> live
        </div>
      )}

      {tables.map(table => (
        <SeatGridTable
          key={table.id}
          table={table}
          currentUserId={currentUserId}
          isHost={isHost}
          busy={busy}
          onClaim={handleClaim}
          onRelease={handleRelease}
          onChange={handleChange}
          onHostSeatMember={handleHostSeatMember}
          onStartTable={isHost ? handleStartTable : undefined}
        />
      ))}

      {isHost && onCreateTable && (
        <button
          onClick={onCreateTable}
          className="w-full h-12 rounded-lg border-2 border-dashed border-[#4A5E78]
                     text-[#94A3B8] hover:border-[#22D3EE] hover:text-[#22D3EE]
                     flex items-center justify-center gap-2 transition"
        >
          <Plus className="w-4 h-4" />
          Add another table
        </button>
      )}
    </div>
  );
}
