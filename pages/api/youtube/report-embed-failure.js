/**
 * POST /api/youtube/report-embed-failure
 * 
 * Receives authenticated YouTube embed failure telemetry from the client.
 * Eligible reports enter a pending verification queue; browser telemetry can
 * never directly create a confirmed global content block.
 *
 * After the pending report is stored, this same request performs ONE bounded
 * server-side YouTube oEmbed check. Only an independent, definitive oEmbed
 * answer (401/403/404/410) corroborating the player error records a negative
 * verdict through the service-role verdict RPC, which quarantines the video
 * for every feed immediately. Anything else (200, 429, 5xx, redirects,
 * timeouts, network errors) leaves the report pending for the verifier. This
 * route never records a `verified` verdict.
 *
 * Body: { videoId: string, errorCode: number, surface: string }
 * Returns: { ok: true, status: string, adjudicated: boolean } or { error: string }
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
const OEMBED_TIMEOUT_MS = 4000;
const OEMBED_VERDICT_SURFACE = 'player_report_oembed';
// Mirrors _classify_http_error in scripts/video_library_to_reels.py exactly.
// Every other status is unknown and must never adjudicate.
const OEMBED_STATUS_VERDICTS = Object.freeze({
    401: 'private',
    403: 'restricted',
    404: 'unavailable',
    410: 'unavailable',
});
const NEGATIVE_VERDICTS = Object.freeze(['private', 'restricted', 'unavailable']);
const DB_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

// Per-instance bound on outbound oEmbed traffic: at most one check per video
// per window, no matter how many viewers report the same dead player.
const ADJUDICATION_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_TRACKED_ADJUDICATIONS = 500;
const recentAdjudicationAttempts = new Map();

function claimAdjudicationAttempt(videoId, now) {
    const previous = recentAdjudicationAttempts.get(videoId);
    if (previous != null && now - previous < ADJUDICATION_COOLDOWN_MS) return false;
    if (recentAdjudicationAttempts.size >= MAX_TRACKED_ADJUDICATIONS) {
        for (const [trackedId, attemptedAt] of recentAdjudicationAttempts) {
            if (now - attemptedAt >= ADJUDICATION_COOLDOWN_MS) {
                recentAdjudicationAttempts.delete(trackedId);
            }
        }
    }
    if (recentAdjudicationAttempts.size >= MAX_TRACKED_ADJUDICATIONS) return false;
    recentAdjudicationAttempts.set(videoId, now);
    return true;
}

function isConfirmedBlock(row) {
    return row?.verification_status === 'confirmed' && row?.resolved === false;
}

/**
 * One bounded oEmbed probe. Returns a negative verdict string only for a
 * definitive status; returns null for every unknown outcome. Throws on
 * timeout/network failure so the caller can log it.
 */
async function probeOEmbedVerdict(videoId) {
    if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) return null;
    const url = new URL(OEMBED_ENDPOINT);
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set('format', 'json');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            // Never follow a redirect to another host; a 3xx is simply unknown.
            redirect: 'manual',
            headers: {
                Accept: 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (compatible; SmarterPokerAvailability/1.0)',
            },
            signal: controller.signal,
        });
        const status = Number(response?.status);
        try {
            await response?.body?.cancel?.();
        } catch {
            // The status line is the whole signal; the body is never used.
        }
        return Object.prototype.hasOwnProperty.call(OEMBED_STATUS_VERDICTS, status)
            ? OEMBED_STATUS_VERDICTS[status]
            : null;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Request-time adjudication. Never throws: the pending report is already
 * durable, so every failure here is logged and leaves the report pending.
 * Returns the authoritative failure row when a confirmed block was recorded.
 */
