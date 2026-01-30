#!/usr/bin/env node
/**
 * Scrape Missing Tour Event Data
 *
 * Fetches tournament event data from official tour websites
 * for tours that are missing event data files.
 *
 * Usage: node scripts/scrape-missing-tour-events.js [--dry-run] [--tour=BORGATA]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'tour-source-registry.json');
const RATE_LIMIT_MS = 5000;

// Tours that already have event data files (do NOT re-scrape)
const EXISTING_DATA_FILES = {
  WSOP: 'wsop-2026-events.json',
  WPT: 'wpt-2026-events.json',
  WSOPC: 'wsopc-2026-events.json',
  MSPT: 'mspt-2026-events.json',
  RGPS: 'rgps-2026-events.json',
  VENETIAN: 'venetian-2026-events.json'
};

// Tours that need scraping
const MISSING_TOURS = [
  'PGT', 'TRITON', 'WYNN', 'BORGATA', 'SEMINOLE', 'LODGE', 'COMMERCE',
  'BESTBET', 'BAY_101', 'ROUGHRIDER', 'BPO', 'FPN', 'LIPS',
  'CARD_PLAYER_CRUISES', 'EPT', 'APT', 'HPT'
];

// ============================================================
// Tour-specific metadata for output file generation
// Maps tour codes to their output structure type and details
// ============================================================
const TOUR_OUTPUT_CONFIG = {
  PGT: {
    type: 'series',
    venue: 'PokerGO Studio at Aria Resort & Casino',
    city: 'Las Vegas',
    state: 'NV'
  },
  TRITON: {
    type: 'stops',
    notes: 'Ultra high stakes. 2-3 stops per year in international locations.'
  },
  WYNN: {
    type: 'series',
    venue: 'Wynn Las Vegas',
    city: 'Las Vegas',
    state: 'NV'
  },
  BORGATA: {
    type: 'series',
    venue: 'Borgata Hotel Casino & Spa',
    city: 'Atlantic City',
    state: 'NJ'
  },
  SEMINOLE: {
    type: 'series',
    notes: 'Hollywood and Tampa locations.'
  },
  LODGE: {
    type: 'series',
    venue: 'The Lodge Card Club',
    city: 'Round Rock',
    state: 'TX'
  },
  COMMERCE: {
    type: 'series',
    venue: 'Commerce Casino',
    city: 'Commerce',
    state: 'CA'
  },
  BESTBET: {
    type: 'series',
    venue: 'bestbet Jacksonville',
    city: 'Jacksonville',
    state: 'FL'
  },
  BAY_101: {
    type: 'series',
    venue: 'Bay 101 Casino',
    city: 'San Jose',
    state: 'CA'
  },
  ROUGHRIDER: {
    type: 'stops',
    notes: 'Northern plains regional tour. Very affordable buy-ins.'
  },
  BPO: {
    type: 'series',
    notes: 'Free bar poker leagues feed into Vegas championship.'
  },
  FPN: {
    type: 'series',
    notes: 'National pub poker network.'
  },
  LIPS: {
    type: 'series',
    notes: 'Womens poker organization. Events during WSOP season.'
  },
  CARD_PLAYER_CRUISES: {
    type: 'series',
    notes: 'Poker cruises. 4-5 per year. Buy-ins separate from cruise fare.'
  },
  EPT: {
    type: 'stops',
    notes: 'PokerStars owned. Premier European tour. Monte Carlo, Barcelona, Prague.'
  },
  APT: {
    type: 'stops',
    notes: 'Asian circuit. Manila, Macau, Korea, Vietnam stops.'
  },
  HPT: {
    type: 'series',
    notes: 'DEFUNCT 2019. Was a Midwest televised circuit tour.'
  }
};

// ============================================================
// CLI Argument Parsing
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    tourFilter: null
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--tour=')) {
      options.tourFilter = arg.split('=')[1].toUpperCase();
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/scrape-missing-tour-events.js [OPTIONS]

Options:
  --dry-run          List what would be scraped without making requests
  --tour=CODE        Only scrape a specific tour (e.g., --tour=BORGATA)
  --help, -h         Show this help message

Missing tours: ${MISSING_TOURS.join(', ')}
Already have data: ${Object.keys(EXISTING_DATA_FILES).join(', ')}
      `);
      process.exit(0);
    }
  }

  return options;
}

// ============================================================
// HTTP Fetch Utility
// ============================================================
function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'close'
      },
      timeout: 30000
    };

    const req = client.request(options, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
        }
        return fetchUrl(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });

    req.end();
  });
}

// ============================================================
// HTML Parsing Utilities
// ============================================================

/**
 * Strip HTML tags from a string
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Extract text content between matching tags
 */
