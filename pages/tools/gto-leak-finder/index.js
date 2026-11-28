/**
 * 60-SECOND GTO POKER LEAK FINDER (/tools/gto-leak-finder)
 * ========================================================
 * Interactive 5-hand solver diagnostic covering Preflop 3-Bet Defense, Flop
 * C-Bet Discipline, Turn Barrel Selection, River Bluff-Catching, and MTT ICM
 * Shove/Fold. Computes live GTO accuracy %, estimated BB/100 leak rate, and
 * Primary Leak #1, saves guest results to localStorage (sp_saved_spots_v1)
 * for automatic cloud sync upon signup, and gates the full 5-Category Leak
 * Matrix & Custom 107-Game Drill Plan behind free account unlock.
 *
 * Global <GuestConversionBar /> and <SmarterUnlockedWelcomeBanner /> are
 * mounted once in pages/_app.js so no fixed/sticky bars duplicate on screen.
 *
 * House style: #SMARTERDESIGN (0px corners, navy/chrome hardware, zero banned
 * gold hexes), Title Case headings/buttons, zero em dashes, zero en dashes.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead, { schemas } from '../../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../../src/lib/seo/hubPageSchema';
import SmarterSeoMasthead from '../../../src/components/seo/SmarterSeoMasthead';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import FaqSection from '../../../src/components/seo/FaqSection';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import { openQuickSignup } from '../../../src/components/seo/SmarterQuickSignupSheet';
import { SAVED_SPOTS_STORAGE_KEY } from '../../../src/components/seo/SmarterUnlockedWelcomeBanner';
import { trackSeoFunnelEvent } from '../../../src/lib/seo/seoFunnelTelemetry';
import {
  GTO_LEAK_FINDER_SPOTS,
  scoreGtoLeakFinder,
} from '../../../src/content/tools/gtoLeakFinderSpots';
import styles from '../../../src/components/seo/SmarterSeoKit.module.css';

const CANONICAL_PATH = '/tools/gto-leak-finder';
const OG_IMAGE_URL =
  '/api/og/tool-card?tool=gto&title=60-Second%20GTO%20Leak%20Finder&subtitle=5-Hand%20Solver%20Diagnostic';
const ANSWERS_STORAGE_KEY = 'sp_gto_leak_finder_answers_v1';

const SUIT_META = {
  s: { glyph: '♠', color: '#f2f7ff', name: 'Spades' },
  h: { glyph: '♥', color: '#f87171', name: 'Hearts' },
  d: { glyph: '♦', color: '#38bdf8', name: 'Diamonds' },
  c: { glyph: '♣', color: '#22c55e', name: 'Clubs' },
};

const LEAK_FINDER_FAQS = [
  {
    question: 'How Does The 60-Second GTO Poker Leak Finder Calculate My BB/100 Leak Rate?',
    answer:
      'Each Of The 5 Diagnostic Hands Measures Your Decision Against Solver-Optimal 100BB 6-Max Cash And Final-Table ICM Baselines. Suboptimal Selections Estimate Your Recurring Big-Blinds-Per-100-Hands (BB/100) EV Loss Across Preflop 3-Bet Defense, Flop C-Bet Discipline, Turn Barreling, River Bluff-Catching, And ICM Shove/Fold Decisions.',
  },
  {
    question: 'Is The Smarter.Poker GTO Leak Finder Completely Free?',
    answer:
      'Yes. You Can Play All 5 Solver-Graded Hands, View Your Headline GTO Accuracy Percentage, Estimated BB/100 Leak Rate, And Primary Leak #1 With Zero Sign-Up. Creating A Free Smarter.Poker Account Unlocks Your Complete 5-Category Leak Matrix, Cloud Spot Sync, And 107 Interactive GTO Training Games.',
  },
  {
    question: 'Why Does The Diagnostic Mix 100BB Cash Hands With An MTT ICM Bubble Spot?',
    answer:
      'Most Poker Players Study Either Cash Games Or Tournaments In Isolation, Missing Cross-Format Fundamentals Like Range Advantage, Equity Realization, Minimum Defense Frequency, And Bubble Factors. Testing All Five Pillars Reveals Whether Your Biggest EV Leak Is Preflop, Postflop, Or Tournament ICM.',
  },
  {
    question: 'How Do I Fix The Primary Poker Leak Identified In My Report?',
    answer:
      'Every Leak Category Links Directly To A Targeted Smarter.Poker Tool Or Training Module, Including Our Free 13x13 GTO Preflop Range Charts, Flop Board Texture Analyzer, River Bluff-Catching Calculator, ICM Payout Solver, And 107 Interactive GTO Training Games.',
  },
];

function hasStoredAuthSession() {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;
    const explicit = storage.getItem('smarter-poker-auth');
    if (explicit) {
      try {
        const parsed = JSON.parse(explicit);
        if (parsed && (parsed.access_token || parsed.user)) return true;
      } catch (_) {
        if (explicit.length > 10) return true;
      }
    }
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        const raw = storage.getItem(key);
        if (raw && raw !== '{}' && raw !== 'null') return true;
      }
    }
  } catch (_) {
    return false;
  }
  return false;
}

function saveLeakFinderResultToLocalStorage(score, answers) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers));
  } catch (_) {
    /* ignore storage quota errors */
  }
  try {
    const raw = window.localStorage.getItem(SAVED_SPOTS_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(existing) ? existing : [];
    const primaryLabel = score.primaryLeak
      ? `Primary Leak: ${score.primaryLeak.category}`
      : 'Zero Leaks Across All 5 Spots';
    const summaryText = `GTO Leak Finder: ${score.accuracyPct}% Accuracy (${score.optimalCount}/5), Est. -${score.estimatedLeakBb100.toFixed(1)} BB/100 Leak, ${primaryLabel}`;
    const entry = {
      id: 'gto-leak-finder-latest',
      toolSlug: 'gto-leak-finder',
      toolName: '60-Second GTO Leak Finder',
      summaryText,
      url: '/tools/gto-leak-finder?unlocked=1',
      savedAt: new Date().toISOString(),
    };
    const filtered = list.filter((item) => item && item.id !== entry.id);
    window.localStorage.setItem(SAVED_SPOTS_STORAGE_KEY, JSON.stringify([entry, ...filtered].slice(0, 50)));
  } catch (_) {
    /* ignore storage restrictions */
  }
}

