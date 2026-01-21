import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';

/**
 * PHASER 3 POKER ROOM ENGINE
 * 
 * Architecture:
 * - React manages lifecycle and state
 * - Phaser handles rendering, animations, and physics
 * - Event bridge connects Phaser → React for GTO calculations
 */

// ============================================
// PHASER SCENES
// ============================================

class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        // Loading bar graphics
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 320, height / 2 - 30, 640, 60);

        // Loading text
        const loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 50,
            text: 'Loading Poker Room...',
            style: {
                font: '20px monospace',
                fill: '#ffffff'
            }
        });
        loadingText.setOrigin(0.5, 0.5);

        // ANIMATED ORANGE BALLS (STRICT REQUIREMENT)
        this.createOrangeBallsAnimation(width, height);

        // Progress bar update
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(width / 2 - 310, height / 2 - 20, 620 * value, 40);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });

        // Load placeholder assets (if any)
        // For now, we'll generate everything programmatically
    }

    createOrangeBallsAnimation(width, height) {
        // Create 8 animated orange balls in a circular pattern
        const balls = [];
        const radius = 80;
        const centerX = width / 2;
        const centerY = height / 2 + 100;

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            const ball = this.add.circle(x, y, 12, 0xff8800);
            ball.setAlpha(0.3 + (i / 8) * 0.7); // Gradient opacity
            balls.push({ sprite: ball, angle: angle, index: i });
        }

        // Animate the balls
        this.time.addEvent({
            delay: 100,
            callback: () => {
                balls.forEach((ball, idx) => {
                    const newAngle = ball.angle + 0.2;
                    const x = centerX + Math.cos(newAngle) * radius;
                    const y = centerY + Math.sin(newAngle) * radius;
                    ball.sprite.setPosition(x, y);
                    ball.angle = newAngle;

                    // Pulsing effect
                    const scale = 1 + Math.sin(Date.now() / 200 + idx) * 0.3;
                    ball.sprite.setScale(scale);
                });
            },
            loop: true
        });
    }

    create() {
        // Transition to main game table
        this.time.delayedCall(1500, () => {
            this.scene.start('GameTableScene');
        });
    }
}

class GameTableScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameTableScene' });
        this.eventEmitter = null; // Will be set by React
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Enable Arcade Physics
        this.physics.world.setBounds(0, 0, width, height);

        // Create the poker table
        this.createPokerTable(width, height);

        // Create 9 seat zones
        this.seats = this.create9MaxSeats(width, height);

        // Create card deck zone (center)
        this.deckZone = this.createDeckZone(width, height);

        // Listen for external events from React
        this.setupExternalEventListeners();
    }

    createPokerTable(width, height) {
        // Table dimensions
        const tableWidth = 900;
        const tableHeight = 450;
        const centerX = width / 2;
        const centerY = height / 2;

        // Brown border
        const border = this.add.graphics();
        border.fillStyle(0x654321, 1);
        border.fillRoundedRect(
            centerX - tableWidth / 2 - 20,
            centerY - tableHeight / 2 - 20,
            tableWidth + 40,
            tableHeight + 40,
            30
        );

        // Green felt (0x35654d)
        const felt = this.add.graphics();
        felt.fillStyle(0x35654d, 1);
        felt.fillRoundedRect(
            centerX - tableWidth / 2,
            centerY - tableHeight / 2,
            tableWidth,
            tableHeight,
            25
        );

        // Table label
        const label = this.add.text(centerX, centerY, 'SMARTER.POKER', {
            font: 'bold 24px Arial',
            fill: '#ffffff',
            alpha: 0.2
        });
        label.setOrigin(0.5);

        this.tableGraphics = { border, felt, label };
    }

    create9MaxSeats(width, height) {
        const seats = [];
        const centerX = width / 2;
        const centerY = height / 2;
        const radiusX = 500;
        const radiusY = 280;

        // 9-Max seat positions (clockwise from top)
        const seatAngles = [
            -Math.PI / 2,        // Seat 1: Top
            -Math.PI / 2 + 0.7,  // Seat 2: Top-right
            0,                   // Seat 3: Right
            Math.PI / 2 - 0.7,   // Seat 4: Bottom-right
            Math.PI / 2,         // Seat 5: Bottom
            Math.PI / 2 + 0.7,   // Seat 6: Bottom-left
            Math.PI,             // Seat 7: Left
            -Math.PI / 2 - 0.7,  // Seat 8: Top-left
            -Math.PI / 2 - 0.35  // Seat 9: Top-center-left
        ];

        seatAngles.forEach((angle, index) => {
            const x = centerX + Math.cos(angle) * radiusX;
            const y = centerY + Math.sin(angle) * radiusY;

            // Seat circle
            const seatCircle = this.add.circle(x, y, 40, 0x333333, 0.5);
            seatCircle.setStrokeStyle(3, 0xffffff, 0.3);

            // Seat number
            const seatNumber = this.add.text(x, y, `${index + 1}`, {
                font: 'bold 20px Arial',
                fill: '#ffffff'
            });
            seatNumber.setOrigin(0.5);

            seats.push({
                index: index + 1,
                x,
                y,
                circle: seatCircle,
                label: seatNumber,
                cards: []
            });
        });

        return seats;
    }

    createDeckZone(width, height) {
        const centerX = width / 2;
        const centerY = height / 2;

        // Deck position indicator
        const deckCircle = this.add.circle(centerX, centerY - 50, 30, 0xffffff, 0.2);
        deckCircle.setStrokeStyle(2, 0xffffff, 0.5);

        const deckLabel = this.add.text(centerX, centerY - 50, 'DECK', {
            font: '12px Arial',
            fill: '#ffffff',
            alpha: 0.5
        });
        deckLabel.setOrigin(0.5);

        return {
            x: centerX,
            y: centerY - 50,
            circle: deckCircle,
            label: deckLabel
        };
    }

    setupExternalEventListeners() {
        // This will be called from React to set the event emitter
        // Example: scene.setEventEmitter(customEmitter)
    }

    setEventEmitter(emitter) {
        this.eventEmitter = emitter;
    }

    /**
     * DEAL CARDS ANIMATION
     * Animates cards from center deck to seat positions
     */
    dealCardsToSeats(seatsToReceive) {
        if (!seatsToReceive || seatsToReceive.length === 0) {
            console.warn('No seats specified for dealing');
            return;
        }

        const dealDelay = 150; // ms between each card

        seatsToReceive.forEach((seatIndex, cardIndex) => {
            this.time.delayedCall(cardIndex * dealDelay, () => {
                this.dealSingleCard(seatIndex);
            });
        });

        // Emit event to React when dealing is complete
        const totalDealTime = seatsToReceive.length * dealDelay + 500;
        this.time.delayedCall(totalDealTime, () => {
            if (this.eventEmitter) {
                this.eventEmitter.emit('dealComplete', { seats: seatsToReceive });
            }
        });
    }

    dealSingleCard(seatIndex) {
        const seat = this.seats.find(s => s.index === seatIndex);
        if (!seat) return;

        // Create card sprite (simple rectangle for now)
        const card = this.add.rectangle(
            this.deckZone.x,
            this.deckZone.y,
            60,
            80,
            0xffffff
        );
        card.setStrokeStyle(2, 0x000000);

        // Add physics to the card
        this.physics.add.existing(card);

        // Animate card to seat position
        this.tweens.add({
            targets: card,
            x: seat.x,
            y: seat.y - 60,
            duration: 400,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                // Card arrived at seat
                seat.cards.push(card);

                // Emit to React for GTO calculations
                if (this.eventEmitter) {
                    this.eventEmitter.emit('cardDealt', {
                        seatIndex,
                        cardCount: seat.cards.length
                    });
                }
            }
        });

        // Rotation animation for realism
        this.tweens.add({
            targets: card,
            angle: 360,
            duration: 400,
            ease: 'Linear'
        });
    }

    /**
     * TRIGGER GTO CALCULATION
     * Called when player makes a decision
     */
    triggerGTOCalculation(action, seatIndex) {
        if (this.eventEmitter) {
            this.eventEmitter.emit('gtoCalculationRequested', {
                action,
                seatIndex,
                timestamp: Date.now()
            });
        }
    }
}

