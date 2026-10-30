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
  'prepare_model',
  'freeze_model',
  'model_freeze_authority',
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
  'prepare_model',
  'freeze_model',
  'model_freeze_authority',
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

export function v31FeatureContractVersion(value) {
  const version = Object.prototype.hasOwnProperty.call(value || {}, 'feature_contract_version')
    ? value.feature_contract_version : 'rank-suit-count-v1';
  return ['rank-suit-count-v1', 'holdem-board-relative-v2', 'holdem-public-hist215-v1'].includes(version) ? version : null;
}

export function v31PolicyExportSchema(value) {
  if (!Object.prototype.hasOwnProperty.call(value || {}, 'policy_export_schema')) return 'smarter-poker.pio-policy.v3';
  return value.policy_export_schema === 'smarter-poker.pio-policy.v4' ? value.policy_export_schema : null;
}

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
      || !exactKeys(envelope.provenance, [...PROVENANCE_KEYS, ...['feature_contract_version', 'policy_export_schema'].filter(key => Object.prototype.hasOwnProperty.call(envelope.provenance || {}, key))])
      || !v31FeatureContractVersion(envelope.provenance)
      || !v31PolicyExportSchema(envelope.provenance)
      || (v31FeatureContractVersion(envelope.provenance) === 'holdem-public-hist215-v1'
        && v31PolicyExportSchema(envelope.provenance) !== 'smarter-poker.pio-policy.v4')
      || !envelope.payload
      || typeof envelope.payload !== 'object'
      || Array.isArray(envelope.payload)) return false;

  const allowed = principal === 'COMPACTOR' ? COMPACTOR_OPERATIONS : WORKER_OPERATIONS;
  if (!allowed.has(envelope.operation) && !(principal === 'M2' && envelope.operation === 'model_freeze_authority')) return false;
  if (['prepare_model','freeze_model','model_freeze_authority'].includes(envelope.operation) && v31FeatureContractVersion(envelope.provenance) !== 'holdem-public-hist215-v1') return false;
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

// This is transport admission, never a parity/quality verdict. PostgreSQL owns
// full model, source, approval, protocol and independently computed case checks.
export function v31Public215BuildEnvelopeIsValid(value, datasetId, withReceipt = true) {
  const keys = ['context','policy_representation','public_model','public_template','public_training_provenance',
    'model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum',
    ...(withReceipt ? ['public_model_build_receipt','model_build_receipt_checksum'] : [])];
  const contextKeys = ['street','game_family','objective','utility_context','table_size','pot_type',
    'hero_position','opponent_position','depth_bucket','texture_class','node_role','facing_kind','facing_size_bucket'];
  if (!exactKeys(value, keys) || value.policy_representation !== 'public_hist215_v1'
      || !exactKeys(value.context, contextKeys)) return false;
  const canonical = (v, depth = 0) => {
    if (depth > 128) throw Error('public215 depth');
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'string' && /^[\x20-\x7e]*$/.test(v)) return JSON.stringify(v);
    if (typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v,-0)) return JSON.stringify(v);
    if (Array.isArray(v)) return '['+v.map(x=>canonical(x,depth+1)).join(',')+']';
    if (v && typeof v === 'object') return '{'+Object.keys(v).sort().map(k=>canonical(k,depth+1)+':'+canonical(v[k],depth+1)).join(',')+'}';
    throw Error('public215 canonical value');
  };
  try {
    for (const [field, checksum] of [['public_model','model_checksum'],['public_template','template_checksum'],
      ['public_training_provenance','training_provenance_checksum'],...(withReceipt ? [['public_model_build_receipt','model_build_receipt_checksum']] : [])]) {
      if (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field])
          || typeof value[checksum] !== 'string' || !HEX_64.test(value[checksum]) || value[checksum] === '0'.repeat(64)
          || createHash('sha256').update(canonical(value[field]),'ascii').digest('hex') !== value[checksum]) return false;
    }
    const actions = value.public_model.action_ids;
    if (!Array.isArray(actions) || actions.length < 2 || actions.some(a=>typeof a !== 'string' || !/^(?:c|f|b[1-9][0-9]{0,78})$/.test(a)) || actions.join('\0') !== [...new Set(actions)].sort().join('\0')) return false;
    if (value.feature_schema_checksum !== '0ca054f9bb0463bf6a298a80a29cb4b6d9e6bffcc193e4af9d497e2936ec849f'
        || value.public_model.format !== 'public_hist215_v1'
        || value.public_template.format !== 'public_hist215_template_v1'
        || value.public_training_provenance.format !== 'public_hist215_training_v1'
        || (withReceipt && value.public_model_build_receipt.format !== 'public_hist215_build_receipt_v1')
        || canonical(value.public_template.context) !== canonical(value.context)
        || value.public_model.template_sha256 !== value.template_checksum
        || value.public_model.feature_schema_sha256 !== value.feature_schema_checksum
        || value.public_model.provenance_sha256 !== value.training_provenance_checksum
        || (withReceipt && value.public_model_build_receipt.dataset_id !== datasetId)) return false;
    for (const k of ['model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum']) {
      if (withReceipt && value.public_model_build_receipt[k] !== value[k]) return false;
    }
    return true;
  } catch { return false; }
}


