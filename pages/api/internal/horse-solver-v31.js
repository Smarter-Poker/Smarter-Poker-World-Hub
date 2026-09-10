import { TextDecoder } from 'node:util';

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import {
  decodeV31IngressSecret,
  parseV31IngressJson,
  V31_INGRESS_MAX_BODY_BYTES,
  v31IngressDatabaseFailureStatus,
  v31IngressEnvelopeIsValid,
  verifyV31IngressRequest,
} from '../../../src/lib/horses/solverV31IngressAuth.mjs';
import { createClient } from '../../../src/lib/supabaseServerClient';

export const config = { api: { bodyParser: false }, maxDuration: 300 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRINCIPALS = new Set(['M1', 'M2', 'COMPACTOR']);
const DB_TIMEOUT_MS = 20_000;
const LONG_DB_TIMEOUT_MS = 270_000;
let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('V31 gateway database authority is unavailable');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function firstHeader(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : String(value || '');
}

class GatewayError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readRawBody(req) {
  const declared = Number(firstHeader(req, 'content-length') || 0);
  if (Number.isFinite(declared) && declared > V31_INGRESS_MAX_BODY_BYTES) {
    throw new GatewayError('Request body is too large', 413);
  }
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > V31_INGRESS_MAX_BODY_BYTES) {
      throw new GatewayError('Request body is too large', 413);
    }
    return req.body;
  }
  if (req.body !== undefined && req.body !== null) {
    throw new GatewayError('Raw JSON request body required');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > V31_INGRESS_MAX_BODY_BYTES) {
      throw new GatewayError('Request body is too large', 413);
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function validDatasetId(value) {
  return typeof value === 'string' && UUID.test(value);
}

async function bounded(query, timeoutMs = DB_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (typeof query?.abortSignal !== 'function') {
      throw new Error('Database request does not support cancellation');
    }
    return await query.abortSignal(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function rpc(supabase, name, args, timeoutMs = DB_TIMEOUT_MS) {
  let response;
  try {
    response = await bounded(supabase.rpc(name, args), timeoutMs);
  } catch (error) {
    const timedOut = error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
    throw new GatewayError(
      timedOut ? 'V31 database request timed out' : 'V31 database request failed',
      timedOut ? 504 : 503,
    );
  }
  const { data, error, status } = response;
  if (error) {
    throw new GatewayError(
      String(error.message || 'V31 database operation failed'),
      v31IngressDatabaseFailureStatus(error, status),
    );
  }
  return data;
}

function contractMatches(contract, provenance) {
  if (!contract || contract.contract !== 'smarter-poker.gto-v31-worker-contract.v1') return false;
  const fields = [
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
  ];
  return fields.every((field) => (
    typeof contract[field] === 'string'
      && typeof provenance[field] === 'string'
      && contract[field] === provenance[field]
  ))
    && contract.input_approval_status === 'approved';
}

async function readContract(supabase, provenance) {
  const contract = await rpc(supabase, 'fn_gto_v31_worker_contract', {
    p_dataset_key: provenance.dataset_key,
  });
  if (!contractMatches(contract, provenance)) {
    throw new GatewayError('Dataset contract is absent, revoked, or does not match this build', 409);
  }
  return contract;
}

function workerHeartbeat(envelope) {
  const { payload, provenance, principal } = envelope;
  const keys = [
    'run_id', 'sequence', 'phase_id', 'state', 'rows_planned', 'rows_done',
    'rows_written', 'invalid_rows', 'last_artifact_id', 'last_artifact_checksum',
    'error_detail',
  ];
  if (!exactKeys(payload, keys) || !validDatasetId(payload.run_id)) {
    throw new GatewayError('Worker heartbeat payload is invalid');
  }
  return {
    contract: 'smarter-poker.solver-worker-heartbeat.v1',
    machine_id: principal,
    ...payload,
    solver_version: provenance.solver_version,
    solver_binary_checksum: provenance.solver_binary_checksum,
    pipeline_commit: provenance.pipeline_commit,
    pipeline_bundle_checksum: provenance.pipeline_bundle_checksum,
    manifest_version: provenance.manifest_version,
    manifest_checksum: provenance.manifest_checksum,
    range_bundle_checksum: provenance.range_bundle_checksum,
    source_combo_order_checksum: provenance.source_combo_order_checksum,
  };
}

function compactHeartbeat(envelope) {
  const { payload, provenance } = envelope;
  const keys = [
    'run_id', 'sequence', 'state', 'source_rows', 'receipt_rows', 'cells',
    'invalid_rows', 'source_max_at', 'compacted_through', 'dataset_checksum',
    'error_detail',
  ];
  if (!exactKeys(payload, keys) || !validDatasetId(payload.run_id)) {
    throw new GatewayError('Compact heartbeat payload is invalid');
  }
  return {
    contract: 'smarter-poker.solver-compact-heartbeat.v1',
    ...payload,
    dataset_key: provenance.dataset_key,
    pipeline_commit: provenance.pipeline_commit,
    pipeline_bundle_checksum: provenance.pipeline_bundle_checksum,
    manifest_version: provenance.manifest_version,
    manifest_checksum: provenance.manifest_checksum,
    range_bundle_checksum: provenance.range_bundle_checksum,
  };
}

async function dispatch(supabase, envelope) {
  const { operation, payload, provenance, principal } = envelope;
  if (operation === 'register_dataset') {
    if (!exactKeys(payload, ['input_bundle_id', 'declared_coverage', 'quality_gates'])
        || !validDatasetId(payload.input_bundle_id)
        || !Array.isArray(payload.declared_coverage)
        || !payload.quality_gates
        || typeof payload.quality_gates !== 'object'
        || Array.isArray(payload.quality_gates)) {
      throw new GatewayError('Dataset registration payload is invalid');
    }
    const existing = await rpc(supabase, 'fn_gto_v31_worker_contract', {
      p_dataset_key: provenance.dataset_key,
    });
    if (existing) {
      if (!contractMatches(existing, provenance)) {
        throw new GatewayError('Dataset key already belongs to another build', 409);
      }
      return { dataset_id: existing.dataset_id, state: existing.state, idempotent: true };
    }
    const datasetId = await rpc(supabase, 'fn_gto_v31_register_dataset', {
      p_dataset: {
        dataset_key: provenance.dataset_key,
        solver_version: provenance.solver_version,
        solver_binary_checksum: provenance.solver_binary_checksum,
        pipeline_commit: provenance.pipeline_commit,
        pipeline_bundle_checksum: provenance.pipeline_bundle_checksum,
        manifest_version: provenance.manifest_version,
        manifest_checksum: provenance.manifest_checksum,
        source_combo_order_checksum: provenance.source_combo_order_checksum,
        range_bundle_checksum: provenance.range_bundle_checksum,
        icm_model_checksum: provenance.icm_model_checksum,
        input_bundle_id: payload.input_bundle_id,
        input_bundle_checksum: provenance.input_bundle_checksum,
        machine_ids: ['M1', 'M2'],
        declared_coverage: payload.declared_coverage,
        quality_gates: payload.quality_gates,
      },
    });
    return { dataset_id: datasetId, state: 'building', idempotent: false };
  }

  const contract = await readContract(supabase, provenance);
  if (operation === 'dataset_contract') {
    if (!exactKeys(payload, [])) throw new GatewayError('Dataset contract payload is invalid');
    return contract;
  }
  if (operation === 'worker_heartbeat') {
    if (!['M1', 'M2'].includes(principal) || !contract.machine_ids?.includes(principal)) {
      throw new GatewayError('Worker is not declared for this dataset', 403);
    }
    return rpc(supabase, 'fn_solver_worker_heartbeat', {
      p_heartbeat: workerHeartbeat(envelope),
    });
  }
  if (operation === 'ingest_artifact') {
    if (!['M1', 'M2'].includes(principal)
        || !exactKeys(payload, ['dataset_id', 'artifact'])
        || payload.dataset_id !== contract.dataset_id
        || contract.state !== 'building') {
      throw new GatewayError('Artifact ingestion is not authorized for this dataset', 409);
    }
    return rpc(supabase, 'fn_gto_v31_ingest_source_artifact', {
      p_dataset_id: payload.dataset_id,
      p_machine_id: principal,
      p_artifact: payload.artifact,
    });
  }
  if (principal !== 'COMPACTOR') throw new GatewayError('Compactor authority required', 403);
  if (operation === 'build_cell') {
    if (!exactKeys(payload, ['dataset_id', 'context'])
        || payload.dataset_id !== contract.dataset_id
        || contract.state !== 'building') {
      throw new GatewayError('Compact-cell build is not authorized for this dataset', 409);
    }
    const cellChecksum = await rpc(
      supabase,
      'fn_gto_v31_build_cell',
      { p_dataset_id: payload.dataset_id, p_context: payload.context },
      LONG_DB_TIMEOUT_MS
    );
    return { cell_key_checksum: cellChecksum };
  }
  if (operation === 'seal_dataset') {
    if (!exactKeys(payload, ['dataset_id'])
        || payload.dataset_id !== contract.dataset_id) {
      throw new GatewayError('Dataset seal is not authorized in this state', 409);
    }
    if (contract.state !== 'building') {
      if (['evaluating', 'candidate', 'active'].includes(contract.state)
          && typeof contract.dataset_checksum === 'string') {
        return { dataset_checksum: contract.dataset_checksum, idempotent: true };
      }
      throw new GatewayError('Dataset seal is not authorized in this state', 409);
    }
    const datasetChecksum = await rpc(
      supabase,
      'fn_gto_v31_seal_build',
      { p_dataset_id: payload.dataset_id },
      LONG_DB_TIMEOUT_MS
    );
    return { dataset_checksum: datasetChecksum, idempotent: false };
  }
  if (operation === 'compact_heartbeat') {
    return rpc(supabase, 'fn_solver_compact_heartbeat', {
      p_heartbeat: compactHeartbeat(envelope),
    });
  }
  if (operation === 'certification_status') {
    if (!exactKeys(payload, ['dataset_id'])
        || (payload.dataset_id !== null && payload.dataset_id !== contract.dataset_id)) {
      throw new GatewayError('Certification status payload is invalid');
    }
    return rpc(supabase, 'ca_gto_v31_certification_status', {
      p_dataset_id: payload.dataset_id,
    });
  }
  throw new GatewayError('Unsupported V31 operation');
}

export default async function handler(req, res) {
  let authenticated = false;
  try {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (!applyRateLimit(req, res, { max: 240, windowMs: 60_000, scope: ':horse-solver-v31' })) {
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (firstHeader(req, 'content-encoding')
        && firstHeader(req, 'content-encoding').toLowerCase() !== 'identity') {
      return res.status(415).json({ success: false, error: 'Content encoding is not supported' });
    }
    if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i
      .test(firstHeader(req, 'content-type').trim())) {
      return res.status(415).json({ success: false, error: 'JSON content type required' });
    }

    const principal = firstHeader(req, 'x-sp-v31-principal').toUpperCase();
    const timestamp = firstHeader(req, 'x-sp-v31-timestamp');
    const nonce = firstHeader(req, 'x-sp-v31-nonce').toLowerCase();
    const bodySha256 = firstHeader(req, 'x-sp-v31-content-sha256').toLowerCase();
    const signature = firstHeader(req, 'x-sp-v31-signature').toLowerCase();
    if (!PRINCIPALS.has(principal)) {
      return res.status(401).json({ success: false, error: 'Invalid V31 gateway request' });
    }
    const secret = decodeV31IngressSecret(principal);
    if (!secret) {
      return res.status(503).json({ success: false, error: 'V31 gateway is unavailable' });
    }
    const rawBody = await readRawBody(req);
    if (!verifyV31IngressRequest({
      principal,
      timestamp,
      nonce,
      bodySha256,
      signature,
      rawBody,
      secret,
    })) {
      return res.status(401).json({ success: false, error: 'Invalid V31 gateway request' });
    }
    authenticated = true;

    let envelope;
    try {
      envelope = parseV31IngressJson(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(rawBody),
      );
    } catch {
      throw new GatewayError('Request body must be canonical UTF-8 JSON');
    }
    if (!v31IngressEnvelopeIsValid(envelope, principal)) {
      throw new GatewayError('V31 gateway envelope is invalid');
    }

    const supabase = getSupabase();
    await rpc(supabase, 'fn_solver_ingress_claim', {
      p_principal: principal,
      p_nonce: nonce,
      p_operation: envelope.operation,
      p_signed_at: new Date(Number(timestamp) * 1000).toISOString(),
      p_body_sha256: bodySha256,
    });
    const result = await dispatch(supabase, envelope);
    return res.status(200).json({ success: true, operation: envelope.operation, result });
  } catch (error) {
    const status = Number(error?.status) || (authenticated ? 409 : 400);
    const safeStatus = status >= 400 && status <= 599 ? status : 500;
    const message = authenticated
      ? String(error?.message || 'V31 operation failed').slice(0, 500)
      : 'Invalid V31 gateway request';
    console.error('[horse-solver-v31]', message);
    return res.status(safeStatus).json({ success: false, error: message });
  }
}
