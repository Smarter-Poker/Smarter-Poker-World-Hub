import React, { useState } from 'react';
import styles from './shared.module.css';
import { downloadCsv, stampedName, toCsv } from '../../lib/horsesAdminTokens';

export default function EconomyExport({
  rows = [], columns = [], label = 'Export Report', filenamePrefix = 'economy-report',
  cap = 100000, complete = true, total = null,
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const truncated = complete === false;
  const download = () => {
    if (truncated && !acknowledged) { setAcknowledged(true); return; }
    const knownTotal = Number.isFinite(Number(total)) ? ` TOTAL ROWS REPORTED ${Number(total)}.` : ' TOTAL ROWS UNKNOWN.';
    const marker = truncated ? [{ __report_state: `TRUNCATED EXPORT. ${rows.length} ROWS EXPORTED.${knownTotal} SAFETY CAP ${cap}.` }] : [];
    const exportColumns = truncated ? [['__report_state', 'Report State'], ...columns] : columns;
    const name = stampedName(`${filenamePrefix}-${truncated ? 'truncated' : 'complete'}`);
    downloadCsv(name, toCsv([...marker, ...rows], exportColumns));
  };
  return (
    <div className={styles.opsExportBox}>
      <div className={styles.warnNote}>Platform Exports Are Not Recorded. The Downloaded File Is The Operator Record.</div>
      {truncated && !acknowledged ? <div className={styles.errorNote} role="alert">This Export Is Incomplete. Confirm Once To Prepare The Truncated File.</div> : null}
      <button type="button" className={styles.btn} onClick={download} disabled={!rows.length}>
        {truncated && !acknowledged ? 'Acknowledge Truncated Export' : `${label} (${rows.length} Rows)`}
      </button>
      <div className={styles.fieldHint}>Safety Cap: {cap.toLocaleString()} Rows. {total === null ? 'Total Rows Unknown.' : `${Number(total).toLocaleString()} Total Rows Reported.`}</div>
    </div>
  );
}
