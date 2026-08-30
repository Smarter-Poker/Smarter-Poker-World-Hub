import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

/**
 * Runout frequency and EV changes require solver data. The former preview
 * assigned them with hand-written rules and random values.
 */
export default function RunoutSimulator() {
  return (
    <VerifiedToolGateway
      eyebrow="Verified Runout Analysis"
      title="Analyze Board Runouts"
      description="Use the equity workspace for exact cards and Monte Carlo runouts. Strategy-frequency and EV-shift claims are shown only when a solver-backed result exists."
      href="/hub/training/equity-calculator"
      action="Open Runout Analysis"
      source="Training Equity API"
    />
  );
}