export function v31Public215FreezeEnvelopeIsValid(value,datasetId) {
  if (!exactKeys(value,['context','model_checksum','public_model_build_receipt','model_build_receipt_checksum'])) return false;
  const receipt=value.public_model_build_receipt;
  if (!receipt || typeof receipt!=='object' || Array.isArray(receipt) || receipt.format!=='public_hist215_build_receipt_v1' || receipt.dataset_id!==datasetId || receipt.model_checksum!==value.model_checksum) return false;
  // Reuse the exact canonical transport hash admission with the corresponding
  // payload references; SQL resolves the immutable prepared model independently.
  const canonical=v=>{if(v===null||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='string'&&/^[\x20-\x7e]*$/.test(v))return JSON.stringify(v);if(typeof v==='number'&&Number.isSafeInteger(v)&&!Object.is(v,-0))return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>canonical(k)+':'+canonical(v[k])).join(',')+'}';throw Error('public215 canonical');};
  try {return typeof value.model_checksum==='string' && HEX_64.test(value.model_checksum) && value.model_checksum!=='0'.repeat(64) && typeof value.model_build_receipt_checksum==='string' && HEX_64.test(value.model_build_receipt_checksum) && createHash('sha256').update(canonical(receipt),'ascii').digest('hex')===value.model_build_receipt_checksum && exactKeys(value.context,['street','game_family','objective','utility_context','table_size','pot_type','hero_position','opponent_position','depth_bucket','texture_class','node_role','facing_kind','facing_size_bucket']);}catch{return false;}
}


// Admission for a private derived audit, never a model-freeze acknowledgement.
export function v31Public215PhysicsPayloadIsValid(payload, contract) {
  return exactKeys(payload, ['dataset_id','context','physics_board','preparation_offset'])
    && payload.dataset_id === contract.dataset_id
    && contract.state === 'building'
    && v31FeatureContractVersion(contract) === 'holdem-public-hist215-v1'
    && Number.isSafeInteger(contract.declared_cells) && contract.declared_cells > 0
    && contract.declared_cells <= 2147483647
    && Number.isSafeInteger(payload.preparation_offset) && payload.preparation_offset >= 0
    && payload.preparation_offset < contract.declared_cells
    && !Object.is(payload.preparation_offset, -0)
    && typeof payload.physics_board === 'string' && /^(?:[2-9TJQKA][cdhs]){3,5}$/.test(payload.physics_board)
    && new Set(payload.physics_board.match(/../g)).size === payload.physics_board.length / 2
    && v31Public215FreezeEnvelopeIsValid(payload.context, contract.dataset_id);
}

