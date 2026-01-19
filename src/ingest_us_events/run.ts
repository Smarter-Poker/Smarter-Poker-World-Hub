#!/usr/bin/env npx ts-node
/**
 * US Event Coverage Master - CLI Runner
 * Fail-closed ingestion pipeline for US poker tournaments
 */

import * as fs from 'fs';
import * as path from 'path';
import { crawlSeriesDirectory } from './pokeratlas_series_directory';
import { parseAllSeriesPages } from './pokeratlas_series_page';
import { crawlAllVenues } from './pokeratlas_venues';
import { detectHendonGaps } from './hendon_festivals';
import { mergeDatasets, generateProof, computeSha256, eventsToCSV } from './merge';
import { generateSeriesUid } from './normalize';
import type { Series, SourceEntry } from './types';

const DIST_DIR = path.join(process.cwd(), 'dist');
const RAW_DIR = path.join(DIST_DIR, 'raw');
const PROOFS_DIR = path.join(DIST_DIR, 'proofs');

// Ensure directories exist
function ensureDirs(): void {
    [DIST_DIR, RAW_DIR, PROOFS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
}

// Write JSON file
function writeJson(filepath: string, data: unknown): void {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Format final output line
function formatFinalLine(ok: boolean, status: string, counts: Record<string, number>, proofPath: string): string {
    return JSON.stringify({ ok, status, counts, proof_path: proofPath });
}

async function main(): Promise<void> {
    console.log('======================================');
    console.log('US EVENT COVERAGE MASTER - INGESTION');
    console.log('======================================');
    console.log(`Started at: ${new Date().toISOString()}`);

    ensureDirs();

    const allFailures: Array<{ url: string; error: string; timestamp: string }> = [];
    const allSources: SourceEntry[] = [];

    // ============================================
    // LAYER A: PokerAtlas Series Directory
    // ============================================
    console.log('\n[LAYER A] PokerAtlas Series Directory Crawl');
    console.log('--------------------------------------------');

    const dirResult = await crawlSeriesDirectory();
    allSources.push(...dirResult.sources);

    if (!dirResult.success || !dirResult.data) {
        console.error('[LAYER A] FAILED:', dirResult.error);
        console.log(formatFinalLine(false, 'INCOMPLETE', { series: 0, events: 0, gaps: 0 }, ''));
        process.exit(1);
    }

    // Save raw directory data
    writeJson(path.join(RAW_DIR, 'pokeratlas_series_directory.json'), dirResult.data.series);
    console.log(`[LAYER A] Saved ${dirResult.data.series.length} series to raw/pokeratlas_series_directory.json`);

    // Convert directory series to proper Series objects and prepare for detail parsing
    const layerASeries: Series[] = dirResult.data.series.map(s => ({
        series_uid: generateSeriesUid(s.series_name, s.venue, s.start_date),
        series_name: s.series_name,
        venue_name: s.venue,
        city: s.city,
        state: s.state,
        country: 'US' as const,
        start_date: s.start_date,
        end_date: s.end_date,
        event_count: s.event_count,
        source_url: s.detail_url,
        source_kind: 'canonical_pokeratlas_series_directory' as const,
    }));

    // Parse detail pages for events
    const seriesForParsing = layerASeries.map(s => ({
        series_uid: s.series_uid,
        detail_url: s.source_url,
    }));

    const detailResult = await parseAllSeriesPages(seriesForParsing);
    allSources.push(...detailResult.sources);
    detailResult.failures.forEach(f => allFailures.push({ ...f, timestamp: new Date().toISOString() }));

    // Save raw events
    writeJson(path.join(RAW_DIR, 'pokeratlas_series_events.json'), detailResult.events);
    console.log(`[LAYER A] Saved ${detailResult.events.length} events to raw/pokeratlas_series_events.json`);

    // ============================================
    // LAYER B: Venue Calendar Sweep
    // ============================================
    console.log('\n[LAYER B] Venue Calendar Sweep');
    console.log('-------------------------------');

    // Build venue URL list from Layer A venues
    const venueUrls = [...new Set(layerASeries.map(s => {
        const venueName = s.venue_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        return `https://www.pokeratlas.com/poker-rooms/${venueName}`;
    }))];

    console.log(`[LAYER B] Crawling ${venueUrls.length} venues from Layer A...`);

    const venueResult = await crawlAllVenues(venueUrls);
    allSources.push(...venueResult.sources);
    venueResult.failures.forEach(f => allFailures.push({ ...f, timestamp: new Date().toISOString() }));

    // Save raw venue data
    writeJson(path.join(RAW_DIR, 'pokeratlas_venue_events.json'), venueResult.events);
    writeJson(path.join(RAW_DIR, 'pokeratlas_inferred_series.json'), venueResult.inferred_series);
    console.log(`[LAYER B] Saved ${venueResult.events.length} events, ${venueResult.inferred_series.length} inferred series`);

    // ============================================
    // LAYER C: Hendon Mob Gap Detection
    // ============================================
    console.log('\n[LAYER C] Hendon Mob Gap Detection');
    console.log('-----------------------------------');

    const masterSeriesNames = [
        ...layerASeries.map(s => s.series_name),
        ...venueResult.inferred_series.map(s => s.series_name),
    ];
    const masterVenueNames = [
        ...layerASeries.map(s => s.venue_name),
        ...venueResult.inferred_series.map(s => s.venue_name),
    ];

    const gapResult = await detectHendonGaps(masterSeriesNames, masterVenueNames);
    allSources.push(...gapResult.sources);

    // Save gaps sample
    const gapsSample = gapResult.gaps.slice(0, 50);
    writeJson(path.join(PROOFS_DIR, 'GAPS_SAMPLE.json'), gapsSample);

    // ============================================
    // MERGE + FINAL OUTPUT
    // ============================================
    console.log('\n[MERGE] Building Master Dataset');
    console.log('--------------------------------');

    const { master } = mergeDatasets({
        layerA: {
            series: layerASeries,
            events: detailResult.events,
            sources: dirResult.sources,
            complete: dirResult.success,
        },
        layerB: {
            series: venueResult.inferred_series,
            events: venueResult.events,
            sources: venueResult.sources,
            stats: venueResult.stats,
        },
        layerC: {
            gaps: gapResult.gaps,
            sources: gapResult.sources,
            stats: gapResult.stats,
        },
        failures: allFailures,
    });

    // Write master outputs
    const masterJson = JSON.stringify(master, null, 2);
    const masterCsv = eventsToCSV(master.events, master.series);
    const sourcesJson = JSON.stringify(allSources, null, 2);

    fs.writeFileSync(path.join(DIST_DIR, 'us_event_coverage_master.json'), masterJson);
    fs.writeFileSync(path.join(DIST_DIR, 'us_event_coverage_master.csv'), masterCsv);
    fs.writeFileSync(path.join(PROOFS_DIR, 'SOURCES.json'), sourcesJson);

    // Generate proof
    const checksums = {
        master_json: computeSha256(masterJson),
        master_csv: computeSha256(masterCsv),
        sources_json: computeSha256(sourcesJson),
    };

    const proof = generateProof(master, {
        layerA: { series: layerASeries, events: detailResult.events, sources: dirResult.sources, complete: dirResult.success },
        layerB: { series: venueResult.inferred_series, events: venueResult.events, sources: venueResult.sources, stats: venueResult.stats },
        layerC: { gaps: gapResult.gaps, sources: gapResult.sources, stats: gapResult.stats },
        failures: allFailures,
    }, checksums);

    writeJson(path.join(PROOFS_DIR, 'INGEST_PROOF.json'), proof);

    // ============================================
    // FINAL OUTPUT
    // ============================================
    console.log('\n======================================');
    console.log('INGESTION COMPLETE');
    console.log('======================================');
    console.log(`Series:  ${master.series.length}`);
    console.log(`Events:  ${master.events.length}`);
    console.log(`Gaps:    ${master.gaps.length}`);
    console.log(`Status:  ${master.metadata.status}`);
    if (master.metadata.reason) console.log(`Reason:  ${master.metadata.reason}`);

    // Required final JSON line
    const finalOutput = formatFinalLine(
        master.metadata.status === 'COMPLETE',
        master.metadata.status,
        { series: master.series.length, events: master.events.length, gaps: master.gaps.length },
        'dist/proofs/INGEST_PROOF.json'
    );

    console.log('\n' + finalOutput);

    process.exit(master.metadata.status === 'COMPLETE' ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal error:', err);
    console.log(JSON.stringify({ ok: false, status: 'FATAL_ERROR', error: err.message }));
    process.exit(1);
});
