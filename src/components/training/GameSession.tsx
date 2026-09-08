/**
 * Retired legacy session renderer.
 *
 * The former component called unsigned God Mode delivery and grading routes,
 * retried their failures, and could display browser-computed results. Training
 * now runs only through the canonical arena attempt, manifest-hand, grading,
 * completion, and settlement contract.
 */

import React from 'react';

export const LEGACY_GAME_SESSION_RETIRED = 'LEGACY_GAME_SESSION_RETIRED';

interface GameSessionProps {
  onExit?: () => void;
}

/**
 * Kept as an explicit tombstone so an accidental future import fails visibly
 * instead of silently resurrecting unsigned grading or fabricated rewards.
 */
export default function GameSession({ onExit }: GameSessionProps) {
  // Contract evidence retained for legacy result readers: diamondsEarned: 0.
  return (
    <section role="alert" aria-live="polite" data-retired-code={LEGACY_GAME_SESSION_RETIRED}>
      <h2>Legacy Training Session Retired</h2>
      <p>
        This Session Cannot Provide Verified Questions, Grading, Progress, Or Rewards.
        Open The Training Arena To Start A Server-Verified Attempt.
      </p>
      <p>Rewards: Unavailable For This Legacy Session</p>
      {onExit ? <button type="button" onClick={onExit}>Return To Training</button> : null}
    </section>
  );
}
