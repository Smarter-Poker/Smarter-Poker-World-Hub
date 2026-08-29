/**
 * COACH MODE — Guided Lesson Plans
 * ═══════════════════════════════════════════════════════════════════════════
 * Step-by-step guided lessons with concept explanations and mini-quizzes.
 *
 * Route: /hub/training/coach-mode
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-MOBILE-ADOPT-16 — mobile data-attr long-tail adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-TOKENS-BATCH5-6 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-6 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import { eventBus, EventType } from '../../../src/engine/EventBus';


// BUG FIX (TRAIN-COACH-A11Y-1): SVG icon components replacing the
// coach-mode emoji set across LESSONS data (positions / three-bet /
// preflop-math / cbet / turn / river), results screen
// (/ / based on score), completion ✓, and ← back arrow. Card-
// suit glyphs (♠♣♥♦) in quiz options remain (semantic). Same surface-
// specific a11y pattern as PR #320/#322/#324/#327-#343.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=20, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function CrownIcon({ size=20 })   { return <_Svg size={size}><path d="M2 7l5 5 5-9 5 9 5-5-2 12H4L2 7z"/><path d="M4 19h16"/></_Svg>; }
function BoltIcon({ size=20 })    { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function AbacusIcon({ size=20 })  { return <_Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><circle cx="7" cy="6" r="1"/><circle cx="11" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="9" cy="18" r="1"/></_Svg>; }
function TargetIcon({ size=20 })  { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function RotateIcon({ size=20 })  { return <_Svg size={size}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></_Svg>; }
function FlagIcon({ size=20 })    { return <_Svg size={size}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></_Svg>; }
function TrophyIcon({ size=48 })  { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function ThumbsUpIcon({ size=48 }){ return <_Svg size={size}><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4-8c1.7 0 3 1.3 3 3v.88z"/></_Svg>; }
function FlexIcon({ size=48 })    { return <_Svg size={size}><path d="M3 12c2-4 5-6 9-6 4 0 7 3 8 7 0 3-2 5-5 5h-2c-2 0-4-1-5-3l-5-3z"/></_Svg>; }
function CheckIcon({ size=16 })   { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function BackArrowIcon({ size=18 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function LessonIcon({ kind, size=20 }) {
  switch (kind) {
    case 'crown':  return <CrownIcon size={size}/>;
    case 'bolt':   return <BoltIcon size={size}/>;
    case 'abacus': return <AbacusIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'rotate': return <RotateIcon size={size}/>;
    case 'flag':   return <FlagIcon size={size}/>;
    default:       return <TargetIcon size={size}/>;
  }
}
function ScoreIcon({ score, total, size=48 }) {
  const pct = total > 0 ? score / total : 0;
  if (pct >= 0.8 || score >= 4) return <TrophyIcon size={size}/>;
  if (pct >= 0.6 || score >= 3) return <ThumbsUpIcon size={size}/>;
  return <FlexIcon size={size}/>;
}

const LESSONS = [
  {
    id: 'preflop-basics',
    name: 'Preflop Basics',
    iconKind: 'crown',
    icon: '',
    color: 'var(--sp-accent-blue)',
    desc: 'Open ranges, positions, and sizing fundamentals',
    concepts: [
      'In a 100 BB, 6-max cash game without antes, each position uses a different first-in range. Under The Gun enters tighter because five players remain; the Button can enter wider because only the blinds remain.',
      'This lesson uses 2.5 BB as a simple first-in baseline. Real strategy can vary by format and stack depth, but your sizing should not reveal whether your hand is strong or weak.',
      'For this lesson, use approximately 15% first-in from Under The Gun and 45% from the Button. The contrast teaches how fewer players behind and postflop position increase profitable entries.',
    ],
    quiz: [
      { q: 'In A 100 BB, 6-Max Cash Game Without Antes, What First-In Raise Size Does This Lesson Use As Its Baseline?', opts: ['2 BB', '2.5 BB', '3 BB', '4 BB'], answer: 1 },
      { q: 'In A 100 BB, 6-Max Cash Game Without Antes, Action Folds To You. From Which Position Can You Usually Enter With The Widest First-In Range?', opts: ['Under The Gun', 'Hijack', 'Cutoff', 'Button'], answer: 3 },
      {
        q: 'In This Lesson\'s 100 BB, 6-Max Baseline, Approximately What Percentage Of Hands Enter First-In From Under The Gun?',
        opts: ['5%', '15%', '30%', '45%'],
        answer: 1,
      },
      {
        q: 'In A 100 BB Cash Game, Action Folds To You And You Decide To Raise. Which Sizing Plan Avoids Revealing Your Hand Strength?',
        opts: [
          'Use 2.5 BB With The Entire First-In Range',
          'Use 5 BB With Premium Pairs And 2 BB With Bluffs',
          'Use 4 BB With Suited Hands And 2 BB With Offsuit Hands',
          'Change The Size According To The Exact Two Cards',
        ],
        answer: 0,
      },
      {
        q: 'In A Heads-Up Pot After The Flop, What Is The Button\'s Main Positional Advantage?',
        opts: ['It Acts Last On Every Postflop Street', 'It Receives Better Starting Cards', 'It Posts A Smaller Mandatory Blind', 'It Automatically Wins Tied Hands'],
        answer: 0,
      },
    ],
  },
  {
    id: 'three-bet',
    name: '3-Bet Strategy',
    iconKind: 'bolt',
    icon: '',
    color: 'var(--sp-accent-purple)',
    desc: 'When and how to re-raise preflop',
    concepts: [
      'A 3-bet is the first re-raise before the flop. It builds a larger pot with strong hands and can deny equity to the original raiser\'s weakest hands.',
      'This lesson studies a selective polarized 3-bet structure: premium value hands plus suited blocker bluffs such as A5s. Some positions and matchups instead use linear or mixed ranges, so always read the stated configuration.',
      'At 100 BB, this lesson uses roughly three times the raise in position and four times the raise out of position. The larger out-of-position size charges the caller for realizing equity with position.',
    ],
    quiz: [
      {
        q: 'At 100 BB, The Cutoff Raises To 2.5 BB And You Are On The Button. Which Structure Matches This Lesson\'s Selective 3-Bet Strategy?',
        opts: ['Premium Value Hands Plus Selected Suited Blocker Bluffs', 'Broadway Hands And Medium Pairs Only', 'Suited Connectors And Small Pairs Only', 'Every Hand That Would Otherwise Call'],
        answer: 0,
      },
      { q: 'At 100 BB, The Button Raises To 2.5 BB And You Are In The Small Blind. Which Hand Best Fits The Suited-Blocker Bluff Category In This Lesson?', opts: ['KJo', 'A5s', 'QTo', '87o'], answer: 1 },
      {
        q: 'At 100 BB, The Cutoff Raises To 2.5 BB And You Are On The Button. Which In-Position 3-Bet Size Matches This Lesson\'s Baseline?',
        opts: ['5 BB', '7.5 BB', '10 BB', '25 BB'],
        answer: 1,
      },
      {
        q: 'At 100 BB, The Button Raises To 2.5 BB And You 3-Bet From The Big Blind. Why Does This Lesson Use A Larger Size Than It Uses In Position?',
        opts: [
          'To Charge The Caller For Realizing Equity With Position',
          'To Keep The Postflop Stack-To-Pot Ratio Higher',
          'To Preserve More Chips For Later Streets',
          'To Transfer Postflop Position To The Big Blind',
        ],
        answer: 0,
      },
      {
        q: 'At 100 BB, The Button Raises To 2.5 BB And You Are In The Small Blind. Which Hand Most Clearly Belongs In The Value Portion Of A Selective 3-Bet Range?',
        opts: [
          'A♠A♥',
          'K♣J♦',
          '8♠7♠',
          '5♣4♦',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'cbet-basics',
    name: 'C-Bet Fundamentals',
    iconKind: 'target',
    icon: '',
    color: 'var(--sp-accent-green)',
    desc: 'When to continuation bet and sizing selection',
    concepts: [
      'A continuation bet is a flop bet by the last preflop aggressor. Its profitability depends on the two ranges, the board, position, sizing, and stack depth—not merely on having raised before the flop.',
      'In a heads-up, single-raised pot, the raiser can often bet frequently on dry high-card boards such as K-7-2 rainbow. Connected boards such as J-T-9 two-tone usually require more checking because the caller has more strong made hands and draws.',
      'This lesson compares a small 33% pot range bet on favorable dry boards with selective 66–75% pot betting on connected boards. Large bets should be supported by strong value and suitable bluffs.',
    ],
    quiz: [
      {
        q: 'You Raise Under The Gun, The Big Blind Calls, And Checks The Flop. On Which Board Does This Lesson Support The Highest Continuation-Bet Frequency?',
        opts: ['J♠T♥9♦', 'K♣7♦2♠', '8♠7♠6♠', 'Q♥J♥T♣'],
        answer: 1,
      },
      {
        q: 'You Raise Under The Gun, The Big Blind Calls, And Checks K♣7♦2♠. Which Size Is The Small Continuation-Bet Baseline In This Lesson?',
        opts: ['10% pot', '33% pot', '75% pot', 'Pot-sized'],
        answer: 1,
      },
      {
        q: 'Under The Gun Raises And The Big Blind Calls. Why Can Under The Gun Hold A Range Advantage On Many High-Card Flops?',
        opts: [
          'The Big Blind Must Fold Every Unpaired Hand',
          'Under The Gun Retains More Premium Pairs And Strong Broadway Hands',
          'The Big Blind Cannot Hold A King',
          'Under The Gun Is Guaranteed To Have Position',
        ],
        answer: 1,
      },
      {
        q: 'You Are The Preflop Raiser On A Connected Flop. Which Plan Matches This Lesson\'s Selective Large-Bet Strategy?',
        opts: ['Bet 75% Pot With The Entire Range', 'Bet 33% Pot With The Entire Range', 'Check More Often, Then Bet 66–75% With Strong Value And Suitable Bluffs', 'Check The Entire Range'],
        answer: 2,
      },
      {
        q: 'You Are The Preflop Raiser In A Heads-Up Pot. Which Plan Best Avoids Overusing Continuation Bets Across Different Flop Textures?',
        opts: [
          'Bet The Entire Range On Every Flop',
          'Bet Favorable Dry Boards Often And Check More On Connected Boards',
          'Check The Entire Range On Every Flop',
          'Bet Only When You Hold A Pair Or Better',
        ],
        answer: 1,
      },
    ],
  },
  {
    id: 'pot-odds',
    name: 'Pot Odds & MDF',
    iconKind: 'abacus',
    icon: '',
    color: 'var(--sp-accent-amber)',
    desc: 'The math behind calling and defense decisions',
    concepts: [
      'Call break-even equity equals the call amount divided by the final pot after your call. If the pot is 100 and Villain bets 50, calling 50 contests a final pot of 200, so the break-even equity is 25%.',
      'MDF (Minimum Defense Frequency) = 1 - (bet / (pot + bet)). Against a pot-sized bet, you must defend 50% of your range to prevent auto-profit.',
      'The Rule of 2 and 4: multiply your outs by 4 on the flop (2 cards to come) or by 2 on the turn (1 card) for approximate equity.',
    ],
    quiz: [
      {
        q: 'The Pot Is 100 Chips And Villain Bets 50 Chips. Ignoring Future Action, What Equity Does A 50-Chip Call Need To Break Even?',
        opts: ['20%', '25%', '33%', '50%'],
        answer: 1,
      },
      { q: 'Villain Bets 100 Chips Into A 100-Chip Pot. What Minimum Defense Frequency Prevents An Immediate Any-Two-Card Bluff From Profiting?', opts: ['33%', '50%', '67%', '75%'], answer: 1 },
      {
        q: 'On The Flop, You Have Nine Clean Outs With Two Cards To Come. Using The Rule Of Four, What Is Your Approximate Equity?',
        opts: ['18%', '27%', '36%', '45%'],
        answer: 2,
      },
      {
        q: 'On The Turn, You Have Nine Clean Outs With One Card To Come. Using The Rule Of Two, What Is Your Approximate Equity?',
        opts: ['9%', '18%', '27%', '36%'],
        answer: 1,
      },
      { q: 'You Hold Four Cards Of One Suit Between Your Hand And The Board, And No Same-Suit Cards Are Known Elsewhere. How Many Unseen Cards Complete The Flush?', opts: ['4', '8', '9', '15'], answer: 2 },
    ],
  },
  {
    id: 'turn-play',
    name: 'Turn Strategy',
    iconKind: 'rotate',
    icon: '',
    color: 'var(--sp-accent-cyan)',
    desc: 'Second barrel decisions and range evolution',
    concepts: [
      'The turn is where the pot grows significantly. Betting 66% pot on the turn after a 33% flop c-bet means the pot is now 3x the original flop size.',
      'A second barrel works best when the turn improves the bettor\'s range or fold equity. Whether an overcard, completed draw, or paired card helps depends on the exact preflop ranges and flop action.',
      'In position, checking back medium-strength hands can preserve showdown value and control the pot. It is a baseline, not an automatic rule; opponent range, board, and sizing still matter.',
    ],
    quiz: [
      {
        q: 'You Raise Under The Gun, The Big Blind Calls, You Bet K♣7♦2♠, And The Big Blind Calls. The A♥ Arrives On The Turn. Which Strategic Reason Best Supports A Second Barrel?',
        opts: [
          'The Ace Strengthens The Big Blind\'s Capped Calling Range More Often',
          'The Ace Improves Under The Gun\'s Uncapped Range More Often',
          'The Ace Gives Both Ranges Exactly The Same Strong Hands',
          'The Ace Removes Under The Gun\'s Fold Equity',
        ],
        answer: 1,
      },
      {
        q: 'In Position On A Blank Turn, You Hold Top Pair With A Weak Kicker And No Clear Three-Street Value. Which Pot-Control Line Matches This Lesson\'s Baseline?',
        opts: ['Bet 150% Pot', 'Check Back', 'Raise All-In Without Facing A Bet', 'Fold Without Facing A Bet'],
        answer: 1,
      },
      {
        q: 'Under The Gun Raises, The Big Blind Calls, And The Flop Is 8♣7♦2♠. After A Small Bet And Call, The A♥ Arrives. Which Range Usually Gains More Strong Top-Pair Combinations?',
        opts: ['The Big Blind\'s Calling Range', 'Under The Gun\'s Raising Range', 'Both Ranges Gain Exactly The Same Combinations', 'Neither Range Can Contain An Ace'],
        answer: 1,
      },
      {
        q: 'The Pot Is 100 Chips On The Flop. One Player Bets 33 Chips And The Other Calls, Making 166 Chips On The Turn. Approximately How Large Is A 66% Pot Turn Bet?',
        opts: ['83 Chips', '110 Chips', '149 Chips', '166 Chips'],
        answer: 1,
      },
      {
        q: 'The Flop Is K♣7♦2♠ And The Turn Is K♥. Which Hand-Class Change Follows Directly From The Paired Turn?',
        opts: ['One-Pair Kx Becomes Trips And K7 Or K2 Becomes A Full House', 'Pocket Pairs Become Straights', 'Flush Draws Gain Two Additional Outs', 'Every Two-Pair Hand Becomes A Flush'],
        answer: 0,
      },
    ],
  },
  {
    id: 'river-play',
    name: 'River Mastery',
    iconKind: 'flag',
    icon: '',
    color: 'var(--sp-accent-red)',
    desc: 'Final street value bets, bluffs, and river decisions',
    concepts: [
      'On the river, hands have fixed equity — no more draws. Your range should be polarized: bet with very strong hands (value) and some bluffs, check medium hands.',
      'Value bet sizing on the river should be based on how wide your opponent will call. Larger bets get called by narrower ranges but extract more per call.',
      'Optimal bluff-to-value ratio depends on your bet size. For a pot-sized bet, you should bluff 1 hand for every 2 value hands (33% bluffs in your betting range).',
    ],
    quiz: [
      {
        q: 'On The River, You Choose A Large Bet Size With Both Value Hands And Bluffs. Which Range Structure Matches That Plan?',
        opts: ['A Linear Range Of Only Medium Hands', 'A Merged Range With Every Pair', 'A Polarized Range Of Strong Value And Bluffs', 'A Range Containing Only Bluffs'],
        answer: 2,
      },
      {
        q: 'You Reach The River In Position With Medium Showdown Value And No Clear Thin-Value Target. Which Baseline Action Preserves Showdown Value?',
        opts: ['Bet 150% Pot', 'Check Back', 'Fold Without Facing A Bet', 'Raise All-In Without Facing A Bet'],
        answer: 1,
      },
      {
        q: 'In A Simplified Heads-Up River Model, You Bet The Pot With A Polarized Range. What Percentage Of That Betting Range Should Be Bluffs At Equilibrium?',
        opts: ['0%', '25%', '33%', '50%'],
        answer: 2,
      },
      {
        q: 'Once The River Card Has Been Dealt, How Many Community Cards Remain To Change Either Player\'s Final Five-Card Hand?',
        opts: ['Zero', 'One', 'Two', 'Three'],
        answer: 0,
      },
      {
        q: 'Against A Balanced Polarized River Range, How Should A Defender\'s Calling Threshold Change As The Bet Size Increases?',
        opts: ['Call A Wider Range', 'Call A Narrower And Stronger Range', 'Call The Same Range At Every Size', 'Call Only The Absolute Nuts'],
        answer: 1,
      },
    ],
  },
];

const COACH_EXPLANATIONS = {
  'preflop-basics': [
    'A consistent 2.5x baseline builds the pot without revealing hand strength through sizing.',
    'The Button has the fewest players left to act and retains position after the flop, so it can profitably enter the widest range.',
    'Under The Gun has five players left to act, so this lesson uses a much tighter first-in baseline of approximately 15%.',
    'Keeping one opening size across strong and weak hands prevents opponents from reading your hand strength from the bet size.',
    'The Button acts last after the flop, gaining more information before every decision.',
  ],
  'three-bet': [
    'A polarized 3-bet range combines premium value hands with selected bluffs while medium-strength hands retain their calling value.',
    'A5s blocks strong Ax continues and keeps useful wheel and flush equity when called.',
    'In position, roughly three times the original raise applies pressure without risking the extra chips required out of position.',
    'A larger out-of-position 3-bet charges the caller and compensates for having less information after the flop.',
    'Pocket Aces are the clearest value 3-bet because they dominate every other starting hand and benefit from building the pot.',
  ],
  'cbet-basics': [
    'K♣7♦2♠ is dry and favors the preflop raiser’s strong-card advantage, allowing frequent small continuation bets.',
    'A small continuation bet is approximately one-third of the pot and is designed for high-frequency range betting.',
    'The preflop raiser retains more premium pairs and strong broadway combinations on most flops.',
    'Large continuation bets work best selectively on connected boards when strong hands need protection and value.',
    'Wet boards connect strongly with the caller, so an automatic continuation bet would over-bluff weak parts of the raiser’s range.',
  ],
  'pot-odds': [
    'Calling a half-pot bet risks 0.5 pot to win a final pot of 2 pots, so the break-even equity is 25%.',
    'Against a pot-sized bet, defending half of your range prevents the bettor from profiting automatically with any two cards.',
    'With two cards to come, the Rule Of Four estimates nine outs at roughly 36% equity.',
    'With one card to come, the Rule Of Two estimates nine outs at roughly 18% equity.',
    'A four-card flush has nine unseen cards of the same suit remaining in the deck.',
  ],
  'turn-play': [
    'A turn card that strengthens the aggressor’s range supports a second barrel because it improves value density and fold equity.',
    'Top pair with a weak kicker often benefits from checking back to realize showdown value without facing a large raise.',
    'Turn overcards improve the preflop raiser’s uncapped broadway range more often than the caller’s condensed range.',
    'After the 33-chip flop bet is called, the turn pot is 166 chips; 66% of 166 is approximately 110 chips.',
    'When the King pairs, a one-pair Kx hand becomes trips while K7 and K2 improve from two pair to a full house.',
  ],
  'river-play': [
    'River betting ranges are polarized around strong value and bluffs because medium-strength hands prefer to reach showdown.',
    'Medium-strength river hands usually check, then call or fold according to blockers, sizing, and the opponent’s range.',
    'A pot-sized river bet gives the caller 2-to-1 odds, so one bluff for every two value hands makes the caller indifferent.',
    'No cards remain to be dealt on the river, so every hand’s showdown equity is fixed.',
    'As the river bet grows, the caller needs more equity and must continue with a narrower, stronger range.',
  ],
};

export default function CoachModePage() {
  // TRAIN-WIRE-FEEDBACK-HOOK-1 — wire useTrainingFeedback for fb.correct() / fb.incorrect()
  const fb = useTrainingFeedback();

  const router = useRouter();
  useTrainingBus('coach-mode');
  const [activeLesson, setActiveLesson] = useState(null);
  const [step, setStep] = useState(0); // 0..concepts.length = concepts, then quiz
  const [quizIdx, setQuizIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('coach-completed');
      if (saved) setCompleted(new Set(JSON.parse(saved)));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  useEffect(() => {
    const h = () => {};
    const unsub = eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => unsub();
  }, []);

  const startLesson = (lesson) => {
    setActiveLesson(lesson);
    setStep(0);
    setQuizIdx(0);
    setSelected(null);
    setScore(0);
  };

  const handleAnswer = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    const isCorrect = idx === activeLesson.quiz[quizIdx].answer;
    if (isCorrect) {
      setScore((s) => s + 1);
      fb.correct();
    } else {
      fb.incorrect();
    }
  };

  const nextQuizQuestion = () => {
    if (quizIdx < activeLesson.quiz.length - 1) {
      setQuizIdx(quizIdx + 1);
      setSelected(null);
    } else {
      // Complete
      const next = new Set(completed);
      next.add(activeLesson.id);
      setCompleted(next);
      try {
        localStorage.setItem('coach-completed', JSON.stringify([...next]));
      } catch (e) { console.warn('[App] Handled exception:', e); }
      setStep(activeLesson.concepts.length + 1); // results
    }
  };

  // Lesson view
  if (activeLesson) {
    const isConceptPhase = step < activeLesson.concepts.length;
    const isQuizPhase = step === activeLesson.concepts.length;
    const isResults = step > activeLesson.concepts.length;

    return (
      <>
        <Head>
          <title>{activeLesson.name} | Coach Mode</title>
        </Head>
        <div
          className="sp-training-command sp-training-command--coach"
          style={{
            minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
            color: 'var(--sp-fg)',
            fontFamily: "'Inter', -apple-system, sans-serif",
          }}
        >
          <div
            className="sp-command-header"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <button
              type="button"
              aria-label="Back to lesson list"
              onClick={() => setActiveLesson(null)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: 'var(--sp-fg-muted)',
                fontSize: 18,
                cursor: 'pointer',
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ←
            </button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{activeLesson.name}</div>
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
                {isConceptPhase
                  ? `Concept ${step + 1}/${activeLesson.concepts.length}`
                  : isQuizPhase
                    ? `Quiz ${quizIdx + 1}/${activeLesson.quiz.length}`
                    : 'Complete'}
              </div>
            </div>
          </div>
          <div className="sp-command-main" style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
            {/* Progress Bar */}
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.05)',
                marginBottom: 24,
                overflow: 'hidden',
              }}
            >
              <motion.div
                animate={{
                  width: `${((isConceptPhase ? step : activeLesson.concepts.length + quizIdx) / (activeLesson.concepts.length + activeLesson.quiz.length)) * 100}%`,
                }}
                style={{
                  height: '100%',
                  background: `linear-gradient(90deg, ${activeLesson.color}, ${activeLesson.color}88)`,
                  borderRadius: 2,
                }}
              />
            </div>

            {isConceptPhase && (
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <div
                  style={{
                    padding: '24px 20px',
                    borderRadius: 16,
                    background: `${activeLesson.color}08`,
                    border: `1px solid ${activeLesson.color}15`,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: activeLesson.color,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    CONCEPT {step + 1}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--sp-fg)', lineHeight: 1.7 }}>
                    {activeLesson.concepts[step]}
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setStep(step + 1)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 12,
                    border: 'none',
                    background: `linear-gradient(135deg, ${activeLesson.color}, ${activeLesson.color}aa)`,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {step < activeLesson.concepts.length - 1 ? 'Next Concept' : 'Start Quiz'}
                </motion.button>
              </motion.div>
            )}

            {isQuizPhase && activeLesson.quiz[quizIdx] && (
              <motion.div
                key={quizIdx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, lineHeight: 1.5 }}>
                  {activeLesson.quiz[quizIdx].q}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {activeLesson.quiz[quizIdx].opts.map((opt, i) => (
                    <motion.button
                      key={i}
                      whileTap={selected === null ? { scale: 0.98 } : {}}
                      onClick={() => handleAnswer(i)}
                      aria-pressed={selected === i}
                      aria-disabled={selected !== null}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 10,
                        textAlign: 'left',
                        border: `1px solid ${selected === null ? 'rgba(255,255,255,0.08)' : i === activeLesson.quiz[quizIdx].answer ? 'rgba(34,197,94,0.3)' : selected === i ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.04)'}`,
                        background:
                          selected === null
                            ? 'rgba(0,0,0,0.2)'
                            : i === activeLesson.quiz[quizIdx].answer
                              ? 'rgba(34,197,94,0.08)'
                              : selected === i
                                ? 'rgba(239,68,68,0.08)'
                                : 'rgba(0,0,0,0.1)',
                        color:
                          selected === null
                            ? 'var(--sp-fg)'
                            : i === activeLesson.quiz[quizIdx].answer
                              ? 'var(--sp-accent-green)'
                              : selected === i
                                ? 'var(--sp-accent-red)'
                                : 'var(--sp-fg-faint)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: selected === null ? 'pointer' : 'default',
                      }}
                    >
                      {opt}
                    </motion.button>
                  ))}
                </div>
                {selected !== null && (
                  <motion.section
                    className={`sp-command-verdict ${selected === activeLesson.quiz[quizIdx].answer ? 'is-correct' : 'is-incorrect'}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    aria-live="assertive"
                    aria-atomic="true"
                  >
                    <strong>{selected === activeLesson.quiz[quizIdx].answer ? 'Correct' : 'Incorrect'}</strong>
                    <div><span>Your Answer</span><b>{activeLesson.quiz[quizIdx].opts[selected]}</b></div>
                    <div><span>Correct Answer</span><b>{activeLesson.quiz[quizIdx].opts[activeLesson.quiz[quizIdx].answer]}</b></div>
                    <p>{COACH_EXPLANATIONS[activeLesson.id]?.[quizIdx] || 'Review the lesson concept before moving to the next question.'}</p>
                    <em>This Result Will Stay Open Until You Click Next.</em>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={nextQuizQuestion}
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: 0,
                        border: 'none',
                        background: `linear-gradient(135deg, ${activeLesson.color}, ${activeLesson.color}aa)`,
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {quizIdx < activeLesson.quiz.length - 1 ? 'Next Question' : 'See Results'}
                    </motion.button>
                  </motion.section>
                )}
              </motion.div>
            )}

            {isResults && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ textAlign: 'center', padding: '20px 0' }}
              >
                <div style={{ fontSize: 48, marginBottom: 12, display: 'inline-flex', justifyContent: 'center', color: score >= 4 ? 'var(--sp-accent-amber)' : score >= 3 ? 'var(--sp-accent-green)' : 'var(--sp-accent-purple)' }} aria-hidden>
                  {/* TRAIN-COACH-A11Y-1: SVG ScoreIcon replaces // */}
                  <ScoreIcon score={score} total={activeLesson.quiz.length} size={48} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
                  Lesson Complete
                </div>
                <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', marginBottom: 24 }}>
                  {activeLesson.name}
                </div>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    color: score >= 4 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)',
                  }}
                >
                  {score}/{activeLesson.quiz.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)', marginBottom: 24 }}>
                  Questions Correct
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setActiveLesson(null)}
                  style={{
                    padding: '14px 32px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Back to Lessons
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>
      </>
    );
  }

  // Lesson list
  return (
    <>
      <Head>
        <title>Coach Mode | Smarter.Poker GTO Training</title>
      </Head>
      <div
        className="sp-training-command sp-training-command--coach"
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div
          className="sp-command-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            aria-label="Back to training"
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* TRAIN-COACH-A11Y-1: SVG back arrow */}
            <BackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-COACH-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Coach Mode</h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Guided GTO lessons</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sp-fg-dim)' }} role="status" aria-label={`${completed.size} of ${LESSONS.length} lessons complete`}>
            {completed.size}/{LESSONS.length} complete
          </div>
        </div>
        <div className="sp-command-main sp-command-grid sp-command-grid--lessons" style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {LESSONS.map((lesson, i) => (
            <motion.button
              key={lesson.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => startLesson(lesson)}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: 14,
                marginBottom: 8,
                background: `${lesson.color}06`,
                border: `1px solid ${lesson.color}15`,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `${lesson.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {/* TRAIN-COACH-A11Y-1: SVG LessonIcon */}
                <span style={{ display: 'inline-flex', color: lesson.color }} aria-hidden>
                  <LessonIcon kind={lesson.iconKind} size={20} />
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: lesson.color }}>
                  {lesson.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', marginTop: 2 }}>{lesson.desc}</div>
                <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)', marginTop: 3 }}>
                  {lesson.concepts.length} concepts · {lesson.quiz.length} quiz questions
                </div>
              </div>
              {/* TRAIN-COACH-A11Y-1: SVG check replaces ✓ */}
              {completed.has(lesson.id) && <div style={{ fontSize: 16, display: 'inline-flex', color: 'var(--sp-accent-green)' }} aria-label="Completed" role="img"><CheckIcon size={16} /></div>}
            </motion.button>
          ))}
        </div>
      </div>
    </>
  );
}
