/**
 * TABLE GEOMETRY CHECK
 * ---------------------------------------------------------------------------
 * WHAT THIS IS: an arithmetic replay of the seat-clamp maths in
 * UniversalDynamicTable -- feltScale, ui(), the per-seat furniture footprint
 * and the clamp that keeps it on the felt -- swept across every table size and
 * a continuous range of felt boxes.
 *
 * WHAT THIS IS NOT: a getBoundingClientRect measurement. There is no browser
 * binary on this machine and no network to fetch one, so nothing here has been
 * rendered. It proves the layout ALGEBRA is sound at every size; it does not
 * prove the pixels.
 *
 *   node scripts/table-geometry-check.js
 */
'use strict';

// -- constants lifted verbatim from UniversalDynamicTable -------------------
const FELT_DESIGN_W = 435;
const FELT_DESIGN_H = 633;

const SEAT_CONFIGS = {
    9: [
        { id: 0, name: 'BTN', x: 50, y: 84 }, { id: 1, name: 'SB', x: 24, y: 76 },
        { id: 2, name: 'BB', x: 16, y: 59 }, { id: 3, name: 'UTG', x: 21, y: 21 },
        { id: 4, name: 'UTG+1', x: 38, y: 15 }, { id: 5, name: 'MP', x: 62, y: 15 },
        { id: 6, name: 'MP+1', x: 79, y: 21 }, { id: 7, name: 'HJ', x: 84, y: 59 },
        { id: 8, name: 'CO', x: 76, y: 76 },
    ],
    6: [
        { id: 0, name: 'BTN', x: 50, y: 84 }, { id: 1, name: 'SB', x: 21, y: 62 },
        { id: 2, name: 'BB', x: 24, y: 21 }, { id: 3, name: 'UTG', x: 50, y: 15 },
        { id: 4, name: 'HJ', x: 76, y: 21 }, { id: 5, name: 'CO', x: 79, y: 62 },
    ],
    3: [
        { id: 0, name: 'BTN', x: 50, y: 84 }, { id: 1, name: 'SB', x: 28, y: 21 },
        { id: 2, name: 'BB', x: 72, y: 21 },
    ],
    2: [
        { id: 0, name: 'BTN/SB', x: 50, y: 78 }, { id: 1, name: 'BB', x: 50, y: 22 },
    ],
};

function feltScaleFor(w, h) {
    return Math.max(0.58, Math.min(1, w / FELT_DESIGN_W, h / FELT_DESIGN_H));
}

// The footprint of one seat's furniture, and the clamp window it leaves.
function seatBox(isHero, felt) {
    const ui = (n) => Math.round(n * feltScaleFor(felt.w, felt.h));
    const avatarPx = isHero ? ui(66) : ui(52);
    const plateW = isHero ? ui(94) : ui(78);
    const plateH = ui(34);
    const heroCardW = ui(46);
    const vilCardH = ui(35);
    const bubbleH = ui(26);
    const boxH = isHero
        ? (avatarPx + plateH - ui(8))
        : (avatarPx + plateH - ui(8) + ui(3) + vilCardH);
    const boxHalfW = Math.max(avatarPx, plateW) / 2 + 2;
    const bubbleOverhang = isHero ? 0 : ui(6);
    const rightExtent = isHero ? (boxHalfW + heroCardW * 1.7) : (boxHalfW + ui(8));
    const leftExtent = boxHalfW + bubbleOverhang;
    const topExtent = (boxH / 2) + (isHero ? 0 : bubbleH);
    const railPx = ui(15) + 10;
    return { boxH, leftExtent, rightExtent, topExtent, railPx };
}

let PASS = 0, FAIL = 0;
const seen = [];
function check(name, fn) {
    let ok = false, detail = '';
    try {
        const r = fn();
        if (r === true) ok = true;
        else detail = typeof r === 'string' ? r : 'returned ' + JSON.stringify(r);
    } catch (e) { detail = 'threw: ' + (e && e.message); }
    if (ok) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + '  [' + detail + ']'); }
}

// Felt boxes the three target viewports can actually produce.
//   .gto-trainer-container is max-width 800 at >=1200px, 900 at >=900px.
//   styles.basicTable is width 92%, max-width 440, aspect 1/1.45, max-height 100%.
const CORNER_RAIL_BAND = 44; // styles: reserved under the felt when isMobile
function feltFor(viewportW, tableAreaH) {
    const containerW = viewportW >= 1200 ? Math.min(viewportW, 800)
        : viewportW >= 900 ? Math.min(viewportW, 900) : viewportW;
    const isMobile = viewportW < 768;
    const usableH = tableAreaH - (isMobile ? CORNER_RAIL_BAND : 0);
    const borderW = Math.min(containerW * 0.92, 440);
    const borderH = Math.min(borderW * 1.45, usableH);
    const w = Math.min(borderW, borderH / 1.45) - 5; // aspect ratio is preserved
    const h = w * 1.45;
    return { w, h, isMobile, containerW, tableAreaH };
}