function extractTagContent(html, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gis');
  const matches = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    matches.push(stripHtml(match[1]));
  }
  return matches;
}

/**
 * Extract table rows from HTML
 */
function extractTableRows(html) {
  const tables = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(stripHtml(cellMatch[1]));
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      tables.push(rows);
    }
  }

  return tables;
}

/**
 * Try to parse a buy-in string to a number
 */
function parseBuyIn(str) {
  if (!str) return null;
  const cleaned = str.replace(/[$,\s]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

/**
 * Try to detect game type from event name
 */
function detectGameType(name) {
  if (!name) return 'NLH';
  const upper = name.toUpperCase();
  if (upper.includes('PLO') && (upper.includes('HI-LO') || upper.includes('HI/LO') || upper.includes('8 OR BETTER'))) return 'PLO8';
  if (upper.includes('PLO') || upper.includes('POT LIMIT OMAHA')) return 'PLO';
  if (upper.includes('OMAHA') && (upper.includes('HI-LO') || upper.includes('HI/LO') || upper.includes('8 OR BETTER'))) return 'O8';
  if (upper.includes('OMAHA')) return 'PLO';
  if (upper.includes('STUD') && (upper.includes('HI-LO') || upper.includes('8 OR BETTER'))) return 'Stud8';
  if (upper.includes('STUD')) return 'Stud';
  if (upper.includes('RAZZ')) return 'Razz';
  if (upper.includes('HORSE') || upper.includes('MIXED') || upper.includes("DEALER'S CHOICE")) return 'Mixed';
  if (upper.includes('BIG O') || upper.includes('BIG-O')) return 'Big-O';
  if (upper.includes('LIMIT HOLD') && !upper.includes('NO')) return 'LHE';
  return 'NLH';
}

/**
 * Try to detect event type from event name
 */
function detectEventType(name) {
  if (!name) return 'side_event';
  const upper = name.toUpperCase();
  if (upper.includes('MAIN EVENT')) return 'main_event';
  if (upper.includes('HIGH ROLLER') || upper.includes('HIGH-ROLLER')) return 'high_roller';
  if (upper.includes('SUPER HIGH ROLLER')) return 'super_high_roller';
  if (upper.includes('CHAMPIONSHIP')) return 'championship';
  if (upper.includes('BOUNTY') || upper.includes('MYSTERY BOUNTY')) return 'bounty';
  if (upper.includes('TURBO')) return 'turbo';
  if (upper.includes('SENIOR')) return 'seniors';
  if (upper.includes('LADIES') || upper.includes('WOMEN')) return 'ladies';
  if (upper.includes('MONSTER STACK')) return 'monster';
  if (upper.includes('DEEP STACK') || upper.includes('DEEPSTACK')) return 'deepstack';
  return 'side_event';
}

/**
 * Attempt to parse event data from HTML content
 * Returns an array of event objects or empty array if parsing fails
 */
function parseEventsFromHtml(html, tourCode) {
  const events = [];

  // Strategy 1: Look for table-based schedules
  const tables = extractTableRows(html);
  for (const table of tables) {
    // Skip header row, try to identify columns
    if (table.length < 2) continue;

    const header = table[0].map(h => h.toLowerCase());

    // Try to find relevant column indices
    const nameIdx = header.findIndex(h =>
      h.includes('event') || h.includes('name') || h.includes('tournament') || h.includes('title')
    );
    const buyInIdx = header.findIndex(h =>
      h.includes('buy') || h.includes('entry') || h.includes('cost') || h.includes('price')
    );
    const dateIdx = header.findIndex(h =>
      h.includes('date') || h.includes('start') || h.includes('when') || h.includes('day')
    );
    const timeIdx = header.findIndex(h =>
      h.includes('time')
    );
    const gameIdx = header.findIndex(h =>
      h.includes('game') || h.includes('type') || h.includes('format')
    );

    // If we found at least a name column, try to extract events
    if (nameIdx >= 0 || table[0].length >= 2) {
      for (let i = 1; i < table.length; i++) {
        const row = table[i];
        if (row.length < 2) continue;

        const eventName = nameIdx >= 0 ? row[nameIdx] : row[0];
        if (!eventName || eventName.length < 3) continue;

        const event = {
          event_number: events.length + 1,
          event_name: eventName,
          game_type: detectGameType(eventName),
          event_type: detectEventType(eventName)
        };

        // Try to extract buy-in
        const buyIn = buyInIdx >= 0 ? parseBuyIn(row[buyInIdx]) : null;
        if (buyIn) {
          event.buy_in = buyIn;
        } else {
          // Try to extract buy-in from event name
          const buyInMatch = eventName.match(/\$[\d,]+/);
          if (buyInMatch) {
            event.buy_in = parseBuyIn(buyInMatch[0]);
          }
        }

        // Try to extract date
        if (dateIdx >= 0 && row[dateIdx]) {
          event.start_date = row[dateIdx];
        }

        // Try to extract time
        if (timeIdx >= 0 && row[timeIdx]) {
          event.start_time = row[timeIdx];
        }

        // Try to extract game type from separate column
        if (gameIdx >= 0 && row[gameIdx]) {
          event.game_type = detectGameType(row[gameIdx]);
        }

        events.push(event);
      }

      // If we found events from a table, return them
      if (events.length > 0) {
        return events;
      }
    }
  }

  // Strategy 2: Look for list-based or card-based event layouts
  // Try to find event items in div/li structures
  const eventPatterns = [
    /<(?:div|li|article|section)[^>]*class="[^"]*(?:event|tournament|schedule|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|article|section)>/gi,
    /<(?:div|li)[^>]*(?:data-event|data-tournament)[^>]*>([\s\S]*?)<\/(?:div|li)>/gi
  ];

  for (const pattern of eventPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const block = match[1];
      const name = stripHtml(block).substring(0, 200);
      if (name.length < 5) continue;

      const buyInMatch = block.match(/\$[\d,]+/);
      const event = {
        event_number: events.length + 1,
        event_name: name.split('\n')[0].trim().substring(0, 100),
        game_type: detectGameType(name),
        event_type: detectEventType(name)
      };

      if (buyInMatch) {
        event.buy_in = parseBuyIn(buyInMatch[0]);
      }

      events.push(event);
    }

    if (events.length > 0) return events;
  }

  // Strategy 3: Look for any lines that look like tournament events
  // Match patterns like "$1,000 No-Limit Hold'em" or "Event #1: $500 NLH"
  const lines = html.split(/\n/);
  for (const line of lines) {
    const stripped = stripHtml(line);
    const eventMatch = stripped.match(/(?:Event\s*#?\d+[:\s-]*)?(\$[\d,]+\s+.{5,80})/i);
    if (eventMatch) {
      const name = eventMatch[1].trim();
      // Filter out non-event lines (prices, etc)
      if (name.length > 10 && (
        name.toLowerCase().includes('hold') ||
        name.toLowerCase().includes('omaha') ||
        name.toLowerCase().includes('nlh') ||
        name.toLowerCase().includes('plo') ||
        name.toLowerCase().includes('tournament') ||
        name.toLowerCase().includes('event') ||
        name.toLowerCase().includes('poker') ||
        name.toLowerCase().includes('bounty') ||
        name.toLowerCase().includes('deep') ||
        name.toLowerCase().includes('stack')
      )) {
        const buyInMatch = name.match(/\$[\d,]+/);
        events.push({
          event_number: events.length + 1,
          event_name: name.substring(0, 100),
          buy_in: buyInMatch ? parseBuyIn(buyInMatch[0]) : null,
          game_type: detectGameType(name),
          event_type: detectEventType(name)
        });
      }
    }
  }

  return events;
}

// ============================================================
// Registry Data Extraction
// ============================================================

/**
 * Build event data from registry-embedded series_2026 or stops_2026 data.
 * This serves as fallback data when scraping cannot retrieve actual events.
 */
function buildFromRegistryData(tourData, tourCode) {
  const config = TOUR_OUTPUT_CONFIG[tourCode] || { type: 'series' };
  const today = new Date().toISOString().split('T')[0];
  const sourceUrl = tourData.source_urls?.primary || tourData.official_website || '';

  const metadata = {
    tour_code: tourCode,
    tour_name: tourData.tour_name,
    tour_type: tourData.tour_type,
    year: 2026,
    source_url: sourceUrl,
    scraped: today,
    scrape_method: 'registry_seed_data',
    notes: tourData.notes || '',
    typical_buyins: tourData.typical_buyins || null
  };

  // Check for defunct tours
  if (tourData.is_active === false || tourData.defunct_year) {
    metadata.is_active = false;
    metadata.defunct_year = tourData.defunct_year || null;
  }

  // Build from stops_2026 data (traveling tours)
  if (tourData.stops_2026 && tourData.stops_2026.length > 0) {
    const stops = tourData.stops_2026.map((stop, idx) => {
      const stopObj = {
        stop_uid: `${tourCode}-${(stop.name || `STOP-${idx + 1}`).toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-2026`,
        name: `${tourData.tour_name} ${stop.name || `Stop ${idx + 1}`}`,
        venue: stop.venue || stop.name || 'TBD',
        city: stop.city || 'TBD',
        state: stop.state || '',
        dates: stop.dates || 'TBD',
        events: [],
        _needs_event_data: true
      };
      return stopObj;
    });

    return {
      metadata: { ...metadata, total_stops: stops.length },
      stops
    };
  }

  // Build from series_2026 data (single-venue or series-based tours)
  if (tourData.series_2026 && tourData.series_2026.length > 0) {
    const series = tourData.series_2026.map((s, idx) => {
      const seriesObj = {
        series_uid: `${tourCode}-${(s.name || `SERIES-${idx + 1}`).toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-2026`,
        name: s.name || `${tourData.tour_name} Series ${idx + 1}`,
        dates: s.dates || 'TBD',
        events: [],
        _needs_event_data: true
      };

      // Add venue info
      if (s.venue) {
        seriesObj.venue = s.venue;
      } else if (config.venue) {
        seriesObj.venue = config.venue;
      }

      if (s.city) {
        seriesObj.city = s.city;
      } else if (config.city) {
        seriesObj.city = config.city;
      }

      if (s.state) {
        seriesObj.state = s.state;
      } else if (config.state) {
        seriesObj.state = config.state;
      }

      return seriesObj;
    });

    return {
      metadata: { ...metadata, total_series: series.length },
      series
    };
  }

  // No embedded data at all - create placeholder
  if (config.type === 'stops') {
    return {
      metadata: { ...metadata, total_stops: 0, status: 'placeholder' },
      stops: []
    };
  }

  return {
    metadata: { ...metadata, total_series: 0, status: 'placeholder' },
    series: []
  };
}

/**
 * Merge scraped events into registry-seeded structure
 */
function mergeScrapedEvents(baseData, scrapedEvents, tourCode) {
  if (!scrapedEvents || scrapedEvents.length === 0) return baseData;

  // If we have series with empty events, fill the first one
  if (baseData.series && baseData.series.length > 0) {
    const firstEmpty = baseData.series.find(s => s.events.length === 0);
    if (firstEmpty) {
      firstEmpty.events = scrapedEvents;
      delete firstEmpty._needs_event_data;
      baseData.metadata.scrape_method = 'html_parsed';
    }
  }

  // If we have stops with empty events, fill the first one
  if (baseData.stops && baseData.stops.length > 0) {
    const firstEmpty = baseData.stops.find(s => s.events.length === 0);
    if (firstEmpty) {
      firstEmpty.events = scrapedEvents;
      delete firstEmpty._needs_event_data;
      baseData.metadata.scrape_method = 'html_parsed';
    }
  }

  // If the base data has no series/stops at all, create one
  if (baseData.series && baseData.series.length === 0 && scrapedEvents.length > 0) {
    const config = TOUR_OUTPUT_CONFIG[tourCode] || {};
    baseData.series.push({
      series_uid: `${tourCode}-SCRAPED-2026`,
      name: `${baseData.metadata.tour_name} 2026`,
      venue: config.venue || 'TBD',
      city: config.city || 'TBD',
      state: config.state || '',
      events: scrapedEvents
    });
    baseData.metadata.total_series = 1;
    baseData.metadata.scrape_method = 'html_parsed';
  }

  if (baseData.stops && baseData.stops.length === 0 && scrapedEvents.length > 0) {
    baseData.stops.push({
      stop_uid: `${tourCode}-SCRAPED-2026`,
      name: `${baseData.metadata.tour_name} 2026`,
      venue: 'TBD',
      city: 'TBD',
      state: '',
      events: scrapedEvents
    });
    baseData.metadata.total_stops = 1;
    baseData.metadata.scrape_method = 'html_parsed';
  }

  return baseData;
}

// ============================================================
// File Output
// ============================================================

function getOutputFilename(tourCode) {
  return `${tourCode.toLowerCase().replace(/_/g, '-')}-2026-events.json`;
}

function writeEventFile(tourCode, data) {
  const filename = getOutputFilename(tourCode);
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return filepath;
}

// ============================================================
// Sleep utility for rate limiting
// ============================================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// URL Selection Logic
// ============================================================

/**
 * Get the best URLs to try for a tour, ordered by priority
 */
function getUrlsToTry(tourData) {
  const urls = [];
  const sourceUrls = tourData.source_urls || {};

  // Prefer schedule-specific URLs
  if (sourceUrls.schedule) urls.push(sourceUrls.schedule);
  if (sourceUrls.schedule_2026) urls.push(sourceUrls.schedule_2026);
  if (sourceUrls.primary) urls.push(sourceUrls.primary);
  if (sourceUrls.tournaments) urls.push(sourceUrls.tournaments);
  if (sourceUrls.lapc) urls.push(sourceUrls.lapc);
  if (sourceUrls.championship) urls.push(sourceUrls.championship);
  if (sourceUrls.events) urls.push(sourceUrls.events);

  // Add PokerAtlas as fallback
  const paKeys = Object.keys(sourceUrls).filter(k => k.includes('pokeratlas'));
  for (const key of paKeys) {
    urls.push(sourceUrls[key]);
  }

  // Add HendonMob as fallback
  const hmKeys = Object.keys(sourceUrls).filter(k => k.includes('hendonmob'));
  for (const key of hmKeys) {
    urls.push(sourceUrls[key]);
  }

  // Deduplicate
  return [...new Set(urls)];
}

// ============================================================
// Main Scraper Logic
// ============================================================

async function scrapeTour(tourCode, tourData, dryRun) {
  const config = TOUR_OUTPUT_CONFIG[tourCode] || { type: 'series' };
  const outputFile = getOutputFilename(tourCode);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Tour: ${tourData.tour_name} (${tourCode})`);
  console.log(`  Type: ${tourData.tour_type} | Priority: ${tourData.priority}`);
  console.log(`  Output: ${outputFile}`);
  console.log(`  Structure: ${config.type}`);

  // Check registry for embedded data
  const hasRegistryStops = tourData.stops_2026 && tourData.stops_2026.length > 0;
  const hasRegistrySeries = tourData.series_2026 && tourData.series_2026.length > 0;
  const hasRegistryData = hasRegistryStops || hasRegistrySeries;

  if (hasRegistryData) {
    const count = hasRegistryStops ? tourData.stops_2026.length : tourData.series_2026.length;
    const label = hasRegistryStops ? 'stops' : 'series';
    console.log(`  Registry data: ${count} ${label} found`);
  } else {
    console.log(`  Registry data: None (placeholder only)`);
  }

  // Check scrape method
  const scrapeMethod = tourData.scrape_config?.method || 'unknown';
  console.log(`  Scrape method: ${scrapeMethod}`);

  // Check for defunct tours
  if (tourData.is_active === false) {
    console.log(`  STATUS: DEFUNCT (${tourData.defunct_year || 'unknown year'})`);
  }

  const urlsToTry = getUrlsToTry(tourData);
  console.log(`  URLs to try: ${urlsToTry.length}`);
  for (const url of urlsToTry) {
    console.log(`    - ${url}`);
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would scrape and create ${outputFile}`);
    return { tourCode, status: 'dry_run', file: outputFile };
  }

  // Build base data from registry
  let eventData = buildFromRegistryData(tourData, tourCode);
  let scrapedEvents = [];
  let scrapeStatus = 'no_fetch';
  let fetchedUrl = null;

  // Try to fetch and parse event data from URLs
  for (const url of urlsToTry) {
    try {
      console.log(`\n  Fetching: ${url}`);
      const html = await fetchUrl(url);
      console.log(`  Received: ${html.length} bytes`);

      // Try to parse events from HTML
      const parsed = parseEventsFromHtml(html, tourCode);
      if (parsed.length > 0) {
        console.log(`  Parsed: ${parsed.length} events found!`);
        scrapedEvents = parsed;
        fetchedUrl = url;
        scrapeStatus = 'success';
        break;
      } else {
        console.log(`  Parsed: No structured events found in HTML`);
        scrapeStatus = 'no_events_parsed';
        fetchedUrl = url;
      }

      // Rate limit between URL attempts
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.log(`  Error: ${err.message}`);
      scrapeStatus = 'fetch_error';
      // Rate limit even on error
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Merge scraped events if we got any
  if (scrapedEvents.length > 0) {
    eventData = mergeScrapedEvents(eventData, scrapedEvents, tourCode);
  }

  // Update metadata with scrape results
  if (fetchedUrl) {
    eventData.metadata.fetched_url = fetchedUrl;
  }
  eventData.metadata.scrape_status = scrapeStatus;

  // If no events could be parsed or fetched, mark as needing manual entry
  if (scrapeStatus !== 'success') {
    eventData.metadata.needs_manual_review = true;
    eventData.metadata.scrape_notes = getStatusNote(scrapeStatus, tourCode, scrapeMethod);
  }

  // Write output file
  const filepath = writeEventFile(tourCode, eventData);
  console.log(`\n  Written: ${filepath}`);
  console.log(`  Status: ${scrapeStatus}`);

  const eventCount = countEvents(eventData);
  console.log(`  Events: ${eventCount} total`);

  return {
    tourCode,
    status: scrapeStatus,
    file: outputFile,
    eventsFound: eventCount,
    hasRegistryData,
    needsManualReview: scrapeStatus !== 'success'
  };
}

function getStatusNote(status, tourCode, method) {
  const notes = {
    no_fetch: 'No URLs available or all URLs failed. Requires manual data entry.',
    fetch_error: 'Could not connect to source website. Site may block automated access or require JavaScript rendering (Puppeteer).',
    no_events_parsed: `HTML was fetched but no structured event data could be parsed. Site likely requires ${method === 'puppeteer' ? 'Puppeteer for JavaScript rendering' : 'manual data collection'}.`
  };
  return notes[status] || 'Requires manual review and data entry.';
}

function countEvents(data) {
  let count = 0;
  if (data.series) {
    for (const s of data.series) {
      count += (s.events || []).length;
    }
  }
  if (data.stops) {
    for (const s of data.stops) {
      count += (s.events || []).length;
    }
  }
  if (data.events) {
    count += data.events.length;
  }
  return count;
}

// ============================================================
// Main Entry Point
// ============================================================

async function main() {
  const options = parseArgs();

  console.log('============================================================');
  console.log('  Smarter.Poker Tour Event Scraper');
  console.log('  Scraping missing tour event data');
  console.log('============================================================');

  if (options.dryRun) {
    console.log('\n  MODE: DRY RUN (no files will be created)');
  }
  if (options.tourFilter) {
    console.log(`\n  FILTER: Only scraping ${options.tourFilter}`);
  }

  // Load registry
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error(`\nERROR: Registry file not found at ${REGISTRY_FILE}`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  console.log(`\nLoaded registry: ${Object.keys(registry.tours).length} tours`);

  // Verify existing data files
  console.log('\nExisting data files:');
  for (const [code, file] of Object.entries(EXISTING_DATA_FILES)) {
    const exists = fs.existsSync(path.join(DATA_DIR, file));
    console.log(`  ${code}: ${file} ${exists ? '[OK]' : '[MISSING!]'}`);
  }

  // Determine which tours to scrape
  let toursToScrape = MISSING_TOURS;
  if (options.tourFilter) {
    if (!MISSING_TOURS.includes(options.tourFilter)) {
      // Check if it's an existing tour
      if (EXISTING_DATA_FILES[options.tourFilter]) {
        console.error(`\nERROR: ${options.tourFilter} already has data. Not re-scraping.`);
        process.exit(1);
      }
      console.error(`\nERROR: Unknown tour code: ${options.tourFilter}`);
      console.error(`Available: ${MISSING_TOURS.join(', ')}`);
      process.exit(1);
    }
    toursToScrape = [options.tourFilter];
  }

  // Check for already-scraped files (skip if data file already exists)
  const toScrape = [];
  const alreadyExists = [];
  for (const code of toursToScrape) {
    const outputFile = getOutputFilename(code);
    const outputPath = path.join(DATA_DIR, outputFile);
    if (fs.existsSync(outputPath) && !options.tourFilter) {
      alreadyExists.push(code);
    } else {
      toScrape.push(code);
    }
  }

  if (alreadyExists.length > 0) {
    console.log(`\nSkipping ${alreadyExists.length} tours with existing files:`);
    for (const code of alreadyExists) {
      console.log(`  ${code}: ${getOutputFilename(code)}`);
    }
  }

  console.log(`\nTours to scrape: ${toScrape.length}`);
  for (const code of toScrape) {
    const tourData = registry.tours[code];
    if (tourData) {
      console.log(`  ${code}: ${tourData.tour_name}`);
    } else {
      console.log(`  ${code}: [NOT IN REGISTRY]`);
    }
  }

  // Scrape each tour
  const results = [];
  for (let i = 0; i < toScrape.length; i++) {
    const code = toScrape[i];
    const tourData = registry.tours[code];

    if (!tourData) {
      console.log(`\nWARNING: ${code} not found in registry, skipping`);
      results.push({ tourCode: code, status: 'not_in_registry' });
      continue;
    }

    console.log(`\n[${i + 1}/${toScrape.length}] Processing ${code}...`);

    try {
      const result = await scrapeTour(code, tourData, options.dryRun);
      results.push(result);
    } catch (err) {
      console.error(`\nERROR processing ${code}: ${err.message}`);
      results.push({ tourCode: code, status: 'error', error: err.message });

      // Still create a placeholder file on error
      if (!options.dryRun) {
        try {
          const placeholderData = buildFromRegistryData(tourData, code);
          placeholderData.metadata.scrape_status = 'error';
          placeholderData.metadata.scrape_error = err.message;
          placeholderData.metadata.needs_manual_review = true;
          const filepath = writeEventFile(code, placeholderData);
          console.log(`  Created placeholder: ${filepath}`);
        } catch (writeErr) {
          console.error(`  Failed to create placeholder: ${writeErr.message}`);
        }
      }
    }

    // Rate limit between tours
    if (i < toScrape.length - 1 && !options.dryRun) {
      console.log(`\n  Waiting ${RATE_LIMIT_MS / 1000}s before next tour...`);
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Summary
  console.log('\n\n============================================================');
  console.log('  SCRAPE SUMMARY');
  console.log('============================================================\n');

  const successful = results.filter(r => r.status === 'success' || r.status === 'dry_run');
  const withRegistryData = results.filter(r => r.hasRegistryData);
  const needsManual = results.filter(r => r.needsManualReview);
  const errors = results.filter(r => r.status === 'error');

  console.log(`Total tours processed:    ${results.length}`);
  console.log(`Successfully scraped:     ${successful.length}`);
  console.log(`With registry seed data:  ${withRegistryData.length}`);
  console.log(`Needs manual review:      ${needsManual.length}`);
  console.log(`Errors:                   ${errors.length}`);

  console.log('\nResults by tour:');
  console.log('-'.repeat(60));

  for (const r of results) {
    const statusIcon = r.status === 'success' ? 'SCRAPED' :
                       r.status === 'dry_run' ? 'DRY_RUN' :
                       r.status === 'error' ? 'ERROR' :
                       r.hasRegistryData ? 'SEEDED' : 'PLACEHOLDER';
    const events = r.eventsFound !== undefined ? ` (${r.eventsFound} events)` : '';
    const manual = r.needsManualReview ? ' [NEEDS REVIEW]' : '';
    console.log(`  ${r.tourCode.padEnd(20)} ${statusIcon.padEnd(12)} ${(r.file || '').padEnd(35)}${events}${manual}`);
  }

  if (needsManual.length > 0) {
    console.log('\n\nTours needing manual event data entry:');
    console.log('-'.repeat(60));
    for (const r of needsManual) {
      console.log(`  ${r.tourCode}: data/${r.file}`);
    }
    console.log('\nTo manually add events, edit the JSON files directly.');
    console.log('Look for "_needs_event_data: true" markers in series/stops.');
    console.log('Use existing files (e.g., venetian-2026-events.json) as format reference.');
  }

  console.log('\nDone.');
}

// Run
main().catch(err => {
  console.error(`\nFATAL ERROR: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
