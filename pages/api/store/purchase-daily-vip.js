/**
 * Retired Daily VIP endpoint.
 *
 * Monthly, Yearly, And Lifetime Are The Only Current VIP Terms. This explicit
 * terminal response prevents a cached client from treating a missing API route
 * as a retryable HTML success response.
 */
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  return res.status(410).json({
    success: false,
    error: 'DAILY_VIP_RETIRED',
    message: 'Daily VIP Is Retired. Choose Monthly, Yearly, Or Lifetime VIP.',
  });
}
