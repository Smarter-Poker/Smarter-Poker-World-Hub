/**
 * Pure Schema.org Event `subEvent` builder & SERP meta description helper
 * for live poker tournament series pages (`/hub/series/[id]`).
 *
 * Zero network, zero database, zero Node-only imports (safe for SSR & Webpack).
 */

const SITE_ORIGIN = 'https://smarter.poker';
const PLACEHOLDER_RE = /^(unknown|various|unnamed|n\/?a|tbd|tba|none|null|undefined|-+)$/i;
const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
const HHMM_RE = /^(\d{2}:\d{2})/;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function cleanPlaceText(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && !PLACEHOLDER_RE.test(trimmed) ? trimmed : null;
}

function stripVenueFromCity(city, venueName) {
  if (!city) return null;
  if (!venueName) return city;
  const escaped = venueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleaned = city.replace(new RegExp(escaped, 'ig'), ' ');
  const trimmed = cleaned.replace(/\s+/g, ' ').replace(/^[\s,\u2013-]+|[\s,\u2013-]+$/g, '');
  return trimmed || null;
}

function parsePositiveNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatUsd(amount) {
  return `$${Math.round(Number(amount)).toLocaleString('en-US')}`;
}

function formatDateRangeText(startDate, endDate) {
  const parsePart = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    if (!m) return null;
    const month = MONTHS[Number(m[2]) - 1];
    return month ? { month, day: String(Number(m[3])), year: m[1] } : null;
  };
  const a = parsePart(startDate);
  const b = parsePart(endDate);
  if (!a && !b) return null;
  if (!b || !a) {
    const one = a || b;
    return `${one.month} ${one.day}, ${one.year}`;
  }
  if (a.year === b.year && a.month === b.month && a.day === b.day) {
    return `${a.month} ${a.day}, ${a.year}`;
  }
  if (a.year === b.year) {
    return `${a.month} ${a.day} to ${b.month} ${b.day}, ${b.year}`;
  }
  return `${a.month} ${a.day}, ${a.year} to ${b.month} ${b.day}, ${b.year}`;
}

function resolveCanonicalSeriesUrl(series, siteUrl = SITE_ORIGIN) {
  const cleanSite = String(siteUrl || SITE_ORIGIN).replace(/\/+$/, '');
  const id = series?.canonicalId ?? series?.id;
  if (id === undefined || id === null || String(id).trim() === '') {
    return `${cleanSite}/hub/poker-series`;
  }
  return `${cleanSite}/hub/series/${encodeURIComponent(String(id).trim())}`;
}

function resolveSeriesLocation(series) {
  const venue = cleanPlaceText(series?.venueName ?? series?.venue_name ?? series?.venue);
  const city = stripVenueFromCity(cleanPlaceText(series?.city), venue);
  const state = cleanPlaceText(series?.state);
  const fallbackLocation = cleanPlaceText(series?.location);
  const placeName = venue || city || fallbackLocation;
  if (!placeName) return null;

  return {
    '@type': 'Place',
    name: placeName,
    ...((city || state)
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(city ? { addressLocality: city } : {}),
            ...(state ? { addressRegion: state } : {}),
            addressCountry: 'US',
          },
        }
      : {}),
  };
}

function composePlaceLabel(series) {
  const venue = cleanPlaceText(series?.venueName ?? series?.venue_name ?? series?.venue);
  const city = stripVenueFromCity(cleanPlaceText(series?.city), venue);
  const state = cleanPlaceText(series?.state);
  if (venue && city) return `${venue} in ${city}${state ? `, ${state}` : ''}`;
  if (venue) return `${venue}${state ? `, ${state}` : ''}`;
  if (city) return `${city}${state ? `, ${state}` : ''}`;
  return cleanPlaceText(series?.location);
}

/**
 * Transform scheduled series events into valid Schema.org `Event` `subEvent` nodes.
 *
 * - Enforces Schema.org required `name`, `startDate`, and `location` (omits undated
 *   or unlocated events rather than fabricating invalid schema).
 * - Emits `eventStatus`, `eventAttendanceMode`, `organizer`, `location` (`Place` +
 *   `PostalAddress`), `superEvent`, and `offers` (`Offer` with numeric `price`,
 *   `priceCurrency: 'USD'`, and series canonical `url`) whenever `buy_in > 0`.
 * - Caps output at `maxEvents` (default 25) to keep JSON-LD rich & fast for Googlebot.
 */
