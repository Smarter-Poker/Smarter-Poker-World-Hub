import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

export default function PostflopSolutionsBrowser() {
  return (
    <VerifiedToolGateway
      eyebrow="Verified Solver Data"
      title="Postflop Solutions Browser"
      description="Browse real solved boards, positions, action frequencies, hand EVs, and runouts in the full solution browser. This link replaces the former heuristic grid."
      href="/hub/training/solutions"
      action="Open Postflop Solutions"
      source="Solved Spots Gold"
    />
  );
}
