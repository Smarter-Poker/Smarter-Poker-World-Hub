/**
 * Normalize utilities for US Event Coverage
 */

import { createHash } from 'crypto';
import type { Series, Event } from './types';

// Generate stable UID from components
export function generateSeriesUid(
    seriesName: string,
    venueName: string,
    startDate: string
): string {
    const raw = `${seriesName}__${venueName}__${startDate}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');
    return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

// Normalize state codes
const STATE_ALIASES: Record<string, string> = {
    'california': 'CA',
    'nevada': 'NV',
    'florida': 'FL',
    'texas': 'TX',
    'new jersey': 'NJ',
    'pennsylvania': 'PA',
    'connecticut': 'CT',
    'oklahoma': 'OK',
    'arizona': 'AZ',
    'colorado': 'CO',
    'maryland': 'MD',
    'new york': 'NY',
    'louisiana': 'LA',
    'mississippi': 'MS',
    'north carolina': 'NC',
    'illinois': 'IL',
    'indiana': 'IN',
    'michigan': 'MI',
    'minnesota': 'MN',
    'iowa': 'IA',
    'ohio': 'OH',
    'wisconsin': 'WI',
    'washington': 'WA',
    'oregon': 'OR',
    'virginia': 'VA',
    'west virginia': 'WV',
    'new mexico': 'NM',
    'south dakota': 'SD',
    'kansas': 'KS',
};

export function normalizeState(state: string | undefined | null): string {
    if (!state) return '';
    const upper = state.toUpperCase().trim();
    if (upper.length === 2) return upper;
    return STATE_ALIASES[state.toLowerCase()] || '';
}

// Infer state from venue name if missing
const VENUE_STATE_MAP: Record<string, string> = {
    'venetian': 'NV',
    'bellagio': 'NV',
    'aria': 'NV',
    'wynn': 'NV',
    'horseshoe las vegas': 'NV',
    'borgata': 'NJ',
    'seminole hard rock hollywood': 'FL',
    'seminole hard rock tampa': 'FL',
    'commerce casino': 'CA',
    'bicycle casino': 'CA',
    'thunder valley': 'CA',
    'choctaw': 'OK',
    'winstar': 'OK',
    'talking stick': 'AZ',
    'foxwoods': 'CT',
    'mohegan sun': 'CT',
    'parx': 'PA',
    'live! casino': 'MD',
    'mgm national harbor': 'MD',
    'turning stone': 'NY',
    'harrahs cherokee': 'NC',
    'beau rivage': 'MS',
    'horseshoe tunica': 'MS',
    'potawatomi': 'WI',
    'firekeepers': 'MI',
    'the lodge': 'TX',
    'texas card house': 'TX',
};

export function inferStateFromVenue(venueName: string): string {
    const lower = venueName.toLowerCase();
    for (const [venueKey, state] of Object.entries(VENUE_STATE_MAP)) {
        if (lower.includes(venueKey)) {
            return state;
        }
    }
    return '';
}

// Normalize date formats
export function normalizeDate(dateStr: string | null): string {
    if (!dateStr) return '';

    // Try to parse and convert to ISO format
    try {
        // Handle MM/DD/YYYY format
        const mdyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (mdyMatch) {
            const month = mdyMatch[1].padStart(2, '0');
            const day = mdyMatch[2].padStart(2, '0');
            const year = mdyMatch[3];
            return `${year}-${month}-${day}`;
        }

        // Handle YYYY-MM-DD (already ISO)
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            return dateStr.slice(0, 10);
        }

        // Try native Date parsing
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().slice(0, 10);
        }
    } catch {
        // Ignore parse errors
    }

    return dateStr;
}

// Normalize series for consistent format
export function normalizeSeries(series: Partial<Series>): Series {
    let state = normalizeState(series.state);
    if (!state && series.venue_name) {
        state = inferStateFromVenue(series.venue_name);
    }

    return {
        series_uid: series.series_uid || generateSeriesUid(
            series.series_name || '',
            series.venue_name || '',
            series.start_date || ''
        ),
        series_name: (series.series_name || '').trim(),
        venue_name: (series.venue_name || '').trim(),
        city: (series.city || '').trim(),
        state,
        country: 'US',
        start_date: normalizeDate(series.start_date || null),
        end_date: normalizeDate(series.end_date || null),
        event_count: series.event_count ?? null,
        source_url: series.source_url || '',
        source_kind: series.source_kind || 'canonical_pokeratlas_series_directory',
        aliases: series.aliases,
    };
}

// Deduplicate series by UID
export function deduplicateSeries(seriesList: Series[]): Series[] {
    const seen = new Map<string, Series>();

    for (const series of seriesList) {
        const existing = seen.get(series.series_uid);
        if (!existing) {
            seen.set(series.series_uid, series);
        } else {
            // Prefer canonical over inferred
            if (series.source_kind === 'canonical_pokeratlas_series_directory' &&
                existing.source_kind !== 'canonical_pokeratlas_series_directory') {
                seen.set(series.series_uid, {
                    ...series,
                    aliases: [...(series.aliases || []), existing.series_name],
                });
            }
        }
    }

    return Array.from(seen.values());
}

// Deduplicate events by UID
export function deduplicateEvents(events: Event[]): Event[] {
    const seen = new Map<string, Event>();

    for (const event of events) {
        const existing = seen.get(event.event_uid);
        if (!existing) {
            seen.set(event.event_uid, event);
        } else {
            // Prefer canonical sources
            if (event.source_kind === 'canonical_pokeratlas_series_directory' &&
                existing.source_kind !== 'canonical_pokeratlas_series_directory') {
                seen.set(event.event_uid, event);
            }
        }
    }

    return Array.from(seen.values());
}
