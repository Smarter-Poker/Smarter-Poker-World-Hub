/**
 * Pure Training mirror of the current Club Arena table geometry.
 *
 * Source: Smarter-Poker/club-arena at 30702e1af. The source application and
 * this application cannot share a runtime package today, so this small module
 * carries the exact seat rings and marker math that Training actually uses.
 * Keep the provenance contract and its tests in step with every Club Arena
 * geometry refresh.
 */

export const CLUB_ARENA_GEOMETRY_SOURCE = Object.freeze({
  repository: 'Smarter-Poker/club-arena',
  commit: '30702e1af',
});

export const CLUB_ARENA_SEAT_LAYOUTS = Object.freeze({
  2: Object.freeze([
    Object.freeze({ x: 50, y: 100 }),
    Object.freeze({ x: 50, y: 5 }),
  ]),
  3: Object.freeze([
    Object.freeze({ x: 50, y: 100 }),
    Object.freeze({ x: 20.5, y: 6 }),
    Object.freeze({ x: 79.5, y: 6 }),
  ]),
  6: Object.freeze([
    Object.freeze({ x: 50, y: 100 }),
    Object.freeze({ x: 8, y: 67 }),
    Object.freeze({ x: 8, y: 25 }),
    Object.freeze({ x: 50, y: 5 }),
    Object.freeze({ x: 92, y: 25 }),
    Object.freeze({ x: 92, y: 67 }),
  ]),
  9: Object.freeze([
    Object.freeze({ x: 50, y: 100 }),
    Object.freeze({ x: 10.5, y: 82.5 }),
    Object.freeze({ x: 8, y: 58 }),
    Object.freeze({ x: 8, y: 25 }),
    Object.freeze({ x: 27, y: 6 }),
    Object.freeze({ x: 73, y: 6 }),
    Object.freeze({ x: 92, y: 25 }),
    Object.freeze({ x: 92, y: 58 }),
    Object.freeze({ x: 89.5, y: 82.5 }),
  ]),
});

export const CLUB_ARENA_FELT_WINDOW = Object.freeze({
  left: 13.3,
  top: 8.9,
  width: 73.2,
  height: 80.3,
});

export const CLUB_ARENA_NOMINAL_SCALER = Object.freeze({ w: 605, h: 1000 });

const CHIP_RAIL_WIDTH_PCT = 12.5;
const MARKER_INSET_PX = 3;
const CHIP_POD_GAP_WIDTH_PCT = 0.6;
const CHIP_WIDTH_PCT = 3.6;
const CHIP_MIN_PX = 10;
const CHIP_MAX_PX = 26;
const BUTTON_WIDTH_PCT = CHIP_WIDTH_PCT * 2;
const BUTTON_MIN_PX = CHIP_MIN_PX * 2;
const BUTTON_MAX_PX = CHIP_MAX_PX * 2;
const BOARD_WINDOW = Object.freeze({
  widthOfFeltPct: 68,
  centerOfFeltYPct: 43.5,
  cardAspect: 92 / 64,
});
const BOARD_CHIP_GAP_WIDTH_PCT = 0.2;
const FELT_TEXT_BAND = Object.freeze({
  widthOfFeltPct: 62,
  maxWidthPx: 260,
  centerOfFeltYPct: 58,
  logoAspect: 900 / 116,
  logoToMetaGapPx: 6,
  lineHeightPx: 11,
  lines: 2,
  lineGapPx: 1,
});
const MARKER_FELT_TEXT_GAP_WIDTH_PCT = 0.5;
const BUTTON_RAIL_RATIO = 0.85;
const BUTTON_ANGLE_DEG = 36;
const MARKER_MIN_GAP_WIDTH_PCT = 6;
const FELT_MARKER_MARGIN_WIDTH_PCT = 2.5;
const HERO_CHIP_LIFT_WIDTH_PCT = 6;
const BUTTON_FELT_DAYLIGHT_WIDTH_PCT = 1.9;
const BUTTON_FELT_MARGIN_WIDTH_PCT = BUTTON_WIDTH_PCT / 2 + BUTTON_FELT_DAYLIGHT_WIDTH_PCT;
const TOP_CAP_SEAT_Y_MAX = 20;
const SEAT_BOX_HALF_WIDTH_PCT = 13;
const SEAT_BOX_DROP_WIDTH_PCT = 22;
const SEAT_BOX_RISE_WIDTH_PCT = 4;

