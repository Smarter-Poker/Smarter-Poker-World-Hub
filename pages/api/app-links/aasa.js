/**
 * GET /.well-known/apple-app-site-association (rewritten here in next.config.js).
 * See src/lib/app-links.js. Apple requires application/json and no redirect.
 */
const { appLinksResponse } = require('../../../src/lib/app-links');

export default function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { status, body } = appLinksResponse('aasa', process.env);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', status === 200 ? 'public, max-age=3600' : 'no-store');
    return res.status(status).send(JSON.stringify(body));
}
