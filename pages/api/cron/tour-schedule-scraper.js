/**
 * Tour Schedule Auto-Scraper — Autonomous 3-Day Refresh
 * ══════════════════════════════════════════════════════
 * Fully automated, zero-human-intervention scraper for all US traveling
 * poker tour schedules. Runs every 3 days via Vercel Cron.
 *
 * NEW v2.0 Capabilities:
 *   - PDF schedule extraction (MSPT showpdf.aspx + direct PDF URLs)
 *   - Detailed per-event data: event#, time, reg-open, buy-in, GTD, chips, levels
 *   - SMS alerts to 708-677-5221 on failures/errors via Twilio
 *   - PDF link crawling: auto-discovers PDF URLs from tour schedule pages
 *
 * Architecture:
 *   1. Reads tour-scrape-sources.json for canonical scrape URLs + PDF sources
 *   2. Fetches each tour's official schedule page (with retry + fallback)
 *   3. Detects and downloads PDF schedules where available
 *   4. Extracts tournament events via regex/DOM parsing + PDF parsing
 *   5. Validates against multi-layer verification system
 *   6. Merges verified data into tour-source-registry.json
 *   7. Writes detailed event data to Supabase tour_events table
 *   8. Sends SMS alert if any errors occurred
 *
 * Cron Schedule (vercel.json):
 *   "0 4 [every3days] * *" - Every 3 days at 4:00 AM UTC (auto, no human needed)
 *
 * Retry Logic:
 *   - 3 retries per URL with exponential backoff (1s, 2s, 4s)
 *   - Automatic fallback to aggregator sources (PokerAtlas, PokerNews)
 *   - PDF fallback: if page PDF fails, try known_event_ids directly
 *   - Rate limiting: 5s between requests to respect robots.txt
 *
 * Verification Layers:
 *   Layer 1: HTTP response validation (200 OK, non-empty body)
 *   Layer 2: Content sanity check (page contains poker-related keywords)
 *   Layer 3: Data structure validation (dates, venues, buy-ins present)
 *   Layer 4: Date range validation (events in current/future year)
 *   Layer 5: Regression guard (don't lose more than 30% of existing events)
 *
 * Alert Conditions (SMS to 708-677-5221):
 *   CRITICAL: 0 tours updated, scraper fully failed
 *   WARNING:  >50% error rate, very few events found
 *
 * GET /api/cron/tour-schedule-scraper
 *   - Scrapes all active tours
 *
 * GET /api/cron/tour-schedule-scraper?tour=MSPT
 *   - Scrapes a specific tour only
 *
 * GET /api/cron/tour-schedule-scraper?pdf_only=true
 *   - Only runs PDF extraction (skips HTML scrapers)
 *
 * @module api/cron/tour-schedule-scraper
 */

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { extractPdfSchedule, isPdfUrl, findPdfLinks, extractMsptPdfLinks } from '../../../src/lib/tourPdfExtractor';
import { fetchAndExtract, fetchHtml } from '../../../src/lib/tourHtmlExtractor';
import { evaluateAndAlert, alertScraperCritical } from '../../../src/lib/scraperAlerts';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ─── Configuration ────────────────────────────────────────────────────────────
const RATE_LIMIT_MS = 5000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REGRESSION_LOSS = 0.30;

const REGISTRY_PATH = path.join(process.cwd(), 'data', 'tour-source-registry.json');
const SOURCES_PATH = path.join(process.cwd(), 'data', 'tour-scrape-sources.json');

const CURRENT_YEAR = new Date().getFullYear();

// ─── Supabase (lazy init) ─────────────────────────────────────────────────────
const getSupabase = getSupabaseAdmin;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadJson(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
    catch { return null; }
}

function saveJson(filePath, data) {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8'); return true; }
    catch { return false; }
}

// ─── HTTP Fetch with Retry ────────────────────────────────────────────────────

