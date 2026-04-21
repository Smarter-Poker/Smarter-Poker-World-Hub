/**
 * Tour PDF Extractor
 * ═══════════════════════════════════════════════════════════
 * Downloads and parses poker tour schedule PDFs.
 *
 * Handles formats like:
 *   - MSPT: https://msptpoker.com/showpdf.aspx?eventID=588
 *   - Any direct *.pdf URL in tour sources
 *   - Schedule pages that embed or link to PDF downloads
 *
 * Extracted fields per event (MSPT-style):
 *   date, day_of_week, event_number, start_time, reg_open_time,
 *   event_name, buy_in, guaranteed, starting_chips, levels,
 *   flights, game_type, event_type, notes
 *
 * Usage:
 *   import { extractPdfSchedule, isPdfUrl, findPdfLinks } from '@/lib/tourPdfExtractor';
 *   const events = await extractPdfSchedule('https://msptpoker.com/showpdf.aspx?eventID=588');
 */

import https from 'https';
import http from 'http';

// ─── Config ───────────────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 30000;
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10MB hard cap

/**
 * Check if a URL is likely a PDF or PDF viewer
 */
export function isPdfUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
        lower.endsWith('.pdf') ||
        lower.includes('showpdf') ||
        lower.includes('/pdf/') ||
        lower.includes('download_pdf') ||
        lower.includes('schedule.pdf') ||
        lower.includes('brochure.pdf') ||
        lower.includes('flyer.pdf')
    );
}

/**
 * Find PDF links embedded in an HTML page
 * Returns array of absolute PDF URLs
 */
export function findPdfLinks(html, baseUrl) {
    if (!html) return [];
    const links = [];
    const seen = new Set();

    // Match href/src attributes pointing to PDFs
    const patterns = [
        /href=["']([^"']*\.pdf[^"']*)/gi,
        /href=["']([^"']*showpdf[^"']*)/gi,
        /href=["']([^"']*\/pdf\/[^"']*)/gi,
        /href=["']([^"']*download[^"']*\.pdf[^"']*)/gi,
        /"url":\s*"([^"]*\.pdf[^"]*)"/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            let url = match[1];
            if (!url) continue;

            // Make absolute
            if (url.startsWith('//')) {
                url = 'https:' + url;
            } else if (url.startsWith('/')) {
                try {
                    const base = new URL(baseUrl);
                    url = `${base.protocol}//${base.host}${url}`;
                } catch { continue; }
            } else if (!url.startsWith('http')) {
                continue;
            }

            if (!seen.has(url)) {
                seen.add(url);
                links.push(url);
            }
        }
    }

    return links;
}

/**
 * Download binary content from a URL (follows redirects)
 * Returns Buffer or throws on error
 */
