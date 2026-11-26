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
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit.js';
import { SPOT_OF_THE_WEEK_CATALOG } from '../../../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    SPOT_VOTE_SUBJECT_PREFIX,
    computeSpotVoteRowId,
    parseSpotVotesSummary,
    serializeSpotVotesSummary,
} from '../../../src/lib/newsletter/campaignTelemetry.mjs';

export function computeSpotVoterUuid(spotSlug, voterIdentity, pick = '', secret = '') {
    const cleanPick = String(pick || '').trim().toUpperCase();
    const raw = `${String(spotSlug || '').trim()}:${String(voterIdentity || '').trim()}${cleanPick ? `:${cleanPick}` : ''}`;
    const key = String(secret || '').trim();
    const hex = key
        ? crypto.createHmac('sha256', key).update(raw).digest('hex')
        : crypto.createHash('sha256').update(raw).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient();
    }
    return _supabase;
}

/**
 * Server-side HMAC key for voter identifiers. Without it a stored voter UUID
 * is just SHA-256 of a guessable string (slug + hashed IPv4), so anyone with
 * database read access could brute-force the entire IPv4 space and recover
 * which address voted. Keyed hashing makes the stored ids irreversible.
 */
function spotVoteSecret() {
    return String(
        process.env.SPOT_VOTE_SECRET ||
            process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
            process.env.CRON_SECRET ||
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            ''
    ).trim();
}

/**
 * Computes integer percentages for spot option vote counts.
 */
