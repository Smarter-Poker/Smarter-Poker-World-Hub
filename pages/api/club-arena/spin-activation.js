/**
 * POST /api/club-arena/spin-activation
 *
 * The owner's Spin switch. A club or union owner turns Spins on, decides how
 * much they are seeding, and gets that seed back once play has collected as
 * much on its own.
 *
 * Actions:
 *   get_state   — everything the owner menu shows, in one read
 *   activate    — seed the wallet from a wallet the owner holds and open Spins
 *   deactivate  — stop offering Spins (moves no money)
 *
 * WHY THIS ROUTE EXISTS AT ALL.
 * fn_spin_activate moves real money, so it is REVOKEd from anon and
 * authenticated — a browser cannot call it. The database can enforce that the
 * seed is large enough and that the wallet can afford it, but it cannot answer
 * "is the person asking actually the owner". That is this file's whole job:
 * establish who is asking, prove they own the pool, and only then let the
 * service role call the function.
 *
 * WHO OWNS A POOL. fn_spin_reserve_owner resolves COALESCE(clubs.union_id,
 * club_id): a club inside a union does not have its own pool, its UNION does.
 * So authorisation follows the same rule — a club owner may act on their own
 * club's pool only when the club is NOT in a union, and a union pool is the
 * union lead's to control. Checking club ownership alone would let one club in
 * a union spend the union's money.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLUB_WALLETS = ['chip_treasury', 'promo_balance'];
const UNION_WALLETS = ['chip_balance', 'promo_wallet', 'rake_wallet', 'spin_reserve_wallet'];

/**
 * The Spin board's price points. The seed is quoted against the LARGEST stake
 * the owner chooses to offer, so this list is also the set of legal answers.
 * Mirrors SPIN_BOARD_BUYINS in the engine and spinSpec on the client.
 */
const BOARD_STAKES = [1, 2, 3, 5, 10, 20, 50, 100];

/**
 * Resolve who owns the pool for this club, and whether the caller may act on
 * it. Returns { ownerId, ownerKind, user } or { error, status }.
 */
async function authorise(token, clubId) {
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  const user = authData?.user;
  if (authErr || !user) return { error: 'Not authenticated', status: 401 };

  const { data: club } = await supabaseAdmin
    .from('clubs')
    .select('id, owner_id, union_id')
    .eq('id', clubId)
    .maybeSingle();
  if (!club) return { error: 'Club not found', status: 404 };

  /**
   * IS THIS ID ITSELF A UNION?
   *
   * Every union carries a clubs row with the SAME uuid (clubs.is_union = true),
   * so passing a union's own id as clubId lands on a real clubs row. If that
   * row's union_id were ever null, the branch below would fall through to the
   * standalone-club test and authorise on clubs.owner_id -- checking club
   * ownership where union leadership is required, which is precisely the hole
   * this file exists to close. Today those rows do carry union_id, so the
   * fall-through is not reachable; asking `unions` directly means it cannot
   * become reachable by a data change nobody connected to this file.
   */
  const { data: unionRow } = await supabaseAdmin
    .from('unions').select('id').eq('id', clubId).maybeSingle();
  const ownerIsUnion = Boolean(unionRow) || Boolean(club.union_id);
  const unionId = unionRow?.id || club.union_id;

  // Platform admins can always act.
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isPlatformAdmin = ['admin', 'superadmin'].includes(profile?.role);

  if (ownerIsUnion) {
    // The UNION owns this pool. Only the union lead (or a platform admin) may
    // spend union money — not the individual club owner.
    const { data: admin } = await supabaseAdmin
      .from('union_admins')
      .select('role')
      .eq('union_id', unionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (admin?.role !== 'union_lead' && !isPlatformAdmin) {
      // A read is still allowed -- the club owner should be able to SEE the
      // union's Spin wallet on their own settings page, they just cannot
      // change it. canManage is what the panel gates its buttons on, so it no
      // longer has to infer permission from owner_kind and get it wrong in
      // both directions.
      return { user, ownerId: unionId, ownerKind: 'union', canManage: false };
    }
    return { user, ownerId: unionId, ownerKind: 'union', canManage: true };
  }

  return {
    user,
    ownerId: club.id,
    ownerKind: 'club',
    canManage: club.owner_id === user.id || isPlatformAdmin,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'POST only' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    if (JSON.stringify(req.body || {}).length > 2048) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { action, clubId } = req.body || {};
    if (!clubId || typeof clubId !== 'string') {
      return res.status(400).json({ success: false, error: 'clubId is required' });
    }

    const auth = await authorise(token, clubId);
    if (auth.error) return res.status(auth.status).json({ success: false, error: auth.error });

    if (action === 'get_state') {
      const { data, error } = await supabaseAdmin.rpc('fn_spin_owner_state', { p_club_id: clubId });
      if (error) throw error;
      // canManage is decided HERE, where the union_admins and clubs.owner_id
      // rows actually are. The panel used to infer it from owner_kind, which
      // hid the off switch from the union lead who is allowed to press it and
      // showed an activate button to a club owner who is not.
      return res
        .status(200)
        .json({ success: true, state: data, ownerKind: auth.ownerKind, canManage: auth.canManage });
    }

    // Everything past here MOVES MONEY.
    if (!auth.canManage) {
      return res.status(403).json({
        success: false,
        error:
          auth.ownerKind === 'union'
            ? 'This Spin wallet belongs to the union. Only the union lead can change it.'
            : 'Only the club owner can change this',
      });
    }

    if (action === 'activate') {
      const seed = Number(req.body.seedAmount);
      const maxStake = Number(req.body.offeredMaxStake);
      const wallet = req.body.sourceWallet;

      if (!Number.isFinite(seed) || seed <= 0) {
        return res.status(400).json({ success: false, error: 'Seed must be a positive number' });
      }
      // Whole chips only. The estate's buy-in rules are whole-dollar and a
      // fractional seed would round its way into the ledger.
      if (!Number.isInteger(seed)) {
        return res.status(400).json({ success: false, error: 'Seed must be a whole number of chips' });
      }
      if (!BOARD_STAKES.includes(maxStake)) {
        return res.status(400).json({
          success: false,
          error: `Max stake must be one of the board's price points: ${BOARD_STAKES.join(', ')}`,
        });
      }
      const allowed = auth.ownerKind === 'union' ? UNION_WALLETS : CLUB_WALLETS;
      if (!allowed.includes(wallet)) {
        return res.status(400).json({
          success: false,
          error: `Source wallet must be one of: ${allowed.join(', ')}`,
        });
      }

      const { data, error } = await supabaseAdmin.rpc('fn_spin_activate', {
        p_club_id: clubId,
        p_seed_amount: seed,
        p_offered_max_stake: maxStake,
        p_source_wallet: wallet,
        p_actor: auth.user.id,
      });
      if (error) throw error;

      // The function reports its own refusals in the payload rather than
      // throwing, so a refusal must not be reported to the owner as success.
      if (!data?.ok) {
        return res.status(400).json({ success: false, error: data?.reason || 'Activation refused', detail: data });
      }
      return res.status(200).json({ success: true, result: data });
    }

    if (action === 'deactivate') {
      const { data, error } = await supabaseAdmin.rpc('fn_spin_deactivate', {
        p_club_id: clubId,
        p_actor: auth.user.id,
      });
      if (error) throw error;
      if (!data?.ok) {
        return res.status(400).json({ success: false, error: data?.reason || 'Deactivation refused' });
      }
      return res.status(200).json({ success: true, result: data });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    // Reporting must never be able to replace the error it is reporting: the
    // estate's other routes wrap this for exactly that reason.
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
}
