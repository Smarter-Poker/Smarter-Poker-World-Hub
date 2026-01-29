/**
 * WaitlistCard Component - Shows player's waitlist status
 * Reference: SCOPE_LOCK.md - Phase 1 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { Clock, MapPin, X } from 'lucide-react';

export default function WaitlistCard({ entry, onLeave }) {
  const {
    waitlist_entry,
    venue,
    position,
    estimated_wait
  } = entry;

  const isCalled = waitlist_entry?.status === 'called';

  return (
    <div className={`bg-white rounded-lg border ${
      isCalled ? 'border-[#F59E0B] shadow-lg' : 'border-[#E5E7EB]'
    } p-4`}>
      {isCalled && (
        <div className="mb-3 px-3 py-2 bg-[#FEF3C7] rounded-lg text-center">
          <p className="font-semibold text-[#92400E]">Your seat is ready!</p>
          <p className="text-sm text-[#92400E]">Please check in at the desk</p>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-[#1F2937]">
            {waitlist_entry?.game_type?.toUpperCase()} {waitlist_entry?.stakes}
          </h3>
          {venue && (
            <p className="text-sm text-[#6B7280] flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" />
              {venue.name}
            </p>
          )}
        </div>
        {onLeave && !isCalled && (
          <button
            onClick={onLeave}
            className="p-2 rounded-lg text-[#6B7280] hover:text-[#EF4444] hover:bg-[#FEF2F2] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            title="Leave waitlist"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-[#1877F2]">{position}</div>
          <div className="text-xs text-[#6B7280]">Position</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-[#1F2937] flex items-center justify-center gap-1">
            <Clock className="w-6 h-6" />
            {estimated_wait || '--'}
          </div>
          <div className="text-xs text-[#6B7280]">Est. minutes</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#E5E7EB] text-xs text-[#6B7280]">
        Joined {waitlist_entry?.created_at
          ? new Date(waitlist_entry.created_at).toLocaleTimeString()
          : '--'}
        {waitlist_entry?.call_count > 0 && (
          <span className="ml-2 text-[#F59E0B]">
            Called {waitlist_entry.call_count}x
          </span>
        )}
      </div>
    </div>
  );
}
