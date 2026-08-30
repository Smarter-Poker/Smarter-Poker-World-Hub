import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

export default function SpotFilterTrainer() {
  return (
    <VerifiedToolGateway
      eyebrow="Filtered Solver Training"
      title="Custom Spot Trainer"
      description="Build a filtered session from real solved scenarios by game type, position, stack, street, and board texture. Correct answers come from the question engine rather than a randomly selected option."
      href="/hub/training/custom-solve"
      action="Build A Custom Session"
      source="Custom Train API"
    />
  );
}
