/**
 * FLEET POLICY, as the console edits it: the diff and the materiality preview.
 *
 * The panel holds a DRAFT and the route takes a PATCH. Turning one into the
 * other is the whole of this file, plus the sentence that has to appear before
 * an operator presses Save: whether this change will be applied now or raised
 * as an approval for a second operator.
 *
 * THE RULE IS NOT WRITTEN TWICE. `fleetPolicyMateriality` lives in
 * src/lib/horses/fleetPolicy.js, mirrors fn_ca_fleet_set_policy line for line,
 * and is imported here rather than re-derived. Three copies of "what counts as
 * material" would be three chances to disagree, and the one that matters is
 * the database's.
 *
 * WHY A DIFF AT ALL. `fn_ca_fleet_set_policy` is a genuine patch: a key it is
 * not given is left alone, and a key given as null CLEARS the override and
 * hands the field back to the wider scope. Sending every field on every save
 * would mean two operators editing one club silently overwrite each other, and
 * a save composed over a failed read would write a blank form onto a live row.
 * That is the Phase 2 policy-panel bug (StaffPanel setPolicyBody) and it is not
 * being shipped a second time.
 *
 * Pure module: imports one pure lib module, safe to unit test under
 * `node --test`.
 */
import {
  FLEET_CAP_FIELDS,
  FLEET_POLICY_FIELDS,
  fleetPolicyMateriality,
  validateFleetPolicyPatch,
// Explicit extension, for the reason tabRegistry.js and urlState.js give: this
// module is unit tested by a plain `node --test` with no bundler and no
// node_modules, and Node's ESM resolver does not guess extensions. Webpack
// resolves it either way.
} from '../../lib/horses/fleetPolicy.js';
// The alone-rule test is the Mint's, not a second copy of it: approvalModel.js
// already reads the `aloneRule` envelope the route sends, and a fleet dialog
// that answered that question differently from the Mint's would be a second
// rule nobody wrote down.
import { aloneRuleIsInForce } from './approvalModel.js';

export { FLEET_POLICY_FIELDS, FLEET_CAP_FIELDS, fleetPolicyMateriality, validateFleetPolicyPatch };

/** A policy field as a human reads it. */
export const FLEET_POLICY_LABELS = Object.freeze({
  enabled: 'Fleet Enabled',
  pause_new_seatings: 'Pause New Seatings',
  max_horses: 'Maximum Horses',
  max_per_table: 'Maximum Per Table',
  occupancy_bias: 'Occupancy Bias',
  min_humans_to_seat: 'Minimum Humans To Seat',
  stake_bands: 'Stake Bands',
  variants: 'Variants',
  schedule: 'Schedule',
  notes: 'Note',
});

export function fleetPolicyLabel(field) {
  return FLEET_POLICY_LABELS[String(field || '')] || String(field || '');
}

/**
 * Each materiality reason, in the words an operator needs.
 *
 * EVERY REASON `fleetPolicyMateriality` CAN RAISE HAS A LINE HERE. A reason
 * with no sentence renders as its own snake_case code in the confirm dialog,
 * which is the one screen where an operator is being asked to agree to
 * something. The eight added with review H-1 and M-7 are the fields that can
 * stop the whole fleet taking a seat, so they are the ones most worth reading
 * in English.
 */
