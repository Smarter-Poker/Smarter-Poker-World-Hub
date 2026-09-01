/**
 * Honest fallback curriculum for a Training contract whose solver row is
 * missing, corrupt, off-subject, or not provenance-sealed.
 *
 * These are poker-concept questions, not numerical solver outputs. They keep
 * a game playable without transplanting a solve from another position or
 * inventing frequencies/EVs. Every question is explicitly tagged curated and
 * contains four meaningful alternatives.
 */

const FACTS = {
  rfi: {
    label: 'Raise First In', street: 'preflop',
    definition: 'Making the first voluntary raise after action folds to you',
    sequence: 'Players before you fold, then you choose whether to make the first raise',
    inputs: 'Position, effective stack, table format, and ante structure',
    principle: 'Open wider in later position because fewer players remain behind',
  },
  bb_defense: {
    label: 'Big Blind Defense', street: 'preflop',
    definition: 'Responding from the Big Blind after another player opens',
    sequence: 'An opener raises, action folds to the Big Blind, and the Big Blind responds',
    inputs: 'Opener position, raise size, effective stack, and rake or ante structure',
    principle: 'Compare pot odds and range interaction before folding, calling, or raising',
  },
  vs3bet: {
    label: 'Facing A 3-Bet', street: 'preflop',
    definition: 'Responding after your opening raise is reraised',
    sequence: 'You open, an opponent 3-bets, and action returns to you',
    inputs: 'Both positions, 3-bet size, effective stack, and the ranges involved',
    principle: 'Continue with a range that accounts for position, blockers, and stack geometry',
  },
  cold_call: {
    label: 'Cold Call', street: 'preflop',
    definition: 'Calling an open without previously investing voluntarily in the pot',
    sequence: 'One player opens, action reaches an uninvested player, and that player calls',
    inputs: 'Opener range, players behind, position, stack depth, and rake',
    principle: 'Account for squeeze risk and positional disadvantage before calling',
  },
  '4bet': {
    label: '4-Bet Decision', street: 'preflop',
    definition: 'Choosing a response after the sequence includes an open and a 3-bet',
    sequence: 'A player opens, another player 3-bets, and the next raise would be a 4-bet',
    inputs: 'Opening and 3-betting positions, blockers, sizing, and effective stack',
    principle: 'Build a continuing range before choosing value hands and bluff candidates',
  },
  squeeze: {
    label: 'Squeeze', street: 'preflop',
    definition: 'Reraising after an open and at least one caller',
    sequence: 'One player opens, another calls, and a later player considers reraising',
    inputs: 'Opener and caller ranges, players behind, position, sizing, and stack depth',
    principle: 'Use the caller’s capped range and the dead money without ignoring the opener',
  },
  cbet: {
    label: 'Continuation Bet', street: 'flop',
    definition: 'Betting the Flop after being the preflop aggressor',
    sequence: 'You raise preflop, an opponent calls, and action reaches your Flop decision',
    inputs: 'Board texture, range advantage, position, stack-to-pot ratio, and sizing',
    principle: 'Choose checks and bets for the range interaction, not merely because you raised preflop',
  },
  check_raise: {
    label: 'Check-Raise', street: 'flop',
    definition: 'Checking, facing a bet, and then raising on the same street',
    sequence: 'You check, an opponent bets, and action returns to you with the option to raise',
    inputs: 'Bet size, board texture, value region, bluff candidates, and stacks behind',
    principle: 'Pair credible value with bluffs that have equity or useful blockers',
  },
  turn_barrel: {
    label: 'Turn Barrel', street: 'turn',
    definition: 'Betting the Turn after betting the Flop',
    sequence: 'You bet the Flop, receive a call, and consider betting the Turn',
    inputs: 'Turn-card effect, range shift, remaining stacks, pot size, and opponent continues',
    principle: 'Barrel cards that improve your range story or add equity to your bluffs',
  },
  turn_probe: {
    label: 'Turn Probe', street: 'turn',
    definition: 'Betting the Turn after the preflop aggressor checks back the Flop',
    sequence: 'The preflop aggressor checks back the Flop, then you consider leading the Turn',
    inputs: 'Flop check-back range, Turn card, position, pot size, and remaining stacks',
    principle: 'Attack capped check-back ranges selectively rather than leading every Turn',
  },
  river_bluff: {
    label: 'River Bluff', street: 'river',
    definition: 'Betting the River with a hand that expects folds from better hands',
    sequence: 'Earlier action reaches the River, your hand has little showdown value, and you consider betting',
    inputs: 'Blockers, missed draws, value combinations, bet size, and opponent range',
    principle: 'Choose bluff combinations that block calls and avoid blocking folds',
  },
  river_bluff_catcher: {
    label: 'River Bluff Catch', street: 'river',
    definition: 'Calling with a hand that mainly beats bluffs and loses to value bets',
    sequence: 'An opponent bets the River and your hand beats bluffs but little value',
    inputs: 'Pot odds, blockers, opponent value region, bluff region, and bet size',
    principle: 'Call only when the available bluffs and price justify defending',
  },
  river_value: {
    label: 'River Value Bet', street: 'river',
    definition: 'Betting the River expecting enough worse hands to call',
    sequence: 'Action reaches the River and you consider betting a made hand for a call',
    inputs: 'Worse calling hands, better hands, blockers, bet size, and opponent range',
    principle: 'Choose a size that worse hands can call while respecting the stronger region',
  },
  icm: {
    label: 'Tournament ICM Decision', street: 'preflop',
    definition: 'Evaluating tournament chips through their non-linear effect on prize equity',
    sequence: 'A tournament decision is evaluated using stacks, positions, and the actual payout structure',
    inputs: 'Every relevant stack, remaining players, positions, blinds, antes, and payouts',
    principle: 'Risk premiums can make a profitable chip decision lose tournament prize equity',
  },
};

