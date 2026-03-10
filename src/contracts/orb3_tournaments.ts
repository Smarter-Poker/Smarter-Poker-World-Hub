import { z } from 'zod';

export const BlindLevelSchema = z.object({
    level: z.number().int().min(0), // 0 indicates break
    smallBlind: z.number().int().min(0),
    bigBlind: z.number().int().min(0),
    ante: z.number().int().min(0).default(0),
    duration: z.number().int().min(1), // minutes
    isBreak: z.boolean().optional().default(false),
});

export const TournamentSettingsSchema = z.object({
    sngSize: z.number().int().min(2).max(10).nullable().optional(),
    vip_only: z.boolean().default(false),
    private_game: z.boolean().default(false),
    satellite: z.boolean().default(false),
    accelerated_mtt: z.boolean().default(false),
    ban_chat: z.boolean().default(false),
    table_size: z.number().int().min(2).max(10).default(9),
    action_time: z.number().int().min(10).max(60).default(15),
    fee_percent: z.number().min(0).max(100).default(10),
    blind_structure_speed: z.enum(['slow', 'standard', 'turbo', 'hyper_turbo']).default('standard'),
    payout_structure: z.enum(['winner_takes_all', 'top_3', 'top_15_percent', 'standard']).default('standard'),
    custom_rebuy_cost: z.boolean().default(false),
    number_of_rebuys: z.number().int().min(0).default(3),
    add_on_multiplier: z.number().min(1).default(1.0),
    add_on_break_length: z.number().int().min(1).default(5),
    bounty_type: z.enum(['none', 'standard', 'pko', 'mystery']).default('none'),
    bounty_amount: z.number().min(0).default(0),
    bounty_percent: z.number().min(0).max(100).default(0),
    mystery_threshold: z.number().int().min(0).max(100).default(0), // top X%
    late_registration_level: z.number().int().min(0).default(6),
    min_players: z.number().int().min(2).default(2),
    max_players: z.number().int().min(2).default(10000),
    multi_day_mtt: z.boolean().default(false),
    clubIds: z.array(z.string().uuid()).optional(), // For XMTT
    isXmtt: z.boolean().optional().default(false),
}).catchall(z.any()); // Keep flexible for frontend raw pass-through

export const TournamentSchema = z.object({
    id: z.string().uuid(),
    club_id: z.string().uuid(),
    created_by: z.string().uuid(),
    name: z.string().min(1).max(100),
    type: z.enum(['mtt', 'sng', 'spin', 'xmtt']),
    variant: z.enum(['nlh', 'plo4', 'plo5', 'short_deck', 'pineapple']),
    status: z.enum(['scheduled', 'registering', 'running', 'late_reg', 'paused', 'break', 'final_table', 'complete', 'cancelled']),
    buy_in: z.number().min(0),
    starting_chips: z.number().int().min(1),
    max_players: z.number().int().min(2),
    registered_count: z.number().int().min(0),
    prize_pool: z.number().min(0),
    guaranteed_prize: z.number().min(0).default(0),
    blind_structure: z.array(BlindLevelSchema).default([]),
    late_reg_levels: z.number().int().min(0).default(0),
    rebuy_enabled: z.boolean().default(false),
    rebuy_levels: z.number().int().min(0).default(0),
    rebuy_cost: z.number().min(0).default(0),
    addon_enabled: z.boolean().default(false),
    addon_cost: z.number().min(0).default(0),
    addon_chips: z.number().int().min(0).default(0),
    scheduled_start: z.string().datetime().nullable().optional(),
    started_at: z.string().datetime().nullable().optional(),
    completed_at: z.string().datetime().nullable().optional(),
    settings: TournamentSettingsSchema,
});

export const RegistrationSchema = z.object({
    id: z.string().uuid(),
    tournament_id: z.string().uuid(),
    user_id: z.string().uuid(),
    club_id: z.string().uuid().nullable().optional(), // Needed for XMTT
    status: z.enum(['registered', 'active', 'eliminated', 'unregistered', 'refunded', 'cancelled']),
    buy_in_amount: z.number().min(0),
    rebuys_count: z.number().int().min(0).default(0),
    addon_taken: z.boolean().default(false),
    total_invested: z.number().min(0),
    registered_at: z.string().datetime(),
    eliminated_at: z.string().datetime().nullable().optional(),
    finish_position: z.number().int().min(1).nullable().optional(),
    payout_amount: z.number().min(0).nullable().optional(),
    bounty_earned: z.number().min(0).default(0),
});
