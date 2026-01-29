/**
 * Training Arena Page — Golden Template (Locked Scale)
 * =====================================================
 * Design Canvas: 862 × 1024 px
 * Scaling: Uniform proportional scale based on viewport
 * Everything scales together — header, table, buttons, ALL of it.
 *
 * Route: /hub/training/arena/[gameId]?level=X&session=Y
 */

import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { supabase } from '../../../../src/lib/supabase';
import { getAuthUser, queryProfiles, queryDiamondBalance } from '../../../../src/lib/authUtils';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import { TABLE_LAYOUTS, getLayoutForGame, LAYOUT_9MAX } from '../../../../src/config/table-layouts';
import { getVillainAvatars, getHeroAvatar } from '../../../../src/config/avatar-pool';
import MillionaireQuestion from '../../../../src/components/training/MillionaireQuestion';
import LevelCompleteModal from '../../../../src/components/training/LevelCompleteModal';
import useMillionaireGame from '../../../../src/hooks/useMillionaireGame';
import TRAINING_CONFIG from '../../../../src/config/trainingConfig';

// Design canvas dimensions (locked)
const DESIGN_WIDTH = 862;
const DESIGN_HEIGHT = 1024;

// NOTE: SEAT_POSITIONS is now loaded dynamically from table-layouts.js
// based on the game's layoutType configuration

const SUITS = {
    s: { symbol: '♠', color: '#1a1d24' },
    h: { symbol: '♥', color: '#dc2626' },
    d: { symbol: '♦', color: '#3b82f6' },
    c: { symbol: '♣', color: '#22c55e' },
};

function parseCards(cardString) {
    if (!cardString) return [];
    const cards = [];
    const regex = /([AKQJT98765432])([shdc])/g;
    let match;
    while ((match = regex.exec(cardString)) !== null) {
        const [, rank, suit] = match;
        cards.push({ rank, suit: SUITS[suit]?.symbol || suit, isRed: suit === 'h' || suit === 'd' });
    }
    return cards;
}

// ============== COMPONENTS ==============

function ArenaHeader({ diamonds = 0, xp = 0, level = 1, onBack, onSettings }) {
    const headerStyle = {
        flexShrink: 0,
        height: 56,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        background: 'rgba(10, 14, 23, 0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        width: '100%',
    };
    const backBtnStyle = {
        padding: '8px 14px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
    };
    const brandStyle = { fontSize: 16, fontWeight: 700, color: '#fff' };
    const statsStyle = { display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' };
    const statStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'rgba(0,150,200,0.2)',
        border: '1px solid rgba(0,200,255,0.3)',
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    };
    const plusBtnStyle = {
        width: 20, height: 20, borderRadius: '50%', background: '#22c55e',
        border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, lineHeight: 1, padding: 0,
    };
    const iconsStyle = { display: 'flex', gap: 8, marginLeft: 12 };
    const iconCircleStyle = {
        width: 36, height: 36, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
        background: 'linear-gradient(135deg, #2d7ad4 0%, #1e5fa8 100%)',
    };
    const settingsStyle = { ...iconCircleStyle, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' };

    return (
        <div style={headerStyle}>
            <button style={backBtnStyle} onClick={onBack}>← Back</button>
            <span style={brandStyle}>Smarter.Poker</span>
            <div style={statsStyle}>
                <div style={statStyle}>
                    <span>💎</span>
                    <span>{diamonds}</span>
                    <button style={plusBtnStyle}>+</button>
                </div>
                <div style={statStyle}>
                    <span>XP {xp}</span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>LV {level}</span>
                </div>
            </div>
            <div style={iconsStyle}>
                <div style={iconCircleStyle}>👤</div>
                <div style={iconCircleStyle}>✉️</div>
                <div style={iconCircleStyle}>🔔</div>
                <button style={settingsStyle} onClick={onSettings}>⚙️</button>
            </div>
        </div>
    );
}

// Draggable Player Seat - Avatar and Badge are ONE unified element
// They move together as a single unit, not separately
// SCALE FIX: Accepts scale prop and divides mouse coordinates by scale
function DraggablePlayerSeat({ avatar, name, stack, seatId, seatIndex = 0, initialPosition, isHero = false, onPositionChange, devMode = false, onDelete, scale = 1 }) {
    const AVATAR_SIZE = 125; // Standardized size for ALL avatars

    const posInitial = initialPosition?.avatarOffset || { x: 0, y: 0 };
    const [pos, setPos] = useState(posInitial);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
        // SCALE FIX: Convert screen pixels to design pixels
        const mouseX = e.clientX / scale;
        const mouseY = e.clientY / scale;
        setDragStart({ x: mouseX - pos.x, y: mouseY - pos.y });
    };

    const handleMouseMove = (e) => {
        if (!dragging) return;
        // SCALE FIX: Convert screen pixels to design pixels
        const mouseX = e.clientX / scale;
        const mouseY = e.clientY / scale;
        setPos({ x: mouseX - dragStart.x, y: mouseY - dragStart.y });
    };

    const handleMouseUp = () => {
        if (dragging) {
            console.log(`🎯 ${seatId} POSITION (design px):`, pos);
            if (onPositionChange) {
                onPositionChange(`${seatId}-avatar`, pos);
            }
        }
        setDragging(false);
    };

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [dragging, dragStart, scale]);

    return (
        <div
            className="player-seat-unified"
            onMouseDown={handleMouseDown}
            style={{
                position: 'absolute',
                zIndex: dragging ? 99999 : (100 + seatIndex),
                cursor: dragging ? 'grabbing' : 'grab',
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                ...initialPosition
            }}
        >
            {/* Avatar Image - z-index 1 (behind badge) */}
            <img
                src={`https://smarter.poker/_next/image?url=${encodeURIComponent(avatar)}&w=256&q=90`}
                alt={name}
                draggable={false}
                style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    objectFit: 'cover',
                    borderRadius: '50%',
                    filter: 'drop-shadow(2px 3px 6px rgba(0,0,0,0.9))',
                    pointerEvents: 'none',
                    position: 'relative',
                    zIndex: 1,
                }}
            />
            {/* Badge - Overlaps avatar bottom, IN FRONT (z-index 2) */}
            <div className="player-badge" style={{
                marginTop: -25,
                pointerEvents: 'none',
                position: 'relative',
                zIndex: 2,
            }}>
                <span className="player-name">{name}</span>
                <span className="player-stack">{stack} BB</span>
            </div>
            {/* DEV MODE: Delete button */}
            {devMode && onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(seatId); }}
                    style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: '#dc2626',
                        border: '2px solid #fff',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 999999,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                >✕</button>
            )}
        </div>
    );
}

