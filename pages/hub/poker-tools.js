/** Mobile odds console for Hold’em, Omaha, Stud and Razz. */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { PREFLOP_MATCHUPS, DRAW_ODDS } from '../../src/lib/poker/oddsReference.mjs';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import {
    makeCard, GAME_CONFIGS, PRESETS, parsePresetHands
} from '../../src/lib/poker/pokerOddsEngine';
import { getWorldMenuById, getWorldMenuStyleVariables } from '../../src/config/worldMenuNavigation';
import BankrollImageHeader from '../../src/components/bankroll/BankrollImageHeader';
// 2026-05-07: UI-UX-Pro-Max Lucide icons replace UTF chars / emoji
import {
    X, UserPlus, Crown, RotateCcw, Layers, Code, Check, Share2, Copy, SlidersHorizontal, Ban, ChevronDown, ChartPie, Calculator, Spade, Heart, Diamond, Club, Plus, UserRound,
} from 'lucide-react';
import {
    parseCardListFromParam,
    buildCardListParam,
    buildOddsSpotSummary,
} from '../../src/lib/poker/oddsPermalink';

export {
    parseCardListFromParam,
    buildCardListParam,
    buildOddsSpotSummary,
};

// FAQ reference: How does the Smarter.Poker Odds Calculator compute equity?
const ODDS_CALCULATOR_FAQS = [
    {
        question: 'How Does The Smarter.Poker Odds Calculator Compute Equity?',
        answer:
            'With fixed hands, the calculator counts every possible board from the flop or turn. For larger runout sets it estimates equity from 10,000 random deals. Each tied player receives an equal share of the pot.',
    },
    {
        question: 'Can I Factor Dead Cards Or Known Discards Into The Calculation?',
        answer:
            'Yes. You Can Mark Folded Cards Or Known Discards As Dead Cards. The Simulation Immediately Removes Them From The 52-Card Shoe, Refining Equity Calculation Accuracy For Complex Multiway Scenarios.',
    },
    {
        question: 'Is The Smarter.Poker Odds Calculator Free?',
        answer:
            'Yes. The Smarter.Poker Odds Calculator Is 100% Free With No Account Creation, Paywall, Or Advertisement Gating Required.',
    },
    {
        question: 'What Poker Variants Are Supported By The Calculator?',
        answer:
            "Six Full Variants Are Supported: Texas Hold'em, Omaha High (PLO4), 5-Card Omaha (PLO5), 6-Card Omaha (PLO6), Seven Card Stud, And Razz (Seven Card Stud Low).",
    },
    {
        question: 'Can I Share Or Embed Calculated Poker Odds Scenarios?',
        answer:
            'Yes. You Can Copy A Persistent Permalink Containing All Player Hands, Board Cards, And Dead Cards, Or Embed The Responsive Iframe Calculator Directly Into External Websites.',
    },
];

const ODDS_CALCULATOR_HOW_TO = {
    name: 'How To Calculate Poker Odds And Hand Equity',
    description: "Step-by-step instructions for calculating win, tie, and split-pot equity for Texas Hold'em and Omaha on Smarter.Poker.",
    steps: [
        {
            name: 'Select Your Poker Game Variant',
            text: "Choose between Texas Hold'em, Pot-Limit Omaha (PLO4), 5-Card Omaha (PLO5), 6-Card Omaha (PLO6), Seven Card Stud, or Razz from the top game selector.",
        },
        {
            name: 'Assign Player Hole Cards',
            text: 'Click player seat card slots and pick exact cards from the interactive 52-card deck palette to set up your matchup with up to 6 players.',
        },
        {
            name: 'Set Community Board Cards',
            text: 'Select Flop, Turn, and River board cards to simulate postflop equity runouts, or leave empty for preflop calculations.',
        },
        {
            name: 'Burn Known Dead Cards',
            text: 'Optionally tag folded discards as dead cards to eliminate them from remaining deck iterations and refine calculation accuracy.',
        },
        {
            name: 'Review Monte Carlo Simulation Results',
            text: 'Inspect instant win percentages, tie odds, and split-pot equity calculated across 10,000 iterations to guide your betting and calling decisions.',
        },
    ],
};

const ODDS_CALCULATOR_SCHEMA = hubProductSchema({
    path: '/hub/poker-tools',
    name: 'Smarter.Poker Odds Calculator',
    description: "Free Poker Odds Calculator For Texas Hold'em, Omaha, PLO5, PLO6, Seven Card Stud And Razz. Calculate Multiway Hand Equity In Real Time With Zero Account Setup.",
    applicationCategory: 'GameApplication',
    applicationSubCategory: 'Poker',
    trail: [['Hub', '/hub'], ['Poker Odds Calculator', '/hub/poker-tools']],
    faqs: ODDS_CALCULATOR_FAQS,
    howTo: {
        name: 'How To Calculate Poker Odds And Hand Equity',
        description: ODDS_CALCULATOR_HOW_TO.description,
        steps: ODDS_CALCULATOR_HOW_TO.steps,
    },
});

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_ICONS = { spades: Spade, hearts: Heart, diamonds: Diamond, clubs: Club };
/* Suit filters follow the Arena four-color deck. */
const SUIT_COLORS = { spades: '#E4E6EB', hearts: '#EF4444', diamonds: '#3B82F6', clubs: '#31A24C' };
const SUIT_NAMES = { spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs' };

/* The Odds Calculator world's own palette (blue / teal on black, silver and
   white text), exposed as --world-* custom properties on the page root. */
const THEME_VARS = getWorldMenuStyleVariables(getWorldMenuById('odds-calculator'));

/* Use the same four-color artwork as the Arena table. */
function getCardImage(rank, suit) {
    const r = rank === '10' ? '10' : rank.toLowerCase();
    return `/hub/club-arena/cards/4color/${suit}_${r}.webp`;
}

const cardName = (card) => `${card.rank} Of ${SUIT_NAMES[card.suit] || card.suit}`;
const seatName = (pi) => (pi === 0 ? 'Hero' : `Villain ${pi}`);
const pct = (n) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;

/* One card position: a face to tap off, or an empty slot to tap into. */
function CardSlot({ card, active, onPick, onRemove, label }) {
    if (card) {
        return (
            <button type="button" className="odds-slot" onClick={e => { e.stopPropagation(); onRemove(); }}
                aria-label={`Remove ${cardName(card)} From ${label}`}>
                <span className="odds-slot__face">
                    <img width="360" height="504" src={getCardImage(card.rank, card.suit)} alt="" loading="lazy" decoding="async" />
                </span>
            </button>
        );
    }
    return (
        <button type="button" className={`odds-slot${active ? ' is-active' : ''}`} onClick={e => { e.stopPropagation(); onPick(); }}
            aria-label={`Pick A Card For ${label}`}>
            <span className="odds-slot__face odds-slot__face--empty" aria-hidden><Plus size={16} /></span>
        </button>
    );
}

function GameSelector({ game, onChange }) {
    const menu = useRef(null);
    const trigger = useRef(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        menu.current?.querySelector('[aria-checked="true"]')?.focus();
        const dismiss = event => {
            if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('focusin', dismiss);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('focusin', dismiss);
        };
    }, [open]);
    function close() { setOpen(false); trigger.current?.focus(); }
    function handleKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        const items = Array.from(menu.current.querySelectorAll('button'));
        const index = items.indexOf(document.activeElement);
        const next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index + items.length - 1) % items.length, Home: 0, End: items.length - 1 }[event.key];
        if (next !== undefined) { event.preventDefault(); items[next].focus(); }
    }
    return <div className="odds-game-control">
        <button ref={trigger} type="button" className="odds-game-trigger" aria-haspopup="menu" aria-expanded={open}
            aria-controls={open ? 'odds-game-menu' : undefined} aria-label={`Game: ${GAME_CONFIGS[game].name}`}
            onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}
            onClick={() => setOpen(!open)}>
            <Layers size={19} aria-hidden />{GAME_CONFIGS[game].name}<ChevronDown className="odds-chevron" size={16} aria-hidden />
        </button>
        {open && <div ref={menu} id="odds-game-menu" className="odds-game-menu" role="menu" aria-label="Poker Game" onKeyDown={handleKey}>
            {Object.entries(GAME_CONFIGS).map(([key, cfg]) => <button type="button" role="menuitemradio"
                key={key} aria-checked={game === key} tabIndex={-1} onClick={() => { if (game !== key) onChange(key); close(); }}>
                {cfg.name}{game === key && <Check size={18} aria-hidden />}
            </button>)}
        </div>}
    </div>;
}

