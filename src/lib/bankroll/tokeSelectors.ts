/**
 * TOKE SELECTORS — Dealer Income & Expense Tracking (Multi-Day v2)
 * ═══════════════════════════════════════════════════════════════════
 * CRUD for toke_gigs, toke_gig_days, toke_downs, toke_expenses.
 * Each gig now contains multiple "days". Downs and expenses belong
 * to a specific day (via day_id). The event stays active across all
 * days until the user explicitly clicks "Complete Event".
 * ═══════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase';

// ─── Retry Utility — imported from shared module ────────
import { withRetry } from './retryUtils';

// ─── Types ──────────────────────────────────────────────────────────

export interface TokeGig {
    id: string;
    user_id: string;
    venue_name: string;
    venue_address?: string | null;
    location_id?: string | null;
    venue_type?: string | null;
    poker_venue_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    start_date: string;
    end_date?: string | null;
    hourly_rate: number;
    mileage?: number | null;
    status: 'active' | 'completed' | 'deleted';
    notes?: string | null;
    created_at: string;
    updated_at: string;
    // Computed
    totalTokes?: number;
    totalDowns?: number;
    totalHoursWorked?: number;
    totalExpenses?: number;
    days?: TokeGigDay[];
    // Analytics convenience — attached by fetchGigs for client-side analytics
    downs?: TokeDown[];
    expenses?: TokeExpense[];
}

export interface TokeGigDay {
    id: string;
    gig_id: string;
    user_id: string;
    day_number: number;        // 1, 2, 3 …
    date: string;              // YYYY-MM-DD
    started_at: string;
    ended_at?: string | null;  // null = day is still open
    notes?: string | null;
    created_at: string;
    // Computed
    downs?: TokeDown[];
    expenses?: TokeExpense[];
    totalTokes?: number;
    totalDowns?: number;
    totalHoursWorked?: number;
    totalExpenses?: number;
}

export interface TokeDown {
    id: string;
    gig_id: string;
    day_id: string;            // FK → toke_gig_days.id
    user_id: string;
    down_type: 'cash' | 'tournament' | 'break' | 'brush';
    game_type?: string | null;
    tournament_name?: string | null;
    table_number?: string | null;
    tournament_buyin?: number | null;  // optional buy-in amount for tournament downs
    started_at: string;
    ended_at?: string | null;
    toke_amount: number;
    is_double_down: boolean;
    down_multiplier: number;
    notes?: string | null;
    created_at: string;
}

export interface TokeExpense {
    id: string;
    user_id: string;
    gig_id: string;
    day_id: string;            // FK → toke_gig_days.id
    category: 'food' | 'ride_share' | 'gas' | 'mileage' | 'air_fare' | 'lodging' | 'supplies' | 'other' | 'tip_out';
    amount: number;
    description?: string | null;
    receipt_url?: string | null;
    created_at: string;
}

// ─── Helper: compute total hours from a list of downs ───────────────

function computeTotalHours(downs: TokeDown[]): number {
    let ms = 0;
    for (const d of downs) {
        const start = new Date(d.started_at).getTime();
        const end = d.ended_at ? new Date(d.ended_at).getTime() : Date.now();
        ms += end - start;
    }
    return ms / (1000 * 60 * 60);
}

// ─── Helper: decorate a day with computed fields ─────────────────────

function decorateDay(day: TokeGigDay, downs: TokeDown[], expenses: TokeExpense[]): TokeGigDay {
    const dayDowns = downs.filter(d => d.day_id === day.id);
    const dayExpenses = expenses.filter(e => e.day_id === day.id);
    const dealingDowns = dayDowns.filter(d => d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush');
    return {
        ...day,
        downs: dayDowns,
        expenses: dayExpenses,
        totalTokes: dealingDowns.reduce((s, d) => s + (d.toke_amount || 0), 0),
        totalDowns: dealingDowns.length,
        totalHoursWorked: computeTotalHours(dayDowns),
        totalExpenses: dayExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    };
}

// ─── GIG CRUD ────────────────────────────────────────────────────────

/**
 * Fetch all non-deleted gigs for a user (most recent first)
 */
