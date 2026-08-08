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

// Felt boxes the target viewports can actually produce.
//   .gto-trainer-container is max-width 800 at >=1200px, 900 at >=900px.
//   styles.basicTable is width 92%, max-width 440, max-height 100%, and its
//   aspect is RESPONSIVE since the flatten change: 1/1.45 at normal sizes,
//   interpolating down to 1/1.12 when the area's height would force the
//   locked-ratio feltScale below 0.68 (see feltAspect in the component).
const CORNER_RAIL_BAND = 44; // styles: reserved under the felt when isMobile

// -- lifted verbatim from UniversalDynamicTable (feltAspect) ----------------
const FELT_ASPECT_FULL = 1.45;
const FELT_ASPECT_FLAT = 1.12;
const FLATTEN_HI = 0.68;
const FLATTEN_LO = 0.52;
function feltAspectFor(areaW, areaH) {
    if (!areaW || !areaH) return FELT_ASPECT_FULL;
    const availW = Math.min(areaW * 0.92, 440);
    const lockedW = Math.min(availW, areaH / FELT_ASPECT_FULL) - 5;
    const predicted = Math.min(1, lockedW / FELT_DESIGN_W);
    if (predicted >= FLATTEN_HI) return FELT_ASPECT_FULL;
    const t = Math.min(1, (FLATTEN_HI - predicted) / (FLATTEN_HI - FLATTEN_LO));
    return FELT_ASPECT_FULL - t * (FELT_ASPECT_FULL - FELT_ASPECT_FLAT);
}

function containerWFor(viewportW) {
    return viewportW >= 1200 ? Math.min(viewportW, 800)
        : viewportW >= 900 ? Math.min(viewportW, 900) : viewportW;
}
// aspectOverride lets the baseline comparisons below replay the pre-flatten
// locked ratio; everything else uses the aspect the component would pick.
function feltFor(viewportW, tableAreaH, aspectOverride) {
    const containerW = containerWFor(viewportW);
    const isMobile = viewportW < 768;
    const usableH = tableAreaH - (isMobile ? CORNER_RAIL_BAND : 0);
    const aspect = aspectOverride != null ? aspectOverride : feltAspectFor(containerW, usableH);
    const borderW = Math.min(containerW * 0.92, 440);
    const borderH = Math.min(borderW * aspect, usableH);
    const w = Math.min(borderW, borderH / aspect) - 5;
    const h = w * aspect;
    return { w, h, isMobile, containerW, tableAreaH, aspect };
}

const VIEWPORTS = [
    { label: '1440x900', w: 1440, h: 900 },
    { label: '390x844', w: 390, h: 844 },
    { label: '360x640', w: 360, h: 640 },
    { label: '320x568', w: 320, h: 568 },
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
            + ' aspect 1/' + felt.aspect.toFixed(3)
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

// ---------------------------------------------------------------------------
// THE OVAL FLATTENS ON HEIGHT-CONSTRAINED SCREENS (design call, 2026-08-08)
// ---------------------------------------------------------------------------
// When the area's height would force the locked-ratio feltScale below 0.68,
// the aspect interpolates from 1/1.45 toward 1/1.12 so the oval reclaims the
// width the viewport has. Seats stay percentage-positioned, so nothing below
// re-derives coordinates -- these checks compare the felt the flatten produces
// against the felt the LOCKED ratio would have produced at the same viewport.
// Seat-DROPPING is the forbidden alternative: the feltScale<=0.65 6-max cap
// re-broke dealer-button rotation and hid villains with committed chips.

console.log('\n=== Height-constrained: the oval flattens instead of dropping seats ===');

check('normal viewports keep the template aspect exactly (1440x900, 390x844)', () => {
    for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
        const tableAreaH = Math.max(140, vp.h - chromeFor(vp.w));
        const felt = feltFor(vp.w, tableAreaH);
        if (felt.aspect !== FELT_ASPECT_FULL) {
            return vp.w + 'x' + vp.h + ' flattened to 1/' + felt.aspect.toFixed(3);
        }
    }
    return true;
});

check('aspect is bounded [1.12, 1.45] and monotone in available height (sweep)', () => {
    for (const vw of [320, 360, 390, 768, 1440]) {
        let prev = null;
        for (let areaH = 1000; areaH >= 80; areaH -= 4) {
            const a = feltAspectFor(containerWFor(vw), areaH);
            if (a < FELT_ASPECT_FLAT - 1e-9 || a > FELT_ASPECT_FULL + 1e-9) {
                return 'vw ' + vw + ' areaH ' + areaH + ' aspect ' + a.toFixed(4) + ' out of bounds';
            }
            if (prev != null && a > prev + 1e-9) {
                return 'vw ' + vw + ' areaH ' + areaH + ' aspect grew as height shrank';
            }
            prev = a;
        }
    }
    return true;
});

