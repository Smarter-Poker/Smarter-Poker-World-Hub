/**
 * Training Arena Page — Golden Template (Full Screen)
 * ====================================================
 * Fixed avatar positioning using Aspect Ratio Container strategy.
 * All avatars positioned relative to a 3:4 aspect wrapper that
 * exactly matches the table image bounds.
 *
 * Route: /hub/training/arena/[gameId]?level=X&session=Y
 */

import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import { supabase } from '../../../../src/lib/supabase';
import { busEmit } from '../../../../src/engine/EventBus';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';

// Villain avatars in seat order (1-8)
const VILLAIN_AVATARS = [
    '/avatars/free/lion.png',      // V1 - Bottom Right
    '/avatars/vip/rock_legend.png', // V2 - Right Middle
    '/avatars/free/shark.png',     // V3 - Top Right
    '/avatars/vip/wolf.png',       // V4 - Top Right-Center
    '/avatars/vip/spartan.png',    // V5 - Top Left-Center
    '/avatars/vip/monarch.png',    // V6 - Top Left
    '/avatars/vip/tech_mogul.png', // V7 - Left Middle
    '/avatars/free/owl.png',       // V8 - Bottom Left
];

// Seat positions relative to the 3:4 aspect container (percentages)
// These coordinates position avatars ON the gold table rail
// Adjusted: side seats moved inward to stay inside table bounds
const SEAT_POSITIONS = {
    hero: { left: '50%', bottom: '2%', transform: 'translateX(-50%)' },
    seat1: { left: '78%', bottom: '20%', transform: 'translateX(-50%)' },    // V1 - Bottom Right
    seat2: { left: '85%', top: '48%', transform: 'translate(-50%, -50%)' },  // V2 - Right Middle (moved in)
    seat3: { left: '78%', top: '20%', transform: 'translateX(-50%)' },       // V3 - Top Right (moved in)
    seat4: { left: '62%', top: '6%', transform: 'translateX(-50%)' },        // V4 - Top Right-Center
    seat5: { left: '38%', top: '6%', transform: 'translateX(-50%)' },        // V5 - Top Left-Center
    seat6: { left: '22%', top: '20%', transform: 'translateX(-50%)' },       // V6 - Top Left (moved in)
    seat7: { left: '15%', top: '48%', transform: 'translate(-50%, -50%)' },  // V7 - Left Middle (moved in)
    seat8: { left: '22%', bottom: '20%', transform: 'translateX(-50%)' },    // V8 - Bottom Left
};

// Suit symbols
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
        cards.push({
            rank,
            suit: SUITS[suit]?.symbol || suit,
            isRed: suit === 'h' || suit === 'd',
        });
    }
    return cards;
}

// Avatar component with gold badge
function PlayerSeat({ avatar, name, stack, position, isHero = false }) {
    const size = isHero ? 75 : 60;

    return (
        <div style={{
            position: 'absolute',
            ...position,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 15,
        }}>
            <img
                src={`https://smarter.poker/_next/image?url=${encodeURIComponent(avatar)}&w=128&q=75`}
                alt={name}
                style={{
                    width: size,
                    height: size,
                    objectFit: 'contain',
                    filter: 'drop-shadow(2px 3px 5px rgba(0,0,0,0.8))',
                }}
                loading="lazy" />
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '2px 8px',
                background: 'linear-gradient(180deg, #d4a020 0%, #8b6914 100%)',
                borderRadius: 4,
                marginTop: -8,
                minWidth: 50,
            }}>
                <span style={{ fontSize: 8, fontWeight: 600, color: '#1a1d24' }}>{name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1d24' }}>{stack} BB</span>
            </div>
        </div>
    );
}

