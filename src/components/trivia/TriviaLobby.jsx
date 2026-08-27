/**
 * TRIVIA LOBBY - Main trivia hub with Futuristic Metal UI
 * Skeuomorphic Sci-Fi design with metal frames, neon accents, and industrial aesthetic
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Trophy, BookOpen, GraduationCap, Gem, Heart, Infinity, Shuffle, Swords, Calendar, Target, Banknote, Calculator, Brain, Flame, ArrowUpRight, Timer } from 'lucide-react';
import { acquireScrollLock } from '../../lib/scrollLock';
// The lobby no longer bills, so supabase / EventBus / getAuthUser are gone with
// deductDiamonds. Entry price now comes from the engine config only.
import { getModeConfig } from '../../lib/trivia/triviaEngine';

const ACKNOWLEDGED_KEY = 'trivia_charge_acknowledged';

const MODE_ROUTES = {
    survival: '/hub/trivia/survival-game',
    endless: '/hub/trivia/endless',
    mixed: '/hub/trivia/mixed',
    pvp: '/hub/trivia/pvp',
    tournaments: '/hub/trivia/tournaments',
};

function getModeRoute(modeId) {
    return MODE_ROUTES[modeId] || `/hub/trivia/${modeId}`;
}

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
        code: '01',
        category: 'strategy',
        name: 'MTT Scenarios',
        description: 'Multi-table Tournament Situations and Decisions',
        icon: Target,
        color: '#f97316',
        glowColor: '#f97316',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/modes-v2/mtt.webp'
    },
    {
        id: 'cash',
        code: '02',
        category: 'strategy',
        name: 'Cash Game',
        description: 'Deep Stack Scenarios, Implied Odds, Table Dynamics',
        icon: Banknote,
        color: '#31a24c',
        glowColor: '#31a24c',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/modes-v2/cash.webp'
    },
    {
        id: 'icm',
        code: '03',
        category: 'strategy',
        name: 'ICM & Chip EV',
        description: 'Tournament Equity, Chip Value vs $EV Decisions',
        icon: Calculator,
        color: '#2374e1',
        glowColor: '#2374e1',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/modes-v2/icm.webp'
    },
    // ROW 2 - Core Trivia
    {
        id: 'history',
        code: '04',
        category: 'knowledge',
        name: 'Poker History',
        description: 'Iconic Moments, Famous Hands, Legendary Players',
        icon: Trophy,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/modes-v2/history.webp'
    },
    {
        id: 'tournaments',
        code: '05',
        category: 'competitive',
        name: 'Tournaments',
        description: 'Daily 7 PM CST Brackets with Big Prize Pools',
        icon: Calendar,
        color: '#FFD700',
        glowColor: '#FFD700',
        diamondReward: 'Prize pool',
        perfectBonus: null,
        image: '/images/trivia/modes-v2/tournaments.webp'
    },
    {
        id: 'pro',
        code: '06',
        category: 'knowledge',
        name: 'Pro Knowledge',
        description: 'Strategy Concepts, GTO Basics, Advanced Trivia',
        icon: GraduationCap,
        color: '#9D4EDD',
        glowColor: '#9D4EDD',
        diamondReward: 5,
        perfectBonus: 10,
        image: '/images/trivia/modes-v2/pro.webp'
    },
    // ROW 3 - Challenge Modes
    {
        id: 'survival',
        code: '07',
        category: 'challenge',
        name: 'Survival Mode',
        description: '10 Levels, 20 Questions Each. All Categories Combined!',
        icon: Heart,
        color: '#f02849',
        glowColor: '#f02849',
        diamondReward: '10+',
        perfectBonus: null,
        image: '/images/trivia/modes-v2/survival.webp'
    },
    {
        id: 'endless',
        code: '08',
        category: 'challenge',
        name: 'Endless Mode',
        description: 'All Questions, Random Order. Answer Until You Miss!',
        icon: Infinity,
        color: '#8b5cf6',
        glowColor: '#8b5cf6',
        diamondReward: '1+/Q',
        perfectBonus: null,
        image: '/images/trivia/modes-v2/endless.webp'
    },
    {
        id: 'mixed',
        code: '09',
        category: 'challenge',
        name: 'Mixed Mode',
        description: 'Seven Poker Categories, Rotating Every Question',
        icon: Shuffle,
        color: '#00D4FF',
        glowColor: '#00D4FF',
        diamondReward: '5+ / +10 perfect',
        perfectBonus: null,
        image: '/images/trivia/modes-v2/mixed.webp'
    },
    // ROW 4 - Competitive
    {
        id: 'time-attack',
        code: '10',
        category: 'challenge',
        name: 'Time Attack',
        description: 'Thirty Seconds. Answer as Many as You Can.',
        icon: Timer,
        color: '#14b8a6',
        glowColor: '#14b8a6',
        diamondReward: '1 / correct',
        perfectBonus: null,
        image: '/images/trivia/modes-v2/time-attack.webp'
    },
    {
        id: 'pvp',
        code: '11',
        category: 'competitive',
        name: '1v1 Battle',
        description: 'Challenge Real Players for Diamonds!',
        icon: Swords,
        color: '#f02849',
        glowColor: '#f02849',
        diamondReward: '1.8x stake',
        perfectBonus: null,
        image: '/images/trivia/modes-v2/pvp.webp'
    },
    {
        id: 'rules',
        code: '12',
        category: 'knowledge',
        name: 'Rules Quiz',
        description: 'Test Your Understanding of Official Poker Rules',
        icon: BookOpen,
        color: '#4a90d9',
        glowColor: '#4a90d9',
        diamondReward: 3,
        perfectBonus: 5,
        image: '/images/trivia/modes-v2/rules.webp'
    },
    {
        id: 'gto',
        code: '13',
        category: 'competitive',
        name: 'GTO Master',
        description: 'Solver-based Scenarios Combining MTT, Cash, and ICM',
        icon: Brain,
        color: '#a855f7',
        glowColor: '#a855f7',
        diamondReward: 8,
        perfectBonus: 15,
        image: '/images/trivia/modes-v2/gto.webp'
    }
];

const MODE_FILTERS = [
    { id: 'all', label: 'All Modes' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'challenge', label: 'Challenge' },
    { id: 'competitive', label: 'Competitive' },
];

const MODE_FILTER_COUNTS = Object.fromEntries(
    MODE_FILTERS.map(filter => [
        filter.id,
        filter.id === 'all'
            ? MODE_CARDS.length
            : MODE_CARDS.filter(mode => mode.category === filter.id).length,
    ])
);


/**
 * onDiamondsChange is still accepted (index.js passes it) but is intentionally
 * unused: this component no longer moves diamonds, so it has no delta to
 * report. The destination pages emit their own balance updates.
 */
