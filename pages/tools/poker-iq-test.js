/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INTERACTIVE 10-QUESTION GTO & LIVE POKER IQ DIAGNOSTIC ASSESSMENT (/tools/poker-iq-test)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Presents 10 curated, multi-domain poker scenarios (Pot Odds & MDF, Position RFI,
 * ICM Bubble Factor, PKO Bounty Conversion, Flop C-Bet Texture, Live TDA Floor Rule,
 * 3-Bet Sizing, SPR Commitment, Combinatorics Blockers, Risk of Ruin), grades on a
 * 100 to 200 Poker IQ Scale, and provides a 1-Click Share Score on X/Reddit/Discord.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { renderPokerIqTestMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const IQ_QUESTIONS = [
  {
    id: 'pot_odds_mdf',
    domain: 'Pot Odds & MDF',
    question: 'Villain Bets $50 Into A $100 Pot On The River (Half-Pot Bet). What Are Your Required Break-Even Calling Equity And Minimum Defense Frequency (MDF)?',
    options: [
      '25.0% Required Calling Equity | 66.7% Minimum Defense Frequency (MDF)',
      '33.3% Required Calling Equity | 50.0% Minimum Defense Frequency (MDF)',
      '20.0% Required Calling Equity | 75.0% Minimum Defense Frequency (MDF)',
    ],
    correctIdx: 0,
    explanation: 'Calling $50 To Win A Final Pot Of $200 Requires 50 / 200 = 25.0% Equity, And MDF Equals 100 / (100 + 50) = 66.7%.',
    toolHref: '/tools/pot-odds-calculator',
    toolLabel: 'Pot Odds & MDF Calculator',
  },
  {
    id: 'position_rfi',
    domain: 'Position RFI',
    question: 'In A Solver-Approved 100BB 6-Max Cash Game, Approximately What Percentage Of All 1,326 Starting Hand Combos Does Under The Gun (UTG) Open Raise First In (RFI)?',
    options: [
      'Approximately 14.9% Of Combos (~198 Combos)',
      'Approximately 28.5% Of Combos (~378 Combos)',
      'Approximately 44.6% Of Combos (~591 Combos)',
    ],
    correctIdx: 0,
    explanation: 'UTG Opens Approximately 14.9% Of Hands In 100BB 6-Max, Whereas Cutoff Opens 28.5% And Button Opens 44.6%.',
    toolHref: '/tools/preflop-ranges',
    toolLabel: '13x13 GTO Preflop Range Matrix',
  },
  {
    id: 'icm_bubble',
    domain: 'ICM Bubble Factor',
    question: 'In An Equal-Prize Satellite Where Your Stack Locks Up A Seat 98% Of The Time By Folding, What Is The Correct Play With Pocket Kings (KK) Facing A Covering Stack All-In?',
    options: [
      'Fold Pocket Kings (KK) Immediately Because Your Satellite Bubble Factor Exceeds 6.5x',
      'Always Call Because Pocket Kings Has 82% Raw Chip Equity Against A Wide Range',
      'Min-Raise To Induce A Fold From The Covering Stack',
    ],
    correctIdx: 0,
    explanation: 'When A Satellite Seat Is 98%+ Locked, Additional Chips Have Near-Zero Dollar Value And Required Calling Equity Exceeds 86%, Making KK A Mandatory Fold.',
    toolHref: '/tools/satellite-calculator',
    toolLabel: 'Satellite Seat-Bubble Calculator',
  },
  {
    id: 'pko_bounty',
    domain: 'PKO Bounty Conversion',
    question: 'In A Standard 50/50 Progressive Knockout (PKO) Tournament With A 10,000 Starting Stack, How Many Tournament Chips Is One Starting Knockout Bounty Worth?',
    options: [
      '3,333 Tournament Chips (33.3% Of A Starting Stack)',
      '1,000 Tournament Chips (10.0% Of A Starting Stack)',
      '5,000 Tournament Chips (50.0% Of A Starting Stack)',
    ],
    correctIdx: 0,
    explanation: 'Under The Standard Bounty Power Factor Formula, One Immediate 25% Buy-In Cash Bounty Equals 33.3% Of A Starting Stack (3,333 Chips).',
    toolHref: '/tools/bounty-calculator',
    toolLabel: 'PKO & Mystery Bounty Calculator',
  },
  {
    id: 'flop_cbet_texture',
    domain: 'Flop C-Bet Texture',
    question: 'As The Button Pre-Flop Raiser Against The Big Blind On A Dry Ace-High Rainbow Flop (A♠ K♥ 7♦), What Is The Primary GTO Continuation Bet Strategy?',
    options: [
      'High-Frequency Small Range Bet (33% Pot) Leveraging Massive Range And Nut Advantage',
      'Check 85% Of Range To Trap With Pocket Aces',
      'Overbet 150% Pot With Your Entire Range',
    ],
    correctIdx: 0,
    explanation: 'On Static Dry High-Card Boards Like A-K-7 Rainbow, The Pre-Flop Raiser Holds Both Range And Nut Advantage And Bets 33% Pot At Very High Frequency.',
    toolHref: '/tools/board-texture-analyzer',
    toolLabel: 'Flop Board Texture Analyzer',
  },
  {
    id: 'tda_floor_rule',
    domain: 'Live TDA Floor Rule',
    question: 'Under Official Poker TDA Rule 46 (One-Chip Rule), What Happens If A Player Silently Tosses A Single $100 Chip Into The Pot Facing A $15 Bet Without Saying Raise?',
    options: [
      'It Is Ruled A Flat Call Of $15 Unless The Player Verbally Declared Raise Before The Chip Crossed The Line',
      'It Is Automatically A $100 Full Raise',
      'It Is A Min-Raise To $30',
    ],
    correctIdx: 0,
    explanation: 'Under The Official TDA One-Chip Rule, Tossing A Single Oversized Chip Facing A Bet With Zero Verbal Declaration Is Always A Call.',
    toolHref: '/rules',
    toolLabel: 'Official TDA Floor Rulings Hub',
  },
  {
    id: 'three_bet_sizing',
    domain: '3-Bet Sizing',
    question: 'In A 100BB Cash Game, Villain Opens To 2.5 BB From Cutoff. How Should Your Out-Of-Position Small Blind 3-Bet Sizing Compare To An In-Position Button 3-Bet?',
    options: [
      'Size Larger Out Of Position (~4.0x Open = 10 BB) Than In Position (~3.0x Open = 7.5 BB)',
      'Size Smaller Out Of Position (~2.0x Open = 5 BB) To Save Chips',
      'Use The Exact Same Min-Click 3-Bet From Every Seat',
    ],
    correctIdx: 0,
    explanation: 'Out Of Position 3-Bets Use A 4.0x To 4.4x Multiplier To Lower Postflop SPR And Deny Positional Equity Realization.',
    toolHref: '/tools/3bet-calculator',
    toolLabel: '3-Bet & 4-Bet Sizing Calculator',
  },
  {
    id: 'spr_commitment',
    domain: 'SPR Commitment',
    question: 'You Enter The Flop With A $100 Pot And $400 Effective Stacks (SPR = 4.0). What Equal Geometric Bet Percentage Per Street On Flop And Turn Puts All Chips In Smoothly In 2 Streets?',
    options: [
      '100.0% Full-Pot Bet On Flop Followed By 100.0% Full-Pot All-In On Turn',
      '33.3% Pot On Flop Followed By 33.3% Pot On Turn',
      '50.0% Pot On Flop Followed By 50.0% Pot On Turn',
    ],
    correctIdx: 0,
    explanation: 'Using s = 0.5 * ((1 + 2 * SPR)^(1/2) - 1), An SPR Of 4.0 Yields s = 0.5 * (sqrt(9) - 1) = 1.00 (100% Pot On Both Streets).',
    toolHref: '/tools/spr-calculator',
    toolLabel: 'SPR & Geometric Bet Sizing Calculator',
  },
  {
    id: 'combinatorics_blockers',
    domain: 'Combinatorics Blockers',
    question: 'Before Any Cards Are Dealt, How Many Total Combinations Do One Unpaired Offsuit Hand (Like AKo), One Suited Hand (Like AKs), And One Pocket Pair (Like AA) Have?',
    options: [
      '12 Offsuit Combos (AKo) | 4 Suited Combos (AKs) | 6 Pocket Pair Combos (AA)',
      '16 Offsuit Combos | 8 Suited Combos | 4 Pocket Pair Combos',
      '6 Offsuit Combos | 6 Suited Combos | 6 Pocket Pair Combos',
    ],
    correctIdx: 0,
    explanation: 'Every Unpaired Hand Has 16 Total Combos Split Into 12 Offsuit And 4 Suited, While Every Pocket Pair Has C(4,2) = 6 Combos.',
    toolHref: '/learn/hands',
    toolLabel: '169 Starting Hands Encyclopedia',
  },
  {
    id: 'risk_of_ruin',
    domain: 'Risk Of Ruin',
    question: 'According To The Brownian Motion Risk Of Ruin Formula RoR = exp(-2 * Winrate * Bankroll / Variance), How Does Doubling Your Standard Deviation Affect Required Bankroll?',
    options: [
      'Doubling Standard Deviation Quadruples Variance (SD^2), Requiring 4x The Bankroll For Identical Risk Of Ruin',
      'Standard Deviation Has Zero Effect On Bankroll Requirements',
      'Doubling Standard Deviation Cuts Required Bankroll In Half',
    ],
    correctIdx: 0,
    explanation: 'Because Variance Equals Standard Deviation Squared (SD^2), High-Variance Formats Like PLO Require Dramatically Deeper Buy-In Cushions.',
    toolHref: '/tools/bankroll-calculator',
    toolLabel: 'Bankroll & Risk Of Ruin Calculator',
  },
];

const IQ_FAQS = [
  {
    question: 'How Is The Smarter.Poker 100 To 200 Poker IQ Score Calculated?',
    answer:
      'Every Player Starts At A Baseline Score Of 100 And Earns +10 IQ Points For Each Correct Answer Across Ten Quantitative Poker Domains: Pot Odds & MDF, Positional RFI, Satellite ICM, PKO Bounties, Flop C-Bet Textures, TDA Floor Rules, 3-Bet Sizing, SPR Geometry, Combinatorics, And Risk Of Ruin.',
  },
  {
    question: 'What Do The Four Poker IQ Diagnostic Tiers Represent?',
    answer:
      '100-120 Represents Recreational Contender, 125-145 Represents Studying Reg, 150-175 Represents Club Crusher, And 180-200 Represents Solver Master.',
  },
  {
    question: 'How Should I Study Any Questions I Missed On The Poker IQ Assessment?',
    answer:
      'Every Question Includes A Direct Link To The Exact Smarter.Poker Interactive Calculator Or Official Reference Hub Covering That Domain So You Can Drill Real Scenarios Immediately.',
  },
];

export default function PokerIqTestPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState(() => IQ_QUESTIONS.map(() => 0));
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.ans && typeof q.ans === 'string') {
      const parsed = q.ans
        .split(',')
        .map((v) => Math.max(0, Math.min(2, Number(v) || 0)));
      if (parsed.length === IQ_QUESTIONS.length) {
        setAnswers(parsed);
      }
    }
  }, [router.isReady, router.query]);

  const diagnosis = useMemo(() => {
    let correctCount = 0;
    const domainResults = IQ_QUESTIONS.map((q, idx) => {
      const isCorrect = answers[idx] === q.correctIdx;
      if (isCorrect) correctCount += 1;
      return {
        ...q,
        chosenIdx: answers[idx],
        isCorrect,
      };
    });

    const iqScore = 100 + correctCount * 10;
    let tierLabel = '100-120 Recreational';
    let tierColor = '#94a3b8';

    if (iqScore >= 180) {
      tierLabel = '180-200 Solver Master';
      tierColor = '#34d399';
    } else if (iqScore >= 150) {
      tierLabel = '150-175 Club Crusher';
      tierColor = '#25c8ff';
    } else if (iqScore >= 125) {
      tierLabel = '125-145 Studying Reg';
      tierColor = '#f2b84b';
    }

    const missedQuestions = domainResults.filter((r) => !r.isCorrect);

    return {
      correctCount,
      iqScore,
      tierLabel,
      tierColor,
      domainResults,
      missedQuestions,
    };
  }, [answers]);

  const handleSelectOption = (qIdx, optIdx) => {
    const next = [...answers];
    next[qIdx] = optIdx;
    setAnswers(next);
  };

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/poker-iq-test?ans=${answers.join(',')}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareScore = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareText = `🧠 My Smarter.Poker Quantitative Poker IQ Score: ${diagnosis.iqScore}/200 (${diagnosis.tierLabel} | ${diagnosis.correctCount}/10 Correct)! Test Your GTO & Live Poker IQ: https://smarter.poker/tools/poker-iq-test`;
    navigator.clipboard.writeText(shareText);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  const canonicalPath = '/tools/poker-iq-test';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Interactive 10-Question GTO & Live Poker IQ Diagnostic Assessment';
  const pageDesc =
    'Test Your Quantitative Poker IQ On A 100 To 200 Scale Across 10 Curated Scenarios Covering Pot Odds, Position RFI, ICM, PKO Bounties, Board Textures, And TDA Rules.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker IQ Diagnostic & GTO Assessment',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker IQ Diagnostic Test', canonicalPath],
      ],
      faqs: IQ_FAQS,
      howTo: {
        name: 'How To Take The 10-Question GTO And Live Poker IQ Assessment',
        description: pageDesc,
        steps: [
          {
            name: 'Answer All 10 Multi-Domain Poker Scenarios',
            text: 'Select Your Answer For Each Question Covering Pot Odds, RFI, ICM, PKO, Flop C-Bets, TDA Rules, 3-Betting, SPR, Combinatorics, And RoR.',
          },
          {
            name: 'Review Your 100 To 200 Poker IQ Score And Diagnostic Tier',
            text: 'See Whether You Grade As Recreational (100-120), Studying Reg (125-145), Club Crusher (150-175), Or Solver Master (180-200).',
          },
          {
            name: 'Drill Any Missed Domains Using Linked Smarter.Poker Solvers',
            text: 'Click The Direct Calculator Link Under Any Missed Question And Share Your Score Card On X, Reddit, Or Discord.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="GTO And Live Poker IQ Diagnostic Test"
        description="Test Your Quantitative Poker IQ On A 100 To 200 Scale Across 10 Curated Scenarios Covering Pot Odds, Position RFI, ICM, PKO Bounties, Board Textures, And TDA Rules."
        canonical="/tools/poker-iq-test"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8' }}>
              <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
              {' / '}
              <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
              {' / '}
              <span>Poker IQ Diagnostic Assessment</span>
            </nav>
            <Link
              href="/search"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#f2b84b',
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
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Interactive 10-Question GTO &amp; Live Poker IQ Diagnostic Assessment
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> Benchmark Your Quantitative Poker Mastery On A <strong>100 To 200 Poker IQ Scale</strong> Across Ten Essential Domains: <strong>Pot Odds &amp; MDF, Positional RFI, Satellite ICM, PKO Bounties, Flop C-Bet Textures, Official TDA Rules, 3-Bet Sizing, SPR Commitment, Combinatorics, And Risk Of Ruin</strong>.
          </p>
        )}

        <section
          aria-label="Interactive Poker IQ Diagnostic Assessment"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: 0 }}>
              Live Poker IQ Scoreboard &amp; 10-Domain Assessment
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={handleCopyScenarioLink}
                style={{
                  padding: '8px 14px',
                  background: copiedLink ? '#059669' : '#25c8ff',
                  color: '#020608',
                  border: 0,
                  borderRadius: '2px',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {copiedLink ? 'Copied Scenario Link!' : 'Copy Shareable Scenario Link'}
              </button>
              <button
                type="button"
                onClick={handleShareScore}
                style={{
                  padding: '8px 14px',
                  background: copiedShare ? '#059669' : '#020608',
                  color: '#f2b84b',
                  border: '1px solid #f2b84b',
                  borderRadius: '2px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copiedShare ? 'Copied Score To Clipboard!' : 'Share Score On X / Reddit / Discord'}
              </button>
            </div>
          </div>

          {/* Live Scoreboard Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: `2px solid ${diagnosis.tierColor}` }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Computed Poker IQ Score
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: diagnosis.tierColor, marginTop: 4 }}>
                {diagnosis.iqScore} / 200 IQ
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                {diagnosis.correctCount} Of 10 Domains Correct
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Diagnostic Skill Tier
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#25c8ff', marginTop: 6 }}>
                {diagnosis.tierLabel}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Scale: 100-120 Recreational | 125-145 Studying Reg | 150-175 Club Crusher | 180-200 Solver Master
              </div>
            </div>
          </div>

          {/* 10 Questions */}
          <div style={{ display: 'grid', gap: 16 }}>
            {diagnosis.domainResults.map((item, qIdx) => (
              <div
                key={item.id}
                style={{
                  background: '#020608',
                  border: item.isCorrect ? '1px solid #1e293b' : '1px solid #f87171',
                  borderRadius: '2px',
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#25c8ff', textTransform: 'uppercase' }}>
                    Question #{qIdx + 1}: {item.domain}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.isCorrect ? '#34d399' : '#f87171' }}>
                    {item.isCorrect ? 'Correct (+10 IQ)' : 'Missed Domain - Review Solver Below'}
                  </span>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0', lineHeight: 1.45 }}>
                  {item.question}
                </h3>

                <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                  {item.options.map((opt, optIdx) => {
                    const selected = item.chosenIdx === optIdx;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleSelectOption(qIdx, optIdx)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          background: selected ? '#101a20' : '#020608',
                          color: selected ? '#25c8ff' : '#cbd5e1',
                          border: selected ? '1px solid #25c8ff' : '1px solid #334155',
                          borderRadius: '2px',
                          fontSize: 13,
                          fontWeight: selected ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                  <strong>Solver Proof:</strong> {item.explanation}{' '}
                  <Link href={item.toolHref} style={{ color: '#f2b84b', fontWeight: 700, textDecoration: 'none' }}>
                    Open {item.toolLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Explore All Smarter.Poker Diagnostic &amp; GTO Study Hubs
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/format-quiz" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Poker Format &amp; 7-Day Study Roadmap Quiz
            </Link>
            <Link href="/learn" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              GTO Strategy Academy
            </Link>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              13x13 GTO Preflop Range Matrix
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={IQ_FAQS} />

            <CitationBacklinkBox
              title="GTO And Live Poker IQ Diagnostic Test"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Quantitative Poker IQ Test"
              badgeValue="100-200 GTO & Live IQ Scale"
              summary="Interactive 10-Question GTO And Live Poker IQ Assessment Grading Players Across Pot Odds, RFI, ICM, PKO, Textures, And TDA Rules."
              slug="poker-iq-test"
            />

            <AiPromptLauncher
              title="GTO And Live Poker IQ Diagnostic Test"
              canonicalUrl={canonicalUrl}
              markdownUrl={`${canonicalUrl}.md`}
            />
          </>
        )}
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
    const md = renderPokerIqTestMarkdown();
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return { props: {} };
}
