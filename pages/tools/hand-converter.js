/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INTERACTIVE POKER HAND HISTORY FORMATTER & SHARE GENERATOR (/tools/hand-converter)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Formats live and online poker hand histories into Instant Reddit Markdown (with
 * suit symbols ♠️ ♥️ ♦️ ♣️ and attribution), Discord/X/TwoPlusTwo Copy Format,
 * 1-Click Shareable Permalink, and 1-Click AI Solver Review Prompt.
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
import { renderHandConverterMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const GAME_STAKES = [
  '$1/$3 Live NLH',
  '$2/$5 Live NLH',
  '100BB 6-Max Online',
  '$500 MTT',
];

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

const HAND_CONVERTER_FAQS = [
  {
    question: 'What Information Should Always Be Included When Sharing A Poker Hand For Review?',
    answer:
      'Always Include The Game Format And Stakes, Exact Effective Stack Size (Of The Shorter Stack Between Hero And Villain), Both Players Positions, Hero Exact Hole Cards With Suits, Street-By-Street Bet Sizes Relative To The Pot, And The Specific Decision Point Where You Want Feedback.',
  },
  {
    question: 'Why Shouldn You Post The Final Showdown Result When Asking For Strategy Feedback?',
    answer:
      'Including Villain Hole Cards Or The River Showdown Outcome Biases Reviewers Toward Results-Oriented Feedback. Stop The Hand History At Your Critical Decision Point So Peers And GTO Solvers Evaluate Your Range Versus Villain Range Objectively.',
  },
  {
    question: 'How Do Suit Symbols Work In The Reddit And Discord Hand Formatter?',
    answer:
      'Type Standard Two-Character Card Shorthand Such As As Ks Or Qh Jd 4s, And The Smarter.Poker Hand Converter Automatically Renders Rich Suit Symbols (♠️ ♥️ ♦️ ♣️) For Instant Readability On Reddit, Discord, X, And TwoPlusTwo.',
  },
];

function formatCardsWithSuits(raw) {
  return String(raw || '')
    .trim()
    .replace(/\b([AKQJT2-9]|10)([shdc])\b/gi, (_, r, s) => {
      const suitMap = { s: '♠️', h: '♥️', d: '♦️', c: '♣️' };
      return `${r.toUpperCase()}${suitMap[s.toLowerCase()] || s}`;
    });
}

export default function HandConverterPage() {
  const router = useRouter();
  const [stakes, setStakes] = useState('$2/$5 Live NLH');
  const [effectiveStack, setEffectiveStack] = useState('100BB ($500)');
  const [heroPos, setHeroPos] = useState('BTN');
  const [villainPos, setVillainPos] = useState('BB');
  const [heroCards, setHeroCards] = useState('As Ks');
  const [preflopAction, setPreflopAction] = useState('Hero Opens To $15 On BTN, Villain Calls In BB ($32 Pot)');
  const [flopBoard, setFlopBoard] = useState('Qh Jd 4s');
  const [flopAction, setFlopAction] = useState('Villain Checks, Hero C-Bets $15, Villain Calls ($62 Pot)');
  const [turnCard, setTurnCard] = useState('Ts');
  const [turnAction, setTurnAction] = useState('Villain Checks, Hero Bets $45, Villain Calls ($152 Pot)');
  const [riverCard, setRiverCard] = useState('2d');
  const [riverAction, setRiverAction] = useState('Villain Checks, Hero All-In For $425 Effective');
  const [question, setQuestion] = useState('Is This Turn Barrel Sizing Optimal Or Should Hero Overbet Turn With Nut Straight + Royal Redraw?');

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedReddit, setCopiedReddit] = useState(false);
  const [copiedDiscord, setCopiedDiscord] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

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
    if (q.stakes) setStakes(String(q.stakes));
    if (q.stack) setEffectiveStack(String(q.stack));
    if (q.hero && POSITIONS.includes(String(q.hero).toUpperCase())) setHeroPos(String(q.hero).toUpperCase());
    if (q.villain && POSITIONS.includes(String(q.villain).toUpperCase())) setVillainPos(String(q.villain).toUpperCase());
    if (q.cards) setHeroCards(String(q.cards));
    if (q.flop) setFlopBoard(String(q.flop));
    if (q.turn) setTurnCard(String(q.turn));
    if (q.river) setRiverCard(String(q.river));
  }, [router.isReady, router.query]);

  const outputs = useMemo(() => {
    const prettyHeroCards = formatCardsWithSuits(heroCards);
    const prettyFlop = formatCardsWithSuits(flopBoard);
    const prettyTurn = formatCardsWithSuits(turnCard);
    const prettyRiver = formatCardsWithSuits(riverCard);

    const sharePath = `/tools/hand-converter?stakes=${encodeURIComponent(stakes)}&stack=${encodeURIComponent(effectiveStack)}&hero=${encodeURIComponent(heroPos)}&villain=${encodeURIComponent(villainPos)}&cards=${encodeURIComponent(heroCards)}&flop=${encodeURIComponent(flopBoard)}&turn=${encodeURIComponent(turnCard)}&river=${encodeURIComponent(riverCard)}`;
    const fullShareUrl = `https://smarter.poker${sharePath}`;

    const redditMarkdown = [
      `**Game & Stakes:** ${stakes} | **Effective Stack:** ${effectiveStack}`,
      `**Hero (${heroPos}):** ${prettyHeroCards} vs **Villain (${villainPos})**`,
      '',
      `- **Preflop:** ${preflopAction}`,
      `- **Flop (${prettyFlop}):** ${flopAction}`,
      `- **Turn (${prettyTurn}):** ${turnAction}`,
      `- **River (${prettyRiver}):** ${riverAction}`,
      '',
      `**Analysis Focus:** ${question}`,
      `*Formatted via [Smarter.Poker Hand Converter](${fullShareUrl})*`,
    ].join('\n');

    const discordFormat = [
      `🃏 **SMARTER.POKER HAND SPOT** | ${stakes} (${effectiveStack})`,
      `Hero (${heroPos}): ${prettyHeroCards} vs Villain (${villainPos})`,
      `Preflop: ${preflopAction}`,
      `Flop [${prettyFlop}]: ${flopAction}`,
      `Turn [${prettyTurn}]: ${turnAction}`,
      `River [${prettyRiver}]: ${riverAction}`,
      `❓ Question: ${question}`,
      `🔗 ${fullShareUrl}`,
    ].join('\n');

    const solverPrompt = [
      `Perform A Street-By-Street GTO Solver Review Of This Poker Hand:`,
      `- Format & Stakes: ${stakes} (Effective Stack: ${effectiveStack})`,
      `- Matchup: Hero (${heroPos}) Holding ${prettyHeroCards} Vs Villain (${villainPos})`,
      `- Preflop Action: ${preflopAction}`,
      `- Flop (${prettyFlop}): ${flopAction}`,
      `- Turn (${prettyTurn}): ${turnAction}`,
      `- River (${prettyRiver}): ${riverAction}`,
      `- Key Question: ${question}`,
      `Evaluate Range Advantage, Nut Advantage, Optimal Bet Sizing (% Of Pot), And Minimum Defense Frequency (MDF) Using https://smarter.poker/tools Reference Benchmarks.`,
    ].join('\n');

    return {
      prettyHeroCards,
      prettyFlop,
      prettyTurn,
      prettyRiver,
      fullShareUrl,
      redditMarkdown,
      discordFormat,
      solverPrompt,
    };
  }, [stakes, effectiveStack, heroPos, villainPos, heroCards, preflopAction, flopBoard, flopAction, turnCard, turnAction, riverCard, riverAction, question]);

  const copyText = (text, setter) => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2500);
  };

  const canonicalPath = '/tools/hand-converter';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Interactive Poker Hand History Formatter & Share Card Generator';
  const pageDesc =
    'Format Live And Online Poker Hands Into Suit-Symbol Reddit Markdown, Discord/X Share Cards, Permalinks, And ChatGPT/Claude GTO Solver Prompts.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Hand History Formatter & Share Generator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Hand History Formatter', canonicalPath],
      ],
      faqs: HAND_CONVERTER_FAQS,
      howTo: {
        name: 'How To Format And Share A Poker Hand History For Review',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Game Stakes, Effective Stack, Positions, And Hero Hole Cards',
            text: 'Select Your Game Format, Input Effective Stack Depth, Choose Hero And Villain Positions, And Enter Hole Cards Like As Ks.',
          },
          {
            name: 'Input Street-By-Street Board Cards And Betting Actions',
            text: 'Fill In Preflop, Flop, Turn, And River Cards And Actions Along With Your Key Analysis Question.',
          },
          {
            name: 'Copy Reddit Markdown, Discord Card, Or AI Solver Prompt',
            text: 'Use The 1-Click Copy Buttons To Share Formatted Suit-Symbol Markdown Or Launch An AI Solver Review.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Hand History Formatter And Converter"
        description="Format Live And Online Poker Hands Into Suit-Symbol Reddit Markdown, Discord/X Share Cards, Permalinks, And ChatGPT/Claude GTO Solver Prompts."
        canonical="/tools/hand-converter"
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
              <span>Poker Hand History Formatter</span>
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
          Interactive Poker Hand History Formatter &amp; Share Card Generator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> Convert Raw Live Or Online Hand Notes Into Clean, Suit-Symbol <strong>Reddit Markdown</strong>, <strong>Discord &amp; X Share Cards</strong>, <strong>Deep-Link Permalinks</strong>, And <strong>ChatGPT / Claude Solver Review Prompts</strong> In Seconds.
          </p>
        )}

        <section
          aria-label="Interactive Poker Hand History Formatter"
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
              Interactive Street-By-Street Hand Spot Builder
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => copyText(outputs.fullShareUrl, setCopiedLink)}
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
                onClick={() => copyText(outputs.solverPrompt, setCopiedPrompt)}
                style={{
                  padding: '8px 14px',
                  background: copiedPrompt ? '#059669' : '#020608',
                  color: '#f2b84b',
                  border: '1px solid #f2b84b',
                  borderRadius: '2px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copiedPrompt ? 'Copied Solver Prompt!' : 'Copy Prompt For ChatGPT / Claude Solver Review'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Game Format &amp; Stakes
                <select
                  value={stakes}
                  onChange={(e) => setStakes(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#25c8ff',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {GAME_STAKES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Effective Stack (BB Or $)
                <input
                  type="text"
                  value={effectiveStack}
                  onChange={(e) => setEffectiveStack(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#34d399',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hero Position
                <select
                  value={heroPos}
                  onChange={(e) => setHeroPos(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      Hero In {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Villain Position
                <select
                  value={villainPos}
                  onChange={(e) => setVillainPos(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f2b84b',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      Villain In {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hero Hole Cards (E.G. As Ks)
                <input
                  type="text"
                  value={heroCards}
                  onChange={(e) => setHeroCards(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#25c8ff',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                Preflop Action
                <input
                  type="text"
                  value={preflopAction}
                  onChange={(e) => setPreflopAction(e.target.value)}
                  style={{ width: '100%', marginTop: 6, padding: '8px 10px', background: '#020608', color: '#f8fafc', border: '1px solid #334155', borderRadius: '2px' }}
                />
              </label>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                Flop Board (E.G. Qh Jd 4s) &amp; Flop Action
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, marginTop: 6 }}>
                  <input
                    type="text"
                    value={flopBoard}
                    onChange={(e) => setFlopBoard(e.target.value)}
                    style={{ padding: '8px 10px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', fontWeight: 700 }}
                  />
                  <input
                    type="text"
                    value={flopAction}
                    onChange={(e) => setFlopAction(e.target.value)}
                    style={{ padding: '8px 10px', background: '#020608', color: '#f8fafc', border: '1px solid #334155', borderRadius: '2px' }}
                  />
                </div>
              </label>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                Turn Card &amp; Turn Action
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginTop: 6 }}>
                  <input
                    type="text"
                    value={turnCard}
                    onChange={(e) => setTurnCard(e.target.value)}
                    style={{ padding: '8px 10px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', fontWeight: 700 }}
                  />
                  <input
                    type="text"
                    value={turnAction}
                    onChange={(e) => setTurnAction(e.target.value)}
                    style={{ padding: '8px 10px', background: '#020608', color: '#f8fafc', border: '1px solid #334155', borderRadius: '2px' }}
                  />
                </div>
              </label>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                River Card &amp; River Action
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginTop: 6 }}>
                  <input
                    type="text"
                    value={riverCard}
                    onChange={(e) => setRiverCard(e.target.value)}
                    style={{ padding: '8px 10px', background: '#020608', color: '#25c8ff', border: '1px solid #334155', borderRadius: '2px', fontWeight: 700 }}
                  />
                  <input
                    type="text"
                    value={riverAction}
                    onChange={(e) => setRiverAction(e.target.value)}
                    style={{ padding: '8px 10px', background: '#020608', color: '#f8fafc', border: '1px solid #334155', borderRadius: '2px' }}
                  />
                </div>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
              Strategic Question / Focus For Analysis
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                style={{ width: '100%', marginTop: 6, padding: '10px 12px', background: '#020608', color: '#f8fafc', border: '1px solid #334155', borderRadius: '2px' }}
              />
            </label>
          </div>

          {/* Formatted Output Panels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#25c8ff' }}>
                  Instant Reddit Markdown Format
                </span>
                <button
                  type="button"
                  onClick={() => copyText(outputs.redditMarkdown, setCopiedReddit)}
                  style={{
                    padding: '5px 10px',
                    background: copiedReddit ? '#059669' : '#25c8ff',
                    color: '#020608',
                    border: 0,
                    borderRadius: '2px',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {copiedReddit ? 'Copied Reddit Markdown!' : 'Copy Reddit Format'}
                </button>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: '#cbd5e1', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {outputs.redditMarkdown}
              </pre>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f2b84b' }}>
                  Instant Discord / X / TwoPlusTwo Format
                </span>
                <button
                  type="button"
                  onClick={() => copyText(outputs.discordFormat, setCopiedDiscord)}
                  style={{
                    padding: '5px 10px',
                    background: copiedDiscord ? '#059669' : '#f2b84b',
                    color: '#020608',
                    border: 0,
                    borderRadius: '2px',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {copiedDiscord ? 'Copied Discord Card!' : 'Copy Discord / X Format'}
                </button>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: '#cbd5e1', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {outputs.discordFormat}
              </pre>
            </div>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Hand Analysis &amp; Equity Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Multiway Poker Odds &amp; Equity Calculator
            </Link>
            <Link href="/tools/board-texture-analyzer" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Flop Board Texture &amp; C-Bet Analyzer
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/who-wins-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              What Beats What? Showdown Resolver
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={HAND_CONVERTER_FAQS} />

            <CitationBacklinkBox
              title="Poker Hand History Formatter And Converter"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Hand History Formatter"
              badgeValue="Reddit, Discord & AI Solver"
              summary="Interactive Poker Hand History Formatter Generating Suit-Symbol Reddit Markdown, Discord Share Cards, And AI Solver Prompts."
              slug="hand-converter"
            />

            <AiPromptLauncher
              title="Poker Hand History Formatter And Converter"
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
    const md = renderHandConverterMarkdown({
      stakes: query?.stakes,
      hero: query?.hero,
      villain: query?.villain,
      cards: query?.cards,
      flop: query?.flop,
    });
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