export function v31Public215ApprovedPhysicsPreparation(payload, contract, rows) {
  if (!v31Public215PhysicsPayloadIsValid(payload, contract)
      || !Array.isArray(rows) || rows.length !== 1) return null;
  const canonical = (value, depth = 0) => {
    if (depth > 128) throw Error('public215 depth');
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'string' && /^[\x20-\x7e]*$/.test(value)) return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(x => canonical(x, depth + 1)).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => canonical(k, depth + 1) + ':' + canonical(value[k], depth + 1)).join(',') + '}';
    throw Error('public215 canonical');
  };
  const same = (a, b) => canonical(a) === canonical(b);
  const hash = value => createHash('sha256').update(canonical(value), 'ascii').digest('hex');
  const hex = value => typeof value === 'string' && HEX_64.test(value) && value !== '0'.repeat(64);
  try {
    const p = rows[0], freeze = payload.context, receipt = freeze.public_model_build_receipt;
    if (!p || p.dataset_id !== contract.dataset_id || p.status !== 'prepared'
        || p.policy_representation !== 'public_hist215_v1' || !hex(p.cell_key_checksum)
        || !same(p.context, freeze.context) || !same(p.public_template.context, p.context)
        || p.model_checksum !== freeze.model_checksum) return null;
    for (const key of ['model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum']) {
      if (!hex(p[key]) || receipt[key] !== p[key]) return null;
    }
    const t = p.public_training_provenance;
    if (receipt.input_bundle_checksum !== contract.input_bundle_checksum
        || t.input_bundle_checksum !== contract.input_bundle_checksum
        || hash(p.public_template) !== p.template_checksum
        || hash(t) !== p.training_provenance_checksum
        || p.public_model.template_sha256 !== p.template_checksum
        || p.public_model.feature_schema_sha256 !== p.feature_schema_checksum
        || p.public_model.provenance_sha256 !== p.training_provenance_checksum
        || hash(p.runtime_parity_protocol) !== t.runtime_parity_protocol_checksum
        || hash(p.encoder_descriptor) !== t.encoder_checksum) return null;
    for (const key of ['encoder_checksum','physics_checksum','dependency_lock_checksum','producer_commit','producer_bundle_checksum']) {
      if (receipt[key] !== t[key]) return null;
    }
    const protocol = p.runtime_parity_protocol;
    if (protocol.format !== 'public_hist215_runtime_parity_protocol_v1'
        || !Array.isArray(protocol.contexts)) return null;
    const groups = protocol.contexts.filter(group => same(group.context, p.context));
    if (groups.length !== 1 || !Array.isArray(groups[0].cases)
        || groups[0].cases.length < 2 || groups[0].cases.length > 32
        || !Array.isArray(receipt.cases) || receipt.cases.length !== groups[0].cases.length) return null;
    const allowed = groups[0].cases;
    if (!allowed.every((item, i) => exactKeys(item, ['board','own'])
        && same({board: receipt.cases[i].board, own: receipt.cases[i].own}, item))) return null;
    if (!allowed.some(item => item.board === payload.physics_board)) return null;
    return {cell_key_checksum: p.cell_key_checksum, model_checksum: p.model_checksum,
      template_checksum: p.template_checksum};
  } catch { return null; }
}


// Post-capture derived audits use a server-selected M2 board, never caller labels.
export function v31Public215HeldoutPhysicsPayloadIsValid(payload, contract) {
  return exactKeys(payload, ['dataset_id','context','preparation_offset','heldout_board_offset'])
    && payload.dataset_id === contract.dataset_id && contract.state === 'building'
    && v31FeatureContractVersion(contract) === 'holdem-public-hist215-v1'
    && Number.isSafeInteger(contract.declared_cells) && contract.declared_cells > 0
    && contract.declared_cells <= 2147483647
    && Number.isSafeInteger(payload.preparation_offset) && payload.preparation_offset >= 0
    && !Object.is(payload.preparation_offset, -0) && payload.preparation_offset < contract.declared_cells
    && Number.isSafeInteger(payload.heldout_board_offset) && payload.heldout_board_offset >= 0
    && !Object.is(payload.heldout_board_offset, -0) && payload.heldout_board_offset < 8
    && v31Public215FreezeEnvelopeIsValid(payload.context, contract.dataset_id);
}

function heldoutPhysicsCanonical(value, depth = 0) {
  if (depth > 128) throw Error('public215 depth');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string' && /^[\x20-\x7e]*$/.test(value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(x => heldoutPhysicsCanonical(x, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => heldoutPhysicsCanonical(k, depth + 1) + ':' + heldoutPhysicsCanonical(value[k], depth + 1)).join(',') + '}';
  throw Error('public215 canonical');
}
const heldoutPhysicsHex = value => typeof value === 'string' && HEX_64.test(value) && value !== '0'.repeat(64);
const heldoutPhysicsHash = value => createHash('sha256').update(heldoutPhysicsCanonical(value), 'ascii').digest('hex');

