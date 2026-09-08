# Training Phase 6 Of 16: Final Release Remediation

Date: 2026-09-08
Status: Remediation implemented and locally verified; public attestation and protected publication pending
Source Baseline: `7ef9316a581442c700e8b99dfdf23c3195a1769d`
Current Production Build: `d5a5225d04ba11e948f5e5454395d6e9a0438a38`

## Release Decision

Phase 6 remains open. The final remediation candidate is not a production
completion receipt. It must still pass the public delivery-authority
attestation, protected publication, and exact deployed-build verification
before Phase 6 can close or Phase 7 can begin.

The approved global header was not changed by this remediation.

## Security Remediation

- The unreferenced `get_user.js` privileged user-dump script contained an
  inactive hardcoded Supabase credential. The entire script was retired rather
  than preserving a privileged diagnostic path that could print user data.
- `lib/supabaseAdmin.ts` no longer falls back to an anonymous browser key for
  administrator access. It now requires `SUPABASE_SERVICE_ROLE_KEY` and fails
  closed when that server-only credential is unavailable.
- A permanent credential-safety test protects both contracts: the retired
  script must remain absent, and the administrator helper must not regain an
  anonymous-key fallback.
- No credential value was written, rotated, printed, or stored in this audit.

## Global Footer E2E Remediation

The global footer browser suite was repaired without changing production
footer or header behavior. The test now owns redirect expectations explicitly,
isolates route groups in fresh pages, supplies only a test-local authentication
boundary for the authenticated footer route, and stabilizes WebKit scrolling
before geometry assertions.

Verification result: 8 of 8 WebKit footer tests passed against the live site.

## Immutable Deployment Attestation Remediation

The production delivery-attestation harness now supports an existing Vercel
deployment-protection bypass only for the exact immutable deployment origin.
The bypass is attached to exact-origin health and browser requests and is not
forwarded to cross-origin traffic. It is not written to evidence, logs, or
command arguments. The original unprotected execution path remains supported.

The harness also removes the duplicate `questionIds` request property so the
reissue payload has one authoritative question-ID list.

Verification result: 35 of 35 delivery-attestation contract tests passed.

## Public Attestation Result

The first public run reached the immutable protected deployment and then failed
closed because the designated audit account was only Level 1 while the required
attestation campaign is Level 8. This is a valid enforcement result, but it is
not a successful delivery-authority attestation and does not authorize release
closeout.

No green public attestation or machine-administrator correlation receipt has
been recorded by this document.

## Remaining Phase 6 Gates

Phase 6 can close only after all of the following are complete:

1. Use an explicitly designated audit account that satisfies the required
   Level 8 campaign precondition, then rerun the uninterrupted public
   attestation against the exact immutable candidate deployment.
2. Complete the machine-administrator correlation for that public evidence and
   obtain the final release-gate receipt.
3. Publish this remediation through the protected pull-request workflow with
   every required check passing normally.
4. Verify that production serves the merged revision and repeat the required
   live health, footer, Training, and delivery-authority checks against that
   exact deployed build.

Until those gates pass, protected publication is pending, production does not
contain this final remediation candidate, and Phase 6 remains open.
