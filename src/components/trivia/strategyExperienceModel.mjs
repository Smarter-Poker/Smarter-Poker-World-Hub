import { sanitizeAuthoritativeTriviaSolverEv } from '../../lib/trivia/solverEvPolicy.mjs';

const STRATEGY_MODES = new Set(['mtt', 'cash', 'icm', 'gto']);

const POSITION_RE = /\b(UTG\+?[12]?|MP\+?[12]?|LJ|HJ|CO|BTN|SB|BB|IP|OOP)\b/gi;
const STREET_RE = /\b(preflop|flop|turn|river)\b/i;
const PAYOUT_TERMS = [
    ['Final Table', /\bfinal table\b/i],
    ['Money Bubble', /\b(?:money\s+)?bubble\b/i],
    ['Pay Jump', /\bpay\s+jump\b/i],
    ['In The Money', /\bin the money\b|\bITM\b/i],
    ['Satellite', /\bsatellite\b/i],
    ['Heads-Up', /\bheads[- ]up\b/i],
];

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function number(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

function displayNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function firstValue(source, keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
}

function normalizePosition(value) {
    const raw = text(value).toUpperCase().replace(/\s+/g, '');
    if (!raw) return '';
    const match = raw.match(/^(UTG\+?[12]?|MP\+?[12]?|LJ|HJ|CO|BTN|SB|BB|IP|OOP)$/);
    return match ? match[1] : '';
}

function normalizeStreet(value) {
    const match = text(value).match(STREET_RE);
    if (!match) return '';
    return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
}

function displayCards(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
    return text(value);
}

function safeStructuredContext(question) {
    const raw = question?.context && typeof question.context === 'object'
        ? question.context
        : question?.scenarioContext && typeof question.scenarioContext === 'object'
            ? question.scenarioContext
            : {};
    return {
        heroPosition: normalizePosition(firstValue(raw, ['heroPosition', 'hero_position', 'position'])),
        villainPosition: normalizePosition(firstValue(raw, ['villainPosition', 'villain_position'])),
        stackDepthBb: number(firstValue(raw, ['stackDepthBb', 'stack_depth_bb', 'stackDepth', 'stack_depth', 'effectiveStackBb', 'effective_stack_bb'])),
        street: normalizeStreet(firstValue(raw, ['street'])),
        gameType: text(firstValue(raw, ['gameType', 'game_type'])),
        heroHand: displayCards(firstValue(raw, ['heroHand', 'hero_hand'])),
        board: displayCards(firstValue(raw, ['board', 'boardCards', 'board_cards'])),
        potBb: number(firstValue(raw, ['potBb', 'pot_bb', 'potSizeBb', 'pot_size_bb'])),
        stakes: text(firstValue(raw, ['stakes', 'cashStakes', 'cash_stakes'])),
        blinds: text(firstValue(raw, ['blinds', 'blindLevel', 'blind_level'])),
        payoutStage: text(firstValue(raw, ['payoutStage', 'payout_stage', 'tournamentStage', 'tournament_stage'])),
        evModel: text(firstValue(raw, ['evModel', 'ev_model', 'decisionModel', 'decision_model'])),
    };
}

function extractPositions(prompt) {
    const matches = [...prompt.matchAll(POSITION_RE)]
        .filter(match => {
            if (String(match[1]).toUpperCase() !== 'BB') return true;
            const prefix = prompt.slice(Math.max(0, match.index - 12), match.index);
            return !/\d(?:\.\d+)?\s*$/.test(prefix);
        })
        .map(match => normalizePosition(match[1]))
        .filter(Boolean);
    const heroMatch = prompt.match(/\b(?:in|from|on the)\s+(UTG\+?[12]?|MP\+?[12]?|LJ|HJ|CO|BTN|SB|BB|IP|OOP)\b/i);
    const villainMatch = prompt.match(/\b(?:vs\.?|versus|against)\s+(?:the\s+)?(UTG\+?[12]?|MP\+?[12]?|LJ|HJ|CO|BTN|SB|BB|IP|OOP)\b/i);
    return {
        hero: normalizePosition(heroMatch?.[1]) || matches[0] || '',
        villain: normalizePosition(villainMatch?.[1]) || matches.find(position => position !== matches[0]) || '',
    };
}

function extractStack(prompt) {
    const patterns = [
        /(?:\(|\b)(\d+(?:\.\d+)?)\s*BB\s*(?:effective|eff\.?|stack)/i,
        /\b(?:effective\s+stack|stack\s+depth)\D{0,12}(\d+(?:\.\d+)?)\s*BB\b/i,
        /\bat\s+(\d+(?:\.\d+)?)\s*BB\s+effective\b/i,
    ];
    for (const pattern of patterns) {
        const match = prompt.match(pattern);
        if (match) return number(match[1]);
    }
    return null;
}

function extractPot(prompt) {
    const match = prompt.match(/\bpot(?:\s+(?:is|of))?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*BB\b/i);
    return match ? number(match[1]) : null;
}

function extractStakes(prompt) {
    const match = prompt.match(/\$\s*\d+(?:\.\d+)?\s*\/\s*\$?\s*\d+(?:\.\d+)?(?:\s*\/\s*\$?\s*\d+(?:\.\d+)?)?/);
    return match ? match[0].replace(/\s+/g, '').replace(/\/(?=\d)/g, '/$') : '';
}

function extractBlinds(prompt) {
    const labelled = prompt.match(/\b(?:blinds?|level)\D{0,16}(\d[\d,]*(?:\.\d+)?)\s*\/\s*(\d[\d,]*(?:\.\d+)?)(?:\s*\/\s*(\d[\d,]*(?:\.\d+)?))?/i);
    if (!labelled) return '';
    return [labelled[1], labelled[2], labelled[3]].filter(Boolean).join('/');
}

function extractPayoutStage(prompt) {
    for (const [label, pattern] of PAYOUT_TERMS) if (pattern.test(prompt)) return label;
    return '';
}

function detectEvModel(mode, prompt, structured) {
    const declared = structured.evModel || structured.gameType;
    const source = `${declared} ${prompt}`;
    if (/\b(?:money\s*EV|\$EV|ICM|mtt[_ -]?(?:\d+max[_ -]?)?icm)\b/i.test(source)) return 'Money EV / ICM';
    if (/\b(?:chip\s*EV|chipEV|chip_ev|chipev)\b/i.test(source)) return 'Chip EV';
    return mode === 'icm' ? 'Compare Chip EV And Money EV' : '';
}

function row(label, value, ink = '') {
    return { label, value: value || 'Not Stated In This Spot', ink };
}

/**
 * Build the visible decision rail from server-supplied context, falling back
 * only to values literally present in the server-owned question prose. No
 * blinds, stakes, stack, payout stage or solver result is invented.
 */
export function buildStrategyQuestionContext(mode, question) {
    const normalizedMode = STRATEGY_MODES.has(mode) ? mode : 'mtt';
    const prompt = text(question?.question);
    const structured = safeStructuredContext(question);
    const positions = extractPositions(prompt);
    const heroPosition = structured.heroPosition || positions.hero;
    const villainPosition = structured.villainPosition || positions.villain;
    const stackDepth = structured.stackDepthBb ?? extractStack(prompt);
    const pot = structured.potBb ?? extractPot(prompt);
    const street = structured.street || normalizeStreet(prompt);
    const stakes = structured.stakes || extractStakes(prompt);
    const blinds = structured.blinds || extractBlinds(prompt);
    const payoutStage = structured.payoutStage || extractPayoutStage(prompt);
    const evModel = detectEvModel(normalizedMode, prompt, structured);
    const heroHand = structured.heroHand;
    const board = structured.board;
    const gameType = structured.gameType;
    const position = [heroPosition, villainPosition ? `Vs ${villainPosition}` : ''].filter(Boolean).join(' ');
    const stack = stackDepth == null ? '' : `${displayNumber(stackDepth)} BB Effective`;
    const potLabel = pot == null ? '' : `${displayNumber(pot)} BB`;
    const explicitHighLimit = /\bhigh[- ]limit\b/i.test(`${structured.gameType} ${prompt}`);

    const common = { heroPosition, villainPosition, stackDepthBb: stackDepth, street, potBb: pot, stakes, blinds, payoutStage, evModel, heroHand, board, gameType };
    if (normalizedMode === 'mtt') {
        return {
            ...common,
            heading: 'Tournament Decision Rail',
            items: [
                row('Blinds', blinds),
                row('Position', position),
                row('Effective Stack', stack),
                row('Street', street),
                row('Hero Hand', heroHand),
                row('Board', board),
                row('Payout Stage', payoutStage || (evModel.includes('Money') ? 'ICM Pressure' : '')),
            ],
        };
    }
    if (normalizedMode === 'cash') {
        return {
            ...common,
            heading: 'Cash Table Readout',
            items: [
                row('Stakes', stakes),
                row('Position', position),
                row('Effective Stack', stack),
                row('Street', street),
                row('Pot', potLabel),
                row('Hero Hand', heroHand),
                row('Board', board),
                row('Table Context', explicitHighLimit ? 'High-Limit Cash' : 'Cash Game'),
            ],
        };
    }
    if (normalizedMode === 'icm') {
        return {
            ...common,
            heading: 'Tournament Equity Readout',
            items: [
                row('Decision Model', evModel, 'gold'),
                row('Position', position),
                row('Effective Stack', stack),
                row('Blinds', blinds),
                row('Payout Context', payoutStage),
                row('Chip EV', 'Chips Gained Or Lost'),
                row('Money EV', 'Payout Equity Gained Or Lost'),
            ],
        };
    }
    return {
        ...common,
        heading: 'Solver Table Readout',
        items: [
            row('Position', position),
            row('Effective Stack', stack),
            row('Street', street),
            row('Pot', potLabel),
            row('Hero Hand', heroHand),
            row('Board', board),
            row('Game', gameType),
            row('Analysis', 'Frequencies, Range Mix And EV After Answer'),
        ],
    };
}

function normalizeFrequencyRows(raw, options = []) {
    let rows = [];
    if (Array.isArray(raw)) {
        rows = raw
            .filter(item => item && typeof item.action === 'string' && number(item.frequency) != null)
            .map(item => ({ token: item.action, frequency: number(item.frequency), description: text(item.description) }));
    } else if (raw && typeof raw === 'object') {
        rows = Object.entries(raw)
            .filter(([, value]) => number(value) != null)
            .map(([token, value]) => ({ token, frequency: number(value), description: '' }));
    }
    if (!rows.length) return [];
    const total = rows.reduce((sum, item) => sum + item.frequency, 0);
    const fractional = rows.every(item => item.frequency >= 0 && item.frequency <= 1)
        && total >= 0.98 && total <= 1.02;
    const percentage = rows.every(item => item.frequency >= 0 && item.frequency <= 100)
        && total >= 98 && total <= 102;
    if (!fractional && !percentage) return [];
    return rows.map(item => ({
        ...item,
        action: solverActionLabel(item.token, options),
        frequency: Math.max(0, Math.min(100, Math.round((fractional ? item.frequency * 100 : item.frequency) * 10) / 10)),
    })).sort((a, b) => b.frequency - a.frequency || a.action.localeCompare(b.action));
}

function actionFamily(value) {
    const lower = text(value).toLowerCase();
    if (/\bfold\b/.test(lower)) return 'fold';
    if (/\bcheck\b/.test(lower)) return 'check';
    if (/\bcall\b/.test(lower)) return 'call';
    if (/\b(?:all[- ]?in|shove|jam|push)\b/.test(lower)) return 'all-in';
    if (/\b(?:3[- ]?bet|4[- ]?bet|raise)\b/.test(lower)) return 'raise';
    if (/\bbet\b/.test(lower)) return 'bet';
    return '';
}

function solverActionLabel(token, options) {
    const raw = text(token);
    const lower = raw.toLowerCase().replace(/\s+/g, '');
    const direct = {
        f: 'Fold', fold: 'Fold',
        check: 'Check', call: 'Call',
        jam: 'All-In', shove: 'All-In', push: 'All-In', allin: 'All-In', 'all-in': 'All-In',
    };
    if (direct[lower]) return direct[lower];
    if (lower === 'c') {
        const families = (Array.isArray(options) ? options : []).map(actionFamily);
        if (families.includes('check') && !families.includes('call')) return 'Check';
        if (families.includes('call') && !families.includes('check')) return 'Call';
        return 'Check / Call';
    }
    const sized = lower.match(/^([br])(\d+(?:\.\d+)?)$/);
    if (sized) {
        const encoded = Number(sized[2]);
        const family = sized[1] === 'b' ? 'bet' : 'raise';
        const canonical = {
            b16: 16, b20: 20, b25: 25, b33: 33, b40: 40, b45: 45,
            b50: 50, b55: 55, b60: 60, b66: 67, b75: 75, b80: 80,
            b100: 100, b125: 125, b150: 150, b200: 200, b300: 300,
        }[lower];
        const candidates = canonical == null ? [encoded, encoded / 10] : [canonical];
        const optionMatch = (Array.isArray(options) ? options : []).find(option => {
            if (actionFamily(option) !== family) return false;
            const percent = text(option).match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
            if (percent != null) return candidates.some(candidate => Math.abs(Number(percent) - candidate) < 0.01);
            return canonical === 100 && /\bpot\b/i.test(text(option));
        });
        if (optionMatch) return text(optionMatch);
        if (canonical != null || sized[2].includes('.') || encoded <= 300) {
            const pct = canonical ?? encoded;
            return `${family === 'bet' ? 'Bet' : 'Raise To'} ${displayNumber(pct)}% Pot`;
        }
        return raw.toUpperCase();
    }
    const family = actionFamily(raw);
    if (family === 'all-in') return 'All-In';
    if (family) return family[0].toUpperCase() + family.slice(1);
    return raw ? raw.toUpperCase() : 'Solver Line';
}

function solverEv(raw) {
    const verified = sanitizeAuthoritativeTriviaSolverEv(raw);
    if (!verified) return null;
    return {
        value: Math.round(verified.value * 100) / 100,
        unit: verified.unit,
        unitLabel: 'Big Blinds',
        source: verified.source,
        sourceLabel: 'Verified PioSOLVER V2',
        provenanceLabel: `Active Solver Catalog, ${verified.provenance.solver_version}`,
        provenance: verified.provenance,
        description: '',
    };
}

/** Return only real solver values supplied after the answer is bound. */
export function readStrategySolverMetadata(metadata, correctAnswerText = '', options = []) {
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    const frequencies = firstValue(source, ['gtoFrequencies', 'gto_frequencies', 'frequencies']);
    const frequencyRows = normalizeFrequencyRows(frequencies, options);
    const preferredFamily = actionFamily(correctAnswerText);
    const preferred = frequencyRows.find(item => actionFamily(item.action) === preferredFamily) || frequencyRows[0] || null;
    const evAnalysis = solverEv(firstValue(source, ['evData', 'ev_data', 'ev']));
    return {
        preferredFrequency: preferred?.frequency ?? null,
        // Kept for existing callers. The UI must describe this as a
        // frequency, never as solver "confidence".
        confidence: preferred?.frequency ?? null,
        evAnalysis,
        frequencyRows,
        alternateLines: frequencyRows
            .filter(item => item !== preferred)
            .map(item => ({ action: item.action, frequency: item.frequency, description: item.description })),
        preferredAction: preferred?.action || '',
        rangeSummary: frequencyRows.map(item => `${item.action} ${displayNumber(item.frequency)}%`).join(', '),
    };
}

export function strategyQuestionIntegrity(question) {
    if (!question || typeof question !== 'object') return { ok: false, error: 'question_missing' };
    if (typeof question.id !== 'string' || !question.id.trim()) return { ok: false, error: 'question_id_missing' };
    if (!text(question.question)) return { ok: false, error: 'question_text_missing' };
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 10) {
        return { ok: false, error: 'question_options_invalid' };
    }
    const options = question.options.map(text);
    if (options.some(option => !option) || new Set(options).size !== options.length) {
        return { ok: false, error: 'question_options_invalid' };
    }
    return { ok: true, error: null };
}

export function strategyResumeProgress(questions) {
    const list = Array.isArray(questions) ? questions : [];
    const terminalStates = new Set(['answered', 'timeout', 'late', 'voided']);
    const isAnswered = question => terminalStates.has(text(question?.state).toLowerCase())
        || (question?.answerState
            && question.answerState.storedDisplayIndex !== null
            && question.answerState.storedDisplayIndex !== undefined
            && Number.isInteger(Number(question.answerState.storedDisplayIndex)));
    const answered = list.filter(isAnswered).length;
    const firstUnanswered = list.findIndex(question => !isAnswered(question));
    return {
        answered,
        firstUnanswered,
        allAnswered: list.length > 0 && firstUnanswered === -1,
    };
}
