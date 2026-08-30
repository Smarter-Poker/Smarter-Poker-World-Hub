import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

export default function RangeVsRangeExplorer() {
  return (
    <VerifiedToolGateway
      eyebrow="Calculated Equity"
      title="Range And Hand Equity"
      description="Use the complete equity calculator for card-valid Monte Carlo results. The former review widget applied a random adjustment to a range-size heuristic and has been removed."
      href="/hub/training/equity-calculator"
      action="Open Equity Calculator"
      source="Training Equity Engine"
    />
  );
}
