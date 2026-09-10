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

function canonicalIdentityText(value, maxLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value);
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

/** Map PostgREST/database failures without turning transient outages into 409s. */
export function v31IngressDatabaseFailureStatus(error, responseStatus) {
  const status = Number(responseStatus);
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === '57014' || code === 'PGRST003') return 504;
  if (status === 429) return 429;
  if (status >= 500 && status <= 599) return status;
  if (
    !Number.isFinite(status)
    || status <= 0
    || /^08/u.test(code)
    || /^53/u.test(code)
    || ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST202'].includes(code)
  ) return 503;
  return 409;
}

/**
 * Parse an authenticated ingress envelope without JSON's duplicate-key
 * ambiguity. JSON.parse silently keeps the last value, so bytes containing
 * both `"operation":"worker_heartbeat"` and `"operation":"ingest_artifact"`
 * would have one signed wire meaning but only the latter application meaning.
 * The scanner decodes every object key (including escaped spellings) before
 * JSON.parse and rejects duplicates at any nesting level. Recursion is capped
 * well above the real envelope depth to make pathological signed input bounded.
 */
export function parseV31IngressJson(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new SyntaxError('V31 ingress JSON must be a nonempty string');
  }
  let index = 0;
  const numberToken = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const exactIntegerStatus = (token) => {
    const unsigned = token.startsWith('-') ? token.slice(1) : token;
    const [mantissa, exponentPart = '0'] = unsigned.toLowerCase().split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    const significant = `${whole}${fraction}`.replace(/^0+/u, '');
    if (!significant) return { integer: true, unsafe: false };

    const exponentNegative = exponentPart.startsWith('-');
    const exponentDigits = exponentPart.replace(/^[+-]/u, '').replace(/^0+/u, '') || '0';
    // No real ingress value needs a six-digit decimal exponent. Avoid
    // constructing enormous powers merely to reject pathological signed input.
    if (exponentDigits.length > 6) {
      return exponentNegative
        ? { integer: false, unsafe: false }
        : { integer: true, unsafe: true };
    }
    const exponent = Number(exponentPart);
    const scale = exponent - fraction.length;
    let integerDigits;
    if (scale >= 0) {
      const totalDigits = significant.length + scale;
      if (totalDigits > 16) return { integer: true, unsafe: true };
      integerDigits = `${significant}${'0'.repeat(scale)}`;
    } else {
      const divisorZeros = -scale;
      const trailingZeros = significant.length - significant.replace(/0+$/u, '').length;
      if (trailingZeros < divisorZeros) return { integer: false, unsafe: false };
      integerDigits = significant.slice(0, significant.length - divisorZeros) || '0';
    }
    integerDigits = integerDigits.replace(/^0+/u, '') || '0';
    const maxSafe = String(Number.MAX_SAFE_INTEGER);
    return {
      integer: true,
      unsafe:
        integerDigits.length > maxSafe.length
        || (integerDigits.length === maxSafe.length && integerDigits > maxSafe),
    };
  };
  const fail = (message) => {
    throw new SyntaxError(`${message} at offset ${index}`);
  };
  const whitespace = () => {
    while (index < source.length && /[\u0009\u000a\u000d\u0020]/u.test(source[index])) index++;
  };
  const containsUnpairedSurrogate = (text) => {
    for (let cursor = 0; cursor < text.length; cursor++) {
      const code = text.charCodeAt(cursor);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(cursor + 1);
        if (cursor + 1 >= text.length || next < 0xdc00 || next > 0xdfff) return true;
        cursor++;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return true;
      }
    }
    return false;
  };
  const stringToken = () => {
    if (source[index] !== '"') fail('expected JSON string');
    const start = index++;
    let escaped = false;
    while (index < source.length) {
      const character = source[index++];
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        const decoded = JSON.parse(source.slice(start, index));
        if (containsUnpairedSurrogate(decoded)) fail('JSON string contains an unpaired Unicode surrogate');
        return decoded;
      }
    }
    fail('unterminated JSON string');
  };
  const value = (depth) => {
    if (depth > 128) fail('JSON nesting exceeds the ingress limit');
    whitespace();
    const character = source[index];
    if (character === '{') {
      index++;
      whitespace();
      const keys = new Set();
      if (source[index] === '}') {
        index++;
        return;
      }
      for (;;) {
        whitespace();
        const key = stringToken();
        if (keys.has(key)) fail(`duplicate JSON key ${JSON.stringify(key)}`);
        keys.add(key);
        whitespace();
        if (source[index++] !== ':') fail('expected object colon');
        value(depth + 1);
        whitespace();
        const separator = source[index++];
        if (separator === '}') return;
        if (separator !== ',') fail('expected object separator');
      }
    }
    if (character === '[') {
      index++;
      whitespace();
      if (source[index] === ']') {
        index++;
        return;
      }
      for (;;) {
        value(depth + 1);
        whitespace();
        const separator = source[index++];
        if (separator === ']') return;
        if (separator !== ',') fail('expected array separator');
      }
    }
    if (character === '"') {
      stringToken();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    numberToken.lastIndex = index;
    const number = numberToken.exec(source)?.[0];
    if (!number) fail('expected JSON value');
    const parsedNumber = Number(number);
    if (!Number.isFinite(parsedNumber)) fail('JSON number exceeds the finite ingress range');
    const exactStatus = exactIntegerStatus(number);
    if (exactStatus.unsafe
        || (!exactStatus.integer && Number.isInteger(parsedNumber))
        || (exactStatus.integer && !Number.isSafeInteger(parsedNumber))) {
      fail('JSON integer exceeds the exact ingress range');
    }
    index = numberToken.lastIndex;
  };

  value(0);
  whitespace();
  if (index !== source.length) fail('unexpected trailing JSON bytes');
  return JSON.parse(source);
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
    && canonicalIdentityText(provenance.solver_version, 120)
    && HEX_64.test(provenance.solver_binary_checksum)
    && HEX_40.test(provenance.pipeline_commit)
    && HEX_64.test(provenance.pipeline_bundle_checksum)
    && canonicalIdentityText(provenance.manifest_version, 160)
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
