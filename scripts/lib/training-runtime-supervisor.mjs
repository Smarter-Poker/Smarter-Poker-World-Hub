import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

export const TRAINING_RUNTIME_AUDIT_MAX_ATTEMPTS = 4;
export const TRAINING_RUNTIME_AUDIT_MAX_ATTEMPT_LIMIT = 10;
export const TRAINING_RUNTIME_AUDIT_ATTEMPT_TIMEOUT_MS = 4 * 60 * 60 * 1_000;
export const TRAINING_RUNTIME_AUDIT_KILL_GRACE_MS = 10_000;

export function parseStrictInteger(value, {
  name,
  fallback,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
} = {}) {
  assert.ok(typeof name === 'string' && name.length > 0, 'strict integer name is required');
  const candidate = value === undefined || value === null || String(value).trim() === ''
    ? fallback
    : Number(value);
  assert.ok(
    Number.isSafeInteger(candidate) && candidate >= minimum && candidate <= maximum,
    `${name} must be an integer from ${minimum} through ${maximum}`,
  );
  return candidate;
}

export function parseSupervisorMaxAttempts(
  value,
  fallback = TRAINING_RUNTIME_AUDIT_MAX_ATTEMPTS,
) {
  return parseStrictInteger(value, {
    name: 'runtime audit supervisor attempts',
    fallback,
    minimum: 1,
    maximum: TRAINING_RUNTIME_AUDIT_MAX_ATTEMPT_LIMIT,
  });
}

export function parseSupervisorAttemptTimeout(
  value,
  fallback = TRAINING_RUNTIME_AUDIT_ATTEMPT_TIMEOUT_MS,
) {
  return parseStrictInteger(value, {
    name: 'runtime audit supervisor attempt timeout milliseconds',
    fallback,
    minimum: 60_000,
    maximum: 24 * 60 * 60 * 1_000,
  });
}

export function supervisorSignalExitCode(signal) {
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 1;
}

function monitorChild(child, { attemptTimeoutMs, killGraceMs }) {
  let terminate = () => {};
  const promise = new Promise((resolve) => {
    let settled = false;
    let terminationReason = null;
    let deadlineTimer = null;
    let killTimer = null;
    let forceSettleTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      clearTimeout(killTimer);
      clearTimeout(forceSettleTimer);
      child.off('error', onError);
      child.off('exit', onExit);
      resolve({
        ...result,
        timedOut: terminationReason === 'timeout',
        terminationReason,
      });
    };
    const onError = (error) => finish({ code: null, signal: null, error });
    const onExit = (code, signal) => finish({ code, signal, error: null });
    child.once('error', onError);
    child.once('exit', onExit);

    terminate = (reason, signal = 'SIGTERM') => {
      if (settled) return;
      if (!terminationReason) terminationReason = reason;
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        child.kill(signal);
      } catch (error) {
        finish({ code: null, signal: null, error });
        return;
      }
      if (killTimer) return;
      killTimer = setTimeout(() => {
        if (settled) return;
        try {
          child.kill('SIGKILL');
        } catch (error) {
          finish({ code: null, signal: null, error });
          return;
        }
        // A real process emits exit after SIGKILL. The final timer prevents a
        // broken spawn implementation or uninterruptible child from hanging
        // the supervisor forever while still reporting the attempt as failed.
        forceSettleTimer = setTimeout(() => finish({
          code: null,
          signal: 'SIGKILL',
          error: new Error(`runtime audit child did not exit after ${reason}`),
        }), Math.max(1_000, killGraceMs));
      }, killGraceMs);
    };

    deadlineTimer = setTimeout(() => terminate('timeout', 'SIGTERM'), attemptTimeoutMs);
  });
  return { promise, terminate };
}

