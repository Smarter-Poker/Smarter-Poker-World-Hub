/**
 * Calibrated Satori typography helpers for 1200x630 Club Arena OG invite cards
 * (/api/og/club-tournament and /api/og/club-game).
 *
 * The forged-chrome backdrop (public/images/og/club-arena-invite-bg.jpg) gives:
 *   - Upper diamond-quilted header bay: y: 90..226 (height: 136px, width: 908px)
 *   - Machined chrome horizontal divider: y: 228..248
 *   - Lower smoked-glass stat bays: y: 266..534 (3 bays, ~250px inner width each)
 *
 * Every title, subtitle, and fact value is sanitized and sized by visual width
 * (accounting for wide uppercase letters like M/W) so long real-world names
 * such as "Satellite Into Sunday Funday Mini Main Event" (44 chars) render on
 * a single crisp line inside the quilted bay without ever wrapping onto the
 * chrome divider bar or clipping against the side rails.
 */

export function cardText(value, fallback = '') {
    const cleaned = String(value || '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[^\u0020-\u007E\u00A0-\u017F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
}

/**
 * Estimates horizontal visual width in average-character units so ALL-CAPS or
 * wide-glyph titles step down cleanly before wrapping in Satori's Noto Sans.
 */
export function visualLength(str) {
    let units = 0;
    for (const ch of String(str || '')) {
        if (ch === 'W' || ch === 'M') units += 1.35;
        else if (ch >= 'A' && ch <= 'Z') units += 1.15;
        else if (ch === 'i' || ch === 'l' || ch === 'I' || ch === ' ' || ch === '.' || ch === '|') units += 0.65;
        else units += 1;
    }
    return units;
}

/**
 * Fits a header title cleanly onto one line inside the 908px x 136px header bay.
 * Guarantees fontSize <= 36px for any 36+ character title and allows up to 48
 * characters without premature truncation.
 */
export function fitOgTitle(raw, fallback = '') {
    const cleaned = cardText(raw, fallback);
    const text = cleaned.length > 48 ? `${cleaned.slice(0, 45).trimEnd()}...` : cleaned;
    const effectiveLen = Math.max(text.length, Math.ceil(visualLength(text)));
    const fontSize =
        effectiveLen >= 48
            ? 28
            : effectiveLen >= 42
              ? 32
              : effectiveLen >= 36
                ? 36
                : effectiveLen >= 29
                  ? 42
                  : effectiveLen >= 23
                    ? 46
                    : 52;
    return { text, fontSize };
}

/**
 * Fits the header subtitle ("NLH Satellite | Club Name") onto one line inside
 * the 908px upper header bay below the title.
 */
export function fitOgSubtitle(raw, fallback = '') {
    const cleaned = cardText(raw, fallback);
    const text = cleaned.length > 64 ? `${cleaned.slice(0, 61).trimEnd()}...` : cleaned;
    const effectiveLen = Math.max(text.length, Math.ceil(visualLength(text)));
    const fontSize = effectiveLen >= 58 ? 18 : effectiveLen >= 48 ? 20 : effectiveLen >= 40 ? 22 : 24;
    return { text, fontSize };
}

/**
 * Fits a recessed Fact bay value (~250px inner width in a 3-column row).
 * Keeps standard values like "When Full (9 Players)" (21 chars) and
 * "Sun Nov 22, 10:30 PM CT" (23 chars) on a single crisp line.
 */
export function fitOgFactValue(raw, fallback = '') {
    const cleaned = cardText(raw, fallback);
    const text = cleaned.length > 36 ? `${cleaned.slice(0, 33).trimEnd()}...` : cleaned;
    const effectiveLen = Math.max(text.length, Math.ceil(visualLength(text)));
    const fontSize =
        effectiveLen >= 25
            ? 16
            : effectiveLen >= 21
              ? 19
              : effectiveLen >= 17
                ? 22
                : effectiveLen >= 13
                  ? 26
                  : 32;
    return { text, fontSize, singleLine: effectiveLen <= 24 };
}
