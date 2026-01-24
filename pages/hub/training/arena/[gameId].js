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
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '../../../../src/lib/supabase';
import { getAuthUser, queryProfiles, queryDiamondBalance } from '../../../../src/lib/authUtils';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';

// Design canvas dimensions (locked)
const DESIGN_WIDTH = 862;
const DESIGN_HEIGHT = 1024;

// Villain avatars in seat order (1-8)
const VILLAIN_AVATARS = [
    '/avatars/free/lion.png',
    '/avatars/vip/rock_legend.png',
    '/avatars/free/shark.png',
    '/avatars/vip/wolf.png',
    '/avatars/vip/spartan.png',
    '/avatars/vip/monarch.png',
    '/avatars/vip/tech_mogul.png',
    '/avatars/free/owl.png',
];

// Seat positions - EXACT from user's reference screenshot (2026-01-23)
const SEAT_POSITIONS = {
    // Hero - bottom center
    hero: {
        left: '50%', top: '76%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 1 - bottom left
    seat1: {
        left: '18%', top: '58%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 2 - middle left
    seat2: {
        left: '12%', top: '40%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 3 - upper left
    seat3: {
        left: '14%', top: '20%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 4 - top left
    seat4: {
        left: '33%', top: '10%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 5 - top right (moved left from 67% to 62%)
    seat5: {
        left: '62%', top: '10%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 6 - upper right (moved left from 86% to 80%)
    seat6: {
        left: '80%', top: '20%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 7 - middle right (moved left from 88% to 82%)
    seat7: {
        left: '82%', top: '40%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
    // Villain 8 - bottom right (moved left from 82% to 78%)
    seat8: {
        left: '78%', top: '58%',
        avatarOffset: { x: 0, y: 0 },
        badgeOffset: { x: 0, y: 120 }
    },
};

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

// Draggable Player Seat Component - Avatar and Badge can be dragged independently
// seatIndex is used to set unique z-index: lower seats rendered first, badges always on top
function DraggablePlayerSeat({ avatar, name, stack, seatId, seatIndex = 0, initialPosition, isHero = false, onPositionChange }) {
    const size = 109; // 20% smaller than original 136px - same size for Hero and Villains
    // Use hardcoded offsets from SEAT_POSITIONS if available
    const avatarInitial = initialPosition?.avatarOffset || { x: 0, y: 0 };
    const badgeInitial = initialPosition?.badgeOffset || { x: 0, y: 100 };
    const [avatarPos, setAvatarPos] = useState(avatarInitial);
    const [badgePos, setBadgePos] = useState(badgeInitial);
    const [dragging, setDragging] = useState(null); // 'avatar' | 'badge' | null
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e, type) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(type);
        const pos = type === 'avatar' ? avatarPos : badgePos;
        setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    };

    const handleMouseMove = (e) => {
        if (!dragging) return;
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        if (dragging === 'avatar') {
            setAvatarPos({ x: newX, y: newY });
        } else {
            setBadgePos({ x: newX, y: newY });
        }
    };

    const handleMouseUp = () => {
        if (dragging) {
            // Log final positions to console for locking later
            console.log(`🎯 ${seatId} POSITIONS:`, {
                avatar: avatarPos,
                badge: badgePos
            });
        }
        setDragging(null);
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
        <div className="player-seat" style={{ position: 'absolute', zIndex: 100 + seatIndex, pointerEvents: 'all', overflow: 'visible', minWidth: '100px', ...initialPosition }}>
            {/* Avatar - Draggable via transform */}
            <img
                src={`https://smarter.poker/_next/image?url=${encodeURIComponent(avatar)}&w=256&q=90`}
                alt={name}
                onMouseDown={(e) => handleMouseDown(e, 'avatar')}
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    minWidth: `${size}px`,
                    minHeight: `${size}px`,
                    maxWidth: `${size}px`,
                    maxHeight: `${size}px`,
                    objectFit: 'contain',
                    filter: 'drop-shadow(2px 3px 6px rgba(0,0,0,0.9))',
                    cursor: dragging === 'avatar' ? 'grabbing' : 'grab',
                    transform: `translate(${avatarPos.x}px, ${avatarPos.y}px)`,
                    zIndex: 100,
                    userSelect: 'none',
                    pointerEvents: 'all',
                    flexShrink: 0,
                }}
            />
            {/* Gold Badge - Draggable via transform - HIGHEST z-index to always be on top */}
            <div
                className="player-badge"
                onMouseDown={(e) => handleMouseDown(e, 'badge')}
                style={{
                    position: 'absolute',
                    transform: `translate(${badgePos.x}px, ${badgePos.y}px)`,
                    zIndex: 50000,
                    cursor: dragging === 'badge' ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    pointerEvents: 'all',
                    width: '95px',
                    minWidth: '95px',
                    whiteSpace: 'nowrap',
                }}
            >
                <span className="player-name" style={{ pointerEvents: 'none' }}>{name}</span>
                <span className="player-stack" style={{ pointerEvents: 'none' }}>{stack} BB</span>
            </div>
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
function DraggableHeroCards({ cards }) {
    // Exact offset from user's layout (extracted 2026-01-23)
    const [pos, setPos] = useState({ x: 20, y: 0 });
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
    const { gameId } = router.query;

    // Scale state
    const [scale, setScale] = useState(1);

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

                    {/* Question Bar */}
                    <div className="question-bar">
                        <p>{question}</p>
                    </div>

                    {/* Table Area */}
                    <div className="table-area">
                        <div className="table-wrapper">
                            <img src="/images/training/table-vertical.jpg" alt="Poker Table" className="table-img" />

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


                            {/* Villain Seats - DRAGGABLE with unique seatIndex for z-index layering */}
                            <DraggablePlayerSeat seatIndex={1} seatId="seat1" avatar={VILLAIN_AVATARS[0]} name="Villain 1" stack={villainStacks[0]} initialPosition={SEAT_POSITIONS.seat1} />
                            <DraggablePlayerSeat seatIndex={2} seatId="seat2" avatar={VILLAIN_AVATARS[1]} name="Villain 2" stack={villainStacks[1]} initialPosition={SEAT_POSITIONS.seat2} />
                            <DraggablePlayerSeat seatIndex={3} seatId="seat3" avatar={VILLAIN_AVATARS[2]} name="Villain 3" stack={villainStacks[2]} initialPosition={SEAT_POSITIONS.seat3} />
                            <DraggablePlayerSeat seatIndex={4} seatId="seat4" avatar={VILLAIN_AVATARS[3]} name="Villain 4" stack={villainStacks[3]} initialPosition={SEAT_POSITIONS.seat4} />
                            <DraggablePlayerSeat seatIndex={5} seatId="seat5" avatar={VILLAIN_AVATARS[4]} name="Villain 5" stack={villainStacks[4]} initialPosition={SEAT_POSITIONS.seat5} />
                            <DraggablePlayerSeat seatIndex={6} seatId="seat6" avatar={VILLAIN_AVATARS[5]} name="Villain 6" stack={villainStacks[5]} initialPosition={SEAT_POSITIONS.seat6} />
                            <DraggablePlayerSeat seatIndex={7} seatId="seat7" avatar={VILLAIN_AVATARS[6]} name="Villain 7" stack={villainStacks[6]} initialPosition={SEAT_POSITIONS.seat7} />
                            <DraggablePlayerSeat seatIndex={8} seatId="seat8" avatar={VILLAIN_AVATARS[7]} name="Villain 8" stack={villainStacks[7]} initialPosition={SEAT_POSITIONS.seat8} />

                            {/* Hero Seat - DRAGGABLE - highest seatIndex */}
                            <DraggablePlayerSeat seatIndex={9} seatId="hero" avatar="/avatars/vip/dragon.png" name="Hero" stack={heroStack} initialPosition={SEAT_POSITIONS.hero} isHero={true} />


                            {/* Hero Cards - DRAGGABLE */}
                            <DraggableHeroCards cards={heroCards} />
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
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 4px 15px;
                    background: #0a0a0a;
                    border: 2px solid #d4a020;
                    border-radius: 5px;
                    margin-top: -10px;
                    min-width: 82px;
                    z-index: 200;
                }
                :global(.player-name) { font-size: 18px; font-weight: 600; color: #d4a020; }
                :global(.player-stack) { font-size: 14px; font-weight: 700; color: #d4a020; }
                
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
            `}</style>
        </>
    );
}
