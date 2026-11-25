// TRAIN-CSS-TOKENS-ADOPT-9 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-9 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-GRADIENT-ADOPT-19 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-8 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import PlayingCard from '../../../src/components/poker/PlayingCard';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';
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

function cardToAscii(card) {
  return card ? `${card[0]}${SUIT_CODES[card[1]] || card[1]}` : '';
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
  const calcSeqRef = React.useRef(0);

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
    if (!matchedSpot) return;
    calcSeqRef.current += 1;
    setActiveWireSpot(matchedSpot);
    const normalizedPick = typeof rawPick === 'string' ? rawPick.trim().toUpperCase() : '';
    if (['A', 'B', 'C'].includes(normalizedPick)) {
      setWireSpotPick(normalizedPick);
    }
    const spotVariant = VARIANTS.some((v) => v.id === matchedSpot.variant) ? matchedSpot.variant : 'nlh';
    const spotHoleCount = (VARIANTS.find((v) => v.id === spotVariant) || VARIANTS[0]).holeCount;
    setVariant(spotVariant);
    setBrainVariant(spotVariant);
    if (Array.isArray(matchedSpot.heroCards) && matchedSpot.heroCards.length === spotHoleCount) {
      setHeroCards([...matchedSpot.heroCards]);
    }
    if (Array.isArray(matchedSpot.boardCards) && matchedSpot.boardCards.length === 5) {
      setBoardCards([...matchedSpot.boardCards]);
    }
    setEquity(null);
    setResults(null);
    setAnalysisError('');
  }, [router.isReady, router.query.spot, router.query.pick]);

  const variantSpec = VARIANTS.find((v) => v.id === variant) || VARIANTS[0];
  const benchmarkHands = BENCHMARK_HANDS_BY_VARIANT[variant] || BENCHMARK_HANDS_BY_VARIANT.nlh;
  const [brainVariant, setBrainVariant] = useState('nlh');
  const brainPreview = useMemo(
    () =>
      evaluateTrainingSpotWithHorseBrain({
        variant: brainVariant,
        street: 'flop',
        heroPosition: 'BTN',
        villainPosition: 'BB',
        heroCards:
          brainVariant === 'plo6'
            ? ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d']
            : brainVariant === 'plo5'
              ? ['As', 'Ks', 'Qh', 'Jh', 'Td']
              : brainVariant === 'plo8'
                ? ['As', '2s', 'Kh', '3h']
                : brainVariant === 'plo4'
                  ? ['As', 'Ks', 'Qh', 'Jh']
                  : ['As', 'Kd'],
        boardCards: ['Qs', '7d', '2c'],
        potSizeBb: 12,
        facingBetBb: 4,
        effectiveStackBb: 100,
      }),
    [brainVariant]
  );

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
                    onClick={() => {
                      fb.click();
                      setWireSpotPick(opt.key);
                    }}
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
                          <div data-omaha-best-combination="true" style={{ color: '#fde68a', fontWeight: 700, marginBottom: 4 }}>
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
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}
              data-recommended-action={brainPreview?.recommendedAction || 'Call'}
              style={{
                marginTop: 18,
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid rgba(0,212,255,0.22)',
                background: 'rgba(10,15,30,0.65)',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontWeight: 800, color: 'var(--sp-accent-cyan)' }}>Horse Brain Spot Preview</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      data-brain-variant-tab={v}
                      onClick={() => setBrainVariant(v)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: brainVariant === v ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.14)',
                        background: brainVariant === v ? 'rgba(0,212,255,0.16)' : 'rgba(255,255,255,0.04)',
                        color: brainVariant === v ? '#67e8f9' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: '#cbd5e1', marginBottom: 12 }}>
                <span>Engine: <strong style={{ color: '#67e8f9' }}>{brainPreview?.engineModule}</strong></span>
                <span data-brain-action={brainPreview?.recommendedAction}>Action: <strong style={{ color: '#4ade80' }}>{brainPreview?.recommendedAction}</strong></span>
                <span data-brain-made-hand={brainPreview?.madeHandCategory}>Hand: <strong>{brainPreview?.madeHandCategory}</strong></span>
                <span data-brain-pot-limit-max={brainPreview?.potLimitSizing?.maxPotBetOrRaise || 100}>Max: <strong>{brainPreview?.potLimitSizing?.maxPotBetOrRaise || 100} BB</strong></span>
              </div>
              <button
                type="button"
                data-launch-club-arena-cta="true"
                onClick={() => router.push(buildCustomTrainingArenaHref({ format: 'cash', variant: brainVariant, streets: ['flop'], positions: ['BTN'], stackDepth: 100 }, 'hand-lab'))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(0,212,255,0.35)',
                  background: 'rgba(0,212,255,0.12)',
                  color: '#67e8f9',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Launch 1:1 Club Arena Drill
              </button>
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
    background: 'linear-gradient(180deg, #05050A 0%, #0A0A15 100%)',
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
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  backButton: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
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
    borderRadius: 8,
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
    background: 'rgba(10, 15, 30, 0.6)',
    border: '1px solid rgba(0, 212, 255, 0.15)',
    borderRadius: 24,
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
    background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
    color: '#fff',
    padding: '20px',
    borderRadius: 16,
    border: 'none',
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 1,
    cursor: 'pointer',
    boxShadow: '0 8px 30px rgba(0, 212, 255, 0.3)',
  },
  resultsBox: {
    marginTop: 32,
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(74, 222, 128, 0.3)',
    padding: 32,
    borderRadius: 16,
    textAlign: 'center',
  },
  deckBox: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 16,
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
