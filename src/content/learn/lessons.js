/**
 * THE /learn STRATEGY CORPUS: ONE SOURCE OF TRUTH (AEO section 3.7, 2026-09-22).
 *
 * Forty lessons, each a real answer to one poker strategy question: the
 * answer in the first sentence, the chart or table inline, and a training
 * call to action after it. Nothing is gated; the whole answer is in the
 * server HTML of /learn/<slug>.
 *
 * Every surface reads this module and nothing else:
 *   - /learn, the index, grouped by category
 *   - /learn/<slug>, one statically generated page per lesson
 *   - pages/sitemap.xml.js, which lists /learn and every lesson
 *
 * ACCURACY IS THE BAR. An engine will quote these pages, so:
 *   - preflop charts and range sizes are generated from the bundled authored
 *     corpus (src/config/solverRanges.js) through
 *     src/lib/seo/preflopReference.js and src/lib/learn/rangeGrid.js, with
 *     the provenance /hub/preflop-charts states: an authored teaching
 *     reference, not a solver export
 *   - every other number in the prose is computed by
 *     src/lib/learn/pokerMath.js (pot odds, MDF, alpha, outs, combos, EV,
 *     Malmuth-Harville ICM, risk of ruin, variance) and interpolated
 *   - buy in counts and sizing rules are conventions and the copy says so
 *   - Smarter.Poker is play credit only, with no real money gambling, and
 *     the bankroll lessons say so rather than implying otherwise
 *   - no author Person, no byline: the publisher organization only
 *
 * Copy is authored in plain case and Title Cased here on export, the house
 * rule for every forward facing word (src/lib/learn/titleCase.js is the
 * gate's own transform). No em dashes, no ampersands.
 *
 * Pinned by __tests__/every-lesson-answers-first.law.test.mjs.
 *
 * Plain JS, no JSX, so a law test can import it under node. It imports the
 * 70 KB range corpus, so pages must read it in getStaticProps only.
 */
import { titleCase } from '../../lib/learn/titleCase.js';
import {
  LEARN_PATH,
  LEARN_URL,
  LEARN_COLLECTION_ID,
  ORGANIZATION_ID,
  WEBSITE_ID,
  LEARN_PUBLISHED,
  LEARN_MODIFIED,
  lessonPath,
  trainingGamePath,
} from '../../lib/learn/learnSite.js';
import { getGameById } from '../../data/TRAINING_LIBRARY.js';
import { PREFLOP_LESSONS, PROVENANCE } from './parts/preflop.js';
import { MATH_LESSONS } from './parts/math.js';
import { TOURNAMENT_LESSONS, CASH_LESSONS } from './parts/tournaments.js';
import { BANKROLL_LESSONS, MENTAL_LESSONS } from './parts/bankroll.js';
import { POSTFLOP_LESSONS, THEORY_LESSONS } from './parts/postflop.js';

export { PROVENANCE };
export {
  LEARN_PATH,
  LEARN_URL,
  LEARN_COLLECTION_ID,
  ORGANIZATION_ID,
  WEBSITE_ID,
  LEARN_PUBLISHED,
  LEARN_MODIFIED,
  lessonPath,
  trainingGamePath,
};

/** Display order of the categories on /learn. */
export const LEARN_CATEGORIES = [
  'Preflop',
  'Postflop',
  'Math',
  'Tournaments',
  'Cash',
  'Bankroll',
  'Mental Game',
  'Theory',
];

/** One line per category, shown under its heading on /learn. */
export const CATEGORY_INTROS = {
  Preflop: 'Opening Ranges By Seat, Big Blind Defence And Three Bets, With Every Chart As A Table.',
  Postflop: 'Continuation Bets, Check-Raises, Board Texture And Stack To Pot Ratio.',
  Math: 'Pot Odds, Defence Frequencies, Outs, Combinations And Expected Value, Worked Out.',
  Tournaments: 'ICM, The Bubble, Final Tables, Short Stacks, Bounties And Satellites.',
  Cash: 'Rake And Straddles, And What They Do To Your Strategy.',
  Bankroll: 'Buy In Guidelines For Each Format And The Risk Of Ruin Behind Them.',
  'Mental Game': 'Tilt, Variance And Judging Decisions Instead Of Results.',
  Theory: 'Game Theory, Mixed Strategies And Blockers.',
};

/**
 * Where a lesson's call to action can send a reader. Each one is a page
 * file that renders for a signed out visitor rather than redirecting; the
 * law checks the file exists and does not redirect on the server.
 */
export const TRAINING_TOOLS = {
  '/hub/preflop-charts': 'Preflop Range Lab',
  '/hub/training/icm-calculator': 'ICM Calculator',
  '/hub/training/equity-calculator': 'Equity Calculator',
  '/hub/training/tilt-guard': 'Tilt Guard',
  '/hub/bankroll-manager': 'Bankroll Manager',
};

/** Jarvis, the training assistant every lesson also points to. */
export const JARVIS = { href: '/hub/training/jarvis', name: 'Jarvis Training Insights' };

/** Keys whose values are identifiers or data, never copy. */
const NOT_COPY = new Set(['slug', 'related', 'glossary', 'train', 'source', 'key', 'hand', 'percent', 'reach', 'played', 'ranks', 'rank', 'category']);

function caseCopy(value, key) {
  if (NOT_COPY.has(key)) return value;
  if (typeof value === 'string') return titleCase(value);
  if (Array.isArray(value)) return value.map((v) => caseCopy(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = caseCopy(v, k);
    return out;
  }
  return value;
}

const RAW_LESSONS = [
  ...PREFLOP_LESSONS,
  ...POSTFLOP_LESSONS,
  ...MATH_LESSONS,
  ...TOURNAMENT_LESSONS,
  ...CASH_LESSONS,
  ...BANKROLL_LESSONS,
  ...MENTAL_LESSONS,
  ...THEORY_LESSONS,
];

/** Every lesson, Title Cased, in category order. */
export const LESSONS = RAW_LESSONS.map((lesson) => caseCopy(lesson));

export function getLesson(slug) {
  return LESSONS.find((l) => l.slug === slug) || null;
}

export function lessonsByCategory() {
  return LEARN_CATEGORIES.map((category) => ({
    category,
    intro: CATEGORY_INTROS[category],
    lessons: LESSONS.filter((l) => l.category === category),
  }));
}

/**
 * The call to action that follows a lesson's answer: the matching game in
 * the training library, the matching tool when there is one, and Jarvis.
 * Nothing here gates the lesson; it is printed after the last section.
 */
export function trainingCta(lesson) {
  const game = getGameById(lesson.train?.game);
  const tool = lesson.train?.tool;
  return {
    game: game ? { id: game.id, name: game.name, href: trainingGamePath(game.id) } : null,
    tool: tool && TRAINING_TOOLS[tool] ? { href: tool, name: TRAINING_TOOLS[tool] } : null,
    jarvis: JARVIS,
  };
}

/** Words of prose a reader gets: the summary and every paragraph. */
export function lessonWords(lesson) {
  const text = [lesson.summary, ...lesson.sections.flatMap((s) => s.paragraphs || [])].join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}
