import React, { useState } from 'react';
import styles from './shared.module.css';
import { downloadCsv, stampedName, toCsv } from '../../lib/horsesAdminTokens';

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function EconomyExport({
  rows = [], columns = [], label = 'Export Report', filenamePrefix = 'economy-report',
  cap = 100000, complete = true, total = null, authFetch, filters = {},
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState({ busy: false, error: '', receipt: null });
  const truncated = complete === false;
  const download = async () => {
    if (truncated && !acknowledged) { setAcknowledged(true); return; }
    if (!authFetch) { setState({ busy: false, error: 'A Recorded Export Path Is Not Available', receipt: null }); return; }
    setState({ busy: true, error: '', receipt: null });
    const knownTotal = Number.isFinite(Number(total)) ? ` TOTAL ROWS REPORTED ${Number(total)}.` : ' TOTAL ROWS UNKNOWN.';
    const marker = truncated ? [{ __report_state: `TRUNCATED EXPORT. ${rows.length} ROWS EXPORTED.${knownTotal} SAFETY CAP ${cap}.` }] : [];
    const exportColumns = truncated ? [['__report_state', 'Report State'], ...columns] : columns;
    const name = stampedName(`${filenamePrefix}-${truncated ? 'truncated' : 'complete'}`);
    const csv = toCsv([...marker, ...rows], exportColumns);
    try {
      const answer = await authFetch('/api/horses/economy-admin', { method: 'POST', body: JSON.stringify({
        action: 'record_export_prepared', opId: globalThis.crypto.randomUUID(), surface: filenamePrefix,
        filters, rowCount: rows.length, complete: !truncated, contentSha256: await sha256(csv), byteSize: new TextEncoder().encode(csv).byteLength,
      }) });
      downloadCsv(name, csv);
      setState({ busy: false, error: '', receipt: answer?.receipt?.id || 'Recorded' });
    } catch (error) {
      setState({ busy: false, error: error?.message || 'The Export Receipt Could Not Be Recorded', receipt: null });
    }
  };
  return (
    <div className={styles.opsExportBox}>
      <div className={styles.infoNote}>A Durable Prepared Receipt Is Recorded Before The Browser Download Is Requested.</div>
      {state.error ? <div className={styles.errorNote} role="alert">{state.error}</div> : null}
      {state.receipt ? <div className={styles.goodNote} role="status">Prepared Receipt Recorded: {state.receipt}. Browser Download Requested.</div> : null}
      {truncated && !acknowledged ? <div className={styles.errorNote} role="alert">This Export Is Incomplete. Confirm Once To Prepare The Truncated File.</div> : null}
      <button type="button" className={styles.btn} onClick={download} disabled={!rows.length || state.busy}>
        {truncated && !acknowledged ? 'Acknowledge Truncated Export' : `${label} (${rows.length} Rows)`}
      </button>
      <div className={styles.fieldHint}>Safety Cap: {cap.toLocaleString()} Rows. {total === null ? 'Total Rows Unknown.' : `${Number(total).toLocaleString()} Total Rows Reported.`}</div>
    </div>
  );
}
