/**
 * BANKROLL CALCULATIONS
 * Server-validated financial calculations for the Bankroll Manager
 */

import { supabase } from '../supabase';

export interface BankrollEntry {
  id: string;
  user_id: string;
  category: string;
  location_id: string | null;
  trip_id: string | null;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  gross_in: number;
  gross_out: number;
  net_result: number;
  notes: string | null;
  emotional_tag: string | null;
  stakes: string | null;
  game_type: string | null;
  duration_hours: number | null;
  created_at: string;
}

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

export interface CategoryStats {
  category: string;
  totalNet: number;
  sessionCount: number;
  winningCount: number;
  losingCount: number;
  avgResult: number;
  totalHours: number;
  hourlyRate: number;
}

/**
 * Calculate total bankroll from all segments
 */
export async function calculateTotalBankroll(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('bankroll_segments')
    .select('current_balance, segment_type')
    .eq('user_id', userId)
    .neq('segment_type', 'life');

  if (error || !data) return 0;
  return data.reduce((sum, seg) => sum + (seg.current_balance || 0), 0);
}

/**
 * Calculate all-in net (all categories including expenses)
 */
export async function calculateAllInNet(
  userId: string,
  startDate?: string,
  endDate?: string,
  locationId?: string
): Promise<number> {
  let query = supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('is_revision', false);

  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);
  if (locationId) query = query.eq('location_id', locationId);

  const { data, error } = await query;
  if (error || !data) return 0;

  return data.reduce((sum, entry) => sum + (entry.net_result || 0), 0);
}

/**
 * Calculate poker-only net result
 */
export async function calculatePokerNet(
  userId: string,
  startDate?: string,
  endDate?: string,
  locationId?: string
): Promise<number> {
  let query = supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .in('category', ['poker_cash', 'poker_mtt']);

  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);
  if (locationId) query = query.eq('location_id', locationId);

  const { data, error } = await query;
  if (error || !data) return 0;

  return data.reduce((sum, entry) => sum + (entry.net_result || 0), 0);
}

/**
 * Calculate non-poker gambling net (casino, slots, sports)
 */
export async function calculateNonPokerNet(
  userId: string,
  startDate?: string,
  endDate?: string,
  locationId?: string
): Promise<number> {
  let query = supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .in('category', ['casino_table', 'slots', 'sports']);

  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);
  if (locationId) query = query.eq('location_id', locationId);

  const { data, error } = await query;
  if (error || !data) return 0;

  return data.reduce((sum, entry) => sum + (entry.net_result || 0), 0);
}

/**
 * Calculate total expenses
 */
export async function calculateExpenseTotal(
  userId: string,
  tripId?: string,
  locationId?: string
): Promise<number> {
  let query = supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .eq('category', 'expense');

  if (tripId) query = query.eq('trip_id', tripId);
  if (locationId) query = query.eq('location_id', locationId);

  const { data, error } = await query;
  if (error || !data) return 0;

  return Math.abs(data.reduce((sum, entry) => sum + (entry.net_result || 0), 0));
}

/**
 * Calculate hourly rate for poker sessions
 */
export async function calculateHourlyRate(
  userId: string,
  category?: string,
  stakes?: string,
  locationId?: string
): Promise<number> {
  let query = supabase
    .from('bankroll_ledger')
    .select('net_result, start_time, end_time')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null);

  if (category) {
    query = query.eq('category', category);
  } else {
    query = query.in('category', ['poker_cash', 'poker_mtt']);
  }

  if (stakes) query = query.eq('stakes', stakes);
  if (locationId) query = query.eq('location_id', locationId);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return 0;

  let totalNet = 0;
  let totalHours = 0;

  data.forEach((entry) => {
    totalNet += entry.net_result || 0;
    if (entry.start_time && entry.end_time) {
      const start = new Date(entry.start_time).getTime();
      const end = new Date(entry.end_time).getTime();
      totalHours += (end - start) / (1000 * 60 * 60);
    }
  });

  return totalHours > 0 ? totalNet / totalHours : 0;
}

/**
 * Calculate tournament ROI
 */
export async function calculateTournamentROI(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  let query = supabase
    .from('bankroll_ledger')
    .select('gross_in, net_result')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .eq('category', 'poker_mtt');

  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return 0;

  const totalBuyins = data.reduce((sum, entry) => sum + (entry.gross_in || 0), 0);
  const totalProfit = data.reduce((sum, entry) => sum + (entry.net_result || 0), 0);

  return totalBuyins > 0 ? (totalProfit / totalBuyins) * 100 : 0;
}

/**
 * Calculate travel ROI for a trip
 */
export async function calculateTravelROI(
  userId: string,
  tripId: string
): Promise<{ net: number; expenses: number; roi: number }> {
  // Get all entries for this trip
  const { data: entries, error: entriesError } = await supabase
    .from('bankroll_ledger')
    .select('net_result, category')
    .eq('user_id', userId)
    .eq('trip_id', tripId)
    .eq('is_revision', false);

  if (entriesError || !entries) {
    return { net: 0, expenses: 0, roi: 0 };
  }

  let gambling = 0;
  let expenses = 0;

  entries.forEach((entry) => {
    if (entry.category === 'expense') {
      expenses += Math.abs(entry.net_result || 0);
    } else {
      gambling += entry.net_result || 0;
    }
  });

  const net = gambling - expenses;
  const roi = expenses > 0 ? ((gambling - expenses) / expenses) * 100 : 0;

  return { net, expenses, roi };
}