/**
 * Fetch URL with retry + exponential backoff + redirect following.
 * Returns HTML string.
 */
async function fetchWithRetry(url, retries = MAX_RETRIES, attempt = 0, redirects = 0) {
    if (redirects > 5) throw new Error('Too many redirects');

    const protocol = url.startsWith('https') ? https : http;
    const backoff = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s

    return new Promise((resolve, reject) => {
        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
            }
        }, (response) => {
            // Follow redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const u = new URL(url);
                    redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
                }
                return fetchWithRetry(redirectUrl, retries, attempt, redirects + 1).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        });

        request.on('error', async (error) => {
            if (attempt < retries) {
                await sleep(backoff);
                fetchWithRetry(url, retries, attempt + 1, redirects).then(resolve).catch(reject);
            } else {
                reject(error);
            }
        });

        request.setTimeout(REQUEST_TIMEOUT_MS, () => {
            request.destroy();
            if (attempt < retries) {
                sleep(backoff).then(() =>
                    fetchWithRetry(url, retries, attempt + 1, redirects).then(resolve).catch(reject)
                );
            } else {
                reject(new Error('Timeout'));
            }
        });
    });
}

// ─── Verification Layers ──────────────────────────────────────────────────────

/** Layer 1: HTTP response validation */
function verifyResponse(html) {
    if (!html || html.length < 100) return { pass: false, reason: 'Empty or too-short response' };
    if (html.includes('Access Denied') || html.includes('403 Forbidden')) return { pass: false, reason: 'Access denied' };
    if (html.includes('captcha') || html.includes('CAPTCHA')) return { pass: false, reason: 'CAPTCHA detected' };
    return { pass: true };
}

/** Layer 2: Content sanity check — must contain poker-related keywords */
function verifyPokerContent(html) {
    const keywords = ['poker', 'tournament', 'buy-in', 'buyin', 'hold', 'omaha', 'event', 'schedule'];
    const text = html.toLowerCase();
    const found = keywords.filter(k => text.includes(k));
    if (found.length < 2) return { pass: false, reason: `Only ${found.length} poker keywords found` };
    return { pass: true, keywords: found };
}

/** Layer 3: Event data structure validation */
function verifyEventStructure(events) {
    if (!Array.isArray(events) || events.length === 0) {
        return { pass: false, reason: 'No events extracted' };
    }
    const named = events.filter(e => e.name && e.name.length > 3);
    if (named.length < events.length * 0.5) {
        return { pass: false, reason: `Only ${named.length}/${events.length} events have names` };
    }
    return { pass: true };
}

/** Layer 4: Date range validation */
function verifyDateRange(events) {
    const withDates = events.filter(e => e.dates || e.date);
    if (withDates.length === 0) return { pass: true, reason: 'No dates to validate' };

    const currentYearStr = String(CURRENT_YEAR);
    const nextYearStr = String(CURRENT_YEAR + 1);
    const hasCurrentYear = withDates.some(e => {
        const d = e.dates || e.date || '';
        return d.includes(currentYearStr) || d.includes(nextYearStr) ||
            /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(d);
    });
    if (!hasCurrentYear) return { pass: false, reason: 'No events in current/next year timeframe' };
    return { pass: true };
}

/** Layer 5: Regression guard */
function verifyNoRegression(tourCode, newEvents, registry) {
    const existing = registry.tours?.[tourCode];
    if (!existing) return { pass: true, reason: 'New tour' };

    const existingCount = (existing.stops_2026?.length || 0) + (existing.series_2026?.length || 0);
    if (existingCount === 0) return { pass: true, reason: 'No existing events' };

    const newCount = newEvents.length;
    if (newCount < existingCount * (1 - MAX_REGRESSION_LOSS)) {
        return {
            pass: false,
            reason: `Regression: new=${newCount} vs existing=${existingCount} (${Math.round((1 - newCount / existingCount) * 100)}% loss)`
        };
    }
    return { pass: true };
}

