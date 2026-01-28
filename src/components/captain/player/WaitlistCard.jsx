/**
 * WaitlistCard Component - Shows player's waitlist status
 * Reference: SCOPE_LOCK.md - Phase 1 Components
 * UI: Facebook color scheme with futuristic metallic styling
 */
import { Clock, MapPin, X, Zap } from 'lucide-react';

export default function WaitlistCard({ entry, onLeave }) {
  const {
    waitlist_entry,
    venue,
    position,
    estimated_wait
  } = entry;

  const isCalled = waitlist_entry?.status === 'called';

  return (
    <div className={`captain-card p-5 ${isCalled ? 'captain-card-glow' : ''}`}>
      {isCalled && (
        <div className="mb-4 p-4 rounded-xl border-2 border-[#10B981] bg-gradient-to-r from-[#D1FAE5] to-[#ECFDF5]"
          style={{ boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}>
          <p className="font-bold text-[#059669] text-center uppercase tracking-wide">Your seat is ready!</p>
          <p className="text-sm text-[#059669] text-center mt-1">Please check in at the desk</p>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="captain-icon-box w-10 h-10">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-[#1F2937] text-lg tracking-wide">
              <span className="text-[#1877F2]">{waitlist_entry?.game_type?.toUpperCase()}</span> {waitlist_entry?.stakes}
            </h3>
            {venue && (
              <p className="text-sm text-[#6B7280] flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                {venue.name}
              </p>
            )}
          </div>
        </div>
        {onLeave && !isCalled && (
          <button
            onClick={onLeave}
            className="captain-btn captain-btn-danger py-2 px-3 text-xs"
            title="Leave waitlist"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center gap-6">
        <div className="text-center">
          <div className="text-4xl font-bold text-[#1877F2]"
            style={{ textShadow: '0 0 20px rgba(24, 119, 242, 0.3)' }}>
            #{position}
          </div>
          <div className="text-xs text-[#6B7280] font-semibold uppercase tracking-wide mt-1">Position</div>
        </div>
        <div className="captain-divider w-px h-12 mx-4"
          style={{ background: 'linear-gradient(180deg, transparent 0%, #8B9DC3 50%, transparent 100%)' }} />
        <div className="text-center">
          <div className="text-4xl font-bold text-[#1F2937] flex items-center justify-center gap-2">
            <Clock className="w-7 h-7 text-[#6B7280]" />
            {estimated_wait || '--'}
          </div>
          <div className="text-xs text-[#6B7280] font-semibold uppercase tracking-wide mt-1">Est. minutes</div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t-2 border-[#8B9DC3]/30 flex items-center justify-between">
        <span className="text-xs text-[#6B7280] font-medium">
          Joined {waitlist_entry?.created_at
            ? new Date(waitlist_entry.created_at).toLocaleTimeString()
            : '--'}
        </span>
        {waitlist_entry?.call_count > 0 && (
          <span className="captain-badge captain-badge-warning">
            Called {waitlist_entry.call_count}x
          </span>
        )}
      </div>
    </div>
  );
}
