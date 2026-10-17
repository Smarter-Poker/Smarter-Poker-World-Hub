/**
 * Location AEO & Conversational Search Enrichment
 *
 * Provides extractive factual summaries, People Also Ask (PAA) conversational Q&A,
 * and Schema.org FAQPage structured data for State and Metro/City poker directories.
 *
 * Strict Title Case compliance is maintained across all questions and answers.
 */

import { getStatePokerLegality } from '../poker-near-me/stateLegality.mjs';

function clean(str) {
  return String(str || '').trim();
}

/**
 * Builds conversational PAA questions and answers for a state or city poker directory.
 */
export function buildLocationPaaQuestions({ stateName, stateCode, city, venueCount, topVenues = [] }) {
  const loc = city ? `${clean(city)}, ${clean(stateName || stateCode)}` : clean(stateName || stateCode || 'The United States');
  const count = Number(venueCount) || 0;
  const venuesSample = topVenues.slice(0, 3).map((v) => clean(v.name)).filter(Boolean);
  const sampleList = venuesSample.length > 0 ? venuesSample.join(', ') : 'licensed cardrooms';

  const questions = [];

  if (city) {
    questions.push({
      question: `Are There Poker Rooms In ${clean(city)}, ${clean(stateName || stateCode)}?`,
      answer: count > 0
        ? `Yes, there ${count === 1 ? 'is 1 verified poker room' : `are ${count} verified poker rooms`} operating in ${loc}, including ${sampleList}. View complete addresses, live game limits, and daily tournament schedules on Smarter.Poker.`
        : `Poker rooms and card clubs in ${loc} are cataloged on Smarter.Poker with directions, phone contacts, and operating schedules.`,
    });

    questions.push({
      question: `Where Can I Play Poker In ${clean(city)}?`,
      answer: count > 0
        ? `You can play poker in ${clean(city)} at established venues such as ${sampleList}. Smarter.Poker provides real-time table counts, cash game stakes, and tournament calendars.`
        : `Explore nearby cardrooms and licensed gaming facilities serving ${clean(city)} on Smarter.Poker.`,
    });

    questions.push({
      question: `What Poker Games Are Offered In ${clean(city)}?`,
      answer: `Venues in ${clean(city)} typically spread No-Limit Texas Hold'em (NLH), Pot-Limit Omaha (PLO), and mixed rotation games. Check individual room profiles for active stakes and waitlists.`,
    });
  } else if (stateName || stateCode) {
    const sName = clean(stateName || stateCode);
    const legality = getStatePokerLegality(stateCode);

    questions.push({
      question: `Is Poker Legal In ${sName}?`,
      answer: `${legality.summary} Status: ${legality.status}. Governing Framework: ${legality.statutes}. ${legality.keyTakeaway}`,
    });

    questions.push({
      question: `How Many Poker Rooms Are In ${sName}?`,
      answer: count > 0
        ? `There ${count === 1 ? 'is 1 verified poker venue' : `are ${count} verified poker venues`} operating across ${sName}, including popular rooms like ${sampleList}. Browse complete directories by city on Smarter.Poker.`
        : `Licensed poker rooms, charity poker halls, and commercial casinos across ${sName} are tracked in the Smarter.Poker venue directory.`,
    });

    questions.push({
      question: `Are Home Poker Games Legal In ${sName}?`,
      answer: `${legality.socialHomeGames}. Consult local county and municipal statutes for additional recreational home game guidelines.`,
    });

    questions.push({
      question: `What Cities Have Poker Rooms In ${sName}?`,
      answer: `Poker action in ${sName} is concentrated across major metropolitan areas and gaming regions. Browse city-by-city listings on Smarter.Poker for driving directions and room profiles.`,
    });

    questions.push({
      question: `Are Poker Tournaments Hosted In ${sName}?`,
      answer: `Yes, cardrooms and casinos throughout ${sName} host daily tournaments, weekly deepstacks, and regional tournament series. See complete event calendars and buy-in details on Smarter.Poker.`,
    });
  } else {
    // National directory
    questions.push({
      question: 'How Can I Find Poker Rooms Near Me?',
      answer: 'Use the Smarter.Poker directory to browse verified poker rooms, casinos, card clubs, and daily tournament schedules across all 50 states.',
    });
    questions.push({
      question: 'What Types Of Poker Venues Are Listed On Smarter.Poker?',
      answer: 'The directory catalogs commercial casinos, licensed cardrooms, charity poker halls, and social poker clubs with verified table counts and operating hours.',
    });
  }

  return questions;
}

/**
 * Builds Schema.org FAQPage structured data for a location page.
 */
export function buildLocationFaqJsonLd({ stateName, stateCode, city, venueCount, topVenues = [], canonicalUrl }) {
  const questions = buildLocationPaaQuestions({ stateName, stateCode, city, venueCount, topVenues });
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
