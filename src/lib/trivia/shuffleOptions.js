/**
 * Shuffle answer options so the correct answer isn't always in position A.
 * Shared utility — used by all trivia game pages.
 *
 * @param {Array} questions — array of question objects with { options, correct_index }
 * @returns {Array} — same questions with shuffled options and updated correct_index
 */
export function shuffleOptions(questions) {
    return questions.map(q => {
        const opts = [...q.options];
        const correctText = opts[q.correct_index];
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return { ...q, options: opts, correct_index: opts.indexOf(correctText) };
    });
}
