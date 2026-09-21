/**
 * Server-side data for the public poker series pages.
 *
 * DISCOVERABILITY (2026-09-18). /hub/series/[id] fetched everything in the
 * browser, so the server HTML a crawler reads was the LOADING branch: the
 * placeholder title "Poker Series Details", the placeholder site
 * description, `noindex, nofollow`, and about 75 words of chrome. The
 * sitemap lists 246 of these pages, a fifth of every URL it offers, so a
 * fifth of the crawl budget was spent on pages that load and then tell the
 * crawler to go away. Measured live on 2026-09-18 before this change.
 *
 * The head is now rendered on the server from the same public API the
 * browser uses, so the series' own name, venue, dates and stakes are in the
 * HTML and the page is indexable. A series that does not exist is a real
 * 404 and stays out of the index; an API that cannot answer is a 503, so a
 * crawler comes back rather than indexing a spinner.
 *
 * This is the pattern already proven on /hub/commander/venues/[id].
 */
import { firstThatFits } from '../seo/titleFit.js';

const TIMEOUT_MS = 4000;

/** Absolute origin for a same-origin API call from getServerSideProps. */
export function originFrom(req) {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (!host) return 'https://smarter.poker';
  const proto = req?.headers?.['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Props must be JSON: every field is a string, a number, or null (never undefined). */
export function toSeoSeries(raw) {
  if (!raw || typeof raw !== 'object' || raw.id === undefined || raw.id === null) return null;
  const s = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    id: String(raw.id),
    name: s(raw.name),
    venueName: s(raw.venue_name) || s(raw.venue),
    city: s(raw.city),
    state: s(raw.state),
    location: s(raw.location),
    startDate: s(raw.start_date),
    endDate: s(raw.end_date),
    mainEventBuyin: n(raw.main_event_buyin),
    mainEventGuaranteed: n(raw.main_event_guaranteed),
    // A scraped series often carries total_events: 0 with a real
    // events_count; take whichever actually counts events.
    totalEvents: Math.max(n(raw.total_events) ?? 0, n(raw.events_count) ?? 0),
    seriesType: s(raw.series_type),
    logoUrl: s(raw.logo_url),
    // The identity the two legacy tables share. seriesRouteIdentity.mjs
    // already states that tournament_series is the public route identity and
    // poker_series only supplies fresher metadata; this is what lets a
    // duplicate route point at the primary one (AEO phase 3, 2026-09-18).
    seriesUid: s(raw.series_uid),
    canonicalId: null,
    // THE SCHEDULE (AEO phase 3, 2026-09-19). Measured on production, every
    // one of the 225 series pages served about 139 words and the sentence
    // "Loading Series Details...", under copy that promised "The Full
    // Schedule, Buy-Ins, Guarantees And Results ... Are Listed Below". The
    // events were in the API response the server was already awaiting and
    // this function was dropping them on the floor.
    events: toSeoEvents(raw.events),
  };
}

/**
 * The cap is the page, not the data: the largest series in the directory
 * publishes 182 events and the median publishes 12, so a hundred rows
 * carries every series but one in full and keeps that one from doubling the
 * document. The page says when it has shown fewer than it holds.
 */
export const SEO_EVENT_LIMIT = 100;

export function toSeoEvents(raw) {
  if (!Array.isArray(raw)) return [];
  const s = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  const n = (x) => {
    const value = typeof x === 'string' ? Number(x) : x;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  };
  return raw
    .map((event) => ({
      name: s(event?.event_name) || s(event?.tournament_name),
      number: s(event?.event_number) || s(event?.series_event_number),
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(event?.start_date ?? '')) ? event.start_date : null,
      startTime: /^\d{2}:\d{2}/.test(String(event?.start_time ?? '')) ? String(event.start_time).slice(0, 5) : null,
      buyin: n(event?.buy_in),
      guarantee: n(event?.guarantee),
      game: s(event?.game_type),
      flight: s(event?.flight),
    }))
    .filter((event) => event.name)
    .sort((a, b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999'))
      || String(a.startTime || '').localeCompare(String(b.startTime || '')))
    .slice(0, SEO_EVENT_LIMIT);
}

/** A series with no name has nothing to index. */
export function isPublicSeries(v) {
  return !!v && !!v.name;
}

/**
 * Resolves to { series, status }: 'ok', 'not-found' (the API answered 404 or
 * 400, or the id is not a series id) or 'unavailable' (anything else: the API
 * did not answer, rate limited, or failed).
 *
 * The difference matters more than it looks. 'not-found' makes the page send
 * a 404, and a 404 is a statement that the page does not exist, made to
 * something that will believe it and cache it.
 */
export async function fetchSeries(id, origin) {
  if (!/^[A-Za-z0-9_:-]{1,64}$/.test(String(id ?? ''))) return { series: null, status: 'not-found' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/api/poker/series?id=${encodeURIComponent(id)}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const series = data?.success ? toSeoSeries(data.data) : null;
    if (series) return { series, status: 'ok' };
    // ONLY THE API SAYING SO MEANS NOT FOUND (AEO phase 3, 2026-09-19).
    //
    // This used to treat any `success: false` body as a missing series,
    // whatever the status code carried it. The rate limiter answers 429 with
    // `{ success: false, error: 'Too many requests' }` and every 5xx in this
    // API does the same, so a page that exists could be declared missing by a
    // response that said nothing of the kind. The page then sent a 404, and
    // the 404 was cached.
    //
    // Measured on production: /hub/series/5001217, /5001220, /5001228 and
    // /5001254 all answered 404 from the edge with x-vercel-cache: HIT while
    // the same URL with a cache busting parameter answered 200, and the API
    // answered 200 for every one of them.
    if (res.status === 404 || res.status === 400) {
      return { series: null, status: 'not-found' };
    }
    return { series: null, status: 'unavailable' };
  } catch {
    return { series: null, status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** "February 25 to March 31, 2026", or a single date, or null. */
export function formatRange(startDate, endDate) {
  const part = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    if (!m) return null;
    const month = MONTHS[Number(m[2]) - 1];
    return month ? { month, day: String(Number(m[3])), year: m[1] } : null;
  };
  const a = part(startDate);
  const b = part(endDate);
  if (!a && !b) return null;
  if (!b || !a) {
    const one = a || b;
    return `${one.month} ${one.day}, ${one.year}`;
  }
  if (a.year === b.year && a.month === b.month && a.day === b.day) return `${a.month} ${a.day}, ${a.year}`;
  if (a.year === b.year) return `${a.month} ${a.day} to ${b.month} ${b.day}, ${b.year}`;
  return `${a.month} ${a.day}, ${a.year} to ${b.month} ${b.day}, ${b.year}`;
}

/**
 * The scraped rows often fold the venue into the city ("Venetian Las Vegas
 * Las Vegas" for the Venetian in Las Vegas), so composing venue + city
 * blindly reads "Venetian Las Vegas in Venetian Las Vegas Las Vegas". Strip
 * the venue out of the city before composing, and fall back cleanly when
 * nothing useful is left.
 */
export function cityWithoutVenue(city, venueName) {
  if (!city) return null;
  if (!venueName) return city;
  const cleaned = city.replace(new RegExp(venueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  const trimmed = cleaned.replace(/\s+/g, ' ').replace(/^[\s,–-]+|[\s,–-]+$/g, '');
  return trimmed || null;
}

/**
 * The scrapers write the literal string "Unknown" (and a few of its
 * cousins) into venue and city when the source page did not say. Twelve
 * series titles shipped "... At Unknown" to production because of it, which
 * is worse than saying nothing (AEO phase 3, 2026-09-18).
 */
const PLACEHOLDER = /^(unknown|unnamed|n\/?a|tbd|tba|none|null|undefined|-+)$/i;
export function realPlace(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  return t && !PLACEHOLDER.test(t) ? t : null;
}

export function seriesPlace(v) {
  const venueName = realPlace(v.venueName);
  const city = cityWithoutVenue(realPlace(v.city), venueName);
  const state = realPlace(v.state);
  if (venueName && city) return `${venueName} in ${city}${state ? `, ${state}` : ''}`;
  if (venueName) return `${venueName}${state ? `, ${state}` : ''}`;
  if (city) return `${city}${state ? `, ${state}` : ''}`;
  return realPlace(v.location);
}

/**
 * AEO phase 3 (2026-09-18): this was one template, `${name} At ${place}`,
 * with nothing measuring it. 162 of the 246 series pages in the sitemap
 * rendered past what a result shows, the worst at 111 characters, and a
 * result cut the end, which is where the venue was. Twelve said
 * "At Unknown" because the scraper writes that word into the venue column.
 *
 * The name alone is always kept; the venue is added where it fits.
 */
export function seriesTitle(v) {
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const venue = realPlace(v.venueName);
  const city = cityWithoutVenue(realPlace(v.city), venue);
  return firstThatFits([
    venue ? `${name} At ${venue}` : null,
    city ? `${name} At ${city}` : null,
    name,
  ].filter(Boolean));
}

const money = (n) => `$${Number(n).toLocaleString('en-US')}`;

/**
 * A meta description Google will not truncate. The first sentence (what and
 * where and when) is always kept; the optional sentences are added while
 * they fit inside DESCRIPTION_MAX, so a long series name never pushes the
 * useful part out of the snippet.
 */
export const DESCRIPTION_MAX = 160;

export function seriesDescription(v) {
  const range = formatRange(v.startDate, v.endDate);
  const place = seriesPlace(v);
  // Most detailed opening sentence that fits; a very long series name drops
  // the dates, then the venue, rather than the name itself.
  const openings = [
    `${v.name}${place ? ` runs at ${place}` : ''}${range ? ` from ${range}` : ''}.`,
    `${v.name}${place ? ` runs at ${place}` : ''}.`,
    `${v.name}${range ? ` runs from ${range}` : ''}.`,
    `${v.name}.`,
  ];
  let text = openings.find((o) => o.length <= DESCRIPTION_MAX) ?? openings[openings.length - 1];
  const optional = [];
  if (v.totalEvents) optional.push(`${v.totalEvents} events.`);
  if (v.mainEventBuyin) {
    optional.push(
      v.mainEventGuaranteed
        ? `Main event ${money(v.mainEventBuyin)} with a ${money(v.mainEventGuaranteed)} guarantee.`
        : `Main event ${money(v.mainEventBuyin)}.`
    );
  }
  optional.push('Full schedule, buy-ins and results on Smarter.Poker.');
  for (const bit of optional) {
    if (text.length + 1 + bit.length > DESCRIPTION_MAX) continue;
    text += ` ${bit}`;
  }
  return text;
}

/**
 * The URL this series should be indexed at. When the same series_uid is also
 * held in tournament_series, that row owns the route: reconcileTournament-
 * SeriesEvidence in seriesRouteIdentity.mjs is explicit that poker_series
 * may replace metadata but never the public route identity. The duplicate
 * page then points its canonical here rather than declaring itself the
 * original, so the two stop competing (AEO phase 3, 2026-09-18).
 */
export function seriesPath(v) {
  return `/hub/series/${v?.canonicalId ?? v.id}`;
}

/** The URL this exact record is served at, duplicate or not. */
export function seriesSelfPath(v) {
  return `/hub/series/${v.id}`;
}


/**
 * A series is a real world event, and until now these 246 pages carried no
 * structured data at all. Only fields the record actually has are emitted:
 * an Event without a startDate or a location is worse than no Event, and a
 * guessed one is worse still.
 */
export function seriesSchema(v) {
  const site = 'https://smarter.poker';
  const path = seriesPath(v);
  const url = `${site}${path}`;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const venue = realPlace(v.venueName);
  const city = cityWithoutVenue(realPlace(v.city), venue);
  const state = realPlace(v.state);

  const trail = [
    ['Smarter.Poker', '/'],
    ['Hub', '/hub'],
    // The directory that actually lists every series, not the Poker Near Me
    // tab of the same name: the tab is the near-you view and the trail should
    // climb to the index (AEO phase 3, 2026-09-19).
    ['Poker Series', '/hub/poker-series'],
    [name || 'Series', path],
  ];

  const nodes = [
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name: `${seriesTitle(v)} | Smarter.Poker`,
      description: seriesDescription(v),
      isPartOf: { '@id': `${site}/#website` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: trail.map(([itemName, itemPath], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: itemName,
        item: `${site}${itemPath}`,
      })),
    },
  ];

  // schema.org requires a start date and a location on an Event. Without
  // both, the page is described honestly as a page and no Event is claimed.
  const place = venue || city;
  if (v.startDate && place) {
    const event = {
      '@type': 'EventSeries',
      '@id': `${url}#series`,
      name: name || undefined,
      url,
      startDate: v.startDate,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: place,
        ...((city || state) ? {
          address: {
            '@type': 'PostalAddress',
            ...(city ? { addressLocality: city } : {}),
            ...(state ? { addressRegion: state } : {}),
            addressCountry: 'US',
          },
        } : {}),
      },
      description: seriesDescription(v),
    };
    if (v.endDate) event.endDate = v.endDate;
    if (v.logoUrl) event.image = v.logoUrl;
    if (v.mainEventBuyin) {
      event.offers = {
        '@type': 'Offer',
        name: 'Main Event Buy In',
        price: String(v.mainEventBuyin),
        priceCurrency: 'USD',
        url,
        availability: 'https://schema.org/InStock',
      };
    }
    // EVERY EVENT WITH A DATE. The series carries the location, which is
    // what the events themselves mostly lack: a scraped event row records
    // its date, time and buy in and leaves venue_name empty, because it is
    // held at the series' venue. An event with no date is still listed on
    // the page and still left out of the graph.
    const subEvents = (v.events || [])
      .filter((item) => item.startDate && item.name)
      .map((item) => ({
        '@type': 'Event',
        name: item.name,
        startDate: item.startTime ? `${item.startDate}T${item.startTime}` : item.startDate,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: event.location,
        superEvent: { '@id': `${url}#series` },
        ...(item.buyin ? {
          offers: {
            '@type': 'Offer',
            name: 'Buy In',
            price: String(item.buyin),
            priceCurrency: 'USD',
            url,
            availability: 'https://schema.org/InStock',
          },
        } : {}),
      }));
    if (subEvents.length) event.subEvent = subEvents;

    nodes[0].about = { '@id': `${url}#series` };
    nodes.push(event);
  }

  return nodes;
}