export const MATERIAL_REASON_TEXT = Object.freeze({
  enabled_changed: 'The Fleet Is Being Enabled Or Disabled For This Scope',
  pause_changed: 'New Seatings Are Being Paused Or Resumed For This Scope',
  max_horses_set_or_cleared: 'The Maximum Horses Cap Is Being Set Or Removed',
  max_horses_changed_from_zero: 'The Maximum Horses Cap Is Moving Away From Zero',
  max_horses_cut_to_a_floor:
    'The Maximum Horses Cap Is Being Cut To Five Or Fewer, Which Is A Stand-Down However Small The Step Was',
  max_horses_moved_more_than_25_percent: 'The Maximum Horses Cap Is Moving By More Than 25 Percent',
  max_per_table_set_or_cleared: 'The Maximum Per Table Cap Is Being Set Or Removed',
  max_per_table_changed_from_zero: 'The Maximum Per Table Cap Is Moving Away From Zero',
  max_per_table_cut_to_a_floor:
    'The Maximum Per Table Cap Is Being Cut To Five Or Fewer, Which Is A Stand-Down However Small The Step Was',
  max_per_table_moved_more_than_25_percent:
    'The Maximum Per Table Cap Is Moving By More Than 25 Percent',
  occupancy_bias_cut_below_half:
    'The Occupancy Bias Is Being Cut To Half Or Less, Which Scales Every Table Seat Target In This Scope Down With It',
  occupancy_bias_moved_more_than_25_percent:
    'The Occupancy Bias Is Moving By More Than 25 Percent, So Every Table Seat Target In This Scope Moves With It',
  min_humans_to_seat_raised:
    'The Minimum Humans To Seat Is Going Up, So Tables That Qualified A Moment Ago Will Be Withheld',
  stake_bands_narrowed:
    'The Stake Band Restriction Is Appearing Or Getting Narrower, Which Withholds Seating On The Bands It Drops',
  variants_narrowed:
    'The Variant Restriction Is Appearing Or Getting Narrower, Which Withholds Seating On The Variants It Drops',
  schedule_narrowed:
    'The Schedule Restriction Is Appearing Or Getting Narrower, So Seating Happens In Fewer Hours Of The Day',
});

export function materialReasonText(reason) {
  return MATERIAL_REASON_TEXT[String(reason || '')] || String(reason || '');
}

/** Which row supplied a value in the effective policy, as a word. */
export const SOURCE_LABELS = Object.freeze({
  club: 'This Club',
  union: 'Its Union',
  global: 'The Global Row',
  default: 'The Built-In Default',
});

export function sourceLabel(source) {
  return SOURCE_LABELS[String(source || '')] || 'Not Known';
}

/**
 * The built-in defaults for the two booleans, which are today behaviour.
 *
 * The seeded global row carries these and `fn_ca_fleet_policy_effective`
 * coalesces to them when no row exists at all, so clearing a field on the
 * GLOBAL row lands here and nowhere else.
 */
export const FLEET_POLICY_BOOLEAN_DEFAULTS = Object.freeze({
  enabled: true,
  pause_new_seatings: false,
});

/**
 * WHAT "INHERITED" ACTUALLY RESOLVES TO, AND WHERE FROM (review H-2).
 *
 * Every steering column is nullable and null means inherit, so a club row
 * created through this console carries `enabled = null` - which the engine
 * reads as TRUE through the merge. Rendering that as an unticked box told the
 * operator the fleet was off for a club whose fleet was on. The editor now
 * offers Inherited as a real third option, and this is the sentence it wears.
 *
 * On the GLOBAL row there is nothing wider to inherit from, so Inherited means
 * the built-in default and the label says which one it is. On a club or union
 * row it means the merged answer the route already sends in `effective`, named
 * alongside the row that supplied it from `effective.source`.
 *
 * AN UNREAD MERGE SAYS SO. `effective` is the answer for ONE scope - the club
 * id in the box above the table, or the global answer when that is blank - so
 * the caller passes it only when it is the merge for the row being edited.
 * "Not Known Here" is an honest label; a guess in either direction is the
 * defect this replaces.
 *
 * @param {string} field The policy field, e.g. 'enabled'.
 * @param {{ scope?: string, effective?: object|null }} where The scope of the
 *   row being edited, and `policyBody.effective` when it is that row's merge.
 */
export function inheritedOptionLabel(field, { scope = 'global', effective = null } = {}) {
  const word = (value) => (value === true ? 'Yes' : value === false ? 'No' : 'Not Set');
  if (scope === 'global') {
    return `Inherited (${word(FLEET_POLICY_BOOLEAN_DEFAULTS[field])}, The Built-In Default)`;
  }
  const eff = effective && typeof effective === 'object' ? effective : null;
  if (!eff || !Object.prototype.hasOwnProperty.call(eff, field)) {
    return 'Inherited (Not Known Here: The Effective Policy For This Scope Has Not Been Read)';
  }
  const source = eff.source && typeof eff.source === 'object' ? eff.source[field] : null;
  return `Inherited (Currently ${word(eff[field])}, From ${sourceLabel(source)})`;
}

/**
 * THE SCHEDULE IS ON THE ROW AND IS NOT EDITED HERE (review L-3).
 *
 * `schedule` is a real policy field: the route accepts it, the RPC validates
 * it and the engine narrows seating by it. This form has no control for it, so
 * it says that outright rather than leaving an operator to conclude from an
 * absent box that the field does not exist. The form never sends it either -
 * the draft carries the row's own value and the diff drops an unchanged field,
 * so opening this editor cannot clear a schedule somebody set.
 */
