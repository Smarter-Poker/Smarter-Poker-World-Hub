/**
 * VenueCard Component - Shows venue with live game info
 * Reference: SCOPE_LOCK.md - Phase 1 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { MapPin, Users, Clock, ChevronRight, Star } from 'lucide-react';
import Link from 'next/link';

export default function VenueCard({ venue, games = [], waitlistCounts = {} }) {
  const runningGames = games.filter(g => g.status === 'running');
  const totalWaiting = Object.values(waitlistCounts).reduce((a, b) => a + b, 0);

  return (
    <Link
      href={`/hub/club-commander/venue/${venue.id}`}
      className="block bg-white rounded-lg border border-[#E5E7EB] p-4 hover:border-[#1877F2] hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#1F2937]">{venue.name}</h3>
            {venue.captain_enabled && (
              <span className="px-2 py-0.5 bg-[#1877F2]/10 text-[#1877F2] text-xs font-medium rounded">
                LIVE
              </span>
            )}
          </div>
          <p className="text-sm text-[#6B7280] flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />
            {venue.city}, {venue.state}
          </p>
          {venue.trust_score && (
            <p className="text-sm text-[#6B7280] flex items-center gap-1 mt-1">
              <Star className="w-3 h-3 text-[#F59E0B]" />
              {venue.trust_score.toFixed(1)}
            </p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-[#6B7280]" />
      </div>

      {runningGames.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-[#10B981]">
              <Users className="w-4 h-4" />
              <span className="font-medium">{runningGames.length} games running</span>
            </div>
            {totalWaiting > 0 && (
              <div className="flex items-center gap-1 text-[#F59E0B]">
                <Clock className="w-4 h-4" />
                <span className="font-medium">{totalWaiting} waiting</span>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {runningGames.slice(0, 4).map((game) => (
              <span
                key={game.id}
                className="px-2 py-1 bg-[#F9FAFB] rounded text-xs text-[#1F2937]"
              >
                {game.game_type?.toUpperCase()} {game.stakes}
              </span>
            ))}
            {runningGames.length > 4 && (
              <span className="px-2 py-1 text-xs text-[#6B7280]">
                +{runningGames.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}

      {venue.distance_mi && (
        <div className="mt-2 text-xs text-[#6B7280]">
          {venue.distance_mi} miles away
        </div>
      )}
    </Link>
  );
}
