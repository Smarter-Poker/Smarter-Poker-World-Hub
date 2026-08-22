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
const UUID = z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Must be a valid UUID'
);

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
    'fund_spin_reserve',
    'get_transactions',
]);

// Every wallet a union_wallet_transactions row may name. This list must stay
// in step with the CHECK constraint on union_wallet_transactions.wallet - it is
// what `get_transactions?wallet=` filters on, and a real wallet missing from
// here answers 400 for a filter that is perfectly valid in the database.
// insurance_wallet and spin_reserve_wallet were both in that CHECK and both
// absent from here.
export const WalletType = z.enum([
    'chip_balance',
    'rake_wallet',
    'bbj_wallet',
    'promo_wallet',
    'insurance_wallet',
    'spin_reserve_wallet',
]);

// ─── UnionSettlement Contract ─────────────────────────────────
export const UnionSettlementSchema = z.object({
    clubId: UUID,
    action: z.enum(['open', 'close', 'pay', 'pay_all', 'status', 'history', 'dispute', 'list_disputes', 'resolve_dispute']),
    periodId: UUID.optional(),
    commissionId: UUID.optional(),
    reason: z.string().max(500).optional(),
    invoiceId: UUID.optional(),
    resolution: z.enum(['approve', 'reject']).optional(),
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
    // BBJ UNIFICATION 2026-07-21: client-generated UUID per payout event —
    // unique-indexed in union_wallet_transactions so a retry can never pay
    // the same jackpot twice.
    payoutEventId: UUID.optional(),
    tableShare: z.number().min(0).max(1).optional(),
}).strict();

export type BBJPayout = z.infer<typeof BBJPayoutSchema>;

// ─── Fund BBJ Pool Contract (BBJ unification 2026-07-21) ──────
export const FundBBJPoolSchema = z.object({
    action: z.literal('fund_bbj_pool'),
    unionId: UUID,
    amount: PositiveChipAmount,
    notes: SafeNotes,
}).strict();

export type FundBBJPool = z.infer<typeof FundBBJPoolSchema>;

// ─── Fund Spin Reserve Contract (union reserve wallet, 2026-08-22) ──
//
// The source wallet is REQUIRED and is one of three. fn_spin_reserve_wallet_fund
// treats a null source as an operator deposit and mints the chips; that is a
// platform operation over SQL, not something a union lead reaches over HTTP.
// fn_spin_reserve_wallet_fund_op refuses a null source for the same reason, so
// this schema and the database agree rather than one trusting the other.
export const FundSpinReserveSchema = z.object({
    action: z.literal('fund_spin_reserve'),
    unionId: UUID,
    amount: PositiveChipAmount,
    fromWallet: z.enum(['promo_wallet', 'rake_wallet', 'chip_balance']),
    notes: SafeNotes,
}).strict();

export type FundSpinReserve = z.infer<typeof FundSpinReserveSchema>;

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
    FundBBJPoolSchema,
    FundSpinReserveSchema,
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
    // IMPROVE 2026-07-21: club owners submit leave requests (the approve/deny
    // side existed but nothing could ever create one).
    'request_leave',
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

// ─── Union Games Contracts ────────────────────────────────────

export const UnionGamesCreateTournamentSchema = z.object({
    action: z.literal('create_tournament'),
    unionId: UUID,
    hostClubId: UUID.optional(),
    clubId: UUID.optional(),
    name: SafeName,
    buyIn: z.coerce.number().int().min(0).max(1_000_000).optional(),
    buy_in: z.coerce.number().int().min(0).max(1_000_000).optional(),
    startingChips: z.coerce.number().int().min(100).max(10_000_000).optional(),
    starting_chips: z.coerce.number().int().min(100).max(10_000_000).optional(),
    maxPlayers: z.coerce.number().int().min(2).max(5000).optional(),
    max_players: z.coerce.number().int().min(2).max(5000).optional(),
    lateRegLevels: z.coerce.number().int().min(0).max(50).optional(),
    late_reg_levels: z.coerce.number().int().min(0).max(50).optional(),
    rebuyEnabled: z.boolean().optional(),
    rebuy_allowed: z.boolean().optional(),
    addonEnabled: z.boolean().optional(),
    addon_allowed: z.boolean().optional(),
    guaranteedPrize: z.coerce.number().int().min(0).max(100_000_000).optional(),
    guaranteed_prize: z.coerce.number().int().min(0).max(100_000_000).optional(),
    scheduledStart: z.string().optional(),
    start_time: z.string().optional(),
    type: z.string().max(20).optional(),
    variant: z.string().max(20).optional(),
    game_type: z.string().max(20).optional(),
    blind_levels: z.coerce.number().int().optional(),
    blind_duration: z.coerce.number().int().optional(),
    participatingClubIds: z.array(UUID).max(100).optional(),
});

