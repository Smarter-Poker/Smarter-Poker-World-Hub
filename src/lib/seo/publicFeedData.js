/**
 * Server-side reads for the crawlable listing on /hub/lives.
 *
 * AEO (2026-09-22). See src/lib/seo/publicFeedListing.mjs for why these exist.
 *
 * WHAT THIS MAY READ. Exactly what a logged-out visitor's browser already
 * reads: the client is created with the PUBLISHABLE (anon) key, with no
 * session, so every query runs as the `anon` role under RLS. It never imports
 * a service-role or secret key, and a law checks that it never does.
 *
 * HOW LONG IT MAY TAKE. Every query is limited to FEED_LISTING_LIMIT rows,
 * carries an AbortSignal, and the whole read is raced against
 * FEED_LISTING_TIMEOUT_MS. A slow or failing database yields null, and the
 * page renders exactly what it rendered before this existed. Never throws.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveAnonKey, SUPABASE_URL_FALLBACK } from '../supabaseKeys';
import {
  FEED_LISTING_LIMIT,
  FEED_LISTING_TIMEOUT_MS,
  withDeadline,
  toLivesListing,
} from './publicFeedListing.mjs';

function anonClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() || SUPABASE_URL_FALLBACK;
  const { key } = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Safe columns only: live_streams column grants exclude the rest for anon. */
const STREAM_COLS = 'id, title, category, thumbnail_url, status, started_at, created_at, is_draft, is_posted, video_url';

async function readLives(signal) {
  const client = anonClient();
  const [live, recorded, upcoming] = await Promise.all([
    client
      .from('live_streams')
      .select(STREAM_COLS)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(FEED_LISTING_LIMIT)
      .abortSignal(signal),
    client
      .from('live_streams')
      .select(STREAM_COLS)
      .eq('status', 'ended')
      .eq('is_posted', true)
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(FEED_LISTING_LIMIT)
      .abortSignal(signal),
    client
      .from('scheduled_lives')
      .select('id, title, scheduled_at')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(FEED_LISTING_LIMIT)
      .abortSignal(signal),
  ]);
  if (live.error || recorded.error || upcoming.error) {
    throw live.error || recorded.error || upcoming.error;
  }
  return toLivesListing({ live: live.data, recorded: recorded.data, upcoming: upcoming.data });
}

async function bounded(read) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_LISTING_TIMEOUT_MS);
  try {
    return await withDeadline(read(ctrl.signal), FEED_LISTING_TIMEOUT_MS, null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Live, recorded and upcoming public streams, or null when they could not be read in time. */
export function fetchPublicLivesListing() {
  return bounded(readLives);
}

/** Short shared cache: fresh enough for a crawler, cheap enough for the database. */
export function feedListingCacheHeaders(res) {
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  }
}
