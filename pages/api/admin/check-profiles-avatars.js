// Check profiles for avatar URLs
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

export default async function handler(req, res) {
  try {
    // BUG #167 FIX: Block in production
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
      const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // Get profiles that would be notification actors
      const { data: profiles, error } = await sb
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .limit(20);

      // Count how many have avatar_url vs not
      const withAvatar = profiles?.filter(p => p.avatar_url) || [];
      const withoutAvatar = profiles?.filter(p => !p.avatar_url) || [];

      res.json({
          total: profiles?.length || 0,
          withAvatar: withAvatar.length,
          withoutAvatar: withoutAvatar.length,
          samples: profiles?.slice(0, 10),
          error: error?.message
      });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