export const UnionGamesCreateTableSchema = z.object({
    action: z.literal('create_table'),
    unionId: UUID,
    clubId: UUID,
    name: SafeName.optional(),
    tableName: SafeName.optional(),
    smallBlind: z.coerce.number().min(0.01).max(100_000).optional(),
    bigBlind: z.coerce.number().min(0.02).max(200_000).optional(),
    maxPlayers: z.coerce.number().int().min(2).max(10).optional(),
    max_seats: z.coerce.number().int().min(2).max(10).optional(),
    ante: z.coerce.number().min(0).optional(),
    stakes: z.string().max(20).optional(),
    gameVariant: z.string().max(20).optional(),
    game_type: z.string().max(20).optional(),
    minBuyIn: z.coerce.number().int().min(0).optional(),
    min_buyin: z.coerce.number().int().min(0).optional(),
    maxBuyIn: z.coerce.number().int().min(0).optional(),
    max_buyin: z.coerce.number().int().min(0).optional(),
    actionTime: z.coerce.number().int().min(5).max(300).optional(),
    rakePercent: z.coerce.number().min(0).max(100).optional(),
    rakeCap: z.coerce.number().min(0).max(1000).optional(),
});

export const UnionGamesTournamentActionSchema = z.object({
    action: z.enum(['start_tournament', 'cancel_tournament', 'open_registration', 'pause_tournament', 'resume_tournament', 'get_tournament_details']),
    unionId: UUID,
    tournamentId: UUID,
});

export const UnionGamesTableActionSchema = z.object({
    action: z.literal('close_table'),
    unionId: UUID,
    tableId: UUID,
});

export const UnionGamesListSchema = z.object({
    action: z.enum(['list_tournaments', 'list_tables', 'get_bbj_status']),
    unionId: UUID,
    status: z.array(z.string().max(30)).optional(),
    statusFilter: z.string().max(30).optional(),
});

export function validateUnionGames(body: unknown) {
    if (!body || typeof body !== 'object' || !('action' in body)) {
        return { success: false as const, error: 'action is required', data: null };
    }
    const action = (body as any).action;
    switch (action) {
        case 'create_tournament':
            return validatePayload(UnionGamesCreateTournamentSchema, body);
        case 'create_table':
            return validatePayload(UnionGamesCreateTableSchema, body);
        case 'start_tournament': case 'cancel_tournament': case 'open_registration':
        case 'pause_tournament': case 'resume_tournament': case 'get_tournament_details':
            return validatePayload(UnionGamesTournamentActionSchema, body);
        case 'close_table':
            return validatePayload(UnionGamesTableActionSchema, body);
        case 'list_tournaments': case 'list_tables': case 'get_bbj_status':
            return validatePayload(UnionGamesListSchema, body);
        default:
            return { success: false as const, error: `Unknown action: ${action}`, data: null };
    }
}

// ─── Manage Agent Contracts ───────────────────────────────────

export const ManageAgentAction = z.enum([
    'promote', 'demote', 'update', 'reassign', 'suspend', 'reactivate',
    'change_role', 'remove', 'set_parent_agent', 'list_sub_agents',
    'set_player_rakeback', 'update_commission', 'promote_to_sub_agent',
    'transfer_to_agent', 'transfer_ownership', 'batch_suspend', 'batch_reactivate',
]);

/** Agent tier / role within the club hierarchy */
const AgentTier = z.enum(['super_agent', 'agent', 'sub_agent']);

/** Rakeback percentage — 0 to 1.0 (0 = disabled) */
const RakebackRate = z.number().min(0).max(1.0).refine(v => Number.isFinite(v), 'Must be finite');

const ManageAgentBase = z.object({
    clubId: UUID,
    action: ManageAgentAction,
    targetUserId: UUID.optional(),
});

export const ManageAgentPromoteSchema = ManageAgentBase.extend({
    action: z.literal('promote'),
    targetUserId: UUID,
    commissionRate: CommissionRate,
    agentTier: AgentTier.optional().default('agent'),
    isPrepaid: z.boolean().optional().default(false),
    creditLimit: z.number().int().min(0).max(100_000_000).optional().default(0),
    parentAgentId: UUID.nullable().optional(),
    rakebackPercentage: RakebackRate.optional().default(0),
});

export const ManageAgentDemoteSchema = ManageAgentBase.extend({
    action: z.literal('demote'),
    targetUserId: UUID,
    reassignTo: UUID.optional(),
});

export const ManageAgentUpdateSchema = ManageAgentBase.extend({
    action: z.literal('update'),
    targetUserId: UUID,
    commissionRate: CommissionRate.optional(),
    agentTier: AgentTier.optional(),
    isPrepaid: z.boolean().optional(),
    creditLimit: z.number().int().min(0).max(100_000_000).optional(),
    rakebackPercentage: RakebackRate.optional(),
    tier: z.string().max(30).optional(),
    nickname: z.string().max(100).optional(),
});

export const ManageAgentReassignSchema = ManageAgentBase.extend({
    action: z.literal('reassign'),
    playerId: UUID,
    fromAgentId: UUID.optional(),
    toAgentId: UUID,
});

export const ManageAgentStatusSchema = ManageAgentBase.extend({
    action: z.enum(['suspend', 'reactivate']),
    targetUserId: UUID,
});

