/**
 * ══════════════════════════════════════════════════════════════════════════
 *  PUBLIC HOME GAMES — VOUCH / UN-VOUCH API
 *  POST   /api/public/home-games/[slug]/vouch   — vouch for this game
 *  DELETE /api/public/home-games/[slug]/vouch   — remove vouch
 *  GET    /api/public/home-games/[slug]/vouch   — check status + fetch vouchers list
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Auth required for POST/DELETE. GET returns public vouch count + voucher
 *  avatars and names (for the clickable "X Players Vouched" modal).
 *
 *  vouch_count stays in sync via DB trigger (trg_sync_home_game_vouch_count).
 *  One vouch per user per group enforced by UNIQUE constraint.
 */

import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

async function resolveUser(req) {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
}

async function resolvePage(slug) {
    const { data, error } = await getSupabase()
        .from('social_pages')
        .select('id, page_type, is_public, slug, name, linked_entity_id')
        .eq('slug', slug)
        .eq('page_type', 'home_game')
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data;
}

export default async function handler(req, res) {
    try {
        const method = (req.method || 'GET').toUpperCase();
        const limit = method === 'GET' ? LIMITS.read : LIMITS.write;
        if (!applyRateLimit(req, res, limit)) return;

        if (!['GET', 'POST', 'DELETE'].includes(method)) {
            res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const slug = safeQ(req.query.slug);
        if (!slug) return res.status(400).json({ success: false, error: 'slug required' });

        const page = await resolvePage(slug);
        if (!page) return res.status(404).json({ success: false, error: 'Home game not found' });
        if (!page.linked_entity_id) return res.status(400).json({ success: false, error: 'Home game not fully initialized' });

        const supabase = getSupabase();

        // ── GET: vouch count + who vouched (for modal) ───────────────────────
        if (method === 'GET') {
            const user = await resolveUser(req);

            // Fetch the group's vouch_count
            const { data: group } = await supabase
                .from('commander_home_groups')
                .select('vouch_count, quality_score, vitality_score')
                .eq('id', page.linked_entity_id)
                .maybeSingle();

            // Fetch recent vouches
            const { data: vouches } = await supabase
                .from('home_game_vouches')
                .select('user_id, created_at')
                .eq('group_id', page.linked_entity_id)
                .order('created_at', { ascending: false })
                .limit(50);

            // Fetch profiles for the vouchers
            let profiles = [];
            if (vouches && vouches.length > 0) {
                const userIds = vouches.map(v => v.user_id);
                const { data: pData } = await supabase
                    .from('profiles')
                    .select('id, display_name, full_name, first_name, username, avatar_url')
                    .in('id', userIds);
                if (pData) profiles = pData;
            }

            // Map profiles to vouches
            const profileMap = profiles.reduce((acc, p) => {
                acc[p.id] = p;
                return acc;
            }, {});

            const voucherList = (vouches || []).map((v) => {
                const p = profileMap[v.user_id] || {};
                return {
                    user_id: v.user_id,
                    display_name: p.display_name || p.full_name || p.first_name || p.username || 'Player',
                    avatar_url: p.avatar_url || null,
                    vouched_at: v.created_at,
                };
            });

            // has_vouched must NOT be derived from the 50-row display list.
            // Past 50 vouches, early vouchers fall off the list and would be
            // told has_vouched=false — the UI shows "+ Vouch", the re-insert
            // is dup-swallowed as success, and the button oscillates on
            // reload. Run a dedicated existence check instead.
            let hasVouched = false;
            if (user) {
                const { data: myVouch, error: myVouchErr } = await supabase
                    .from('home_game_vouches')
                    .select('id')
                    .eq('group_id', page.linked_entity_id)
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (myVouchErr) {
                    console.warn('[vouch] has_vouched lookup failed:', myVouchErr.message);
                    // Fall back to the display list rather than lying outright.
                    hasVouched = voucherList.some((v) => v.user_id === user.id);
                } else {
                    hasVouched = !!myVouch;
                }
            }

            return res.status(200).json({
                success: true,
                has_vouched: hasVouched,
                vouch_count: group?.vouch_count || 0,
                quality_score: group?.quality_score || 0,
                vitality_score: group?.vitality_score || 0,
                vouchers: voucherList,
            });
        }

        // Auth required for POST and DELETE
        const user = await resolveUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // ── POST: vouch (idempotent) ──────────────────────────────────────────
        if (method === 'POST') {
            // ELIGIBILITY GATE.
            // A vouch is presented to visitors as a strong trust signal ("These
            // players have personally vouched for this home game") and feeds the
            // reputation badge through quality_score. Unrestricted, a host can
            // farm it from throwaway accounts. Two rules:
            //   1. The host cannot vouch for their own group.
            //   2. Everyone else must actually be in the group — an approved
            //      commander_home_members row (status 'approved' or 'active';
            //      'pending' and 'banned' do NOT count).
            const { data: groupRow, error: groupErr } = await supabase
                .from('commander_home_groups')
                .select('id, owner_id')
                .eq('id', page.linked_entity_id)
                .maybeSingle();
            if (groupErr) throw groupErr;
            if (!groupRow) {
                return res.status(404).json({ success: false, error: 'Home game not found' });
            }

            if (String(groupRow.owner_id) === String(user.id)) {
                return res.status(403).json({
                    success: false,
                    error: 'You cannot vouch for your own home game.',
                });
            }

            const { data: membership, error: memErr } = await supabase
                .from('commander_home_members')
                .select('status')
                .eq('group_id', page.linked_entity_id)
                .eq('user_id', user.id)
                .maybeSingle();
            if (memErr) throw memErr;

            const ELIGIBLE_MEMBER_STATUSES = ['approved', 'active'];
            if (!membership || !ELIGIBLE_MEMBER_STATUSES.includes(membership.status)) {
                return res.status(403).json({
                    success: false,
                    error: 'Only approved members of this home game can vouch for it.',
                    code: 'NOT_A_MEMBER',
                    member_status: membership?.status || 'none',
                });
            }

            const { error: insErr } = await supabase
                .from('home_game_vouches')
                .insert({ group_id: page.linked_entity_id, user_id: user.id });

            if (insErr) {
                // Unique constraint — already vouched, treat as success
                const isDup = /duplicate|unique|23505/i.test(insErr.message || '') || insErr.code === '23505';
                if (!isDup) throw insErr;
            }

            const { data: group } = await supabase
                .from('commander_home_groups')
                .select('vouch_count')
                .eq('id', page.linked_entity_id)
                .maybeSingle();

            return res.status(201).json({
                success: true,
                has_vouched: true,
                vouch_count: group?.vouch_count || 0,
            });
        }

        // ── DELETE: remove vouch (idempotent) ────────────────────────────────
        if (method === 'DELETE') {
            // A failed delete must NOT report success:true — the row would
            // still be there, the UI would flip the button to "Vouch" and the
            // count would snap back on the next reload.
            const { error: err_home_game_vouches_c800y } = await supabase
              .from('home_game_vouches')
              .delete()
                .eq('group_id', page.linked_entity_id)
                .eq('user_id', user.id);
            if (err_home_game_vouches_c800y) {
                console.warn('[vouch] delete failed:', err_home_game_vouches_c800y.message);
                return res.status(500).json({ success: false, error: 'Failed to remove vouch' });
            }

            const { data: group } = await supabase
                .from('commander_home_groups')
                .select('vouch_count')
                .eq('id', page.linked_entity_id)
                .maybeSingle();

            return res.status(200).json({
                success: true,
                has_vouched: false,
                vouch_count: group?.vouch_count || 0,
            });
        }

        return res.status(405).end();
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* non-fatal */ }
        console.warn('[public/home-games/slug/vouch]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
        }
    }
}
