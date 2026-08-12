/**
 * TRIVIA LOBBY - Main trivia hub with Futuristic Metal UI
 * Skeuomorphic Sci-Fi design with metal frames, neon accents, and industrial aesthetic
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Trophy, BookOpen, GraduationCap, Gem, Heart, Infinity, Shuffle, Swords, Calendar, Target, Banknote, Calculator, Brain, Flame } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';
import PortholeIcon from '../ui/PortholeIcon';
import useVIPGate from '../../hooks/useVIPGate';
import VIPGateModal from '../ui/VIPGateModal';
// The lobby no longer bills, so supabase / EventBus / getAuthUser are gone with
// deductDiamonds. Entry price now comes from the engine config only.
import { getModeConfig } from '../../lib/trivia/triviaEngine';

// Pre-computed particle positions to avoid Math.random() hydration mismatches
const SUITS = ['♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣'];
const SUIT_PARTICLES = SUITS.map((suit, i) => ({
    suit,
    left: (i / 16) * 100 + (((i * 7 + 3) % 10) * 0.6),
    delay: i * 1.2 + (((i * 13 + 5) % 10) * 0.2),
    duration: 8 + (((i * 11 + 7) % 10) * 0.6),
    fontSize: 14 + (((i * 17 + 2) % 10) * 1.2),
}));

const ACKNOWLEDGED_KEY = 'trivia_charge_acknowledged';

/**
 * ENTRY PRICING — display only.
 * ═══════════════════════════════════════════════════════════════════════════
 * The lobby no longer charges anything. It used to deduct a flat 10 diamonds
 * and then write sessionStorage('trivia_paid') for the destination page to
 * trust, which was broken two ways:
 *   1. The "receipt" was a client-side string. Anyone could set it in devtools
 *      and play every paid mode free.
 *   2. The lobby charged 10 for history/rules/pro even though those modes have
 *      diamondCost: 0, so the SAME game was free by direct URL and 10 diamonds
 *      from the lobby.
 * Every destination page already performs its own server-verified charge (a
 * DiamondEngine/RPC deduction with an idempotency key). That charge is now the
 * only entitlement, so lobby entry and direct-URL entry cost exactly the same.
 *
 * The price shown comes straight from TRIVIA_MODES.diamondCost — the local
 * PAGE_ENTRY_COSTS override table that used to live here is gone, because the
 * engine config now carries the real number for every paid mode (mtt/cash/
 * icm/gto/mixed/endless/survival/time-attack). One table, so the lobby price
 * and the direct-URL price cannot drift apart again.
 */

