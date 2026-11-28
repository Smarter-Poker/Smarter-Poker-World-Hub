import { extractQuestionCardImagePaths } from './pokerCardText.mjs';

const preloadedCardUrls = new Set();

/**
 * Warms the browser image cache with playing-card PNGs for a question so that
 * when the player advances, hero and board cards paint instantaneously (0ms).
 */
export function preloadQuestionCards(questionOrText) {
    if (typeof window === 'undefined' || typeof window.Image !== 'function') return [];
    const paths = extractQuestionCardImagePaths(questionOrText);
    const queued = [];
    for (const url of paths) {
        if (preloadedCardUrls.has(url)) continue;
        preloadedCardUrls.add(url);
        try {
            const img = new window.Image();
            img.decoding = 'async';
            img.src = url;
            queued.push(url);
        } catch (_err) {
            // Best-effort cache warm only.
        }
    }
    return queued;
}

/**
 * Preloads cards for the next `lookahead` questions after `currentIndex`.
 */
export function preloadTriviaDeckAhead(questions, currentIndex = 0, lookahead = 2) {
    if (!Array.isArray(questions) || questions.length === 0) return [];
    const queued = [];
    const start = Math.max(0, Number(currentIndex) || 0);
    for (let offset = 1; offset <= lookahead; offset += 1) {
        const nextQuestion = questions[start + offset];
        if (!nextQuestion) break;
        queued.push(...preloadQuestionCards(nextQuestion));
    }
    return queued;
}
