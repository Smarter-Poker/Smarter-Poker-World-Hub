/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MASTERY GATE — 85% Accuracy Gatekeeper for Level Progression
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * HARD LAW: Players CANNOT progress without demonstrating mastery.
 *   - 85% accuracy threshold (90% for Boss Mode Level 12)
 *   - 20 question minimum before evaluation
 *   - Cryptographically signed mastery tokens (HMAC-SHA256)
 *   - Level 1 is always accessible
 *
 * Migrated from: AI-Content-GTO-Engine/src/orbs/Training/MasteryGate.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';
import { MASTERY_THRESHOLD, BOSS_MODE_THRESHOLD, MIN_QUESTIONS_REQUIRED } from '../config/LevelRegistry';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Token validity period (24 hours) */
const TOKEN_VALIDITY_MS = 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type GateStatus =
    | 'GRANTED'
    | 'DENIED_LOW_ACCURACY'
    | 'DENIED_INSUFFICIENT_QUESTIONS'
    | 'DENIED_TOKEN_EXPIRED'
    | 'DENIED_INVALID_TOKEN'
    | 'DENIED_LEVEL_LOCKED'
    | 'DENIED_BOSS_MODE_THRESHOLD';

export interface MasteryCheckResult {
    achieved: boolean;
    status: GateStatus;
    accuracy: number;
    accuracyPercent: string;
    questionsAnswered: number;
    questionsRequired: number;
    message: string;
    masteryToken?: string;
    nextLevelUnlocked?: number;
}

export interface LevelAccessResult {
    allowed: boolean;
    level: number;
    status: GateStatus;
    message: string;
    requirement?: {
        levelToComplete: number;
        accuracyRequired: number;
        minQuestions: number;
    };
}

export interface MasteryTokenPayload {
    version: string;
    userId: string;
    levelCompleted: number;
    nextLevelUnlocked: number;
    accuracy: number;
    issuedAt: number;
    expiresAt: number;
    isBossMode: boolean;
}

