/**
 * US Event Coverage Master - Type Definitions
 * Fail-closed ingestion pipeline for poker tournaments
 */

export interface Series {
    series_uid: string;
    series_name: string;
    venue_name: string;
    city: string;
    state: string;
    country: 'US';
    start_date: string;
    end_date: string;
    event_count: number | null;
    source_url: string;
    source_kind: SourceKind;
    aliases?: string[];
}

export interface Event {
    event_uid: string;
    series_uid: string | null;
    event_name: string;
    start_datetime: string;
    buyin: number | null;
    guarantee: number | null;
    game: string | null;
    structure_json: Record<string, unknown> | null;
    source_url: string;
    source_kind: SourceKind;
}

export interface Gap {
    gap_uid: string;
    festival_name: string;
    venue: string | null;
    city: string | null;
    state: string | null;
    start_date: string | null;
    end_date: string | null;
    hendon_url: string;
    match_attempts: string[];
    confidence: number;
}

export type SourceKind =
    | 'canonical_pokeratlas_series_directory'
    | 'inferred_series_from_venue_calendar'
    | 'standalone_event_from_venue_calendar'
    | 'external_only_gap_hendon';

export interface SourceEntry {
    url: string;
    timestamp: string;
    http_status: number;
    content_hash?: string;
    error?: string;
}

export interface IngestProof {
    status: 'COMPLETE' | 'INCOMPLETE';
    reason?: string;
    timestamp: string;
    counts: {
        series: number;
        events: number;
        gaps: number;
        pages_crawled: number;
        venues_total: number;
        venues_succeeded: number;
        venues_failed: number;
    };
    checksums: {
        master_json: string;
        master_csv: string;
        sources_json: string;
    };
    failures: Array<{
        url: string;
        error: string;
        timestamp: string;
    }>;
    layer_status: {
        A_series_directory: 'COMPLETE' | 'INCOMPLETE';
        B_venue_calendars: 'COMPLETE' | 'INCOMPLETE';
        C_hendon_gaps: 'COMPLETE' | 'INCOMPLETE';
    };
}

export interface MasterDataset {
    series: Series[];
    events: Event[];
    gaps: Gap[];
    metadata: {
        generated_at: string;
        version: string;
        status: 'COMPLETE' | 'INCOMPLETE';
        reason?: string;
    };
}

export interface CrawlResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    sources: SourceEntry[];
}

export interface PageCrawlState {
    pages_crawled: number;
    last_page_detected: number | null;
    page_hashes: Map<string, string>;
    all_series_urls: Set<string>;
    termination_reason: string | null;
}
