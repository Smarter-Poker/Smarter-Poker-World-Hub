/**
 * MULTI-STREET HAND MANAGER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Manages the state of a single multi-street poker hand.
 * Chains flop → turn → river decisions with dynamic board dealing,
 * running pot calculation, and per-street GTO feedback.
 *
 * Usage:
 *   const hand = new MultiStreetHand(initialQuestion);
 *   hand.recordAction('b33'); // hero bets 33%
 *   hand.applyServerContinuation(signedTurnResponse);
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

const STREET_ORDER = ['flop', 'turn', 'river'];
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const CARD_RE = /^[2-9TJQKA][shdc]$/;

function normalizeCard(card) {
    const token = String(card || '').trim();
    if (token.length !== 2) return null;
    const normalized = `${token[0].toUpperCase()}${token[1].toLowerCase()}`;
    return CARD_RE.test(normalized) ? normalized : null;
}

function cardsEqual(left, right) {
    return left.length === right.length && left.every((card, index) => card === right[index]);
}

function unorderedCardsEqual(left, right) {
    return left.length === right.length
        && [...left].sort().every((card, index) => card === [...right].sort()[index]);
}

function parseExactCardSource(value) {
    if (value === undefined || value === null || value === '') {
        return { provided: false, valid: true, cards: [] };
    }
    const rawCards = Array.isArray(value)
        ? value
        : (() => {
            if (typeof value !== 'string') return null;
            const compact = value.replace(/[\s,]+/g, '');
            if (!compact || compact.length % 2 !== 0) return null;
            return compact.match(/.{2}/g) || [];
        })();
    if (!rawCards) return { provided: true, valid: false, cards: [] };
    const normalized = rawCards.map(normalizeCard);
    return {
        provided: true,
        valid: normalized.length === rawCards.length && normalized.every(Boolean),
        cards: normalized.filter(Boolean),
    };
}

function exactCardAliases(sources, {
    label,
    expectedCount,
    unordered = false,
    required = true,
    code,
}) {
    const aliases = sources.map(parseExactCardSource).filter((source) => source.provided);
    if ((required && aliases.length === 0)
        || aliases.some((source) => !source.valid || source.cards.length !== expectedCount)) {
        throw new MultiStreetContinuationError(
            `${label} must contain exactly ${expectedCount} valid cards.`,
            code,
        );
    }
    if (aliases.length === 0) return [];
    const [canonical, ...rest] = aliases.map((source) => source.cards);
    const equal = unordered ? unorderedCardsEqual : cardsEqual;
    if (rest.some((candidate) => !equal(canonical, candidate))) {
        throw new MultiStreetContinuationError(
            `${label} aliases disagree about the signed hand.`,
            code,
        );
    }
    return canonical;
}

function handClassFromCards(cards) {
    if (!Array.isArray(cards) || cards.length !== 2) return '';
    const rankOrder = Object.fromEntries(RANKS.map((rank, index) => [rank, index]));
    const ordered = [...cards].sort((left, right) => rankOrder[right[0]] - rankOrder[left[0]]);
    const [first, second] = ordered;
    if (first[0] === second[0]) return `${first[0]}${second[0]}`;
    return `${first[0]}${second[0]}${first[1] === second[1] ? 's' : 'o'}`;
}

function expectedBoardCount(street) {
    const streetIndex = STREET_ORDER.indexOf(street);
    return streetIndex === -1 ? null : streetIndex + 3;
}

export class MultiStreetContinuationError extends Error {
    constructor(message, code = 'TRAINING_CONTINUATION_INVALID') {
        super(message);
        this.name = 'MultiStreetContinuationError';
        this.code = code;
    }
}

/**
 * Compute pot size after an action
 * @param {number} currentPot - Current pot in BB
 * @param {string} action - Action code like 'c', 'b33', 'f'
 * @returns {number} New pot size
 */
