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
import { useState, useEffect } from 'react';
import Head from 'next/head';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import { supabase } from '../../../../src/lib/supabase';

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

// Seat positions - FIXED to stay on table rail
const SEAT_POSITIONS = {
    hero: { left: '50%', bottom: '2%', transform: 'translateX(-50%)' },
    seat1: { left: '78%', bottom: '20%', transform: 'translateX(-50%)' },
    seat2: { left: '85%', top: '48%', transform: 'translate(-50%, -50%)' },
    seat3: { left: '78%', top: '20%', transform: 'translateX(-50%)' },
    seat4: { left: '62%', top: '6%', transform: 'translateX(-50%)' },
    seat5: { left: '38%', top: '6%', transform: 'translateX(-50%)' },
    seat6: { left: '22%', top: '20%', transform: 'translateX(-50%)' },
    seat7: { left: '15%', top: '48%', transform: 'translate(-50%, -50%)' },
    seat8: { left: '22%', bottom: '20%', transform: 'translateX(-50%)' },
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

function PlayerSeat({ avatar, name, stack, position, isHero = false }) {
    const size = isHero ? 75 : 60;
    return (
        <div style={{ position: 'absolute', ...position, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 15 }}>
            <img src={`https://smarter.poker/_next/image?url=${encodeURIComponent(avatar)}&w=128&q=75`} alt={name}
                style={{ width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(2px 3px 5px rgba(0,0,0,0.8))' }} />
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 8px',
                background: 'linear-gradient(180deg, #d4a020 0%, #8b6914 100%)', borderRadius: 4, marginTop: -8, minWidth: 50
            }}>
                <span style={{ fontSize: 8, fontWeight: 600, color: '#1a1d24' }}>{name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1d24' }}>{stack} BB</span>
            </div>
        </div>
    );
}

function Card({ rank, suit, isRed, size = 'normal' }) {
    const width = size === 'hero' ? 32 : 28;
    const height = size === 'hero' ? 46 : 40;
    return (
        <div style={{
            width, height, borderRadius: 4, background: 'linear-gradient(180deg, #fff 0%, #f0f0f0 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
        }}>
            <span style={{ fontSize: size === 'hero' ? 16 : 13, fontWeight: 800, color: isRed ? '#dc2626' : '#1a1d24', lineHeight: 1 }}>{rank}</span>
            <span style={{ fontSize: size === 'hero' ? 12 : 9, color: isRed ? '#dc2626' : '#1a1d24', lineHeight: 1 }}>{suit}</span>
        </div>
    );
}

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId } = router.query;
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
    const [pageScale, setPageScale] = useState(1);

    // Calculate scale for entire page - everything scales together
    useEffect(() => {
        const calculateScale = () => {
            // Design canvas: 390x844 (mobile portrait)
            const designWidth = 390;
            const designHeight = 844;
            const scaleX = window.innerWidth / designWidth;
            const scaleY = window.innerHeight / designHeight;
            setPageScale(Math.min(scaleX, scaleY));
        };
        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                if (gameId) {
                    const { data: game } = await supabase.from('game_registry').select('title').eq('slug', gameId).single();
                    if (game?.title) setGameName(game.title);
                    const { data: hand } = await supabase.from('god_mode_questions').select('*').eq('game_slug', gameId).limit(1).single();
                    if (hand) {
                        setHeroCards(parseCards(hand.hero_hand || 'AhKh'));
                        setBoard(parseCards(hand.board || ''));
                        setPot(hand.pot_size || 6);
                        setHeroStack(hand.hero_stack || 45);
                        setQuestion(hand.scenario_text || question);
                    } else { setHeroCards(parseCards('AhKh')); }
                }
            } catch (e) { console.error(e); setHeroCards(parseCards('AhKh')); }
            finally { setLoading(false); }
        };
        init();
    }, [gameId]);

    useEffect(() => {
        if (loading) return;
        const interval = setInterval(() => setTimer(prev => (prev > 0 ? prev - 1 : 15)), 1000);
        return () => clearInterval(interval);
    }, [loading]);

    const handleAction = (action) => { setHandNumber(prev => Math.min(prev + 1, totalHands)); setTimer(15); };

    if (loading) return (
        <div style={{
            position: 'fixed', inset: 0, background: 'linear-gradient(180deg, #0a0e17 0%, #050810 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Inter, sans-serif', gap: 16
        }}>
            <div style={{ fontSize: 48 }}>🎰</div><p>Loading arena...</p>
        </div>
    );

    return (
        <>
            <Head>
                <title>{gameName} — Training Arena | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
            </Head>
            <div className="arena-viewport">
                <div className="arena-root" style={{ transform: `scale(${pageScale})` }}>
                    <UniversalHeader pageDepth={2} />
                    <div className="question-bar"><p>{question}</p></div>
                    <div className="table-area">
                        <div className="table-wrapper">
                            <img src="/images/training/table-vertical.jpg" alt="Poker Table" className="table-img" />
                            <div className="pot"><span className="pot-icon">●</span><span className="pot-label">POT</span><span className="pot-value">{pot}</span></div>
                            {board.length > 0 && <div className="board">{board.map((card, i) => <Card key={i} {...card} />)}</div>}
                            <div className="felt-title"><span className="felt-name">{gameName}</span><span className="felt-sub">Smarter.Poker</span></div>
                            <div className="dealer-btn">D</div>
                            <PlayerSeat avatar={VILLAIN_AVATARS[0]} name="Villain 1" stack={villainStacks[0]} position={SEAT_POSITIONS.seat1} />
                            <PlayerSeat avatar={VILLAIN_AVATARS[1]} name="Villain 2" stack={villainStacks[1]} position={SEAT_POSITIONS.seat2} />
                            <PlayerSeat avatar={VILLAIN_AVATARS[2]} name="Villain 3" stack={villainStacks[2]} position={SEAT_POSITIONS.seat3} />
                            <PlayerSeat avatar={VILLAIN_AVATARS[3]} name="Villain 4" stack={villainStacks[3]} position={SEAT_POSITIONS.seat4} />
                            <PlayerSeat avatar={VILLAIN_AVATARS[4]} name="Villain 5" stack={villainStacks[4]} position={SEAT_POSITIONS.seat5} />
                            <PlayerSeat avatar={VILLAIN_AVATARS[5]} name="Villain 6" stack={villainStacks[5]} position={SEAT_POSITIONS.seat6} />
                            <PlayerSeat avatar={VILLAIN_AVATARS[6]} name="Villain 7" stack={villainStacks[6]} position={SEAT_POSITIONS.seat7} />
                            <PlayerSeat avatar={VILLAIN_AVATARS[7]} name="Villain 8" stack={villainStacks[7]} position={SEAT_POSITIONS.seat8} />
                            <PlayerSeat avatar="/avatars/vip/dragon.png" name="Hero" stack={heroStack} position={SEAT_POSITIONS.hero} isHero={true} />
                            <div className="hero-cards">{heroCards.map((card, i) => (
                                <div key={i} style={{ transform: i === 0 ? 'rotate(-6deg)' : 'rotate(6deg)', marginLeft: i > 0 ? -8 : 0, zIndex: i + 1 }}>
                                    <Card {...card} size="hero" />
                                </div>
                            ))}</div>
                            <div className="timer"><span>{timer}</span></div>
                            <div className="q-counter"><span>Question {handNumber} of {totalHands}</span></div>
                        </div>
                    </div>
                    <div className="action-bar">
                        <button className="action-btn fold" onClick={() => handleAction('FOLD')}>Fold</button>
                        <button className="action-btn call" onClick={() => handleAction('CALL')}>Call</button>
                        <button className="action-btn raise" onClick={() => handleAction('RAISE')}>Raise to 8bb</button>
                        <button className="action-btn allin" onClick={() => handleAction('ALLIN')}>All-In</button>
                    </div>
                </div>
            </div>
            <style jsx>{`
                :global(*) { box-sizing: border-box; margin: 0; padding: 0; }
                :global(html, body) { height: 100%; overflow: hidden; font-family: 'Inter', sans-serif; background: #050810; }
                .arena-viewport { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #050810; overflow: hidden; }
                .arena-root { width: 390px; height: 844px; display: flex; flex-direction: column; background: linear-gradient(180deg, #0a0e17 0%, #050810 100%); color: #fff; transform-origin: center center; overflow: hidden; }
                .question-bar { flex-shrink: 0; padding: 12px 16px; background: rgba(0,80,160,0.2); border-bottom: 1px solid rgba(0,150,255,0.25); }
                .question-bar p { font-size: 13px; font-weight: 500; color: #00d4ff; text-align: center; line-height: 1.4; }
                .table-area { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                .table-wrapper { position: relative; width: 374px; height: 500px; }
                .table-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; border-radius: 16px; mix-blend-mode: normal !important; z-index: 1; }
                .pot { position: absolute; top: 16%; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 5px; padding: 4px 12px; background: rgba(0,0,0,0.85); border-radius: 14px; border: 1px solid rgba(255,255,255,0.2); z-index: 20; }
                .pot-icon { color: #d4a020; font-size: 10px; }
                .pot-label { font-size: 10px; color: rgba(255,255,255,0.7); font-weight: 600; }
                .pot-value { font-size: 13px; font-weight: 700; }
                .board { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%); display: flex; gap: 4px; z-index: 20; }
                .felt-title { position: absolute; top: 54%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; z-index: 10; }
                .felt-name { font-size: 14px; font-weight: 700; opacity: 0.9; }
                .felt-sub { font-size: 10px; color: rgba(255,255,255,0.6); }
                .dealer-btn { position: absolute; bottom: 22%; left: 43%; width: 24px; height: 24px; background: linear-gradient(135deg, #fff 0%, #e0e0e0 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #1a1d24; box-shadow: 0 2px 4px rgba(0,0,0,0.5); z-index: 20; }
                .hero-cards { position: absolute; bottom: 4%; right: 28%; display: flex; z-index: 25; }
                .timer { position: absolute; bottom: 5%; left: 5%; width: 50px; height: 50px; background: rgba(0,0,0,0.9); border: 2px solid #dc2626; border-radius: 8px; display: flex; align-items: center; justify-content: center; z-index: 25; }
                .timer span { font-size: 22px; font-weight: 800; color: #dc2626; }
                .q-counter { position: absolute; bottom: 6%; right: 5%; padding: 8px 12px; background: rgba(37,99,235,0.2); border: 1px solid #3b82f6; border-radius: 6px; z-index: 25; }
                .q-counter span { font-size: 11px; color: #60a5fa; font-weight: 500; }
                .action-bar { flex-shrink: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 16px 20px; background: rgba(10,14,23,0.98); border-top: 1px solid rgba(255,255,255,0.1); }
                .action-btn { padding: 16px; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: inherit; transition: transform 0.1s; }
                .action-btn:active { transform: scale(0.97); }
                .fold { background: linear-gradient(180deg, #2d7ad4 0%, #1e5fa8 100%); color: #fff; box-shadow: 0 3px 8px rgba(30,95,168,0.4); }
                .call, .raise, .allin { background: linear-gradient(180deg, #2d7ad4 0%, #1e5fa8 100%); color: #fff; box-shadow: 0 3px 8px rgba(30,95,168,0.4); }
            `}</style>
        </>
    );
}