export const SCHEDULE_NOT_EDITABLE_NOTE =
  'The Schedule Is Not Edited From This Form Yet. It Is A List Of UTC Hour Ranges On The Policy Row, Shown In The Table Behind This Dialog And Accepted By The Fleet Admin Route As The Field schedule. Saving Here Leaves Whatever Is Already On The Row Exactly As It Is.';

const has = (obj, key) =>
  !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

/** A value as the form holds it, turned into the value the patch carries. */
function normalise(field, value) {
  if (value === null || value === undefined || value === '') {
    // An empty box CLEARS the override. That is a real instruction on a club
    // row - "stop having an opinion about this, ask the wider scope" - and it
    // is why every steering column is nullable.
    return null;
  }
  if (field === 'enabled' || field === 'pause_new_seatings') return value === true;
  if (field === 'max_horses' || field === 'max_per_table' || field === 'min_humans_to_seat') {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : value;
  }
  if (field === 'occupancy_bias') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (field === 'stake_bands' || field === 'variants') {
    if (Array.isArray(value)) {
      const list = value.map((v) => String(v).trim()).filter(Boolean);
      return list.length ? list : null;
    }
    const list = String(value)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return list.length ? list : null;
  }
  if (field === 'schedule') return Array.isArray(value) ? value : null;
  if (field === 'notes') {
    const s = String(value).trim();
    return s ? s : null;
  }
  return value;
}

/** Are these two policy values the same? Arrays compare by content. */
export function sameValue(a, b) {
  const left = a === undefined ? null : a;
  const right = b === undefined ? null : b;
  if (left === null && right === null) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((v, i) => sameValue(v, right[i]));
  }
  if (typeof left === 'object' && typeof right === 'object' && left && right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  if (typeof left === 'number' || typeof right === 'number') {
    const l = Number(left);
    const r = Number(right);
    if (Number.isFinite(l) && Number.isFinite(r)) return l === r;
  }
  return left === right;
}

/**
 * The DIFF: only what this operator actually changed.
 *
 * @param {object} draft The form, keyed by policy field.
 * @param {object|null} saved The row as it stands, or null when this scope has
 *   no row yet. With no row every named field is a change, which is correct:
 *   creating a club row IS writing every value it carries.
 * @returns {{ patch: object, fields: string[], changes: Array }}
 */
export function fleetPolicyDiff(draft, saved) {
  const before = saved && typeof saved === 'object' ? saved : null;
  const patch = {};
  const changes = [];
  for (const field of FLEET_POLICY_FIELDS) {
    if (!has(draft, field)) continue;
    const next = normalise(field, draft[field]);
    const current = before ? normalise(field, before[field]) : null;
    if (before && sameValue(next, current)) continue;
    if (!before && next === null) continue; // creating a row of all nulls says nothing
    patch[field] = next;
    changes.push({ field, label: fleetPolicyLabel(field), from: before ? current : null, to: next });
  }
  return { patch, fields: Object.keys(patch), changes };
}

/**
 * WHAT WILL HAPPEN WHEN THIS IS SAVED.
 *
 * The sentence the confirm dialog has to show before an operator presses the
 * button, composed from three facts: is there anything to send, is it
 * material, and are approvals on.
 *
 * With the policy unread (`policy` null) the console says it does not know
 * rather than guessing Off - an unknown is not an off, and guessing wrong in
 * that direction tells an operator their change will apply instantly when it
 * will in fact sit in a queue.
 *
 * THE ANSWER IS THREE-WAY, NOT TWO-WAY (review L-11), and it is the Mint's
 * three: applied now, sent for approval, or applied now under the alone rule
 * and recorded as self approved. `approvalModel.thresholdDecision` learnt this
 * the same way - a dialog that says "Nothing Moves Until A Second Operator
 * Approves It" over a change that is about to be applied immediately is not a
 * copy defect, it is a control lying about what pressing the button does.
 * `requireApproval` returns `required: false` under the alone rule and the
 * route applies the change there and then.
 *
 * AND THE APPROVALS ANSWER IS THIS PAGE'S, NOT THE ROUTE'S. `approvals_enabled`
 * was read when the console loaded and the server dropped its client-side
 * ceiling (`approvals.js`: `required = dbRequired || (decision.required &&
 * !released)`), so a change previewed here as "applied now" can still come back
 * as a 202 if approvals were turned on from Staff And Roles in between. The
 * copy says so rather than promising an outcome this page cannot guarantee.
 *
 * @param {object|null} aloneRule The route's `aloneRule` envelope
 *   ({ permission, eligibleApprovers, applies }) when the caller has one. With
 *   none, the sentence names the alone rule as the third possibility rather
 *   than ruling it out, because an unread rule is not an absent one.
 * @returns {{ empty, material, reasons, willRequest, known, headline, detail }}
 */