/** What the user will actually be charged when they enter this mode. */
function getEntryCost(modeId) {
    const configured = getModeConfig(modeId)?.diamondCost;
    return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

/** Modes whose entry price is a stake / tournament fee rather than fixed. */
const VARIABLE_COST_MODES = new Set(['pvp', 'tournaments']);

const MODE_CARDS = [
    // TOP ROW - Strategy Modes (MTT, Cash, GTO)
    {
        id: 'mtt',
        name: 'MTT Scenarios',
        description: 'Multi-table Tournament Situations and Decisions',
        icon: Target,
        color: '#f97316',
        glowColor: '#f97316',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/mtt-scenarios.webp?v=v6'
    },
    {
        id: 'cash',
        name: 'Cash Game',
        description: 'Deep Stack Scenarios, Implied Odds, Table Dynamics',
        icon: Banknote,
        color: '#31a24c',
        glowColor: '#31a24c',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/cash-game.webp?v=v6'
    },
    {
        id: 'icm',
        name: 'ICM & Chip EV',
        description: 'Tournament Equity, Chip Value vs $EV Decisions',
        icon: Calculator,
        color: '#2374e1',
        glowColor: '#2374e1',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/icm-chip-ev.webp?v=v6'
    },
    // ROW 2 - Core Trivia
    {
        id: 'history',
        name: 'Poker History',
        description: 'Iconic Moments, Famous Hands, Legendary Players',
        icon: Trophy,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/poker-history.webp?v=v6'
    },
    {
        id: 'tournaments',
        name: 'Tournaments',
        description: 'Weekly Competitions with Big Prizes!',
        icon: Calendar,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 'Prize pool',
        perfectBonus: null,
        image: '/images/trivia/tournaments.webp?v=v6'
    },
    {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy Concepts, GTO Basics, Advanced Trivia',
        icon: GraduationCap,
        color: '#9D4EDD',
        glowColor: '#9D4EDD',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/pro-knowledge.webp?v=v6'
    },
    // ROW 3 - Challenge Modes
    {
        id: 'survival',
        name: 'Survival Mode',
        description: '10 Levels, 20 Questions Each. All Categories Combined!',
        icon: Heart,
        color: '#f02849',
        glowColor: '#f02849',
        diamondReward: '10+',
        perfectBonus: null,
        image: '/images/trivia/survival-mode-v2.webp?v=v6'
    },
    {
        id: 'endless',
        name: 'Endless Mode',
        description: 'All Questions, Random Order. Answer Until You Miss!',
        icon: Infinity,
        color: '#8b5cf6',
        glowColor: '#8b5cf6',
        diamondReward: '1+/Q',
        perfectBonus: null,
        image: '/images/trivia/endless-mode-v2.webp?v=v6'
    },
    {
        id: 'mixed',
        name: 'Mixed Mode',
        description: 'Rotating Categories: History → Rules → Pro',
        icon: Shuffle,
        color: '#00D4FF',
        glowColor: '#00D4FF',
        diamondReward: '1/Q',
        perfectBonus: null,
        image: '/images/trivia/mixed-mode-v2.webp?v=v6'
    },
    // ROW 4 - Competitive
    {
        id: 'pvp',
        name: '1v1 Battle',
        description: 'Challenge Real Players for Diamonds!',
        icon: Swords,
        color: '#f02849',
        glowColor: '#f02849',
        diamondReward: '2x stake',
        perfectBonus: null,
        image: '/images/trivia/pvp-battle.webp?v=v6'
    },
    {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test Your Understanding of Official Poker Rules',
        icon: BookOpen,
        color: '#4a90d9',
        glowColor: '#4a90d9',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/rules-quiz.webp?v=v6'
    },
    {
        id: 'gto',
        name: 'GTO Master',
        description: 'Solver-based Scenarios Combining MTT, Cash, and ICM',
        icon: Brain,
        color: '#a855f7',
        glowColor: '#a855f7',
        diamondReward: 8,
        perfectBonus: 15,
        image: '/images/trivia/gto-master.webp?v=v6'
    }
];


/**
 * onDiamondsChange is still accepted (index.js passes it) but is intentionally
 * unused: this component no longer moves diamonds, so it has no delta to
 * report. The destination pages emit their own balance updates.
 */
export default function TriviaLobby({ userDiamonds = 0, isVip = false, dailyCompleted = false, currentStreak = 0, onDiamondsChange }) {
    const router = useRouter();
    const [hoveredCard, setHoveredCard] = useState(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Clear any legacy 'already paid' flags left in this session by an
        // older build. Nothing writes them any more, and a stale one would
        // hand out one free paid entry on the destination page.
        try {
            sessionStorage.removeItem('trivia_paid');
            sessionStorage.removeItem('trivia_mode');
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, []);

    // Cost-disclosure state. NOTE: no diamonds move in this component any
    // more — the popup only tells the player what the destination page will
    // charge, and Accept routes them there.
    const [showChargePopup, setShowChargePopup] = useState(false);
    const [pendingMode, setPendingMode] = useState(null);
    const [isRouting, setIsRouting] = useState(false);
    const { allowed, showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('trivia');

    const pendingCost = pendingMode ? getEntryCost(pendingMode) : 0;

    // Route to the correct page for a mode
    const routeToMode = (modeId) => {
        const standaloneRoutes = {
            survival: '/hub/trivia/survival-game',
            endless: '/hub/trivia/endless',
            mixed: '/hub/trivia/mixed',
            pvp: '/hub/trivia/pvp',
            tournaments: '/hub/trivia/tournaments',
        };
        router.push(standaloneRoutes[modeId] || `/hub/trivia/${modeId}`);
    };

    const handleChargeAccept = () => {
        const modeId = pendingMode;
        if (!modeId) return;
        // Remember the disclosure so it is shown once, not once per mode.
        try { localStorage.setItem(ACKNOWLEDGED_KEY, 'true'); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        setIsRouting(true);
        setShowChargePopup(false);
        setPendingMode(null);
        routeToMode(modeId);
    };

    // Synchronous re-entry guard: two fast taps on a card used to run two
    // start flows (and, when this component still billed, two charges).
    const _startModeInFlightRef = useRef(false);
    const startMode = (modeId) => {
        if (_startModeInFlightRef.current) return;
        _startModeInFlightRef.current = true;
        try {
            _startModeInner(modeId);
        } finally {
            // Released on the next tick — the guard only exists to swallow the
            // duplicate click in the same burst.
            setTimeout(() => { _startModeInFlightRef.current = false; }, 400);
        }
    };

    const _startModeInner = (modeId) => {
        // Block daily if already completed
        if (modeId === 'daily' && dailyCompleted) return;

        const cost = getEntryCost(modeId);

        // VIPs and free modes go straight through.
        if (isVip || cost === 0 || VARIABLE_COST_MODES.has(modeId)) {
            routeToMode(modeId);
            return;
        }

        // Client-side balance check is a courtesy only; the destination page
        // re-checks against the database before it charges.
        if (userDiamonds < cost) {
            // devhead replaced the in-lobby top-up card with the shared VIP
            // upgrade gate; that modal is the insufficient-funds surface now.
            showUpgradeModal();
            return;
        }

        let acknowledged = false;
        try { acknowledged = localStorage.getItem(ACKNOWLEDGED_KEY) === 'true'; } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        if (!acknowledged) {
            setPendingMode(modeId);
            setShowChargePopup(true);
            return;
        }

        routeToMode(modeId);
    };

    return (
        <div className="trivia-lobby">

            {/* ════ Floating Card Suit Particles ════ */}
            {mounted && (
                <div className="suit-particles" aria-hidden>
                    {SUIT_PARTICLES.map((p, i) => (
                        <span key={i} className={`suit ${p.suit === '♥' || p.suit === '♦' ? 'red' : ''}`} style={{
                            left: `${p.left}%`,
                            animationDelay: `${p.delay}s`,
                            animationDuration: `${p.duration}s`,
                            fontSize: `${p.fontSize}px`,
                        }}>{p.suit}</span>
                    ))}
                </div>
            )}

            {/* Daily Trivia Hero Card - Image Based.
                The wrapper keeps its mouse affordance; keyboard and
                screen-reader users are served by the labelled inner button. */}
            <div
                className="daily-trivia-banner"
                onClick={() => !dailyCompleted && startMode('daily')}
                style={{ cursor: dailyCompleted ? 'default' : 'pointer' }}
            >
                <img
                    src="/images/trivia/daily-trivia-header-final.webp?v=v6"
                    alt="Daily Trivia - 10 Questions Fresh Every Day"
                    className="daily-trivia-banner__image"
                    width={1024}
                    height={309}
                    fetchPriority="high"
                    decoding="async"
                />
                {/* Clickable button overlay positioned over the START DAILY TRIVIA button */}
                <button
                    type="button"
                    className="daily-trivia-banner__button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!dailyCompleted) startMode('daily');
                    }}
                    disabled={dailyCompleted}
                    aria-label={dailyCompleted ? 'Daily Trivia Completed' : 'Start Daily Trivia — free, once per day'}
                />
                {currentStreak > 0 && !dailyCompleted && (
                    <div className="daily-streak-chip" title={`${currentStreak} day streak`}>
                        <Flame size={14} aria-hidden />
                        <span>Day {currentStreak} — keep it alive!</span>
                    </div>
                )}
                {dailyCompleted && (
                    <div className="daily-trivia-banner__completed">
                        <span>
                            COMPLETED
                            {currentStreak > 0 ? ` — ${currentStreak} DAY STREAK` : ''}
                        </span>
                    </div>
                )}
            </div>


            {/* Mode Cards Section */}
            <div className="modes-section">

                <div className="modes-grid">
                    {MODE_CARDS.map((mode, cardIdx) => {
                        const Icon = mode.icon;
                        const isHovered = hoveredCard === mode.id;

                        // Use image-based card if mode has an image
                        if (mode.image) {
                            const cost = getEntryCost(mode.id);
                            const variableCost = VARIABLE_COST_MODES.has(mode.id);
                            const costText = isVip
                                ? 'VIP: free'
                                : variableCost
                                    ? 'Stake to play'
                                    : cost > 0 ? `${cost} to play` : 'Free';
                            const rewardText = typeof mode.diamondReward === 'number'
                                ? `+${mode.diamondReward}${mode.perfectBonus ? ` / perfect +${mode.perfectBonus}` : ''}`
                                : (mode.diamondReward ? String(mode.diamondReward) : '');

                            // A real <button>: these image cards were click-only
                            // divs, so the whole lobby was unreachable by keyboard,
                            // and the price was only revealed by the popup.
                            return (
                                <button
                                    key={mode.id}
                                    type="button"
                                    className="mode-image-card"
                                    onMouseEnter={() => setHoveredCard(mode.id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    onFocus={() => setHoveredCard(mode.id)}
                                    onBlur={() => setHoveredCard(null)}
                                    onClick={() => startMode(mode.id)}
                                    aria-label={`${mode.name}. ${mode.description}. ${costText}${rewardText ? `. Reward ${rewardText} diamonds` : ''}.`}
                                    style={isHovered ? { boxShadow: `0 8px 30px ${mode.color}55` } : undefined}
                                >
                                    <img
                                        src={mode.image}
                                        alt=""
                                        aria-hidden
                                        className="mode-image-card__img"
                                        width={1024}
                                        height={1024}
                                        loading={cardIdx < 3 ? 'eager' : 'lazy'}
                                        decoding="async"
                                    />
                                    <span className="mode-image-card__strip" aria-hidden>
                                        <span className="mode-image-card__name" style={{ color: mode.color }}>{mode.name}</span>
                                        <span className="mode-image-card__meta">
                                            <span className="mode-chip">{costText}</span>
                                            {rewardText && (
                                                <span className="mode-chip reward">
                                                    <Gem size={10} /> {rewardText}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                </button>
                            );
                        }

                        // Fallback to MetalFrame for modes without images
                        return (
                            <MetalFrame
                                key={mode.id}
                                padding="24px 20px"
                                showBolts={true}
                                showNeonStrips={false}
                                variant={isHovered ? 'elevated' : 'flat'}
                                className="mode-card"
                                style={{
                                    '--mode-color': mode.color,
                                    cursor: 'pointer'
                                }}
                            >
                                <div
                                    className="mode-card__inner"
                                    onMouseEnter={() => setHoveredCard(mode.id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    onClick={() => startMode(mode.id)}
                                >
                                    {/* Left neon strip accent */}
                                    <div
                                        className="mode-accent-strip"
                                        style={{ background: mode.color, boxShadow: `0 0 10px ${mode.color}, 0 0 20px ${mode.color}80` }}
                                    />

                                    <PortholeIcon
                                        icon={Icon}
                                        size={60}
                                        glowColor={mode.glowColor}
                                        animated={isHovered}
                                    />

                                    <h3 className="mode-name" style={{ color: mode.color }}>
                                        {mode.name}
                                    </h3>
                                    <p className="mode-description">{mode.description}</p>


                                    <HexButton
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startMode(mode.id);
                                        }}
                                        variant="primary"
                                        size="sm"
                                        fullWidth
                                    >
                                        START
                                    </HexButton>
                                </div>
                            </MetalFrame>
                        );
                    })}
                </div>


                {/* Daily Refresh Notice removed */}
            </div>

            {/* Quick Stakes Section - Landscape Banner */}
            <div className="quick-stakes-section">
                <button
                    type="button"
                    className="quick-stakes-banner"
                    onClick={() => startMode('arcade')}
                    aria-label={`Quick Stakes — timed arcade round. ${isVip ? 'Free for VIP' : `Entry ${getEntryCost('arcade')} diamonds`}.`}
                >
                    <img
                        src="/images/trivia/quick-stakes.webp?v=v6"
                        alt=""
                        aria-hidden
                        className="quick-stakes-banner__img"
                        loading="lazy"
                        decoding="async"
                    />
                    <span className="quick-stakes-banner__chip" aria-hidden>
                        {isVip ? 'VIP: free' : <>{getEntryCost('arcade')} <Gem size={11} /> to play</>}
                    </span>
                </button>
            </div>

            <style>{`
                .trivia-lobby {
                    padding: 0 20px 20px;
                    max-width: 1000px;
                    margin: 0 auto;
                    font-family: 'Rajdhani', 'Orbitron', sans-serif;
                    position: relative;
                    overflow: hidden;
                }

                /* ═══ Floating Card Suit Particles ═══ */
                .suit-particles {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    z-index: 0;
                    overflow: hidden;
                }
                .suit {
                    position: absolute;
                    bottom: -30px;
                    color: rgba(255, 255, 255, 0.03);
                    animation: suitFloat linear infinite;
                    opacity: 0;
                }
                .suit.red {
                    color: rgba(240, 40, 73, 0.04);
                }
                @keyframes suitFloat {
                    0% { transform: translateY(0) rotate(0deg); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 0.5; }
                    100% { transform: translateY(-800px) rotate(360deg); opacity: 0; }
                }


                /* Daily Trivia Banner - Image Based */
                .daily-trivia-banner {
                    position: relative;
                    width: 100%;
                    margin-bottom: 8px;
                    border-radius: 0;
                    overflow: visible;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }

                .daily-trivia-banner:hover {
                    transform: scale(1.01);
                    box-shadow: 0 0 30px rgba(35, 116, 225, 0.3);
                }

                .daily-trivia-banner__image {
                    width: 100%;
                    height: auto;
                    display: block;
                }

                .daily-trivia-banner__button {
                    position: absolute;
                    top: 25%;
                    right: 3%;
                    width: 28%;
                    height: 50%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 2;
                    transition: background 0.2s ease;
                }

                .daily-trivia-banner__button:hover:not(:disabled) {
                    background: rgba(35, 116, 225, 0.1);
                    border-radius: 8px;
                }

                .daily-trivia-banner__button:disabled {
                    cursor: default;
                }

                .daily-trivia-banner__completed {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 3;
                }

                .daily-trivia-banner__completed span {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    font-weight: 700;
                    color: #31a24c;
                    text-shadow: 0 0 20px rgba(49, 162, 76, 0.8);
                    letter-spacing: 0.1em;
                }



                /* Modes Section */
                .modes-section {
                    margin-top: 8px;
                }



                .modes-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                    align-items: center;
                }

                @media (max-width: 680px) {
                    .trivia-lobby {
                        padding: 0 8px 16px !important;
                    }
                    .daily-trivia-banner {
                        margin-bottom: 6px;
                    }
                    .daily-trivia-banner__completed span {
                        font-size: 20px;
                    }
                    .modes-section {
                        margin-top: 4px;
                    }
                    .modes-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 8px !important;
                        align-items: center !important;
                    }
                    .mode-image-card {
                        border-radius: 8px !important;
                    }
                    .mode-image-card__img {
                        border-radius: 6px !important;
                        height: auto !important;
                    }
                    .quick-stakes-section {
                        margin-top: 12px !important;
                    }
                    .quick-stakes-banner__img {
                        border-radius: 6px !important;
                    }
                }

                /* Mode Card */
                .mode-card__inner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    min-height: 220px;
                    position: relative;
                }

                .mode-accent-strip {
                    position: absolute;
                    left: -20px;
                    top: 10%;
                    bottom: 10%;
                    width: 4px;
                    border-radius: 2px;
                }

                .mode-name {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    margin: 12px 0 8px 0;
                    text-shadow: 0 0 10px currentColor;
                }

                .mode-description {
                    font-size: 13px;
                    color: #65676b;
                    margin: 0 0 auto 0;
                    line-height: 1.4;
                }



                .mode-card--locked {
                    filter: grayscale(50%);
                }

                /* Image-based Mode Cards (now <button> — reset UA styles) */
                .mode-image-card {
                    position: relative;
                    display: block;
                    width: 100%;
                    padding: 0;
                    background: none;
                    border: none;
                    font: inherit;
                    color: inherit;
                    text-align: left;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    animation: cardEntrance 0.5s ease backwards;
                    transition: transform 0.25s ease, box-shadow 0.25s ease;
                }
                .mode-image-card:focus-visible,
                .quick-stakes-banner:focus-visible,
                .daily-trivia-banner__button:focus-visible {
                    outline: 2px solid #00D4FF;
                    outline-offset: 3px;
                }

                /* Text strip: name + real entry cost / reward, so players can
                   compare modes without memorizing the artwork. */
                .mode-image-card__strip {
                    position: absolute;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: 18px 10px 8px;
                    background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.85));
                    pointer-events: none;
                }
                .mode-image-card__name {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.03em;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
                }
                .mode-image-card__meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                .mode-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    padding: 2px 7px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.12);
                    color: rgba(255, 255, 255, 0.85);
                    font-size: 10px;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .mode-chip.reward {
                    background: rgba(35, 116, 225, 0.25);
                    color: #9ecbff;
                }
                .mode-image-card:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 8px 30px rgba(35, 116, 225, 0.2);
                }
                .mode-image-card:nth-child(1) { animation-delay: 0s; }
                .mode-image-card:nth-child(2) { animation-delay: 0.06s; }
                .mode-image-card:nth-child(3) { animation-delay: 0.12s; }
                .mode-image-card:nth-child(4) { animation-delay: 0.18s; }
                .mode-image-card:nth-child(5) { animation-delay: 0.24s; }
                .mode-image-card:nth-child(6) { animation-delay: 0.3s; }
                .mode-image-card:nth-child(7) { animation-delay: 0.36s; }
                .mode-image-card:nth-child(8) { animation-delay: 0.42s; }
                .mode-image-card:nth-child(9) { animation-delay: 0.48s; }
                .mode-image-card:nth-child(10) { animation-delay: 0.54s; }
                .mode-image-card:nth-child(11) { animation-delay: 0.6s; }
                .mode-image-card:nth-child(12) { animation-delay: 0.66s; }

                @keyframes cardEntrance {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                .mode-image-card__img {
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 8px;
                    pointer-events: none;
                }

                /* Quick Stakes Banner - landscape format, matching Daily Trivia size */
                .quick-stakes-banner {
                    position: relative;
                    display: block;
                    width: 100%;
                    padding: 0;
                    background: none;
                    border: none;
                    border-radius: 0;
                    overflow: hidden;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    aspect-ratio: 1817 / 866; /* matches quick-stakes.webp exactly - the
                       banner is object-fit: cover, so a mismatched box
                       silently crops the artwork top and bottom */
                }

                .quick-stakes-banner__chip {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 999px;
                    background: rgba(0, 0, 0, 0.6);
                    border: 1px solid rgba(35, 116, 225, 0.45);
                    color: #9ecbff;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    pointer-events: none;
                }

                /* Streak chip on the daily banner */
                .daily-streak-chip {
                    position: absolute;
                    left: 3%;
                    bottom: 8%;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 12px;
                    border-radius: 999px;
                    background: rgba(0, 0, 0, 0.65);
                    border: 1px solid rgba(249, 115, 22, 0.45);
                    color: #f97316;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.03em;
                    z-index: 3;
                    pointer-events: none;
                }

                .quick-stakes-banner:hover {
                    transform: scale(1.02);
                    box-shadow: 0 0 30px rgba(35, 116, 225, 0.3);
                }

                .quick-stakes-banner__img {
                    width: 100%;
                    height: 100%;
                    display: block;
                    pointer-events: none;
                    object-fit: cover;
                    object-position: center;
                }

                .mode-image-card__lock {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.7);
                    border-radius: 50%;
                    padding: 16px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .mode-image-card--locked {
                    filter: grayscale(50%);
                    cursor: not-allowed;
                }

                /* Daily Refresh Notice */
                .daily-refresh-notice {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    margin-top: 20px;
                    padding: 12px 16px;
                    background: rgba(255, 135, 0, 0.1);
                    border: 1px solid rgba(255, 135, 0, 0.3);
                    border-radius: 8px;
                    color: #FF8700;
                    font-size: 13px;
                    font-weight: 500;
                }

                /* Quick Stakes Section */
                .quick-stakes-section {
                    margin-top: 8px;
                }

                .qs-header {
                    display: flex;
                    align-items: baseline;
                }

                @media (max-width: 600px) {
                    .daily-hero__layout {
                        flex-direction: column;
                    }
                }

                /* ═══════ VIP GATING POPUPS ═══════ */
                .gate-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(6px);
                    animation: gateFadeIn 0.2s ease;
                }
                @keyframes gateFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                /* Deducting overlay */
                .deducting-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9998;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(3px);
                }
                .deducting-spinner {
                    width: 36px;
                    height: 36px;
                    border: 3px solid rgba(35, 116, 225, 0.2);
                    border-top-color: #2374e1;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                /* The modal spinner was wrapped in .dm-spinner-overlay, which
                   had no rule anywhere — it rendered in normal flow BELOW the
                   modal image instead of over it. */
                .dm-spinner-overlay {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.45);
                    border-radius: 16px;
                }

                /* Tap targets + motion preferences */
                .gate-btn,
                .daily-trivia-banner__button {
                    min-height: 44px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .suit-particles { display: none; }
                    .mode-image-card {
                        animation: none;
                    }
                    .mode-image-card:hover,
                    .quick-stakes-banner:hover,
                    .daily-trivia-banner:hover,
                    .gate-btn--accept:hover,
                    .gate-btn--store:hover {
                        transform: none;
                    }
                }

                /* ═══════ DYNAMIC DIAMOND MODAL ═══════ */
                .diamond-modal {
                    position: relative;
                    width: 90%;
                    max-width: 440px;
                    margin: 0 auto;
                }

                .diamond-modal__bg {
                    width: 100%;
                    height: auto;
                    display: block;
                    user-select: none;
                    -webkit-user-drag: none;
                }

                /* Base Hitbox */
                .dm-hitbox {
                    position: absolute;
                    cursor: pointer;
                    background: transparent;
                    border: none;
                    outline: none;
                    padding: 0;
                    -webkit-tap-highlight-color: transparent;
                }
                
                /* Remove hover effects per requirements */
                .dm-hitbox:hover {
                    transform: none;
                    box-shadow: none;
                    background: transparent;
                }

                /* Hitbox regions (percentages tuned to the 946x1024 image) */
                .dm-close {
                    top: 15.5%;
                    right: 20%;
                    width: 9%;
                    height: 8.5%;
                    border-radius: 50%;
                }

                .dm-vip {
                    top: 71%;
                    left: 20%;
                    width: 29%;
                    height: 8%;
                    border-radius: 12px;
                }

                .dm-accept {
                    top: 71%;
                    right: 18%;
                    width: 31%;
                    height: 8%;
                    border-radius: 12px;
                }

                /* Dynamic Balance Box */
                .dm-balance {
                    position: absolute;
                    bottom: 11.5%;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 45%;
                    height: 7%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    color: #4df8ff;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 18px;
                    font-weight: 700;
                    text-shadow: 0 0 10px rgba(77, 248, 255, 0.4);
                    pointer-events: none;
                }
            `}</style>

            {/* ═══════ DIAMOND CHARGE POPUP (first-time only) ═══════ */}
            {
                showChargePopup && (
                    <div className="gate-overlay" onClick={() => { setShowChargePopup(false); setPendingMode(null); }}>
                        <div className="diamond-modal" onClick={e => e.stopPropagation()}>
                            <img
                                src="/images/trivia/diamond-entry-modal.webp?v=v6"
                                alt="Diamond Entry Modal"
                                className="diamond-modal__bg"
                                width={946}
                                height={1024}
                                decoding="async"
                            />

                            {/* Close Button hit area */}
                            <button
                                type="button"
                                className="dm-hitbox dm-close"
                                onClick={() => {
                                    navigator.vibrate?.(50);
                                    setShowChargePopup(false);
                                    setPendingMode(null);
                                }}
                                aria-label="Close"
                            />

                            {/* Upgrade to VIP hit area */}
                            <button
                                type="button"
                                className="dm-hitbox dm-vip"
                                onClick={() => {
                                    navigator.vibrate?.(50);
                                    router.push('/hub/vip');
                                }}
                                aria-label="Upgrade to VIP"
                            />

                            {/* Accept & Play hit area. This no longer charges:
                                it acknowledges the price and routes to the mode,
                                which performs the real server-side deduction. */}
                            <button
                                type="button"
                                className="dm-hitbox dm-accept"
                                onClick={() => {
                                    navigator.vibrate?.(50);
                                    handleChargeAccept();
                                }}
                                disabled={isRouting}
                                aria-label={`Accept the ${pendingCost} diamond entry and play`}
                            />

                            {/* Dynamic Diamond Balance */}
                            <div className="dm-balance">
                                {userDiamonds} diamonds
                            </div>

                            {isRouting && (
                                <div className="dm-spinner-overlay">
                                    <div className="deducting-spinner" />
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* ═══════ VIP UPGRADE GATE ═══════ */}
            <VIPGateModal 
                visible={upgradeModalVisible}
                onClose={hideUpgradeModal}
                featureName="Unlimited Trivia Sessions"
                featureConfig={featureConfig}
            />

            {/* Routing spinner overlay */}
            {
                isRouting && !showChargePopup && (
                    <div className="deducting-overlay">
                        <div className="deducting-spinner" />
                    </div>
                )
            }
        </div >
    );
}
