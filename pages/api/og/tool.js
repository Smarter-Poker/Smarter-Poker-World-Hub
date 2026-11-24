/**
 * Dynamic SVG OpenGraph Social Card Endpoint for Smarter.Poker Calculators & Authority Hubs
 * GET /api/og/tool?title=...&subtitle=...&metric=...&badge=...
 *
 * Returns a crisp, high-contrast 1200x630 SVG social preview card styled in the
 * Smarter.Poker dark casino gold/cyan aesthetic.
 */
import { TOOL_OG_CATALOG, renderOgCardSvg, renderToolOgCard } from '../seo/badge.js';

export { TOOL_OG_CATALOG, renderOgCardSvg, renderToolOgCard };

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  return renderToolOgCard(req, res);
}
