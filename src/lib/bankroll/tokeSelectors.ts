/**
 * TOKE SELECTORS — Dealer Income & Expense Tracking
 * ═══════════════════════════════════════════════════════════════
 * CRUD for toke_gigs and toke_downs tables.
 * Mirrors the bankrollSelectors pattern for trips.
 * ═══════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase';

// ─── Types ──────────────────────────────────────────────────

export interface TokeGig {
    id: string;
    user_id: string;
    venue_name: string;
    venue_address?: string | null;
    location_id?: string | null;
    start_date: string;
    end_date?: string | null;
    hourly_rate: number;
    status: 'active' | 'completed' | 'deleted';
    notes?: string | null;
    created_at: string;
    updated_at: string;
    // Computed (client-side)
    totalTokes?: number;
    totalDowns?: number;
    totalHoursWorked?: number;
    downs?: TokeDown[];
}

export interface TokeDown {
    id: string;
    gig_id: string;
    user_id: string;
    down_type: 'cash' | 'tournament' | 'break' | 'brush';
    game_type?: string | null;
    tournament_name?: string | null;
    table_number?: string | null;
    started_at: string;
    ended_at?: string | null;
    toke_amount: number;
    is_double_down: boolean;
    notes?: string | null;
    created_at: string;
}

// ─── GIG CRUD ───────────────────────────────────────────────

/**
 * Fetch all non-deleted gigs for a user (most recent first)
 */
export async function fetchGigs(userId: string): Promise<TokeGig[]> {
    const { data, error } = await supabase
        .from('toke_gigs')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .order('start_date', { ascending: false });

    if (error) throw error;

    // Compute totals for each gig
    const gigs: TokeGig[] = [];
    for (const gig of data || []) {
        const { data: downs } = await supabase
            .from('toke_downs')
            .select('*')
            .eq('gig_id', gig.id)
            .order('started_at', { ascending: true });

        const dealingDowns = (downs || []).filter((d: TokeDown) =>
            d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'
        );
        const totalTokes = dealingDowns.reduce((sum: number, d: TokeDown) => sum + (d.toke_amount || 0), 0);
        const totalHoursWorked = computeTotalHours(downs || []);

        gigs.push({
            ...gig,
            totalTokes,
            totalDowns: dealingDowns.length,
            totalHoursWorked,
        });
    }

    return gigs;
}

/**
 * Get the active gig (only one allowed at a time)
 */
