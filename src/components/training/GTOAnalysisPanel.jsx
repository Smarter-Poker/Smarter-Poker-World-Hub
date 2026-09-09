/**
 * Retired legacy solver-analysis renderer.
 *
 * Verified analysis is delivered only inside a sealed Training Arena attempt.
 * This tombstone prevents an accidental import from reviving the retired
 * browser-to-solver route or presenting an unproven analysis as exact.
 */

import React from 'react';

export const LEGACY_GTO_ANALYSIS_PANEL_RETIRED = 'LEGACY_GTO_ANALYSIS_PANEL_RETIRED';

export default function GTOAnalysisPanel({ onClose }) {
  return (
    <section
      role="alert"
      aria-live="polite"
      data-retired-code={LEGACY_GTO_ANALYSIS_PANEL_RETIRED}
    >
      <h2>Legacy Analysis Panel Retired</h2>
      <p>
        No Solver Result Is Available From This Legacy Surface. Use A Verified Training
        Arena Question With Complete Provenance Instead.
      </p>
      {onClose ? <button type="button" onClick={onClose}>Close</button> : null}
    </section>
  );
}
