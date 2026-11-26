/**
 * Tournament calendar feed (`/api/news/calendar-ics?tid=<uuid>`).
 *
 * Serves an RFC 5545 `.ics` file (CRLF line endings, folded at 75 octets) for one
 * Smarter.Poker Club Arena tournament so Weekly Wire readers can add it to any
 * calendar app. Reads `public.tournaments` only (no profiles, no retired
 * `club_tournaments`). Chips are never written with a currency symbol.
 */

// The shared Supabase/rate-limit modules re-export extensionless package paths that only the Next
// bundler resolves. They are loaded lazily inside the handler so the pure RFC 5545 builders below
// (`buildTournamentIcs`, etc.) stay importable by plain-Node unit tests.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOURNAMENT_COLUMNS =
    'id, name, club_id, game_type, buy_in_amount, buy_in_fee, guaranteed_prize, prize_pool, start_time, status, updated_at, created_at';

const ICS_LOCATION = 'Smarter.Poker Kings Club (Club 25450)';
const ICS_URL = 'https://smarter.poker/hub/club-arena/?join=25450';
const DURATION_MS = 2 * 60 * 60 * 1000;

const GAME_TYPE_LABELS = {
    NLH: 'No-Limit Hold\'em',
    NLHE: 'No-Limit Hold\'em',
    HOLDEM: 'No-Limit Hold\'em',
    PLO: 'Pot-Limit Omaha',
    PLO4: 'Pot-Limit Omaha (4 Cards)',
    PLO5: 'Pot-Limit Omaha (5 Cards)',
    OMAHA: 'Pot-Limit Omaha',
};

let _supabase = null;
async function getSupabase() {
    if (!_supabase) {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/** Escape TEXT per RFC 5545 section 3.3.11. */
export function escapeIcsText(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line at 75 octets (RFC 5545 section 3.1) without splitting multi-byte characters. */
export function foldIcsLine(line) {
    if (Buffer.byteLength(line, 'utf8') <= 75) return line;
    const parts = [];
    let current = '';
    let currentBytes = 0;
    let limit = 75;
    for (const ch of Array.from(line)) {
        const bytes = Buffer.byteLength(ch, 'utf8');
        if (currentBytes + bytes > limit) {
            parts.push(current);
            current = ch;
            currentBytes = bytes;
            limit = 74; // continuation lines begin with one space
        } else {
            current += ch;
            currentBytes += bytes;
        }
    }
    if (current) parts.push(current);
    return parts.join('\r\n ');
}

export function formatIcsUtc(date) {
    const d = date instanceof Date ? date : new Date(date);
    const pad = (v) => String(v).padStart(2, '0');
    return (
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
    );
}

export function formatBuyIn(tournament) {
    const buyIn = Number(tournament?.buy_in_amount || 0);
    const fee = Number(tournament?.buy_in_fee || 0);
    if (!(buyIn > 0)) return 'Freeroll';
    return `${buyIn}${fee > 0 ? " + " + fee : ""} Chips`;
}

export function formatGuarantee(tournament) {
    const gtd = Number(tournament?.guaranteed_prize || 0);
    return gtd > 0 ? `${gtd.toLocaleString('en-US')} Chips GTD` : '';
}

/** Build the RFC 5545 calendar body (CRLF terminated) for a tournament row, or `null` when it cannot be scheduled. */
export function buildTournamentIcs(tournament, { now = new Date() } = {}) {
    if (!tournament || !tournament.id) return null;
    if (String(tournament.status || '').toUpperCase() === 'CANCELLED') return null;
    const start = new Date(tournament.start_time);
    if (!tournament.start_time || Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + DURATION_MS);

    const rawStamp = tournament.updated_at || tournament.created_at || tournament.start_time;
    let stampDate = null;
    if (rawStamp) {
        const parsed = new Date(rawStamp);
        if (!Number.isNaN(parsed.getTime())) stampDate = parsed;
    }
    const dtstamp = stampDate || (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date());

    const name = String(tournament.name || '').trim() || 'Smarter.Poker Tournament';
    const gameKey = String(tournament.game_type || '').trim().toUpperCase();
    const gameLabel = GAME_TYPE_LABELS[gameKey] || String(tournament.game_type || '').trim();
    const guarantee = formatGuarantee(tournament);

    const descriptionLines = [name];
    if (gameLabel) descriptionLines.push(`Game: ${gameLabel}`);
    descriptionLines.push(`Buy-in: ${formatBuyIn(tournament)}`);
    if (guarantee) descriptionLines.push(`Guaranteed: ${guarantee}`);
    descriptionLines.push('Join in Club Arena: ' + ICS_URL);

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Smarter.Poker//Club Arena//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${tournament.id}@smarter.poker`,
        `DTSTAMP:${formatIcsUtc(dtstamp)}`,
        'SEQUENCE:0',
        `DTSTART:${formatIcsUtc(start)}`,
        `DTEND:${formatIcsUtc(end)}`,
        `SUMMARY:${escapeIcsText(name)}`,
        `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
        `LOCATION:${escapeIcsText(ICS_LOCATION)}`,
        `URL:${ICS_URL}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'DESCRIPTION:Tournament Starting In 15 Minutes',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

const firstQuery = (val) => (Array.isArray(val) ? String(val[0] || '') : val == null ? '' : String(val));

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    const { applyRateLimit, LIMITS } = await import('../../../src/lib/apiRateLimit.js');
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const tid = firstQuery(req.query?.tid).trim();
    if (!UUID_RE.test(tid)) {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(400).json({ error: 'INVALID_TID', message: 'A valid tournament id is required.' });
    }

    let tournament = null;
    try {
        const supabase = req._supabase || (await getSupabase());
        const { data, error } = await supabase
            .from('tournaments')
            .select(TOURNAMENT_COLUMNS)
            .eq('id', tid)
            .maybeSingle();
        if (error) throw error;
        tournament = data || null;
    } catch {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(500).json({ error: 'CALENDAR_UNAVAILABLE', message: 'Tournament lookup failed.' });
    }

    const ics = buildTournamentIcs(tournament);
    if (!ics) {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(404).json({ error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament is unavailable.' });
    }

    const shortId = tournament.id.slice(0, 8).toLowerCase();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="smarter-poker-tournament-${shortId}.ics"`);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(Buffer.byteLength(ics, 'utf8')));
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(ics);
}