export async function fetchGigs(userId: string): Promise<TokeGig[]> {
    return withRetry(async () => {
        // Fetch all gigs in one query
        const { data, error } = await supabase
            .from('toke_gigs')
            .select('*')
            .eq('user_id', userId)
            .neq('status', 'deleted')
            .order('start_date', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) return [];

        const gigIds = data.map(g => g.id);

        // Two bulk queries instead of 2×N per-gig queries
        const [{ data: allDownsRaw }, { data: allExpsRaw }] = await Promise.all([
            supabase.from('toke_downs').select('*').in('gig_id', gigIds),
            supabase.from('toke_expenses').select('*').in('gig_id', gigIds), // full row needed for category breakdown
        ]);

        const downsByGig = new Map<string, TokeDown[]>();
        const expsByGig = new Map<string, TokeExpense[]>();
        for (const d of (allDownsRaw || []) as TokeDown[]) {
            if (!downsByGig.has(d.gig_id)) downsByGig.set(d.gig_id, []);
            downsByGig.get(d.gig_id)!.push(d);
        }
        for (const e of (allExpsRaw || []) as TokeExpense[]) {
            if (!expsByGig.has(e.gig_id)) expsByGig.set(e.gig_id, []);
            expsByGig.get(e.gig_id)!.push(e);
        }

        return data.map(gig => {
            const allDowns = downsByGig.get(gig.id) || [];
            const allExps = expsByGig.get(gig.id) || [];
            const dealingDowns = allDowns.filter(d => d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush');
            return {
                ...gig,
                totalTokes: dealingDowns.reduce((s, d) => s + (d.toke_amount || 0), 0),
                totalDowns: dealingDowns.length,
                totalHoursWorked: computeTotalHours(allDowns),
                totalExpenses: allExps.reduce((s, e) => s + (e.amount || 0), 0),
                downs: allDowns,       // ← attached for client-side analytics
                expenses: allExps,     // ← attached for client-side analytics
            };
        });
    });
}

/**
 * Get the active gig with its full day/down/expense tree
 */
export async function getActiveGig(userId: string): Promise<TokeGig | null> {
    return withRetry(async () => {
        const { data, error } = await supabase
            .from('toke_gigs')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        // Load all days
        const { data: daysRaw } = await supabase
            .from('toke_gig_days')
            .select('*')
            .eq('gig_id', data.id)
            .order('day_number', { ascending: true });

        // Load all downs for the whole gig
        const { data: downs } = await supabase
            .from('toke_downs')
            .select('*')
            .eq('gig_id', data.id)
            .order('started_at', { ascending: true });

        // Load all expenses for the whole gig
        const { data: expenses } = await supabase
            .from('toke_expenses')
            .select('*')
            .eq('gig_id', data.id)
            .order('created_at', { ascending: false });

        const allDowns = (downs || []) as TokeDown[];
        const allExpenses = (expenses || []) as TokeExpense[];

        // Decorate each day
        const days: TokeGigDay[] = (daysRaw || []).map(day =>
            decorateDay(day as TokeGigDay, allDowns, allExpenses)
        );

        const dealingDowns = allDowns.filter(d => d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush');

        return {
            ...data,
            days,
            totalTokes: dealingDowns.reduce((s, d) => s + (d.toke_amount || 0), 0),
            totalDowns: dealingDowns.length,
            totalHoursWorked: computeTotalHours(allDowns),
            totalExpenses: allExpenses.reduce((s, e) => s + (e.amount || 0), 0),
        };
    });
}

/**
 * Create a new gig AND auto-create Day 1
 */
export async function createGig(userId: string, gig: Partial<TokeGig>): Promise<TokeGig> {
    const existing = await getActiveGig(userId);
    if (existing) throw new Error('You already have an active event. Complete or delete it first.');

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeLocationId = gig.location_id && uuidRegex.test(gig.location_id) ? gig.location_id : null;

    const { data, error } = await supabase
        .from('toke_gigs')
        .insert({
            user_id: userId,
            venue_name: gig.venue_name,
            venue_address: gig.venue_address || null,
            location_id: safeLocationId,
            start_date: gig.start_date || new Date().toISOString().split('T')[0],
            hourly_rate: gig.hourly_rate || 0,
            notes: gig.notes || null,
            status: 'active',
        })
        .select()
        .single();

    if (error) throw error;

    // Auto-create Day 1
    await createDay(userId, data.id, 1);

    return data;
}

/**
 * Update editable gig fields
 */
export async function updateGig(userId: string, gigId: string, updates: Partial<TokeGig>): Promise<TokeGig> {
    const { data, error } = await supabase
        .from('toke_gigs')
        .update({
            venue_name: updates.venue_name,
            venue_address: updates.venue_address,
            hourly_rate: updates.hourly_rate,
            notes: updates.notes,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', gigId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Complete an entire event — closes any open day + sets status to completed
 */
export async function completeGig(userId: string, gigId: string, mileage = 0): Promise<TokeGig> {
    // Auto-close any open downs
    const { data: openDowns } = await supabase
        .from('toke_downs')
        .select('id')
        .eq('gig_id', gigId)
        .is('ended_at', null);

    if (openDowns?.length) {
        const now = new Date().toISOString();
        for (const d of openDowns) {
            await supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id);
        }
    }

    // Auto-close any open days
    const { data: openDays } = await supabase
        .from('toke_gig_days')
        .select('id')
        .eq('gig_id', gigId)
        .is('ended_at', null);

    if (openDays?.length) {
        const now = new Date().toISOString();
        for (const d of openDays) {
            await supabase.from('toke_gig_days').update({ ended_at: now }).eq('id', d.id);
        }
    }

    const { data, error } = await supabase
        .from('toke_gigs')
        .update({
            status: 'completed',
            end_date: new Date().toISOString().split('T')[0],
            mileage: mileage || 0,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', gigId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Soft-delete a gig
 */
export async function deleteGig(userId: string, gigId: string): Promise<void> {
    const { error } = await supabase
        .from('toke_gigs')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', gigId);

    if (error) throw error;
}

// ─── DAY CRUD ────────────────────────────────────────────────────────

/**
 * Create a new day for a gig
 */
export async function createDay(userId: string, gigId: string, dayNumber: number): Promise<TokeGigDay> {
    const { data, error } = await supabase
        .from('toke_gig_days')
        .insert({
            gig_id: gigId,
            user_id: userId,
            day_number: dayNumber,
            date: new Date().toISOString().split('T')[0],
            started_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Close out the current day (set ended_at)
 */
export async function closeDay(dayId: string): Promise<TokeGigDay> {
    // Auto-close any open downs belonging to this day
    const { data: openDowns } = await supabase
        .from('toke_downs')
        .select('id')
        .eq('day_id', dayId)
        .is('ended_at', null);

    if (openDowns?.length) {
        const now = new Date().toISOString();
        for (const d of openDowns) {
            await supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id);
        }
    }

    const { data, error } = await supabase
        .from('toke_gig_days')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', dayId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ─── DOWN CRUD ───────────────────────────────────────────────────────

/**
 * Create a down inside a specific day
 */
export async function createDown(
    userId: string,
    gigId: string,
    dayId: string,
    down: Partial<TokeDown>
): Promise<TokeDown> {
    // End any open down for this day
    const { data: openDowns } = await supabase
        .from('toke_downs')
        .select('id')
        .eq('day_id', dayId)
        .is('ended_at', null);

    if (openDowns?.length) {
        const now = new Date().toISOString();
        for (const d of openDowns) {
            await supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id);
        }
    }

    const { data, error } = await supabase
        .from('toke_downs')
        .insert({
            gig_id: gigId,
            day_id: dayId,
            user_id: userId,
            down_type: down.down_type || 'cash',
            game_type: down.game_type || null,
            tournament_name: down.tournament_name || null,
            table_number: down.table_number || null,
            tournament_buyin: down.tournament_buyin || null,
            started_at: new Date().toISOString(),
            toke_amount: down.toke_amount || 0,
            is_double_down: down.is_double_down || false,
            down_multiplier: down.down_multiplier || 1.0,
            notes: down.notes || null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * End a currently-open down
 */
export async function endDown(downId: string, tokeAmount?: number): Promise<TokeDown> {
    const updates: Record<string, unknown> = { ended_at: new Date().toISOString() };
    if (tokeAmount !== undefined) updates.toke_amount = tokeAmount;

    const { data, error } = await supabase
        .from('toke_downs')
        .update(updates)
        .eq('id', downId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Double-down — clone the last down into the same day
 */
export async function createDoubleDown(
    userId: string,
    gigId: string,
    dayId: string,
    lastDown: TokeDown
): Promise<TokeDown> {
    return createDown(userId, gigId, dayId, {
        down_type: lastDown.down_type,
        game_type: lastDown.game_type,
        tournament_name: lastDown.tournament_name,
        table_number: lastDown.table_number,
        tournament_buyin: lastDown.tournament_buyin || null, // preserve buy-in for analysis continuity
        is_double_down: true,
    });
}

export async function deleteDown(downId: string): Promise<void> {
    const { error } = await supabase.from('toke_downs').delete().eq('id', downId);
    if (error) throw error;
}

export async function updateDownToke(downId: string, tokeAmount: number): Promise<TokeDown> {
    const { data, error } = await supabase
        .from('toke_downs')
        .update({ toke_amount: tokeAmount })
        .eq('id', downId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateDownMultiplier(downId: string, multiplier: number): Promise<TokeDown> {
    const { data, error } = await supabase
        .from('toke_downs')
        .update({ down_multiplier: multiplier })
        .eq('id', downId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ─── EXPENSE CRUD ────────────────────────────────────────────────────

export async function fetchExpenses(gigId: string): Promise<TokeExpense[]> {
    const { data, error } = await supabase
        .from('toke_expenses')
        .select('*')
        .eq('gig_id', gigId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function createExpense(
    userId: string,
    gigId: string,
    dayId: string,
    expense: Partial<TokeExpense>
): Promise<TokeExpense> {
    const { data, error } = await supabase
        .from('toke_expenses')
        .insert({
            user_id: userId,
            gig_id: gigId,
            day_id: dayId,
            category: expense.category || 'other',
            amount: expense.amount || 0,
            description: expense.description || null,
            receipt_url: expense.receipt_url || null,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteExpense(expenseId: string): Promise<void> {
    const { error } = await supabase.from('toke_expenses').delete().eq('id', expenseId);
    if (error) throw error;
}

// ─── GIG REPORT ──────────────────────────────────────────────────────

export async function getGigReport(userId: string, gigId: string) {
    const { data: gig, error: gigError } = await supabase
        .from('toke_gigs')
        .select('*')
        .eq('user_id', userId)
        .eq('id', gigId)
        .single();

    if (gigError) throw gigError;

    const { data: daysRaw } = await supabase
        .from('toke_gig_days')
        .select('*')
        .eq('gig_id', gigId)
        .order('day_number', { ascending: true });

    const { data: downsRaw } = await supabase
        .from('toke_downs')
        .select('*')
        .eq('gig_id', gigId)
        .order('started_at', { ascending: true });

    const { data: expensesRaw } = await supabase
        .from('toke_expenses')
        .select('*')
        .eq('gig_id', gigId)
        .order('created_at', { ascending: false });

    const allDowns = (downsRaw || []) as TokeDown[];
    const allExpenses = (expensesRaw || []) as TokeExpense[];

    // Decorate each day with its own stats
    const days: TokeGigDay[] = (daysRaw || []).map(day =>
        decorateDay(day as TokeGigDay, allDowns, allExpenses)
    );

    const dealingDowns = allDowns.filter(d => d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush');
    const cashDowns = allDowns.filter(d => d.down_type === 'cash');
    const tournamentDowns = allDowns.filter(d => d.down_type === 'tournament');
    const brushDowns = allDowns.filter(d => d.down_type === 'brush');
    const breakDowns = allDowns.filter(d => d.down_type === 'break');
    const doubleDowns = allDowns.filter(d => d.is_double_down);

    const totalTokes = dealingDowns.reduce((s, d) => s + (d.toke_amount || 0), 0);
    const totalHoursWorked = computeTotalHours(allDowns);
    const totalExpenses = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const hourlyRate = gig.hourly_rate || 0;
    const hourlyPay = totalHoursWorked * hourlyRate;
    const totalEarnings = hourlyPay + totalTokes - totalExpenses;

    const startDate = new Date(gig.start_date);
    const endDate = gig.end_date ? new Date(gig.end_date) : new Date();
    const durationDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    return {
        gig,
        days,
        downs: allDowns,
        expenses: allExpenses,
        stats: {
            totalTokes,
            totalDowns: dealingDowns.length,
            totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
            hourlyRate,
            hourlyPay: Math.round(hourlyPay * 100) / 100,
            totalEarnings: Math.round(totalEarnings * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            cashDownCount: cashDowns.length,
            tournamentDownCount: tournamentDowns.length,
            brushDownCount: brushDowns.length,
            breakCount: breakDowns.length,
            doubleDownCount: doubleDowns.length,
            avgTokePerDown: dealingDowns.length > 0 ? Math.round((totalTokes / dealingDowns.length) * 100) / 100 : 0,
            durationDays,
            perDay: durationDays > 0 ? Math.round(totalEarnings / durationDays) : 0,
        },
    };
}

// ─── LEGACY COMPAT — mileage field on completeGig ────────────────────
// (kept for the existing completeGig call signature in TokeTracker.jsx)
export { completeGig as completeGigWithMileage };

// ─── ANALYTICS ───────────────────────────────────────────────────────

export interface TokeAnalytics {
    careerTokes: number;
    totalEvents: number;
    totalHours: number;
    totalExpenses: number;
    avgTokePerDown: number;
    avgHoursPerEvent: number;
    bestEvent: { venueName: string; tokes: number; date: string } | null;
    // Per-event line chart data (chronological)
    eventTrend: { date: string; tokes: number; hours: number; venue: string; cumulative: number }[];
    // Down-type distribution (all-time)
    downTypes: { cash: number; tournament: number; brush: number; break: number };
    // Monthly toke totals — last 12 calendar months
    monthlyTrend: { month: string; tokes: number; events: number }[];
}

/**
 * Career-level analytics for the Toke Dashboard.
 * Uses the already-efficient bulk gig data to avoid extra queries.
 */
export async function getTokeAnalytics(userId: string): Promise<TokeAnalytics> {
    return withRetry(async () => {
        // Fetch all non-deleted gigs
        const { data: gigs, error: gigErr } = await supabase
            .from('toke_gigs')
            .select('id, venue_name, start_date, end_date, hourly_rate, status')
            .eq('user_id', userId)
            .neq('status', 'deleted')
            .order('start_date', { ascending: true });

        if (gigErr) throw gigErr;
        if (!gigs || gigs.length === 0) {
            return {
                careerTokes: 0, totalEvents: 0, totalHours: 0, totalExpenses: 0,
                avgTokePerDown: 0, avgHoursPerEvent: 0, bestEvent: null,
                eventTrend: [], downTypes: { cash: 0, tournament: 0, brush: 0, break: 0 },
                monthlyTrend: [],
            };
        }

        const gigIds = gigs.map(g => g.id);

        // Bulk fetch downs and expenses in parallel
        const [{ data: downsRaw }, { data: expsRaw }] = await Promise.all([
            supabase.from('toke_downs').select('*').in('gig_id', gigIds),
            supabase.from('toke_expenses').select('gig_id, amount').in('gig_id', gigIds),
        ]);

        const allDowns = (downsRaw || []) as TokeDown[];
        const allExps = (expsRaw || []) as { gig_id: string; amount: number }[];

        // Group by gig
        const downsByGig = new Map<string, TokeDown[]>();
        const expsByGig = new Map<string, number>();
        for (const d of allDowns) {
            if (!downsByGig.has(d.gig_id)) downsByGig.set(d.gig_id, []);
            downsByGig.get(d.gig_id)!.push(d);
        }
        for (const e of allExps) {
            expsByGig.set(e.gig_id, (expsByGig.get(e.gig_id) || 0) + (e.amount || 0));
        }

        // Career-level tallies
        let careerTokes = 0;
        let totalHours = 0;
        let totalExpenses = 0;
        let totalDealingDowns = 0;
        const downTypes = { cash: 0, tournament: 0, brush: 0, break: 0 };
        let bestEvent: TokeAnalytics['bestEvent'] = null;
        let cumulative = 0;
        const eventTrend: TokeAnalytics['eventTrend'] = [];
        const monthlyMap = new Map<string, { tokes: number; events: number }>();

        const completedGigs = gigs.filter(g => g.status === 'completed');

        for (const gig of completedGigs) {
            const gigDowns = downsByGig.get(gig.id) || [];
            const gigDealing = gigDowns.filter(d => d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush');
            const gigTokes = gigDealing.reduce((s, d) => s + (d.toke_amount || 0), 0);
            const gigHours = computeTotalHours(gigDowns);
            const gigExpenses = expsByGig.get(gig.id) || 0;

            careerTokes += gigTokes;
            totalHours += gigHours;
            totalExpenses += gigExpenses;
            totalDealingDowns += gigDealing.length;

            for (const d of gigDowns) {
                if (d.down_type === 'cash') downTypes.cash++;
                else if (d.down_type === 'tournament') downTypes.tournament++;
                else if (d.down_type === 'brush') downTypes.brush++;
                else if (d.down_type === 'break') downTypes.break++;
            }

            if (!bestEvent || gigTokes > bestEvent.tokes) {
                bestEvent = { venueName: gig.venue_name, tokes: gigTokes, date: gig.start_date };
            }

            cumulative += gigTokes;
            eventTrend.push({
                date: gig.start_date,
                tokes: gigTokes,
                hours: Math.round(gigHours * 10) / 10,
                venue: gig.venue_name,
                cumulative,
            });

            // Monthly bucket (YYYY-MM)
            const monthKey = gig.start_date.slice(0, 7);
            const existing = monthlyMap.get(monthKey) || { tokes: 0, events: 0 };
            monthlyMap.set(monthKey, { tokes: existing.tokes + gigTokes, events: existing.events + 1 });
        }

        // Build last 12 calendar months array (even if no data)
        const monthlyTrend: TokeAnalytics['monthlyTrend'] = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const val = monthlyMap.get(key) || { tokes: 0, events: 0 };
            monthlyTrend.push({ month: label, ...val });
        }

        return {
            careerTokes,
            totalEvents: completedGigs.length,
            totalHours: Math.round(totalHours * 10) / 10,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            avgTokePerDown: totalDealingDowns > 0 ? Math.round((careerTokes / totalDealingDowns) * 100) / 100 : 0,
            avgHoursPerEvent: completedGigs.length > 0 ? Math.round((totalHours / completedGigs.length) * 10) / 10 : 0,
            bestEvent,
            eventTrend,
            downTypes,
            monthlyTrend,
        };
    });
}
