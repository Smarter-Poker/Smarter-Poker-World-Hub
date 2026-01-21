import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';

// ==========================================
// EXACT CLONE CONSTANTS - MATCHING REFERENCE PRECISELY
// ==========================================
const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 750;

const COLORS = {
    bgDark: 0x080810,
    tableFelt: 0x121010,  // Very dark with subtle warmth
    goldOuter: 0xc4960a,
    goldInner: 0xe8b810,
};

// Seat positions - Adjusted to prevent avatar cutoff on sides
const SEAT_POSITIONS = [
    { x: 0.50, y: 0.85, label: 'Hero', stack: 45 },       // Hero - bottom center
    { x: 0.15, y: 0.68, label: 'Villain 1', stack: 32 },  // Viking - bottom left
    { x: 0.10, y: 0.46, label: 'Villain 2', stack: 28 },  // Wizard - left mid  
    { x: 0.12, y: 0.24, label: 'Villain 3', stack: 55 },  // Ninja - left upper
    { x: 0.28, y: 0.10, label: 'Villain 4', stack: 41 },  // Spartan - top left
    { x: 0.72, y: 0.10, label: 'Villain 5', stack: 38 },  // Wolf - top right
    { x: 0.88, y: 0.24, label: 'Villain 6', stack: 62 },  // Pharaoh - right upper
    { x: 0.90, y: 0.46, label: 'Villain 7', stack: 29 },  // Cowboy - right mid
    { x: 0.85, y: 0.68, label: 'Villain 8', stack: 51 },  // Pirate - bottom right
];

// Avatar URLs - EXACT match to reference characters
const AVATAR_URLS = [
    '/avatars/free/fox.png',              // Hero - Orange Fox
    '/avatars/vip/viking_warrior.png',    // Villain 1 - Viking (bottom-left)
    '/avatars/free/wizard.png',           // Villain 2 - Wizard blue (left-mid)
    '/avatars/free/ninja.png',            // Villain 3 - Ninja black (left-upper)
    '/avatars/vip/spartan.png',           // Villain 4 - Spartan red (top-left)
    '/avatars/vip/wolf.png',              // Villain 5 - Wolf gray (top-right)
    '/avatars/vip/pharaoh.png',           // Villain 6 - Pharaoh gold (right-upper)
    '/avatars/free/cowboy.png',           // Villain 7 - Cowboy (right-mid) FIXED!
    '/avatars/free/pirate.png',           // Villain 8 - Pirate (bottom-right)
];

// ==========================================
// BOOT SCENE
// ==========================================
class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        this.cameras.main.setBackgroundColor('#080810');
        const cx = this.cameras.main.width / 2;
        const cy = this.cameras.main.height / 2;
        this.add.text(cx, cy, 'Loading...', { fontSize: '20px', color: '#ff8800' }).setOrigin(0.5);
        AVATAR_URLS.forEach((url, i) => this.load.image(`avatar_${i}`, url));
    }

    create() {
        this.time.delayedCall(800, () => this.scene.start('GameTableScene'));
    }
}

