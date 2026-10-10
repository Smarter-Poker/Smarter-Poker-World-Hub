/**
 * TOURNAMENT SERIES DETAIL PAGE
 * Series detail view with event schedule,
 * venue info, follow/share functionality, results & leaderboard,
 * and activity feed.
 */

import Head from 'next/head';
import { resolveVenueTimeZone } from '../../../src/components/poker-near-me/pnm-utils';
import { qualifiedScheduleZone, scheduleDateStatus } from '../../../src/lib/poker-near-me/scheduleTemporal.mjs';
import SEOHead from '../../../src/components/seo/SEOHead';
import { PokerNearMePanelShell, PokerNearMeConsoleIcon } from '../../../src/components/poker-near-me/PokerNearMeConsole';
import useHasMounted from '../../../src/hooks/useHasMounted';
import {
  fetchSeries,
  formatRange,
  isPublicSeries,
  originFrom,
  seriesDescription,
  seriesPath,
  seriesPlace,
  seriesSchema,
  seriesTitle,
  toSeoSeries,
} from '../../../src/lib/poker-near-me/seriesSeo.mjs';
import {
  canonicalSeriesRouteId,
  isPokerSeriesRouteId,
  isServableSeriesParentEvidence,
  toPokerSeriesRouteId,
  tournamentSeriesIdFromPointerUid,
} from '../../../src/lib/poker-near-me/seriesRouteIdentity.mjs';
import Link from 'next/link';
import { useState, useEffect, Fragment, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import { eventBus } from '../../../src/engine/EventBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PokerNearMeFamilyNav from '../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import PokerIdentityMark from '../../../src/components/poker-near-me/PokerIdentityMark';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { formatGameType, decodeHtml } from '../../../src/utils/pokerFormatters';
import useVenueRealtime from '../../../src/hooks/useVenueRealtime';

// Tour badge color mapping
const TOUR_COLORS = {
  'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
  'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
  'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
  'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
  'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
  'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
  'EPT': { bg: 'linear-gradient(135deg, #0ea5e9, #0369a1)', text: '#fff', border: '#38bdf8' },
  'LAPC': { bg: 'linear-gradient(135deg, #e11d48, #9f1239)', text: '#fff', border: '#fb7185' },
  'SHRPO': { bg: 'linear-gradient(135deg, #d97706, #92400e)', text: '#fff', border: '#f59e0b' },
  'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' },
};

// Series type styling
const SERIES_TYPE_COLORS = {
  major: { bg: '#00D4FF', text: '#000' },
  circuit: { bg: '#60a5fa', text: '#000' },
  regional: { bg: '#a78bfa', text: '#000' },
  'mid-major': { bg: '#4ade80', text: '#000' },
  weekly: { bg: '#94a3b8', text: '#000' },
};

const ACTIVITY_TYPE_COLORS = {
  update: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60a5fa', border: 'rgba(96, 165, 250, 0.3)' },
  announcement: { bg: 'rgba(0, 212, 255, 0.15)', text: '#00D4FF', border: 'rgba(0, 212, 255, 0.3)' },
  promotion: { bg: 'rgba(74, 222, 128, 0.15)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.3)' },
  result: { bg: 'rgba(167, 139, 250, 0.15)', text: '#a78bfa', border: 'rgba(167, 139, 250, 0.3)' },
};

const PODIUM_COLORS = {
  1: '#00D4FF',
  2: '#c0c0c0',
  3: '#cd7f32',
};

function formatDateRange(startDate, endDate) {
  if (!startDate) return 'TBD';
  const startMs = Date.parse(startDate + 'T00:00:00');
  if (isNaN(startMs)) return startDate; // Gracefully handle unparseable
  const start = new Date(startMs);
  const endMs = endDate ? Date.parse(endDate + 'T00:00:00') : startMs;
  const end = !isNaN(endMs) && endDate ? new Date(endMs) : null;

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const startYear = start.getFullYear();

  if (!end) return startMonth + ' ' + startDay + ', ' + startYear;

  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const endDay = end.getDate();
  const endYear = end.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return startMonth + ' ' + startDay + ' - ' + endDay + ', ' + startYear;
  }
  if (startYear === endYear) {
    return startMonth + ' ' + startDay + ' - ' + endMonth + ' ' + endDay + ', ' + startYear;
  }
  return startMonth + ' ' + startDay + ', ' + startYear + ' - ' + endMonth + ' ' + endDay + ', ' + endYear;
}

function formatMoney(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  if (amount === 0) return 'Free'; // BUG FIX: freerolls show 'Free' not '$0'
  return '$' + Number(amount).toLocaleString('en-US');
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const ms = Date.parse(dateStr + 'T00:00:00');
  if (isNaN(ms)) return dateStr;
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Strip day-of-week + date + time text that the scraper embedded inside event_name.
// e.g. "$200 Monster Stack NLH Wednesday, October 1 10 a.m" → "$200 Monster Stack NLH"
// Also decodes HTML entities like &ndash; → –
function cleanEventName(raw) {
  if (!raw) return '';
  // Decode HTML entities first
  let name = raw
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#([0-9]{1,7});/gi, (match, numStr) => String.fromCharCode(parseInt(numStr, 10)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (match, hexStr) => String.fromCharCode(parseInt(hexStr, 16)));
  // Pattern A (mid-string): "Apr 9 Thursday 6:15pm" / "Apr 10 Friday 11:15am"
  name = name.replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}:\d{2}\s*(am|pm)/gi, '');
  // Pattern B (trailing full day+date): "Wednesday, October 1 10 a.m"
  name = name.replace(/\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Za-z]+\s+\d+([^$]*)$/i, '');
  name = name.replace(/\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Za-z]+\.?\s+\d+([^$]*)$/i, '');
  // Pattern C (standalone trailing time)
  name = name.replace(/\s+\d{1,2}:\d{2}\s*(am|pm|a\.m|p\.m)/i, '');
  name = name.replace(/\s+\d{1,2}\s*(a\.m|p\.m|am|pm)$/i, '');
  // Pattern D (trailing "Apr 8 Wednesday" — Month Day DayOfWeek at end without time)
  name = name.replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*$/i, '');
  // Pattern E: BUG FIX — name that STARTS WITH the date pattern (no leading text, so \s+ didn't match)
  // e.g. 'Apr 9 Thursday 6:15pm' or 'Apr 9 Thursday' when scraper produced a date-only string
  name = name.replace(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(\s+\d{1,2}:\d{2}\s*(am|pm))?\s*$/i, '');
  return name.trim();
}

// Extract start time that was embedded in event_name by the scraper.
// Returns formatted time string or empty string.
function extractTimeFromName(raw) {
  if (!raw) return '';
  // Match patterns like "10 a.m", "2 p.m", "10:30am", "2:00 PM"
  const m = raw.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/i);
  if (!m) return '';
  // Normalize: "10 a.m" → "10:00 AM", "2 p.m" → "2:00 PM"
  return m[1].replace(/\./g, '').replace(/\s/g, '').toUpperCase()
    .replace(/(\d+)([AP]M)$/, (_, h, ap) => h + ':00 ' + ap)
    .replace(/(\d+:\d+)([AP]M)$/, (_, t, ap) => t + ' ' + ap);
}

// Convert any time string (military "15:00:00" or arbitrary) to clean "3:00 PM" format
function format12HourTime(timeStr) {
  if (!timeStr) return '';
  const str = String(timeStr).trim();
  
  // If it already contains AM/PM, it's likely already formatted or extracted cleanly
  if (/am|pm/i.test(str)) return str.toUpperCase();
  
  // Handle military time from database (e.g. "15:00:00" or "15:00")
  const parts = str.split(':');
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    if (!isNaN(h)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12; // the hour '0' should be '12'
      return `${h}:${m} ${ampm}`;
    }
  }
  return str;
}

// Derive short venue label for series with no recognized tour brand
function deriveDetailVenueBadge(series) {
  const tour = (series.tour || series.tour_code || '').toUpperCase();
  if (tour && TOUR_COLORS[tour]) return tour; // known brand
  // Try explicit venue fields
  const venue = (series.venue || series.venue_name || '').trim();
  if (venue) return venue.split(/\s+/).slice(0, 2).join(' ').toUpperCase().slice(0, 14);
  // city field often contains "VenueName CityName"
  const city = (series.city || '').trim();
  if (city) {
    const words = city.split(/\s+/);
    const vw = words.length >= 3 ? words.slice(0, 2) : words.slice(0, Math.max(1, words.length - 1));
    const b = vw.join(' ').toUpperCase().slice(0, 14);
    if (b.length >= 3) return b;
  }
  // Extract from series name
  const name = series.name || '';
  const STOP = /^(poker|series|championship|open|classic|tournament|cup|challenge|circuit|festival|main|event|invitational|showdown|spring|summer|fall|winter|january|february|march|april|may|june|july|august|september|october|november|december|\d{4})$/i;
  const words = name.split(/\s+/);
  const si = words.findIndex(w => STOP.test(w));
  const vw = si > 0 ? words.slice(0, si) : words.slice(0, 2);
  return vw.join(' ').toUpperCase().slice(0, 14) || 'SERIES';
}

