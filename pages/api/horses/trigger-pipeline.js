import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      // Auth check
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Authorization required' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: profile } = await getSupabase().from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          return res.status(403).json({ error: 'Admin routes are disabled in production' });
      }

      const { type } = req.body; // 'test', 'cycle', 'daily', 'publish'

      try {
          const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
          const host = req.headers.host || 'localhost:3000';
          const baseUrl = `${protocol}://${host}`;

          let endpoint = '/api/cron/horses-stories';

          // In a real expanded app, different types might hit different endpoints.
          // For now, we hit the main horses cron engine to generate stories.
          const startTime = Date.now();
          const cronRes = await fetch(`${baseUrl}${endpoint}`, {
              headers: {
                  'Authorization': `Bearer ${process.env.CRON_SECRET}`
              }
          });

          const cronData = await cronRes.json().catch(() => ({ error: 'Invalid response from cron' }));
          const duration_seconds = Math.round((Date.now() - startTime) / 1000);

          // Log the run to pipeline_runs
          const runData = {
              run_type: type,
              text_posts_created: cronData.text_stories || 0,
              videos_created: cronData.video_stories || 0,
              errors: (cronData.success === false || cronData.error) ? 1 : 0,
              duration_seconds: duration_seconds
          };

          // Insert and select the created record to return to frontend
          const { data: insertedRun, error: insertError } = await getSupabase()
              .from('pipeline_runs')
              .insert(runData)
              .select()
              .maybeSingle();

          if (insertError) {
              console.warn('Failed to log pipeline run:', insertError);
          }

          return res.status(200).json({
              success: true,
              run: insertedRun || { ...runData, id: Date.now(), started_at: new Date().toISOString() },
              details: cronData
          });
      } catch (e) {
          console.warn('Pipeline Trigger Error:', e);
          return res.status(500).json({ error: e.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
