/**
 * GET /api/seo/qr
 * ============================================================================
 * Serves a deterministic ISO/IEC 18004 QR Code SVG pointing to a verified
 * https://smarter.poker/... destination URL for printable floor rule sheets
 * and tournament reference cards.
 */

import { renderQrCodeSvg } from '../../../src/lib/seo/qrCodeSvg';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const rawPath = String(req.query.path || '/rules').trim();
  const cleanPath = rawPath.startsWith('/') ? rawPath.replace(/[^a-zA-Z0-9/_-]/g, '') : '/rules';
  const destinationUrl = `https://smarter.poker${cleanPath}`;
  const label = String(req.query.label || `Smarter.Poker Floor Reference (${cleanPath})`).slice(0, 90);

  const svg = renderQrCodeSvg(destinationUrl, { pixelSize: 160, label });

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
  res.setHeader('X-QR-Destination', destinationUrl);
  return res.status(200).send(svg);
}
