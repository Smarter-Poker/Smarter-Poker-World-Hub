/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRON: /api/cron/social-page-completion-nudge
 *  Schedule: Every 3 days at 09:30 UTC (registered in openclaw-cron-dispatcher.py)
 *
 *  Finds social page owners whose pages are missing key profile fields
 *  (avatar_url, cover_url, description) and sends a single in-app notification
 *  nudging them to finish setup.
 *
 *  Deduplication: A nudge_sent_at timestamp is written to social_pages.metadata
 *  and re-nudges are suppressed for 7 days. This prevents spam if a user
 *  intentionally leaves fields blank.
 *
 *  Completeness definition (a page is "incomplete" if ANY of these are missing):
 *    - avatar_url      (logo / profile photo)
 *    - cover_url       (cover/banner photo)
 *    - description     (bio / about text)
 *
 *  Auth: Bearer <CRON_SECRET> (set in env, matched by OpenClaw dispatcher)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { withCronHealth } from '../../../src/lib/cronHealth';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

const CRON_SECRET      = process.env.CRON_SECRET;
const NUDGE_COOLDOWN_DAYS = 7;     // min days between nudges per page
const MAX_PAGES_PER_RUN   = 200;   // safety cap — don't blast everyone at once

async function handler(req, res) {
    // ── Auth ──────────────────────────────────────────────────────────────────
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    const auth = req.headers.authorization || '';
    if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase  = getSupabase();
    const dryRun    = req.query.dry === '1';
    const cutoffISO = new Date(Date.now() - NUDGE_COOLDOWN_DAYS * 86_400_000).toISOString();

    let nudged = 0;
    let skipped = 0;
    let errors = 0;

    try {
        // ── Step 1: Fetch incomplete pages ────────────────────────────────────
        // We pull up to MAX_PAGES_PER_RUN pages where at least one core field
        // is missing AND the owner_id is non-null (so there's someone to notify).
        const { data: pages, error: fetchErr } = await supabase
            .from('social_pages')
            .select('id, name, slug, owner_id, avatar_url, cover_url, description, metadata')
            .not('owner_id', 'is', null)
            .or('avatar_url.is.null,cover_url.is.null,description.is.null')
            .limit(MAX_PAGES_PER_RUN);

        if (fetchErr) throw fetchErr;
        if (!pages?.length) {
            return res.status(200).json({ success: true, nudged: 0, skipped: 0, message: 'No incomplete pages found' });
        }

        // ── Step 2: Filter out recently nudged pages ──────────────────────────
        const eligible = pages.filter(p => {
            const lastNudge = p.metadata?.nudge_sent_at;
            if (!lastNudge) return true;
            return lastNudge < cutoffISO;
        });

        skipped = pages.length - eligible.length;

        if (!eligible.length) {
            return res.status(200).json({ success: true, nudged: 0, skipped, message: 'All incomplete pages already nudged recently' });
        }

        // ── Step 3: Send in-app notifications + stamp metadata ────────────────
        for (const page of eligible) {
            const missing = [];
            if (!page.avatar_url) missing.push('logo');
            if (!page.cover_url)  missing.push('cover photo');
            if (!page.description?.trim()) missing.push('description');

            const pageRef   = page.slug || page.id;
            const pageName  = page.name || 'Your Page';
            const missingStr = missing.join(', ');

            if (dryRun) {
                console.log(`[DRY RUN] Would nudge owner ${page.owner_id} for page "${pageName}" (missing: ${missingStr})`);
                nudged++;
                continue;
            }

            try {
                // Insert in-app notification for the page owner
                const { error: notifErr } = await supabase
                    .from('notifications')
                    .insert({
                        user_id:     page.owner_id,
                        type:        'page_completion_nudge',
                        title:       'Finish Setting Up Your Page',
                        body:        `"${pageName}" is missing: ${missingStr}. Complete your profile to attract more followers.`,
                        action_url:  `/hub/social-pages/${pageRef}/manage`,
                        metadata:    { page_id: page.id, missing_fields: missing },
                        is_read:     false,
                    });

                if (notifErr) {
                    console.warn(`[nudge] Notification insert failed for page ${page.id}:`, notifErr.message);
                    errors++;
                    continue;
                }

                // Stamp nudge_sent_at in social_pages.metadata so we don't re-spam
                const updatedMeta = { ...(page.metadata || {}), nudge_sent_at: new Date().toISOString() };
                const { error: err_social_pages_3jin1 } = await supabase
                  .from('social_pages')
                  .update({ metadata: updatedMeta })
                    .eq('id', page.id);
                if (err_social_pages_3jin1) console.warn('[Supabase] Silent mutation failed in social_pages:', err_social_pages_3jin1.message);

                nudged++;
            } catch (innerErr) {
                reportApiError(innerErr, req);
                errors++;
            }
        }

        return res.status(200).json({
            success: true,
            nudged,
            skipped,
            errors,
            dry_run: dryRun,
            pages_scanned: pages.length,
        });

    } catch (err) {
        reportApiError(err, req);
        console.error('[social-page-completion-nudge] Fatal error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('social-page-completion-nudge', handler);
