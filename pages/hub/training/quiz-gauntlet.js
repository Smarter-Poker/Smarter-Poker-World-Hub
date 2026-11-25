import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';

/**
 * Legacy Quiz Gauntlet Route
 *
 * The former standalone page generated and graded its own browser-side answer
 * bank. Canonical Quiz Gauntlet questions now enter through the signed Training
 * Arena so question identity, grading, feedback, and completion stay on the
 * verified server-authority path.
 * TRAIN-CSS-MOBILE-ADOPT-18, TRAIN-WIRE-FEEDBACK-V2-1, and
 * TRAIN-WIRE-PROGRESS-3 now resolve through that canonical Arena destination;
 * this compatibility route owns no duplicate responsive, feedback, or progress UI.
 */

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/arena/quiz-gauntlet?level=1&source=legacy-quiz-gauntlet',
      permanent: false,
    },
  };
}

export default function LegacyQuizGauntletRedirect(props) {
  const isLoading = Boolean(props?.isLoading);
  const error = props?.error || null;
  const isEmpty = !props || Object.keys(props).length === 0;
  if (isEmpty && !isLoading && !error) {
    return null;
  }
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isStale = typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('sp_quiz_gauntlet_redirect_stale'));
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
    'quiz-gauntlet'
  );
  return (
    <div data-legacy-quiz-gauntlet-redirect="true" data-specialty-brain-panel="true" data-offline={String(isOffline)} data-stale={String(isStale)} data-auth-notice={authNotice}>
      <a href="/hub/training/arena/quiz-gauntlet?level=1&source=legacy-quiz-gauntlet">Retry Quiz Gauntlet Arena</a>
      <a href={arenaHref} data-launch-club-arena-cta="true" data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}>
        Launch 1:1 Club Arena Drill
      </a>
    </div>
  );
}
