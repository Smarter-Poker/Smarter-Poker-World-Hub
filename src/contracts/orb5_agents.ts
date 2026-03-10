/**
 * ═══════════════════════════════════════════════════════════════════
 * ORB-5 (The Upline) — Strict Contracts
 * /src/contracts/orb5_agents.ts
 *
 * Zod schemas for all ORB-5 domain payloads.
 * Used by agent-credit, clawback-chips, distribute-chips,
 * manage-agent, rakeback, and the agent commission system.
 *
 * Any payload that fails validation is rejected with 400 before
 * touching the database.
 * ═══════════════════════════════════════════════════════════════════
 */
import { z } from 'zod';

// ─── Primitives ────────────────────────────────────────────────
const UUID = z.string().uuid('Must be a valid UUID');

/** Sanitized notes — no SQL metacharacters, max 500 chars */
const SafeNotes = z.string().max(500).regex(
    /^[^;'"\\]*$/,
    'Contains disallowed characters'
).optional();

/**
 * Chip amount — must be:
 * - Finite (rejects Infinity, NaN)
 * - Positive (> 0)
 * - Max 100M (per-request cap)
 * - Integer after floor (no fractional dust)
 */
const PositiveChipAmount = z.number()
    .refine(v => Number.isFinite(v) && !Number.isNaN(v), 'Must be a finite number')
    .refine(v => v > 0, 'Must be positive')
    .refine(v => v <= 100_000_000, 'Maximum 100M chips per operation')
    .transform(v => Math.floor(v));


// ═══════════════════════════════════════════════════════════════
// AGENT MANAGEMENT CONTRACTS
// ═══════════════════════════════════════════════════════════════

// ─── Distribute Chips ─────────────────────────────────────────
export const DistributeChipsSchema = z.object({
    clubId: UUID,
    toUserId: UUID,
    amount: PositiveChipAmount,
    notes: SafeNotes,
    type: z.enum(['treasury', 'agent']).optional(),
}).strict();

export type DistributeChips = z.infer<typeof DistributeChipsSchema>;

// ─── Agent Credit ─────────────────────────────────────────────
export const AgentCreditAction = z.enum([
    'issue_credit',
    'add_prepaid',
    'revoke_credit',
]);

export const AgentCreditSchema = z.object({
    clubId: UUID,
    agentUserId: UUID,
    action: AgentCreditAction,
    amount: PositiveChipAmount,
    notes: SafeNotes,
}).strict();

export type AgentCredit = z.infer<typeof AgentCreditSchema>;

// ─── Clawback Chips ───────────────────────────────────────────
export const ClawbackChipsSchema = z.object({
    transactionId: UUID,
    clubId: UUID,
    amount: PositiveChipAmount.optional(), // Defaults to full original amount
}).strict();

export type ClawbackChips = z.infer<typeof ClawbackChipsSchema>;

// ─── Transfer Chips ───────────────────────────────────────────
export const TransferChipsSchema = z.object({
    clubId: UUID,
    toUserId: UUID,
    amount: PositiveChipAmount,
    note: SafeNotes,
}).strict();

export type TransferChips = z.infer<typeof TransferChipsSchema>;

// ─── Buy-in ───────────────────────────────────────────────────
export const BuyinSchema = z.object({
    clubId: UUID,
    chipAmount: PositiveChipAmount,
}).strict();

export type Buyin = z.infer<typeof BuyinSchema>;

// ─── Request Cashout ──────────────────────────────────────────
export const RequestCashoutSchema = z.object({
    clubId: UUID,
    amount: PositiveChipAmount,
    note: SafeNotes,
}).strict();

export type RequestCashout = z.infer<typeof RequestCashoutSchema>;

// ─── Table Chips ──────────────────────────────────────────────
export const TableChipsAction = z.enum(['lock', 'unlock', 'rebuy']);

export const TableChipsSchema = z.object({
    clubId: UUID,
    tableId: UUID.optional(),
    userId: UUID,
    action: TableChipsAction,
    amount: PositiveChipAmount,
}).strict();

export type TableChips = z.infer<typeof TableChipsSchema>;


// ═══════════════════════════════════════════════════════════════
// RAKEBACK TREE (Commission Hierarchy)
// ═══════════════════════════════════════════════════════════════

export const RakebackNodeSchema = z.object({
    /** Agent user ID */
    agentId: UUID,
    /** Direct parent agent (null for root/owner) */
    parentAgentId: UUID.nullable(),
    /** Commission rate as decimal (e.g., 0.30 = 30%) */
    commissionRate: z.number().min(0).max(1.0),
    /** Role in the hierarchy */
    role: z.enum(['super_agent', 'agent', 'sub_agent']),
    /** Number of downline players */
    playerCount: z.number().int().min(0),
    /** Total rake collected through this agent's tree */
    totalRake: z.number().min(0),
});

export type RakebackNode = z.infer<typeof RakebackNodeSchema>;

export const RakebackTreeSchema = z.object({
    clubId: UUID,
    /** Root of the tree (owner/union) */
    root: RakebackNodeSchema,
    /** All nodes in the tree */
    nodes: z.array(RakebackNodeSchema),
    /** Total tree depth (max 5 levels enforced) */
    depth: z.number().int().min(1).max(5),
});

export type RakebackTree = z.infer<typeof RakebackTreeSchema>;


// ═══════════════════════════════════════════════════════════════
// CLAWBACK AUDIT RECORD (ORB-5 Mandate — Immutable)
// ═══════════════════════════════════════════════════════════════

export const ClawbackAuditSchema = z.object({
    /** Action type — always 'clawback' */
    action_type: z.literal('clawback'),
    /** Agent who performed the clawback (from JWT) */
    user_id: UUID,
    /** Player who was clawed back */
    target_user_id: UUID,
    /** Club context */
    club_id: UUID,
    /** Exact chip amount clawed back (after Math.floor) */
    amount: z.number().int().min(1).max(100_000_000),
    /** IP address of the caller */
    ip_address: z.string().max(100),
    /** Detailed context */
    details: z.object({
        original_transaction_id: UUID,
        original_amount: z.number().int().min(0),
        clawback_amount: z.number().int().min(1),
        player_new_balance: z.number().int().min(0),
        agent_new_balance: z.number().int().min(0),
        window_remaining_seconds: z.number().min(0),
    }),
});

export type ClawbackAudit = z.infer<typeof ClawbackAuditSchema>;


// ═══════════════════════════════════════════════════════════════
// MANAGE AGENT (MLM Loop Prevention)
// ═══════════════════════════════════════════════════════════════

export const ManageAgentAction = z.enum([
    'promote',
    'demote',
    'update',
    'reassign',
    'suspend',
    'reactivate',
    'change_role',
    'remove',
    'set_parent_agent',
    'list_sub_agents',
    'set_player_rakeback',
    'update_commission',
    'promote_to_sub_agent',
]);

export const ManageAgentSchema = z.object({
    clubId: UUID,
    action: ManageAgentAction,
    targetUserId: UUID.optional(), // Required for most
    playerId: UUID.optional(), // Used in reassign
    parentAgentUserId: UUID.optional(), // Used in list_sub_agents

    commissionRate: z.number().min(0.01).max(0.90).optional(),
    agentTier: z.enum(['super_agent', 'agent', 'sub_agent']).optional(),
    isPrepaid: z.boolean().optional(),
    creditLimit: z.number().int().min(0).optional(),
    parentAgentId: UUID.nullable().optional(),
    rakebackPercentage: z.number().min(0).max(1.0).optional(),

    reassignTo: UUID.nullable().optional(), // Used in demote

    tier: z.enum(['super_agent', 'agent', 'sub_agent']).optional(), // Used in update
    nickname: z.string().max(100).optional(), // Used in update

    fromAgentId: UUID.nullable().optional(), // Used in reassign
    toAgentId: UUID.nullable().optional(), // Used in reassign

    newRole: z.enum(['admin', 'agent', 'player']).optional(), // Used in change_role

    forceReturn: z.boolean().optional(), // Used in remove
}).strict();

export type ManageAgent = z.infer<typeof ManageAgentSchema>;


// ═══════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════

/** Generic validator — returns { success, data, error } */
export function validatePayload<T>(schema: z.ZodSchema<T>, body: unknown) {
    const result = schema.safeParse(body);
    if (!result.success) {
        return {
            success: false as const,
            error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
            data: null,
        };
    }
    return { success: true as const, data: result.data, error: null };
}

export function validateDistributeChips(body: unknown) { return validatePayload(DistributeChipsSchema, body); }
export function validateAgentCredit(body: unknown) { return validatePayload(AgentCreditSchema, body); }
export function validateClawbackChips(body: unknown) { return validatePayload(ClawbackChipsSchema, body); }
export function validateTransferChips(body: unknown) { return validatePayload(TransferChipsSchema, body); }
export function validateBuyin(body: unknown) { return validatePayload(BuyinSchema, body); }
export function validateRequestCashout(body: unknown) { return validatePayload(RequestCashoutSchema, body); }
export function validateTableChips(body: unknown) { return validatePayload(TableChipsSchema, body); }
export function validateManageAgent(body: unknown) { return validatePayload(ManageAgentSchema, body); }
