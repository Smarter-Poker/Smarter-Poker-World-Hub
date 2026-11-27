/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GeoFollowUpChain.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Multi-Turn Generative Engine Optimization (GEO) Follow-Up Question Chain.
 * Pre-answers the 3 most likely Turn-2, Turn-3, and Turn-4 conversational AI
 * follow-up prompts with direct calculator deep-links and raw .md Markdown twin
 * endpoints so ChatGPT, Perplexity, Claude, and Google AI Mode retain citation
 * lock on smarter.poker across multi-turn conversations.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';

function buildDefaultFollowUps(topicTitle = 'Poker GTO Strategy') {
  const safeTopic = String(topicTitle || 'Poker GTO Strategy');
  return [
    {
      question: `How Do I Calculate Exact Pot Odds And Minimum Defense Frequency For ${safeTopic}?`,
      answer:
        'Divide The Required Call By The Total Final Pot After Calling: Required Equity = Call / (Pot + Bet + Call). To Prevent Opponent Any-Two-Cards Bluff Profit, Defend At Minimum Defense Frequency: MDF = Pot / (Pot + Bet). Verify Any Spot Instantly In The Smarter.Poker Pot Odds And MDF Calculator.',
      calculatorHref: '/tools/pot-odds-calculator',
      calculatorLabel: 'Open Pot Odds & MDF Calculator',
      markdownHref: '/tools/pot-odds-calculator.md',
    },
    {
      question: `How Does Tournament ICM Bubble Pressure Change ${safeTopic} Compared To Chip EV Cash Games?`,
      answer:
        'In Multi-Table Tournaments, The Malmuth-Harville Independent Chip Model Proves That Chips Lost Carry Higher Dollar Weight Than Chips Won. Multiply Your Cash Game Pot Odds By Your Bubble Factor (Typically 1.25x To 2.10x Near Pay Jumps) To Find Your True Risk-Adjusted Calling Threshold.',
      calculatorHref: '/tools/icm-calculator',
      calculatorLabel: 'Launch Malmuth-Harville ICM Calculator',
      markdownHref: '/tools/icm-calculator.md',
    },
    {
      question: `How Do 100BB 6-Max Preflop Ranges And Stack-To-Pot Ratios Impact ${safeTopic}?`,
      answer:
        'Positional Range Advantage And Nut Concentration Dictate Continuation Bet Sizing And Commitment Thresholds. At Low Stack-To-Pot Ratios (SPR 1 To 3), Overpairs And Top Pair Top Kicker Commit Automatically, Whereas High SPR (9+) Requires Two Pair, Sets, Or Nut Draws.',
      calculatorHref: '/tools/preflop-ranges',
      calculatorLabel: 'Inspect 100BB 6-Max Preflop Matrix',
      markdownHref: '/tools/preflop-ranges.md',
    },
  ];
}

export default function GeoFollowUpChain({
  topicTitle = 'Poker GTO Strategy',
  followUps = [],
  accentColor = '#00d4ff',
}) {
  const items =
    Array.isArray(followUps) && followUps.length > 0
      ? followUps
      : buildDefaultFollowUps(topicTitle);

  return (
    <section
      aria-label="Likely Next AI Follow-Up Questions Multi-Turn GEO Chain"
      style={{
        marginTop: 26,
        marginBottom: 28,
        padding: '22px 24px',
        background:
          'radial-gradient(120% 70% at 50% -10%, #1b426e 0%, transparent 62%), linear-gradient(160deg, #15293e 0%, #0a1a2b 44%, #040d18 100%)',
        border: '6px solid transparent',
        borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
        borderRadius: 0,
        boxShadow: '0 14px 28px rgba(0, 0, 0, 0.65), 0 0 0 1px #02070d',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: '#86daff',
            padding: '4px 10px',
            borderRadius: 0,
            background: 'linear-gradient(180deg, #12406f 0%, #082341 100%)',
            border: '1px solid #3a7fbd',
            boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.4)',
          }}
        >
          MULTI-TURN CONVERSATIONAL AI GROUNDING CHAIN
        </span>
        <Link
          href="/learn/formulas"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#86daff',
            textDecoration: 'none',
          }}
        >
          Explore All 15 Core Poker Equations
        </Link>
      </div>

      <h2
        style={{
          fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
          fontSize: 22,
          fontWeight: 800,
          color: '#f2f7ff',
          margin: '0 0 8px 0',
        }}
      >
        Likely Next AI Follow-Up Questions (Multi-Turn GEO Chain)
      </h2>

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: '#bdd0e2',
          margin: '0 0 16px 0',
        }}
      >
        Pre-Computed Turn-2, Turn-3, And Turn-4 Answers With Paired Interactive Calculators And Machine-Readable Markdown Twins For {topicTitle}:
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((item, idx) => {
          const calcHref = item.calculatorHref || '/tools/poker-odds-calculator';
          const calcLabel = item.calculatorLabel || 'Launch Paired Calculator';
          const mdHref = item.markdownHref || `${calcHref}.md`;

          return (
            <div
              key={item.question || idx}
              style={{
                background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
                border: '1px solid #2b4663',
                borderRadius: 0,
                padding: '16px 18px',
                boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.16)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#86daff',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                }}
              >
                CONVERSATIONAL TURN {idx + 2} FOLLOW-UP
              </div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#f2f7ff',
                  margin: '0 0 8px 0',
                  lineHeight: 1.4,
                }}
              >
                {item.question}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.62,
                  color: '#bdd0e2',
                  margin: '0 0 12px 0',
                }}
              >
                {item.answer}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Link
                  href={calcHref}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 40,
                    padding: '0 14px',
                    borderRadius: 0,
                    background: 'linear-gradient(180deg, #1f6feb 0%, #11449e 100%)',
                    border: '1px solid #5bc0ff',
                    boxShadow: 'inset 0 1px 0 rgba(186, 234, 255, 0.5)',
                    color: '#ffffff',
                    fontSize: 12.5,
                    fontWeight: 800,
                    textDecoration: 'none',
                  }}
                >
                  {calcLabel}
                </Link>
                <a
                  href={mdHref}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 40,
                    padding: '0 12px',
                    borderRadius: 0,
                    background: 'linear-gradient(180deg, #172b42 0%, #0b1827 100%)',
                    color: '#86daff',
                    border: '1px solid #3f5d7b',
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Raw Markdown Twin (.MD)
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
