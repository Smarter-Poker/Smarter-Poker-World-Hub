import assert from 'node:assert/strict';
import test from 'node:test';
import { portFor } from '../scripts/ci/e2e-port.mjs';

test('runner-derived E2E ports skip curl-reserved SIP port 5060', () => {
  const previousRunner = process.env.RUNNER_NAME;
  const previousOffset = process.env.CA_E2E_PORT_OFFSET;

  try {
    process.env.RUNNER_NAME = 'runner-710'; // hashes to offset 206, formerly port 5060
    delete process.env.CA_E2E_PORT_OFFSET;
    const runnerPort = portFor(3000);
    assert.notEqual(runnerPort, 5060);
    assert.ok(runnerPort >= 3000 && runnerPort < 6000);

    process.env.CA_E2E_PORT_OFFSET = '206';
    assert.throws(() => portFor(3000), /5060 is reserved/);
  } finally {
    if (previousRunner === undefined) delete process.env.RUNNER_NAME;
    else process.env.RUNNER_NAME = previousRunner;
    if (previousOffset === undefined) delete process.env.CA_E2E_PORT_OFFSET;
    else process.env.CA_E2E_PORT_OFFSET = previousOffset;
  }
});