const SEAT_POD_LADDER = Object.freeze([
  Object.freeze({ maxViewportWidthPx: 380, villain: Object.freeze({ w: 72, h: 79 }), hero: Object.freeze({ w: 79, h: 96 }) }),
  Object.freeze({ maxViewportWidthPx: 480, villain: Object.freeze({ w: 80, h: 88 }), hero: Object.freeze({ w: 88, h: 108 }) }),
  Object.freeze({ maxViewportWidthPx: 640, villain: Object.freeze({ w: 88, h: 99 }), hero: Object.freeze({ w: 101, h: 121 }) }),
  Object.freeze({ maxViewportWidthPx: Infinity, villain: Object.freeze({ w: 96, h: 122 }), hero: Object.freeze({ w: 128, h: 150 }) }),
]);

const clampPx = (value, low, high) => Math.min(high, Math.max(low, value));
const squareSpace = (point, size) => ({ x: point.x, y: (point.y * size.h) / size.w });
const tableSpace = (point, size) => ({ x: point.x, y: (point.y * size.w) / size.h });
const unitPx = (size) => size.w / 100;

function feltCenter() {
  return {
    x: CLUB_ARENA_FELT_WINDOW.left + CLUB_ARENA_FELT_WINDOW.width / 2,
    y: CLUB_ARENA_FELT_WINDOW.top + CLUB_ARENA_FELT_WINDOW.height / 2,
  };
}

function markerInsetWidthPct(size) {
  return size.w > 0 ? (MARKER_INSET_PX / size.w) * 100 : 0;
}

function chipRadiusWidthPct(size = CLUB_ARENA_NOMINAL_SCALER) {
  return (clampPx((CHIP_WIDTH_PCT / 100) * size.w, CHIP_MIN_PX, CHIP_MAX_PX) / 2 / size.w) * 100;
}

function buttonRadiusWidthPct(size = CLUB_ARENA_NOMINAL_SCALER) {
  return (clampPx((BUTTON_WIDTH_PCT / 100) * size.w, BUTTON_MIN_PX, BUTTON_MAX_PX) / 2 / size.w) * 100;
}

function feltBoxPx(size, marginWidthPct) {
  const inset = (marginWidthPct / 100) * size.w;
  const width = Math.max(1, (CLUB_ARENA_FELT_WINDOW.width / 100) * size.w - 2 * inset);
  const height = Math.max(1, (CLUB_ARENA_FELT_WINDOW.height / 100) * size.h - 2 * inset);
  return {
    left: (CLUB_ARENA_FELT_WINDOW.left / 100) * size.w + inset,
    top: (CLUB_ARENA_FELT_WINDOW.top / 100) * size.h + inset,
    w: width,
    h: height,
    r: Math.min(width, height) / 2,
  };
}

function spineDistancePx(x, y, box) {
  const spineX = Math.min(Math.max(x, box.left + box.r), box.left + box.w - box.r);
  const spineY = Math.min(Math.max(y, box.top + box.r), box.top + box.h - box.r);
  return Math.hypot(x - spineX, y - spineY);
}

function insideStadiumPx(x, y, box) {
  return spineDistancePx(x, y, box) <= box.r + 1e-9;
}

