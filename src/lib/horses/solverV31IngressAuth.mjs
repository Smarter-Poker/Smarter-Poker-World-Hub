import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const V31_INGRESS_PROTOCOL = 'smarter-poker.horse-solver-v31-ingress.v1';
export const V31_INGRESS_MAX_CLOCK_SKEW_SECONDS = 300;
export const V31_INGRESS_MAX_BODY_BYTES = 4 * 1024 * 1024;
export const V31_INGRESS_OPERATIONS = Object.freeze([
  'dataset_contract',
  'worker_heartbeat',
  'ingest_artifact',
  'register_dataset',
  'build_cell',
  'seal_dataset',
  'compact_heartbeat',
  'certification_status',
]);

const PRINCIPALS = Object.freeze(['M1', 'M2', 'COMPACTOR']);
const PRINCIPAL_SET = new Set(PRINCIPALS);
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATASET_KEY = /^[a-z0-9][a-z0-9._:-]{2,127}$/;

const WORKER_OPERATIONS = new Set([
  'dataset_contract',
  'worker_heartbeat',
  'ingest_artifact',
]);
const COMPACTOR_OPERATIONS = new Set([
  'dataset_contract',
  'register_dataset',
  'build_cell',
  'seal_dataset',
  'compact_heartbeat',
  'certification_status',
]);

const PROVENANCE_KEYS = Object.freeze([
  'dataset_key',
  'solver_version',
  'solver_binary_checksum',
  'pipeline_commit',
  'pipeline_bundle_checksum',
  'manifest_version',
  'manifest_checksum',
  'range_bundle_checksum',
  'source_combo_order_checksum',
  'icm_model_checksum',
  'input_bundle_checksum',
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
export function v31IngressSecretEnvName(principal) {
  return PRINCIPAL_SET.has(principal) ? `HORSE_SOLVER_V31_${principal}_HMAC_SECRET` : null;
}

export function decodeV31IngressSecret(principal, environment = process.env) {
  const variable = v31IngressSecretEnvName(principal);
  if (!variable) return null;
  const encoded = String(environment?.[variable] || '').trim().toLowerCase();
  if (!HEX_64.test(encoded) || encoded === '0'.repeat(64)) return null;
  const configuredPeers = PRINCIPALS
    .filter((candidate) => candidate !== principal)
    .map((candidate) => String(environment?.[v31IngressSecretEnvName(candidate)] || '').trim().toLowerCase())
    .filter((candidate) => HEX_64.test(candidate));
  // Reusing one key destroys independent attribution. The gateway fails
  // closed rather than letting M1 authenticate as M2 or the compactor.
  if (configuredPeers.includes(encoded)) return null;
  return Buffer.from(encoded, 'hex');
}

export function v31IngressBodySha256(rawBody) {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function v31IngressSignatureMessage({ principal, timestamp, nonce, bodySha256 }) {
  return [V31_INGRESS_PROTOCOL, principal, timestamp, nonce, bodySha256].join('\n');
}

export function signV31IngressRequest({ principal, timestamp, nonce, bodySha256, secret }) {
  return createHmac('sha256', secret)
    .update(v31IngressSignatureMessage({ principal, timestamp, nonce, bodySha256 }))
    .digest('hex');
}

function safeHexEqual(actual, expected) {
  if (!HEX_64.test(actual) || !HEX_64.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function verifyV31IngressRequest({
  principal,
  timestamp,
  nonce,
  bodySha256,
  signature,
  rawBody,
  secret,
  nowMs = Date.now(),
}) {
  if (!PRINCIPAL_SET.has(principal)
      || !/^[1-9][0-9]{9}$/.test(timestamp)
      || !UUID_V4.test(nonce)
      || !HEX_64.test(bodySha256)
      || !HEX_64.test(signature)
      || !Buffer.isBuffer(rawBody)
      || rawBody.length < 2
      || rawBody.length > V31_INGRESS_MAX_BODY_BYTES
      || !Buffer.isBuffer(secret)
      || secret.length !== 32) return false;

  const signedAtSeconds = Number(timestamp);
  if (!Number.isSafeInteger(signedAtSeconds)
      || Math.abs(Math.floor(nowMs / 1000) - signedAtSeconds)
        > V31_INGRESS_MAX_CLOCK_SKEW_SECONDS) return false;
  if (!safeHexEqual(bodySha256, v31IngressBodySha256(rawBody))) return false;
  const expected = signV31IngressRequest({ principal, timestamp, nonce, bodySha256, secret });
  return safeHexEqual(signature, expected);
}

export function v31IngressEnvelopeIsValid(envelope, principal) {
  if (!exactKeys(envelope, ['contract', 'principal', 'operation', 'provenance', 'payload'])) {
    return false;
  }
  if (envelope.contract !== V31_INGRESS_PROTOCOL
      || envelope.principal !== principal
      || !V31_INGRESS_OPERATIONS.includes(envelope.operation)
      || !exactKeys(envelope.provenance, PROVENANCE_KEYS)
      || !envelope.payload
      || typeof envelope.payload !== 'object'
      || Array.isArray(envelope.payload)) return false;

  const allowed = principal === 'COMPACTOR' ? COMPACTOR_OPERATIONS : WORKER_OPERATIONS;
  if (!allowed.has(envelope.operation)) return false;
  const provenance = envelope.provenance;
  return DATASET_KEY.test(provenance.dataset_key)
    && typeof provenance.solver_version === 'string'
    && provenance.solver_version.trim().length > 0
    && provenance.solver_version.length <= 120
    && HEX_64.test(provenance.solver_binary_checksum)
    && HEX_40.test(provenance.pipeline_commit)
    && HEX_64.test(provenance.pipeline_bundle_checksum)
    && typeof provenance.manifest_version === 'string'
    && provenance.manifest_version.trim().length > 0
    && provenance.manifest_version.length <= 160
    && HEX_64.test(provenance.manifest_checksum)
    && HEX_64.test(provenance.range_bundle_checksum)
    && HEX_64.test(provenance.source_combo_order_checksum)
    && HEX_64.test(provenance.icm_model_checksum)
    && HEX_64.test(provenance.input_bundle_checksum)
    && [
      provenance.solver_binary_checksum,
      provenance.pipeline_bundle_checksum,
      provenance.manifest_checksum,
      provenance.range_bundle_checksum,
      provenance.source_combo_order_checksum,
      provenance.icm_model_checksum,
      provenance.input_bundle_checksum,
    ].every((checksum) => checksum !== '0'.repeat(64));
}
