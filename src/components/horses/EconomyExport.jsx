import React, { useState } from 'react';
import styles from './shared.module.css';
import { requestExportArtifact } from './exportArtifactClient';

export default function EconomyExport({ rows = [], label = 'Export Report', filenamePrefix = 'economy-report', authFetch, filters = {} }) {
  const [state, setState] = useState({ busy: false, error: '', job: null });
  const request = async () => {
    setState({ busy: true, error: '', job: null });
    try {
      const result = await requestExportArtifact(authFetch, filenamePrefix, filters);
      setState({ busy: false, error: '', job: result.jobId });
    } catch (error) { setState({ busy: false, error: error?.message || 'The Export Outcome Could Not Be Confirmed', job: null }); }
  };
  return <div className={styles.opsExportBox}>
    <div className={styles.infoNote}>Generate A Private Server Report From The Authoritative Source. Its SHA-256, Completeness And Expiry Are Recorded.</div>
    {state.error ? <div className={styles.errorNote} role="alert">{state.error}</div> : null}
    {state.job ? <div className={styles.infoNote} role="status">Export Job Recorded: {state.job}. Open Export Files To Read Status And Download.</div> : null}
    <button type="button" className={styles.btn} onClick={request} disabled={state.busy}>{state.busy ? 'Recording Export Request' : label}</button>
    <div className={styles.fieldHint}>{rows.length} Rows On Screen. Server Safety Cap: 20,000 Rows And 16 MB. Incomplete Files Require Acknowledgement.</div>
  </div>;
}
