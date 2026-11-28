// TRAIN-CSS-TOKENS-ADOPT-9 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-9 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-GRADIENT-ADOPT-19 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-8 — hex sweep batch 6: extended palette literals routed
import BankrollImageHeader from '../../../src/components/bankroll/BankrollImageHeader';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import at from '../../../src/styles/training/analysis-tools.module.css';
import React, { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { runLocalTrainingEquity } from '../../../src/lib/poker/runLocalTrainingEquity';
import PlayingCard from '../../../src/components/poker/PlayingCard';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import { SPOT_OF_THE_WEEK_CATALOG } from '../../../src/lib/newsletter/weeklyWireCatalog.mjs';
// TRAIN-WIRE-FX-2c — adoption: hand-lab card-pick + analyze feedback
// TRAIN-WIRE-PLAYCARD-4 — adoption: hand-lab hero+board slots via shared PlayingCard

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_CODES = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const VARIANTS = [
  { id: 'nlh', label: 'NLHE (2 Cards)', holeCount: 2 },
  { id: 'plo4', label: 'PLO4 (4 Cards)', holeCount: 4 },
  { id: 'plo5', label: 'PLO5 (5 Cards)', holeCount: 5 },
  { id: 'plo6', label: 'PLO6 (6 Cards)', holeCount: 6 },
  { id: 'plo8', label: 'PLO8 (4 Cards Hi-Lo)', holeCount: 4 },
];
const BENCHMARK_HANDS_BY_VARIANT = {
  nlh: [
    { value: '9c8d', label: '9♣ 8♦ - Connected Hand' },
    { value: 'QhJd', label: 'Q♥ J♦ - Broadway Hand' },
    { value: 'KhKd', label: 'K♥ K♦ - Premium Pair' },
    { value: 'AhAd', label: 'A♥ A♦ - Pocket Aces' },
  ],
  plo4: [
    { value: 'QhJdTc9h', label: 'Q♥ J♦ T♣ 9♥ - Double-Suited Rundown' },
    { value: 'AhAsKhKs', label: 'A♥ A♠ K♥ K♠ - Double-Suited Aces' },
    { value: 'JcTc9d8d', label: 'J♣ T♣ 9♦ 8♦ - Mid Rundown' },
    { value: 'KdQdJdTd', label: 'K♦ Q♦ J♦ T♦ - Broadway Rundown' },
  ],
  plo5: [
    { value: 'QhJdTc9h8d', label: 'Q♥ J♦ T♣ 9♥ 8♦ - 5-Card Rundown' },
    { value: 'AhAsKhKsQh', label: 'A♥ A♠ K♥ K♠ Q♥ - 5-Card Aces' },
    { value: 'JcTc9d8d7c', label: 'J♣ T♣ 9♦ 8♦ 7♣ - Connected 5-Card' },
  ],
  plo6: [
    { value: 'QhJdTc9h8d7c', label: 'Q♥ J♦ T♣ 9♥ 8♦ 7♣ - 6-Card Rundown' },
    { value: 'AhAsKhKsQhQs', label: 'A♥ A♠ K♥ K♠ Q♥ Q♠ - 6-Card Broadway' },
    { value: 'JcTc9d8d7c6d', label: 'J♣ T♣ 9♦ 8♦ 7♣ 6♦ - Connected 6-Card' },
  ],
  plo8: [
    { value: 'As2sKd3d', label: 'A♠ 2♠ K♦ 3♦ - Nut Low + High Suit' },
    { value: 'Ah2h3c4c', label: 'A♥ 2♥ 3♣ 4♣ - Double-Suited Wheel' },
    { value: 'Ad3dKhQh', label: 'A♦ 3♦ K♥ Q♥ - Two-Way Scoop Hand' },
  ],
};

const SUIT_TO_ASCII = {
  '♠': 's',
  '♥': 'h',
  '♦': 'd',
  '♣': 'c',
  s: 's',
  h: 'h',
  d: 'd',
  c: 'c',
  S: 's',
  H: 'h',
  D: 'd',
  C: 'c',
};
const FULL_DECK = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}`));

const SPOT_VOTE_KEYS = ['A', 'B', 'C'];
const EMPTY_SPOT_VOTES = {
  counts: { A: 0, B: 0, C: 0 },
  total: 0,
  percentages: { A: 0, B: 0, C: 0 },
};

// A /api/news/spot-vote 200 body becomes bounded integers; anything else returns null so a failed
// or malformed response can never overwrite tallies with NaN or partial data.
function normaliseSpotVotes(body) {
  if (!body || body.success !== true || !body.percentages || typeof body.percentages !== 'object') return null;
  const counts = {};
  const percentages = {};
  let countTotal = 0;
  for (const key of SPOT_VOTE_KEYS) {
    counts[key] = Math.max(0, Math.floor(Number(body.counts?.[key]) || 0));
    const pct = Math.round(Number(body.percentages[key]));
    percentages[key] = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
    countTotal += counts[key];
  }
  const declaredTotal = Math.floor(Number(body.total));
  return {
    counts,
    percentages,
    total: Number.isFinite(declaredTotal) && declaredTotal >= 0 ? declaredTotal : countTotal,
  };
}

function cardToAscii(card) {
  const clean = String(card || '').trim();
  if (!clean || clean.length < 2) return '';
  const suitChar = clean.slice(-1);
  const rawRank = clean.slice(0, -1).toUpperCase();
  const rank = rawRank === '10' ? 'T' : rawRank;
  const suit = SUIT_TO_ASCII[suitChar] || suitChar.toLowerCase();
  return `${rank}${suit}`;
}

function cardsToAscii(cards) {
  return (cards || []).map(cardToAscii).filter(Boolean).join('');
}

export default function HandLabV2() {
  const router = useRouter();
  useTrainingBus('hand-lab');
  const fb = useTrainingFeedback();

  // UI States
  const deckDialog = React.useRef(null);
  const openDeck = slot => {
    setSelectedSlot(slot);
    deckDialog.current.showModal();
  };
  const [selectedSlot, setSelectedSlot] = useState(null); // 'hero1', 'hero2', 'board1', etc
  const [variant, setVariant] = useState('nlh');

  // Hand State
  const [heroCards, setHeroCards] = useState(['', '']);
  const [boardCards, setBoardCards] = useState(['', '', '', '', '']);
  const [villainHand, setVillainHand] = useState('QhJd');

  // Analysis State
  const [analyzing, setAnalyzing] = useState(false);
  const [equity, setEquity] = useState(null);
  const [results, setResults] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  const [activeWireSpot, setActiveWireSpot] = useState(null);
  const [wireSpotPick, setWireSpotPick] = useState('');
  const [spotVoteState, setSpotVoteState] = useState({ slug: '', votes: EMPTY_SPOT_VOTES });
  const [spotVoteFailedSlug, setSpotVoteFailedSlug] = useState('');
  const calcSeqRef = React.useRef(0);
  // Spot vote requests: the newest request owns the result, and a response for a spot the reader
  // has already left is dropped, so a slow Spot 1 answer can never overwrite Spot 2.
  const voteSeqRef = React.useRef(0);
  const activeSpotSlugRef = React.useRef('');
  const voteInFlightRef = React.useRef('');
  const activeSpotSlug = activeWireSpot?.slug || '';
  const spotVotes = spotVoteState.slug === activeSpotSlug ? spotVoteState.votes : EMPTY_SPOT_VOTES;
  const spotVoteFailed = Boolean(activeSpotSlug) && spotVoteFailedSlug === activeSpotSlug;
  activeSpotSlugRef.current = activeSpotSlug;

  // Hydrate Weekly Wire Spot Of The Week (?spot=<slug>&pick=<A|B|C>) when linked from email or /hub/wire
  useEffect(() => {
    if (!router.isReady) return;
    const rawSpot = Array.isArray(router.query.spot) ? router.query.spot[0] : router.query.spot;
    const rawPick = Array.isArray(router.query.pick) ? router.query.pick[0] : router.query.pick;
    const cleanSlug = typeof rawSpot === 'string' ? rawSpot.trim().toLowerCase() : '';
    if (!cleanSlug) return;
    const matchedSpot = SPOT_OF_THE_WEEK_CATALOG.find(
      (item) => String(item.slug || '').toLowerCase() === cleanSlug
    );
    if (!matchedSpot) {
      // An unknown ?spot= slug must not leave the previous spot's card, pick or tallies on screen.
      voteSeqRef.current += 1;
      setActiveWireSpot(null);
      setWireSpotPick('');
      return;
    }
    calcSeqRef.current += 1; setAnalyzing(false);
    const requestSeq = ++voteSeqRef.current;
    let cancelled = false;
    setActiveWireSpot(matchedSpot);
    setSpotVoteFailedSlug('');
    const normalizedPick = typeof rawPick === 'string' ? rawPick.trim().toUpperCase() : '';
    const hasValidPick = SPOT_VOTE_KEYS.includes(normalizedPick);
    // A link without a valid pick must clear any pick left over from the previous spot.
    setWireSpotPick(hasValidPick ? normalizedPick : '');

    const token = typeof getAccessToken === 'function' ? getAccessToken() : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const request = hasValidPick
      ? fetch('/api/news/spot-vote', {
          method: 'POST',
          headers,
          body: JSON.stringify({ spot: matchedSpot.slug, pick: normalizedPick }),
        })
      : fetch(`/api/news/spot-vote?spot=${encodeURIComponent(matchedSpot.slug)}`, { headers });
    request
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => null) }))
      .then(({ ok, body }) => {
        if (cancelled || requestSeq !== voteSeqRef.current) return;
        const votes = ok ? normaliseSpotVotes(body) : null;
        if (votes) {
          setSpotVoteState({ slug: matchedSpot.slug, votes });
        } else if (hasValidPick) {
          setSpotVoteFailedSlug(matchedSpot.slug);
        }
      })
      .catch(() => {
        if (!cancelled && requestSeq === voteSeqRef.current && hasValidPick) {
          setSpotVoteFailedSlug(matchedSpot.slug);
        }
      });
    const spotVariant = VARIANTS.some((v) => v.id === matchedSpot.variant) ? matchedSpot.variant : 'nlh';
    const spotHoleCount = (VARIANTS.find((v) => v.id === spotVariant) || VARIANTS[0]).holeCount;
    const nextHero =
      Array.isArray(matchedSpot.heroCards) && matchedSpot.heroCards.length === spotHoleCount
        ? [...matchedSpot.heroCards]
        : Array(spotHoleCount).fill('');
    const nextBoard =
      Array.isArray(matchedSpot.boardCards) && matchedSpot.boardCards.length > 0
        ? [...matchedSpot.boardCards.slice(0, 5), '', '', '', '', ''].slice(0, 5)
        : ['', '', '', '', ''];

    const usedAscii = new Set([...nextHero, ...nextBoard].map(cardToAscii).filter(Boolean));

    let nextVillainAscii = '';
    const variantBenchmarks = BENCHMARK_HANDS_BY_VARIANT[spotVariant] || [];
    for (const b of variantBenchmarks) {
      const handStr = b.value || b.hand || '';
      const tokens = handStr.match(/([2-9TJQKA][shdc])/gi) || [];
      if (
        tokens.length === spotHoleCount &&
        tokens.every((t) => !usedAscii.has(t[0].toUpperCase() + t[1].toLowerCase()))
      ) {
        nextVillainAscii = tokens.map((t) => t[0].toUpperCase() + t[1].toLowerCase()).join('');
        break;
      }
    }
    if (!nextVillainAscii) {
      const fallbackCards = [];
      for (const c of FULL_DECK) {
        const ascii = cardToAscii(c);
        if (ascii && !usedAscii.has(ascii)) {
          fallbackCards.push(c);
          if (fallbackCards.length === spotHoleCount) break;
        }
      }
      nextVillainAscii = cardsToAscii(fallbackCards);
    }

    setVariant(spotVariant);
    setBrainVariant(spotVariant);
    setHeroCards(nextHero);
    setBoardCards(nextBoard);
    if (nextVillainAscii) {
      setVillainHand(nextVillainAscii);
    }
    setEquity(null);
    setResults(null);
    setAnalysisError('');
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.spot, router.query.pick]);

  const handlePickSpotOption = async (optKey) => {
    fb.click();
    const spotSlug = activeWireSpot?.slug || '';
    if (!spotSlug) return;
    setWireSpotPick(optKey);
    // The vote API only accepts A, B or C; any other option key is a local solver check only.
    if (!SPOT_VOTE_KEYS.includes(optKey)) return;
    // Double-submit guard: one vote request per spot at a time.
    if (voteInFlightRef.current === spotSlug) return;
    voteInFlightRef.current = spotSlug;
    setSpotVoteFailedSlug('');
    const requestSeq = ++voteSeqRef.current;
    try {
      const token = typeof getAccessToken === 'function' ? getAccessToken() : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch('/api/news/spot-vote', {
        method: 'POST',
        headers,
        body: JSON.stringify({ spot: spotSlug, pick: optKey }),
      });
      const body = await res.json().catch(() => null);
      const votes = res.ok ? normaliseSpotVotes(body) : null;
      if (!votes) throw new Error('spot_vote_rejected');
      if (requestSeq === voteSeqRef.current && activeSpotSlugRef.current === spotSlug) {
        setSpotVoteState({ slug: spotSlug, votes });
      }
    } catch {
      if (activeSpotSlugRef.current === spotSlug) setSpotVoteFailedSlug(spotSlug);
    } finally {
      if (voteInFlightRef.current === spotSlug) voteInFlightRef.current = '';
    }
  };

  const variantSpec = VARIANTS.find((v) => v.id === variant) || VARIANTS[0];
  const benchmarkHands = BENCHMARK_HANDS_BY_VARIANT[variant] || BENCHMARK_HANDS_BY_VARIANT.nlh;
  const [brainVariant, setBrainVariant] = useState('nlh');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await authedFetch('/api/training/tool-records?tool_id=hand-lab&limit=5');
        if (!active || !res.ok) return;
        const payload = await res.json().catch(() => ({}));
        if (!active || !payload?.success || !Array.isArray(payload.records) || payload.records.length === 0) return;
        const latest = payload.records.find((r) => r?.record_key === 'latest_analysis') || payload.records[0];
        const saved = latest?.data || latest?.payload;
        if (!saved || calcSeqRef.current > 0) return;
        const savedVariant = VARIANTS.some((v) => v.id === saved.variant) ? saved.variant : 'nlh';
        const savedHoleCount = (VARIANTS.find((v) => v.id === savedVariant) || VARIANTS[0]).holeCount;
        setVariant(savedVariant);
        if (Array.isArray(saved.heroCards) && saved.heroCards.length === savedHoleCount) {
          setHeroCards(saved.heroCards);
        }
        if (Array.isArray(saved.boardCards) && saved.boardCards.length === 5) {
          setBoardCards(saved.boardCards);
        }
        if (typeof saved.villainHand === 'string' && saved.villainHand) {
          setVillainHand(saved.villainHand);
        }
        if (saved.equity !== undefined && saved.equity !== null) {
          setEquity(String(saved.equity));
        }
        if (saved.results && typeof saved.results === 'object') {
          setResults(saved.results);
        }
      } catch (_err) {
        // Non-fatal hydration warning
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleVariantChange = (nextVariant) => {
    const spec = VARIANTS.find((v) => v.id === nextVariant) || VARIANTS[0];
    calcSeqRef.current += 1; setAnalyzing(false);
    setVariant(spec.id);
    setHeroCards(Array(spec.holeCount).fill(''));
    const nextBenchmarks = BENCHMARK_HANDS_BY_VARIANT[spec.id] || BENCHMARK_HANDS_BY_VARIANT.nlh;
    setVillainHand(nextBenchmarks[0].value);
    setEquity(null);
    setResults(null);
    setAnalysisError('');
    setSelectedSlot('hero1');
  };

  const handleCardSelect = (rank, suit) => {
    fb.click();
    const card = `${rank}${suit}`;

    // Prevent duplicates
    if (heroCards.includes(card) || boardCards.includes(card)) {
      // Can show a quick toast here in a real app
      return;
    }

    if (selectedSlot?.startsWith('hero')) {
      calcSeqRef.current += 1; setAnalyzing(false);
      const idx = parseInt(selectedSlot.slice(4), 10) - 1;
      const newHero = [...heroCards];
      newHero[idx] = card;
      setHeroCards(newHero);
      setEquity(null);
      setResults(null);
      setAnalysisError('');
      // Auto advance slot
      if (idx + 1 < heroCards.length) setSelectedSlot(`hero${idx + 2}`);
      else if (!boardCards[0]) setSelectedSlot('board1');
      else { setSelectedSlot(null); deckDialog.current?.close(); }
    } else if (selectedSlot?.startsWith('board')) {
      calcSeqRef.current += 1; setAnalyzing(false);
      const idx = parseInt(selectedSlot.slice(5), 10) - 1;
      const newBoard = [...boardCards];
      newBoard[idx] = card;
      setBoardCards(newBoard);
      setEquity(null);
      setResults(null);
      setAnalysisError('');
      // Auto advance
      if (idx < 4) setSelectedSlot(`board${idx + 2}`);
      else { setSelectedSlot(null); deckDialog.current?.close(); }
    }
  };

  const isHeroComplete = heroCards.length === variantSpec.holeCount && heroCards.every(Boolean);

  const runAnalysis = async () => {
    fb.click();
    if (!isHeroComplete) return;

    calcSeqRef.current += 1;
    const reqSeq = calcSeqRef.current;
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const input = {
        hands: [heroCards.map(cardToAscii), villainHand.match(/../g) || []],
        board: boardCards.filter(Boolean).map(cardToAscii), variant, iterations: 10000,
      };
      const canSave = Boolean(getAccessToken()) && navigator.onLine !== false;
      let payload;
      if (canSave) {
        const response = await authedFetch('/api/training/equity', {
          method: 'POST', body: JSON.stringify(input),
        });
        payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Equity Request Failed');
      } else {
        payload = await runLocalTrainingEquity(input);
      }
      if (reqSeq !== calcSeqRef.current) return;

      const computedEquity = Number(payload.results[0].equity).toFixed(1);
      const computedResults = {
        opponentEquity: Number(payload.results[1].equity).toFixed(1),
        iterations: payload.totalIterations,
        boardSize: payload.boardSize,
        horseBrainAnalysis: payload.horseBrainAnalysis || null,
      };
      setEquity(computedEquity);
      setResults(computedResults);

      if (!canSave) return;
      authedFetch('/api/training/tool-records', {
        method: 'POST',
        body: JSON.stringify({
          tool_id: 'hand-lab',
          record_type: 'hand_analysis',
          record_key: 'latest_analysis',
          data: {
            variant,
            heroCards,
            boardCards,
            villainHand,
            equity: computedEquity,
            results: computedResults,
          },
        }),
      }).catch(() => {});
    } catch (error) {
      if (reqSeq === calcSeqRef.current) {
        setEquity(null);
        setResults(null);
        setAnalysisError(error.message || 'Unable To Analyze This Hand.');
      }
    } finally {
      if (reqSeq === calcSeqRef.current) {
        setAnalyzing(false);
      }
    }
  };

  const clearAll = () => {
    calcSeqRef.current += 1; setAnalyzing(false);
    setHeroCards(Array(variantSpec.holeCount).fill(''));
    setBoardCards(['', '', '', '', '']);
    setEquity(null);
    setResults(null); // Clear results on clearAll
    setAnalysisError('');
    setSelectedSlot('hero1');
  };

  return (
    <>
    <PageTransition>
      <SEOHead
        title="Poker Hand Lab & Board Analyzer"
        description="Analyze How Poker Hole Cards And Preflop Ranges Interact With Flop, Turn, And River Board Textures Using 10,000-Iteration Monte Carlo Equity On Smarter.Poker."
        canonical="/hub/training/hand-lab"
      />
      <UniversalHeader pageDepth={2} />

      <div className={at.shell}>
        <div className={`sp-training-head ${at.head}`}>
          <div className="sd-back-row">
            <Link href="/hub/training" className="sd-button">
              <ArrowLeft size={16} aria-hidden /> Training
            </Link>
          </div>
          <BankrollImageHeader art="training-hand-lab" title="Hand Lab" helpContent={<p>Choose A Game, Fill Your Hand And Set A Board. Analyze Compares Your Hand Against The Displayed Opponent.</p>}>
            <div className={at.row} style={{ marginTop: 8 }}>
              <button type="button" className={`sd-button ${at.compact}`} onClick={clearAll}>
                Clear Board
              </button>
            </div>
          </BankrollImageHeader>
        </div>

        <div className={at.page}>
        {activeWireSpot && (
          <section
            data-weekly-wire-spot-card="true"
            aria-label="Weekly Wire Spot Of The Week"
            className={`sd-panel ${at.panel}`}
          >
            <div className={at.panelHead}>
              <span className={at.eyebrow}>
                {`Weekly Wire Spot Of The Week · ${activeWireSpot.category}`}
              </span>
              <span className={at.small}>Cards Loaded On Canvas Below</span>
            </div>
            <h2 className={at.sectionTitle}>{activeWireSpot.title}</h2>
            <p className={at.copy}>{activeWireSpot.situation}</p>
            <div className={at.list}>
              {(activeWireSpot.options || []).map((opt) => {
                const isSelected = wireSpotPick === opt.key;
                const isBest = Boolean(wireSpotPick) && opt.key === activeWireSpot.correctKey;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className="sd-button"
                    aria-pressed={isSelected}
                    onClick={() => handlePickSpotOption(opt.key)}
                    style={{ justifyContent: 'space-between', textAlign: 'left', width: '100%' }}
                  >
                    <span>{`${opt.key}. ${opt.label}`}</span>
                    {isBest && <span className={at.up}>Solver Play</span>}
                  </button>
                );
              })}
            </div>
            {spotVoteFailed && (
              <div role="alert" data-spot-vote-error="true" className={at.error}>
                Your Pick Is Shown Below, But The Community Vote Could Not Be Recorded. Try Again In A Moment.
              </div>
            )}
            {spotVotes.total > 0 && (
              <div data-spot-community-split="true" className={at.panelHead}>
                <span className={at.eyebrow}>Community Reader Split</span>
                <span className={at.small}>
                  {SPOT_VOTE_KEYS.map((key) => `Option ${key}: ${spotVotes.percentages[key]}%`).join(' | ')}
                </span>
              </div>
            )}
            {wireSpotPick && (
              <div
                role="status"
                data-spot-verdict={wireSpotPick === activeWireSpot.correctKey ? 'correct' : 'review'}
                className={at.helpBlock}
              >
                <strong className={wireSpotPick === activeWireSpot.correctKey ? at.up : at.ice}>
                  {wireSpotPick === activeWireSpot.correctKey
                    ? `Exact Solver Match: Option ${activeWireSpot.correctKey} (${activeWireSpot.solverFrequency})`
                    : `You Picked Option ${wireSpotPick} · Solver Prefers Option ${activeWireSpot.correctKey} (${activeWireSpot.solverFrequency})`}
                </strong>
                <span className={at.copy}>{activeWireSpot.evSummary}</span>
              </div>
            )}
          </section>
        )}

        <section className={`sd-panel ${at.panel}`} aria-label="Hand Lab Canvas">
          <div className={at.field}>
            <span className={at.label}>Game</span>
            <div data-handlab-variant-selector="true" className={at.chips}>
              {VARIANTS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="sd-button"
                  data-variant-option={v.id}
                  aria-pressed={variant === v.id}
                  onClick={() => handleVariantChange(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <hr className={at.rule} />
          <h2 className={at.subTitle}>1. Your Hole Cards ({variantSpec.holeCount} Cards)</h2>
          <div className={at.slots}>
            {heroCards.map((cardValue, idx) => {
              const slotKey = `hero${idx + 1}`;
              return (
                <div
                  key={slotKey}
                  role="button"
                  tabIndex={0}
                  className={at.slot}
                  data-filled={cardValue ? 'true' : undefined}
                  data-active={selectedSlot === slotKey ? 'true' : undefined}
                  aria-pressed={selectedSlot === slotKey}
                  aria-label={`Select hole card ${idx + 1}`}
                  onClick={() => openDeck(slotKey)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDeck(slotKey);
                    }
                  }}
                >
                  {cardValue ? (
                    <PlayingCard arena card={cardValue} width={42} priority />
                  ) : (
                    <span>Card {idx + 1}</span>
                  )}
                </div>
              );
            })}
          </div>

          <h2 className={at.subTitle}>2. Board (Optional)</h2>
          <div className={at.slots}>
            {[0, 1, 2, 3, 4].map((idx) => (
              <div
                key={`board${idx + 1}`}
                role="button"
                tabIndex={0}
                className={at.slot}
                data-filled={boardCards[idx] ? 'true' : undefined}
                data-active={selectedSlot === `board${idx + 1}` ? 'true' : undefined}
                aria-pressed={selectedSlot === `board${idx + 1}`}
                aria-label={`Select board card ${idx + 1}`}
                onClick={() => openDeck(`board${idx + 1}`)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDeck(`board${idx + 1}`); } }}
              >
                {boardCards[idx] ? (
                  <PlayingCard arena card={boardCards[idx]} width={42} priority />
                ) : (
                  <span>{idx < 3 ? 'Flop' : idx === 3 ? 'Turn' : 'River'}</span>
                )}
              </div>
            ))}
          </div>

          <label className={at.field}>
            <span className={at.subTitle}>3. Villain Benchmark Hand</span>
            <select
              aria-label="Villain Benchmark Hand"
              className={at.select}
              value={villainHand}
              onChange={(e) => { calcSeqRef.current += 1; setAnalyzing(false); setVillainHand(e.target.value); setEquity(null); setResults(null); setAnalysisError(''); }}
            >
              {benchmarkHands.map((hand) => <option key={hand.value} value={hand.value}>{hand.label}</option>)}
            </select>
            <span className={at.small}>Exact Hand Vs Hand Equity - Not A Range Estimate</span>
          </label>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={runAnalysis}
            disabled={!isHeroComplete || analyzing}
            className={`sd-button sd-primary ${at.primary}`}
          >
            {analyzing ? 'Running Monte Carlo (10k Iterations)...' : 'Analyze Equity'}
          </motion.button>

          {analysisError && <div role="alert" className={at.error}>{analysisError}</div>}
        </section>

        {/* Results */}
        {equity && !analyzing && (
          <motion.section
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`sd-panel ${at.panel}`}
            aria-label="Hand Lab Result"
          >
            <span className={at.label}>
              Hero Equity Vs {benchmarkHands.find((hand) => hand.value === villainHand)?.label || villainHand}
            </span>
            <strong className={at.metricValue} data-tone="ice" style={{ fontSize: 'clamp(2.6rem, 12vw, 4rem)' }}>{equity}%</strong>
            <div className={at.equityBar} role="img" aria-label={`Hero ${equity}%, Opponent ${100 - equity}%`}>
              <div className={at.equitySeg} style={{ width: `${equity}%`, background: 'linear-gradient(180deg, #c4edff, #64a9ff)' }} />
              <div className={at.equitySeg} style={{ width: `${100 - equity}%`, background: 'linear-gradient(180deg, #8ea4b8, #4a6177)' }} />
            </div>
            {results && (
              <dl className={at.kv}>
                <div><dt>Opponent Equity</dt><dd>{results.opponentEquity}%</dd></div>
                <div><dt>Board Cards Locked</dt><dd>{results.boardSize}</dd></div>
                <div><dt>Monte Carlo Iterations</dt><dd>{Number(results.iterations || 0).toLocaleString()}</dd></div>
              </dl>
            )}
            {results?.horseBrainAnalysis && (
              <div
                data-handlab-brain-panel="true"
                data-brain-engine={results.horseBrainAnalysis.engineModule}
                className={at.helpBlock}
              >
                <div className={at.row}>
                  <span className={at.eyebrow}>{`Engine: ${results.horseBrainAnalysis.engineModule}`}</span>
                  <span className={at.label}>{`Category: ${results.horseBrainAnalysis.madeHandCategory}`}</span>
                  {results.horseBrainAnalysis.recommendedAction && (
                    <span className={at.label}>
                      Best Line: <strong className={at.ice}>{results.horseBrainAnalysis.recommendedAction}</strong>
                    </span>
                  )}
                </div>
                {Array.isArray(results.horseBrainAnalysis.omahaBestTwoHole) &&
                  results.horseBrainAnalysis.omahaBestTwoHole.length === 2 &&
                  Array.isArray(results.horseBrainAnalysis.omahaBestThreeBoard) &&
                  results.horseBrainAnalysis.omahaBestThreeBoard.length === 3 && (
                    <div data-omaha-best-combination="true" className={at.ice}>
                      {`2-Hole + 3-Board Omaha Combo: ${results.horseBrainAnalysis.omahaBestTwoHole.join(' ')} + ${results.horseBrainAnalysis.omahaBestThreeBoard.join(' ')}`}
                    </div>
                  )}
                <p className={at.copy}>{results.horseBrainAnalysis.coachingSummary}</p>
              </div>
            )}
          </motion.section>
        )}

        <dialog ref={deckDialog} aria-label="Hand Lab Card Picker" className={`sd-panel ${at.dialog}`}>
          <div className={at.dialogHead}>
            <strong className={at.subTitle}>{selectedSlot?.startsWith('hero') ? 'Pick A Hole Card' : 'Pick A Board Card'}</strong>
            <button type="button" className="sd-button" onClick={() => deckDialog.current.close()}>Done</button>
          </div>
          <div className={at.dialogBody}>
            {SUITS.map((suit) => (
              <div key={suit} className={at.suitRow}>
                <span className={at.suitLabel} style={{ color: getSuitColor(suit) }} aria-hidden>{suit}</span>
                <div className={at.pickerRow}>
                  {RANKS.map((rank) => {
                    const card = `${rank}${suit}`;
                    const isUsed = heroCards.includes(card) || boardCards.includes(card);
                    return (
                      <button
                        type="button"
                        key={card}
                        className={at.pick}
                        onClick={() => handleCardSelect(rank, suit)}
                        disabled={isUsed || !selectedSlot}
                        aria-label={`${rank}${suit}`}
                      >
                        <PlayingCard arena card={card} width={32} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </dialog>
        </div>
      </div>
      <ConnectionToast />
    </PageTransition>
    <HubPageSummary page="training-hand-lab" />
    </>
  );
}

// Helpers
function getSuitColor(suit) {
  if (suit === '♥' || suit === '♦') return '#ff7a86';
  if (suit === '♣') return '#5ee08a';
  return '#f2f7ff';
}
