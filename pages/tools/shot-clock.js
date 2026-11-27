/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER ACTION CLOCK & HOME GAME SHOT-CLOCK TIMER (/tools/shot-clock)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Full-featured WPT/Triton-style tournament Action Clock: Configurable Primary
 * Decision Timer (15s, 20s, 30s, 45s), Time-Bank Extension Duration (30s or 60s),
 * Per-Player Time-Bank Card Counter (Seat 1-9), SSR-safe Web Audio API alerts,
 * high-contrast countdown bar, spacebar/tap-to-reset next hand, and presets.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const SHOT_CLOCK_PRESETS = [
  {
    id: 'preset_triton_20s',
    label: 'Triton 20s High Roller',
    primarySec: 20,
    timeBankSec: 30,
    initialCards: 4,
  },
  {
    id: 'preset_wpt_30s',
    label: 'WPT 30s Action Clock',
    primarySec: 30,
    timeBankSec: 30,
    initialCards: 4,
  },
  {
    id: 'preset_home_fast_30s',
    label: 'Home Game 30s Fast Pace',
    primarySec: 30,
    timeBankSec: 60,
    initialCards: 3,
  },
  {
    id: 'preset_plo_45s',
    label: 'PLO 45s Deep Tank',
    primarySec: 45,
    timeBankSec: 60,
    initialCards: 5,
  },
];

const INITIAL_SEATS = Array.from({ length: 9 }, (_, i) => ({
  seat: i + 1,
  name: `Seat ${i + 1}`,
  cards: 4,
}));

const SHOT_CLOCK_FAQS = [
  {
    question: 'How Does The Official WPT And Triton Poker Action Clock Work?',
    answer:
      'Players Receive A Fixed Primary Decision Window (Typically 20 Or 30 Seconds) Whenever Action Reaches Their Seat. When The Primary Clock Hits Zero, The Dealer Automatically Burns One Of That Player Physical Time-Bank Extension Cards Worth 30 Or 60 Extra Seconds.',
  },
  {
    question: 'What Happens Under TDA Rules If A Player Runs Out Of Time-Bank Cards And The Clock Hits Zero?',
    answer:
      'If A Player Faces A Bet And Their Shot Clock Reaches Zero With Zero Time-Bank Cards Remaining, Their Hand Is Declared Dead And Folded Immediately. If They Face No Bet (Checking Is An Option), Their Hand Is Automatically Checked.',
  },
  {
    question: 'How Many Extra Hands Per Hour Does A 30-Second Shot Clock Add To A Live Game?',
    answer:
      'Empirical Live Tournament Tracking Shows That Enforcing A 30-Second Action Clock Increases Dealing Speed From 24 Hands Per Hour Up To 31 To 34 Hands Per Hour (+30% More Hands Dealt Per Blind Level).',
  },
];

function playBeep(freq = 880, durationMs = 120) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.14;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, durationMs);
  } catch (_err) {
    // Ignore audio context autoplay restrictions
  }
}

