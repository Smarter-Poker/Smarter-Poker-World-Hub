import React, { useCallback, useEffect, useRef, useState } from 'react';
import { captureExportScope, downloadExportArtifact } from './exportArtifactClient';
import Pager from './Pager';
import styles from './shared.module.css';

export default function ExportArtifactCenter({ authFetch }) {
  const [jobs, setJobs] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [originalId, setOriginalId] = useState('');
  const [originalJob, setOriginalJob] = useState(null);
  const [originalLoading, setOriginalLoading] = useState(false);
  const [originalError, setOriginalError] = useState('');
  const [acknowledged, setAcknowledged] = useState(new Set());
  const alive = useRef(true);
  const sequence = useRef(0);
  const originalSequence = useRef(0);
  const load = useCallback(async (at = 0) => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const scope = captureExportScope(authFetch);
      const isCurrent = () => alive.current && current === sequence.current && scope.isCurrent();
      const answer = await authFetch(`/api/horses/export-artifacts?limit=25&offset=${at}`, { expectedOperatorId: scope.operatorId, isCurrent });
      if (!isCurrent()) return;
      const result = answer?.data ?? answer;
      if (!Array.isArray(result?.rows) || !Number.isSafeInteger(result.total) || result.total < 0 || result.limit !== 25 || result.offset !== at || typeof result.hasMore !== 'boolean') throw new Error('Export History Could Not Be Confirmed');
      setJobs(result.rows); setOffset(at); setTotal(result.total); setHasMore(result.hasMore); setError('');
    } catch (cause) { if (alive.current && current === sequence.current) setError(cause?.message || 'Export Jobs Could Not Be Read'); }
    finally { if (alive.current && current === sequence.current) setLoading(false); }
  }, [authFetch]);
  const readOriginal = async (id = originalId) => {
    id = id.trim().toLowerCase();
    const current = ++originalSequence.current;
    setOriginalLoading(true); setOriginalJob(null);
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('Enter The Original Export Job ID');
      const scope = captureExportScope(authFetch);
      const isCurrent = () => alive.current && current === originalSequence.current && scope.isCurrent();
      const answer = await authFetch(`/api/horses/export-artifacts?id=${encodeURIComponent(id)}`, { expectedOperatorId: scope.operatorId, isCurrent });
      if (!isCurrent()) return;
      const job = (answer?.data ?? answer)?.job;
      if (!job || job.id !== id || job.requester_id !== scope.operatorId) throw new Error('The Original Export Receipt Could Not Be Confirmed');
      setOriginalJob(job); setOriginalError('');
    } catch (cause) { if (alive.current && current === originalSequence.current) setOriginalError(cause?.message || 'The Original Export Job Could Not Be Read'); }
    finally { if (alive.current && current === originalSequence.current) setOriginalLoading(false); }
  };
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
      if (originalJob?.id === job.id) await readOriginal(job.id);
      await load(offset);
    } catch (cause) { if (alive.current) setError(cause?.message || 'The Export Action Could Not Be Confirmed'); }
    finally { if (alive.current) setBusy(''); }
  };
  return <section className={styles.opsDetail} aria-label="Private export files">
    <button type="button" className={styles.btn} onClick={() => { setOpen(!open); if (!open) load(); }}>{open ? 'Hide Export Files' : 'Export Files'}</button>
    {open ? <><h3>Private Export Files</h3><p>Reports Run On Request And Expire After Seven Days. Refresh Reads Status; Resume Explicitly Recovers An Interrupted Job. Up To 20,000 Rows And 16 MB Per File.</p>
      <button type="button" className={styles.btn} disabled={loading} onClick={() => load(offset)}>Refresh Export Status</button>
      {loading ? <p role="status">Loading Export Files</p> : null}
      <Pager offset={offset} limit={25} count={jobs.length} total={total} hasMore={hasMore} loading={loading} noun="Jobs" onPrevious={() => load(Math.max(0, offset - 25))} onNext={() => load(offset + 25)} />
      <label htmlFor="original-export-job-id">Original Export Job ID</label>
      <input id="original-export-job-id" className={styles.input} value={originalId} onChange={(event) => { setOriginalId(event.target.value); setOriginalJob(null); originalSequence.current += 1; setOriginalLoading(false); }} />
      <button type="button" className={styles.btn} disabled={originalLoading || !originalId.trim()} onClick={() => readOriginal(originalId.trim())}>Read Original Job</button>
      {originalLoading ? <p role="status">Loading Original Export Job</p> : null}
      {originalError ? <div role="alert" className={styles.errorNote}>{originalError}</div> : null}
      {error ? <div role="alert" className={styles.errorNote}>{error}</div> : null}
      {message ? <div role="status" className={styles.infoNote}>{message}</div> : null}
      {!jobs.length && !loading && !error ? <p>No Private Export Jobs Were Returned On This Page.</p> : null}
      {[...(originalJob ? [originalJob] : []), ...jobs.filter((job) => job.id !== originalJob?.id)].map((job) => {
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
