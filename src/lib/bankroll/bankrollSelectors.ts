// @ts-nocheck
/**
 * BANKROLL DATA SELECTORS
 * Unified data access layer for bankroll management
 */

import { supabase } from '../supabase';
import { withRetry } from './retryUtils';
import {
  BANKROLL_RULE_CREATE_ONLY,
  BANKROLL_RULE_UPSERT,
  BANKROLL_SEGMENT_CREATE_ONLY,
} from './naturalKeys.mjs';
import { RECEIPT_UNASSIGN } from './receiptGallery.mjs';
import { localDay, localDayOffset } from './localDates.mjs';
import {
  linkableStakingEntries,
  replayStakingDeal,
  splitStakingSession,
  stakingRowsToRewrite,
} from './stakingMath.mjs';
import { bankrollBalanceCents, centsToDollars, toCents } from './ledgerMath.mjs';
import {
  buildTripReport,
  cleanDay,
  completionEndDate,
  dateRangeProblem,
  summarizeByTrip,
  withTripTotals,
} from './tripMath.mjs';

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
  sessionCount?: number;
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
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

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

// Reports and charts use real ledger rows across the complete selected range.
// The Recent Activity presentation may collapse a trip into a single item.
export async function fetchReportLedger(
  userId: string,
  filters: Omit<LedgerFilters, 'limit' | 'offset'>
): Promise<LedgerEntry[]> {
  const limit = 500;
  const entries: LedgerEntry[] = [];
  for (let offset = 0; ; offset += limit) {
    const rows = await fetchLedgerEntries(userId, { ...filters, limit, offset });
    entries.push(...rows);
    if (rows.length < limit) return entries;
  }
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
    case 'deposit':
    case 'withdrawal':
      return 'poker'; // Adjust Bankroll moves money in and out of the poker segment
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
      // Adjust Bankroll deposits and withdrawals land on the poker segment.
      categories = ['poker_cash', 'poker_mtt', 'expense', 'deposit', 'withdrawal'];
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

  const segmentCents = bankrollBalanceCents(entries || [], []);

  // Make sure the segment row exists without racing a concurrent creator: a
  // select-then-insert pair lost that race and hit the (user_id, segment_type)
  // unique key. ON CONFLICT DO NOTHING on the natural key is idempotent.
  const { error: err_bankroll_segments_304z4 } = await supabase
    .from('bankroll_segments')
    .upsert(
      { user_id: userId, segment_type: segmentType, current_balance: 0, initial_deposit: 0 },
      BANKROLL_SEGMENT_CREATE_ONLY,
    );
  if (err_bankroll_segments_304z4) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_304z4.message);

  const { data: existing } = await supabase
    .from('bankroll_segments')
    .select('initial_deposit')
    .eq('user_id', userId)
    .eq('segment_type', segmentType)
    .maybeSingle();

  // Add initial deposit (from Adjust Bankroll modal) to the ledger-derived total
  const totalWithDeposits = centsToDollars(segmentCents + toCents(existing?.initial_deposit));
  const { error: err_bankroll_segments_03601 } = await supabase
    .from('bankroll_segments')
    .update({
      current_balance: totalWithDeposits,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('segment_type', segmentType);
  if (err_bankroll_segments_03601) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_03601.message);
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
      entry_date: entry.entry_date || localDay(),
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
  // A delete that matched nothing (already gone, or not this player's) used to
  // report "Entry Deleted". Ask for the removed row back and say so if none.
  const { data, error } = await supabase
    .from('bankroll_ledger')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)
    .select('id, category');

  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Entry Not Found');

  // A receipt filed to this entry would otherwise stay `assigned` to a row that
  // no longer exists: listed nowhere, assignable from nowhere. Dan's rule
  // (2026-09-08) is that a scanned receipt is never abandoned, so it goes back
  // to Receipts Waiting. The entry is already gone, so a failure here is
  // reported, not thrown.
  const { error: receiptError } = await supabase
    .from('bankroll_receipts')
    .update(RECEIPT_UNASSIGN)
    .eq('user_id', userId)
    .eq('assigned_id', entryId);
  if (receiptError) console.warn('[Bankroll] Receipt not returned to Receipts Waiting:', receiptError.message);

  try {
    await recalculateSegmentBalance(userId, categoryToSegment(data[0].category || 'poker_cash'));
  } catch (segError) {
    console.warn('[Bankroll] Failed to update segment balance:', segError);
  }
}

