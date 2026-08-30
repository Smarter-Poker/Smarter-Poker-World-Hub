import CanonicalTrainingRedirect from '../../../src/components/training/CanonicalTrainingRedirect';

export default function RangeExplorerRedirect() {
  return (
    <CanonicalTrainingRedirect
      title="Range Explorer"
      description="Open the verified preflop chart browser, where every displayed range is loaded from the authenticated range service instead of estimated from hand strength."
      href="/hub/training/preflop-charts"
      eyebrow="Verified Range Data"
      action="Open Preflop Charts"
      shellClassName="sp-training-tool sp-training-tool--analysis"
      headerClassName="sp-training-analysis-header"
      mainClassName="sp-training-analysis-main"
    />
  );
}
