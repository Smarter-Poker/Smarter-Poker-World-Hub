/**
 * ═══════════════════════════════════════════════════════════════════
 * ORB-4 (The Syndicate) — Strict Contracts
 * /src/contracts/orb4_syndicate.ts
 *
 * Zod schemas for all ORB-4 domain payloads.
 * Used by union-wallet, settle-period, mint-chips, manage-union APIs.
 * Any payload that fails validation is rejected with 400 before touching DB.
 * ═══════════════════════════════════════════════════════════════════
 */
import { z } from 'zod';

// ─── Primitives ────────────────────────────────────────────────
const UUID = z.string().uuid('Must be a valid UUID');

/** Sanitized string — no SQL metacharacters, max 500 chars */
const SafeString = z.string().max(500).regex(
    /^[^;'"\\]+$/,
    'Contains disallowed characters (;, \', ", \\)'
);

/** Short name — alphanumeric, spaces, dashes, max 100 chars */
const SafeName = z.string().min(1).max(100).regex(
    /^[^;'"\\<>]+$/,
    'Contains disallowed characters'
);

/** Description — capped at 1000 chars */
const SafeDescription = z.string().max(1000).regex(
    /^[^;'"\\<>]*$/,
    'Contains disallowed characters'
).optional();

/** Notes — capped at 500 chars, optional, sanitized */
const SafeNotes = z.string().max(500).regex(
    /^[^;'"\\]*$/,
    'Contains disallowed characters'
).optional();

/**
 * Chip amount — must be:
 * - Finite (rejects Infinity, NaN)
 * - Positive (> 0)
 * - Max 1 billion (anti-overflow)
 * - Integer after floor (no fractional dust)
 */
const PositiveChipAmount = z.number()
    .refine(v => Number.isFinite(v) && !Number.isNaN(v), 'Must be a finite number')
    .refine(v => v > 0, 'Must be positive')
    .refine(v => v <= 1_000_000_000, 'Maximum 1 billion chips per operation')
    .transform(v => Math.floor(v));

/** Percentage as decimal — 0.01 to 1.0 */
const CommissionRate = z.number()
    .min(0.01, 'Minimum 1%')
    .max(1.0, 'Maximum 100%')
    .refine(v => Number.isFinite(v), 'Must be finite');

/** Percentage as integer — 0 to 100 */
const Percentage = z.number().int().min(0).max(100);

// ─── Union Wallet Actions ─────────────────────────────────────
export const UnionWalletAction = z.enum([
    'get_balances',
    'send_to_club',
    'move_rake_to_chips',
    'process_bbj_payout',
    'get_transactions',
]);

export const WalletType = z.enum([
    'chip_balance',
    'rake_wallet',
    'bbj_wallet',
    'promo_wallet',
]);

// ─── UnionSettlement Contract ─────────────────────────────────
export const UnionSettlementSchema = z.object({
    clubId: UUID,
    action: z.enum(['open', 'close', 'pay', 'pay_all', 'status']),
    periodId: UUID.optional(),
    commissionId: UUID.optional(),
}).strict();

export type UnionSettlement = z.infer<typeof UnionSettlementSchema>;

// ─── BBJ Payout Contract ──────────────────────────────────────
export const BBJPayoutSchema = z.object({
    action: z.literal('process_bbj_payout'),
    unionId: UUID,
    payoutAmount: PositiveChipAmount,
    winnerId: UUID,
    loserId: UUID,
    clubId: UUID,
    poolId: z.string().max(100).optional(),
    tableShare: z.number().min(0).max(1).optional(),
}).strict();

export type BBJPayout = z.infer<typeof BBJPayoutSchema>;

// ─── Wallet Transfer Contract ─────────────────────────────────
export const WalletTransferSchema = z.object({
    action: z.enum(['send_to_club', 'move_rake_to_chips']),
    unionId: UUID,
    clubId: UUID.optional(), // Required for send_to_club
    amount: PositiveChipAmount,
    notes: SafeNotes,
}).strict();

export type WalletTransfer = z.infer<typeof WalletTransferSchema>;

// ─── Union Wallet Get Contract ─────────────────────────────────
export const UnionWalletGetSchema = z.object({
    action: z.enum(['get_balances', 'get_transactions']),
    unionId: UUID,
    wallet: WalletType.optional(),
}).strict();

// ─── Overall Union Wallet Contract ────────────────────────────
export const UnionWalletSchema = z.discriminatedUnion('action', [
    UnionWalletGetSchema.extend({ action: z.literal('get_balances') }),
    UnionWalletGetSchema.extend({ action: z.literal('get_transactions') }),
    WalletTransferSchema.extend({ action: z.literal('send_to_club') }),
    WalletTransferSchema.extend({ action: z.literal('move_rake_to_chips') }),
    BBJPayoutSchema,
]);

// ─── Mint Chips Contract ──────────────────────────────────────
export const MintChipsSchema = z.object({
    clubId: UUID,
    amount: PositiveChipAmount,
    notes: SafeNotes,
}).strict();

export type MintChips = z.infer<typeof MintChipsSchema>;

// ─── Manage Union Contract ────────────────────────────────────
export const ManageUnionAction = z.enum([
    'create',
    'update_settings',
    'add_club',
    'remove_club',
    'add_admin',
    'remove_admin',
    'search_user',
    'update_club_commission',
    'union_announcement',
    'list_leave',
    'approve_leave',
    'deny_leave',
]);

export const UnionSettingsSchema = z.object({
    union_rake_hold: z.number().min(0).max(0.50).optional(),
    default_agent_commission: z.number().min(0).max(1.0).optional(),
    default_club_commission_rate: z.number().min(0.01).max(1.0).optional(),
    bbj_main_pct: Percentage.optional(),
    bbj_backup_pct: Percentage.optional(),
    bbj_promo_pct: Percentage.optional(),
}).passthrough(); // Allow other settings fields

export const ManageUnionSchema = z.object({
    action: ManageUnionAction,
    unionId: UUID.optional(), // Not required for 'create'
    name: SafeName.optional(),
    description: SafeDescription,
    settings: UnionSettingsSchema.optional(),
    clubId: z.string().max(100).optional(),
    adminUserId: UUID.optional(),
    adminRole: z.enum(['union_admin']).optional(),
    leaveRequestId: UUID.optional(),
    clubCommissionRate: CommissionRate.optional(),
    commissionRate: CommissionRate.optional(),
    // search_user
    query: z.string().min(2).max(50).optional(),
    // union_announcement
    message: z.string().max(500).optional(),
});

export type ManageUnion = z.infer<typeof ManageUnionSchema>;

// ─── Validation Helpers ───────────────────────────────────────

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

export function validateBBJPayout(body: unknown) {
    return validatePayload(BBJPayoutSchema, body);
}

export function validateSettlement(body: unknown) {
    return validatePayload(UnionSettlementSchema, body);
}

export function validateMintChips(body: unknown) {
    return validatePayload(MintChipsSchema, body);
}

export function validateWalletTransfer(body: unknown) {
    return validatePayload(WalletTransferSchema, body);
}

export function validateUnionWallet(body: unknown) {
    return validatePayload(UnionWalletSchema, body);
}

export function validateManageUnion(body: unknown) {
    return validatePayload(ManageUnionSchema, body);
}
