/**
 * FLEET POLICY - the fields, the validation and the materiality rule.
 *
 * One copy of three things that three different layers all have to agree
 * about, because when they disagree the failure is silent:
 *
 *   1. WHICH FIELDS EXIST. `fn_ca_fleet_set_policy` refuses an unknown key
 *      with `unknown_field`. A console that offers a key the RPC does not
 *      carry renders a change that was never applied.
 *   2. WHAT EACH FIELD ACCEPTS. Mirrored from the RPC's validation block so
 *      an operator gets a sentence before the round trip rather than a
 *      snake_case reason code after it. The database still has the last word.
 *   3. WHAT COUNTS AS MATERIAL. PHASE3-CONTRACTS.md section 0: enabling or
 *      disabling the fleet, pausing new seatings, and setting, clearing or
 *      moving a cap by more than 25 percent. The RPC computes the same
 *      verdict from the rows themselves and returns it as `material` and
 *      `material_reasons`.
 *
 * WHY THE ROUTE NEEDS ITS OWN COPY OF (3), given the RPC reports it.
 *
 * The RPC reports materiality AFTER it has written the row. A gate that only
 * learns a change was material once the change has happened is not a gate.
 * So the route computes the SAME verdict from the row it reads beforehand,
 * gates on that, and then compares its preview against what the RPC returned
 * and records any disagreement in the audit row. The two are supposed to be
 * identical; the audit trail is where we would find out that they are not.
 *
 * Pure module: imports only ./validate.js, safe to unit test under
 * `node --test` and safe to bundle into the browser panel.
 */

/** ca_horse_fleet_policy.scope. */
export const FLEET_POLICY_SCOPES = Object.freeze(['global', 'club', 'union']);

/** `c_fields` in fn_ca_fleet_set_policy, in the same order. */
export const FLEET_POLICY_FIELDS = Object.freeze([
  'enabled',
  'pause_new_seatings',
  'max_horses',
  'max_per_table',
  'occupancy_bias',
  'min_humans_to_seat',
  'stake_bands',
  'variants',
  'schedule',
  'notes',
]);

/** The two quota columns. A cap is a count of seats, never a rate. */
export const FLEET_CAP_FIELDS = Object.freeze(['max_horses', 'max_per_table']);

/** Contract section 0: "changing a per-club quota by more than 25 percent". */
export const MATERIAL_CAP_MOVE = 0.25;

/**
 * An ABSOLUTE floor under the percentage rule (review M-7).
 *
 * The percentage compares each patch against the row as it stands, so a
 * series of sub-25-percent cuts is a series of non-material changes: 100 to 75
 * to 57 to 43 ... to 3, fourteen saves, each one told by the console that it
 * is below the material line, and the approvals queue never sees any of it.
 * A cap this low is a stand-down whatever the step size that reached it, so it
 * is material on its own.
 *
 * The complete fix also measures a WALK - the greatest cap this scope carried
 * inside the approval TTL, read back out of admin_audit_log's before_state
 * inside fn_ca_fleet_set_policy - so a run of steps is scored as one move.
 * That half is deliberately NOT in this phase: it needs a lookback the route
 * cannot compute from the row in front of it, and the floor already closes the
 * proved scenario. It is written down here so the next reader knows the rule
 * is a floor and not a window.
 */
export const MATERIAL_CAP_FLOOR = 5;

/**
 * A bias at or below this, and lower than it was, is material (review H-1).
 *
 * occupancy_bias scales the seat target of EVERY table in its scope. Half is
 * the point at which "fewer horses" becomes "the room emptied out", and it is
 * the same class of change as disabling the fleet for that scope, which the
 * contract already calls material.
 */
export const BIAS_MATERIAL_BELOW = 0.5;

/** The RPC's bounds, mirrored. Ten seats is the widest table on the platform. */
export const MIN_HUMANS_MAX = 10;
export const BIAS_MAX = 10;
export const HOUR_MAX = 23;

const has = (obj, key) =>
  !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