export function v31Public215FrozenHeldoutPreparation(payload, contract, rows) {
  if (!v31Public215HeldoutPhysicsPayloadIsValid(payload, contract)
      || !Array.isArray(rows) || rows.length !== 1) return null;
  try {
    const p = rows[0], freeze = payload.context, receipt = freeze.public_model_build_receipt;
    const same = (a, b) => heldoutPhysicsCanonical(a) === heldoutPhysicsCanonical(b);
    if (!p || p.dataset_id !== contract.dataset_id || p.status !== 'frozen'
        || p.policy_representation !== 'public_hist215_v1' || !heldoutPhysicsHex(p.cell_key_checksum)
        || !same(p.context, freeze.context) || !same(p.public_template.context, p.context)
        || p.model_checksum !== freeze.model_checksum
        || p.model_build_receipt_checksum !== freeze.model_build_receipt_checksum
        || !same(p.public_model_build_receipt, receipt)
        || heldoutPhysicsHash(p.public_model_build_receipt) !== p.model_build_receipt_checksum) return null;
    for (const key of ['model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum']) {
      if (!heldoutPhysicsHex(p[key]) || receipt[key] !== p[key]) return null;
    }
    const t = p.public_training_provenance;
    if (receipt.input_bundle_checksum !== contract.input_bundle_checksum
        || t.input_bundle_checksum !== contract.input_bundle_checksum
        || !heldoutPhysicsHex(t.capture_receipt_checksum)
        || heldoutPhysicsHash(p.public_template) !== p.template_checksum
        || heldoutPhysicsHash(t) !== p.training_provenance_checksum
        || p.public_model.template_sha256 !== p.template_checksum
        || p.public_model.feature_schema_sha256 !== p.feature_schema_checksum
        || p.public_model.provenance_sha256 !== p.training_provenance_checksum
        || heldoutPhysicsHash(p.runtime_parity_protocol) !== t.runtime_parity_protocol_checksum
        || heldoutPhysicsHash(p.encoder_descriptor) !== t.encoder_checksum) return null;
    for (const key of ['encoder_checksum','physics_checksum','dependency_lock_checksum','producer_commit','producer_bundle_checksum']) {
      if (receipt[key] !== t[key]) return null;
    }
    return {cell_key_checksum: p.cell_key_checksum, model_checksum: p.model_checksum,
      template_checksum: p.template_checksum, model_build_receipt_checksum: p.model_build_receipt_checksum,
      capture_receipt_checksum: t.capture_receipt_checksum};
  } catch { return null; }
}

export function v31Public215HeldoutPhysicsReceiptIsValid(value, payload, selected) {
  if (!exactKeys(value, ['format','dataset_id','context','cell_key_checksum','model_checksum',
    'template_checksum','model_build_receipt_checksum','board','board_offset',
    'selection_receipt_checksum','capture_receipt_checksum','node_checksum','artifact_checksum','audit_key'])) return false;
  try {
    const cards = {flop: 3, turn: 4, river: 5}[payload.context.context.street];
    if (!selected || !cards || value.format !== 'public215_heldout_physics_v1'
        || value.dataset_id !== payload.dataset_id
        || heldoutPhysicsCanonical(value.context) !== heldoutPhysicsCanonical(payload.context.context)
        || value.board_offset !== payload.heldout_board_offset || Object.is(value.board_offset, -0)
        || typeof value.board !== 'string' || value.board.length !== cards * 2
        || !/^(?:[2-9TJQKA][cdhs]){3,5}$/.test(value.board)
        || new Set(value.board.match(/../g)).size !== cards) return false;
    for (const key of ['cell_key_checksum','model_checksum','template_checksum',
      'model_build_receipt_checksum','capture_receipt_checksum']) {
      if (value[key] !== selected[key] || !heldoutPhysicsHex(value[key])) return false;
    }
    return ['selection_receipt_checksum','node_checksum','artifact_checksum','audit_key']
      .every(key => heldoutPhysicsHex(value[key]));
  } catch { return false; }
}
