/**
 * YOUR BANKROLL DATA (Settings, 2026-11-28)
 *
 * - Import Sessions: SessionImportSheet.
 * - Undo Last Import: deletes exactly the rows the newest import tagged,
 *   each through deleteLedgerEntry (so receipts filed to them go back to
 *   Receipts Waiting), then recomputes the balances once.
 * - Download My Bankroll Data: a ZIP with one JSON of everything and a CSV
 *   per table, read in pages with the player's own session.
 * - Delete All Bankroll Data: typed confirmation, offers the download first,
 *   deletes only Bankroll Manager rows in a safe order, and reports exactly
 *   what is left.
 * The work itself is in src/lib/bankroll/bankrollDataIo.mjs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { deleteLedgerEntry, recalculateBankrollBalances } from '../../lib/bankroll/bankrollSelectors';
import { removeBankrollObject } from '../../lib/bankroll/receiptStorage';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import { importDay } from '../../lib/bankroll/sessionImport.mjs';
import { saveFile } from '../../lib/bankroll/saveFile.mjs';
import {
  DATA_SOURCES, buildZip, deleteBankrollData, deleteEach, exportFiles, findLastImport, importedRows, readBankrollData,
} from '../../lib/bankroll/bankrollDataIo.mjs';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import toast from '../../stores/toastStore';
import css from './BankrollDataTools.module.css';

const SessionImportSheet = dynamic(() => import('./SessionImportSheet'), { ssr: false });

/** Read everything and save it as a ZIP. Shared by Download and the Delete sheet. */
async function downloadEverything(userId, onProgress) {
  const data = await readBankrollData(supabase, userId, { onProgress });
  const day = localDay();
  const files = exportFiles(data, { exportedAt: new Date().toISOString(), day });
  saveFile(new Blob([buildZip(files)], { type: 'application/zip' }), `smarter-poker-bankroll-data-${day}.zip`);
  return data;
}