export function isFleetPolicyField(key) {
  return typeof key === 'string' && FLEET_POLICY_FIELDS.includes(key);
}

export function isFleetPolicyScope(scope) {
  return typeof scope === 'string' && FLEET_POLICY_SCOPES.includes(scope);
}

/** null and undefined are both "no opinion"; anything else is a real number. */
function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * `coalesce((patch ->> field)::boolean, fallback)`.
 *
 * A json null CLEARS an override and hands the field back to the wider scope,
 * and the RPC's materiality test coalesces that null to the hardcoded default
 * before comparing - so clearing `enabled` on a club row that had it false is
 * a change back to true, and it is material.
 */
function boolOr(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return value === true;
}

/**
 * IS THIS CHANGE MATERIAL?
 *
 * A line-for-line mirror of the materiality block in fn_ca_fleet_set_policy,
 * including the order the reasons are appended in, so the console's preview
 * and the database's verdict are the same sentence.
 *
 * WHY TEN FIELDS AND NOT FOUR (review H-1). The rule shipped covering
 * `enabled`, `pause_new_seatings` and the two caps. Five of the remaining
 * steering fields can stop the whole fleet taking a seat anywhere on the
 * platform, and every one of them was below the line: a global
 * `occupancy_bias` of 0.1 scales every table's target to a tenth; a
 * `min_humans_to_seat` of 10 can never be satisfied because ten seats is the
 * widest table; a `stake_bands`, `variants` or `schedule` restriction narrows
 * eligibility to nothing, or to one hour a day. The sentence the file already
 * used about `pause_new_seatings` - "disabling the fleet for that scope by
 * another name, so it is held to the same standard" - is true of all five, so
 * they are held to it too.
 *
 * A RESTRICTION IS MEASURED AGAINST NO RESTRICTION. null and absent both mean
 * "this scope withholds nothing", so ADDING a list where there was none is a
 * narrowing however long the list is, and shortening an existing list is a
 * narrowing as well. Widening or clearing a restriction gives the fleet back
 * seats it could not take, which is not the direction this gate exists for.
 *
 * @param {object|null} before The ca_horse_fleet_policy row as it stands, or
 *   null when this patch creates it. A creation compares against the
 *   hardcoded defaults, which is what the RPC does with an all-null rowtype.
 * @param {object} patch The fields being written. A key that is present with
 *   a null value is a CLEAR, which is a change; a key that is absent is not
 *   touched at all.
 * @returns {{ material: boolean, reasons: string[] }}
 */
