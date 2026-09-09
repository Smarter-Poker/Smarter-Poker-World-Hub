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
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';


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
function TrophyIcon({ size=48 })  { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function ThumbsUpIcon({ size=48 }){ return <_Svg size={size}><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4-8c1.7 0 3 1.3 3 3v.88z"/></_Svg>; }
function FlexIcon({ size=48 })    { return <_Svg size={size}><path d="M3 12c2-4 5-6 9-6 4 0 7 3 8 7 0 3-2 5-5 5h-2c-2 0-4-1-5-3l-5-3z"/></_Svg>; }
function CheckIcon({ size=16 })   { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function BackArrowIcon({ size=18 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
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
    code: 'Chamber 01',
    art: '/images/training/coach-mode/preflop-position.webp',
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
    code: 'Chamber 02',
    art: '/images/training/coach-mode/three-bet-pressure.webp',
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
    code: 'Chamber 03',
    art: '/images/training/coach-mode/cbet-analysis.webp',
    iconKind: 'target',
    icon: '',
    color: 'var(--sp-accent-green)',
    desc: 'When to continuation bet and sizing selection',
    concepts: [
      'A continuation bet is a flop bet by the last preflop aggressor. Its profitability depends on the two ranges, the board, position, sizing, and stack depth-not merely on having raised before the flop.',
      'In a heads-up, single-raised pot, the raiser can often bet frequently on dry high-card boards such as K-7-2 rainbow. Connected boards such as J-T-9 two-tone usually require more checking because the caller has more strong made hands and draws.',
      'This lesson compares a small 33% pot range bet on favorable dry boards with selective 66-75% pot betting on connected boards. Large bets should be supported by strong value and suitable bluffs.',
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
        opts: ['Bet 75% Pot With The Entire Range', 'Bet 33% Pot With The Entire Range', 'Check More Often, Then Bet 66-75% With Strong Value And Suitable Bluffs', 'Check The Entire Range'],
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
    code: 'Chamber 04',
    art: '/images/training/coach-mode/pot-odds-core.webp',
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
    code: 'Chamber 05',
    art: '/images/training/coach-mode/turn-evolution.webp',
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
    code: 'Chamber 06',
    art: '/images/training/coach-mode/river-mastery.webp',
    iconKind: 'flag',
    icon: '',
    color: 'var(--sp-accent-red)',
    desc: 'Final street value bets, bluffs, and river decisions',
    concepts: [
      'On the river, hands have fixed equity - no more draws. Your range should be polarized: bet with very strong hands (value) and some bluffs, check medium hands.',
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
  // Coach Mode is an explicitly local reference lesson. Only signed Training
  // Arena attempts may persist mastery, completion, or rewards.
  const [reviewedThisVisit, setReviewedThisVisit] = useState(new Set());

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
      const next = new Set(reviewedThisVisit);
      next.add(activeLesson.id);
      setReviewedThisVisit(next);
      setStep(activeLesson.concepts.length + 1); // results
    }
  };

  // Lesson view
  if (activeLesson) {
    const isConceptPhase = step < activeLesson.concepts.length;
    const isQuizPhase = step === activeLesson.concepts.length;
    const isResults = step > activeLesson.concepts.length;
    const totalStages = activeLesson.concepts.length + activeLesson.quiz.length;
    const completedStages = isResults
      ? totalStages
      : isConceptPhase
        ? step
        : activeLesson.concepts.length + quizIdx;
    const progressPercent = Math.max(3, Math.round((completedStages / totalStages) * 100));
    const currentQuestion = isQuizPhase ? activeLesson.quiz[quizIdx] : null;
    const answerIsCorrect = selected !== null && selected === currentQuestion?.answer;

    return (
      <>
        <Head>
          <title>{activeLesson.name} | Coach Mode</title>
        </Head>
        <div className="sp-training-command sp-training-command--coach sp-coach-casino sp-coach-casino--lesson">
          <header className="sp-command-header sp-coach-lesson-header">
            <button
              type="button"
              aria-label="Back to lesson list"
              onClick={() => setActiveLesson(null)}
              className="sp-coach-back"
            >
              <BackArrowIcon size={18} />
              <span>All Modules</span>
            </button>
            <div className="sp-coach-lesson-title">
              <span>{activeLesson.code}</span>
              <strong>{activeLesson.name}</strong>
            </div>
            <div className="sp-coach-phase-readout" role="status">
              <span>Operating State</span>
              <strong>
                {isConceptPhase
                  ? `Concept ${step + 1} Of ${activeLesson.concepts.length}`
                  : isQuizPhase
                    ? `Decision ${quizIdx + 1} Of ${activeLesson.quiz.length}`
                    : 'Local Review Finished'}
              </strong>
            </div>
          </header>

          <main className="sp-command-main sp-coach-stage">
            <div className="sp-coach-progress" aria-label={`${progressPercent}% local review complete`}>
              <div className="sp-coach-progress-labels">
                <span>Local Reference Review</span>
                <span>{progressPercent}% Reviewed</span>
              </div>
              <motion.div
                className="sp-coach-progress-fill"
                animate={{ width: `${progressPercent}%` }}
              />
            </div>

            {isConceptPhase && (
              <motion.article
                className="sp-coach-console sp-coach-console--concept"
                key={step}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="sp-coach-console-visual">
                  <img src={activeLesson.art} alt="" width="1200" height="751" />
                  <div className="sp-coach-visual-shade" />
                  <div className="sp-coach-visual-label">
                    <span>{activeLesson.code}</span>
                    <strong>Knowledge Calibration</strong>
                  </div>
                </div>
                <div className="sp-coach-console-content">
                  <div className="sp-coach-kicker"><i /> Concept {step + 1}</div>
                  <h1>{activeLesson.name}</h1>
                  <p>{activeLesson.concepts[step]}</p>
                  <div className="sp-coach-console-rule" />
                  <div className="sp-coach-console-meta">
                    <span>Module Focus</span>
                    <strong>{activeLesson.desc}</strong>
                  </div>
                  <motion.button
                    className="sp-coach-primary"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep(step + 1)}
                  >
                    {step < activeLesson.concepts.length - 1 ? 'Calibrate Next Concept' : 'Enter Decision Test'}
                    <span aria-hidden>›</span>
                  </motion.button>
                </div>
              </motion.article>
            )}

            {isQuizPhase && currentQuestion && (
              <motion.article
                className="sp-coach-console sp-coach-console--quiz"
                key={quizIdx}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="sp-coach-console-visual sp-coach-console-visual--quiz">
                  <img src={activeLesson.art} alt="" width="1200" height="751" />
                  <div className="sp-coach-visual-shade" />
                  <div className="sp-coach-visual-label">
                    <span>Decision {String(quizIdx + 1).padStart(2, '0')}</span>
                    <strong>{activeLesson.name}</strong>
                  </div>
                </div>
                <div className="sp-coach-console-content sp-coach-question-panel">
                  <div className="sp-coach-kicker"><i /> Read The Table</div>
                  <h1>{currentQuestion.q}</h1>
                  <div className="sp-coach-options" role="group" aria-label="Answer Choices">
                    {currentQuestion.opts.map((opt, i) => {
                      const optionState = selected === null
                        ? ''
                        : i === currentQuestion.answer
                          ? 'is-correct'
                          : selected === i
                            ? 'is-incorrect'
                            : 'is-muted';
                      return (
                        <motion.button
                          key={i}
                          className={`sp-coach-option ${optionState}`}
                          whileTap={selected === null ? { scale: 0.985 } : {}}
                          onClick={() => handleAnswer(i)}
                          aria-pressed={selected === i}
                          aria-disabled={selected !== null}
                        >
                          <span className="sp-coach-option-key">{String.fromCharCode(65 + i)}</span>
                          <span>{opt}</span>
                          <i aria-hidden />
                        </motion.button>
                      );
                    })}
                  </div>
                  {selected !== null && (
                    <motion.section
                      className={`sp-command-verdict sp-coach-verdict ${answerIsCorrect ? 'is-correct' : 'is-incorrect'}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      aria-live="assertive"
                      aria-atomic="true"
                    >
                      <div className="sp-coach-verdict-status">
                        <span>Analysis Result</span>
                        <strong>{answerIsCorrect ? 'Correct' : 'Incorrect'}</strong>
                      </div>
                      <div className="sp-coach-verdict-answer"><span>Your Answer</span><b>{currentQuestion.opts[selected]}</b></div>
                      <div className="sp-coach-verdict-answer"><span>Correct Answer</span><b>{currentQuestion.opts[currentQuestion.answer]}</b></div>
                      <p>{COACH_EXPLANATIONS[activeLesson.id]?.[quizIdx] || 'Review the lesson concept before moving to the next question.'}</p>
                      <em>This Result Will Stay Open Until You Click Next.</em>
                      <motion.button
                        className="sp-coach-primary"
                        whileTap={{ scale: 0.98 }}
                        onClick={nextQuizQuestion}
                      >
                        {quizIdx < activeLesson.quiz.length - 1 ? 'Next Question' : 'See Results'}
                        <span aria-hidden>›</span>
                      </motion.button>
                    </motion.section>
                  )}
                </div>
              </motion.article>
            )}

            {isResults && (
              <motion.article
                className="sp-coach-console sp-coach-console--results"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <div className="sp-coach-results-visual">
                  <img src={activeLesson.art} alt="" width="1200" height="751" />
                  <div className="sp-coach-results-medallion" aria-hidden>
                    <ScoreIcon score={score} total={activeLesson.quiz.length} size={56} />
                  </div>
                </div>
                <div className="sp-coach-results-content">
                  <div className="sp-coach-kicker"><i /> Local Review Finished</div>
                  <h1>Practice Review Finished</h1>
                  <p>{activeLesson.name}</p>
                  <div className="sp-coach-score">
                    <strong>{score}<span>/{activeLesson.quiz.length}</span></strong>
                    <small>Questions Correct</small>
                  </div>
                  <p>This Local Reference Result Is Not Saved And Does Not Unlock Progress Or Issue Rewards. Use The Verified Training Arena For Recorded Mastery.</p>
                  <motion.button className="sp-coach-primary" whileTap={{ scale: 0.98 }} onClick={() => setActiveLesson(null)}>
                    Return To Training Chambers
                    <span aria-hidden>›</span>
                  </motion.button>
                </div>
              </motion.article>
            )}
          </main>
        </div>
      </>
    );
  }

  // Lesson list
  const recommendedLesson = LESSONS.find((lesson) => !reviewedThisVisit.has(lesson.id)) || LESSONS[0];

  return (
    <>
      <Head>
        <title>Coach Mode | Smarter.Poker GTO Training</title>
      </Head>
      <div className="sp-training-command sp-training-command--coach sp-coach-casino">
        <main className="sp-command-main sp-coach-home">
          <section className="sp-command-header sp-coach-hero" aria-labelledby="coach-mode-title">
            <img className="sp-coach-hero-art" src="/images/training/coach-mode/strategy-chamber-hero.webp" alt="" width="1600" height="901" fetchpriority="high" />
            <div className="sp-coach-hero-vignette" />
            <button type="button" className="sp-coach-back sp-coach-hero-back" aria-label="Back To Training Hub" onClick={() => router.push('/hub/training')}>
              <BackArrowIcon size={18} />
              <span>Training Hub</span>
            </button>
            <div className="sp-coach-hero-copy">
              <div className="sp-coach-kicker"><i /> Private Strategy Chamber / Local Practice</div>
              <h1 id="coach-mode-title">Train Every Decision Until It Becomes Instinct.</h1>
              <p>Review Audited Concepts With Local Feedback. Recorded Progress, Unlocks, And Rewards Exist Only In The Verified Training Arena.</p>
              <div className="sp-coach-hero-actions">
                <motion.button className="sp-coach-primary" whileTap={{ scale: 0.98 }} onClick={() => startLesson(recommendedLesson)}>
                  {reviewedThisVisit.size ? 'Continue Local Module' : 'Initialize Local Coach Review'}
                  <span aria-hidden>›</span>
                </motion.button>
                <div className="sp-coach-completion" role="status" aria-label={`${reviewedThisVisit.size} of ${LESSONS.length} lessons reviewed this visit`}>
                  <strong>{String(reviewedThisVisit.size).padStart(2, '0')}</strong>
                  <span>Of {String(LESSONS.length).padStart(2, '0')} Reviewed This Visit</span>
                </div>
              </div>
            </div>
            <div className="sp-coach-hero-plate" aria-hidden>
              <span>GTO Training Core</span>
              <strong>Coach / 11</strong>
            </div>
          </section>

          <section className="sp-coach-module-section" aria-labelledby="coach-modules-title">
            <header className="sp-coach-section-header">
              <div>
                <span>Choose Your Discipline</span>
                <h2 id="coach-modules-title">Enter A Training Chamber</h2>
              </div>
              <p>30 Audited Scenarios <i /> Four Meaningful Choices <i /> Manual Analysis</p>
            </header>
            <div className="sp-command-grid sp-command-grid--lessons sp-coach-module-grid">
              {LESSONS.map((lesson, i) => (
                <motion.button
                  key={lesson.id}
                  className={`sp-coach-module-card ${reviewedThisVisit.has(lesson.id) ? 'is-complete' : ''}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.055 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => startLesson(lesson)}
                >
                  <span className="sp-coach-module-image">
                    <img src={lesson.art} alt="" width="1200" height="751" loading={i < 3 ? 'eager' : 'lazy'} />
                    <span className="sp-coach-module-image-shade" />
                    <span className="sp-coach-module-code">{lesson.code}</span>
                    {reviewedThisVisit.has(lesson.id) && <span className="sp-coach-module-complete"><CheckIcon size={14} /> Reviewed This Visit</span>}
                  </span>
                  <span className="sp-coach-module-body">
                    <span className="sp-coach-module-name">{lesson.name}</span>
                    <span className="sp-coach-module-desc">{lesson.desc}</span>
                    <span className="sp-coach-module-data">
                      <span><b>{lesson.concepts.length}</b> Concepts</span>
                      <i />
                      <span><b>{lesson.quiz.length}</b> Decisions</span>
                    </span>
                  </span>
                  <span className="sp-coach-module-action">Enter Module <b aria-hidden>›</b></span>
                </motion.button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
