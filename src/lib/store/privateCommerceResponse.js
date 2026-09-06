/**
 * Financial and owner-scoped responses must never enter a shared cache. Apply
 * this before method, authentication, or validation checks so every response
 * path carries the same privacy contract.
 */
export function setPrivateCommerceResponse(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
}

export default setPrivateCommerceResponse;