interface UserMasteryState {
    achieved: boolean;
    accuracy: number;
    achievedAt: string;
    token: string;
    levelId: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTERY GATE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class MasteryGate {
    private readonly secretKey: string;
    private readonly tokenCache: Map<string, { payload: MasteryTokenPayload; expiresAt: number }>;
    private readonly userMasteryState: Map<string, UserMasteryState>;

    constructor(options: { secretKey?: string } = {}) {
        this.secretKey = options.secretKey || process.env.MASTERY_SEAL_SECRET || 'gto-mastery-gate-sovereign-2026';
        this.tokenCache = new Map();
        this.userMasteryState = new Map();

        // Periodic cleanup of expired tokens to prevent memory leaks
        if (typeof setInterval !== 'undefined') {
            const interval = setInterval(() => this.pruneExpiredTokens(), 60 * 60 * 1000); // hourly
            if (interval.unref) interval.unref();
        }
    }

    /** Remove expired tokens from cache */
    private pruneExpiredTokens(): void {
        const now = Date.now();
        for (const [token, entry] of this.tokenCache) {
            if (now > entry.expiresAt) this.tokenCache.delete(token);
        }
    }

    /**
     * Check if user has achieved mastery for a level.
     * HARD LAW: 85% accuracy required (90% for Boss Mode).
     */
    checkMastery(
        userId: string,
        levelId: number,
        correctAnswers: number,
        totalAnswers: number,
    ): MasteryCheckResult {
        const accuracy = totalAnswers > 0 ? correctAnswers / totalAnswers : 0;
        const isBossMode = levelId === 12;
        const threshold = isBossMode ? BOSS_MODE_THRESHOLD : MASTERY_THRESHOLD;

        // Check minimum questions
        if (totalAnswers < MIN_QUESTIONS_REQUIRED) {
            const remaining = MIN_QUESTIONS_REQUIRED - totalAnswers;
            return {
                achieved: false,
                status: 'DENIED_INSUFFICIENT_QUESTIONS',
                accuracy,
                accuracyPercent: `${(accuracy * 100).toFixed(1)}%`,
                questionsAnswered: totalAnswers,
                questionsRequired: MIN_QUESTIONS_REQUIRED,
                message: `Complete ${remaining} more question${remaining !== 1 ? 's' : ''} to unlock mastery evaluation`,
            };
        }

        // Check accuracy threshold
        if (accuracy < threshold) {
            const gap = ((threshold - accuracy) * 100).toFixed(1);
            return {
                achieved: false,
                status: isBossMode ? 'DENIED_BOSS_MODE_THRESHOLD' : 'DENIED_LOW_ACCURACY',
                accuracy,
                accuracyPercent: `${(accuracy * 100).toFixed(1)}%`,
                questionsAnswered: totalAnswers,
                questionsRequired: MIN_QUESTIONS_REQUIRED,
                message: `Need ${gap}% more accuracy to unlock Level ${levelId + 1}${isBossMode ? ' (Boss Mode requires 90%)' : ''}`,
            };
        }

        // MASTERY ACHIEVED — Generate signed token
        const token = this.generateMasteryToken(userId, levelId, accuracy, isBossMode);

        const stateKey = `${userId}:${levelId}`;
        this.userMasteryState.set(stateKey, {
            achieved: true,
            accuracy,
            achievedAt: new Date().toISOString(),
            token,
            levelId,
        });

        return {
            achieved: true,
            status: 'GRANTED',
            accuracy,
            accuracyPercent: `${(accuracy * 100).toFixed(1)}%`,
            questionsAnswered: totalAnswers,
            questionsRequired: MIN_QUESTIONS_REQUIRED,
            masteryToken: token,
            nextLevelUnlocked: levelId + 1,
            message: `MASTERY ACHIEVED! Level ${levelId + 1} is now unlocked!`,
        };
    }

    /**
     * Check if user can access a specific level.
     * Level 1 is ALWAYS accessible.
     */
    canAccessLevel(userId: string, targetLevel: number, masteryToken?: string): LevelAccessResult {
        if (targetLevel <= 1) {
            return { allowed: true, level: targetLevel, status: 'GRANTED', message: 'Level 1 is always accessible' };
        }

        const previousLevel = targetLevel - 1;
        const isBossMode = targetLevel === 12;

        // Check cached mastery state
        const stateKey = `${userId}:${previousLevel}`;
        const masteryState = this.userMasteryState.get(stateKey);
        if (masteryState?.achieved) {
            const validation = this.validateToken(masteryState.token);
            if (validation.valid) {
                return { allowed: true, level: targetLevel, status: 'GRANTED', message: `Access granted to Level ${targetLevel}` };
            }
        }

        // Check provided token
        if (masteryToken) {
            const validation = this.validateToken(masteryToken);
            if (validation.valid && validation.payload && validation.payload.nextLevelUnlocked >= targetLevel) {
                return { allowed: true, level: targetLevel, status: 'GRANTED', message: `Token verified - Access granted to Level ${targetLevel}` };
            }
            return { allowed: false, level: targetLevel, status: validation.status, message: `Token validation failed: ${validation.status}` };
        }

        const threshold = isBossMode ? BOSS_MODE_THRESHOLD : MASTERY_THRESHOLD;
        return {
            allowed: false,
            level: targetLevel,
            status: 'DENIED_LEVEL_LOCKED',
            message: `Level ${targetLevel} is LOCKED. Complete Level ${previousLevel} with ${threshold * 100}%+ accuracy.`,
            requirement: { levelToComplete: previousLevel, accuracyRequired: threshold * 100, minQuestions: MIN_QUESTIONS_REQUIRED },
        };
    }

    /**
     * Get all unlocked levels for a user.
     */
    getUnlockedLevels(userId: string): number[] {
        const unlocked = [1];
        for (let level = 1; level <= 12; level++) {
            const state = this.userMasteryState.get(`${userId}:${level}`);
            if (state?.achieved) unlocked.push(level + 1);
        }
        return [...new Set(unlocked)].sort((a, b) => a - b);
    }

    // ─── Token generation & validation ──────────────────────────────────

    private generateMasteryToken(userId: string, levelId: number, accuracy: number, isBossMode: boolean): string {
        const timestamp = Date.now();
        const payload: MasteryTokenPayload = {
            version: 'v2',
            userId,
            levelCompleted: levelId,
            nextLevelUnlocked: levelId + 1,
            accuracy: Math.floor(accuracy * 10000),
            issuedAt: timestamp,
            expiresAt: timestamp + TOKEN_VALIDITY_MS,
            isBossMode,
        };

        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signature = this.signPayload(payloadBase64);
        const token = `${payloadBase64}.${signature}`;

        this.tokenCache.set(token, { payload, expiresAt: payload.expiresAt });
        return token;
    }

    private signPayload(payload: string): string {
        return crypto.createHmac('sha256', this.secretKey).update(payload).digest('base64url');
    }

    validateToken(token: string): { valid: boolean; status: GateStatus; payload?: MasteryTokenPayload } {
        try {
            const [payloadBase64, signature] = token.split('.');
            if (!payloadBase64 || !signature) return { valid: false, status: 'DENIED_INVALID_TOKEN' };

            if (signature !== this.signPayload(payloadBase64)) return { valid: false, status: 'DENIED_INVALID_TOKEN' };

            const payload: MasteryTokenPayload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
            if (Date.now() > payload.expiresAt) return { valid: false, status: 'DENIED_TOKEN_EXPIRED' };

            return { valid: true, status: 'GRANTED', payload };
        } catch {
            return { valid: false, status: 'DENIED_INVALID_TOKEN' };
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let _instance: MasteryGate | null = null;

export function getMasteryGate(options?: { secretKey?: string }): MasteryGate {
    if (!_instance) _instance = new MasteryGate(options);
    return _instance;
}

export default MasteryGate;