function Card({ rank, suit, isRed, size = 'normal' }) {
    // Hero cards: 50x70 to match reference image
    const width = size === 'hero' ? 50 : 30;
    const height = size === 'hero' ? 70 : 42;
    const fontSize = size === 'hero' ? 28 : 15;
    const suitSize = size === 'hero' ? 20 : 11;
    return (
        <div className="card" style={{
            width,
            height,
            borderRadius: size === 'hero' ? 8 : 5,
            background: 'linear-gradient(180deg, #fff 0%, #f5f5f5 100%)',
            boxShadow: size === 'hero' ? '0 4px 12px rgba(0,0,0,0.5)' : '0 3px 8px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 0',
        }}>
            <span style={{ fontSize, fontWeight: 800, lineHeight: 1, color: isRed ? '#dc2626' : '#1a1d24' }}>{rank}</span>
            <span style={{ fontSize: suitSize, lineHeight: 1, color: isRed ? '#dc2626' : '#1a1d24' }}>{suit}</span>
        </div>
    );
}

// Draggable Hero Cards Component
function DraggableHeroCards({ cards, onPositionChange }) {
    // User's exported hero cards offset
    const [pos, setPos] = useState({ x: 29, y: 117 });
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
        setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    };

    const handleMouseMove = (e) => {
        if (!dragging) return;
        setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => {
        if (dragging) {
            console.log('🎯 HERO CARDS POSITION:', pos);
            if (onPositionChange) {
                onPositionChange('heroCards', pos);
            }
        }
        setDragging(false);
    };

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [dragging, dragStart]);

    return (
        <div
            className="hero-cards"
            onMouseDown={handleMouseDown}
            style={{
                position: 'absolute',
                top: '77%',
                left: '60%',
                display: 'flex',
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                cursor: 'grab',
                userSelect: 'none',
                pointerEvents: 'all',
                zIndex: 10000,
            }}
        >
            {cards.map((card, i) => (
                <div key={i} style={{ transform: i === 0 ? 'rotate(-6deg)' : 'rotate(6deg)', marginLeft: i > 0 ? -10 : 0, zIndex: i + 1 }}>
                    <Card {...card} size="hero" />
                </div>
            ))}
        </div>
    );
}

