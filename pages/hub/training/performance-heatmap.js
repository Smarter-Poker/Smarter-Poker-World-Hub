import CanonicalTrainingRedirect from '../../../src/components/training/CanonicalTrainingRedirect';

export default function PerformanceHeatmapRedirect() {
  return (
    <CanonicalTrainingRedirect
      title="Performance Heatmap"
      description="Open the verified GTO reporting workspace. It shows only dimensions actually stored with your graded decisions and never invents position or street results from a game name."
      href="/hub/training/gto-reports"
      eyebrow="Verified Performance Data"
      action="Open GTO Reports"
      shellClassName="sp-training-tool sp-training-tool--analysis"
      headerClassName="sp-training-analysis-header"
      mainClassName="sp-training-analysis-main"
    />
  );
}
