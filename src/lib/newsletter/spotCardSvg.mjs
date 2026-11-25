/**
 * Smarter.Poker `Spot Of The Week` poker-felt card graphic (pure vector SVG).
 *
 * ZERO `<text>` / `<tspan>` elements: headless Linux `librsvg` in serverless
 * containers can lack fontconfig fonts, so every rank glyph (A K Q J T 9..2) and
 * every suit pip is drawn with `<path>`, `<polygon>`, `<rect>` and `<circle>`
 * geometry. The output is identical on every host.
 *
 * Layout (600x240): Hero cards (2 NLH / 4 PLO4 / 5 PLO5) on the left, a Vanguard
 * diamond chip divider, and the 5-slot Community Board on the right. Empty board
 * slots render as Vanguard card backs.
 *
 * Palette law: no yellow, no purple. Four-color suits on white faces.
 */

const SUIT_COLORS = {
    s: '#0f172a', // spade: deep obsidian
    h: '#dc2626', // heart: crimson
    d: '#2563eb', // diamond: royal blue
    c: '#0d9488', // club: emerald teal
};

const SUIT_BY_SYMBOL = {
    '\u2660': 's',
    '\u2665': 'h',
    '\u2666': 'd',
    '\u2663': 'c',
    s: 's',
    h: 'h',
    d: 'd',
    c: 'c',
};

// Rank glyphs drawn as stroked vector paths on a 10 x 14 grid.
const NINE_PATH =
    'M8.8 6 C8.8 8.2 7 9 5 9 C3 9 1.2 8 1.2 5 C1.2 2.5 2.8 0.8 5 0.8 C7.2 0.8 8.8 2.5 8.8 6 C8.8 10 7.5 13.2 4.8 13.2 C3.2 13.2 2 12.4 1.6 11';

const RANK_PATHS = {
    A: ['M0.8 14 L5 0.8 L9.2 14 M2.4 9.4 H7.6'],
    K: ['M1.5 0.8 V14 M9 0.8 L1.5 8 M4 5.6 L9.2 14'],
    Q: [
        'M5 0.8 C1.6 0.8 1 3 1 7 C1 11 1.6 13.2 5 13.2 C8.4 13.2 9 11 9 7 C9 3 8.4 0.8 5 0.8 Z M5.8 10.4 L9.6 14.6',
    ],
    J: ['M8 0.8 V9.4 C8 12.4 6.6 13.4 4.8 13.4 C3 13.4 1.6 12.5 1.3 10'],
    T: ['M0.8 1 H9.2 M5 1 V14'],
    9: [NINE_PATH],
    8: [
        'M5 0.8 C2.8 0.8 1.6 2 1.6 3.8 C1.6 5.6 3 6.6 5 7 C7 7.4 8.6 8.4 8.6 10.3 C8.6 12.2 7 13.3 5 13.3 C3 13.3 1.4 12.2 1.4 10.3 C1.4 8.4 3 7.4 5 7 C7 6.6 8.4 5.6 8.4 3.8 C8.4 2 7.2 0.8 5 0.8 Z',
    ],
    7: ['M1 1 H9 L4 14'],
    6: [NINE_PATH],
    5: [
        'M8.6 1 H2.2 L1.6 6.6 C2.6 5.8 3.6 5.5 4.8 5.5 C7.2 5.5 8.8 7.2 8.8 9.5 C8.8 12 7.2 13.3 4.8 13.3 C3 13.3 1.8 12.6 1.2 11.4',
    ],
    4: ['M7 14 V0.8 L0.8 9.6 H9.4'],
    3: [
        'M1.4 2.4 C2.2 1.2 3.4 0.8 4.8 0.8 C6.8 0.8 8.2 1.8 8.2 3.5 C8.2 5.3 6.8 6.4 4.6 6.4 C7 6.4 8.8 7.6 8.8 9.8 C8.8 12 7 13.3 4.8 13.3 C3.2 13.3 1.8 12.7 1 11.4',
    ],
    2: [
        'M1.4 3.6 C1.6 1.8 3 0.8 5 0.8 C7.2 0.8 8.5 2 8.5 3.8 C8.5 5.6 7.4 6.7 5.6 8.5 L1 13.2 H9.2',
    ],
};

const HEART_PATH =
    'M0 9 C-3 6 -10 2 -10 -3 C-10 -7 -7 -9 -4.5 -9 C-2.3 -9 -0.7 -7.8 0 -6 C0.7 -7.8 2.3 -9 4.5 -9 C7 -9 10 -7 10 -3 C10 2 3 6 0 9 Z';

function n(value) {
    return Number(value.toFixed(2));
}

/** Parse a card token like `A♠`, `T♦`, `10h` or `''` into `{ rank, suit }` (or null when empty/invalid). */
export function parseCardToken(token) {
    const raw = String(token == null ? '' : token).trim();
    if (!raw) return null;
    const chars = Array.from(raw);
    const suit = SUIT_BY_SYMBOL[chars[chars.length - 1]] || SUIT_BY_SYMBOL[chars[chars.length - 1].toLowerCase?.()];
    if (!suit) return null;
    let rank = chars.slice(0, -1).join('').toUpperCase();
    if (rank === '10') rank = 'T';
    if (!RANK_PATHS[rank]) return null;
    return { rank, suit };
}