// Card component
function Card({ rank, suit, isRed, size = 'normal' }) {
    const width = size === 'hero' ? 32 : 28;
    const height = size === 'hero' ? 46 : 40;

    return (
        <div style={{
            width,
            height,
            borderRadius: 4,
            background: 'linear-gradient(180deg, #fff 0%, #f0f0f0 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}>
            <span style={{
                fontSize: size === 'hero' ? 16 : 13,
                fontWeight: 800,
                color: isRed ? '#dc2626' : '#1a1d24',
                lineHeight: 1,
            }}>{rank}</span>
            <span style={{
                fontSize: size === 'hero' ? 12 : 9,
                color: isRed ? '#dc2626' : '#1a1d24',
                lineHeight: 1,
            }}>{suit}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SVG CIRCULAR TIMER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SVGCircularTimer({ timeLeft, totalTime = 15, size = 50 }) {
    const strokeWidth = Math.max(3, size * 0.08);
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (timeLeft / totalTime) * circumference;
    const isWarning = timeLeft <= 5;
    const color = isWarning ? '#ef4444' : '#00d4ff';

    return (
        <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="transparent"
                    stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                />
            </svg>
            <div style={{
                fontSize: size * 0.35, fontWeight: 800, color, fontFamily: "'Orbitron', monospace",
                animation: isWarning ? 'pulse 1s infinite' : 'none',
                zIndex: 1
            }}>
                {timeLeft}
            </div>
            <style jsx>{`
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
            `}</style>
        </div>
    );
}

export default function TrainingArenaPage() {
    const router = useRouter();
    useTrainingBus('training-arena');
    if (!router.isReady) return null;
    const { gameId, level = 1 } = router.query;

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
    const [question, setQuestion] = useState("You Are On The Button (Last To Act). The Player To Your Right Bets 2.5BB. What Is Your Best Move?");

    useEffect(() => {
        const init = async () => {
            try {
                if (gameId) {
                    const { data: game } = await supabase
                        .from('game_registry')
                        .select('title')
                        .eq('slug', gameId)
                        .maybeSingle();

                    if (game?.title) setGameName(game.title);

                    const { data: hand } = await supabase
                        .from('god_mode_questions')
                        .select('*')
                        .eq('game_slug', gameId)
                        .limit(1)
                        .maybeSingle();

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
            } catch (error) {
                console.error('Failed to initialize:', error);
                setHeroCards(parseCards('AhKh'));
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [gameId]);

    const heartbeatIntervalRef = useRef(null);
    const settings = { haptics: true, audio: true, screenShake: true, intensity: 'high' };

    useEffect(() => {
        if (loading) return;

        const intensityMultiplier = 1.0;

        const interval = setInterval(() => {
            setTimer(prev => {
                const newTime = prev - 1;

                if (settings.haptics && 'vibrate' in navigator) {
                    const baseVibration = newTime <= 3 ? 100 : newTime <= 8 ? 50 : 20;
                    navigator.vibrate(Math.round(baseVibration * intensityMultiplier));
                }

                if (newTime === 5) busEmit.timerWarning();
                if (newTime === 3) busEmit.screenShake('light');
                if (newTime <= 0) {
                    busEmit.timerExpired();
                    busEmit.screenShake('heavy');
                    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
                    return 15;
                }
                return newTime;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [loading]);

    useEffect(() => {
        if (loading) return;

        if (settings.audio && timer <= 8 && timer > 0) {
            const playHeartbeat = () => {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = 80;
                    osc.type = 'sine';
                    const volume = 0.3;
                    gain.gain.setValueAtTime(volume, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.15);
                } catch (e) { }
            };
            const speed = Math.max(200, 600 - ((8 - timer) * 50));
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = setInterval(playHeartbeat, speed);
            playHeartbeat();
        } else {
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        }

        return () => {
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        };
    }, [timer, loading]);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!gameId) return;
        const _ch = supabase
            .channel(`train-arena:${gameId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_registry', filter: `id=eq.${gameId}` }, () => {
                console.warn('[TrainingArena] Received real-time update for game_registry');
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [gameId]);

    const handleAction = async (action) => {
        // Emit decision events based on action
        if (action === 'FOLD') {
            busEmit.decisionIncorrect(false);
            busEmit.screenFlash('#EF4444', 200);
        } else {
            busEmit.decisionCorrect(handNumber);
            busEmit.screenFlash('#22C55E', 200);
        }
        setHandNumber(prev => Math.min(prev + 1, totalHands));
        setTimer(15);
    };

    if (loading) {
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: 'linear-gradient(180deg, #0a0e17 0%, #050810 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontFamily: 'Inter, sans-serif',
                gap: 16,
            }}>
                <div style={{ fontSize: 48, animation: 'spin 1s linear infinite' }}>🎰</div>
                <p>Loading arena...</p>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>{gameName} — Training Arena | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />

            </Head>

            <div className="arena-root">
                {/* HEADER - Universal Header matching Social Hub style */}
                <UniversalHeader pageDepth={2} />

                {/* QUESTION PROMPT */}
                <div className="question-bar">
                    <p>{question}</p>
                </div>

                {/* TABLE AREA - Centered with aspect ratio lock */}
                <div className="table-area">
                    {/* ASPECT RATIO CONTAINER - This is the key fix!
                        The wrapper has aspect-ratio: 3/4 and explicit bounds.
                        All children position relative to this container. */}
                    <div className="table-wrapper">
                        {/* Table Image - fills the wrapper exactly */}
                        <img
                            src="/images/training/table-vertical.jpg"
                            alt="Poker Table"
                            className="table-img"
                            loading="lazy" />

                        {/* POT Display */}
                        <div className="pot">
                            <span className="pot-icon">●</span>
                            <span className="pot-label">POT</span>
                            <span className="pot-value">{pot}</span>
                        </div>

                        {/* Board Cards (community cards) */}
                        {board.length > 0 && (
                            <div className="board">
                                {board.map((card, i) => (
                                    <Card key={i} {...card} />
                                ))}
                            </div>
                        )}

                        {/* Game Title on Felt */}
                        <div className="felt-title">
                            <span className="felt-name">{gameName}</span>
                            <span className="felt-sub">Smarter.Poker</span>
                        </div>

                        {/* Dealer Button */}
                        <div className="dealer-btn">D</div>

                        {/* VILLAIN SEATS (1-8) */}
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[0]}
                            name="Villain 1"
                            stack={villainStacks[0]}
                            position={SEAT_POSITIONS.seat1}
                        />
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[1]}
                            name="Villain 2"
                            stack={villainStacks[1]}
                            position={SEAT_POSITIONS.seat2}
                        />
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[2]}
                            name="Villain 3"
                            stack={villainStacks[2]}
                            position={SEAT_POSITIONS.seat3}
                        />
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[3]}
                            name="Villain 4"
                            stack={villainStacks[3]}
                            position={SEAT_POSITIONS.seat4}
                        />
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[4]}
                            name="Villain 5"
                            stack={villainStacks[4]}
                            position={SEAT_POSITIONS.seat5}
                        />
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[5]}
                            name="Villain 6"
                            stack={villainStacks[5]}
                            position={SEAT_POSITIONS.seat6}
                        />
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[6]}
                            name="Villain 7"
                            stack={villainStacks[6]}
                            position={SEAT_POSITIONS.seat7}
                        />
                        <PlayerSeat
                            avatar={VILLAIN_AVATARS[7]}
                            name="Villain 8"
                            stack={villainStacks[7]}
                            position={SEAT_POSITIONS.seat8}
                        />

                        {/* HERO SEAT */}
                        <PlayerSeat
                            avatar="/avatars/vip/dragon.png"
                            name="Hero"
                            stack={heroStack}
                            position={SEAT_POSITIONS.hero}
                            isHero={true}
                        />

                        {/* Hero Cards - Right of hero avatar */}
                        <div className="hero-cards">
                            {heroCards.map((card, i) => (
                                <div key={i} style={{
                                    transform: i === 0 ? 'rotate(-6deg)' : 'rotate(6deg)',
                                    marginLeft: i > 0 ? -8 : 0,
                                    zIndex: i + 1,
                                }}>
                                    <Card {...card} size="hero" />
                                </div>
                            ))}
                        </div>

                        {/* Timer - Bottom left of table */}
                        <div style={{ position: 'absolute', bottom: '6%', left: '8%', zIndex: 25 }}>
                            <SVGCircularTimer timeLeft={timer} totalTime={15} size={50} />
                        </div>

                        {/* Question Counter - Bottom right of table */}
                        <div className="q-counter">
                            <span>Question {handNumber} of {totalHands}</span>
                        </div>
                    </div>
                </div>

                {/* ACTION BUTTONS - Polished Grid */}
                <div className="action-bar">
                    <button className="action-btn fold" onClick={() => handleAction('FOLD')}>FOLD</button>
                    <button className="action-btn call" onClick={() => handleAction('CALL')}>CALL</button>
                    <button className="action-btn raise" onClick={() => handleAction('RAISE')}>RAISE to 8BB</button>
                    <button className="action-btn allin" onClick={() => handleAction('ALLIN')}>ALL-IN</button>
                </div>
            </div>

            <style jsx>{`
                :global(*) { box-sizing: border-box; margin: 0; padding: 0; }
                :global(html, body) { height: 100%; overflow: hidden; font-family: 'Inter', sans-serif; background: #050810; }

                .arena-root {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(180deg, #0a0e17 0%, #050810 100%);
                    color: #fff;
                }

                /* QUESTION */
                .question-bar {
                    flex-shrink: 0;
                    padding: 10px 16px;
                    background: rgba(0,80,160,0.2);
                    border-bottom: 1px solid rgba(0,150,255,0.25);
                }
                .question-bar p {
                    font-size: 12px;
                    font-weight: 500;
                    color: #00d4ff;
                    text-align: center;
                    line-height: 1.4;
                }

                /* TABLE AREA */
                .table-area {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 25px 8px;
                    overflow: hidden;
                    background: transparent;
                }

                /* ASPECT RATIO CONTAINER - THE KEY FIX!
                   This wrapper maintains 3:4 aspect ratio and provides
                   the positioning context for all avatars */
                .table-wrapper {
                    position: relative;
                    aspect-ratio: 3 / 4;
                    max-height: 70vh;
                    max-width: calc(70vh * 0.75); /* 3:4 ratio based on height */
                    width: 100%;
                    margin: 0 auto;
                    background: transparent;
                    border-radius: 30px;
                    overflow: visible;
                }
                
                /* Vignette overlay to mask black corners of table image */
                .table-wrapper::before {
                    content: '';
                    position: absolute;
                    inset: -10px;
                    background: radial-gradient(ellipse 85% 90% at center, transparent 50%, #0a0e17 80%, #050810 100%);
                    pointer-events: none;
                    z-index: 15;
                }

                .table-img {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: fill; /* Fill the aspect container exactly */
                    border-radius: 20px;
                }

                /* POT */
                .pot {
                    position: absolute;
                    top: 16%;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 4px 12px;
                    background: rgba(0,0,0,0.85);
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.2);
                    z-index: 20;
                }
                .pot-icon { color: #d4a020; font-size: 10px; }
                .pot-label { font-size: 10px; color: rgba(255,255,255,0.7); font-weight: 600; }
                .pot-value { font-size: 13px; font-weight: 700; }

                /* Board */
                .board {
                    position: absolute;
                    top: 42%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    gap: 4px;
                    z-index: 20;
                }

                /* Felt Title */
                .felt-title {
                    position: absolute;
                    top: 54%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 10;
                }
                .felt-name { font-size: 12px; font-weight: 700; opacity: 0.9; }
                .felt-sub { font-size: 9px; color: rgba(255,255,255,0.6); }

                /* Dealer Button */
                .dealer-btn {
                    position: absolute;
                    bottom: 22%;
                    left: 43%;
                    width: 20px;
                    height: 20px;
                    background: linear-gradient(135deg, #fff 0%, #e0e0e0 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 9px;
                    font-weight: 800;
                    color: #1a1d24;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                    z-index: 20;
                }

                /* Hero Cards - Positioned right of hero */
                .hero-cards {
                    position: absolute;
                    bottom: 4%;
                    right: 28%;
                    display: flex;
                    z-index: 25;
                }

                /* Removed old timer class as we use SVGCircULAR timer now inline */

                /* Question Counter - Bottom right */
                .q-counter {
                    position: absolute;
                    bottom: 6%;
                    right: 5%;
                    padding: 6px 10px;
                    background: rgba(37,99,235,0.2);
                    border: 1px solid #3b82f6;
                    border-radius: 6px;
                    z-index: 25;
                }
                .q-counter span { font-size: 10px; color: #60a5fa; font-weight: 500; }

                /* ACTION BUTTONS - 2x2 Grid */
                .action-bar {
                    flex-shrink: 0;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    padding: 12px 16px 20px;
                    background: rgba(10,14,23,0.98);
                    border-top: 1px solid rgba(255,255,255,0.1);
                }
                .action-btn {
                    padding: 14px;
                    border: none;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 800;
                    cursor: pointer;
                    font-family: 'Orbitron', monospace;
                    transition: transform 0.1s, box-shadow 0.1s, filter 0.2s;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                }
                .action-btn:active {
                    transform: scale(0.95);
                    filter: brightness(1.2);
                }
                .fold {
                    background: linear-gradient(180deg, #475569 0%, #334155 100%);
                    color: #e2e8f0;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 6px rgba(0,0,0,0.4);
                }
                .call {
                    background: linear-gradient(180deg, #22c55e 0%, #166534 100%);
                    color: #fff;
                    border: 1px solid rgba(34,197,94,0.4);
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.2), 0 4px 10px rgba(22,101,52,0.5);
                }
                .raise {
                    background: linear-gradient(180deg, #ef4444 0%, #991b1b 100%);
                    color: #fff;
                    border: 1px solid rgba(239,68,68,0.4);
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.2), 0 4px 10px rgba(153,27,27,0.5);
                }
                .allin {
                    background: linear-gradient(180deg, #f59e0b 0%, #b45309 100%);
                    color: #fff;
                    border: 1px solid rgba(245,158,11,0.4);
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.2), 0 4px 10px rgba(180,83,9,0.5);
                }
            `}</style>
        </>
    );
}
