/**
 * LEAK DETECTION ENGINE
 * Identifies financial leaks and patterns that harm bankroll EV.
 *
 * Every read goes through allRowsOf (leakMath.mjs): a page at a time past
 * PostgREST's 1,000-row cap, and a failed page throws through rowsOf. Totals
 * are summed in cents by the leakMath helpers.
 */

import {
  allRowsOf,
  netDollars,
  stakeTotals,
  timeBlockTotals,
  tripTotals,
} from './leakMath.mjs';
import { idBatches } from '../inBatches.mjs';
import { supabase } from '../supabase';

// Gaming categories. Withdrawals carry a negative net (money out of the
// roll) and expenses are costs, not losses at play; counting them made
// "X represent N% of total losses" wrong and let a deposit made today
// cancel out the day's losses against a stop-loss rule.
const GAMING_CATEGORIES = ['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports'];
const severityOf = (n: number) => Math.min(5, Math.max(1, Math.round(n) || 1)) as 1 | 2 | 3 | 4 | 5;

export interface LeakAlert {
  id: string;
  type: 'venue' | 'category' | 'stake' | 'pattern' | 'time' | 'expense';
  severity: 1 | 2 | 3 | 4 | 5;
  title: string;
  message: string;
  value: string;
  /** Signed USD total the finding is about (formatted by the view). */
  amount?: number;
  /** Signed USD per hour, for a stake leak. */
  hourly?: number;
  locationId?: string;
  category?: string;
  data?: Record<string, unknown>;
}

export interface LeakAnalysis {
  leakRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  topLeaks: LeakAlert[];
  totalLeakAmount: number;
  recommendations: string[];
}

/**
 * Get leak percentage for a specific category at a location
 */
export async function getCategoryLeakPercentage(
  userId: string,
  category: string,
  locationId?: string
): Promise<number> {
  const losingRows = (onlyCategory?: string) => () => {
    let query = supabase
      .from('bankroll_ledger')
      .select('id, gross_in, gross_out')
      .eq('user_id', userId)
      .eq('is_revision', false)
      .lt('net_result', 0);
    query = onlyCategory
      ? query.eq('category', onlyCategory)
      // in-list: bounded by the five built-in gaming categories
      : query.in('category', GAMING_CATEGORIES);
    if (locationId) query = query.eq('location_id', locationId);
    return query.order('id', { ascending: true });
  };

  const [categoryData, totalData] = await Promise.all([
    allRowsOf(losingRows(category)),
    allRowsOf(losingRows()),
  ]);

  if (totalData.length === 0) return 0;

  const categoryLoss = Math.abs(netDollars(categoryData));
  const totalLoss = Math.abs(netDollars(totalData));

  return totalLoss > 0 ? Math.round((categoryLoss / totalLoss) * 100) : 0;
}

/**
 * Detect stake-based leaks (losing at specific stakes)
 */
export async function detectStakeLeaks(
  userId: string,
  minHours: number = 20,
  locationId?: string
): Promise<LeakAlert[]> {
  const data = await allRowsOf(() => {
    let query = supabase
      .from('bankroll_ledger')
      .select('id, stakes, gross_in, gross_out, start_time, end_time')
      .eq('user_id', userId)
      .eq('category', 'poker_cash')
      .eq('is_revision', false)
      .not('stakes', 'is', null);
    if (locationId) query = query.eq('location_id', locationId);
    return query.order('id', { ascending: true });
  });

  // By stakes, in cents; a session past midnight counts its real hours.
  const stakeStats: Record<string, { net: number; hours: number; sessions: number }> = stakeTotals(data);

  const alerts: LeakAlert[] = [];

  Object.entries(stakeStats || {}).forEach(([stakes, stats]) => {
    if (stats.hours >= minHours && stats.net < 0) {
      const hourlyRate = stats.net / stats.hours;
      alerts.push({
        id: `stake-leak-${stakes}`,
        type: 'stake',
        severity: hourlyRate < -20 ? 5 : hourlyRate < -10 ? 4 : 3,
        title: `${stakes} Risk`,
        message: `Losing at ${stakes} over ${Math.round(stats.hours)} hours`,
        value: `${hourlyRate < 0 ? '-' : '+'}$${Math.abs(Math.round(hourlyRate))}/hr`,
        hourly: hourlyRate,
        data: { stakes, totalNet: stats.net, totalHours: stats.hours },
      });
    }
  });

  return alerts.sort((a, b) => b.severity - a.severity);
}