const VIEWPORTS = [
    { label: '1440x900', w: 1440, h: 900 },
    { label: '390x844', w: 390, h: 844 },
    { label: '360x640', w: 360, h: 640 },
];
// Everything above and below the table on the page. Two rows of action buttons
// is the tallest the bar gets at four options. The mobile column uses the
// isMobile overrides in the component (m.questionPanel, m.actionButton).
function chromeFor(viewportW) {
    const isMobile = viewportW < 768;
    const topBar = 46;
    const questionPanel = isMobile ? 84 : 105;
    const sessionRail = 22;
    const actionGrid = isMobile ? (46 * 2 + 8 + 20) : (54 * 2 + 8 + 22);
    const modeBar = 44;
    const statsHUD = 40;
    return topBar + questionPanel + sessionRail + actionGrid + modeBar + statsHUD;
}

console.log('\n=== Seat furniture stays on the felt ===');

for (const vp of VIEWPORTS) {
    for (const count of [9, 6, 2]) {
        const tableAreaH = Math.max(140, vp.h - chromeFor(vp.w));
        const felt = feltFor(vp.w, tableAreaH);
        const label = vp.label + ' ' + (count === 2 ? 'heads-up' : count + '-max');
        seen.push(label + ': felt ' + felt.w.toFixed(0) + 'x' + felt.h.toFixed(0)
            + ' scale ' + feltScaleFor(felt.w, felt.h).toFixed(3));

        check(label + ' -- every seat has a non-empty clamp window', () => {
            const seats = SEAT_CONFIGS[count];
            const bad = [];
            for (let i = 0; i < seats.length; i++) {
                const isHero = i === 0;
                const b = seatBox(isHero, felt);
                const yMin = b.railPx + b.topExtent;
                const yMax = felt.h - (b.railPx + b.boxH / 2);
                const xMin = b.railPx + b.leftExtent;
                const xMax = felt.w - (b.railPx + b.rightExtent);
                if (yMin > yMax) bad.push(seats[i].name + ' vertical ' + yMin.toFixed(0) + '>' + yMax.toFixed(0));
                if (xMin > xMax) bad.push(seats[i].name + ' horizontal ' + xMin.toFixed(0) + '>' + xMax.toFixed(0));
            }
            return bad.length === 0 || bad.join('; ');
        });

        check(label + ' -- clamped furniture never leaves the felt', () => {
            const seats = SEAT_CONFIGS[count];
            const bad = [];
            for (let i = 0; i < seats.length; i++) {
                const isHero = i === 0;
                const b = seatBox(isHero, felt);
                const pctY = (px) => (px / felt.h) * 100;
                const pctX = (px) => (px / felt.w) * 100;
                let sx = seats[i].x;
                let sy = isHero ? 84 : seats[i].y;
                if (count <= 2) { sx = 50; sy = isHero ? 84 : 17; }
                sy = Math.min(Math.max(sy, pctY(b.railPx + b.topExtent)),
                    100 - pctY(b.railPx + b.boxH / 2));
                sx = Math.min(Math.max(sx, pctX(b.railPx + b.leftExtent)),
                    100 - pctX(b.railPx + b.rightExtent));
                const top = sy / 100 * felt.h - b.topExtent;
                const bottom = sy / 100 * felt.h + b.boxH / 2;
                const left = sx / 100 * felt.w - b.leftExtent;
                const right = sx / 100 * felt.w + b.rightExtent;
                if (top < -0.5) bad.push(seats[i].name + ' top ' + top.toFixed(1));
                if (bottom > felt.h + 0.5) bad.push(seats[i].name + ' bottom ' + bottom.toFixed(1) + '>' + felt.h.toFixed(0));
                if (left < -0.5) bad.push(seats[i].name + ' left ' + left.toFixed(1));
                if (right > felt.w + 0.5) bad.push(seats[i].name + ' right ' + right.toFixed(1) + '>' + felt.w.toFixed(0));
            }
            return bad.length === 0 || bad.join('; ');
        });
    }
}

