import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

/**
 * The old review-drawer version only waited on a timer and then presented the
 * configuration as a solved result. Keep this entry point, but send players to
 * the real corpus/API-backed tool where unsupported inputs are rejected.
 */
export default function CustomSolutionBuilder() {
  return (
    <VerifiedToolGateway
      eyebrow="Verified Solver Workspace"
      title="Build A Custom Training Spot"
      description="Configure a supported 6-Max cash-game position, effective stack, and exact board. Results come from the training corpus and solver APIs; this panel never invents a completed solve."
      href="/hub/training/custom-solve"
      action="Open Custom Solve"
      source="Training Corpus And Solver APIs"
    />
  );
}