// Trip and series rows in bankroll_trips share these helpers; trip_type tells
// them apart ('trip' by default, 'series' for the Series Tracker). Totals come
// from tripMath.mjs so the tracker, the report and Recent Activity agree.

const TRIP_ENTRY_COLUMNS = 'id, trip_id, category, gross_in, gross_out, net_result, entry_date, expense_type';

/**
 * Ledger rows for many trips in one query (was one query per trip). A failed
 * read throws: showing a trip at $0 because its rows did not load would be a lie.
 */
const TRIP_ID_BATCH = 100;

async function fetchTripEntryRows(userId: string, tripIds: string[]) {
  const rows = [];
  for (let start = 0; start < tripIds.length; start += TRIP_ID_BATCH) {
    const { data, error } = await supabase
      .from('bankroll_ledger')
      .select(TRIP_ENTRY_COLUMNS)
      .eq('user_id', userId)
      .eq('is_revision', false)
      .in('trip_id', tripIds.slice(start, start + TRIP_ID_BATCH));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function listTripsOfType(userId: string, tripType: 'trip' | 'series'): Promise<Trip[]> {
  let query = supabase
    .from('bankroll_trips')
    .select(`*, bankroll_locations(name)`)
    .eq('user_id', userId)
    .neq('status', 'deleted');
  query = tripType === 'series' ? query.eq('trip_type', 'series') : query.neq('trip_type', 'series');
  const { data, error } = await query.order('start_date', { ascending: false });
  if (error) throw error;
  const trips = data || [];
  const rows = await fetchTripEntryRows(userId, trips.map((t) => t.id));
  return withTripTotals(trips, summarizeByTrip(rows));
}

async function activeTripOfType(userId: string, tripType: 'trip' | 'series'): Promise<Trip | null> {
  let query = supabase
    .from('bankroll_trips')
    .select(`*, bankroll_locations(name)`)
    .eq('user_id', userId)
    .eq('status', 'active');
  query = tripType === 'series' ? query.eq('trip_type', 'series') : query.neq('trip_type', 'series');
  const { data, error } = await query.order('start_date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rows = await fetchTripEntryRows(userId, [data.id]);
  return withTripTotals([data], summarizeByTrip(rows))[0];
}

async function readTripRow(userId: string, tripId: string) {
  const { data, error } = await supabase
    .from('bankroll_trips')
    .select('id, start_date, end_date, status, trip_type')
    .eq('user_id', userId)
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Trip not found');
  return data;
}

async function completeTripRow(userId: string, tripId: string, label: string): Promise<Trip> {
  const row = await readTripRow(userId, tripId);
  const { data, error } = await supabase
    .from('bankroll_trips')
    .update({ status: 'completed', end_date: completionEndDate(row.start_date, localDay()) })
    .eq('user_id', userId)
    .eq('id', tripId)
    .eq('status', 'active')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`This ${label} is no longer active`);
  return data;
}

async function reopenTripRow(userId: string, tripId: string, tripType: 'trip' | 'series'): Promise<Trip> {
  const label = tripType === 'series' ? 'series' : 'trip';
  const existing = await activeTripOfType(userId, tripType);
  if (existing && existing.id !== tripId) {
    throw new Error(`You already have an active ${label}. Complete it before reopening another.`);
  }
  const { data, error } = await supabase
    .from('bankroll_trips')
    .update({ status: 'active', end_date: null })
    .eq('user_id', userId)
    .eq('id', tripId)
    .eq('status', 'completed')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`This ${label} is not completed`);
  return data;
}

async function deleteTripRow(userId: string, tripId: string): Promise<void> {
  // Unlink first, and stop if that fails: a deleted trip must not keep rows
  // that the dashboard would then hide or group under a trip nobody can open.
  const { error: unlinkError } = await supabase
    .from('bankroll_ledger')
    .update({ trip_id: null })
    .eq('user_id', userId)
    .eq('trip_id', tripId);
  if (unlinkError) throw unlinkError;

  const { error } = await supabase
    .from('bankroll_trips')
    .update({ status: 'deleted' })
    .eq('user_id', userId)
    .eq('id', tripId);
  if (error) throw error;
}

/**
 * Fetch user's trips (excludes deleted and series)
 */
export async function fetchTrips(userId: string): Promise<Trip[]> {
  return withRetry(() => listTripsOfType(userId, 'trip'));
}

/**
 * Get the user's currently active trip (only one allowed at a time)
 */
export async function getActiveTrip(userId: string): Promise<Trip | null> {
  return withRetry(() => activeTripOfType(userId, 'trip'));
}

/**
 * Create a new trip (enforces single-active-trip rule)
 */
export async function createTrip(
  userId: string,
  trip: Partial<Trip>
): Promise<Trip> {
  const existing = await getActiveTrip(userId);
  if (existing) {
    throw new Error('You already have an active trip. Complete or delete it before starting a new one.');
  }
  const startDate = cleanDay(trip.start_date) || localDay();
  const endDate = cleanDay(trip.end_date);
  const rangeProblem = dateRangeProblem(startDate, endDate);
  if (rangeProblem) throw new Error(rangeProblem);

  const { data, error } = await supabase
    .from('bankroll_trips')
    .insert({
      user_id: userId,
      name: trip.name,
      location_id: trip.location_id || null,
      start_date: startDate,
      end_date: endDate,
      purpose: trip.purpose || null,
      notes: trip.notes || null,
      status: 'active',
      trip_type: 'trip',
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
      location_id: updates.location_id || null,
      purpose: updates.purpose || null,
      notes: updates.notes || null,
    })
    .eq('user_id', userId)
    .eq('id', tripId)
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to update trip');
  return data;
}

/**
 * Complete an active trip: status 'completed', end date = today in the
 * player's own calendar (never before the start date).
 */
export async function completeTrip(userId: string, tripId: string): Promise<Trip> {
  return completeTripRow(userId, tripId, 'trip');
}

/** Reopen a completed trip (allowed only when no other trip is active). */
export async function reopenTrip(userId: string, tripId: string): Promise<Trip> {
  return reopenTripRow(userId, tripId, 'trip');
}

/**
 * Delete an active trip — unlinks all entries and marks trip as deleted
 */
export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  return deleteTripRow(userId, tripId);
}