export default function TriviaLobby({ userDiamonds = 0, isVip = false, dailyCompleted = false, currentStreak = 0, onDiamondsChange }) {
    const router = useRouter();
    const [activeFilter, setActiveFilter] = useState('all');
    const filterRailRef = useRef(null);
    const filterButtonRefs = useRef([]);
    const modalRef = useRef(null);
    const modalCloseRef = useRef(null);
    const previousFocusRef = useRef(null);
    const routingRef = useRef(false);
    const prefetchedRoutesRef = useRef(new Set());

    useEffect(() => {
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
    const [routeError, setRouteError] = useState('');

    const pendingCost = pendingMode ? getEntryCost(pendingMode) : 0;
    const filteredModes = activeFilter === 'all'
        ? MODE_CARDS
        : MODE_CARDS.filter(mode => mode.category === activeFilter);

    const revealFilter = (filterIndex, { focus = false } = {}) => {
        // Wait for React to apply the active state before measuring. Scrolling
        // the rail directly keeps the page's vertical position untouched.
        requestAnimationFrame(() => {
            const rail = filterRailRef.current;
            const button = filterButtonRefs.current[filterIndex];
            if (!rail || !button) return;

            if (focus) button.focus();

            const maxLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
            if (maxLeft === 0) return;

            const targetLeft = button.offsetLeft - ((rail.clientWidth - button.offsetWidth) / 2);
            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            rail.scrollTo({
                left: Math.min(maxLeft, Math.max(0, targetLeft)),
                behavior: reduceMotion ? 'auto' : 'smooth',
            });
        });
    };

    const selectFilter = (filterId, filterIndex, options) => {
        setActiveFilter(filterId);
        revealFilter(filterIndex, options);
    };

    useEffect(() => {
        if (!router.isReady) return;
        const requested = typeof router.query.filter === 'string' ? router.query.filter : '';
        const filterIndex = MODE_FILTERS.findIndex(filter => filter.id === requested);
        if (filterIndex >= 0) selectFilter(requested, filterIndex);
    // The query string is the external navigation contract. selectFilter is
    // deliberately omitted because it is recreated during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady, router.query.filter]);

    useEffect(() => {
        if (!showChargePopup) return undefined;
        previousFocusRef.current = document.activeElement;
        const releaseScrollLock = acquireScrollLock('trivia-entry-disclosure');
        const focusTimer = window.setTimeout(() => modalCloseRef.current?.focus(), 0);

        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setShowChargePopup(false);
                setPendingMode(null);
                return;
            }
            if (event.key !== 'Tab' || !modalRef.current) return;
            const focusable = Array.from(modalRef.current.querySelectorAll(
                'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            ));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            releaseScrollLock();
            if (!routingRef.current && previousFocusRef.current instanceof HTMLElement) {
                previousFocusRef.current.focus();
            }
        };
    }, [showChargePopup]);

    const handleFilterKeyDown = (event, currentIndex) => {
        let nextIndex;

        switch (event.key) {
            case 'ArrowRight':
                nextIndex = (currentIndex + 1) % MODE_FILTERS.length;
                break;
            case 'ArrowLeft':
                nextIndex = (currentIndex - 1 + MODE_FILTERS.length) % MODE_FILTERS.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = MODE_FILTERS.length - 1;
                break;
            default:
                return;
        }

        event.preventDefault();
        selectFilter(MODE_FILTERS[nextIndex].id, nextIndex, { focus: true });
    };

    const prefetchMode = modeId => {
        const route = getModeRoute(modeId);
        if (prefetchedRoutesRef.current.has(route)) return;
        prefetchedRoutesRef.current.add(route);
        router.prefetch(route).catch(() => prefetchedRoutesRef.current.delete(route));
    };

    // Route to the correct page for a mode, and recover if Next cancels or
    // rejects the transition. The old fire-and-forget push stranded the full
    // screen spinner forever after a route error.
    const routeToMode = async modeId => {
        if (routingRef.current) return;
        routingRef.current = true;
        setRouteError('');
        setIsRouting(true);
        try {
            const didNavigate = await router.push(getModeRoute(modeId));
            if (didNavigate === false) throw new Error('Navigation was cancelled');
        } catch (error) {
            console.warn('[TriviaLobby] Could not open mode:', error?.message || error);
            routingRef.current = false;
            setIsRouting(false);
            setRouteError('That game could not be opened. Please try again.');
        }
    };

    const handleChargeAccept = () => {
        const modeId = pendingMode;
        if (!modeId) return;
        // Remember the disclosure so it is shown once, not once per mode.
        try { localStorage.setItem(ACKNOWLEDGED_KEY, 'true'); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        setShowChargePopup(false);
        setPendingMode(null);
        void routeToMode(modeId);
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
            void routeToMode(modeId);
            return;
        }

        let acknowledged = false;
        try { acknowledged = localStorage.getItem(ACKNOWLEDGED_KEY) === 'true'; } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        if (!acknowledged) {
            setPendingMode(modeId);
            setShowChargePopup(true);
            return;
        }

        void routeToMode(modeId);
    };

    return (
        <div className="trivia-lobby">
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
                    fetchpriority="high"
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
                <div className="modes-toolbar">
                    <div>
                        <span className="modes-toolbar__eyebrow">GAME SELECT // TRIVIA NETWORK</span>
                        <h2>Choose Your Game</h2>
                    </div>
                    <span
                        className="modes-toolbar__count"
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                    >
                        <i aria-hidden /> {filteredModes.length} LIVE {filteredModes.length === 1 ? 'MODE' : 'MODES'}
                    </span>
                </div>

                <div
                    ref={filterRailRef}
                    className="mode-filters"
                    role="toolbar"
                    aria-label="Filter trivia modes"
                >
                    {MODE_FILTERS.map((filter, filterIndex) => (
                        <button
                            key={filter.id}
                            ref={node => { filterButtonRefs.current[filterIndex] = node; }}
                            type="button"
                            className={`mode-filter${activeFilter === filter.id ? ' mode-filter--active' : ''}`}
                            onClick={() => selectFilter(filter.id, filterIndex)}
                            onKeyDown={event => handleFilterKeyDown(event, filterIndex)}
                            tabIndex={activeFilter === filter.id ? 0 : -1}
                            aria-pressed={activeFilter === filter.id}
                            aria-controls="trivia-mode-grid"
                            aria-label={`${filter.label}, ${MODE_FILTER_COUNTS[filter.id]} modes`}
                        >
                            <span>{filter.label}</span>
                            <span className="mode-filter__count" aria-hidden>{MODE_FILTER_COUNTS[filter.id]}</span>
                        </button>
                    ))}
                </div>

                <div className="modes-grid" id="trivia-mode-grid">
                    {filteredModes.map((mode) => {
                        const Icon = mode.icon;
                        const cost = getEntryCost(mode.id);
                        const variableCost = VARIABLE_COST_MODES.has(mode.id);
                        const costText = isVip
                            ? 'VIP FREE'
                            : variableCost
                                ? 'VARIABLE'
                                : cost > 0 ? `${cost} DIAMONDS` : 'FREE';
                        const rewardText = typeof mode.diamondReward === 'number'
                            ? `+${mode.diamondReward}${mode.perfectBonus ? ` / +${mode.perfectBonus} PERFECT` : ''}`
                            : (mode.diamondReward ? String(mode.diamondReward).toUpperCase() : '—');

                        return (
                            <button
                                key={mode.id}
                                type="button"
                                className="mode-image-card"
                                onClick={() => startMode(mode.id)}
                                onPointerEnter={() => prefetchMode(mode.id)}
                                onFocus={() => prefetchMode(mode.id)}
                                disabled={isRouting}
                                aria-label={`${mode.name}. ${mode.description}. ${costText}${rewardText ? `. Reward ${rewardText}${typeof mode.diamondReward === 'number' ? ' diamonds' : ''}` : ''}.`}
                                style={{ '--mode-color': mode.color, '--mode-glow': `${mode.glowColor}80` }}
                            >
                                <div className="mode-image-card__art">
                                    <img
                                        src={mode.image}
                                        alt=""
                                        aria-hidden
                                        className="mode-image-card__img"
                                        width={1024}
                                        height={1024}
                                        loading="lazy"
                                        decoding="async"
                                        draggable="false"
                                    />
                                    <span className="mode-image-card__code" aria-hidden>{mode.code}</span>
                                    <span className="mode-image-card__status" aria-hidden><i /> LIVE</span>
                                    <span className="mode-image-card__icon" aria-hidden>
                                        <Icon size={18} strokeWidth={1.7} />
                                    </span>
                                </div>

                                <div className="mode-image-card__body">
                                    <span className="mode-image-card__kicker">{mode.category} // {mode.id}</span>
                                    <h3>{mode.name}</h3>
                                    <p>{mode.description}</p>

                                    <div className="mode-image-card__telemetry" aria-hidden>
                                        <span>
                                            <small>ENTRY</small>
                                            <strong>{costText}</strong>
                                        </span>
                                        <span>
                                            <small>REWARD</small>
                                            <strong>{rewardText}</strong>
                                        </span>
                                    </div>

                                    <span className="mode-image-card__launch" aria-hidden>
                                        Launch Mode <ArrowUpRight size={15} />
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Quick Stakes Section - Landscape Banner */}
            <div className="quick-stakes-section">
                <button
                    type="button"
                    className="quick-stakes-banner"
                    onClick={() => startMode('arcade')}
                    onPointerEnter={() => prefetchMode('arcade')}
                    onFocus={() => prefetchMode('arcade')}
                    disabled={isRouting}
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
                    font-family: 'Rajdhani', 'Rajdhani', sans-serif;
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
                    font-family: 'Rajdhani', sans-serif;
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
                    font-family: 'Rajdhani', sans-serif;
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

                /* The mode artwork is self-contained - it carries its own
                   title, subtitle and START affordance - so the lobby no
                   longer paints a name/price strip over the bottom of it.
                   Entry cost is still announced to screen readers via the
                   card's aria-label, and confirmed in the entry popup. */
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
                    min-width: 44px;
                    min-height: 44px;
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
                    font-family: 'Rajdhani', sans-serif;
                    font-size: 18px;
                    font-weight: 700;
                    text-shadow: 0 0 10px rgba(77, 248, 255, 0.4);
                    pointer-events: none;
                }

                /* ═══════ SMARTER.POKER TRIVIA REDESIGN ═══════ */
                .trivia-lobby,
                .trivia-lobby * {
                    box-sizing: border-box;
                }

                .trivia-lobby {
                    --steel: #6f9bb0;
                    --steel-dim: rgba(111, 155, 176, 0.46);
                    --cyan: #19b9ff;
                    --cyan-soft: rgba(25, 185, 255, 0.18);
                    --panel: #050b10;
                    --panel-raised: #08131b;
                    width: 100%;
                    max-width: 1220px;
                    padding: 0 18px 24px;
                    overflow: visible;
                    color: #e7f4fb;
                    font-family: 'Rajdhani', 'Arial Narrow', sans-serif;
                }

                .daily-trivia-banner {
                    margin: 0 0 14px;
                    padding: 4px;
                    overflow: hidden;
                    border: 1px solid var(--steel);
                    background: #02070a;
                    box-shadow:
                        inset 0 0 0 1px rgba(89, 184, 225, 0.16),
                        0 12px 32px rgba(0, 0, 0, 0.34);
                }

                .daily-trivia-banner__image {
                    border: 1px solid rgba(104, 181, 214, 0.42);
                }

                .modes-section {
                    position: relative;
                    margin-top: 0;
                    border: 1px solid var(--steel-dim);
                    background:
                        linear-gradient(180deg, rgba(16, 33, 43, 0.72), rgba(2, 7, 10, 0.96) 120px),
                        var(--panel);
                    box-shadow:
                        inset 0 0 0 1px rgba(121, 195, 224, 0.08),
                        0 18px 50px rgba(0, 0, 0, 0.3);
                }

                .modes-section::before,
                .modes-section::after {
                    content: '';
                    position: absolute;
                    z-index: 2;
                    top: -1px;
                    width: 74px;
                    height: 2px;
                    background: var(--cyan);
                    box-shadow: 0 0 12px rgba(25, 185, 255, 0.72);
                    pointer-events: none;
                }

                .modes-section::before { left: 0; }
                .modes-section::after { right: 0; }

                .modes-toolbar {
                    min-height: 80px;
                    padding: 15px 18px 13px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    border-bottom: 1px solid rgba(111, 155, 176, 0.28);
                    background: linear-gradient(90deg, rgba(5, 13, 18, 0.9), rgba(11, 24, 32, 0.68), rgba(5, 13, 18, 0.9));
                }

                .modes-toolbar__eyebrow,
                .mode-image-card__kicker {
                    display: block;
                    color: #8aaabd;
                    font-size: 10px;
                    font-weight: 600;
                    line-height: 1;
                    letter-spacing: 0.2em;
                    text-transform: uppercase;
                }

                .modes-toolbar h2 {
                    margin: 7px 0 0;
                    color: #f4fbff;
                    font-size: clamp(24px, 3vw, 34px);
                    font-weight: 500;
                    line-height: 1;
                    letter-spacing: 0.015em;
                    text-transform: uppercase;
                }

                .modes-toolbar__count,
                .mode-image-card__status {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    color: #9fc9dc;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.14em;
                    white-space: nowrap;
                }

                .modes-toolbar__count i,
                .mode-image-card__status i {
                    width: 6px;
                    height: 6px;
                    flex: 0 0 6px;
                    border-radius: 50%;
                    background: #33d47b;
                    box-shadow: 0 0 9px rgba(51, 212, 123, 0.9);
                }

                .mode-filters {
                    display: flex;
                    align-items: stretch;
                    gap: 0;
                    padding: 0 18px;
                    overflow-x: auto;
                    overscroll-behavior-x: contain;
                    scroll-padding-inline: 18px;
                    scroll-snap-type: x proximity;
                    -webkit-overflow-scrolling: touch;
                    border-bottom: 1px solid rgba(111, 155, 176, 0.2);
                    scrollbar-width: none;
                }

                .mode-filters::-webkit-scrollbar { display: none; }

                .mode-filter {
                    position: relative;
                    min-width: max-content;
                    min-height: 48px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 20px;
                    border: 0;
                    border-right: 1px solid rgba(111, 155, 176, 0.16);
                    background: transparent;
                    color: #7893a2;
                    font-family: inherit;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    cursor: pointer;
                    scroll-snap-align: start;
                    transition: color 180ms ease, background 180ms ease;
                }

                .mode-filter__count {
                    min-width: 20px;
                    height: 20px;
                    display: inline-grid;
                    place-items: center;
                    margin-left: 8px;
                    border: 1px solid rgba(111, 155, 176, 0.28);
                    background: rgba(3, 10, 14, 0.72);
                    color: #9ab3bf;
                    font-size: 9px;
                    line-height: 1;
                    letter-spacing: 0;
                }

                .mode-filter--active .mode-filter__count {
                    border-color: rgba(25, 185, 255, 0.55);
                    color: #eaf8ff;
                    box-shadow: inset 0 0 8px rgba(25, 185, 255, 0.12);
                }

                .mode-filter:first-child { border-left: 1px solid rgba(111, 155, 176, 0.16); }

                .mode-filter:hover,
                .mode-filter--active {
                    color: #eaf8ff;
                    background: linear-gradient(180deg, rgba(25, 185, 255, 0.1), rgba(25, 185, 255, 0.025));
                }

                .mode-filter--active::after {
                    content: '';
                    position: absolute;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    height: 2px;
                    background: var(--cyan);
                    box-shadow: 0 0 10px rgba(25, 185, 255, 0.85);
                }

                .mode-filter:focus-visible {
                    outline: 2px solid var(--cyan);
                    outline-offset: -3px;
                }

                .modes-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    align-items: stretch;
                    gap: 12px;
                    padding: 14px;
                }

                .mode-image-card {
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    min-width: 0;
                    padding: 0;
                    overflow: hidden;
                    border: 1px solid rgba(111, 155, 176, 0.58);
                    border-radius: 1px;
                    background: linear-gradient(180deg, #09131a, #03080c);
                    color: #e7f4fb;
                    text-align: left;
                    cursor: pointer;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                    content-visibility: auto;
                    contain-intrinsic-block-size: 490px;
                    box-shadow:
                        inset 0 0 0 1px rgba(255, 255, 255, 0.018),
                        0 10px 28px rgba(0, 0, 0, 0.24);
                    transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
                }

                .mode-image-card::before {
                    content: '';
                    position: absolute;
                    z-index: 4;
                    left: 0;
                    top: 0;
                    width: 52px;
                    height: 2px;
                    background: var(--mode-color);
                    box-shadow: 0 0 12px var(--mode-glow);
                    pointer-events: none;
                }

                .mode-image-card:hover,
                .mode-image-card:focus-visible {
                    transform: translateY(-3px);
                    border-color: var(--mode-color);
                    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42), 0 0 18px var(--mode-glow);
                    outline: none;
                }

                .mode-image-card__art {
                    position: relative;
                    width: 100%;
                    aspect-ratio: 4 / 3;
                    overflow: hidden;
                    border-bottom: 1px solid rgba(111, 155, 176, 0.42);
                    background: #010407;
                }

                .mode-image-card__art::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background:
                        linear-gradient(180deg, rgba(0, 0, 0, 0.08) 55%, rgba(0, 0, 0, 0.72)),
                        repeating-linear-gradient(0deg, transparent 0 3px, rgba(95, 198, 236, 0.025) 3px 4px);
                    pointer-events: none;
                }

                .mode-image-card__img {
                    width: 100%;
                    height: 100%;
                    display: block;
                    object-fit: cover;
                    object-position: center 46%;
                    border-radius: 0;
                    filter: saturate(0.94) contrast(1.04);
                    transition: transform 500ms cubic-bezier(.2,.7,.2,1), filter 250ms ease;
                }

                .mode-image-card:hover .mode-image-card__img,
                .mode-image-card:focus-visible .mode-image-card__img {
                    transform: scale(1.035);
                    filter: saturate(1.08) contrast(1.06);
                }

                .mode-image-card__code,
                .mode-image-card__status,
                .mode-image-card__icon {
                    position: absolute;
                    z-index: 2;
                }

                .mode-image-card__code {
                    top: 10px;
                    left: 11px;
                    color: #d6e8f1;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.18em;
                    text-shadow: 0 2px 8px #000;
                }

                .mode-image-card__status {
                    top: 10px;
                    right: 10px;
                    padding: 4px 6px;
                    border: 1px solid rgba(129, 185, 211, 0.32);
                    background: rgba(0, 5, 8, 0.72);
                    color: #c2dbe7;
                    font-size: 8px;
                    backdrop-filter: blur(5px);
                }

                .mode-image-card__status i { width: 5px; height: 5px; flex-basis: 5px; }

                .mode-image-card__icon {
                    right: 10px;
                    bottom: 10px;
                    width: 34px;
                    height: 34px;
                    display: grid;
                    place-items: center;
                    border: 1px solid var(--mode-color);
                    background: rgba(1, 6, 9, 0.74);
                    color: var(--mode-color);
                    box-shadow: 0 0 12px var(--mode-glow);
                    backdrop-filter: blur(6px);
                }

                .mode-image-card__body {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    padding: 15px 15px 14px;
                }

                .mode-image-card__kicker {
                    overflow: hidden;
                    color: var(--mode-color);
                    font-size: 9px;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .mode-image-card h3 {
                    margin: 8px 0 4px;
                    color: #f1f8fb;
                    font-size: 23px;
                    font-weight: 600;
                    line-height: 1;
                    letter-spacing: 0.015em;
                    text-transform: uppercase;
                }

                .mode-image-card p {
                    min-height: 38px;
                    margin: 0 0 13px;
                    color: #8da4b0;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    font-size: 11px;
                    line-height: 1.45;
                }

                .mode-image-card__telemetry {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
                    margin-top: auto;
                    border-top: 1px solid rgba(111, 155, 176, 0.2);
                    border-bottom: 1px solid rgba(111, 155, 176, 0.2);
                }

                .mode-image-card__telemetry > span {
                    min-width: 0;
                    padding: 9px 7px 8px 0;
                }

                .mode-image-card__telemetry > span + span {
                    padding-left: 10px;
                    border-left: 1px solid rgba(111, 155, 176, 0.2);
                }

                .mode-image-card__telemetry small,
                .mode-image-card__telemetry strong {
                    display: block;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .mode-image-card__telemetry small {
                    margin-bottom: 3px;
                    color: #7895a3;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.16em;
                }

                .mode-image-card__telemetry strong {
                    color: #cce1eb;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                }

                .mode-image-card__launch {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    margin-top: 11px;
                    color: #91adbb;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                    transition: color 180ms ease;
                }

                .mode-image-card:hover .mode-image-card__launch,
                .mode-image-card:focus-visible .mode-image-card__launch {
                    color: var(--mode-color);
                }

                .quick-stakes-section {
                    margin-top: 14px;
                    padding: 4px;
                    border: 1px solid var(--steel);
                    background: #02070a;
                    box-shadow: inset 0 0 0 1px rgba(89, 184, 225, 0.13);
                }

                .quick-stakes-banner {
                    border: 1px solid rgba(104, 181, 214, 0.4);
                    border-radius: 0;
                }

                @media (max-width: 900px) and (min-width: 701px) {
                    .modes-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }

                    .mode-filters {
                        position: sticky;
                        top: calc(59px + env(safe-area-inset-top, 0px));
                        z-index: 8;
                        background: rgba(5, 14, 20, 0.97);
                    }
                }

                @media (max-width: 700px) {
                    .trivia-lobby {
                        padding: 0 8px 18px !important;
                    }

                    .daily-trivia-banner {
                        margin-bottom: 9px;
                        padding: 3px;
                    }

                    .modes-toolbar {
                        min-height: 68px;
                        padding: 12px 11px 10px;
                        gap: 10px;
                    }

                    .modes-toolbar__eyebrow { font-size: 8px; }
                    .modes-toolbar h2 { margin-top: 6px; font-size: 22px; }
                    .modes-toolbar__count { font-size: 8px; }

                    .mode-filters {
                        position: sticky;
                        top: calc(59px + env(safe-area-inset-top, 0px));
                        z-index: 8;
                        padding: 0 10px;
                        scroll-padding-inline: 10px;
                        background: linear-gradient(90deg, rgba(5, 14, 20, 0.98), rgba(8, 24, 33, 0.96), rgba(5, 14, 20, 0.98));
                        box-shadow: 0 1px 0 rgba(25, 185, 255, 0.16), 0 10px 22px rgba(0, 0, 0, 0.34);
                        backdrop-filter: blur(12px);
                    }

                    .mode-filter {
                        min-height: 44px;
                        padding: 0 15px;
                        font-size: 10px;
                    }

                    .modes-grid {
                        grid-template-columns: 1fr !important;
                        gap: 8px !important;
                        padding: 8px;
                    }

                    .mode-image-card {
                        display: flex;
                        flex-direction: column;
                        min-height: 0;
                        contain-intrinsic-block-size: 455px;
                        border-radius: 1px !important;
                    }

                    .mode-image-card:hover,
                    .mode-image-card:focus-visible {
                        transform: translateY(-1px);
                    }

                    .mode-image-card__art {
                        width: 100%;
                        height: auto;
                        min-height: 0;
                        aspect-ratio: 4 / 3;
                        border-right: 0;
                        border-bottom: 1px solid rgba(111, 155, 176, 0.42);
                    }

                    .mode-image-card__img {
                        height: 100% !important;
                        border-radius: 0 !important;
                    }

                    .mode-image-card__code {
                        top: 7px;
                        left: 8px;
                        font-size: 9px;
                    }

                    .mode-image-card__status {
                        top: 7px;
                        right: 7px;
                        padding: 3px 4px;
                    }

                    .mode-image-card__icon {
                        right: 7px;
                        bottom: 7px;
                        width: 28px;
                        height: 28px;
                    }

                    .mode-image-card__icon svg { width: 15px; height: 15px; }

                    .mode-image-card__body {
                        padding: 14px 14px 13px;
                    }

                    .mode-image-card__kicker { font-size: 8px; }

                    .mode-image-card h3 {
                        margin: 7px 0 5px;
                        font-size: 22px;
                    }

                    .mode-image-card p {
                        display: block;
                        min-height: 34px;
                        margin-bottom: 11px;
                        overflow: visible;
                        font-size: 12.5px;
                        line-height: 1.4;
                    }

                    .mode-image-card__telemetry > span {
                        padding-top: 8px;
                        padding-bottom: 7px;
                    }

                    .mode-image-card__telemetry small { font-size: 10px; }
                    .mode-image-card__telemetry strong { font-size: 10.5px; }

                    .mode-image-card__launch {
                        margin-top: 10px;
                        font-size: 11px;
                    }

                    .quick-stakes-section {
                        margin-top: 9px !important;
                        padding: 3px;
                    }

                    .quick-stakes-banner__img {
                        border-radius: 0 !important;
                    }
                }

                @media (max-width: 390px) {
                    .mode-image-card h3 { font-size: 20px; }
                    .mode-image-card__body { padding-left: 9px; padding-right: 9px; }
                }

                @media (hover: none) {
                    .mode-image-card:hover,
                    .mode-image-card:hover .mode-image-card__img,
                    .quick-stakes-banner:hover,
                    .daily-trivia-banner:hover {
                        transform: none;
                    }
                }

                .dm-hitbox:focus-visible {
                    outline: 2px solid #4df8ff;
                    outline-offset: 3px;
                    background: rgba(25, 185, 255, 0.14);
                    box-shadow: 0 0 0 4px rgba(25, 185, 255, 0.12), 0 0 18px rgba(77, 248, 255, 0.55);
                }

                @media (prefers-contrast: more) {
                    .mode-image-card,
                    .mode-filter,
                    .modes-toolbar,
                    .mode-filters {
                        border-color: #8edfff;
                    }

                    .mode-image-card p,
                    .mode-image-card__kicker,
                    .mode-filter {
                        color: #f2fbff;
                    }

                    .mode-image-card__art::after {
                        background: linear-gradient(180deg, transparent 58%, rgba(0, 0, 0, 0.86));
                    }
                }

                .dm-dialog-copy {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    white-space: nowrap;
                }

                .route-error {
                    margin: 10px 0 0;
                    padding: 10px 12px;
                    border: 1px solid #f28b82;
                    color: #ffd7d3;
                    background: rgba(86, 18, 18, 0.78);
                    font-size: 13px;
                    text-align: center;
                }

                @media (forced-colors: active) {
                    .diamond-modal__bg { display: none; }
                    .diamond-modal {
                        width: min(92vw, 440px);
                        padding: 24px;
                        border: 2px solid ButtonText;
                        background: Canvas;
                        color: CanvasText;
                    }
                    .dm-dialog-copy {
                        position: static;
                        width: auto;
                        height: auto;
                        overflow: visible;
                        clip: auto;
                        white-space: normal;
                    }
                    .dm-hitbox {
                        position: static;
                        width: 100%;
                        min-height: 44px;
                        margin-top: 12px;
                        border: 1px solid ButtonText;
                        color: ButtonText;
                    }
                    .dm-close::after { content: 'Close'; }
                    .dm-vip::after { content: 'Upgrade to VIP'; }
                    .dm-accept::after { content: 'Accept and play'; }
                    .dm-balance {
                        position: static;
                        transform: none;
                        width: auto;
                        height: auto;
                        margin-top: 12px;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .mode-image-card,
                    .mode-image-card__img,
                    .mode-filter {
                        animation: none;
                        transition: none;
                    }

                    .mode-image-card:hover,
                    .mode-image-card:focus-visible,
                    .mode-image-card:hover .mode-image-card__img,
                    .mode-image-card:focus-visible .mode-image-card__img {
                        transform: none;
                    }
                }
            `}</style>

            {/* ═══════ DIAMOND CHARGE POPUP (first-time only) ═══════ */}
            {
                showChargePopup && (
                    <div className="gate-overlay" onClick={() => { setShowChargePopup(false); setPendingMode(null); }}>
                        <div
                            ref={modalRef}
                            className="diamond-modal"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="trivia-entry-title"
                            aria-describedby="trivia-entry-description"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="dm-dialog-copy">
                                <h2 id="trivia-entry-title">Diamond entry</h2>
                                <p id="trivia-entry-description">
                                    This game costs {pendingCost} diamonds. Your current balance is {userDiamonds} diamonds.
                                    The game page verifies and charges the entry when it starts.
                                </p>
                            </div>
                            <img
                                src="/images/trivia/diamond-entry-modal.webp?v=v6"
                                alt=""
                                aria-hidden="true"
                                className="diamond-modal__bg"
                                width={946}
                                height={1024}
                                decoding="async"
                            />

                            {/* Close Button hit area */}
                            <button
                                ref={modalCloseRef}
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
                                    void router.push('/hub/vip-membership');
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
                                <div className="dm-spinner-overlay" role="status" aria-live="polite" aria-label="Opening game">
                                    <div className="deducting-spinner" />
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {routeError && <p className="route-error" role="alert">{routeError}</p>}

            {/* Routing spinner overlay */}
            {
                isRouting && !showChargePopup && (
                    <div className="deducting-overlay" role="status" aria-live="polite" aria-label="Opening game">
                        <div className="deducting-spinner" />
                    </div>
                )
            }
        </div >
    );
}
