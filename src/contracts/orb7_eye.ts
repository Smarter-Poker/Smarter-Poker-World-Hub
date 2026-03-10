/**
 * ═══════════════════════════════════════════════════════════════════
 * ORB-7 (The Eye) — Strict Contracts
 * /src/contracts/orb7_eye.ts
 * 
 * Zod schemas for all ORB-7 domain payloads.
 * Used by anti-cheat API, leaderboard queries, and collusion detection.
 * Any payload that fails validation is rejected with 400 before touching DB.
 * ═══════════════════════════════════════════════════════════════════
 */
import { z } from 'zod';

// ─── Primitives ───────────────────────────────────────────────
const UUID = z.string().uuid('Must be a valid UUID');
const SafeString = z.string().max(500).regex(/^[^;'"\\-]+$/, 'Contains disallowed characters');
const SafeInt = z.number().int().min(0).max(10_000_000);
const SafeLimit = z.number().int().min(1).max(1000).default(50);
const SafeOffset = z.number().int().min(0).max(100_000).default(0);
const ChipAmount = z.number().min(-10_000_000).max(10_000_000).refine(
    (v) => Number.isFinite(v) && !Number.isNaN(v),
    { message: 'Chip amount must be a finite number' }
);

// ─── Anti-Cheat Actions Enum ──────────────────────────────────
export const AntiCheatAction = z.enum([
    'get_flags',
    'get_events',
    'get_sessions',
    'review_flag',
    'kick_player',
    'get_player_history',
    'get_stats',
    'get_collusion_pairs',
    'get_anomalies',
]);

// ─── Hand History Query ───────────────────────────────────────
export const HandHistoryQuerySchema = z.object({
    clubId: UUID,
    playerId: UUID.optional(),
    limit: SafeLimit,
    offset: SafeOffset,
    period: z.enum(['week', 'month', 'all']).default('all'),
    boardType: z.enum(['chips', 'profit', 'hands', 'wins', 'bounties']).default('chips'),
});
export type HandHistoryQuery = z.infer<typeof HandHistoryQuerySchema>;

// ─── Collusion Flag ───────────────────────────────────────────
export const CollusionFlagSchema = z.object({
    dumper_id: UUID,
    receiver_id: UUID,
    hands_together: SafeInt,
    chip_flow_ratio: z.number().min(0).max(1),
    net_chips_transferred: SafeInt,
    severity: z.enum(['low', 'medium', 'high', 'critical']),
});
export type CollusionFlag = z.infer<typeof CollusionFlagSchema>;

export const AnomalyFlagSchema = z.object({
    hand_id: UUID,
    hand_number: z.number().int().optional(),
    player_id: UUID,
    action: z.enum(['folded_strong_hand_on_river', 'suspicious_timing', 'chip_dump']),
    hand_rank: SafeString,
    pot_total: ChipAmount,
    completed_at: z.string().datetime().optional(),
    severity: z.enum(['high', 'critical']),
});
export type AnomalyFlag = z.infer<typeof AnomalyFlagSchema>;

// ─── Anti-Cheat Event (Outbound DB Payload) ───────────────────
export const AntiCheatEventSchema = z.object({
    event_type: SafeString,
    player_id: UUID,
    club_id: UUID,
    table_id: UUID.optional(),
    details: z.record(z.string(), z.any()).optional(),
    triggered_by: SafeString, // 'system' or UUID
});
export type AntiCheatEvent = z.infer<typeof AntiCheatEventSchema>;

// ─── Anti-Cheat Request Body ──────────────────────────────────
export const AntiCheatRequestSchema = z.object({
    action: AntiCheatAction,
    clubId: UUID,
    // Per-action optional params — validated at action level
    flagId: UUID.optional(),
    playerId: UUID.optional(),
    tableId: UUID.optional(),
    newStatus: z.enum(['reviewed', 'dismissed', 'actioned']).optional(),
    notes: SafeString.optional(),
    reason: SafeString.optional(),
    status: z.enum(['open', 'reviewed', 'dismissed', 'actioned', 'all']).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    flagType: SafeString.optional(),
    eventType: SafeString.optional(),
    threshold: z.number().min(0).max(1).default(0.75).optional(),
    minHands: z.number().int().min(1).max(1000).default(5).optional(),
    limit: SafeLimit.optional(),
    offset: SafeOffset.optional(),
}).strict(); // Reject unknown fields

// ─── SVG Sparkline Data Point ─────────────────────────────────
export const SparklineDataPointSchema = z.object({
    id: z.string(),
    type: z.enum(['win', 'loss']),
    amount: z.number().min(0).refine(v => Number.isFinite(v), 'Must be finite'),
});

// ─── Validation Helper ────────────────────────────────────────
/**
 * Validate a request body against the AntiCheatRequestSchema.
 * Returns { success, data, error } — use before any DB interaction.
 */
export function validateAntiCheatPayload(body: unknown) {
    const result = AntiCheatRequestSchema.safeParse(body);
    if (!result.success) {
        return {
            success: false as const,
            error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
            data: null,
        };
    }
    return { success: true as const, data: result.data, error: null };
}