async function downloadBinary(url, redirects = 0) {
    if (redirects > 5) throw new Error('Too many redirects');

    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/pdf,application/octet-stream,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        }, (response) => {
            // Follow redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    try {
                        const u = new URL(url);
                        redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
                    } catch { return reject(new Error('Bad redirect URL')); }
                }
                return downloadBinary(redirectUrl, redirects + 1).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode} from ${url}`));
            }

            const chunks = [];
            let totalSize = 0;

            response.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_PDF_SIZE_BYTES) {
                    request.destroy();
                    reject(new Error(`PDF too large (>${MAX_PDF_SIZE_BYTES / 1024 / 1024}MB)`));
                    return;
                }
                chunks.push(chunk);
            });

            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        });

        request.setTimeout(REQUEST_TIMEOUT_MS, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });

        request.on('error', reject);
    });
}

/**
 * Parse tournament schedule events from raw PDF text.
 */
function parseScheduleText(rawText) {
    const events = [];
    const seen = new Set();
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    
    // Each valid event line looks like:
    // "1 4:00 PM $400 Tag Team Kickoff NLH ($200/player) 7:00 PM 20,000 20 ..."
    // OR: "16A 2:00 PM $1,110 Main Event NLH Day 1A (2-Day)"
    
    const eventLineRe = /^(\d{1,3}[A-C]?)\s+(\d{1,2}:\d{2}\s*[AP]M)\s+(\$[\d,]+)\s+(.{5,100}?)(?:\s+\d{1,2}:\d{2}\s*[AP]M|\s+\$[\d,]+,\d{3}|\s*$)/i;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = eventLineRe.exec(line);
        if (!m) continue;
        
        const evNumRaw = m[1];
        const startTime = m[2].trim();
        const buyInStr = m[3].replace(/[,$]/g, '');
        const buyIn = parseInt(buyInStr);
        const rawDesc = m[4].trim();
        
        if (!buyIn || buyIn < 50 || buyIn > 500000) continue;
        if (rawDesc.length < 4) continue;
        
        const eventName = `$${buyIn.toLocaleString()} ${rawDesc}`.substring(0, 120);
        const lookAhead = [line, i+1 < lines.length ? lines[i+1] : '', i+2 < lines.length ? lines[i+2] : ''].join(' ');
        
        let gtd = null;
        const gtdMatch = lookAhead.match(/\$([\d,]{5,})\s+(?:guaranteed|GTD)?/i) || lookAhead.match(/\$([1-9][\d,]{3,})\s*\d{2,3},\d{3}/);
        if (gtdMatch) {
            gtd = parseInt(gtdMatch[1].replace(/,/g, ''));
            if (gtd < 5000 || gtd > 50000000) gtd = null;
        }
        
        let chips = null;
        const chipsMatch = lookAhead.match(/\b([\d]{2,3},\d{3})\b/g);
        if (chipsMatch) {
            for (const cm of chipsMatch) {
                const n = parseInt(cm.replace(/,/g, ''));
                if (n >= 5000 && n <= 500000 && n % 1000 === 0) { chips = n; break; }
            }
        }
        
        let levels = null;
        const levMatch = lookAhead.match(/\b(\d{2})\s+(?:🏆|POY|🃏|$)/);
        if (levMatch) levels = parseInt(levMatch[1]);
        
        const dedupKey = `${buyIn}:${rawDesc.substring(0, 25).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        
        events.push({
            event_number: parseInt(evNumRaw) || null,
            event_number_raw: evNumRaw,
            start_time: startTime,
            event_name: eventName,
            buy_in: buyIn,
            guaranteed: gtd,
            starting_chips: chips,
            levels: levels,
            game_type: detectGameType(rawDesc),
            event_type: detectEventType(rawDesc),
            source: 'pdf_extraction'
        });
    }
    
    if (events.length === 0) {
        return parseScheduleTextFallback(rawText);
    }
    
    return events;
}

/**
 * Fallback parser for non-MSPT PDF formats.
 * Uses pure regex on the full text block.
 */
function parseScheduleTextFallback(rawText) {
    const events = [];
    const text = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ');

    // Pattern: buy-in followed by event name
    const patterns = [
        // "$1,500 No-Limit Hold'em Monster Stack" style
        /\$([0-9,]+)\s+((?:No-Limit|Pot-Limit|Limit|NLH|PLO|Omaha|Hold|Stud|Razz|HORSE|Mixed|Deepstack|Bounty|Championship|Main Event|High Roller|Mystery|Turbo|Super|Mega|Monster|Flash|Seniors?|Ladies)[^$\n.]{3,100})/gi,
        // "Event #5: $2,500 Name" style
        /Event\s*#?\s*(\d+)[:\s]+\$([0-9,]+)\s+([A-Za-z][^$\n]{5,100})/gi,
        // "$Amount Name – Date" style
        /\$([0-9,]+)\s+([A-Za-z][^–$\n]{10,80})\s*[–-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            let buyIn, eventName, eventNum = null;

            if (pattern.source.startsWith('Event')) {
                eventNum = parseInt(match[1]);
                buyIn = parseInt(match[2].replace(/,/g, ''));
                eventName = match[3].trim().substring(0, 120);
            } else {
                buyIn = parseInt(match[1].replace(/,/g, ''));
                eventName = (match[2] || '').trim().substring(0, 120);
            }

            if (!buyIn || buyIn < 50 || buyIn > 500000 || !eventName || eventName.length < 5) continue;

            // Deduplicate
            const exists = events.some(e =>
                e.event_name.toLowerCase().startsWith(eventName.toLowerCase().substring(0, 20)) &&
                e.buy_in === buyIn
            );

            if (!exists) {
                // Extract date from surrounding context
                const contextStart = Math.max(0, match.index - 200);
                const context = text.substring(contextStart, match.index + match[0].length + 50);
                const dateMatch = context.match(/((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})/);
                const timeMatch = context.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
                const gtdMatch = context.match(/\$?([0-9,]+(?:K|M)?)\s*(?:GTD|Guaranteed)/i);
                const chipsMatch = context.match(/\b([1-9][0-9]{0,2},[0-9]{3})\b/);
                const levelsMatch = context.match(/(?:Levels?|Blinds?)\D*(\d{2,3})/i) || context.match(/(\d{2})\s*min/i);

                let guaranteed = null;
                if (gtdMatch) {
                    const g = gtdMatch[1].replace(/,/g, '');
                    if (g.endsWith('K')) guaranteed = parseInt(g) * 1000;
                    else if (g.endsWith('M')) guaranteed = parseInt(g) * 1000000;
                    else guaranteed = parseInt(g);
                }

                let startingChips = null;
                if (chipsMatch) {
                    const c = parseInt(chipsMatch[1].replace(/,/g, ''));
                    if (c >= 5000 && c <= 1000000) startingChips = c;
                }

                events.push({
                    event_number: eventNum,
                    event_name: eventName,
                    buy_in: buyIn,
                    date: dateMatch?.[1] || null,
                    start_time: timeMatch?.[1] || null,
                    guaranteed: guaranteed,
                    starting_chips: startingChips,
                    levels: levelsMatch?.[1] ? parseInt(levelsMatch[1]) : null,
                    game_type: detectGameType(eventName),
                    event_type: detectEventType(eventName),
                    source: 'pdf_fallback_extraction'
                });
            }
        }
    }

    return events;
}

