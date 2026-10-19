/**
 * QUIZ STRUCTURED DATA GENERATOR
 * ===========================================================================
 * Google Search interactive Quiz structured data builder conforming to
 * Schema.org @type: 'Quiz', 'Question', and 'Answer'.
 *
 * Designed to power interactive search rich snippets for poker trivia, GTO
 * strategy quizzes, and tournament math problems.
 */

import { SITE, ORGANIZATION_ID, WEBSITE_ID, breadcrumbSchema } from './hubPageSchema.js';

export const POKER_TRIVIA_QUIZ_QUESTIONS = [
  {
    question: 'In Game Theory Optimal (GTO) play, what is the primary purpose of a mixed strategy?',
    answers: [
      { text: 'To prevent opponents from profitably exploiting your betting patterns by remaining unexploitable', isCorrect: true },
      { text: 'To maximize rake generation in low stakes cash games', isCorrect: false },
      { text: 'To always bluff when holding suited connectors regardless of position', isCorrect: false },
      { text: 'To eliminate variance completely from tournament play', isCorrect: false },
    ],
    explanation: 'A mixed strategy balances actions (e.g., checking and betting at calculated frequencies) so that an opponent cannot exploit predictable decision patterns.',
  },
  {
    question: 'According to the Independent Chip Model (ICM), how does the cash value of tournament chips compare to their nominal count?',
    answers: [
      { text: 'Tournament chips exhibit diminishing marginal dollar value as stack sizes increase', isCorrect: true },
      { text: 'Tournament chips maintain a strictly linear 1:1 cash conversion rate', isCorrect: false },
      { text: 'Doubling your chip count always triples your expected tournament dollar equity', isCorrect: false },
      { text: 'ICM only applies to cash game formats and has no bearing on tournament pay jumps', isCorrect: false },
    ],
    explanation: 'Under ICM mathematics, winning chips is always worth less in real dollars than the monetary cost of losing those same chips due to payout step structures.',
  },
  {
    question: 'What is the Minimum Defense Frequency (MDF) when facing a pot-sized bet (100% pot)?',
    answers: [
      { text: '50.0%', isCorrect: true },
      { text: '33.3%', isCorrect: false },
      { text: '66.7%', isCorrect: false },
      { text: '75.0%', isCorrect: false },
    ],
    explanation: 'MDF is calculated as Pot / (Pot + Bet). For a pot-sized bet of 1 unit into a 1 unit pot: 1 / (1 + 1) = 50.0%. You must defend at least 50% of your range to prevent an opponent from auto-profiting with bluffs.',
  },
  {
    question: 'In No-Limit Texas Holdem, what are the approximate pot odds needed to call a half-pot wager?',
    answers: [
      { text: '25.0% equity', isCorrect: true },
      { text: '33.3% equity', isCorrect: false },
      { text: '20.0% equity', isCorrect: false },
      { text: '50.0% equity', isCorrect: false },
    ],
    explanation: 'When facing a bet equal to 50% of the pot, you must call 0.5 into a final pot of 2.0 (1.0 original pot + 0.5 bet + 0.5 call). 0.5 / 2.0 = 25.0% equity required to break even.',
  },
  {
    question: 'Which poker hand ranking hierarchy rule is universally true across standard high poker games?',
    answers: [
      { text: 'A Flush always beats a Straight, and a Full House always beats a Flush', isCorrect: true },
      { text: 'Three of a Kind beats a Straight', isCorrect: false },
      { text: 'Two Pair beats Three of a Kind', isCorrect: false },
      { text: 'A Straight always beats a Full House', isCorrect: false },
    ],
    explanation: 'In standard high poker rankings: High Card < One Pair < Two Pair < Three of a Kind < Straight < Flush < Full House < Four of a Kind < Straight Flush < Royal Flush.',
  },
];

/**
 * Builds Schema.org Quiz structured data graph for Google search rich snippets.
 */
export function buildQuizSchema({
  path = '/hub/trivia',
  name = 'Smarter.Poker GTO Strategy & Poker Trivia Quiz',
  description = 'Interactive Poker Knowledge And Game Theory Optimal (GTO) Strategy Quiz. Test Your Skills In Pot Odds, ICM, Range Construction, And Hand Rankings.',
  questions = POKER_TRIVIA_QUIZ_QUESTIONS,
  trail = [['Hub', '/hub'], ['Poker Trivia', '/hub/trivia']],
} = {}) {
  const url = `${SITE}${path.startsWith('/') ? '' : '/'}${path}`;
  const quizId = `${url}#quiz`;

  const quizNode = {
    '@type': 'Quiz',
    '@id': quizId,
    name,
    description,
    url,
    inLanguage: 'en-US',
    publisher: { '@id': ORGANIZATION_ID },
    isPartOf: { '@id': WEBSITE_ID },
    educationalLevel: 'Intermediate',
    hasPart: questions.map((q, idx) => {
      const questionId = `${quizId}-q${idx + 1}`;
      const accepted = q.answers.find((a) => a.isCorrect);
      const suggested = q.answers.filter((a) => !a.isCorrect);

      return {
        '@type': 'Question',
        '@id': questionId,
        name: q.question,
        eduQuestionType: 'Multiple choice',
        learningResourceType: 'Practice quiz',
        text: q.question,
        acceptedAnswer: accepted
          ? {
              '@type': 'Answer',
              '@id': `${questionId}-ans-correct`,
              text: accepted.text,
              comment: {
                '@type': 'Comment',
                text: q.explanation || 'Correct GTO / poker strategy answer.',
              },
            }
          : undefined,
        suggestedAnswer: suggested.map((ans, sIdx) => ({
          '@type': 'Answer',
          '@id': `${questionId}-ans-${sIdx + 1}`,
          text: ans.text,
        })),
      };
    }),
  };

  const breadcrumbNode = breadcrumbSchema(trail);

  return {
    '@context': 'https://schema.org',
    '@graph': [quizNode, breadcrumbNode],
  };
}
