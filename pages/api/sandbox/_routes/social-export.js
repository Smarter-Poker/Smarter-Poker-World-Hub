/**
 * POST /api/sandbox/social-export
 * W6-6: Exports a Sandbox Session Report to the social_posts feed table.
 *
 * Consumers: SessionReport.jsx (handCount/evLoss/content) and
 * SandboxComponents.jsx (content + metadata).
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const MAX_CONTENT = 500;
const MAX_METADATA_BYTES = 4000;

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

      try {
          const supabase = getSupabase();

          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: authData } = await supabase.auth.getUser(token);
                  const user = authData?.user;
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

          const { handCount, content, evLoss, metadata } = req.body || {};

          // req.body is untrusted — a string evLoss would blow up .toFixed().
          const evNum = typeof evLoss === 'number' && isFinite(evLoss) ? evLoss : null;
          const handNum = Number(handCount) || 0;

          const fallback = `Just wrapped up a Sandbox session analyzing ${handNum} spots. ${evNum !== null ? `Identified ${Math.abs(evNum).toFixed(2)} EV lost.` : 'Reviewing my lines.'} #study-grind`;
          const postContent = String(content || fallback).slice(0, MAX_CONTENT);

          // Client metadata is optional and bounded; server fields always win.
          let clientMeta = {};
          if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
              try {
                  if (JSON.stringify(metadata).length <= MAX_METADATA_BYTES) clientMeta = metadata;
              } catch (_e) { clientMeta = {}; }
          }

          // Use the existing social_posts table format
          const { data, error } = await supabase
              .from('social_posts')
              .insert({
                  author_id: userId,
                  content: postContent,
                  content_type: 'sandbox_report',
                  metadata: {
                      ...clientMeta,
                      handCount: handNum,
                      evLoss: evNum,
                      source: 'Sandbox',
                  },
              })
              .select('id')
              .maybeSingle();

          if (error) {
              // Graceful fallback if social_posts table doesn't exist yet on this env
              if (error.code === '42P01') {
                  return res.status(200).json({ success: true, dummy: true, message: 'Simulated post (social_posts table pending Phase 14)' });
              }
              console.warn('[social-export] Insert error:', error.message);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, post: data });
      } catch (err) {
          console.warn('[social-export] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
