/**
 * Community Spot Of The Week Vote API — /api/news/spot-vote
 *
 * Lets players and Weekly Wire readers vote on solver decision spots
 * ('A', 'B', or 'C') directly from emails and web archive issues.
 *
 * Tallies and deduplicated voter UUIDs are stored in `newsletter_campaigns`
 * with `status = 'cancelled'` and `subject = '[SPOT-VOTE] <spot_slug>'` so
 * they are automatically excluded from Weekly Wire dispatches, sitemaps,
 * and RSS feeds without requiring schema migrations.
 */
import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { SPOT_OF_THE_WEEK_CATALOG } from '../../../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    SPOT_VOTE_SUBJECT_PREFIX,
    parseSpotVotesSummary,
    serializeSpotVotesSummary,
} from '../../../src/lib/newsletter/campaignTelemetry.mjs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient();
    }
    return _supabase;
}

/**
 * Computes a deterministic, privacy-safe RFC 4122 v4-formatted UUID from
 * a spot slug and voter identity token (authenticated user ID or hashed IP).
 * Zero raw IP addresses or personal credentials are ever written to the database.
 */
export function computeSpotVoterUuid(spotSlug, voterIdentity) {
    const raw = `${String(spotSlug || '').trim()}:${String(voterIdentity || '').trim()}`;
    const hex = crypto.createHash('sha256').update(raw).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Computes integer percentages for spot option vote counts.
 */
export function computeVotePercentages(counts) {
    const a = Math.max(0, Math.floor(Number(counts?.A || 0)));
    const b = Math.max(0, Math.floor(Number(counts?.B || 0)));
    const c = Math.max(0, Math.floor(Number(counts?.C || 0)));
    const total = a + b + c;
    if (total <= 0) {
        return { A: 0, B: 0, C: 0 };
    }
    return {
        A: Math.round((a / total) * 100),
        B: Math.round((b / total) * 100),
        C: Math.round((c / total) * 100),
    };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, private');

    if (req.method === 'GET') {
        const slug = String(req.query?.spot || '').trim();
        if (!slug || !SPOT_OF_THE_WEEK_CATALOG.some((s) => s.slug === slug)) {
            return res.status(400).json({ error: 'Unknown spot of the week slug' });
        }

        try {
            const sb = getSupabase();
            const { data: rows, error: readErr } = await sb
                .from('newsletter_campaigns')
                .select('id, subject, status, article_ids, error_summary')
                .eq('status', 'cancelled')
                .eq('subject', SPOT_VOTE_SUBJECT_PREFIX + slug)
                .limit(1);

            if (readErr) {
                return res.status(500).json({ error: 'Failed to retrieve vote tallies' });
            }

            const campaign = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            const counts = parseSpotVotesSummary(campaign?.error_summary);
            const total = counts.A + counts.B + counts.C;
            const percentages = computeVotePercentages(counts);

            return res.status(200).json({
                success: true,
                spot: slug,
                counts,
                total,
                percentages,
            });
        } catch (err) {
            console.error('[spot-vote-get-error]', String(err?.message || err));
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    if (req.method === 'POST') {
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const spot = String(req.body?.spot || req.query?.spot || '').trim();
        const pick = String(req.body?.pick || req.query?.pick || '').trim().toUpperCase();

        if (!spot || !SPOT_OF_THE_WEEK_CATALOG.some((s) => s.slug === spot)) {
            return res.status(400).json({ error: 'Unknown spot of the week slug' });
        }
        if (!['A', 'B', 'C'].includes(pick)) {
            return res.status(400).json({ error: 'Pick must be A, B, or C' });
        }

        let voterIdentity = null;
        try {
            const user = await getServerUserWithFallback(req);
            if (user?.id) {
                voterIdentity = `user:${user.id}`;
            }
        } catch {
            /* fallback to ip hash */
        }
        if (!voterIdentity) {
            const realIp =
                req.headers?.['x-real-ip'] ||
                req.headers?.['x-forwarded-for']?.split(',')[0] ||
                req.socket?.remoteAddress ||
                'unknown';
            const ipHash = crypto.createHash('sha256').update(String(realIp).trim()).digest('hex');
            voterIdentity = `ip:${ipHash}`;
        }

        const voterUuid = computeSpotVoterUuid(spot, voterIdentity);

        try {
            const sb = getSupabase();
            const { data: rows, error: readErr } = await sb
                .from('newsletter_campaigns')
                .select('id, subject, status, article_ids, error_summary')
                .eq('status', 'cancelled')
                .eq('subject', SPOT_VOTE_SUBJECT_PREFIX + spot)
                .limit(1);

            if (readErr) {
                return res.status(500).json({ error: 'Failed to access vote records' });
            }

            const campaign = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            const existingIds = Array.isArray(campaign?.article_ids) ? campaign.article_ids : [];
            const alreadyVoted = existingIds.includes(voterUuid);
            let counts = parseSpotVotesSummary(campaign?.error_summary);

            if (!alreadyVoted) {
                counts[pick] = (counts[pick] || 0) + 1;
                const nextIds = [...existingIds, voterUuid];
                const errorSummary = serializeSpotVotesSummary(counts);
                if (campaign?.id) {
                    const { error: updateErr } = await sb
                        .from('newsletter_campaigns')
                        .update({
                            article_ids: nextIds,
                            error_summary: errorSummary,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', campaign.id);
                    if (updateErr) {
                        return res.status(500).json({ error: 'Failed to record vote' });
                    }
                } else {
                    const { error: insertErr } = await sb
                        .from('newsletter_campaigns')
                        .insert({
                            status: 'cancelled',
                            audience: 'active_subscribers',
                            lookback_days: 7,
                            article_limit: 5,
                            subject: SPOT_VOTE_SUBJECT_PREFIX + spot,
                            recipient_count: 0,
                            sent_count: 0,
                            failed_count: 0,
                            article_ids: nextIds,
                            error_summary: errorSummary,
                        });
                    if (insertErr) {
                        return res.status(500).json({ error: 'Failed to create vote record' });
                    }
                }
            }

            const total = counts.A + counts.B + counts.C;
            const percentages = computeVotePercentages(counts);

            return res.status(200).json({
                success: true,
                spot,
                pick,
                alreadyVoted,
                counts,
                total,
                percentages,
            });
        } catch (err) {
            console.error('[spot-vote-post-error]', String(err?.message || err));
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
}
