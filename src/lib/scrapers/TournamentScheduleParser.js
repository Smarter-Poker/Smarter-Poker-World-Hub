/**
 * Tournament Schedule Parser
 * Parses tournament schedules from various formats:
 * - HTML tables
 * - PDF schedules
 * - JSON APIs
 * - Plain text
 */

import { createClient } from '@supabase/supabase-js';

// Common tournament types
export const TOURNAMENT_TYPES = {
    NLHE: 'No-Limit Hold\'em',
    PLO: 'Pot-Limit Omaha',
    PLO8: 'PLO Hi-Lo',
    MIXED: 'Mixed Games',
    STUD: 'Seven Card Stud',
    HORSE: 'H.O.R.S.E.',
    BOUNTY: 'Bounty',
    SATELLITE: 'Satellite',
    FREEROLL: 'Freeroll',
    DEEPSTACK: 'Deep Stack',
    TURBO: 'Turbo',
    SUPER_TURBO: 'Super Turbo'
};

// Day mappings
const DAY_MAPPINGS = {
    'sun': 0, 'sunday': 0,
    'mon': 1, 'monday': 1,
    'tue': 2, 'tues': 2, 'tuesday': 2,
    'wed': 3, 'weds': 3, 'wednesday': 3,
    'thu': 4, 'thur': 4, 'thurs': 4, 'thursday': 4,
    'fri': 5, 'friday': 5,
    'sat': 6, 'saturday': 6
};

