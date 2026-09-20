import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// v2 makes the signed admission_mode part of the wire contract. A v1 worker
// cannot be interpreted as backlog or bounded-canary authority.
export const SOLVER_WORKER_PROTOCOL = 'smarter-poker.solver-worker.v2';
export const SOLVER_WORKER_MAX_CLOCK_SKEW_SECONDS = 300;
export const SOLVER_WORKER_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const SOLVER_WORKER_OPERATIONS = Object.freeze([
  'ingest_artifact',
  'row_states',
  'board_page',
  'heartbeat',
]);

const WORKER_IDS = new Set(['M1', 'M2']);
const HEX_64 = /^[0-9a-f]{64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function solverWorkerSecretEnvName(workerId) {
  return WORKER_IDS.has(workerId) ? `SOLVER_WORKER_${workerId}_HMAC_SECRET` : null;
}

export function decodeSolverWorkerSecret(workerId, environment = process.env) {
  const variable = solverWorkerSecretEnvName(workerId);
  if (!variable) return null;
  const encoded = String(environment?.[variable] || '').trim().toLowerCase();
  if (!HEX_64.test(encoded)) return null;
  const otherWorker = workerId === 'M1' ? 'M2' : 'M1';
  const other = String(environment?.[solverWorkerSecretEnvName(otherWorker)] || '')
    .trim().toLowerCase();
  // Accidentally provisioning the same key to both machines destroys the
  // distinct-worker trust boundary. Fail the endpoint closed when detected.
  if (HEX_64.test(other) && other === encoded) return null;
  return Buffer.from(encoded, 'hex');
}

export function solverWorkerBodySha256(rawBody) {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function solverWorkerSignatureMessage({ workerId, timestamp, nonce, bodySha256 }) {
  return [SOLVER_WORKER_PROTOCOL, workerId, timestamp, nonce, bodySha256].join('\n');
}

export function signSolverWorkerRequest({ workerId, timestamp, nonce, bodySha256, secret }) {
  return createHmac('sha256', secret)
    .update(solverWorkerSignatureMessage({ workerId, timestamp, nonce, bodySha256 }))
    .digest('hex');
}

function safeHexEqual(actual, expected) {
  if (!HEX_64.test(actual) || !HEX_64.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function verifySolverWorkerRequest({
  workerId,
  timestamp,
  nonce,
  bodySha256,
  signature,
  rawBody,
  secret,
  nowMs = Date.now(),
}) {
  if (!WORKER_IDS.has(workerId)
      || !/^[1-9][0-9]{9}$/.test(timestamp)
      || !UUID_V4.test(nonce)
      || !HEX_64.test(bodySha256)
      || !HEX_64.test(signature)
      || !Buffer.isBuffer(secret)
      || secret.length !== 32
      || !Buffer.isBuffer(rawBody)
      || rawBody.length < 2
      || rawBody.length > SOLVER_WORKER_MAX_BODY_BYTES) return false;

  const signedAtSeconds = Number(timestamp);
  if (!Number.isSafeInteger(signedAtSeconds)
      || Math.abs(Math.floor(nowMs / 1000) - signedAtSeconds)
        > SOLVER_WORKER_MAX_CLOCK_SKEW_SECONDS) return false;
  const calculatedBodyHash = solverWorkerBodySha256(rawBody);
  if (!safeHexEqual(bodySha256, calculatedBodyHash)) return false;
  const expected = signSolverWorkerRequest({
    workerId,
    timestamp,
    nonce,
    bodySha256,
    secret,
  });
  return safeHexEqual(signature, expected);
}

export function solverWorkerEnvelopeIsValid(envelope, workerId) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;
  const keys = Object.keys(envelope).sort();
  if (keys.join('|') !== 'operation|payload|protocol|worker') return false;
  if (envelope.protocol !== SOLVER_WORKER_PROTOCOL
      || !SOLVER_WORKER_OPERATIONS.includes(envelope.operation)
      || !envelope.payload
      || typeof envelope.payload !== 'object'
      || Array.isArray(envelope.payload)
      || !envelope.worker
      || typeof envelope.worker !== 'object'
      || Array.isArray(envelope.worker)) return false;
  const workerKeys = Object.keys(envelope.worker).sort();
  if (workerKeys.join('|') !== [
    'admission_mode',
    'machine_id',
    'manifest_checksum',
    'manifest_version',
    'pipeline_commit',
    'solver_binary_checksum',
    'solver_version',
  ].sort().join('|')) return false;
  const worker = envelope.worker;
  return worker.machine_id === workerId
    && ['backlog', 'bounded_canary'].includes(worker.admission_mode)
    && typeof worker.solver_version === 'string'
    && worker.solver_version.trim().length >= 1
    && worker.solver_version.length <= 120
    && HEX_64.test(worker.solver_binary_checksum)
    && /^[0-9a-f]{40}$/.test(worker.pipeline_commit)
    && typeof worker.manifest_version === 'string'
    && worker.manifest_version.trim().length >= 1
    && worker.manifest_version.length <= 160
    && HEX_64.test(worker.manifest_checksum);
}
