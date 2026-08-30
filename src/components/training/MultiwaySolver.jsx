import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

/**
 * Multiway frequencies cannot be presented as solver output unless a solver or
 * authored training record supplied them. The canonical multiway course owns
 * that content and its grading contract.
 */
export default function MultiwaySolver() {
  return (
    <VerifiedToolGateway
      eyebrow="Verified Multiway Curriculum"
      title="Train Multiway Postflop"
      description="Work through authored multiway spots with explicit actions and explanations. This review surface no longer labels hard-coded percentages or a timer as an AI solve."
      href="/hub/training/multiway-postflop"
      action="Open Multiway Training"
      source="Versioned Training Scenarios"
    />
  );
}
