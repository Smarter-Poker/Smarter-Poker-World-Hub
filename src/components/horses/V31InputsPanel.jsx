import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { hasPermission } from './operatorPermissions';
import { approveReviewedV31Input, reviewV31InputApproval } from './v31InputApproval';
import styles from './V31InputsPanel.module.css';

export default function V31InputsPanel({ operatorId, permissions }) {
  const [text, setText] = useState('');
  const [reviewed, setReviewed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const canApprove = Array.isArray(permissions) && permissions.length > 0
    && hasPermission(permissions, 'fleet.write');
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const edit = (value) => {
    if (inFlight.current) return;
    setText(value); setReviewed(null); setError(''); setReceipt(null);
  };
  const review = () => {
    setError(''); setReceipt(null);
    try { setReviewed(reviewV31InputApproval(text)); } catch (cause) {
      setReviewed(null); setError(cause.message);
    }
  };
  const approve = async () => {
    if (!canApprove || !reviewed || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setReceipt(null);
    try {
      const id = await approveReviewedV31Input(supabase, operatorId, reviewed);
      if (mounted.current) setReceipt(id);
    } catch (cause) {
      if (mounted.current) setError(`No Approval Confirmation Was Received. ${cause.message || 'Verify The Stored Bundle Before Retrying The Same Payload.'}`);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <section className={styles.panel} aria-labelledby="v31-inputs-title">
    <h2 id="v31-inputs-title">V31 Solver Inputs</h2>
    <p>Approve A Prepared Input Bundle For Independent Solver Exports.</p>
    <p className={styles.notice}>Input Approval Does Not Certify Or Activate A Solver Corpus. Source, Quality, Evaluation And Promotion Gates Still Apply.</p>
    <label htmlFor="v31-input-approval-json">Prepared Input Approval JSON</label>
    <textarea id="v31-input-approval-json" className={styles.editor} rows={12}
      value={text} onChange={(event) => edit(event.target.value)} disabled={busy}
      spellCheck={false} placeholder="Paste The Approval JSON Produced By The V31 Bundle Preparer" />
    <div className={styles.actions}>
      <button type="button" onClick={review} disabled={busy || !text.trim()}>Review Input Bundle</button>
    </div>
    {reviewed ? <div className={styles.preview}>
      <h3>Review These Inputs</h3>
      <dl><dt>Bundle</dt><dd>{reviewed.bundle.bundle_key}</dd>
        <dt>Version</dt><dd>{reviewed.bundle.bundle_version}</dd>
        <dt>Scenario Manifest</dt><dd>{reviewed.scenarioManifest.path}</dd>
        <dt>Manifest SHA-256</dt><dd><code>{reviewed.scenarioManifest.checksum}</code></dd>
        <dt>Approval Note</dt><dd>{reviewed.bundle.approval_note}</dd></dl>
      <details><summary>Exact Parsed Approval Payload</summary><pre>{JSON.stringify(reviewed.bundle, null, 2)}</pre></details>
      <p>The Database Verifies The Current Signed-In Horse Administrator And Every Input Receipt.</p>
      {canApprove ? <button type="button" onClick={approve} disabled={busy || Boolean(receipt)}>
        {busy ? 'Approving Inputs...' : 'Approve Input Bundle'}
      </button> : <p role="status">Fleet Write Permission Is Required To Submit Input Approval.</p>}
    </div> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {receipt ? <div className={styles.receipt} role="status"><h3>Input Approval Confirmed</h3>
      <p>Input Bundle ID: <code>{receipt}</code></p>
      <p>These Inputs May Be Used By The Solver Pipeline. No Dataset Was Certified, Promoted Or Loaded By This Action.</p>
    </div> : null}
  </section>;
}
