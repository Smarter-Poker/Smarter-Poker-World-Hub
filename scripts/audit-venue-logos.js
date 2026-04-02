#!/usr/bin/env node
/**
 * Venue Logo Audit & Sourcing Script
 * 
 * For every venue with a website:
 * 1. Extract domain from website URL
 * 2. Test Google Favicon API (128px) — validate size (reject < 3KB generics)
 * 3. Test Clearbit Logo API — validate response
 * 4. Generate updated all-venues.json with logo_url populated
 * 5. Output comprehensive audit report
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_PATH = path.join(__dirname, '..', 'data', 'all-venues.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'all-venues.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'venue-logo-audit.json');

// Minimum file size to accept (bytes) — rejects generic globe favicons
const MIN_LOGO_SIZE = 2500;
// Concurrency limit
const CONCURRENCY = 8;
// Timeout per request (ms)
const TIMEOUT = 8000;

/**
 * Extract clean domain from a website URL
 */
function extractDomain(url) {
    if (!url) return null;
    try {
        let clean = url.trim();
        if (!clean.startsWith('http')) clean = 'https://' + clean;
        const parsed = new URL(clean);
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

/**
 * Make an HTTP(S) HEAD/GET request and return { size, contentType, status, finalUrl }
 */
function checkUrl(url, method = 'HEAD') {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), TIMEOUT);
        
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.request(url, { method, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SmarterPoker/1.0)' } }, (res) => {
            clearTimeout(timer);
            
            // Follow redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (redirectUrl.startsWith('/')) {
                    const parsed = new URL(url);
                    redirectUrl = parsed.protocol + '//' + parsed.host + redirectUrl;
                }
                resolve(checkUrl(redirectUrl, method));
                return;
            }
            
            if (res.statusCode !== 200) {
                res.resume();
                resolve(null);
                return;
            }
            
            const contentType = res.headers['content-type'] || '';
            const contentLength = parseInt(res.headers['content-length'] || '0', 10);
            
            // For HEAD requests, use content-length header
            if (method === 'HEAD') {
                res.resume();
                resolve({ size: contentLength, contentType, status: 200, finalUrl: url });
                return;
            }
            
            // For GET requests, read actual body to determine size
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                resolve({ size: body.length, contentType, status: 200, finalUrl: url });
            });
        });
        
        req.on('error', () => {
            clearTimeout(timer);
            resolve(null);
        });
        
        req.end();
    });
}

/**
 * Try to source a logo for a domain using multiple strategies
 */
async function sourceLogo(domain) {
    if (!domain) return null;
    
    const candidates = [];
    
    // Strategy 1: Google Favicon API (128px)
    const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const googleResult = await checkUrl(googleUrl, 'GET');
    if (googleResult && googleResult.size >= MIN_LOGO_SIZE) {
        const isImage = googleResult.contentType.includes('image/');
        if (isImage) {
            candidates.push({ url: googleUrl, size: googleResult.size, source: 'google_favicon', quality: googleResult.size > 10000 ? 'high' : 'medium' });
        }
    }
    
    // Strategy 2: Clearbit Logo API
    const clearbitUrl = `https://logo.clearbit.com/${domain}`;
    const clearbitResult = await checkUrl(clearbitUrl, 'GET');
    if (clearbitResult && clearbitResult.size >= MIN_LOGO_SIZE) {
        const isImage = clearbitResult.contentType.includes('image/');
        if (isImage) {
            candidates.push({ url: clearbitUrl, size: clearbitResult.size, source: 'clearbit', quality: 'high' });
        }
    }
    
    // Strategy 3: DuckDuckGo favicon (often higher quality)
    const ddgUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    const ddgResult = await checkUrl(ddgUrl, 'GET');
    if (ddgResult && ddgResult.size >= MIN_LOGO_SIZE) {
        const isImage = ddgResult.contentType.includes('image/') || ddgResult.contentType.includes('icon');
        if (isImage) {
            candidates.push({ url: ddgUrl, size: ddgResult.size, source: 'duckduckgo', quality: ddgResult.size > 10000 ? 'high' : 'medium' });
        }
    }
    
    // Pick best candidate: prefer Clearbit > Google (large) > DDG > Google (small)
    if (candidates.length === 0) return null;
    
    // Sort by preference: clearbit first, then by size
    candidates.sort((a, b) => {
        if (a.source === 'clearbit' && b.source !== 'clearbit') return -1;
        if (b.source === 'clearbit' && a.source !== 'clearbit') return 1;
        return b.size - a.size;
    });
    
    return candidates[0];
}

/**
 * Process venues in batches with concurrency limit
 */
async function processInBatches(items, fn, concurrency) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
        
        // Progress indicator
        const pct = Math.round(((i + batch.length) / items.length) * 100);
        process.stdout.write(`\r  Progress: ${i + batch.length}/${items.length} (${pct}%)`);
    }
    process.stdout.write('\n');
    return results;
}

