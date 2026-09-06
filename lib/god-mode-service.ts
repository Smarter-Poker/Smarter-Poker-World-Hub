/**
 * Legacy God Mode compatibility facade.
 *
 * All solver reads and row interpretation are delegated to SolverPolicyService.
 * This module only maps the canonical policy answer into the old training types
 * while callers migrate to the versioned solver-policy contract.
 */

import { createClient } from '@supabase/supabase-js';
import { SolverPolicyService } from '../src/services/SolverPolicyService.js';

export interface GTOAction {
    ev: number | null;
    freq: number;
    ev_loss: number | null;
    size?: string;
}

export interface GTOHandStrategy {
    best_action: string;
    max_ev: number | null;
    ev_loss: number | null;
    actions: {
        Fold: GTOAction;
        Call: GTOAction;
        Raise: GTOAction;
    };
    is_mixed: boolean;
}

export interface GTOStrategyMatrix {
    [hand: string]: GTOHandStrategy;
}

export interface GTOMacroMetrics {
    hero_range_adv?: number;
    villain_range_adv?: number;
    total_hero_ev?: number;
    total_villain_ev?: number;
    avg_hero_ev?: number;
    hand_count?: number;
    spr?: number;
    nut_adv?: number;
    board_texture?: string;
    pot_size?: number;
}

export interface GTOScenario {
    id: string;
    scenario_hash: string;
    street: 'Flop' | 'Turn' | 'River';
    stack_depth: number;
    game_type: 'Cash' | 'MTT' | 'Spin';
    topology: 'HU' | '3-Max' | '6-Max' | '9-Max';
    mode: 'ChipEV' | 'ICM' | 'PKO';
    board_cards: string[];
    macro_metrics: GTOMacroMetrics;
    strategy_matrix: GTOStrategyMatrix;
    solver_policy: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
}

function makeClient(url: string, key: string) {
    return createClient(url, key);
}

let client: ReturnType<typeof makeClient> | null = null;
let policyService: any = null;
let warnedMissingEnv = false;

function getSupabase() {
    if (client) return client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        || '';
    if (!url || !key) {
        if (!warnedMissingEnv) {
            warnedMissingEnv = true;
            console.error('[GodMode] Supabase credentials are not configured; policy lookup is disabled.');
        }
        return null;
    }
    client = makeClient(url, key);
    return client;
}

function getPolicyService(): any {
    if (policyService) return policyService;
    const db = getSupabase();
    if (!db) return null;
    policyService = new (SolverPolicyService as any)({ db });
    return policyService;
}

function normalizeBoardCards(cards: string[]): string[] {
    return (cards || []).map((value) => {
        const card = String(value || '').trim();
        return card.length >= 2 ? `${card[0].toUpperCase()}${card[1].toLowerCase()}` : card;
    });
}

export function generateScenarioHash(params: {
    boardCards: string[];
    position?: string;
    stackDepth: number;
    gameType: 'Cash' | 'MTT' | 'Spin';
    mode: 'ChipEV' | 'ICM' | 'PKO';
    street: 'Flop' | 'Turn' | 'River';
}): string {
    const board = normalizeBoardCards(params.boardCards).join('');
    return `${board}_${params.position || 'BTN_vs_BB'}_${params.stackDepth}bb_${params.gameType}_${params.mode}_${params.street}`;
}

export function detectStreet(boardCards: string[]): 'Flop' | 'Turn' | 'River' {
    if (boardCards.length === 3) return 'Flop';
    if (boardCards.length === 4) return 'Turn';
    if (boardCards.length === 5) return 'River';
    throw new Error(`Invalid board card count: ${boardCards.length}. Expected 3, 4, or 5.`);
}

function gameTypes(gameType: 'Cash' | 'MTT' | 'Spin', mode: 'ChipEV' | 'ICM' | 'PKO'): string[] {
    if (gameType === 'Cash') return ['cash', 'hu_cash', '6max_cash', '9max_cash'];
    if (gameType === 'Spin') return ['spin', 'spin_hu_chipev', 'spin_3max_chipev'];
    if (mode === 'ICM' || mode === 'PKO') return ['mtt_icm', 'mtt_hu_icm', 'mtt_6max_icm', 'mtt_9max_icm'];
    return ['mtt_chipev', 'mtt_hu_chipev', 'mtt_6max_chipev', 'mtt_9max_chipev'];
}

