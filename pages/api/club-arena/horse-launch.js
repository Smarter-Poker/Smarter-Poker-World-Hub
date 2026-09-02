/**
 * POST /api/club-arena/horse-launch
 *
 * FLEET SEEDING IS NOT DONE HERE ANY MORE.
 *
 * Since PR #2704 the horse fleet is owned by the engine's HorseFleetManager
 * (club-arena repo, server/src/services/HorseFleetManager.ts). It runs beside
 * the tables it seeds, it knows which tables already exist, and it funds and
 * seats horses through the same paths a human player uses. That is the only
 * correct home for this work, and it is not a serverless function.
 *
 * WHAT THE OLD LAUNCHER DID, which is why `launch_all` and `shutdown` now
 * answer 410 Gone instead of running:
 *
 *   - It ran its cash-table creator THREE TIMES per press, each pass inserting
 *     all 39 configs, so every single press created 117 new `tables` rows with
 *     no dedupe and no cleanup of the previous press. That is the mechanism
 *     behind the roughly 89,000 rows in `tables`.
 *   - It funded horses with the mass funding RPC at 500,000 chips each,
 *     crediting individual horse wallets OUTSIDE fn_ca_mint and outside
 *     ca_mint_ledger. The Ledger tab exists to detect exactly that drift, and
 *     the console's own button was generating it.
 *   - It performed 700 to 1,500 sequential round trips: 117 table inserts, one
 *     tournament registration insert per horse per event, and a seat lookup
 *     plus an atomic buy-in RPC per horse per table. That cannot finish inside
 *     a serverless invocation, and a timeout left the database half-populated
 *     with no rollback.
 *   - It capped the roster at 350 horses while the fleet is over 1,000, and
 *     said nothing about the ones it skipped.
 *
 * `status` still works. It is a read-only fleet snapshot and the console's
 * Grinder tab reads it.
 *
 * PHASE 3 replaces this file with the Fleet Command Center API. Until then this
 * route is deliberately small: a snapshot, and an honest 410 for the two
 * retired buttons. An operator whose browser still has the old page cached will
 * press one of them, so the refusal is audited (fleet.launch_refused) and leaves
 * a trail rather than vanishing.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { enumOf } from '../../../src/lib/horses/validate.js';

const UNION_ID = 'fade0000-0000-0000-0000-000000000001';

const ACTIONS = ['status', 'launch_all', 'shutdown'];
const RETIRED_ACTIONS = ['launch_all', 'shutdown'];

const RETIRED_MESSAGE =
  'Fleet Seeding Is Owned By The Engine (HorseFleetManager); This Button Was Retired In Phase 1';

export const spec = {
  name: 'club-arena.horse-launch',
  methods: ['POST'],
  // `status` is the only action that still does anything, and it is a read.
  // The retired actions are gated a second time inside the handler against
  // fleet.write, so an operator without it gets 403 rather than the 410.
  permission: PERMISSIONS.FLEET_READ,
  limit: 'read',
};

/** A read-only snapshot of the fleet. No writes, no seeding, no funding. */
async function fleetStatus(db) {
  const [totalHorses, seatedHorses, activeTables, regTournaments] = await Promise.all([
    db
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_horse', true)
      .in('horse_status', ['active', 'seated']),
    db
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_horse', true)
      .eq('horse_status', 'seated'),
    db
      .from('tables')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('current_players', 0),
    db
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['REGISTERING', 'RUNNING', 'ANNOUNCED']),
  ]);

  const failedSources = [];
  const readCount = (result, name) => {
    if (result.error) {
      console.warn('[horse-launch status]', name, 'read failed:', result.error.message || result.error);
      failedSources.push(name);
      return null;
    }
    return result.count ?? 0;
  };

  return {
    totalHorses: readCount(totalHorses, 'horses'),
    seatedHorses: readCount(seatedHorses, 'seated_horses'),
    activeTables: readCount(activeTables, 'tables'),
    activeTournaments: readCount(regTournaments, 'tournaments'),
    seedingOwner: 'engine.HorseFleetManager',
    failedSources,
  };
}

export async function handle({ req, op, db, body }) {
  const action = enumOf(body.action, ACTIONS);
  if (!action) throw badRequest('Action Must Be Status, Launch All Or Shutdown', 'invalid_action');

  if (action === 'status') {
    return { action: 'status', ...(await fleetStatus(db)) };
  }

  // A retired button is still a write button. Gate it on fleet.write so the
  // refusal is a permission decision for anyone who should not be pressing it,
  // and a 410 only for the operators who legitimately could have.
  if (!hasPermission(op.permissions, PERMISSIONS.FLEET_WRITE)) {
    throw new ApiError(403, 'Permission Required: ' + PERMISSIONS.FLEET_WRITE, 'permission_denied');
  }

  // Audited on purpose: an operator pressing an old cached button leaves a
  // trail, and a burst of these says a stale client is still deployed.
  await auditOperatorAction(op, req, {
    action: 'fleet.launch_refused',
    targetType: 'horse_fleet',
    targetId: UNION_ID,
    details: {
      requested_action: action,
      reason: 'retired_in_phase_1',
      seeding_owner: 'club-arena server/src/services/HorseFleetManager.ts',
    },
  });

  throw new ApiError(410, RETIRED_MESSAGE, 'retired');
}

export { RETIRED_ACTIONS, RETIRED_MESSAGE };

export default withOperatorRoute(spec, handle);
