// TRAIN-FTS-A11Y-1: The shared entry provides the heading and labeled Play control.
import TrainingGameEntry from '../../../src/components/training/TrainingGameEntry';

export default function FinalTableSimPage() {
  return (
    <TrainingGameEntry
      title="Final Table Sim"
      description="Play Final Table Spots And Review Each Decision Before The Next Hand."
      gameId="final-table-sim"
      gameHref="/hub/training/arena/final-table-sim?level=1&source=final-table-sim"
    />
  );
}