export function fleetPolicyMateriality(before, patch) {
  const reasons = [];
  const row = before && typeof before === 'object' ? before : {};
  const p = patch && typeof patch === 'object' ? patch : {};

  if (has(p, 'enabled') && boolOr(p.enabled, true) !== boolOr(row.enabled, true)) {
    reasons.push('enabled_changed');
  }
  // Pausing new seatings is disabling the fleet for that scope by another
  // name, so it is held to the same standard.
  if (
    has(p, 'pause_new_seatings') &&
    boolOr(p.pause_new_seatings, false) !== boolOr(row.pause_new_seatings, false)
  ) {
    reasons.push('pause_changed');
  }

  for (const key of FLEET_CAP_FIELDS) {
    if (!has(p, key)) continue;
    const oldCap = numberOrNull(row[key]);
    const newCap = numberOrNull(p[key]);
    if ((oldCap === null) !== (newCap === null)) {
      // Setting or clearing a cap that did not exist is a change from
      // unlimited, which has no percentage. It is material.
      reasons.push(`${key}_set_or_cleared`);
    } else if (oldCap !== null && newCap !== null) {
      if (oldCap === 0) {
        if (newCap !== 0) reasons.push(`${key}_changed_from_zero`);
      } else if (newCap <= MATERIAL_CAP_FLOOR && newCap < oldCap) {
        // A cap this low is a stand-down whatever the step size that reached
        // it, so the percentage rule does not get to call it small.
        reasons.push(`${key}_cut_to_a_floor`);
      } else if (Math.abs(newCap - oldCap) / oldCap > MATERIAL_CAP_MOVE) {
        reasons.push(`${key}_moved_more_than_25_percent`);
      }
    }
  }

  // The occupancy bias scales every table's target in this scope. Cutting it
  // to half or less is the room emptying out; moving it by more than a quarter
  // in either direction is the same size of move a cap is measured by.
  if (has(p, 'occupancy_bias')) {
    const oldBias = numberOrNull(row.occupancy_bias) ?? 1.0;
    const newBias = numberOrNull(p.occupancy_bias) ?? 1.0;
    if (newBias <= BIAS_MATERIAL_BELOW && newBias < oldBias) {
      reasons.push('occupancy_bias_cut_below_half');
    } else if (oldBias > 0 && Math.abs(newBias - oldBias) / oldBias > MATERIAL_CAP_MOVE) {
      reasons.push('occupancy_bias_moved_more_than_25_percent');
    }
  }

  // Raising the human minimum withholds seating from tables that qualified a
  // moment ago. Lowering it gives seats back, which needs no second operator.
  if (
    has(p, 'min_humans_to_seat') &&
    (numberOrNull(p.min_humans_to_seat) ?? 0) > (numberOrNull(row.min_humans_to_seat) ?? 0)
  ) {
    reasons.push('min_humans_to_seat_raised');
  }

  for (const key of ['stake_bands', 'variants', 'schedule']) {
    if (!has(p, key)) continue;
    const beforeList = Array.isArray(row[key]) ? row[key] : null;
    const afterList = Array.isArray(p[key]) ? p[key] : null;
    // A restriction that did not exist, or one that got narrower, withholds
    // seating. null on either side is "no restriction", never an empty one.
    if (afterList !== null && (beforeList === null || afterList.length < beforeList.length)) {
      reasons.push(`${key}_narrowed`);
    }
  }

  return { material: reasons.length > 0, reasons };
}

/** A refusal in the shape the route turns into a 400. */
const bad = (error, message, extra = {}) => ({ ok: false, error, message, ...extra });

/**
 * Validate a patch before the round trip.
 *
 * Every rule here is enforced again inside the RPC. This layer exists so an
 * operator reads "A Cap Is A Count Of Seats And Cannot Be Negative" instead of
 * `negative_cap`, not to be the only thing standing between a typo and the
 * fleet.
 *
 * @returns {{ ok: true, patch: object, fields: string[] }} or
 *   {{ ok: false, error: string, message: string, field?: string }}
 */
