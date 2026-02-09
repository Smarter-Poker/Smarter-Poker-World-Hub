/**
 * BANKROLL DATA SELECTORS
 * Unified data access layer for bankroll management
 */

import { supabase } from '../supabase';

export interface LedgerEntry {
  id: string;
  user_id: string;
  category: string;
  location_id: string | null;
  location_name?: string;
  trip_id: string | null;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  gross_in: number;
  gross_out: number;
  net_result: number;
  notes: string | null;
  media_urls: string[] | null;
  emotional_tag: string | null;
  stakes: string | null;
  game_type: string | null;
  tournament_name: string | null;
  buy_in_amount: number | null;
  finish_position: number | null;
  field_size: number | null;
  casino_game: string | null;
  sport: string | null;
  bet_type: string | null;
  expense_type: string | null;
  created_at: string;
}

export interface Trip {
  id: string;
  name: string;
  location_id: string | null;
  location_name?: string;
  start_date: string;
  end_date: string | null;
  purpose: string | null;
  notes: string | null;
  status: 'active' | 'completed' | 'deleted';
  totalNet?: number;
  totalExpenses?: number;
  entryCount?: number;
  categoryBreakdown?: Record<string, { count: number; net: number }>;
}

export interface BankrollRule {
  id: string;
  rule_type: string;
  value: number;
  is_strict: boolean;
  is_active: boolean;
}

export interface BankrollAlert {
  id: string;
  alert_type: string;
  severity: number;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export type CategoryFilter =
  | 'all'
  | 'poker_cash'
  | 'poker_mtt'
  | 'casino_table'
  | 'slots'
  | 'sports'
  | 'expense';

export interface LedgerFilters {
  category?: CategoryFilter;
  locationId?: string;
  tripId?: string;
  startDate?: string;
  endDate?: string;
  includeExpenses?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Fetch ledger entries with filters
 */
export async function fetchLedgerEntries(
  userId: string,
  filters: LedgerFilters = {}
): Promise<LedgerEntry[]> {
  let query = supabase
    .from('bankroll_ledger')
    .select(
      `
      *,
      bankroll_locations(name)
    `
    )
    .eq('user_id', userId)
    .eq('is_revision', false)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.category && filters.category !== 'all') {
    query = query.eq('category', filters.category);
  } else if (!filters.includeExpenses) {
    query = query.neq('category', 'expense');
  }

  if (filters.locationId) {
    query = query.eq('location_id', filters.locationId);
  }

  if (filters.tripId) {
    query = query.eq('trip_id', filters.tripId);
  }

