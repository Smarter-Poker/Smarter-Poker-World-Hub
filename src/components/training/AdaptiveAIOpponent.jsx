import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

/**
 * Horse identities, decisions, cards, and outcomes belong to the Club Arena
 * engine. This review tab used to keep a fictional seven-player roster and
 * choose win/loss EV with Math.random().
 */
export default function AdaptiveAIOpponent() {
  return (
    <VerifiedToolGateway
      eyebrow="Club Arena Gameplay"
      title="Play Against Arena Opponents"
      description="Open Club Arena for server-backed tables, real horse identities, and actual poker outcomes. The training review drawer never generates opponent statistics, cards, chat, or results."
      href="/hub/club-arena/"
      action="Open Club Arena"
      source="Club Arena Table Engine"
    />
  );
}
