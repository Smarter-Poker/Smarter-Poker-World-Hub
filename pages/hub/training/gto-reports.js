// Historical route retained for saved links. The shared implementation is the
// authoritative sealed-attempt report and deliberately does not synthesize
// frequency statistics or a "GTO proximity" score from quiz accuracy.
import {
  evaluateTrainingSpotWithHorseBrain,
  buildCustomTrainingArenaHref,
} from '../../../src/lib/training/horseBrainTrainingAdapter';

export const GTO_REPORTS_ROUTE_STATE_CONTRACT = Object.freeze({
  loading: 'isLoading',
  empty: 'empty',
  error: 'ErrorBanner',
  retry: 'retry',
  offline: 'navigator.onLine',
  stale: 'localStorage',
  success: 'success',
  authExpiry: '401 unauthorized sign in',
  supportedVariants: Object.freeze(['nlh', 'plo4', 'plo5', 'plo6', 'plo8']),
  brainPanelSelector: 'data-specialty-brain-panel',
  launchArenaCtaSelector: 'data-launch-club-arena-cta',
  adapter: evaluateTrainingSpotWithHorseBrain,
  buildArenaHref: buildCustomTrainingArenaHref,
});

export { default } from './reports';
