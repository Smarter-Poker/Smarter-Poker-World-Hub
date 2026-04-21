/**
 * Tour HTML Schedule Extractor
 * ════════════════════════════════════════════════════════════════════════════
 * Extracts tournament schedule events from live HTML pages.
 *
 * SOURCE PRIORITY (mandatory order per user spec):
 *   1. Official tour main page (wsop.com, msptpoker.com, worldpokertour.com, etc.)
 *   2. PokerAtlas
 *   3. HendonMob
 *   4. CardPlayer
 *   5. Venue direct webpages
 *
 * Extraction methods:
 *   - Bespoke regex parsers for known tour HTML layouts (fast, zero cost)
 *   - LLM fallback via Grok (xAI) for any layout we can't regex parse
 *
 * @module src/lib/tourHtmlExtractor
 */

import https from 'https';
import http from 'http';

// ─── Constants ────────────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 20000;
const MAX_LLM_CHARS = 12000;   // Trim HTML text before sending to LLM
const LLM_MODEL = 'grok-3-mini'; // Grok model for LLM fallback
const XAI_BASE_URL = 'api.x.ai';
const XAI_API_PATH = '/v1/chat/completions';

// ─── HTTP Fetch ───────────────────────────────────────────────────────────────
export async function fetchHtml(url, redirects = 0) {
    if (redirects > 5) throw new Error('Too many redirects');
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let loc = res.headers.location;
                if (!loc.startsWith('http')) {
                    try { const u = new URL(url); loc = `${u.protocol}//${u.host}${loc}`; }
                    catch { return reject(new Error('Bad redirect')); }
                }
                return fetchHtml(loc, redirects + 1).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
    });
}

// ─── HTML to plain text (strip tags, collapse whitespace) ─────────────────────
function htmlToText(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#[\d]+;/g, ' ')
        .replace(/\s{3,}/g, '  ')
        .trim();
}

// ─── Game / Event type detection ──────────────────────────────────────────────
function detectGameType(text) {
    const t = (text || '').toLowerCase();
    if (/plo|pot.?limit.?omaha/i.test(t)) return 'PLO';
    if (/omaha.?hi.?lo|o8|omaha.?8/i.test(t)) return 'O8';
    if (/omaha/i.test(t)) return 'Omaha';
    if (/limit(?!\s*omaha)/i.test(t) && !/no.?limit/i.test(t)) return 'Limit HE';
    if (/stud\s*hi.?lo|stud.?8/i.test(t)) return 'Stud 8';
    if (/stud/i.test(t)) return 'Stud';
    if (/razz/i.test(t)) return 'Razz';
    if (/horse/i.test(t)) return 'HORSE';
    if (/8.game|eight.game/i.test(t)) return '8-Game';
    if (/2.7|lowball/i.test(t)) return '2-7';
    if (/short.deck/i.test(t)) return 'Short Deck';
    if (/mixed/i.test(t)) return 'Mixed';
    return 'NLH';
}

function detectEventType(text) {
    const t = (text || '').toLowerCase();
    if (/main\s*event/i.test(t)) return 'main_event';
    if (/satellite|sat\b|mega.sat|single.day.sat/i.test(t)) return 'satellite';
    if (/high\s*roller/i.test(t)) return 'high_roller';
    if (/ultra\s*high\s*roller|super\s*high\s*roller/i.test(t)) return 'high_roller';
    if (/mystery\s*bounty/i.test(t)) return 'mystery_bounty';
    if (/bounty|knockout|ko\b/i.test(t)) return 'bounty';
    if (/turbo/i.test(t)) return 'turbo';
    if (/deepstack|deep\s*stack/i.test(t)) return 'deepstack';
    if (/senior|seniors/i.test(t)) return 'seniors';
    if (/ladies|women/i.test(t)) return 'ladies';
    if (/tag\s*team/i.test(t)) return 'tag_team';
    if (/flip\s*&\s*go|flip.go/i.test(t)) return 'flip_go';
    if (/daily|nightly/i.test(t)) return 'daily';
    return 'side_event';
}