function computePotAfterAction(currentPot, action, {
    actionUnits = 'percent',
    facingBet = 0,
    exactIncrementBb = null,
} = {}) {
    if (!action) return currentPot;
    if (action === 'c' || action === 'x') return currentPot; // check
    if (action === 'call') return currentPot + Math.max(0, Number(facingBet) || 0);
    if (action === 'f') return currentPot; // fold

    // A trusted Pio continuation uses raw NodeID units and therefore accepts
    // only bNNN (Pio uses `b` for both Bet and Raise). Authored percentage
    // actions retain the application's separate bNNN/rNNN convention.
    const betMatch = actionUnits === 'chips'
        ? action.match(/^b([1-9]\d*)$/)
        : action.match(/^[br]([1-9]\d*)$/);
    if (betMatch) {
        const encodedAmount = parseInt(betMatch[1]);
        const betSize = actionUnits === 'chips'
            // Pio bNNN tokens are cumulative postflop contribution targets,
            // not the amount added at this node (official UPI NodeID contract:
            // https://piosolver.com/docs/upi/). The canonical solver policy
            // has already reconstructed the actor's exact increment.
            ? Number(exactIncrementBb)
            : currentPot * (encodedAmount / 100);
        if (!Number.isFinite(betSize) || betSize <= 0) return null;
        // The model here is "hero bets X, villain calls" -- its own comment said
        // so -- but only ONE bet was ever added. A called bet puts X in from BOTH
        // players, so the pot grows by 2X. Understating it compounds: the turn is
        // sized off a short flop pot, the river off a short turn pot, and every
        // downstream pot-odds and SPR number inherits the error.
        return currentPot + betSize * 2;
    }

    if (action === 'allin') return currentPot * 2; // Rough approximation

    return currentPot;
}

export class MultiStreetHand {
    constructor(initialQuestion) {
        const question = initialQuestion || {};
        const scenario = question.scenario || {};
        const heroHandAliases = [question.heroHand, scenario.heroHand]
            .filter((value) => value !== undefined && value !== null && value !== '')
            .map((value) => String(value));
        if (heroHandAliases.some((value) => value !== heroHandAliases[0])) {
            throw new MultiStreetContinuationError(
                'Hero hand aliases disagree about the signed hand.',
                'TRAINING_INITIAL_HERO_IDENTITY_MISMATCH',
            );
        }
        this.heroCards = exactCardAliases(
            [question.heroCards, scenario.heroCards],
            {
                label: 'Hero cards',
                expectedCount: 2,
                unordered: true,
                code: 'TRAINING_INITIAL_HERO_CARDS_INVALID',
            },
        );
        const derivedHeroHand = handClassFromCards(this.heroCards);
        const declaredHeroHand = heroHandAliases[0] || '';
        if (/^[2-9TJQKA]{2}[so]?$/.test(declaredHeroHand)
            && declaredHeroHand !== derivedHeroHand) {
            throw new MultiStreetContinuationError(
                'Hero hand notation does not match the exact hero cards.',
                'TRAINING_INITIAL_HERO_IDENTITY_MISMATCH',
            );
        }
        this.heroHand = declaredHeroHand || derivedHeroHand;
        this.gameType = scenario.gameType || 'hu_cash';
        this.stackDepth = scenario.stackDepth || 100;
        this.heroPosition = scenario.heroPosition || 'BTN';
        this.villainPosition = scenario.villainPosition || 'BB';

        // A full-hand session can begin on either Flop or Turn. Derive the
        // active street from the canonical question and retain exact street
        // board slices instead of treating every starting board as a Flop.
        const streetAliases = [scenario.street, question.street]
            .filter((value) => value !== undefined && value !== null && value !== '')
            .map((value) => String(value).toLowerCase());
        if (streetAliases.length === 0
            || streetAliases.some((street) => street !== streetAliases[0])
            || !STREET_ORDER.includes(streetAliases[0])) {
            throw new MultiStreetContinuationError(
                'The initial question must declare one consistent postflop street.',
                'TRAINING_INITIAL_STREET_MISMATCH',
            );
        }
        this.currentStreet = streetAliases[0];
        this.streetIndex = STREET_ORDER.indexOf(this.currentStreet);

        const requiredBoardCount = expectedBoardCount(this.currentStreet);
        this.boardCards = exactCardAliases(
            [scenario.boardCards, scenario.board, question.boardCards, question.board],
            {
                label: `${this.currentStreet} board`,
                expectedCount: requiredBoardCount,
                code: 'TRAINING_INITIAL_STREET_BOARD_MISMATCH',
            },
        );
        const allInitialCards = [...this.heroCards, ...this.boardCards].map((card) => card.toLowerCase());
        if (new Set(allInitialCards).size !== allInitialCards.length) {
            throw new MultiStreetContinuationError(
                'Hero and board cards must be globally unique.',
                'TRAINING_INITIAL_DUPLICATE_CARD',
            );
        }

        this.flopCards = this.boardCards.slice(0, 3);
        this.turnCard = this.boardCards[3] || null;
        this.riverCard = this.boardCards[4] || null;

        // Dead cards (hero hand + board — can't be dealt again)
        this.deadCards = new Set();
        this.heroCards.forEach(c => this.deadCards.add(c.toLowerCase()));
        this.boardCards.forEach(c => this.deadCards.add(c.toLowerCase()));

        // Pot geometry is part of the signed solved node. A hidden generic pot
        // would teach different bet sizes and SPRs while keeping the old key.
        const canonicalPot = Number(scenario.pot);
        if (!Number.isFinite(canonicalPot) || canonicalPot <= 0) {
            throw new MultiStreetContinuationError(
                'A multi-street question requires an exact positive pot.',
                'TRAINING_INITIAL_POT_MISSING',
            );
        }
        this.pot = canonicalPot;
        this.initialPot = this.pot;

        // Action history across all streets
        this.streetActions = [];
        this.evHistory = []; // { street, classification, evLoss }

        // Current question reference
        this.currentQuestion = question;

        // Per-street data
        this.streetData = [{
            street: this.currentStreet,
            boardCards: [...this.boardCards],
            pot: this.pot,
            question,
        }];
    }

