/**
 * VenueCard Component - Shows venue with live game info
 * Reference: SCOPE_LOCK.md - Phase 1 Components
 * UI: Facebook color scheme with futuristic metallic styling
 */
import { MapPin, Users, Clock, ChevronRight, Star, Zap } from 'lucide-react';
import Link from 'next/link';

export default function VenueCard({ venue, games = [], waitlistCounts = {} }) {
  const runningGames = games.filter(g => g.status === 'running');
  const totalWaiting = Object.values(waitlistCounts).reduce((a, b) => a + b, 0);

  return (
    <Link
      href={`/hub/captain/venue/${venue.id}`}
      className="block captain-card p-5 hover:captain-card-glow transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="captain-icon-box w-10 h-10">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[#1F2937] text-lg tracking-wide group-hover:text-[#1877F2] transition-colors">
                {venue.name}
              </h3>
              <p className="text-sm text-[#6B7280] flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {venue.city}, {venue.state}
              </p>
            </div>
          </div>
          {venue.trust_score && (
            <div className="mt-2 ml-13">
              <span className="captain-badge captain-badge-warning">
                <Star className="w-3 h-3" />
                {venue.trust_score.toFixed(1)}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {venue.captain_enabled && (
            <span className="captain-badge captain-badge-success captain-badge-glow">
              LIVE
            </span>
          )}
          <div className="captain-icon-box w-10 h-10 group-hover:captain-icon-box-glow transition-all">
            <ChevronRight className="w-5 h-5" />
          </div>
        </div>
      </div>

      {runningGames.length > 0 && (
        <div className="mt-4 pt-4 border-t-2 border-[#8B9DC3]/30">
          <div className="flex items-center gap-4">
            <span className="captain-badge captain-badge-success">
              <Users className="w-3 h-3" />
              {runningGames.length} game{runningGames.length !== 1 ? 's' : ''} running
            </span>
            {totalWaiting > 0 && (
              <span className="captain-badge captain-badge-warning">
                <Clock className="w-3 h-3" />
                {totalWaiting} waiting
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {runningGames.slice(0, 4).map((game) => (
              <span
                key={game.id}
                className="captain-badge captain-badge-primary"
              >
                {game.game_type?.toUpperCase()} {game.stakes}
              </span>
            ))}
            {runningGames.length > 4 && (
              <span className="text-xs text-[#6B7280] font-medium py-1">
                +{runningGames.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}

      {venue.distance_mi && (
        <div className="mt-3 text-xs text-[#6B7280] font-medium uppercase tracking-wide">
          {venue.distance_mi} miles away
        </div>
      )}
    </Link>
  );
}
