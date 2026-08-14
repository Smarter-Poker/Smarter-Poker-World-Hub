// @ts-nocheck
/**
 * BANKROLL DATA SELECTORS
 * Unified data access layer for bankroll management
 */

import { supabase } from '../supabase';
import { withRetry } from './retryUtils';

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
  tournament_type: string | null;
  buy_in_amount: number | null;
  finish_position: number | null;
  field_size: number | null;
  reentry_count: number | null;
  add_on_amount: number | null;
  bounties_collected: number | null;
  casino_game: string | null;
  slot_machine: string | null;
  sport: string | null;
  bet_type: string | null;
  odds: string | null;
  bet_result: string | null;
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
  status: string;
  trip_type?: string | null;
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
  data: unknown;
  is_read: boolean;
  is_dismissed?: boolean;
  created_at: string;
  [key: string]: unknown;
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
  return withRetry(async () => {
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
  });
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
    .maybeSingle();

  if (error || !data) return null;

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
    .maybeSingle();

  if (existing) {
    // Add initial deposit (from Adjust Bankroll modal) to the ledger-derived total
    const totalWithDeposits = segmentTotal + (existing.initial_deposit || 0);
    const { error: err_bankroll_segments_03601 } = await supabase
      .from('bankroll_segments')
      .update({
        current_balance: totalWithDeposits,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('segment_type', segmentType);
    if (err_bankroll_segments_03601) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_03601.message);
  } else {
    // Create new segment
    const { error: err_bankroll_segments_304z4 } = await supabase.from('bankroll_segments').insert({
      user_id: userId,
      segment_type: segmentType,
      current_balance: segmentTotal,
      initial_deposit: 0,
    });
    if (err_bankroll_segments_304z4) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_304z4.message);
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
      tournament_type: entry.tournament_type,
      buy_in_amount: entry.buy_in_amount,
      finish_position: entry.finish_position,
      field_size: entry.field_size,
      reentry_count: entry.reentry_count,
      add_on_amount: entry.add_on_amount,
      bounties_collected: entry.bounties_collected,
      casino_game: entry.casino_game,
      slot_machine: entry.slot_machine,
      sport: entry.sport,
      bet_type: entry.bet_type,
      odds: entry.odds,
      bet_result: entry.bet_result,
      expense_type: entry.expense_type,
    })
    .select()
    .maybeSingle();

  if (error) throw error;

  // Update the bankroll segment balance
  try {
    const segment = categoryToSegment(entry.category || 'poker_cash');
    await recalculateSegmentBalance(userId, segment);
  } catch (segError) {
    console.warn('[Bankroll] Failed to update segment balance:', segError);
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
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to create revision');
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
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to update ledger entry');

  // Update the bankroll segment balance
  try {
    const segment = categoryToSegment(data.category || updates.category || 'poker_cash');
    await recalculateSegmentBalance(userId, segment);
  } catch (segError) {
    console.warn('[Bankroll] Failed to update segment balance:', segError);
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
  return withRetry(async () => {
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
      .neq('trip_type', 'series')
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
  });
}

/**
 * Get the user's currently active trip (only one allowed at a time)
 */
export async function getActiveTrip(userId: string): Promise<Trip | null> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('bankroll_trips')
      .select(`*, bankroll_locations(name)`)
      .eq('user_id', userId)
      .eq('status', 'active')
      .neq('trip_type', 'series')
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
  });
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
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to create trip');
  return data;
}

/**
 * Update an existing trip's editable fields
 */
export async function updateTrip(
  userId: string,
  tripId: string,
  updates: Partial<Trip>
): Promise<Trip> {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .update({
      name: updates.name,
      location_id: updates.location_id,
      purpose: updates.purpose,
      notes: updates.notes,
    })
    .eq('user_id', userId)
    .eq('id', tripId)
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to update trip');
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
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to complete trip');
  return data;
}

/**
 * Delete an active trip — unlinks all entries and marks trip as deleted
 */
export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  // Unlink all entries from this trip
  const { error: err_bankroll_ledger_gc1j7 } = await supabase
    .from('bankroll_ledger')
    .update({ trip_id: null })
    .eq('user_id', userId)
    .eq('trip_id', tripId);
  if (err_bankroll_ledger_gc1j7) console.warn('[Supabase] Silent mutation failed in bankroll_ledger:', err_bankroll_ledger_gc1j7.message);

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
    .maybeSingle();

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

// ═══════════════════════════════════════════════════════════
//  SERIES FUNCTIONS — mirror trip functions with trip_type='series'
// ═══════════════════════════════════════════════════════════