function topologySize(topology: 'HU' | '3-Max' | '6-Max' | '9-Max'): number {
    return topology === 'HU' ? 2 : topology === '3-Max' ? 3 : topology === '6-Max' ? 6 : 9;
}

function splitPositions(value?: string): { hero: string; villain: string } {
    const match = String(value || 'BTN_vs_BB').toUpperCase().match(/^([A-Z0-9]+)_VS_([A-Z0-9]+)$/);
    return { hero: match?.[1] || 'BTN', villain: match?.[2] || 'BB' };
}

function policyKey(params: {
    gameType: 'Cash' | 'MTT' | 'Spin';
    stackDepth: number;
    boardCards: string[];
    mode: 'ChipEV' | 'ICM' | 'PKO';
    street: 'Flop' | 'Turn' | 'River';
    position?: string;
    topology: 'HU' | '3-Max' | '6-Max' | '9-Max';
    heroHand?: string[];
}) {
    const { hero, villain } = splitPositions(params.position);
    return {
        variant: 'nlh',
        bettingStructure: 'no_limit',
        tableSize: topologySize(params.topology),
        positions: { hero, villains: [villain] },
        stackVector: [
            { seat: 0, position: hero, stackBb: params.stackDepth, active: true },
            { seat: 1, position: villain, stackBb: params.stackDepth, active: true },
        ],
        blinds: { complete: false },
        rake: { complete: false },
        tournamentUtility: {
            mode: params.gameType === 'Cash' ? 'cash' : params.mode.toLowerCase(),
            complete: false,
        },
        payouts: [],
        bounties: [],
        street: params.street.toLowerCase(),
        board: normalizeBoardCards(params.boardCards),
        holding: normalizeBoardCards(params.heroHand || []),
        publicActionHistory: { complete: false, actions: [] },
        legalActions: [],
        sidePotEligibility: { complete: false, pots: [] },
    };
}

type CanonicalAction = {
    id: string;
    family: string;
    frequency: number;
    size?: { potFraction?: number | null };
};

type CanonicalPolicy = {
    actions: CanonicalAction[];
    rangeDistribution?: Record<string, Record<string, number>> | null;
    chipEv?: { policy?: number | null };
    key?: { board?: string[] };
    sourceArtifact?: { artifactId?: string | null; scenarioHash?: string | null };
};

function legacyBucket(family: string): 'Fold' | 'Call' | 'Raise' {
    if (family === 'fold') return 'Fold';
    if (family === 'check' || family === 'call') return 'Call';
    return 'Raise';
}

function legacyHandStrategy(
    actions: CanonicalAction[],
    policyEv: number | null = null,
): GTOHandStrategy {
    const frequency = { Fold: 0, Call: 0, Raise: 0 };
    for (const action of actions) frequency[legacyBucket(action.family)] += Number(action.frequency) || 0;
    const ranked = (Object.entries(frequency) as Array<['Fold' | 'Call' | 'Raise', number]>)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const active = ranked.filter(([, value]) => value > 0.01);
    const mk = (freq: number): GTOAction => ({ ev: null, freq, ev_loss: null });
    return {
        best_action: active.length > 1 ? 'Mixed' : ranked[0][0],
        max_ev: Number.isFinite(policyEv) ? policyEv : null,
        ev_loss: null,
        actions: {
            Fold: mk(frequency.Fold),
            Call: mk(frequency.Call),
            Raise: mk(frequency.Raise),
        },
        is_mixed: active.length > 1,
    };
}

