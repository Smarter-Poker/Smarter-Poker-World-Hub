/**
 * Pure helpers for Trivia Track 3:
 * - XML-safe SVG result card generation (#SmarterCasinoRealism / #ClubArenaConsole inks)
 * - Wordle-style copyable score grid & share text (no bare emoji, no em-dashes)
 * - Canonical "Train This Spot" links to real pages/hub/training/* routes
 */

import {
    TRAINING_SPOT_MAP,
    DEFAULT_TRAINING_SPOT as CANONICAL_DEFAULT_TRAINING_SPOT,
    getTrainingSpotForCategory,
} from './trainingSpotMap.mjs';

export const VALID_CHALLENGE_STAKES = Object.freeze([10, 25, 50, 100]);
export const TRIVIA_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTriviaUuid(value) {
    return typeof value === 'string' && TRIVIA_UUID_RE.test(value.trim());
}

export const TRAINING_SPOT_BY_CATEGORY = Object.freeze(
    Object.fromEntries(
        Object.entries(TRAINING_SPOT_MAP).map(([category, spot]) => [
            category,
            Object.freeze({
                label: spot.label,
                href: spot.href,
                specialty: spot.specialty,
                categoryLabel: spot.categoryLabel,
            }),
        ])
    )
);

export const DEFAULT_TRAINING_SPOT = Object.freeze({
    label: CANONICAL_DEFAULT_TRAINING_SPOT.label,
    href: CANONICAL_DEFAULT_TRAINING_SPOT.href,
    specialty: CANONICAL_DEFAULT_TRAINING_SPOT.specialty,
    categoryLabel: CANONICAL_DEFAULT_TRAINING_SPOT.categoryLabel,
});

export function resolveTrainingSpotForCategory(category) {
    const key = String(category || '').trim().toLowerCase();
    const spot = getTrainingSpotForCategory(key);
    return TRAINING_SPOT_BY_CATEGORY[key] || {
        label: spot.label,
        href: spot.href,
        specialty: spot.specialty,
        categoryLabel: spot.categoryLabel,
    };
}

export function escapeSvgText(value, maxLength = 64) {
    const cleaned = String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
    return cleaned
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function clampNonNegativeInt(value, max = 999999) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.min(Math.trunc(num), max);
}

export function computeTriviaGrade(score, total) {
    if (!total || total <= 0) return { letter: 'S', label: 'Complete', accent: '#45adff' };
    const pct = Math.round((Math.min(score, total) / total) * 100);
    if (pct >= 100) return { letter: 'S', label: 'Flawless', accent: '#ffd700' };
    if (pct >= 90) return { letter: 'A', label: 'Sharp', accent: '#35d95a' };
    if (pct >= 80) return { letter: 'B', label: 'Solid', accent: '#45adff' };
    if (pct >= 70) return { letter: 'C', label: 'Steady', accent: '#e4e7ec' };
    if (pct >= 60) return { letter: 'D', label: 'Grinding', accent: '#9aa5b3' };
    return { letter: 'F', label: 'Study Spot', accent: '#f02849' };
}

export function formatModeTitle(mode) {
    const raw = String(mode || 'daily').trim().toLowerCase();
    const map = {
        daily: 'Daily Trivia',
        arcade: 'Quick Stakes',
        pvp: '1v1 PvP Duel',
        tournaments: 'Nightly Tournament',
        tournament: 'Nightly Tournament',
        endless: 'Endless Streak',
        survival: 'Survival',
        mixed: 'Mixed Bag',
        'time-attack': 'Time Attack',
        gto: 'GTO Scenarios',
        icm: 'ICM Situations',
        mtt: 'MTT Situations',
        cash: 'Cash Game',
        history: 'Poker History',
        rules: 'Poker Rules',
        pro: 'Pro Profiles',
    };
    if (map[raw]) return map[raw];
    return raw
        .replace(/[-_]+/g, ' ')
        .replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
        .slice(0, 32) || 'Poker Trivia';
}

/**
 * Normalize per-question grid codes: 'C' (correct), 'W' (wrong), 'S' (skipped).
 */
export function normalizeGridString(grid, score, total) {
    const raw = String(grid || '').toUpperCase().replace(/[^CWS]/g, '').slice(0, 20);
    if (raw.length > 0) return raw;
    const count = Math.min(Math.max(total || 0, 0), 20);
    if (count === 0) return '';
    const hits = Math.min(Math.max(score || 0, 0), count);
    return 'C'.repeat(hits) + 'W'.repeat(count - hits);
}

/**
 * Wordle-style copyable score grid (ASCII/clean Unicode blocks, zero bare emoji).
 */
export function buildWordleShareText({
    mode = 'daily',
    score = 0,
    total = 10,
    diamonds = 0,
    streak = 0,
    grid = '',
    url = 'https://smarter.poker/hub/trivia',
} = {}) {
    const safeScore = clampNonNegativeInt(score, 9999);
    const safeTotal = clampNonNegativeInt(total, 9999);
    const safeDiamonds = clampNonNegativeInt(diamonds, 999999);
    const safeStreak = clampNonNegativeInt(streak, 9999);
    const modeTitle = formatModeTitle(mode);
    const grade = computeTriviaGrade(safeScore, safeTotal);
    const pct = safeTotal > 0 ? Math.round((Math.min(safeScore, safeTotal) / safeTotal) * 100) : 100;
    const normalizedGrid = normalizeGridString(grid, safeScore, safeTotal);

    const visualGrid = normalizedGrid
        ? normalizedGrid.split('').map((c) => (c === 'C' ? '[+]' : c === 'S' ? '[-]' : '[x]')).join(' ')
        : '';

    const lines = [
        `Smarter.Poker Trivia | ${modeTitle}`,
        safeTotal > 0
            ? `Grade ${grade.letter} (${grade.label}) | ${safeScore}/${safeTotal} Correct (${pct}%)`
            : `Score: ${safeScore} Correct`,
    ];
    if (visualGrid) lines.push(visualGrid);
    const extras = [];
    if (safeDiamonds > 0) extras.push(`+${safeDiamonds} Diamonds`);
    if (safeStreak > 0) extras.push(`${safeStreak} Day Streak`);
    if (extras.length > 0) lines.push(extras.join(' | '));
    lines.push(url);
    return lines.join('\n');
}