  if (filters.startDate) {
    query = query.gte('entry_date', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('entry_date', filters.endDate);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (
    data?.map((entry) => ({
      ...entry,
      location_name: entry.bankroll_locations?.name || null,
    })) || []
  );
}

/**
 * Fetch a single ledger entry by ID
 */
export async function fetchLedgerEntry(
  userId: string,
  entryId: string
): Promise<LedgerEntry | null> {
  const { data, error } = await supabase
    .from('bankroll_ledger')
    .select(
      `
      *,
      bankroll_locations(name)
    `
    )
    .eq('user_id', userId)
    .eq('id', entryId)
    .single();

  if (error) return null;

  return {
    ...data,
    location_name: data.bankroll_locations?.name || null,
  };
}

/**
 * Map ledger category to bankroll segment type
 */
function categoryToSegment(category: string): string {
  switch (category) {
    case 'poker_cash':
    case 'poker_mtt':
      return 'poker';
    case 'casino_table':
    case 'slots':
      return 'casino';
    case 'sports':
      return 'sports';
    case 'expense':
      return 'poker'; // expenses deduct from poker segment
    default:
      return 'poker';
  }
}

/**
 * Recalculate the bankroll segment balance from all ledger entries
 * Called internally after creating/updating ledger entries
 */
async function recalculateSegmentBalance(userId: string, segmentType: string): Promise<void> {
  // Determine which categories belong to this segment
  let categories: string[] = [];
  switch (segmentType) {
    case 'poker':
      categories = ['poker_cash', 'poker_mtt', 'expense'];
      break;
    case 'casino':
      categories = ['casino_table', 'slots'];
      break;
    case 'sports':
      categories = ['sports'];
      break;
    default:
      return;
  }

  // Sum all net results for this segment from the ledger
  const { data: entries } = await supabase
    .from('bankroll_ledger')
    .select('gross_in, gross_out, category')
    .eq('user_id', userId)
    .eq('is_revision', false)
    .in('category', categories);

  let segmentTotal = 0;
  entries?.forEach((e: any) => {
    if (e.category === 'expense') {
      segmentTotal -= Math.abs(e.gross_in || 0);
    } else {
      segmentTotal += (e.gross_out || 0) - (e.gross_in || 0);
    }
  });

  // Get current segment to check if it exists
  const { data: existing } = await supabase
    .from('bankroll_segments')
    .select('current_balance, initial_deposit')
    .eq('user_id', userId)
    .eq('segment_type', segmentType)
    .single();

  if (existing) {
    // Add initial deposit (from Adjust Bankroll modal) to the ledger-derived total
    const totalWithDeposits = segmentTotal + (existing.initial_deposit || 0);
    await supabase
      .from('bankroll_segments')
      .update({
        current_balance: totalWithDeposits,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('segment_type', segmentType);
  } else {
    // Create new segment
    await supabase.from('bankroll_segments').insert({
      user_id: userId,
      segment_type: segmentType,
      current_balance: segmentTotal,
      initial_deposit: 0,
    });
  }
}

/**
 * Create a new ledger entry
 */
export async function createLedgerEntry(
  userId: string,
  entry: Partial<LedgerEntry>
): Promise<LedgerEntry> {
  const { data, error } = await supabase
    .from('bankroll_ledger')
    .insert({
      user_id: userId,
      category: entry.category,
      location_id: entry.location_id,
      trip_id: entry.trip_id,
      entry_date: entry.entry_date || new Date().toISOString().split('T')[0],
      start_time: entry.start_time,
      end_time: entry.end_time,
      gross_in: entry.gross_in || 0,
      gross_out: entry.gross_out || 0,
      notes: entry.notes,
      media_urls: entry.media_urls,
      emotional_tag: entry.emotional_tag,
      stakes: entry.stakes,
      game_type: entry.game_type,
      tournament_name: entry.tournament_name,
      buy_in_amount: entry.buy_in_amount,
      finish_position: entry.finish_position,
      field_size: entry.field_size,
      casino_game: entry.casino_game,
      sport: entry.sport,
      bet_type: entry.bet_type,
      expense_type: entry.expense_type,
    })
    .select()
    .single();

  if (error) throw error;

  // Update the bankroll segment balance
  try {
    const segment = categoryToSegment(entry.category || 'poker_cash');
    await recalculateSegmentBalance(userId, segment);
  } catch (segError) {
    console.error('[Bankroll] Failed to update segment balance:', segError);
  }

  return data;
}

/**
 * Create a revision entry (for editing - original remains immutable)
 */
export async function createRevisionEntry(
  userId: string,
  originalEntryId: string,
  updates: Partial<LedgerEntry>,
  reason: string
): Promise<LedgerEntry> {
  // Fetch original entry
  const original = await fetchLedgerEntry(userId, originalEntryId);
  if (!original) throw new Error('Original entry not found');

  // Create revision with updated fields
  const { data, error } = await supabase
    .from('bankroll_ledger')
    .insert({
      ...original,
      ...updates,
      id: undefined, // Let Supabase generate new ID
      is_revision: true,
      original_entry_id: originalEntryId,
      revision_reason: reason,
      created_at: undefined, // Let Supabase set timestamp
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a ledger entry in-place
 */
export async function updateLedgerEntry(
  userId: string,
  entryId: string,
  updates: Partial<LedgerEntry>
): Promise<LedgerEntry> {
  // Remove fields that should not be updated
  const { id, user_id, created_at, ...safeUpdates } = updates as any;

  const { data, error } = await supabase
    .from('bankroll_ledger')
    .update(safeUpdates)
    .eq('id', entryId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;

  // Update the bankroll segment balance
  try {
    const segment = categoryToSegment(data.category || updates.category || 'poker_cash');
    await recalculateSegmentBalance(userId, segment);
  } catch (segError) {
    console.error('[Bankroll] Failed to update segment balance:', segError);
  }

  return data;
}

/**
 * Delete a ledger entry
 */
export async function deleteLedgerEntry(
  userId: string,
  entryId: string
): Promise<void> {
  const { error } = await supabase
    .from('bankroll_ledger')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Fetch user's trips (excludes deleted)
 */
export async function fetchTrips(userId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .select(
      `
      *,
      bankroll_locations(name)
    `
    )
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('start_date', { ascending: false });

  if (error) throw error;

  // Calculate totals for each trip
  const trips: Trip[] = [];
  for (const trip of data || []) {
    const { data: entries } = await supabase
      .from('bankroll_ledger')
      .select('net_result, category')
      .eq('user_id', userId)
      .eq('trip_id', trip.id)
      .eq('is_revision', false);

    let totalNet = 0;
    let totalExpenses = 0;

    entries?.forEach((e) => {
      if (e.category === 'expense') {
        totalExpenses += Math.abs(e.net_result || 0);
      } else {
        totalNet += e.net_result || 0;
      }
    });

    trips.push({
      ...trip,
      location_name: trip.bankroll_locations?.name || null,
      totalNet: totalNet - totalExpenses,
      totalExpenses,
      entryCount: entries?.length || 0,
    });
  }

  return trips;
}

/**
 * Get the user's currently active trip (only one allowed at a time)
 */
export async function getActiveTrip(userId: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .select(`*, bankroll_locations(name)`)
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Get entries for running totals
  const { data: entries } = await supabase
    .from('bankroll_ledger')
    .select('net_result, category')
    .eq('user_id', userId)
    .eq('trip_id', data.id)
    .eq('is_revision', false);

  let totalNet = 0;
  let totalExpenses = 0;
  const categoryBreakdown: Record<string, { count: number; net: number }> = {};

  entries?.forEach((e) => {
    const cat = e.category || 'other';
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { count: 0, net: 0 };
    categoryBreakdown[cat].count++;
    if (cat === 'expense') {
      totalExpenses += Math.abs(e.net_result || 0);
      categoryBreakdown[cat].net -= Math.abs(e.net_result || 0);
    } else {
      totalNet += e.net_result || 0;
      categoryBreakdown[cat].net += e.net_result || 0;
    }
  });

  return {
    ...data,
    location_name: data.bankroll_locations?.name || null,
    totalNet: totalNet - totalExpenses,
    totalExpenses,
    entryCount: entries?.length || 0,
    categoryBreakdown,
  };
}

/**
 * Create a new trip (enforces single-active-trip rule)
 */
export async function createTrip(
  userId: string,
  trip: Partial<Trip>
): Promise<Trip> {
  // Check for existing active trip
  const existing = await getActiveTrip(userId);
  if (existing) {
    throw new Error('You already have an active trip. Complete or delete it before starting a new one.');
  }

  const { data, error } = await supabase
    .from('bankroll_trips')
    .insert({
      user_id: userId,
      name: trip.name,
      location_id: trip.location_id,
      start_date: trip.start_date,
      end_date: trip.end_date,
      purpose: trip.purpose,
      notes: trip.notes,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Complete an active trip — sets status to 'completed' and end_date
 */
export async function completeTrip(userId: string, tripId: string): Promise<Trip> {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .update({
      status: 'completed',
      end_date: new Date().toISOString().split('T')[0],
    })
    .eq('user_id', userId)
    .eq('id', tripId)
    .eq('status', 'active')
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete an active trip — unlinks all entries and marks trip as deleted
 */
export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  // Unlink all entries from this trip
  await supabase
    .from('bankroll_ledger')
    .update({ trip_id: null })
    .eq('user_id', userId)
    .eq('trip_id', tripId);

  // Mark trip as deleted
  const { error } = await supabase
    .from('bankroll_trips')
    .update({ status: 'deleted' })
    .eq('user_id', userId)
    .eq('id', tripId);

  if (error) throw error;
}

/**
 * Get detailed trip report for a completed trip
 */
export async function getTripReport(userId: string, tripId: string) {
  // Get trip info
  const { data: trip, error: tripError } = await supabase
    .from('bankroll_trips')
    .select(`*, bankroll_locations(name)`)
    .eq('user_id', userId)
    .eq('id', tripId)
    .single();

  if (tripError) throw tripError;

  // Get all entries for this trip
  const { data: entries, error: entriesError } = await supabase
    .from('bankroll_ledger')
    .select('*')
    .eq('user_id', userId)
    .eq('trip_id', tripId)
    .eq('is_revision', false)
    .order('entry_date', { ascending: true });

  if (entriesError) throw entriesError;

  // Calculate stats
  let totalNet = 0;
  let totalExpenses = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let sessionCount = 0;
  const dailyBreakdown: Record<string, number> = {};
  const categoryBreakdown: Record<string, { count: number; net: number; grossIn: number; grossOut: number }> = {};

  (entries || []).forEach((e: any) => {
    const cat = e.category || 'other';
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { count: 0, net: 0, grossIn: 0, grossOut: 0 };
    categoryBreakdown[cat].count++;
    categoryBreakdown[cat].grossIn += e.gross_in || 0;
    categoryBreakdown[cat].grossOut += e.gross_out || 0;

    if (cat === 'expense') {
      totalExpenses += Math.abs(e.net_result || 0);
      categoryBreakdown[cat].net -= Math.abs(e.net_result || 0);
    } else {
      const net = e.net_result || 0;
      totalNet += net;
      categoryBreakdown[cat].net += net;
      sessionCount++;
      if (net > biggestWin) biggestWin = net;
      if (net < biggestLoss) biggestLoss = net;
    }

    // Daily breakdown
    const day = e.entry_date;
    dailyBreakdown[day] = (dailyBreakdown[day] || 0) + (e.net_result || 0);
  });

  const winCount = (entries || []).filter((e: any) => e.category !== 'expense' && (e.net_result || 0) > 0).length;
  const startDate = new Date(trip.start_date);
  const endDate = trip.end_date ? new Date(trip.end_date) : new Date();
  const durationDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    trip: {
      ...trip,
      location_name: trip.bankroll_locations?.name || null,
    },
    entries: entries || [],
    stats: {
      totalNet: totalNet - totalExpenses,
      totalExpenses,
      totalGrossNet: totalNet,
      sessionCount,
      entryCount: (entries || []).length,
      winRate: sessionCount > 0 ? Math.round((winCount / sessionCount) * 100) : 0,
      biggestWin,
      biggestLoss,
      durationDays,
      avgPerDay: durationDays > 0 ? Math.round((totalNet - totalExpenses) / durationDays) : 0,
      avgPerSession: sessionCount > 0 ? Math.round(totalNet / sessionCount) : 0,
    },
    categoryBreakdown,
    dailyBreakdown,
  };
}

/**
 * Fetch user's bankroll rules
 */
export async function fetchBankrollRules(userId: string): Promise<BankrollRule[]> {
  const { data, error } = await supabase
    .from('bankroll_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  return data || [];
}

/**
 * Update a bankroll rule
 */
export async function updateBankrollRule(
  userId: string,
  ruleType: string,
  value: number,
  isStrict: boolean = false
): Promise<BankrollRule> {
  const { data, error } = await supabase
    .from('bankroll_rules')
    .upsert({
      user_id: userId,
      rule_type: ruleType,
      value,
      is_strict: isStrict,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch unread alerts
 */
export async function fetchUnreadAlerts(userId: string): Promise<BankrollAlert[]> {
  const { data, error } = await supabase
    .from('bankroll_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Mark alert as read
 */
export async function markAlertRead(userId: string, alertId: string): Promise<void> {
  await supabase
    .from('bankroll_alerts')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('id', alertId);
}

/**
 * Dismiss an alert
 */
export async function dismissAlert(userId: string, alertId: string): Promise<void> {
  await supabase
    .from('bankroll_alerts')
    .update({ is_dismissed: true })
    .eq('user_id', userId)
    .eq('id', alertId);
}

/**
 * Create an alert
 */
export async function createAlert(
  userId: string,
  alertType: string,
  severity: number,
  title: string,
  message: string,
  data?: Record<string, unknown>,
  locationId?: string
): Promise<void> {
  await supabase.from('bankroll_alerts').insert({
    user_id: userId,
    alert_type: alertType,
    severity,
    title,
    message,
    data,
    location_id: locationId,
  });
}

/**
 * Initialize user's bankroll (call after signup)
 */
export async function initializeUserBankroll(userId: string): Promise<void> {
  // Create default segments
  const segments = ['poker', 'casino', 'sports', 'life'];
  for (const segment of segments) {
    await supabase.from('bankroll_segments').upsert({
      user_id: userId,
      segment_type: segment,
      current_balance: 0,
      initial_deposit: 0,
      is_read_only: segment === 'life',
    });
  }

  // Create default rules
  const defaultRules = [
    { rule_type: 'stop_loss_day', value: 1000 },
    { rule_type: 'max_buyin_percent', value: 5 },
  ];

  for (const rule of defaultRules) {
    await supabase.from('bankroll_rules').upsert({
      user_id: userId,
      rule_type: rule.rule_type,
      value: rule.value,
      is_active: true,
    });
  }
}

/**
 * Update segment balance
 */
export async function updateSegmentBalance(
  userId: string,
  segmentType: 'poker' | 'casino' | 'sports' | 'life',
  amount: number
): Promise<void> {
  const { data: current } = await supabase
    .from('bankroll_segments')
    .select('current_balance')
    .eq('user_id', userId)
    .eq('segment_type', segmentType)
    .single();

  const newBalance = (current?.current_balance || 0) + amount;

  await supabase
    .from('bankroll_segments')
    .update({
      current_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('segment_type', segmentType);
}

/**
 * Log a transfer between segments
 */
export async function logSegmentTransfer(
  userId: string,
  fromSegment: string,
  toSegment: string,
  amount: number,
  reason?: string
): Promise<void> {
  await supabase.from('bankroll_transfers').insert({
    user_id: userId,
    from_segment: fromSegment,
    to_segment: toSegment,
    amount,
    reason,
  });
}

/**
 * Check if user has set a starting bankroll
 */
export async function hasStartingBankroll(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bankroll_segments')
    .select('initial_deposit')
    .eq('user_id', userId)
    .neq('segment_type', 'life');

  if (!data || data.length === 0) return false;
  return data.some(seg => (seg.initial_deposit || 0) > 0);
}

/**
 * Set a user's starting bankroll (first-time setup)
 */
export async function setStartingBankroll(userId: string, amount: number): Promise<void> {
  // Ensure segments exist
  await initializeUserBankroll(userId);

  // Set the poker segment as the primary starting balance
  await supabase
    .from('bankroll_segments')
    .update({
      initial_deposit: amount,
      current_balance: amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('segment_type', 'poker');

  // Log as a ledger entry for audit trail
  await supabase.from('bankroll_ledger').insert({
    user_id: userId,
    category: 'deposit',
    entry_date: new Date().toISOString().split('T')[0],
    gross_in: amount,
    gross_out: 0,
    net_result: amount,
    notes: 'Starting bankroll',
    is_adjustment: true,
  });
}

/**
 * Adjust bankroll — deposit or withdraw from external sources
 * type: 'deposit' (adding money in) or 'withdrawal' (taking money out)
 */
export async function adjustBankroll(
  userId: string,
  amount: number,
  type: 'deposit' | 'withdrawal',
  reason?: string
): Promise<void> {
  const signedAmount = type === 'deposit' ? amount : -amount;

  // Update the poker segment balance
  const { data: current } = await supabase
    .from('bankroll_segments')
    .select('current_balance')
    .eq('user_id', userId)
    .eq('segment_type', 'poker')
    .single();

  const newBalance = (current?.current_balance || 0) + signedAmount;

  await supabase
    .from('bankroll_segments')
    .update({
      current_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('segment_type', 'poker');

  // Log as ledger entry for audit trail
  // gross_in = money put on table (buy-in), gross_out = money taken off (cashout)
  // deposit: money added to bankroll → gross_out (like cashing out from an ATM into your roll)
  // withdrawal: money removed from bankroll → gross_in (like buying in / spending)
  await supabase.from('bankroll_ledger').insert({
    user_id: userId,
    category: type,
    entry_date: new Date().toISOString().split('T')[0],
    gross_in: type === 'withdrawal' ? amount : 0,
    gross_out: type === 'deposit' ? amount : 0,
    net_result: signedAmount,
    notes: reason || (type === 'deposit' ? 'Bankroll deposit' : 'Bankroll withdrawal'),
    is_adjustment: true,
  });
}

/**
 * Get date range filter helpers
 */
export function getDateRangeFilter(range: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  let startDate: string;

  switch (range) {
    case 'Last 7 Days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      break;
    case 'Last 30 Days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      break;
    case 'Last 90 Days':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      break;
    case 'This Year':
      startDate = `${now.getFullYear()}-01-01`;
      break;
    case 'All Time':
    default:
      startDate = '2000-01-01';
  }

  return { startDate, endDate };
}