const ALIASES = {
  '3bet': 'vs3bet',
  river_bluff_catcher: 'river_bluff_catcher',
};

const STREET_BOARD = {
  preflop: [],
  flop: ['Qs', '7d', '2c'],
  turn: ['Qs', '7d', '2c', 'Jh'],
  river: ['Qs', '7d', '2c', 'Jh', '4s'],
};

function normalizedTopic(topic) {
  const key = String(topic || '').toLowerCase();
  return ALIASES[key] || (FACTS[key] ? key : 'rfi');
}

function rotateOptions(values, answer, offset) {
  const shift = ((offset % values.length) + values.length) % values.length;
  const rotated = [...values.slice(shift), ...values.slice(0, shift)];
  const options = rotated.map((text, index) => ({ id: String.fromCharCode(97 + index), text }));
  return { options, correctAnswer: options.find((option) => option.text === answer)?.id || 'a' };
}

function alternatives(topic, field, variant = 0) {
  const keys = Object.keys(FACTS).filter((key) => key !== topic);
  const start = Math.max(0, Object.keys(FACTS).indexOf(topic)) + variant * 2;
  return [0, 1, 2].map((step) => FACTS[keys[(start + step * 3) % keys.length]][field]);
}

const PROMPT_TEMPLATES = [
  [
    'Which description correctly identifies a %s spot?',
    'Which statement most accurately defines a %s decision?',
    'Which explanation matches the meaning of %s?',
    'Which concept summary describes %s?',
    'Which wording distinguishes a %s spot from nearby decisions?',
    'Which description captures the defining feature of %s?',
    'Which answer gives the sound definition of %s?',
  ],
  [
    'Which action history creates the %s decision being studied?',
    'Which sequence of actions reaches a %s spot?',
    'Which betting history correctly sets up %s?',
    'Which chronology belongs to a %s decision?',
    'Which prior action is required before the spot is called %s?',
    'Which sequence distinguishes %s from a different node?',
    'Which action order produces the decision known as %s?',
  ],
  [
    'Which information is essential before choosing a strategy in this %s spot?',
    'Which inputs must be known to study %s responsibly?',
    'Which set of facts is required to evaluate %s?',
    'Which context is indispensable for a sound %s decision?',
    'Which information belongs in a complete %s model?',
    'Which inputs prevent an unsupported conclusion about %s?',
    'Which details are necessary before analyzing %s?',
  ],
  [
    'Which principle best guides a sound %s strategy?',
    'Which strategic rule is most useful when studying %s?',
    'Which principle should anchor a disciplined %s decision?',
    'Which strategic idea applies most directly to %s?',
    'Which guideline avoids a common error in %s spots?',
    'Which principle supports a coherent %s range?',
    'Which strategic lesson belongs to %s?',
  ],
];