function deriveDetailCategory(series) {
  const st = series.series_type || '';
  if (st && st !== 'regional') {
    // capitalize known types
    return st.charAt(0).toUpperCase() + st.slice(1);
  }
  const n = ((series.name || '') + ' ' + (series.city || '')).toLowerCase();
  if (/\b(card house|card room|cardroom|lounge|poker room|poker lounge|tcl\b|tch\b|lodge|hustler|bay 101|kings|lucky hearts|peppermill|bicycle|commerce|garden|rivers casino|bestbet|parx|prime social|elite poker|live poker classic)\b/.test(n)) return 'Card Room';
  if (/\b(park|downs|kennel|track|meadow|racing|fairground)\b/.test(n)) return 'Card Room';
  if (/\b(charity|benefit|foundation)\b/.test(n)) return 'Charity';
  if (/\b(online|social club)\b/.test(n)) return 'Poker Club';
  return 'Casino';
}

function deriveDetailCategoryColor(series) {
  const cat = deriveDetailCategory(series);
  const cats = { 'Card Room': '#8b5cf6', 'Charity': '#ec4899', 'Poker Club': '#06b6d4', 'Casino': '#f59e0b', 'Major': '#c9a227', 'Circuit': '#3b82f6', 'Mid-Major': '#4ade80' };
  return cats[cat] || '#6b7280';
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + 'm ago';
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours + 'h ago';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return diffDays + 'd ago';
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths + 'mo ago';
}

function getLocationParts(series) {
  // Handle both separate city/state fields and combined location string
  if (series.city && series.state) {
    return { city: series.city, state: series.state };
  }
  if (series.location) {
    const parts = series.location.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return { city: parts[0], state: parts[1] };
    }
    return { city: series.location, state: '' };
  }
  return { city: '', state: '' };
}

/**
 * The series itself is rendered on the server (discoverability, 2026-09-18).
 * Before this the server HTML was the loading branch: the placeholder title
 * "Poker Series Details", the placeholder site description, `noindex,
 * nofollow` and about 75 words of chrome — on 246 pages the sitemap offers,
 * a fifth of every URL in it. Events, results, followers and activity are
 * still fetched in the browser exactly as before; only the series' own
 * words are in the HTML now.
 */
/**
 * The tournament_series row that owns this series' route, when this record is
 * a poker_series duplicate of it (AEO phase 3, 2026-09-18).
 *
 * seriesRouteIdentity.mjs already states the rule: poker_series may supply
 * fresher metadata, never the public route identity. So a duplicate points
 * its canonical at the primary instead of both declaring themselves the
 * original. A lookup that cannot run leaves the page canonical to itself,
 * which is what it did before and is never worse than guessing.
 */
async function primarySeriesRouteId(series) {
  if (!series?.seriesUid) return null;
  if (!isPokerSeriesRouteId(Number(series.id))) return null;

  // A uid that is a bare integer already names the row that owns the route.
  const pointsAt = tournamentSeriesIdFromPointerUid(series.seriesUid);
  if (pointsAt !== null) return String(pointsAt);

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('tournament_series')
      .select('id, is_suppressed')
      .eq('series_uid', series.seriesUid)
      .limit(1)
      .maybeSingle();
    if (data && data.is_suppressed !== true) {
      const id = Number(data.id);
      if (Number.isSafeInteger(id) && id > 0) return String(id);
    }

    // The sitemap also collapses duplicate poker_series rows by uid. Keep
    // their page canonical in step with that rule, choosing the lowest
    // servable source id when no tournament_series parent owns the uid.
    const { data: pokerSeries } = await supabase
      .from('poker_series')
      .select('id, is_suppressed, data_quality, source_url, scrape_url, scrape_html_hash, scrape_timestamp, scrape_batch_id')
      .eq('series_uid', series.seriesUid)
      .or('is_suppressed.is.null,is_suppressed.eq.false')
      .in('data_quality', ['scraped_verified', 'scraped_inferred', 'manual_research'])
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!pokerSeries || !isServableSeriesParentEvidence(pokerSeries)) return null;
    const routeId = toPokerSeriesRouteId(pokerSeries.id);
    return routeId === null ? null : String(routeId);
  } catch (e) {
    console.warn('[series] primary route lookup failed:', e?.message || e);
    return null;
  }
}

export async function getServerSideProps({ params, req, res }) {
  const requestedId = String(params?.id ?? '');
  const canonicalId = canonicalSeriesRouteId(requestedId);
  if (canonicalId && canonicalId !== requestedId) {
    return {
      redirect: {
        destination: `/hub/series/${canonicalId}`,
        permanent: true,
      },
    };
  }

  const { series: seoSeries, status } = await fetchSeries(params?.id, originFrom(req));
  if (seoSeries) {
    const primary = await primarySeriesRouteId(seoSeries);
    if (primary && primary !== String(seoSeries.id)) seoSeries.canonicalId = primary;
  }
  if (status === 'unavailable') {
    // The API did not answer: the browser still fetches as before, but a
    // crawler is told to come back rather than to index a spinner.
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '120');
  } else if (status === 'not-found') {
    // A 404 IS NOT CACHED THE WAY A PAGE IS (AEO phase 3, 2026-09-19).
    //
    // This used to fall through to the shared branch below, which sets
    // s-maxage=300 with stale-while-revalidate=600 and then the 404 status,
    // so a single bad lookup was published as "this page does not exist" for
    // five minutes and re-served stale for ten more. Measured on production,
    // four series pages were answering 404 from the edge with
    // x-vercel-cache: HIT and an age past four minutes, while the same URLs
    // with a cache busting parameter answered 200.
    //
    // A 404 still caches, because a genuinely missing id should not cost a
    // lookup on every bot that finds it, but for a minute and with no stale
    // window: a mistake clears itself instead of outliving its cause.
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, s-maxage=60');
  } else {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  }
  return { props: { seoSeries } };
}

/**
 * One head for every branch, so the title, description and canonical are in
 * the server HTML whether the browser data has arrived or not. A series with
 * nothing to index (missing, or no name) stays out of the index.
 */
function SeriesHead({ series }) {
  if (!isPublicSeries(series)) {
    return (
      <SEOHead
        title="Series Not Found"
        description="This poker tournament series is not available. Browse every tournament series and schedule on Smarter.Poker instead."
        noindex={true}
      />
    );
  }
  return (
    <SEOHead
      title={seriesTitle(series)}
      description={seriesDescription(series)}
      canonical={seriesPath(series)}
      ogImage={series.logoUrl || null}
      jsonLd={seriesSchema(series)}
    />
  );
}

/**
 * What a reader gets before, or without, JavaScript. Googlebot renders JS,
 * but the crawlers that decide what ChatGPT, Claude and Perplexity can cite
 * largely do not, and before this they were served a spinner and 75 words of
 * chrome on all 246 series pages the sitemap offers. These are the facts the
 * server already has; the browser replaces this with the full schedule the
 * moment its own fetch resolves.
 */