export default function PokerToolsPage({ canonical = 'https://smarter.poker/hub/poker-tools' } = {}) {
    const router = useRouter();
    const isEmbedMode = router.query?.embed === 'true';
    const effectiveCanonical = router.pathname === '/tools/poker-odds-calculator' ? 'https://smarter.poker/tools/poker-odds-calculator' : canonical;
    const [game, setGame] = useState('nlhe');
    const [hands, setHands] = useState([[], []]);
    const [board, setBoard] = useState([]);
    const [deadCards, setDeadCards] = useState([]);
    const [results, setResults] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState({ type: 'hand', playerIdx: 0 });
    const picker = useRef(null);
    const [suitFilter, setSuitFilter] = useState('spades');
    const [error, setError] = useState('');
    const openPicker = slot => {
        setSelectedSlot(slot);
        if (!picker.current.open) picker.current.showModal();
    };
    const [showPresets, setShowPresets] = useState(false);
    const [showEmbedModal, setShowEmbedModal] = useState(false);
    const [hasCopiedEmbed, setHasCopiedEmbed] = useState(false);
    const [hasCopiedShareUrl, setHasCopiedShareUrl] = useState(false);
    const [hasCopiedSpotSummary, setHasCopiedSpotSummary] = useState(false);

    const config = GAME_CONFIGS[game];

    /* Hydrate initial matchup from URL query parameters (?game=nlhe&h0=As,Ks&h1=Qh,Qd&board=10s,9s,2c) */
    useEffect(() => {
        if (!router.isReady) return;
        const q = router.query || {};
        const qGame = typeof q.game === 'string' && Object.hasOwn(GAME_CONFIGS, q.game) ? q.game : null;
        const handKeys = Object.keys(q)
            .filter(k => /^h\d+$/.test(k))
            .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
        const aliasHandKeys = Object.keys(q)
            .filter(k => /^hand\d+$/.test(k))
            .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
        const effectiveHandKeys = handKeys.length > 0 ? handKeys : aliasHandKeys;
        if (!qGame && effectiveHandKeys.length === 0 && !q.board && !q.dead) return;

        const targetGame = qGame || 'nlhe';
        setGame(targetGame);
        const holeLimit = GAME_CONFIGS[targetGame]?.holeCards || 2;
        const seen = new Set();
        const dedup = (cards, maxLen) => {
            const list = [];
            for (const c of cards) {
                if (!c || seen.has(c.id)) continue;
                seen.add(c.id);
                list.push(c);
                if (list.length >= maxLen) break;
            }
            return list;
        };

        {
            const parsedHands = effectiveHandKeys.slice(0, holeLimit === 5 || holeLimit === 6 ? 4 : 7).map(k => dedup(parseCardListFromParam(String(q[k] || '')), holeLimit));
            while (parsedHands.length < 2) parsedHands.push([]);
            setHands(parsedHands);
        }
        setBoard(GAME_CONFIGS[targetGame].hasBoard ? dedup(parseCardListFromParam(q.board), 5) : []);
        setDeadCards(dedup(parseCardListFromParam(q.dead), 52));
        setSelectedSlot({ type: 'hand', playerIdx: 0 });
    }, [router.isReady, router.asPath]);

    const shareUrl = useMemo(() => {
        const params = new URLSearchParams({ game });
        hands.forEach((hand, index) => params.set(`h${index}`, buildCardListParam(hand)));
        if (board.length) params.set('board', buildCardListParam(board));
        if (deadCards.length) params.set('dead', buildCardListParam(deadCards));
        return `${effectiveCanonical}?${params}`;
    }, [game, hands, board, deadCards, effectiveCanonical]);

    async function copyText(text, setCopied) {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            setError('Clipboard unavailable. Allow clipboard access and try again.');
        }
    }
    const shareHandPermalink = () => copyText(shareUrl, setHasCopiedShareUrl);
    const copySpotSummary = () => copyText(buildOddsSpotSummary({
        game, hands, board, dead: deadCards, results, url: shareUrl,
    }), setHasCopiedSpotSummary);

    const usedCardIds = useMemo(() => {
        const ids = new Set();
        hands.forEach(h => h.forEach(c => ids.add(c.id)));
        board.forEach(c => ids.add(c.id));
        deadCards.forEach(c => ids.add(c.id));
        return ids;
    }, [hands, board, deadCards]);

    const resetAll = useCallback(() => {
        setHands([[], []]);
        setBoard([]);
        setDeadCards([]);
        setResults(null);
        setSelectedSlot({ type: 'hand', playerIdx: 0 });
    }, []);

    const changeGame = useCallback((g) => {
        setGame(g);
        setShowPresets(false);
        resetAll();
    }, [resetAll]);

    /* Max players: PLO5/PLO6 = 4, everything else = 7 */
    const maxPlayers = game === 'plo5' || game === 'plo6' ? 4 : 7;

    const addVillain = useCallback(() => {
        if (hands.length < maxPlayers) setHands(h => [...h, []]);
    }, [hands.length, maxPlayers]);

    const removePlayer = useCallback((idx) => {
        if (hands.length <= 2 || idx === 0) return;
        setHands(h => h.filter((_, i) => i !== idx));
        setResults(null);
        /* Issue #780: the production crash. Removing a player BELOW the
           selected one shifts every hand down an index, but the selected slot
           kept its old playerIdx: select Player 3, remove Player 2, and the
           slot now points one PAST the end of the array. The next card tap
           spread `updated[playerIdx]` (undefined) and took the page down
           with "Spread syntax requires ...iterable not be null or undefined".
           The slot now follows the hand it was pointing at. */
        if (selectedSlot?.type === 'hand') {
            if (selectedSlot.playerIdx === idx) {
                setSelectedSlot({ type: 'hand', playerIdx: 0 });
            } else if (selectedSlot.playerIdx > idx) {
                setSelectedSlot({ type: 'hand', playerIdx: selectedSlot.playerIdx - 1 });
            }
        }
    }, [hands.length, selectedSlot]);

    /* Auto-advance to next empty slot */
    const advanceSlot = useCallback((currentSlot) => {
        if (currentSlot.type === 'hand') {
            const pi = currentSlot.playerIdx;
            if ((hands[pi]?.length || 0) + 1 < config.holeCards) return currentSlot;
            for (let i = 1; i < hands.length; i++) {
                const nextPi = (pi + i) % hands.length;
                if ((hands[nextPi]?.length || 0) < config.holeCards) {
                    return { type: 'hand', playerIdx: nextPi };
                }
            }
            if (config.hasBoard && board.length < 5) return { type: 'board' };
            return currentSlot;
        }
        return currentSlot;
    }, [hands, config, board]);

    const selectCard = useCallback((rank, suit) => {
        if (!selectedSlot) return;
        const card = makeCard(rank, suit);
        if (!card || usedCardIds.has(card.id)) return;

        if (selectedSlot.type === 'hand') {
            setHands(prev => {
                /* Issue #780 defense-in-depth: a slot that outlived its hand
                   (removed player, game switch mid-selection) must be a no-op,
                   never a crash. The primary fix is in removePlayer; this
                   guard makes the invariant hold against any future writer. */
                if (selectedSlot.playerIdx >= prev.length) return prev;
                const updated = [...prev];
                const hand = [...(updated[selectedSlot.playerIdx] ?? [])];
                if (hand.length < config.holeCards) {
                    hand.push(card);
                    updated[selectedSlot.playerIdx] = hand;
                }
                return updated;
            });
        } else if (selectedSlot.type === 'board') {
            setBoard(prev => prev.length < 5 ? [...prev, card] : prev);
        } else if (selectedSlot.type === 'dead') {
            setDeadCards(prev => [...prev, card]);
        }
        setResults(null);
        const next = advanceSlot(selectedSlot);
        setSelectedSlot(next);
        if ((selectedSlot.type === 'board' && board.length === 4) ||
            (next === selectedSlot && selectedSlot.type === 'hand' && hands[selectedSlot.playerIdx].length + 1 === config.holeCards)) picker.current?.close();
    }, [selectedSlot, usedCardIds, config.holeCards, advanceSlot, board.length, hands]);

    const removeCard = useCallback((type, playerIdx, cardIdx) => {
        if (type === 'hand') {
            setHands(prev => {
                // Same out-of-range guard as selectCard (issue #780).
                if (playerIdx >= prev.length || !prev[playerIdx]) return prev;
                const updated = [...prev];
                updated[playerIdx] = updated[playerIdx].filter((_, i) => i !== cardIdx);
                return updated;
            });
            setSelectedSlot({ type: 'hand', playerIdx });
        } else if (type === 'board') {
            setBoard(prev => prev.filter((_, i) => i !== cardIdx));
            setSelectedSlot({ type: 'board' });
        } else if (type === 'dead') {
            setDeadCards(prev => prev.filter((_, i) => i !== cardIdx));
        }
        setResults(null);
    }, []);

    const required = config.hasBoard ? config.holeCards : 3;
    const ready = hands.length >= 2 && hands.every(h => h.length >= required);
    useEffect(() => {
        setResults(null);
        setError('');
        setCalculating(ready);
        if (!ready) return;
        const worker = new Worker(new URL('../../src/lib/poker/odds.worker.js', import.meta.url));
        worker.onmessage = ({ data }) => {
            setResults(data.results || null);
            setError(data.error || '');
            setCalculating(false);
        };
        worker.onerror = () => {
            setError('Calculation failed. Change the spot to retry.');
            setCalculating(false);
        };
        worker.postMessage({ game, hands, board, dead: deadCards, iterations: 10000 });
        return () => worker.terminate();
    }, [ready, game, hands, board, deadCards]);

    const loadPreset = useCallback((preset) => {
        const parsed = parsePresetHands(preset.hands);
        setHands(parsed);
        setBoard([]);
        setDeadCards([]);
        setResults(null);
        setSelectedSlot({ type: 'board' });
        setShowPresets(false);
    }, []);

    const leaderEquity = results ? Math.max(...results.map(r => r.equity)) : null;
    const pickerTarget = !selectedSlot ? null
        : selectedSlot.type === 'hand' ? seatName(selectedSlot.playerIdx)
            : selectedSlot.type === 'board' ? 'The Board' : 'Dead Cards';
    const statusText = error || (calculating ? 'Calculating Equity…'
        : results ? `${results[0].exact ? 'Exact' : 'Estimated'} Equity · ${results[0].total.toLocaleString('en-US')} Runouts`
        : `Select ${required}${config.hasBoard ? '' : '-7'} Cards Per Hand`);

    const schema = useMemo(() => {
        const canonicalPath = router.pathname === '/tools/poker-odds-calculator' ? '/tools/poker-odds-calculator' : '/hub/poker-tools';
        return hubProductSchema({
            path: canonicalPath,
            name: 'Smarter.Poker Odds Calculator',
            description: "Free Poker Odds Calculator For Texas Hold'em, Omaha, PLO5, PLO6, Seven Card Stud And Razz. Calculate Multiway Hand Equity In Real Time With Zero Account Setup.",
            applicationCategory: 'GameApplication',
            applicationSubCategory: 'Poker',
            trail: [['Hub', '/hub'], ['Poker Odds Calculator', canonicalPath]],
            faqs: ODDS_CALCULATOR_FAQS,
            howTo: ODDS_CALCULATOR_HOW_TO,
        });
    }, [router.pathname]);

    /* ═══════════════════════════════════════
       RENDER
    ═══════════════════════════════════════ */
    return (
        <>
            <SEOHead
                title="Poker Odds Calculator: Six Games"
                description="Free Poker Odds Calculator For Texas Hold'em, Omaha, PLO5, PLO6, Stud, And Razz. Calculate Real-Time Multiway Equity And Test Scenarios With Zero Account Setup."
                canonical={effectiveCanonical}
                jsonLd={schema}
                ogImage="/api/og/tool-card?tool=odds&title=Poker+Odds+Calculator&subtitle=Multiway+Equity+For+Holdem+PLO4+PLO5+PLO6+Stud+And+Razz&statLabel=ITERATIONS&statValue=10,000+RUNS"
                markdownUrl="https://smarter.poker/tools/poker-odds-calculator.md"
            />

            <div className="odds-page" style={THEME_VARS}>
                <main className="odds-main">
                    {/* ─── TITLE ROW ─── */}
                    {!isEmbedMode && (
                        <BankrollImageHeader art="poker-odds" section="odds" title="Poker Odds Calculator"
                            helpContent={<>
                                <p>Tap A Card Slot To Choose From The Arena Deck. Tap A Selected Card To Remove It. Equity Includes Each Player's Share Of Split Pots.</p>
                                <button className="odds-btn" onClick={() => openPicker(selectedSlot)}>Choose Cards</button>
                                <button className="odds-btn" onClick={e => { e.currentTarget.closest('dialog').close(); setShowEmbedModal(true); }}>Embed Calculator</button>
                            <section className="odds-panel" aria-label="Next Steps In Smarter.Poker" style={{ padding: '14px 16px' }}>
                                <div className="odds-panel__head" style={{ marginBottom: 8 }}>
                                    <span className="odds-seat-name odds-seat-name--static">Train And Track Your Game</span>
                                </div>
                                <div className="odds-actions">
                                    <Link href="/hub/training" className="odds-btn odds-btn--primary" style={{ textDecoration: 'none' }}>
                                        Practice Spots Like This In The Free GTO Trainer
                                    </Link>
                                    <Link href="/tools/preflop-ranges" className="odds-btn" style={{ textDecoration: 'none' }}>
                                        Explore 13x13 GTO Preflop Range Matrix
                                    </Link>
                                    <Link href="/hub/bankroll-manager" className="odds-btn" style={{ textDecoration: 'none' }}>
                                        Track Sessions In Bankroll Manager
                                    </Link>
                                    <Link href="/freerolls" className="odds-btn" style={{ textDecoration: 'none' }}>
                                        Play Five Free Daily Poker Tournaments
                                    </Link>
                                    <Link href="/compare" className="odds-btn" style={{ textDecoration: 'none' }}>
                                        Compare Free Poker Tools Vs. Paid Software
                                    </Link>
                                </div>
                            </section>
                            {/* ─── POKER ODDS REFERENCE TABLES ─── */}
                            <section className="odds-reference-section" aria-label="Common Preflop Poker Odds Reference Tables" style={{
                                marginTop: 28,
                                padding: '24px 20px',
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid var(--world-border, #3D679A)',
                                borderRadius: 12,
                                width: '100%',
                            }}>
                                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px 0', color: 'var(--world-text, #F0F7FF)' }}>
                                    Common Preflop Hand Matchups &amp; Equity Odds
                                </h2>
                                <p style={{ fontSize: 13, color: 'var(--world-muted, #94AFCC)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                                    Win And Tie Rates Across All 1,712,304 Boards For The Suits Shown.
                                </p>
                                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                                    <table style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: 13,
                                        textAlign: 'left',

                                    }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--world-border, #3D679A)', color: 'var(--world-muted, #94AFCC)' }}>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Matchup Type</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Hand 1</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Hand 2</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Hand 1 Win</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Hand 2 Win</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Tie %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {PREFLOP_MATCHUPS.map((row, idx) => (
                                                <tr key={idx} style={{
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                    background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                                                }}>
                                                    <td data-label="Matchup" style={{ padding: '10px', color: 'var(--world-text, #F0F7FF)', fontWeight: 600 }}>{row.type}</td>
                                                    <td data-label="Hand 1" style={{ padding: '10px', color: 'var(--world-accent, #4E9CFF)', fontWeight: 700, fontFamily: 'monospace' }}>{row.h1}</td>
                                                    <td data-label="Hand 2" style={{ padding: '10px', color: '#c5e5ff', fontWeight: 700, fontFamily: 'monospace' }}>{row.h2}</td>
                                                    <td data-label="Hand 1 Win" style={{ padding: '10px', color: '#10B981', fontWeight: 700 }}>{row.e1}</td>
                                                    <td data-label="Hand 2 Win" style={{ padding: '10px', color: '#EF4444', fontWeight: 700 }}>{row.e2}</td>
                                                    <td data-label="Tie" style={{ padding: '10px', color: 'var(--world-muted, #94AFCC)' }}>{row.tie}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px 0', color: 'var(--world-text, #F0F7FF)' }}>
                                    The Rule Of 2 And 4 For Postflop Equity Estimation
                                </h2>
                                <p style={{ fontSize: 13, color: 'var(--world-muted, #94AFCC)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                                    Quick Mental Poker Math Shortcut: On The Flop, Multiply Your Unseen Outs By 4 To Estimate The Chance Of Hitting A Draw. On The Turn, Multiply Remaining Outs By 2.
                                </p>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: 13,
                                        textAlign: 'left',

                                    }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--world-border, #3D679A)', color: 'var(--world-muted, #94AFCC)' }}>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Drawing Hand Type</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Unseen Outs</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Turn To River</th>
                                                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Flop To River</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {DRAW_ODDS.map((row, idx) => (
                                                <tr key={idx} style={{
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                    background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                                                }}>
                                                    <td data-label="Draw" style={{ padding: '10px', color: 'var(--world-text, #F0F7FF)', fontWeight: 600 }}>{row.draw}</td>
                                                    <td data-label="Outs" style={{ padding: '10px', color: 'var(--world-accent, #4E9CFF)', fontWeight: 700 }}>{row.outs}</td>
                                                    <td data-label="One Card" style={{ padding: '10px', color: '#10B981', fontWeight: 700 }}>{row.turn}</td>
                                                    <td data-label="Two Cards" style={{ padding: '10px', color: '#3B82F6', fontWeight: 700 }}>{row.river}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                            <section className="odds-faq-section" aria-label="Frequently Asked Questions" style={{
                                marginTop: 24,
                                padding: '20px',
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid var(--world-border, #3D679A)',
                                borderRadius: 12,
                                width: '100%',
                            }}>
                                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 14px 0', color: 'var(--world-text, #F0F7FF)' }}>
                                    Frequently Asked Questions
                                </h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {ODDS_CALCULATOR_FAQS.map((faq, idx) => (
                                        <details key={idx} style={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: 8,
                                            padding: '12px 14px',
                                            color: 'var(--world-text, #F0F7FF)',
                                        }}>
                                            <summary style={{
                                                fontWeight: 700,
                                                fontSize: 14,
                                                cursor: 'pointer',
                                                color: 'var(--world-accent, #4E9CFF)',
                                                outline: 'none',
                                            }}>
                                                {faq.question}
                                            </summary>
                                            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--world-muted, #94AFCC)' }}>
                                                {faq.answer}
                                            </p>
                                        </details>
                                    ))}
                                </div>
                            </section>
                            <HubPageSummary surface="poker-tools" />
                            <CitationBacklinkBox
                                title="Multiway Poker Odds & Equity Calculator"
                                canonicalUrl="https://smarter.poker/tools/poker-odds-calculator"
                                badgeType="gto"
                                badgeLabel="GTO Math Verified"
                                badgeValue="Smarter.Poker Odds Solver"
                                summary="Free Multiway Texas Holdem, PLO4, PLO5, PLO6, 7-Card Stud And Razz Poker Odds And Equity Calculator."
                                slug="poker-odds-calculator"
                            />
                            <AiPromptLauncher
                                title="Multiway Poker Odds & Equity Calculator"
                                canonicalUrl="https://smarter.poker/tools/poker-odds-calculator"
                                markdownUrl="https://smarter.poker/tools/poker-odds-calculator.md"
                            />
                            </>} />
                    )}

                    {/* ─── GAME SELECTOR ─── */}
                    <div className="odds-toolbar">
                        <GameSelector game={game} onChange={changeGame} />
                        {!isEmbedMode && <nav className="odds-shortcuts" aria-label="Calculator Shortcuts">
                            {/* No viewport prefetch (2026-11-28): these two sit on screen at
                                first paint, and next/link fetched both calculator pages with
                                their chunks, the Equity Calculator's poker-engine brain alone
                                121 KB, before anyone chose them. That put this page over its
                                900 KB mobile budget. Touchstart and hover still prefetch. */}
                            <Link href="/hub/training/equity-calculator" prefetch={false}><ChartPie size={18} aria-hidden />Equity Calculator</Link>
                            <Link href="/hub/training/icm-calculator" prefetch={false}><Calculator size={18} aria-hidden />ICM Calculator</Link>
                        </nav>}
                    </div>

                    {/* ─── BOARD ─── */}
                    {config.hasBoard && (
                        <section className={`odds-panel odds-board${selectedSlot?.type === 'board' ? ' is-selected' : ''}`}
                            onClick={() => openPicker({ type: 'board' })} aria-label="Board">
                            <div className="odds-panel__head">
                                <button type="button" className="odds-seat-name" onClick={e => { e.stopPropagation(); openPicker({ type: 'board' }); }}>
                                    <Layers size={15} aria-hidden /> Board
                                </button>
                                <span className="odds-panel__meta">{board.length} Of 5</span>
                            </div>
                            <div className="odds-slots odds-slots--board">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <CardSlot key={i} card={board[i]} label="The Board"
                                        active={selectedSlot?.type === 'board' && i === board.length}
                                        onPick={() => openPicker({ type: 'board' })}
                                        onRemove={() => removeCard('board', 0, i)} />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ─── SEATS + EQUITY ─── */}
                    <section id="results" className="odds-seats" aria-label="Hands And Equity"
                        style={{ '--odds-seat-min': config.holeCards <= 2 ? '160px' : config.holeCards <= 4 ? '240px' : '100%' }}>
                        {hands.map((hand, pi) => {
                            const isHero = pi === 0;
                            const isSelected = selectedSlot?.type === 'hand' && selectedSlot.playerIdx === pi;
                            const equity = results?.[pi];
                            const isLeader = equity && leaderEquity !== null && equity.equity === leaderEquity;
                            const total = equity?.total || 0;
                            return (
                                <div key={pi}
                                    className={`odds-panel odds-seat${isSelected ? ' is-selected' : ''}${isHero ? ' is-hero' : ''}`}
                                    onClick={() => openPicker({ type: 'hand', playerIdx: pi })}>
                                    <div className="odds-panel__head">
                                        <button type="button" className="odds-seat-name"
                                            onClick={e => { e.stopPropagation(); openPicker({ type: 'hand', playerIdx: pi }); }}
                                            aria-label={`Pick Cards For ${seatName(pi)}`}>
                                            {isHero ? <Crown size={15} aria-hidden /> : <UserRound size={15} aria-hidden />}
                                            {seatName(pi)}
                                        </button>
                                        {!isHero && hands.length > 2 && (
                                            <button type="button" onClick={e => { e.stopPropagation(); removePlayer(pi); }}
                                                aria-label={`Remove Villain ${pi}`} className="odds-icon-btn odds-icon-btn--quiet">
                                                <X size={16} aria-hidden />
                                            </button>
                                        )}
                                    </div>
                                    <div className="odds-equity-row">
                                        <span className={`odds-equity${isLeader ? ' is-leader' : ''}`}>
                                            {equity ? pct(equity.equity) : '--'}
                                        </span>
                                        <span className="odds-split">
                                            {equity && total > 0
                                                ? `Win ${pct((equity.wins / total) * 100)} · Tie ${pct((equity.ties / total) * 100)}`
                                                : `${hand.length} Of ${config.holeCards} Cards`}
                                        </span>
                                    </div>
                                    <div className="odds-bar" aria-hidden>
                                        <span style={{ width: equity ? `${Math.max(0, Math.min(100, equity.equity))}%` : '0%' }} />
                                    </div>
                                    <div className="odds-slots" style={{ '--odds-slot-count': config.holeCards }}>
                                        {Array.from({ length: config.holeCards }).map((_, ci) => (
                                            <CardSlot key={ci} card={hand[ci]} label={seatName(pi)}
                                                active={isSelected && ci === hand.length}
                                                onPick={() => openPicker({ type: 'hand', playerIdx: pi })}
                                                onRemove={() => removeCard('hand', pi, ci)} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                    {hands.length < maxPlayers && (
                            <button type="button" className="odds-add" onClick={addVillain} aria-label="Add Villain">
                                <UserPlus size={18} aria-hidden /> Add Villain
                            </button>
                        )}

                    {/* Presets */}
                    {showPresets && PRESETS[game] && (
                        <div className="odds-presets">
                            {PRESETS[game].map((p, i) => (
                                <button key={i} type="button" onClick={() => loadPreset(p)} className="odds-btn odds-btn--chip">
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Dead Cards */}
                    {deadCards.length > 0 && (
                        <section className={`odds-panel odds-dead${selectedSlot?.type === 'dead' ? ' is-selected' : ''}`} aria-label="Dead Cards">
                            <div className="odds-panel__head">
                                <span className="odds-seat-name odds-seat-name--static">Dead Cards</span>
                                <span className="odds-panel__meta">Tap To Remove</span>
                            </div>
                            <div className="odds-slots odds-slots--dead">
                                {deadCards.map((c, i) => (
                                    <CardSlot key={c.id} card={c} label="Dead Cards"
                                        onPick={() => openPicker({ type: 'dead' })}
                                        onRemove={() => removeCard('dead', 0, i)} />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ─── STATUS + ACTIONS ─── */}
                    <p className="odds-status" role="status" aria-live="polite">{statusText}</p>
                    <div className="odds-actions">
                        <button type="button" onClick={resetAll} aria-label="Reset To New Hand" className="odds-btn">
                            <RotateCcw size={15} aria-hidden /> New Hand
                        </button>
                        <button type="button" onClick={() => openPicker({ type: 'dead' })}
                            className={`odds-btn${selectedSlot?.type === 'dead' ? ' is-on' : ''}`} aria-pressed={selectedSlot?.type === 'dead'}>
                            <Ban size={16} aria-hidden /> Dead Cards{deadCards.length > 0 ? ` (${deadCards.length})` : ''}
                        </button>
                        {PRESETS[game] && (
                            <button type="button" onClick={() => setShowPresets(!showPresets)}
                                className={`odds-btn${showPresets ? ' is-on' : ''}`} aria-expanded={showPresets}>
                                <SlidersHorizontal size={16} aria-hidden /> Presets
                            </button>
                        )}
                        <button type="button" onClick={shareHandPermalink}
                            aria-label="Copy Shareable Hand Permalink"
                            className="odds-btn">
                            {hasCopiedShareUrl ? <Check size={15} aria-hidden /> : <Share2 size={15} aria-hidden />}
                            {hasCopiedShareUrl ? 'Link Copied' : 'Share Hand'}
                        </button>
                        <button type="button" onClick={copySpotSummary}
                            aria-label="Copy Spot Summary For Discord Or X"
                            className="odds-btn">
                            {hasCopiedSpotSummary ? <Check size={15} aria-hidden /> : <Copy size={16} aria-hidden />}
                            {hasCopiedSpotSummary ? 'Spot Copied' : 'Copy Spot'}
                        </button>
                    </div>

                    {!isEmbedMode && (
                        <SmarterConversionCta
                            eyebrow="Free Smarter.Poker Account"
                            title="Save Hand Simulations & Unlock 107 Free GTO Training Games"
                            description="Save Multiway Equity Spots, Track Live Cash & Tournament Sessions In Bankroll Manager, And Drill GTO Scenarios Free."
                            primaryLabel="Create Free Account"
                            primaryHref="/auth/signup?redirect=/tools/poker-odds-calculator&src=odds-calc"
                            secondaryLabel="Sign In"
                            secondaryHref="/auth/login?redirect=/tools/poker-odds-calculator"
                            highlights={['100% Free Forever', '107 GTO Drills', 'Save Hand Spots']}
                        />
                    )}

                    {/* ═══════════════════════════════════════════
                        CARD PICKER
                    ═══════════════════════════════════════════ */}
                    <dialog ref={picker} className="odds-card-dialog" aria-label="Card Picker">
                        <div className="odds-sheet__head"><strong>Pick For {pickerTarget}</strong>
                            <button type="button" className="odds-btn" onClick={() => picker.current.close()}><Check size={16} aria-hidden /> Done</button>
                        </div>
                        <div className="odds-suits" role="group" aria-label="Suit">
                            {SUITS.map(suit => {
                                const Icon = SUIT_ICONS[suit];
                                return <button key={suit} type="button" aria-label={SUIT_NAMES[suit]} title={SUIT_NAMES[suit]}
                                    style={{ '--suit-color': SUIT_COLORS[suit] }} aria-pressed={suitFilter === suit}
                                    onClick={() => setSuitFilter(suit)}><Icon size={23} aria-hidden /></button>;
                            })}
                        </div>
                        {[suitFilter].map(suit => (
                            <div key={suit} className="odds-deck" role="group" aria-label={SUIT_NAMES[suit]}>
                                {RANKS.map(rank => {
                                    const card = makeCard(rank, suit);
                                    const isUsed = card && usedCardIds.has(card.id);
                                    const filled = selectedSlot?.type === 'board' ? board.length >= 5 :
                                        selectedSlot?.type === 'hand' && hands[selectedSlot.playerIdx]?.length >= config.holeCards;
                                    const isDisabled = !selectedSlot || isUsed || filled;
                                    return (
                                        <button key={`${rank}-${suit}`} type="button"
                                            onClick={() => !isDisabled && selectCard(rank, suit)}
                                            disabled={isDisabled}
                                            className={`odds-pick${isUsed ? ' is-used' : ''}`}
                                            style={{ '--odds-suit': SUIT_COLORS[suit] }}
                                            aria-label={`${rank} Of ${SUIT_NAMES[suit]}${isUsed ? ', In Use' : ''}`}>
                                            <img width="360" height="504" src={getCardImage(rank, suit)} alt="" loading="lazy" decoding="async" />
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </dialog>
                    {isEmbedMode && (
                        <div className="odds-embed-credit">
                            <p className="odds-embed-credit__text">
                                Powered By{' '}
                                <a
                                    href="https://smarter.poker/hub/poker-tools"
                                    target="_blank"
                                    rel="noopener"
                                    className="odds-embed-credit__link"
                                >
                                    Smarter.Poker Free Poker Odds Calculator
                                </a>
                            </p>
                        </div>
                    )}
                </main>

                {/* ─── WEBMASTER EMBED MODAL ─── */}
                {showEmbedModal && (
                    <div className="odds-sheet" onClick={() => setShowEmbedModal(false)}>
                        <div
                            className="odds-sheet__panel odds-sheet__panel--embed"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Embed Poker Tools On Your Website"
                            style={{
                                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
                                paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="odds-sheet__head">
                                <span className="odds-sheet__title">Embed Widget Code</span>
                                <button
                                    type="button"
                                    onClick={() => setShowEmbedModal(false)}
                                    aria-label="Close Embed Dialog"
                                    className="odds-icon-btn"
                                    style={{ minWidth: 44, minHeight: 44 }}
                                >
                                    <X size={18} aria-hidden />
                                </button>
                            </div>
                            <p className="odds-sheet__desc">
                                Add This Interactive Multiway Poker Odds Calculator To Your Website Or Blog. Free For Webmasters With Attribution.
                            </p>
                            <div className="odds-embed-box">
                                <textarea
                                    readOnly
                                    value={`<iframe src="https://smarter.poker/hub/poker-tools?embed=true" width="100%" height="780" frameborder="0" style="border:0;border-radius:12px;overflow:hidden;" title="Smarter.Poker Odds Calculator"></iframe>\n<p style="font-size:12px;text-align:center;color:#94AFCC;margin-top:6px;">Powered By <a href="https://smarter.poker/hub/poker-tools" target="_blank" rel="noopener" style="color:#4E9CFF;text-decoration:none;font-weight:600;">Smarter.Poker Free Poker Odds Calculator</a></p>`}
                                    className="odds-embed-textarea"
                                    aria-label="HTML Embed Code"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const code = `<iframe src="https://smarter.poker/hub/poker-tools?embed=true" width="100%" height="780" frameborder="0" style="border:0;border-radius:12px;overflow:hidden;" title="Smarter.Poker Odds Calculator"></iframe>\n<p style="font-size:12px;text-align:center;color:#94AFCC;margin-top:6px;">Powered By <a href="https://smarter.poker/hub/poker-tools" target="_blank" rel="noopener" style="color:#4E9CFF;text-decoration:none;font-weight:600;">Smarter.Poker Free Poker Odds Calculator</a></p>`;
                                        copyText(code, setHasCopiedEmbed);
                                    }}
                                    className="odds-btn odds-btn--primary"
                                    style={{ width: '100%', marginTop: 10 }}
                                >
                                    {hasCopiedEmbed ? (
                                        <>
                                            <Check size={16} aria-hidden /> Copied Embed Code
                                        </>
                                    ) : (
                                        <>
                                            <Code size={16} aria-hidden /> Copy Embed HTML Code
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Plain <style>, outside any conditional, so the layout is
                    present on the server render and never depends on JS. */}
                <style dangerouslySetInnerHTML={{ __html: ODDS_CSS }} />
            </div>
        </>
    );
}

/* ═══════════════════════════════════════════════
   STYLES: Smarter.Poker Odds Calculator console
   Colours are the world's --world-* tokens (set on .odds-page from
   src/config/worldMenuNavigation.js). One 1px frame per surface; a selected
   surface changes that frame's colour, it never adds a second one.
   Three breakpoints only (docs/mobile-standard): 768 / 600 and their
   complements. Selectors carry two classes so the global phone rules in
   src/index.css (button font-size 16px, h1 1.75rem) do not override them.
═══════════════════════════════════════════════ */
const ODDS_CSS = `
.odds-page {
    min-height: 100dvh; width: 100%; max-width: 100vw; box-sizing: border-box;
    overflow-x: clip; overflow-y: visible;
    background:
        radial-gradient(120% 60% at 50% 0%, rgba(78, 156, 255, 0.10), transparent 60%),
        var(--world-canvas, #020812);
    color: var(--world-text, #F0F7FF);
    font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.odds-page *, .odds-page *::before, .odds-page *::after { box-sizing: border-box; }
.odds-page .odds-main {
    width: 100%; max-width: 960px; margin: 0 auto;
    padding: 12px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
    display: flex; flex-direction: column; gap: 12px;
}

/* Title row */
.odds-page .odds-titlebar { display: flex; align-items: center; gap: 8px; min-width: 0; }
.odds-page .odds-titlebar__text { flex: 1; min-width: 0; text-align: center; }
.odds-page h1.odds-title {
    margin: 0; font-size: 20px !important; line-height: 1.2; font-weight: 800;
    letter-spacing: 0.01em; color: var(--world-text, #F0F7FF);
}
.odds-page .odds-subtitle { margin: 2px 0 0; font-size: 12px; color: var(--world-muted, #94AFCC); }
.odds-page .odds-back {
    display: inline-flex; align-items: center; gap: 4px; min-height: 44px; min-width: 44px;
    padding: 0 6px; color: var(--world-muted, #94AFCC); text-decoration: none;
    font-size: 14px; font-weight: 600; border-radius: 6px;
}
.odds-page .odds-icon-btn {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 0;
    border-radius: 6px; border: 1px solid var(--world-border, #3D679A);
    background: var(--world-tile, #071A31); color: var(--world-text, #F0F7FF); cursor: pointer;
}
.odds-page .odds-icon-btn--quiet { border-color: transparent; background: transparent; color: var(--world-muted, #94AFCC); }

/* Game selector: every game always on screen, no sideways rail */
.odds-page .odds-games {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px;
    padding: 4px; border: 1px solid var(--world-border, #3D679A); border-radius: 8px;
    background: var(--world-rail, #061326);
}
.odds-page .odds-games .odds-game {
    min-height: 44px; padding: 6px 4px; border: 1px solid transparent; border-radius: 6px;
    background: transparent; color: var(--world-muted, #94AFCC);
    font-size: 13px; font-weight: 700; line-height: 1.15; cursor: pointer; white-space: normal;
}
.odds-page .odds-games .odds-game.is-on {
    background: var(--world-tile-active, #10325D); border-color: var(--world-accent, #4E9CFF);
    color: var(--world-text, #F0F7FF);
}

/* Panels: board, seats, dead cards */
.odds-page .odds-panel {
    border: 1px solid var(--world-border, #3D679A); border-radius: 8px;
    background: linear-gradient(180deg, var(--world-panel, #0B2340) 0%, var(--world-tile, #071A31) 100%);
    padding: 6px; min-width: 0;
}
.odds-page .odds-panel.is-selected { border-color: var(--world-accent, #4E9CFF); }
.odds-page .odds-panel__head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.odds-page .odds-panel__meta { margin-left: auto; padding-right: 6px; font-size: 12px; color: var(--world-muted, #94AFCC); white-space: nowrap; }
.odds-page .odds-panel .odds-seat-name {
    display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 0; min-height: 44px;
    padding: 0 6px; border: 0; background: transparent; color: var(--world-text, #F0F7FF);
    font-size: 15px; font-weight: 700; text-align: left; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.odds-page .odds-panel .odds-seat-name--static { cursor: default; white-space: normal; font-size: 14px; }

/* Seats: equity sits on the hand that earned it */
.odds-page .odds-seats {
    display: grid; gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--odds-seat-min, 150px)), 1fr));
}
.odds-page .odds-equity-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 10px; padding: 0 6px; }
.odds-page .odds-seat .odds-equity {
    font-size: 26px; line-height: 1.1; font-weight: 800;
    font-variant-numeric: tabular-nums; color: var(--world-text, #F0F7FF);
}
.odds-page .odds-seat .odds-equity.is-leader { color: var(--world-secondary, #22D3EE); }
.odds-page .odds-bar { height: 4px; margin: 6px 6px 8px; border-radius: 2px; background: rgba(148, 175, 204, 0.18); overflow: hidden; }
.odds-page .odds-bar span {
    display: block; height: 100%; border-radius: 2px; transition: width 0.3s ease;
    background: linear-gradient(90deg, var(--world-accent, #4E9CFF), var(--world-secondary, #22D3EE));
}
.odds-page .odds-split { font-size: 12px; line-height: 1.3; color: var(--world-muted, #94AFCC); font-variant-numeric: tabular-nums; }
.odds-page .odds-seats .odds-add {
    display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px;
    border: 1px dashed var(--world-border, #3D679A); border-radius: 8px; background: transparent;
    color: var(--world-muted, #94AFCC); font-size: 14px; font-weight: 700; cursor: pointer;
}

/* Card slots: 44px wide minimum, 64px maximum, card proportions */
.odds-page .odds-slots {
    --odds-slot-gap: 4px;
    display: flex; flex-wrap: wrap; gap: var(--odds-slot-gap); padding: 0 6px 6px;
}
.odds-page .odds-slots--board { --odds-slot-count: 5; justify-content: center; padding-top: 4px; }
.odds-page .odds-slots--dead { --odds-slot-count: 8; }
.odds-page .odds-slots .odds-slot {
    flex: 0 0 auto; padding: 0; border: 0; background: transparent; cursor: pointer; min-height: 0;
    width: clamp(44px, calc((100% - (var(--odds-slot-count, 2) - 1) * var(--odds-slot-gap)) / var(--odds-slot-count, 2)), 64px);
}
.odds-page .odds-slot__face {
    position: relative; display: block; width: 100%; aspect-ratio: 5 / 7; overflow: hidden;
    border-radius: 5px; border: 1px solid rgba(228, 230, 235, 0.55); background: #fff;
}
.odds-page .odds-slot__face img {
    position: absolute; inset: 0; width: 100% !important; height: 100% !important; max-width: none;
    object-fit: contain; display: block;
}
.odds-page .odds-slot__face--empty {
    border-color: rgba(148, 175, 204, 0.32);
    background: linear-gradient(160deg, var(--world-tile-active, #10325D) 0%, var(--world-canvas, #020812) 100%);
}
.odds-page .odds-slot.is-active .odds-slot__face--empty { border-color: var(--world-accent, #4E9CFF); }

/* Status and actions */
.odds-page .odds-status { margin: 0; text-align: center; font-size: 13px; color: var(--world-muted, #94AFCC); }
.odds-page .odds-actions, .odds-page .odds-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.odds-page .odds-actions .odds-btn, .odds-page .odds-presets .odds-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-height: 44px; padding: 0 14px; flex: 1 1 auto;
    border: 1px solid var(--world-border, #3D679A); border-radius: 6px;
    background: var(--world-tile, #071A31); color: var(--world-text, #F0F7FF);
    font-size: 14px; font-weight: 700; cursor: pointer;
}
.odds-page .odds-actions .odds-btn.is-on { border-color: var(--world-accent, #4E9CFF); background: var(--world-tile-active, #10325D); }
.odds-page .odds-actions .odds-btn--primary { background: var(--world-accent, #4E9CFF); border-color: var(--world-accent, #4E9CFF); color: #fff; }
.odds-page .odds-actions .odds-btn:disabled { opacity: 0.6; cursor: wait; }
.odds-page .odds-presets { padding: 6px; border: 1px solid var(--world-border, #3D679A); border-radius: 8px; background: var(--world-rail, #061326); }
.odds-page .odds-presets .odds-btn--chip { flex: 1 1 140px; font-size: 13px; }

/* Card picker: all 52 cards always displayed; 44px-minimum columns (7 per
   row at 360 to 393px), one suit per row of 13 from 769px up */
.odds-page .odds-picker { padding: 6px 0 2px; border-width: 1px 0 0; border-radius: 0; background: transparent; }
.odds-page .odds-picker.is-selected { border-color: var(--world-border, #3D679A); }
.odds-page .odds-picker .odds-panel__head { margin-bottom: 4px; }
.odds-page .odds-picker .odds-seat-name { padding: 0; }
.odds-page .odds-mini { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.odds-page .odds-mini__item {
    display: inline-flex; align-items: baseline; gap: 4px; padding: 4px 8px; border-radius: 6px;
    border: 1px solid rgba(148, 175, 204, 0.28); font-size: 12px; color: var(--world-muted, #94AFCC);
}
.odds-page .odds-mini__item strong { font-size: 14px; color: var(--world-text, #F0F7FF); font-variant-numeric: tabular-nums; }
.odds-page .odds-mini__item.is-leader { border-color: var(--world-secondary, #22D3EE); }
.odds-page .odds-mini__item.is-leader strong { color: var(--world-secondary, #22D3EE); }
.odds-page .odds-deck { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 3px; margin-bottom: 8px; }
.odds-page .odds-deck .odds-pick {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
    min-height: 48px; padding: 2px 0; border-radius: 6px;
    border: 1px solid rgba(148, 175, 204, 0.28); background: var(--world-tile, #071A31);
    color: var(--world-text, #F0F7FF); cursor: pointer; font-size: 16px; line-height: 1;
}
.odds-page .odds-deck .odds-pick__rank { font-size: 16px; font-weight: 800; letter-spacing: -0.02em; }
.odds-page .odds-deck .odds-pick__suit { font-size: 16px; color: var(--odds-suit); margin-top: 2px; }
.odds-page .odds-deck .odds-pick:active:not(:disabled) { border-color: var(--world-accent, #4E9CFF); background: var(--world-tile-active, #10325D); }
.odds-page .odds-deck .odds-pick:focus-visible, .odds-page .odds-panel button:focus-visible,
.odds-page .odds-actions .odds-btn:focus-visible, .odds-page .odds-games .odds-game:focus-visible {
    outline: 2px solid var(--world-focus, #A4D0FF); outline-offset: 1px;
}
.odds-page .odds-deck .odds-pick.is-used { opacity: 0.2; cursor: default; }
.odds-page .odds-deck .odds-pick:disabled:not(.is-used) { cursor: default; }

/* Settings sheet */
.odds-page .odds-sheet { position: fixed; inset: 0; z-index: 1000; background: rgba(2, 8, 18, 0.6); }
.odds-page .odds-sheet__panel {
    position: absolute; top: 0; right: 0; width: min(300px, 86vw); height: 100%; overflow-y: auto;
    padding-left: 20px; background: var(--world-rail, #061326); border-left: 1px solid var(--world-border, #3D679A);
}
.odds-page .odds-sheet__head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 16px; }
.odds-page .odds-sheet__title { font-size: 16px; font-weight: 800; }
.odds-page .odds-sheet__label { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: var(--world-muted, #94AFCC); }
.odds-page .odds-sheet__desc {
    margin: 0 0 14px; font-size: 13px; line-height: 1.5; color: var(--world-muted, #94AFCC);
}
.odds-page .odds-sheet__panel--embed {
    width: min(540px, 94vw);
}
.odds-page .odds-embed-box {
    display: flex; flex-direction: column; gap: 8px; margin-top: 10px;
}
.odds-page .odds-embed-textarea {
    width: 100%; height: 140px; padding: 10px; border-radius: 6px;
    border: 1px solid var(--world-border, #3D679A); background: var(--world-canvas, #020812);
    color: var(--world-text, #F0F7FF); font-family: monospace; font-size: 12px; line-height: 1.4;
    resize: none;
}
.odds-page .odds-embed-credit {
    padding: 16px; text-align: center; border-top: 1px solid var(--world-border, #3D679A);
    margin-top: 16px;
}
.odds-page .odds-embed-credit__text {
    margin: 0; font-size: 13px; color: var(--world-muted, #94AFCC);
}
.odds-page .odds-embed-credit__link {
    color: var(--world-accent, #4E9CFF); text-decoration: none; font-weight: 700;
}
.odds-page .odds-embed-credit__link:hover {
    text-decoration: underline;
}


@media (min-width: 769px) {
    .odds-page .odds-main { gap: 14px; padding-top: 16px; }
    .odds-page h1.odds-title { font-size: 24px !important; }
    .odds-page .odds-games { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .odds-page .odds-deck { grid-template-columns: repeat(13, minmax(0, 1fr)); gap: 4px; }
    .odds-page .odds-deck .odds-pick { min-height: 56px; }
    .odds-page .odds-actions .odds-btn { flex: 0 0 auto; }
    .odds-page .odds-slots .odds-slot { width: clamp(44px, calc((100% - (var(--odds-slot-count, 2) - 1) * var(--odds-slot-gap)) / var(--odds-slot-count, 2)), 72px); }
}
@media (hover: hover) and (min-width: 769px) {
    .odds-page .odds-deck .odds-pick:hover:not(:disabled) { border-color: var(--world-accent, #4E9CFF); }
}
@keyframes spcalc-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .odds-page [aria-busy="true"] svg { animation: none !important; }
    .odds-page .odds-bar span { transition: none; }
}

.odds-page .odds-main { max-width:800px; gap:8px; }
.odds-page .odds-panel { background:linear-gradient(150deg,#102639,#071421); border-color:#4b6071; }
.odds-page .odds-slot__face--empty { display:grid; place-items:center; border:1px dashed #7793ab; }

.odds-page .odds-slots .odds-slot { width:clamp(44px,10vw,56px); }
.odds-page .odds-card-dialog { color:#eff7ff; width:min(94vw,510px); max-height:85dvh; overflow:auto; border:1px solid #96aebd; border-radius:14px; background:#0a192a; margin:auto; padding:16px; }
.odds-card-dialog::backdrop { background:rgb(0 7 14 / 80%); }
.odds-page .odds-toolbar { display:flex; align-items:stretch; flex-wrap:wrap; gap:8px; margin:4px 0; }
.odds-game-control { flex:1 1 190px; position:relative; }
.odds-shortcuts { display:flex; flex:1.5 1 280px; gap:8px; }
.odds-page :is(.odds-game-trigger,.odds-shortcuts a,.odds-btn,.odds-add,.odds-icon-btn,.odds-suits button) {
    box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:7px;
    min-height:44px; border-radius:10px; border:1px solid #56738d; color:#edf7ff;
    background:linear-gradient(175deg,#233f58,#102338 76%); box-shadow:inset 0 1px 0 #ffffff22,0 2px 5px #0004;
    padding:7px 11px; font-size:14px; line-height:1.2; font-family:inherit; font-weight:650; text-decoration:none; cursor:pointer;
}
.odds-page .odds-game-trigger { width:100%; justify-content:flex-start; background:linear-gradient(160deg,#184e80,#102e50); border-color:#649dcb; }
.odds-game-trigger .odds-chevron { margin-left:auto; transition:transform .16s; }
.odds-game-trigger[aria-expanded=true] .odds-chevron { transform:rotate(180deg); }
.odds-shortcuts a { flex:1; white-space:nowrap; font-size:clamp(12px,3.2vw,15px); }
.odds-shortcuts svg,.odds-btn svg,.odds-seat-name svg,.odds-add svg { color:#a2d7ff; flex:none; }
.odds-game-menu { position:absolute; z-index:30; top:calc(100% + 4px); left:0; width:max(100%,210px); box-sizing:border-box;
    padding:5px; background:#0c1c2d; border:1px solid #7090ab; border-radius:12px; box-shadow:0 12px 26px #0009; }
.odds-game-menu button { width:100%; min-height:44px; display:flex; align-items:center; justify-content:space-between; padding:8px 12px; color:#edf7ff; background:transparent; border:0; border-radius:7px; font:inherit; cursor:pointer; }
.odds-game-menu button[aria-checked=true] { background:#174b7a; }
.odds-page .odds-main > .odds-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
.odds-page .odds-actions .odds-btn,.odds-page .odds-presets .odds-btn { background:linear-gradient(175deg,#233f58,#102338 76%); border-color:#56738d; border-radius:9px; }
.odds-page .odds-main > .odds-actions .odds-btn:last-child,.odds-page .odds-card-dialog .odds-btn { background:linear-gradient(165deg,#236db8,#104780); border:1px solid #69abdc; color:white; }
.odds-main > .odds-actions .odds-btn:last-child { grid-column:1/-1; }
.odds-page .odds-add { justify-self:start; align-self:start; }
.odds-page .odds-seat-name:not(.odds-seat-name--static):hover { color:#a9ddff; }
.odds-page .odds-slot__face--empty { border-style:solid; border-color:#47647c; background:linear-gradient(155deg,#1a334a,#081421); color:#a9cbe3; }
.odds-page .odds-slot__face--empty svg { border-radius:50%; background:#203c55; box-sizing:content-box; padding:3px; }
.odds-page .odds-suits { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin:0 0 14px; }
.odds-page .odds-suits button { position:relative; color:var(--suit-color); }
.odds-suits svg { fill:currentColor; stroke-width:1.5; transition:transform .16s ease; }
.odds-page .odds-suits button[aria-pressed=true] { border-color:var(--suit-color); background:linear-gradient(160deg,#26455e,#111e2e); }
.odds-suits button[aria-pressed=true]::after { content:''; position:absolute; bottom:3px; width:20px; height:2px; background:currentColor; border-radius:2px; }
.odds-suits button[aria-pressed=true] svg { transform:translateY(-2px) scale(1.1); }
.odds-page .odds-card-dialog .odds-deck { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,54px),1fr)); gap:7px; align-items:start; }
.odds-page .odds-deck .odds-pick { display:block; min-height:0; padding:0; border:0; background:white; overflow:hidden; box-shadow:0 1px 3px #0008; }
.odds-page .odds-deck .odds-pick img,.odds-page .odds-slot__face img { position:static; display:block; width:100%; height:auto !important; aspect-ratio:5/7; object-fit:contain; image-rendering:auto; }
.odds-page .odds-deck .odds-pick:disabled { opacity:.32; }
.odds-page :is(button,a):focus-visible { outline:2px solid #a4dfff; outline-offset:2px; }
@media(hover:hover) {
    .odds-page :is(.odds-btn,.odds-game-trigger,.odds-shortcuts a,.odds-add,.odds-icon-btn,.odds-game-menu button,.odds-suits button,.odds-pick,.odds-slot):hover:not(:disabled) { filter:brightness(1.18); }
}
.odds-page :is(.odds-btn,.odds-add,.odds-game-trigger,.odds-shortcuts a,.odds-pick,.odds-slot,.odds-suits button):active:not(:disabled) { transform:translateY(1px); }
@media(min-width:500px) { .odds-page .odds-main > .odds-actions { grid-template-columns:repeat(4,minmax(0,1fr)); } }
@media(prefers-reduced-motion:reduce) { .odds-page .odds-suits svg,.odds-game-trigger .odds-chevron { transition:none; } }

@media (max-width:600px) {
    .odds-reference-section table, .odds-reference-section tbody, .odds-reference-section tr { display:block; }
    .odds-reference-section thead { position:absolute; clip-path:inset(50%); width:1px; height:1px; overflow:hidden; }
    .odds-reference-section td { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
    .odds-reference-section td::before { content:attr(data-label); color:#afc4d9; font:500 12px system-ui; }
    .odds-reference-section td:first-child { padding-top:16px!important; font-weight:bold; }
}
`;