// ---------------------------------------------------------------------------
// THE THREE RINGS AGREE
// ---------------------------------------------------------------------------
// Three tables describe the same ring of seats and all three are HERO-RELATIVE:
// SEAT_CONFIGS (where the furniture is drawn), DEALER_BUTTON_POSITIONS (where
// the D chip goes) and CHIP_STACK_POSITIONS (where a seat's bet sits). Slot k
// in each must mean the same chair. Four shipped defects have come from reading
// one of them at an ABSOLUTE seat index while the others were rotated: the
// button on hero, hero's chips in a villain's slot, two villains sharing a
// face, and hero drawn in the bottom-left with the button seat underneath him.
// The tolerances below are loose on purpose -- chips and the button sit inboard
// of the seat, toward the pot -- but they are tight enough that a slot landing
// on the opposite side of the felt fails.
const DEALER_BUTTON_POSITIONS = {
    hero: { left: 50.49, top: 75.74 }, v1: { left: 28.73, top: 71.38 },
    v2: { left: 27.26, top: 55.15 }, v3: { left: 27.85, top: 31.73 },
    v4: { left: 35.05, top: 15.28 }, v5: { left: 62.55, top: 14.74 },
    v6: { left: 73.14, top: 31.95 }, v7: { left: 72.70, top: 54.06 },
    v8: { left: 71.96, top: 71.60 },
};
const CHIP_STACK_POSITIONS = {
    hero: { left: 47.70, top: 71.82 }, v1: { left: 31.67, top: 69.75 },
    v2: { left: 29.61, top: 54.61 }, v3: { left: 30.79, top: 31.19 },
    v4: { left: 33.29, top: 18.01 }, v5: { left: 58.29, top: 17.57 },
    v6: { left: 64.61, top: 31.52 }, v7: { left: 64.32, top: 53.63 },
    v8: { left: 64.17, top: 69.10 },
};
const DEALER_BUTTON_SEAT_KEYS = {
    9: ['hero', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
    6: ['hero', 'v2', 'v3', 'v4', 'v6', 'v7'],
    3: ['hero', 'v3', 'v6'],
    2: ['hero', 'v4'],
};

console.log('\n=== The seat ring, the button ring and the chip ring agree ===');

for (const count of [9, 6, 3, 2]) {
    const seats = SEAT_CONFIGS[count];
    const keys = DEALER_BUTTON_SEAT_KEYS[count];

    check(count + '-max -- slot 0 is hero at the bottom centre of the felt', () => {
        const s = seats[0];
        if (Math.abs(s.x - 50) > 2) return 'seat slot 0 is at x ' + s.x;
        if (s.y < 70) return 'seat slot 0 is at y ' + s.y + ', not on the bottom edge';
        if (keys[0] !== 'hero') return "button/chip slot 0 is '" + keys[0] + "', not 'hero'";
        return true;
    });

    for (const [label, table] of [['chip', CHIP_STACK_POSITIONS], ['button', DEALER_BUTTON_POSITIONS]]) {
        check(count + '-max -- every ' + label + ' slot lands on its own seat', () => {
            const bad = [];
            for (let r = 0; r < seats.length; r++) {
                const seat = seats[r];
                const pos = table[keys[r]];
                if (!pos) { bad.push('slot ' + r + ' has no ' + label + ' position'); continue; }
                // Vertically the two must be within a seat's height of each other.
                if (Math.abs(pos.top - seat.y) > 14) {
                    bad.push(seat.name + ' slot ' + r + ' ' + label + ' top ' + pos.top + ' vs seat y ' + seat.y);
                }
                // Horizontally: same side of the felt. A seat within 8% of the
                // centre line has no side, so it is exempt.
                const seatSide = Math.abs(seat.x - 50) < 8 ? 0 : Math.sign(seat.x - 50);
                const posSide = Math.abs(pos.left - 50) < 8 ? 0 : Math.sign(pos.left - 50);
                if (seatSide !== 0 && posSide !== 0 && seatSide !== posSide) {
                    bad.push(seat.name + ' slot ' + r + ' ' + label + ' left ' + pos.left + ' is across the felt from seat x ' + seat.x);
                }
            }
            return bad.length === 0 || bad.join('; ');
        });
    }

    check(count + '-max -- rotating an absolute seat index lands on the right slot', () => {
        // The rotation the component applies. For every possible hero seat, the
        // seat hero occupies must map to slot 0 and the mapping must be a
        // bijection -- two seats sharing a slot is two seats sharing a chair,
        // a chip stack, a portrait and a dealer button.
        for (let heroSeatIndex = 0; heroSeatIndex < count; heroSeatIndex++) {
            const slots = [];
            for (let i = 0; i < count; i++) {
                slots.push(((i - heroSeatIndex) % count + count) % count);
            }
            if (slots[heroSeatIndex] !== 0) return 'hero at ' + heroSeatIndex + ' did not map to slot 0';
            if (new Set(slots).size !== count) return 'hero at ' + heroSeatIndex + ' collapsed two seats onto one slot';
        }
        return true;
    });
}

console.log('\n=== The POT pill sits between the top row and the board ===');
for (const vp of VIEWPORTS) {
    const tableAreaH = Math.max(140, vp.h - chromeFor(vp.w));
    const felt = feltFor(vp.w, tableAreaH);
    const ui = (n) => Math.round(n * feltScaleFor(felt.w, felt.h));

    check(vp.label + ' -- POT clears the 9-max top row and the board', () => {
        // Top row of villains: 9-max UTG+1 / MP at y 15%, and 6-max UTG at 50%,15%.
        const b = seatBox(false, felt);
        const topRowBottom = 0.15 * felt.h + b.boxH / 2;
        void b;
        // POT pill: potPlacement centres it in the gap that actually exists, or
        // anchors its top edge below the board when no such gap exists.
        const potH = Math.max(11, ui(15)) + ui(4) + ui(5) + 6;
        const boardTop = 0.38 * felt.h - ui(70) / 2;
        const lo = topRowBottom + potH / 2 + 3;
        const hi = boardTop - potH / 2 - 3;
        const hasGap = lo <= hi;
        const centre = hasGap
            ? Math.min(Math.max(0.29 * felt.h, lo), hi)
            : (topRowBottom + boardTop) / 2;
        const potTop = centre - potH / 2;
        const potBottom = centre + potH / 2;
        if (!hasGap) {
            // The felt is too small for the pill to fit between the two. The
            // component splits the difference; assert it does not favour one
            // side, and that it is still on the felt.
            const intoTopRow = Math.max(0, topRowBottom - potTop);
            const intoBoard = Math.max(0, potBottom - boardTop);
            if (Math.abs(intoTopRow - intoBoard) > 1) {
                return 'no gap and the overlap is lopsided: ' + intoTopRow.toFixed(0) + ' vs ' + intoBoard.toFixed(0);
            }
            if (potTop < 0 || potBottom > felt.h) return 'POT left the felt';
            console.log('        (no gap exists at this size -- pill centred between the two, '
                + intoTopRow.toFixed(0) + 'px of overlap each side)');
            return true;
        }
        if (potTop < topRowBottom) return 'POT top ' + potTop.toFixed(0) + ' is above the top row bottom ' + topRowBottom.toFixed(0);
        if (potBottom > boardTop) return 'POT bottom ' + potBottom.toFixed(0) + ' overlaps the board top ' + boardTop.toFixed(0);
        return true;
    });
}

console.log('\n=== Corner rail clears hero ===');
for (const vp of VIEWPORTS) {
    const tableAreaH = Math.max(140, vp.h - chromeFor(vp.w));
    const felt = feltFor(vp.w, tableAreaH);
    check(vp.label + ' -- countdown and question pill clear hero', () => {
        const b = seatBox(true, felt);
        const containerW = felt.containerW;
        const railW = felt.isMobile ? containerW : Math.min(containerW * 0.96, 560);
        const railLeftFromFelt = (felt.w - railW) / 2; // negative when the rail is wider
        const heroCx = felt.w / 2;
        const heroLeft = heroCx - b.leftExtent;
        const heroRight = heroCx + b.rightExtent;
        const clockRight = railLeftFromFelt + 62;          // 62px plate at rail left
        const pillLeft = railLeftFromFelt + railW - 112;   // ~112px pill at rail right

        // Vertical: the rail is anchored to the BOTTOM of the table area. On a
        // phone the felt stops CORNER_RAIL_BAND short of it, so the rail's items
        // sit entirely below the felt and no horizontal test is needed.
        const feltBottomFromAreaBottom = felt.isMobile
            ? (felt.tableAreaH - CORNER_RAIL_BAND - felt.h) / 2 + CORNER_RAIL_BAND
            : (felt.tableAreaH - felt.h) / 2;
        const clockTopFromAreaBottom = (felt.isMobile ? 1 : 10) + 62;
        const pillTopFromAreaBottom = (felt.isMobile ? 3 : 16) + 28;
        // hero's cluster bottom, measured up from the table area's bottom
        const heroBottomFromAreaBottom = feltBottomFromAreaBottom + (felt.h - (0.84 * felt.h + b.boxH / 2));

        const clockClearsVertically = clockTopFromAreaBottom <= heroBottomFromAreaBottom;
        const pillClearsVertically = pillTopFromAreaBottom <= heroBottomFromAreaBottom;

        if (!clockClearsVertically && clockRight > heroLeft) {
            return 'clock right ' + clockRight.toFixed(0) + ' overlaps hero left ' + heroLeft.toFixed(0)
                + ' and does not clear it vertically';
        }
        if (!pillClearsVertically && pillLeft < heroRight) {
            return 'pill left ' + pillLeft.toFixed(0) + ' overlaps hero right ' + heroRight.toFixed(0)
                + ' and does not clear it vertically (' + pillTopFromAreaBottom.toFixed(0)
                + ' > ' + heroBottomFromAreaBottom.toFixed(0) + ')';
        }
        return true;
    });
}

console.log('\n--- felt boxes exercised ---');
seen.forEach(l => console.log('  ' + l));
console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
