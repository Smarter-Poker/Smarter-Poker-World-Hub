import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLUB_ARENA_GEOMETRY_SOURCE,
  CLUB_ARENA_SEAT_LAYOUTS,
  clubArenaHeroClearPx,
  clubArenaChipPosition,
  clubArenaDealerPosition,
  clubArenaSeatPortrait,
  resolveClubArenaTableBox,
  seatPodPx,
} from '../src/lib/training/clubArenaTableGeometry.mjs';

test('Club Arena phone hero clearance follows the current static reserve', () => {
  assert.equal(clubArenaHeroClearPx(320), 50);
  assert.equal(clubArenaHeroClearPx(390), 56.94);
  assert.ok(Math.abs(clubArenaHeroClearPx(430) - 62.78) < 1e-9);
  assert.equal(clubArenaHeroClearPx(768), 68);
});

const closeTo = (actual, expected, label, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
};

test('Training pins the current Club Arena geometry source and supported rings', () => {
  assert.deepEqual(CLUB_ARENA_GEOMETRY_SOURCE, {
    repository: 'Smarter-Poker/club-arena',
    commit: '30702e1af',
  });
  assert.deepEqual(CLUB_ARENA_SEAT_LAYOUTS[2], [
    { x: 50, y: 100 },
    { x: 50, y: 5 },
  ]);
  assert.deepEqual(CLUB_ARENA_SEAT_LAYOUTS[3], [
    { x: 50, y: 100 },
    { x: 20.5, y: 6 },
    { x: 79.5, y: 6 },
  ]);
  assert.deepEqual(CLUB_ARENA_SEAT_LAYOUTS[6], [
    { x: 50, y: 100 },
    { x: 8, y: 67 },
    { x: 8, y: 25 },
    { x: 50, y: 5 },
    { x: 92, y: 25 },
    { x: 92, y: 67 },
  ]);
  assert.deepEqual(CLUB_ARENA_SEAT_LAYOUTS[9], [
    { x: 50, y: 100 },
    { x: 10.5, y: 82.5 },
    { x: 8, y: 58 },
    { x: 8, y: 25 },
    { x: 27, y: 6 },
    { x: 73, y: 6 },
    { x: 92, y: 25 },
    { x: 92, y: 58 },
    { x: 89.5, y: 82.5 },
  ]);
});

test('Club Arena responsive box keeps the short small ring and full 9-max ring', () => {
  assert.deepEqual(seatPodPx(390, false), { w: 80, h: 88 });
  assert.deepEqual(seatPodPx(390, true), { w: 88, h: 108 });
  assert.deepEqual(resolveClubArenaTableBox({
    areaWidth: 1000,
    areaHeight: 800,
    playerCount: 6,
    mobile: false,
  }), {
    width: 504.1666666666667,
    height: undefined,
    aspectRatio: '605 / 960',
  });
  assert.deepEqual(resolveClubArenaTableBox({
    areaWidth: 1000,
    areaHeight: 800,
    playerCount: 9,
    mobile: false,
  }), {
    width: 484,
    height: undefined,
    aspectRatio: '605 / 1000',
  });
  assert.deepEqual(resolveClubArenaTableBox({
    areaWidth: 390,
    areaHeight: 569,
    playerCount: 6,
    mobile: true,
  }), {
    width: 390,
    height: 569,
    aspectRatio: 'auto',
  });
});

test('Club Arena portraits scale from the table and retain top-cap clearance', () => {
  assert.deepEqual(clubArenaSeatPortrait({
    tableWidth: 241,
    playerCount: 6,
    seatY: 5,
  }), { w: 50, h: 50, bustScale: 1.05 });
  assert.deepEqual(clubArenaSeatPortrait({
    tableWidth: 241,
    playerCount: 6,
    seatY: 100,
    isHero: true,
  }), { w: 66.66499999999999, h: 66.66499999999999, bustScale: 1.45 });
  assert.deepEqual(clubArenaSeatPortrait({
    tableWidth: 605,
    playerCount: 9,
    seatY: 6,
    tournament: false,
  }), { w: 76, h: 76, bustScale: 1.05 });
  assert.deepEqual(clubArenaSeatPortrait({
    tableWidth: 605,
    playerCount: 9,
    seatY: 6,
    tournament: true,
  }), { w: 95.59, h: 95.59, bustScale: 1.05 });
});

test('Club Arena marker math remains exact at desktop and phone geometry', () => {
  const desktopSeat = CLUB_ARENA_SEAT_LAYOUTS[9][3];
  const desktopPod = seatPodPx(1440, false);
  const desktopChip = clubArenaChipPosition(desktopSeat, { w: 605, h: 1000 }, desktopPod);
  const desktopDealer = clubArenaDealerPosition(desktopSeat, { w: 605, h: 1000 }, desktopPod);
  closeTo(desktopChip.x, 18.69361500176199, 'desktop chip x');
  closeTo(desktopChip.y, 31.1379818804863, 'desktop chip y');
  closeTo(desktopDealer.x, 19.430831837975703, 'desktop dealer x');
  closeTo(desktopDealer.y, 27.272544498029447, 'desktop dealer y');

  const mobileSeat = CLUB_ARENA_SEAT_LAYOUTS[6][2];
  const mobilePod = seatPodPx(390, false);
  const mobileChip = clubArenaChipPosition(mobileSeat, { w: 390, h: 569 }, mobilePod);
  const mobileDealer = clubArenaDealerPosition(mobileSeat, { w: 390, h: 569 }, mobilePod);
  closeTo(mobileChip.x, 21.24615966865717, 'mobile chip x');
  closeTo(mobileChip.y, 32.60310596733186, 'mobile chip y');
  closeTo(mobileDealer.x, 20.028727774556078, 'mobile dealer x');
  closeTo(mobileDealer.y, 28.053546872701624, 'mobile dealer y');
});
