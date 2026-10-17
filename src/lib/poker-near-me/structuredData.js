const SITE_ORIGIN = 'https://smarter.poker';

function absoluteUrl(value) {
  const url = String(value || '');
  if (url.startsWith(SITE_ORIGIN)) return url;
  if (url.startsWith('/')) return `${SITE_ORIGIN}${url}`;
  return SITE_ORIGIN;
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact).filter((item) => item != null);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => [key, compact(item)])
  );
}

/**
 * A street address we are not willing to publish as fact.
 *
 * AEO phase 2, 2026-09-17. Venue 1828 (Lodge Poker Club, Austin) carried
 * "123 Test St" and shipped it to Google inside PostalAddress on the Austin
 * and Texas directory pages: a placeholder left in a real business's record,
 * republished by us as its location. Structured data is a claim of fact, and
 * a wrong one about a real venue is worse than none at all, so an address
 * that looks like a placeholder is dropped and the locality, region and
 * country still stand. The row itself is the venue pipeline's to correct;
 * this is the guard that stops the next one reaching an engine.
 */
export function isPublishableStreetAddress(value) {
  const address = String(value || '').trim();
  if (address.length < 5) return false;
  if (/\btest\b|\bsample\b|\bexample\b|\bdummy\b|\bplaceholder\b/i.test(address)) return false;
  if (/^(unknown|n\/?a|tbd|none|null|undefined)$/i.test(address)) return false;
  // "123 Main St", "123 Test St": the canonical made-up street number.
  if (/^123\s+(test|main|fake|any)\b/i.test(address)) return false;
  // An address with no digit at all is a neighbourhood, not a street address.
  if (!/\d/.test(address)) return false;
  return true;
}

export function serializePokerJsonLd(value) {
  return JSON.stringify(compact(value)).replace(/</g, '\\u003c');
}

export function buildLocationDirectorySchema({
  title,
  description,
  canonical,
  stateCode,
  city,
  stateName,
  venues = [],
  states = [],
  cities = [],
  resultCount = 0,
  fetchedAt,
}) {
  const pageUrl = absoluteUrl(canonical);
  const listId = `${pageUrl}#results`;
  const pageId = `${pageUrl}#directory`;
  const stateUrl = stateCode
    ? (city ? pageUrl.slice(0, pageUrl.lastIndexOf('/')) : pageUrl)
    : null;

  const breadcrumbs = [
    { name: 'Poker Near Me', url: `${SITE_ORIGIN}/hub/poker-near-me/lobby` },
    { name: 'Locations', url: `${SITE_ORIGIN}/hub/poker-near-me/in` },
    ...(stateCode ? [{ name: stateName || stateCode, url: stateUrl }] : []),
    ...(city ? [{ name: city, url: pageUrl }] : []),
  ].filter((crumb, index, all) => index === 0 || crumb.url !== all[index - 1].url);

  let listName = 'Poker venues by state';
  let entries = states.map((state) => ({
    name: state.name,
    url: absoluteUrl(state.href),
    item: {
      '@type': 'AdministrativeArea',
      name: state.name,
      url: absoluteUrl(state.href),
    },
  }));

  if (cities.length) {
    listName = `Poker venues by city in ${stateName || stateCode}`;
    entries = cities.map((entry) => ({
      name: entry.name,
      url: absoluteUrl(entry.href),
      item: {
        '@type': 'City',
        name: entry.name,
        url: absoluteUrl(entry.href),
      },
    }));
  }

  if (venues.length) {
    listName = city ? `Poker venues in ${city}, ${stateName || stateCode}` : `Poker venues in ${stateName || stateCode || 'the United States'}`;
    entries = venues.slice(0, 100).map((venue) => {
      const url = `${SITE_ORIGIN}/hub/venues/${encodeURIComponent(String(venue.id))}`;
      return {
        name: venue.name,
        url,
        item: {
          '@type': 'SportsActivityLocation',
          name: venue.name,
          url,
          image: venue.cover_photo_url || venue.profile_photo_url || undefined,
          address: venue.city || venue.state ? {
            '@type': 'PostalAddress',
            addressLocality: venue.city || undefined,
            addressRegion: venue.state || undefined,
            streetAddress: isPublishableStreetAddress(venue.address) ? venue.address : undefined,
            addressCountry: 'US',
          } : undefined,
        },
      };
    });
  }

  const itemList = {
    '@type': 'ItemList',
    '@id': listId,
    name: listName,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      url: entry.url,
      item: entry.item,
    })),
  };

  return compact({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': pageId,
        url: pageUrl,
        name: title,
        description,
        inLanguage: 'en-US',
        dateModified: fetchedAt || undefined,
        mainEntity: { '@id': listId },
        about: {
          '@type': city ? 'City' : stateCode ? 'AdministrativeArea' : 'Country',
          name: city ? `${city}, ${stateName || stateCode}` : stateName || stateCode || 'United States',
        },
        additionalProperty: {
          '@type': 'PropertyValue',
          name: 'Poker venue count',
          value: Number(resultCount) || 0,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: crumb.url,
        })),
      },
      itemList,
    ],
  });
}

