/**
 * TRIVIA LOBBY - Main trivia hub with Futuristic Metal UI
 * Skeuomorphic Sci-Fi design with metal frames, neon accents, and industrial aesthetic
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Trophy, BookOpen, GraduationCap, Gem, Heart, Infinity, Shuffle, Swords, Calendar, Target, Banknote, Calculator, Brain } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';
import PortholeIcon from '../ui/PortholeIcon';
import { supabase } from '../../lib/supabase';
import { busEmit } from '../../engine/EventBus';
import { getAuthUser } from '../../lib/authUtils';
import useVIPGate from '../../hooks/useVIPGate';
import VIPGateModal from '../ui/VIPGateModal';

// Pre-computed particle positions to avoid Math.random() hydration mismatches
const SUITS = ['♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣'];
const SUIT_PARTICLES = SUITS.map((suit, i) => ({
    suit,
    left: (i / 16) * 100 + (((i * 7 + 3) % 10) * 0.6),
    delay: i * 1.2 + (((i * 13 + 5) % 10) * 0.2),
    duration: 8 + (((i * 11 + 7) % 10) * 0.6),
    fontSize: 14 + (((i * 17 + 2) % 10) * 1.2),
}));

const GAME_COST = 10; // diamonds per game for non-VIP
const ACKNOWLEDGED_KEY = 'trivia_charge_acknowledged';

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
        image: '/images/trivia/mtt-scenarios.webp?v=v5'
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
        image: '/images/trivia/cash-game.webp?v=v5'
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
        image: '/images/trivia/icm-chip-ev.webp?v=v5'
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
        image: '/images/trivia/poker-history.webp?v=v5'
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
        image: '/images/trivia/tournaments.webp?v=v5'
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
        image: '/images/trivia/pro-knowledge.webp?v=v5'
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
        image: '/images/trivia/survival-mode-v2.webp?v=v5'
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
        image: '/images/trivia/endless-mode-v2.webp?v=v5'
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
        image: '/images/trivia/mixed-mode-v2.webp?v=v5'
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
        image: '/images/trivia/pvp-battle.webp?v=v5'
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
        image: '/images/trivia/rules-quiz.webp?v=v5'
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
        image: '/images/trivia/gto-master.webp?v=v5'
    }
];


export default function TriviaLobby({ userDiamonds = 0, isVip = false, dailyCompleted = false, currentStreak = 0, onDiamondsChange }) {
    const router = useRouter();
    const [hoveredCard, setHoveredCard] = useState(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // VIP Gating state
    const [showChargePopup, setShowChargePopup] = useState(false);
    const [pendingMode, setPendingMode] = useState(null);
    const [isDeducting, setIsDeducting] = useState(false);
    const { allowed, showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('trivia');

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

    // Phase 56 fix: synchronous re-entry guard via ref. setIsDeducting() is
    // async and does not block subsequent calls before React re-renders, so a
    // user double-clicking the start button (or routing handler firing twice
    // from a race) could trigger two simultaneous deductDiamonds() calls.
    const _deductInFlightRef = useRef(false);
    // Phase 56 fix: per-(user, mode) idempotency token cached in a ref so all
    // retries during this component's lifecycle use the SAME reference_id.
    // The DB's idempotency table will dedup any double-fire. Was previously
    // generating a fresh UUID + Date.now() on every call, which deliberately
    // defeated DB idempotency — a double-click that snuck past the in-flight
    // guard would charge the user TWICE for one game.
    const _idempotencyTokens = useRef({});
    const _getIdempotencyToken = (mode) => {
        if (!_idempotencyTokens.current[mode]) {
            _idempotencyTokens.current[mode] = `trivia_entry_${mode}_${crypto.randomUUID()}`;
        }
        return _idempotencyTokens.current[mode];
    };
    const _clearIdempotencyToken = (mode) => {
        delete _idempotencyTokens.current[mode];
    };

    // Deduct diamonds via Supabase
    const deductDiamonds = async (modeId = null) => {
        if (_deductInFlightRef.current) {
            console.warn('[TriviaLobby] deductDiamonds already in-flight — ignored duplicate');
            return false;
        }
        _deductInFlightRef.current = true;
        try {
            const user = getAuthUser();
            if (!user) return false;
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .maybeSingle();
            if (!profile || (profile.diamonds || 0) < GAME_COST) return false;
            const refId = _getIdempotencyToken(modeId || 'unknown');
            const { error: __rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: user.id,
                p_amount: -GAME_COST,
                p_type: 'game_cost',
                p_description: `Trivia game entry — ${GAME_COST}diamonds`,
                p_reference_id: refId,
            });
            if (__rpcErr) throw __rpcErr;
            // Successful charge — invalidate the token so the NEXT game generates
            // a fresh one (otherwise the user couldn't play the same mode twice
            // in one component lifecycle, since the second call would dedup).
            _clearIdempotencyToken(modeId || 'unknown');
            onDiamondsChange?.(-GAME_COST);
            busEmit.diamondsSpent(GAME_COST, 'Trivia Game Entry');
            return true;
        } catch (err) {
            console.warn('Diamond deduction failed:', err);
            return false;
        } finally {
            _deductInFlightRef.current = false;
        }
    };

    // Handle charge popup acceptance.
    // Phase 70: was missing a synchronous re-entry guard at the handler
    // boundary — `disabled={isDeducting}` on the button doesn't help during
    // the same React batch, and `_deductInFlightRef` blocks the SECOND
    // deductDiamonds call (correct), but causes the second handleChargeAccept
    // to see success=false and trigger the top-up popup, falsely telling
    // the user they're out of diamonds AFTER a successful charge. A
    // dedicated ref at the handler level avoids the misleading UX.
    const _chargeAcceptInFlightRef = useRef(false);
    const handleChargeAccept = async () => {
        if (_chargeAcceptInFlightRef.current) return;
        _chargeAcceptInFlightRef.current = true;
        setIsDeducting(true);
        try {
            const success = await deductDiamonds(pendingMode);
            if (success) {
                // Mark as acknowledged — popup never shows again
                try { localStorage.setItem(ACKNOWLEDGED_KEY, 'true'); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                // Signal downstream pages that payment was already made
                try {
                    sessionStorage.setItem('trivia_paid', 'true');
                    sessionStorage.setItem('trivia_mode', pendingMode);
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                setShowChargePopup(false);
                routeToMode(pendingMode);
                setPendingMode(null);
            } else {
                // Deduction failed (insufficient) — show top-up
                setShowChargePopup(false);
                showUpgradeModal();
            }
        } finally {
            setIsDeducting(false);
            _chargeAcceptInFlightRef.current = false;
        }
    };

    // Phase 70: synchronous re-entry guard prevents rapid clicks on a
    // mode card from firing two startMode flows. With Phase 56's
    // _deductInFlightRef the SECOND call's deduct is blocked, but
    // success=false flowed back to showUpgradeModal(), falsely
    // telling the user they're out of diamonds. This ref short-circuits
    // before any state changes.
    const _startModeInFlightRef = useRef(false);
    const startMode = async (modeId) => {
        if (_startModeInFlightRef.current) return;
        _startModeInFlightRef.current = true;
        try {
            await _startModeInner(modeId);
        } finally {
            _startModeInFlightRef.current = false;
        }
    };

    const _startModeInner = async (modeId) => {
        // Block daily if already completed
        if (modeId === 'daily' && dailyCompleted) return;

        // === VIP members: free access to everything ===
        if (isVip) {
            routeToMode(modeId);
            return;
        }

        // === Non-VIP: Daily trivia is free (once/day) ===
        if (modeId === 'daily') {
            routeToMode(modeId);
            return;
        }

        // === Standalone modes handle their own billing ===
        // These pages have their own diamond deduction, balance checks, and BUS emits.
        // TriviaLobby must NOT deduct here or users get double-charged.
        const SELF_BILLING_MODES = ['survival', 'endless', 'mixed', 'pvp', 'tournaments'];
        if (SELF_BILLING_MODES.includes(modeId)) {
            routeToMode(modeId);
            return;
        }

        // === Non-VIP: All other modes cost 10 diamonds ===
        // Check if user has previously acknowledged the charge popup
        let acknowledged = false;
        try { acknowledged = localStorage.getItem(ACKNOWLEDGED_KEY) === 'true'; } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        if (!acknowledged) {
            // FIRST TIME: Show confirmation popup
            if (userDiamonds < GAME_COST) {
                showUpgradeModal();
                return;
            }
            setPendingMode(modeId);
            setShowChargePopup(true);
            return;
        }

        // RETURNING USER: Auto-deduct silently
        if (userDiamonds < GAME_COST) {
            showUpgradeModal();
            return;
        }

        setIsDeducting(true);
        const success = await deductDiamonds(modeId);
        setIsDeducting(false);
        if (success) {
            // Signal downstream pages that payment was already made
            try {
                sessionStorage.setItem('trivia_paid', 'true');
                sessionStorage.setItem('trivia_mode', modeId);
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            routeToMode(modeId);
        } else {
            showUpgradeModal();
        }
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

            {/* Daily Trivia Hero Card - Image Based */}
            <div
                className="daily-trivia-banner"
                onClick={() => !dailyCompleted && startMode('daily')}
                style={{ cursor: dailyCompleted ? 'default' : 'pointer' }}
            >
                <img
                    src="/images/trivia/daily-trivia-header-final.png?v=2"
                    alt="Daily Trivia - 10 Questions Fresh Every Day"
                    className="daily-trivia-banner__image"
                />
                {/* Clickable button overlay positioned over the START DAILY TRIVIA button */}
                <button
                    className="daily-trivia-banner__button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!dailyCompleted) startMode('daily');
                    }}
                    disabled={dailyCompleted}
                    aria-label={dailyCompleted ? 'Daily Trivia Completed' : 'Start Daily Trivia'}
                />
                {dailyCompleted && (
                    <div className="daily-trivia-banner__completed">
                        <span>✓ COMPLETED</span>
                    </div>
                )}
            </div>


            {/* Mode Cards Section */}
            <div className="modes-section">

                <div className="modes-grid">
                    {MODE_CARDS.map((mode) => {
                        const Icon = mode.icon;
                        const isHovered = hoveredCard === mode.id;

                        // Use image-based card if mode has an image
                        if (mode.image) {
                            return (
                                <div
                                    key={mode.id}
                                    className="mode-image-card"
                                    onMouseEnter={() => setHoveredCard(mode.id)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                    onClick={() => startMode(mode.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <img
                                        src={mode.image}
                                        alt={mode.name}
                                        className="mode-image-card__img"
                                    />
                                </div>
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
                <div
                    className="quick-stakes-banner"
                    onClick={() => startMode('arcade')}
                    style={{ cursor: 'pointer' }}
                >
                    <img
                        src="/images/trivia/quick-stakes.webp?v=v5"
                        alt="Quick Stakes - 10 Questions In 60 Seconds"
                        className="quick-stakes-banner__img"
                    />
                </div>
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

                /* Image-based Mode Cards */
                .mode-image-card {
                    position: relative;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    animation: cardEntrance 0.5s ease backwards;
                    transition: transform 0.25s ease, box-shadow 0.25s ease;
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
                    border-radius: 0;
                    overflow: hidden;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    aspect-ratio: 918 / 333;
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
                                src="/images/trivia/diamond-entry-modal.png"
                                alt="Diamond Entry Modal"
                                className="diamond-modal__bg"
                            />

                            {/* Close Button hit area */}
                            <button
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
                                className="dm-hitbox dm-vip"
                                onClick={() => {
                                    navigator.vibrate?.(50);
                                    router.push('/hub/vip');
                                }}
                                aria-label="Upgrade to VIP"
                            />

                            {/* Accept & Play hit area */}
                            <button
                                className="dm-hitbox dm-accept"
                                onClick={() => {
                                    navigator.vibrate?.(50);
                                    handleChargeAccept();
                                }}
                                disabled={isDeducting}
                                aria-label="Accept and Play"
                            />

                            {/* Dynamic Diamond Balance */}
                            <div className="dm-balance">
                                {userDiamonds} diamonds
                            </div>
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

            {/* Deducting spinner overlay */}
            {
                isDeducting && !showChargePopup && (
                    <div className="deducting-overlay">
                        <div className="deducting-spinner" />
                    </div>
                )
            }
        </div >
    );
}
