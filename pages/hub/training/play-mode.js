import CanonicalTrainingRedirect from '../../../src/components/training/CanonicalTrainingRedirect';

export default function PlayModeRedirect() {
  return (
    <CanonicalTrainingRedirect
      title="Club Arena Play Mode"
      description="Continue in the canonical Club Arena training table, with authored scenarios, verified grading, explicit feedback, manual Next controls, and durable progress."
      href="/hub/training/arena/cash-001?level=1"
      eyebrow="Club Arena Gameplay"
      action="Enter The Arena"
      shellClassName="sp-training-command sp-training-command--arena"
      headerClassName="sp-command-header"
      mainClassName="sp-command-main"
    />
  );
}