    /**
     * Is the hand complete (no more streets)?
     */
    get isComplete() {
        // River is still an unanswered decision after it is dealt. Completion
        // is explicit and occurs only when that River action is recorded (or
        // an earlier action has no certified continuation).
        return this.currentStreet === 'done';
    }

    /**
     * Get the next street name
     */
    get nextStreetName() {
        if (this.streetIndex >= 2) return null;
        return STREET_ORDER[this.streetIndex + 1];
    }

    /**
     * Record the hero's action at the current street
     */
    recordAction(actionCode, classification, evLoss) {
        if (this.isComplete) return false;

        const recordedStreet = this.currentStreet;
        if (this.streetActions.some((entry) => entry.street === recordedStreet)) {
            throw new MultiStreetContinuationError(
                `The ${recordedStreet} decision has already been recorded.`,
                'TRAINING_CONTINUATION_DUPLICATE_DECISION',
            );
        }
        const scenario = this.currentQuestion?.scenario || {};
        const continuationAction = scenario.nextStreetContinuationAction || null;
        const continuesExactLine = recordedStreet !== 'river'
            && continuationAction
            && String(actionCode) === String(continuationAction);
        let projectedPot = this.pot;
        if (continuesExactLine) {
            const sourceActionCode = scenario.nextStreetContinuationSourceAction || actionCode;
            const actionUnits = scenario.solverActionUnits || 'percent';
            let exactIncrementBb = null;
            if (actionUnits === 'chips') {
                if (!/^b[1-9]\d*$/.test(String(sourceActionCode))) {
                    throw new MultiStreetContinuationError(
                        'The signed continuation carries a non-canonical Pio action token.',
                        'TRAINING_CONTINUATION_ACTION_SIZE_INVALID',
                    );
                }
                const matchingPolicyActions = (this.currentQuestion?.solverPolicy?.actions || [])
                    .filter((action) => action?.legal !== false
                        && String(action?.id || '') === String(continuationAction)
                        && String(action?.sourceCode || '') === String(sourceActionCode));
                const policyAction = matchingPolicyActions.length === 1
                    ? matchingPolicyActions[0]
                    : null;
                exactIncrementBb = Number(policyAction?.size?.bigBlinds);
                if (policyAction?.size?.exact !== true
                    || !Number.isFinite(exactIncrementBb)
                    || exactIncrementBb <= 0) {
                    throw new MultiStreetContinuationError(
                        'The signed continuation is missing its exact action increment.',
                        'TRAINING_CONTINUATION_ACTION_SIZE_MISSING',
                    );
                }
            }
            projectedPot = computePotAfterAction(this.pot, sourceActionCode, {
                actionUnits,
                facingBet: scenario.villainBet,
                exactIncrementBb,
            });
            if (!Number.isFinite(projectedPot) || projectedPot <= 0) {
                throw new MultiStreetContinuationError(
                    'The signed continuation action cannot produce an exact pot.',
                    'TRAINING_CONTINUATION_ACTION_SIZE_INVALID',
                );
            }
        }

        // Validate the exact continuation projection before mutating history.
        // A corrupt size must not leave a half-recorded client hand.
        this.streetActions.push({
            street: recordedStreet,
            action: actionCode,
            pot: this.pot,
        });

        this.evHistory.push({
            street: recordedStreet,
            classification,
            evLoss,
        });

        // There is no street after River, but the River verdict must be in the
        // history and end-of-hand summary before the hand becomes complete.
        if (recordedStreet === 'river') {
            this.currentStreet = 'done';
            return true;
        }

        // A solved next street is valid only for the exact action line that
        // produced it. If this node has no certified continuation, or the user
        // chose another action, finish the hand instead of skipping hidden
        // decisions and transplanting a different solve.
        if (!continuesExactLine) {
            this.currentStreet = 'done';
            return true;
        }

        this.pot = projectedPot;
        return true;
    }

