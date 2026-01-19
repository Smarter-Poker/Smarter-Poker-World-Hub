/**
 * 🎮 GOD MODE TRAINING ENGINE — 7-Engine Architecture
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ENGINE 1: Scenario Orchestrator (parse GTO data)
 * ENGINE 2: Visual Engine (ellipse seating, 3D cards)
 * ENGINE 3: GTO Brain (EV loss grading)
 * ENGINE 4: Game Loop (state machine)
 * ENGINE 5: Question Engine (load from god-mode-service)
 * ENGINE 6: Progression Engine (score, streak, level unlock)
 * ENGINE 7: Audio Engine (sound feedback)
 * 
 * HARD RULES:
 * - Hero ALWAYS at bottom center (Index 0)
 * - 100% inline styles (Law AUD-005)
 * - NO blocking DB queries on render
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Game Loop States
const GameState = {
    LOADING: 'LOADING',
    DEALING: 'DEALING',
    ACTION_REQUIRED: 'ACTION_REQUIRED',
    EVALUATING: 'EVALUATING',
    FEEDBACK_OVERLAY: 'FEEDBACK_OVERLAY',
    NEXT_HAND: 'NEXT_HAND',
    LEVEL_COMPLETE: 'LEVEL_COMPLETE'
};

// Verdict Types
const Verdict = {
    PERFECT: 'PERFECT',
    ACCEPTABLE: 'ACCEPTABLE',
    BLUNDER: 'BLUNDER'
};

// Card suits and rendering
const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLORS = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#1e293b' };

// Position mappings
const POSITION_MAP = {
    'BTN': 0, 'SB': 1, 'BB': 2, 'UTG': 3, 'UTG1': 4, 'UTG2': 5,
    'MP': 6, 'MP1': 7, 'HJ': 8, 'CO': 9
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTOR 1: SCENARIO PARSER — The Source of Truth
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse scenario_hash with regex precision
 * Example: "BTN_vs_BB_SRP_25bb" → { stackDepth: 25, heroPos: 'BTN', villainPos: 'BB', pot: 4.0 }
 */
