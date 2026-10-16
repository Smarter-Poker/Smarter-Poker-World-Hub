import fs from 'node:fs';
import path from 'node:path';

/**
 * OpenAPI 3.1.0 Specification Endpoint
 * GET /api/openapi
 *
 * Serves the authoritative OpenAPI definition for AI agents and LLM tooling.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');

  try {
    const filePath = path.join(process.cwd(), 'public', 'api', 'openapi.json');
    const content = fs.readFileSync(filePath, 'utf8');
    return res.status(200).send(content);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to read OpenAPI spec' });
  }
}
