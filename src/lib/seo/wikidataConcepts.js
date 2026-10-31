/**
 * WIKIDATA & WIKIPEDIA CONCEPT ENTITY GROUNDING
 *
 * Maps canonical Smarter.Poker Glossary Terms (/glossary/<slug>) and
 * Strategy Lessons (/learn/<slug>) to external Knowledge Graph URIs
 * (Wikidata Q-IDs and English Wikipedia URIs) so Google Knowledge Graph,
 * ChatGPT Search, Perplexity, and Claude disambiguate every poker concept
 * against global semantic ontology nodes.
 */

export const GLOSSARY_WIKIDATA_CONCEPTS = {
  '3-bet': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  '4-bet': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  'cold-call': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  'isolation-raise': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  rfi: {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  squeeze: {
    wikidata: 'https://www.wikidata.org/entity/Q7582221',
    wikipedia: 'https://en.wikipedia.org/wiki/Squeeze_play_(poker)',
  },
  'backdoor-draw': {
    wikidata: 'https://www.wikidata.org/entity/Q5306024',
    wikipedia: 'https://en.wikipedia.org/wiki/Drawing_hand',
  },
  barrel: {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  'board-texture': {
    wikidata: 'https://www.wikidata.org/entity/Q5155052',
    wikipedia: 'https://en.wikipedia.org/wiki/Community_card_poker',
  },
  'c-bet': {
    wikidata: 'https://www.wikidata.org/entity/Q5165380',
    wikipedia: 'https://en.wikipedia.org/wiki/Continuation_bet',
  },
  'donk-bet': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  overbet: {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  'probe-bet': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  'semi-bluff': {
    wikidata: 'https://www.wikidata.org/entity/Q886122',
    wikipedia: 'https://en.wikipedia.org/wiki/Bluff_(poker)#Semi-bluff',
  },
  'slow-play': {
    wikidata: 'https://www.wikidata.org/entity/Q1756588',
    wikipedia: 'https://en.wikipedia.org/wiki/Slow_play_(poker)',
  },
  'thin-value-bet': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  trap: {
    wikidata: 'https://www.wikidata.org/entity/Q1756588',
    wikipedia: 'https://en.wikipedia.org/wiki/Slow_play_(poker)',
  },
  'value-bet': {
    wikidata: 'https://www.wikidata.org/entity/Q4898827',
    wikipedia: 'https://en.wikipedia.org/wiki/Betting_in_poker',
  },
  'wet-board': {
    wikidata: 'https://www.wikidata.org/entity/Q5155052',
    wikipedia: 'https://en.wikipedia.org/wiki/Community_card_poker',
  },
  combo: {
    wikidata: 'https://www.wikidata.org/entity/Q205044',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_probability',
  },
  'expected-value': {
    wikidata: 'https://www.wikidata.org/entity/Q200125',
    wikipedia: 'https://en.wikipedia.org/wiki/Expected_value',
  },
  equity: {
    wikidata: 'https://www.wikidata.org/entity/Q205044',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_probability',
  },
  icm: {
    wikidata: 'https://www.wikidata.org/entity/Q6016143',
    wikipedia: 'https://en.wikipedia.org/wiki/Independent_Chip_Model',
  },
  'implied-odds': {
    wikidata: 'https://www.wikidata.org/entity/Q1414887',
    wikipedia: 'https://en.wikipedia.org/wiki/Pot_odds#Implied_odds',
  },
  mdf: {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  outs: {
    wikidata: 'https://www.wikidata.org/entity/Q3358570',
    wikipedia: 'https://en.wikipedia.org/wiki/Out_(poker)',
  },
  'pot-odds': {
    wikidata: 'https://www.wikidata.org/entity/Q1414887',
    wikipedia: 'https://en.wikipedia.org/wiki/Pot_odds',
  },
  'reverse-implied-odds': {
    wikidata: 'https://www.wikidata.org/entity/Q1414887',
    wikipedia: 'https://en.wikipedia.org/wiki/Pot_odds#Reverse_implied_odds',
  },
  spr: {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  variance: {
    wikidata: 'https://www.wikidata.org/entity/Q175199',
    wikipedia: 'https://en.wikipedia.org/wiki/Variance',
  },
  vpip: {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Online_poker',
  },
  blocker: {
    wikidata: 'https://www.wikidata.org/entity/Q205044',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_probability',
  },
  'exploitative-play': {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  'fold-equity': {
    wikidata: 'https://www.wikidata.org/entity/Q5464271',
    wikipedia: 'https://en.wikipedia.org/wiki/Fold_equity',
  },
  frequency: {
    wikidata: 'https://www.wikidata.org/entity/Q1359396',
    wikipedia: 'https://en.wikipedia.org/wiki/Strategy_(game_theory)#Mixed_strategy',
  },
  gto: {
    wikidata: 'https://www.wikidata.org/entity/Q44497',
    wikipedia: 'https://en.wikipedia.org/wiki/Game_theory',
  },
  'in-position': {
    wikidata: 'https://www.wikidata.org/entity/Q15221861',
    wikipedia: 'https://en.wikipedia.org/wiki/Position_(poker)',
  },
  'linear-range': {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  'mixed-strategy': {
    wikidata: 'https://www.wikidata.org/entity/Q1359396',
    wikipedia: 'https://en.wikipedia.org/wiki/Strategy_(game_theory)#Mixed_strategy',
  },
  'nash-equilibrium': {
    wikidata: 'https://www.wikidata.org/entity/Q23393',
    wikipedia: 'https://en.wikipedia.org/wiki/Nash_equilibrium',
  },
  nodelocking: {
    wikidata: 'https://www.wikidata.org/entity/Q44497',
    wikipedia: 'https://en.wikipedia.org/wiki/Game_theory',
  },
  'nut-advantage': {
    wikidata: 'https://www.wikidata.org/entity/Q6944019',
    wikipedia: 'https://en.wikipedia.org/wiki/Nut_hand',
  },
  'out-of-position': {
    wikidata: 'https://www.wikidata.org/entity/Q15221861',
    wikipedia: 'https://en.wikipedia.org/wiki/Position_(poker)',
  },
  'polarized-range': {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  range: {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  'range-advantage': {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  'sizing-tell': {
    wikidata: 'https://www.wikidata.org/entity/Q1138603',
    wikipedia: 'https://en.wikipedia.org/wiki/Tell_(poker)',
  },
  tilt: {
    wikidata: 'https://www.wikidata.org/entity/Q1543536',
    wikipedia: 'https://en.wikipedia.org/wiki/Tilt_(poker)',
  },
  'under-defense': {
    wikidata: 'https://www.wikidata.org/entity/Q7208635',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_strategy',
  },
  villain: {
    wikidata: 'https://www.wikidata.org/entity/Q2101053',
    wikipedia: 'https://en.wikipedia.org/wiki/Glossary_of_poker_terms',
  },
  blinds: {
    wikidata: 'https://www.wikidata.org/entity/Q607741',
    wikipedia: 'https://en.wikipedia.org/wiki/Blind_(poker)',
  },
  'dealer-button': {
    wikidata: 'https://www.wikidata.org/entity/Q1018218',
    wikipedia: 'https://en.wikipedia.org/wiki/Button_(poker)',
  },
  'effective-stack': {
    wikidata: 'https://www.wikidata.org/entity/Q7711955',
    wikipedia: 'https://en.wikipedia.org/wiki/Table_stakes',
  },
  rake: {
    wikidata: 'https://www.wikidata.org/entity/Q1365445',
    wikipedia: 'https://en.wikipedia.org/wiki/Rake_(poker)',
  },
  showdown: {
    wikidata: 'https://www.wikidata.org/entity/Q1473495',
    wikipedia: 'https://en.wikipedia.org/wiki/Showdown_(poker)',
  },
  'poker-union': {
    wikidata: 'https://www.wikidata.org/entity/Q1194387',
    wikipedia: 'https://en.wikipedia.org/wiki/Online_poker',
  },
  'club-agent': {
    wikidata: 'https://www.wikidata.org/entity/Q1194387',
    wikipedia: 'https://en.wikipedia.org/wiki/Online_poker',
  },
  rakeback: {
    wikidata: 'https://www.wikidata.org/entity/Q1365445',
    wikipedia: 'https://en.wikipedia.org/wiki/Rake_(poker)',
  },
  'club-chips-versus-diamonds': {
    wikidata: 'https://www.wikidata.org/entity/Q1074337',
    wikipedia: 'https://en.wikipedia.org/wiki/Casino_token',
  },
  settlement: {
    wikidata: 'https://www.wikidata.org/entity/Q1194387',
    wikipedia: 'https://en.wikipedia.org/wiki/Online_poker',
  },
  'club-id': {
    wikidata: 'https://www.wikidata.org/entity/Q1194387',
    wikipedia: 'https://en.wikipedia.org/wiki/Online_poker',
  },
  'gps-and-ip-restriction': {
    wikidata: 'https://www.wikidata.org/entity/Q5147616',
    wikipedia: 'https://en.wikipedia.org/wiki/Collusion',
  },
  insurance: {
    wikidata: 'https://www.wikidata.org/entity/Q205044',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_probability',
  },
  'run-it-twice': {
    wikidata: 'https://www.wikidata.org/entity/Q5155052',
    wikipedia: 'https://en.wikipedia.org/wiki/Community_card_poker',
  },
  'time-bank': {
    wikidata: 'https://www.wikidata.org/entity/Q1194387',
    wikipedia: 'https://en.wikipedia.org/wiki/Online_poker',
  },
  straddle: {
    wikidata: 'https://www.wikidata.org/entity/Q607741',
    wikipedia: 'https://en.wikipedia.org/wiki/Blind_(poker)#Straddle_bet',
  },
  'bomb-pot': {
    wikidata: 'https://www.wikidata.org/entity/Q5155052',
    wikipedia: 'https://en.wikipedia.org/wiki/Community_card_poker',
  },
  waitlist: {
    wikidata: 'https://www.wikidata.org/entity/Q1048337',
    wikipedia: 'https://en.wikipedia.org/wiki/Cardroom',
  },
  'must-move-table': {
    wikidata: 'https://www.wikidata.org/entity/Q1048337',
    wikipedia: 'https://en.wikipedia.org/wiki/Cardroom',
  },
  'table-balancing': {
    wikidata: 'https://www.wikidata.org/entity/Q859668',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_tournament',
  },
  'chip-up': {
    wikidata: 'https://www.wikidata.org/entity/Q859668',
    wikipedia: 'https://en.wikipedia.org/wiki/Poker_tournament',
  },
  comp: {
    wikidata: 'https://www.wikidata.org/entity/Q5155115',
    wikipedia: 'https://en.wikipedia.org/wiki/Comp_(casino)',
  },
  'high-hand-promotion': {
    wikidata: 'https://www.wikidata.org/entity/Q1048337',
    wikipedia: 'https://en.wikipedia.org/wiki/Cardroom',
  },
  'bad-beat-jackpot': {
    wikidata: 'https://www.wikidata.org/entity/Q798624',
    wikipedia: 'https://en.wikipedia.org/wiki/Bad_beat',
  },
};

export const LESSON_CATEGORY_CONCEPTS = {
  Preflop: {
    name: 'Preflop Poker Strategy',
    sameAs: ['https://www.wikidata.org/entity/Q7208635', 'https://en.wikipedia.org/wiki/Poker_strategy'],
  },
  Postflop: {
    name: 'Postflop Poker Strategy',
    sameAs: ['https://www.wikidata.org/entity/Q5165380', 'https://en.wikipedia.org/wiki/Continuation_bet'],
  },
  Math: {
    name: 'Poker Probability And Mathematics',
    sameAs: ['https://www.wikidata.org/entity/Q205044', 'https://en.wikipedia.org/wiki/Poker_probability'],
  },
  Tournaments: {
    name: 'Poker Tournament Strategy & ICM',
    sameAs: ['https://www.wikidata.org/entity/Q6016143', 'https://en.wikipedia.org/wiki/Independent_Chip_Model'],
  },
  Cash: {
    name: 'Cash Game Poker Strategy',
    sameAs: ['https://www.wikidata.org/entity/Q1047400', 'https://en.wikipedia.org/wiki/Cash_game'],
  },
  Bankroll: {
    name: 'Poker Bankroll Management & Risk Of Ruin',
    sameAs: ['https://www.wikidata.org/entity/Q1431926', 'https://en.wikipedia.org/wiki/Risk_of_ruin'],
  },
  'Mental Game': {
    name: 'Poker Psychology & Tilt Control',
    sameAs: ['https://www.wikidata.org/entity/Q1543536', 'https://en.wikipedia.org/wiki/Tilt_(poker)'],
  },
  Theory: {
    name: 'Game Theory Optimal (GTO) Poker & Nash Equilibrium',
    sameAs: ['https://www.wikidata.org/entity/Q23393', 'https://en.wikipedia.org/wiki/Nash_equilibrium'],
  },
};

export function getGlossarySameAs(slug) {
  const entry = GLOSSARY_WIKIDATA_CONCEPTS[slug];
  if (!entry) return ['https://www.wikidata.org/entity/Q7208635', 'https://en.wikipedia.org/wiki/Glossary_of_poker_terms'];
  return [entry.wikidata, entry.wikipedia].filter(Boolean);
}

export function getLessonAboutThing(lesson) {
  const cat = LESSON_CATEGORY_CONCEPTS[lesson?.category] || LESSON_CATEGORY_CONCEPTS.Theory;
  const termSameAs = [];
  if (Array.isArray(lesson?.glossary)) {
    for (const gSlug of lesson.glossary.slice(0, 2)) {
      const c = GLOSSARY_WIKIDATA_CONCEPTS[gSlug];
      if (c?.wikidata && !termSameAs.includes(c.wikidata)) termSameAs.push(c.wikidata);
    }
  }
  return {
    '@type': 'Thing',
    name: cat.name,
    sameAs: [...new Set([...cat.sameAs, ...termSameAs])],
  };
}