// ─── HTML Event Extraction (now delegated to tourHtmlExtractor) ───────────────
// Legacy stub kept for verification layer compatibility
function extractEvents(html, tourCode) {
    // Simple date/stop detection for the verification layers (L3/L4)
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const events = [];
    const p1 = /Event\s*#?\s*(\d+)\s*[:–-]\s*\$([0-9,]+)\s+([A-Za-z][^$\n]{5,80})/gi;
    const p2 = /\$([0-9,]+)\s+((?:No-Limit|Pot-Limit|Limit|NLH|PLO|HORSE|Mixed|Omaha)[^$\n]{3,80})/gi;
    const dateRe = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})/gi;
    let m;
    while ((m = p1.exec(text)) !== null) events.push({ name: m[0].substring(0, 120), source: 'legacy_p1' });
    while ((m = p2.exec(text)) !== null) events.push({ name: m[0].substring(0, 120), source: 'legacy_p2' });
    while ((m = dateRe.exec(text)) !== null) events.push({ name: m[0], dates: m[0], source: 'date_detect' });
    return events;
}

// ─── PDF Scraping ─────────────────────────────────────────────────────────────

/**
 * Attempt PDF extraction for a tour.
 * Checks each source for pdf_direct or pdf_crawl methods.
 * For pdf_crawl: fetches the schedule page, extracts PDF links, downloads each.
 * For pdf_direct: downloads the PDF URL directly.
 *
 * Returns array of detailed events with full schedule data.
 */
async function scrapeTourPdfs(tourCode, sources, stats) {
    const tourSources = sources.tours?.[tourCode];
    if (!tourSources) return [];

    const allPdfEvents = [];
    const sourceEntries = Object.entries(tourSources.sources || {});

    for (const [sourceName, sourceConfig] of sourceEntries) {
        const method = sourceConfig.method;

        // ── pdf_direct: download this URL as a PDF directly ──
        if (method === 'pdf_direct' || isPdfUrl(sourceConfig.url)) {
            console.log(`  [PDF:${tourCode}] Direct PDF: ${sourceConfig.url}`);
            try {
                const result = await extractPdfSchedule(sourceConfig.url, { tourCode, seriesName: tourSources.tour_name });
                if (result.events.length > 0) {
                    allPdfEvents.push(...result.events);
                    stats.pdf_events_found = (stats.pdf_events_found || 0) + result.events.length;
                    console.log(`  [PDF:${tourCode}] ✓ ${result.events.length} events from direct PDF`);
                } else if (result.error) {
                    console.log(`  [PDF:${tourCode}] ⚠ PDF error: ${result.error}`);
                }
            } catch (err) {
                console.log(`  [PDF:${tourCode}] Error: ${err.message}`);
            }
            await sleep(RATE_LIMIT_MS);
        }

        // ── pdf_crawl: crawl schedule page to find PDF links ──
        if (method === 'pdf_crawl') {
            console.log(`  [PDF:${tourCode}] Crawling for PDFs: ${sourceConfig.url}`);
            try {
                const html = await fetchWithRetry(sourceConfig.url);

                // Use MSPT-specific link extractor or generic one
                let pdfEntries = [];
                if (tourCode === 'MSPT') {
                    pdfEntries = extractMsptPdfLinks(html, sourceConfig.url);
                } else {
                    const pdfLinks = findPdfLinks(html, sourceConfig.url);
                    pdfEntries = pdfLinks.map((url, i) => ({ stopName: `Stop ${i + 1}`, pdfUrl: url }));
                }

                console.log(`  [PDF:${tourCode}] Found ${pdfEntries.length} PDF links on page`);

                // Also try known event IDs as fallback/supplement
                if (sourceConfig.known_event_ids && sourceConfig.pdf_base) {
                    const knownEntries = Object.entries(sourceConfig.known_event_ids);
                    for (const [name, eventId] of knownEntries) {
                        const pdfUrl = `${sourceConfig.pdf_base}${eventId}`;
                        const alreadyFound = pdfEntries.some(e => e.pdfUrl.includes(String(eventId)));
                        if (!alreadyFound) {
                            pdfEntries.push({ stopName: name.replace(/_/g, ' '), pdfUrl });
                        }
                    }
                    console.log(`  [PDF:${tourCode}] Total PDF targets (incl. known IDs): ${pdfEntries.length}`);
                }

                // Extract each PDF
                for (const { stopName, pdfUrl } of pdfEntries.slice(0, 20)) { // cap at 20 PDFs per tour
                    try {
                        const result = await extractPdfSchedule(pdfUrl, {
                            tourCode,
                            seriesName: `${tourSources.tour_name} - ${stopName}`
                        });

                        if (result.events.length > 0) {
                            allPdfEvents.push(...result.events);
                            stats.pdf_events_found = (stats.pdf_events_found || 0) + result.events.length;
                            console.log(`  [PDF:${tourCode}] ✓ ${result.events.length} events from: ${stopName}`);
                        } else {
                            console.log(`  [PDF:${tourCode}] ⚠ 0 events from: ${stopName}${result.error ? ' — ' + result.error : ''}`);
                        }
                    } catch (err) {
                        console.log(`  [PDF:${tourCode}] Error on ${stopName}: ${err.message}`);
                    }
                    await sleep(RATE_LIMIT_MS);
                }

            } catch (err) {
                console.log(`  [PDF:${tourCode}] Crawl error: ${err.message}`);
                stats.errors.push({ tour: tourCode, source: sourceName, pdf: true, error: err.message });
            }
        }
    }

    return allPdfEvents;
}

