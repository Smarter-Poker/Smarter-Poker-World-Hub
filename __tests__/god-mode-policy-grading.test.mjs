import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findMatchingPolicyAction,
  gradeSolverPolicyAction,
} from '../src/lib/training/godModePolicyGrading.js';

const actions = [
  {
    id: 'check', sourceCode: 'c', family: 'check', label: 'Check',
    frequency: 0.25, chipEvBb: 0.1,
    size: { unit: 'none', chips: null, bigBlinds: null, potFraction: null, exact: false },
  },
  {
    id: 'bet_33pct', sourceCode: 'b231', family: 'bet', label: 'Bet 33% Pot',
    frequency: 0.25, chipEvBb: 0.2,
    size: { unit: 'pot_fraction', chips: 231, bigBlinds: 2.31, potFraction: 0.33, exact: true },
  },
  {
    id: 'bet_75pct', sourceCode: 'b525', family: 'bet', label: 'Bet 75% Pot',
    frequency: 0.5, chipEvBb: 1.2,
    size: { unit: 'pot_fraction', chips: 525, bigBlinds: 5.25, potFraction: 0.75, exact: true },
  },
];

function policy(measuredByAction) {
  return {
    kind: 'derived',
    actions: actions.map((action) => ({
      ...action,
      chipEvBb: measuredByAction ? action.chipEvBb : null,
    })),
    chipEv: { measuredByAction },
  };
}

test('God Mode maps canonical ids and raw solver source codes to the same action', () => {
  assert.equal(findMatchingPolicyAction('bet_75pct', null, actions)?.id, 'bet_75pct');
  assert.equal(findMatchingPolicyAction('b525', null, actions)?.id, 'bet_75pct');
  assert.equal(findMatchingPolicyAction('c', null, actions)?.id, 'check');
});

test('God Mode uses submitted sizing and never chooses an ambiguous first wager', () => {
  assert.equal(findMatchingPolicyAction('bet', null, actions), null);
  assert.equal(findMatchingPolicyAction('bet', 75, actions)?.id, 'bet_75pct');
  assert.equal(findMatchingPolicyAction('bet', '33%', actions)?.id, 'bet_33pct');
});

test('unmeasured action EV remains null and cannot create a chip penalty', () => {
  const result = gradeSolverPolicyAction({ userAction: 'c', policy: policy(false) });
  assert.equal(result.isCorrect, false);
  assert.equal(result.evLoss, null);
  assert.equal(result.userEv, null);
  assert.equal(result.maxEv, null);
  assert.equal(result.chipPenalty, 0);
});

test('a complete measured EV envelope grades the source action in big blinds', () => {
  const result = gradeSolverPolicyAction({ userAction: 'c', policy: policy(true) });
  assert.equal(result.isCorrect, false);
  assert.equal(result.gtoAction, 'bet_75pct');
  assert.equal(result.userEv, 0.1);
  assert.equal(result.maxEv, 1.2);
  assert.ok(Math.abs(result.evLoss - 1.1) < 1e-12);
  assert.equal(result.chipPenalty, 2);
});

test('an unknown action fails closed instead of receiving a fuzzy match', () => {
  const result = gradeSolverPolicyAction({ userAction: 'garbage', policy: policy(true) });
  assert.equal(result.isCorrect, false);
  assert.equal(result.userEv, null);
  assert.match(result.feedback, /does not identify one legal policy action/);
});
