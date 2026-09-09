import CanonicalTrainingRedirect from '../../../src/components/training/CanonicalTrainingRedirect';

/**
 * The retired page converted Training accuracy and partially priced decisions
 * into guaranteed hourly and monthly bankroll savings. Those projections did
 * not have enough evidence to be product truth. Preserve the route, but send
 * the player to the sealed-attempt report that owns the actual measurements.
 * TRAIN-BANKROLL-A11Y-1 is retained by CanonicalTrainingRedirect through its
 * semantic h1 and visible, keyboard-reachable destination link.
 */
export default function BankrollCoachPage() {
  return (
    <CanonicalTrainingRedirect
      title="Bankroll Coach"
      eyebrow="Verified Training History"
      description="Opening Your Verified Training Report. Unsupported Dollar-Per-Hour And Monthly Savings Projections Have Been Retired; Only Server-Recorded Decisions And Measured EV Evidence Are Shown."
      href="/hub/training/gto-reports?source=bankroll-coach"
      action="Open Verified Training Report"
    />
  );
}