// ==========================================
// GAME TABLE SCENE - USING ACTUAL TABLE IMAGE
// ==========================================
class GameTableScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameTableScene' });
    }

    preload() {
        // Load pre-optimized table image (already perfectly sized for canvas)
        this.load.image('table', '/game/table_optimized.png');
    }

    create() {
        const cx = this.cameras.main.width / 2;
        const cy = this.cameras.main.height * 0.44;

        this.drawBackground();
        this.drawDoubleRailTable(cx, cy);  // Use vector graphics for crisp lines
        this.drawBranding(cx, cy + 30);
        this.drawPotDisplay(cx, cy - 100);
        this.createSeats();
        this.drawDealerButton();
        this.drawHeroCards();
    }

    drawBackground() {
        const g = this.add.graphics();
        g.fillStyle(COLORS.bgDark, 1);
        g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    drawTable(cx: number, cy: number) {
        // Use pre-optimized table image at 1:1 scale (no pixelation)
        const table = this.add.image(cx, cy + 20, 'table');
        // No scaling needed - image is already the perfect size
    }

    drawDoubleRailTable(cx: number, cy: number) {
        // Large table with crisp vector graphics - fills more of the screen
        const w = 380;   // Wider felt
        const h = 540;   // Taller felt  
        const r = 190;   // Corner radius for racetrack shape

        const g = this.add.graphics();

        // 1. OUTER DARK RAIL (thick dark border)
        g.lineStyle(30, 0x1a1a1a, 1);
        g.strokeRoundedRect(cx - (w + 110) / 2, cy - (h + 110) / 2, w + 110, h + 110, r + 55);

        // 2. FIRST GOLD LINE (outer gold) - crisp 10px
        g.lineStyle(10, 0xd4a000, 1);
        g.strokeRoundedRect(cx - (w + 75) / 2, cy - (h + 75) / 2, w + 75, h + 75, r + 37);

        // 3. BLACK GAP between golds
        g.lineStyle(6, 0x0a0a0a, 1);
        g.strokeRoundedRect(cx - (w + 58) / 2, cy - (h + 58) / 2, w + 58, h + 58, r + 29);

        // 4. SECOND GOLD LINE (inner gold) - crisp 10px
        g.lineStyle(10, 0xe8b810, 1);
        g.strokeRoundedRect(cx - (w + 44) / 2, cy - (h + 44) / 2, w + 44, h + 44, r + 22);

        // 5. THIN GOLD ACCENT
        g.lineStyle(4, 0xc4960a, 1);
        g.strokeRoundedRect(cx - (w + 30) / 2, cy - (h + 30) / 2, w + 30, h + 30, r + 15);

        // 6. WHITE GLOW - PROMINENT
        g.lineStyle(20, 0xffffff, 0.35);
        g.strokeRoundedRect(cx - (w + 14) / 2, cy - (h + 14) / 2, w + 14, h + 14, r + 7);

        // 7. FELT (pure black)
        g.fillStyle(0x0a0a0a, 1);
        g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
    }

    createSeats() {
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;

        SEAT_POSITIONS.forEach((seat, i) => {
            const x = seat.x * W;
            const y = seat.y * H;
            const isHero = i === 0;

            // AVATARS - EXACT SIZE MATCH TO REFERENCE
            const avatarSize = isHero ? 135 : 120;
            const avatarKey = `avatar_${i}`;

            if (this.textures.exists(avatarKey)) {
                const av = this.add.image(x, y - 35, avatarKey);
                av.setDisplaySize(avatarSize, avatarSize);
            } else {
                this.add.circle(x, y - 35, avatarSize / 2, 0x333333).setStrokeStyle(3, COLORS.goldOuter);
            }

            // YELLOW BADGE below avatar - larger and more prominent
            const bw = 78;
            const bh = isHero ? 46 : 40;
            const by = y + avatarSize / 2 - 15;

            this.add.rectangle(x, by, bw, bh, 0xd4a000).setStrokeStyle(2, 0xffd700);

            // Name
            this.add.text(x, by - 8, seat.label, {
                fontFamily: 'Arial',
                fontSize: isHero ? '12px' : '10px',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            // Stack
            this.add.text(x, by + 8, `${seat.stack} BB`, {
                fontFamily: 'Arial',
                fontSize: isHero ? '12px' : '10px',
                color: '#000000',
                fontStyle: 'bold'
            }).setOrigin(0.5);
        });
    }

    drawHeroCards() {
        const hx = SEAT_POSITIONS[0].x * this.cameras.main.width;
        const hy = SEAT_POSITIONS[0].y * this.cameras.main.height;
        const y = hy - 80;
        const cw = 40, ch = 58;

        // Ace
        this.add.rectangle(hx - 20, y, cw, ch, 0xffffff).setStrokeStyle(2, 0x222222).setAngle(-12);
        this.add.text(hx - 34, y - 12, 'A', { fontFamily: 'Arial Black', fontSize: '22px', color: '#cc0000' }).setOrigin(0.5).setAngle(-12);
        this.add.text(hx - 10, y + 10, '♥', { fontSize: '18px', color: '#cc0000' }).setOrigin(0.5).setAngle(-12);

        // King
        this.add.rectangle(hx + 20, y, cw, ch, 0xffffff).setStrokeStyle(2, 0x222222).setAngle(12);
        this.add.text(hx + 6, y - 12, 'K', { fontFamily: 'Arial Black', fontSize: '22px', color: '#cc0000' }).setOrigin(0.5).setAngle(12);
        this.add.text(hx + 30, y + 10, '♥', { fontSize: '18px', color: '#cc0000' }).setOrigin(0.5).setAngle(12);
    }

    drawPotDisplay(x: number, y: number) {
        this.add.rectangle(x, y, 75, 28, 0x222222, 0.95).setStrokeStyle(1, 0x444444);
        this.add.circle(x - 25, y, 7, 0x333333).setStrokeStyle(2, 0x555555);
        this.add.text(x + 5, y, 'POT 0', { fontFamily: 'Arial', fontSize: '12px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    }

    drawDealerButton() {
        const hx = SEAT_POSITIONS[0].x * this.cameras.main.width;
        const hy = SEAT_POSITIONS[0].y * this.cameras.main.height;
        const x = hx, y = hy - 125;
        this.add.circle(x, y, 12, 0xffffff).setStrokeStyle(2, 0x333333);
        this.add.text(x, y + 1, 'D', { fontFamily: 'Arial Black', fontSize: '11px', color: '#000' }).setOrigin(0.5);
    }

    drawBranding(x: number, y: number) {
        this.add.text(x, y, 'ICM Fundamentals', { fontFamily: 'Georgia', fontSize: '20px', color: '#444', fontStyle: 'italic' }).setOrigin(0.5).setAlpha(0.8);
        this.add.text(x, y + 22, 'Smarter.Poker', { fontFamily: 'Arial', fontSize: '12px', color: '#555' }).setOrigin(0.5).setAlpha(0.7);
    }
}

// ==========================================
// REACT COMPONENT
// ==========================================
interface PokerGameProps {
    gameTitle?: string;
    questionText?: string;
    questionNumber?: number;
    totalQuestions?: number;
    timerSeconds?: number;
    xp?: number;
    diamonds?: number;
    onFold?: () => void;
    onCall?: () => void;
    onRaise?: () => void;
    onAllIn?: () => void;
}

const PokerGame: React.FC<PokerGameProps> = ({
    gameTitle = 'ICM FUNDAMENTALS',
    questionText = 'You Are On The Button (Last To Act). The Player To Your Right Bets 2.5 Big Blinds. What Is Your Best Move?',
    questionNumber = 1,
    totalQuestions = 20,
    timerSeconds = 15,
    xp = 1250,
    diamonds = 500,
    onFold, onCall, onRaise, onAllIn
}) => {
    const gameContainerRef = useRef<HTMLDivElement>(null);
    const gameInstanceRef = useRef<Phaser.Game | null>(null);
    const [timer, setTimer] = useState(timerSeconds);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!gameContainerRef.current || gameInstanceRef.current) return;

        const config: Phaser.Types.Core.GameConfig = {
            type: Phaser.AUTO,
            parent: 'poker-game-container',
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            backgroundColor: '#080810',
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
            scene: [BootScene, GameTableScene]
        };

        gameInstanceRef.current = new Phaser.Game(config);
        setTimeout(() => setIsLoading(false), 1000);

        return () => {
            gameInstanceRef.current?.destroy(true);
            gameInstanceRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (isLoading || timer <= 0) return;
        const interval = setInterval(() => setTimer(t => Math.max(0, t - 1)), 1000);
        return () => clearInterval(interval);
    }, [isLoading, timer]);

    return (
        <div className="relative w-full h-screen flex flex-col" style={{ backgroundColor: '#080810' }}>
            {/* HEADER */}
            <div className="flex justify-between items-center px-4 py-2" style={{ backgroundColor: '#080810' }}>
                <button className="text-white text-xs font-bold px-4 py-2 rounded-full" style={{ backgroundColor: '#0891b2' }}>
                    ← Back to Training
                </button>
                <h1 className="text-sm font-bold tracking-wider uppercase" style={{ color: '#22d3ee' }}>{gameTitle}</h1>
                <div className="flex gap-3 text-xs font-semibold">
                    <span style={{ color: '#22d3ee' }}>⚡ {xp.toLocaleString()} XP</span>
                    <span style={{ color: '#ef4444' }}>💎 {diamonds}</span>
                </div>
            </div>

            {/* QUESTION BOX */}
            <div className="px-4 py-2">
                <div className="rounded-xl px-5 py-4 text-center" style={{
                    backgroundColor: '#0f172a',
                    border: '2px solid rgba(34, 211, 238, 0.5)',
                    boxShadow: '0 0 20px rgba(34, 211, 238, 0.2), inset 0 0 20px rgba(0, 0, 0, 0.3)'
                }}>
                    <p className="text-sm font-semibold leading-relaxed" style={{ color: '#e0f2fe' }}>{questionText}</p>
                </div>
            </div>

            {/* GAME CANVAS */}
            <div className="flex-1 relative min-h-0">
                <div id="poker-game-container" ref={gameContainerRef} className="absolute inset-0" />

                {/* TIMER */}
                <div className="absolute left-4 bottom-4 z-20">
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl font-bold text-white" style={{ backgroundColor: '#dc2626' }}>
                        {timer}
                    </div>
                </div>

                {/* QUESTION COUNTER */}
                <div className="absolute right-4 bottom-4 z-20">
                    <div className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: '#1f2937', border: '1px solid #4b5563', color: '#f3f4f6' }}>
                        Question {questionNumber} of {totalQuestions}
                    </div>
                </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="grid grid-cols-2 gap-3 p-4" style={{ backgroundColor: '#080810' }}>
                <button onClick={onFold} className="font-bold py-4 rounded-xl text-white text-lg" style={{ backgroundColor: '#1d4ed8' }}>Fold</button>
                <button onClick={onCall} className="font-bold py-4 rounded-xl text-white text-lg" style={{ backgroundColor: '#2563eb' }}>Call</button>
                <button onClick={onRaise} className="font-bold py-4 rounded-xl text-white text-lg" style={{ backgroundColor: '#2563eb' }}>Raise to 8bb</button>
                <button onClick={onAllIn} className="font-bold py-4 rounded-xl text-white text-lg" style={{ backgroundColor: '#2563eb' }}>All-In</button>
            </div>
        </div>
    );
};

export default PokerGame;
