/**
 * Answer-free poker context allowed to cross the Trivia session boundary.
 *
 * `engine_metadata` has historically carried both useful table facts and
 * answer-bearing solver output. Never spread it into a response. This module
 * builds a new object from a narrow allow-list and deliberately excludes
 * actions, frequencies, EV, explanations, answer indexes and audit data.
 */

import { sanitizeAuthoritativeTriviaSolverEv } from './solverEvPolicy.mjs';

const POSITION_RE = /^(UTG(?:\+\d)?|LJ|HJ|MP(?:\+\d)?|CO|BTN|SB|BB)$/i;
const STREET_RE = /^(preflop|flop|turn|river)$/i;
const CARD_RE = /^(?:10|[2-9TJQKA])[CDHS]$/i;

function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function first(sourceList, names) {
    for (const source of sourceList) {
        for (const name of names) {
            if (source[name] !== undefined && source[name] !== null) return source[name];
        }
    }
    return null;
}

function shortText(value, max = 80) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text && text.length <= max ? text : null;
}

function position(value) {
    const text = shortText(value, 12);
    return text && POSITION_RE.test(text) ? text.toUpperCase() : null;
}

function finite(value, { min = 0, max = 1_000_000 } = {}) {
    if (value === null || value === undefined || value === '') return null;
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function cards(value, max) {
    const list = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? value.trim().split(/[\s,]+/) : []);
    const clean = list.map(card => String(card).trim().toUpperCase()).filter(card => CARD_RE.test(card));
    return clean.length > 0 && clean.length <= max ? clean : null;
}

export function sanitizeStrategyContext(rawMetadata) {
    const raw = object(rawMetadata);
    const scenario = object(raw.scenario);
    const context = object(raw.context);
    const sources = [scenario, context, raw];

    const heroPosition = position(first(sources, ['heroPosition', 'hero_position', 'position']));
    const villainPosition = position(first(sources, ['villainPosition', 'villain_position', 'opponentPosition', 'opponent_position']));
    const stackDepthBb = finite(first(sources, ['stackDepthBb', 'stack_depth_bb', 'stackDepth', 'stack_depth', 'effectiveStackBb', 'effective_stack_bb']), { max: 10_000 });
    const streetValue = shortText(first(sources, ['street']), 12);
    const street = streetValue && STREET_RE.test(streetValue) ? streetValue.toLowerCase() : null;
    const gameType = shortText(first(sources, ['gameType', 'game_type', 'variant']), 48);
    const heroHand = cards(first(sources, ['heroHand', 'hero_hand', 'hand']), 4);
    const board = cards(first(sources, ['board', 'boardCards', 'board_cards']), 5);
    const potBb = finite(first(sources, ['potBb', 'pot_bb', 'potSizeBb', 'pot_size_bb', 'pot']), { max: 100_000 });
    const stakes = shortText(first(sources, ['stakes', 'stakeLevel', 'stake_level']), 48);
    const blinds = shortText(first(sources, ['blinds', 'blindLevel', 'blind_level']), 48);
    const payoutStage = shortText(first(sources, ['payoutStage', 'payout_stage', 'tournamentStage', 'tournament_stage']), 80);

    const out = {};
    if (heroPosition) out.heroPosition = heroPosition;
    if (villainPosition) out.villainPosition = villainPosition;
    if (stackDepthBb != null) out.stackDepthBb = stackDepthBb;
    if (street) out.street = street;
    if (gameType) out.gameType = gameType;
    if (heroHand) out.heroHand = heroHand;
    if (board) out.board = board;
    if (potBb != null) out.potBb = potBb;
    if (stakes) out.stakes = stakes;
    if (blinds) out.blinds = blinds;
    if (payoutStage) out.payoutStage = payoutStage;
    return Object.keys(out).length > 0 ? Object.freeze(out) : null;
}

const ACTION_RE = /^(?:FOLD|CHECK|CALL|BET|RAISE|SHOVE|ALL-IN|3-BET|4-BET|JAM|PUSH)$/;
// Persisted solve metadata also uses compact action ids: f/c/x and bounded
// pot-size tokens such as b16, b525, r75. Preserve the token (the client maps
// it to accessible poker copy) without allowing arbitrary metadata keys.
const COMPACT_ACTION_RE = /^(?:F|C|X|[BR]\d{1,4}(?:\.\d{1,2})?)$/;

function frequencyScale(values) {
    if (values.length === 0 || values.some(value => !Number.isFinite(value) || value < 0)) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    const fractional = values.every(value => value <= 1) && total >= 0.98 && total <= 1.02;
    if (fractional) return 100;
    const percentage = values.every(value => value <= 100) && total >= 98 && total <= 102;
    return percentage ? 1 : null;
}

/**
 * Solver analysis is allowed only after an answer is durably bound. Even
 * then, project a narrow numeric/action contract instead of forwarding raw
 * engine metadata (which can also contain answer keys and audit evidence).
 */
export function sanitizeSolverAnalysis(rawMetadata) {
    const raw = object(rawMetadata);
    const rawFrequencies = object(raw.gtoFrequencies ?? raw.gto_frequencies);
    const frequencies = {};
    const candidates = Object.entries(rawFrequencies).flatMap(([rawAction, rawValue]) => {
        const action = String(rawAction).trim().toUpperCase();
        const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        return (ACTION_RE.test(action) || COMPACT_ACTION_RE.test(action)) && Number.isFinite(value)
            ? [{ action, value }]
            : [];
    });
    const scale = frequencyScale(candidates.map(({ value }) => value));
    if (scale != null) {
        candidates.forEach(({ action, value }) => {
            frequencies[action] = Math.round(value * scale * 100) / 100;
        });
    }

    // A historical bare `heroHandEV`, `evData.value`, or implicit unit is not
    // enough to call a number expected value. Only the sealed contract emitted
    // from an active V2 PioSOLVER artifact survives this projection.
    const ev = sanitizeAuthoritativeTriviaSolverEv(raw.evData ?? raw.ev_data ?? raw.ev);

    if (Object.keys(frequencies).length === 0 && ev == null) return null;
    return Object.freeze({
        frequencies: Object.freeze(frequencies),
        ev,
        source: ev?.source || 'server_metadata',
    });
}