// ============== MAIN PAGE ==============

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId, level = 1 } = router.query;

    // Scale state
    const [scale, setScale] = useState(1);

    // Game configuration (loaded from API/database)
    const [gameConfig, setGameConfig] = useState({
        playerCount: 9,  // Default to 9-max
        layoutType: '9max',
    });

    // Dynamic layout based on game config
    const currentLayout = useMemo(() => {
        return TABLE_LAYOUTS[gameConfig.layoutType] || LAYOUT_9MAX;
    }, [gameConfig.layoutType]);

    // Dynamic villain avatars based on gameId + level (seeded shuffle)
    const villainAvatars = useMemo(() => {
        if (!gameId) return [];
        const heroAvatar = getHeroAvatar();
        const count = (currentLayout.seats || 9) - 1; // Minus hero
        return getVillainAvatars(gameId, parseInt(level) || 1, count, heroAvatar);
    }, [gameId, level, currentLayout.seats]);

    // Hero avatar (from user profile or selection)
    const heroAvatar = useMemo(() => {
        return getHeroAvatar();
    }, []);

    // Get seat positions from current layout
    const SEAT_POSITIONS = currentLayout.positions;

    // Game state
    const [loading, setLoading] = useState(true);
    const [gameName, setGameName] = useState('Training Game');
    const [handNumber, setHandNumber] = useState(1);
    const [totalHands] = useState(20);
    const [timer, setTimer] = useState(15);
    const [heroCards, setHeroCards] = useState([]);
    const [board, setBoard] = useState([]);
    const [pot, setPot] = useState(0);
    const [heroStack, setHeroStack] = useState(45);
    const [villainStacks] = useState([32, 28, 55, 41, 38, 62, 29, 51]);
    const [question, setQuestion] = useState("You Are On The Button. The Player To Your Right Bets 2.5 BB. What Is Your Best Move?");

    // User stats - fetched from Supabase
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [userXP, setUserXP] = useState(0);
    const [userLevel, setUserLevel] = useState(1);

    // DEV MODE - Export layout functionality
    const [devMode, setDevMode] = useState(false);
    const [exportData, setExportData] = useState('');
    const positionRefs = useState({})[0]; // Store all position updates
    const [hiddenSeats, setHiddenSeats] = useState(new Set()); // Track deleted/hidden seats
    const [selectedLayoutType, setSelectedLayoutType] = useState('9max'); // For export

    // TEMPLATE OVERLAY - For visual alignment
    const [showOverlay, setShowOverlay] = useState(false);
    const [overlayOpacity, setOverlayOpacity] = useState(0.5);
    const [overlayUrl, setOverlayUrl] = useState('/images/training/template-9max.png'); // Default template

    // MILLIONAIRE MODE - Quiz-style game mode
    const [gameMode, setGameMode] = useState('table'); // 'table' | 'millionaire'
    const [engineType, setEngineType] = useState('PIO'); // PIO | CHART | SCENARIO

    // Millionaire game hook
    const millionaireGame = useMillionaireGame(
        gameMode === 'millionaire' ? gameId : null,
        engineType,
        parseInt(level) || 1
    );

    // Load real user data on mount
    useEffect(() => {
        const loadUserStats = async () => {
            const authUser = getAuthUser();
            if (authUser) {
                try {
                    // Fetch profile for XP
                    const profile = await queryProfiles(authUser.id, 'xp_total');
                    // Fetch diamond balance
                    const diamondBalance = await queryDiamondBalance(authUser.id);

                    if (profile) {
                        const xpTotal = profile.xp_total || 0;
                        // Level formula: Level 55 at 700k XP
                        const level = Math.max(1, Math.floor(Math.sqrt(xpTotal / 231)));
                        setUserXP(xpTotal);
                        setUserLevel(level);
                    }
                    setUserDiamonds(diamondBalance);
                } catch (e) {
                    console.error('[TrainingArena] User stats fetch error:', e);
                }
            }
        };
        loadUserStats();
    }, []);

    // Calculate scale on mount and resize
    const calculateScale = useCallback(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scaleX = vw / DESIGN_WIDTH;
        const scaleY = vh / DESIGN_HEIGHT;
        setScale(Math.min(scaleX, scaleY));
    }, []);

    useEffect(() => {
        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, [calculateScale]);

    // Initialize game data
    useEffect(() => {
        const init = async () => {
            try {
                if (gameId) {
                    const { data: game } = await supabase
                        .from('game_registry')
                        .select('title')
                        .eq('slug', gameId)
                        .single();
                    if (game?.title) setGameName(game.title);

                    const { data: hand } = await supabase
                        .from('god_mode_questions')
                        .select('*')
                        .eq('game_slug', gameId)
                        .limit(1)
                        .single();
                    if (hand) {
                        setHeroCards(parseCards(hand.hero_hand || 'AhKh'));
                        setBoard(parseCards(hand.board || ''));
                        setPot(hand.pot_size || 6);
                        setHeroStack(hand.hero_stack || 45);
                        setQuestion(hand.scenario_text || question);
                    } else {
                        setHeroCards(parseCards('AhKh'));
                    }
                }
            } catch (e) {
                console.error(e);
                setHeroCards(parseCards('AhKh'));
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [gameId]);

    // Timer countdown
    useEffect(() => {
        if (loading) return;
        const interval = setInterval(() => setTimer(prev => (prev > 0 ? prev - 1 : 15)), 1000);
        return () => clearInterval(interval);
    }, [loading]);

    // Action handlers
    const handleAction = (action) => {
        console.log('Action:', action);
        setHandNumber(prev => Math.min(prev + 1, totalHands));
        setTimer(15);
        // TODO: Submit answer to backend, calculate XP, load next hand
    };

    const handleBack = () => router.push('/hub/training');
    const handleSettings = () => console.log('Settings clicked');

    // Update position refs when elements are dragged
    const updatePosition = useCallback((id, data) => {
        positionRefs[id] = data;
    }, [positionRefs]);

    // Toggle seat visibility (for DEV MODE delete functionality)
    const toggleSeat = useCallback((seatId) => {
        setHiddenSeats(prev => {
            const next = new Set(prev);
            if (next.has(seatId)) {
                next.delete(seatId);
            } else {
                next.add(seatId);
            }
            return next;
        });
    }, []);

    // Reset all seats to visible
    const resetSeats = useCallback(() => {
        setHiddenSeats(new Set());
    }, []);

    // Export all positions as code (only visible seats)
    const exportLayout = () => {
        const layoutTypeMap = {
            '9max': 'LAYOUT_9MAX',
            '6max': 'LAYOUT_6MAX',
            '4handed': 'LAYOUT_4HANDED',
            '3handed': 'LAYOUT_3HANDED',
            'headsup': 'LAYOUT_HEADSUP'
        };
        const layoutName = layoutTypeMap[selectedLayoutType] || 'LAYOUT_9MAX';

        // Count visible seats
        const allSeats = ['hero', 'seat1', 'seat2', 'seat3', 'seat4', 'seat5', 'seat6', 'seat7', 'seat8'];
        const visibleSeats = allSeats.filter(s => !hiddenSeats.has(s));

        const output = {
            positions: {},
            heroCardsOffset: positionRefs['heroCards'] || { x: 29, y: 117 }
        };

        // Gather seat positions (only visible)
        visibleSeats.forEach(seatKey => {
            const avatarData = positionRefs[`${seatKey}-avatar`];
            const badgeData = positionRefs[`${seatKey}-badge`];
            const basePos = SEAT_POSITIONS[seatKey];

            if (basePos) {
                output.positions[seatKey] = {
                    left: basePos.left,
                    top: basePos.top,
                    avatarOffset: avatarData || basePos.avatarOffset || { x: 0, y: 0 },
                    badgeOffset: badgeData || basePos.badgeOffset || { x: 0, y: 120 }
                };
            }
        });

        const code = `// EXPORTED ${selectedLayoutType.toUpperCase()} LAYOUT - ${new Date().toISOString()}
// Visible seats: ${visibleSeats.length} (${visibleSeats.join(', ')})

export const ${layoutName} = {
    name: '${selectedLayoutType.toUpperCase()}',
    seats: ${visibleSeats.length},
    heroCardsOffset: ${JSON.stringify(output.heroCardsOffset)},
    positions: ${JSON.stringify(output.positions, null, 8).replace(/\n/g, '\n    ')}
};`;

        setExportData(code);
    };

    // Copy to clipboard
    const copyToClipboard = () => {
        navigator.clipboard.writeText(exportData);
        alert('Copied to clipboard!');
    };

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-icon">🎰</div>
                <p>Loading arena...</p>
                <style jsx>{`
                    .loading-screen {
                        position: fixed;
                        inset: 0;
                        background: #070707;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        color: #fff;
                        font-family: 'Inter', sans-serif;
                        gap: 16px;
                    }
                    .loading-icon { font-size: 48px; }
                `}</style>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>{gameName} — Training Arena | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
            </Head>

            {/* Viewport container - centers the scaled canvas */}
            <div className="viewport-container">
                {/* Scaled canvas - this is the 862x1024 design that scales uniformly */}
                <div
                    className="scaled-canvas"
                    style={{ transform: `scale(${scale})` }}
                >
                    {/* Standard Hub Header - DO NOT MODIFY */}
                    <UniversalHeader pageDepth={2} />

                    {/* Game Mode Toggle */}
                    <div className="mode-toggle">
                        <button
                            onClick={() => setGameMode('table')}
                            className={`mode-btn ${gameMode === 'table' ? 'active' : ''}`}
                        >
                            Table View
                        </button>
                        <button
                            onClick={() => setGameMode('millionaire')}
                            className={`mode-btn ${gameMode === 'millionaire' ? 'active' : ''}`}
                        >
                            Quiz Mode
                        </button>
                    </div>

                    {/* MILLIONAIRE MODE - Quiz-style UI */}
                    {gameMode === 'millionaire' && (
                        <div className="millionaire-container">
                            <MillionaireQuestion
                                question={millionaireGame.currentQuestion}
                                level={millionaireGame.level}
                                questionNumber={millionaireGame.questionNumber}
                                totalQuestions={millionaireGame.totalQuestions}
                                onAnswer={millionaireGame.submitAnswer}
                                showFeedback={millionaireGame.showFeedback}
                                feedbackResult={millionaireGame.feedbackResult}
                                explanation={millionaireGame.explanation}
                            />

                            {/* Continue button after feedback */}
                            {millionaireGame.showFeedback && !millionaireGame.gameComplete && (
                                <button
                                    className="continue-btn"
                                    onClick={millionaireGame.nextQuestion}
                                >
                                    Continue →
                                </button>
                            )}

                            {/* Score bar */}
                            <div className="score-bar">
                                <span>Correct: {millionaireGame.correctCount}/{millionaireGame.questionNumber}</span>
                                <span>Streak: {millionaireGame.streak} 🔥</span>
                                <span>Required: {millionaireGame.passThreshold}%</span>
                            </div>

                            {/* Level complete modal */}
                            {millionaireGame.gameComplete && (
                                <LevelCompleteModal
                                    level={millionaireGame.level}
                                    passed={millionaireGame.levelPassed}
                                    correctCount={millionaireGame.correctCount}
                                    totalQuestions={millionaireGame.totalQuestions}
                                    xpEarned={millionaireGame.totalXP}
                                    bestStreak={millionaireGame.bestStreak}
                                    passThreshold={millionaireGame.passThreshold}
                                    onNextLevel={millionaireGame.startNextLevel}
                                    onRetry={millionaireGame.retryLevel}
                                    onExit={handleBack}
                                    isMaxLevel={millionaireGame.level >= TRAINING_CONFIG.totalLevels}
                                />
                            )}
                        </div>
                    )}

                    {/* TABLE MODE - Original poker table view */}
                    {gameMode === 'table' && (
                        <>
                            {/* Question Bar */}
                            <div className="question-bar">
                                <p>{question}</p>
                            </div>

                            {/* Table Area */}
                            <div className="table-area">
                                <div className="table-wrapper">
                                    <img src="/images/training/table-vertical.jpg" alt="Poker Table" className="table-img" />

                                    {/* TEMPLATE OVERLAY - DEV MODE visual alignment tool */}
                                    {devMode && showOverlay && (
                                        <img
                                            src={overlayUrl}
                                            alt="Template Overlay"
                                            className="template-overlay"
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'contain',
                                                opacity: overlayOpacity,
                                                pointerEvents: 'none',
                                                zIndex: 50,
                                            }}
                                        />
                                    )}

                                    {/* Pot Display */}
                                    <div className="pot">
                                        <span className="pot-icon">●</span>
                                        <span className="pot-label">POT</span>
                                        <span className="pot-value">{pot}</span>
                                    </div>

                                    {/* Community Board */}
                                    {board.length > 0 && (
                                        <div className="board">
                                            {board.map((card, i) => <Card key={i} {...card} />)}
                                        </div>
                                    )}

                                    {/* Felt Title */}
                                    <div className="felt-title">
                                        <span className="felt-name">{gameName}</span>
                                        <span className="felt-sub">Smarter.Poker</span>
                                    </div>

                                    {/* Dealer Button */}
                                    <div className="dealer-btn">D</div>



                                    {/* Villain Seats - Dynamic based on layout, respects hiddenSeats */}
                                    {villainAvatars[0] && SEAT_POSITIONS.seat1 && !hiddenSeats.has('seat1') && (
                                        <DraggablePlayerSeat seatIndex={1} seatId="seat1" avatar={villainAvatars[0]} name="Villain 1" stack={villainStacks[0]} initialPosition={SEAT_POSITIONS.seat1} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}
                                    {villainAvatars[1] && SEAT_POSITIONS.seat2 && !hiddenSeats.has('seat2') && (
                                        <DraggablePlayerSeat seatIndex={2} seatId="seat2" avatar={villainAvatars[1]} name="Villain 2" stack={villainStacks[1]} initialPosition={SEAT_POSITIONS.seat2} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}
                                    {villainAvatars[2] && SEAT_POSITIONS.seat3 && !hiddenSeats.has('seat3') && (
                                        <DraggablePlayerSeat seatIndex={3} seatId="seat3" avatar={villainAvatars[2]} name="Villain 3" stack={villainStacks[2]} initialPosition={SEAT_POSITIONS.seat3} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}
                                    {villainAvatars[3] && SEAT_POSITIONS.seat4 && !hiddenSeats.has('seat4') && (
                                        <DraggablePlayerSeat seatIndex={4} seatId="seat4" avatar={villainAvatars[3]} name="Villain 4" stack={villainStacks[3]} initialPosition={SEAT_POSITIONS.seat4} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}
                                    {villainAvatars[4] && SEAT_POSITIONS.seat5 && !hiddenSeats.has('seat5') && (
                                        <DraggablePlayerSeat seatIndex={5} seatId="seat5" avatar={villainAvatars[4]} name="Villain 5" stack={villainStacks[4]} initialPosition={SEAT_POSITIONS.seat5} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}
                                    {villainAvatars[5] && SEAT_POSITIONS.seat6 && !hiddenSeats.has('seat6') && (
                                        <DraggablePlayerSeat seatIndex={6} seatId="seat6" avatar={villainAvatars[5]} name="Villain 6" stack={villainStacks[5]} initialPosition={SEAT_POSITIONS.seat6} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}
                                    {villainAvatars[6] && SEAT_POSITIONS.seat7 && !hiddenSeats.has('seat7') && (
                                        <DraggablePlayerSeat seatIndex={7} seatId="seat7" avatar={villainAvatars[6]} name="Villain 7" stack={villainStacks[6]} initialPosition={SEAT_POSITIONS.seat7} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}
                                    {villainAvatars[7] && SEAT_POSITIONS.seat8 && !hiddenSeats.has('seat8') && (
                                        <DraggablePlayerSeat seatIndex={8} seatId="seat8" avatar={villainAvatars[7]} name="Villain 8" stack={villainStacks[7]} initialPosition={SEAT_POSITIONS.seat8} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}

                                    {/* Hero Seat - DRAGGABLE - highest seatIndex */}
                                    {!hiddenSeats.has('hero') && (
                                        <DraggablePlayerSeat seatIndex={9} seatId="hero" avatar={heroAvatar} name="Hero" stack={heroStack} initialPosition={SEAT_POSITIONS.hero} isHero={true} onPositionChange={updatePosition} devMode={devMode} onDelete={toggleSeat} scale={scale} />
                                    )}


                                    {/* Hero Cards - DRAGGABLE */}
                                    <DraggableHeroCards cards={heroCards} onPositionChange={updatePosition} />
                                </div>

                                {/* Timer - positioned outside table-wrapper, at bottom of table-area */}
                                <div className="timer">
                                    <span>{timer}</span>
                                </div>

                                {/* Question Counter - positioned outside table-wrapper, at bottom of table-area */}
                                <div className="q-counter">
                                    <span>Question {handNumber} of {totalHands}</span>
                                </div>
                            </div>

                            {/* Action Bar */}
                            <div className="action-bar">
                                <button className="action-btn fold" onClick={() => handleAction('FOLD')}>Fold</button>
                                <button className="action-btn call" onClick={() => handleAction('CALL')}>Call</button>
                                <button className="action-btn raise" onClick={() => handleAction('RAISE')}>Raise to 8bb</button>
                                <button className="action-btn allin" onClick={() => handleAction('ALLIN')}>All-In</button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style jsx global>{`
                * { box-sizing: border-box; margin: 0; padding: 0; }
                html, body { 
                    height: 100%; 
                    overflow: hidden; 
                    font-family: 'Inter', sans-serif; 
                    background: #070707; 
                }
            `}</style>

            <style jsx>{`
                /* Viewport container - fills screen, centers content */
                .viewport-container {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #070707;
                    overflow: visible;
                }
                
                /* Scaled canvas - the locked 862x1024 design */
                .scaled-canvas {
                    width: ${DESIGN_WIDTH}px;
                    height: ${DESIGN_HEIGHT}px;
                    transform-origin: center center;
                    display: flex;
                    flex-direction: column;
                    background: #070707;
                    color: #fff;
                    overflow: visible;
                }
                
                /* ========== MODE TOGGLE ========== */
                .mode-toggle {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: rgba(10, 14, 23, 0.8);
                }
                .mode-btn {
                    padding: 8px 20px;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 20px;
                    color: #94a3b8;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .mode-btn:hover {
                    background: rgba(255,255,255,0.15);
                }
                .mode-btn.active {
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    border-color: #3b82f6;
                    color: #fff;
                }
                
                /* ========== MILLIONAIRE MODE ========== */
                .millionaire-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 16px;
                    overflow: hidden;
                }
                .continue-btn {
                    display: block;
                    width: 100%;
                    max-width: 300px;
                    margin: 16px auto;
                    padding: 14px 32px;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    border: none;
                    border-radius: 10px;
                    color: #fff;
                    font-size: 16px;
                    font-weight: 700;
                    cursor: pointer;
                    font-family: inherit;
                    transition: transform 0.2s ease;
                }
                .continue-btn:hover {
                    transform: scale(1.02);
                }
                .score-bar {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    padding: 12px;
                    background: rgba(0,0,0,0.5);
                    border-radius: 12px;
                    margin-top: auto;
                }
                .score-bar span {
                    font-size: 14px;
                    font-weight: 600;
                    color: #94a3b8;
                }
                
                /* ========== HEADER ========== */
                .arena-header {
                    flex-shrink: 0;
                    height: 56px;
                    display: flex;
                    align-items: center;
                    padding: 0 16px;
                    gap: 12px;
                    background: rgba(10, 14, 23, 0.98);
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .back-btn {
                    padding: 8px 14px;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: inherit;
                }
                .back-btn:hover { background: rgba(255,255,255,0.15); }
                .brand {
                    font-size: 16px;
                    font-weight: 700;
                    color: #fff;
                }
                .header-stats {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-left: auto;
                }
                .stat {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: rgba(0,150,200,0.2);
                    border: 1px solid rgba(0,200,255,0.3);
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 600;
                }
                .stat .icon { font-size: 14px; }
                .stat .sep { opacity: 0.5; }
                .plus-btn {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #22c55e;
                    border: none;
                    color: #fff;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .header-icons {
                    display: flex;
                    gap: 8px;
                    margin-left: 12px;
                }
                .icon-circle {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    cursor: pointer;
                    border: none;
                    font-family: inherit;
                }
                .icon-circle.blue {
                    background: linear-gradient(135deg, #2d7ad4 0%, #1e5fa8 100%);
                }
                .icon-circle.settings {
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                }
                
                /* ========== QUESTION BAR ========== */
                .question-bar {
                    flex-shrink: 0;
                    padding: 12px 20px;
                    background: rgba(0,80,160,0.25);
                    border-bottom: 1px solid rgba(0,150,255,0.3);
                }
                .question-bar p {
                    font-size: 15px;
                    font-weight: 500;
                    color: #00d4ff;
                    text-align: center;
                    line-height: 1.4;
                }
                
                /* ========== TABLE AREA ========== */
                .table-area {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 12px;
                    min-height: 0;
                    position: relative;
                    overflow: visible;
                }
                .table-wrapper {
                    position: relative;
                    width: 100%;
                    max-width: 500px;
                    aspect-ratio: 3 / 4;
                    overflow: visible;
                }
                :global(.player-seat) {
                    z-index: 10000;
                    pointer-events: all !important;
                }
                .table-img {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    border-radius: 16px;
                }
                
                /* Pot */
                .pot {
                    position: absolute;
                    top: 18%;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 4px 12px;
                    background: rgba(0,0,0,0.9);
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.25);
                    z-index: 20;
                }
                .pot-icon { color: #d4a020; font-size: 10px; }
                .pot-label { font-size: 9px; color: rgba(255,255,255,0.7); font-weight: 600; }
                .pot-value { font-size: 13px; font-weight: 700; }
                
                /* Board */
                .board {
                    position: absolute;
                    top: 40%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    gap: 4px;
                    z-index: 20;
                }
                
                /* Felt Title */
                .felt-title {
                    position: absolute;
                    top: 52%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 10;
                }
                .felt-name { font-size: 14px; font-weight: 700; opacity: 0.9; }
                .felt-sub { font-size: 10px; color: rgba(255,255,255,0.6); }
                
                /* Dealer Button */
                .dealer-btn {
                    position: absolute;
                    bottom: 24%;
                    left: 44%;
                    width: 22px;
                    height: 22px;
                    background: linear-gradient(135deg, #fff 0%, #e0e0e0 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: 800;
                    color: #1a1d24;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.6);
                    z-index: 20;
                }
                
                /* Hero Cards */
                .hero-cards {
                    position: absolute;
                    bottom: 10%;
                    right: 26%;
                    display: flex;
                    z-index: 25;
                }
                
                /* Timer - now relative to table-area */
                .timer {
                    position: absolute;
                    bottom: 16px;
                    left: 20px;
                    width: 52px;
                    height: 52px;
                    background: rgba(0,0,0,0.95);
                    border: 3px solid #dc2626;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 30;
                }
                .timer span { font-size: 24px; font-weight: 800; color: #dc2626; }
                
                /* Question Counter - now relative to table-area */
                .q-counter {
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    padding: 10px 16px;
                    background: rgba(0,0,0,0.8);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 8px;
                    z-index: 30;
                }
                .q-counter span { font-size: 13px; color: #fff; font-weight: 600; }
                
                /* ========== PLAYER SEATS ========== */
                :global(.player-seat) {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 15;
                }
                :global(.player-badge) {
                    /* Gold border, black background badge */
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 12px;
                    background: #0a0a0a;
                    border: 2px solid #d4a020;
                    border-radius: 6px;
                    min-width: 85px;
                    z-index: 200;
                }
                :global(.player-name) { 
                    font-size: 14px; 
                    font-weight: 700; 
                    color: #d4a020; 
                    line-height: 1.3;
                    white-space: nowrap;
                }
                :global(.player-stack) { 
                    font-size: 13px; 
                    font-weight: 600; 
                    color: #d4a020; 
                    line-height: 1.3;
                    white-space: nowrap;
                }
                
                /* ========== CARDS ========== */
                :global(.card) {
                    border-radius: 5px;
                    background: linear-gradient(180deg, #fff 0%, #f0f0f0 100%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 3px 8px rgba(0,0,0,0.5);
                }
                :global(.card-rank) { font-size: 15px; font-weight: 800; line-height: 1; }
                :global(.card-suit) { font-size: 11px; line-height: 1; }
                
                /* ========== ACTION BAR ========== */
                .action-bar {
                    flex-shrink: 0;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    padding: 12px 20px 20px;
                    background: rgba(10,14,23,0.98);
                    border-top: 1px solid rgba(255,255,255,0.1);
                }
                .action-btn {
                    padding: 14px 20px;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 700;
                    cursor: pointer;
                    font-family: inherit;
                    transition: transform 0.1s, opacity 0.1s;
                }
                .action-btn:hover { opacity: 0.9; }
                .action-btn:active { transform: scale(0.97); }
                .fold, .call, .raise, .allin {
                    background: linear-gradient(180deg, #2d7ad4 0%, #1e5fa8 100%);
                    color: #fff;
                    box-shadow: 0 4px 12px rgba(30,95,168,0.5);
                }
                
                /* DEV MODE Export Panel */
                .dev-toggle {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 999999;
                    padding: 8px 16px;
                    background: ${devMode ? '#22c55e' : '#3b82f6'};
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 12px;
                }
                .export-panel {
                    position: fixed;
                    top: 50px;
                    right: 10px;
                    z-index: 999999;
                    width: 400px;
                    max-height: 80vh;
                    background: rgba(0,0,0,0.95);
                    border: 2px solid #22c55e;
                    border-radius: 12px;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .export-panel h3 {
                    margin: 0;
                    color: #22c55e;
                    font-size: 16px;
                }
                .export-panel p {
                    margin: 0;
                    color: #888;
                    font-size: 12px;
                }
                .export-panel textarea {
                    width: 100%;
                    height: 300px;
                    background: #111;
                    border: 1px solid #333;
                    border-radius: 8px;
                    color: #0f0;
                    font-family: monospace;
                    font-size: 11px;
                    padding: 8px;
                    resize: vertical;
                }
                .export-panel button {
                    padding: 10px 20px;
                    background: #22c55e;
                    color: black;
                    font-weight: bold;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                }
                .export-panel button:hover {
                    background: #16a34a;
                }
            `}</style>

            {/* DEV MODE Toggle Button */}
            <button className="dev-toggle" onClick={() => setDevMode(!devMode)}>
                {devMode ? '✓ DEV MODE ON' : '🔧 DEV MODE'}
            </button>

            {/* Export Panel - only visible in dev mode */}
            {devMode && (
                <div className="export-panel">
                    <h3>📐 Layout Export Tool</h3>
                    <p>Drag elements. Click ✕ on avatars to remove seats. Export when ready.</p>

                    {/* TEMPLATE OVERLAY CONTROLS */}
                    <div style={{
                        padding: 12,
                        background: '#1a1a2a',
                        border: '1px solid #4444aa',
                        borderRadius: 8,
                        marginBottom: 8
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <strong style={{ color: '#8888ff', fontSize: 13 }}>🖼️ Template Overlay</strong>
                            <button
                                onClick={() => setShowOverlay(!showOverlay)}
                                style={{
                                    padding: '4px 12px',
                                    background: showOverlay ? '#22c55e' : '#444',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: 'bold'
                                }}
                            >
                                {showOverlay ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        {showOverlay && (
                            <>
                                <div style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>Opacity: {Math.round(overlayOpacity * 100)}%</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={overlayOpacity * 100}
                                        onChange={(e) => setOverlayOpacity(e.target.value / 100)}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>Template URL:</label>
                                    <input
                                        type="text"
                                        value={overlayUrl}
                                        onChange={(e) => setOverlayUrl(e.target.value)}
                                        placeholder="/images/training/template.png"
                                        style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            background: '#222',
                                            border: '1px solid #444',
                                            borderRadius: 4,
                                            color: '#fff',
                                            fontSize: 11
                                        }}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Layout Type Selector */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontSize: 12, color: '#aaa' }}>Export as:</label>
                        <select
                            value={selectedLayoutType}
                            onChange={(e) => setSelectedLayoutType(e.target.value)}
                            style={{
                                padding: '6px 10px',
                                background: '#222',
                                border: '1px solid #444',
                                borderRadius: 6,
                                color: '#fff',
                                fontSize: 13,
                                flex: 1
                            }}
                        >
                            <option value="9max">9-Max (Full Ring)</option>
                            <option value="6max">6-Max</option>
                            <option value="4handed">4-Handed</option>
                            <option value="3handed">3-Handed</option>
                            <option value="headsup">Heads-Up</option>
                        </select>
                    </div>

                    {/* Seat Status */}
                    <div style={{
                        padding: 8,
                        background: '#1a1a1a',
                        borderRadius: 6,
                        fontSize: 11,
                        color: '#888',
                        marginBottom: 8
                    }}>
                        <strong style={{ color: '#22c55e' }}>Visible Seats: {9 - hiddenSeats.size}</strong>
                        {hiddenSeats.size > 0 && (
                            <span style={{ marginLeft: 8, color: '#dc2626' }}>
                                Hidden: {[...hiddenSeats].join(', ')}
                            </span>
                        )}
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={exportLayout} style={{ flex: 1 }}>📋 EXPORT LAYOUT</button>
                        {hiddenSeats.size > 0 && (
                            <button
                                onClick={resetSeats}
                                style={{
                                    background: '#3b82f6',
                                    flex: 0
                                }}
                            >↻ RESET</button>
                        )}
                    </div>

                    {exportData && (
                        <>
                            <textarea value={exportData} readOnly />
                            <button onClick={copyToClipboard}>📋 COPY TO CLIPBOARD</button>
                        </>
                    )}
                </div>
            )}
        </>
    );
}