export function buildSeriesDirectorySchema(series = [], totalCount = 0) {
  const canonical = `${SITE_ORIGIN}/hub/poker-series`;
  const items = series.slice(0, 50).map((entry, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: entry.series_name || entry.name || 'Poker series',
    url: entry.id ? `${SITE_ORIGIN}/hub/series/${encodeURIComponent(String(entry.id))}` : canonical,
  }));
  return compact({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonical}#directory`,
    url: canonical,
    name: 'Poker Series - Live Tournament Series Directory',
    description: 'Browse live and upcoming poker tournament series by tour, date, buy-in, and location.',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: Number(totalCount) || series.length,
      itemListElement: items,
    },
  });
}

function formatIsoTournamentStartDate(tournament) {
  const dateStr = tournament.event_date ? String(tournament.event_date).slice(0, 10) : null;
  if (!dateStr || dateStr === '1970-01-01' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return undefined;
  }
  const timeRaw = tournament.start_time ? String(tournament.start_time).trim() : '';
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)?$/i.exec(timeRaw);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const period = (match[3] || '').toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    const hh = String(hour).padStart(2, '0');
    return `${dateStr}T${hh}:${minute}:00`;
  }
  return `${dateStr}T12:00:00`;
}

export function buildDailyTournamentSchema(tournaments = [], generatedAt, options = {}) {
  const canonical = options.canonical || `${SITE_ORIGIN}/hub/daily-tournaments`;
  const pageName = options.pageName || 'Daily Poker Tournaments';
  const pageDescription = options.pageDescription || 'Browse recurring daily poker tournament schedules from verified poker venues and home games.';
  const items = tournaments.slice(0, 50).map((tournament, index) => {
    const isHomeGame = tournament.is_home_game || String(tournament.venue_id || '').startsWith('home_game_');
    const rawHomeId = String(tournament.venue_id || '').replace(/^home_game_/, '');
    const venueUrl = isHomeGame
      ? tournament.home_group_slug
        ? `${SITE_ORIGIN}/hub/home-games/${encodeURIComponent(String(tournament.home_group_slug))}`
        : tournament.home_group_club_code
          ? `${SITE_ORIGIN}/home-game/${encodeURIComponent(String(tournament.home_group_club_code))}`
          : `${SITE_ORIGIN}/hub/venues/${encodeURIComponent(rawHomeId)}`
      : tournament.venue_id
        ? `${SITE_ORIGIN}/hub/venues/${encodeURIComponent(String(tournament.venue_id))}`
        : canonical;

    const startDate = formatIsoTournamentStartDate(tournament);

    return {
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'SportsEvent',
        name: tournament.tournament_name || 'Daily poker tournament',
        url: venueUrl,
        startDate: startDate || undefined,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        sport: 'Poker',
        location: tournament.venue_name ? {
          '@type': 'SportsActivityLocation',
          name: tournament.venue_name,
          address: tournament.city || tournament.state ? {
            '@type': 'PostalAddress',
            addressLocality: tournament.city || undefined,
            addressRegion: tournament.state || undefined,
            addressCountry: 'US',
          } : undefined,
        } : undefined,
        offers: tournament.buy_in != null ? {
          '@type': 'Offer',
          price: Number(tournament.buy_in) || 0,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: venueUrl,
        } : undefined,
      },
    };
  });

  return compact({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonical}#schedule`,
    url: canonical,
    name: pageName,
    description: pageDescription,
    dateModified: generatedAt || undefined,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: tournaments.length,
      itemListElement: items,
    },
  });
}