export async function fetchSeries(userId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .select(`*, bankroll_locations(name)`)
    .eq('user_id', userId)
    .eq('trip_type', 'series')
    .neq('status', 'deleted')
    .order('start_date', { ascending: false });

  if (error) throw error;

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

export async function getActiveSeries(userId: string): Promise<Trip | null> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('bankroll_trips')
      .select(`*, bankroll_locations(name)`)
      .eq('user_id', userId)
      .eq('trip_type', 'series')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

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
  });
}

export async function createSeries(
  userId: string,
  series: Partial<Trip>
): Promise<Trip> {
  const existing = await getActiveSeries(userId);
  if (existing) {
    throw new Error('You already have an active series. Complete or delete it before starting a new one.');
  }

  const { data, error } = await supabase
    .from('bankroll_trips')
    .insert({
      user_id: userId,
      name: series.name,
      location_id: series.location_id || null,
      start_date: series.start_date || null,
      end_date: series.end_date || null,
      purpose: series.purpose || null,
      notes: series.notes || null,
      status: 'active',
      trip_type: 'series',
    })
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to create series');
  return data;
}

export async function updateSeries(
  userId: string,
  seriesId: string,
  updates: Partial<Trip>
): Promise<Trip> {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .update({
      name: updates.name,
      location_id: updates.location_id,
      purpose: updates.purpose,
      notes: updates.notes,
      end_date: updates.end_date,
    })
    .eq('user_id', userId)
    .eq('id', seriesId)
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to update series');
  return data;
}

export async function completeSeries(userId: string, seriesId: string): Promise<Trip> {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .update({
      status: 'completed',
      end_date: new Date().toISOString().split('T')[0],
    })
    .eq('user_id', userId)
    .eq('id', seriesId)
    .eq('status', 'active')
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to complete series');
  return data;
}

export async function deleteSeries(userId: string, seriesId: string): Promise<void> {
  const { error: err_bankroll_ledger_loq06 } = await supabase
    .from('bankroll_ledger')
    .update({ trip_id: null })
    .eq('user_id', userId)
    .eq('trip_id', seriesId);
  if (err_bankroll_ledger_loq06) console.warn('[Supabase] Silent mutation failed in bankroll_ledger:', err_bankroll_ledger_loq06.message);

  const { error } = await supabase
    .from('bankroll_trips')
    .update({ status: 'deleted' })
    .eq('user_id', userId)
    .eq('id', seriesId);

  if (error) throw error;
}

export async function getSeriesReport(userId: string, seriesId: string) {
  return getTripReport(userId, seriesId);
}

/**
 * Fetch user's bankroll rules
 */
