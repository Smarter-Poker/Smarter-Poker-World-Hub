// pages/api/check-access.js
//
// Canonical Commander access check — replaces the missing
// /api/commander/check-access route that was being silently rewritten
// to commander.smarter.poker (where the endpoint also doesn't exist).
//
// Backed by the SECURITY DEFINER RPC `public.get_commander_access_details(uuid)`
// which checks all four access vectors:
//   - clubs.owner_id (Club Arena owner)
//   - commander_subscriptions.owner_id (active sub)
//   - commander_staff.user_id|linked_user_id (owner/manager at a venue)
//   - commander_home_groups.owner_id (home-game host)
//
// Auth: Bearer token in Authorization header (sent by HostHomeGameButton
//       via getAccessToken() from src/lib/authUtils). Falls back to 200 +
//       hasAccess:false on any error so the client never sees a 5xx.

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const NO_ACCESS = Object.freeze({
  hasAccess: false,
  isClubOwner: false,
  hasSubscription: false,
  isVenueStaffOwner: false,
  isVenueStaffManager: false,
  isHomeGroupOwner: false,
  venueIds: [],
  subscriptionVenueIds: [],
  clubs: [],
  homeGroups: [],
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return res.status(200).json(NO_ACCESS);
    }

    // Validate the Bearer token via Supabase Auth.
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return res.status(200).json(NO_ACCESS);
    }

    const userId = userData.user.id;

    const { data, error } = await supabaseAdmin.rpc(
      'get_commander_access_details',
      { p_user_id: userId }
    );

    if (error) {
      console.error('[check-access] RPC failed:', error);
      return res.status(200).json(NO_ACCESS);
    }

    return res.status(200).json(data || NO_ACCESS);
  } catch (err) {
    console.error('[check-access] handler error:', err);
    return res.status(200).json(NO_ACCESS);
  }
}