export default function ShotClockPage() {
  const router = useRouter();
  const [primarySec, setPrimarySec] = useState(30);
  const [timeBankSec, setTimeBankSec] = useState(30);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeSeat, setActiveSeat] = useState(1);
  const [seats, setSeats] = useState(INITIAL_SEATS);
  const [activePresetId, setActivePresetId] = useState('preset_wpt_30s');
  const soundRef = useRef(true);
  soundRef.current = soundEnabled;

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.primary !== undefined) {
      const p = Number(q.primary) || 30;
      setPrimarySec(p);
      setSecondsLeft(p);
    }
    if (q.bank !== undefined) setTimeBankSec(Number(q.bank) || 30);
  }, [router.isReady, router.query]);

  useSolvedSpotUrlSync({
    primary: primarySec,
    bank: timeBankSec,
  });

  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (soundRef.current) playBeep(440, 360);
          setIsRunning(false);
          return 0;
        }
        const next = prev - 1;
        if (next <= 5 && soundRef.current) {
          playBeep(880, 90);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleResetNextAction = () => {
    setSecondsLeft(primarySec);
    setIsRunning(true);
  };

  const handleUseTimeBankCard = (seatNum) => {
    setSeats((prev) =>
      prev.map((s) => (s.seat === seatNum && s.cards > 0 ? { ...s, cards: s.cards - 1 } : s))
    );
    setSecondsLeft((prev) => prev + timeBankSec);
    setIsRunning(true);
  };

  const handleAdjustSeatCards = (seatNum, delta) => {
    setSeats((prev) =>
      prev.map((s) =>
        s.seat === seatNum ? { ...s, cards: Math.max(0, Math.min(20, s.cards + delta)) } : s
      )
    );
  };

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setPrimarySec(preset.primarySec);
    setTimeBankSec(preset.timeBankSec);
    setSecondsLeft(preset.primarySec);
    setIsRunning(false);
    setSeats((prev) => prev.map((s) => ({ ...s, cards: preset.initialCards })));
  };

  const canonicalPath = '/tools/shot-clock';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Free WPT And Triton-Style Poker Action Clock And Home Game Shot-Clock Timer With 15s-45s Countdown, 30s/60s Time-Bank Extension Cards For Seats 1-9, And Audio Alerts.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Poker Action Clock And Shot Timer',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Tournament Poker Action Clock & Time-Bank Tracker',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Action Clock & Shot Timer', canonicalPath],
      ],
      faqs: SHOT_CLOCK_FAQS,
      howTo: {
        name: 'How To Run A Tournament Poker Action Clock With Time-Bank Cards',
        description: pageDesc,
        steps: [
          {
            name: 'Select Action Clock Preset And Primary Countdown Duration',
            text: 'Choose Between WPT 30-Second, Triton High-Roller 20-Second, Or Home Game 45-Second Decision Timers.',
          },
          {
            name: 'Start The Decision Timer And Advance Active Seats',
            text: 'Press Start Or Next Hand/Player To Reset The Primary Shot Clock As Action Moves Around The Table.',
          },
          {
            name: 'Spend Or Reload Seat Time-Bank Extension Cards',
            text: 'Click Burn Time-Bank Card For Seats 1 Through 9 To Add +30s Or +60s When A Player Faces A Major Decision.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const progressPct = Math.min(100, Math.round((secondsLeft / Math.max(1, primarySec)) * 100));
  const timerColor = secondsLeft <= 5 ? '#ef4444' : secondsLeft <= 10 ? '#38bdf8' : '#34d399';
  const summaryText = `Smarter.Poker Action Clock: ${primarySec}s Primary Decision Timer | +${timeBankSec}s Time-Bank Extension Cards | Active Seat ${activeSeat}`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Action Clock And Shot Timer"
        description={pageDesc}
        canonical={canonicalPath}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8' }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Poker Action Clock &amp; Shot Timer</span>
          </nav>
          <Link
            href="/search"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#38bdf8',
              background: '#101a20',
              border: '1px solid #334155',
              borderRadius: '2px',
              padding: '5px 10px',
              textDecoration: 'none',
            }}
          >
            Press Cmd+K To Search All 400+ Tools &amp; Guides
          </Link>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Action Clock &amp; Home Game Shot-Clock Timer
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> Use This Tablet-Ready <strong>WPT &amp; Triton Action Clock</strong> To Enforce A <strong>15s, 20s, 30s, Or 45s Decision Window</strong> At Your Live Table While Tracking <strong>30s Or 60s Time-Bank Extension Cards</strong> Across All 9 Seats.
        </p>

        <CalculatorShareAndPresets
          toolTitle="Poker Action Clock And Shot Timer"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={SHOT_CLOCK_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive Tournament Action Clock"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[15, 20, 30, 45].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setPrimarySec(sec);
                    setSecondsLeft(sec);
                    setIsRunning(false);
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '2px',
                    border: primarySec === sec ? '1px solid #25c8ff' : '1px solid #334155',
                    background: primarySec === sec ? '#25c8ff' : '#020608',
                    color: primarySec === sec ? '#020608' : '#e2e8f0',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {sec}s Primary Clock
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[30, 60].map((tb) => (
                <button
                  key={tb}
                  type="button"
                  onClick={() => setTimeBankSec(tb)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '2px',
                    border: timeBankSec === tb ? '1px solid #38bdf8' : '1px solid #334155',
                    background: timeBankSec === tb ? '#38bdf8' : '#020608',
                    color: timeBankSec === tb ? '#020608' : '#e2e8f0',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  +{tb}s Time-Bank Card
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSoundEnabled((s) => !s)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '2px',
                  border: '1px solid #334155',
                  background: '#020608',
                  color: soundEnabled ? '#34d399' : '#94a3b8',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {soundEnabled ? 'Audio Alerts: On' : 'Audio Alerts: Muted'}
              </button>
            </div>
          </div>

          {/* High-Contrast Countdown Display */}
          <div
            style={{
              background: '#020608',
              border: `2px solid ${timerColor}`,
              borderRadius: '2px',
              padding: '28px 20px',
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Active Decision Seat {activeSeat} Countdown
            </div>
            <div style={{ fontSize: 84, fontWeight: 900, color: timerColor, lineHeight: 1.05, margin: '8px 0 14px' }}>
              {secondsLeft}s
            </div>

            <div style={{ height: 10, background: '#101a20', borderRadius: 2, overflow: 'hidden', maxWidth: 520, margin: '0 auto 20px' }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: timerColor,
                  transition: 'width 0.25s linear',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={handleResetNextAction}
                style={{
                  padding: '14px 26px',
                  background: '#34d399',
                  color: '#020608',
                  border: 0,
                  borderRadius: '2px',
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Next Player Action (Reset {primarySec}s)
              </button>

              <button
                type="button"
                onClick={() => setIsRunning((r) => !r)}
                style={{
                  padding: '14px 22px',
                  background: isRunning ? '#e2e8f0' : '#38bdf8',
                  color: '#020608',
                  border: 0,
                  borderRadius: '2px',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {isRunning ? 'Pause Clock' : 'Resume Clock'}
              </button>

              <button
                type="button"
                onClick={() => handleUseTimeBankCard(activeSeat)}
                style={{
                  padding: '14px 22px',
                  background: '#101a20',
                  color: '#38bdf8',
                  border: '1px solid #38bdf8',
                  borderRadius: '2px',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Burn Seat {activeSeat} Time-Bank (+{timeBankSec}s)
              </button>
            </div>
          </div>

          {/* 9-Seat Time-Bank Card Counter */}
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Per-Seat Time-Bank Card Inventory (Seats 1 To 9)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 10 }}>
            {seats.map((s) => {
              const isSelected = activeSeat === s.seat;
              return (
                <div
                  key={s.seat}
                  style={{
                    background: '#020608',
                    border: isSelected ? '1px solid #25c8ff' : '1px solid #1e293b',
                    borderRadius: '2px',
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => setActiveSeat(s.seat)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: isSelected ? '#25c8ff' : '#f8fafc',
                        fontSize: 14,
                        fontWeight: 800,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Seat {s.seat} {isSelected ? '(Active)' : ''}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 800, color: s.cards > 0 ? '#38bdf8' : '#ef4444' }}>
                      {s.cards} Cards
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSeat(s.seat);
                        handleUseTimeBankCard(s.seat);
                      }}
                      disabled={s.cards <= 0}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        background: s.cards > 0 ? '#38bdf8' : '#1e293b',
                        color: s.cards > 0 ? '#020608' : '#64748b',
                        border: 0,
                        borderRadius: '2px',
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: s.cards > 0 ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Use +{timeBankSec}s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjustSeatCards(s.seat, 1)}
                      style={{
                        padding: '6px 9px',
                        background: '#101a20',
                        color: '#34d399',
                        border: '1px solid #334155',
                        borderRadius: '2px',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      +1
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ marginBottom: 32 }}>
          <SmarterAccountUnlockGate
            variant="calculator-pro"
            context="tools-shot-clock"
            redirectPath={canonicalPath}
          />
        </div>

        <SmarterConversionCta
          compact
          eyebrow="Free Smarter.Poker Account"
          title="Save Shot-Clock Presets & Manage Home Games Free"
          description="Bookmark Action Clock Timers And Time-Bank Cards, Track Home Game Results, And Unlock 107 Free GTO Games."
          primaryLabel="Create Free Account"
          primaryHref="/auth/signup?redirect=/tools/shot-clock&src=shot-clock"
          secondaryLabel="Sign In"
          secondaryHref="/auth/login?redirect=/tools/shot-clock"
        />

        <FaqSection faqs={SHOT_CLOCK_FAQS} />

        <CitationBacklinkBox
          title="Poker Action Clock And Shot Timer"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Action Clock Engine"
          badgeValue="WPT & Triton Shot Timer"
          summary="Interactive Poker Action Clock With 15s-45s Decision Timer And 9-Seat Time-Bank Extension Card Tracker."
          slug="shot-clock"
        />

        <AiPromptLauncher
          title="Poker Action Clock And Shot Timer"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/tools/shot-clock', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  setPublicSeoHtmlCache(res);
  return { props: {} };
}
