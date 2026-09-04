/**
 * STAFF AND ROLES - who holds what, and the policy that governs money moves.
 *
 * The first tab in this console that is its own module (tabRegistry `load`),
 * and the first surface that can change what another operator is allowed to
 * do. Three things live here and the split matters:
 *
 *   1. THE OPERATOR TABLE. Display name, email, the profile role that has been
 *      the whole of access control until now, the named roles granted on top
 *      of it, last sign-in, MFA state and how many grants that account has
 *      ever had. Read-only, and readable by anyone who can open the console:
 *      seeing who has the keys is not itself a privileged act.
 *
 *   2. GRANT AND REVOKE, behind `admin.manage`, each behind a dialog with a
 *      required reason of at least ten characters. A revoked grant is kept,
 *      never deleted (PHASE2-CONTRACTS section 1), so "why" is the only part
 *      of the record a human has to supply and the only part a database
 *      cannot reconstruct later.
 *
 *   3. THE POLICY PANEL, also behind `admin.manage`, and typed-confirmed.
 *      Turning maker-checker on changes what happens when an operator presses
 *      a button on another tab, so the dialog says in plain words what will
 *      happen rather than naming the flag.
 *
 * THE SAFETY RULE (PHASE2-CONTRACTS section 0) runs through all of it. Named
 * roles are ADDITIVE while `enforce_named_roles` is false: a grant can only
 * widen. The panel says so where an operator can see it, because a grant
 * screen that does not explain that a revoke currently takes nothing away is
 * a screen that gets used in the belief that it does.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import DataTable from './DataTable';
import StatusPill from './StatusPill';
import styles from './shared.module.css';
import { num, when } from '../../lib/horsesAdminTokens';
import { ROLE_META } from '../../lib/horses/permissions';
import { normalizePolicy } from './approvalModel';
import { ADMIN_MANAGE, canManageOperators, permissionsFromPayload } from './operatorPermissions';
import {
  MIN_REASON_LENGTH, TTL_DEFAULT_MINUTES, TTL_MAX_MINUTES, TTL_MIN_MINUTES,
  approvalsStateLabel, describePolicyPatch, grantRoleBody, listMeta, permissionMatrix,
  policyDraftProblems, policyIsKnown, policyUrl, reasonIsValid, revokeRoleBody, rolesUrl,
  rowsOf, setPolicyBody, staffUrl, OPERATOR_ADMIN,
} from './operatorAdmin';

/** The one place the policy form's defaults are written down. These are the
 *  values a BLANK form starts from; they are never presented as the saved
 *  policy and they are never saved on their own behalf - see policyKnown
 *  below. `enforce_named_roles` is deliberately absent: this form does not
 *  render it and `setPolicyBody` does not send it, and a field in a default
 *  that nothing reads is a field somebody will one day believe is wired. */
const DEFAULT_POLICY = {
  approvals_enabled: false,
  allow_self_approve_when_alone: true,
  mint_threshold: 0,
  fund_threshold: 0,
  cashout_threshold: 0,
  approval_ttl_minutes: TTL_DEFAULT_MINUTES,
};

/** A role key as a human reads it. ROLE_META is the same table the matrix
 *  headers already use; the pills were printing the raw enum beside it. */
function roleLabel(key) {
  const meta = ROLE_META[String(key || '')];
  return meta ? meta.label : String(key || 'Unknown');
}

function mfaPill(value) {
  if (value === true) return <StatusPill status="active" label="MFA On" tone="good" />;
  if (value === false) return <StatusPill status="open" label="MFA Off" tone="warn" />;
  return <StatusPill status="idle" label="Unknown" tone="neutral" />;
}

/**
 * The account id, from whichever field the roster used.
 *
 * fn_ca_operator_staff returns `user_id`; a paged list of profiles would
 * return `id`. Getting this wrong makes every Grant Role dialog compose a
 * body with no user in it, which the route refuses - correctly, and
 * uselessly, because the operator cannot see why.
 */