    /**
     * End a hand only after the server has definitively proved that the exact
     * persisted action has no solved child runout. This is not a transport
     * fallback and does not invent another card, action, pot, or strategy.
     */
    finishAtSolverBoundary(code) {
        if (this.isComplete) return false;
        if (code !== 'TRAINING_CONTINUATION_SOLVER_MISS') {
            throw new MultiStreetContinuationError(
                'Only a definitive exact-solver miss can end this continuation.',
                'TRAINING_CONTINUATION_BOUNDARY_INVALID',
            );
        }
        const priorDecision = this.streetActions.at(-1);
        if (!priorDecision || priorDecision.street !== this.currentStreet) {
            throw new MultiStreetContinuationError(
                'A persisted decision is required before ending at a solver boundary.',
                'TRAINING_CONTINUATION_PARENT_DECISION_MISMATCH',
            );
        }
        this.continuationBoundary = {
            code,
            street: this.currentStreet,
            action: priorDecision.action,
        };
        this.currentStreet = 'done';
        return true;
    }

    /**
     * Atomically adopt a server-authoritative next-street question.
     *
     * The response is rejected before any local state changes unless its
     * street, appended card, top-level board, and canonical question board are
     * the one exact continuation of the current hand.
     */
    applyServerContinuation(continuation) {
        if (this.isComplete) {
            throw new MultiStreetContinuationError(
                'A completed hand cannot accept another street.',
                'TRAINING_CONTINUATION_HAND_COMPLETE',
            );
        }

        const expectedStreet = this.nextStreetName;
        if (!expectedStreet) {
            throw new MultiStreetContinuationError(
                'The current street has no legal continuation.',
                'TRAINING_CONTINUATION_STREET_UNAVAILABLE',
            );
        }

        const priorDecision = this.streetActions.at(-1);
        const expectedContinuationAction = this.currentQuestion?.scenario?.nextStreetContinuationAction;
        if (
            !priorDecision
            || priorDecision.street !== this.currentStreet
            || !expectedContinuationAction
            || String(priorDecision.action) !== String(expectedContinuationAction)
        ) {
            throw new MultiStreetContinuationError(
                'The prior street does not contain the exact recorded continuation action.',
                'TRAINING_CONTINUATION_PARENT_DECISION_MISMATCH',
            );
        }

        const question = continuation?.question;
        if (!question || typeof question !== 'object') {
            throw new MultiStreetContinuationError(
                'The server continuation is missing its canonical question.',
                'TRAINING_CONTINUATION_QUESTION_MISSING',
            );
        }

        const responseStreet = String(continuation?.street || '').toLowerCase();
        const canonicalStreetSources = [question.scenario?.street, question.street]
            .filter((value) => value !== undefined && value !== null && value !== '')
            .map((value) => String(value).toLowerCase());
        if (responseStreet !== expectedStreet
            || canonicalStreetSources.length === 0
            || canonicalStreetSources.some((street) => street !== expectedStreet)) {
            throw new MultiStreetContinuationError(
                `Expected a ${expectedStreet} continuation.`,
                'TRAINING_CONTINUATION_STREET_MISMATCH',
            );
        }

        const newCard = normalizeCard(continuation?.newCard);
        if (!newCard || this.deadCards.has(newCard.toLowerCase())) {
            throw new MultiStreetContinuationError(
                'The continuation card is invalid or already in the hand.',
                'TRAINING_CONTINUATION_CARD_INVALID',
            );
        }

        const expectedBoard = [...this.boardCards, newCard];
        if (expectedBoard.length !== expectedBoardCount(expectedStreet)) {
            throw new MultiStreetContinuationError(
                'The current board cannot advance to the expected street.',
                'TRAINING_CONTINUATION_BOARD_LENGTH_INVALID',
            );
        }

        const responseBoard = this._parseBoardCards(continuation?.boardCards);
        if (!cardsEqual(responseBoard, expectedBoard)) {
            throw new MultiStreetContinuationError(
                'The response board is not the exact continuation of the current board.',
                'TRAINING_CONTINUATION_BOARD_MISMATCH',
            );
        }

        const canonicalBoardSources = [
            question.scenario?.boardCards,
            question.scenario?.board,
            question.boardCards,
            question.board,
        ].filter((value) => value !== undefined && value !== null && value !== '');
        if (canonicalBoardSources.length === 0
            || canonicalBoardSources.some((value) => !cardsEqual(this._parseBoardCards(value), expectedBoard))) {
            throw new MultiStreetContinuationError(
                'The canonical question board does not match the server continuation.',
                'TRAINING_CONTINUATION_QUESTION_BOARD_MISMATCH',
            );
        }

        const allCardsInHand = [...this.heroCards, ...expectedBoard].map((card) => card.toLowerCase());
        if (new Set(allCardsInHand).size !== allCardsInHand.length) {
            throw new MultiStreetContinuationError(
                'The continuation contains duplicate cards.',
                'TRAINING_CONTINUATION_DUPLICATE_CARD',
            );
        }

        // All validation completed. Only now mutate the hand, adopting the
        // server question's canonical state rather than reconstructing it in
        // the browser.
        const canonicalScenario = question.scenario || {};
        const canonicalPot = Number(canonicalScenario.pot ?? canonicalScenario.potSize);
        const canonicalStackDepth = Number(canonicalScenario.stackDepth ?? question.stackDepth);
        const canonicalHeroPosition = String(canonicalScenario.heroPosition || '').toUpperCase();
        const canonicalVillainPosition = String(canonicalScenario.villainPosition || '').toUpperCase();
        const canonicalGameType = String(canonicalScenario.gameType || this.gameType);
        const canonicalHeroHand = String(question.heroHand || canonicalScenario.heroHand || '');
        const canonicalHeroCards = [question.heroCards, canonicalScenario.heroCards]
            .map((value) => this._parseBoardCards(value))
            .find((cards) => cards.length > 0) || [];
        if (!Number.isFinite(canonicalPot) || canonicalPot <= 0) {
            throw new MultiStreetContinuationError(
                'The canonical continuation is missing exact pot geometry.',
                'TRAINING_CONTINUATION_POT_MISSING',
            );
        }
        if (!Number.isFinite(canonicalStackDepth) || canonicalStackDepth <= 0) {
            throw new MultiStreetContinuationError(
                'The canonical continuation is missing exact stack geometry.',
                'TRAINING_CONTINUATION_STACK_MISSING',
            );
        }
        if (
            canonicalHeroPosition !== String(this.heroPosition).toUpperCase()
            || canonicalVillainPosition !== String(this.villainPosition).toUpperCase()
            || canonicalGameType !== String(this.gameType)
            || canonicalHeroHand !== String(this.heroHand)
            || (canonicalHeroCards.length > 0 && !cardsEqual(canonicalHeroCards, this.heroCards))
        ) {
            throw new MultiStreetContinuationError(
                'The canonical continuation belongs to a different hand or seat configuration.',
                'TRAINING_CONTINUATION_HAND_IDENTITY_MISMATCH',
            );
        }

        this.boardCards = expectedBoard;
        this.flopCards = expectedBoard.slice(0, 3);
        this.turnCard = expectedBoard[3] || null;
        this.riverCard = expectedBoard[4] || null;
        this.deadCards.add(newCard.toLowerCase());
        this.streetIndex = STREET_ORDER.indexOf(expectedStreet);
        this.currentStreet = expectedStreet;
        this.pot = canonicalPot;
        this.stackDepth = canonicalStackDepth;
        this.heroHand = canonicalHeroHand;
        this.currentQuestion = question;
        this.streetData.push({
            street: expectedStreet,
            boardCards: [...expectedBoard],
            pot: this.pot,
            question,
            newCard,
        });

        return question;
    }

    /**
     * Get hand summary for end-of-hand review
     */
    getHandSummary() {
        const totalEVLoss = this.evHistory.reduce((sum, e) => sum + (e.evLoss || 0), 0);
        const worstStreet = this.evHistory.reduce(
            (worst, e) => (e.evLoss > (worst?.evLoss || 0) ? e : worst),
            null
        );

        return {
            heroHand: this.heroHand,
            heroCards: this.heroCards,
            flopCards: this.flopCards,
            allBoardCards: this.boardCards,
            streets: this.streetData.map(s => ({
                street: s.street,
                boardCards: s.boardCards,
                pot: s.pot,
                newCard: s.newCard || null,
            })),
            actions: this.streetActions,
            evHistory: this.evHistory,
            totalEVLoss,
            worstStreet,
            streetsPlayed: this.streetData.length,
            heroPosition: this.heroPosition,
            villainPosition: this.villainPosition,
            continuationBoundary: this.continuationBoundary || null,
        };
    }

    // ●●● PRIVATE UTILS ●●●

    _parseBoardCards(boardStr) {
        const parsed = parseExactCardSource(boardStr);
        return parsed.provided && parsed.valid ? parsed.cards : [];
    }
}
