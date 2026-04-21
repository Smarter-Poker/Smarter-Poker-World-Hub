// CHARITY SCHEDULE SCRAPER — Vercel Cron Endpoint
// Schedule: 0 3 every-3-days (cron: 0 3 */3 * *)
//
// Runs every 3 days automatically via Vercel Cron (vercel.json).
// Fetches tournament schedules from 21 charity venues with known source URLs.
// Architecture note: Vercel serverless cannot run camoufox/Scrapling binaries.
// Plain HTTPS fetch with 3-attempt exponential-backoff retry handles all 21 venues
// that have text-parseable schedules. The 9 remaining image/JS-calendar venues
// are scraped separately by scripts/scrape_charity_remaining.py (local, camoufox).
//
// Every run:
//  1. Queries poker_venues WHERE venue_type = 'charity'
//  2. Skip venues scraped < 3 days ago (unless force=true)
//  3. Fetch each source URL with retry (3 attempts, backoff 1s/3s/7s)
//  4. Parse HTML for day+time schedule patterns (Pattern A + B)
//  5. SHA-256 hash raw HTML body for provenance
//  6. Upsert venue_daily_tournaments with scrape_html_hash + scrape_timestamp
//  7. Update poker_venues.last_scraped + scrape_status
//  8. Write data_audit_log entry
//
// GET /api/cron/scrape-charity-schedules
// GET /api/cron/scrape-charity-schedules?force=true   -- re-scrape even if fresh
// GET /api/cron/scrape-charity-schedules?venue=2802   -- single venue by DB id
// GET /api/cron/scrape-charity-schedules?dry=true     -- report only, no upsert
//
// Auth: ?key=<CRON_SECRET> or Authorization: Bearer <CRON_SECRET>

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import https from 'https';
import http from 'http';
import { createHash } from 'crypto';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Supabase singleton ──────────────────────────────────────────────────────
const getSupabase = getSupabaseAdmin;

// ── Constants ───────────────────────────────────────────────────────────────
const RESCRAPE_INTERVAL_DAYS = 3;
const RATE_LIMIT_MS = 1500;
const FETCH_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 7000]; // exponential backoff

