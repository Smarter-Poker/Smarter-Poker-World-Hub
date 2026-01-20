import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAINING GAME - GOLDEN TEMPLATE EXACT MATCH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Matches /templates/training_game_template.html exactly
 * Player positions and card positions from the Golden Template
 */
export default function TrainingGame() {
    const router = useRouter();
    const [selectedAction, setSelectedAction] = useState(null);

    // Player seat positions from Golden Template
    const SEAT_POSITIONS = {
        'hero': { left: '50%', top: '75%' },
        'v1': { left: '18%', top: '65%' },
        'v2': { left: '15%', top: '45%' },
        'v3': { left: '15%', top: '26%' },
        'v4': { left: '32%', top: '5%' },
        'v5': { left: '68%', top: '5%' },
        'v6': { left: '85%', top: '26%' },
        'v7': { left: '85%', top: '45%' },
        'v8': { left: '82%', top: '65%' }
    };

    // Avatar URLs from Golden Template
    const AVATARS = [
        "https://smarter.poker/_next/image?url=%2Favatars%2Fvip%2Fviking_warrior.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Ffree%2Fwizard.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Ffree%2Fninja.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Fvip%2Fwolf.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Fvip%2Fspartan.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Fvip%2Fpharaoh.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Ffree%2Fpirate.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Ffree%2Fcowboy.png&w=640&q=75",
        "https://smarter.poker/_next/image?url=%2Favatars%2Ffree%2Ffox.png&w=640&q=75"
    ];

    // Villain data
    const villains = [
        { id: 'v1', name: 'Villain 1', stack: '32 BB', avatar: AVATARS[0] },
        { id: 'v2', name: 'Villain 2', stack: '28 BB', avatar: AVATARS[1] },
        { id: 'v3', name: 'Villain 3', stack: '55 BB', avatar: AVATARS[2] },
        { id: 'v4', name: 'Villain 4', stack: '41 BB', avatar: AVATARS[3] },
        { id: 'v5', name: 'Villain 5', stack: '38 BB', avatar: AVATARS[4] },
        { id: 'v6', name: 'Villain 6', stack: '62 BB', avatar: AVATARS[5] },
        { id: 'v7', name: 'Villain 7', stack: '29 BB', avatar: AVATARS[6] },
        { id: 'v8', name: 'Villain 8', stack: '51 BB', avatar: AVATARS[7] }
    ];

    // Locked card positions from VILLAIN_CARD_POSITION_LAW
    const LOCKED_CARD_POSITIONS = {
        'v1': { left: 760, top: 926 },
        'v2': { left: 779, top: 694 },
        'v3': { left: 778, top: 478 },
        'v4': { left: 663, top: 282 },
        'v5': { left: 289, top: 281 },
        'v6': { left: 170, top: 474 },
        'v7': { left: 172, top: 696 },
        'v8': { left: 193, top: 922 }
    };

    return (
        <>
            <style jsx global>{`
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body, html {
                    height: 100%;
                    width: 100%;
                    background: #000;
                    color: #fff;
                    font-family: 'Inter', -apple-system, sans-serif;
                    overflow: hidden;
                }

                .game-container {
                    height: 100vh;
                    width: 100vw;
                    display: flex;
                    flex-direction: column;
                    background: #000;
                    position: relative;
                }

                /* HEADER */
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: rgba(0, 0, 0, 0.8);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    flex-shrink: 0;
                }

                .back-button {
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 8px;
                    color: #00d4ff;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .back-button:hover {
                    background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
                    border-color: #00d4ff;
                    box-shadow: 0 0 15px rgba(0, 212, 255, 0.3);
                }

                .game-title {
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: #00d4ff;
                    text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
                }

                .header-right {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .wallet-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 10px;
                    background: rgba(0, 0, 0, 0.5);
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 700;
                }

                .xp-wallet {
                    color: #FFD700;
                    border: 1px solid rgba(255, 215, 0, 0.3);
                }

                .diamond-wallet {
                    color: #00d4ff;
                    border: 1px solid rgba(0, 212, 255, 0.3);
                }

                .profile-pic {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 2px solid #00d4ff;
                    overflow: hidden;
                }

                /* QUESTION SECTION */
                .question-section {
                    padding: 8px 18px;
                    margin: 5px 15px;
                    text-align: center;
                    background: rgba(0, 0, 0, 0.75);
                    border: 3px solid rgba(0, 212, 255, 0.6);
                    border-radius: 25px;
                    box-shadow: 0 0 25px rgba(0, 212, 255, 0.3), inset 0 0 20px rgba(0, 0, 0, 0.4);
                    flex-shrink: 0;
                }

                .question-text {
                    font-size: 22px;
                    font-weight: 600;
                    color: #fff;
                    line-height: 1.6;
                    text-transform: capitalize;
                }

                /* MAIN STAGE */
                .stage {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    min-height: 0;
                    padding: 60px 10px 20px 10px;
                    overflow: visible;
                }

                .table-area {
                    position: relative;
                    width: 100%;
                    max-width: 680px;
                    aspect-ratio: 1 / 1.35;
                    margin: 0 auto;
                    overflow: visible;
                }

                .table-container {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 100%;
                    height: 100%;
                    border-radius: 45%;
                    overflow: visible;
                }

                .table-image {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: fill;
                    border-radius: 45%;
                    background: linear-gradient(135deg, #1e3a1e, #0f2a0f);
                    border: 8px solid #fbbf24;
                    box-shadow: inset 0 0 60px rgba(0,0,0,0.5), 0 0 40px rgba(251, 191, 36, 0.3);
                }

                /* POT */
                .pot-display {
                    position: absolute;
                    top: 32%;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: rgba(0, 0, 0, 0.7);
                    border-radius: 20px;
                    border: 1px solid rgba(255, 215, 0, 0.3);
                    z-index: 15;
                }

                .pot-amount {
                    font-size: 16px;
                    font-weight: 800;
                    color: #FFD700;
                }

                /* GAME INFO */
                .game-info {
                    position: absolute;
                    top: 55%;
                    left: 50%;
                    transform: translateX(-50%);
                    text-align: center;
                    z-index: 15;
                }

                .game-type {
                    font-size: 18px;
                    font-weight: 800;
                    color: #fff;
                    letter-spacing: 2px;
                }

                .branding {
                    font-size: 14px;
                    font-weight: 700;
                    color: #FFD700;
                    margin-top: 4px;
                }

                /* PLAYERS */
                .player {
                    position: absolute;
                    transform: translate(-50%, -50%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0;
                    z-index: 20;
                    overflow: visible;
                }

                .avatar {
                    width: 138px;
                    height: 138px;
                    overflow: visible;
                }

                .avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .player-info {
                    background: rgba(0, 0, 0, 0.85);
                    width: auto;
                    min-width: 70px;
                    padding: 4px 10px;
                    border-radius: 8px;
                    border: 2px solid rgba(255, 215, 0, 0.8);
                    margin-top: -10px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1px;
                }

                .player-name {
                    font-size: 15px;
                    font-weight: 600;
                    color: #fff;
                    white-space: nowrap;
                }

                .player-stack {
                    font-size: 17px;
                    font-weight: 700;
                    color: #FFD700;
                    white-space: nowrap;
                }

                /* HERO */
                #hero .player-info {
                    margin-top: -25px;
                }

                .hero-cards {
                    position: absolute;
                    left: 100%;
                    top: 50%;
                    transform: translateY(calc(-50% + 20px));
                    display: flex;
                    margin-left: 5px;
                    z-index: 10;
                }

                .hero-cards .card:nth-child(1) {
                    transform: rotate(-6deg);
                    z-index: 1;
                }

                .hero-cards .card:nth-child(2) {
                    margin-left: -20px;
                    transform: rotate(12deg);
                    z-index: 2;
                }

                /* CARDS */
                .card {
                    width: 56px;
                    height: 78px;
                    border-radius: 5px;
                    background: #fff;
                    box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.5);
                    display: grid;
                    grid-template-areas:
                        "tl . ."
                        ". center ."
                        ". . .";
                    grid-template-columns: 14px 1fr 14px;
                    grid-template-rows: 14px 1fr 14px;
                    padding: 3px;
                    border: 1px solid #ccc;
                }

                .card-corner-tl {
                    grid-area: tl;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    line-height: 0.75;
                    padding-top: 1px;
                }

                .card-center {
                    grid-area: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 0;
                }

                .corner-rank {
                    font-size: 12px;
                    font-weight: 700;
                    font-family: Arial, sans-serif;
                    line-height: 1;
                }

                .corner-suit {
                    font-size: 10px;
                    line-height: 1;
                    margin-top: -1px;
                }

                .card-rank {
                    font-size: 32px;
                    font-weight: 700;
                    font-family: Arial, sans-serif;
                    line-height: 0.9;
                }

                .card-suit {
                    font-size: 26px;
                    line-height: 1;
                    margin-top: -2px;
                }

                .card.hearts .corner-rank,
                .card.hearts .corner-suit,
                .card.hearts .card-rank,
                .card.hearts .card-suit {
                    color: #D32F2F;
                }

                /* DEALER BUTTON */
                .dealer-button {
                    position: absolute;
                    top: 75%;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: linear-gradient(145deg, #fff, #ddd);
                    border: 3px solid #1a1a1a;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 900;
                    color: #1a1a1a;
                    z-index: 15;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
                }

                /* TIMER */
                .timer {
                    position: absolute;
                    left: 70px;
                    bottom: 45px;
                    width: 86px;
                    height: 86px;
                    border-radius: 6px;
                    background: #111;
                    border: 3px solid #333;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    z-index: 30;
                    box-shadow: 0 0 15px rgba(255, 0, 0, 0.3), inset 0 0 10px rgba(0, 0, 0, 0.5);
                }

                .timer-value {
                    font-size: 43px;
                    font-weight: 900;
                    color: #ff2222;
                    font-family: 'Courier New', monospace;
                    text-shadow: 0 0 10px rgba(255, 0, 0, 0.8), 0 0 20px rgba(255, 0, 0, 0.4);
                    letter-spacing: 2px;
                }

                /* QUESTION COUNTER */
                .question-counter {
                    position: absolute;
                    right: 50px;
                    bottom: 45px;
                    padding: 12px 16px;
                    border-radius: 6px;
                    background: #111;
                    border: 3px solid #333;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 30;
                    box-shadow: 0 0 15px rgba(0, 150, 255, 0.3), inset 0 0 10px rgba(0, 0, 0, 0.5);
                }

                .question-counter-text {
                    font-size: 14px;
                    font-weight: 700;
                    color: #00aaff;
                    font-family: 'Courier New', monospace;
                    text-shadow: 0 0 10px rgba(0, 150, 255, 0.8), 0 0 20px rgba(0, 150, 255, 0.4);
                    white-space: nowrap;
                }

                /* OPPONENT CARDS */
                .opponent-cards {
                    position: absolute;
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    z-index: 100;
                    pointer-events: auto;
                }

                .opponent-card {
                    width: 34px;
                    height: 47px;
                    border-radius: 3px;
                    background: #1a1a1a;
                    border: 1.5px solid #333;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
                    position: relative;
                    overflow: hidden;
                    flex-shrink: 0;
                }

                .opponent-card:nth-child(1) {
                    transform: rotate(-8deg);
                }

                .opponent-card:nth-child(2) {
                    margin-left: -18px;
                    transform: rotate(8deg);
                }

                .opponent-card::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(circle at 50% 50%, transparent 30%, rgba(212, 175, 55, 0.1) 31%, transparent 32%),
                        linear-gradient(45deg, rgba(212, 175, 55, 0.05) 25%, transparent 25%, transparent 75%, rgba(212, 175, 55, 0.05) 75%),
                        linear-gradient(-45deg, rgba(212, 175, 55, 0.05) 25%, transparent 25%, transparent 75%, rgba(212, 175, 55, 0.05) 75%);
                    background-size: 100% 100%, 8px 8px, 8px 8px;
                    background-position: center, 0 0, 4px 4px;
                }

                .opponent-card::after {
                    content: '';
                    position: absolute;
                    inset: 3px;
                    border: 1px solid rgba(212, 175, 55, 0.4);
                    border-radius: 2px;
                    pointer-events: none;
                }

                /* ACTION BUTTONS */
                .action-buttons {
                    flex-shrink: 0;
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 6px;
                    padding: 8px 12px;
                    padding-bottom: 12px;
                    background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
                    z-index: 100;
                }

                .action-button {
                    padding: 10px;
                    font-size: 14px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #2563EB, #1D4ED8);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                }

                .action-button:hover {
                    transform: scale(1.02);
                    box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
                }

                .action-button:active {
                    transform: scale(0.98);
                }
            `}</style>

            <div className="game-container">
                {/* HEADER */}
                <div className="header">
                    <button className="back-button" onClick={() => router.push('/hub/training')}>
                        ← Back to Training
                    </button>
                    <div className="game-title">ICM FUNDAMENTALS</div>
                    <div className="header-right">
                        <div className="wallet-item xp-wallet">⚡ 1,250 XP</div>
                        <div className="wallet-item diamond-wallet">💎 500</div>
                        <div className="profile-pic">
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=poker" alt="Profile" />
                        </div>
                    </div>
                </div>

                {/* QUESTION */}
                <div className="question-section">
                    <div className="question-text">
                        You are on the Button (last to act). The player to your right bets 2.5 big blinds. What is your best move?
                    </div>
                </div>

                {/* STAGE */}
                <div className="stage">
                    {/* Timer */}
                    <div className="timer">
                        <div className="timer-value">15</div>
                    </div>

                    {/* Question Counter */}
                    <div className="question-counter">
                        <div className="question-counter-text">Question 1 of 20</div>
                    </div>

                    {/* Table Area */}
                    <div className="table-area">
                        <div className="table-container">
                            <div className="table-image" />

                            {/* Pot */}
                            <div className="pot-display">
                                <span>🪙</span>
                                <span className="pot-amount">Pot 0</span>
                            </div>

                            {/* Game Info */}
                            <div className="game-info">
                                <div className="game-type">ICM Fundamentals</div>
                                <div className="branding">Smarter.Poker</div>
                            </div>

                            {/* Dealer Button */}
                            <div className="dealer-button">D</div>

                            {/* Villains */}
                            {villains.map((villain, index) => (
                                <div
                                    key={villain.id}
                                    className="player"
                                    id={villain.id}
                                    style={{
                                        left: SEAT_POSITIONS[villain.id].left,
                                        top: SEAT_POSITIONS[villain.id].top
                                    }}
                                >
                                    <div className="avatar">
                                        <img src={villain.avatar} alt={villain.name} />
                                    </div>
                                    <div className="player-info">
                                        <div className="player-name">{villain.name}</div>
                                        <div className="player-stack">{villain.stack}</div>
                                    </div>
                                    <div
                                        className="opponent-cards"
                                        data-villain={villain.id}
                                        style={{
                                            left: `${LOCKED_CARD_POSITIONS[villain.id].left}px`,
                                            top: `${LOCKED_CARD_POSITIONS[villain.id].top}px`
                                        }}
                                    >
                                        <div className="opponent-card"></div>
                                        <div className="opponent-card"></div>
                                    </div>
                                </div>
                            ))}

                            {/* Hero */}
                            <div
                                className="player"
                                id="hero"
                                style={{
                                    left: SEAT_POSITIONS.hero.left,
                                    top: SEAT_POSITIONS.hero.top
                                }}
                            >
                                <div className="avatar">
                                    <img src={AVATARS[8]} alt="Hero" />
                                </div>
                                <div className="player-info">
                                    <div className="player-name">Hero</div>
                                    <div className="player-stack">45 BB</div>
                                </div>
                                <div className="hero-cards">
                                    {/* Ace of Hearts */}
                                    <div className="card hearts">
                                        <div className="card-corner-tl">
                                            <span className="corner-rank">A</span>
                                            <span className="corner-suit">♥</span>
                                        </div>
                                        <div className="card-center">
                                            <span className="card-rank">A</span>
                                            <span className="card-suit">♥</span>
                                        </div>
                                    </div>
                                    {/* King of Hearts */}
                                    <div className="card hearts">
                                        <div className="card-corner-tl">
                                            <span className="corner-rank">K</span>
                                            <span className="corner-suit">♥</span>
                                        </div>
                                        <div className="card-center">
                                            <span className="card-rank">K</span>
                                            <span className="card-suit">♥</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="action-buttons">
                    <button className="action-button" onClick={() => setSelectedAction('Fold')}>
                        Fold
                    </button>
                    <button className="action-button" onClick={() => setSelectedAction('Call')}>
                        Call
                    </button>
                    <button className="action-button" onClick={() => setSelectedAction('Raise')}>
                        Raise to 8bb
                    </button>
                    <button className="action-button" onClick={() => setSelectedAction('All-In')}>
                        All-In
                    </button>
                </div>
            </div>
        </>
    );
}