function operatorIdOf(row) {
  if (!row) return '';
  return String(row.user_id || row.id || '');
}

/**
 * The granted roles as [{ key, grantId, grantedAt, reason }].
 *
 * fn_ca_operator_staff returns each active grant TWICE, on purpose:
 * `granted_roles` as bare role-key strings, and `grants` as objects carrying
 * the grant id. The id is what Revoke needs - fn_ca_operator_revoke takes a
 * grant id, and a revoked grant is kept rather than deleted, so the id IS the
 * record - so `grants` is read first and `granted_roles` is the fallback for
 * a roster served before that array existed.
 */
function grantedRoleList(row) {
  const objects = Array.isArray(row?.grants) ? row.grants
    : (Array.isArray(row?.roles) ? row.roles : []);
  const strings = Array.isArray(row?.granted_roles) ? row.granted_roles : [];
  const raw = objects.length ? objects : strings;
  const out = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry) out.push({ key: entry, grantId: '', grantedAt: null, reason: '' });
      continue;
    }
    const key = String(entry?.role_key || entry?.key || '');
    if (!key) continue;
    out.push({
      key,
      grantId: String(entry?.id || entry?.grant_id || ''),
      grantedAt: entry?.granted_at || null,
      reason: entry?.reason || '',
    });
  }
  return out;
}

/** Only the grants this console can actually revoke. */
function revocableGrants(row) {
  return grantedRoleList(row).filter((entry) => entry.grantId);
}

/** How many grants this account has ever had, revoked ones included. */
function grantCountOf(row) {
  const value = row?.grant_history_count ?? row?.grant_count;
  return (value === null || value === undefined) ? '-' : String(value);
}

