/**
 * ══════════════════════════════════════════════════════════════════════════
 *  SeatGridTable — one home-game table's seat grid (phase 41)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Visual: oval poker-table layout mirroring src/components/commander/staff/SeatPicker
 *  — same radii, same dark-industrial palette — but with RICHER interactions:
 *
 *    EMPTY SEAT     : click → claim flow (self or guest)
 *    OWN RESERVATION: Release | Change-to-…
 *    OTHER'S CLAIM  : disabled, shows player_name on hover + inline
 *
 *  All writes go through /api/home-games/{seats/claim, seats/:id/release,
 *  seats/:id/change}. No direct Supabase writes from the client.
 */
import { useMemo, useState } from 'react';
import { User, X, Lock, ArrowLeftRight, UserPlus, Loader2 } from 'lucide-react';

function getSeatPosition(index, total) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const radiusX = 140;
  const radiusY = 72;
  return {
    left: `calc(50% + ${Math.cos(angle) * radiusX}px - 28px)`,
    top:  `calc(50% + ${Math.sin(angle) * radiusY}px - 28px)`
  };
}

export default function SeatGridTable({
  table,                  // { id, table_number, name, game_type, stakes, max_seats, status, is_default, reservations: [] }
  currentUserId,          // UUID or null
  onClaim,                // async (tableId, seatNumber, isGuest) -> void
  onRelease,              // async (reservationId) -> void
  onChange,               // async (reservationId, newSeatNumber) -> void
  isHost,                 // boolean — host surfaces extra actions
  onHostSeatMember,       // async (tableId, seatNumber) -> void (opens roster picker)
  onStartTable,           // async (tableId) -> void — host only; open_for_rsvp -> running
  busy                    // reservationId or seatNumber string we're acting on
}) {
  const [pendingSeat, setPendingSeat] = useState(null); // seat number awaiting claim-confirm
  const [changeMode, setChangeMode]   = useState(null); // reservation id awaiting new-seat pick

  const maxSeats = table.max_seats || 9;

  // Build a map: seatNumber -> reservation (only active ones)
  const bySeat = useMemo(() => {
    const m = new Map();
    for (const r of (table.reservations || [])) {
      if (r.status === 'reserved' || r.status === 'seated') {
        m.set(r.seat_number, r);
      }
    }
    return m;
  }, [table.reservations]);

  // Own reservations on this table (at most 2: self + guest)
  const ownReservations = useMemo(() =>
    (table.reservations || []).filter(r =>
      (r.status === 'reserved' || r.status === 'seated') &&
      (r.is_self || r.user_id === currentUserId || r.claimed_by_user_id === currentUserId)
    ),
    [table.reservations, currentUserId]
  );
  const ownSelfRes  = ownReservations.find(r => !r.is_guest);
  const ownGuestRes = ownReservations.find(r => r.is_guest);

  const isClosed = table.status !== 'open_for_rsvp';

  function handleSeatClick(seatNumber) {
    if (isClosed) return;
    const taken = bySeat.get(seatNumber);

    // Change-mode: clicking a new seat commits the move
    if (changeMode) {
      if (!taken) {
        onChange(changeMode, seatNumber);
        setChangeMode(null);
      }
      return;
    }

    // Occupied: if it's your own seat, offer release; otherwise no-op
    if (taken) {
      if (taken.is_self || taken.user_id === currentUserId ||
          taken.claimed_by_user_id === currentUserId) {
        // Own seat click — no modal, the action row below the grid handles it
        return;
      }
      return;
    }

    // Empty seat — if you already have self-reservation and no guest yet, offer guest option
    if (ownSelfRes && !ownGuestRes) {
      setPendingSeat({ seatNumber, offerGuest: true });
      return;
    }
    if (ownSelfRes && ownGuestRes) {
      // You already have both — unless host, can't claim more
      if (isHost) {
        onHostSeatMember?.(table.id, seatNumber);
      }
      return;
    }
    // Default: claim for self
    setPendingSeat({ seatNumber, offerGuest: false });
  }

  function renderClaimConfirm() {
    if (!pendingSeat) return null;
    return (
      <div className="absolute inset-0 z-10 bg-[#0B1324]/95 flex items-center justify-center rounded-lg backdrop-blur-sm">
        <div className="bg-[#132240] border border-[#22D3EE]/40 rounded-lg p-5 max-w-sm w-full m-4 shadow-2xl">
          <div className="text-white font-semibold mb-3">
            {pendingSeat.offerGuest
              ? `Seat ${pendingSeat.seatNumber} — bring a +1?`
              : `Claim seat ${pendingSeat.seatNumber}?`}
          </div>
          <p className="text-sm text-[#94A3B8] mb-4">
            {pendingSeat.offerGuest
              ? 'You already have a seat. Claim this one for your +1?'
              : `${table.game_type?.toUpperCase() || 'NLH'} · ${table.stakes || 'Stakes TBD'}`}
          </p>
          <div className="flex gap-2">
            <button
              className="flex-1 h-11 rounded-lg bg-[#22D3EE] text-[#0B1324] font-semibold hover:bg-[#67E8F9] transition"
              disabled={busy === `seat:${pendingSeat.seatNumber}`}
              onClick={() => {
                onClaim(table.id, pendingSeat.seatNumber, pendingSeat.offerGuest);
                setPendingSeat(null);
              }}
            >
              {busy === `seat:${pendingSeat.seatNumber}`
                ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                : (pendingSeat.offerGuest ? 'Claim for Guest' : 'Lock it up')}
            </button>
            <button
              className="flex-1 h-11 rounded-lg bg-[#1E2A47] text-white hover:bg-[#2A3852]"
              onClick={() => setPendingSeat(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-[#1E2A47] bg-[#0F1B35] p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold">
              {table.name || (table.is_default ? 'Main Table' : `Table ${table.table_number}`)}
            </span>
            {isClosed && (
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider
                               text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
                <Lock className="w-3 h-3" />
                {table.status === 'running' ? 'Running' :
                 table.status === 'ended'   ? 'Ended'   :
                 table.status === 'cancelled' ? 'Cancelled' : table.status}
              </span>
            )}
          </div>
          <div className="text-sm text-[#94A3B8] mt-1">
            {table.game_type?.toUpperCase() || 'NLH'}
            {table.stakes ? ` · ${table.stakes}` : ''}
            {table.buyin_min || table.buyin_max
              ? ` · $${table.buyin_min || '?'}–$${table.buyin_max || '?'}`
              : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-[#94A3B8]">
            <User className="inline w-4 h-4 mr-1 -mt-0.5" />
            {bySeat.size}/{maxSeats}
          </div>
        </div>
      </div>

      {/* Oval table */}
      <div className="relative w-full h-72 bg-[#0B5837]/30 rounded-[140px] border-4 border-[#10B981]/70 mx-auto"
           style={{ maxWidth: 400 }}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-[#10B981]/70 font-semibold uppercase tracking-widest text-xs">
            {table.stakes || (table.name || 'Table ' + table.table_number)}
          </span>
        </div>

        {Array.from({ length: maxSeats }, (_, i) => {
          const seatNumber = i + 1;
          const res = bySeat.get(seatNumber);
          const isOwn = res && (
            res.is_self ||
            res.user_id === currentUserId ||
            res.claimed_by_user_id === currentUserId
          );
          const pos = getSeatPosition(i, maxSeats);

          const cls = [
            'absolute w-14 h-14 rounded-full flex flex-col items-center justify-center',
            'transition-all text-xs',
            isOwn
              ? 'bg-[#22D3EE] text-[#0B1324] ring-4 ring-[#22D3EE]/30 font-bold'
              : res
                ? 'bg-[#4B5563] text-white cursor-not-allowed'
                : 'bg-[#132240] border-2 border-[#4A5E78] hover:border-[#22D3EE] ' +
                  'hover:bg-[#1A2A52] text-white cursor-pointer',
            changeMode && !res ? 'ring-2 ring-[#F59E0B] animate-pulse' : '',
            isClosed && !isOwn ? 'opacity-60' : ''
          ].join(' ');

          return (
            <button
              key={seatNumber}
              onClick={() => handleSeatClick(seatNumber)}
              disabled={isClosed && !isOwn}
              className={cls}
              style={pos}
              title={res
                ? (res.display_name + (isOwn ? ' (you)' : ''))
                : `Seat ${seatNumber} — empty`}
            >
              {res ? (
                <>
                  <User className="w-4 h-4 mb-0.5" />
                  <span className="text-[10px] font-medium truncate max-w-[44px]">
                    {res.is_guest ? 'Guest' : (res.display_name || '').split(' ')[0]}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-bold">{seatNumber}</span>
                  <span className="text-[9px] text-[#94A3B8]">open</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Own-seat action row */}
      {(ownSelfRes || ownGuestRes) && !isClosed && (
        <div className="mt-4 flex flex-wrap gap-2">
          {ownSelfRes && (
            <div className="flex items-center gap-2 bg-[#132240] border border-[#22D3EE]/30
                            rounded-lg px-3 py-2 text-sm">
              <span className="text-white">
                You · Seat {ownSelfRes.seat_number}
              </span>
              <button
                onClick={() => setChangeMode(ownSelfRes.id)}
                disabled={!!busy}
                className="text-[#94A3B8] hover:text-[#22D3EE] flex items-center gap-1"
                title="Change seat"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onRelease(ownSelfRes.id)}
                disabled={busy === ownSelfRes.id}
                className="text-[#94A3B8] hover:text-[#EF4444] flex items-center gap-1"
                title="Release seat"
              >
                {busy === ownSelfRes.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <X className="w-4 h-4" />}
              </button>
            </div>
          )}
          {ownGuestRes && (
            <div className="flex items-center gap-2 bg-[#132240] border border-[#A855F7]/30
                            rounded-lg px-3 py-2 text-sm">
              <span className="text-white">
                Your +1 · Seat {ownGuestRes.seat_number}
              </span>
              <button
                onClick={() => onRelease(ownGuestRes.id)}
                disabled={busy === ownGuestRes.id}
                className="text-[#94A3B8] hover:text-[#EF4444]"
                title="Release guest seat"
              >
                {busy === ownGuestRes.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <X className="w-4 h-4" />}
              </button>
            </div>
          )}
          {changeMode && (
            <div className="flex items-center gap-2 bg-[#F59E0B]/10 border border-[#F59E0B]/40
                            rounded-lg px-3 py-2 text-xs text-[#F59E0B]">
              Tap an empty seat to move there
              <button
                onClick={() => setChangeMode(null)}
                className="text-[#F59E0B] hover:text-[#FBBF24]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Host "seat a member" affordance.
          audit F-29: this was gated on !ownSelfRes, so it vanished as soon as
          the host took their own seat — the common case — leaving no way to
          seat anyone else. */}
      {isHost && !isClosed && (
        <div className="mt-4 pt-4 border-t border-[#1E2A47]">
          <button
            onClick={() => onHostSeatMember?.(table.id, null)}
            className="text-sm text-[#22D3EE] hover:text-[#67E8F9] flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Seat a member at this table
          </button>
        </div>
      )}

      {/* Host "start table" control.
          audit F-08: POST /api/home-games/tables/[id]/start existed with ZERO
          callers, so open_for_rsvp -> running could never happen from the
          product and commander_home_seats was never materialised. The parent
          runs an unseated-confirmed pre-flight before calling this, because
          starting is irreversible and seats only players who hold a
          reservation. */}
      {isHost && onStartTable && table.status === 'open_for_rsvp' && (
        <div className="mt-3">
          <button
            onClick={() => onStartTable(table.id)}
            disabled={busy === `start:${table.id}`}
            className="w-full h-11 rounded-lg bg-[#22D3EE] text-[#06202B] font-semibold
                       hover:bg-[#67E8F9] disabled:opacity-50 transition
                       flex items-center justify-center gap-2"
          >
            {busy === `start:${table.id}` ? 'Starting…' : 'Start table'}
          </button>
          <p className="mt-1 text-[11px] text-[#94A3B8] text-center">
            Seats everyone currently reserved. This cannot be undone.
          </p>
        </div>
      )}

      {renderClaimConfirm()}
    </div>
  );
}