async function adjudicateReportedFailure(supabase, videoId, errorCode) {
    if (!claimAdjudicationAttempt(videoId, Date.now())) return null;
    let outboundCallMade = false;
    try {
        // Anchor the verdict to the database clock: the newest report time
        // stored BEFORE the oEmbed request starts. The verdict RPC discards a
        // verdict when a newer report arrived after this instant, and using
        // the stored value verbatim avoids app/database clock skew.
        const { data: failureRow, error: anchorError } = await supabase
            .from('youtube_embed_failures')
            .select('verification_status, resolved, last_seen_at')
            .eq('video_id', videoId)
            .maybeSingle();
        if (anchorError) {
            console.error('[youtube-report] Adjudication anchor read failed:', anchorError.message, anchorError.code);
            return null;
        }
        if (isConfirmedBlock(failureRow)) return null;
        const verificationStartedAt = typeof failureRow?.last_seen_at === 'string'
            ? failureRow.last_seen_at
            : '';
        if (!DB_TIMESTAMP_RE.test(verificationStartedAt)) {
            console.error('[youtube-report] Adjudication anchor missing for', videoId);
            return null;
        }

        outboundCallMade = true;
        const verdict = await probeOEmbedVerdict(videoId);
        if (!verdict || !NEGATIVE_VERDICTS.includes(verdict)) return null;

        const { data, error: verdictError } = await supabase.rpc(
            'record_youtube_embed_failure_verdict',
            {
                p_video_id: videoId,
                p_verdict: verdict,
                p_error_code: errorCode,
                p_surface: OEMBED_VERDICT_SURFACE,
                p_verification_started_at: verificationStartedAt,
            }
        );
        if (verdictError) {
            console.error('[youtube-report] Verdict RPC error:', verdictError.message, verdictError.code);
            return null;
        }
        const verdictRow = Array.isArray(data) ? data[0] : data;
        if (!isConfirmedBlock(verdictRow)) {
            // A newer report superseded this check; let that report re-check.
            recentAdjudicationAttempts.delete(videoId);
            console.warn('[youtube-report] Verdict superseded by a newer report for', videoId);
            return null;
        }
        console.warn('[youtube-report] Quarantined', videoId, 'after oEmbed verdict', verdict);
        return verdictRow;
    } catch (err) {
        console.error(
            '[youtube-report] Adjudication failed; report stays pending:',
            err?.name || 'Error',
            err?.message
        );
        return null;
    } finally {
        if (!outboundCallMade) recentAdjudicationAttempts.delete(videoId);
    }
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Accept-Encoding, Authorization');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { videoId, errorCode, surface } = req.body || {};

    if (!videoId || errorCode == null) {
        return res.status(400).json({ error: 'Missing videoId or errorCode' });
    }

    const normalizedVideoId = String(videoId).trim();
    if (!YOUTUBE_VIDEO_ID_RE.test(normalizedVideoId)) {
        return res.status(400).json({ error: 'Invalid YouTube video ID' });
    }

    // Only durable availability/embed failures warrant server verification.
    // Codes 2 (bad parameter) and 5 (HTML5 playback) are local/transient and
    // must never become global censorship signals.
    const KNOWN_CODES = [100, 101, 150];
    const code = Number(errorCode);
    if (!KNOWN_CODES.includes(code)) {
        return res.status(400).json({ error: `Unknown error code: ${code}` });
    }

    try {
        const supabase = getSupabase();
        if (!supabase) {
            console.error('[youtube-report] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
            return res.status(503).json({ error: 'Service not configured' });
        }

        const { user, error: authError } = await getServerUserWithFallback(req, supabase);
        if (!user?.id) {
            return res.status(401).json({ error: authError || 'Authentication required' });
        }

        // Do not let an authenticated attacker spend verifier capacity on
        // arbitrary YouTube IDs. The ID must already belong to a poker library
        // asset or a currently public, ready poker Reel that our UI can serve.
        const [assetResult, reelResult] = await Promise.all([
            supabase
                .from('video_library_videos')
                .select('id')
                .eq('youtube_video_id', normalizedVideoId)
                .in('type', ['cash', 'tournament'])
                .limit(1)
                .maybeSingle(),
            supabase
                .from('social_reels')
                .select('id')
                .eq('is_public', true)
                .eq('media_status', 'ready')
                .in('topic', ['poker', 'cash', 'tournament'])
                .or(
                    `youtube_video_id.eq.${normalizedVideoId},canonical_asset_key.eq.youtube:${normalizedVideoId}`
                )
                .limit(1)
                .maybeSingle(),
        ]);
        if (assetResult.error || reelResult.error) {
            console.error(
                '[youtube-report] Membership lookup failed:',
                assetResult.error?.message || reelResult.error?.message
            );
            return res.status(503).json({ error: 'Failure report could not be validated' });
        }
        if (!assetResult.data?.id && !reelResult.data?.id) {
            return res.status(404).json({ error: 'Video is not in an eligible Smarter.Poker feed' });
        }

        // Browser reports are untrusted telemetry. This RPC records a pending
        // verification request while preserving any existing confirmed block;
        // only the server-side verifier may change global feed eligibility.
        const safeSurface = String(surface || 'Unknown')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .slice(0, 80);
        const { data, error: rpcError } = await supabase.rpc(
            'record_youtube_embed_failure_report',
            {
                p_video_id: normalizedVideoId,
                p_error_code: code,
                p_surface: safeSurface || 'Unknown',
            }
        );
        if (rpcError) {
            console.error('[youtube-report] RPC error:', rpcError.message, rpcError.code);
            return res.status(503).json({ error: 'Failure report could not be recorded' });
        }

        const result = Array.isArray(data) ? data[0] : data;

        // The report is durable from here on. A viewer report alone can never
        // quarantine a video: only the independent oEmbed proof below can, and
        // an existing confirmed block needs no further outbound check.
        const confirmedRow = isConfirmedBlock(result)
            ? null
            : await adjudicateReportedFailure(supabase, normalizedVideoId, code);

        return res.status(202).json({
            ok: true,
            status: confirmedRow?.verification_status
                || result?.verification_status
                || 'pending',
            adjudicated: Boolean(confirmedRow),
        });
    } catch (err) {
        console.error('[youtube-report] Unexpected error:', err.message, err.stack);
        return res.status(503).json({ error: 'Failure report could not be recorded' });
    }
}