// ── Hardcoded source-of-truth URL registry ──────────────────────────────────
// These are the verified scrape URLs from the Python scraper runs.
// The first URL in each array is the canonical source (produced the most data).
// Fallback URLs are tried in order when the primary fails.
const CHARITY_SOURCE_REGISTRY = {
  '2802': { // Chicago Charitable Games (CCG Poker)
    name: 'Chicago Charitable Games (CCG Poker)',
    urls: ['https://chicagocharitablegames.com', 'https://chicagocharitablegames.com/schedule'],
  },
  '2803': { // Windy City Poker Championship
    name: 'Windy City Poker Championship',
    urls: ['https://windycity.poker', 'https://windycity.poker/schedule'],
  },
  '2804': { // Rockford Charitable Games
    name: 'Rockford Charitable Games (RCG Poker)',
    urls: ['https://rcgpoker.com', 'https://rcgpoker.com/schedule'],
  },
  '2806': { // Shark Tank Poker Club
    name: 'Shark Tank Poker Club',
    urls: ['https://sharktankpokerclub.com', 'https://sharktankpokerclub.com/daily-tournaments'],
  },
  '2807': { // The Reserve Poker Club
    name: 'The Reserve Poker Club',
    urls: ['https://thereservepoker.com', 'https://thereservepoker.com/tournaments'],
  },
  '2809': { // River Room Players Club
    name: 'River Room Players Club',
    urls: ['https://riverroompoker.com', 'https://riverroompoker.com/tournament-schedule'],
  },
  '2810': { // OP Social Club / Outlaw Poker
    name: 'OP Social Club / Outlaw Poker',
    urls: ['https://opsocialclub.com/activities', 'https://opsocialclub.com'],
  },
  '2813': { // Concord Casino
    name: 'Concord Casino',
    urls: ['https://concordnhcasino.com/poker', 'https://concordnhcasino.com'],
  },
  '2814': { // Gate City Casino
    name: 'Gate City Casino',
    urls: ['https://thegatecitycasino.com/poker', 'https://thegatecitycasino.com'],
  },
  '2815': { // Pop's Poker
    name: "Pop's Poker",
    urls: ['https://popspoker.com/schedule', 'https://popspoker.com/tournaments', 'https://popspoker.com'],
  },
  '2816': { // RVA Charity Poker
    name: 'RVA Charity Poker',
    urls: ['https://rvacharitypoker.org', 'https://rvacharitypoker.org/schedule'],
  },
  '2817': { // ACES Charity Poker
    name: 'ACES Charity Poker',
    urls: ['https://acescharitypoker.org', 'https://acescharitypoker.org/schedule'],
  },
  '2823': { // Play Poker Chicago
    name: 'Play Poker Chicago',
    urls: ['https://playpokerchicago.com'],
  },
  '2826': { // Westfield Lions Club Poker
    name: 'Westfield Lions Club Poker',
    urls: ['https://lionspoker.org/tournament-details', 'https://lionspoker.org'],
  },
  '2827': { // Monroe Boat Club
    name: 'Monroe Boat Club (MBC-A Charity Poker)',
    urls: ['https://monroeboatclub.org/events', 'https://monroeboatclub.org'],
  },
  '2829': { // Evlos Charity Poker
    name: 'Evlos Charity Poker',
    urls: ['https://evloscharitypoker.com', 'https://evloscharitypoker.com/schedule'],
  },
  '2836': { // Westgate Poker Room
    name: 'Westgate Poker Room',
    urls: ['https://westgateresorts.com/hotels/michigan/comstock-park/westgate-lakelands-resort/poker/', 'https://www.pokeratlas.com/poker-room/westgate-poker-room-comstock-park'],
  },
  '3118': { // Concord NH Casino
    name: 'Concord NH Casino',
    urls: ['https://concordnhcasino.com/poker', 'https://concordnhcasino.com'],
  },
  '3119': { // TGT Poker Room
    name: 'TGT Poker Room',
    urls: ['https://tgtpoker.com/tournaments', 'https://tgtpoker.com'],
  },
  '1829': { // Texas Card House Austin
    name: 'Texas Card House Austin',
    urls: ['https://texascardhouse.com/austin/tournaments', 'https://texascardhouse.com'],
  },
};

// ── HTTP fetch with retry + redirect following ──────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Returns { body: string, htmlHash: string } or throws
async function fetchWithRetry(url, attempt = 0) {
  const protocol = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      }
    }, async (res) => {
      // Follow redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const u = new URL(url);
          redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
        }
        try {
          return resolve(await fetchWithRetry(redirectUrl, attempt));
        } catch (e) {
          return reject(e);
        }
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        // Layer 1: SHA-256 hash of raw response bytes
        const htmlHash = createHash('sha256').update(rawBuffer).digest('hex');
        const body = rawBuffer.toString('utf8');
        resolve({ body, htmlHash });
      });
      res.on('error', reject);
    });

    req.on('error', async (err) => {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt] || 5000);
        fetchWithRetry(url, attempt + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Timeout after ${FETCH_TIMEOUT_MS}ms`));
    });
  });
}

// ── Schedule parser ─────────────────────────────────────────────────────────
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_ABBREV = {
  mon:'monday', tue:'tuesday', tues:'tuesday', wed:'wednesday',
  thu:'thursday', thur:'thursday', fri:'friday', sat:'saturday', sun:'sunday',
};

function normalizeDay(raw) {
  const s = raw.toLowerCase().trim();
  if (DAYS.includes(s)) return s;
  if (DAY_ABBREV[s]) return DAY_ABBREV[s];
  for (const d of DAYS) {
    if (d.startsWith(s.slice(0, 3))) return d;
  }
  return null;
}

function parseTime24h(raw) {
  if (!raw) return null;
  const t = raw.trim().toUpperCase().replace(/\./g, '');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A|P)?$/);
  if (!m) return null;
  let h = parseInt(m[1]);
  const mn = parseInt(m[2] || '0');
  const ap = m[3] || '';
  if (ap.startsWith('P') && h !== 12) h += 12;
  else if (ap.startsWith('A') && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}:00`;
}