export async function getActiveGig(userId: string): Promise<TokeGig | null> {
    const { data, error } = await supabase
        .from('toke_gigs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // Load all downs for active gig
    const { data: downs } = await supabase
        .from('toke_downs')
        .select('*')
        .eq('gig_id', data.id)
        .order('started_at', { ascending: true });

    const allDowns = downs || [];
    const dealingDowns = allDowns.filter((d: TokeDown) =>
        d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'
    );
    const totalTokes = dealingDowns.reduce((sum: number, d: TokeDown) => sum + (d.toke_amount || 0), 0);
    const totalHoursWorked = computeTotalHours(allDowns);

    return {
        ...data,
        totalTokes,
        totalDowns: dealingDowns.length,
        totalHoursWorked,
        downs: allDowns,
    };
}

/**
 * Create a new gig (enforces single-active rule)
 */
export async function createGig(
    userId: string,
    gig: Partial<TokeGig>
): Promise<TokeGig> {
    const existing = await getActiveGig(userId);
    if (existing) {
        throw new Error('You already have an active gig. Complete or delete it first.');
    }

    const { data, error } = await supabase
        .from('toke_gigs')
        .insert({
            user_id: userId,
            venue_name: gig.venue_name,
            venue_address: gig.venue_address || null,
            location_id: gig.location_id || null,
            start_date: gig.start_date || new Date().toISOString().split('T')[0],
            hourly_rate: gig.hourly_rate || 0,
            notes: gig.notes || null,
            status: 'active',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update an existing gig's editable fields
 */
export async function updateGig(
    userId: string,
    gigId: string,
    updates: Partial<TokeGig>
): Promise<TokeGig> {
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
 * Complete an active gig — sets status to 'completed' and end_date
 */
export async function completeGig(userId: string, gigId: string): Promise<TokeGig> {
    // End any open down first
    const { data: openDowns } = await supabase
        .from('toke_downs')
        .select('id')
        .eq('gig_id', gigId)
        .is('ended_at', null);

    if (openDowns && openDowns.length > 0) {
        const now = new Date().toISOString();
        for (const d of openDowns) {
            await supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id);
        }
    }

    const { data, error } = await supabase
        .from('toke_gigs')
        .update({
            status: 'completed',
            end_date: new Date().toISOString().split('T')[0],
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', gigId)
        .eq('status', 'active')
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a gig (soft delete — sets status to 'deleted')
 */
export async function deleteGig(userId: string, gigId: string): Promise<void> {
    const { error } = await supabase
        .from('toke_gigs')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', gigId);

    if (error) throw error;
}

// ─── DOWN CRUD ──────────────────────────────────────────────

/**
 * Fetch all downs for a gig
 */
export async function fetchDowns(gigId: string): Promise<TokeDown[]> {
    const { data, error } = await supabase
        .from('toke_downs')
        .select('*')
        .eq('gig_id', gigId)
        .order('started_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Create a new down (also ends any currently-open down)
 */
export async function createDown(
    userId: string,
    gigId: string,
    down: Partial<TokeDown>
): Promise<TokeDown> {
    // End any open down first
    const { data: openDowns } = await supabase
        .from('toke_downs')
        .select('id')
        .eq('gig_id', gigId)
        .is('ended_at', null);

    if (openDowns && openDowns.length > 0) {
        const now = new Date().toISOString();
        for (const d of openDowns) {
            await supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id);
        }
    }

    const { data, error } = await supabase
        .from('toke_downs')
        .insert({
            gig_id: gigId,
            user_id: userId,
            down_type: down.down_type || 'cash',
            game_type: down.game_type || null,
            tournament_name: down.tournament_name || null,
            table_number: down.table_number || null,
            started_at: new Date().toISOString(),
            toke_amount: down.toke_amount || 0,
            is_double_down: down.is_double_down || false,
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
 * Create a double-down — clones the last down as a continuation
 */
export async function createDoubleDown(
    userId: string,
    gigId: string,
    lastDown: TokeDown
): Promise<TokeDown> {
    return createDown(userId, gigId, {
        down_type: lastDown.down_type,
        game_type: lastDown.game_type,
        tournament_name: lastDown.tournament_name,
        table_number: lastDown.table_number,
        is_double_down: true,
    });
}

/**
 * Delete a down
 */
export async function deleteDown(downId: string): Promise<void> {
    const { error } = await supabase
        .from('toke_downs')
        .delete()
        .eq('id', downId);

    if (error) throw error;
}

/**
 * Update a down's toke amount
 */
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

// ─── GIG REPORT ─────────────────────────────────────────────

/**
 * Get detailed report for a completed gig
 */
export async function getGigReport(userId: string, gigId: string) {
    const { data: gig, error: gigError } = await supabase
        .from('toke_gigs')
        .select('*')
        .eq('user_id', userId)
        .eq('id', gigId)
        .single();

    if (gigError) throw gigError;

    const { data: downs, error: downsError } = await supabase
        .from('toke_downs')
        .select('*')
        .eq('gig_id', gigId)
        .order('started_at', { ascending: true });

    if (downsError) throw downsError;

    const allDowns = downs || [];
    const dealingDowns = allDowns.filter((d: TokeDown) =>
        d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'
    );
    const breakDowns = allDowns.filter((d: TokeDown) => d.down_type === 'break');
    const totalTokes = dealingDowns.reduce((sum: number, d: TokeDown) => sum + (d.toke_amount || 0), 0);
    const totalHoursWorked = computeTotalHours(allDowns);
    const cashDowns = allDowns.filter((d: TokeDown) => d.down_type === 'cash');
    const tournamentDowns = allDowns.filter((d: TokeDown) => d.down_type === 'tournament');
    const brushDowns = allDowns.filter((d: TokeDown) => d.down_type === 'brush');
    const doubleDowns = allDowns.filter((d: TokeDown) => d.is_double_down);

    const hourlyRate = gig.hourly_rate || 0;
    const hourlyPay = totalHoursWorked * hourlyRate;
    const totalEarnings = hourlyPay + totalTokes;

    const startDate = new Date(gig.start_date);
    const endDate = gig.end_date ? new Date(gig.end_date) : new Date();
    const durationDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    return {
        gig,
        downs: allDowns,
        stats: {
            totalTokes,
            totalDowns: dealingDowns.length,
            totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
            hourlyRate,
            hourlyPay: Math.round(hourlyPay * 100) / 100,
            totalEarnings: Math.round(totalEarnings * 100) / 100,
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

// ─── HELPERS ────────────────────────────────────────────────

/**
 * Compute total hours worked from a list of downs
 */
function computeTotalHours(downs: TokeDown[]): number {
    let totalMs = 0;
    for (const d of downs) {
        const start = new Date(d.started_at).getTime();
        const end = d.ended_at ? new Date(d.ended_at).getTime() : Date.now();
        totalMs += end - start;
    }
    return totalMs / (1000 * 60 * 60);
}
