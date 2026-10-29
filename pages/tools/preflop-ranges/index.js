/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GTO PREFLOP RANGE MATRIX HUB COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive 13x13 preflop range matrix and strategy breakdown hub page.
 * Targets high-volume SEO search queries for "GTO preflop charts",
 * "UTG opening range", "BTN opening range", and positional preflop strategy.
 * Includes interactive cell inspector, full hand breakdown, FAQs, and Schema.org.
 */

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../../src/lib/seo/hubPageSchema';
import { RFI, ALL_HANDS, RANKS } from '../../../src/config/solverRanges';
import { combosFor, describeRange, TOTAL_COMBOS } from '../../../src/lib/seo/preflopReference';

const POSITIONS = [
  { id: 'UTG', name: 'Under The Gun', abbrev: 'UTG', desc: 'Tightest opening range from first position at 6-max table.' },
  { id: 'MP', name: 'Middle Position', abbrev: 'MP', desc: 'Also known as Lojack (LJ); expands slightly over UTG.' },
  { id: 'HJ', name: 'Hijack', abbrev: 'HJ', desc: 'Two seats off the button; begins opening broadway and suited connectors.' },
  { id: 'CO', name: 'Cutoff', abbrev: 'CO', desc: 'Directly right of button; wide opening range exploiting position.' },
  { id: 'BTN', name: 'The Button', abbrev: 'BTN', desc: 'Most profitable seat; opens widest range with guaranteed postflop position.' },
  { id: 'SB', name: 'Small Blind', abbrev: 'SB', desc: 'Blind vs blind dynamic; aggressive raise-or-fold strategy.' },
];