/**
 * Detailed report for a trip or series (see buildTripReport).
 */
export async function getTripReport(userId: string, tripId: string) {
  const { data: trip, error: tripError } = await supabase
    .from('bankroll_trips')
    .select(`*, bankroll_locations(name)`)
    .eq('user_id', userId)
    .eq('id', tripId)
    .maybeSingle();

  if (tripError) throw tripError;
  if (!trip) throw new Error('Trip not found');

  const { data: entries, error: entriesError } = await supabase
    .from('bankroll_ledger')
    .select('*')
    .eq('user_id', userId)
    .eq('trip_id', tripId)
    .eq('is_revision', false)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (entriesError) throw entriesError;
  return buildTripReport(trip, entries || [], localDay());
}

// ═══════════════════════════════════════════════════════════
//  SERIES FUNCTIONS — mirror trip functions with trip_type='series'
// ═══════════════════════════════════════════════════════════

export async function fetchSeries(userId: string): Promise<Trip[]> {
  return withRetry(() => listTripsOfType(userId, 'series'));
}

export async function getActiveSeries(userId: string): Promise<Trip | null> {
  return withRetry(() => activeTripOfType(userId, 'series'));
}

export async function createSeries(
  userId: string,
  series: Partial<Trip>
): Promise<Trip> {
  const existing = await getActiveSeries(userId);
  if (existing) {
    throw new Error('You already have an active series. Complete or delete it before starting a new one.');
  }
  // start_date is NOT NULL in bankroll_trips: a blank date field used to be
  // sent as null and the insert failed with a raw database error.
  const startDate = cleanDay(series.start_date) || localDay();
  const endDate = cleanDay(series.end_date);
  const rangeProblem = dateRangeProblem(startDate, endDate);
  if (rangeProblem) throw new Error(rangeProblem);

  const { data, error } = await supabase
    .from('bankroll_trips')
    .insert({
      user_id: userId,
      name: series.name,
      location_id: series.location_id || null,
      start_date: startDate,
      end_date: endDate,
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
  // A cleared end date arrives as '' from the form; Postgres rejects '' as a date.
  const endDate = cleanDay(updates.end_date);
  if (endDate) {
    const row = await readTripRow(userId, seriesId);
    const rangeProblem = dateRangeProblem(row.start_date, endDate);
    if (rangeProblem) throw new Error(rangeProblem);
  }
  const { data, error } = await supabase
    .from('bankroll_trips')
    .update({
      name: updates.name,
      location_id: updates.location_id || null,
      purpose: updates.purpose || null,
      notes: updates.notes || null,
      end_date: endDate,
    })
    .eq('user_id', userId)
    .eq('id', seriesId)
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('Failed to update series');
  return data;
}

export async function completeSeries(userId: string, seriesId: string): Promise<Trip> {
  return completeTripRow(userId, seriesId, 'series');
}

/** Reopen a completed series (allowed only when no other series is active). */
export async function reopenSeries(userId: string, seriesId: string): Promise<Trip> {
  return reopenTripRow(userId, seriesId, 'series');
}

export async function deleteSeries(userId: string, seriesId: string): Promise<void> {
  return deleteTripRow(userId, seriesId);
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
    }, BANKROLL_RULE_UPSERT)
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
  // Runs on every Bankroll Manager open, so it must only CREATE what is
  // missing. An upsert without onConflict targets the primary key ("id"), which
  // these payloads never carry, so every returning user hit the
  // (user_id, segment_type) / (user_id, rule_type) unique key (193 + 96
  // refusals a day). Had it merged instead, it would have reset every balance
  // and rule to the defaults. Conflict on the natural key and DO NOTHING.
  const segments = ['poker', 'casino', 'sports', 'life'];
  const { error: err_bankroll_segments_gtceu } = await supabase.from('bankroll_segments').upsert(
    segments.map((segment) => ({
      user_id: userId,
      segment_type: segment,
      current_balance: 0,
      initial_deposit: 0,
      is_read_only: segment === 'life',
    })),
    BANKROLL_SEGMENT_CREATE_ONLY,
  );
  if (err_bankroll_segments_gtceu) console.warn('[Supabase] Silent mutation failed in bankroll_segments:', err_bankroll_segments_gtceu.message);

  // Create default rules
  const defaultRules = [
    { rule_type: 'stop_loss_day', value: 1000 },
    { rule_type: 'max_buyin_percent', value: 5 },
  ];

  const { error: err_bankroll_rules_t1in3 } = await supabase.from('bankroll_rules').upsert(
    defaultRules.map((rule) => ({
      user_id: userId,
      rule_type: rule.rule_type,
      value: rule.value,
      is_active: true,
    })),
    BANKROLL_RULE_CREATE_ONLY,
  );
  if (err_bankroll_rules_t1in3) console.warn('[Supabase] Silent mutation failed in bankroll_rules:', err_bankroll_rules_t1in3.message);
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

  // No ledger row: the starting bankroll is initial_deposit, and the Bankroll
  // Balance adds every deposit row to it, so a "Starting bankroll" deposit row
  // would count the same money twice. (The insert that used to sit here named
  // the generated net_result column and was refused on every call, so no such
  // row was ever written; the balance never depended on one.)
}