export class TournamentScheduleParser {
    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
    }

    /**
     * Parse a buy-in string to extract amount and fee
     * Examples: "$60+$15", "$75", "$100 + $25 fee"
     */
    parseBuyin(buyinStr) {
        if (!buyinStr) return { buyin: null, fee: null, total: null };

        const cleaned = buyinStr.replace(/[$,]/g, '').trim();

        // Pattern: "60+15" or "60 + 15"
        const splitPattern = /(\d+)\s*\+\s*(\d+)/;
        const match = cleaned.match(splitPattern);

        if (match) {
            const buyin = parseInt(match[1]);
            const fee = parseInt(match[2]);
            return { buyin, fee, total: buyin + fee };
        }

        // Single number
        const singleMatch = cleaned.match(/(\d+)/);
        if (singleMatch) {
            const total = parseInt(singleMatch[1]);
            // Estimate 15% fee for house
            const fee = Math.round(total * 0.15);
            const buyin = total - fee;
            return { buyin, fee, total };
        }

        return { buyin: null, fee: null, total: null };
    }

    /**
     * Parse a time string
     * Examples: "7:00 PM", "7pm", "19:00", "noon"
     */
    parseTime(timeStr) {
        if (!timeStr) return null;

        const cleaned = timeStr.toLowerCase().trim();

        // Special cases
        if (cleaned === 'noon') return '12:00';
        if (cleaned === 'midnight') return '00:00';

        // 12-hour format: "7:00 PM", "7pm", "7:00pm"
        const twelveHourMatch = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (twelveHourMatch) {
            let hours = parseInt(twelveHourMatch[1]);
            const minutes = twelveHourMatch[2] ? parseInt(twelveHourMatch[2]) : 0;
            const period = twelveHourMatch[3].toLowerCase();

            if (period === 'pm' && hours !== 12) hours += 12;
            if (period === 'am' && hours === 12) hours = 0;

            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }

        // 24-hour format: "19:00"
        const twentyFourMatch = cleaned.match(/(\d{1,2}):(\d{2})/);
        if (twentyFourMatch) {
            const hours = parseInt(twentyFourMatch[1]);
            const minutes = parseInt(twentyFourMatch[2]);
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }

        return null;
    }

    /**
     * Parse day(s) of week
     * Examples: "Monday", "Mon-Wed-Fri", "Daily", "Weekends"
     */
    parseDays(dayStr) {
        if (!dayStr) return [];

        const cleaned = dayStr.toLowerCase().trim();

        // Special cases
        if (cleaned === 'daily' || cleaned === 'everyday') {
            return [0, 1, 2, 3, 4, 5, 6];
        }
        if (cleaned === 'weekdays') {
            return [1, 2, 3, 4, 5];
        }
        if (cleaned === 'weekends') {
            return [0, 6];
        }

        // Split by common delimiters
        const parts = cleaned.split(/[,\-\/&]/);
        const days = [];

        for (const part of parts) {
            const trimmed = part.trim();
            if (DAY_MAPPINGS[trimmed] !== undefined) {
                days.push(DAY_MAPPINGS[trimmed]);
            }
        }

        return [...new Set(days)].sort();
    }

    /**
     * Parse guarantee amount
     * Examples: "$5,000 GTD", "5K Guaranteed", "$10,000"
     */
    parseGuarantee(guaranteeStr) {
        if (!guaranteeStr) return null;

        const cleaned = guaranteeStr.replace(/[$,]/g, '').trim().toLowerCase();

        // Handle "K" for thousands, "M" for millions
        const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k/i);
        if (kMatch) {
            return parseFloat(kMatch[1]) * 1000;
        }

        const mMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*m/i);
        if (mMatch) {
            return parseFloat(mMatch[1]) * 1000000;
        }

        // Plain number
        const numMatch = cleaned.match(/(\d+)/);
        if (numMatch) {
            return parseInt(numMatch[1]);
        }

        return null;
    }

    /**
     * Parse starting chips
     * Examples: "10,000", "10K", "15000"
     */
    parseStartingChips(chipsStr) {
        if (!chipsStr) return null;

        const cleaned = chipsStr.replace(/,/g, '').trim().toLowerCase();

        const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k/i);
        if (kMatch) {
            return parseFloat(kMatch[1]) * 1000;
        }

        const numMatch = cleaned.match(/(\d+)/);
        if (numMatch) {
            return parseInt(numMatch[1]);
        }

        return null;
    }

    /**
     * Detect tournament type from name
     */
    detectTournamentType(name) {
        if (!name) return 'nlhe';

        const lower = name.toLowerCase();

        if (lower.includes('plo8') || lower.includes('omaha hi-lo') || lower.includes('omaha h/l')) {
            return 'plo8';
        }
        if (lower.includes('plo') || lower.includes('omaha')) {
            return 'plo';
        }
        if (lower.includes('horse') || lower.includes('h.o.r.s.e')) {
            return 'mixed';
        }
        if (lower.includes('mixed')) {
            return 'mixed';
        }
        if (lower.includes('stud')) {
            return 'stud';
        }

        return 'nlhe';
    }

    /**
     * Parse an HTML table row into tournament data
     */
    parseTableRow(row, columnMapping) {
        const cells = row.querySelectorAll ? row.querySelectorAll('td') : [];

        const getValue = (key) => {
            const index = columnMapping[key];
            if (index !== undefined && cells[index]) {
                return cells[index].textContent?.trim() || '';
            }
            return '';
        };

        const nameOrDay = getValue('name') || getValue('day');
        const timeStr = getValue('time');
        const buyinStr = getValue('buyin');
        const guaranteeStr = getValue('guarantee');
        const chipsStr = getValue('chips') || getValue('starting');

        const buyin = this.parseBuyin(buyinStr);
        const time = this.parseTime(timeStr);
        const days = this.parseDays(getValue('day') || getValue('days'));
        const guarantee = this.parseGuarantee(guaranteeStr);
        const startingChips = this.parseStartingChips(chipsStr);
        const gameType = this.detectTournamentType(nameOrDay);

        return {
            name: nameOrDay,
            game_type: gameType,
            days_of_week: days,
            start_time: time,
            buyin_amount: buyin.buyin,
            buyin_fee: buyin.fee,
            total_buyin: buyin.total,
            guarantee,
            starting_chips: startingChips,
            raw_data: {
                name: nameOrDay,
                time: timeStr,
                buyin: buyinStr,
                guarantee: guaranteeStr,
                chips: chipsStr
            }
        };
    }

    /**
     * Parse a full tournament schedule from structured data
     */
    parseSchedule(data, format = 'object') {
        const tournaments = [];

        if (format === 'object' && Array.isArray(data)) {
            for (const item of data) {
                try {
                    const buyin = this.parseBuyin(item.buyin || item.buy_in);
                    const time = this.parseTime(item.time || item.start_time);
                    const days = this.parseDays(item.day || item.days);
                    const guarantee = this.parseGuarantee(item.guarantee || item.gtd);
                    const startingChips = this.parseStartingChips(item.chips || item.starting_chips);

                    tournaments.push({
                        name: item.name || item.tournament_name || 'Tournament',
                        game_type: this.detectTournamentType(item.name),
                        days_of_week: days,
                        start_time: time,
                        buyin_amount: buyin.buyin,
                        buyin_fee: buyin.fee,
                        total_buyin: buyin.total,
                        guarantee,
                        starting_chips: startingChips,
                        notes: item.notes || null
                    });
                } catch (error) {
                    console.warn('Error parsing tournament:', error);
                }
            }
        }

        return tournaments;
    }

    /**
     * Save parsed tournaments to database
     */
    async saveTournaments(venueId, tournaments, source = 'parser') {
        try {
            // Clear existing future tournaments from this source
            const { error: err_venue_tournament_schedules_huu3g } = await this.supabase
              .from('venue_tournament_schedules')
              .delete()
                .eq('venue_id', venueId)
                .eq('source', source);
            if (err_venue_tournament_schedules_huu3g) console.warn('[Supabase] Silent mutation failed in venue_tournament_schedules:', err_venue_tournament_schedules_huu3g.message);

            if (tournaments.length === 0) {
                return { saved: 0 };
            }

            // Insert new tournaments
            const { data, error } = await this.supabase
                .from('venue_tournament_schedules')
                .insert(tournaments.map(t => ({
                    venue_id: venueId,
                    ...t,
                    source,
                    created_at: new Date().toISOString()
                })))
                .select();

            if (error) throw error;

            return { saved: data?.length || 0 };
        } catch (error) {
            console.warn('Error saving tournaments:', error);
            throw error;
        }
    }
}

export default TournamentScheduleParser;