// ============================================
// REACT COMPONENT
// ============================================

const GameTable = ({ onGTOCalculation, onDealComplete, onCardDealt }) => {
    const gameContainerRef = useRef(null);
    const gameInstanceRef = useRef(null);
    const [gameReady, setGameReady] = useState(false);

    useEffect(() => {
        if (gameInstanceRef.current) return; // Already initialized

        // Phaser 3 Game Configuration
        const config = {
            type: Phaser.AUTO,
            parent: gameContainerRef.current,
            width: 1920,
            height: 1080,
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH
            },
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 },
                    debug: false
                }
            },
            backgroundColor: '#1a1a1a',
            scene: [BootScene, GameTableScene]
        };

        // Initialize Phaser Game
        const game = new Phaser.Game(config);
        gameInstanceRef.current = game;

        // Event emitter for Phaser → React communication
        const eventEmitter = new Phaser.Events.EventEmitter();

        // Listen for Phaser events and forward to React
        eventEmitter.on('gtoCalculationRequested', (data) => {
            if (onGTOCalculation) {
                onGTOCalculation(data);
            }
        });

        eventEmitter.on('dealComplete', (data) => {
            if (onDealComplete) {
                onDealComplete(data);
            }
        });

        eventEmitter.on('cardDealt', (data) => {
            if (onCardDealt) {
                onCardDealt(data);
            }
        });

        // Wait for scene to be ready, then inject event emitter
        game.events.on('ready', () => {
            const tableScene = game.scene.getScene('GameTableScene');
            if (tableScene) {
                tableScene.setEventEmitter(eventEmitter);
            }
            setGameReady(true);
        });

        // Cleanup on unmount
        return () => {
            if (gameInstanceRef.current) {
                gameInstanceRef.current.destroy(true);
                gameInstanceRef.current = null;
            }
            eventEmitter.removeAllListeners();
        };
    }, [onGTOCalculation, onDealComplete, onCardDealt]);

    // Expose methods to parent component
    useEffect(() => {
        if (!gameReady || !gameInstanceRef.current) return;

        // Attach methods to window for external control (optional)
        window.pokerGameAPI = {
            dealCards: (seats) => {
                const scene = gameInstanceRef.current.scene.getScene('GameTableScene');
                if (scene) {
                    scene.dealCardsToSeats(seats);
                }
            },
            triggerGTO: (action, seatIndex) => {
                const scene = gameInstanceRef.current.scene.getScene('GameTableScene');
                if (scene) {
                    scene.triggerGTOCalculation(action, seatIndex);
                }
            }
        };

        return () => {
            delete window.pokerGameAPI;
        };
    }, [gameReady]);

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            backgroundColor: '#000000'
        }}>
            <div ref={gameContainerRef} style={{ width: '100%', height: '100%' }} />

            {/* Debug overlay (optional) */}
            {gameReady && (
                <div style={{
                    position: 'absolute',
                    top: 20,
                    left: 20,
                    color: 'white',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    padding: '10px',
                    borderRadius: '5px',
                    pointerEvents: 'none'
                }}>
                    <div>Phaser 3 Poker Room - ACTIVE</div>
                    <div>Canvas: 1920x1080 (Scaled)</div>
                    <div>Physics: Arcade</div>
                </div>
            )}
        </div>
    );
};

export default GameTable;
