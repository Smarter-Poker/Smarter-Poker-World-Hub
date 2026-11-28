/**
 * BANKROLL CALCULATIONS
 * Financial figures for the Bankroll Manager, read in full (a page at a time,
 * past PostgREST's 1,000-row cap) and summed in cents by ledgerMath.mjs and
 * bankrollStats.mjs. A failed read throws; it is never shown as $0.
 *
 * The per-figure helpers that used to live here (calculateAllInNet,
 * calculatePokerNet, calculateTournamentROI, calculateCategoryStats,
 * calculateWhatIf and the rest) had no callers and summed dollar floats over
 * unpaged reads; they were removed rather than left to be reused.
 */

import { supabase } from '../supabase';
import { withRetry } from './retryUtils';
import { bankrollBalanceCents, centsToDollars, resultsCents } from './ledgerMath.mjs';
import { fetchAllRows } from './ledgerReport.mjs';
import { periodStats } from './bankrollStats.mjs';

export interface BankrollStats {
  totalBankroll: number;
  allInNet: number;
  pokerNet: number;
  nonPokerNet: number;
  expenseTotal: number;
  leakRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  travelROI: number;
  hourlyRate: number;
  totalHours: number;
  winRate: number;
  sessionCount: number;
}

/**
 * The Bankroll Balance tile: the starting bankroll (bankroll_segments.initial_deposit)
 * plus every session and expense plus every Adjust Bankroll deposit and
 * withdrawal, summed in cents by ledgerMath. Deposits and withdrawals used to
 * be skipped here, so Adjust Bankroll never moved the balance it adjusts.
 * A failed read throws instead of showing the player a $0 balance.
 */
export async function calculateTotalBankroll(userId: string): Promise<number> {
  const [entries, { data: segments, error: segmentError }] = await Promise.all([
    fetchAllRows(() => supabase
      .from('bankroll_ledger')
      .select('id, gross_in, gross_out, category')
      .eq('user_id', userId)
      .eq('is_revision', false)
      .order('id', { ascending: true })),
    supabase
      .from('bankroll_segments')
      .select('initial_deposit, segment_type')
      .eq('user_id', userId),
  ]);
  if (segmentError) throw segmentError;
  return centsToDollars(bankrollBalanceCents(entries || [], segments || []));
}

/**
 * Net (sessions and expenses) of the player's most recent trip, or 0 when
 * they have none.
 */
async function latestTripNet(userId: string): Promise<number> {
  const { data: trip, error } = await supabase
    .from('bankroll_trips')
    .select('id')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!trip) return 0;
  const rows = await fetchAllRows(() => supabase
    .from('bankroll_ledger')
    .select('id, category, gross_in, gross_out')
    .eq('user_id', userId)
    .eq('trip_id', trip.id)
    .eq('is_revision', false)
    .order('id', { ascending: true }));
  return centsToDollars(resultsCents(rows));
}

/**
 * Get full bankroll stats. Every period figure covers the same rows: the
 * chosen dates and venue.
 */
export async function getBankrollStats(
  userId: string,
  startDate?: string,
  endDate?: string,
  locationId?: string
): Promise<BankrollStats> {
  return withRetry(async () => {
    const [totalBankroll, entries, travelROI] = await Promise.all([
      calculateTotalBankroll(userId),
      fetchAllRows(() => {
        let query = supabase
          .from('bankroll_ledger')
          .select('id, category, gross_in, gross_out, start_time, end_time')
          .eq('user_id', userId)
          .eq('is_revision', false)
          .not('category', 'in', '("deposit","withdrawal")');
        if (startDate) query = query.gte('entry_date', startDate);
        if (endDate) query = query.lte('entry_date', endDate);
        if (locationId) query = query.eq('location_id', locationId);
        return query.order('id', { ascending: true });
      }),
      latestTripNet(userId),
    ]);
    return { totalBankroll, travelROI, ...periodStats(entries) } as BankrollStats;
  });
}
