import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

/**
 * PvP identity, queue state, records, and standings must come from the lobby.
 * This review tab used to display a fabricated ELO profile and opponent list.
 */
export default function PokerArenaMode() {
  return (
    <VerifiedToolGateway
      eyebrow="Live Competitive Training"
      title="Enter The PvP Lobby"
      description="Open the authenticated lobby to view real queue availability, supported match formats, and recorded practice results. No synthetic opponents, ratings, or leaderboard records are shown here."
      href="/hub/training/pvp-lobby"
      action="Open PvP Lobby"
      source="Authenticated PvP Services"
    />
  );
}