function extractSchedules(html, sourceUrl) {
  // Strip HTML tags → plain text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  const seen = new Set();
  const schedules = [];

  // Pattern A: "Monday 7:00 PM $75 NLH"
  const patA = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|fri|sat|sun)s?\b.{0,250}?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))/gi;
  for (const m of text.matchAll(patA)) {
    const day = normalizeDay(m[1]);
    if (!day) continue;
    const st = parseTime24h(m[2].trim());
    if (!st) continue;
    const key = `${day}|${st}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const ctx = text.slice(m.index, m.index + 400);
    const bi = ctx.match(/\$(\d{2,4})/);
    let gt = 'NLH';
    if (/\bPLO\b|Pot.?Limit Omaha/i.test(ctx)) gt = 'PLO';
    else if (/\bOmaha\b/i.test(ctx)) gt = 'PLO';
    let fmt = null;
    if (/bounty|knockout|\bKO\b/i.test(ctx)) fmt = 'Bounty';
    else if (/deep.?stack/i.test(ctx)) fmt = 'Deep Stack';
    else if (/rebuy/i.test(ctx)) fmt = 'Rebuy';
    else if (/turbo/i.test(ctx)) fmt = 'Turbo';
    const gtd = ctx.match(/\$([0-9,]+)\s*(?:GTD|guaranteed)/i);

    schedules.push({
      day_of_week: day,
      start_time: st,
      buy_in: bi ? parseInt(bi[1]) : null,
      game_type: gt,
      format: fmt,
      guaranteed: gtd ? parseInt(gtd[1].replace(/,/g, '')) : null,
      source_url: sourceUrl,
    });
  }

  // Pattern B: "Tuesday\n7:00 PM"
  const patB = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\s*[\n:—–-]{0,10}\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi;
  for (const m of text.matchAll(patB)) {
    const day = normalizeDay(m[1]);
    if (!day) continue;
    const st = parseTime24h(m[2].trim());
    if (!st) continue;
    const key = `${day}|${st}`;
    if (seen.has(key)) continue;
    seen.add(key);
    schedules.push({
      day_of_week: day, start_time: st, buy_in: null,
      game_type: 'NLH', format: null, guaranteed: null, source_url: sourceUrl,
    });
  }

  return schedules;
}

// Layer 1+3: Scrape single venue with fallback URLs, returns schedules + provenance
async function scrapeVenue(venueId, registryEntry) {
  const { urls } = registryEntry;
  let lastError = null;

  for (const url of urls) {
    try {
      const { body, htmlHash } = await fetchWithRetry(url);
      if (!body || body.length < 300) {
        lastError = `Response too thin (${body?.length || 0} bytes)`;
        continue;
      }

      const schedules = extractSchedules(body, url);

      if (schedules.length > 0) {
        return { success: true, url, schedules, htmlBytes: body.length, htmlHash };
      }

      lastError = `No schedule patterns in HTML (${body.length} bytes)`;
      // Try next fallback URL
    } catch (err) {
      lastError = err.message;
      // Try next fallback URL
    }

    await sleep(RATE_LIMIT_MS);
  }

  return { success: false, error: lastError, htmlHash: null };
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth check
    const secret = process.env.CRON_SECRET;
    const key = req.query.key || req.headers['x-cron-secret'];
    const authHeader = req.headers.authorization;
    if (secret && key !== secret && authHeader !== `Bearer ${secret}`) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const { force, venue: venueFilter, dry } = req.query;
    const isDryRun = dry === 'true';
    const isForce = force === 'true';
    const thresholdDays = RESCRAPE_INTERVAL_DAYS;

    const supabase = getSupabase();
    const batchId = crypto.randomUUID ? crypto.randomUUID() : `batch-${Date.now()}`;
    const startedAt = new Date().toISOString();

    // ── Fetch all charity venues from DB ──────────────────────────────────
    let query = supabase
      .from('poker_venues')
      .select('id, name, last_scraped, scrape_status')
      .eq('venue_type', 'charity')
      .order('name');

    if (venueFilter) {
      query = query.eq('id', venueFilter);
    }

    const { data: venues, error: venuesError } = await query;
    if (venuesError) {
      return res.status(500).json({ error: 'DB error fetching venues', details: venuesError.message });
    }

    // ── Run only venues in our registry ───────────────────────────────────
    const stats = {
      batchId,
      startedAt,
      total: 0,
      scraped: 0,
      skipped: 0,
      inserted: 0,
      noData: 0,
      errors: [],
      results: [],
    };

    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();

    for (const venue of venues) {
      const vid = String(venue.id);
      const entry = CHARITY_SOURCE_REGISTRY[vid];

      if (!entry) {
        // Not in our registry — skip (9 image-calendar venues)
        continue;
      }

      stats.total++;

      // Staleness check — skip if recently scraped (unless force=true)
      if (!isForce && venue.last_scraped && venue.last_scraped > cutoff) {
        stats.skipped++;
        stats.results.push({ id: vid, name: venue.name, status: 'skipped_fresh', last_scraped: venue.last_scraped });
        continue;
      }

      // Scrape with fallback URLs
      const result = await scrapeVenue(vid, entry);

      if (!result.success || result.schedules.length === 0) {
        stats.noData++;
        stats.errors.push({ id: vid, name: venue.name, error: result.error || 'No schedules found' });

        if (!isDryRun) {
          await supabase.from('poker_venues').update({
            last_scraped: new Date().toISOString(),
            scrape_status: 'no_data',
          }).eq('id', venue.id);
        }

        stats.results.push({ id: vid, name: venue.name, status: 'no_data', error: result.error });
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      stats.scraped++;
      let insertedHere = 0;

      if (!isDryRun) {
        const deduped = new Map();
        for (const s of result.schedules) {
          const k = `${s.day_of_week}|${s.start_time}`;
          if (!deduped.has(k)) deduped.set(k, s);
        }

        for (const [, sched] of deduped) {
          const record = {
            venue_id: venue.id,
            venue_name: venue.name,
            day_of_week: sched.day_of_week,
            start_time: sched.start_time || 'TBA',
            buy_in: sched.buy_in != null ? sched.buy_in : null,
            game_type: sched.game_type || 'NLH',
            format: sched.format || null,
            guaranteed: sched.guaranteed || null,
            source_url: sched.source_url || result.url,
            is_active: true,
            data_quality: 'scraped_verified',
            // Layer 1 provenance: SHA-256 of the raw HTML body
            scrape_html_hash: result.htmlHash || null,
            scrape_timestamp: new Date().toISOString(),
            scrape_batch_id: batchId,
            scrape_confidence: 'medium',
          };

          const { error: upsertError } = await supabase
            .from('venue_daily_tournaments')
            .upsert(record, { onConflict: 'venue_id,day_of_week,start_time' });

          if (!upsertError) {
            insertedHere++;
            stats.inserted++;
          } else {
            console.warn(`[scrape-charity-schedules] Upsert error for ${venue.name}:`, upsertError.message);
          }
        }

        // Update venue scrape timestamp
        await supabase.from('poker_venues').update({
          last_scraped: new Date().toISOString(),
          scrape_status: insertedHere > 0 ? 'complete' : 'no_new_data',
          scrape_url: result.url,
        }).eq('id', venue.id);
      }

      stats.results.push({
        id: vid,
        name: venue.name,
        status: 'success',
        url: result.url,
        schedulesFound: result.schedules.length,
        inserted: insertedHere,
      });

      await sleep(RATE_LIMIT_MS);
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    if (!isDryRun) {
      try {
        await supabase.from('data_audit_log').insert({
          table_name: 'venue_daily_tournaments',
          action: 'charity_schedule_cron',
          records_affected: stats.inserted,
          batch_id: batchId,
          agent_id: 'scrape-charity-schedules-cron',
          details: JSON.stringify({
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            total_venues: stats.total,
            scraped: stats.scraped,
            skipped_fresh: stats.skipped,
            no_data: stats.noData,
            inserted: stats.inserted,
            errors: stats.errors.length,
            script: '/api/cron/scrape-charity-schedules',
          }),
        });
      } catch (auditErr) {
        console.warn('[scrape-charity-schedules] Audit log non-fatal:', auditErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      isDryRun,
      batchId,
      stats: {
        venuesInRegistry: Object.keys(CHARITY_SOURCE_REGISTRY || {}).length,
        total: stats.total,
        scraped: stats.scraped,
        skippedFresh: stats.skipped,
        noData: stats.noData,
        inserted: stats.inserted,
        errors: stats.errors,
      },
      results: stats.results,
    });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[scrape-charity-schedules] Fatal:', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}
