const TERMINAL_QUESTION_STATES = new Set(['answered', 'timeout', 'voided']);

/**
 * Rebuild the browser projection of an account-scoped solo run from the
 * server's resume roster. The projection never invents an answer: only the
 * stored display index and verdict returned by the server are adopted.
 */
export function projectPhase9Recovery(questions) {
    const roster = Array.isArray(questions) ? questions : [];
    const answers = [];
    const verdicts = {};
    const recordedAnswers = [];
    let correctCount = 0;
    let wrongCount = 0;
    let firstOutstanding = -1;

    roster.forEach((question, index) => {
        const answerState = question?.answerState;
        const terminal = TERMINAL_QUESTION_STATES.has(question?.state)
            || (answerState && Number.isInteger(answerState.storedDisplayIndex));

        if (!terminal && firstOutstanding < 0) firstOutstanding = index;
        if (!answerState || !Number.isInteger(answerState.storedDisplayIndex)) return;

        answers[index] = answerState.storedDisplayIndex;
        verdicts[index] = answerState;
        if (typeof question?.id === 'string') {
            recordedAnswers.push({
                questionId: question.id,
                displayIndex: answerState.storedDisplayIndex,
            });
        }
        if (answerState.wasCorrect === true) correctCount += 1;
        else if (!['skip', 'voided'].includes(answerState.outcome)) wrongCount += 1;
    });

    if (firstOutstanding < 0 && roster.length > 0) firstOutstanding = roster.length;

    return {
        complete: roster.length > 0 && firstOutstanding === roster.length,
        questionIndex: Math.max(0, firstOutstanding),
        answers,
        verdicts,
        recordedAnswers,
        correctCount,
        wrongCount,
    };
}

/** Stable Dealer's Choice deal: one card from each category bay in order. */
export function orderDealerChoiceQuestions(questions, categoryOrder) {
    const roster = Array.isArray(questions) ? questions : [];
    const order = Array.isArray(categoryOrder) ? categoryOrder.filter(Boolean) : [];
    if (roster.length < 2 || order.length < 2) return [...roster];

    const buckets = new Map(order.map(category => [category, []]));
    const remainder = [];
    roster.forEach(question => {
        const bucket = buckets.get(question?.displayCategory);
        if (bucket) bucket.push(question);
        else remainder.push(question);
    });

    const rotated = [];
    let dealt = true;
    while (dealt) {
        dealt = false;
        order.forEach(category => {
            const bucket = buckets.get(category);
            if (bucket?.length) {
                rotated.push(bucket.shift());
                dealt = true;
            }
        });
    }
    return rotated.concat(remainder);
}

export const PHASE9_KNOWLEDGE_CONTEXT = Object.freeze({
    arcade: Object.freeze({
        eyebrow: 'Prize Inventory',
        summary: 'A perfect server-graded run unlocks one verified wheel spin. The wheel can award Diamonds, a streak shield, or a free Arcade entry; the server chooses and records the prize before the animation begins.',
        rows: Object.freeze([
            Object.freeze(['Entry', 'Charged Once At Start']),
            Object.freeze(['Perfect Run', 'One Verified Spin']),
            Object.freeze(['Inventory', 'Diamonds, Shield, Free Entry']),
        ]),
    }),
    history: Object.freeze({
        eyebrow: 'Poker Archive',
        summary: 'Work through landmark hands, tournaments, players, and eras. Date or event context is shown when the question record provides it; review the revealed explanation and report any source conflict.',
        rows: Object.freeze([
            Object.freeze(['Dates', 'Event Year When Available']),
            Object.freeze(['Context', 'Event And Era']),
            Object.freeze(['Review', 'Answer And Explanation']),
            Object.freeze(['Corrections', 'Report Question']),
        ]),
    }),
    rules: Object.freeze({
        eyebrow: 'Dealer School',
        summary: 'Separate universal poker procedure from room-specific rulings. Tournament rules, cash-game procedure, and house rules can differ; the served question and its explanation control the graded version.',
        rows: Object.freeze([
            Object.freeze(['Table', 'Dealer Procedure']),
            Object.freeze(['Floor', 'Version-Specific Ruling']),
            Object.freeze(['Source Version', 'Served Explanation Controls']),
            Object.freeze(['Dispute', 'Report Question']),
        ]),
    }),
    pro: Object.freeze({
        eyebrow: 'Championship File',
        summary: 'An editorial quiz based on public tournament records, strategy commentary, and notable hands. Player names identify the subject only and do not imply affiliation, sponsorship, or endorsement.',
        rows: Object.freeze([
            Object.freeze(['Record', 'Public Competition History']),
            Object.freeze(['Context', 'Editorial And Educational']),
            Object.freeze(['Status', 'No Implied Endorsement']),
        ]),
    }),
});