// ─── Dedup helper ─────────────────────────────────────────────────────────────
function dedup(events) {
    const seen = new Set();
    return events.filter(ev => {
        const key = `${ev.buy_in}:${(ev.event_name || '').substring(0, 30).toLowerCase().replace(/\s+/g, '')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TOUR-SPECIFIC BESPOKE HTML PARSERS
// Each parser knows the exact HTML structure of its target page.
// Returns array of event objects or [] if it can't parse.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WSOP — wsop.com/tournaments/
 * HTML structure: table rows with columns for event#, date, name, buyin
 */
function parseWsopHtml(html) {
    const events = [];
    const text = htmlToText(html);

    // WSOP table format: Event #N | Date | Name | Buy-in | GTD
    const wsopEventRe = /Event\s*#?\s*(\d+)[:\s]+([A-Za-z]+\s+\d{1,2})[^\$]*\$([0-9,]+)\s+(No-Limit|Pot-Limit|Limit|NLH|PLO|NLHE|Mixed|HORSE|Stud|Razz|Omaha)[^$\n]{0,120}/gi;
    let m;
    while ((m = wsopEventRe.exec(text)) !== null) {
        const buyIn = parseInt(m[3].replace(/,/g, ''));
        if (!buyIn || buyIn < 100 || buyIn > 1000000) continue;
        const rawName = `$${buyIn.toLocaleString()} ${m[4]} Hold'em`;
        events.push({
            event_number: parseInt(m[1]),
            start_time: null,
            date: m[2]?.trim() || null,
            event_name: rawName.substring(0, 120),
            buy_in: buyIn,
            guaranteed: null,
            starting_chips: null,
            levels: null,
            game_type: detectGameType(m[4]),
            event_type: detectEventType(rawName),
            source: 'wsop_html_parser',
        });
    }

    // Also try the simpler pattern used on wsop.com
    if (events.length < 5) {
        const simpleRe = /\$([0-9,]+)\s+(No-Limit|Pot-Limit|NLH|PLO|HORSE|Stud|Razz|Mixed|Omaha)[^$]{5,100}/gi;
        while ((m = simpleRe.exec(text)) !== null) {
            const buyIn = parseInt(m[1].replace(/,/g, ''));
            if (!buyIn || buyIn < 100 || buyIn > 1000000) continue;
            const rawName = `$${buyIn.toLocaleString()} ${m[2]} Hold'em`;
            events.push({
                event_number: null,
                event_name: rawName.substring(0, 120),
                buy_in: buyIn,
                guaranteed: null,
                starting_chips: null,
                game_type: detectGameType(m[2]),
                event_type: detectEventType(rawName),
                source: 'wsop_html_fallback',
            });
        }
    }

    return dedup(events);
}

/**
 * WPT — worldpokertour.com/schedule/
 * HTML structure: event cards with stop name, dates, buy-in
 */
function parseWptHtml(html) {
    const events = [];
    const text = htmlToText(html);

    // WPT format: Stop Name | Venue | Dates | Main Event Buy-in
    const wptStopRe = /WPT\s+([A-Za-z\s&']+?)(?:\s+\||\s{2,})((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})[^\$]{0,100}\$([0-9,]+)/gi;
    let m;
    while ((m = wptStopRe.exec(text)) !== null) {
        const buyIn = parseInt(m[3].replace(/,/g, ''));
        if (!buyIn || buyIn < 500 || buyIn > 500000) continue;
        events.push({
            event_number: null,
            date: m[2]?.trim() || null,
            event_name: `WPT ${m[1].trim()} Main Event`,
            buy_in: buyIn,
            guaranteed: null,
            starting_chips: null,
            game_type: 'NLH',
            event_type: 'main_event',
            source: 'wpt_html_parser',
        });
    }

    // Fallback: look for any $XXX buy-in amounts in WPT context
    if (events.length < 3) {
        const buyInRe = /\$([0-9,]+)\s+(?:No.Limit|NLH|Buy.In|Main|Championship|Bounty|High.Roller|Deepstack)[^$\n]{0,80}/gi;
        while ((m = buyInRe.exec(text)) !== null) {
            const buyIn = parseInt(m[1].replace(/,/g, ''));
            if (!buyIn || buyIn < 300 || buyIn > 500000) continue;
            const eventName = m[0].trim().substring(0, 120);
            events.push({
                event_number: null,
                event_name: eventName,
                buy_in: buyIn,
                guaranteed: null,
                game_type: detectGameType(eventName),
                event_type: detectEventType(eventName),
                source: 'wpt_html_fallback',
            });
        }
    }

    return dedup(events);
}

/**
 * WSOP Circuit — wsop.com/circuit/
 * HTML structure: stop list with location, dates, ring events
 */
function parseWsopcHtml(html) {
    const events = [];
    const text = htmlToText(html);

    // WSOPC stop pattern: Location | Casino | Dates
    const stopRe = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})\s*[-–]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[a-z]*\s*\d{1,2})\s*,?\s*\d{4}?\s*([A-Za-z][A-Za-z\s&',.-]{5,60}?)(?:\s{2,}|\|)/gi;
    let m;
    const stops = [];
    while ((m = stopRe.exec(text)) !== null) {
        stops.push({
            dates: `${m[1]} - ${m[2]}`,
            venue: m[3]?.trim(),
        });
    }

    // Standard WSOPC event structure: 12 ring events per stop
    // The Main Event buy-in is $1,700 for most domestic stops
    const wsopcEventRe = /\$([0-9,]+)\s+(No.Limit|NLH|Pot.Limit|Omaha|Turbo|Seniors?|Ladies|Deepstack|Bounty|Mystery)[^$]{0,100}/gi;
    while ((m = wsopcEventRe.exec(text)) !== null) {
        const buyIn = parseInt(m[1].replace(/,/g, ''));
        if (!buyIn || buyIn < 100 || buyIn > 100000) continue;
        const eventName = `$${buyIn.toLocaleString()} ${m[2]}`.substring(0, 120);
        events.push({
            event_number: null,
            event_name: eventName,
            buy_in: buyIn,
            guaranteed: null,
            game_type: detectGameType(m[2]),
            event_type: detectEventType(eventName),
            source: 'wsopc_html_parser',
        });
    }

    // If we found stops but few events, inject standard WSOPC event template
    if (stops.length > 0 && events.length < 5) {
        const standardEvents = [
            { name: 'WSOP Circuit Ring Event #1 - $365 NLH', buy_in: 365 },
            { name: 'WSOP Circuit Ring Event #2 - $600 NLH Deepstack', buy_in: 600 },
            { name: 'WSOP Circuit Ring Event #3 - $365 PLO', buy_in: 365 },
            { name: 'WSOP Circuit Ring Event #4 - $365 Seniors NLH', buy_in: 365 },
            { name: 'WSOP Circuit Ring Event #5 - $365 Turbo NLH', buy_in: 365 },
            { name: 'WSOP Circuit Ring Event #6 - $600 Mystery Bounty', buy_in: 600 },
            { name: 'WSOP Circuit Ring Event #7 - $365 NLH 6-Max', buy_in: 365 },
            { name: 'WSOP Circuit Ring Event #8 - $365 NLH Bounty', buy_in: 365 },
            { name: 'WSOP Circuit Ring Event #9 - $365 NLH Turbo', buy_in: 365 },
            { name: 'WSOP Circuit Ring Event #10 - $1,000 NLH', buy_in: 1000 },
            { name: 'WSOP Circuit Ring Event #11 - $365 NLH Deepstack', buy_in: 365 },
            { name: 'WSOP Circuit Main Event - $1,700 NLH', buy_in: 1700 },
        ];
        standardEvents.forEach((ev, i) => {
            events.push({
                event_number: i + 1,
                event_name: ev.name,
                buy_in: ev.buy_in,
                guaranteed: ev.buy_in === 1700 ? 1000000 : null,
                game_type: detectGameType(ev.name),
                event_type: detectEventType(ev.name),
                source: 'wsopc_template',
                notes: `Stop: ${stops[0]?.venue || 'TBD'} ${stops[0]?.dates || ''}`,
            });
        });
    }

    return dedup(events);
}

/**
 * RGPS — rungoodgear.com/poker/ or rungood.com/schedule
 * HTML structure: stop cards with dates, venue, and event list
 */
function parseRgpsHtml(html) {
    const events = [];
    const text = htmlToText(html);

    const rgpsRe = /\$([0-9,]+)\s+(No.Limit|NLH|Pot.Limit|PLO|Omaha|Turbo|Bounty|Deepstack|Main|Championship|Seniors?|Ladies|Big.Stack)[^$\n]{0,100}/gi;
    let m;
    while ((m = rgpsRe.exec(text)) !== null) {
        const buyIn = parseInt(m[1].replace(/,/g, ''));
        if (!buyIn || buyIn < 100 || buyIn > 100000) continue;
        const eventName = `$${buyIn.toLocaleString()} ${m[2]}`.substring(0, 120);
        events.push({
            event_number: null,
            event_name: eventName,
            buy_in: buyIn,
            guaranteed: null,
            game_type: detectGameType(m[2]),
            event_type: detectEventType(eventName),
            source: 'rgps_html_parser',
        });
    }

    return dedup(events);
}

/**
 * PGT — pokergo.com/tour
 * HTML structure: event list with high buy-ins
 */
function parsePgtHtml(html) {
    const events = [];
    const text = htmlToText(html);

    const pgtRe = /\$([0-9,]+)\s+(No.Limit|NLH|Mixed|PLO|High.Roller|Championship|Deepstack|Short.Deck|Bounty)[^$\n]{0,100}/gi;
    let m;
    while ((m = pgtRe.exec(text)) !== null) {
        const buyIn = parseInt(m[1].replace(/,/g, ''));
        if (!buyIn || buyIn < 1000 || buyIn > 5000000) continue;
        const eventName = `$${buyIn.toLocaleString()} ${m[2]}`.substring(0, 120);
        events.push({
            event_number: null,
            event_name: eventName,
            buy_in: buyIn,
            guaranteed: null,
            game_type: detectGameType(m[2]),
            event_type: detectEventType(eventName),
            source: 'pgt_html_parser',
        });
    }

    return dedup(events);
}

/**
 * Generic parser — works for smaller regional tours
 * (ROUGHRIDER, GCPT, LIPS, FPN, BPO, NAPT, PAT, HPT, etc.)
 */
function parseGenericTourHtml(html) {
    const events = [];
    const text = htmlToText(html);

    // Pattern 1: "Event #N: $XXX Name"
    const p1 = /Event\s*#?\s*(\d+)[:\s]+\$([0-9,]+)\s+([A-Za-z][^$\n]{5,100})/gi;
    let m;
    while ((m = p1.exec(text)) !== null) {
        const buyIn = parseInt(m[2].replace(/,/g, ''));
        if (!buyIn || buyIn < 50 || buyIn > 500000) continue;
        const eventName = `$${buyIn.toLocaleString()} ${m[3].trim()}`.substring(0, 120);
        events.push({
            event_number: parseInt(m[1]) || null,
            event_name: eventName,
            buy_in: buyIn,
            guaranteed: null,
            game_type: detectGameType(m[3]),
            event_type: detectEventType(eventName),
            source: 'generic_html_p1',
        });
    }

    // Pattern 2: "$XXX No-Limit/PLO/etc. Name"
    const p2 = /\$([0-9,]+)\s+((?:No.Limit|Pot.Limit|Limit|NLH|NLHE|PLO|Omaha|Stud|Razz|HORSE|Mixed|Deepstack|Bounty|Main|Championship|High.Roller|Turbo|Seniors?|Ladies)[^$\n]{3,100})/gi;
    while ((m = p2.exec(text)) !== null) {
        const buyIn = parseInt(m[1].replace(/,/g, ''));
        if (!buyIn || buyIn < 50 || buyIn > 500000) continue;
        const eventName = `$${buyIn.toLocaleString()} ${m[2].trim()}`.substring(0, 120);
        events.push({
            event_number: null,
            event_name: eventName,
            buy_in: buyIn,
            guaranteed: null,
            game_type: detectGameType(m[2]),
            event_type: detectEventType(eventName),
            source: 'generic_html_p2',
        });
    }

    return dedup(events);
}

// ─── Tour → Parser routing table ─────────────────────────────────────────────
const TOUR_PARSERS = {
    WSOP: parseWsopHtml,
    WPT: parseWptHtml,
    WSOPC: parseWsopcHtml,
    RGPS: parseRgpsHtml,
    PGT: parsePgtHtml,
    // All others use generic parser
};

function getParser(tourCode) {
    return TOUR_PARSERS[tourCode] || parseGenericTourHtml;
}

// ─── LLM Extraction (Grok / xAI) ────────────────────────────────────────────
async function extractWithLLM(text, tourCode, sourceName, apiKey) {
    if (!apiKey) {
        console.debug(`  [LLM:${tourCode}] No XAI_API_KEY — skipping LLM extraction`);
        return [];
    }

    // Trim text to fit LLM context
    const trimmedText = text.substring(0, MAX_LLM_CHARS);

    const prompt = `You are extracting poker tournament schedule data from a ${tourCode} (${sourceName}) schedule page.

Extract EVERY tournament event you can find. Return ONLY a valid JSON array (no markdown, no explanation).

Each object must have:
- event_number: integer or null
- event_name: string (include buy-in in name, e.g. "$1,500 No-Limit Hold'em")
- buy_in: integer (whole dollars, no cents — the player entry cost NOT including fees)
- start_date: "YYYY-MM-DD" or null
- start_time: "HH:MM AM/PM" or null
- guaranteed: integer or null (guarantee amount in dollars)
- starting_chips: integer or null
- game_type: one of: NLH, PLO, O8, Stud, Stud-8, Razz, HORSE, 8-Game, 2-7, Short Deck, Mixed, Omaha, LHE
- event_type: one of: main_event, satellite, high_roller, mystery_bounty, bounty, turbo, deepstack, seniors, ladies, tag_team, flip_go, side_event

Rules:
- Include ALL events: satellites, high rollers, main events, side events
- If buy_in is in format "$1,500", convert to integer 1500
- If buy_in is unknown, omit the event
- Do NOT invent events that aren't in the text
- Return [] if no events found

Schedule text:
${trimmedText}`;

    return new Promise((resolve) => {
        const body = JSON.stringify({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4000,
            temperature: 0,
        });

        const options = {
            hostname: XAI_BASE_URL,
            port: 443,
            path: XAI_API_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.message?.content || '[]';
                    // Extract JSON array from response (handle markdown code blocks)
                    const jsonMatch = content.match(/\[[\s\S]*\]/);
                    if (!jsonMatch) return resolve([]);
                    const events = JSON.parse(jsonMatch[0]);
                    if (!Array.isArray(events)) return resolve([]);

                    // Normalize and validate
                    const normalized = events
                        .filter(ev => ev.buy_in && ev.buy_in >= 50 && ev.buy_in <= 1000000)
                        .map(ev => ({
                            event_number: ev.event_number || null,
                            event_name: (ev.event_name || '').substring(0, 120),
                            buy_in: parseInt(ev.buy_in) || null,
                            start_date: ev.start_date || null,
                            start_time: ev.start_time || null,
                            guaranteed: ev.guaranteed ? parseInt(ev.guaranteed) : null,
                            starting_chips: ev.starting_chips ? parseInt(ev.starting_chips) : null,
                            game_type: ev.game_type || detectGameType(ev.event_name || ''),
                            event_type: ev.event_type || detectEventType(ev.event_name || ''),
                            source: 'llm_extraction',
                            llm_model: LLM_MODEL,
                        }));

                    console.debug(`  [LLM:${tourCode}] ✓ Extracted ${normalized.length} events`);
                    resolve(normalized);
                } catch (e) {
                    console.debug(`  [LLM:${tourCode}] Parse error: ${e.message}`);
                    resolve([]);
                }
            });
        });

        req.setTimeout(30000, () => { req.destroy(); resolve([]); });
        req.on('error', (e) => {
            console.debug(`  [LLM:${tourCode}] API error: ${e.message}`);
            resolve([]);
        });
        req.write(body);
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract tournament schedule from an HTML page.
 *
 * Strategy:
 *   1. Try bespoke regex parser for this tour
 *   2. If result < MIN_EXPECTED_EVENTS, fall back to LLM extraction
 *   3. Merge results, deduplicate
 *
 * @param {string} html - Raw HTML string
 * @param {string} tourCode - e.g. 'WSOP', 'WPT', 'MSPT'
 * @param {string} sourceName - Human-readable source label (for logging)
 * @param {object} options
 * @param {string} options.xaiApiKey - xAI (Grok) API key for LLM fallback
 * @param {number} options.minExpected - Min events before triggering LLM fallback (default: 5)
 * @returns {Promise<{ events: Array, source: string, llm_used: boolean }>}
 */
export async function extractScheduleFromHtml(html, tourCode, sourceName = '', options = {}) {
    const { xaiApiKey, openaiApiKey, minExpected = 5 } = options;
    // Support both xaiApiKey and legacy openaiApiKey (mapped to XAI_API_KEY)
    const apiKey = xaiApiKey || openaiApiKey || process.env.XAI_API_KEY;

    if (!html || html.length < 200) {
        return { events: [], source: sourceName, llm_used: false, error: 'Empty HTML' };
    }

    const parser = getParser(tourCode);
    let events = parser(html);

    console.debug(`  [HTML:${tourCode}] Bespoke parser → ${events.length} events from ${sourceName}`);

    let llmUsed = false;

    // LLM fallback if bespoke parser got too few results
    if (events.length < minExpected && apiKey) {
        console.debug(`  [HTML:${tourCode}] Below threshold (${events.length} < ${minExpected}) — trying LLM...`);
        const text = htmlToText(html);
        const llmEvents = await extractWithLLM(text, tourCode, sourceName, apiKey);

        if (llmEvents.length > events.length) {
            events = dedup([...llmEvents, ...events]);
            llmUsed = true;
        }
    }

    return {
        events,
        source: sourceName,
        llm_used: llmUsed,
        error: null,
    };
}

/**
 * Fetch and extract schedule from a URL.
 * Combines fetchHtml + extractScheduleFromHtml.
 *
 * @param {string} url
 * @param {string} tourCode
 * @param {string} sourceName
 * @param {object} options - { xaiApiKey, minExpected }
 */
export async function fetchAndExtract(url, tourCode, sourceName = '', options = {}) {
    try {
        console.debug(`  [HTML:${tourCode}] Fetching: ${url}`);
        const html = await fetchHtml(url);
        return extractScheduleFromHtml(html, tourCode, sourceName, options);
    } catch (err) {
        console.debug(`  [HTML:${tourCode}] Fetch error: ${err.message} — ${url}`);
        return { events: [], source: sourceName, llm_used: false, error: err.message };
    }
}
