import CanonicalTrainingRedirect from '../../../src/components/training/CanonicalTrainingRedirect';

export default function GTOScorecardRedirect() {
  return (
    <CanonicalTrainingRedirect
      title="GTO Scorecard"
      description="Open your authenticated training report. Scores, formats, position results, classifications, and EV loss are calculated only from recorded training decisions."
      href="/hub/training/gto-reports"
      eyebrow="Verified Player History"
      action="Open GTO Reports"
      shellClassName="sp-training-intelligence sp-training-intelligence--scorecard"
      headerClassName="sp-intelligence-header"
      mainClassName="sp-intelligence-main"
    />
  );
}