export default function StaffPanel({
  authFetch,
  showNotification,
  permissions = null,
  policy = null,
  permissionsDegraded = false,
  onPolicyChange,
}) {
  const [staff, setStaff] = useState(null);
  const [staffMeta, setStaffMeta] = useState(null);
  const [rolesPayload, setRolesPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [grantFor, setGrantFor] = useState(null);   // the operator row
  const [grantRole, setGrantRole] = useState('');
  const [grantReason, setGrantReason] = useState('');

  const [revokeFor, setRevokeFor] = useState(null); // the operator row
  const [revokeGrantId, setRevokeGrantId] = useState('');
  const [revokeReason, setRevokeReason] = useState('');

  const [policyDraft, setPolicyDraft] = useState(DEFAULT_POLICY);
  const [policyConfirm, setPolicyConfirm] = useState(false);

  const mayManage = canManageOperators(permissions);

  /**
   * HAS A POLICY ACTUALLY BEEN READ?
   *
   * The parent sets `policy` to null in exactly one case - the bootstrap read
   * threw - and null is the whole of what this panel can see. So null is
   * treated as "not known", never as the shipped defaults: the form is
   * disabled, the state reads "Not Known", and Save refuses. It used to seed
   * the form from DEFAULT_POLICY and present it AS the current policy, and
   * because setPolicyBody sent every field on every save, one press of Save
   * over a failed read turned approvals off and zeroed all three thresholds
   * and the TTL. That is the control this whole phase exists to add, disabled
   * by a fetch that timed out.
   */
  const policyKnown = policyIsKnown(policy);

  // The draft follows the saved policy, and only the saved policy. Seeding it
  // from a fetch inside this component as well would give two writers to one
  // form and lose whatever the operator had typed when the parent refreshed.
  // normalizePolicy on the way IN, because a caller handing over the raw route
  // row (which carries camelCase too) would otherwise render approvals as Off.
  useEffect(() => {
    setPolicyDraft(policy
      ? { ...DEFAULT_POLICY, ...(normalizePolicy(policy) || {}) }
      : DEFAULT_POLICY);
  }, [policy]);

  /**
   * ONE SEQUENCE NUMBER, SO THE SLOWER ANSWER LOSES.
   *
   * Refresh twice and the first response could land after the second and
   * replace a newer roster with an older one; the same pair of setState calls
   * after an unmount is a React warning and a leak. `usePagedList` has had
   * this guard since Phase 1 and these three fetches did not.
   */
  const loadSeqRef = useRef(0);
  useEffect(() => () => { loadSeqRef.current += 1; }, []);

  const load = useCallback(async () => {
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [staffBody, rolesBody] = await Promise.all([
        authFetch(staffUrl()),
        authFetch(rolesUrl()),
      ]);
      if (seq !== loadSeqRef.current) return;
      const rows = rowsOf(staffBody, 'staff', 'operators');
      setStaff(rows);
      setStaffMeta(listMeta(staffBody, rows.length));
      setRolesPayload(rolesBody);
      setLoaded(true);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(err.message || 'Staff Could Not Be Read.');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  const matrix = useMemo(() => permissionMatrix(rolesPayload), [rolesPayload]);

  const roleOptions = useMemo(
    () => matrix.roles.filter((role) => !role.isLegacy),
    [matrix],
  );

  /**
   * THE WHOLE ANSWER GOES BACK UP, NOT JUST THE POLICY.
   *
   * `section=policy` answers `{ policy, defaults, operator, aloneRule }`, and
   * the alone rule is computed BY the policy: approvals on, self-approval
   * allowed, nobody else eligible. Forwarding only the policy left the
   * parent's `operatorAloneRule` at its sign-in value, so after Dan turned
   * approvals on here the Mint's confirm dialog said "This Will Be Sent For
   * Approval" over a button that requireApproval was about to execute on
   * the spot. The parent applies all three (index.js handlePolicyChange
   * reads this shape through operatorContextChange); a null aloneRule is
   * "the route did not say", and null permissions are left alone up there.
   */
  const refreshPolicy = useCallback(async () => {
    try {
      const body = await authFetch(policyUrl());
      if (typeof onPolicyChange === 'function') {
        onPolicyChange({
          policy: normalizePolicy(body && body.policy),
          aloneRule: (body && body.aloneRule) || null,
          permissions: permissionsFromPayload(body),
        });
      }
      return true;
    } catch {
      // A failed re-read is not a failed write. The write already reported.
      return false;
    }
  }, [authFetch, onPolicyChange]);

  /** The Retry beside the "could not be read" state. Separate from
   *  refreshPolicy only because this one is allowed to say it failed. */
  const retryPolicy = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await refreshPolicy();
      if (!ok) showNotification('The Approval Policy Still Could Not Be Read.', 'error');
    } finally {
      setBusy(false);
    }
  }, [refreshPolicy, showNotification]);

  const submitGrant = useCallback(async () => {
    const body = grantRoleBody({
      userId: operatorIdOf(grantFor),
      roleKey: grantRole,
      reason: grantReason,
    });
    if (!body) {
      showNotification(`Pick A Role And Write A Reason Of At Least ${MIN_REASON_LENGTH} Characters.`, 'error');
      return;
    }
    setBusy(true);
    try {
      await authFetch(OPERATOR_ADMIN, { method: 'POST', body: JSON.stringify(body) });
      showNotification(`Granted ${roleLabel(grantRole)} To ${grantFor.display_name || grantFor.email || 'That Operator'}.`, 'success');
      setGrantFor(null);
      setGrantRole('');
      setGrantReason('');
      await load();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [authFetch, grantFor, grantRole, grantReason, load, showNotification]);

  const submitRevoke = useCallback(async () => {
    const body = revokeRoleBody({ grantId: revokeGrantId, reason: revokeReason });
    if (!body) {
      showNotification(`Pick A Grant And Write A Reason Of At Least ${MIN_REASON_LENGTH} Characters.`, 'error');
      return;
    }
    setBusy(true);
    try {
      await authFetch(OPERATOR_ADMIN, { method: 'POST', body: JSON.stringify(body) });
      showNotification('Grant Revoked. The Record Of It Is Kept.', 'success');
      setRevokeFor(null);
      setRevokeGrantId('');
      setRevokeReason('');
      await load();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [authFetch, revokeGrantId, revokeReason, load, showNotification]);

  const submitPolicy = useCallback(async () => {
    // THE REFUSAL. Without a policy that has actually been read there is
    // nothing to diff against, so every field would be sent - and the values
    // would be this form's blank defaults, not the live row.
    if (!policyKnown) {
      showNotification(
        'The Approval Policy Has Not Been Read, So It Cannot Be Saved. Retry The Read First.',
        'error',
      );
      setPolicyConfirm(false);
      return;
    }
    const problems = policyDraftProblems(policyDraft);
    if (problems.length) {
      showNotification(problems[0], 'error');
      setPolicyConfirm(false);
      return;
    }
    const body = setPolicyBody(policyDraft, policy);
    if (!body) {
      showNotification('Nothing Changed, So Nothing Was Saved.', 'info');
      setPolicyConfirm(false);
      return;
    }
    setBusy(true);
    try {
      await authFetch(OPERATOR_ADMIN, { method: 'POST', body: JSON.stringify(body) });
      showNotification('Policy Saved.', 'success');
      setPolicyConfirm(false);
      await refreshPolicy();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [authFetch, policy, policyDraft, policyKnown, refreshPolicy, showNotification]);

  const staffColumns = useMemo(() => {
    const columns = [
      {
        key: 'display_name',
        header: 'Operator',
        render: (row) => (
          <>
            <div>{row.display_name || row.username || 'Unnamed'}</div>
            <div className={styles.mono}>{operatorIdOf(row)}</div>
          </>
        ),
      },
      { key: 'email', header: 'Email', render: (row) => row.email || '-' },
      {
        key: 'profile_role',
        header: 'Profile Role',
        render: (row) => (
          <StatusPill
            status="info"
            tone="info"
            label={row.profile_role || row.role
              ? roleLabel(row.profile_role || row.role)
              : 'None'}
          />
        ),
      },
      {
        key: 'roles',
        header: 'Granted Roles',
        render: (row) => {
          const list = grantedRoleList(row);
          if (list.length === 0) return <span className={styles.notHeld}>None</span>;
          return (
            <span className={styles.pillRow}>
              {list.map((entry) => (
                <StatusPill
                  key={entry.grantId || entry.key}
                  tone="neutral"
                  label={roleLabel(entry.key)}
                />
              ))}
            </span>
          );
        },
      },
      {
        key: 'last_sign_in_at',
        header: 'Last Sign In',
        render: (row) => when(row.last_sign_in_at, true),
      },
      { key: 'mfa', header: 'MFA', render: (row) => mfaPill(row.mfa_enabled) },
      {
        key: 'grant_count',
        header: 'Grants',
        align: 'right',
        render: (row) => grantCountOf(row),
      },
    ];

    if (mayManage) {
      columns.push({
        key: 'actions',
        header: 'Actions',
        render: (row) => {
          const revocable = revocableGrants(row);
          return (
            <span className={styles.rowActions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGo}`}
                onClick={() => { setGrantFor(row); setGrantRole(''); setGrantReason(''); }}
              >
                Grant Role
              </button>
              {/* NO DEAD BUTTON. `grants` carries the id every revoke needs,
                  so an account holding a named role gets a Revoke; an account
                  holding none gets no button, because there is nothing to
                  take back. */}
              {revocable.length > 0 ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() => {
                    setRevokeFor(row);
                    setRevokeGrantId(revocable[0].grantId);
                    setRevokeReason('');
                  }}
                >
                  Revoke
                </button>
              ) : null}
            </span>
          );
        },
      });
    }

    return columns;
  }, [mayManage]);

  const matrixColumns = useMemo(() => ([
    {
      key: 'permission',
      header: 'Permission',
      render: (row) => <code className={styles.mono}>{row.permission}</code>,
    },
    ...matrix.roles.map((role) => ({
      key: role.key,
      header: role.isLegacy ? `${role.label} (Legacy)` : role.label,
      align: 'center',
      render: (row) => (matrix.grid[role.key] && matrix.grid[role.key][row.permission]
        ? <span className={styles.held}>Held</span>
        : <span className={styles.notHeld}>Not Held</span>),
    })),
  ]), [matrix]);

  const matrixRows = useMemo(
    () => matrix.permissions.map((permission) => ({ id: permission, permission })),
    [matrix],
  );

  const revokeOptions = revokeFor ? revocableGrants(revokeFor) : [];

  /** Is there anything to send, and is it inside the route's bounds? Both
   *  asked through the same builder the save uses, so the button and the
   *  request can never disagree about what "changed" means. */
  const policyPatch = useMemo(
    () => (policyKnown ? setPolicyBody(policyDraft, policy) : null),
    [policyDraft, policy, policyKnown],
  );
  const policyDirty = !!policyPatch;
  /** Every reason the route would answer 400 to this draft, said here
   *  first. `type="number" min="0"` stops none of a typed -5, a typed 10.005
   *  or an emptied box, and the emptied box used to be SENT as 0. */
  const policyProblems = useMemo(() => policyDraftProblems(policyDraft), [policyDraft]);
  const policyValid = policyProblems.length === 0;
  /** What the save will actually change, for the confirm dialog. */
  const policyChanges = useMemo(
    () => describePolicyPatch(policyPatch, policy),
    [policyPatch, policy],
  );
  const switchingApprovals = !!(policyPatch && 'approvalsEnabled' in policyPatch);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Staff And Roles</h2>
          <p className={styles.panelIntro}>
            Every Account That Can Open This Console, The Role On Its Profile, And The
            Named Roles Granted On Top Of It. Named Roles Are Additive While Enforcement
            Is Off: A Grant Widens What An Operator Can Do And A Revoke Takes Nothing
            Away Until Dan Turns Enforcement On.
          </p>
        </div>
        <button type="button" className={styles.btn} onClick={load} disabled={loading}>
          {loading ? 'Loading' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className={styles.errorNote} role="alert">
          Staff Could Not Be Read: {error}
        </div>
      )}

      {/* The permission list this console is filtering the nav with may be
          the LEGACY fallback rather than the resolved one. The route says so
          and nothing was reading it, which left an operator looking at a nav
          that could be missing a granted role with no way to know. */}
      {permissionsDegraded && (
        <div className={styles.warnNote}>
          The Permission Resolver Did Not Answer, So This Session Is Using The Permissions
          The Profile Role Carries. A Role Granted On This Screen May Not Be Reflected In
          The Nav Until You Sign In Again.
        </div>
      )}

      <DataTable
        columns={staffColumns}
        rows={Array.isArray(staff) ? staff : []}
        caption="Operator Accounts"
        loading={loading && !loaded}
        loadingLabel="Loading Operators"
        empty="No Operator Accounts Were Returned."
        getRowKey={(row, i) => operatorIdOf(row) || i}
      />

      {/* PHASE1-CONTRACTS addendum item 10. The roster is capped server-side,
          and a capped list rendered without saying so reads as the whole
          roster - which on THIS table means "these are all the accounts that
          can open the console". */}
      {staffMeta && staffMeta.truncated && staffMeta.total !== null && (
        <div className={styles.warnNote}>
          Showing {num(Array.isArray(staff) ? staff.length : 0)} Of {num(staffMeta.total)}{' '}
          Operator Accounts. This Table Is Capped By The Route, So It Is A Page And Not
          The Whole Roster.
        </div>
      )}

      {/* ── THE PERMISSION MATRIX ─────────────────────────────────────────── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Permission Matrix</h3>
        <p className={styles.cardNote}>
          What Each Role Carries, Read From The Route Rather Than Written Down Here, So
          A Role Whose Permissions Change In The Database Cannot Read Differently On
          This Screen.
        </p>
        <DataTable
          columns={matrixColumns}
          rows={matrixRows}
          caption="Roles By Permission"
          loading={loading && !loaded}
          loadingLabel="Loading Roles"
          empty="No Roles Were Returned."
        />
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.held}>Held</span>
            <span>The Role Carries This Permission.</span>
          </span>
          <span className={styles.legendItem}>
            <span className={styles.notHeld}>Not Held</span>
            <span>It Does Not.</span>
          </span>
          <span className={styles.legendItem}>
            <span>(Legacy)</span>
            <span>
              The Legacy Roles Keep Every Permission, By Design, Until
              Enforcement Is Turned On.
            </span>
          </span>
        </div>
      </div>

      {/* ── THE POLICY PANEL ──────────────────────────────────────────────── */}
      {/* THREE STATES, NOT TWO. On, Off, and "the read failed so nobody
          knows" - and the third one is never printed as Off. Reporting an
          unknown as Off is reporting a money control as disabled when it may
          be enabled, which is the wrong way round to be wrong. */}
      {!mayManage ? (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Approval Policy</h3>
          <p className={styles.cardNote}>
            Maker-Checker Is Currently{' '}
            <strong>{approvalsStateLabel(policy)}</strong>.
            {policyKnown
              ? ` Changing It Needs ${ADMIN_MANAGE}, Which This Account Does Not Hold.`
              : ' The Policy Could Not Be Read, So This Console Cannot Say Whether It Is On Or Off.'}
          </p>
        </div>
      ) : !policyKnown ? (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Approval Policy</h3>
          <div className={styles.errorNote} role="alert">
            The Approval Policy Could Not Be Read. This Console Does Not Know Whether
            Maker-Checker Is On Or Off, And It Will Not Save A Policy It Has Not Read:
            Saving Blank Defaults Over The Live Row Would Turn Approvals Off And Zero
            Every Threshold.
          </div>
          <button
            type="button"
            className={styles.btn}
            style={{ marginTop: 14 }}
            onClick={retryPolicy}
            disabled={busy}
          >
            {busy ? 'Reading' : 'Read The Policy Again'}
          </button>
        </div>
      ) : (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Approval Policy</h3>
          <p className={styles.cardNote}>
            This Is The Switch That Decides Whether A Money Move Executes When An
            Operator Confirms It Or Stops And Waits For A Second Operator. It Is
            Currently <strong>{approvalsStateLabel(policy)}</strong>.
          </p>

          <div className={styles.policyGrid}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={policyDraft.approvals_enabled === true}
                onChange={(e) => setPolicyDraft((p) => ({ ...p, approvals_enabled: e.target.checked }))}
              />
              <span>
                <strong>Require Approvals</strong>
                <span className={styles.fieldHint}>
                  {' '}When This Is On, A Mint, A Club Funding Or A Cashout At Or Over Its
                  Threshold Records A Pending Request And Nothing Moves Until A Second
                  Operator Approves It.
                </span>
              </span>
            </label>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={policyDraft.allow_self_approve_when_alone === true}
                onChange={(e) => setPolicyDraft((p) => ({
                  ...p, allow_self_approve_when_alone: e.target.checked,
                }))}
              />
              <span>
                <strong>Allow A Lone Operator To Decide Their Own Request</strong>
                <span className={styles.fieldHint}>
                  {' '}A Single-Operator Platform Cannot Four-Eyes Anything. While This Is
                  On, A Request With No Second Eligible Approver Can Be Decided By The
                  Operator Who Raised It, And The Audit Row Says So. Turn It Off Once
                  There Are Two Operators.
                </span>
              </span>
            </label>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="policy-mint-threshold">
                Mint Threshold
              </label>
              <input
                id="policy-mint-threshold"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={policyDraft.mint_threshold}
                onChange={(e) => setPolicyDraft((p) => ({ ...p, mint_threshold: e.target.value }))}
              />
              <span className={styles.fieldHint}>
                Issue And Retire Both Read This One. Zero Means Every Operation Goes For
                Approval While Approvals Are On.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="policy-fund-threshold">
                Club Funding Threshold
              </label>
              <input
                id="policy-fund-threshold"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={policyDraft.fund_threshold}
                onChange={(e) => setPolicyDraft((p) => ({ ...p, fund_threshold: e.target.value }))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="policy-cashout-threshold">
                Cashout Threshold
              </label>
              <input
                id="policy-cashout-threshold"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={policyDraft.cashout_threshold}
                onChange={(e) => setPolicyDraft((p) => ({ ...p, cashout_threshold: e.target.value }))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="policy-ttl">
                Approval Window (Minutes)
              </label>
              {/* The bounds are the ROUTE'S bounds, named once in
                  operatorAdmin. min="1" here accepted a value the route then
                  refused with "Between 5 And 43200 Minutes", so the console
                  took a number it could not save and said nothing about it. */}
              <input
                id="policy-ttl"
                className={styles.input}
                type="number"
                min={TTL_MIN_MINUTES}
                max={TTL_MAX_MINUTES}
                step="1"
                inputMode="numeric"
                value={policyDraft.approval_ttl_minutes}
                onChange={(e) => setPolicyDraft((p) => ({
                  ...p, approval_ttl_minutes: e.target.value,
                }))}
              />
              <span className={styles.fieldHint}>
                How Long A Pending Request Stays Decidable Before It Expires. Between{' '}
                {num(TTL_MIN_MINUTES)} And {num(TTL_MAX_MINUTES)} Minutes.
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`${styles.btn} ${styles.btnGo}`}
            style={{ marginTop: 14 }}
            onClick={() => setPolicyConfirm(true)}
            disabled={busy || !policyDirty || !policyValid}
          >
            Save Policy
          </button>
          {policyProblems.map((problem) => (
            <span key={problem} className={styles.fieldHint} role="alert">
              {' '}{problem}
            </span>
          ))}
          {policyValid && !policyDirty && (
            <span className={styles.fieldHint}> Nothing Has Been Changed Yet.</span>
          )}
        </div>
      )}

      {/* ── GRANT ─────────────────────────────────────────────────────────── */}
      {grantFor && (
        <Modal
          title={`Grant A Role To ${grantFor.display_name || grantFor.email || 'This Operator'}`}
          onClose={busy ? undefined : () => setGrantFor(null)}
          hideClose={busy}
          sticky={busy}
          blockEscape={busy}
        >
          <p className={styles.cardNote}>
            A Grant Widens What This Account Can Do. It Takes Nothing Away From Anyone
            And It Does Not Replace The Role On Their Profile.
          </p>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="grant-role">Role</label>
            <select
              id="grant-role"
              className={styles.select}
              value={grantRole}
              onChange={(e) => setGrantRole(e.target.value)}
            >
              <option value="">Pick A Role</option>
              {roleOptions.map((role) => (
                <option key={role.key} value={role.key}>{role.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field} style={{ marginTop: 12 }}>
            <label className={styles.fieldLabel} htmlFor="grant-reason">
              Reason (At Least {MIN_REASON_LENGTH} Characters)
            </label>
            <textarea
              id="grant-reason"
              className={styles.textarea}
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
            />
            <span className={styles.fieldHint}>
              This Is The Only Part Of The Record A Database Cannot Reconstruct Later.
            </span>
          </div>
          <div className={styles.rowActions} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGo}`}
              onClick={submitGrant}
              disabled={busy || !grantRole || !reasonIsValid(grantReason)}
            >
              {busy ? 'Working' : 'Grant Role'}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setGrantFor(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── REVOKE ────────────────────────────────────────────────────────── */}
      {revokeFor && (
        <Modal
          title={`Revoke A Role From ${revokeFor.display_name || revokeFor.email || 'This Operator'}`}
          onClose={busy ? undefined : () => setRevokeFor(null)}
          hideClose={busy}
          sticky={busy}
          blockEscape={busy}
        >
          <p className={styles.cardNote}>
            The Grant Is Marked Revoked And Kept. While Enforcement Is Off This Removes
            Nothing That Account Can Do Today, Because Its Profile Role Still Carries
            Every Permission.
          </p>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="revoke-grant">Grant</label>
            <select
              id="revoke-grant"
              className={styles.select}
              value={revokeGrantId}
              onChange={(e) => setRevokeGrantId(e.target.value)}
            >
              <option value="">Pick A Grant</option>
              {revokeOptions.map((entry) => (
                <option key={entry.grantId} value={entry.grantId}>{roleLabel(entry.key)}</option>
              ))}
            </select>
          </div>
          <div className={styles.field} style={{ marginTop: 12 }}>
            <label className={styles.fieldLabel} htmlFor="revoke-reason">
              Reason (At Least {MIN_REASON_LENGTH} Characters)
            </label>
            <textarea
              id="revoke-reason"
              className={styles.textarea}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>
          <div className={styles.rowActions} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={submitRevoke}
              disabled={busy || !revokeGrantId || !reasonIsValid(revokeReason)}
            >
              {busy ? 'Working' : 'Revoke Grant'}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setRevokeFor(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── POLICY CONFIRMATION ───────────────────────────────────────────── */}
      {/* Typed, because this is the one control on the page whose effect is
          felt on a different tab by a different operator. The sentence names
          what will happen, not which column changes - and it is built from
          the PATCH, not the draft: the dialog used to say "Turning Approvals
          On" whenever the draft had approvals on, so changing only the TTL
          with approvals already on announced a switch that was not being
          thrown. Danger tone only when approvals are being switched ON. */}
      {policyConfirm && (
        <ConfirmDialog
          title="Confirm The Approval Policy"
          confirmLabel="Save Policy"
          tone={switchingApprovals && policyDraft.approvals_enabled ? 'danger' : 'go'}
          busy={busy}
          sticky={busy}
          blockEscape={busy}
          requireTyped="POLICY"
          onConfirm={submitPolicy}
          onCancel={() => setPolicyConfirm(false)}
          note="Every Change To This Policy Is Recorded In The Admin Audit Log With Your Account Against It."
        >
          {switchingApprovals && policyDraft.approvals_enabled ? (
            <>
              <p style={{ marginTop: 0 }}>
                <strong>Turning Approvals On.</strong> From The Moment This Saves, A Mint
                Of {Number(policyDraft.mint_threshold || 0).toLocaleString()} Or More, A
                Club Funding Of {Number(policyDraft.fund_threshold || 0).toLocaleString()}{' '}
                Or More, And A Cashout Of{' '}
                {Number(policyDraft.cashout_threshold || 0).toLocaleString()} Or More Will
                Not Execute When An Operator Confirms It. It Will Record A Pending Request
                And Wait For A Second Operator To Approve It, For Up To{' '}
                {Number(policyDraft.approval_ttl_minutes || 0).toLocaleString()} Minutes.
              </p>
              <p>
                {policyDraft.allow_self_approve_when_alone
                  ? 'With Only One Eligible Approver, The Operator Who Raised The Request May Still Decide It, And The Audit Row Will Say That Is What Happened.'
                  : 'With Only One Eligible Approver And The Alone Rule Off, Nothing At Or Over A Threshold Can Be Completed By Anybody. Turn The Alone Rule On Unless There Are Genuinely Two Operators.'}
              </p>
            </>
          ) : switchingApprovals ? (
            <p style={{ marginTop: 0 }}>
              <strong>Turning Approvals Off.</strong> Every Money Move Will Execute As
              Soon As An Operator Confirms It, Exactly As It Does Today. Requests Are
              Still Recorded So The Trail Stays Complete, Marked As Auto Approved.
            </p>
          ) : (
            <p style={{ marginTop: 0 }}>
              <strong>Approvals Stay {approvalsStateLabel(policy)}.</strong> This Changes{' '}
              {policyChanges.length ? policyChanges.join(', ') : 'Nothing'}.
            </p>
          )}
          {switchingApprovals && policyChanges.length > 0 && (
            <p>Also Changing {policyChanges.join(', ')}.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
