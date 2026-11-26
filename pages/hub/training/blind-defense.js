import TrainingGameEntry from '../../../src/components/training/TrainingGameEntry';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function BlindDefensePage() {
  return (
    <>
      <UniversalHeader pageDepth={2} />
      <TrainingGameEntry
        title="Blind Defense"
        description="Practice Defending Your Blind Against A Raise."
        gameId="cash-003"
        gameHref="/hub/training/arena/cash-003?level=1&source=blind-defense"
      />
    </>
  );
}