function feltExitScale(point, size, marginWidthPct) {
  const box = feltBoxPx(size, marginWidthPct);
  const center = feltCenter();
  const centerX = (center.x / 100) * size.w;
  const centerY = (center.y / 100) * size.h;
  const dx = (point.x / 100) * size.w - centerX;
  const dy = (point.y / 100) * size.h - centerY;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-9) return Infinity;
  if (!insideStadiumPx(centerX, centerY, box)) return 0;

  let low = 0;
  let high = 1;
  for (let index = 0; index < 40 && insideStadiumPx(centerX + dx * high, centerY + dy * high, box); index += 1) {
    high *= 2;
  }
  for (let index = 0; index < 40; index += 1) {
    const middle = (low + high) / 2;
    if (insideStadiumPx(centerX + dx * middle, centerY + dy * middle, box)) low = middle;
    else high = middle;
  }
  return low;
}

function clampIntoFelt(point, size = CLUB_ARENA_NOMINAL_SCALER, marginWidthPct = FELT_MARKER_MARGIN_WIDTH_PCT) {
  const scale = feltExitScale(point, size, marginWidthPct);
  if (!Number.isFinite(scale) || scale >= 1) return { x: point.x, y: point.y };
  const center = feltCenter();
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

function boardRectSquare(size) {
  const feltWidthPx = (CLUB_ARENA_FELT_WINDOW.width / 100) * size.w;
  const rowPx = (BOARD_WINDOW.widthOfFeltPct / 100) * feltWidthPx;
  const cardHeightPx = (rowPx / 5) * BOARD_WINDOW.cardAspect;
  const unit = unitPx(size);
  const centerYPct = CLUB_ARENA_FELT_WINDOW.top
    + (BOARD_WINDOW.centerOfFeltYPct / 100) * CLUB_ARENA_FELT_WINDOW.height;
  const centerYSquare = ((centerYPct / 100) * size.h) / unit;
  return {
    x0: feltCenter().x - rowPx / 2 / unit,
    x1: feltCenter().x + rowPx / 2 / unit,
    y0: centerYSquare - cardHeightPx / 2 / unit,
    y1: centerYSquare + cardHeightPx / 2 / unit,
  };
}

function feltTextRectSquare(size) {
  const feltWidthPx = (CLUB_ARENA_FELT_WINDOW.width / 100) * size.w;
  const brandPx = Math.min((FELT_TEXT_BAND.widthOfFeltPct / 100) * feltWidthPx, FELT_TEXT_BAND.maxWidthPx);
  const metaPx = FELT_TEXT_BAND.lines * FELT_TEXT_BAND.lineHeightPx
    + (FELT_TEXT_BAND.lines - 1) * FELT_TEXT_BAND.lineGapPx;
  const heightPx = brandPx / FELT_TEXT_BAND.logoAspect + FELT_TEXT_BAND.logoToMetaGapPx + metaPx;
  const unit = unitPx(size);
  const centerYPct = CLUB_ARENA_FELT_WINDOW.top
    + (FELT_TEXT_BAND.centerOfFeltYPct / 100) * CLUB_ARENA_FELT_WINDOW.height;
  const centerYSquare = ((centerYPct / 100) * size.h) / unit;
  return {
    x0: feltCenter().x - brandPx / 2 / unit,
    x1: feltCenter().x + brandPx / 2 / unit,
    y0: centerYSquare - heightPx / 2 / unit,
    y1: centerYSquare + heightPx / 2 / unit,
  };
}

function isOnFeltText(point, size, markerRadiusWidthPct = 0) {
  const rect = feltTextRectSquare(size);
  const square = squareSpace(point, size);
  const pad = markerRadiusWidthPct + MARKER_FELT_TEXT_GAP_WIDTH_PCT;
  return square.x > rect.x0 - pad
    && square.x < rect.x1 + pad
    && square.y > rect.y0 - pad
    && square.y < rect.y1 + pad;
}

function rayEntryDistanceSquare(from, unitX, unitY, rect, padWidthPct) {
  const bounds = [
    [from.x, unitX, rect.x0 - padWidthPct, rect.x1 + padWidthPct],
    [from.y, unitY, rect.y0 - padWidthPct, rect.y1 + padWidthPct],
  ];
  let minimum = -Infinity;
  let maximum = Infinity;
  for (const [origin, direction, low, high] of bounds) {
    if (Math.abs(direction) < 1e-12) {
      if (origin < low || origin > high) return Infinity;
      continue;
    }
    const first = (low - origin) / direction;
    const second = (high - origin) / direction;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
  }
  if (maximum < minimum || maximum < 0) return Infinity;
  return Math.max(0, minimum);
}

function podExitDistanceSquare(unitX, unitY, size, pod) {
  if (!pod) return 0;
  const unit = unitPx(size);
  const pad = chipRadiusWidthPct(size) + CHIP_POD_GAP_WIDTH_PCT;
  const halfWidth = pod.w / 2 / unit + pad;
  const halfHeight = pod.h / 2 / unit + pad;
  const xExit = Math.abs(unitX) < 1e-9 ? Infinity : halfWidth / Math.abs(unitX);
  const yExit = Math.abs(unitY) < 1e-9 ? Infinity : halfHeight / Math.abs(unitY);
  return Math.min(xExit, yExit);
}

function chipsClearOfBoard(seat, stepWidthPct, size) {
  const center = feltCenter();
  const squareSeat = squareSpace(seat, size);
  const squareCenter = squareSpace(center, size);
  const dx = squareCenter.x - squareSeat.x;
  const dy = squareCenter.y - squareSeat.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-6) return true;
  const point = tableSpace({
    x: squareSeat.x + (dx / length) * stepWidthPct,
    y: squareSeat.y + (dy / length) * stepWidthPct,
  }, size);
  const boardHalfWidth = 0.34 * CLUB_ARENA_FELT_WINDOW.width;
  const cardWidth = (0.68 * CLUB_ARENA_FELT_WINDOW.width) / 5;
  const boardHalfHeight = ((cardWidth * 92) / 64 / 2) * (1000 / 605);
  const chipHalf = 2;
  const onX = Math.abs(point.x - center.x) < boardHalfWidth + chipHalf;
  const onY = Math.abs(point.y - center.y) < boardHalfHeight + chipHalf * (1000 / 605);
  return !(onX && onY);
}

