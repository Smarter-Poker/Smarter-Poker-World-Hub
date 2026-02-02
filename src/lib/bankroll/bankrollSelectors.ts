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
  totalNet?: number;
  totalExpenses?: number;
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
 * Fetch user's trips
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
    });
  }

  return trips;
}

/**
 * Create a new trip
 */
export async function createTrip(
  userId: string,
  trip: Partial<Trip>
): Promise<Trip> {
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
    })
    .select()
    .single();

  if (error) throw error;
  return data;
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
