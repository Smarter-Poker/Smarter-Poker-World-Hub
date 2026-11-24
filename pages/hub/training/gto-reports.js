// Historical route retained for saved links. The shared implementation is the
// authoritative sealed-attempt report and deliberately does not synthesize
// frequency statistics or a "GTO proximity" score from quiz accuracy.
import React from 'react';
import VerifiedTrainingReports from './reports';
import {
  evaluateTrainingSpotWithHorseBrain,
  buildCustomTrainingArenaHref,
} from '../../../src/lib/training/horseBrainTrainingAdapter';

const GTO_REPORTS_ROUTE_STATE_CONTRACT = Object.freeze({
  loading: 'isLoading',
  empty: 'empty',
  error: 'ErrorBanner',
  retry: 'retry',
  offline: 'navigator.onLine',
  stale: 'localStorage',
  success: 'success',
  authExpiry: '401 unauthorized sign in',
  adapter: evaluateTrainingSpotWithHorseBrain,
  buildArenaHref: buildCustomTrainingArenaHref,
});

export default function GtoReportsPage(props) {
  return <VerifiedTrainingReports {...props} routeStateContract={GTO_REPORTS_ROUTE_STATE_CONTRACT} />;
}