function chipStepWidthPct(seat, size, pod) {
  const center = feltCenter();
  const squareSeat = squareSpace(seat, size);
  const squareCenter = squareSpace(center, size);
  const dx = squareCenter.x - squareSeat.x;
  const dy = squareCenter.y - squareSeat.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-6) return 0;
  const unitX = dx / length;
  const unitY = dy / length;
  const wanted = Math.max(CHIP_RAIL_WIDTH_PCT, podExitDistanceSquare(unitX, unitY, size, pod));
  const board = rayEntryDistanceSquare(
    squareSeat,
    unitX,
    unitY,
    boardRectSquare(size),
    chipRadiusWidthPct(size) + BOARD_CHIP_GAP_WIDTH_PCT,
  );
  const ceiling = Math.max(CHIP_RAIL_WIDTH_PCT, board);
  const base = Math.min(wanted, ceiling, length * 0.8);
  const inset = markerInsetWidthPct(size);
  if (inset <= 0) return base;
  const nudged = Math.min(base + inset, length * 0.8);
  return chipsClearOfBoard(seat, nudged, size) ? nudged : base;
}

function isHeroSeat(seat) {
  return seat.y >= 100 && seat.x === 50;
}

function overlapsTopSeatBox(point, seat, size) {
  if (!Number.isFinite(seat.y) || seat.y >= TOP_CAP_SEAT_Y_MAX) return false;
  const candidate = squareSpace(point, size);
  const owner = squareSpace(seat, size);
  return Math.abs(candidate.x - owner.x) < SEAT_BOX_HALF_WIDTH_PCT
    && candidate.y - owner.y < SEAT_BOX_DROP_WIDTH_PCT
    && candidate.y - owner.y > -SEAT_BOX_RISE_WIDTH_PCT;
}