/**
 * Adjust bankroll: deposit or withdraw money from outside the game.
 *
 * The ledger row IS the adjustment. The Bankroll Balance tile adds every
 * deposit and subtracts every withdrawal (calculateTotalBankroll), and the
 * poker segment's stored balance is recomputed from the same rows. Until
 * 2026-11-27 this read-modify-wrote current_balance (which nothing displays and
 * the next logged session overwrote) while the balance tile skipped deposit
 * and withdrawal rows, so an adjustment changed nothing the player could see.
 * The row is dated on the player's own calendar day, not the UTC one.
 */
export async function adjustBankroll(
  userId: string,
  amount: number,
  type: 'deposit' | 'withdrawal',
  reason?: string
): Promise<void> {
  if (type !== 'deposit' && type !== 'withdrawal') throw new Error('Choose Deposit Or Withdraw');
  const cents = toCents(amount);
  if (!(cents > 0)) throw new Error('Enter An Amount Greater Than $0');
  const value = centsToDollars(cents);

  // gross_out = money into the roll, gross_in = money out of it, so the
  // generated net_result (gross_out - gross_in) carries the sign. net_result
  // is a generated column and must never be inserted.
  const { error: insertErr } = await supabase.from('bankroll_ledger').insert({
    user_id: userId,
    category: type,
    entry_date: localDay(),
    gross_in: type === 'withdrawal' ? value : 0,
    gross_out: type === 'deposit' ? value : 0,
    notes: (reason || '').trim() || (type === 'deposit' ? 'Bankroll deposit' : 'Bankroll withdrawal'),
  });

  if (insertErr) {
    console.warn('[adjustBankroll] Failed to insert ledger entry:', insertErr);
    throw new Error('Failed To Record Adjustment');
  }

  try {
    await recalculateSegmentBalance(userId, 'poker');
  } catch (segError) {
    console.warn('[Bankroll] Failed to update segment balance:', segError);
  }
}