/** Vector suit pip centered at (cx, cy) with half-extent `size` (pip spans about 2*size). */
function suitPip(suit, cx, cy, size) {
    const s = size / 10;
    const fill = SUIT_COLORS[suit];
    const open = `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(s)})" fill="${fill}">`;
    switch (suit) {
        case 'h':
            return `${open}<path d="${HEART_PATH}"/></g>`;
        case 'd':
            return `${open}<polygon points="0,-10 7,0 0,10 -7,0"/></g>`;
        case 's':
            return (
                `${open}<g transform="translate(0 -1.2) scale(0.88 -0.88)"><path d="${HEART_PATH}"/></g>` +
                `<polygon points="0,2 -3.6,10 3.6,10"/></g>`
            );
        case 'c':
        default:
            return (
                `${open}<circle cx="0" cy="-5.2" r="4.8"/><circle cx="-5.3" cy="2" r="4.8"/>` +
                `<circle cx="5.3" cy="2" r="4.8"/><circle cx="0" cy="0" r="3.4"/>` +
                `<polygon points="0,1 -3.6,10 3.6,10"/></g>`
            );
    }
}

/** Vector rank glyph whose top-left corner sits at (x, y) and whose height is `gh`. */
function rankGlyph(rank, x, y, gh, suit) {
    const paths = RANK_PATHS[rank];
    if (!paths) return '';
    const s = gh / 14;
    const color = SUIT_COLORS[suit];
    const rot = rank === '6' ? ' transform="rotate(180 5 7)"' : '';
    const body = paths
        .map((d) => `<path d="${d}"${rot}/>`)
        .join('');
    return (
        `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" fill="none" stroke="${color}" ` +
        `stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
    );
}

function cardFace(card, x, y, w, h, id) {
    const rx = n(Math.max(4, w * 0.1));
    const gh = h * 0.2;
    const gx = x + w * 0.1;
    const gy = y + h * 0.075;
    const miniSize = Math.max(3.6, w * 0.082);
    const centerSize = Math.max(8, Math.min(w, h) * 0.26);
    return (
        `<g id="${id}">` +
        `<rect x="${n(x + 1.6)}" y="${n(y + 2.6)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="#000000" opacity="0.38"/>` +
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>` +
        rankGlyph(card.rank, gx, gy, gh, card.suit) +
        suitPip(card.suit, gx + gh * 0.36, gy + gh + miniSize + 2.2, miniSize) +
        suitPip(card.suit, x + w * 0.58, y + h * 0.6, centerSize) +
        `</g>`
    );
}

function cardBack(x, y, w, h, id) {
    const rx = n(Math.max(4, w * 0.1));
    const inset = Math.max(3, w * 0.07);
    const ix = x + inset;
    const iy = y + inset;
    const iw = w - inset * 2;
    const ih = h - inset * 2;
    const step = Math.max(7, w * 0.17);
    const lines = [];
    for (let k = -Math.ceil(ih / step); k <= Math.ceil(iw / step); k += 1) {
        const ox = ix + k * step;
        lines.push(`M${n(ox)} ${n(iy)} L${n(ox + ih)} ${n(iy + ih)}`);
        lines.push(`M${n(ox)} ${n(iy + ih)} L${n(ox + ih)} ${n(iy)}`);
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    const d = Math.min(w, h) * 0.2;
    return (
        `<g id="${id}">` +
        `<rect x="${n(x + 1.6)}" y="${n(y + 2.6)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="#000000" opacity="0.38"/>` +
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="#0d1e2d" stroke="#1e3448" stroke-width="1"/>` +
        `<clipPath id="${id}-clip"><rect x="${n(ix)}" y="${n(iy)}" width="${n(iw)}" height="${n(ih)}" rx="${n(rx * 0.6)}"/></clipPath>` +
        `<g clip-path="url(#${id}-clip)"><path d="${lines.join(' ')}" fill="none" stroke="#60a5fa" stroke-opacity="0.32" stroke-width="0.8"/></g>` +
        `<rect x="${n(ix)}" y="${n(iy)}" width="${n(iw)}" height="${n(ih)}" rx="${n(rx * 0.6)}" fill="none" stroke="#4fc1b3" stroke-opacity="0.75" stroke-width="1"/>` +
        `<polygon points="${n(cx)},${n(cy - d)} ${n(cx + d * 0.72)},${n(cy)} ${n(cx)},${n(cy + d)} ${n(cx - d * 0.72)},${n(cy)}" fill="#0d1e2d" stroke="#4fc1b3" stroke-width="1.2"/>` +
        `<polygon points="${n(cx)},${n(cy - d * 0.5)} ${n(cx + d * 0.36)},${n(cy)} ${n(cx)},${n(cy + d * 0.5)} ${n(cx - d * 0.36)},${n(cy)}" fill="#4fc1b3" fill-opacity="0.85"/>` +
        `</g>`
    );
}

function cardOrBack(token, x, y, w, h, id) {
    const card = parseCardToken(token);
    return card ? cardFace(card, x, y, w, h, id) : cardBack(x, y, w, h, id);
}

/**
 * Build the Spot Of The Week poker-felt SVG for a catalog spot.
 * @param {{heroCards?: string[], boardCards?: string[]}} spot
 */
export function buildSpotFeltSvg(spot, { width = 600, height = 240 } = {}) {
    const W = 600;
    const H = 240;
    const heroTokens = Array.isArray(spot?.heroCards) ? spot.heroCards.slice(0, 5) : [];
    const heroCount = heroTokens.length >= 2 ? heroTokens.length : 2;
    while (heroTokens.length < heroCount) heroTokens.push('');
    const boardTokens = Array.isArray(spot?.boardCards) ? spot.boardCards.slice(0, 5) : [];
    while (boardTokens.length < 5) boardTokens.push('');

    // Hero zone: x 44..214 (170 wide), centered vertically. Cards scale by count and fan-overlap.
    const heroZoneX = 44;
    const heroZoneW = 170;
    const heroCw = heroCount <= 2 ? 72 : heroCount === 3 ? 62 : heroCount === 4 ? 54 : 50;
    const heroCh = Math.round(heroCw * 1.42);
    const heroStep = heroCount === 1 ? 0 : Math.min(heroCw + 8, (heroZoneW - heroCw) / (heroCount - 1));
    const heroTotal = heroCw + heroStep * (heroCount - 1);
    const heroX0 = heroZoneX + (heroZoneW - heroTotal) / 2;
    const heroY = (H - heroCh) / 2;
    const heroSvg = heroTokens
        .map((token, i) => cardOrBack(token, heroX0 + i * heroStep, heroY, heroCw, heroCh, `hero-${i}`))
        .join('');

    // Board zone: x 250..556, five 54x77 slots.
    const boardCw = 54;
    const boardCh = 77;
    const boardGap = 7;
    const boardTotal = boardCw * 5 + boardGap * 4;
    const boardX0 = 232 + (324 - boardTotal) / 2 + 12;
    const boardY = (H - boardCh) / 2;
    const boardSvg = boardTokens
        .map((token, i) => cardOrBack(token, boardX0 + i * (boardCw + boardGap), boardY, boardCw, boardCh, `board-${i}`))
        .join('');

    // Divider with Vanguard diamond chip emblem.
    const divX = 232;
    const divSvg =
        `<line x1="${divX}" y1="52" x2="${divX}" y2="${H / 2 - 22}" stroke="url(#spot-divider)" stroke-width="1.5"/>` +
        `<line x1="${divX}" y1="${H / 2 + 22}" x2="${divX}" y2="${H - 52}" stroke="url(#spot-divider)" stroke-width="1.5"/>` +
        `<polygon points="${divX},${H / 2 - 17} ${divX + 13},${H / 2} ${divX},${H / 2 + 17} ${divX - 13},${H / 2}" fill="#0d1e2d" stroke="#4fc1b3" stroke-width="1.6"/>` +
        `<polygon points="${divX},${H / 2 - 9} ${divX + 7},${H / 2} ${divX},${H / 2 + 9} ${divX - 7},${H / 2}" fill="#4fc1b3" fill-opacity="0.9"/>` +
        `<polygon points="${divX},${H / 2 - 3.5} ${divX + 2.6},${H / 2} ${divX},${H / 2 + 3.5} ${divX - 2.6},${H / 2}" fill="#0d1e2d"/>`;

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">` +
        `<defs>` +
        `<linearGradient id="spot-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#060d14"/><stop offset="1" stop-color="#0b1622"/></linearGradient>` +
        `<radialGradient id="spot-felt" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#0a242c"/><stop offset="1" stop-color="#06151c"/></radialGradient>` +
        `<linearGradient id="spot-rail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4fc1b3"/><stop offset="1" stop-color="#1d4d5c"/></linearGradient>` +
        `<linearGradient id="spot-divider" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fc1b3" stop-opacity="0"/><stop offset="1" stop-color="#4fc1b3" stop-opacity="0.65"/></linearGradient>` +
        `</defs>` +
        `<rect width="${W}" height="${H}" rx="14" fill="url(#spot-bg)"/>` +
        `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="13" fill="none" stroke="#1e3448" stroke-width="2"/>` +
        `<rect x="14" y="16" width="${W - 28}" height="${H - 32}" rx="104" fill="url(#spot-felt)" stroke="url(#spot-rail)" stroke-width="5"/>` +
        `<rect x="21" y="23" width="${W - 42}" height="${H - 46}" rx="97" fill="none" stroke="#1d4d5c" stroke-opacity="0.7" stroke-width="1.2"/>` +
        divSvg +
        heroSvg +
        boardSvg +
        `</svg>`
    );
}
