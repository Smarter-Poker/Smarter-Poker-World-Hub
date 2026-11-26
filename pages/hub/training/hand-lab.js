// TRAIN-CSS-TOKENS-ADOPT-9 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-9 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-GRADIENT-ADOPT-19 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-8 — hex sweep batch 6: extended palette literals routed
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
    calcSeqRef.current += 1;
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
    calcSeqRef.current += 1;
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
      calcSeqRef.current += 1;
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
      else setSelectedSlot(null);
    } else if (selectedSlot?.startsWith('board')) {
      calcSeqRef.current += 1;
      const idx = parseInt(selectedSlot.slice(5), 10) - 1;
      const newBoard = [...boardCards];
      newBoard[idx] = card;
      setBoardCards(newBoard);
      setEquity(null);
      setResults(null);
      setAnalysisError('');
      // Auto advance
      if (idx < 4) setSelectedSlot(`board${idx + 2}`);
      else setSelectedSlot(null);
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
      const response = await authedFetch('/api/training/equity', {
        method: 'POST',
        body: JSON.stringify({
          hands: [heroCards.map(cardToAscii).join(''), villainHand],
          board: boardCards.filter(Boolean).map(cardToAscii),
          variant,
          iterations: 10000,
        }),
      });
      if (reqSeq !== calcSeqRef.current) return;
      const payload = await response.json().catch(() => ({}));
      if (reqSeq !== calcSeqRef.current) return;
      if (!response.ok || !payload.success || payload.results?.length < 2) {
        throw new Error(payload.error || `Equity Request Failed (${response.status})`);
      }

      const computedEquity = Number(payload.results[0].equity).toFixed(1);
      const computedResults = {
        opponentEquity: Number(payload.results[1].equity).toFixed(1),
        iterations: payload.totalIterations,
        boardSize: payload.boardSize,
        horseBrainAnalysis: payload.horseBrainAnalysis || null,
      };
      setEquity(computedEquity);
      setResults(computedResults);

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
    calcSeqRef.current += 1;
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

      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => router.push('/hub/training')} style={styles.backButton}>
            ← Hub
          </button>
          <div>
            <h1 style={styles.title}>HAND CONSTRUCTION LAB V2</h1>
            <p style={styles.subtitle}>Interactive Equity & Range Analyzer</p>
          </div>
          <button onClick={clearAll} style={styles.clearBtn}>
            Clear Board
          </button>
        </div>

        {activeWireSpot && (
          <section
            data-weekly-wire-spot-card="true"
            aria-label="Weekly Wire Spot Of The Week"
            style={{
              marginBottom: 26,
              padding: '22px 24px',
              borderRadius: 18,
              background: 'rgba(10, 22, 34, 0.88)',
              border: '1px solid rgba(79, 193, 179, 0.42)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
              <span style={{ color: '#4fc1b3', fontSize: 12, fontWeight: 800, letterSpacing: 1.8, textTransform: 'uppercase' }}>
                {`Weekly Wire Spot Of The Week · ${activeWireSpot.category}`}
              </span>
              <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700 }}>
                Cards Loaded On Canvas Below
              </span>
            </div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 800, color: '#ffffff', lineHeight: 1.3 }}>
              {activeWireSpot.title}
            </h2>
            <p style={{ margin: '0 0 16px 0', color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
              {activeWireSpot.situation}
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              {(activeWireSpot.options || []).map((opt) => {
                const isSelected = wireSpotPick === opt.key;
                const isBest = Boolean(wireSpotPick) && opt.key === activeWireSpot.correctKey;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handlePickSpotOption(opt.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: isBest
                        ? 'rgba(79, 193, 179, 0.16)'
                        : isSelected
                          ? 'rgba(96, 165, 250, 0.14)'
                          : 'rgba(5, 10, 18, 0.72)',
                      border: isBest
                        ? '1px solid #4fc1b3'
                        : isSelected
                          ? '1px solid #60a5fa'
                          : '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#ffffff',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    <span>{`${opt.key}. ${opt.label}`}</span>
                    {isBest && (
                      <span style={{ color: '#4fc1b3', fontSize: 12, fontWeight: 800 }}>
                        Solver Play
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {spotVoteFailed && (
              <div
                role="alert"
                data-spot-vote-error="true"
                style={{
                  marginTop: 12,
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'rgba(5, 10, 18, 0.72)',
                  border: '1px solid rgba(96, 165, 250, 0.5)',
                  color: '#cbd5e1',
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                Your Pick Is Shown Below, But The Community Vote Could Not Be Recorded. Try Again In A Moment.
              </div>
            )}
            {spotVotes.total > 0 && (
              <div
                data-spot-community-split="true"
                style={{
                  marginTop: 12,
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'rgba(5, 10, 18, 0.72)',
                  border: '1px solid rgba(96, 165, 250, 0.28)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: '#60a5fa' }}>Community Reader Split</span>
                <span style={{ color: '#cbd5e1' }}>
                  {SPOT_VOTE_KEYS.map((key) => `Option ${key}: ${spotVotes.percentages[key]}%`).join(' | ')}
                </span>
              </div>
            )}
            {wireSpotPick && (
              <div
                role="status"
                data-spot-verdict={wireSpotPick === activeWireSpot.correctKey ? 'correct' : 'review'}
                style={{
                  marginTop: 14,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'rgba(5, 10, 18, 0.8)',
                  border: '1px solid rgba(79, 193, 179, 0.35)',
                }}
              >
                <div style={{ color: '#4fc1b3', fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                  {wireSpotPick === activeWireSpot.correctKey
                    ? `Exact Solver Match: Option ${activeWireSpot.correctKey} (${activeWireSpot.solverFrequency})`
                    : `You Picked Option ${wireSpotPick} · Solver Prefers Option ${activeWireSpot.correctKey} (${activeWireSpot.solverFrequency})`}
                </div>
                <div style={{ color: '#dbeafe', fontSize: 13.5, lineHeight: 1.55 }}>
                  {activeWireSpot.evSummary}
                </div>
              </div>
            )}
          </section>
        )}

        <div style={styles.layout}>
          {/* Left: Interactive Canvas */}
          <div style={styles.canvasCol}>
            <div style={styles.canvasArea}>
              <div data-handlab-variant-selector="true" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    data-variant-option={v.id}
                    aria-pressed={variant === v.id}
                    onClick={() => handleVariantChange(v.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: variant === v.id ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.16)',
                      background: variant === v.id ? 'rgba(0, 212, 255, 0.18)' : 'rgba(255,255,255,0.04)',
                      color: variant === v.id ? '#67e8f9' : '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <h3 style={styles.sectionTitle}>1. Your Hole Cards ({variantSpec.holeCount} Cards)</h3>
              <div style={{ ...styles.heroRow, flexWrap: 'wrap' }}>
                {heroCards.map((cardValue, idx) => {
                  const slotKey = `hero${idx + 1}`;
                  return (
                    <div
                      key={slotKey}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedSlot === slotKey}
                      aria-label={`Select hole card ${idx + 1}`}
                      style={{
                        ...styles.cardSlot,
                        border:
                          selectedSlot === slotKey
                            ? '2px solid #00d4ff'
                            : '2px dashed rgba(255,255,255,0.2)',
                      }}
                      onClick={() => setSelectedSlot(slotKey)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedSlot(slotKey);
                        }
                      }}
                    >
                      {cardValue ? (
                        <PlayingCard card={cardValue} size="md" priority />
                      ) : (
                        <span style={styles.placeholder}>Card {idx + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <h3 style={styles.sectionTitle}>2. Board (Optional)</h3>
              <div style={styles.boardRow}>
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div
                    key={`board${idx + 1}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedSlot === `board${idx + 1}`}
                    aria-label={`Select board card ${idx + 1}`}
                    style={{
                      ...styles.cardSlot,
                      height: 100,
                      border:
                        selectedSlot === `board${idx + 1}`
                          ? '2px solid #4ade80'
                          : '2px dashed rgba(255,255,255,0.2)',
                    }}
                    onClick={() => setSelectedSlot(`board${idx + 1}`)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSlot(`board${idx + 1}`); } }}
                  >
                    {boardCards[idx] ? (
                      <PlayingCard card={boardCards[idx]} size="md" priority />
                    ) : (
                      <span style={{ ...styles.placeholder, fontSize: 12 }}>
                        {idx < 3 ? 'Flop' : idx === 3 ? 'Turn' : 'River'}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <h3 style={styles.sectionTitle}>3. Villain Benchmark Hand</h3>
              <select
                aria-label="Villain Benchmark Hand"
                style={styles.rangeSelect}
                value={villainHand}
                onChange={(e) => { calcSeqRef.current += 1; setVillainHand(e.target.value); setEquity(null); setResults(null); setAnalysisError(''); }}
              >
                {benchmarkHands.map((hand) => <option key={hand.value} value={hand.value}>{hand.label}</option>)}
              </select>
              <div style={{ margin: '-28px 0 28px', color: 'var(--sp-fg-faint)', fontSize: 12 }}>Exact Hand Vs Hand Equity - Not A Range Estimate</div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={runAnalysis}
                disabled={!isHeroComplete || analyzing}
                style={{ ...styles.analyzeBtn, opacity: !isHeroComplete ? 0.5 : 1 }}
              >
                {analyzing ? 'RUNNING MONTE CARLO (10k Iterations)...' : 'ANALYZE EQUITY'}
              </motion.button>

              {analysisError && <div role="alert" style={{ marginTop: 14, color: 'var(--sp-accent-red)', fontSize: 12, lineHeight: 1.5 }}>{analysisError}</div>}

              {/* Results */}
              {equity && !analyzing && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={styles.resultsBox}
                >
                  <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', fontWeight: 700 }}>
                    Hero Equity Vs {benchmarkHands.find((hand) => hand.value === villainHand)?.label || villainHand}
                  </div>
                  <div
                    style={{
                      fontSize: 64,
                      fontWeight: 900,
                      fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
                      color: equity > 50 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                    }}
                  >
                    {equity}%
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      width: '100%',
                      height: 12,
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      marginTop: 16,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ width: `${equity}%`, background: 'var(--sp-accent-green)' }} />
                    <div style={{ width: `${100 - equity}%`, background: 'var(--sp-accent-red)' }} />
                  </div>
                </motion.div>
              )}

              {results && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,.08)', background: 'rgba(0,0,0,.18)', color: 'var(--sp-fg-muted)', fontSize: 12, lineHeight: 1.7 }}>
                    <div>Opponent Equity: <strong style={{ color: 'var(--sp-fg)' }}>{results.opponentEquity}%</strong></div>
                    <div>Board Cards Locked: <strong style={{ color: 'var(--sp-fg)' }}>{results.boardSize}</strong></div>
                    <div>Monte Carlo Iterations: <strong style={{ color: 'var(--sp-fg)' }}>{Number(results.iterations || 0).toLocaleString()}</strong></div>
                  </div>
                  {results.horseBrainAnalysis && (
                    <div
                      data-handlab-brain-panel="true"
                      data-brain-engine={results.horseBrainAnalysis.engineModule}
                      style={{
                        marginTop: 10,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(34,211,238,0.28)',
                        background: 'rgba(6,182,212,0.08)',
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                        <span style={{ color: '#67e8f9', fontWeight: 800 }}>
                          {`Engine: ${results.horseBrainAnalysis.engineModule}`}
                        </span>
                        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>
                          {`Category: ${results.horseBrainAnalysis.madeHandCategory}`}
                        </span>
                        {results.horseBrainAnalysis.recommendedAction && (
                          <span style={{ color: '#4ade80', fontWeight: 800 }}>
                            {`Best Line: ${results.horseBrainAnalysis.recommendedAction}`}
                          </span>
                        )}
                      </div>
                      {Array.isArray(results.horseBrainAnalysis.omahaBestTwoHole) &&
                        results.horseBrainAnalysis.omahaBestTwoHole.length === 2 &&
                        Array.isArray(results.horseBrainAnalysis.omahaBestThreeBoard) &&
                        results.horseBrainAnalysis.omahaBestThreeBoard.length === 3 && (
                          <div data-omaha-best-combination="true" style={{ color: '#86daff', fontWeight: 700, marginBottom: 4 }}>
                            {`2-Hole + 3-Board Omaha Combo: ${results.horseBrainAnalysis.omahaBestTwoHole.join(' ')} + ${results.horseBrainAnalysis.omahaBestThreeBoard.join(' ')}`}
                          </div>
                        )}
                      <div style={{ color: '#cbd5e1' }}>
                        {results.horseBrainAnalysis.coachingSummary}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>

          {/* Right: Card Picker Deck */}
          <div style={styles.pickerCol}>
            <div style={styles.deckBox}>
              <h3
                style={{
                  margin: '0 0 16px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  paddingBottom: 16,
                  color: 'var(--sp-accent-cyan)',
                }}
              >
                Deck Picker {selectedSlot ? `(Selecting for ${selectedSlot})` : ''}
              </h3>

              <div style={styles.deckGrid}>
                {SUITS.map((suit) => (
                  <div key={suit} style={styles.suitRow}>
                    <div style={{ ...styles.suitLabel, color: getSuitColor(suit) }}>{suit}</div>
                    <div style={styles.rankGrid}>
                      {RANKS.map((rank) => {
                        const card = `${rank}${suit}`;
                        const isUsed = heroCards.includes(card) || boardCards.includes(card);
                        return (
                          <button
                            key={card}
                            onClick={() => handleCardSelect(rank, suit)}
                            disabled={isUsed || !selectedSlot}
                            style={{
                              ...styles.deckCard,
                              opacity: isUsed ? 0.2 : !selectedSlot ? 0.5 : 1,
                              color: getSuitColor(suit),
                              border: isUsed
                                ? '1px solid rgba(255,255,255,0.1)'
                                : '1px solid rgba(255,255,255,0.2)',
                            }}
                          >
                            {rank}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
  if (suit === '♥' || suit === '♦') return 'var(--sp-accent-red)';
  if (suit === '♣') return 'var(--sp-accent-emerald)';
  return 'var(--sp-fg)';
}
const styles = {
  container: {
    minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
    background: '#040d18',
    padding: '24px 4vw 80px',
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingBottom: 24,
    borderBottom: '1px solid #688299',
  },
  backButton: {
    background: '#091727',
    border: '1px solid #688299',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: 28,
    fontWeight: 900,
    fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
    letterSpacing: 1,
    color: 'var(--sp-accent-cyan)',
  },
  subtitle: { margin: 0, color: 'var(--sp-fg-muted)', fontSize: 14 },
  clearBtn: {
    background: 'rgba(239, 68, 68, 0.1)',
    color: 'var(--sp-accent-red)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    padding: '8px 16px',
    borderRadius: 7,
    cursor: 'pointer',
    fontWeight: 700,
  },
  layout: {
    display: 'flex',
    gap: 32,
    alignItems: 'flex-start',
  },
  canvasCol: {
    flex: 1,
    background: '#091727',
    border: '1px solid #688299',
    borderTopColor: '#aec0d0',
    borderRadius: 7,
    padding: 32,
  },
  pickerCol: {
    flex: 1,
    maxWidth: 500,
  },
  sectionTitle: {
    color: 'var(--sp-fg-muted)',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  heroRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 40,
  },
  boardRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 40,
  },
  cardSlot: {
    width: 80,
    height: 120,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 900,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.02)',
    transition: 'all 0.2s',
  },
  placeholder: {
    fontSize: 12,
    color: 'var(--sp-fg-faint)',
    fontWeight: 600,
  },
  rangeSelect: {
    width: '100%',
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    padding: '16px',
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 40,
    outline: 'none',
  },
  analyzeBtn: {
    width: '100%',
    background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 52%, #002b68 100%)',
    color: '#fff',
    padding: '20px',
    borderRadius: 7,
    border: '1px solid #56d8ff',
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 1,
    cursor: 'pointer',
    boxShadow: '0 8px 30px rgba(8, 124, 250, 0.3)',
  },
  resultsBox: {
    marginTop: 32,
    background: '#091727',
    border: '1px solid #688299',
    borderTopColor: '#aec0d0',
    padding: 32,
    borderRadius: 7,
    textAlign: 'center',
  },
  deckBox: {
    background: '#091727',
    border: '1px solid #688299',
    borderTopColor: '#aec0d0',
    borderRadius: 7,
    padding: 24,
  },
  deckGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  suitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  suitLabel: {
    fontSize: 32,
    width: 40,
    textAlign: 'center',
  },
  rankGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  deckCard: {
    width: 36,
    height: 48,
    background: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
  },
};