/**
 * Detect time-of-day leaks
 */
export async function detectTimeLeaks(userId: string, locationId?: string): Promise<LeakAlert[]> {
  const data = await allRowsOf(() => {
    let query = supabase
      .from('bankroll_ledger')
      .select('id, gross_in, gross_out, start_time')
      .eq('user_id', userId)
      .eq('is_revision', false)
      .in('category', ['poker_cash', 'poker_mtt', 'casino_table', 'slots'])
      .not('start_time', 'is', null);
    if (locationId) query = query.eq('location_id', locationId);
    return query.order('id', { ascending: true });
  });

  // By the clock hour the player typed (12am-6am, 6am-12pm, 12pm-6pm,
  // 6pm-12am), never the viewer's time zone; summed in cents.
  const timeBlocks: Record<string, { net: number; count: number }> = timeBlockTotals(data);

  const alerts: LeakAlert[] = [];

  Object.entries(timeBlocks || {}).forEach(([block, stats]) => {
    if (stats.count >= 10 && stats.net < -500) {
      const blockLabels: Record<string, string> = {
        late_night: 'Late Night (12am-6am)',
        morning: 'Morning (6am-12pm)',
        afternoon: 'Afternoon (12pm-6pm)',
        evening: 'Evening (6pm-12am)',
      };

      alerts.push({
        id: `time-leak-${block}`,
        type: 'time',
        severity: stats.net < -2000 ? 4 : stats.net < -1000 ? 3 : 2,
        title: `${blockLabels[block]} Sessions`,
        message: `Negative results during ${blockLabels[block].toLowerCase()}`,
        value: `-$${Math.abs(Math.round(stats.net)).toLocaleString()}`,
        amount: stats.net,
        data: { timeBlock: block, sessions: stats.count },
      });
    }
  });

  return alerts.sort((a, b) => b.severity - a.severity);
}

/**
 * Detect non-poker gambling leaks
 */
export async function detectNonPokerLeaks(
  userId: string,
  locationId?: string
): Promise<LeakAlert[]> {
  const categories = ['casino_table', 'slots', 'sports'];
  const alerts: LeakAlert[] = [];

  for (const category of categories) {
    const data = await allRowsOf(() => {
      let query = supabase
        .from('bankroll_ledger')
        .select('id, gross_in, gross_out')
        .eq('user_id', userId)
        .eq('category', category)
        .eq('is_revision', false);
      if (locationId) query = query.eq('location_id', locationId);
      return query.order('id', { ascending: true });
    });
    if (data.length === 0) continue;

    const totalNet = netDollars(data);
    const leakPct = await getCategoryLeakPercentage(userId, category, locationId);

    if (totalNet < -100) {
      const labels: Record<string, string> = {
        casino_table: 'Table Games',
        slots: 'Slots',
        sports: 'Sports Betting',
      };

      alerts.push({
        id: `category-leak-${category}`,
        type: 'category',
        severity: severityOf(category === 'slots' ? Math.ceil(leakPct / 20) : Math.ceil(leakPct / 25)),
        title: `${labels[category]} Losses`,
        message: `${labels[category]} represent ${leakPct}% of total losses`,
        value: `-$${Math.abs(Math.round(totalNet)).toLocaleString()}`,
        amount: totalNet,
        category,
        data: { totalNet, leakPercentage: leakPct, sessionCount: data.length },
      });
    }
  }

  return alerts.sort((a, b) => b.severity - a.severity);
}

/**
 * Detect expense leaks (trips that cost more than they made)
 */