function computeVotePercentages(counts) {
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

const SPOT_VOTE_PICKS = ['A', 'B', 'C'];
// One row stores every voter id of a spot (uuid[] column), so the row is bounded.
const SPOT_VOTE_MAX_VOTERS = 10000;
const SPOT_VOTE_MAX_ROWS = 10;
const SPOT_VOTE_WRITE_ATTEMPTS = 5;

/**
 * All rows for one spot, oldest first. The subject column has no unique
 * constraint, so duplicates left by earlier concurrent first votes must be
 * tolerated: the oldest row is canonical and the rest are folded into it.
 */
async function loadSpotVoteRows(sb, subject) {
    const { data, error } = await sb
        .from('newsletter_campaigns')
        .select('id, subject, status, article_ids, error_summary, updated_at, created_at')
        .eq('status', 'cancelled')
        .eq('subject', subject)
        .order('created_at', { ascending: true })
        .limit(SPOT_VOTE_MAX_ROWS);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

function mergeSpotVoteRows(rows) {
    const counts = { A: 0, B: 0, C: 0 };
    const ids = [];
    const seen = new Set();
    for (const row of rows) {
        const rowCounts = parseSpotVotesSummary(row?.error_summary);
        counts.A += rowCounts.A;
        counts.B += rowCounts.B;
        counts.C += rowCounts.C;
        for (const id of Array.isArray(row?.article_ids) ? row.article_ids : []) {
            const clean = String(id || '').toLowerCase();
            if (clean && !seen.has(clean)) {
                seen.add(clean);
                ids.push(clean);
            }
        }
    }
    return { canonical: rows[0] || null, duplicates: rows.slice(1), counts, ids, idSet: seen };
}

function respondWithTallies(res, extra, counts) {
    const total = counts.A + counts.B + counts.C;
    return res.status(200).json({
        success: true,
        ...extra,
        counts,
        total,
        percentages: computeVotePercentages(counts),
    });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, private');

    if (req.method === 'GET') {
        if (!applyRateLimit(req, res, LIMITS.read || LIMITS.write)) return;
        const slug = String(req.query?.spot || '').trim();
        if (!slug || !SPOT_OF_THE_WEEK_CATALOG.some((s) => s.slug === slug)) {
            return res.status(400).json({ error: 'Unknown spot of the week slug' });
        }

        try {
            const rows = await loadSpotVoteRows(getSupabase(), SPOT_VOTE_SUBJECT_PREFIX + slug);
            const { counts } = mergeSpotVoteRows(rows);
            return respondWithTallies(res, { spot: slug }, counts);
        } catch (err) {
            console.error('[spot-vote-get-error]', String(err?.message || err));
            return res.status(500).json({ error: 'Failed to retrieve vote tallies' });
        }
    }

    if (req.method === 'POST') {
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const spot = String(req.body?.spot || req.query?.spot || '').trim();
        const pick = String(req.body?.pick || req.query?.pick || '').trim().toUpperCase();

        if (!spot || !SPOT_OF_THE_WEEK_CATALOG.some((s) => s.slug === spot)) {
            return res.status(400).json({ error: 'Unknown spot of the week slug' });
        }
        if (!SPOT_VOTE_PICKS.includes(pick)) {
            return res.status(400).json({ error: 'Pick must be A, B, or C' });
        }

        const secret = spotVoteSecret();
        if (!secret) {
            return res.status(503).json({ error: 'Voting is temporarily unavailable' });
        }

        const sb = getSupabase();
        let voterIdentity = null;
        try {
            // getServerUserWithFallback resolves to { user, error }, never a bare user.
            const { user } = await getServerUserWithFallback(req, sb);
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

        // Id recorded for this voter's pick, the ids every pick would have produced,
        // and the legacy unkeyed id written before voter ids were keyed.
        const votedIdByPick = {};
        for (const option of SPOT_VOTE_PICKS) {
            votedIdByPick[option] = computeSpotVoterUuid(spot, voterIdentity, option, secret);
        }
        const legacyVoterId = computeSpotVoterUuid(spot, voterIdentity);
        const subject = SPOT_VOTE_SUBJECT_PREFIX + spot;

        try {
            for (let attempt = 0; attempt < SPOT_VOTE_WRITE_ATTEMPTS; attempt += 1) {
                const rows = await loadSpotVoteRows(sb, subject);
                const merged = mergeSpotVoteRows(rows);
                const recordedPick =
                    SPOT_VOTE_PICKS.find((option) => merged.idSet.has(votedIdByPick[option])) || null;
                const alreadyVoted = Boolean(recordedPick) || merged.idSet.has(legacyVoterId);

                if (alreadyVoted) {
                    // First vote stands: a repeat (or changed) pick never alters the tallies.
                    return respondWithTallies(
                        res,
                        { spot, pick: recordedPick, requestedPick: pick, alreadyVoted: true },
                        merged.counts
                    );
                }
                if (merged.ids.length >= SPOT_VOTE_MAX_VOTERS) {
                    return respondWithTallies(
                        res,
                        { spot, pick: null, requestedPick: pick, alreadyVoted: false, votingClosed: true },
                        merged.counts
                    );
                }

                const counts = { ...merged.counts, [pick]: merged.counts[pick] + 1 };
                const nextIds = [...merged.ids, votedIdByPick[pick]];
                const errorSummary = serializeSpotVotesSummary(counts);

                if (!merged.canonical) {
                    const { error: insertErr } = await sb.from('newsletter_campaigns').insert({
                        id: computeSpotVoteRowId(spot),
                        status: 'cancelled',
                        audience: 'active_subscribers',
                        lookback_days: 7,
                        article_limit: 5,
                        subject,
                        recipient_count: 0,
                        sent_count: 0,
                        failed_count: 0,
                        article_ids: nextIds,
                        error_summary: errorSummary,
                    });
                    if (!insertErr) {
                        return respondWithTallies(
                            res,
                            { spot, pick, requestedPick: pick, alreadyVoted: false },
                            counts
                        );
                    }
                    // 23505: a concurrent first vote created the row; re-read and merge into it.
                    if (insertErr.code === '23505') continue;
                    console.error('[spot-vote-insert-error]', String(insertErr.message || insertErr));
                    return res.status(500).json({ error: 'Failed to create vote record' });
                }

                // Optimistic concurrency: only write over the exact version that was read.
                let updateQuery = sb
                    .from('newsletter_campaigns')
                    .update({
                        article_ids: nextIds,
                        error_summary: errorSummary,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', merged.canonical.id)
                    .eq('status', 'cancelled');
                updateQuery = merged.canonical.updated_at
                    ? updateQuery.eq('updated_at', merged.canonical.updated_at)
                    : updateQuery.is('updated_at', null);
                const { data: updatedRows, error: updateErr } = await updateQuery.select('id');
                if (updateErr) {
                    console.error('[spot-vote-update-error]', String(updateErr.message || updateErr));
                    return res.status(500).json({ error: 'Failed to record vote' });
                }
                if (!Array.isArray(updatedRows) || updatedRows.length === 0) continue; // lost the race

                if (merged.duplicates.length > 0) {
                    const dupIds = merged.duplicates.slice(0, 10).map((row) => row.id);
                    await sb
                        .from('newsletter_campaigns')
                        .delete()
                        // in-list: bounded by SPOT_VOTE_MAX_ROWS (<= 10)
                        .in('id', dupIds.slice(0, 10))
                        .eq('status', 'cancelled')
                        .eq('subject', subject);
                }
                return respondWithTallies(res, { spot, pick, requestedPick: pick, alreadyVoted: false }, counts);
            }
            return res.status(503).json({ error: 'Vote could not be recorded right now. Please try again.' });
        } catch (err) {
            console.error('[spot-vote-post-error]', String(err?.message || err));
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
}