export async function fetchBankrollRules(userId: string): Promise<BankrollRule[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('bankroll_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  });
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
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to create alert');
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
  const { error: err_bankroll_alerts_lyies } = await supabase
    .from('bankroll_alerts')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('id', alertId);
  if (err_bankroll_alerts_lyies) console.warn('[Supabase] Silent mutation failed in bankroll_alerts:', err_bankroll_alerts_lyies.message);
}

/**
 * Dismiss an alert
 */
export async function dismissAlert(userId: string, alertId: string): Promise<void> {
  const { error: err_bankroll_alerts_15ab5 } = await supabase
    .from('bankroll_alerts')
    .update({ is_dismissed: true })
    .eq('user_id', userId)
    .eq('id', alertId);
  if (err_bankroll_alerts_15ab5) console.warn('[Supabase] Silent mutation failed in bankroll_alerts:', err_bankroll_alerts_15ab5.message);
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
  const { error: err_bankroll_alerts_l7trq } = await supabase.from('bankroll_alerts').insert({
    user_id: userId,
    alert_type: alertType,
    severity,
    title,
    message,
    data,
    location_id: locationId,
  });
  if (err_bankroll_alerts_l7trq) console.warn('[Supabase] Silent mutation failed in bankroll_alerts:', err_bankroll_alerts_l7trq.message);
}

/**
 * Initialize user's bankroll (call after signup)
 */
export async function initializeUserBankroll(userId: string): Promise<void> {
  // Create default segments
  const segments = ['poker', 'casino', 'sports', 'life'];
  for (const segment of segments) {
    const { error: err_bankroll_segments_gtceu } = await supabase.from('bankroll_segments').upsert({
      user_id: userId,
      segment_type: segment,
      current_balance: 0,
      initial_deposit: 0,
      is_read_only: segment === 'life',
    });
    if (err_bankroll_segments_gtceu) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_gtceu.message);
  }

  // Create default rules
  const defaultRules = [
    { rule_type: 'stop_loss_day', value: 1000 },
    { rule_type: 'max_buyin_percent', value: 5 },
  ];

  for (const rule of defaultRules) {
    const { error: err_bankroll_rules_t1in3 } = await supabase.from('bankroll_rules').upsert({
      user_id: userId,
      rule_type: rule.rule_type,
      value: rule.value,
      is_active: true,
    });
    if (err_bankroll_rules_t1in3) console.warn('[Supabase] Silent mutation failed in bankroll_rules:', err_bankroll_rules_t1in3.message);
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
    .maybeSingle();

  const newBalance = (current?.current_balance || 0) + amount;

  const { error: err_bankroll_segments_pl9cn } = await supabase

    .from('bankroll_segments')

    .update({
      current_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('segment_type', segmentType);

  if (err_bankroll_segments_pl9cn) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_pl9cn.message);
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
  const { error: err_bankroll_transfers_5oti3 } = await supabase.from('bankroll_transfers').insert({
    user_id: userId,
    from_segment: fromSegment,
    to_segment: toSegment,
    amount,
    reason,
  });
  if (err_bankroll_transfers_5oti3) console.warn('[Supabase] Silent mutation failed in bankroll_transfers:', err_bankroll_transfers_5oti3.message);
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
  const { error: err_bankroll_segments_wwjic } = await supabase
    .from('bankroll_segments')
    .update({
      initial_deposit: amount,
      current_balance: amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('segment_type', 'poker');
  if (err_bankroll_segments_wwjic) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_wwjic.message);

  // Log as a ledger entry for audit trail
  const { error: err_bankroll_ledger_7o3ix } = await supabase.from('bankroll_ledger').insert({
    user_id: userId,
    category: 'deposit',
    entry_date: new Date().toISOString().split('T')[0],
    gross_in: amount,
    gross_out: 0,
    net_result: amount,
    // CHECK 13 (2026-08-14): is_adjustment is not a column — its presence made
    // the whole insert 42703 (warn swallowed), so the "Starting bankroll"
    // audit-trail entry was never written. category 'deposit' already marks it.
    notes: 'Starting bankroll',
  });
  if (err_bankroll_ledger_7o3ix) console.warn('[Supabase] Silent mutation failed in bankroll_ledger:', err_bankroll_ledger_7o3ix.message);
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
  const { data: current, error: fetchErr } = await supabase
    .from('bankroll_segments')
    .select('current_balance')
    .eq('user_id', userId)
    .eq('segment_type', 'poker')
    .maybeSingle();

  if (fetchErr) {
    console.warn('[adjustBankroll] Failed to fetch segment:', fetchErr);
    throw new Error('Failed to read current balance');
  }

  const newBalance = (current?.current_balance || 0) + signedAmount;

  const { error: updateErr } = await supabase
    .from('bankroll_segments')
    .update({
      current_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('segment_type', 'poker');

  if (updateErr) {
    console.warn('[adjustBankroll] Failed to update segment:', updateErr);
    throw new Error('Failed to update balance');
  }

  // Log as ledger entry for audit trail
  // gross_in = money put on table (buy-in), gross_out = money taken off (cashout)
  // deposit: money added to bankroll → gross_out (like cashing out from an ATM into your roll)
  // withdrawal: money removed from bankroll → gross_in (like buying in / spending)
  // NOTE: net_result is a generated column (gross_out - gross_in), do NOT insert it explicitly
  const { error: insertErr } = await supabase.from('bankroll_ledger').insert({
    user_id: userId,
    category: type,
    entry_date: new Date().toISOString().split('T')[0],
    gross_in: type === 'withdrawal' ? amount : 0,
    gross_out: type === 'deposit' ? amount : 0,
    notes: reason || (type === 'deposit' ? 'Bankroll deposit' : 'Bankroll withdrawal'),
  });

  if (insertErr) {
    console.warn('[adjustBankroll] Failed to insert ledger entry:', insertErr);
    // Try to rollback the segment update
    const { error: err_bankroll_segments_m2q4f } = await supabase
      .from('bankroll_segments')
      .update({
        current_balance: current?.current_balance || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('segment_type', 'poker');
    if (err_bankroll_segments_m2q4f) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_m2q4f.message);
    throw new Error('Failed to record adjustment');
  }
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

// ═══════════════════════════════════════════════════════════
//  STAKING ARRANGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════

export interface StakingArrangement {
  id: string;
  user_id: string;
  backer_name: string;
  backer_email: string | null;
  backer_phone: string | null;
  split_percentage: number;
  markup_percentage: number;
  starting_makeup: number;
  current_makeup: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StakingSession {
  id: string;
  arrangement_id: string;
  ledger_entry_id: string;
  gross_result: number;
  player_share: number;
  backer_share: number;
  makeup_before: number;
  makeup_after: number;
  created_at: string;
}

/** Fetch all staking arrangements for a user */
export async function fetchStakingArrangements(userId: string): Promise<StakingArrangement[]> {
  const { data, error } = await supabase
    .from('staking_arrangements')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as StakingArrangement[];
}

/** Create a new staking arrangement */
export async function createStakingArrangement(
  userId: string,
  arrangement: Partial<StakingArrangement>
): Promise<StakingArrangement> {
  const { data, error } = await supabase
    .from('staking_arrangements')
    .insert({
      user_id: userId,
      backer_name: arrangement.backer_name,
      backer_email: arrangement.backer_email || null,
      backer_phone: arrangement.backer_phone || null,
      split_percentage: arrangement.split_percentage || 50,
      markup_percentage: arrangement.markup_percentage || 0,
      starting_makeup: arrangement.starting_makeup || 0,
      current_makeup: arrangement.starting_makeup || 0,
      start_date: arrangement.start_date || new Date().toISOString().split('T')[0],
      end_date: arrangement.end_date || null,
      is_active: true,
      notes: arrangement.notes || null,
    })
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to create staking arrangement');
  return data as StakingArrangement;
}

/** Update a staking arrangement */
export async function updateStakingArrangement(
  id: string,
  updates: Partial<StakingArrangement>
): Promise<StakingArrangement> {
  const { data, error } = await supabase
    .from('staking_arrangements')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to update staking arrangement');
  return data as StakingArrangement;
}

/** Delete a staking arrangement */
export async function deleteStakingArrangement(id: string): Promise<void> {
  const { error } = await supabase
    .from('staking_arrangements')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** Deactivate all arrangements for a user (before activating a new one) */
export async function deactivateAllArrangements(userId: string): Promise<void> {
  const { error } = await supabase
    .from('staking_arrangements')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
}

/** Fetch staking sessions for an arrangement */
export async function fetchStakingSessions(arrangementId: string): Promise<StakingSession[]> {
  const { data, error } = await supabase
    .from('staking_sessions')
    .select('*')
    .eq('arrangement_id', arrangementId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as StakingSession[];
}

/** Create a staking session (link a ledger entry to an arrangement with calculated splits) */
export async function createStakingSession(
  session: {
    arrangement_id: string;
    ledger_entry_id: string;
    gross_result: number;
    split_percentage: number;
    current_makeup?: number;
  }
): Promise<StakingSession> {
  const { arrangement_id, ledger_entry_id, gross_result, split_percentage, current_makeup = 0 } = session;

  // Calculate shares
  const playerPct = split_percentage / 100;
  const backerPct = 1 - playerPct;

  let playerShare: number;
  let backerShare: number;
  const makeupBefore = current_makeup;
  let makeupAfter = current_makeup;

  if (gross_result > 0) {
    // Winning session — pay off makeup first, then split profits
    if (current_makeup > 0) {
      // Player is in makeup — profits go to reduce it
      const makeupPayoff = Math.min(gross_result, current_makeup);
      const remaining = gross_result - makeupPayoff;
      playerShare = remaining * playerPct;
      backerShare = remaining * backerPct + makeupPayoff;
      makeupAfter = current_makeup - makeupPayoff;
    } else {
      playerShare = gross_result * playerPct;
      backerShare = gross_result * backerPct;
    }
  } else {
    // Losing session — backer covers it, adds to makeup
    playerShare = 0;
    backerShare = gross_result; // backer absorbs the loss
    makeupAfter = current_makeup + Math.abs(gross_result);
  }

  const { data, error } = await supabase
    .from('staking_sessions')
    .insert({
      arrangement_id,
      ledger_entry_id,
      gross_result,
      player_share: Math.round(playerShare * 100) / 100,
      backer_share: Math.round(backerShare * 100) / 100,
      makeup_before: Math.round(makeupBefore * 100) / 100,
      makeup_after: Math.round(makeupAfter * 100) / 100,
    })
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to record staking session');

  // Update the arrangement's current_makeup
  const { error: err_staking_arrangements_fheez } = await supabase
    .from('staking_arrangements')
    .update({ current_makeup: Math.round(makeupAfter * 100) / 100, updated_at: new Date().toISOString() })
    .eq('id', arrangement_id);
  if (err_staking_arrangements_fheez) console.warn('[Supabase] Silent mutation failed in staking_arrangements:', err_staking_arrangements_fheez.message);

  return data as StakingSession;
}

/** Get aggregated staking stats for an arrangement */
export async function getStakingStats(arrangementId: string): Promise<{
  totalGrossResult: number;
  playerShare: number;
  backerShare: number;
  sessionCount: number;
}> {
  const { data, error } = await supabase
    .from('staking_sessions')
    .select('gross_result, player_share, backer_share')
    .eq('arrangement_id', arrangementId);

  if (error) throw error;

  const sessions = data || [];
  return {
    totalGrossResult: sessions.reduce((sum, s) => sum + (s.gross_result || 0), 0),
    playerShare: sessions.reduce((sum, s) => sum + (s.player_share || 0), 0),
    backerShare: sessions.reduce((sum, s) => sum + (s.backer_share || 0), 0),
    sessionCount: sessions.length,
  };
}
