// TRAIN-CSS-TOKENS-ADOPT-9 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-9 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-GRADIENT-ADOPT-19 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-8 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import PlayingCard from '../../../src/components/poker/PlayingCard';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
// TRAIN-WIRE-FX-2c — adoption: hand-lab card-pick + analyze feedback
// TRAIN-WIRE-PLAYCARD-4 — adoption: hand-lab hero+board slots via shared PlayingCard

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_CODES = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const BENCHMARK_HANDS = [
  { value: '9c8d', label: '9♣ 8♦ - Connected Hand' },
  { value: 'QhJd', label: 'Q♥ J♦ - Broadway Hand' },
  { value: 'KhKd', label: 'K♥ K♦ - Premium Pair' },
  { value: 'AhAd', label: 'A♥ A♦ - Pocket Aces' },
];

function cardToAscii(card) {
  return card ? `${card[0]}${SUIT_CODES[card[1]] || card[1]}` : '';
}

export default function HandLabV2() {
  const router = useRouter();
  useTrainingBus('hand-lab');
  const fb = useTrainingFeedback();

  // UI States
  const [selectedSlot, setSelectedSlot] = useState(null); // 'hero1', 'hero2', 'board1', etc

  // Hand State
  const [heroCards, setHeroCards] = useState(['', '']);
  const [boardCards, setBoardCards] = useState(['', '', '', '', '']);
  const [villainHand, setVillainHand] = useState('QhJd');

  // Analysis State
  const [analyzing, setAnalyzing] = useState(false);
  const [equity, setEquity] = useState(null);
  const [results, setResults] = useState(null);
  const [analysisError, setAnalysisError] = useState('');

  const handleCardSelect = (rank, suit) => {
    fb.click();
    const card = `${rank}${suit}`;

    // Prevent duplicates
    if (heroCards.includes(card) || boardCards.includes(card)) {
      // Can show a quick toast here in a real app
      return;
    }

    if (selectedSlot?.startsWith('hero')) {
      const idx = parseInt(selectedSlot.slice(-1), 10) - 1;
      const newHero = [...heroCards];
      newHero[idx] = card;
      setHeroCards(newHero);
      // Auto advance slot
      if (idx === 0) setSelectedSlot('hero2');
      else if (idx === 1 && !boardCards[0]) setSelectedSlot('board1');
      else setSelectedSlot(null);
    } else if (selectedSlot?.startsWith('board')) {
      const idx = parseInt(selectedSlot.slice(-1), 10) - 1;
      const newBoard = [...boardCards];
      newBoard[idx] = card;
      setBoardCards(newBoard);
      // Auto advance
      if (idx < 4) setSelectedSlot(`board${idx + 2}`);
      else setSelectedSlot(null);
    }
  };

  const runAnalysis = async () => {
    fb.click();
    if (!heroCards[0] || !heroCards[1]) return;

    setAnalyzing(true);
    setAnalysisError('');
    try {
      const response = await authedFetch('/api/training/equity', {
        method: 'POST',
        body: JSON.stringify({
          hands: [heroCards.map(cardToAscii).join(''), villainHand],
          board: boardCards.filter(Boolean).map(cardToAscii),
          variant: 'holdem',
          iterations: 10000,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || payload.results?.length < 2) {
        throw new Error(payload.error || `Equity Request Failed (${response.status})`);
      }

      setEquity(Number(payload.results[0].equity).toFixed(1));
      setResults({
        opponentEquity: Number(payload.results[1].equity).toFixed(1),
        iterations: payload.totalIterations,
        boardSize: payload.boardSize,
      });
    } catch (error) {
      setEquity(null);
      setResults(null);
      setAnalysisError(error.message || 'Unable To Analyze This Hand.');
    } finally {
      setAnalyzing(false);
    }
  };

  const clearAll = () => {
    setHeroCards(['', '']);
    setBoardCards(['', '', '', '', '']);
    setEquity(null);
    setResults(null); // Clear results on clearAll
    setAnalysisError('');
    setSelectedSlot('hero1');
  };

  return (
    <PageTransition>
      <Head>
        <title>Hand Lab V2 | Smarter.Poker</title>
      </Head>
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

        <div style={styles.layout}>
          {/* Left: Interactive Canvas */}
          <div style={styles.canvasCol}>
            <div style={styles.canvasArea}>
              <h3 style={styles.sectionTitle}>1. Your Hole Cards</h3>
              <div style={styles.heroRow}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedSlot === 'hero1'}
                  aria-label="Select first hole card"
                  style={{
                    ...styles.cardSlot,
                    border:
                      selectedSlot === 'hero1'
                        ? '2px solid #00d4ff'
                        : '2px dashed rgba(255,255,255,0.2)',
                  }}
                  onClick={() => setSelectedSlot('hero1')}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSlot('hero1'); } }}
                >
                  {heroCards[0] ? (
                    <PlayingCard card={heroCards[0]} size="md" priority />
                  ) : (
                    <span style={styles.placeholder}>Card 1</span>
                  )}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedSlot === 'hero2'}
                  aria-label="Select second hole card"
                  style={{
                    ...styles.cardSlot,
                    border:
                      selectedSlot === 'hero2'
                        ? '2px solid #00d4ff'
                        : '2px dashed rgba(255,255,255,0.2)',
                  }}
                  onClick={() => setSelectedSlot('hero2')}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSlot('hero2'); } }}
                >
                  {heroCards[1] ? (
                    <PlayingCard card={heroCards[1]} size="md" priority />
                  ) : (
                    <span style={styles.placeholder}>Card 2</span>
                  )}
                </div>
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
                onChange={(e) => { setVillainHand(e.target.value); setEquity(null); setResults(null); setAnalysisError(''); }}
              >
                {BENCHMARK_HANDS.map((hand) => <option key={hand.value} value={hand.value}>{hand.label}</option>)}
              </select>
              <div style={{ margin: '-28px 0 28px', color: 'var(--sp-fg-faint)', fontSize: 12 }}>Exact Hand Vs Hand Equity - Not A Range Estimate</div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={runAnalysis}
                disabled={!heroCards[0] || !heroCards[1] || analyzing}
                style={{ ...styles.analyzeBtn, opacity: !heroCards[0] || !heroCards[1] ? 0.5 : 1 }}
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
                    Hero Equity Vs {BENCHMARK_HANDS.find((hand) => hand.value === villainHand)?.label || villainHand}
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