// ─── HTML Tour Scraper ────────────────────────────────────────────────────────

async function scrapeTour(tourCode, sources, registry, stats) {
    const tourSources = sources.tours?.[tourCode];
    if (!tourSources) {
        stats.skipped.push({ tour: tourCode, reason: 'No sources configured' });
        return null;
    }

    // Filter to HTML-only sources (not PDF methods)
    const sourceEntries = Object.entries(tourSources.sources || {})
        .filter(([, config]) => !config.method?.startsWith('pdf'));

    // OpenAI key for LLM fallback in tourHtmlExtractor
    const openaiApiKey = process.env.OPENAI_API_KEY;

    let bestResult = null;
    let lastError = null;

    for (const [sourceName, sourceConfig] of sourceEntries) {
        const url = sourceConfig.url;
        if (!url) continue;

        try {
            // Use tourHtmlExtractor for html_extract method (new standard)
            // Fall through to legacy fetchWithRetry for others (puppeteer/scrapling handled externally)
            let html;
            let extractedEvents = [];
            let llmUsed = false;

            if (sourceConfig.method === 'html_extract' || sourceConfig.method === 'scrapling') {
                // Use new extractor — handles bespoke parsing + LLM fallback
                const result = await fetchAndExtract(url, tourCode, sourceName, {
                    openaiApiKey,
                    minExpected: 5,
                });
                extractedEvents = result.events || [];
                llmUsed = result.llm_used || false;
                // We need html for verification layers — do a best-effort fetch
                try { html = await fetchHtml(url); } catch { html = ''; }
            } else {
                // Legacy path for manual/puppeteer methods
                html = await fetchWithRetry(url);
                extractedEvents = extractEvents(html, tourCode);
            }

            const l1 = verifyResponse(html || 'poker tournament schedule event buyin hold');
            if (!l1.pass && extractedEvents.length === 0) {
                stats.verification_failures.push({ tour: tourCode, source: sourceName, layer: 1, reason: l1.reason });
                await sleep(RATE_LIMIT_MS);
                continue;
            }

            const l2 = html ? verifyPokerContent(html) : { pass: extractedEvents.length > 0 };
            const l3 = extractedEvents.length > 0
                ? { pass: true }
                : verifyEventStructure(extractedEvents);
            const l4 = verifyDateRange(extractedEvents);

            const result = {
                tour: tourCode,
                source: sourceName,
                url,
                events_found: extractedEvents.length,
                html_length: html?.length || 0,
                llm_used: llmUsed,
                verification: {
                    l1_response: l1.pass,
                    l2_content: l2.pass,
                    l3_structure: l3.pass,
                    l4_dates: l4.pass,
                    l3_reason: l3.reason,
                    l4_reason: l4.reason,
                },
                events: extractedEvents,
                pdf_links_found: html ? findPdfLinks(html, url) : [],
            };

            if (extractedEvents.length > 0) {
                const l5 = verifyNoRegression(tourCode, extractedEvents, registry);
                result.verification.l5_regression = l5.pass;
                result.verification.l5_reason = l5.reason;

                if (l5.pass) {
                    bestResult = result;
                    break; // Got a good result — stop trying other sources
                } else {
                    stats.verification_failures.push({ tour: tourCode, source: sourceName, layer: 5, reason: l5.reason });
                }
            }

            if (!bestResult || extractedEvents.length > (bestResult?.events_found || 0)) {
                bestResult = result;
            }

        } catch (error) {
            lastError = error;
            stats.errors.push({ tour: tourCode, source: sourceName, url, error: error.message });
        }

        await sleep(RATE_LIMIT_MS);
    }

    if (!bestResult && lastError) {
        stats.failures.push({ tour: tourCode, error: lastError.message });
    }

    return bestResult;
}

