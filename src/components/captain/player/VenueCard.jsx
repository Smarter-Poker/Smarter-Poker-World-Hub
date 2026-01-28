/**
 * VenueCard Component - Shows venue with live game info
 * Reference: SCOPE_LOCK.md - Phase 1 Components
 * UI: Facebook color scheme with DRAMATIC futuristic sci-fi styling
 */
import { MapPin, Users, Clock, ChevronRight, Star, Zap, Radio } from 'lucide-react';
import Link from 'next/link';

export default function VenueCard({ venue, games = [], waitlistCounts = {} }) {
  const runningGames = games.filter(g => g.status === 'running');
  const totalWaiting = Object.values(waitlistCounts).reduce((a, b) => a + b, 0);

  return (
    <Link
      href={`/hub/captain/venue/${venue.id}`}
      className="block captain-card captain-card-corners p-6 hover:captain-card-glow transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <div className="captain-icon-box w-14 h-14 group-hover:captain-icon-box-glow transition-all">
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-[#1F2937] text-xl tracking-wide group-hover:captain-gradient-text transition-colors">
                {venue.name}
              </h3>
              <p className="text-sm text-[#6B7280] flex items-center gap-2 mt-1 font-medium">
                <MapPin className="w-4 h-4" />
                {venue.city}, {venue.state}
              </p>
            </div>
          </div>
          {venue.trust_score && (
            <div className="mt-3 ml-[72px]">
              <span className="captain-badge captain-badge-warning">
                <Star className="w-4 h-4" />
                {venue.trust_score.toFixed(1)} RATING
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          {venue.captain_enabled && (
            <span className="captain-badge captain-badge-live">
              <Radio className="w-4 h-4" />
              LIVE
            </span>
          )}
          <div className="captain-icon-box w-12 h-12 group-hover:captain-icon-box-glow transition-all">
            <ChevronRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {runningGames.length > 0 && (
        <>
          <div className="captain-divider my-5" style={{ margin: '20px 0' }} />
          <div className="flex items-center gap-4 flex-wrap">
            <span className="captain-badge captain-badge-success">
              <Users className="w-4 h-4" />
              {runningGames.length} GAME{runningGames.length !== 1 ? 'S' : ''} RUNNING
            </span>
            {totalWaiting > 0 && (
              <span className="captain-badge captain-badge-warning">
                <Clock className="w-4 h-4" />
                {totalWaiting} WAITING
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {runningGames.slice(0, 4).map((game) => (
              <span
                key={game.id}
                className="captain-badge captain-badge-primary"
              >
                {game.game_type?.toUpperCase()} {game.stakes}
              </span>
            ))}
            {runningGames.length > 4 && (
              <span className="captain-badge captain-badge-primary" style={{ opacity: 0.7 }}>
                +{runningGames.length - 4} MORE
              </span>
            )}
          </div>
        </>
      )}

      {venue.distance_mi && (
        <div className="mt-4 text-xs text-[#6B7280] font-bold uppercase tracking-[0.2em]">
          {venue.distance_mi} miles away
        </div>
      )}
    </Link>
  );
}
