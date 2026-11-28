/**
 * Leak Analysis helpers shared by src/lib/bankroll/leakDetection.ts (which
 * reads the ledger) and src/components/bankroll/LeakAnalysisView.jsx (which
 * shows it).
 *
 * rowsOf: a Supabase read that failed returns { data: null, error } instead of
 * throwing. The detectors used to treat that as "no rows", so a dropped
 * connection showed a green "No Leaks Detected" and the view's own
 * "Could Not Read Your Ledger" state could never appear. A failed read now
 * throws and the view says so.
 *
 * leakValueText: each finding carries its amount as a number (`amount`, a
 * signed USD total, or `hourly`, signed USD per hour) and the view formats it
 * in the player's display currency. The detectors used to bake a dollar
 * string into the finding, so with Display EUR on the panel read
 * "Total Leak Amount: €764" over rows in dollars, and a losing hourly rate
 * printed as "$-24/hr".
 */

import { formatCurrencyWithSign } from './currencyUtils.js';

export function rowsOf(result, what = 'ledger') {
  if (result && result.error) {
    const error = new Error(`Could not read the ${what}: ${result.error.message || result.error}`);
    error.cause = result.error;
    throw error;
  }
  return (result && result.data) || [];
}

export function leakValueText(leak, displayEUR = false) {
  if (!leak) return '';
  if (Number.isFinite(leak.hourly)) return `${formatCurrencyWithSign(Math.round(leak.hourly), displayEUR)}/hr`;
  if (Number.isFinite(leak.amount)) return formatCurrencyWithSign(Math.round(leak.amount), displayEUR);
  return leak.value || '';
}