export async function detectExpenseLeaks(userId: string, locationId?: string): Promise<LeakAlert[]> {
  const trips = await allRowsOf(() => {
    let tripQuery = supabase
      .from('bankroll_trips')
      .select('id, name')
      .eq('user_id', userId);
    if (locationId) tripQuery = tripQuery.eq('location_id', locationId);
    return tripQuery.order('id', { ascending: true });
  }, 'trips');

  // The rows of 100 trips per request (was one request per trip).
  const rowsByTrip = new Map<string, any[]>();
  for (const batch of idBatches(trips.map((t) => t.id))) {
    const rows = await allRowsOf(() => supabase
      .from('bankroll_ledger')
      .select('id, trip_id, category, gross_in, gross_out')
      .eq('user_id', userId)
      .eq('is_revision', false)
      .in('trip_id', batch)
      .order('id', { ascending: true }));
    for (const row of rows) {
      if (!rowsByTrip.has(row.trip_id)) rowsByTrip.set(row.trip_id, []);
      rowsByTrip.get(row.trip_id)!.push(row);
    }
  }

  const alerts: LeakAlert[] = [];

  for (const trip of trips) {
    // Sessions against expenses; a deposit or withdrawal logged on the trip
    // moves the bankroll and is neither.
    const { gambling, expenses, net } = tripTotals(rowsByTrip.get(trip.id) || []);
    if (net < 0 && expenses > 0) {
      alerts.push({
        id: `expense-leak-${trip.id}`,
        type: 'expense',
        severity: net < -2000 ? 4 : net < -1000 ? 3 : 2,
        title: `${trip.name} Loss`,
        message: `Trip expenses exceeded gambling profit`,
        value: `-$${Math.abs(Math.round(net)).toLocaleString()}`,
        amount: net,
        data: { tripId: trip.id, gambling, expenses, net },
      });
    }
  }

  return alerts.sort((a, b) => b.severity - a.severity);
}

/**
 * Run full leak analysis
 */
export async function runLeakAnalysis(
  userId: string,
  locationId?: string
): Promise<LeakAnalysis> {
  const [stakeLeaks, timeLeaks, nonPokerLeaks, expenseLeaks] = await Promise.all([
    // Every detector honours the venue: the view is headed "At <venue>" when
    // the dashboard's Location filter is set, so none may read all venues.
    detectStakeLeaks(userId, 20, locationId),
    detectTimeLeaks(userId, locationId),
    detectNonPokerLeaks(userId, locationId),
    detectExpenseLeaks(userId, locationId),
  ]);

  const allLeaks = [...stakeLeaks, ...timeLeaks, ...nonPokerLeaks, ...expenseLeaks];
  const topLeaks = allLeaks.sort((a, b) => b.severity - a.severity).slice(0, 5);

  // Calculate total leak amount
  const totalLeakAmount = allLeaks.reduce((sum, leak) => {
    const value = leak.data?.totalNet as number;
    return sum + (value && value < 0 ? Math.abs(value) : 0);
  }, 0);

  // Determine overall leak risk
  const maxSeverity = Math.max(...allLeaks.map((l) => l.severity), 1);
  let leakRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (maxSeverity >= 4 || allLeaks.length >= 5) leakRisk = 'HIGH';
  else if (maxSeverity >= 3 || allLeaks.length >= 3) leakRisk = 'MEDIUM';

  // Generate recommendations
  const recommendations: string[] = [];
  if (nonPokerLeaks.some((l) => l.category === 'slots')) {
    recommendations.push('Consider eliminating slot play entirely');
  }
  if (stakeLeaks.length > 0) {
    recommendations.push('Review stake selection - some levels show negative expectation');
  }
  if (timeLeaks.some((l) => l.data?.timeBlock === 'late_night')) {
    recommendations.push('Late night sessions correlate with losses - consider time limits');
  }
  if (expenseLeaks.length > 0) {
    recommendations.push('Travel costs are exceeding trip profits - evaluate trip value');
  }

  return {
    leakRisk,
    topLeaks,
    totalLeakAmount,
    recommendations,
  };
}
