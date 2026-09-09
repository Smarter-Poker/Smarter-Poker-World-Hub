/**
 * GET /.well-known/assetlinks.json (rewritten here in next.config.js).
 * See src/lib/app-links.js.
 */
const { appLinksResponse } = require('../../../src/lib/app-links');

export default function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { status, body } = appLinksResponse('assetlinks', process.env);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', status === 200 ? 'public, max-age=3600' : 'no-store');
    return res.status(status).send(JSON.stringify(body));
}
