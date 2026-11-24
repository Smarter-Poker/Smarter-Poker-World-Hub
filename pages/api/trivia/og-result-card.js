import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { buildResultCardSvg } from '../../../src/lib/trivia/socialGrowthHelpers.mjs';

export default function handler(req, res) {
    res.setHeader('Allow', 'GET');
    if (req.method !== 'GET') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return undefined;

    const svg = buildResultCardSvg({
        mode: req.query?.mode,
        score: req.query?.score,
        total: req.query?.total,
        diamonds: req.query?.diamonds,
        streak: req.query?.streak,
        player: req.query?.player,
        grid: req.query?.grid,
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).send(svg);
}
