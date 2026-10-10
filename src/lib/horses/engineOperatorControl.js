import { ApiError, badRequest } from './apiEnvelope.js';
import { hasPermission, PERMISSIONS } from './permissions.js';
import { uuid } from './validate.js';
export const ENGINE_CONTROL_ACTIONS = Object.freeze({
  floor: ['pause', 'resume', 'park', 'close_cash'],
  maintenance: ['start', 'cancel', 'end'],
});

/** Forward the caller's JWT. The engine independently proves named permission. */
export async function engineOperatorControl({ req, op, method, body, query, fetchImpl = fetch }) {
  const domain = method === 'POST' ? body.domain : query.domain;
  if (!Object.hasOwn(ENGINE_CONTROL_ACTIONS, domain))
    throw badRequest('Pick A Valid Engine Control Domain', 'invalid_domain');
  const capabilities = method === 'GET' && query.capabilities === '1';
  const operationId = capabilities
    ? null
    : uuid(method === 'POST' ? body.operationId : query.operationId);
  if (!capabilities && !operationId)
    throw badRequest('A Durable Operation Identity Is Required', 'invalid_operation_id');
  if (method === 'POST') {
    if (
      !hasPermission(
        op.permissions,
        domain === 'floor' ? PERMISSIONS.CLUBS_WRITE : PERMISSIONS.SETTINGS_WRITE
      )
    )
      throw new ApiError(403, 'Operator Permission Required', 'forbidden');
    if (
      !ENGINE_CONTROL_ACTIONS[domain].includes(body.action) ||
      typeof body.reason !== 'string' ||
      body.reason.trim().length < 10 ||
      body.reason.length > 500
    )
      throw badRequest('A Valid Command And Audit Reason Are Required', 'invalid_command');
  }
  const base = (
    process.env.GAME_SERVER_URL ||
    process.env.ENGINE_URL ||
    'https://engine.smarter.poker'
  ).replace(/\/$/, '');
  const url = `${base}/admin/platform-control${method === 'GET' ? (capabilities ? '?capabilities=1' : `?operationId=${encodeURIComponent(operationId)}`) : ''}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { Authorization: req.headers.authorization, 'Content-Type': 'application/json' },
      ...(method === 'POST'
        ? {
            body: JSON.stringify({
              domain,
              operationId,
              action: body.action,
              reason: body.reason.trim(),
            }),
          }
        : {}),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      503,
      'Outcome Unknown. Read The Same Operation Before Retrying',
      'unknown_outcome'
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(503, 'Engine Receipt Is Unknown', 'unknown_outcome');
  }
  if (!capabilities && method === 'GET' && response.status === 404 && result.command === null)
    return {
      command: null,
      absent: true,
      operationId,
      authority: 'Club Arena Engine',
      requestId: op.requestId,
    };
  if (!response.ok || result.success !== true)
    throw new ApiError(
      [401, 403, 404, 409].includes(response.status) ? response.status : 503,
      result.error || 'Engine Command Outcome Unknown',
      'engine_command_refused'
    );
  if (capabilities) {
    if (result.capabilities?.version !== 'stable-admin-engine-operator-v1')
      throw new ApiError(503, 'Engine Capability Is Unknown', 'unknown_outcome');
    return {
      capabilities: result.capabilities,
      authority: 'Club Arena Engine',
      requestId: op.requestId,
    };
  }
  if (result.command?.id !== operationId || result.command?.domain !== domain)
    throw new ApiError(503, 'Engine Receipt Identity Does Not Match', 'unknown_outcome');
  return {
    command: result.command,
    runtime: result.runtime ?? null,
    authority: 'Club Arena Engine',
    requestId: op.requestId,
  };
}
