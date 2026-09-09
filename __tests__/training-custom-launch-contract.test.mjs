import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCustomTrainingArenaHref,
  customTrainingConfigFromQuery,
  isCanonicalTrainingGameId,
  resolveCustomTrainingLaunch,
} from '../src/lib/training/customTrainingLaunchContract.mjs';

test('legacy range payloads resolve to canonical games and exact scalar contracts', () => {
  const cases = [
    [{ format: 'cash', positions: ['BB'], streets: ['preflop'], stackMin: 80, stackMax: 200 }, 'cash-018', false],
    [{ format: 'cash', positions: ['BTN'], streets: ['flop'], stackMin: 80, stackMax: 200 }, 'cash-002', true],
    [{ format: 'cash', streets: ['river'], stackMin: 50, stackMax: 200 }, 'cash-012', true],
    [{ format: 'mtt', streets: ['preflop'], stackMin: 5, stackMax: 20 }, 'mtt-001', false],
    [{ format: 'mtt', streets: ['turn'], stackDepth: 40 }, 'mtt-021', true],
    [{ format: 'spins', streets: ['flop'], stackDepth: 20 }, 'spins-001', true],
  ];

  for (const [input, expectedGame, custom] of cases) {
    const launch = resolveCustomTrainingLaunch(input);
    assert.equal(launch.gameId, expectedGame);
    assert.equal(isCanonicalTrainingGameId(launch.gameId), true);
    assert.equal(launch.custom, custom);
    if (custom) {
      assert.equal(Array.isArray(launch.config.position), false);
      assert.equal(Array.isArray(launch.config.street), false);
    }
  }
});

test('generated arena links never use the nonexistent spot-trainer game', () => {
  const href = buildCustomTrainingArenaHref({
    format: 'cash',
    positions: ['CO'],
    streets: ['flop'],
    stackMin: 80,
    stackMax: 200,
    scenarios: ['3bet_pot'],
  }, 'drill-builder');

  assert.match(href, /^\/hub\/training\/arena\/cash-007\?/);
  assert.match(href, /custom=1/);
  assert.match(href, /position=CO/);
  assert.match(href, /street=flop/);
  assert.doesNotMatch(href, /arena\/spot-trainer/);
});

test('arena query decoding revalidates values and marks the mode explicitly', () => {
  const config = customTrainingConfigFromQuery({
    custom: '1',
    gameType: 'cash',
    position: 'CO',
    villainPosition: 'BB',
    actionScenario: '3BP',
    stackDepth: '100',
    street: 'turn',
    handClass: 'all',
    boardTexture: 'any',
    spotType: 'any',
    questionsCount: '25',
  });
  assert.equal(config.configType, 'custom-trainer');
  assert.equal(config.gameMode, 'street');
  assert.equal(config.targetStreet, 'turn');
  assert.throws(
    () => customTrainingConfigFromQuery({ custom: '1', gameType: 'cash', street: 'preflop' }),
    /street is not supported/i,
  );
});