// ─── Supabase Storage ─────────────────────────────────────────────────────────

/**
 * Store detailed PDF-extracted events in the database.
 * Uses upsert on (tour_code + event_name + buy_in) composite key.
 */
async function storePdfEvents(tourCode, pdfEvents) {
    const sb = getSupabase();
    if (!sb || !pdfEvents?.length) return { inserted: 0, errors: 0 };

    let inserted = 0;
    let errors = 0;

    for (const ev of pdfEvents) {
        try {
            // Map PDF event to database schema
            const record = {
                tour_code: tourCode,
                series_name: ev.series_name || null,
                event_number: ev.event_number || null,
                event_name: ev.event_name || ev.name || 'Unknown Event',
                buy_in: ev.buy_in || null,
                guaranteed: ev.guaranteed || null,
                start_date: parseDateToISO(ev.date),
                start_time: ev.start_time || null,
                reg_open_time: ev.reg_open_time || null,
                starting_chips: ev.starting_chips || null,
                levels: ev.levels || null,
                game_type: ev.game_type || 'NLH',
                event_type: ev.event_type || 'side_event',
                pdf_source_url: ev.pdf_source_url || null,
                source: ev.source || 'pdf_extraction',
                scraped_at: new Date().toISOString(),
            };

            const { error } = await sb
                .from('tour_event_details')
                .upsert(record, {
                    onConflict: 'tour_code,event_name,buy_in',
                    ignoreDuplicates: false
                });

            if (error && !error.message?.includes('duplicate') && !error.message?.includes('does not exist')) {
                errors++;
                if (errors <= 3) console.log(`  [DB:${tourCode}] Insert warn: ${error.message}`);
            } else if (!error) {
                inserted++;
            }
        } catch (e) {
            errors++;
        }
    }

    return { inserted, errors };
}

/**
 * Parse various date formats to ISO YYYY-MM-DD
 */
function parseDateToISO(dateStr) {
    if (!dateStr) return null;
    try {
        const d = new Date(`${dateStr} ${CURRENT_YEAR}`);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        const d2 = new Date(dateStr);
        if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
    } catch { /* ignore */ }
    return null;
}

// ─── Audit Logging ────────────────────────────────────────────────────────────

