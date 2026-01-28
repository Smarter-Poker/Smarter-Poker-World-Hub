/**
 * WaitlistCard Component - Shows player's waitlist status
 * Reference: SCOPE_LOCK.md - Phase 1 Components
 * UI: Facebook color scheme with DRAMATIC futuristic sci-fi styling
 */
import { Clock, MapPin, X, Zap, AlertTriangle } from 'lucide-react';

export default function WaitlistCard({ entry, onLeave }) {
  const {
    waitlist_entry,
    venue,
    position,
    estimated_wait
  } = entry;

  const isCalled = waitlist_entry?.status === 'called';

  return (
    <div className={`captain-card captain-card-corners p-6 ${isCalled ? 'captain-card-glow' : ''}`}>
      {/* Seat Ready Alert */}
      {isCalled && (
        <div className="mb-5 p-5 rounded-xl border-3 border-[#10B981] relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
            boxShadow: '0 0 30px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255,255,255,0.5)'
          }}>
          <div className="flex items-center justify-center gap-3">
            <AlertTriangle className="w-6 h-6 text-[#10B981]" />
            <div className="text-center">
              <p className="font-extrabold text-[#059669] text-lg uppercase tracking-wider captain-text-glow">Your seat is ready!</p>
              <p className="text-sm text-[#059669] font-medium mt-1">Please check in at the desk</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="captain-icon-box w-14 h-14 captain-icon-box-glow">
            <Zap className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-extrabold text-xl tracking-wide">
              <span className="captain-gradient-text">{waitlist_entry?.game_type?.toUpperCase()}</span>
              <span className="text-[#1F2937] ml-2">{waitlist_entry?.stakes}</span>
            </h3>
            {venue && (
              <p className="text-sm text-[#6B7280] flex items-center gap-2 mt-1 font-medium">
                <MapPin className="w-4 h-4" />
                {venue.name}
              </p>
            )}
          </div>
        </div>
        {onLeave && !isCalled && (
          <button
            onClick={onLeave}
            className="captain-btn captain-btn-danger py-3 px-4"
            title="Leave waitlist"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Stats Display */}
      <div className="mt-6 flex items-center justify-center gap-10">
        <div className="captain-stat">
          <div className="captain-stat-value">#{position}</div>
          <div className="captain-stat-label">Position</div>
        </div>

        <div className="h-16 w-px" style={{
          background: 'linear-gradient(180deg, transparent 0%, #22D3EE 50%, transparent 100%)',
          boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)'
        }} />

        <div className="captain-stat">
          <div className="captain-stat-value flex items-center gap-3">
            <Clock className="w-10 h-10 text-[#6B7280]" />
            {estimated_wait || '--'}
          </div>
          <div className="captain-stat-label">Est. Minutes</div>
        </div>
      </div>

      {/* Footer */}
      <div className="captain-divider" style={{ margin: '24px 0 16px 0' }} />

      <div className="flex items-center justify-between">
        <span className="text-xs text-[#6B7280] font-bold uppercase tracking-wider">
          Joined {waitlist_entry?.created_at
            ? new Date(waitlist_entry.created_at).toLocaleTimeString()
            : '--'}
        </span>
        {waitlist_entry?.call_count > 0 && (
          <span className="captain-badge captain-badge-warning captain-badge-glow">
            <AlertTriangle className="w-4 h-4" />
            CALLED {waitlist_entry.call_count}x
          </span>
        )}
      </div>
    </div>
  );
}
