/**
 * LEAK DETECTION ENGINE
 * Identifies financial leaks and patterns that harm bankroll EV
 */

import { rowsOf } from './leakMath.mjs';
import { supabase } from '../supabase';
import { localDay } from './localDates.mjs';

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
  let categoryQuery = supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('category', category)
    .eq('is_revision', false)
    .lt('net_result', 0);

  let totalQuery = supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('is_revision', false)
    // in-list: bounded by the five built-in gaming categories
    .in('category', GAMING_CATEGORIES)
    .lt('net_result', 0);

  if (locationId) {
    categoryQuery = categoryQuery.eq('location_id', locationId);
    totalQuery = totalQuery.eq('location_id', locationId);
  }

  const [categoryResult, totalResult] = await Promise.all([
    categoryQuery,
    totalQuery,
  ]);
  const categoryData = rowsOf(categoryResult);
  const totalData = rowsOf(totalResult);

  if (!categoryData || !totalData || totalData.length === 0) return 0;

  const categoryLoss = Math.abs(
    categoryData.reduce((sum, e) => sum + (e.net_result || 0), 0)
  );
  const totalLoss = Math.abs(
    totalData.reduce((sum, e) => sum + (e.net_result || 0), 0)
  );

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
  let query = supabase
    .from('bankroll_ledger')
    .select('stakes, net_result, start_time, end_time, location_id')
    .eq('user_id', userId)
    .eq('category', 'poker_cash')
    .eq('is_revision', false)
    .not('stakes', 'is', null);
  if (locationId) query = query.eq('location_id', locationId);

  const data = rowsOf(await query);

  // Group by stakes
  const stakeStats: Record<string, { net: number; hours: number; sessions: number }> = {};

  data.forEach((entry) => {
    if (!entry.stakes) return;
    if (!stakeStats[entry.stakes]) {
      stakeStats[entry.stakes] = { net: 0, hours: 0, sessions: 0 };
    }
    stakeStats[entry.stakes].net += entry.net_result || 0;
    stakeStats[entry.stakes].sessions += 1;
    if (entry.start_time && entry.end_time) {
      const hours =
        (new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) /
        (1000 * 60 * 60);
      stakeStats[entry.stakes].hours += hours;
    }
  });

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
  let query = supabase
    .from('bankroll_ledger')
    .select('net_result, start_time')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .in('category', ['poker_cash', 'poker_mtt', 'casino_table', 'slots'])
    .not('start_time', 'is', null);
  if (locationId) query = query.eq('location_id', locationId);

  const data = rowsOf(await query);

  // Group by time blocks
  const timeBlocks: Record<string, { net: number; count: number }> = {
    'late_night': { net: 0, count: 0 }, // 12am-6am
    'morning': { net: 0, count: 0 },    // 6am-12pm
    'afternoon': { net: 0, count: 0 },  // 12pm-6pm
    'evening': { net: 0, count: 0 },    // 6pm-12am
  };

  data.forEach((entry) => {
    if (!entry.start_time) return;
    const hour = new Date(entry.start_time).getHours();
    let block: string;
    if (hour >= 0 && hour < 6) block = 'late_night';
    else if (hour >= 6 && hour < 12) block = 'morning';
    else if (hour >= 12 && hour < 18) block = 'afternoon';
    else block = 'evening';

    timeBlocks[block].net += entry.net_result || 0;
    timeBlocks[block].count += 1;
  });

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
    let query = supabase
      .from('bankroll_ledger')
      .select('net_result')
      .eq('user_id', userId)
      .eq('category', category)
      .eq('is_revision', false);

    if (locationId) query = query.eq('location_id', locationId);

    const data = rowsOf(await query);
    if (data.length === 0) continue;

    const totalNet = data.reduce((sum, e) => sum + (e.net_result || 0), 0);
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
  let tripQuery = supabase
    .from('bankroll_trips')
    .select('id, name')
    .eq('user_id', userId);
  if (locationId) tripQuery = tripQuery.eq('location_id', locationId);

  const trips = rowsOf(await tripQuery, 'trips');

  const alerts: LeakAlert[] = [];

  for (const trip of trips) {
    const entries = rowsOf(await supabase
      .from('bankroll_ledger')
      .select('net_result, category')
      .eq('user_id', userId)
      .eq('trip_id', trip.id)
      .eq('is_revision', false));

    let gambling = 0;
    let expenses = 0;

    entries.forEach((e) => {
      if (e.category === 'expense') {
        expenses += Math.abs(e.net_result || 0);
      } else {
        gambling += e.net_result || 0;
      }
    });

    const net = gambling - expenses;
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

/**
 * Check if current session would violate rules
 */
export async function checkRuleViolations(
  userId: string,
  sessionAmount: number
): Promise<{ violated: boolean; rules: string[] }> {
  const { data: rules } = await supabase
    .from('bankroll_rules')
    .select('rule_type, value, is_strict')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!rules) return { violated: false, rules: [] };

  const violatedRules: string[] = [];

  // Today's results on the player's own calendar (the UTC date was already
  // tomorrow every evening in the Americas, so the day's losses read as zero).
  const today = localDay();
  const { data: todayEntries } = await supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('entry_date', today)
    .eq('is_revision', false)
    // in-list: bounded by the five built-in gaming categories
    .in('category', GAMING_CATEGORIES);

  const todayNet = todayEntries?.reduce((sum, e) => sum + (e.net_result || 0), 0) || 0;

  for (const rule of rules) {
    if (rule.rule_type === 'stop_loss_day') {
      if (todayNet + sessionAmount < -rule.value) {
        violatedRules.push(`Daily stop-loss of $${rule.value} would be exceeded`);
      }
    }
    if (rule.rule_type === 'stop_loss_session' && sessionAmount < -rule.value) {
      violatedRules.push(`Session stop-loss of $${rule.value} exceeded`);
    }
  }

  return {
    violated: violatedRules.length > 0,
    rules: violatedRules,
  };
}

/**
 * Log a rule violation
 */
export async function logRuleViolation(
  userId: string,
  ruleId: string,
  ledgerEntryId: string,
  violationType: string,
  ruleValue: number,
  actualValue: number
): Promise<void> {
  await (supabase as any).from('bankroll_rule_violations').insert({
    user_id: userId,
    rule_id: ruleId,
    ledger_entry_id: ledgerEntryId,
    violation_type: violationType,
    rule_value: ruleValue,
    actual_value: actualValue,
  });
}