function overlapsBoard(point, size) {
  const boardFraction = 0.95;
  const boardGapPx = 2;
  const boardTopFeltPct = 42.5;
  const centerX = CLUB_ARENA_FELT_WINDOW.left + CLUB_ARENA_FELT_WINDOW.width / 2;
  const centerY = CLUB_ARENA_FELT_WINDOW.top + (boardTopFeltPct / 100) * CLUB_ARENA_FELT_WINDOW.height;
  const halfWidth = (boardFraction * CLUB_ARENA_FELT_WINDOW.width) / 2;
  const gapPct = (boardGapPx / size.w) * 100;
  const cardWidth = (boardFraction * CLUB_ARENA_FELT_WINDOW.width - 4 * gapPct) / 5;
  const halfHeight = cardWidth * (92 / 64) * (size.w / size.h) / 2;
  const puckHalf = buttonRadiusWidthPct(size);
  return Math.abs(point.x - centerX) < halfWidth + puckHalf
    && Math.abs(point.y - centerY) < halfHeight + puckHalf * (size.w / size.h);
}

function markerGapWidthPct(first, second, size) {
  const a = squareSpace(first, size);
  const b = squareSpace(second, size);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function seatPodPx(viewportWidthPx, isHero) {
  const rung = SEAT_POD_LADDER.find((candidate) => viewportWidthPx <= candidate.maxViewportWidthPx)
    || SEAT_POD_LADDER[SEAT_POD_LADDER.length - 1];
  return isHero ? rung.hero : rung.villain;
}

/**
 * Current Club Arena phone reserve below the table scaler. The hero is
 * centered on y:100, so half of the portrait and the complete nameplate hang
 * below the canvas. This static width-based reserve keeps that footprint clear
 * of the action bar without making the felt resize when its state changes.
 */
export function clubArenaHeroClearPx(viewportWidthPx) {
  const width = Number(viewportWidthPx);
  return clampPx(Number.isFinite(width) ? width * 0.146 : 50, 50, 68);
}

/**
 * The visible Club Arena portrait slot is proportional to the rendered table,
 * not to the browser viewport. Top-cap cash seats use the same measured caps
 * as SeatSlot.css; tournament tables have no BBJ banner and keep the full
 * slot. Bust art is enlarged from its feet everywhere except the top cap.
 */
export function clubArenaSeatPortrait({
  tableWidth,
  playerCount,
  seatY,
  isHero = false,
  tournament = false,
}) {
  const width = Number(tableWidth);
  const full = clampPx(Number.isFinite(width) ? width * 0.158 : 50, 50, 124);
  const topCap = Number(seatY) <= 6;
  const cap = Number(playerCount) <= 6 ? 56 : 76;
  const base = topCap && !tournament ? Math.min(full, cap) : full;
  const size = base * (isHero ? 1.3333 : 1);
  return {
    w: size,
    h: size,
    bustScale: topCap ? 1.05 : 1.45,
  };
}

export function clubArenaChipPosition(seat, size = CLUB_ARENA_NOMINAL_SCALER, pod) {
  const center = feltCenter();
  const squareSeat = squareSpace(seat, size);
  const squareCenter = squareSpace(center, size);
  const dx = squareCenter.x - squareSeat.x;
  const dy = squareCenter.y - squareSeat.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-6) return { x: seat.x, y: seat.y };

  const step = chipStepWidthPct(seat, size, pod);
  const walked = tableSpace({
    x: squareSeat.x + (dx / length) * step,
    y: squareSeat.y + (dy / length) * step,
  }, size);
  const onFelt = clampIntoFelt(walked, size);
  if (!isHeroSeat(seat)) return onFelt;

  const squareOnFelt = squareSpace(onFelt, size);
  return clampIntoFelt(tableSpace({
    x: squareOnFelt.x + (dx / length) * HERO_CHIP_LIFT_WIDTH_PCT,
    y: squareOnFelt.y + (dy / length) * HERO_CHIP_LIFT_WIDTH_PCT,
  }, size), size);
}

