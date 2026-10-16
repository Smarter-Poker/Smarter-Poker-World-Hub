/**
 * VENUE AEO EXTRACTIVE KERNELS & CONVERSATIONAL PAA (Phase 1 of AEO)
 *
 * Implements concise 40-60 word factual extractive summaries ("Fact Kernels")
 * and structured conversational Q&A items ("People Also Ask") for poker venues.
 * Generates Schema.org FAQPage and SpeakableSpecification JSON-LD for AI search engines.
 */

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Builds a deterministic 40-60 word factual summary of a venue, optimized
 * for direct extraction by AI search engines (Google AI Overviews, Perplexity).
 */
export function buildVenueFactKernel(venue) {
  if (!venue || !venue.name) return '';
  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state);
  const loc = city && state ? `${city}, ${state}` : state || city || 'the United States';
  const type = clean(venue.venue_type || 'poker room').replace(/_/g, ' ');
  const hours = venue.hours ? clean(venue.hours) : 'check current room schedule for operating hours';
  const tournaments = venue.has_tournaments ? 'Daily poker tournaments are scheduled.' : 'Focuses primarily on live cash games.';
  const tables = Number(venue.poker_tables) > 0 ? ` featuring ${venue.poker_tables} poker tables` : '';

  return `${name} is a verified ${type} located in ${loc}${tables}. Operating hours: ${hours}. ${tournaments} Compare live cash games, tournament schedules, player reviews, and directions on Smarter.Poker.`;
}

/**
 * Generates conversational People Also Ask (PAA) question/answer pairs
 * reflecting real user search intents for this specific venue.
 */
export function buildVenuePaaQuestions(venue) {
  if (!venue || !venue.name) return [];
  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state);
  const loc = city && state ? `${city}, ${state}` : state || city || '';
  const type = clean(venue.venue_type || 'poker room').replace(/_/g, ' ');
  const tables = Number(venue.poker_tables) > 0 ? `${venue.poker_tables} dedicated tables` : 'multiple tables';
  const hours = venue.hours ? clean(venue.hours) : 'Check with the venue for current daily hours';

  return [
    {
      question: `Where Is ${name} Located?`,
      answer: venue.address
        ? `${name} is located at ${clean(venue.address)}${loc ? `, in ${loc}` : ''}. Interactive map coordinates and driving directions are available on Smarter.Poker.`
        : `${name} is located in ${loc || 'the United States'}. See the verified venue profile on Smarter.Poker for location details.`,
    },
    {
      question: `What Are The Operating Hours At ${name}?`,
      answer: `${name} lists operating hours as: ${hours}. Hours may vary during major tournament series and holidays.`,
    },
    {
      question: `Does ${name} Run Poker Tournaments?`,
      answer: venue.has_tournaments
        ? `Yes, ${name} hosts scheduled poker tournaments. View upcoming tournament structures, buy-ins, and guarantees on this profile.`
        : `${name} operates as a ${type} focusing primarily on live cash game action.`,
    },
    {
      question: `How Many Poker Tables Does ${name} Have?`,
      answer: `${name} offers ${tables} for cash games and tournament action in ${loc || 'the local area'}.`,
    },
  ];
}

/**
 * Generates Schema.org FAQPage structured data from PAA questions.
 */
export function buildVenueFaqJsonLd(venue, canonicalUrl) {
  const questions = buildVenuePaaQuestions(venue);
  if (!questions.length) return null;
  const url = clean(canonicalUrl);

  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: questions.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Generates SpeakableSpecification schema targeting the extractive kernel and quick facts.
 */
export function buildVenueSpeakableJsonLd(canonicalUrl) {
  const url = clean(canonicalUrl);
  return {
    '@type': 'SpeakableSpecification',
    '@id': `${url}#speakable`,
    cssSelector: ['.venue-aeo-kernel', '.info-grid'],
  };
}

/**
 * Builds a 40-60 word factual summary for a poker tournament series.
 */
export function buildSeriesFactKernel(series, venueName, dateRange) {
  if (!series || !series.name) return '';
  const name = clean(series.name);
  const vName = venueName ? clean(venueName) : 'verified host venues';
  const dates = dateRange ? clean(dateRange) : 'scheduled dates';
  const mainBuyin = series.main_event_buyin ? `$${Number(series.main_event_buyin).toLocaleString('en-US')}` : 'TBD';
  const totalGtd = series.total_guaranteed ? `$${Number(series.total_guaranteed).toLocaleString('en-US')}` : 'competitive prize pools';

  return `${name} is an official poker tournament series running at ${vName} during ${dates}. The schedule features a ${mainBuyin} Main Event buy-in with ${totalGtd} in total guarantees across scheduled events. Explore complete event dates, blind structures, and tournament results on Smarter.Poker.`;
}

/**
 * Generates conversational People Also Ask (PAA) question/answer pairs for tournament series.
 */
export function buildSeriesPaaQuestions(series, venueName, dateRange) {
  if (!series || !series.name) return [];
  const name = clean(series.name);
  const vName = venueName ? clean(venueName) : 'the host card room';
  const dates = dateRange ? clean(dateRange) : 'the published series window';
  const mainBuyin = series.main_event_buyin ? `$${Number(series.main_event_buyin).toLocaleString('en-US')}` : 'to be announced';
  const totalGtd = series.total_guaranteed ? `$${Number(series.total_guaranteed).toLocaleString('en-US')}` : 'announced per event';

  return [
    {
      question: `When Does ${name} Take Place?`,
      answer: `${name} runs during ${dates} at ${vName}. Check the full daily tournament calendar on Smarter.Poker for event start times and registration deadlines.`,
    },
    {
      question: `What Is The Main Event Buy-In For ${name}?`,
      answer: `The Main Event buy-in for ${name} is ${mainBuyin}. Satellite qualifiers and multi-flight starting days are detailed on the event schedule.`,
    },
    {
      question: `Where Is ${name} Being Hosted?`,
      answer: `${name} is held at ${vName}. Find verified address coordinates, poker room amenities, and hotel details on Smarter.Poker.`,
    },
    {
      question: `What Are The Guaranteed Prize Pools For ${name}?`,
      answer: `${name} features ${totalGtd} in prize pool guarantees across its championship schedule.`,
    },
  ];
}

/**
 * Generates Schema.org FAQPage structured data from Series PAA questions.
 */
export function buildSeriesFaqJsonLd(series, venueName, dateRange, canonicalUrl) {
  const questions = buildSeriesPaaQuestions(series, venueName, dateRange);
  if (!questions.length) return null;
  const url = clean(canonicalUrl);

  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: questions.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Generates SpeakableSpecification schema targeting series extractive kernel and stats grid.
 */
export function buildSeriesSpeakableJsonLd(canonicalUrl) {
  const url = clean(canonicalUrl);
  return {
    '@type': 'SpeakableSpecification',
    '@id': `${url}#speakable`,
    cssSelector: ['.series-aeo-kernel', '.stats-grid-dl'],
  };
}