function CardTile({ rank, suit }) {
  const meta = SUIT_META[suit] || SUIT_META.s;
  return (
    <span
      aria-label={`${rank} Of ${meta.name}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 52,
        height: 68,
        borderRadius: 0,
        border: '1px solid #3d5771',
        background: 'linear-gradient(180deg, #111827 0%, #0b1120 100%)',
        boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.22), 0 4px 10px rgba(0, 0, 0, 0.55)',
        color: meta.color,
        fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
        fontWeight: 800,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 22 }}>{rank}</span>
      <span style={{ fontSize: 18, marginTop: 4 }} aria-hidden="true">
        {meta.glyph}
      </span>
    </span>
  );
}

export default function GtoLeakFinderPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showReport, setShowReport] = useState(false);
  const [hasDispatchedEngaged, setHasDispatchedEngaged] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const rawSpot = Array.isArray(router.query?.spot) ? router.query.spot[0] : router.query?.spot;
    if (rawSpot) {
      const idx = GTO_LEAK_FINDER_SPOTS.findIndex((s) => s.id === String(rawSpot));
      if (idx >= 0) setCurrentIndex(idx);
    }
  }, [router.isReady, router.query]);

  const schemaNodes = useMemo(
    () =>
      hubProductSchema({
        path: CANONICAL_PATH,
        name: '60-Second GTO Poker Leak Finder',
        description:
          'Play 5 solver-graded 100BB poker spots in 60 seconds to uncover your top GTO leaks, estimated BB/100 loss rate, and custom drill plan free.',
        applicationCategory: 'GameApplication',
        image: `https://smarter.poker${OG_IMAGE_URL}`,
        trail: [
          ['Poker Tools', '/tools'],
          ['60-Second GTO Leak Finder', CANONICAL_PATH],
        ],
        faqs: LEAK_FINDER_FAQS,
        featureList: [
          '5 Solver-Graded 100BB 6-Max And ICM Spots',
          'Instant GTO Accuracy And Estimated BB/100 Leak Rate',
          'Primary Leak Diagnosis And 5-Category Matrix',
          'Direct Links To Targeted GTO Training Drills',
        ],
      }),
    [],
  );

  useEffect(() => {
    const syncAuth = () => {
      setSignedIn(hasStoredAuthSession());
    };
    syncAuth();
    window.addEventListener('storage', syncAuth);
    return () => window.removeEventListener('storage', syncAuth);
  }, [router?.asPath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ANSWERS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const restoredScore = scoreGtoLeakFinder(parsed);
        if (restoredScore.answeredCount === GTO_LEAK_FINDER_SPOTS.length && router?.query?.unlocked === '1') {
          setAnswers(parsed);
          setShowReport(true);
        }
      }
    } catch (_) {
      /* ignore corrupt storage */
    }
  }, [router?.query?.unlocked]);

  const currentSpot = GTO_LEAK_FINDER_SPOTS[currentIndex] || GTO_LEAK_FINDER_SPOTS[0];
  const currentAnswerId = answers[currentSpot.id] || null;
  const currentChoice = currentAnswerId
    ? currentSpot.options.find((opt) => opt.id === currentAnswerId) || null
    : null;
  const score = useMemo(() => scoreGtoLeakFinder(answers), [answers]);

  const handleSelectOption = (option) => {
    if (currentAnswerId) return;
    const nextAnswers = {
      ...answers,
      [currentSpot.id]: option.id,
    };
    setAnswers(nextAnswers);

    if (!hasDispatchedEngaged) {
      setHasDispatchedEngaged(true);
      try {
        window.dispatchEvent(
          new CustomEvent('sp:seo-tool-engaged', {
            detail: { tool: 'gto-leak-finder', spotId: currentSpot.id },
          }),
        );
      } catch (_) {
        /* non-blocking */
      }
    }

    trackSeoFunnelEvent('seo_leak_finder_step', {
      spot_id: currentSpot.id,
      category: currentSpot.category,
      option_id: option.id,
      is_optimal: Boolean(option.isOptimal),
      step_index: currentIndex + 1,
    });
  };

  const handleAdvance = () => {
    if (currentIndex + 1 < GTO_LEAK_FINDER_SPOTS.length) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }
    const finalScore = scoreGtoLeakFinder(answers);
    saveLeakFinderResultToLocalStorage(finalScore, answers);
    setShowReport(true);
    trackSeoFunnelEvent('seo_leak_finder_complete', {
      accuracy_pct: finalScore.accuracyPct,
      optimal_count: finalScore.optimalCount,
      estimated_leak_bb100: finalScore.estimatedLeakBb100,
      player_grade: finalScore.playerGrade,
      primary_leak: finalScore.primaryLeak?.category || 'none',
    });
  };

  const handleRetake = () => {
    setAnswers({});
    setCurrentIndex(0);
    setShowReport(false);
    setCopiedShare(false);
  };

  const handleUnlockFullReport = () => {
    saveLeakFinderResultToLocalStorage(score, answers);
    trackSeoFunnelEvent('seo_leak_finder_unlock_click', {
      accuracy_pct: score.accuracyPct,
      estimated_leak_bb100: score.estimatedLeakBb100,
      primary_leak: score.primaryLeak?.category || 'none',
    });
    openQuickSignup({
      unlockKey: 'gto-leak-finder-report',
      source: 'gto-leak-finder',
      redirectPath: '/tools/gto-leak-finder?unlocked=1',
      eyebrow: 'Full GTO Leak Diagnostic',
      title: 'Unlock Full Leak Report & 30-Day Free VIP',
      subtitle:
        'Create Your Free Account To Unlock Your 5-Category Leak Matrix, Auto-Sync Your Diagnostic Score, And Claim Free 30-Day VIP + 500 Diamonds On Phone Verify.',
      benefits: [
        'Instant Access To Your Full 5-Category GTO Leak Matrix',
        'Custom 107-Game GTO Drill Plan Matched To Your Exact Leaks',
        'Cloud Spot Sync + Free 30-Day VIP & 500 Diamonds On Phone Verify',
      ],
    });
  };

  const shareCardUrl = useMemo(() => {
    const subtitle = encodeURIComponent(
      `${score.accuracyPct}% GTO Accuracy | -${score.estimatedLeakBb100.toFixed(1)} BB/100 Leak | ${score.playerGrade}`,
    );
    return `https://smarter.poker/api/og/tool-card?tool=gto&title=60-Second%20GTO%20Leak%20Finder&subtitle=${subtitle}`;
  }, [score.accuracyPct, score.estimatedLeakBb100, score.playerGrade]);

  const handleCopyShareCard = async () => {
    const shareText = `My 60-Second GTO Poker Leak Finder Score: ${score.accuracyPct}% Accuracy (${score.optimalCount}/5) | Est. Leak: -${score.estimatedLeakBb100.toFixed(1)} BB/100 | Grade: ${score.playerGrade}. Test Your Game Free: https://smarter.poker/tools/gto-leak-finder | Score Card: ${shareCardUrl}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 3000);
    } catch (_) {
      setCopiedShare(true);
    }
  };

  const progressPct = showReport
    ? 100
    : Math.round(((currentIndex + (currentAnswerId ? 1 : 0)) / GTO_LEAK_FINDER_SPOTS.length) * 100);

  return (
    <>
      <SEOHead
        title="60-Second GTO Poker Leak Finder Free | Smarter.Poker"
        description="Play 5 solver-graded 100BB poker spots in 60 seconds to uncover your top GTO leaks, estimated BB/100 loss rate, and custom drill plan free."
        canonical={CANONICAL_PATH}
        ogImage={OG_IMAGE_URL}
        jsonLd={[schemas.organization, ...schemaNodes]}
      />

      <main
        style={{
          minHeight: '100vh',
          background: '#0b1120',
          color: '#f2f7ff',
          padding: '24px 16px 72px',
        }}
      >
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <nav
            aria-label="Breadcrumb"
            style={{
              fontSize: 13,
              color: '#86daff',
              marginBottom: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Link href="/" style={{ color: '#86daff', textDecoration: 'none' }}>
              Home
            </Link>
            <span style={{ color: '#64748b' }}>/</span>
            <Link href="/tools" style={{ color: '#86daff', textDecoration: 'none' }}>
              Poker Tools
            </Link>
            <span style={{ color: '#64748b' }}>/</span>
            <span style={{ color: '#f2f7ff', fontWeight: 700 }}>60-Second GTO Leak Finder</span>
          </nav>

          <SmarterSeoMasthead
            vertical="tools"
            eyebrow="Free 5-Hand Solver Diagnostic"
            title="60-Second GTO Poker Leak Finder"
            lead="Play 5 Real 100BB Cash And Final-Table ICM Spots To Pinpoint Your Top GTO Leaks, Estimated BB/100 Loss Rate, And Custom 107-Game Drill Plan."
            stats={[
              { label: 'Diagnostic Length', value: '5 Real Spots' },
              { label: 'Completion Time', value: '60 Seconds' },
              { label: 'Leak Categories', value: '5 GTO Pillars' },
              { label: 'Account Cost', value: '100% Free' },
            ]}
            redirectPath="/tools/gto-leak-finder?unlocked=1"
            unlockKey="gto-leak-finder-report"
            primaryCtaLabel="Unlock Full Leak Report Free"
            secondaryHref="/hub/training"
            secondaryLabel="Browse 107 GTO Games"
          />

          <section
            aria-label="Interactive 60-Second GTO Leak Finder"
            className={`${styles.kit} ${styles.frameActive}`}
            data-testid="gto-leak-finder-console"
            style={{ marginTop: 24, padding: '20px 18px' }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 14,
              }}
            >
              <span className={styles.eyebrowTag} data-testid="leak-finder-step-indicator">
                {showReport
                  ? 'Diagnostic Complete (5 Of 5)'
                  : `Spot ${currentIndex + 1} Of ${GTO_LEAK_FINDER_SPOTS.length}`}
              </span>
              <span
                style={{
                  color: '#38bdf8',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {showReport ? score.playerGrade : currentSpot.category}
              </span>
            </div>

            <div
              role="progressbar"
              aria-label="GTO Leak Finder Progress"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                width: '100%',
                height: 6,
                background: '#111827',
                border: '1px solid #2b4663',
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                  transition: 'width 180ms ease',
                }}
              />
            </div>

            {!showReport ? (
              <div data-testid="leak-finder-spot-card">
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 'clamp(1.2rem, 2.8vw, 1.55rem)',
                      fontWeight: 800,
                      color: '#f2f7ff',
                      fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
                    }}
                  >
                    {currentSpot.title}
                  </h2>
                  <span
                    style={{
                      padding: '4px 10px',
                      border: '1px solid #355270',
                      background: '#111827',
                      color: '#86daff',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {currentSpot.formatLabel}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>Hero Position</span>
                    <span className={styles.statValue}>{currentSpot.heroPos}</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>Pot Size</span>
                    <span className={styles.statValue}>{`${currentSpot.potBb} BB`}</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>Effective Stack</span>
                    <span className={styles.statValue}>{`${currentSpot.stackBb} BB`}</span>
                  </div>
                </div>

                <div
                  style={{
                    padding: '16px',
                    border: '1px solid #2b4663',
                    background: '#0b1120',
                    marginBottom: 16,
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 14px',
                      color: '#e2ecf7',
                      fontSize: 15,
                      lineHeight: 1.55,
                      fontWeight: 500,
                    }}
                  >
                    {currentSpot.villainAction}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 20,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#38bdf8',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          marginBottom: 6,
                        }}
                      >
                        Your Hand
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {currentSpot.heroCards.map((card, idx) => (
                          <CardTile key={`hero-${idx}`} rank={card.rank} suit={card.suit} />
                        ))}
                      </div>
                    </div>

                    {currentSpot.boardCards.length > 0 ? (
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#86daff',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                          }}
                        >
                          Board Texture
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {currentSpot.boardCards.map((card, idx) => (
                            <CardTile key={`board-${idx}`} rank={card.rank} suit={card.suit} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  role="group"
                  aria-label="Choose Your GTO Action"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                  }}
                >
                  {currentSpot.options.map((option) => {
                    const isPicked = currentAnswerId === option.id;
                    const revealCorrect = Boolean(currentAnswerId) && option.isOptimal;
                    const borderColor = revealCorrect
                      ? '#22c55e'
                      : isPicked
                        ? '#f87171'
                        : '#355270';
                    const background = revealCorrect
                      ? 'linear-gradient(180deg, rgba(22, 101, 52, 0.55) 0%, rgba(11, 24, 39, 0.95) 100%)'
                      : isPicked
                        ? 'linear-gradient(180deg, rgba(127, 29, 29, 0.5) 0%, rgba(11, 24, 39, 0.95) 100%)'
                        : 'linear-gradient(180deg, #111827 0%, #0b1120 100%)';

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={Boolean(currentAnswerId)}
                        onClick={() => handleSelectOption(option)}
                        data-testid={`leak-option-${option.id}`}
                        style={{
                          minHeight: 54,
                          padding: '12px 16px',
                          borderRadius: 0,
                          border: `1px solid ${borderColor}`,
                          background,
                          color: '#f2f7ff',
                          fontSize: 15,
                          fontWeight: 800,
                          fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
                          letterSpacing: '0.02em',
                          textAlign: 'left',
                          cursor: currentAnswerId ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span>{option.label}</span>
                        {currentAnswerId ? (
                          <span
                            style={{
                              fontSize: 12,
                              color: option.isOptimal ? '#22c55e' : '#bdd0e2',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {`${option.solverFreqPct}% GTO`}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {currentChoice ? (
                  <div
                    data-testid="leak-finder-micro-grade"
                    style={{
                      marginTop: 16,
                      padding: '14px 16px',
                      border: `1px solid ${currentChoice.isOptimal ? '#22c55e' : '#38bdf8'}`,
                      background: '#111827',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <strong
                        style={{
                          color: currentChoice.isOptimal ? '#22c55e' : '#38bdf8',
                          fontSize: 15,
                        }}
                      >
                        {`${currentChoice.gradeLabel} (${currentChoice.solverFreqPct}% Solver Frequency)`}
                      </strong>
                      <span
                        style={{
                          color: currentChoice.isOptimal ? '#22c55e' : '#f87171',
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {currentChoice.evDeltaBb === 0
                          ? '0.00 BB EV Loss'
                          : `${currentChoice.evDeltaBb.toFixed(2)} BB EV Loss`}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 12px', color: '#bdd0e2', fontSize: 14, lineHeight: 1.5 }}>
                      {currentChoice.shortWhy}
                    </p>
                    <button
                      type="button"
                      className={styles.btnSharpPrimary}
                      data-testid="leak-finder-next-btn"
                      onClick={handleAdvance}
                    >
                      {currentIndex + 1 < GTO_LEAK_FINDER_SPOTS.length
                        ? `Next Spot (${currentIndex + 2} Of ${GTO_LEAK_FINDER_SPOTS.length})`
                        : 'Reveal My GTO Leak Report'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div data-testid="leak-finder-report">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>Headline GTO Accuracy</span>
                    <span
                      className={styles.statValue}
                      data-testid="leak-report-accuracy"
                      style={{ color: score.accuracyPct >= 80 ? '#22c55e' : '#38bdf8', fontSize: 28 }}
                    >
                      {`${score.accuracyPct}%`}
                    </span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>Estimated BB/100 Leak</span>
                    <span
                      className={styles.statValue}
                      data-testid="leak-report-bb100"
                      style={{ color: score.estimatedLeakBb100 > 0 ? '#f87171' : '#22c55e', fontSize: 28 }}
                    >
                      {score.estimatedLeakBb100 > 0
                        ? `-${score.estimatedLeakBb100.toFixed(1)} BB/100`
                        : '0.0 BB/100'}
                    </span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>Solver Diagnostic Grade</span>
                    <span className={styles.statValue} data-testid="leak-report-grade" style={{ fontSize: 20 }}>
                      {score.playerGrade}
                    </span>
                  </div>
                </div>

                <div
                  data-testid="leak-report-primary-leak"
                  style={{
                    padding: '16px',
                    border: '1px solid #2563eb',
                    background: 'linear-gradient(180deg, #111827 0%, #0b1120 100%)',
                    marginBottom: 18,
                  }}
                >
                  <span className={styles.eyebrowTag}>Primary Leak #1</span>
                  {score.primaryLeak ? (
                    <>
                      <h2
                        style={{
                          margin: '10px 0 6px',
                          fontSize: 20,
                          fontWeight: 800,
                          color: '#f2f7ff',
                          fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
                        }}
                      >
                        {`${score.primaryLeak.category}: ${score.primaryLeak.leakTitle}`}
                      </h2>
                      <p style={{ margin: '0 0 8px', color: '#bdd0e2', fontSize: 14, lineHeight: 1.55 }}>
                        {score.primaryLeak.shortWhy}
                      </p>
                      <div style={{ color: '#38bdf8', fontSize: 13, fontWeight: 700 }}>
                        {`Estimated Recurring Cost: -${score.primaryLeak.bb100Impact.toFixed(1)} BB/100`}
                      </div>
                    </>
                  ) : (
                    <>
                      <h2
                        style={{
                          margin: '10px 0 6px',
                          fontSize: 20,
                          fontWeight: 800,
                          color: '#22c55e',
                          fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
                        }}
                      >
                        Zero Major Leaks Detected Across All 5 Spots
                      </h2>
                      <p style={{ margin: 0, color: '#bdd0e2', fontSize: 14, lineHeight: 1.55 }}>
                        You Matched The Solver Optimal Line On Every Spot. Push Further Inside 107 Interactive GTO Training Games.
                      </p>
                    </>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 22,
                  }}
                >
                  <button
                    type="button"
                    className={styles.btnSharpSecondary}
                    data-testid="leak-finder-copy-share"
                    onClick={handleCopyShareCard}
                  >
                    {copiedShare ? 'Shareable Score Card Copied' : 'Copy Shareable Score Card'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSharpSecondary}
                    data-testid="leak-finder-retake"
                    onClick={handleRetake}
                  >
                    Retake 5-Hand Diagnostic
                  </button>
                </div>

                {signedIn ? (
                  <div data-testid="leak-finder-unlocked-matrix">
                    <h3
                      style={{
                        margin: '0 0 12px',
                        fontSize: 19,
                        fontWeight: 800,
                        color: '#f2f7ff',
                        fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
                      }}
                    >
                      Unlocked 5-Category Leak Matrix &amp; Custom 107-Game Drill Plan
                    </h3>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {score.categoryBreakdown.map((item) => (
                        <div
                          key={item.spotId}
                          style={{
                            padding: '14px 16px',
                            border: `1px solid ${item.isOptimal ? '#22c55e' : '#355270'}`,
                            background: '#111827',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 4,
                              }}
                            >
                              <strong style={{ color: '#f2f7ff', fontSize: 15 }}>{item.category}</strong>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  border: `1px solid ${item.isOptimal ? '#22c55e' : '#38bdf8'}`,
                                  color: item.isOptimal ? '#22c55e' : '#38bdf8',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {item.isOptimal ? 'Optimal (0.0 BB/100)' : `-${item.leakBb100.toFixed(1)} BB/100 Leak`}
                              </span>
                            </div>
                            <div style={{ color: '#86daff', fontSize: 13, marginBottom: 4 }}>
                              {`Optimal Solver Line: ${item.optimalLabel}`}
                            </div>
                            <p style={{ margin: 0, color: '#bdd0e2', fontSize: 13, lineHeight: 1.45 }}>
                              {item.shortWhy}
                            </p>
                          </div>
                          <Link href={item.leakFixDrill} className={styles.btnSharpPrimary}>
                            {item.leakFixLabel}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    data-testid="leak-finder-locked-matrix"
                    style={{
                      position: 'relative',
                      border: '1px solid #2563eb',
                      background: '#0b1120',
                      padding: '18px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        filter: 'blur(5px)',
                        userSelect: 'none',
                        pointerEvents: 'none',
                        display: 'grid',
                        gap: 10,
                        opacity: 0.45,
                      }}
                    >
                      {score.categoryBreakdown.map((item) => (
                        <div
                          key={item.spotId}
                          style={{
                            padding: '12px 14px',
                            border: '1px solid #355270',
                            background: '#111827',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{`${item.category} Solver Breakdown`}</span>
                          <span>{item.leakFixLabel}</span>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        padding: 20,
                        background: 'rgba(11, 17, 32, 0.84)',
                      }}
                    >
                      <span className={styles.eyebrowTag}>Full 5-Category Leak Matrix Ready</span>
                      <h3
                        style={{
                          margin: '10px 0 6px',
                          fontSize: 22,
                          fontWeight: 800,
                          color: '#f2f7ff',
                          fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
                        }}
                      >
                        Unlock Your 5-Category Leak Matrix &amp; Custom 107-Game Drill Plan
                      </h3>
                      <p
                        style={{
                          margin: '0 0 16px',
                          maxWidth: 540,
                          color: '#bdd0e2',
                          fontSize: 14,
                          lineHeight: 1.5,
                        }}
                      >
                        Your 5-Hand Diagnostic Score Is Saved Locally And Syncs Automatically To Your Free Account. Includes Free 30-Day VIP + 500 Diamonds On Phone Verify.
                      </p>
                      <button
                        type="button"
                        className={styles.ctaPrimary}
                        data-testid="leak-finder-unlock-cta"
                        onClick={handleUnlockFullReport}
                      >
                        <span>Unlock Full Leak Report &amp; 30-Day Free VIP</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <div style={{ marginTop: 28 }}>
            <SmarterAccountUnlockGate
              variant="training-gto"
              context="gto-leak-finder-report"
              redirectPath="/tools/gto-leak-finder?unlocked=1"
            />
          </div>

          <FaqSection faqs={LEAK_FINDER_FAQS} title="60-Second GTO Leak Finder FAQ" />

          <CitationBacklinkBox
            title="60-Second GTO Poker Leak Finder Diagnostic"
            canonicalUrl={`https://smarter.poker${CANONICAL_PATH}`}
            badgeType="gto"
            badgeLabel="GTO Leak Diagnostic"
            badgeValue="5-Hand Solver Assessment"
            summary="Interactive 5-Hand 100BB Cash And Final-Table ICM Solver Diagnostic Measuring GTO Accuracy, Estimated BB/100 Leak Rate, And Primary Strategy Leaks."
            slug="gto-leak-finder"
          />

          <AiPromptLauncher
            title="60-Second GTO Poker Leak Finder Diagnostic"
            canonicalUrl={`https://smarter.poker${CANONICAL_PATH}`}
            markdownUrl={`https://smarter.poker${CANONICAL_PATH}.md`}
          />
        </div>
      </main>
    </>
  );
}