function scenarioFromPolicy(record: any, policy: CanonicalPolicy): GTOScenario {
    const matrix: GTOStrategyMatrix = {};
    for (const [hand, mix] of Object.entries(policy.rangeDistribution || {})) {
        const actions = (policy.actions || []).map((action) => ({
            ...action,
            frequency: Number((mix as Record<string, number>)[action.id]) || 0,
        }));
        matrix[hand] = legacyHandStrategy(actions, null);
    }
    const metadata = record?.metadata || {};
    const rawType = String(metadata.game_type || '').toLowerCase();
    const gameType: GTOScenario['game_type'] = rawType.includes('spin') ? 'Spin'
        : rawType.includes('mtt') || rawType.includes('sng') ? 'MTT' : 'Cash';
    const tableMatch = rawType.match(/([2369])max/);
    const topology: GTOScenario['topology'] = rawType.includes('hu') ? 'HU'
        : tableMatch?.[1] === '3' ? '3-Max'
        : tableMatch?.[1] === '9' ? '9-Max' : '6-Max';
    return {
        id: String(metadata.id || policy.sourceArtifact?.artifactId || ''),
        scenario_hash: String(metadata.scenario_hash || policy.sourceArtifact?.scenarioHash || ''),
        street: `${String(metadata.street || 'flop')[0].toUpperCase()}${String(metadata.street || 'flop').slice(1)}` as GTOScenario['street'],
        stack_depth: Number(metadata.stack_depth) || 0,
        game_type: gameType,
        topology,
        mode: rawType.includes('icm') ? 'ICM' : 'ChipEV',
        board_cards: [...(policy.key?.board || [])],
        macro_metrics: { hand_count: Object.keys(matrix).length },
        strategy_matrix: matrix,
        solver_policy: policy as unknown as Record<string, unknown>,
    };
}

type LookupParams = {
    gameType: 'Cash' | 'MTT' | 'Spin';
    stackDepth: number;
    street?: 'Flop' | 'Turn' | 'River';
    boardCards: string[];
    mode?: 'ChipEV' | 'ICM' | 'PKO';
    topology?: 'HU' | '3-Max' | '6-Max' | '9-Max';
    position?: string;
    heroHand?: string[];
};

async function resolvePolicy(params: LookupParams, mode: 'holding' | 'aggregate') {
    const service = getPolicyService();
    if (!service) return null;
    const street = params.street || detectStreet(params.boardCards);
    const utilityMode = params.mode || (params.gameType === 'Cash' ? 'ChipEV' : 'ICM');
    const topology = params.topology || 'HU';
    const key = service.createKey(policyKey({
        ...params,
        street,
        mode: utilityMode,
        topology,
    }));
    const result = await service.resolve({
        key,
        gameTypes: gameTypes(params.gameType, utilityMode),
        allowBoardApproximation: false,
        allowStackApproximation: false,
        allowStateApproximation: false,
        mode,
    });
    if (result.answer?.kind === 'unavailable') return null;
    return {
        service,
        result,
        policy: service.consumerEnvelope(result.answer, 'god-mode') as CanonicalPolicy,
    };
}

export async function getGTOStrategy(params: LookupParams): Promise<GTOScenario | null> {
    try {
        const resolved = await resolvePolicy(params, 'aggregate');
        if (!resolved?.result.record) return null;
        return scenarioFromPolicy(resolved.result.record, resolved.policy);
    } catch (error) {
        console.error('[GodMode] getGTOStrategy failed:', error);
        return null;
    }
}

export async function getGTOActionForHand(params: LookupParams & { heroHand: string[] }): Promise<GTOHandStrategy | null> {
    try {
        const resolved = await resolvePolicy(params, 'holding');
        if (!resolved) return null;
        return legacyHandStrategy(
            resolved.policy.actions || [],
            resolved.policy.chipEv?.policy ?? null,
        );
    } catch (error) {
        console.error('[GodMode] getGTOActionForHand failed:', error);
        return null;
    }
}

export async function hasGTODataForScenario(params: LookupParams): Promise<boolean> {
    try {
        return Boolean(await resolvePolicy(params, 'aggregate'));
    } catch {
        return false;
    }
}

export async function getGTOScenarioCount(): Promise<number> {
    try {
        const service = getPolicyService();
        if (!service) return 0;
        const result = await service.listSolvedMetadata({ limit: 1, range: [0, 0] }, { count: true });
        return Number(result.count) || 0;
    } catch (error) {
        console.error('[GodMode] scenario count failed:', error);
        return 0;
    }
}

