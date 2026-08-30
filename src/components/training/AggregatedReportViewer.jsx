import React from 'react';
import VerifiedToolGateway from './VerifiedToolGateway';

export default function AggregatedReportViewer() {
  return (
    <VerifiedToolGateway
      eyebrow="Database Aggregate"
      title="Aggregate Strategy Reports"
      description="Open the full report to calculate betting and checking frequencies across actual solved flop textures and positions. Empty datasets remain empty instead of being filled with sample statistics."
      href="/hub/training/aggregate"
      action="Open Aggregate Reports"
      source="Aggregate Report API"
    />
  );
}
