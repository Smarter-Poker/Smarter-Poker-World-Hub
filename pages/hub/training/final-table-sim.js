// TRAIN-FTS-A11Y-1: The shared entry provides the heading and labeled Play control.
// This route is listed in _app's TRAINING_ROUTES_WITH_HEADER (the page owns the
// global header), so it mounts UniversalHeader itself, as blind-defense does.
import TrainingGameEntry from '../../../src/components/training/TrainingGameEntry';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function FinalTableSimPage() {
  return (
    <>
      <UniversalHeader pageDepth={2} />
      <TrainingGameEntry
        title="Final Table Sim"
        description="Play Final Table Spots And Review Each Decision Before The Next Hand."
        gameId="final-table-sim"
        gameHref="/hub/training/arena/final-table-sim?level=1&source=final-table-sim"
      />
    </>
  );
}
