/**
 * CALENDAR SELECTORS — Dealer Calendar Events
 * ═══════════════════════════════════════════════════════════════════
 * CRUD helpers for `dealer_calendar_events` table.
 * ═══════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase';
import { monthBounds } from './tournamentSchedule.mjs';

export interface CalendarEvent {
    id: string;
    user_id: string;
    title: string;
    venue_name: string | null;
    event_date: string; // ISO date string YYYY-MM-DD
    notes: string | null;
    alert_enabled: boolean;
    notification_sent: boolean;
    share_token: string;
    created_at: string;
}

export interface NewCalendarEvent {
    title: string;
    venue_name?: string;
    event_date: string;
    notes?: string;
    alert_enabled?: boolean;
}

/** Fetch all calendar events for a user */
export async function fetchCalendarEvents(userId: string): Promise<CalendarEvent[]> {
    const { data, error } = await supabase
        .from('dealer_calendar_events')
        .select('*')
        .eq('user_id', userId)
        .order('event_date', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
}

/** Create a new calendar event */
export async function createCalendarEvent(
    userId: string,
    event: NewCalendarEvent
): Promise<CalendarEvent> {
    const { data, error } = await supabase
        .from('dealer_calendar_events')
        .insert({
            user_id: userId,
            title: event.title,
            venue_name: event.venue_name || null,
            event_date: event.event_date,
            notes: event.notes || null,
            alert_enabled: event.alert_enabled !== false,
        })
        .select()
        .maybeSingle();

    if (error || !data) throw new Error(error?.message || 'Failed to create calendar event');
    return data;
}

/** Update an existing calendar event */
export async function updateCalendarEvent(
    eventId: string,
    updates: Partial<NewCalendarEvent>
): Promise<void> {
    const { error } = await supabase
        .from('dealer_calendar_events')
        .update(updates)
        .eq('id', eventId);

    if (error) throw new Error(error.message);
}

/** Delete a calendar event */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
    // Row security turns a delete it does not allow into "0 rows, no error".
    // Reading the deleted id back is what tells "Event deleted" from nothing
    // having happened.
    const { data, error } = await supabase
        .from('dealer_calendar_events')
        .delete()
        .eq('id', eventId)
        .select('id');

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('This Calendar Event Could Not Be Deleted.');
}

/** Get events for a specific month */
export async function fetchEventsForMonth(
    userId: string,
    year: number,
    month: number // 1-indexed
): Promise<CalendarEvent[]> {
    // Civil dates: toISOString() of local midnight is the PREVIOUS day east of
    // UTC, which dropped the last day of every month from the query.
    const { start: startDate, end: endDate } = monthBounds(year, month - 1);

    const { data, error } = await supabase
        .from('dealer_calendar_events')
        .select('*')
        .eq('user_id', userId)
        .gte('event_date', startDate)
        .lte('event_date', endDate)
        .order('event_date', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
}