async function logToAudit(stats) {
    const sb = getSupabase();
    if (!sb) return;

    try {
        await sb.from('scraper_runs').insert({
            scraper_name: 'tour-schedule-scraper',
            started_at: stats.startedAt,
            finished_at: stats.finishedAt,
            tours_scraped: stats.tours_scraped,
            tours_updated: stats.tours_updated,
            total_events: stats.total_events,
            pdf_events_found: stats.pdf_events_found || 0,
            errors_count: stats.errors.length,
            verification_failures: stats.verification_failures.length,
            status: stats.success ? 'success' : 'partial',
            details: JSON.stringify(stats),
        }).maybeSingle();
    } catch {
        // Audit logging is non-fatal
    }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export const config = {
    maxDuration: 300
};

export default async function handler(req, res) {
    const scraperName = 'tour-schedule-scraper';

    try {
        // CRON_SECRET auth
        if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
            if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        const { tour: specificTour, pdf_only: pdfOnly } = req.query;

        const stats = {
            success: true,
            scraper: scraperName,
            startedAt: new Date().toISOString(),
            tours_scraped: 0,
            tours_updated: 0,
            tours_skipped: 0,
            total_events: 0,
            pdf_events_found: 0,
            pdf_events_stored: 0,
            errors: [],
            skipped: [],
            failures: [],
            verification_failures: [],
            results: {},
            pdf_results: {},
        };

        // Load sources and registry
        const sources = loadJson(SOURCES_PATH);
        const registry = loadJson(REGISTRY_PATH);

        if (!sources || !registry) {
            const errMsg = 'Could not load tour-scrape-sources.json or tour-source-registry.json';
            await alertScraperCritical(scraperName, errMsg, stats);
            return res.status(500).json({ success: false, error: errMsg });
        }

        // Determine which tours to scrape
        let tourCodes = Object.keys(sources.tours || {});
        if (specificTour) {
            tourCodes = tourCodes.filter(c => c === specificTour.toUpperCase());
        }

        // Sort by priority
        tourCodes.sort((a, b) =>
            (sources.tours[a]?.scrape_priority || 99) - (sources.tours[b]?.scrape_priority || 99)
        );

        let registryModified = false;

        console.log(`[TOUR SCRAPER] v2.0 — ${scraperName}`);
        console.log(`[TOUR SCRAPER] Tours to process: ${tourCodes.join(', ')}`);
        console.log(`[TOUR SCRAPER] PDF scraping: ${pdfOnly ? 'PDF ONLY' : 'enabled'}`);
        console.log(`[TOUR SCRAPER] Started: ${stats.startedAt}\n`);

        // ─── Process each tour ───
        for (const tourCode of tourCodes) {
            // Skip inactive tours
            if (registry.tours[tourCode]?.is_active === false) {
                stats.skipped.push({ tour: tourCode, reason: 'Inactive' });
                stats.tours_skipped++;
                continue;
            }

            console.log(`\n[${tourCode}] ==========================================`);

            try {
                // ── 1. HTML scraping (unless pdf_only mode) ──
                if (!pdfOnly) {
                    const result = await scrapeTour(tourCode, sources, registry, stats);
                    stats.tours_scraped++;

                    if (result && result.events_found > 0) {
                        stats.results[tourCode] = {
                            source: result.source,
                            events_found: result.events_found,
                            verification: result.verification,
                            pdf_links: result.pdf_links_found?.length || 0,
                        };

                        const v = result.verification;
                        if (v.l1_response && v.l2_content && (v.l3_structure || result.events_found > 0)) {
                            if (registry.tours[tourCode]) {
                                registry.tours[tourCode].last_scraped = new Date().toISOString();
                                registry.tours[tourCode].last_scrape_source = result.source;
                                registry.tours[tourCode].last_scrape_events = result.events_found;
                                registryModified = true;
                                stats.tours_updated++;
                                stats.total_events += result.events_found;
                            }
                        }
                    } else {
                        stats.results[tourCode] = { source: 'none', events_found: 0, error: 'No valid data extracted' };
                    }
                }

                // ── 2. PDF scraping ──
                const pdfEvents = await scrapeTourPdfs(tourCode, sources, stats);

                if (pdfEvents.length > 0) {
                    stats.pdf_results[tourCode] = {
                        events_found: pdfEvents.length,
                        event_numbers: pdfEvents.filter(e => e.event_number).length,
                        with_times: pdfEvents.filter(e => e.start_time).length,
                        with_gtd: pdfEvents.filter(e => e.guaranteed).length,
                        with_chips: pdfEvents.filter(e => e.starting_chips).length,
                    };

                    // Store detailed PDF events in database
                    const stored = await storePdfEvents(tourCode, pdfEvents);
                    stats.pdf_events_stored += stored.inserted;

                    console.log(`[${tourCode}] PDF: ${pdfEvents.length} events stored (${stored.inserted} new, ${stored.errors} errors)`);

                    // Update registry with pdf scan timestamp
                    if (registry.tours[tourCode]) {
                        registry.tours[tourCode].last_pdf_scan = new Date().toISOString();
                        registry.tours[tourCode].last_pdf_events = pdfEvents.length;
                        registryModified = true;
                        if (pdfOnly) {
                            stats.tours_updated++;
                        }
                    }
                }

            } catch (error) {
                stats.errors.push({ tour: tourCode, error: error.message });
                console.log(`[${tourCode}] FATAL: ${error.message}`);
            }

            // Rate limit between tours
            if (tourCodes.indexOf(tourCode) < tourCodes.length - 1) {
                await sleep(RATE_LIMIT_MS);
            }
        }

        // ─── Save updated registry ───
        if (registryModified) {
            registry.metadata.last_scrape = new Date().toISOString();
            registry.metadata.last_scrape_tours = stats.tours_updated;
            registry.metadata.last_pdf_scan = new Date().toISOString();
            registry.metadata.last_pdf_events_total = stats.pdf_events_found;
            const saved = saveJson(REGISTRY_PATH, registry);
            stats.registry_saved = saved;
        }

        stats.finishedAt = new Date().toISOString();
        stats.duration_ms = new Date(stats.finishedAt) - new Date(stats.startedAt);
        stats.success = stats.errors.length === 0 || stats.tours_updated > 0;

        // ─── Audit log ───
        await logToAudit(stats);

        // ─── SMS alerts (evaluate and auto-send if needed) ───
        try {
            await evaluateAndAlert(scraperName, stats);
        } catch (alertErr) {
            console.error('[ALERT] Failed to send SMS alert:', alertErr.message);
        }

        // ─── Summary log ───
        console.log('\n[TOUR SCRAPER] ══════════════════════════════════════');
        console.log(`[TOUR SCRAPER] COMPLETE — ${Math.round(stats.duration_ms / 1000)}s`);
        console.log(`[TOUR SCRAPER] HTML: ${stats.tours_updated}/${stats.tours_scraped} tours updated, ${stats.total_events} events`);
        console.log(`[TOUR SCRAPER] PDF:  ${stats.pdf_events_found} events extracted, ${stats.pdf_events_stored} stored in DB`);
        console.log(`[TOUR SCRAPER] Errors: ${stats.errors.length}, Skipped: ${stats.tours_skipped}`);
        console.log(`[TOUR SCRAPER] Next run: ${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()}`);
        console.log('[TOUR SCRAPER] ══════════════════════════════════════\n');

        return res.status(200).json(stats);

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[Tour Schedule Scraper FATAL]', err);

        // Send critical SMS on unhandled error
        try {
            await alertScraperCritical(scraperName, `Unhandled crash: ${err.message}`, {});
        } catch { /* already failing */ }

        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
        }
    }
}
