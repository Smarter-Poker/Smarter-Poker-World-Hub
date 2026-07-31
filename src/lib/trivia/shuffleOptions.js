/**
 * Shuffle answer options so the correct answer isn't always in position A.
 * Shared utility — used by all trivia game pages.
 *
 * Correctness notes (this function decides whether a player is scored right):
 *  - The old implementation tracked the correct answer by TEXT and re-found it
 *    with opts.indexOf(correctText). Legacy rows predating the STRUCT-04
 *    duplicate-option check could contain two identical option strings, and
 *    indexOf then marked the FIRST copy correct — a player tapping the other
 *    identical option was scored wrong. We now shuffle an index permutation,
 *    so correct_index can never desync from the shuffled options.
 *  - Malformed rows (null options, out-of-range correct_index) used to throw
 *    on the spread and kill the whole question-load path, or silently produce
 *    correct_index: -1 (an unwinnable question). They are now passed through
 *    untouched with a warning.
 *
 * @param {Array} questions — array of question objects with { options, correct_index }
 * @returns {Array} — same questions with shuffled options and updated correct_index
 */
export function shuffleOptions(questions) {
    if (!Array.isArray(questions)) return questions;

    return questions.map(q => {
        if (!q || typeof q !== 'object') return q;

        const opts = q.options;
        const correctIndex = q.correct_index;

        const malformed =
            !Array.isArray(opts) ||
            opts.length < 2 ||
            !Number.isInteger(correctIndex) ||
            correctIndex < 0 ||
            correctIndex >= opts.length;

        if (malformed) {
            console.warn(
                '[shuffleOptions] skipping malformed question',
                q?.id ?? '(no id)',
                `options=${Array.isArray(opts) ? opts.length : typeof opts}`,
                `correct_index=${correctIndex}`
            );
            return q;
        }

        // Shuffle a permutation of indices (Fisher-Yates, unbiased) and carry
        // the correct answer's ORIGINAL index through it. Text is never used
        // to re-find the answer, so duplicate option strings cannot desync it.
        const order = opts.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }

        return {
            ...q,
            options: order.map(i => opts[i]),
            correct_index: order.indexOf(correctIndex),
        };
    });
}

export default shuffleOptions;