export function setPolicyPreview({
  draft,
  saved,
  policy = null,
  scope = 'global',
  aloneRule = null,
} = {}) {
  const { patch, fields, changes } = fleetPolicyDiff(draft, saved);
  const empty = fields.length === 0;
  const { material, reasons } = fleetPolicyMateriality(saved, patch);
  const known = !!policy && typeof policy === 'object';
  const approvalsOn = known && policy.approvals_enabled === true;
  const aloneKnown = !!aloneRule && typeof aloneRule === 'object';
  const aloneRuleApplies = material && approvalsOn && aloneRuleIsInForce(aloneRule);
  // `willRequest` keeps the meaning every caller renders it with: TRUE only
  // when the change stops and waits for somebody else. Under the alone rule it
  // does not stop.
  const willRequest = material && approvalsOn && !aloneRuleApplies;
  const where = scope === 'global' ? 'The Whole Platform' : 'This Scope';

  let headline;
  let detail;
  if (empty) {
    headline = 'Nothing Has Been Changed Yet';
    detail = 'Change A Value Before Saving. An Empty Change Is Not Sent.';
  } else if (!material) {
    headline = 'This Change Will Be Applied Now';
    detail =
      'It Is Below The Material Line, So It Writes Directly And Is Recorded In The Audit Log With Your Account Against It.';
  } else if (!known) {
    headline = 'This Is A Material Change, And The Approval Policy Could Not Be Read';
    detail =
      'This Console Cannot Say Whether It Will Be Applied Now Or Sent For Approval. The Route Decides Either Way, And Its Answer Will Say Which Happened.';
  } else if (aloneRuleApplies) {
    headline = 'This Is A Material Change, And You Are The Only Eligible Approver';
    detail = `Maker-Checker Is On, But The Alone Rule Applies, So This Is Applied To ${where} When You Confirm And The Audit Row Records That You Approved Your Own Request.`;
  } else if (willRequest) {
    headline = 'This Is A Material Change, So It Will Be Sent For Approval';
    detail = `Nothing Changes For ${where} Until A Second Operator Approves It. You Will Get An Approval ID And The Request Will Appear On The Approvals Tab.`;
    if (!aloneKnown) {
      detail +=
        ' The One Exception Is The Alone Rule: If You Are The Only Eligible Approver, It Is Applied Now Instead And Recorded As Self Approved.';
    }
  } else {
    headline = 'This Is A Material Change, And It Will Be Applied Now';
    detail =
      'Maker-Checker Is Off, So It Writes Immediately And Records An Auto Approved Request So The Trail Stays Complete. Turn Approvals On From Staff And Roles To Hold Changes Like This For A Second Operator. If Approvals Were Turned On Since This Page Loaded, The Route Will Send This For Approval Instead And Its Answer Will Say So.';
  }

  return {
    patch,
    fields,
    changes,
    empty,
    material,
    reasons,
    reasonTexts: reasons.map(materialReasonText),
    approvalsKnown: known,
    approvalsOn,
    aloneRuleKnown: aloneKnown,
    aloneRuleApplies,
    willRequest,
    headline,
    detail,
  };
}

/**
 * THE SAFETY SENTENCE, and it is not decoration.
 *
 * Every dialog that pauses or disables the fleet says this, because the one
 * thing an operator must not believe about that button is that it clears the
 * tables. PHASE3-CONTRACTS section 0: the kill switch stops NEW seatings, it
 * never removes a seated horse and it never cancels a hand in progress.
 */
export const KILL_SWITCH_NOTE =
  'This Stops New Seatings Only. No Seated Horse Is Removed, No Hand In Progress Is Cancelled, And No Chips Move. The Fleet Drains Through Bust-Outs, The Session Rotator And The Human-Waiting Release, Exactly As It Does Today.';
