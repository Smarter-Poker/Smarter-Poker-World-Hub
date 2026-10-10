import React, { useCallback, useEffect, useRef, useState } from 'react';
import { captureExportScope, downloadExportArtifact } from './exportArtifactClient';
import styles from './shared.module.css';

export default function ExportArtifactCenter({ authFetch }) {
  const [jobs, setJobs] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [acknowledged, setAcknowledged] = useState(new Set());
  const alive = useRef(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const scope = captureExportScope(authFetch);
      const answer = await authFetch('/api/horses/export-artifacts', { expectedOperatorId: scope.operatorId, isCurrent: () => alive.current && current === sequence.current && scope.isCurrent() });
      if (alive.current && current === sequence.current) { setJobs((answer?.data ?? answer)?.jobs || []); setError(''); }
    } catch (cause) { if (alive.current && current === sequence.current) setError(cause?.message || 'Export Jobs Could Not Be Read'); }
  }, [authFetch]);
  useEffect(() => {
    alive.current = true;
    const requested = () => { setOpen(true); load(); };
    window.addEventListener('operator-export-requested', requested);
    return () => { alive.current = false; window.removeEventListener('operator-export-requested', requested); };
  }, [load]);
  const act = async (job, action) => {
    if (busy) return;
    setBusy(job.id); setError(''); setMessage('');
    try {
      const original = captureExportScope(authFetch);
      const scope = { operatorId: original.operatorId, isCurrent: () => alive.current && original.isCurrent() };
      if (action === 'download') {
        await downloadExportArtifact(authFetch, job, acknowledged.has(job.id), { scope });
        if (alive.current) setMessage('Verified File Download Requested. The Browser Does Not Confirm That It Was Saved.');
      } else await authFetch('/api/horses/export-artifacts', { method: 'POST', body: JSON.stringify({ action, id: job.id }), expectedOperatorId: scope.operatorId, isCurrent: scope.isCurrent });
      await load();
    } catch (cause) { if (alive.current) setError(cause?.message || 'The Export Action Could Not Be Confirmed'); }
    finally { if (alive.current) setBusy(''); }
  };
  return <section className={styles.opsDetail} aria-label="Private export files">
    <button type="button" className={styles.btn} onClick={() => { setOpen(!open); if (!open) load(); }}>{open ? 'Hide Export Files' : 'Export Files'}</button>
    {open ? <><h3>Private Export Files</h3><p>Reports Run On Request And Expire After Seven Days. Refresh Reads Status; Resume Explicitly Recovers An Interrupted Job. Up To 20,000 Rows And 16 MB Per File.</p>
      <button type="button" className={styles.btn} onClick={load}>Refresh Export Status</button>
      {error ? <div role="alert" className={styles.errorNote}>{error}</div> : null}
      {message ? <div role="status" className={styles.infoNote}>{message}</div> : null}
      {!jobs.length && !error ? <p>No Private Export Jobs Were Returned.</p> : null}
      {jobs.map((job) => {
        const expired = Date.parse(job.expires_at) <= Date.now();
        const ready = !expired && ['ready','truncated'].includes(job.state);
        const resumable = !expired && (['queued','failed'].includes(job.state) || job.state === 'running' && Date.parse(job.lease_until) <= Date.now());
        return <article className={styles.opsCard} key={job.id}>
          <strong>{job.surface}</strong><p>{expired ? 'Expired' : job.state}. {job.progress ?? 0} Rows. Total: {job.total ?? 'Unknown'}.</p>
          <p className={styles.exportArtifactIdentity}>Job {job.id}. Expires {new Date(job.expires_at).toLocaleString()}. {job.content_sha256 ? `SHA-256 ${job.content_sha256}` : ''}</p>
          {job.error_code ? <p role="alert">{job.error_code}. Keep The Job ID When Recovering.</p> : null}
          {job.state === 'truncated' ? <label><input type="checkbox" checked={acknowledged.has(job.id)} onChange={(event) => setAcknowledged((previous) => { const next = new Set(previous); if (event.target.checked) next.add(job.id); else next.delete(job.id); return next; })} />I Acknowledge This Is An Incomplete Bounded Report.</label> : null}
          {ready ? <button type="button" className={styles.btn} disabled={busy === job.id || job.state === 'truncated' && !acknowledged.has(job.id)} onClick={() => act(job, 'download')}>Download Verified CSV</button> : null}
          {resumable ? <button type="button" className={styles.btn} disabled={busy === job.id} onClick={() => act(job, 'resume')}>Resume Original Job</button> : null}
          {job.state !== 'cancelled' && !expired ? <button type="button" className={styles.btn} disabled={busy === job.id} onClick={() => act(job, 'cancel')}>Cancel And Revoke Download</button> : null}
          {job.state === 'cancelled' || expired ? <button type="button" className={styles.btn} disabled={busy === job.id} onClick={() => act(job, 'purge')}>Remove Stored File</button> : null}
        </article>;
      })}
    </> : null}
  </section>;
}
