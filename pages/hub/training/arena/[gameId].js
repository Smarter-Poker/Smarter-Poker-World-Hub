/**
 * Training Arena Page — Golden Template (Full Screen)
 * ====================================================
 * Pixel-perfect clone with:
 * - Social-media style header (Hub button, logo, diamond/XP)
 * - Full viewport height
 * - Avatars positioned exactly like reference on table rail
 *
 * Route: /hub/training/arena/[gameId]?level=X&session=Y
 */

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../../../../src/lib/supabase';

// Villain avatars in seat order (1-8)
const VILLAIN_AVATARS = [
    '/avatars/free/lion.png',      // V1 - Bottom Left
    '/avatars/vip/rock_legend.png', // V2 - Left Middle
    '/avatars/free/shark.png',     // V3 - Left Upper
    '/avatars/vip/wolf.png',       // V4 - Top Left
    '/avatars/vip/spartan.png',    // V5 - Top Right
    '/avatars/vip/monarch.png',    // V6 - Right Upper
    '/avatars/vip/tech_mogul.png', // V7 - Right Middle
    '/avatars/free/owl.png',       // V8 - Bottom Right
];

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

export default function TrainingArenaPage() {
    const router = useRouter();
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
    const [question, setQuestion] = useState("You Are On The Button (Last To Act). The Player To Your Right Bets 2.5 Big Blinds. What Is Your Best Move?");

    const [xp] = useState(1250);
    const [diamonds] = useState(500);

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
            } catch (error) {
                console.error('Failed to initialize:', error);
                setHeroCards(parseCards('AhKh'));
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [gameId]);

    useEffect(() => {
        if (loading) return;
        const interval = setInterval(() => {
            setTimer(prev => (prev > 0 ? prev - 1 : 15));
        }, 1000);
        return () => clearInterval(interval);
    }, [loading]);

    const handleAction = async (action) => {
        setHandNumber(prev => Math.min(prev + 1, totalHands));
        setTimer(15);
    };

    const handleBack = () => {
        router.push('/hub/training');
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
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
            </Head>

            <div className="arena-root">
                {/* HEADER - Social Media Style */}
                <header className="header">
                    <div className="header-left">
                        <button className="hub-btn" onClick={handleBack}>← Back to Training</button>
                    </div>
                    <h1 className="title">{gameName.toUpperCase()}</h1>
                    <div className="header-right">
                        <span className="xp-pill">⚡ {xp.toLocaleString()} XP</span>
                        <span className="diamond-pill">💎 {diamonds}</span>
                    </div>
                </header>

                {/* QUESTION PROMPT */}
                <div className="question-bar">
                    <p>{question}</p>
                </div>

                {/* TABLE AREA */}
                <div className="table-area">
                    <div className="table-container">
                        <img src="/images/training/table-vertical.jpg" alt="Table" className="table-img" />

                        {/* POT */}
                        <div className="pot">
                            <span className="pot-icon">●</span>
                            <span className="pot-label">POT</span>
                            <span className="pot-value">{pot}</span>
                        </div>

                        {/* Board Cards */}
                        {board.length > 0 && (
                            <div className="board">
                                {board.map((card, i) => (
                                    <div key={i} className="board-card">
                                        <span className={`card-rank ${card.isRed ? 'red' : ''}`}>{card.rank}</span>
                                        <span className={`card-suit ${card.isRed ? 'red' : ''}`}>{card.suit}</span>
                                    </div>
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

                        {/* VILLAINS 1-8 positioned exactly like reference */}
                        {/* V4 - Top Left */}
                        <div className="seat seat-4">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[3])}&w=128&q=75`} alt="V4" />
                            <div className="badge"><span className="name">Villain 4</span><span className="stack">{villainStacks[3]} BB</span></div>
                        </div>
                        {/* V5 - Top Right */}
                        <div className="seat seat-5">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[4])}&w=128&q=75`} alt="V5" />
                            <div className="badge"><span className="name">Villain 5</span><span className="stack">{villainStacks[4]} BB</span></div>
                        </div>
                        {/* V3 - Left Upper */}
                        <div className="seat seat-3">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[2])}&w=128&q=75`} alt="V3" />
                            <div className="badge"><span className="name">Villain 3</span><span className="stack">{villainStacks[2]} BB</span></div>
                        </div>
                        {/* V6 - Right Upper */}
                        <div className="seat seat-6">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[5])}&w=128&q=75`} alt="V6" />
                            <div className="badge"><span className="name">Villain 6</span><span className="stack">{villainStacks[5]} BB</span></div>
                        </div>
                        {/* V2 - Left Middle */}
                        <div className="seat seat-2">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[1])}&w=128&q=75`} alt="V2" />
                            <div className="badge"><span className="name">Villain 2</span><span className="stack">{villainStacks[1]} BB</span></div>
                        </div>
                        {/* V7 - Right Middle */}
                        <div className="seat seat-7">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[6])}&w=128&q=75`} alt="V7" />
                            <div className="badge"><span className="name">Villain 7</span><span className="stack">{villainStacks[6]} BB</span></div>
                        </div>
                        {/* V1 - Bottom Left */}
                        <div className="seat seat-1">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[0])}&w=128&q=75`} alt="V1" />
                            <div className="badge"><span className="name">Villain 1</span><span className="stack">{villainStacks[0]} BB</span></div>
                        </div>
                        {/* V8 - Bottom Right */}
                        <div className="seat seat-8">
                            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(VILLAIN_AVATARS[7])}&w=128&q=75`} alt="V8" />
                            <div className="badge"><span className="name">Villain 8</span><span className="stack">{villainStacks[7]} BB</span></div>
                        </div>

                        {/* HERO */}
                        <div className="hero-seat">
                            <img src="https://smarter.poker/_next/image?url=%2Favatars%2Fvip%2Fdragon.png&w=128&q=75" alt="Hero" />
                            <div className="badge"><span className="name">Hero</span><span className="stack">{heroStack} BB</span></div>
                        </div>

                        {/* Hero Cards */}
                        <div className="hero-cards">
                            {heroCards.map((card, i) => (
                                <div key={i} className={`hcard hcard-${i}`}>
                                    <span className={`card-rank ${card.isRed ? 'red' : ''}`}>{card.rank}</span>
                                    <span className={`card-suit ${card.isRed ? 'red' : ''}`}>{card.suit}</span>
                                </div>
                            ))}
                        </div>

                        {/* Timer */}
                        <div className="timer"><span>{timer}</span></div>

                        {/* Question Counter */}
                        <div className="q-counter"><span>Question {handNumber} of {totalHands}</span></div>
                    </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="action-bar">
                    <button className="action-btn fold" onClick={() => handleAction('FOLD')}>Fold</button>
                    <button className="action-btn call" onClick={() => handleAction('CALL')}>Call</button>
                    <button className="action-btn raise" onClick={() => handleAction('RAISE')}>Raise to 8bb</button>
                    <button className="action-btn allin" onClick={() => handleAction('ALLIN')}>All-In</button>
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

                /* HEADER - Social Media Style */
                .header {
                    flex-shrink: 0;
                    height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 12px;
                    background: rgba(0,0,0,0.7);
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .header-left, .header-right { display: flex; align-items: center; gap: 8px; }
                .hub-btn {
                    background: rgba(0,200,150,0.15);
                    border: 1px solid rgba(0,200,150,0.3);
                    color: #00d4aa;
                    padding: 5px 10px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .title { font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
                .xp-pill, .diamond-pill {
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 10px;
                    font-weight: 600;
                }
                .xp-pill { background: rgba(0,212,255,0.15); color: #00d4ff; }
                .diamond-pill { background: rgba(232,121,249,0.15); color: #e879f9; }

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
                    padding: 0;
                    overflow: hidden;
                    position: relative;
                }

                .table-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                }

                .table-img {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                }

                /* POT */
                .pot {
                    position: absolute;
                    top: 18%;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 3px 10px;
                    background: rgba(0,0,0,0.85);
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.2);
                    z-index: 10;
                }
                .pot-icon { color: #d4a020; font-size: 8px; }
                .pot-label { font-size: 9px; color: rgba(255,255,255,0.7); font-weight: 600; }
                .pot-value { font-size: 11px; font-weight: 700; }

                /* Board */
                .board {
                    position: absolute;
                    top: 42%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    gap: 3px;
                    z-index: 10;
                }
                .board-card {
                    width: 26px;
                    height: 38px;
                    border-radius: 3px;
                    background: linear-gradient(180deg, #fff 0%, #f0f0f0 100%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.4);
                }
                .board-card .card-rank { font-size: 12px; font-weight: 800; color: #1a1d24; }
                .board-card .card-suit { font-size: 8px; color: #1a1d24; }
                .card-rank.red, .card-suit.red { color: #dc2626; }

                /* Felt Title */
                .felt-title {
                    position: absolute;
                    top: 54%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 5;
                }
                .felt-name { font-size: 11px; font-weight: 700; }
                .felt-sub { font-size: 8px; color: rgba(255,255,255,0.6); }

                /* Dealer */
                .dealer-btn {
                    position: absolute;
                    bottom: 24%;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 18px;
                    height: 18px;
                    background: linear-gradient(135deg, #fff 0%, #e0e0e0 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 8px;
                    font-weight: 800;
                    color: #1a1d24;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                    z-index: 10;
                }

                /* SEATS - 90px avatars positioned exactly like reference */
                .seat {
                    position: absolute;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 15;
                }
                .seat img {
                    width: 70px;
                    height: 70px;
                    object-fit: contain;
                    filter: drop-shadow(2px 3px 4px rgba(0,0,0,0.7));
                }
                .badge {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 2px 6px;
                    background: linear-gradient(180deg, #d4a020 0%, #8b6914 100%);
                    border-radius: 4px;
                    margin-top: -6px;
                }
                .name { font-size: 7px; font-weight: 600; color: #1a1d24; }
                .stack { font-size: 10px; font-weight: 700; color: #1a1d24; }

                /* EXACT positions matching reference image */
                /* V4 - Top Left of table */
                .seat-4 { left: 22%; top: 8%; }
                /* V5 - Top Right of table */
                .seat-5 { right: 22%; top: 8%; }
                /* V3 - Left side, upper */
                .seat-3 { left: 5%; top: 22%; }
                /* V6 - Right side, upper */
                .seat-6 { right: 5%; top: 22%; }
                /* V2 - Left side, middle */
                .seat-2 { left: 3%; top: 42%; }
                /* V7 - Right side, middle */
                .seat-7 { right: 3%; top: 42%; }
                /* V1 - Bottom left, above hero */
                .seat-1 { left: 12%; bottom: 18%; }
                /* V8 - Bottom right, above hero */
                .seat-8 { right: 12%; bottom: 18%; }

                /* HERO - Centered at bottom */
                .hero-seat {
                    position: absolute;
                    bottom: 5%;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 20;
                }
                .hero-seat img {
                    width: 80px;
                    height: 80px;
                    object-fit: contain;
                    filter: drop-shadow(2px 3px 5px rgba(0,0,0,0.8));
                }

                /* Hero Cards - Right of hero */
                .hero-cards {
                    position: absolute;
                    bottom: 8%;
                    right: 28%;
                    display: flex;
                    z-index: 20;
                }
                .hcard {
                    width: 30px;
                    height: 44px;
                    border-radius: 3px;
                    background: linear-gradient(180deg, #fff 0%, #f0f0f0 100%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.4);
                }
                .hcard-0 { transform: rotate(-5deg); z-index: 1; }
                .hcard-1 { transform: rotate(8deg); margin-left: -5px; z-index: 2; }
                .hcard .card-rank { font-size: 14px; font-weight: 800; }
                .hcard .card-suit { font-size: 10px; }

                /* Timer - Bottom left */
                .timer {
                    position: absolute;
                    bottom: 8%;
                    left: 8%;
                    width: 40px;
                    height: 40px;
                    background: rgba(0,0,0,0.9);
                    border: 2px solid #dc2626;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 20;
                }
                .timer span { font-size: 18px; font-weight: 800; color: #dc2626; }

                /* Question Counter - Bottom right */
                .q-counter {
                    position: absolute;
                    bottom: 9%;
                    right: 8%;
                    padding: 5px 8px;
                    background: rgba(37,99,235,0.2);
                    border: 1px solid #3b82f6;
                    border-radius: 5px;
                    z-index: 20;
                }
                .q-counter span { font-size: 9px; color: #60a5fa; }

                /* ACTION BUTTONS */
                .action-bar {
                    flex-shrink: 0;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                    padding: 10px 12px 16px;
                    background: rgba(10,14,23,0.98);
                }
                .action-btn {
                    padding: 12px;
                    border: none;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    font-family: inherit;
                }
                .fold {
                    background: linear-gradient(180deg, #374151 0%, #1f2937 100%);
                    color: #fff;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .call, .raise, .allin {
                    background: linear-gradient(180deg, #2d7ad4 0%, #1e5fa8 100%);
                    color: #fff;
                    box-shadow: 0 3px 6px rgba(30,95,168,0.4);
                }
            `}</style>
        </>
    );
}