async function main() {
    console.log('=== VENUE LOGO AUDIT & SOURCING ===\n');
    
    // Load data
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    const allVenues = raw.venues || [];
    
    // Filter to real venues (not series/tours)
    const realVenues = allVenues.filter(v => !['series', 'tour'].includes(v.venue_type));
    const seriesAndTours = allVenues.filter(v => ['series', 'tour'].includes(v.venue_type));
    
    console.log(`Total entries: ${allVenues.length}`);
    console.log(`Real venues: ${realVenues.length}`);
    console.log(`Series/Tours (skipping logos): ${seriesAndTours.length}`);
    
    const withWebsite = realVenues.filter(v => v.website);
    const withoutWebsite = realVenues.filter(v => !v.website);
    console.log(`Venues with website: ${withWebsite.length}`);
    console.log(`Venues without website: ${withoutWebsite.length}`);
    
    // Process each venue
    console.log(`\nSourcing logos for ${withWebsite.length} venues...\n`);
    
    const auditResults = [];
    let sourced = 0;
    let failed = 0;
    
    const results = await processInBatches(withWebsite, async (venue) => {
        const domain = extractDomain(venue.website);
        const logo = await sourceLogo(domain);
        
        const result = {
            id: venue.id,
            name: venue.name,
            city: venue.city,
            state: venue.state,
            type: venue.venue_type,
            website: venue.website,
            domain,
            logo_found: !!logo,
            logo_url: logo ? logo.url : null,
            logo_source: logo ? logo.source : null,
            logo_size: logo ? logo.size : 0,
            logo_quality: logo ? logo.quality : null,
        };
        
        if (logo) sourced++;
        else failed++;
        
        return result;
    }, CONCURRENCY);
    
    auditResults.push(...results);
    
    // Add no-website venues to audit
    for (const venue of withoutWebsite) {
        auditResults.push({
            id: venue.id,
            name: venue.name,
            city: venue.city,
            state: venue.state,
            type: venue.venue_type,
            website: null,
            domain: null,
            logo_found: false,
            logo_url: null,
            logo_source: 'no_website',
            logo_size: 0,
            logo_quality: null,
        });
    }
    
    // Summary stats
    const totalWithLogos = auditResults.filter(r => r.logo_found).length;
    const totalWithout = auditResults.filter(r => !r.logo_found).length;
    const byClearbit = auditResults.filter(r => r.logo_source === 'clearbit').length;
    const byGoogle = auditResults.filter(r => r.logo_source === 'google_favicon').length;
    const byDDG = auditResults.filter(r => r.logo_source === 'duckduckgo').length;
    const noWebsite = auditResults.filter(r => r.logo_source === 'no_website').length;
    
    console.log(`\n=== AUDIT RESULTS ===`);
    console.log(`Total real venues: ${realVenues.length}`);
    console.log(`Logos sourced: ${totalWithLogos} (${Math.round(totalWithLogos / realVenues.length * 100)}%)`);
    console.log(`  - Clearbit: ${byClearbit}`);
    console.log(`  - Google Favicon: ${byGoogle}`);
    console.log(`  - DuckDuckGo: ${byDDG}`);
    console.log(`Missing logos: ${totalWithout}`);
    console.log(`  - No website: ${noWebsite}`);
    console.log(`  - Logo too small/generic: ${totalWithout - noWebsite}`);
    
    // List venues still missing logos
    const missing = auditResults.filter(r => !r.logo_found);
    if (missing.length > 0) {
        console.log(`\n--- Venues still missing logos (${missing.length}) ---`);
        for (const m of missing.slice(0, 30)) {
            console.log(`  [${m.id}] ${m.name} (${m.city}, ${m.state}) — ${m.logo_source === 'no_website' ? 'NO WEBSITE' : 'logo too small/generic'}`);
        }
        if (missing.length > 30) console.log(`  ... and ${missing.length - 30} more`);
    }
    
    // Update all-venues.json with logo_url
    console.log(`\nUpdating all-venues.json with ${totalWithLogos} logos...`);
    
    const logoMap = new Map();
    for (const r of auditResults) {
        if (r.logo_found && r.logo_url) {
            logoMap.set(r.id, r.logo_url);
        }
    }
    
    for (const venue of allVenues) {
        if (logoMap.has(venue.id)) {
            venue.logo_url = logoMap.get(venue.id);
        }
    }
    
    // Update metadata
    raw.metadata.logo_audit = {
        run_date: new Date().toISOString(),
        total_venues: realVenues.length,
        logos_sourced: totalWithLogos,
        coverage_pct: Math.round(totalWithLogos / realVenues.length * 100),
    };
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(raw, null, 2));
    console.log(`✅ Updated ${OUTPUT_PATH}`);
    
    // Save full audit report
    const report = {
        metadata: {
            run_date: new Date().toISOString(),
            total_venues: realVenues.length,
            logos_sourced: totalWithLogos,
            logos_missing: totalWithout,
            sources: { clearbit: byClearbit, google_favicon: byGoogle, duckduckgo: byDDG, no_website: noWebsite },
        },
        venues: auditResults,
    };
    
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`✅ Audit report: ${REPORT_PATH}`);
    
    console.log(`\n=== DONE ===`);
}

main().catch(console.error);