function buildPrompt(fact, style, variant) {
  const templates = PROMPT_TEMPLATES[style] || PROMPT_TEMPLATES[0];
  return templates[variant % templates.length].replace('%s', fact.label);
}

function fieldForStyle(style) {
  return ['definition', 'sequence', 'inputs', 'principle'][style] || 'definition';
}

export function generateCuratedPokerConceptBatch({
  gameId,
  level,
  count,
  gameConfig,
  spotTypes = [],
  stackDepths = [],
  positions = [],
  targetStreet = null,
  seenIds = [],
}) {
  const family = String(gameConfig?.pioGameType || 'unknown');
  const requestedStreet = String(targetStreet || '').toLowerCase();
  const forcedStreet = ['preflop', 'flop', 'turn', 'river'].includes(requestedStreet)
    ? requestedStreet
    : String(gameConfig?.pioStreet || '').toLowerCase();
  const requested = family.includes('_icm')
    ? ['icm']
    : (spotTypes.length > 0 ? spotTypes.map(normalizedTopic) : ['rfi']);
  const streetCompatible = forcedStreet
    ? requested.filter((topic) => FACTS[topic]?.street === forcedStreet)
    : requested;
  const topics = streetCompatible.length > 0
    ? streetCompatible
    : Object.keys(FACTS).filter((topic) => FACTS[topic].street === forcedStreet);
  if (topics.length === 0) return [];

  const questions = [];
  const wanted = Math.max(1, Math.min(Number(count) || 1, 25));
  const excludedIds = new Set((seenIds || []).map(String));
  const maxCandidates = wanted + excludedIds.size + 100;
  for (let index = 0; index < maxCandidates && questions.length < wanted; index += 1) {
    const topic = topics[index % topics.length];
    const fact = FACTS[topic];
    const style = Math.floor(index / topics.length) % 4;
    const variant = Math.floor(index / (topics.length * 4));
    const field = fieldForStyle(style);
    const answer = fact[field];
    const choices = rotateOptions([answer, ...alternatives(topic, field, variant)], answer, index + level);
    const street = forcedStreet || fact.street;
    const boardCards = STREET_BOARD[street] || [];
    const heroPosition = positions[index % Math.max(positions.length, 1)] || (topic === 'bb_defense' ? 'BB' : 'BTN');
    const villainPosition = heroPosition === 'BB' ? 'BTN' : 'BB';
    const stackDepth = Number(stackDepths[index % Math.max(stackDepths.length, 1)] || gameConfig?.pioStackDepth || 100);
    const pot = street === 'preflop' ? (['rfi', 'icm'].includes(topic) ? 1.5 : 4.5)
      : street === 'flop' ? 6 : street === 'turn' ? 14 : 30;

    const id = `curated_${gameId}_L${level}_${topic}_${style}_${index}`;
    if (excludedIds.has(id)) continue;
    questions.push({
      id,
      type: 'PIO',
      source: 'CURATED_SCENARIO',
      dataQuality: 'CURATED',
      evidenceDisclosure: 'Expert-authored poker concept; no solver-exact frequency or EV is claimed.',
      question: buildPrompt(fact, style, variant),
      scenario: {
        isConceptQuestion: true,
        street,
        action: fact.sequence,
        context: `Concept calibration for ${fact.label}.`,
        description: fact.definition,
        heroPosition,
        villainPosition,
        heroStack: stackDepth,
        villainStack: stackDepth,
        stackDepth,
        pot,
        gameType: family,
        spotType: topic,
      },
      heroCards: ['As', 'Kd'],
      boardCards,
      options: choices.options,
      correctAnswer: choices.correctAnswer,
      correctAnswerText: answer,
      explanation: `${answer}. ${fact.principle}. This answer comes from the curated concept curriculum.`,
      level,
    });
  }
  return questions;
}

export default generateCuratedPokerConceptBatch;
