export async function planningRpc(client, name, args, operationId = null, nullable = false) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw Object.assign(new Error(error.message || 'Planning service unavailable'), error);
  if ((!nullable && !data) || (operationId && data?.operation_id !== operationId)) throw new Error('Durable planning receipt unavailable');
  return data || null;
}
export function planningError(res, error, operationId = null) {
  const status = error?.status || (error?.code === '42501' ? 403 : error?.code === 'P0002' ? 404 : ['22023', '22P02', '22007', '23514'].includes(error?.code) ? 400 : error?.code === 'PT409' ? 409 : 503);
  return res.status(status).json({ success: false, error: status >= 500 ? 'Planning service unavailable. Check the original request before retrying.' : error.message, ...(operationId && status >= 500 ? { outcome: 'unknown', operation_id: operationId } : {}) });
}