export default function PreflopRangeMatrixHub({ initialPosition = 'UTG' }) {
  const [activePos, setActivePos] = useState(initialPosition);
  const [selectedHand, setSelectedHand] = useState(null);
  const [hasCopiedRangeSpot, setHasCopiedRangeSpot] = useState(false);

  const posData = POSITIONS.find((p) => p.id === activePos) || POSITIONS[0];
  const rfiMap = RFI[activePos] || {};
  const stats = useMemo(() => describeRange(rfiMap, 'raise'), [rfiMap]);

  const copyRangeSpotSummary = () => {
    const handDetail = selectedData
      ? ` | Selected Hand: ${selectedData.hand} (${selectedData.action})`
      : '';
    const text = `Smarter.Poker 100BB 6-Max GTO ${posData.abbrev} Range: ${stats.percent}% Open (${stats.reach}% Combos Touched)${handDetail} - https://smarter.poker/tools/preflop-ranges/${posData.abbrev.toLowerCase()}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setHasCopiedRangeSpot(true);
      setTimeout(() => setHasCopiedRangeSpot(false), 2500);
    }
    return text;
  };

  // Construct 13x13 grid
  const matrixGrid = useMemo(() => {
    const grid = [];
    for (let r = 0; r < 13; r++) {
      const row = [];
      for (let c = 0; c < 13; c++) {
        let hand;
        let type;
        if (r === c) {
          hand = RANKS[r] + RANKS[c];
          type = 'pair';
        } else if (r < c) {
          hand = RANKS[r] + RANKS[c] + 's';
          type = 'suited';
        } else {
          hand = RANKS[c] + RANKS[r] + 'o';
          type = 'offsuit';
        }
        const freq = rfiMap[hand]?.raise || 0;
        row.push({ hand, type, freq, combos: combosFor(hand) });
      }
      grid.push(row);
    }
    return grid;
  }, [rfiMap]);

  const selectedData = useMemo(() => {
    if (!selectedHand) return null;
    const freq = rfiMap[selectedHand]?.raise || 0;
    return {
      hand: selectedHand,
      combos: combosFor(selectedHand),
      freq: Math.round(freq * 100),
      action: freq >= 0.99 ? 'Pure Open (100%)' : freq > 0 ? `Mixed Open (${Math.round(freq * 100)}%)` : 'Fold (0%)',
    };
  }, [selectedHand, rfiMap]);

  const pageTitle = `GTO Preflop Ranges: ${posData.abbrev} Chart`;
  const pageDesc = `Interactive 13x13 GTO Preflop Range Matrix For ${posData.name} (${posData.abbrev}). Explore Exact Opening Frequencies, Combos, And Mixed Strategies In 100BB 6-Max Poker.`;
  const canonicalUrl = `https://smarter.poker/tools/preflop-ranges`;

  const schema = useMemo(() => {
    return hubProductSchema({
      path: '/tools/preflop-ranges',
      name: `Smarter.Poker ${posData.abbrev} GTO Preflop Range Matrix`,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Strategy',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools/poker-odds-calculator'],
        ['Preflop Ranges', '/tools/preflop-ranges'],
      ],
      faqs: [
        {
          question: `What percentage of hands does ${posData.abbrev} open in 6-max 100BB GTO?`,
          answer: `In standard 100BB 6-max cash play, ${posData.abbrev} opens ${stats.percent}% of hands weighted by action frequency, reaching up to ${stats.reach}% of all 1,326 card combinations.`,
        },
        {
          question: 'What do the matrix colors indicate?',
          answer: 'Green represents pure opening hands (100% frequency), teal and blue represent mixed frequency opens, and dark slate cells represent standard folds.',
        },
        {
          question: 'Why do GTO preflop charts employ mixed strategies?',
          answer: 'Mixed strategies prevent opponents from exploiting predictable frequencies and maintain optimal board coverage across varied postflop textures.',
        },
        {
          question: 'How does table position influence preflop opening ranges in poker?',
          answer: 'As position moves closer to the button, fewer opponents remain behind to wake up with premium hands, allowing players to open significantly wider ranges profitably.',
        },
        {
          question: 'Can I export or print this GTO preflop matrix?',
          answer: 'Yes. Use the print or export action to generate a clean, printer-friendly high-contrast 13x13 preflop chart for study and reference.',
        },
      ],
      howTo: {
        name: 'How To Read And Apply GTO Preflop Range Charts',
        description: 'Step-by-step instructions for reading 13x13 poker preflop matrices, interpreting opening frequencies, and executing mixed strategies.',
        steps: [
          {
            name: 'Select Table Position',
            text: 'Choose your table seat position (UTG, HJ, CO, BTN, or SB) to view solver-solved opening frequencies for 100BB 6-max play.',
          },
          {
            name: 'Locate Your Starting Hand In The 13x13 Grid',
            text: 'Find pocket pairs along the diagonal (AA through 22), suited combinations in the upper-right triangle (AKs through 32s), and offsuit hands in the lower-left triangle (AKo through 32o).',
          },
          {
            name: 'Read The Strategy Color Coding',
            text: 'Green indicates pure 100% opening raises, teal and blue denote mixed opening frequencies, and dark cells indicate standard folds.',
          },
          {
            name: 'Execute Mixed Strategies Accurately',
            text: 'Use the second hand of your watch or an RNG number generator (0 to 100) to match the solver percentage when dealt a mixed-frequency hand.',
          },
          {
            name: 'Inspect Combo Counts And Equity Metrics',
            text: 'Click any individual hand cell to reveal exact combo distributions (suited vs offsuit vs pair combos) and strategic rationales.',
          },
        ],
      },
    });
  }, [posData, stats, pageDesc]);

  return (
    <>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
        ogImage={`/api/og/tool-card?tool=ranges&title=${encodeURIComponent(pageTitle)}&subtitle=${encodeURIComponent(`100BB 6-Max Opening Matrix (${stats.percent}% Open Frequency)`)}&statLabel=OPENING+FREQUENCY&statValue=${encodeURIComponent(`${stats.percent}%`)}`}
        markdownUrl="https://smarter.poker/tools/preflop-ranges.md"
      />
      <Head>
        <style
          key="preflop-matrix-print-styles"
          dangerouslySetInnerHTML={{
            __html: `@media print {
              body { background: #FFFFFF !important; color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              .no-print { display: none !important; }
            }`,
          }}
        />
      </Head>

      <div style={{
        minHeight: '100dvh',
        background: '#0B0E14',
        color: '#E6EDF3',
        padding: '24px 16px 64px 16px',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>

          {/* Breadcrumb Header */}
          <div style={{ fontSize: 13, color: '#8B949E', marginBottom: 12 }}>
            <Link href="/hub" style={{ color: '#58A6FF', textDecoration: 'none' }}>Hub</Link> &gt;{' '}
            <Link href="/tools/poker-odds-calculator" style={{ color: '#58A6FF', textDecoration: 'none' }}>Tools</Link> &gt;{' '}
            <span>GTO Preflop Ranges</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
              GTO Preflop Range Matrix: {posData.name} ({posData.abbrev})
            </h1>
            <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={copyRangeSpotSummary}
                aria-label="Copy Range Spot Summary"
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid rgba(57,233,165,0.4)',
                  background: 'rgba(57,233,165,0.12)',
                  color: '#39E9A5',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {hasCopiedRangeSpot ? 'Spot Copied' : 'Copy Spot Summary'}
              </button>
              <button
                type="button"
                onClick={() => { if (typeof window !== 'undefined' && typeof window.print === 'function') window.print(); }}
                aria-label="Print Or Save PDF Preflop Chart"
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid rgba(88,166,255,0.4)',
                  background: 'rgba(88,166,255,0.12)',
                  color: '#58A6FF',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Print / Save PDF Chart
              </button>
            </div>
          </div>
          <p style={{ fontSize: 15, color: '#8B949E', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            {posData.desc} 6-Max No Limit Hold&apos;Em At 100 Big Blinds Depth.
          </p>

          {/* Position Selector Bar */}
          <div style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 8,
            marginBottom: 20,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            {POSITIONS.map((p) => {
              const active = p.id === activePos;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setActivePos(p.id); setSelectedHand(null); }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    border: active ? '1px solid #58A6FF' : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.03)',
                    color: active ? '#58A6FF' : '#C9D1D9',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.abbrev}
                </button>
              );
            })}
          </div>

          {/* Metrics summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase' }}>Frequency Open</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#39E9A5', marginTop: 4 }}>
                {stats.percent}%
              </div>
              <div style={{ fontSize: 12, color: '#6E7681', marginTop: 2 }}>Weighted Action Share</div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase' }}>Combos Touched</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#58A6FF', marginTop: 4 }}>
                {stats.reach}%
              </div>
              <div style={{ fontSize: 12, color: '#6E7681', marginTop: 2 }}>Combos Played &gt; 0%</div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase' }}>Pure Opens</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#F0883E', marginTop: 4 }}>
                {stats.always.length}
              </div>
              <div style={{ fontSize: 12, color: '#6E7681', marginTop: 2 }}>100% Frequency Hands</div>
            </div>
          </div>

          {/* Interactive 13x13 Grid Frame */}
          <div style={{
            background: '#161B22',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: 12,
            marginBottom: 24,
            overflowX: 'auto',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(13, minmax(28px, 1fr))',
              gap: 2,
              minWidth: 400,
            }}>
              {matrixGrid.map((row, rIdx) =>
                row.map((cell) => {
                  const isPure = cell.freq >= 0.99;
                  const isMixed = cell.freq > 0 && cell.freq < 0.99;
                  const isSelected = selectedHand === cell.hand;

                  let bgColor = 'rgba(255,255,255,0.03)';
                  let textColor = '#6E7681';

                  if (isPure) {
                    bgColor = '#1F6FEB';
                    textColor = '#FFFFFF';
                  } else if (isMixed) {
                    bgColor = `rgba(31, 111, 235, ${Math.max(0.2, cell.freq)})`;
                    textColor = '#E6EDF3';
                  }

                  return (
                    <button
                      key={cell.hand}
                      type="button"
                      onClick={() => setSelectedHand(cell.hand)}
                      title={`${cell.hand} (${Math.round(cell.freq * 100)}% Open)`}
                      style={{
                        aspectRatio: '1/1',
                        border: isSelected ? '2px solid #FFFFFF' : '1px solid rgba(0,0,0,0.3)',
                        borderRadius: 3,
                        background: bgColor,
                        color: textColor,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {cell.hand}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Hand Inspector */}
          {selectedData && (
            <div style={{
              background: 'rgba(88,166,255,0.08)',
              border: '1px solid rgba(88,166,255,0.3)',
              borderRadius: 10,
              padding: '14px 18px',
              marginBottom: 24,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', marginRight: 10 }}>
                  {selectedData.hand}
                </span>
                <span style={{ fontSize: 14, color: '#8B949E' }}>
                  ({selectedData.combos} Combos)
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: selectedData.freq > 0 ? '#39E9A5' : '#8B949E' }}>
                Action: {selectedData.action}
              </div>
            </div>
          )}

          {/* Strategy Guide Text Breakdown */}
          <div style={{
            background: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            lineHeight: 1.6,
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px 0', color: '#FFFFFF' }}>
              Strategic Overview For {posData.name}
            </h2>
            <p style={{ margin: '0 0 16px 0', color: '#C9D1D9' }}>
              When Opening From {posData.name} ({posData.abbrev}), The Optimal Strategy Balances Raw Showdown Strength, Blocker Value, And Playability Across Varied Flop Runouts.
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px 0', color: '#58A6FF' }}>
              Always Opened (100% Frequency)
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#8B949E', fontSize: 14 }}>
              {stats.always.join(', ')}
            </p>

            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px 0', color: '#F0883E' }}>
              Mixed Strategy Holdings
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#8B949E', fontSize: 14 }}>
              {stats.mixed.map((m) => `${m.hand} (${m.frequency}%)`).join(', ')}
            </p>
          </div>

          {/* Conversion Micro-CTA Panel */}
          <div className="no-print" style={{
            background: '#161B22',
            border: '1px solid rgba(88,166,255,0.28)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', color: '#FFFFFF' }}>
                Train And Track Your Preflop Game
              </h2>
              <p style={{ fontSize: 14, color: '#8B949E', margin: 0 }}>
                Drill These Exact 100BB Ranges Or Run Multiway Equity Simulations With Zero Account Setup.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Link href="/hub/training" style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: '#1F6FEB',
                color: '#FFFFFF',
                textDecoration: 'none',
              }}>
                Practice Spots Like This In The Free GTO Trainer
              </Link>
              <Link href="/tools/poker-odds-calculator" style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E6EDF3',
                textDecoration: 'none',
              }}>
                Open Poker Odds Calculator
              </Link>
              <Link href="/hub/bankroll-manager" style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E6EDF3',
                textDecoration: 'none',
              }}>
                Track Sessions In Bankroll Manager
              </Link>
            </div>
          </div>

          {/* Frequently Asked Questions */}
          <div style={{
            background: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 24,
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px 0', color: '#FFFFFF' }}>
              Frequently Asked Questions
            </h2>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#E6EDF3', margin: '0 0 6px 0' }}>
                How Were These GTO Opening Ranges Constructed?
              </h3>
              <p style={{ fontSize: 14, color: '#8B949E', margin: 0, lineHeight: 1.5 }}>
                These Charts Are Authored Teaching References Calibrated For 6-Max No-Limit Texas Hold&apos;Em At 100BB Stack Depths. Frequencies Reflect Nash Equilibrium Postflop Playability And Combo Card Removal Effects.
              </p>
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#E6EDF3', margin: '0 0 6px 0' }}>
                Can I Practice These Preflop Ranges Interactively?
              </h3>
              <p style={{ fontSize: 14, color: '#8B949E', margin: 0, lineHeight: 1.5 }}>
                Yes! Head To The <Link href="/hub/preflop-charts" style={{ color: '#58A6FF', textDecoration: 'none' }}>Preflop Charts Lab</Link> To Drill These Ranges With Real-Time Feedback And Grading.
              </p>
            </div>
          </div>

          {/* Related Tools & Comparisons */}
          <div style={{
            marginTop: 24,
            background: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 24,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 14px 0', color: '#FFFFFF' }}>
              Related Poker Strategy Tools And Comparisons
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Link
                href="/compare"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(88, 166, 255, 0.12)',
                  border: '1px solid rgba(88, 166, 255, 0.3)',
                  borderRadius: 6,
                  color: '#58A6FF',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Compare Free Poker Tools Vs. Paid Software
              </Link>
              <Link
                href="/freerolls"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(0, 230, 118, 0.12)',
                  border: '1px solid rgba(0, 230, 118, 0.3)',
                  borderRadius: 6,
                  color: '#00E676',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Play Daily $2,000 Guaranteed Freerolls
              </Link>
              <Link
                href="/tools/poker-odds-calculator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  color: '#E6EDF3',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Poker Odds Calculator
              </Link>
              <Link
                href="/tools/icm-calculator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  color: '#E6EDF3',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Tournament ICM Calculator
              </Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');
  if (isMarkdownRequested) {
    const { renderPreflopRangesMarkdown } = await import('../../../src/lib/seo/markdownIngestion.mjs');
    const position = query?.pos || query?.position || 'UTG';
    const mdContent = renderPreflopRangesMarkdown({ position });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}