export default function BankrollDataTools({ userId }) {
  const [showImport, setShowImport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [lastImport, setLastImport] = useState(undefined);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState('');
  const [confirmUndo, setConfirmUndo] = useState(null);
  const working = useRef(false);

  const refreshLastImport = useCallback(async () => {
    if (!userId) return;
    try {
      setLastImport(await findLastImport(supabase, userId));
    } catch (error) {
      console.warn('[data] last import read failed:', error?.message || error);
      setLastImport('error');
    }
  }, [userId]);

  useEffect(() => {
    refreshLastImport();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('bankroll-updated', refreshLastImport);
    return () => window.removeEventListener('bankroll-updated', refreshLastImport);
  }, [refreshLastImport]);

  const startUndo = async () => {
    if (working.current || !lastImport || lastImport === 'error' || !requireOnlineNow(toast)) return;
    working.current = true;
    setBusy('undo');
    setStatus('Finding The Imported Rows…');
    try {
      const rows = await importedRows(supabase, userId, lastImport.id);
      setConfirmUndo({ id: lastImport.id, rows });
    } catch (error) {
      toast.error('Could Not Read The Imported Rows. Try Again.');
    } finally {
      working.current = false;
      setBusy(null);
      setStatus('');
    }
  };

  const runUndo = async () => {
    if (working.current || !confirmUndo || !requireOnlineNow(toast)) return;
    working.current = true;
    setBusy('undo');
    const { rows } = confirmUndo;
    setConfirmUndo(null);
    try {
      const result = await deleteEach(rows.map((r) => r.id), (id) => deleteLedgerEntry(userId, id, { recalculate: false }), {
        onProgress: (done, total) => setStatus(`Removing Imported Rows… ${done.toLocaleString('en-US')} Of ${total.toLocaleString('en-US')}`),
      });
      await recalculateBankrollBalances(userId, [...new Set(rows.map((r) => r.category))]);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
      if (result.failed.length) toast.error(`Removed ${result.deleted.toLocaleString('en-US')}. ${result.failed.length} Could Not Be Removed; Tap Undo Again.`);
      else toast.success(`Removed ${result.deleted.toLocaleString('en-US')} Imported ${result.deleted === 1 ? 'Row' : 'Rows'}.`);
    } finally {
      working.current = false;
      setBusy(null);
      setStatus('');
    }
  };

  const runDownload = async () => {
    if (working.current || !requireOnlineNow(toast)) return;
    working.current = true;
    setBusy('download');
    try {
      await downloadEverything(userId, (done, total) => setStatus(`Reading Your Data… ${done} Of ${total}`));
      toast.success('Your Bankroll Data Was Downloaded');
    } catch (error) {
      console.warn('[data] export failed:', error?.message || error);
      toast.error(`Download Failed. ${error?.message || ''}`.trim());
    } finally {
      working.current = false;
      setBusy(null);
      setStatus('');
    }
  };

  const lastImportText = lastImport === undefined
    ? 'Checking…'
    : lastImport === 'error'
      ? 'Could Not Check For Imports.'
      : lastImport
        ? `Last Import: ${importDay(lastImport.id)} (${lastImport.id}).`
        : 'No Imports Yet.';

  return (
    <section className={css.card} aria-labelledby="bankroll-data-title" data-testid="bankroll-data-tools">
      <h3 id="bankroll-data-title" className={css.cardTitle}>Your Bankroll Data</h3>
      <span className={css.hint}>Import Sessions From A Spreadsheet, Download Everything You Keep Here, Or Delete It. Amounts Are US Dollars (USD).</span>
      <div className={css.actions}>
        <button type="button" className={`sd-button ${css.actionButton}`} disabled={!!busy} onClick={() => setShowImport(true)}>
          Import Sessions <span aria-hidden="true">›</span>
        </button>
        <button type="button" className={`sd-button ${css.actionButton}`} disabled={!!busy || !lastImport || lastImport === 'error'} onClick={startUndo} data-testid="undo-last-import">
          Undo Last Import <span aria-hidden="true">›</span>
        </button>
        <span className={css.hint} style={{ margin: 0 }}>{lastImportText}</span>
        {confirmUndo && (
          <div role="alertdialog" aria-label="Undo Last Import" className={css.card} style={{ marginBottom: 0 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14 }}>
              Delete The {confirmUndo.rows.length.toLocaleString('en-US')} {confirmUndo.rows.length === 1 ? 'Row' : 'Rows'} Imported On {importDay(confirmUndo.id)}? Rows You Typed Yourself Are Not Touched.
            </p>
            <div className={css.footer} style={{ marginTop: 0 }}>
              <button type="button" className="sd-button" onClick={() => setConfirmUndo(null)}>Keep Them</button>
              <button type="button" className={css.danger} disabled={!confirmUndo.rows.length} onClick={runUndo}>Delete Imported Rows</button>
            </div>
          </div>
        )}
        <button type="button" className={`sd-button ${css.actionButton}`} disabled={!!busy} onClick={runDownload} data-testid="download-bankroll-data">
          Download My Bankroll Data <span aria-hidden="true">›</span>
        </button>
        <button type="button" className={css.danger} disabled={!!busy} onClick={() => setShowDelete(true)}>
          Delete All Bankroll Data
        </button>
        {status && <p role="status" className={css.hint} style={{ margin: 0 }}>{status}</p>}
      </div>
      {showImport && (
        <SessionImportSheet userId={userId} onClose={() => setShowImport(false)} onImported={refreshLastImport} />
      )}
      {showDelete && <DeleteBankrollDataSheet userId={userId} onClose={() => setShowDelete(false)} />}
    </section>
  );
}

const KEEPS = ['Your Smarter.Poker account and profile', 'Your wallet', 'Club Arena and everything in it', 'Training and hand history', 'Your Bankroll Manager display settings'];

export function DeleteBankrollDataSheet({ userId, onClose }) {
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('confirm');
  const [progress, setProgress] = useState({ label: '', done: 0, total: 0 });
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [downloaded, setDownloaded] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !running.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    if (running.current || !requireOnlineNow(toast)) return;
    running.current = true;
    setPhase('downloading');
    setError(null);
    try {
      await downloadEverything(userId, (done, total, label) => setProgress({ label: `Reading ${label}`, done, total }));
      setDownloaded(true);
    } catch (e) {
      setError(`Download Failed. ${e?.message || ''}`.trim());
    } finally {
      running.current = false;
      setPhase('confirm');
    }
  };

  const runDelete = async () => {
    if (running.current || typed !== 'DELETE' || !requireOnlineNow(toast)) return;
    running.current = true;
    setPhase('deleting');
    setError(null);
    try {
      // Read first: the report compares what was there with what is left,
      // and a failed read stops here before anything is deleted.
      const data = await readBankrollData(supabase, userId, {
        onProgress: (done, total, label) => setProgress({ label: `Reading ${label}`, done, total }),
      });
      const result = await deleteBankrollData(supabase, userId, data, {
        removeFile: (url) => removeBankrollObject(supabase, url),
        onProgress: (done, total, label) => setProgress({ label, done, total }),
      });
      setReport(result);
      setPhase('done');
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
    } catch (e) {
      console.warn('[data] delete failed before it started:', e?.message || e);
      setError(`Nothing Was Deleted. ${e?.message || 'Your Data Could Not Be Read.'}`);
      setPhase('confirm');
    } finally {
      running.current = false;
    }
  };

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const busy = phase === 'deleting' || phase === 'downloading';
  const leftOver = report ? report.sources.filter((s) => s.left === null || s.left > 0) : [];

  return (
    <div className={css.scrim} onClick={() => { if (!running.current) onClose(); }}>
      <div className={css.sheet} role="dialog" aria-modal="true" aria-labelledby="delete-bankroll-title" onClick={(e) => e.stopPropagation()} data-testid="delete-bankroll-sheet">
        <div className={css.sheetHead}>
          <h2 id="delete-bankroll-title" className={css.sheetTitle}>Delete All Bankroll Data</h2>
          <button type="button" className={css.close} onClick={onClose} disabled={busy}>Close</button>
        </div>

        {(phase === 'confirm' || phase === 'downloading') && (
          <>
            <p className={css.hint}>This Permanently Deletes Everything You Keep In The Bankroll Manager. It Cannot Be Undone.</p>
            <h3 className={css.label}>What Is Deleted</h3>
            <ul className={css.list}>
              {DATA_SOURCES.map((s) => <li key={s.key}>{s.label}</li>)}
              <li>Receipt, W-2G, Document And Player Photos Stored For Them</li>
            </ul>
            <h3 className={css.label}>What Stays</h3>
            <ul className={css.list}>{KEEPS.map((k) => <li key={k}>{k}</li>)}</ul>
            <div className={css.footer}>
              <button type="button" className="sd-button sd-primary" disabled={busy} onClick={download}>
                {phase === 'downloading' ? 'Downloading…' : downloaded ? 'Downloaded. Download Again' : 'Download My Data First'}
              </button>
            </div>
            {phase === 'downloading' && <div className={css.progress}><div style={{ width: `${percent}%` }} /></div>}
            <label className={css.label} htmlFor="delete-confirm">Type DELETE To Confirm</label>
            <input id="delete-confirm" className={css.input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} />
            {error && <p role="alert" className={css.bad}>{error}</p>}
            <div className={css.footer}>
              <button type="button" className="sd-button" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className={css.danger} disabled={typed !== 'DELETE' || busy} onClick={runDelete} data-testid="delete-bankroll-run">Delete Everything</button>
            </div>
          </>
        )}

        {phase === 'deleting' && (
          <div role="status" aria-live="polite">
            <p className={css.hint}>{progress.label}… Keep This Screen Open.</p>
            <div className={css.progress}><div style={{ width: `${percent}%` }} /></div>
          </div>
        )}

        {phase === 'done' && report && (
          <div role="status" aria-live="polite">
            <p className={report.ok ? css.good : css.warn} style={{ fontSize: 15, fontWeight: 600 }}>
              {report.ok ? 'Your Bankroll Manager Data Was Deleted.' : 'Most Of Your Data Was Deleted, But Not All Of It.'}
            </p>
            <p className={css.hint}>
              Files Removed: {report.files.removed}. {report.files.failed ? `Files That Could Not Be Removed: ${report.files.failed}. ` : ''}
              {report.files.kept ? `Links To Files Stored Elsewhere Left Alone: ${report.files.kept}.` : ''}
            </p>
            {leftOver.length > 0 && (
              <ul className={css.problems}>
                {leftOver.map((s) => (
                  <li key={s.key}>
                    <strong>{s.label}:</strong>{' '}
                    <span className={css.bad}>{s.left === null ? 'Could Not Be Checked' : `${s.left} Left`}{s.error ? ` (${s.error})` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className={css.footer}>
              {!report.ok && <button type="button" className="sd-button" onClick={() => { setReport(null); setTyped(''); setPhase('confirm'); }}>Try Again</button>}
              <button type="button" className="sd-button sd-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