export function buildSeriesSubEventSchema(
  series,
  events,
  { maxEvents = 25, siteUrl = SITE_ORIGIN } = {},
) {
  if (!series || typeof series !== 'object' || !Array.isArray(events) || events.length === 0) {
    return [];
  }

  const location = resolveSeriesLocation(series);
  if (!location) {
    return [];
  }

  const cap = Number.isFinite(Number(maxEvents))
    ? Math.max(0, Math.floor(Number(maxEvents)))
    : 25;
  if (cap === 0) return [];

  const cleanSite = String(siteUrl || SITE_ORIGIN).replace(/\/+$/, '');
  const canonicalUrl = resolveCanonicalSeriesUrl(series, cleanSite);
  const organizer = {
    '@type': 'Organization',
    name: 'Smarter.Poker',
    url: cleanSite,
  };

  const out = [];
  for (const item of events) {
    if (out.length >= cap) break;
    if (!item || typeof item !== 'object') continue;

    const rawName = item.name ?? item.event_name ?? item.tournament_name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) continue;

    const rawDate = String(item.startDate ?? item.start_date ?? '').trim();
    const dateMatch = ISO_DATE_RE.exec(rawDate);
    if (!dateMatch) continue;

    const dateOnly = dateMatch[1];
    const rawTime = String(item.startTime ?? item.start_time ?? '').trim();
    const timeMatch = HHMM_RE.exec(rawTime);
    const startDate = timeMatch ? `${dateOnly}T${timeMatch[1]}` : dateOnly;

    const buyIn = parsePositiveNumber(item.buy_in ?? item.buyin);

    const subEvent = {
      '@type': 'Event',
      name,
      startDate,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      organizer,
      location,
      superEvent: { '@id': `${canonicalUrl}#series` },
    };

    if (buyIn !== null) {
      subEvent.offers = {
        '@type': 'Offer',
        name: 'Buy In',
        price: buyIn,
        priceCurrency: 'USD',
        url: canonicalUrl,
        availability: 'https://schema.org/InStock',
      };
    }

    out.push(subEvent);
  }

  return out;
}

/**
 * Build a SERP-ready dynamic meta description highlighting verified event count
 * and guarantee freshness without exceeding `maxLength` (default 158 chars).
 */
export function buildSeriesMetaDescription(
  series,
  events = [],
  { maxLength = 158 } = {},
) {
  if (!series || typeof series !== 'object') return '';
  const name = typeof series.name === 'string' ? series.name.trim() : '';
  if (!name) return '';

  const limit = Number.isFinite(Number(maxLength)) && Number(maxLength) >= 60
    ? Math.floor(Number(maxLength))
    : 158;
  const range = formatDateRangeText(
    series.startDate ?? series.start_date,
    series.endDate ?? series.end_date,
  );
  const place = composePlaceLabel(series);

  const openings = [
    `${name}${place ? ` runs at ${place}` : ''}${range ? ` from ${range}` : ''}.`,
    `${name}${place ? ` runs at ${place}` : ''}.`,
    `${name}${range ? ` runs from ${range}` : ''}.`,
    `${name}.`,
  ];

  let text = openings.find((o) => o.length <= limit) ?? openings[openings.length - 1];
  if (text.length > limit) {
    text = `${text.slice(0, Math.max(1, limit - 3)).trimEnd()}...`;
  }

  const eventList = Array.isArray(events) && events.length > 0
    ? events
    : (Array.isArray(series.events) ? series.events : []);
  const reportedCount = Math.max(
    Number(series.totalEvents ?? series.total_events ?? 0) || 0,
    Number(series.eventsCount ?? series.events_count ?? 0) || 0,
    eventList.length,
  );

  let topGuarantee = parsePositiveNumber(series.mainEventGuaranteed ?? series.main_event_guaranteed) || 0;
  for (const ev of eventList) {
    const g = parsePositiveNumber(ev?.guarantee ?? ev?.guaranteed_prize);
    if (g && g > topGuarantee) topGuarantee = g;
  }
  const mainBuyin = parsePositiveNumber(series.mainEventBuyin ?? series.main_event_buyin);

  const appendIfFits = (candidates) => {
    for (const bit of candidates) {
      if (!bit) continue;
      if (text.length + 1 + bit.length <= limit) {
        text += ` ${bit}`;
        return true;
      }
    }
    return false;
  };

  if (reportedCount > 0) {
    appendIfFits([
      `${reportedCount} events verified.`,
      `${reportedCount} events.`,
    ]);
  }

  if (mainBuyin && topGuarantee > 0) {
    appendIfFits([
      `Main event ${formatUsd(mainBuyin)} with ${formatUsd(topGuarantee)} GTD.`,
      `Main event ${formatUsd(mainBuyin)} (${formatUsd(topGuarantee)} GTD).`,
      `${formatUsd(topGuarantee)} GTD.`,
    ]);
  } else if (topGuarantee > 0) {
    appendIfFits([
      `Up to ${formatUsd(topGuarantee)} GTD.`,
      `${formatUsd(topGuarantee)} GTD.`,
    ]);
  } else if (mainBuyin) {
    appendIfFits([
      `Main event ${formatUsd(mainBuyin)}.`,
    ]);
  }

  appendIfFits([
    'Full schedule, buy-ins and results on Smarter.Poker.',
    'Schedule & buy-ins on Smarter.Poker.',
    'Live schedule on Smarter.Poker.',
  ]);

  return text;
}
