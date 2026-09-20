/**
 * Compact chrome values without rounding a player-facing balance upward.
 * Question text, poker math and solver output must not use this formatter.
 */
export function formatTriviaDisplayNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    const sign = numeric < 0 ? '-' : '';
    const amount = Math.abs(numeric);
    if (amount < 1000) return `${sign}${Math.trunc(amount)}`;

    const units = [
        { threshold: 1_000_000_000, suffix: 'B' },
        { threshold: 1_000_000, suffix: 'M' },
        { threshold: 1_000, suffix: 'K' },
    ];
    const unit = units.find(candidate => amount >= candidate.threshold);
    const floored = Math.floor((amount / unit.threshold) * 10) / 10;
    const display = Number.isInteger(floored) ? String(floored) : floored.toFixed(1);
    return `${sign}${display}${unit.suffix}`;
}