const parseScenario = (scenarioHash, rawQuestion = {}) => {
    if (!scenarioHash && !rawQuestion.stack_depth) {
        console.warn('⚠️ No scenario_hash provided, using question data fallback');
    }

    const hash = scenarioHash || '';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. STACK DEPTH EXTRACTION (MANDATORY)
    // ─────────────────────────────────────────────────────────────────────────
    const stackMatch = hash.match(/(\d+(?:\.\d+)?)\s*bb/i);
    let stackDepth = stackMatch ? parseFloat(stackMatch[1]) : null;

    // Fallback to question data if hash doesn't have stack
    if (!stackDepth) {
        stackDepth = rawQuestion.stack_depth || rawQuestion.stackDepth || null;
    }

    // STRICT: Throw if no stack depth found
    if (!stackDepth) {
        console.error('❌ CRITICAL: No stack depth found in scenario. Using 25bb default.');
        stackDepth = 25; // Minimum viable default
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GAME TYPE & SEATING
    // ─────────────────────────────────────────────────────────────────────────
    let gameType = 'HeadsUp';
    let totalSeats = 2;

    if (hash.includes('6max') || hash.includes('6-max')) {
        gameType = '6max';
        totalSeats = 6;
    } else if (hash.includes('FR') || hash.includes('FullRing') || hash.includes('9max')) {
        gameType = 'FullRing';
        totalSeats = 9;
    } else if (hash.includes('3max') || hash.includes('3-max')) {
        gameType = '3max';
        totalSeats = 3;
    }

    // FALLBACK: If no game type in hash, check question metadata
    // ICM/MTT questions default to 9-max (Full Ring)
    if (totalSeats === 2 && !hash) {
        const questionText = (rawQuestion.explanation || rawQuestion.villainAction || '').toLowerCase();
        const isICM = questionText.includes('icm') ||
            questionText.includes('tournament') ||
            questionText.includes('bubble') ||
            questionText.includes('final table') ||
            rawQuestion.lawId?.includes('LAW_07'); // ICM law

        if (isICM) {
            gameType = 'FullRing';
            totalSeats = 9;
        }
    }

    // Parse positions from hash (e.g., BTN_vs_BB)
    const posMatch = hash.match(/([A-Z]{2,3})_vs_([A-Z]{2,3})/i);
    let heroPos = posMatch ? posMatch[1].toUpperCase() : (rawQuestion.position || 'BTN');
    let villainPos = posMatch ? posMatch[2].toUpperCase() : 'BB';

    // ─────────────────────────────────────────────────────────────────────────
    // 3. POT MATH (The Accountant)
    // Formula: Pot = VillainBet + HeroPosted + DeadMoney
    // ─────────────────────────────────────────────────────────────────────────
    let villainBet = 0;
    let heroPosted = 0;
    let deadMoney = 0;

    // Detect villain action from question
    const villainAction = rawQuestion.villain_action || rawQuestion.villainAction || '';
    const villainActionLower = villainAction.toLowerCase();

    // Parse villain bet size — Support formats: "2.5bb", "10BB", "(10BB)", "All-In (25bb)"
    // Priority: Extract explicit number, then fallback to stack for shoves
    const betPatterns = [
        /\((\d+(?:\.\d+)?)\s*bb\)/i,      // (10BB) parenthesized
        /(\d+(?:\.\d+)?)\s*bb/i,           // 10BB or 10 bb
        /(\d+(?:\.\d+)?)\s*x/i             // 3x format
    ];

    let foundBet = false;
    for (const pattern of betPatterns) {
        const match = villainActionLower.match(pattern);
        if (match) {
            villainBet = parseFloat(match[1]);
            foundBet = true;
            break;
        }
    }

    // If no explicit bet found but action is all-in/shoves, use full stack
    if (!foundBet) {
        if (villainActionLower.includes('shoves') || villainActionLower.includes('all-in')) {
            villainBet = stackDepth; // All-in = full stack
        } else if (villainActionLower.includes('raise')) {
            villainBet = 2.5; // Standard raise
        } else if (villainActionLower.includes('minraise')) {
            villainBet = 2.0;
        }
    }

    // Calculate blind contributions
    if (heroPos === 'BB') heroPosted = 1.0;
    else if (heroPos === 'SB') heroPosted = 0.5;

    // Dead money (SB if we're BB, etc.)
    if (heroPos === 'BB') deadMoney = 0.5; // SB is dead money
    else if (heroPos !== 'SB') deadMoney = 1.5; // Both blinds are in

    const potSize = villainBet + heroPosted + deadMoney;

    // ─────────────────────────────────────────────────────────────────────────
    // 4. VILLAIN IS ALL-IN CHECK & REMAINING STACK
    // ─────────────────────────────────────────────────────────────────────────
    const villainIsAllIn = villainActionLower.includes('all-in') ||
        villainActionLower.includes('shoves') ||
        villainBet >= stackDepth;

    // Calculate villain's remaining stack after their bet
    const villainRemainingStack = villainIsAllIn ? 0 : Math.max(0, stackDepth - villainBet);

    return {
        scenarioHash: hash,
        stackDepth,
        gameType,
        totalSeats,
        heroPos,
        villainPos,
        villainBet,
        potSize: Math.round(potSize * 10) / 10, // Round to 1 decimal
        villainIsAllIn,
        villainRemainingStack, // NEW: Villain's stack after bet
        heroCards: rawQuestion.hero_cards || rawQuestion.heroCards || ['As', 'Kh'],
        villainAction,
        boardCards: rawQuestion.board_cards || [],
        street: rawQuestion.street || 'Preflop'
    };
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NARRATIVE FLOW ENGINE: parseScenarioChain
 * ═══════════════════════════════════════════════════════════════════════════
 * Simulates the action chain from the question text.
 * 
 * Requirements:
 * 1. Action Chain Detection: Parse "Folds to CO" → ghost UTG, MP, HJ
 * 2. Dynamic Prompt Injection: Generate "Folds to the CO who raises to 2.5BB"
 * 3. Topology Mapping: Map positions (UTG, CO, BTN) to seat indices
 * 
 * @param {string} villainAction - e.g., "Folds to You", "CO raises to 2.5BB"
 * @param {string} heroPosition - e.g., "BTN", "BB"
 * @param {number} totalSeats - 2, 6, or 9
 * @returns {object} - { actionChain, activeVillains, ghostSeats, narrativeText }
 */
const parseScenarioChain = (villainAction, heroPosition, totalSeats = 9) => {
    // ─────────────────────────────────────────────────────────────────────────
    // TOPOLOGY MAPPING: Position → Seat Index (9-max)
    // ─────────────────────────────────────────────────────────────────────────
    const POSITION_MAP_9MAX = {
        'UTG': 1,
        'UTG+1': 2,
        'MP': 3,
        'HJ': 4,
        'CO': 5,
        'BTN': 6,
        'SB': 7,
        'BB': 8
    };

    const POSITION_MAP_6MAX = {
        'UTG': 1,
        'MP': 2,
        'CO': 3,
        'BTN': 4,
        'SB': 5,
        'BB': 6
    };

    const POSITION_MAP_HU = {
        'SB': 1,
        'BB': 2
    };

    const positionMap = totalSeats === 9 ? POSITION_MAP_9MAX :
        totalSeats === 6 ? POSITION_MAP_6MAX :
            POSITION_MAP_HU;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. ACTION CHAIN DETECTION
    // ─────────────────────────────────────────────────────────────────────────
    const actionLower = (villainAction || '').toLowerCase();

    // Pattern: "Folds to [Position]" or "Folds to You"
    const foldsToMatch = actionLower.match(/folds?\s+to\s+(?:the\s+)?(\w+)/i);

    let activeVillains = [];
    let ghostSeats = [];
    let narrativeText = villainAction;

    if (foldsToMatch) {
        const targetPosition = foldsToMatch[1].toUpperCase();

        if (targetPosition === 'YOU') {
            // "Folds to You" → All villains folded
            ghostSeats = Object.values(positionMap);
            narrativeText = "Folds to You";
        } else {
            // "Folds to CO" → Ghost all seats before CO
            const targetSeat = positionMap[targetPosition];
            if (targetSeat) {
                // Ghost all seats from 1 to targetSeat-1
                for (let i = 1; i < targetSeat; i++) {
                    ghostSeats.push(i);
                }

                // Parse what the target villain did
                const actionMatch = villainAction.match(/who\s+(.+)$/i);
                const villainActionText = actionMatch ? actionMatch[1] : 'acts';

                activeVillains.push({
                    position: targetPosition,
                    seatIndex: targetSeat,
                    action: villainActionText
                });

                narrativeText = `Folds to the ${targetPosition} who ${villainActionText}`;
            }
        }
    } else {
        // Parse direct action: "CO raises to 2.5BB"
        const positionMatch = villainAction.match(/^(UTG|MP|HJ|CO|BTN|SB|BB)\s+(.+)/i);
        if (positionMatch) {
            const position = positionMatch[1].toUpperCase();
            const action = positionMatch[2];
            const seatIndex = positionMap[position];

            if (seatIndex) {
                activeVillains.push({
                    position,
                    seatIndex,
                    action
                });

                narrativeText = `${position} ${action}`;
            }
        }
    }

    return {
        activeVillains,
        ghostSeats,
        narrativeText,
        positionMap
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTOR 2: VERTICAL GEOMETRY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate seat position on VERTICAL ellipse (Portrait Mode)
 * Hero ALWAYS at 90° (Bottom Center)
 */
const getSeatPosition = (index, totalSeats) => {
    const angleStep = (2 * Math.PI) / totalSeats;
    const startOffset = Math.PI / 2; // 90 degrees = Bottom
    const angle = startOffset + (index * angleStep);

    // VERTICAL ELLIPSE: Narrower width, taller height
    const radiusX = 32; // Width (narrower)
    const radiusY = 48; // Height (taller - increased for more vertical look)

    return {
        left: `${50 + radiusX * Math.cos(angle)}%`,
        top: `${50 + radiusY * Math.sin(angle)}%`,
        transform: 'translate(-50%, -50%)'
    };
};

/**
 * Calculate dealer button position (inner track)
 */
const getDealerButtonPosition = (dealerSeatIndex, totalSeats) => {
    const angleStep = (2 * Math.PI) / totalSeats;
    const startOffset = Math.PI / 2;
    const angle = startOffset + (dealerSeatIndex * angleStep);

    // Inner track (smaller radius)
    const radiusX = 28;
    const radiusY = 35;

    return {
        left: `${50 + radiusX * Math.cos(angle)}%`,
        top: `${50 + radiusY * Math.sin(angle)}%`,
        transform: 'translate(-50%, -50%)'
    };
};

// Legacy alias for compatibility
const getSeatStyle = getSeatPosition;

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE 7: AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const useAudioEngine = () => {
    const audioContext = useRef(null);

    const initAudio = useCallback(() => {
        if (!audioContext.current && typeof window !== 'undefined') {
            audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
        }
    }, []);

    const playTone = useCallback((freq, duration, type = 'sine') => {
        if (!audioContext.current) return;
        const osc = audioContext.current.createOscillator();
        const gain = audioContext.current.createGain();
        osc.connect(gain);
        gain.connect(audioContext.current.destination);
        osc.frequency.value = freq;
        osc.type = type;
        gain.gain.setValueAtTime(0.1, audioContext.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + duration);
        osc.start();
        osc.stop(audioContext.current.currentTime + duration);
    }, []);

    const playCardFlip = useCallback(() => playTone(800, 0.08, 'triangle'), [playTone]);
    const playChips = useCallback(() => playTone(1200, 0.05, 'square'), [playTone]);
    const playSuccess = useCallback(() => {
        playTone(523, 0.1); // C5
        setTimeout(() => playTone(659, 0.1), 100); // E5
        setTimeout(() => playTone(784, 0.15), 200); // G5
    }, [playTone]);
    const playError = useCallback(() => playTone(200, 0.3, 'sawtooth'), [playTone]);

    return { initAudio, playCardFlip, playChips, playSuccess, playError };
};

// ═══════════════════════════════════════════════════════════════════════════
// 3D CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const Card3D = ({ card, isFlipped = false, delay = 0, size = 'normal' }) => {
    // Start face-down, then flip face-up after delay when isFlipped becomes true
    const [flipped, setFlipped] = useState(false);

    useEffect(() => {
        if (isFlipped) {
            const timer = setTimeout(() => setFlipped(true), delay);
            return () => clearTimeout(timer);
        } else {
            setFlipped(false);
        }
    }, [isFlipped, delay]);

    const isFaceUp = card && card.length >= 2 && card !== '??' && flipped;
    const rank = isFaceUp ? (card[0] || '').toUpperCase() : '';
    const suit = isFaceUp ? (card[1] || '').toLowerCase() : '';
    const suitSymbol = SUIT_SYMBOLS[suit] || '';
    const suitColor = SUIT_COLORS[suit] || '#000';

    const cardWidth = size === 'small' ? 40 : size === 'large' ? 70 : 56;
    const cardHeight = cardWidth * 1.4;

    return (
        <div style={{
            width: cardWidth,
            height: cardHeight,
            perspective: 1000,
            display: 'inline-block',
            margin: '0 3px'
        }}>
            <div style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.4s ease-out',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
            }}>
                {/* Card Back */}
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    background: 'linear-gradient(135deg, #1e3a5f, #0f172a)',
                    borderRadius: 8,
                    border: '2px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                }}>
                    <div style={{
                        width: '80%',
                        height: '80%',
                        background: 'repeating-linear-gradient(45deg, #1e3a5f, #1e3a5f 4px, #0f172a 4px, #0f172a 8px)',
                        borderRadius: 4
                    }} />
                </div>

                {/* Card Front */}
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: '#fff',
                    borderRadius: 8,
                    border: '2px solid #e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                    <div style={{
                        fontSize: cardWidth * 0.4,
                        fontWeight: 'bold',
                        color: suitColor,
                        lineHeight: 1
                    }}>
                        {rank}
                    </div>
                    <div style={{
                        fontSize: cardWidth * 0.35,
                        color: suitColor,
                        lineHeight: 1
                    }}>
                        {suitSymbol}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Villain avatar images (placeholder character styles)
const VILLAIN_AVATARS = [
    '🤖', // Robot
    '🦊', // Fox
    '🐺', // Wolf
    '🦁', // Lion
    '🐻', // Bear
    '🦅', // Eagle
    '🐙', // Octopus
    '🦈'  // Shark
];

const PlayerSeat = ({ player, isHero, isActive, position, dealerSeat, showCards, cardDelay, heroPosition, isGhost }) => {
    const hasDealer = dealerSeat === position;
    const villainAvatar = VILLAIN_AVATARS[(position || 1) % VILLAIN_AVATARS.length];

    // SECTOR 3: GHOST PLAYERS — Reduce opacity for folded/inactive seats
    const ghostOpacity = isGhost ? 0.4 : 1.0;

    return (
        <div style={{
            position: 'absolute',
            ...getSeatStyle(position, player.totalPlayers),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            zIndex: isHero ? 100 : 10,
            opacity: ghostOpacity,
            transition: 'opacity 0.3s ease'
        }}>
            {/* HERO GOLD GLOW — Only for Hero */}
            {isHero && (
                <div style={{
                    position: 'absolute',
                    top: -20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 140,
                    height: 140,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, rgba(251, 191, 36, 0) 70%)',
                    boxShadow: '0 0 40px rgba(251, 191, 36, 0.5), 0 0 80px rgba(251, 191, 36, 0.3)',
                    zIndex: -1,
                    pointerEvents: 'none'
                }} />
            )}

            {/* Villain Avatar — Character image above cards */}
            {!isHero && (
                <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #374151, #1f2937)',
                    border: '2px solid rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    marginBottom: -4,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                }}>
                    {villainAvatar}
                </div>
            )}
            {/* Dealer Button */}
            {hasDealer && (
                <div style={{
                    position: 'absolute',
                    top: -30,
                    right: -20,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                    border: '2px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#000',
                    boxShadow: '0 2px 8px rgba(251, 191, 36, 0.5)'
                }}>
                    D
                </div>
            )}

            {/* Cards */}
            <div style={{ display: 'flex', gap: 4 }}>
                {player.cards.map((card, i) => (
                    <Card3D
                        key={i}
                        card={card}
                        isFlipped={showCards}
                        delay={cardDelay + (i * 150)}
                        size={isHero ? 'large' : 'small'}
                    />
                ))}
            </div>

            {/* Player Info */}
            <div style={{
                background: isHero
                    ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                    : 'rgba(30, 41, 59, 0.9)',
                padding: '8px 16px',
                borderRadius: 12,
                border: isActive ? '2px solid #4ade80' : '1px solid rgba(255,255,255,0.2)',
                textAlign: 'center',
                boxShadow: isActive
                    ? '0 0 20px rgba(74, 222, 128, 0.4), 0 0 40px rgba(74, 222, 128, 0.2)'
                    : isHero
                        ? '0 0 15px rgba(37, 99, 235, 0.5)'
                        : 'none'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                }}>
                    <span style={{
                        fontSize: 13,
                        fontWeight: 'bold',
                        color: '#fff'
                    }}>
                        {isHero ? 'YOU' : `V${position}`}
                    </span>
                    {isHero && heroPosition && (
                        <span style={{
                            fontSize: 10,
                            fontWeight: 'bold',
                            color: '#fbbf24',
                            background: 'rgba(251, 191, 36, 0.2)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            letterSpacing: 0.5
                        }}>
                            {heroPosition}
                        </span>
                    )}
                </div>
                {/* Stack Size — Prominent Display */}
                <div style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: isHero ? '#4ade80' : '#f59e0b',
                    marginTop: 4,
                    background: isHero ? 'rgba(74, 222, 128, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    padding: '3px 8px',
                    borderRadius: 6
                }}>
                    {player.isAllIn ? '🔴 ALL-IN' : `${player.stack}bb`}
                </div>
            </div>

            {/* Chip Stack Visual */}
            <div style={{
                position: 'absolute',
                bottom: isHero ? -45 : 'auto',
                top: isHero ? 'auto' : -45,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2
            }}>
                {/* Chip stack (visual only) */}
                <div style={{
                    display: 'flex',
                    gap: -6,
                    marginLeft: -6
                }}>
                    {[...Array(Math.min(5, Math.ceil(player.stack / 20)))].map((_, i) => (
                        <div key={i} style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                            border: '2px solid #fff',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            marginLeft: i > 0 ? -8 : 0
                        }} />
                    ))}
                </div>
            </div>

            {/* Action Badge */}
            {player.lastAction && (
                <div style={{
                    position: 'absolute',
                    bottom: -30,
                    background: player.lastAction === 'FOLD'
                        ? 'rgba(239, 68, 68, 0.8)'
                        : 'rgba(34, 197, 94, 0.8)',
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: '#fff'
                }}>
                    {player.lastAction}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// BOARD CARDS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const BoardCards = ({ cards, showCards, delayStart = 0 }) => {
    if (!cards || cards.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            padding: 12,
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 12
        }}>
            {cards.map((card, i) => (
                <Card3D
                    key={i}
                    card={card}
                    isFlipped={showCards}
                    delay={delayStart + (i * 200)}
                    size="normal"
                />
            ))}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION BUTTONS COMPONENT — 2x2 GRID WITH TIMER & QUESTION COUNT
// ═══════════════════════════════════════════════════════════════════════════

const ActionButtons = ({ actions, onAction, disabled, timer, currentQ, totalQ }) => {
    // All buttons now use a unified blue video game style
    const getButtonStyle = (action) => {
        const baseColors = {
            Fold: { bg: 'linear-gradient(180deg, #1e40af, #1e3a8a)', border: '#3b82f6' },
            Check: { bg: 'linear-gradient(180deg, #1e40af, #1e3a8a)', border: '#3b82f6' },
            Call: { bg: 'linear-gradient(180deg, #1e40af, #1e3a8a)', border: '#3b82f6' },
            Raise: { bg: 'linear-gradient(180deg, #1e40af, #1e3a8a)', border: '#3b82f6' },
            Bet: { bg: 'linear-gradient(180deg, #1e40af, #1e3a8a)', border: '#3b82f6' },
            AllIn: { bg: 'linear-gradient(180deg, #1e40af, #1e3a8a)', border: '#3b82f6' }
        };
        return baseColors[action] || baseColors.Call;
    };

    // Get timer color based on time remaining
    const getTimerColor = () => {
        if (timer > 10) return '#4ade80'; // Green
        if (timer > 5) return '#fbbf24'; // Yellow
        return '#ef4444'; // Red
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            maxWidth: 600,
            margin: '0 auto',
            padding: '0 16px'
        }}>
            {/* Timer - Left Side */}
            <div style={{
                width: 60,
                height: 60,
                borderRadius: 12,
                background: 'rgba(30, 41, 59, 0.9)',
                border: `3px solid ${getTimerColor()}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 'bold',
                color: getTimerColor(),
                boxShadow: `0 0 20px ${getTimerColor()}40`,
                flexShrink: 0
            }}>
                {timer}
            </div>

            {/* 2x2 Button Grid - Center */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                flex: 1
            }}>
                {actions.map((action) => {
                    const style = getButtonStyle(action);
                    return (
                        <button
                            key={action}
                            onClick={() => !disabled && onAction(action)}
                            disabled={disabled}
                            style={{
                                padding: '14px 8px',
                                fontSize: 16,
                                fontWeight: 'bold',
                                letterSpacing: 0.5,
                                background: style.bg,
                                border: `2px solid ${style.border}`,
                                borderRadius: 8,
                                color: '#fff',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                opacity: disabled ? 0.5 : 1,
                                transition: 'transform 0.1s, box-shadow 0.2s',
                                boxShadow: disabled ? 'none' : '0 3px 0 #0f172a, 0 6px 15px rgba(0,0,0,0.3)',
                                textShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }}
                            onMouseDown={(e) => { if (!disabled) e.target.style.transform = 'translateY(2px)'; }}
                            onMouseUp={(e) => { e.target.style.transform = 'translateY(0)'; }}
                            onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; }}
                        >
                            {action}
                        </button>
                    );
                })}
            </div>

            {/* Question Count - Right Side */}
            <div style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(30, 41, 59, 0.9)',
                border: '2px solid rgba(148, 163, 184, 0.3)',
                flexShrink: 0,
                textAlign: 'center'
            }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Question</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>
                    {currentQ} of {totalQ}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK OVERLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const FeedbackOverlay = ({ verdict, explanation, evLoss, alternativeActions, onContinue }) => {
    const colors = {
        [Verdict.PERFECT]: { bg: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)', icon: '✓', text: 'PERFECT!' },
        [Verdict.ACCEPTABLE]: { bg: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', icon: '~', text: 'ACCEPTABLE' },
        [Verdict.BLUNDER]: { bg: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', icon: '✗', text: 'BLUNDER' }
    };

    const style = colors[verdict] || colors[Verdict.BLUNDER];

    return (
        <div
            onClick={onContinue}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                cursor: 'pointer'
            }}
        >
            <div style={{
                background: 'linear-gradient(135deg, #1a2744, #0a1628)',
                padding: 40,
                borderRadius: 24,
                textAlign: 'center',
                maxWidth: 450,
                border: `3px solid ${style.bg}`,
                boxShadow: `0 0 60px ${style.glow}`
            }}>
                {/* Icon */}
                <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: style.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    fontSize: 40,
                    fontWeight: 'bold',
                    color: '#fff'
                }}>
                    {style.icon}
                </div>

                {/* Verdict */}
                <h2 style={{
                    fontSize: 28,
                    fontWeight: 'bold',
                    color: style.bg,
                    marginBottom: 16
                }}>
                    {style.text}
                </h2>

                {/* EV Loss */}
                {evLoss !== undefined && evLoss > 0 && (
                    <div style={{
                        fontSize: 14,
                        color: '#94a3b8',
                        marginBottom: 12
                    }}>
                        EV Loss: -{(evLoss * 100).toFixed(1)}%
                    </div>
                )}

                {/* Explanation */}
                <p style={{
                    fontSize: 16,
                    color: '#e2e8f0',
                    lineHeight: 1.6,
                    marginBottom: alternativeActions?.length > 0 ? 16 : 24
                }}>
                    {explanation}
                </p>

                {/* Alternative Lines (for mixed strategies) */}
                {alternativeActions && alternativeActions.length > 0 && (
                    <div style={{
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 24
                    }}>
                        <div style={{
                            fontSize: 12,
                            color: '#94a3b8',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: 1
                        }}>
                            Alternative GTO Lines
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                            {alternativeActions.map((alt, i) => (
                                <div key={i} style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    padding: '6px 12px',
                                    borderRadius: 8,
                                    fontSize: 13
                                }}>
                                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{alt.action}</span>
                                    <span style={{ color: '#94a3b8', marginLeft: 6 }}>
                                        {(alt.freq * 100).toFixed(0)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Continue */}
                <div style={{
                    fontSize: 14,
                    color: '#64748b',
                    fontStyle: 'italic'
                }}>
                    Tap anywhere to continue...
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: GOD MODE TRAINING TABLE
// ═══════════════════════════════════════════════════════════════════════════

export default function GodModeTrainingTable({
    questions = [],
    levelName = 'Training',
    onLevelComplete
}) {
    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 4: GAME LOOP STATE MACHINE
    // ─────────────────────────────────────────────────────────────────────────
    const [gameState, setGameState] = useState(GameState.LOADING);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [showCards, setShowCards] = useState(false);

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 6: PROGRESSION ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [actionTimer, setActionTimer] = useState(15); // 15 second timer

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 3: GTO BRAIN — FEEDBACK STATE
    // ─────────────────────────────────────────────────────────────────────────
    const [feedback, setFeedback] = useState(null);

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 7: AUDIO ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    const { initAudio, playCardFlip, playChips, playSuccess, playError } = useAudioEngine();

    // Current question data
    const currentQuestion = questions[currentQuestionIndex] || null;
    const totalQuestions = questions.length || 20;
    const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTOR 1: SCENARIO PARSER INTEGRATION
    // ─────────────────────────────────────────────────────────────────────────

    // Use the new military-grade parseScenario engine
    const scenario = currentQuestion
        ? parseScenario(currentQuestion.scenario_hash || '', currentQuestion)
        : null;

    // NARRATIVE FLOW ENGINE: Parse action chain
    const actionChain = scenario
        ? parseScenarioChain(scenario.villainAction, scenario.heroPos, scenario.totalSeats)
        : { activeVillains: [], ghostSeats: [], narrativeText: '', positionMap: {} };

    // SECTOR 3: GHOST PLAYERS — Build players array with action chain simulation
    const players = Array.from({ length: scenario?.totalSeats || 2 }, (_, i) => {
        const isHero = i === 0;

        // Check if this seat is an active villain from the action chain
        const activeVillain = actionChain.activeVillains.find(v => v.seatIndex === i);

        // Check if this seat should be ghosted (folded before action)
        const isGhosted = actionChain.ghostSeats.includes(i);

        const isActive = isHero || !!activeVillain;

        return {
            seatIndex: i,
            cards: isHero ? (scenario?.heroCards || ['??', '??']) : ['??', '??'],
            stack: isHero
                ? (scenario?.stackDepth || 25)
                : activeVillain
                    ? (scenario?.villainRemainingStack ?? scenario?.stackDepth ?? 25)
                    : (scenario?.stackDepth || 25),
            totalPlayers: scenario?.totalSeats || 2,
            lastAction: activeVillain ? activeVillain.action : null,
            isAllIn: activeVillain && scenario?.villainIsAllIn,
            isGhost: isGhosted || !isActive, // Ghost if folded OR inactive
            position: isHero
                ? scenario?.heroPos
                : activeVillain
                    ? activeVillain.position
                    : null
        };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GAME LOOP EFFECTS
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        // Initialize on mount
        if (questions.length > 0) {
            initAudio();
            startDeal();
        }
    }, [questions]);

    useEffect(() => {
        // Start dealing when question changes
        if (currentQuestion && gameState === GameState.NEXT_HAND) {
            startDeal();
        }
    }, [currentQuestionIndex]);

    const startDeal = useCallback(() => {
        setGameState(GameState.DEALING);
        setShowCards(false);
        setFeedback(null);
        setActionTimer(15); // Reset timer

        // Animate deal
        setTimeout(() => {
            setShowCards(true);
            playCardFlip();
        }, 300);

        // Enable actions after deal
        setTimeout(() => {
            setGameState(GameState.ACTION_REQUIRED);
        }, 1200);
    }, [playCardFlip]);

    // Action countdown timer effect
    useEffect(() => {
        if (gameState !== GameState.ACTION_REQUIRED) return;
        if (actionTimer <= 0) return;

        const interval = setInterval(() => {
            setActionTimer(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [gameState, actionTimer]);

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 3: GTO BRAIN — Handle action + grading
    // ─────────────────────────────────────────────────────────────────────────
    const handleAction = useCallback((action) => {
        if (gameState !== GameState.ACTION_REQUIRED) return;

        setGameState(GameState.EVALUATING);

        // Normalize action to lowercase for comparison
        const userAction = action.toLowerCase();

        // Get correct action from question (supports old format and new format)
        const correctAction = (
            currentQuestion?.correct_action ||
            currentQuestion?.correctAction ||
            ''
        ).toLowerCase();

        let verdict = Verdict.BLUNDER;
        let evLoss = 0;
        let explanation = currentQuestion?.explanation || 'Action not found in GTO solution.';

        // ─────────────────────────────────────────────────────────────────────
        // GTO BRAIN: Check strategy_matrix for mixed strategies
        // ─────────────────────────────────────────────────────────────────────
        const strategyMatrix = currentQuestion?.strategy_matrix || {};
        const heroCards = currentQuestion?.hero_cards || currentQuestion?.heroCards || [];
        const handKey = heroCards.join('');
        const handStrategy = strategyMatrix[handKey] || null;

        if (handStrategy && handStrategy.actions) {
            // Look up user's chosen action in strategy_matrix
            const actionKey = userAction.charAt(0).toUpperCase() + userAction.slice(1); // "call" -> "Call"
            const actionData = handStrategy.actions[actionKey];

            if (actionData) {
                // Mixed Strategy Check: If frequency > 0, this action is acceptable
                const frequency = actionData.freq || actionData.frequency || 0;
                evLoss = actionData.ev_loss || actionData.evLoss || 0;

                if (frequency >= 0.95) {
                    // Pure strategy - this IS the correct action
                    verdict = Verdict.PERFECT;
                    explanation = currentQuestion?.explanation || 'Perfect! This is the GTO recommended play.';
                } else if (frequency > 0) {
                    // Mixed strategy - this is acceptable but not optimal
                    // ACCEPTABLE if EV loss is small (< 0.05bb)
                    if (evLoss < 0.05) {
                        verdict = Verdict.PERFECT;
                        explanation = `Perfect! GTO recommends this ${Math.round(frequency * 100)}% of the time.`;
                    } else if (evLoss < 0.1) {
                        verdict = Verdict.ACCEPTABLE;
                        explanation = `Acceptable. GTO uses this ${Math.round(frequency * 100)}% (EV loss: ${evLoss.toFixed(2)}bb).`;
                    } else {
                        verdict = Verdict.BLUNDER;
                        explanation = `Not optimal. EV loss: ${evLoss.toFixed(2)}bb. Best action: ${handStrategy.best_action || correctAction.toUpperCase()}.`;
                    }
                } else {
                    // Frequency is 0 - this is a blunder
                    verdict = Verdict.BLUNDER;
                    const maxEv = handStrategy.max_ev || 0;
                    const userEv = actionData.ev || 0;
                    evLoss = maxEv - userEv;
                    explanation = `Blunder! EV loss: ${Math.abs(evLoss).toFixed(2)}bb. Correct: ${handStrategy.best_action || correctAction.toUpperCase()}.`;
                }
            } else {
                // Action not in strategy matrix - check against correctAction
                if (userAction === correctAction) {
                    verdict = Verdict.PERFECT;
                    explanation = currentQuestion?.explanation || 'Perfect play!';
                } else {
                    verdict = Verdict.BLUNDER;
                    explanation = `The correct action was ${correctAction.toUpperCase()}. ${currentQuestion?.explanation || ''}`;
                }
            }
        } else {
            // No strategy matrix - fall back to simple case-insensitive match
            if (userAction === correctAction) {
                verdict = Verdict.PERFECT;
                explanation = currentQuestion?.explanation || 'Perfect play! This is the correct action.';
                evLoss = 0;
            } else {
                verdict = Verdict.BLUNDER;
                explanation = `The correct action was ${correctAction.toUpperCase()}. ${currentQuestion?.explanation || ''}`;
            }
        }

        // Play chips sound on bet/raise actions
        if (userAction === 'raise' || userAction === 'bet' || userAction === 'call') {
            playChips();
        }

        // Audio feedback for result
        if (verdict === Verdict.PERFECT || verdict === Verdict.ACCEPTABLE) {
            playSuccess();
            setScore(prev => prev + 1);
            setStreak(prev => {
                const newStreak = prev + 1;
                setMaxStreak(max => Math.max(max, newStreak));
                return newStreak;
            });
        } else {
            playError();
            setStreak(0);
        }

        // Compute alternative actions from strategy_matrix for mixed strategies
        let alternativeActions = [];
        if (handStrategy && handStrategy.actions) {
            alternativeActions = Object.entries(handStrategy.actions)
                .filter(([action, data]) => {
                    const freq = data.freq || data.frequency || 0;
                    const actionKey = action.toLowerCase();
                    // Include if freq > 5% and not the user's action
                    return freq > 0.05 && actionKey !== userAction;
                })
                .map(([action, data]) => ({
                    action: action,
                    freq: data.freq || data.frequency || 0
                }))
                .sort((a, b) => b.freq - a.freq)
                .slice(0, 2); // Max 2 alternatives
        }

        // Show feedback
        setFeedback({ verdict, explanation, evLoss, alternativeActions });
        setGameState(GameState.FEEDBACK_OVERLAY);

    }, [gameState, currentQuestion, playChips, playSuccess, playError]);

    // Handle continue after feedback
    const handleContinue = useCallback(() => {
        if (isLastQuestion) {
            setGameState(GameState.LEVEL_COMPLETE);
            if (onLevelComplete) {
                onLevelComplete({
                    score,
                    total: totalQuestions,
                    streak: maxStreak
                });
            }
        } else {
            setCurrentQuestionIndex(prev => prev + 1);
            setGameState(GameState.NEXT_HAND);
        }
        setFeedback(null);
    }, [isLastQuestion, score, totalQuestions, maxStreak, onLevelComplete]);

    // Available actions based on street/scenario
    const availableActions = ['Fold', 'Check', 'Call', 'Raise'];

    // ─────────────────────────────────────────────────────────────────────────
    // LOADING STATE
    // ─────────────────────────────────────────────────────────────────────────
    if (gameState === GameState.LOADING || !currentQuestion) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(to bottom, #0a0a15, #1a1a2e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00d4ff'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>Loading Quiz...</div>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL COMPLETE STATE
    // ─────────────────────────────────────────────────────────────────────────
    if (gameState === GameState.LEVEL_COMPLETE) {
        const accuracy = Math.round((score / totalQuestions) * 100);
        const passed = accuracy >= 85;

        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(to bottom, #0a0a15, #1a1a2e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #1a2744, #0a1628)',
                    padding: 48,
                    borderRadius: 24,
                    border: passed ? '3px solid #4ade80' : '3px solid #f97316',
                    textAlign: 'center',
                    maxWidth: 500
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>
                        {passed ? '🏆' : '📚'}
                    </div>
                    <h1 style={{
                        fontSize: 28,
                        fontWeight: 'bold',
                        color: passed ? '#4ade80' : '#f97316',
                        marginBottom: 24
                    }}>
                        {passed ? 'LEVEL COMPLETE!' : 'KEEP PRACTICING'}
                    </h1>
                    <div style={{
                        fontSize: 48,
                        fontWeight: 'bold',
                        color: passed ? '#4ade80' : '#f97316',
                        marginBottom: 8
                    }}>
                        {accuracy}%
                    </div>
                    <div style={{ color: '#94a3b8', marginBottom: 24 }}>
                        {score}/{totalQuestions} correct • Best streak: {maxStreak}
                    </div>
                    <button
                        onClick={() => window.location.href = '/hub/training'}
                        style={{
                            padding: '16px 32px',
                            fontSize: 16,
                            fontWeight: 'bold',
                            background: passed ? '#22c55e' : '#f97316',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        {passed ? '🚀 NEXT LEVEL' : '🔄 TRY AGAIN'}
                    </button>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN RENDER — ENGINE 2: VISUAL ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(to bottom, #0a0a15 0%, #1a1a2e 50%, #0a0a15 100%)',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: 'Inter, -apple-system, sans-serif'
        }}>
            {/* FEEDBACK OVERLAY */}
            {feedback && gameState === GameState.FEEDBACK_OVERLAY && (
                <FeedbackOverlay
                    verdict={feedback.verdict}
                    explanation={feedback.explanation}
                    evLoss={feedback.evLoss}
                    alternativeActions={feedback.alternativeActions}
                    onContinue={handleContinue}
                />
            )}

            {/* TOP BAR — HUD */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                padding: '12px 20px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 50
            }}>
                {/* Left: Level Name + Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                        {levelName}
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 14 }}>
                        Q: {currentQuestionIndex + 1}/{totalQuestions}
                    </span>
                </div>

                {/* Right: XP, Diamonds, Score, Streak */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 14 }}>
                    {/* XP Counter */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'rgba(74, 222, 128, 0.2)',
                        padding: '4px 10px',
                        borderRadius: 12
                    }}>
                        <span style={{ fontSize: 16 }}>⚡</span>
                        <span style={{ color: '#4ade80', fontWeight: 'bold' }}>1,250 XP</span>
                    </div>

                    {/* Diamond Counter */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'rgba(96, 165, 250, 0.2)',
                        padding: '4px 10px',
                        borderRadius: 12
                    }}>
                        <span style={{ fontSize: 16 }}>💎</span>
                        <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>50</span>
                    </div>

                    {/* Score */}
                    <span style={{ color: '#4ade80' }}>
                        ✓ {score}
                    </span>

                    {/* Streak */}
                    {streak > 1 && (
                        <span style={{ color: '#f59e0b' }}>
                            🔥 {streak}x
                        </span>
                    )}
                </div>
            </div>

            {/* SCENARIO PROMPT BOX — Above Table */}
            {gameState === GameState.ACTION_REQUIRED && currentQuestion && (
                <div style={{
                    position: 'absolute',
                    top: 80,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #1e3a5f, #0f2744)',
                    border: '2px solid rgba(96, 165, 250, 0.4)',
                    borderRadius: 16,
                    padding: '16px 24px',
                    maxWidth: 500,
                    width: '90%',
                    textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 40
                }}>
                    <div style={{
                        fontSize: 15,
                        color: '#e2e8f0',
                        lineHeight: 1.5
                    }}>
                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>You are on the {scenario?.heroPosition || 'BTN'}</span>
                        {' with '}
                        <span style={{ color: '#fff', fontWeight: 'bold' }}>
                            {scenario?.heroCards?.join(' ') || 'A♠ K♥'}
                        </span>
                        {actionChain.narrativeText && (
                            <>
                                {'. '}
                                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                                    {actionChain.narrativeText}
                                </span>
                            </>
                        )}
                    </div>
                    <div style={{
                        marginTop: 8,
                        fontSize: 18,
                        fontWeight: 'bold',
                        color: '#60a5fa'
                    }}>
                        What's your move?
                    </div>
                </div>
            )}

            {/* POKER TABLE — Center */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: 700,
                aspectRatio: '16/10'
            }}>
                {/* Table Surface */}
                <div style={{
                    position: 'absolute',
                    inset: '10%',
                    background: 'linear-gradient(135deg, #15803d, #166534)',
                    borderRadius: '50%',
                    border: '12px solid rgba(251, 191, 36, 0.6)',
                    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.6)'
                }}>
                    {/* Villain Action Banner */}
                    {scenario?.villainAction && (
                        <div style={{
                            position: 'absolute',
                            top: '15%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(239, 68, 68, 0.9)',
                            padding: '8px 16px',
                            borderRadius: 20,
                            fontSize: 13,
                            fontWeight: 'bold',
                            color: '#fff',
                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                            whiteSpace: 'nowrap'
                        }}>
                            ⚠️ {actionChain.narrativeText.toUpperCase()}
                        </div>
                    )}

                    {/* Pot Display */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                    }}>
                        {/* Street Indicator */}
                        <div style={{
                            fontSize: 11,
                            fontWeight: 'bold',
                            color: '#00d4ff',
                            letterSpacing: 1,
                            marginBottom: 6,
                            textTransform: 'uppercase'
                        }}>
                            {scenario?.street || 'PREFLOP'}
                        </div>
                        <div style={{
                            fontSize: 14,
                            color: 'rgba(255,255,255,0.6)',
                            marginBottom: 4
                        }}>
                            POT
                        </div>
                        <div style={{
                            fontSize: 28,
                            fontWeight: 'bold',
                            color: '#fbbf24'
                        }}>
                            {scenario?.potSize || 3.5}bb
                        </div>

                        {/* Question Prompt */}
                        {gameState === GameState.ACTION_REQUIRED && (
                            <div style={{
                                marginTop: 16,
                                padding: '10px 16px',
                                background: 'rgba(0,0,0,0.5)',
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                <div style={{
                                    fontSize: 16,
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    marginBottom: 4
                                }}>
                                    🎯 What's your play?
                                </div>
                                <div style={{
                                    fontSize: 12,
                                    color: 'rgba(255,255,255,0.6)'
                                }}>
                                    Hero: {scenario?.heroCards?.join(' ') || 'A♠ K♥'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Board Cards */}
                    {scenario?.boardCards?.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '30%',
                            left: '50%',
                            transform: 'translateX(-50%)'
                        }}>
                            <BoardCards
                                cards={scenario.boardCards}
                                showCards={showCards}
                                delayStart={600}
                            />
                        </div>
                    )}
                </div>

                {/* Player Seats */}
                {players.map((player, i) => (
                    <PlayerSeat
                        key={i}
                        player={player}
                        isHero={i === 0}
                        isActive={i === 0 && gameState === GameState.ACTION_REQUIRED}
                        position={i}
                        dealerSeat={0} // Button on hero in HU
                        showCards={showCards}
                        cardDelay={i * 200}
                        heroPosition={i === 0 ? scenario?.heroPos : null}
                        isGhost={player.isGhost}
                    />
                ))}
            </div>

            {/* BOTTOM BAR — Actions */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '24px 16px 40px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                zIndex: 50
            }}>
                {/* Timer Display */}
                {gameState === GameState.ACTION_REQUIRED && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        marginBottom: 12
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            background: 'rgba(0,0,0,0.5)',
                            padding: '6px 16px',
                            borderRadius: 20,
                            border: actionTimer <= 5
                                ? '1px solid rgba(239, 68, 68, 0.6)'
                                : '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <span style={{
                                fontSize: 16,
                                color: actionTimer <= 5 ? '#ef4444' : actionTimer <= 10 ? '#fbbf24' : '#4ade80',
                                fontWeight: 'bold',
                                fontFamily: 'monospace'
                            }}>
                                ⏱️ {actionTimer}s
                            </span>
                        </div>
                    </div>
                )}

                <ActionButtons
                    actions={availableActions}
                    onAction={handleAction}
                    disabled={gameState !== GameState.ACTION_REQUIRED}
                    timer={actionTimer}
                    currentQ={currentQuestionIndex + 1}
                    totalQ={totalQuestions}
                />
            </div>
        </div>
    );
}
