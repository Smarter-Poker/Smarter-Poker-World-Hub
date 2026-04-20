/**
 * ══════════════════════════════════════════════════════════════════════════
 *  PUBLIC HOME GAMES — FOLLOW / UNFOLLOW API
 *  POST   /api/public/home-games/[slug]/follow   — follow this page
 *  DELETE /api/public/home-games/[slug]/follow   — unfollow
 *  GET    /api/public/home-games/[slug]/follow   — check if current user follows
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Auth required (Bearer token). Follows are stored in social_page_followers.
 *  follower_count on social_pages is kept in sync by app-side math (there is
 *  no existing DB trigger for the counter — we read, modify, and write).
 *
 *  Design notes:
 *   - Idempotent: POSTing again when already following returns the existing
 *     row. DELETEing when not following returns 200 with { was_following: false }.
 *   - Rate-limited under LIMITS.write (same as other mutation endpoints).
 *   - Never exposes follower identities to anonymous callers.
 */

import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

// Resolve slug -> social_page (must be home_game + public).
async function resolvePage(slug) {
  const { data, error } = await getSupabase()
    .from('social_pages')
    .select('id, page_type, is_public, follower_count, slug, name')
    .eq('slug', slug)
    .eq('page_type', 'home_game')
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.is_public) return null;
  return data;
}

export default async function handler(req, res) {
  try {
    const method = (req.method || 'GET').toUpperCase();

    // Rate-limit GET under read, POST/DELETE under write.
    const limit = method === 'GET' ? LIMITS.read : LIMITS.write;
    if (!applyRateLimit(req, res, limit)) return;

    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { slug } = req.query;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ success: false, error: 'slug required' });
    }

    const page = await resolvePage(slug);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Home game not found' });
    }

    // All three verbs require auth — following is a user-level action.
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const supabase = getSupabase();

    // ── GET: return current follow state ──
    if (method === 'GET') {
      const { data: follow } = await supabase
        .from('social_page_followers')
        .select('id, created_at, status, notifications_enabled')
        .eq('page_id', page.id)
        .eq('user_id', user.id)
        .maybeSingle();
      return res.status(200).json({
        success: true,
        is_following: !!follow,
        follower_count: page.follower_count || 0,
        follow: follow || null,
      });
    }

    // ── POST: follow (idempotent) ──
    if (method === 'POST') {
      // Check existing
      const { data: existing } = await supabase
        .from('social_page_followers')
        .select('id')
        .eq('page_id', page.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        return res.status(200).json({
          success: true,
          is_following: true,
          already: true,
          follower_count: page.follower_count || 0,
        });
      }

      // Insert new follower row
      const { error: insErr } = await supabase
        .from('social_page_followers')
        .insert({
          page_id: page.id,
          user_id: user.id,
          role: 'follower',
          status: 'active',
          notifications_enabled: true,
        });
      if (insErr) {
        // Collision race — another request inserted between our check and insert.
        // Treat as success.
        const isUnique = /duplicate|unique/i.test(insErr.message || '');
        if (!isUnique) throw insErr;
      }

      // Bump counter
      const newCount = (page.follower_count || 0) + 1;
      await supabase
        .from('social_pages')
        .update({ follower_count: newCount, updated_at: new Date().toISOString() })
        .eq('id', page.id);

      return res.status(201).json({
        success: true,
        is_following: true,
        already: false,
        follower_count: newCount,
      });
    }

    // ── DELETE: unfollow (idempotent) ──
    if (method === 'DELETE') {
      const { data: existing } = await supabase
        .from('social_page_followers')
        .select('id')
        .eq('page_id', page.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        return res.status(200).json({
          success: true,
          is_following: false,
          was_following: false,
          follower_count: page.follower_count || 0,
        });
      }

      const { error: delErr } = await supabase
        .from('social_page_followers')
        .delete()
        .eq('id', existing.id);
      if (delErr) throw delErr;

      const newCount = Math.max(0, (page.follower_count || 0) - 1);
      await supabase
        .from('social_pages')
        .update({ follower_count: newCount, updated_at: new Date().toISOString() })
        .eq('id', page.id);

      return res.status(200).json({
        success: true,
        is_following: false,
        was_following: true,
        follower_count: newCount,
      });
    }

    // Unreachable; guard above returns 405.
    return res.status(405).end();
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    // eslint-disable-next-line no-console
    console.error('[public/home-games/slug/follow]', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  }
}
