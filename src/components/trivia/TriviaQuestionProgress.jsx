/**
 * Compact #SMARTERDESIGN segmented progress strip for active Trivia runs.
 * Renders emerald (correct), crimson (wrong), muted (skipped), cobalt (active),
 * and steel (upcoming) segments. Caps rendered pills at 25 for 100-question
 * Endless runs by displaying a centered sliding window.
 */
export default function TriviaQuestionProgress({
    total = 0,
    currentIndex = 0,
    outcomes = [],
    label = 'Question Progress',
}) {
    const safeTotal = Number.isInteger(total) && total > 0 ? total : 0;
    if (safeTotal <= 1) return null;

    const maxSegments = 25;
    let start = 0;
    let end = safeTotal;
    if (safeTotal > maxSegments) {
        const half = Math.floor(maxSegments / 2);
        start = Math.max(0, Math.min(currentIndex - half, safeTotal - maxSegments));
        end = start + maxSegments;
    }

    const segments = [];
    for (let i = start; i < end; i += 1) {
        const outcome = outcomes[i];
        let state = 'upcoming';
        if (outcome === 'correct' || outcome === true) state = 'correct';
        else if (outcome === 'wrong' || outcome === false) state = 'wrong';
        else if (outcome === 'skipped') state = 'skipped';
        else if (i === currentIndex) state = 'current';
        else if (i < currentIndex) state = 'answered';
        segments.push({ index: i, state });
    }

    return (
        <div
            className="trivia-q-progress"
            role="progressbar"
            aria-label={label}
            aria-valuemin={1}
            aria-valuemax={safeTotal}
            aria-valuenow={Math.min(safeTotal, Math.max(1, currentIndex + 1))}
        >
            {segments.map((seg) => (
                <span
                    key={seg.index}
                    className={`trivia-q-progress__seg trivia-q-progress__seg--${seg.state}`}
                    aria-hidden="true"
                />
            ))}
        </div>
    );
}
