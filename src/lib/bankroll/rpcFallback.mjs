// Calling a database function that may not be installed yet.
//
// Some Bankroll Manager reads and writes have a database function that does
// the job better (one round trip, one atomic write) but the client must work
// before that function is installed. The rule is narrow on purpose: fall back
// ONLY when PostgREST says the function does not exist. Every other failure
// (permission, a bad argument, a timeout, the network) is the caller's error
// and is thrown, never answered by the fallback, so a broken function can not
// hide behind the old path.

/**
 * True when a supabase-js rpc response means "no such function":
 * PostgREST's PGRST202 (not in the schema cache), or a 404 on the rpc
 * endpoint with no other PostgREST code.
 */
export function isFunctionMissing(response) {
  if (!response) return false;
  const error = response.error;
  if (error?.code === 'PGRST202') return true;
  if (error && response.status === 404 && (!error.code || error.code === '404')) return true;
  return false;
}

/**
 * Run `callRpc()` (a supabase-js rpc call); when the function is missing run
 * `fallback()` instead. Any other rpc error is thrown. Resolves to
 * { data, via } where via is 'rpc' or 'fallback'.
 */
export async function rpcOrFallback(callRpc, fallback) {
  const response = await callRpc();
  if (isFunctionMissing(response)) return { data: await fallback(), via: 'fallback' };
  if (response?.error) throw response.error;
  return { data: response?.data, via: 'rpc' };
}
