import CanonicalTrainingRedirect from '../../../src/components/training/CanonicalTrainingRedirect';
import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';

export default function PlayModeRedirect() {
  const brainPreview = evaluateTrainingSpotWithHorseBrain({
    variant: 'nlh',
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
    { format: 'cash', variant: 'nlh', streets: ['flop'], positions: ['BTN'], stackDepth: 100 },
    'play-mode'
  );
  return (
    <CanonicalTrainingRedirect
      title="Club Arena Play Mode"
      description="Continue in the canonical Club Arena training table, with authored scenarios, verified grading, explicit feedback, manual Next controls, and durable progress."
      href={arenaHref && brainPreview?.ok ? '/hub/training/arena/cash-001?level=1' : '/hub/training/arena/cash-001?level=1'}
      eyebrow="Club Arena Gameplay"
      action="Enter The Arena"
      shellClassName="sp-training-command sp-training-command--arena"
      headerClassName="sp-command-header"
      mainClassName="sp-command-main"
    />
  );
}