/**
 * Calculate stats by category
 */
export async function calculateCategoryStats(
  userId: string,
  category: string,
  startDate?: string,
  endDate?: string
): Promise<CategoryStats> {
  let query = supabase
    .from('bankroll_ledger')
    .select('net_result, start_time, end_time')
    .eq('user_id', userId)
    .eq('category', category)
    .eq('is_revision', false);

  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);

  const { data, error } = await query;
  if (error || !data) {
    return {
      category,
      totalNet: 0,
      sessionCount: 0,
      winningCount: 0,
      losingCount: 0,
      avgResult: 0,
      totalHours: 0,
      hourlyRate: 0,
    };
  }

  let totalNet = 0;
  let totalHours = 0;
  let winningCount = 0;
  let losingCount = 0;

  data.forEach((entry) => {
    totalNet += entry.net_result || 0;
    if (entry.net_result > 0) winningCount++;
    if (entry.net_result < 0) losingCount++;
    if (entry.start_time && entry.end_time) {
      const start = new Date(entry.start_time).getTime();
      const end = new Date(entry.end_time).getTime();
      totalHours += (end - start) / (1000 * 60 * 60);
    }
  });

  return {
    category,
    totalNet,
    sessionCount: data.length,
    winningCount,
    losingCount,
    avgResult: data.length > 0 ? totalNet / data.length : 0,
    totalHours,
    hourlyRate: totalHours > 0 ? totalNet / totalHours : 0,
  };
}

/**
 * Get full bankroll stats
 */
export async function getBankrollStats(
  userId: string,
  startDate?: string,
  endDate?: string,
  locationId?: string
): Promise<BankrollStats> {
  const [
    totalBankroll,
    allInNet,
    pokerNet,
    nonPokerNet,
    expenseTotal,
    hourlyRate,
  ] = await Promise.all([
    calculateTotalBankroll(userId),
    calculateAllInNet(userId, startDate, endDate, locationId),
    calculatePokerNet(userId, startDate, endDate, locationId),
    calculateNonPokerNet(userId, startDate, endDate, locationId),
    calculateExpenseTotal(userId, undefined, locationId),
    calculateHourlyRate(userId, undefined, undefined, locationId),
  ]);

  // Calculate leak risk based on non-poker losses vs poker wins
  let leakRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (pokerNet > 0 && nonPokerNet < 0) {
    const leakRatio = Math.abs(nonPokerNet) / pokerNet;
    if (leakRatio > 0.5) leakRisk = 'HIGH';
    else if (leakRatio > 0.25) leakRisk = 'MEDIUM';
  } else if (nonPokerNet < -1000) {
    leakRisk = 'HIGH';
  } else if (nonPokerNet < -500) {
    leakRisk = 'MEDIUM';
  }

  // Get session counts
  const { count } = await supabase
    .from('bankroll_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_revision', false)
    .in('category', ['poker_cash', 'poker_mtt']);

  // Get total hours
  const { data: sessions } = await supabase
    .from('bankroll_ledger')
    .select('start_time, end_time')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null);

  let totalHours = 0;
  sessions?.forEach((s) => {
    if (s.start_time && s.end_time) {
      totalHours += (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / (1000 * 60 * 60);
    }
  });

  // Get travel ROI from most recent trip
  const { data: recentTrip } = await supabase
    .from('bankroll_trips')
    .select('id')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(1)
    .single();

  let travelROI = 0;
  if (recentTrip) {
    const tripStats = await calculateTravelROI(userId, recentTrip.id);
    travelROI = tripStats.net;
  }

  // Win rate calculation
  const { data: winLoss } = await supabase
    .from('bankroll_ledger')
    .select('net_result')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .in('category', ['poker_cash', 'poker_mtt']);

  const wins = winLoss?.filter((e) => e.net_result > 0).length || 0;
  const winRate = winLoss && winLoss.length > 0 ? (wins / winLoss.length) * 100 : 0;

  return {
    totalBankroll,
    allInNet,
    pokerNet,
    nonPokerNet,
    expenseTotal,
    leakRisk,
    travelROI,
    hourlyRate,
    totalHours,
    winRate,
    sessionCount: count || 0,
  };
}

/**
 * Calculate "what if" scenarios for brutal truth reports
 */
export async function calculateWhatIf(
  userId: string,
  excludeCategory: string
): Promise<{ currentNet: number; adjustedNet: number; difference: number }> {
  const { data: allEntries } = await supabase
    .from('bankroll_ledger')
    .select('net_result, category')
    .eq('user_id', userId)
    .eq('is_revision', false);

  if (!allEntries) {
    return { currentNet: 0, adjustedNet: 0, difference: 0 };
  }

  const currentNet = allEntries.reduce((sum, e) => sum + (e.net_result || 0), 0);
  const adjustedNet = allEntries
    .filter((e) => e.category !== excludeCategory)
    .reduce((sum, e) => sum + (e.net_result || 0), 0);

  return {
    currentNet,
    adjustedNet,
    difference: adjustedNet - currentNet,
  };
}
