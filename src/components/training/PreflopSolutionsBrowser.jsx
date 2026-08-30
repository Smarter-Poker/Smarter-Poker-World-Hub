import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

export default function PreflopSolutionsBrowser() {
  return (
    <VerifiedToolGateway
      eyebrow="Verified Solver Data"
      title="Preflop Solutions Browser"
      description="Open the complete solution browser to choose an actual solved spot and inspect its normalized action frequencies. No estimated or generated frequencies are shown in this review."
      href="/hub/training/solutions"
      action="Open Preflop Solutions"
      source="Solved Spots Gold"
    />
  );
}