export function clubArenaDealerPosition(seat, size = CLUB_ARENA_NOMINAL_SCALER, pod) {
  const center = feltCenter();
  const squareSeat = squareSpace(seat, size);
  const squareCenter = squareSpace(center, size);
  const dx = squareCenter.x - squareSeat.x;
  const dy = squareCenter.y - squareSeat.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-6) return { x: seat.x, y: seat.y };

  const unitX = dx / length;
  const unitY = dy / length;
  const angle = BUTTON_ANGLE_DEG * (Math.PI / 180);
  const rotatedX = unitX * Math.cos(angle) - unitY * Math.sin(angle);
  const rotatedY = unitX * Math.sin(angle) + unitY * Math.cos(angle);
  const step = Math.min(CHIP_RAIL_WIDTH_PCT * BUTTON_RAIL_RATIO, length * 0.8);
  const walked = tableSpace({
    x: squareSeat.x + rotatedX * step,
    y: squareSeat.y + rotatedY * step,
  }, size);
  const placed = clampIntoFelt(walked, size, BUTTON_FELT_MARGIN_WIDTH_PCT);
  const chips = clubArenaChipPosition(seat, size, pod);
  const puck = buttonRadiusWidthPct(size);
  const clear = (point) => markerGapWidthPct(point, chips, size) >= MARKER_MIN_GAP_WIDTH_PCT
    && !isOnFeltText(point, size, puck)
    && !overlapsTopSeatBox(point, seat, size)
    && !overlapsBoard(point, size);
  if (clear(placed)) return placed;

  const placedSquare = squareSpace(placed, size);
  let best = null;
  let bestDistance = Infinity;
  for (const direction of [1, -1]) {
    for (let index = 1; index <= 60; index += 1) {
      const rotation = direction * index * 1.5 * (Math.PI / 180);
      const vectorX = placedSquare.x - squareCenter.x;
      const vectorY = placedSquare.y - squareCenter.y;
      const swung = tableSpace({
        x: squareCenter.x + vectorX * Math.cos(rotation) - vectorY * Math.sin(rotation),
        y: squareCenter.y + vectorX * Math.sin(rotation) + vectorY * Math.cos(rotation),
      }, size);
      const exit = feltExitScale(swung, size, BUTTON_FELT_MARGIN_WIDTH_PCT);
      const candidate = Number.isFinite(exit)
        ? { x: center.x + (swung.x - center.x) * exit, y: center.y + (swung.y - center.y) * exit }
        : swung;
      if (!clear(candidate)) continue;
      const squareCandidate = squareSpace(candidate, size);
      const distance = Math.hypot(squareCandidate.x - squareSeat.x, squareCandidate.y - squareSeat.y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
      break;
    }
  }
  return best || placed;
}

export function resolveClubArenaTableBox({ areaWidth, areaHeight, playerCount, mobile }) {
  const width = Number(areaWidth);
  const height = Number(areaHeight);
  const smallRing = Number(playerCount) <= 6;
  const aspectWidth = 605;
  const aspectHeight = smallRing ? 960 : 1000;
  if (!(width > 0) || !(height > 0)) {
    return {
      width: '88%',
      height: undefined,
      aspectRatio: `${aspectWidth} / ${aspectHeight}`,
    };
  }
  if (mobile) {
    return {
      width: Math.max(1, Math.min(width, height * 0.7, 605)),
      height: Math.max(1, height),
      aspectRatio: 'auto',
    };
  }
  return {
    width: Math.max(1, Math.min(width * 0.88, height * (aspectWidth / aspectHeight), 605)),
    height: undefined,
    aspectRatio: `${aspectWidth} / ${aspectHeight}`,
  };
}
