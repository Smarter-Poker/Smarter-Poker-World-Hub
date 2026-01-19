/**
 * Merge Layer A+B+C into Master Dataset
 */

import { createHash } from 'crypto';
import type { Series, Event, Gap, MasterDataset, IngestProof, SourceEntry } from './types';
import { normalizeSeries, deduplicateSeries, deduplicateEvents } from './normalize';

export interface MergeInput {
    layerA: {
        series: Series[];
        events: Event[];
        sources: SourceEntry[];
        complete: boolean;
    };
    layerB: {
        series: Series[];
        events: Event[];
        sources: SourceEntry[];
        stats: { total: number; succeeded: number; failed: number };
    };
    layerC: {
        gaps: Gap[];
        sources: SourceEntry[];
        stats: { matched: number; gaps: number };
    };
    failures: Array<{ url: string; error: string; timestamp: string }>;
}

export function mergeDatasets(input: MergeInput): {
    master: MasterDataset;
    allSources: SourceEntry[];
} {
    console.log('[Merge] Starting merge of Layer A+B+C...');

    // Combine and dedupe series (A takes priority)
    const allSeries = [
        ...input.layerA.series.map(normalizeSeries),
        ...input.layerB.series.map(normalizeSeries),
    ];
    const dedupedSeries = deduplicateSeries(allSeries);
    console.log(`[Merge] Series: ${allSeries.length} -> ${dedupedSeries.length} after dedupe`);

    // Combine and dedupe events (A takes priority)
    const allEvents = [...input.layerA.events, ...input.layerB.events];
    const dedupedEvents = deduplicateEvents(allEvents);
    console.log(`[Merge] Events: ${allEvents.length} -> ${dedupedEvents.length} after dedupe`);

    // Determine overall status
    const isComplete = input.layerA.complete &&
        input.layerB.stats.failed === 0;

    const reason = !input.layerA.complete
        ? 'Layer A incomplete (pagination issue)'
        : input.layerB.stats.failed > 0
            ? `Layer B had ${input.layerB.stats.failed} venue failures`
            : undefined;

    const master: MasterDataset = {
        series: dedupedSeries,
        events: dedupedEvents,
        gaps: input.layerC.gaps,
        metadata: {
            generated_at: new Date().toISOString(),
            version: '1.0.0',
            status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
            reason,
        },
    };

    const allSources = [
        ...input.layerA.sources,
        ...input.layerB.sources,
        ...input.layerC.sources,
    ];

    return { master, allSources };
}

export function generateProof(
    master: MasterDataset,
    input: MergeInput,
    checksums: { master_json: string; master_csv: string; sources_json: string }
): IngestProof {
    return {
        status: master.metadata.status,
        reason: master.metadata.reason,
        timestamp: new Date().toISOString(),
        counts: {
            series: master.series.length,
            events: master.events.length,
            gaps: master.gaps.length,
            pages_crawled: input.layerA.sources.filter(s => s.http_status === 200).length,
            venues_total: input.layerB.stats.total,
            venues_succeeded: input.layerB.stats.succeeded,
            venues_failed: input.layerB.stats.failed,
        },
        checksums,
        failures: input.failures,
        layer_status: {
            A_series_directory: input.layerA.complete ? 'COMPLETE' : 'INCOMPLETE',
            B_venue_calendars: input.layerB.stats.failed === 0 ? 'COMPLETE' : 'INCOMPLETE',
            C_hendon_gaps: 'COMPLETE', // Gap detection is best-effort
        },
    };
}

export function computeSha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

// Convert events to CSV
export function eventsToCSV(events: Event[], series: Series[]): string {
    const seriesMap = new Map(series.map(s => [s.series_uid, s]));

    const headers = [
        'event_uid', 'event_name', 'start_datetime', 'buyin', 'guarantee', 'game',
        'series_uid', 'series_name', 'venue_name', 'city', 'state', 'source_kind'
    ];

    const rows = events.map(e => {
        const s = e.series_uid ? seriesMap.get(e.series_uid) : null;
        return [
            e.event_uid,
            `"${(e.event_name || '').replace(/"/g, '""')}"`,
            e.start_datetime || '',
            e.buyin?.toString() || '',
            e.guarantee?.toString() || '',
            e.game || '',
            e.series_uid || '',
            `"${(s?.series_name || '').replace(/"/g, '""')}"`,
            `"${(s?.venue_name || '').replace(/"/g, '""')}"`,
            s?.city || '',
            s?.state || '',
            e.source_kind,
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}