export async function runTrainingRuntimeAuditSupervisor({
  command = process.execPath,
  args = [],
  cwd,
  env = process.env,
  maxAttempts = TRAINING_RUNTIME_AUDIT_MAX_ATTEMPTS,
  spawnImpl = spawn,
  signalSource = process,
  stderr = process.stderr,
  attemptTimeoutMs = TRAINING_RUNTIME_AUDIT_ATTEMPT_TIMEOUT_MS,
  killGraceMs = TRAINING_RUNTIME_AUDIT_KILL_GRACE_MS,
} = {}) {
  assert.ok(typeof command === 'string' && command.length > 0, 'supervisor command is required');
  assert.ok(Array.isArray(args), 'supervisor command arguments must be an array');
  assert.ok(
    Number.isInteger(maxAttempts)
      && maxAttempts >= 1
      && maxAttempts <= TRAINING_RUNTIME_AUDIT_MAX_ATTEMPT_LIMIT,
    `runtime audit supervisor attempts must be an integer from 1 through ${TRAINING_RUNTIME_AUDIT_MAX_ATTEMPT_LIMIT}`,
  );
  assert.ok(Number.isSafeInteger(attemptTimeoutMs) && attemptTimeoutMs >= 1,
    'runtime audit supervisor attempt timeout must be a positive integer');
  assert.ok(Number.isSafeInteger(killGraceMs) && killGraceMs >= 1,
    'runtime audit supervisor kill grace must be a positive integer');

  let activeChild = null;
  let activeMonitor = null;
  let interruptedSignal = null;
  let attempts = 0;
  let lastResult = null;

  const signalHandlers = new Map(
    ['SIGINT', 'SIGTERM'].map((signal) => [signal, () => {
      if (interruptedSignal) return;
      interruptedSignal = signal;
      if (
        activeChild
        && activeChild.exitCode === null
        && activeChild.signalCode === null
      ) {
        try {
          activeMonitor?.terminate('interrupt', signal);
        } catch (error) {
          stderr.write(
            `[runtime-audit-supervisor] could not forward ${signal}: ${error?.message || error}\n`,
          );
        }
      }
    }]),
  );

  for (const [signal, handler] of signalHandlers) signalSource.on(signal, handler);

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (interruptedSignal) break;
      attempts = attempt;

      try {
        activeChild = spawnImpl(command, args, {
          cwd,
          env,
          stdio: 'inherit',
        });
        activeMonitor = monitorChild(activeChild, { attemptTimeoutMs, killGraceMs });
        lastResult = await activeMonitor.promise;
      } catch (error) {
        lastResult = {
          code: null,
          signal: null,
          error,
          timedOut: false,
          terminationReason: null,
        };
      } finally {
        activeChild = null;
        activeMonitor = null;
      }

      stderr.write(
        `[runtime-audit-supervisor] child attempt ${attempt}/${maxAttempts} exited ${lastResult.signal || (lastResult.code ?? 'spawn-error')}\n`,
      );
      if (lastResult.error) {
        stderr.write(
          `[runtime-audit-supervisor] child launch failed: ${lastResult.error?.message || lastResult.error}\n`,
        );
      }
      if (lastResult.timedOut) {
        stderr.write(
          `[runtime-audit-supervisor] child exceeded the ${attemptTimeoutMs}ms attempt deadline\n`,
        );
      }

      if (interruptedSignal) break;
      if (lastResult.code === 0 && !lastResult.timedOut) {
        return {
          exitCode: 0,
          attempts,
          interruptedSignal: null,
          lastResult,
        };
      }
      if (attempt < maxAttempts) {
        stderr.write(
          '[runtime-audit-supervisor] preserving the fail-closed checkpoint and retrying unresolved batches\n',
        );
      }
    }

    if (interruptedSignal) {
      return {
        exitCode: supervisorSignalExitCode(interruptedSignal),
        attempts,
        interruptedSignal,
        lastResult,
      };
    }

    return {
      exitCode: Number.isInteger(lastResult?.code) && lastResult.code !== 0
        ? lastResult.code
        : 1,
      attempts,
      interruptedSignal: null,
      lastResult,
    };
  } finally {
    for (const [signal, handler] of signalHandlers) signalSource.off(signal, handler);
  }
}