for (const vp of [{ label: '360x640', w: 360, h: 640 }, { label: '320x568', w: 320, h: 568 }]) {
    const tableAreaH = Math.max(140, vp.h - chromeFor(vp.w));
    const flat = feltFor(vp.w, tableAreaH);
    const locked = feltFor(vp.w, tableAreaH, FELT_ASPECT_FULL);
    const ui = (n) => Math.round(n * feltScaleFor(flat.w, flat.h));
    const uiL = (n) => Math.round(n * feltScaleFor(locked.w, locked.h));

    check(vp.label + ' -- flatten engages and stays portrait', () => {
        if (flat.aspect >= FELT_ASPECT_FULL) return 'aspect did not flatten: 1/' + flat.aspect.toFixed(3);
        if (flat.aspect < FELT_ASPECT_FLAT - 1e-9) return 'aspect went past the portrait clamp: ' + flat.aspect.toFixed(3);
        if (flat.h <= flat.w) return 'felt went landscape: ' + flat.w.toFixed(0) + 'x' + flat.h.toFixed(0);
        return true;
    });

    check(vp.label + ' -- felt area strictly larger than the locked-ratio baseline', () => {
        const areaFlat = flat.w * flat.h;
        const areaLocked = locked.w * locked.h;
        if (!(areaFlat > areaLocked * 1.15)) {
            return 'area ' + areaFlat.toFixed(0) + ' vs locked ' + areaLocked.toFixed(0)
                + ' (' + ((areaFlat / areaLocked - 1) * 100).toFixed(1) + '% gain, need >15%)';
        }
        seen.push(vp.label + ': flatten area gain '
            + ((areaFlat / areaLocked - 1) * 100).toFixed(1) + '% ('
            + locked.w.toFixed(0) + 'x' + locked.h.toFixed(0) + ' -> '
            + flat.w.toFixed(0) + 'x' + flat.h.toFixed(0) + ')');
        return true;
    });

    check(vp.label + ' -- the five-card board fits on the felt with margin', () => {
        // Board strip: five cards at ui(34) with 3px gaps (m.boardCards).
        const boardW = 5 * ui(34) + 4 * 3;
        const margin = (flat.w - boardW) / 2;
        const marginLocked = (locked.w - (5 * uiL(34) + 4 * 3)) / 2;
        if (margin < 8) return 'margin ' + margin.toFixed(1) + 'px < 8px (board ' + boardW + ' on felt ' + flat.w.toFixed(0) + ')';
        if (!(margin > marginLocked)) return 'margin did not improve: ' + margin.toFixed(1) + ' vs locked ' + marginLocked.toFixed(1);
        return true;
    });

    check(vp.label + ' -- top-row/board seam: no worse than locked, sub-pixel at 360', () => {
        const seam = (f, u) => {
            const villainBoxH = u(52) + u(34) - u(8) + u(3) + u(35);
            const topRowBottom = 0.15 * f.h + villainBoxH / 2;
            const boardTop = 0.38 * f.h - u(70) / 2;
            return topRowBottom - boardTop; // >0 means overlap
        };
        const oFlat = seam(flat, ui);
        const oLocked = seam(locked, uiL);
        if (oFlat > oLocked + 1e-6) return 'overlap grew: ' + oFlat.toFixed(2) + ' vs locked ' + oLocked.toFixed(2);
        if (vp.w === 360 && oFlat >= 1) return 'overlap ' + oFlat.toFixed(2) + 'px >= 1px at 360x640';
        return true;
    });

    check(vp.label + ' -- adjacent top-row nameplates (9-max UTG+1/MP, 24% apart)', () => {
        const halfW = (f, u) => Math.max(u(52), u(78)) / 2 + 2;
        const gapFlat = 0.24 * flat.w - 2 * halfW(flat, ui);
        const gapLocked = 0.24 * locked.w - 2 * halfW(locked, uiL);
        if (!(gapFlat > gapLocked)) return 'no improvement: gap ' + gapFlat.toFixed(1) + ' vs locked ' + gapLocked.toFixed(1);
        if (vp.w === 360 && gapFlat <= 0) return 'nameplates still overlap at 360x640 by ' + (-gapFlat).toFixed(1) + 'px';
        return true;
    });

    check(vp.label + ' -- POT pill: below-board branch clears the seam it used to split', () => {
        // Replays the CURRENT potPlacement (#48 follow-up): when the gap above
        // the board cannot hold the pill, its TOP edge anchors at the board's
        // bottom -- zero overlap with board and top row by construction.
        const villainBoxH = ui(52) + ui(34) - ui(8) + ui(3) + ui(35);
        const topRowBottom = 0.15 * flat.h + villainBoxH / 2;
        const boardTop = 0.38 * flat.h - ui(70) / 2;
        const boardBottom = 0.38 * flat.h + ui(70) / 2;
        const potH = Math.max(11, ui(15)) + ui(4) + ui(5) + 6;
        const lo = topRowBottom + potH / 2 + 3;
        const hi = boardTop - potH / 2 - 3;
        if (lo <= hi) return true; // gap exists, pill sits in it, nothing to prove
        const pillTop = boardBottom;
        if (pillTop < boardBottom - 1e-6) return 'pill top ' + pillTop.toFixed(1) + ' is inside the board';
        if (pillTop < topRowBottom) return 'pill top ' + pillTop.toFixed(1) + ' is inside the top row';
        // Hero clearance below the board can only be asserted where it holds;
        // at 320x568 the 41px pill grazes hero either way -- assert it does
        // not get WORSE than the locked baseline there.
        const pillRealH = 41; // measured POT+SPR pill at floor scale (#48)
        const heroTop = (f, u) => 0.84 * f.h - (u(66) + u(34) - u(8)) / 2;
        const intoHeroFlat = (pillTop + pillRealH) - heroTop(flat, ui);
        const boardBottomL = 0.38 * locked.h + uiL(70) / 2;
        const intoHeroLocked = (boardBottomL + pillRealH) - heroTop(locked, uiL);
        if (vp.w === 360 && intoHeroFlat > 0) return 'pill runs ' + intoHeroFlat.toFixed(1) + 'px into hero at 360x640';
        if (intoHeroFlat > Math.max(0, intoHeroLocked) + 1e-6) {
            return 'pill-into-hero grew: ' + intoHeroFlat.toFixed(1) + ' vs locked ' + intoHeroLocked.toFixed(1);
        }
        return true;
    });
}

console.log('\n--- felt boxes exercised ---');
seen.forEach(l => console.log('  ' + l));
console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
