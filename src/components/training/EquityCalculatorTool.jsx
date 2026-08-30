import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

/**
 * The old inline calculator had an incomplete evaluator that could label any
 * straight plus any flush as a straight flush. Use the validated API-backed
 * calculator instead.
 */
export default function EquityCalculatorTool() {
  return (
    <VerifiedToolGateway
      eyebrow="Monte Carlo Equity Service"
      title="Calculate Verified Hand Equity"
      description="Select exact cards and a board in the full calculator. Duplicate-card validation, variant rules, iteration counts, and results are handled by the training equity API."
      href="/hub/training/equity-calculator"
      action="Open Equity Calculator"
      source="Training Equity API"
    />
  );
}