export const ManageAgentChangeRoleSchema = ManageAgentBase.extend({
    action: z.literal('change_role'),
    targetUserId: UUID,
    newRole: z.string().min(1).max(30),
});

export const ManageAgentRemoveSchema = ManageAgentBase.extend({
    action: z.literal('remove'),
    targetUserId: UUID,
    forceReturn: z.boolean().optional(),
});

export const ManageAgentSetParentSchema = ManageAgentBase.extend({
    action: z.literal('set_parent_agent'),
    targetUserId: UUID,
    parentAgentId: UUID.nullable(),
});

export const ManageAgentListSubSchema = ManageAgentBase.extend({
    action: z.literal('list_sub_agents'),
    parentAgentUserId: UUID,
});

export const ManageAgentRakebackSchema = ManageAgentBase.extend({
    action: z.literal('set_player_rakeback'),
    targetUserId: UUID,
    rakebackPercentage: RakebackRate,
});

export const ManageAgentUpdateCommSchema = ManageAgentBase.extend({
    action: z.literal('update_commission'),
    targetUserId: UUID,
    commissionRate: CommissionRate,
});

export const ManageAgentPromoteSubSchema = ManageAgentBase.extend({
    action: z.literal('promote_to_sub_agent'),
    targetUserId: UUID,
    commissionRate: CommissionRate,
});

export const ManageAgentTransferSchema = ManageAgentBase.extend({
    action: z.literal('transfer_to_agent'),
    targetUserId: UUID,
    amount: PositiveChipAmount,
    notes: SafeNotes,
});

export const ManageAgentTransferOwnershipSchema = ManageAgentBase.extend({
    action: z.literal('transfer_ownership'),
    targetUserId: UUID,
});

export const ManageAgentBatchSchema = ManageAgentBase.extend({
    action: z.enum(['batch_suspend', 'batch_reactivate']),
    targetUserIds: z.array(UUID).min(1).max(50),
});

export function validateManageAgent(body: unknown) {
    if (!body || typeof body !== 'object' || !('action' in body)) {
        return { success: false as const, error: 'action is required', data: null };
    }
    const action = (body as any).action;
    switch (action) {
        case 'promote': return validatePayload(ManageAgentPromoteSchema, body);
        case 'demote': return validatePayload(ManageAgentDemoteSchema, body);
        case 'update': return validatePayload(ManageAgentUpdateSchema, body);
        case 'reassign': return validatePayload(ManageAgentReassignSchema, body);
        case 'suspend': case 'reactivate':
            return validatePayload(ManageAgentStatusSchema, body);
        case 'change_role': return validatePayload(ManageAgentChangeRoleSchema, body);
        case 'remove': return validatePayload(ManageAgentRemoveSchema, body);
        case 'set_parent_agent': return validatePayload(ManageAgentSetParentSchema, body);
        case 'list_sub_agents': return validatePayload(ManageAgentListSubSchema, body);
        case 'set_player_rakeback': return validatePayload(ManageAgentRakebackSchema, body);
        case 'update_commission': return validatePayload(ManageAgentUpdateCommSchema, body);
        case 'promote_to_sub_agent': return validatePayload(ManageAgentPromoteSubSchema, body);
        case 'transfer_to_agent': return validatePayload(ManageAgentTransferSchema, body);
        case 'transfer_ownership': return validatePayload(ManageAgentTransferOwnershipSchema, body);
        case 'batch_suspend': case 'batch_reactivate':
            return validatePayload(ManageAgentBatchSchema, body);
        default:
            return { success: false as const, error: `Unknown action: ${action}`, data: null };
    }
}

// ─── Union Application Contracts ──────────────────────────────

export const UnionApplicationApplySchema = z.object({
    action: z.literal('apply'),
    clubId: UUID,
    message: z.string().max(500).optional(),
});

export const UnionApplicationStatusSchema = z.object({
    action: z.literal('status'),
    clubId: UUID,
});

export const UnionApplicationListSchema = z.object({
    action: z.literal('list'),
    unionId: UUID.optional(),
    statusFilter: z.enum(['pending', 'approved', 'rejected', 'all']).optional(),
});

export const UnionApplicationReviewSchema = z.object({
    action: z.enum(['approve', 'reject']),
    applicationId: UUID,
    reason: z.string().max(500).optional(),
    commissionRate: CommissionRate.optional(),
});

export function validateUnionApplication(body: unknown) {
    if (!body || typeof body !== 'object' || !('action' in body)) {
        return { success: false as const, error: 'action is required', data: null };
    }
    const action = (body as any).action;
    switch (action) {
        case 'apply': return validatePayload(UnionApplicationApplySchema, body);
        case 'status': return validatePayload(UnionApplicationStatusSchema, body);
        case 'list': return validatePayload(UnionApplicationListSchema, body);
        case 'approve': case 'reject':
            return validatePayload(UnionApplicationReviewSchema, body);
        default:
            return { success: false as const, error: `Unknown action: ${action}`, data: null };
    }
}