function detectGameType(text) {
    const t = (text || '').toLowerCase();
    if (/plo|pot.?limit.?omaha/i.test(t)) return 'PLO';
    if (/omaha.?hi.?lo|o8|omaha.?8/i.test(t)) return 'O8';
    if (/omaha/i.test(t)) return 'Omaha';
    if (/limit(?!\s*omaha)/i.test(t) && !/no.?limit/i.test(t)) return 'Limit HE';
    if (/stud/i.test(t)) return 'Stud';
    if (/razz/i.test(t)) return 'Razz';
    if (/horse/i.test(t)) return 'HORSE';
    if (/8.game|eight.game/i.test(t)) return '8-Game';
    if (/mixed/i.test(t)) return 'Mixed';
    return 'NLH';
}

function detectEventType(text) {
    const t = (text || '').toLowerCase();
    if (/main\s*event/i.test(t)) return 'main_event';
    if (/satellite|sat\b/i.test(t)) return 'satellite';
    if (/high\s*roller/i.test(t)) return 'high_roller';
    if (/mystery\s*bounty/i.test(t)) return 'mystery_bounty';
    if (/bounty|knockout|ko\b/i.test(t)) return 'bounty';
    if (/turbo/i.test(t)) return 'turbo';
    if (/deepstack|deep\s*stack/i.test(t)) return 'deepstack';
    if (/senior|seniors/i.test(t)) return 'seniors';
    if (/ladies|women/i.test(t)) return 'ladies';
    if (/tag\s*team/i.test(t)) return 'tag_team';
    if (/daily|nightly/i.test(t)) return 'daily';
    return 'side_event';
}

/**
 * Main entry point: Download and extract schedule from a PDF URL.
 *
 * @param {string} pdfUrl - URL of the PDF (direct or viewer URL)
 * @param {object} options
 * @param {string} options.tourCode - Tour code for logging (e.g., 'MSPT')
 * @param {string} options.seriesName - Series name context
 * @returns {Promise<{ events: Array, pages: number, rawTextLength: number, error: string|null }>}
 */