export async function getScenarioMetrics(params: LookupParams): Promise<GTOMacroMetrics | null> {
    const scenario = await getGTOStrategy(params);
    return scenario?.macro_metrics || null;
}

export interface LevelQuizQuestion extends GTOScenario {
    is_review: boolean;
    question_number: number;
}

export interface LevelQuiz {
    level_id: number;
    level_name: string;
    questions: LevelQuizQuestion[];
    total_questions: number;
    fresh_questions: number;
    review_questions: number;
    is_review_mode: boolean;
}

function scenarioHasMixedPolicy(policy: CanonicalPolicy): boolean {
    return Object.values(policy.rangeDistribution || {}).some((mix) =>
        Object.values(mix).filter((value) => Number(value) > 0.01).length > 1
    );
}

export async function generateLevelQuiz(userId: string, levelId: number): Promise<LevelQuiz | null> {
    try {
        const supabase = getSupabase();
        const service = getPolicyService();
        if (!supabase || !service) return null;
        const { data: level, error: levelError } = await supabase
            .from('training_levels')
            .select('*')
            .eq('level_id', levelId)
            .maybeSingle();
        if (levelError || !level) return null;
        const { data: history } = await supabase
            .from('user_question_history')
            .select('scenario_hash')
            .eq('user_id', userId);
        const seen = new Set((history || []).map((entry: any) => entry.scenario_hash));
        const count = Number(level.questions_per_round) || 20;
        const levelType = String(level.game_mode || 'Cash').toLowerCase();
        const gameType: 'Cash' | 'MTT' | 'Spin' = levelType.includes('spin') ? 'Spin'
            : levelType.includes('mtt') || levelType.includes('tournament') ? 'MTT' : 'Cash';
        const mode: 'ChipEV' | 'ICM' = levelType.includes('icm') ? 'ICM' : 'ChipEV';
        const { records } = await service.listSolvedRecords({
            gameTypes: gameTypes(gameType, mode),
            street: level.street_filter && level.street_filter !== 'All'
                ? String(level.street_filter).toLowerCase()
                : undefined,
            stackDepths: Array.isArray(level.stack_filter) ? level.stack_filter : undefined,
            orderBy: 'scenario_hash',
            ascending: true,
            limit: Math.min(1000, Math.max(200, count * 20)),
        });
        const candidates = records.map((record: any) => {
            const answer = service.answerFromRecord(record, service.keyForRecord(record), { mode: 'aggregate' });
            const policy = service.consumerEnvelope(answer, 'god-mode') as CanonicalPolicy;
            return { scenario: scenarioFromPolicy(record, policy), policy };
        }).filter(({ policy }: { policy: CanonicalPolicy }) => (
            level.difficulty_rating !== 'Easy' || !scenarioHasMixedPolicy(policy)
        ));
        const fresh = candidates.filter(({ scenario }) => !seen.has(scenario.scenario_hash));
        const review = candidates.filter(({ scenario }) => seen.has(scenario.scenario_hash));
        const selected = [...fresh.slice(0, count), ...review.slice(0, Math.max(0, count - fresh.length))];
        const questions = selected.map(({ scenario }, index) => ({
            ...scenario,
            is_review: seen.has(scenario.scenario_hash),
            question_number: index + 1,
        }));
        const freshCount = questions.filter((question) => !question.is_review).length;
        return {
            level_id: levelId,
            level_name: level.level_name,
            questions,
            total_questions: questions.length,
            fresh_questions: freshCount,
            review_questions: questions.length - freshCount,
            is_review_mode: questions.some((question) => question.is_review),
        };
    } catch (error) {
        console.error('[GodMode] generateLevelQuiz failed:', error);
        return null;
    }
}

export default {
    getGTOStrategy,
    getGTOActionForHand,
    hasGTODataForScenario,
    getGTOScenarioCount,
    getScenarioMetrics,
    generateLevelQuiz,
    generateScenarioHash,
    detectStreet,
};
