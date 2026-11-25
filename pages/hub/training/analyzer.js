import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';

/**
 * Legacy Hand Analyzer Route
 *
 * The former client-only analyzer compared every uploaded action with a
 * hard-coded "check" baseline and displayed generic street percentages as
 * solver output. That cannot support an honest grade. Keep the old URL alive,
 * but send every request to the server-audited hand-history workflow.
 */

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/hand-history-upload?source=legacy-analyzer',
      permanent: false,
    },
  };
}

export default function LegacyAnalyzerRedirect(props) {
  const isLoading = Boolean(props?.isLoading);
  const error = props?.error || null;
  const isEmpty = !props || Object.keys(props).length === 0;
  if (isEmpty && !isLoading && !error) {
    return null;
  }
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isStale = typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('sp_analyzer_redirect_stale'));
  const authNotice = '401 unauthorized session expired sign in';
  const supportedVariants = ['nlh', 'plo4', 'plo5', 'plo6', 'plo8'];
  const brainPreview = evaluateTrainingSpotWithHorseBrain({
    variant: supportedVariants[0],
    street: 'flop',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    heroCards: ['As', 'Kd'],
    boardCards: ['Qs', '7d', '2c'],
    potSizeBb: 12,
    facingBetBb: 4,
    effectiveStackBb: 100,
  });
  const arenaHref = buildCustomTrainingArenaHref(
    { format: 'cash', variant: supportedVariants[0], streets: ['flop'], positions: ['BTN'], stackDepth: 100 },
    'analyzer'
  );
  return (
    <div data-legacy-analyzer-redirect="true" data-specialty-brain-panel="true" data-offline={String(isOffline)} data-stale={String(isStale)} data-auth-notice={authNotice}>
      <a href="/hub/training/hand-history-upload?source=legacy-analyzer">Retry Hand History Upload</a>
      <a href={arenaHref} data-launch-club-arena-cta="true" data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}>
        Launch 1:1 Club Arena Drill
      </a>
    </div>
  );
}
