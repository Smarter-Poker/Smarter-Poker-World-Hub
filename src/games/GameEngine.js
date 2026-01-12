/* ═══════════════════════════════════════════════════════════════════════════
   🎮 GAME ENGINE CORE — Video Game Feel for Memory Matrix
   Handles: Timer, Combos, Effects, Sounds, Progression
   ═══════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════
// 🎵 SOUND ENGINE — Audio feedback for all actions
// ═══════════════════════════════════════════════════════════════════════════
export const SoundEngine = {
    _sounds: {},
    _enabled: true,

    // Sound URLs (will use base64 or CDN in production)
    SOUNDS: {
        correct: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==',
        wrong: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==',
        combo: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==',
        levelUp: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==',
        tick: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==',
        gameOver: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==',
        diamond: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==',
    },

    play(soundName) {
        if (!this._enabled || typeof window === 'undefined') return;
        try {
            // For now, use browser beeps (will integrate Howler.js later)
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            const frequencies = {
                correct: 880,
                wrong: 220,
                combo: 1200,
                levelUp: 660,
                tick: 440,
                gameOver: 110,
                diamond: 1400,
            };

            osc.frequency.value = frequencies[soundName] || 440;
            osc.type = soundName === 'wrong' ? 'sawtooth' : 'sine';
            gain.gain.value = 0.1;

            osc.start();
            osc.stop(ctx.currentTime + (soundName === 'levelUp' ? 0.3 : 0.1));
        } catch (e) {
            // Silently fail if audio context unavailable
        }
    },

    toggle() {
        this._enabled = !this._enabled;
        return this._enabled;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 💥 EFFECTS ENGINE — Visual feedback
// ═══════════════════════════════════════════════════════════════════════════
export const EffectsEngine = {
    // Screen shake effect
    shake(element, intensity = 5) {
        if (!element) return;
        const original = element.style.transform;
        let shakes = 6;
        const interval = setInterval(() => {
            const x = (Math.random() - 0.5) * intensity * 2;
            const y = (Math.random() - 0.5) * intensity * 2;
            element.style.transform = `translate(${x}px, ${y}px)`;
            shakes--;
            if (shakes <= 0) {
                clearInterval(interval);
                element.style.transform = original;
            }
        }, 50);
    },

    // Flash effect
    flash(element, color = '#ff0000') {
        if (!element) return;
        const original = element.style.boxShadow;
        element.style.boxShadow = `inset 0 0 100px ${color}`;
        setTimeout(() => {
            element.style.boxShadow = original;
        }, 200);
    },

    // Particle burst (CSS-based)
    particles(x, y, count = 10, color = '#00ff88') {
        if (typeof document === 'undefined') return;
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                width: 8px;
                height: 8px;
                background: ${color};
                border-radius: 50%;
                pointer-events: none;
                z-index: 10000;
                animation: particleBurst 0.6s ease-out forwards;
            `;
            particle.style.setProperty('--tx', `${(Math.random() - 0.5) * 200}px`);
            particle.style.setProperty('--ty', `${(Math.random() - 0.5) * 200}px`);
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 600);
        }
    },

    // Inject particle animation CSS
    initCSS() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('effects-css')) return;
        const style = document.createElement('style');
        style.id = 'effects-css';
        style.textContent = `
            @keyframes particleBurst {
                0% {
                    transform: translate(0, 0) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translate(var(--tx, 100px), var(--ty, -100px)) scale(0);
                    opacity: 0;
                }
            }
            @keyframes comboFire {
                0%, 100% { filter: brightness(1); }
                50% { filter: brightness(1.5) drop-shadow(0 0 10px orange); }
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
            @keyframes diamondRain {
                0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
                100% { transform: translateY(100px) rotate(360deg); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// ⏱️ TIMER ENGINE — Pressure mechanics
// ═══════════════════════════════════════════════════════════════════════════
export class TimerEngine {
    constructor(initialTime = 60, onTick, onExpire) {
        this.initialTime = initialTime;
        this.currentTime = initialTime;
        this.onTick = onTick;
        this.onExpire = onExpire;
        this.intervalId = null;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.currentTime--;

            // Tick sound in final 10 seconds
            if (this.currentTime <= 10 && this.currentTime > 0) {
                SoundEngine.play('tick');
            }

            if (this.onTick) this.onTick(this.currentTime);

            if (this.currentTime <= 0) {
                this.stop();
                SoundEngine.play('gameOver');
                if (this.onExpire) this.onExpire();
            }
        }, 1000);
    }

    stop() {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    reset() {
        this.stop();
        this.currentTime = this.initialTime;
    }

    addTime(seconds) {
        this.currentTime += seconds;
    }

    subtractTime(seconds) {
        this.currentTime = Math.max(0, this.currentTime - seconds);
    }

    getColor() {
        if (this.currentTime > 30) return '#00ff88';
        if (this.currentTime > 10) return '#ffaa00';
        return '#ff4444';
    }

    getPressureLevel() {
        if (this.currentTime > 30) return 'calm';
        if (this.currentTime > 10) return 'warning';
        return 'critical';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 COMBO ENGINE — Streak tracking with escalating rewards
// ═══════════════════════════════════════════════════════════════════════════
export class ComboEngine {
    constructor(onComboChange) {
        this.currentCombo = 0;
        this.maxCombo = 0;
        this.onComboChange = onComboChange;
    }

    hit() {
        this.currentCombo++;
        this.maxCombo = Math.max(this.maxCombo, this.currentCombo);

        SoundEngine.play(this.currentCombo >= 5 ? 'combo' : 'correct');

        if (this.onComboChange) {
            this.onComboChange(this.currentCombo, this.getMultiplier(), this.getComboName());
        }

        return {
            combo: this.currentCombo,
            multiplier: this.getMultiplier(),
            name: this.getComboName()
        };
    }

    miss() {
        const lostCombo = this.currentCombo;
        this.currentCombo = 0;

        SoundEngine.play('wrong');

        if (this.onComboChange) {
            this.onComboChange(0, 1, null);
        }

        return lostCombo;
    }

    getMultiplier() {
        if (this.currentCombo >= 20) return 3.0;
        if (this.currentCombo >= 10) return 2.0;
        if (this.currentCombo >= 5) return 1.5;
        if (this.currentCombo >= 3) return 1.2;
        return 1.0;
    }

    getComboName() {
        if (this.currentCombo >= 20) return '🔥 LEGENDARY!';
        if (this.currentCombo >= 15) return '💀 UNSTOPPABLE!';
        if (this.currentCombo >= 10) return '⚡ ON FIRE!';
        if (this.currentCombo >= 7) return '🎯 DOMINATING!';
        if (this.currentCombo >= 5) return '✨ HOT STREAK!';
        if (this.currentCombo >= 3) return '👍 NICE!';
        return null;
    }

    reset() {
        this.currentCombo = 0;
        this.maxCombo = 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 PROGRESSION ENGINE — Levels, XP, Mastery Gate
// ═══════════════════════════════════════════════════════════════════════════
export const LEVELS = [
    { level: 1, name: 'Neural Boot', focus: 'UTG/MP Opening Ranges', xpRequired: 0 },
    { level: 2, name: 'Position Pulse', focus: 'CO/BTN/SB Opening', xpRequired: 500 },
    { level: 3, name: 'Defense Matrix', focus: 'BB Defense vs All Positions', xpRequired: 1200 },
    { level: 4, name: '3-Bet Ignition', focus: '3-Bet Ranges (IP & OOP)', xpRequired: 2000 },
    { level: 5, name: 'Call Protocol', focus: 'Flatting Ranges', xpRequired: 3500 },
    { level: 6, name: '4-Bet Override', focus: '4-Bet/5-Bet Polarization', xpRequired: 5000 },
    { level: 7, name: 'Flop Architect', focus: 'C-Bet Frequencies', xpRequired: 7500 },
    { level: 8, name: 'Turn Calibration', focus: 'Turn Decisions', xpRequired: 10000 },
    { level: 9, name: 'River Execute', focus: 'Value/Bluff Ratios', xpRequired: 15000 },
    { level: 10, name: 'GTO MASTER', focus: 'All Spots + Mixed', xpRequired: 25000 },
];

export const MASTERY_THRESHOLD = 85; // 85% required to advance

export class ProgressionEngine {
    constructor(userId) {
        this.userId = userId;
        this.currentLevel = 1;
        this.currentXP = 0;
        this.scenarioHistory = [];
        this.consecutivePasses = 0;
    }

    recordScenario(scenarioId, score, levelIndex) {
        const passed = score >= MASTERY_THRESHOLD;

        this.scenarioHistory.push({
            scenarioId,
            score,
            levelIndex,
            passed,
            timestamp: Date.now()
        });

        if (passed) {
            this.consecutivePasses++;
            // Award XP based on score
            const baseXP = 50;
            const bonusXP = Math.floor((score - MASTERY_THRESHOLD) * 5);
            this.currentXP += baseXP + bonusXP;

            SoundEngine.play('correct');
        } else {
            this.consecutivePasses = 0;
            SoundEngine.play('wrong');
        }

        return { passed, consecutivePasses: this.consecutivePasses };
    }

    canAdvanceLevel() {
        // Need 5 consecutive passes at 85%+ to advance
        return this.consecutivePasses >= 5;
    }

    advanceLevel() {
        if (this.canAdvanceLevel() && this.currentLevel < LEVELS.length) {
            this.currentLevel++;
            this.consecutivePasses = 0;
            SoundEngine.play('levelUp');
            return LEVELS[this.currentLevel - 1];
        }
        return null;
    }

    getCurrentLevelInfo() {
        return LEVELS[this.currentLevel - 1];
    }

    getProgressToNext() {
        const current = LEVELS[this.currentLevel - 1];
        const next = LEVELS[this.currentLevel] || current;
        const xpInLevel = this.currentXP - current.xpRequired;
        const xpNeeded = next.xpRequired - current.xpRequired;
        return Math.min(xpInLevel / xpNeeded, 1);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 💎 DIAMOND GATE — À la carte access control
// ═══════════════════════════════════════════════════════════════════════════
export const GAME_COST = 10; // 10 diamonds per game

export class DiamondGate {
    constructor(getUserBalance, deductDiamonds, checkVIP) {
        this.getUserBalance = getUserBalance;
        this.deductDiamonds = deductDiamonds;
        this.checkVIP = checkVIP;
    }

    async canPlay() {
        // VIP users have unlimited access
        if (await this.checkVIP()) {
            return { allowed: true, reason: 'VIP' };
        }

        const balance = await this.getUserBalance();
        if (balance >= GAME_COST) {
            return { allowed: true, reason: 'diamonds', balance };
        }

        return {
            allowed: false,
            reason: 'insufficient_diamonds',
            balance,
            required: GAME_COST
        };
    }

    async chargeForGame() {
        const canPlay = await this.canPlay();
        if (!canPlay.allowed) {
            return { success: false, ...canPlay };
        }

        if (canPlay.reason === 'VIP') {
            return { success: true, charged: 0, reason: 'VIP' };
        }

        const result = await this.deductDiamonds(GAME_COST);
        return { success: true, charged: GAME_COST, ...result };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
export default {
    SoundEngine,
    EffectsEngine,
    TimerEngine,
    ComboEngine,
    ProgressionEngine,
    DiamondGate,
    LEVELS,
    MASTERY_THRESHOLD,
    GAME_COST,
};
