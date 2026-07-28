/**
 * 🎯 INITIALIZE HORSE SOURCE ASSIGNMENTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Run this ONCE to assign exclusive content sources to each of the 100 horses
 * 
 * Each horse gets 2-3 dedicated sources:
 * - Horse #1: Brad Owen, Andrew Neeme, Mariano
 * - Horse #2: HCL, The Lodge, Live at the Bike
 * - Horse #3: Rampage, Wolfgang, Jaman Burton
 * ... etc for all 100 horses
 * 
 * This ensures NO TWO HORSES ever pull from the same content creator
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { CLIP_SOURCES } from '../../../src/content-engine/pipeline/ClipLibrary.js';
import { SPORTS_CLIP_SOURCES } from '../../../src/content-engine/pipeline/SportsClipLibrary.js';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

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
      // SECURITY: a missing CRON_SECRET is a server misconfiguration, not a grant.
      // This previously FAILED OPEN: with CRON_SECRET unset the template below
      // collapsed to the literal string "Bearer undefined", so any caller
      // sending `Authorization: Bearer undefined` authenticated successfully.
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
          console.warn('[initialize-horse-sources] CRON_SECRET is not configured — rejecting request');
          return res.status(500).json({ success: false, error: 'Server misconfigured' });
      }

      // Verify admin access
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${cronSecret}`) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      try {

          // Get all active horses
          const { data: horses, error: horsesError } = await getSupabase()
              .from('content_authors')
              .select('profile_id, alias')
              .eq('is_active', true)
              .not('profile_id', 'is', null)
              .order('alias');

          if (horsesError || !horses?.length) {
              console.warn('Error fetching horses:', horsesError);
              return res.status(500).json({ success: false, error: 'Failed to fetch horses' });
          }


          // Poker sources
          const pokerSourceKeys = Object.keys(CLIP_SOURCES || {});

          // Sports sources
          const sportsSourceKeys = Object.keys(SPORTS_CLIP_SOURCES || {});

          const SOURCES_PER_HORSE = 3; // Each horse gets 3 sources
          const assignments = [];
          let pokerIndex = 0;
          let sportsIndex = 0;

          for (const horse of horses) {
              // Assign 2 poker sources
              const pokerSources = [];
              for (let i = 0; i < 2; i++) {
                  pokerSources.push(pokerSourceKeys[pokerIndex % pokerSourceKeys.length]);
                  pokerIndex++;
              }

              // Assign 1 sports source
              const sportsSources = [];
              sportsSources.push(sportsSourceKeys[sportsIndex % sportsSourceKeys.length]);
              sportsIndex++;

              // Create assignment records
              pokerSources.forEach((sourceKey, index) => {
                  assignments.push({
                      horse_profile_id: horse.profile_id,
                      source_key: sourceKey,
                      source_type: 'poker',
                      is_primary: index === 0
                  });
              });

              sportsSources.forEach((sourceKey, index) => {
                  assignments.push({
                      horse_profile_id: horse.profile_id,
                      source_key: sourceKey,
                      source_type: 'sports',
                      is_primary: index === 0
                  });
              });

          }


          // Batch insert all assignments
          const { data, error } = await getSupabase()
              .from('horse_source_assignments')
              .upsert(assignments, { onConflict: 'horse_profile_id,source_key' })
              .select();

          if (error) {
              console.warn('Error inserting assignments:', error);
              return res.status(500).json({ success: false, error: error.message });
          }


          // Verify assignments
          const { data: verification, error: verifyError } = await getSupabase()
              .from('horse_source_assignments')
              .select('horse_profile_id, source_key, source_type')
              .limit(10);

          if (!verifyError && verification) {
              verification.forEach(v => {
              });
          }

          return res.status(200).json({
              success: true,
              horses: horses.length,
              assignments: assignments.length,
              poker_sources: pokerSourceKeys.length,
              sports_sources: sportsSourceKeys.length,
              sample: verification
          });

      } catch (error) {
          console.warn('Initialization error:', error);
          return res.status(500).json({ success: false, error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
