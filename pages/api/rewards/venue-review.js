/**
 * 📍 GEO-FENCED VENUE REVIEW REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 25diamonds for reviewing a venue ONLY if GPS proves user is within 200m
 * Uses diamond_reward_claims table for dedup
 *
 * ANTI-FARMING SAFEGUARDS:
 * - Must be within 200 meters of venue (haversine distance)
 * - 1 reward per venue lifetime (once per venue)
 * - 2 venue review rewards per day max
 * - Account must be 24+ hours old
 * - Global 500diamonds daily cap check
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REVIEW_REWARD = 25;
const MAX_PER_DAY = 2;
const GEOFENCE_RADIUS_METERS = 200;
const DAILY_GLOBAL_CAP = 500;

/**
 * Haversine formula — returns distance in meters between two GPS points
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}


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
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }


      const supabase = getSupabase();
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // ── Auth: JWT required (awards diamonds) ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const authUser = authData?.user;
      if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });


      const { venueId, latitude, longitude } = req.body;
      const userId = authUser.id; // Use JWT identity
      if (!userId || !venueId) {
          return res.status(400).json({ error: 'userId and venueId required' });
      }

      if (latitude == null || longitude == null) {
          return res.status(200).json({
              claimed: false,
              reason: 'GPS location required for venue review diamonds',
              diamondsAwarded: 0
          });
      }

      const now = new Date();
      const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

      try {
          // ── SAFEGUARD 1: Account age check (24 hours minimum) ──
          const { data: userProfile } = await supabase
              .from('profiles')
              .select('created_at')
              .eq('id', userId)
              .maybeSingle();

          if (userProfile?.created_at) {
              const accountAge = now - new Date(userProfile.created_at);
              if (accountAge < 24 * 60 * 60 * 1000) {
                  return res.status(200).json({ claimed: false, reason: 'Account too new', diamondsAwarded: 0 });
              }
          }

          // ── SAFEGUARD 2: Geo-fence check — must be within 200m of venue ──
          const { data: venue } = await supabase
              .from('poker_venues')
              .select('latitude, longitude, name')
              .eq('id', venueId)
              .maybeSingle();

          if (!venue || !venue.latitude || !venue.longitude) {
              return res.status(200).json({
                  claimed: false,
                  reason: 'Venue location not available',
                  diamondsAwarded: 0
              });
          }

          const distance = haversineDistance(
              parseFloat(latitude),
              parseFloat(longitude),
              parseFloat(venue.latitude),
              parseFloat(venue.longitude)
          );

          if (distance > GEOFENCE_RADIUS_METERS) {
              return res.status(200).json({
                  claimed: false,
                  reason: `You must be at ${venue.name || 'the venue'} to earn review diamonds (${Math.round(distance)}m away, need <${GEOFENCE_RADIUS_METERS}m)`,
                  diamondsAwarded: 0
              });
          }

          // ── SAFEGUARD 3: Already reviewed this venue? (lifetime 1 per venue) ──
          const { data: existingVenueClaim } = await supabase
              .from('diamond_reward_claims')
              .select('id')
              .eq('user_id', userId)
              .eq('reward_type', 'venue_review')
              .eq('metadata->>venueId', String(venueId))
              .maybeSingle();

          if (existingVenueClaim) {
              return res.status(200).json({
                  claimed: false,
                  reason: 'Already earned review diamonds for this venue',
                  diamondsAwarded: 0
              });
          }

          // ── SAFEGUARD 4: Daily limit (2 venue reviews per day) ──
          const { data: todayVenueClaims } = await supabase
              .from('diamond_reward_claims')
              .select('id')
              .eq('user_id', userId)
              .eq('reward_type', 'venue_review')
              .eq('claim_date', today)
                  .limit(200);

          if ((todayVenueClaims || []).length >= MAX_PER_DAY) {
              return res.status(200).json({
                  claimed: false,
                  reason: `Max ${MAX_PER_DAY} venue review rewards per day`,
                  diamondsAwarded: 0
              });
          }

          // ── SAFEGUARD 5: Global daily cap ──
          const { data: allTodayClaims } = await supabase
              .from('diamond_reward_claims')
              .select('diamonds_awarded')
              .eq('user_id', userId)
              .eq('claim_date', today)
                  .limit(200);

          const todayTotal = (allTodayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
          if (todayTotal >= DAILY_GLOBAL_CAP) {
              return res.status(200).json({ claimed: false, reason: 'Daily cap reached', diamondsAwarded: 0 });
          }

          const diamonds = Math.min(REVIEW_REWARD, DAILY_GLOBAL_CAP - todayTotal);

          // ── INSERT CLAIM ──
          const { error: claimError } = await supabase
              .from('diamond_reward_claims')
              .insert({
                  user_id: userId,
                  reward_type: 'venue_review',
                  diamonds_awarded: diamonds,
                  claim_date: today,
                  metadata: {
                      venueId: String(venueId),
                      venueName: venue.name || 'Unknown',
                      distanceMeters: Math.round(distance),
                      userLat: latitude,
                      userLng: longitude
                  }
              });

          if (claimError) {
              if (claimError.code === '23505') {
                  return res.status(200).json({ claimed: false, reason: 'Already claimed', diamondsAwarded: 0 });
              }
              throw claimError;
          }

          // ── CREDIT DIAMONDS (atomic: balance + transaction in one RPC) ──
          // Action-namespaced + actor-scoped reference_id so bare venueId
          // doesn't collide with anything else keyed by the same id.
          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: diamonds,
              p_type: 'venue_review',
              p_description: `Venue review reward at ${venue.name || 'venue'} — ${diamonds}diamonds (${Math.round(distance)}m away)`,
              p_reference_id: `venue_review_${userId}_${venueId}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Same bug shape as daily-login (commit 8d9ce5c9f1) — without
              // this the user gets "already claimed" forever and never sees
              // their diamonds.
              try {
                  const { error: err_diamond_reward_claims_ehpi1 } = await supabase
                    .from('diamond_reward_claims')
                    .delete()
                      .eq('user_id', userId)
                      .eq('reward_type', 'venue_review')
                      .eq('claim_date', today);
                  if (err_diamond_reward_claims_ehpi1) console.warn('[Supabase] Silent mutation failed in diamond_reward_claims:', err_diamond_reward_claims_ehpi1.message);
              } catch (rollbackErr) {
                  console.warn('[VenueReview] Rollback delete failed:', rollbackErr?.message || rollbackErr);
              }
              console.warn('[VenueReview] RPC error (claim rolled back so user can retry):', rpcError);
              return res.status(500).json({ error: 'Failed to credit diamonds — please retry' });
          }

          return res.status(200).json({
              claimed: true,
              diamondsAwarded: diamonds,
              reward: 'venue_review',
              distance: Math.round(distance),
              venueName: venue.name
          });

      } catch (error) {
          console.warn('Venue review reward error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
