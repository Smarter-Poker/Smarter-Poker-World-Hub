/**
 * WaitlistManager Component - Manages waitlist for staff
 * Reference: IMPLEMENTATION_PHASES.md - Step 1.5
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState } from 'react';
import { Phone, Bell, UserCheck, UserX, Clock, Plus } from 'lucide-react';

export default function WaitlistManager({
  waitlists = [],
  onCallPlayer,
  onSeatPlayer,
  onRemovePlayer,
  onAddWalkIn
}) {
  const [selectedWaitlist, setSelectedWaitlist] = useState(null);

  // Group waitlists if not already grouped
  const groupedWaitlists = Array.isArray(waitlists) && waitlists[0]?.game_type
    ? waitlists
    : [];

  if (groupedWaitlists.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
        <Clock className="w-12 h-12 mx-auto mb-2 text-[#6B7280] opacity-50" />
        <p className="text-[#6B7280]">No players on waitlist</p>
        {onAddWalkIn && (
          <button
            onClick={onAddWalkIn}
            className="mt-4 px-4 py-2 bg-[#1877F2] text-white rounded-lg font-medium hover:bg-[#1664d9] transition-colors min-h-[44px] inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Walk-In
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Waitlist Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {groupedWaitlists.map((wl, index) => (
          <button
            key={`${wl.game_type}-${wl.stakes}`}
            onClick={() => setSelectedWaitlist(index)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap min-h-[44px] transition-colors ${
              selectedWaitlist === index || (selectedWaitlist === null && index === 0)
                ? 'bg-[#1877F2] text-white'
                : 'bg-white border border-[#E5E7EB] text-[#1F2937] hover:border-[#1877F2]'
            }`}
          >
            {wl.game_type?.toUpperCase()} {wl.stakes}
            <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-sm">
              {wl.count}
            </span>
          </button>
        ))}
        {onAddWalkIn && (
          <button
            onClick={onAddWalkIn}
            className="px-4 py-2 rounded-lg font-medium whitespace-nowrap min-h-[44px] border border-dashed border-[#6B7280] text-[#6B7280] hover:border-[#1877F2] hover:text-[#1877F2] transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Walk-In
          </button>
        )}
      </div>

      {/* Waitlist Players */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
        {(groupedWaitlists[selectedWaitlist ?? 0]?.players || []).map((player, index) => (
          <WaitlistRow
            key={player.id}
            player={player}
            position={player.position || index + 1}
            onCall={() => onCallPlayer?.(player)}
            onSeat={() => onSeatPlayer?.(player)}
            onRemove={() => onRemovePlayer?.(player)}
          />
        ))}
      </div>
    </div>
  );
}

function WaitlistRow({ player, position, onCall, onSeat, onRemove }) {
  const isCalled = player.status === 'called';
  const waitTime = player.created_at
    ? Math.round((Date.now() - new Date(player.created_at).getTime()) / 60000)
    : 0;

  return (
    <div className={`flex items-center justify-between p-4 border-b border-[#E5E7EB] last:border-b-0 ${
      isCalled ? 'bg-[#FEF3C7]' : ''
    }`}>
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center font-semibold text-sm">
          {position}
        </div>
        <div>
          <p className="font-medium text-[#1F2937]">
            {player.player_name || 'Player'}
            {isCalled && (
              <span className="ml-2 text-xs bg-[#F59E0B] text-white px-2 py-0.5 rounded">
                CALLED
              </span>
            )}
          </p>
          <div className="flex items-center gap-3 text-sm text-[#6B7280]">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {waitTime}m
            </span>
            <span className="capitalize">{player.signup_method}</span>
            {player.call_count > 0 && (
              <span>Called {player.call_count}x</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isCalled ? (
          <button
            onClick={onCall}
            className="p-3 rounded-lg bg-[#1877F2] text-white hover:bg-[#1664d9] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            title="Call Player"
          >
            <Bell className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={onSeat}
            className="p-3 rounded-lg bg-[#10B981] text-white hover:bg-[#059669] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            title="Seat Player"
          >
            <UserCheck className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-3 rounded-lg bg-white border border-[#E5E7EB] text-[#6B7280] hover:border-[#EF4444] hover:text-[#EF4444] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
          title="Remove Player"
        >
          <UserX className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
