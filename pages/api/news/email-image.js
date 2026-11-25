/**
 * First-Party Email & Weekly Wire Image Endpoint (`/api/news/email-image`)
 *
 * Serves HMAC-SHA256 signed, SSRF-guarded, `sharp`-normalized Retina JPEGs and
 * guaranteed Vanguard fallback cards for Weekly Wire emails, `/hub/wire/*`,
 * `/hub/article`, and `/admin/newsletter`.
 */
import {
    fetchAndNormalizeEmailImage,
    normalizeImageMode,
    renderSpotCardImage,
    renderVanguardFallbackImage,
    verifyEmailImageSignature,
    verifySpotCardImageSignature,
} from '../../../src/lib/newsletter/emailImageProxy.mjs';

const EDGE_CACHE_OK = 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000';
const EDGE_CACHE_FALLBACK = 'public, max-age=3600, s-maxage=14400, stale-while-revalidate=86400';

const firstQuery = (val) => (Array.isArray(val) ? String(val[0] || '') : val == null ? '' : String(val));

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    // Permit cross-context image loading in email webviews (Gmail, Outlook, Apple Mail)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const brand = firstQuery(req.query?.brand).trim().toLowerCase();
    const isFallback = firstQuery(req.query?.fallback).trim() === '1';
    const mode = normalizeImageMode(firstQuery(req.query?.m).trim().toLowerCase());

    if (brand === 'crest') {
        const crest = await renderVanguardFallbackImage('crest');
        res.setHeader('Content-Type', crest.contentType);
        res.setHeader('Cache-Control', EDGE_CACHE_OK);
        res.setHeader('X-Image-Status', crest.status);
        res.setHeader('Content-Length', String(crest.buffer.byteLength));
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(crest.buffer);
    }

    if (isFallback) {
        const fb = await renderVanguardFallbackImage(mode);
        res.setHeader('Content-Type', fb.contentType);
        res.setHeader('Cache-Control', EDGE_CACHE_OK);
        res.setHeader('X-Image-Status', fb.status);
        res.setHeader('Content-Length', String(fb.buffer.byteLength));
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(fb.buffer);
    }

    const spotSlug = firstQuery(req.query?.spot).trim();
    if (spotSlug) {
        const spotSignature = firstQuery(req.query?.s).trim();
        const spot = verifySpotCardImageSignature(spotSlug, spotSignature);
        if (!spot) {
            res.setHeader('Cache-Control', 'private, no-store');
            return res.status(403).json({
                error: 'INVALID_SIGNATURE',
                message: 'Signed Smarter.Poker image token is required.',
            });
        }
        const spotImage = await renderSpotCardImage(spot);
        res.setHeader('Content-Type', spotImage.contentType);
        res.setHeader('Cache-Control', EDGE_CACHE_OK);
        res.setHeader('X-Image-Status', spotImage.status);
        res.setHeader('Content-Length', String(spotImage.buffer.byteLength));
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(spotImage.buffer);
    }

    const encodedUrl = firstQuery(req.query?.u).trim();
    const signature = firstQuery(req.query?.s).trim();

    const verifiedTargetUrl = verifyEmailImageSignature(encodedUrl, signature, mode);
    if (!verifiedTargetUrl) {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(403).json({
            error: 'INVALID_SIGNATURE',
            message: 'Signed Smarter.Poker image token is required.',
        });
    }

    try {
        const rendered = await fetchAndNormalizeEmailImage(verifiedTargetUrl, { mode });
        res.setHeader('Content-Type', rendered.contentType);
        res.setHeader(
            'Cache-Control',
            rendered.status === 'ok' ? EDGE_CACHE_OK : EDGE_CACHE_FALLBACK
        );
        res.setHeader('X-Image-Status', rendered.status);
        res.setHeader('Content-Length', String(rendered.buffer.byteLength));
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(rendered.buffer);
    } catch (err) {
        if (err?.code === 'BLOCKED_HOST') {
            res.setHeader('Cache-Control', 'private, no-store');
            return res.status(403).json({
                error: 'BLOCKED_HOST',
                message: 'Target address is not permitted.',
            });
        }
        const fb = await renderVanguardFallbackImage(mode);
        res.setHeader('Content-Type', fb.contentType);
        res.setHeader('Cache-Control', EDGE_CACHE_FALLBACK);
        res.setHeader('X-Image-Status', fb.status);
        res.setHeader('Content-Length', String(fb.buffer.byteLength));
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(fb.buffer);
    }
}