export async function extractPdfSchedule(pdfUrl, options = {}) {
    const { tourCode = 'UNKNOWN', seriesName = '' } = options;

    console.debug(`  [PDF] Downloading: ${pdfUrl}`);

    try {
        // Download binary
        const buffer = await downloadBinary(pdfUrl);

        if (buffer.length < 100) {
            return { events: [], pages: 0, rawTextLength: 0, error: 'PDF too small — likely an error page' };
        }

        // Verify it's actually a PDF
        const header = buffer.slice(0, 5).toString('ascii');
        if (!header.startsWith('%PDF')) {
            return { events: [], pages: 0, rawTextLength: 0, error: `Not a valid PDF (header: ${header})` };
        }

        console.debug(`  [PDF] Downloaded ${(buffer.length / 1024).toFixed(1)}KB — parsing...`);

        let pdfData;
        try {
            // pdf-parse v2 requires instantiation with URL
            const { PDFParse } = await import('pdf-parse');
            const parser = new PDFParse({ url: pdfUrl });
            const result = await parser.getText();
            pdfData = {
                text: result.text || '',
                numpages: result.pages ? result.pages.length : (result.numpages || 1)
            };
        } catch (parseErr) {
            console.debug(`  [PDF] pdf-parse v2 failed: ${parseErr.message}, trying fallback`);
            // Fallback: extract embedded text directly from buffer
            const rawStr = buffer.toString('latin1');
            const textBlocks = rawStr.match(/\(([^)]{2,200})\)/g) || [];
            const fallbackText = textBlocks
                .map(b => b.slice(1, -1))
                .filter(b => /\w/.test(b))
                .join('\n');
            pdfData = { text: fallbackText, numpages: 1 };
        }

        const rawText = pdfData.text || '';
        const numPages = pdfData.numpages || 0;

        console.debug(`  [PDF] ${numPages} pages, ${rawText.length} chars of text`);

        if (rawText.length < 50) {
            return { events: [], pages: numPages, rawTextLength: rawText.length, error: 'PDF text extraction yielded no content (may be scanned/image-only PDF)' };
        }

        // Parse events from extracted text
        const events = parseScheduleText(rawText);

        // Attach series context to all events
        events.forEach(ev => {
            if (seriesName) ev.series_name = seriesName;
            if (tourCode) ev.tour_code = tourCode;
            ev.pdf_source_url = pdfUrl;
        });

        console.debug(`  [PDF] Extracted ${events.length} events from ${numPages} pages`);

        return {
            events,
            pages: numPages,
            raw_text: rawText,
            rawTextLength: rawText.length,
            error: null
        };

    } catch (err) {
        console.debug(`  [PDF] Error: ${err.message}`);
        return {
            events: [],
            pages: 0,
            rawTextLength: 0,
            error: err.message
        };
    }
}

/**
 * Scrape an MSPT schedule page and collect all PDF links for each stop.
 * MSPT pattern: main schedule page links to individual stop PDFs.
 *
 * @param {string} html - HTML of the schedule page
 * @param {string} baseUrl - Base URL for making links absolute
 * @returns {Array<{ stopName: string, pdfUrl: string }>}
 */
export function extractMsptPdfLinks(html, baseUrl) {
    const entries = [];
    if (!html) return entries;

    // MSPT PDF pattern: showpdf.aspx?eventID=NNN
    const pdfPattern = /href=["']([^"']*showpdf\.aspx\?eventID=\d+[^"']*)/gi;
    const namePattern = /<[^>]+class="[^"]*(?:event|stop|title)[^"]*"[^>]*>([^<]{5,100})<\//gi;

    // Collect all PDF links
    const pdfLinks = [];
    let match;
    while ((match = pdfPattern.exec(html)) !== null) {
        let url = match[1];
        if (url.startsWith('/')) {
            try {
                const base = new URL(baseUrl);
                url = `${base.protocol}//${base.host}${url}`;
            } catch { continue; }
        } else if (!url.startsWith('http')) {
            url = `https://msptpoker.com${url.startsWith('/') ? '' : '/'}${url}`;
        }
        pdfLinks.push(url);
    }

    // Collect stop names from context (simplified — use href text)
    const linkContextPattern = /href=["'][^"']*showpdf\.aspx\?eventID=\d+[^"']*["'][^>]*>([^<]{3,80})</gi;
    let nameIdx = 0;
    while ((match = linkContextPattern.exec(html)) !== null) {
        const stopName = match[1].trim();
        if (pdfLinks[nameIdx]) {
            entries.push({ stopName, pdfUrl: pdfLinks[nameIdx] });
            nameIdx++;
        }
    }

    // If name extraction missed some, fill with generic names
    while (nameIdx < pdfLinks.length) {
        entries.push({ stopName: `Stop ${nameIdx + 1}`, pdfUrl: pdfLinks[nameIdx] });
        nameIdx++;
    }

    return entries;
}