/**
 * Get date range filter helpers
 */
export function getDateRangeFilter(range: string): { startDate: string; endDate: string } {
  // Calendar days in the player's own time zone, inclusive of today: entry_date
  // is recorded locally, and the UTC date is already tomorrow every evening in
  // the Americas. "Last 7 Days" is today plus the six days before it.
  const endDate = localDay();
  let startDate: string;

  switch (range) {
    case 'Last 7 Days':
      startDate = localDayOffset(6);
      break;
    case 'Last 30 Days':
      startDate = localDayOffset(29);
      break;
    case 'Last 90 Days':
      startDate = localDayOffset(89);
      break;
    case 'This Year':
      startDate = endDate.slice(0, 4) + '-01-01';
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
      split_percentage: arrangement.split_percentage ?? 50,
      markup_percentage: arrangement.markup_percentage || 0,
      starting_makeup: arrangement.starting_makeup || 0,
      current_makeup: arrangement.starting_makeup || 0,
      start_date: arrangement.start_date || localDay(),
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

/** Ledger entry ids already linked to ANY of the user's deals (a session is staked once). */
async function fetchLinkedLedgerIds(arrangementIds: string[]): Promise<Set<string>> {
  if (!arrangementIds.length) return new Set();
  const { data, error } = await supabase
    .from('staking_sessions')
    .select('ledger_entry_id')
    // in-list: bounded by one player's own staking deals
    .in('arrangement_id', arrangementIds);
  if (error) throw error;
  return new Set((data || []).map((row: any) => row.ledger_entry_id));
}

/** The ledger rows behind a deal's linked sessions (date, game, current result). */
async function fetchLedgerRowsById(userId: string, ids: string[]): Promise<Map<string, any>> {
  const byId = new Map<string, any>();
  if (!ids.length) return byId;
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await supabase
      .from('bankroll_ledger')
      .select('id, entry_date, start_time, category, net_result, gross_in, gross_out, stakes, tournament_name')
      .eq('user_id', userId)
      .in('id', ids.slice(start, start + 100));
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }
  return byId;
}

export interface StakingDeal {
  sessions: (StakingSession & { entry_date?: string; category?: string })[];
  totals: { totalGrossResult: number; playerShare: number; backerShare: number; sessionCount: number };
  currentMakeup: number;
  linkable: LedgerEntry[];
  syncFailed: boolean;
}

/**
 * Load a deal and replay it in the order the sessions were played, using each
 * ledger entry's CURRENT result (an edited session updates the deal). Stored
 * rows and the arrangement's current_makeup that disagree with the replay are
 * rewritten so every reader of the tables sees the same numbers.
 */
export async function loadStakingDeal(
  userId: string,
  arrangement: StakingArrangement,
  allArrangementIds: string[] = [arrangement.id]
): Promise<StakingDeal> {
  const stored = await fetchStakingSessions(arrangement.id);
  const [entriesById, linkedAnywhere, candidates] = await Promise.all([
    fetchLedgerRowsById(userId, stored.map((s) => s.ledger_entry_id)),
    fetchLinkedLedgerIds(allArrangementIds),
    fetchLedgerEntries(userId, {
      startDate: arrangement.start_date || undefined,
      endDate: arrangement.end_date || undefined,
      limit: 200,
    }),
  ]);

  const replay = replayStakingDeal({
    startingMakeup: arrangement.starting_makeup,
    splitPercentage: arrangement.split_percentage,
    sessions: stored.map((s) => {
      const entry = entriesById.get(s.ledger_entry_id);
      return {
        ...s,
        entry_date: entry?.entry_date,
        start_time: entry?.start_time,
        category: entry?.category,
        gross_result: entry ? entry.net_result ?? (entry.gross_out || 0) - (entry.gross_in || 0) : s.gross_result,
      };
    }),
  });

  let syncFailed = false;
  try {
    for (const row of stakingRowsToRewrite(stored, replay.sessions)) {
      const { error } = await supabase
        .from('staking_sessions')
        .update({
          gross_result: row.gross_result,
          player_share: row.player_share,
          backer_share: row.backer_share,
          makeup_before: row.makeup_before,
          makeup_after: row.makeup_after,
        })
        .eq('id', row.id);
      if (error) throw error;
    }
    if (Math.round(Number(arrangement.current_makeup || 0) * 100) !== Math.round(replay.currentMakeup * 100)) {
      const { error } = await supabase
        .from('staking_arrangements')
        .update({ current_makeup: replay.currentMakeup, updated_at: new Date().toISOString() })
        .eq('id', arrangement.id);
      if (error) throw error;
    }
  } catch (err) {
    // The replay shown is still correct; the next load retries the write.
    syncFailed = true;
    console.warn('[Staking] Could not store the replayed deal:', err?.message || err);
  }

  return {
    sessions: [...replay.sessions].reverse(),
    totals: replay.totals,
    currentMakeup: replay.currentMakeup,
    linkable: linkableStakingEntries(candidates, {
      startDate: arrangement.start_date,
      endDate: arrangement.end_date,
      linkedIds: linkedAnywhere,
    }),
    syncFailed,
  };
}

/**
 * Link a ledger entry to a deal. The split stored here is provisional: the
 * caller reloads the deal, which replays every session in played order.
 */
export async function linkStakingSession(arrangement: StakingArrangement, entry: LedgerEntry): Promise<void> {
  const split = splitStakingSession({
    grossResult: entry.net_result ?? (entry.gross_out || 0) - (entry.gross_in || 0),
    splitPercentage: arrangement.split_percentage,
    makeupBefore: arrangement.current_makeup || 0,
  });
  const { error } = await supabase
    .from('staking_sessions')
    .insert({ arrangement_id: arrangement.id, ledger_entry_id: entry.id, ...split });
  if (error) {
    if (error.code === '23505') throw new Error('That Session Is Already Linked To This Deal.');
    throw error;
  }
}

/** Remove a session from a deal (the ledger entry itself is untouched). */
export async function unlinkStakingSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('staking_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

/** @deprecated kept for callers outside the tracker: totals now come from loadStakingDeal. */
export async function getStakingStats(arrangementId: string): Promise<{
  totalGrossResult: number;
  playerShare: number;
  backerShare: number;
  sessionCount: number;
}> {
  const sessions = await fetchStakingSessions(arrangementId);
  const cents = (key: string) => sessions.reduce((sum, s: any) => sum + Math.round(Number(s[key] || 0) * 100), 0) / 100;
  return {
    totalGrossResult: cents('gross_result'),
    playerShare: cents('player_share'),
    backerShare: cents('backer_share'),
    sessionCount: sessions.length,
  };
}
