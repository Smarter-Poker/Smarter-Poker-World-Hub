/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MIXED GAME (HORSE / 8-GAME / DEALER'S CHOICE) ROTATION TRACKER & PLACARDS (/tools/mixed-game-placards)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive Live Table Game Tracker (Advance Hand button, Current Game Banner,
 * Next Game Up, Betting Limit Type Fixed-Limit vs Pot-Limit vs No-Limit, Max Raises
 * Rule, Hi-Lo 8-or-Better Qualifier Reminder, direct link to /games/[variant]) +
 * Printable Table Placard Cards for home games and club directors.
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
import { renderMixedGamePlacardsMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const GAME_LIBRARY = {
  FLHE: {
    code: 'H',
    name: 'Limit Texas Hold\'em',
    limitType: 'Fixed-Limit',
    maxRaises: 'Bet + 3 Raises (4-Bet Cap; Uncapped Heads-Up)',
    qualifier: 'High Only (No Low Qualifier)',
    cards: '2 Hole Cards + 5 Community Cards',
    slug: 'texas-holdem',
  },
  O8: {
    code: 'O',
    name: 'Limit Omaha Hi-Lo 8-Or-Better',
    limitType: 'Fixed-Limit',
    maxRaises: 'Bet + 3 Raises (4-Bet Cap)',
    qualifier: '8-Or-Better Qualifier For Low Half (Must Use 2 Hole Cards)',
    cards: '4 Hole Cards (Must Use 2) + 5 Community Cards',
    slug: 'omaha-hi-lo',
  },
  RAZZ: {
    code: 'R',
    name: 'Razz (7-Card Stud Low)',
    limitType: 'Fixed-Limit (High Card Bring-In)',
    maxRaises: 'Bet + 3 Raises (4-Bet Cap)',
    qualifier: 'Ace-To-Five Lowball (No 8-Or-Better Qualifier; Aces Play Low)',
    cards: '3 Downcards + 4 Upcards (7-Card Stud)',
    slug: 'razz',
  },
  STUD: {
    code: 'S',
    name: '7-Card Stud High',
    limitType: 'Fixed-Limit (Low Card Bring-In)',
    maxRaises: 'Bet + 3 Raises (4-Bet Cap; Big Bet Option On 4th Street Pair)',
    qualifier: 'High Only (Standard 52-Card High Rankings)',
    cards: '3 Downcards + 4 Upcards (7-Card Stud)',
    slug: 'seven-card-stud',
  },
  STUD8: {
    code: 'E',
    name: '7-Card Stud Hi-Lo 8-Or-Better',
    limitType: 'Fixed-Limit (Low Card Bring-In)',
    maxRaises: 'Bet + 3 Raises (4-Bet Cap)',
    qualifier: '8-Or-Better Qualifier For Low Half (5 Unpaired Cards 8 Or Lower)',
    cards: '3 Downcards + 4 Upcards (7-Card Stud)',
    slug: 'stud-hi-lo',
  },
  TD27: {
    code: 'T',
    name: '2-7 Triple Draw Lowball',
    limitType: 'Fixed-Limit',
    maxRaises: 'Bet + 3 Raises Across All 4 Betting Rounds',
    qualifier: 'Deuce-To-Seven Kansas City Lowball (Aces High; Straights/Flushes Count Against Low)',
    cards: '5 Draw Cards With 3 Draw Opportunities (7-5-4-3-2 Unsuited Nuts)',
    slug: '2-7-triple-draw',
  },
  NLHE: {
    code: 'N',
    name: 'No-Limit Texas Hold\'em',
    limitType: 'No-Limit',
    maxRaises: 'Uncapped All-In Betting (Big Blind Structure)',
    qualifier: 'High Only (No Low Qualifier)',
    cards: '2 Hole Cards + 5 Community Cards',
    slug: 'texas-holdem',
  },
  PLO4: {
    code: 'P',
    name: 'Pot-Limit Omaha (PLO4)',
    limitType: 'Pot-Limit (3x Last Bet + Trail + Pot)',
    maxRaises: 'Uncapped Up To Effective Stack',
    qualifier: 'High Only (Must Use Exactly 2 Hole Cards And 3 Board Cards)',
    cards: '4 Hole Cards + 5 Community Cards',
    slug: 'pot-limit-omaha',
  },
  BADUGI: {
    code: 'B',
    name: 'Fixed-Limit Badugi',
    limitType: 'Fixed-Limit',
    maxRaises: 'Bet + 3 Raises Across 3 Draws',
    qualifier: '4-Card Rainbow Unpaired Low (A-2-3-4 Of Four Different Suits Is Nuts)',
    cards: '4 Draw Cards With 3 Draw Opportunities',
    slug: 'badugi',
  },
  NL27: {
    code: 'D',
    name: 'No-Limit 2-7 Single Draw',
    limitType: 'No-Limit',
    maxRaises: 'Uncapped All-In Pre-Draw And Post-Draw',
    qualifier: 'Deuce-To-Seven Lowball (7-5-4-3-2 Unsuited Nuts; Aces High)',
    cards: '5 Draw Cards With 1 Draw Opportunity',
    slug: 'no-limit-2-7-single-draw',
  },
  BOMBPOT: {
    code: 'BP',
    name: 'Double-Board PLO Bomb Pot',
    limitType: 'Pot-Limit (Pre-Flop Antes Only)',
    maxRaises: 'Uncapped Up To Stack Starting On Flop',
    qualifier: '50% Pot Awarded To Each Board High (Must Use 2 Hole Cards Per Board)',
    cards: '4 Or 5 Hole Cards + Two 5-Card Boards',
    slug: 'double-board-bomb-pot',
  },
};

const ROTATION_PRESETS = [
  {
    id: 'HORSE_5',
    label: 'HORSE 5-Game',
    sequence: ['FLHE', 'O8', 'RAZZ', 'STUD', 'STUD8'],
  },
  {
    id: 'EIGHT_GAME',
    label: '8-Game Mix',
    sequence: ['TD27', 'FLHE', 'O8', 'RAZZ', 'STUD', 'STUD8', 'NLHE', 'PLO4'],
  },
  {
    id: 'TEN_GAME',
    label: '10-Game Mix',
    sequence: ['TD27', 'FLHE', 'O8', 'RAZZ', 'STUD', 'STUD8', 'NLHE', 'PLO4', 'BADUGI', 'NL27'],
  },
  {
    id: 'BOMB_POT_ROTATION',
    label: 'Double-Board Bomb Pot Rotation',
    sequence: ['NLHE', 'PLO4', 'BOMBPOT'],
  },
  {
    id: 'DEALERS_CHOICE',
    label: 'Dealer\'s Choice Custom',
    sequence: ['NLHE', 'PLO4', 'O8', 'TD27', 'BADUGI', 'BOMBPOT'],
  },
];

const MIXED_GAME_FAQS = [
  {
    question: 'In What Order Are Games Played In An Official 8-Game Mix Rotation?',
    answer:
      'Official WSOP And TDA 8-Game Mix Follows The Acronym T-H-O-R-S-E-N-P: 2-7 Triple Draw (T), Limit Holdem (H), Limit Omaha Hi-Lo 8-Or-Better (O), Razz (R), 7-Card Stud High (S), 7-Card Stud Hi-Lo 8-Or-Better (E), No-Limit Holdem (N), And Pot-Limit Omaha (P).',
  },
  {
    question: 'How Often Does The Game Switch In Live Mixed Game Cash And Tournaments?',
    answer:
      'In Standard Live Mixed Games, The Variant Rotates Either Every 6 Or 8 Hands (Tracked By A Dedicated Game Counter Chip On The Dealer Button) Or At The End Of Every Timed 20-Minute Level.',
  },
  {
    question: 'Why Do Fixed-Limit Games Use Higher Blinds Than No-Limit And Pot-Limit Games In 8-Game?',
    answer:
      'Because Fixed-Limit Betting Caps Each Street At Four Bets While No-Limit And Pot-Limit Allow Geometric Stack-Offs, Official 8-Game Structures Run Fixed-Limit Games At Roughly 2x To 2.5x The Big Blind Size Of The No-Limit And Pot-Limit Rounds To Keep Average Pot Sizes Balanced.',
  },
];

export default function MixedGamePlacardsPage() {
  const router = useRouter();
  const [presetId, setPresetId] = useState('EIGHT_GAME');
  const [orbitMode, setOrbitMode] = useState('8');
  const [handCounter, setHandCounter] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);

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
    if (q.preset && ROTATION_PRESETS.some((p) => p.id === q.preset)) setPresetId(String(q.preset));
    if (q.orbit && ['6', '8', 'TIMED_20'].includes(String(q.orbit))) setOrbitMode(String(q.orbit));
    if (q.hand !== undefined) setHandCounter(Math.max(1, Number(q.hand) || 1));
  }, [router.isReady, router.query]);

  const tracker = useMemo(() => {
    const presetObj = ROTATION_PRESETS.find((p) => p.id === presetId) || ROTATION_PRESETS[1];
    const handsPerSwitch = orbitMode === '6' ? 6 : 8;
    const safeHand = Math.max(1, Math.round(Number(handCounter) || 1));
    const seqLen = presetObj.sequence.length;
    const gameIdx = Math.floor((safeHand - 1) / handsPerSwitch) % seqLen;
    const handWithinGame = ((safeHand - 1) % handsPerSwitch) + 1;
    const nextGameIdx = (gameIdx + 1) % seqLen;

    const currentGame = GAME_LIBRARY[presetObj.sequence[gameIdx]] || GAME_LIBRARY.FLHE;
    const nextGame = GAME_LIBRARY[presetObj.sequence[nextGameIdx]] || GAME_LIBRARY.O8;
    const placardList = presetObj.sequence.map((key, idx) => ({
      order: idx + 1,
      ...GAME_LIBRARY[key],
      isActive: idx === gameIdx,
    }));

    return {
      presetObj,
      handsPerSwitch,
      safeHand,
      handWithinGame,
      currentGame,
      nextGame,
      placardList,
    };
  }, [presetId, orbitMode, handCounter]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/mixed-game-placards?preset=${presetId}&orbit=${orbitMode}&hand=${tracker.safeHand}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/mixed-game-placards';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Mixed Game (HORSE / 8-Game / Dealer\'s Choice) Rotation Tracker & Printable Placards';
  const pageDesc =
    'Track Live HORSE, 8-Game, 10-Game, And Dealer Choice Mixed Game Rotations With Orbit Hand Counters, Hi-Lo 8-Or-Better Qualifier Reminders, And Printable Table Placards.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Mixed Game Rotation Tracker & Placards',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Mixed Game Rotation Tracker & Placards', canonicalPath],
      ],
      faqs: MIXED_GAME_FAQS,
      howTo: {
        name: 'How To Track A Mixed Game Rotation And Print Table Placards',
        description: pageDesc,
        steps: [
          {
            name: 'Select Your Mixed Game Rotation Preset And Orbit Length',
            text: 'Choose HORSE 5-Game, 8-Game Mix, 10-Game Mix, Bomb Pot Rotation, Or Dealer Choice And Pick 6-Hand, 8-Hand, Or 20-Min Switching.',
          },
          {
            name: 'Advance The Live Hand Counter As Each Hand Completes',
            text: 'Click Advance Hand To Automatically Rotate Between Fixed-Limit, Pot-Limit, And No-Limit Variants.',
          },
          {
            name: 'Print Table Placard Cards For Your Home Game Or Club',
            text: 'Use The Printable Placard Grid So Players Always Know The Active Variant, Max Raises Rule, And Hi-Lo Qualifier.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Mixed Game (HORSE / 8-Game / Dealer's Choice) Rotation Tracker & Printable Placards"
        description="Track Live HORSE, 8-Game, 10-Game, And Dealer Choice Mixed Game Rotations With Orbit Hand Counters, Hi-Lo 8-Or-Better Qualifier Reminders, And Printable Table Placards."
        canonical="/tools/mixed-game-placards"
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
              <span>Mixed Game Rotation Tracker &amp; Placards</span>
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
          Mixed Game (HORSE / 8-Game / Dealer Choice) Rotation Tracker &amp; Printable Placards
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> Official Mixed Game Rotations Like <strong>HORSE (5-Game)</strong> And <strong>8-Game Mix (T-H-O-R-S-E-N-P)</strong> Switch Variants Every <strong>6 Or 8 Dealt Hands</strong> (Or Every 20-Minute Level), Requiring Clear Table Placards That Display The Active Betting Limit (<strong>Fixed-Limit, Pot-Limit, Or No-Limit</strong>) And Any <strong>8-Or-Better Low Qualifier</strong>.
          </p>
        )}

        <section
          aria-label="Interactive Mixed Game Rotation Tracker"
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
              Interactive Live Table Mixed Game Tracker
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
                onClick={() => typeof window !== 'undefined' && window.print()}
                style={{
                  padding: '8px 14px',
                  background: '#020608',
                  color: '#f2b84b',
                  border: '1px solid #f2b84b',
                  borderRadius: '2px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Print Table Placard Cards
              </button>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Rotation Preset
                <select
                  value={presetId}
                  onChange={(e) => {
                    setPresetId(e.target.value);
                    setHandCounter(1);
                  }}
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
                  {ROTATION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hands Per Game Orbit
                <select
                  value={orbitMode}
                  onChange={(e) => setOrbitMode(e.target.value)}
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
                  <option value="6">6 Hands Per Game</option>
                  <option value="8">8 Hands Per Game</option>
                  <option value="TIMED_20">Timed 20-Min Level (8-Hand Counter)</option>
                </select>
              </label>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Current Hand Counter (#{tracker.safeHand})
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setHandCounter((c) => Math.max(1, Number(c) + 1))}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: '#34d399',
                    color: '#020608',
                    border: 0,
                    borderRadius: '2px',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Advance Hand (+1)
                </button>
                <button
                  type="button"
                  onClick={() => setHandCounter(1)}
                  style={{
                    padding: '10px 12px',
                    background: '#020608',
                    color: '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: '2px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Active Game Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 18, borderRadius: '2px', border: '2px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Current Active Game (Hand {tracker.handWithinGame} Of {tracker.handsPerSwitch})
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#25c8ff', marginTop: 6 }}>
                [{tracker.currentGame.code}] {tracker.currentGame.name}
              </div>
              <div style={{ fontSize: 13, color: '#34d399', fontWeight: 700, marginTop: 4 }}>
                Betting Structure: {tracker.currentGame.limitType}
              </div>
              <div style={{ marginTop: 8 }}>
                <Link
                  href={`/games/${tracker.currentGame.slug}`}
                  style={{ fontSize: 12, fontWeight: 700, color: '#f2b84b', textDecoration: 'none' }}
                >
                  Open Official {tracker.currentGame.name} Rules Guide
                </Link>
              </div>
            </div>

            <div style={{ background: '#020608', padding: 18, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Max Raises &amp; Hi-Lo Qualifier Reminder
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginTop: 6 }}>
                {tracker.currentGame.maxRaises}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                Qualifier: {tracker.currentGame.qualifier}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 18, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Next Game On Deck
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f2b84b', marginTop: 6 }}>
                [{tracker.nextGame.code}] {tracker.nextGame.name}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                Switches In {tracker.handsPerSwitch - tracker.handWithinGame + 1} Hands ({tracker.nextGame.limitType})
              </div>
            </div>
          </div>
        </section>

        {/* Printable Table Placard Cards */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Printable Table Placard Cards ({tracker.presetObj.label})
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
            {tracker.placardList.map((card) => (
              <div
                key={`${card.order}-${card.code}`}
                style={{
                  background: '#101a20',
                  border: card.isActive ? '2px solid #25c8ff' : '1px solid #1e293b',
                  borderRadius: '2px',
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#f2b84b', textTransform: 'uppercase' }}>
                    Placard #{card.order} ({card.limitType})
                  </span>
                  {card.isActive && (
                    <span style={{ fontSize: 11, fontWeight: 800, background: '#25c8ff', color: '#020608', padding: '2px 8px', borderRadius: '2px' }}>
                      Active Now
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', margin: '0 0 6px 0' }}>
                  [{card.code}] {card.name}
                </h3>
                <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>
                  <strong>Dealing:</strong> {card.cards}
                </div>
                <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>
                  <strong>Max Raises:</strong> {card.maxRaises}
                </div>
                <div style={{ fontSize: 13, color: '#34d399', marginBottom: 10 }}>
                  <strong>Qualifier:</strong> {card.qualifier}
                </div>
                <Link
                  href={`/games/${card.slug}`}
                  style={{ fontSize: 12, fontWeight: 700, color: '#25c8ff', textDecoration: 'none' }}
                >
                  Read Complete {card.name} Guide
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Mixed Game &amp; Home Game Director Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/games" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              15 Poker Variants &amp; Mixed Games Encyclopedia
            </Link>
            <Link href="/tools/home-game-kit" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Home Game Chip Set &amp; Setup Calculator
            </Link>
            <Link href="/tools/blind-structure-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament Blind Structure Generator
            </Link>
            <Link href="/tools/plo-bet-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              PLO Max Bet &amp; Bomb Pot Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={MIXED_GAME_FAQS} />

            <CitationBacklinkBox
              title="Mixed Game (HORSE / 8-Game / Dealer's Choice) Rotation Tracker & Printable Placards"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Mixed Game Orbit Tracker"
              badgeValue="HORSE, 8-Game & Placards"
              summary="Interactive Mixed Game Rotation Tracker And Printable Table Placards For HORSE, 8-Game, 10-Game, And Dealer Choice."
              slug="mixed-game-placards"
            />

            <AiPromptLauncher
              title="Mixed Game (HORSE / 8-Game / Dealer's Choice) Rotation Tracker & Printable Placards"
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
    const md = renderMixedGamePlacardsMarkdown({
      preset: query?.preset,
      handsPerGame: query?.orbit,
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