export function validateFleetPolicyPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return bad('invalid_patch', 'The Policy Change Must Be A Set Of Fields');
  }
  const fields = Object.keys(patch);
  if (fields.length === 0) {
    return bad('empty_patch', 'Nothing Was Changed, So Nothing Was Sent');
  }

  for (const key of fields) {
    if (!isFleetPolicyField(key)) {
      return bad('unknown_field', `The Fleet Policy Carries No Field Called ${key}`, { field: key });
    }
  }

  for (const key of ['enabled', 'pause_new_seatings']) {
    if (!has(patch, key)) continue;
    const value = patch[key];
    if (value !== null && typeof value !== 'boolean') {
      return bad('invalid_type', `${key === 'enabled' ? 'Enabled' : 'Pause New Seatings'} Must Be Yes Or No`, { field: key });
    }
  }

  for (const key of ['max_horses', 'max_per_table', 'min_humans_to_seat']) {
    if (!has(patch, key)) continue;
    const value = patch[key];
    if (value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return bad('invalid_type', 'A Cap Is A Whole Number Of Seats', { field: key });
    }
    if (!Number.isInteger(value)) {
      return bad('not_an_integer', 'A Cap Is A Whole Number Of Seats', { field: key });
    }
    if (value < 0) {
      return bad('negative_cap', 'A Cap Is A Count Of Seats And Cannot Be Negative', { field: key });
    }
    if (key === 'min_humans_to_seat' && value > MIN_HUMANS_MAX) {
      return bad(
        'min_humans_out_of_range',
        'No Table Seats More Than Ten Players, So That Rule Could Never Be Met',
        { field: key }
      );
    }
  }

  if (has(patch, 'occupancy_bias') && patch.occupancy_bias !== null) {
    const value = patch.occupancy_bias;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return bad('invalid_type', 'The Occupancy Bias Must Be A Number', { field: 'occupancy_bias' });
    }
    // Zero or negative is an eviction dressed as arithmetic: it would take
    // every table target to zero.
    if (value <= 0 || value > BIAS_MAX) {
      return bad(
        'bias_out_of_range',
        'The Occupancy Bias Must Be Greater Than 0 And At Most 10',
        { field: 'occupancy_bias' }
      );
    }
  }

  for (const key of ['stake_bands', 'variants']) {
    if (!has(patch, key)) continue;
    const value = patch[key];
    if (value === null) continue;
    if (!Array.isArray(value)) {
      return bad('invalid_type', 'That Restriction Must Be A List Of Names', { field: key });
    }
    for (const entry of value) {
      if (typeof entry !== 'string' || !entry.trim()) {
        return bad('invalid_array', 'Every Entry In That List Must Be A Name', { field: key });
      }
    }
  }

  if (has(patch, 'schedule') && patch.schedule !== null) {
    const value = patch.schedule;
    if (!Array.isArray(value)) {
      return bad('invalid_type', 'The Schedule Must Be A List Of Hour Ranges', { field: 'schedule' });
    }
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return bad('invalid_schedule', 'Each Schedule Entry Needs A Start Hour And An End Hour', {
          field: 'schedule',
        });
      }
      const start = entry.start_hour;
      const end = entry.end_hour;
      if (typeof start !== 'number' || typeof end !== 'number') {
        return bad('invalid_schedule', 'Each Schedule Entry Needs A Start Hour And An End Hour', {
          field: 'schedule',
        });
      }
      if (start < 0 || start > HOUR_MAX || end < 0 || end > HOUR_MAX) {
        return bad(
          'invalid_schedule',
          'Hours Are UTC And Run 0 To 23. A Start After An End Wraps Midnight',
          { field: 'schedule' }
        );
      }
    }
  }

  if (has(patch, 'notes') && patch.notes !== null && typeof patch.notes !== 'string') {
    return bad('invalid_type', 'The Note Must Be Text', { field: 'notes' });
  }

  return { ok: true, patch, fields };
}

/**
 * The RPC's refusal codes in plain English, for the ones the console cannot
 * pre-empt. An unrecognised code still reaches the operator as itself, because
 * an unrecognised refusal is information.
 */
export const FLEET_POLICY_REFUSAL_TEXT = Object.freeze({
  unknown_scope: 'The Policy Scope Must Be Global, Club Or Union',
  scope_id_not_allowed: 'The Global Policy Row Has No Club Or Union Attached To It',
  scope_id_required: 'A Club Or Union Policy Row Needs A Club Or Union',
  invalid_patch: 'The Policy Change Must Be A Set Of Fields',
  actor_required: 'A Policy Change Has To Be Recorded Against An Operator',
  unknown_field: 'The Fleet Policy Carries No Field By That Name',
  invalid_type: 'One Of Those Values Is The Wrong Kind Of Thing',
  not_an_integer: 'A Cap Is A Whole Number Of Seats',
  negative_cap: 'A Cap Is A Count Of Seats And Cannot Be Negative',
  min_humans_out_of_range: 'No Table Seats More Than Ten Players, So That Rule Could Never Be Met',
  bias_out_of_range: 'The Occupancy Bias Must Be Greater Than 0 And At Most 10',
  invalid_array: 'Every Entry In That List Must Be A Name',
  invalid_schedule: 'Hours Are UTC And Run 0 To 23. A Start After An End Wraps Midnight',
});