export function buildResultCardSvg({
    mode = 'daily',
    score = 0,
    total = 10,
    diamonds = 0,
    streak = 0,
    player = 'Smarter.Poker Player',
    grid = '',
    verified = false,
    verificationId = '',
} = {}) {
    const safeScore = clampNonNegativeInt(score, 9999);
    const safeTotal = clampNonNegativeInt(total, 9999);
    const safeDiamonds = clampNonNegativeInt(diamonds, 999999);
    const safeStreak = clampNonNegativeInt(streak, 9999);
    const modeTitle = escapeSvgText(formatModeTitle(mode), 36);
    const safePlayer = escapeSvgText(player || 'Smarter.Poker Player', 36);
    const grade = computeTriviaGrade(safeScore, safeTotal);
    const pct = safeTotal > 0 ? Math.round((Math.min(safeScore, safeTotal) / safeTotal) * 100) : 100;
    const scoreLine = safeTotal > 0 ? `${safeScore} / ${safeTotal}` : `${safeScore}`;
    const normalizedGrid = normalizeGridString(grid, safeScore, safeTotal);

    const isVerified = verified === true;
    const safeRef = escapeSvgText(verificationId || '', 16);
    const sealText = isVerified
        ? (safeRef ? `VERIFIED RESULT | #${safeRef}` : 'VERIFIED RESULT')
        : 'SAMPLE PREVIEW | UNVERIFIED';
    const sealStroke = isVerified ? '#35d95a' : '#f02849';
    const sealColor = isVerified ? '#35d95a' : '#ffd700';

    const tileSize = 36;
    const tileGap = 10;
    const cells = normalizedGrid.split('').slice(0, 15);
    const tilesSvg = cells.map((cell, idx) => {
        const x = 64 + idx * (tileSize + tileGap);
        const fill = cell === 'C' ? '#35d95a' : cell === 'S' ? '#6d747c' : '#f02849';
        const glyph = cell === 'C' ? 'OK' : cell === 'S' ? '--' : 'X';
        return `<g transform="translate(${x}, 406)">`
            + `<rect width="${tileSize}" height="${tileSize}" rx="4" fill="#050607" stroke="${fill}" stroke-width="2" />`
            + `<text x="${tileSize / 2}" y="23" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" font-weight="700" fill="${fill}">${glyph}</text>`
            + `</g>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Smarter.Poker Trivia Result Card">
  <rect width="1200" height="630" fill="#050607" />
  <rect x="28" y="28" width="1144" height="574" rx="12" fill="#000000" stroke="#6d747c" stroke-width="2" />
  <rect x="44" y="44" width="1112" height="542" rx="8" fill="none" stroke="${grade.accent}" stroke-width="1.5" stroke-opacity="0.65" />
  <text x="64" y="96" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="#45adff">SMARTER.POKER TRIVIA</text>
  <rect x="430" y="68" width="340" height="36" rx="6" fill="#050607" stroke="${sealStroke}" stroke-width="2" />
  <text x="600" y="92" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" font-weight="800" letter-spacing="1.2" fill="${sealColor}">${sealText}</text>
  <text x="1136" y="96" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" font-weight="600" fill="#9aa5b3">${modeTitle}</text>
  <line x1="64" y1="120" x2="1136" y2="120" stroke="#6d747c" stroke-width="1" stroke-opacity="0.5" />
  <text x="64" y="182" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="30" font-weight="700" fill="#f4f7fb">${safePlayer}</text>
  <text x="64" y="286" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="84" font-weight="800" fill="#f4f7fb">${scoreLine}</text>
  <text x="64" y="336" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="28" font-weight="600" fill="#e4e7ec">Accuracy ${pct}%  |  Grade ${grade.letter} (${escapeSvgText(grade.label, 24)})</text>
  <rect x="928" y="160" width="208" height="208" rx="12" fill="#050607" stroke="${grade.accent}" stroke-width="3" />
  <text x="1032" y="288" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="112" font-weight="800" fill="${grade.accent}">${grade.letter}</text>
  <text x="1032" y="336" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="700" fill="#e4e7ec">${escapeSvgText(grade.label, 20)}</text>
  <text x="64" y="390" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="18" font-weight="600" letter-spacing="1.5" fill="#9aa5b3">QUESTION LEDGER</text>
  ${tilesSvg}
  <line x1="64" y1="484" x2="1136" y2="484" stroke="#6d747c" stroke-width="1" stroke-opacity="0.5" />
  <text x="64" y="538" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="700" fill="#ffd700">+${safeDiamonds} Diamonds</text>
  <text x="380" y="538" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="700" fill="#c8ffd2">${safeStreak} Day Streak</text>
  <text x="1136" y="538" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="600" fill="#45adff">smarter.poker/hub/trivia</text>
</svg>`;
}