function SeriesSummary({ series }) {
  if (!isPublicSeries(series)) return null;
  const place = seriesPlace(series);
  const range = formatRange(series.startDate, series.endDate);
  const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
  const events = Array.isArray(series.events) ? series.events : [];
  return (
    <section className="series-summary" aria-label="Series Summary">
      <h1>{series.name}</h1>
      <dl>
        {place && (
          <div>
            <dt>Where</dt>
            <dd>{place}</dd>
          </div>
        )}
        {range && (
          <div>
            <dt>When</dt>
            <dd>{range}</dd>
          </div>
        )}
        {series.mainEventBuyin ? (
          <div>
            <dt>Main Event</dt>
            <dd>
              {money(series.mainEventBuyin)} Buy-In
              {series.mainEventGuaranteed ? ` With A ${money(series.mainEventGuaranteed)} Guarantee` : ''}
            </dd>
          </div>
        ) : null}
        {series.totalEvents ? (
          <div>
            <dt>Events</dt>
            <dd>{series.totalEvents} Tournaments On The Schedule</dd>
          </div>
        ) : null}
      </dl>
      {/* THE SCHEDULE (AEO phase 3, 2026-09-19). Measured on production,
          every one of the 225 series pages served about 139 words and the
          sentence "Loading Series Details...", under a paragraph promising
          the full schedule below. The events were already in the API
          response this page awaits on the server; they were being dropped
          before the props were built. The paragraph below now promises the
          schedule only when the schedule is there. */}
      {events.length > 0 ? (
        <>
          <p>
            The Schedule For {series.name} Is Below, With Buy Ins And Start Times As The Venue
            Published Them. Browse Every Tournament Series On{' '}
            <a href="/hub/poker-series">Poker Series</a>, Or Find A Room Near You With{' '}
            <a href="/hub/poker-near-me/lobby">Poker Near Me</a>.
          </p>
          <h2 className="series-summary-schedule-heading">
            {events.length === 1 ? 'The Event' : `All ${events.length} Events`} At {series.name}
          </h2>
          <ol className="series-summary-schedule">
            {events.map((event, index) => (
              <li key={`${event.name}-${index}`}>
                <span className="sss-name">
                  {event.number ? `Event ${event.number}: ` : ''}{event.name}
                </span>
                <span className="sss-when">
                  {[formatEventDay(event.startDate), event.startTime ? `${event.startTime} Start` : null]
                    .filter(Boolean).join(' · ') || 'Date Not Announced'}
                </span>
                <span className="sss-terms">
                  {[
                    event.buyin ? `${money(event.buyin)} Buy In` : null,
                    event.guarantee ? `${money(event.guarantee)} Guaranteed` : null,
                    event.game,
                    event.flight,
                  ].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ol>
          {series.totalEvents > events.length && (
            <p className="series-summary-more">
              Showing {events.length} Of {series.totalEvents} Events. The Rest Load On The Full
              Schedule Below.
            </p>
          )}
        </>
      ) : (
        <p>
          The Schedule For {series.name} Has Not Been Published Yet. Buy Ins, Start Times And
          Results Are Added Here As The Venue Releases Them. Browse Every Tournament Series On{' '}
          <a href="/hub/poker-series">Poker Series</a>, Or Find A Room Near You With{' '}
          <a href="/hub/poker-near-me/lobby">Poker Near Me</a>.
        </p>
      )}
    </section>
  );
}

/** "Monday, April 20" - the year is already in the series date range above. */
function formatEventDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function SeriesDetailPage({ seoSeries = null }) {
  const hasMounted = useHasMounted();
  const router = useRouter();
  const { id } = router.query;
  const [menuOpen, setMenuOpen] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setScheduleNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [isFollowing, setIsFollowing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'event_number', direction: 'asc' });
  const [followPending, setFollowPending] = useState(false); // double-click guard
  const shareTimeoutRef = useRef(null); // for cleanup on unmount
  const isMountedRef = useRef(true);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current); }; }, []);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // SWR — parallel fetch all series data
  // BUG FIX: use Promise.allSettled + per-request timeout so slow activity/results APIs
  // never block the critical series data from rendering (was Promise.all → all-or-nothing hang)
  const safeId = id ? encodeURIComponent(String(id)) : null;
  const swrKey = safeId ? `/api/poker/series?id=${safeId}` : null;
  const { data: swrData, isLoading: loading, error, mutate } = useSWR(swrKey, async () => {
    const fetchWithTimeout = (url, options = {}, ms = 8000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      return fetch(url, { ...options, signal: controller.signal })
        .then(r => { clearTimeout(timer); return r; })
        .catch(e => { clearTimeout(timer); return { ok: false }; });
    };
    // BUG FIX: 8s per-request timeouts; secondary APIs (results/activity) degrade gracefully
    const results_arr = await Promise.allSettled([
      fetchWithTimeout('/api/poker/series?id=' + safeId),
      fetchWithTimeout('/api/poker/results?series_id=' + safeId),
      fetchWithTimeout('/api/poker/follow?page_type=series&page_id=' + safeId),
      fetchWithTimeout('/api/poker/activity?page_type=series&page_id=' + safeId + '&limit=10'),
    ]);
    const [seriesRes, resultsRes, followRes, activityRes] = results_arr.map(r =>
      r.status === 'fulfilled' ? r.value : { ok: false }
    );
    if (!seriesRes || (seriesRes.ok === false && !seriesRes.status)) throw new Error('Network timeout');
    if (seriesRes.status === 404) throw new Error('Series not found');
    if (!seriesRes.ok) throw new Error('API unavailable');
    const safeJson = async (r) => {
      if (!r || typeof r.json !== 'function') return {};
      try { return await r.json(); } catch { return {}; }
    };
    const [sj, rj, fj, aj] = await Promise.all([safeJson(seriesRes), safeJson(resultsRes), safeJson(followRes), safeJson(activityRes)]);
    const seriesObj = sj.success && sj.data ? (Array.isArray(sj.data) ? sj.data[0] : sj.data) : null;
    const payload = rj.success ? (rj.data || {}) : {};
    const res = payload.results && Array.isArray(payload.results) ? payload.results : (Array.isArray(payload) ? payload : []);
    const lb = payload.leaderboard && Array.isArray(payload.leaderboard) ? payload.leaderboard : (Array.isArray(rj.leaderboard) ? rj.leaderboard : []);
    return {
      series: seriesObj,
      results: res,
      leaderboard: lb,
      followerCount: fj.success ? (fj.follower_count || 0) : 0,
      activities: aj.success ? (Array.isArray(aj.activities || aj.data) ? (aj.activities || aj.data) : []) : []
    };
  }, {
    // BUG FIX: don't retry 404s (series not found) — stops hammering the API
    onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
      if (error.message && error.message.includes('not found')) return; // no retry on 404
      if (retryCount >= 3) return; // max 3 retries for actual network errors
      setTimeout(() => revalidate({ retryCount }), Math.min(1000 * 2 ** retryCount, 30000));
    },
  });

  // Bind realtime venue and series updates to cache invalidation
  // BUG FIX: Prevent global DDOS vector where ANY poker_series or poker_venue updated anywhere
  // in the DB caused EVERY connected user viewing ANY series to spam the /api/poker/series endpoint.
  // Now explicitly checks if the realtime payload aligns with our current ID, or if it's a reconnection.
  useVenueRealtime((payload) => {
    if (!payload) return mutate(); // Hard refresh on visibility/reconnect recovery
    if (payload.table === 'poker_series' && payload.new && String(payload.new.id) === String(id)) {
      mutate();
    }
    // Note: changes to poker_venues or venue_daily_tournaments do not immediately mutate specific series detail caches unless they impact all venues, in which case a hard refresh is preferred or the DB trigger should touch poker_series.
  });

  const series = swrData?.series || null;
  const results = swrData?.results || [];
  const leaderboard = swrData?.leaderboard || [];
  const followerCount = swrData?.followerCount || 0;
  const activities = swrData?.activities || [];

  // Load follow state from localStorage instantly and sync across tabs
  useEffect(() => {
    if (!router.isReady || !id) return;
    const updateFollowState = () => {
      try {
        const followed = JSON.parse(localStorage.getItem('followed-series') || '[]');
        setIsFollowing(followed.includes(String(id)));
        // Mutate SWR internal cache to refresh live count
        if (swrKey) mutate();
      } catch (e) { console.warn('[App] Handled exception:', e); }
    };
    updateFollowState();
    
    // BUG FIX: Full EventBus wiring + cross-tab localStorage event tracking for real-time reactivity
    const handleBusAction = (data) => {
      if (String(data.seriesId) === String(id)) {
        updateFollowState();
      }
    };
    
    window.addEventListener('storage', updateFollowState);
    eventBus.on('series:favorite', handleBusAction);
    eventBus.on('series:unfavorite', handleBusAction);

    return () => {
      window.removeEventListener('storage', updateFollowState);
      eventBus.off('series:favorite', handleBusAction);
      eventBus.off('series:unfavorite', handleBusAction);
    };
  }, [id, router.isReady, swrKey, mutate]);

  const toggleFollow = useCallback(() => {
    if (followPending) return; // guard: block double-click
    const sid = String(id);
    const newState = !isFollowing;
    setIsFollowing(newState);
    setFollowPending(true);
    // Capture current count at call time for rollback integrity
    const countAtCall = swrData?.followerCount || 0;
    const newCount = newState ? countAtCall + 1 : Math.max(0, countAtCall - 1);
    
    if (swrData) {
      mutate({ ...swrData, followerCount: newCount }, false);
    }

    // Update localStorage for instant persistence
    try {
      const followed = JSON.parse(localStorage.getItem('followed-series') || '[]');
      let updated;
      if (newState) {
        updated = followed.includes(sid) ? followed : [...followed, sid];
      } else {
        updated = followed.filter(x => x !== sid);
      }
      localStorage.setItem('followed-series', JSON.stringify(updated));
      
      // Emit universal bus event for multi-tab synchronization within identical process memory
      try { 
        eventBus.emit(newState ? 'series:favorite' : 'series:unfavorite', { seriesId: sid, name: series?.name }, 'SeriesDetail'); 
      } catch (e) { console.warn('[App] Handled exception:', e); }
    } catch {
      // ignore
    }

    // BUG FIX: Read token from all known Supabase storage key patterns
    const tokenKey = Object.keys(localStorage || {}).find(k =>
      k.includes('auth-token') || k.includes('supabase.auth.token') || k.startsWith('sb-')
    );
    let storedToken = null;
    if (tokenKey) {
      try { storedToken = JSON.parse(localStorage.getItem(tokenKey) || '{}')?.access_token; } catch (e) { console.warn('[App] Handled exception:', e); }
    }
    const token = typeof window !== 'undefined' && (window.__supabaseToken || storedToken);

    if (token) {
      fetch('/api/poker/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          page_type: 'series',
          page_id: sid,
          action: newState ? 'follow' : 'unfollow',
        }),
      })
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to update follow status');
      })
      .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); })
      .finally(() => { if (isMountedRef.current) setFollowPending(false); });
    } else {
      // BUG FIX: silently dropped before — now show clear sign-in prompt
      // localStorage follow saved for this session, but alert user server won't persist
      if (isMountedRef.current) {
        setFollowPending(false);
        // Rollback the optimistic update so UI reflects truth (not saved to server)
        setIsFollowing(!newState);
        if (swrData) mutate({ ...swrData, followerCount: countAtCall }, false);
        try {
          const followed = JSON.parse(localStorage.getItem('followed-series') || '[]');
          const reverted = !newState
            ? (followed.includes(sid) ? followed : [...followed, sid])
            : followed.filter(x => x !== sid);
          localStorage.setItem('followed-series', JSON.stringify(reverted));
        } catch (e) { console.warn('[App] Handled exception:', e); }
        // Update share message display to guide user
        setShareMessage('Sign in to follow series');
        if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = setTimeout(() => { if (isMountedRef.current) setShareMessage(''); }, 3000);
      }
    }
  }, [followPending, id, isFollowing, swrData, mutate, series?.name]);

  function getAnonymousUserId() {
    try {
      let uid = localStorage.getItem('sp-anon-uid');
      if (!uid) {
        uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('sp-anon-uid', uid);
      }
      return uid;
    } catch {
      return 'anon-fallback';
    }
  }

  const handleShare = async () => {
    const url = window.location.href;
    const setMsg = (msg) => {
      if (!isMountedRef.current) return;
      setShareMessage(msg);
      // Clear previous timer before setting a new one
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
      shareTimeoutRef.current = setTimeout(() => { if (isMountedRef.current) setShareMessage(''); }, 2500);
    };
    try {
      if (navigator.share) {
        await navigator.share({ title: series?.name || 'Tournament Series', url });
      } else {
        await navigator.clipboard.writeText(url);
        setMsg('Link copied!');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setMsg('Link copied!');
      } catch {
        setMsg('Could not copy link');
      }
    }
  };

  // Loading state (also show while router hasn't provided id yet)
  if (loading || !id || (error && isPublicSeries(seoSeries))) {
    return (
      <>
        <SeriesHead series={seoSeries} />
        <UniversalHeader 
          pageDepth={2} 
          onMenuClick={() => setMenuOpen(true)}
          onBackClick={() => {
          router.back();
        }}
        />
        <PokerNearMeFamilyNav />
        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="series-page" data-pnm-secondary-foundation="interaction-v1">
          <SeriesSummary series={seoSeries} />
          {/* The spinner is for the reader who is waiting. On the server
              nothing is waiting, and the summary above already carries the
              schedule, so saying it is still loading contradicts the page it
              sits in (AEO phase 3, 2026-09-19). */}
          {hasMounted && !error && (
            <div className="loading-container">
              <div className="loading-spinner" />
              <p className="loading-text">Loading Series Details...</p>
            </div>
          )}
          {hasMounted && error && (
            <p className="loading-text" role="status">
              Some Interactive Series Details Are Temporarily Unavailable. The Published Series Facts And Schedule Remain Available Above.
            </p>
          )}
        </main>
        <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: styles }} />
      </>
    );
  }

  // Error state
  if (error || !series) {
    return (
      <>
        <SeriesHead series={seoSeries} />
        <UniversalHeader 
          pageDepth={2} 
          onMenuClick={() => setMenuOpen(true)}
          onBackClick={() => {
          router.back();
        }}
        />
        <PokerNearMeFamilyNav />
        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="series-page" data-pnm-secondary-foundation="interaction-v1">
          <div className="error-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎴</div>
            <h2 className="error-title" style={{ fontSize: 24, color: '#fff', marginBottom: 8 }}>Series Not Found</h2>
            <p className="error-text" style={{ color: 'rgba(148,163,184,0.7)', marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>
              {(error && error.message) || 'This tournament series could not be found. It may have ended or been removed.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => router.push('/hub/poker-series')}
                style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #d4a853, #b8860b)', color: '#000', border: 'none', borderRadius: 20, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Browse All Series
              </button>
              <button
                onClick={() => router.back()}
                style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Go Back
              </button>
            </div>
          </div>
        </main>
        <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: styles }} />
      </>
    );
  }

  const tourStyle = TOUR_COLORS[series.short_name] || TOUR_COLORS[series.tour_code] || TOUR_COLORS.default;
  const typeStyle = SERIES_TYPE_COLORS[series.series_type] || SERIES_TYPE_COLORS.regional;
  const status = /^(cancelled|canceled)$/i.test(series.status || '')
    ? { label: 'Cancelled', color: '#94a3b8' }
    // Server and first client paint agree even across venue midnight. The
    // source schedule stays rendered; only the date-relative label waits.
    : scheduleDateStatus(series.start_date, series.end_date, hasMounted ? qualifiedScheduleZone(series, resolveVenueTimeZone) : null, scheduleNow);
  const location = getLocationParts(series);
  const venueName = series.venue_name || series.venue || '';
  // BUG FIX: compute once — was called 7x per render (3 callsites × color + 2 × category text)
  const detailVenueBadge = deriveDetailVenueBadge(series);
  const detailCategory = deriveDetailCategory(series);
  const detailCategoryColor = deriveDetailCategoryColor(series);
  // BUG FIX: sanitize source_url — block javascript:/data: XSS vectors before use in <a href>
  const rawSourceUrl = series.source_url || series.website || series.schedule_url || '';
  const sourceUrl = /^https?:\/\//i.test(rawSourceUrl) ? rawSourceUrl : '';
  
  // Clean rawEvents: filter out scraped garbage like ticker-text and slider_right
  const rawEvents = (series.events || []).filter(e => {
    const n = (e.event_name || '').toLowerCase();
    if (!n) return true;
    return !n.includes('ticker-text') && !n.includes('slider_right');
  });
  
  const sortEvents = (eventsToSort, config) => {
    return [...eventsToSort].sort((a, b) => {
      let valA = a[config.key];
      let valB = b[config.key];

      // Handle null/undefined values by pushing them to bottom
      if (valA === null || valA === undefined) return config.direction === 'asc' ? 1 : -1;
      if (valB === null || valB === undefined) return config.direction === 'asc' ? -1 : 1;

      // Type specific sorting
      if (config.key === 'start_date') {
        const msA = Date.parse(valA + 'T00:00:00');
        const msB = Date.parse(valB + 'T00:00:00');
        valA = isNaN(msA) ? 0 : msA;
        valB = isNaN(msB) ? 0 : msB;
      } else if (config.key === 'buy_in' || config.key === 'guarantee' || config.key === 'event_number') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      if (valA < valB) return config.direction === 'asc' ? -1 : 1;
      if (valA > valB) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const events = sortConfig.key ? sortEvents(rawEvents, sortConfig) : rawEvents;

  return (
    <>
      <SeriesHead series={seoSeries || toSeoSeries(series)} />
      <UniversalHeader 
        pageDepth={2} 
        onMenuClick={() => setMenuOpen(true)}
        onBackClick={() => {
          router.back();
        }}
      />
      <PokerNearMeFamilyNav />

      <HamburgerMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
      />

      <main className="series-page" data-pnm-secondary-foundation="interaction-v1">


        {/* Breadcrumb Navigation */}
        <nav className="breadcrumb-nav" aria-label="Breadcrumb">
          <ol className="breadcrumb-list">
            <li className="breadcrumb-item">
              <Link href="/hub" legacyBehavior><a className="breadcrumb-link">Hub</a></Link>
              <span className="breadcrumb-sep">/</span>
            </li>
            <li className="breadcrumb-item">
              <Link href="/hub/poker-near-me/lobby" legacyBehavior><a className="breadcrumb-link">Poker Near Me</a></Link>
              <span className="breadcrumb-sep">/</span>
            </li>
            {series.tour && series.tour.toUpperCase() !== 'INDEPENDENT' && (
              <li className="breadcrumb-item">
                <Link href={'/hub/poker-series?tour=' + encodeURIComponent(series.tour)} legacyBehavior><a className="breadcrumb-link">{series.tour}</a></Link>
                <span className="breadcrumb-sep">/</span>
              </li>
            )}
            <li className="breadcrumb-item breadcrumb-current">
              {series.name}
            </li>
          </ol>
        </nav>

        {/* Header Section */}
        <PokerNearMePanelShell className="series-header" bodyClassName="series-header__body">

          {/* Square Venue Logo — top-left of header */}
          <PokerIdentityMark
            src={series.logo_url}
            name={series.name}
            size={72}
            className="series-identity-mark"
            priority
          />

          <div className="header-badges">
            {/* Tour Badge */}
            <span className="tour-badge">{detailVenueBadge}</span>

            {/* Series Type Badge */}
            <span className="type-badge">{detailCategory}</span>

            {/* Status Badge */}
            <span className="status-badge" data-tone={status.tone || 'neutral'}>{status.label}</span>
          </div>

          <h1 className="series-title">{decodeHtml(series.name)}</h1>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              className={'action-btn follow-btn' + (isFollowing ? ' following' : '')}
              onClick={toggleFollow}
            >
              {isFollowing ? (
                <>
                  <PokerNearMeConsoleIcon name="saved" className="action-btn__glyph" />
                  Following
                  {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
                </>
              ) : (
                <>
                  <PokerNearMeConsoleIcon name="saved" className="action-btn__glyph" />
                  Follow
                  {followerCount > 0 && <span className="follow-count">{followerCount}</span>}
                </>
              )}
            </button>
            <button className="action-btn share-btn" onClick={handleShare}>
              <PokerNearMeConsoleIcon name="share" className="action-btn__glyph" />
              {shareMessage || 'Share'}
            </button>
          </div>
        </PokerNearMePanelShell>

        {/* Key Stats Grid */}
        <PokerNearMePanelShell className="stats-grid" bodyClassName="stats-grid__body">
          <div className="stat-card">
            <div className="stat-label">Dates</div>
            <div className="stat-value">{formatDateRange(series.start_date, series.end_date)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Main Event Buy-In</div>
            <div className="stat-value gold">{series.main_event_buyin ? formatMoney(series.main_event_buyin) : 'TBD'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Events</div>
            <div className="stat-value">{events.length || series.total_events || 'TBD'}</div>
          </div>
          {(() => {
            const buyIns = events.filter(e => e.buy_in).map(e => Number(e.buy_in));
            const minBuy = buyIns.length ? Math.min(...buyIns) : null;
            const maxBuy = buyIns.length ? Math.max(...buyIns) : null;
            return minBuy ? (
              <div className="stat-card">
                <div className="stat-label">Buy-In Range</div>
                <div className="stat-value gold">{formatMoney(minBuy)} - {formatMoney(maxBuy)}</div>
              </div>
            ) : null;
          })()}
          {(() => {
            const totalGtd = events.reduce((sum, e) => sum + (Number(e.guarantee) || 0), 0);
            const seriesGtd = series.total_guaranteed || totalGtd;
            return seriesGtd ? (
              <div className="stat-card">
                <div className="stat-label">Total Guaranteed</div>
                <div className="stat-value gold">{formatMoney(seriesGtd)}</div>
              </div>
            ) : null;
          })()}
          {series.main_event_guaranteed && (
            <div className="stat-card">
              <div className="stat-label">Main Event GTD</div>
              <div className="stat-value gold">{formatMoney(series.main_event_guaranteed)}</div>
            </div>
          )}
          <div className="stat-card">
            <div className="stat-label">Series Type</div>
            <div className="stat-value">
              <span className="inline-type-dot" style={{ background: detailCategoryColor }} />
              {detailCategory}
            </div>
          </div>
        </PokerNearMePanelShell>

        {/* Venue Info */}
        <PokerNearMePanelShell className="section-card" bodyClassName="section-card__body">
          <h2 className="section-title">Venue Information</h2>
          <div className="venue-info">
            {venueName && (
              <div className="venue-row">
                <span className="venue-label">Venue</span>
                {series.venue_id ? (
                  <Link href={'/hub/venues/' + series.venue_id} legacyBehavior>
                    <a className="venue-value venue-value-link">{venueName}</a>
                  </Link>
                ) : (
                  <span className="venue-value">{venueName}</span>
                )}
              </div>
            )}
            {(location.city || location.state) && (
              <div className="venue-row">
                <span className="venue-label">Location</span>
                <span className="venue-value">
                  {location.city}{location.city && location.state ? ', ' : ''}{location.state}
                </span>
              </div>
            )}
            <div className="venue-links">
              {series.venue_id && (
                <Link href={'/hub/venues/' + series.venue_id} legacyBehavior>
                  <a className="venue-link venue-link-primary">
                    <PokerNearMeConsoleIcon name="location" className="series-glyph" />
                    View Venue Page
                  </a>
                </Link>
              )}
              {(venueName || location.city) && (
                <Link
                  href={'/hub/poker-near-me/lobby?q=' + encodeURIComponent(venueName || location.city)}
                  legacyBehavior
                >
                  <a className="venue-link">
                    <PokerNearMeConsoleIcon name="globe" className="series-glyph" />
                    Find On Poker Near Me
                  </a>
                </Link>
              )}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="venue-link external"
                >
                  <PokerNearMeConsoleIcon name="globe" className="series-glyph" />
                  Official Website
                </a>
              )}
            </div>
          </div>
        </PokerNearMePanelShell>

        {/* Events Section */}
        <PokerNearMePanelShell className="section-card" bodyClassName="section-card__body">
          <h2 className="section-title">
            Event Schedule
            {events.length > 0 && <span className="event-count">{events.length + ' events'}</span>}
          </h2>

          {events.length > 0 ? (
            <div className="events-table-wrap">
              <table className="events-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('event_number')} style={{ cursor: 'pointer' }}># {sortConfig.key === 'event_number' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                    <th>Event</th>
                    <th onClick={() => handleSort('start_date')} style={{ cursor: 'pointer' }}>Date {sortConfig.key === 'start_date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                    <th onClick={() => handleSort('buy_in')} style={{ cursor: 'pointer' }}>Buy-In {sortConfig.key === 'buy_in' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                    <th onClick={() => handleSort('guarantee')} style={{ cursor: 'pointer' }}>GTD {sortConfig.key === 'guarantee' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                    <th>Game</th>
                    <th>Stack</th>
                    <th>Format</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt, i) => {
                    // BUG FIX: Use composite key including strict array index to absolutely prevent 
                    // React Fragment key collisions when two events share the same event_number and name.
                    const evtBaseKey = (evt.event_number != null && evt.event_number !== '') ? evt.event_number : i + 1;
                    const evtKey = `${evtBaseKey}-${(evt.event_name || '').slice(0, 20) || i}-${i}`;
                    var isExpanded = expandedEvent === evtKey;
                    return (
                      <Fragment key={'evt-' + evtKey}>
                        <tr
                          className={'event-row-clickable' + (isExpanded ? ' expanded' : '')}
                          onClick={function () { setExpandedEvent(isExpanded ? null : evtKey); }}
                        >
                          <td className="event-num">{evt.event_number != null && evt.event_number !== '' ? evt.event_number : i + 1}</td>
                          <td className="event-name">
                            {cleanEventName(evt.event_name) || 'TBD'}
                            <span className="expand-indicator">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                          </td>
                          <td className="event-date">
                            <span className="event-date-main">{formatEventDate(evt.start_date)}</span>
                            {(evt.start_time || extractTimeFromName(evt.event_name)) && (
                              <span className="event-time-sub">{format12HourTime(evt.start_time) || extractTimeFromName(evt.event_name)}</span>
                            )}
                          </td>
                          <td className="event-buyin">{evt.buy_in ? formatMoney(evt.buy_in) : 'TBD'}</td>
                          <td className="event-gtd">{evt.guarantee ? formatMoney(evt.guarantee) : '--'}</td>
                          <td className="event-game">{evt.game_type ? formatGameType(evt.game_type) : '--'}</td>
                          <td className="event-stack">{evt.starting_stack ? Number(evt.starting_stack).toLocaleString() : '--'}</td>
                          <td className="event-format">{evt.format || '--'}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="event-detail-row">
                            <td colSpan="8">
                              <div className="event-detail-content">
                                <div className="event-detail-grid">
                                  {evt.event_name && (
                                    <div className="detail-field">
                                      <span className="detail-label">Event</span>
                                      <span className="detail-value">{evt.event_name}</span>
                                    </div>
                                  )}
                                  {evt.start_date && (
                                    <div className="detail-field">
                                      <span className="detail-label">Date</span>
                                      <span className="detail-value">{formatEventDate(evt.start_date)}{evt.end_date && evt.end_date !== evt.start_date ? ' - ' + formatEventDate(evt.end_date) : ''}</span>
                                    </div>
                                  )}
                                  {evt.buy_in && (
                                    <div className="detail-field">
                                      <span className="detail-label">Buy-In</span>
                                      <span className="detail-value detail-highlight">{formatMoney(evt.buy_in)}</span>
                                    </div>
                                  )}
                                  {evt.fee && (
                                    <div className="detail-field">
                                      <span className="detail-label">Fee</span>
                                      <span className="detail-value">{formatMoney(evt.fee)}</span>
                                    </div>
                                  )}
                                  {(evt.guarantee || evt.guaranteed) && (
                                    <div className="detail-field">
                                      <span className="detail-label">Guaranteed</span>
                                      <span className="detail-value detail-highlight">{formatMoney(evt.guarantee || evt.guaranteed)}</span>
                                    </div>
                                  )}
                                  {evt.game_type && (
                                    <div className="detail-field">
                                      <span className="detail-label">Game</span>
                                      <span className="detail-value">{formatGameType(evt.game_type)}</span>
                                    </div>
                                  )}
                                  {evt.format && (
                                    <div className="detail-field">
                                      <span className="detail-label">Format</span>
                                      <span className="detail-value">{evt.format}</span>
                                    </div>
                                  )}
                                  {evt.start_time && (
                                    <div className="detail-field">
                                      <span className="detail-label">Start Time</span>
                                      <span className="detail-value">{format12HourTime(evt.start_time)}</span>
                                    </div>
                                  )}
                                  {evt.reg_open_until && (
                                    <div className="detail-field">
                                      <span className="detail-label">Registration Open Until</span>
                                      <span className="detail-value">{evt.reg_open_until}</span>
                                    </div>
                                  )}
                                  {(evt.starting_stack || evt.starting_chips) && (
                                    <div className="detail-field">
                                      <span className="detail-label">Starting Chips</span>
                                      <span className="detail-value">{typeof (evt.starting_stack || evt.starting_chips) === 'number' ? (evt.starting_stack || evt.starting_chips).toLocaleString() : (evt.starting_stack || evt.starting_chips)}</span>
                                    </div>
                                  )}
                                  {(evt.levels || evt.blind_levels) && (
                                    <div className="detail-field">
                                      <span className="detail-label">Blind Levels</span>
                                      <span className="detail-value">{evt.levels || evt.blind_levels}{evt.level_duration_minutes ? ` (${evt.level_duration_minutes} min each)` : ''}</span>
                                    </div>
                                  )}
                                  {(evt.late_reg_levels || evt.late_reg || evt.late_registration) && (
                                    <div className="detail-field">
                                      <span className="detail-label">Late Registration</span>
                                      <span className="detail-value detail-late-reg">{evt.late_reg_levels || evt.late_reg || evt.late_registration}</span>
                                    </div>
                                  )}
                                  {evt.notes && (
                                    <div className="detail-field full-width">
                                      <span className="detail-label">Notes</span>
                                      <span className="detail-value">{evt.notes}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-events">
              <PokerNearMeConsoleIcon name="calendar" className="series-glyph" />
              <p>Event Schedule Not Yet Available</p>
              <p className="no-events-sub">Check Back Closer To The Series Start Date For The Full Schedule.</p>
            </div>
          )}
        </PokerNearMePanelShell>

        {/* Results & Leaderboard Section */}
        <PokerNearMePanelShell className="section-card" bodyClassName="section-card__body">
          <h2 className="section-title">Results &amp; Leaderboard</h2>

          {results.length === 0 && leaderboard.length === 0 && (
            <div className="no-events">
              <PokerNearMeConsoleIcon name="trophy" className="series-glyph" />
              <p>Results Will Be Posted As Events Complete.</p>
            </div>
          )}

          {/* Leaderboard Sub-section */}
          {leaderboard.length > 0 && (
            <div className="leaderboard-section">
              <h3 className="subsection-title">Leaderboard</h3>
              <div className="leaderboard-table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Player</th>
                      <th>Earnings</th>
                      <th>Cashes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, idx) => {
                      const rank = entry.rank || idx + 1;
                      const podiumColor = PODIUM_COLORS[rank] || null;
                      return (
                        <tr key={idx} className={rank <= 3 ? 'podium-row' : ''}>
                          <td className="lb-rank" style={podiumColor ? { color: podiumColor } : {}}>
                            {rank <= 3 ? (
                              <span className="rank-medal" style={{ background: podiumColor }}>{rank}</span>
                            ) : rank}
                          </td>
                          <td className="lb-player" style={podiumColor ? { color: podiumColor } : {}}>
                            {entry.name}
                          </td>
                          <td className="lb-earnings">{formatMoney(entry.totalEarnings)}</td>
                          <td className="lb-cashes">{entry.cashes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Individual Results Sub-section */}
          {results.length > 0 && (
            <div className="individual-results-section">
              <h3 className="subsection-title">Individual Results</h3>
              <div className="ind-results-grid">
                {results.map((result, idx) => (
                  <div key={idx} className="ind-result-card">
                    <div className="ind-result-name">{result.event_name}</div>
                    <div className="ind-result-details">
                      {result.winner_name && (
                        <div className="ind-result-row">
                          <span className="ind-result-label">Winner</span>
                          <span className="ind-result-winner">{result.winner_name}</span>
                        </div>
                      )}
                      {result.winner_prize && (
                        <div className="ind-result-row">
                          <span className="ind-result-label">Prize</span>
                          <span className="ind-result-prize">{formatMoney(result.winner_prize)}</span>
                        </div>
                      )}
                      {result.total_entries && (
                        <div className="ind-result-row">
                          <span className="ind-result-label">Entries</span>
                          <span className="ind-result-value">{result.total_entries}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PokerNearMePanelShell>

        {/* Activity Feed Section */}
        <PokerNearMePanelShell className="section-card" bodyClassName="section-card__body">
          <h2 className="section-title">Updates</h2>

          {activities.length === 0 && (
            <div className="no-events">
              <PokerNearMeConsoleIcon name="info" className="series-glyph" />
              <p>No Updates Yet.</p>
            </div>
          )}

          {activities.length > 0 && (
            <div className="activity-list">
              {activities.map((activity, idx) => {
                const typeColor = ACTIVITY_TYPE_COLORS[activity.activity_type] || ACTIVITY_TYPE_COLORS.update;
                return (
                  <div key={activity.id || idx} className="activity-item">
                    <div className="activity-header">
                      <span
                        className="activity-type-badge"
                        style={{
                          background: typeColor.bg,
                          color: typeColor.text,
                          borderColor: typeColor.border,
                        }}
                      >
                        {(activity.activity_type || 'update').charAt(0).toUpperCase() + (activity.activity_type || 'update').slice(1)}
                      </span>
                      <span className="activity-time">{timeAgo(activity.created_at)}</span>
                    </div>
                    <p className="activity-content">{activity.content}</p>
                  </div>
                );
              })}
            </div>
          )}
        </PokerNearMePanelShell>
      </main>

      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: styles }} />
    </>
  );
}

const styles = `
  /* Metal UI Variables */
  :root {
    --metal-dark: #0a0a15;
    --metal-base: #0d1117;
    --metal-mid: #1a2332;
    --metal-highlight: #3d4f5f;
    --neon-cyan: #00D4FF;
    --neon-cyan-glow: rgba(0, 212, 255, 0.6);
    --metal-gradient: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
    --glow-cyan: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow);
  }

  .series-page {
    min-height: 100vh; padding-bottom: 70px;
    background: radial-gradient(ellipse at 20% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 20%, rgba(0, 212, 255, 0.06) 0%, transparent 50%),
                linear-gradient(180deg, #030712 0%, #0f172a 100%);
    padding: 80px 16px 60px;
    font-family: 'Rajdhani', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #e2e8f0;
  }

  /* Breadcrumb Navigation */
  .breadcrumb-nav {
    max-width: 900px;
    margin: 0 auto 20px;
  }
  .breadcrumb-list {
    display: flex;
    align-items: center;
    list-style: none;
    margin: 0;
    padding: 0;
    flex-wrap: wrap;
    gap: 0;
  }
  .breadcrumb-item {
    display: flex;
    align-items: center;
    font-size: 13px;
    font-weight: 500;
  }
  .breadcrumb-link {
    color: #94a3b8;
    text-decoration: none;
    transition: color 0.2s;
  }
  .breadcrumb-link:hover {
    color: #00D4FF;
  }
  .breadcrumb-sep {
    margin: 0 8px;
    color: #475569;
  }
  .breadcrumb-current {
    color: #00D4FF;
    font-weight: 600;
    max-width: 280px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Header */
  body.world-poker-near-me .pnc-panel.series-header {
    width: min(100%, 900px);
    max-width: 900px;
    margin: 0 auto 28px;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    background-color: transparent !important;
    background-image: none !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
    overflow: visible !important;
    transform: none !important;
  }
  .series-header__body {
    padding-top: 6px;
    padding-bottom: 20px;
  }

  .header-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 16px;
  }

  /* The three badges were a gradient chip, a tinted pill and an outlined
     pill, each coloured from its own table. They are labels; they print as
     labels in the console's own inks, separated by an engraved rule. */
  body.world-poker-near-me .series-header .tour-badge {
    display: inline-flex;
    align-items: center;
    padding: 0 14px 0 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    color: #45adff !important;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-shadow: 0 0 6px rgba(49,168,255,0.55), 0 1px 2px rgba(0,0,0,0.85);
    text-transform: uppercase;
  }

  body.world-poker-near-me .series-header .type-badge,
  body.world-poker-near-me .series-header .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0 14px !important;
    border: 0 !important;
    border-left: 1px solid #000 !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: inset 1px 0 0 rgba(255,255,255,0.08) !important;
    color: #9aa5b3 !important;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }


  .series-title {
    font-size: 28px;
    font-weight: 800;
    color: #f1f5f9;
    margin: 0 0 20px;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  /* Action Buttons */
  .action-buttons {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  /* The action plates are painted. Nothing here draws a button, and a
     phone cannot hover, so the lift states below are gone. */
  body.world-poker-near-me .series-header .action-btn {
    display: inline-flex;
    min-width: 150px;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 20px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent url('/images/pnm-console/painted-controls-v1/button-secondary.png') center / 100% 100% no-repeat !important;
    box-shadow: none !important;
    color: #e4e7ec !important;
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-shadow: 0 1px 0 #050607, 0 2px 4px rgba(0,0,0,0.85);
    text-transform: uppercase;
  }
  body.world-poker-near-me .series-header .action-btn.follow-btn {
    background-image: url('/images/pnm-console/painted-controls-v1/button-primary.png') !important;
    color: #f4f7fb !important;
    text-shadow: 0 0 8px rgba(140,210,255,0.85), 0 2px 4px rgba(0,0,0,0.7);
  }
  body.world-poker-near-me .series-header .action-btn:active {
    filter: brightness(1.2);
  }
  body.world-poker-near-me .series-header .action-btn:focus-visible {
    outline: 2px solid #8fd4ff;
    outline-offset: -6px;
  }
  body.world-poker-near-me .series-glyph {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
  }
  body.world-poker-near-me .no-events .series-glyph {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    opacity: 0.75;
  }
  body.world-poker-near-me .series-header .action-btn__glyph {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
  }
  body.world-poker-near-me .series-header .follow-count {
    border-radius: 0;
    background: none;
    color: inherit;
  }

  .follow-btn {
    background: rgba(0, 212, 255, 0.12);
    border: 1px solid rgba(0, 212, 255, 0.3);
    color: #00D4FF;
  }


  body.world-poker-near-me .series-header .action-btn.follow-btn.following {
    color: #c8ffd2 !important;
    text-shadow: 0 0 8px rgba(53,217,90,0.7), 0 2px 4px rgba(0,0,0,0.7);
  }


  .follow-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: rgba(0, 212, 255, 0.2);
    font-size:12px;
    font-weight: 700;
    color: #00D4FF;
  }

  .share-btn {
    background: rgba(148, 163, 184, 0.08);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
  }


  /* Stats Grid */
  /* The grid moved to the panel body; the panel itself is a column of
     painted slices and must not be turned into a grid container. */

  body.world-poker-near-me .stats-grid .stat-card {
    display: grid;
    min-height: 48px;
    align-content: center;
    padding: 10px 0 !important;
    border: 0 !important;
    border-top: 1px solid #000 !important;
    border-radius: 0 !important;
    background: none !important;
    backdrop-filter: none !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
  }

  .stat-label {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #f1f5f9;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat-value.gold {
    color: #00D4FF;
  }

  .inline-type-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Section Card */
  /* PAINT WHAT NEVER CHANGES (2026-09-29). Every section was a glass card:
     a 3% white fill, a 16px radius and a 12px backdrop blur. The frame is
     master art now, and a shared world rule that dresses anything called a
     card is switched off longhand by longhand at higher specificity so no
     frame sits on the painted frame. */
  body.world-poker-near-me .pnc-panel.section-card,
  body.world-poker-near-me .pnc-panel.stats-grid {
    width: min(100%, 900px);
    max-width: 900px;
    margin: 0 auto 28px;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    background-color: transparent !important;
    background-image: none !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
    overflow: visible !important;
    transform: none !important;
  }
  .section-card__body,
  .stats-grid__body {
    padding-top: 6px;
    padding-bottom: 18px;
  }
  /* Figures print as rows on the glass: label in lit blue on the left,
     value in engraved silver on the right, an engraved rule between them. */
  .stats-grid__body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    column-gap: 28px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .event-count {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    background: rgba(148, 163, 184, 0.1);
    padding: 4px 10px;
    border-radius: 12px;
  }

  /* Venue Info */
  .venue-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .venue-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .venue-label {
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
    min-width: 72px;
    flex-shrink: 0;
  }

  .venue-value {
    font-size: 15px;
    color: #e2e8f0;
    font-weight: 500;
  }
  .venue-value-link {
    color: #00D4FF;
    text-decoration: underline;
    text-decoration-color: rgba(0, 212, 255, 0.3);
    text-underline-offset: 2px;
    transition: text-decoration-color 0.2s;
  }
  .venue-value-link:hover {
    text-decoration-color: #00D4FF;
  }

  .venue-links {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 8px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .venue-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #60a5fa;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    transition: color 0.2s;
  }

  .venue-link:hover {
    color: #93bbfc;
  }
  .venue-link-primary {
    color: #00D4FF;
    background: rgba(0, 212, 255, 0.08);
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(0, 212, 255, 0.2);
  }
  .venue-link-primary:hover {
    color: #00D4FF;
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.4);
  }

  .venue-link.external {
    color: #00D4FF;
  }

  .venue-link.external:hover {
    color: #e8c370;
  }

  /* Events Table */
  .events-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0 -28px;
    padding: 0 28px;
  }

  .events-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px;
  }

  .events-table thead th {
    text-align: left;
    font-size:12px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    white-space: nowrap;
  }

  .events-table tbody tr {
    transition: background 0.15s;
  }

  .events-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .events-table tbody td {
    padding: 12px 12px;
    font-size: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    vertical-align: middle;
  }

  .event-num {
    color: #64748b;
    font-weight: 600;
    font-size: 13px;
    width: 40px;
  }

  .event-name {
    color: #e2e8f0;
    font-weight: 600;
    max-width: 280px;
  }

  .event-date {
    color: #94a3b8;
    white-space: nowrap;
    vertical-align: middle;
  }
  .event-date-main {
    display: block;
    color: #94a3b8;
    font-size: 13px;
    white-space: nowrap;
  }
  .event-time-sub {
    display: block;
    color: #60a5fa;
    font-size:12px;
    font-weight: 600;
    margin-top: 2px;
    white-space: nowrap;
    letter-spacing: 0.3px;
  }


  .event-buyin {
    color: #00D4FF;
    font-weight: 700;
    white-space: nowrap;
  }

  .event-game {
    color: #94a3b8;
    white-space: nowrap;
  }

  .event-format {
    color: #94a3b8;
    white-space: nowrap;
  }

  .event-row-clickable {
    cursor: pointer;
    user-select: none;
  }
  .event-row-clickable:hover {
    background: rgba(0, 212, 255, 0.06) !important;
  }
  .event-row-clickable.expanded {
    background: rgba(0, 212, 255, 0.08) !important;
    border-bottom-color: transparent;
  }
  .event-row-clickable.expanded td {
    border-bottom-color: transparent;
  }
  .expand-indicator {
    margin-left: 8px;
    font-size:12px;
    color: #64748b;
    vertical-align: middle;
  }
  .event-detail-row td {
    padding: 0 12px 16px !important;
    border-bottom: 1px solid rgba(0, 212, 255, 0.15) !important;
  }
  .event-detail-content {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(0, 212, 255, 0.15);
    border-radius: 10px;
    padding: 16px 20px;
  }
  .event-detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  .detail-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .detail-field.full-width {
    grid-column: 1 / -1;
  }
  .detail-label {
    font-size:12px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .detail-value {
    font-size: 14px;
    color: #e2e8f0;
    font-weight: 500;
  }
  .detail-highlight {
    color: #00D4FF;
    font-weight: 700;
  }
  .detail-late-reg {
    color: #fbbf24;
    font-weight: 600;
  }

  /* No Events */
  .no-events {
    text-align: center;
    padding: 40px 20px;
    color: #64748b;
  }

  .no-events svg {
    margin-bottom: 16px;
  }

  .no-events p {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #94a3b8;
  }

  .no-events-sub {
    margin-top: 8px !important;
    font-size: 13px !important;
    font-weight: 400 !important;
    color: #64748b !important;
  }

  /* Leaderboard Section */
  .leaderboard-section {
    margin-bottom: 24px;
  }

  .subsection-title {
    font-size: 15px;
    font-weight: 700;
    color: #cbd5e1;
    margin: 0 0 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .leaderboard-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0 -28px;
    padding: 0 28px;
  }

  .leaderboard-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 400px;
  }

  .leaderboard-table thead th {
    text-align: left;
    font-size:12px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    white-space: nowrap;
  }

  .leaderboard-table tbody tr {
    transition: background 0.15s;
  }

  .leaderboard-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .leaderboard-table tbody td {
    padding: 12px 12px;
    font-size: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    vertical-align: middle;
  }

  .lb-rank {
    font-weight: 700;
    color: #94a3b8;
    width: 60px;
  }

  .rank-medal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 800;
    color: #000;
  }

  .lb-player {
    font-weight: 600;
    color: #e2e8f0;
  }

  .podium-row .lb-player {
    font-weight: 700;
  }

  .lb-earnings {
    font-weight: 700;
    color: #4ade80;
    white-space: nowrap;
  }

  .lb-cashes {
    color: #94a3b8;
    font-weight: 600;
  }

  /* Individual Results */
  .individual-results-section {
    margin-top: 4px;
  }

  .ind-results-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0;
  }

  .ind-result-card {
    padding: 16px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.15s;
  }

  .ind-result-card:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .ind-result-card:first-child {
    padding-top: 0;
  }

  .ind-result-name {
    font-size: 15px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 10px;
  }

  .ind-result-details {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .ind-result-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ind-result-label {
    font-size:12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #64748b;
  }

  .ind-result-winner {
    font-size: 14px;
    font-weight: 700;
    color: #00D4FF;
  }

  .ind-result-prize {
    font-size: 14px;
    font-weight: 700;
    color: #4ade80;
  }

  .ind-result-value {
    font-size: 14px;
    font-weight: 600;
    color: #e2e8f0;
  }

  /* Activity Feed */
  .activity-list {
    display: flex;
    flex-direction: column;
  }

  .activity-item {
    padding: 16px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .activity-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .activity-item:first-child {
    padding-top: 0;
  }

  .activity-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .activity-type-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid;
    font-size:12px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .activity-time {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
    white-space: nowrap;
  }

  .activity-content {
    margin: 0;
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.5;
  }

  /* Loading */
  .series-summary {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px 0;
  color: #e2e8f0;
}
.series-summary h1 {
  font-size: 26px;
  line-height: 1.25;
  color: #fff;
  margin: 0 0 12px;
}
.series-summary dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0 0 12px;
  font-size: 15px;
}
.series-summary dl > div {
  display: contents;
}
.series-summary dt {
  color: rgba(148, 163, 184, 0.9);
  font-weight: 600;
}
.series-summary dd {
  margin: 0;
  color: #e2e8f0;
}
.series-summary p {
  font-size: 14px;
  color: rgba(148, 163, 184, 0.95);
  line-height: 1.6;
  margin: 0;
}
.series-summary a {
  color: #d4a853;
}
.series-summary-schedule-heading {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: #e2e8f0;
  margin: 22px 0 10px;
}
.series-summary-schedule {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 9px;
}
.series-summary-schedule li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 11px 13px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.42);
}
.sss-name { font-size: 13.5px; font-weight: 700; color: #f1f5f9; line-height: 1.35; }
.sss-when { font-size: 12.5px; color: #9fd8ff; font-weight: 600; }
.sss-terms { font-size: 12.5px; color: rgba(148, 163, 184, 0.9); }
.series-summary-more { margin-top: 12px !important; font-size: 13px !important; }
.loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(0, 212, 255, 0.15);
    border-top-color: #00D4FF;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-text {
    margin-top: 16px;
    color: #94a3b8;
    font-size: 14px;
  }

  /* Error */
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
  }

  .error-title {
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 12px;
  }

  .error-text {
    color: #94a3b8;
    font-size: 15px;
    margin: 0 0 24px;
  }

  .back-link-btn {
    display: inline-flex;
    align-items: center;
    padding: 12px 24px;
    background: rgba(0, 212, 255, 0.12);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 10px;
    color: #00D4FF;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .back-link-btn:hover {
    background: rgba(0, 212, 255, 0.22);
    border-color: #00D4FF;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .series-page {
      padding: 70px 12px 40px;
    }

    .series-header {
      padding: 20px 18px;
    }

    .series-title {
      font-size: 22px;
    }

    .stats-grid {
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .stats-grid__body .stat-card {
      padding: 9px 0;
    }

    .stat-value {
      font-size: 16px;
    }

    .section-card__body {
      padding-bottom: 14px;
    }

    .events-table-wrap {
      margin: 0;
      padding: 0;
    }
    .events-table {
      min-width: 100%;
      display: block;
    }
    .events-table thead {
      display: none;
    }
    .events-table tbody {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .events-table tbody tr:not(.event-detail-row) {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      padding: 16px;
      gap: 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      position: relative;
    }
    .events-table tbody td {
      border: none;
      padding: 0;
    }
    .event-num {
      width: auto;
      font-size: 12px;
      background: rgba(255,255,255,0.1);
      padding: 2px 8px;
      border-radius: 12px;
      color: #cbd5e1;
    }
    .event-name {
      flex: 1 1 calc(100% - 50px);
      max-width: none;
      font-size: 15px;
      margin-bottom: 8px;
    }
    .event-date {
      flex: 1 1 100%;
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
    }
    .event-date-main, .event-time-sub {
      display: inline-block;
      margin: 0;
    }
    .event-buyin {
      flex: 1 1 45%;
      font-size: 16px;
    }
    .event-gtd {
      flex: 1 1 45%;
      text-align: right;
    }
    .event-gtd::before {
      content: 'GTD ';
      font-size:12px;
      color: #64748b;
    }
    .event-game, .event-stack, .event-format {
      display: none; /* Keep mobile view clean, they can click to expand */
    }
    .event-detail-row td {
      padding: 0 0 16px !important;
      border: none !important;
    }
    .event-row-clickable.expanded {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      background: rgba(0, 212, 255, 0.08) !important;
    }

    .leaderboard-table-wrap {
      margin: 0 -16px;
      padding: 0 16px;
    }

    .action-buttons {
      flex-direction: column;
    }

    .action-btn {
      justify-content: center;
    }

    .venue-row {
      flex-direction: column;
      gap: 2px;
    }

    .ind-result-details {
      flex-direction: column;
      gap: 10px;
    }

    .event-detail-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 480px) {
    .event-detail-grid {
      grid-template-columns: 1fr;
    }
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .header-badges {
      gap: 8px;
    }

    .series-title {
      font-size: 20px;
    }
  }
`;
