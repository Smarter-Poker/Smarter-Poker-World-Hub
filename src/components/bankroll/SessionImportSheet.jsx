/**
 * IMPORT SESSIONS (2026-11-28)
 *
 * Pick a CSV or paste a table, check which column is which, see every row
 * the import will save and every row it will not (with the reason), then
 * save through the ledger's own creation path in batches. Every saved row
 * carries the import's tag at the start of its notes, so Undo Last Import in
 * Settings removes exactly that import. Parsing and validation live in
 * src/lib/bankroll/sessionImport.mjs.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { createLedgerEntries } from '../../lib/bankroll/bankrollSelectors';
import { getOrCreateLocation } from '../../lib/bankroll/locationMemory';
import { allRowsOf } from '../../lib/bankroll/leakMath.mjs';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import { formatUsd } from '../../lib/bankroll/ledgerReport.mjs';
import {
  IMPORT_CATEGORIES, IMPORT_FIELDS, MAX_IMPORT_ROWS, PRESETS, detectDateOrder, duplicateKey,
  guessMapping, newImportId, planImport, readTable, venueKey, withLocationIds,
} from '../../lib/bankroll/sessionImport.mjs';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import toast from '../../stores/toastStore';
import ResponsiveTable from '../ui/ResponsiveTable';
import css from './BankrollDataTools.module.css';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PREVIEW_ROWS = 25;

export default function SessionImportSheet({ userId, onClose, onImported }) {
  const [step, setStep] = useState('pick');
  const [presetChoice, setPresetChoice] = useState('auto');
  const [pasted, setPasted] = useState('');
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState({});
  const [order, setOrder] = useState(null);
  const [defaultCategory, setDefaultCategory] = useState('poker_cash');
  const [keepDuplicates, setKeepDuplicates] = useState(false);
  const [existing, setExisting] = useState(null);
  const [existingError, setExistingError] = useState(null);
  const [progress, setProgress] = useState({ label: '', done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [pickError, setPickError] = useState(null);
  const running = useRef(false);
  const today = localDay();

  // Escape closes, except while saving.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !running.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loadExisting = async () => {
    setExisting(null);
    setExistingError(null);
    try {
      const rows = await allRowsOf(() => supabase
        .from('bankroll_ledger')
        .select('id, entry_date, category, gross_in, gross_out, bankroll_locations(name)')
        .eq('user_id', userId)
        .eq('is_revision', false)
        .order('id', { ascending: true }), 'ledger');
      setExisting(new Set(rows.map((r) => duplicateKey(r, r.bankroll_locations?.name))));
    } catch (error) {
      console.warn('[import] ledger read failed:', error?.message || error);
      setExistingError('Could Not Read Your Ledger To Check For Duplicates.');
    }
  };

  const open = (text) => {
    setPickError(null);
    const read = readTable(text, { preset: presetChoice === 'auto' ? null : presetChoice });
    if (!read.headers.length || !read.records.length) {
      setPickError('No Rows Found. The First Row Must Be The Column Names.');
      return;
    }
    if (read.records.length > MAX_IMPORT_ROWS) {
      setPickError(`This File Has ${read.records.length.toLocaleString('en-US')} Rows. Import At Most ${MAX_IMPORT_ROWS.toLocaleString('en-US')} At A Time.`);
      return;
    }
    const guessed = guessMapping(read.headers);
    setTable(read);
    setMapping(guessed);
    const detected = guessed.date !== undefined || guessed.start !== undefined
      ? detectDateOrder(read.records.map((r) => r[guessed.date ?? guessed.start]))
      : 'none';
    setOrder(detected === 'mdy' || detected === 'dmy' ? detected : null);
    setStep('review');
    loadExisting();
  };

  const onFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setPickError('That File Is Larger Than 10 MB.'); return; }
    try {
      open(await file.text());
    } catch (_error) {
      setPickError('That File Could Not Be Read.');
    }
  };

  const dateColumn = mapping.date ?? mapping.start;
  const dateOrderState = useMemo(() => {
    if (!table || dateColumn === undefined) return 'none';
    return detectDateOrder(table.records.map((r) => r[dateColumn]));
  }, [table, dateColumn]);

  const plan = useMemo(() => {
    if (!table) return null;
    return planImport(table, mapping, { order, defaultCategory, today, keepDuplicates }, existing || new Set());
  }, [table, mapping, order, defaultCategory, today, keepDuplicates, existing]);

  const needsOrder = (dateOrderState === 'ambiguous' || dateOrderState === 'conflict') && !order;
  const hasAmount = mapping.buy_in !== undefined || mapping.cash_out !== undefined || mapping.net !== undefined;
  const hasDate = mapping.date !== undefined || mapping.start !== undefined;
  const ready = plan && existing && !needsOrder && hasAmount && hasDate && plan.toImport.length > 0;

  const setField = (field, value) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === '') delete next[field];
      else next[field] = Number(value);
      return next;
    });
  };

  const runImport = async () => {
    if (!ready || running.current || !requireOnlineNow(toast)) return;
    running.current = true;
    setStep('saving');
    const importId = newImportId(today);
    // The same rows, now carrying the import's tag in their notes.
    const tagged = planImport(table, mapping, { order, defaultCategory, today, keepDuplicates, importId }, existing);
    const total = tagged.toImport.length;
    let saved = 0;
    try {
      const venueIds = new Map();
      for (let i = 0; i < tagged.venues.length; i++) {
        setProgress({ label: 'Saving Venues', done: i, total: tagged.venues.length });
        const name = tagged.venues[i];
        venueIds.set(venueKey(name), await getOrCreateLocation(userId, name));
      }
      setProgress({ label: 'Saving Sessions', done: 0, total });
      const rows = await createLedgerEntries(userId, withLocationIds(tagged.toImport, venueIds), {
        onProgress: (done) => setProgress({ label: 'Saving Sessions', done, total }),
      });
      saved = rows.length;
      setResult({ importId, saved, total, rejected: tagged.rejected, duplicates: keepDuplicates ? 0 : tagged.duplicates.length, error: null });
    } catch (error) {
      saved = Array.isArray(error?.saved) ? error.saved.length : 0;
      console.warn('[import] stopped:', error?.message || error);
      setResult({ importId, saved, total, rejected: tagged.rejected, duplicates: keepDuplicates ? 0 : tagged.duplicates.length, error: 'The Import Stopped Part Way Through. Check Your Connection.' });
    } finally {
      running.current = false;
      setStep('done');
      if (saved > 0) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
        if (onImported) onImported(saved);
      }
    }
  };

  const columnOptions = table ? table.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })) : [];
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={css.scrim} onClick={() => { if (!running.current) onClose(); }}>
      <div className={css.sheet} role="dialog" aria-modal="true" aria-labelledby="import-sessions-title" onClick={(e) => e.stopPropagation()} data-testid="import-sessions-sheet">
        <div className={css.sheetHead}>
          <h2 id="import-sessions-title" className={css.sheetTitle}>Import Sessions</h2>
          <button type="button" className={css.close} onClick={onClose} disabled={step === 'saving'}>Close</button>
        </div>

        {step === 'pick' && (
          <>
            <p className={css.hint}>
              Bring in sessions from a spreadsheet or another tracker. Amounts must be in US dollars (USD).
              Each row is checked by the same rules as Log Session, and you see every row before anything is saved.
            </p>
            <label className={css.label} htmlFor="import-preset">Format</label>
            <select id="import-preset" className={css.select} value={presetChoice} onChange={(e) => setPresetChoice(e.target.value)}>
              <option value="auto">Detect Automatically</option>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className={css.hint} style={{ marginTop: 6 }}>
              Generic Spreadsheet reads any table with a header row, including this app&apos;s own CSV export.
              Poker Bankroll Tracker reads its CSV export as documented by its maker.
            </span>
            <label className={css.label} htmlFor="import-file">Choose A CSV File</label>
            <input id="import-file" className={css.input} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" onChange={onFile} />
            <label className={css.label} htmlFor="import-paste">Or Paste A Table</label>
            <textarea id="import-paste" className={css.textarea} value={pasted} onChange={(e) => setPasted(e.target.value)}
              placeholder={'Date,Venue,Buy-In,Cash-Out\n2026-11-20,Aria,300,750'} />
            {pickError && <p role="alert" className={css.bad}>{pickError}</p>}
            <div className={css.footer}>
              <button type="button" className="sd-button sd-primary" disabled={!pasted.trim()} onClick={() => open(pasted)}>Read Pasted Table</button>
            </div>
          </>
        )}

        {step === 'review' && table && plan && (
          <>
            <p className={css.hint}>
              {PRESETS.find((p) => p.id === table.preset)?.label}. {table.records.length.toLocaleString('en-US')} Rows Found.
              Match each field to a column. Amounts are US dollars (USD).
            </p>
            <div className={css.mapGrid}>
              {IMPORT_FIELDS.map((field) => (
                <FieldPicker key={field.id} field={field} value={mapping[field.id]} options={columnOptions} onChange={setField} />
              ))}
              <label htmlFor="import-default-category">Category When Not Given</label>
              <select id="import-default-category" className={css.select} value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>
                {IMPORT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            {(dateOrderState === 'ambiguous' || dateOrderState === 'conflict' || order) && dateOrderState !== 'none' && (
              <div role="group" aria-label="Date Order" style={{ marginTop: 12 }}>
                <p className={needsOrder ? css.warn : css.hint} style={{ margin: '0 0 6px', fontSize: 13 }}>
                  {dateOrderState === 'conflict'
                    ? 'Some Dates Only Read Month-First And Others Only Day-First. Choose One; Rows That Do Not Fit Are Listed Below.'
                    : 'Dates Like 03/04 Could Be March 4 Or April 3. Which Does Your File Use?'}
                </p>
                <div className={css.row}>
                  <button type="button" className={`sd-button${order === 'mdy' ? ' sd-primary' : ''}`} aria-pressed={order === 'mdy'} onClick={() => setOrder('mdy')}>Month First (03/04 = Mar 4)</button>
                  <button type="button" className={`sd-button${order === 'dmy' ? ' sd-primary' : ''}`} aria-pressed={order === 'dmy'} onClick={() => setOrder('dmy')}>Day First (03/04 = Apr 3)</button>
                </div>
              </div>
            )}

            {!hasDate && <p className={css.warn}>Choose The Date Column.</p>}
            {!hasAmount && <p className={css.warn}>Choose A Buy-In, Cash-Out Or Net Result Column.</p>}
            {existingError && (
              <p role="alert" className={css.bad}>{existingError} <button type="button" className="sd-button" onClick={loadExisting}>Retry</button></p>
            )}
            {!existing && !existingError && <p role="status" className={css.hint}>Checking Your Ledger For Duplicates…</p>}

            <div className={css.stats} data-testid="import-counts">
              <div className={css.stat}><strong className={css.good}>{plan.toImport.length.toLocaleString('en-US')}</strong><span>To Import</span></div>
              <div className={css.stat}><strong className={plan.rejected.length ? css.bad : undefined}>{plan.rejected.length.toLocaleString('en-US')}</strong><span>Rejected</span></div>
              <div className={css.stat}><strong>{plan.duplicates.length.toLocaleString('en-US')}</strong><span>Duplicates</span></div>
            </div>
            {plan.duplicates.length > 0 && (
              <label className={css.check}>
                <input type="checkbox" checked={keepDuplicates} onChange={(e) => setKeepDuplicates(e.target.checked)} />
                Import Duplicates Anyway (Same Date, Category, Venue And Net As An Entry You Have)
              </label>
            )}

            {plan.toImport.length > 0 && (
              <>
                <h3 className={css.label}>Preview{plan.toImport.length > PREVIEW_ROWS ? ` (First ${PREVIEW_ROWS})` : ''}</h3>
                <ResponsiveTable
                  keyField="line"
                  caption="Rows To Import"
                  rows={plan.toImport.slice(0, PREVIEW_ROWS).map((r) => ({
                    line: r.line,
                    date: r.entry.entry_date,
                    category: IMPORT_CATEGORIES.find((c) => c.id === r.entry.category)?.label,
                    venue: r.venue || '-',
                    buyIn: formatUsd(r.entry.gross_in),
                    cashOut: formatUsd(r.entry.gross_out),
                    net: formatUsd(r.entry.gross_out - r.entry.gross_in),
                  }))}
                  columns={[
                    { key: 'line', label: 'Row' },
                    { key: 'date', label: 'Date' },
                    { key: 'category', label: 'Category' },
                    { key: 'venue', label: 'Venue' },
                    { key: 'buyIn', label: 'Buy-In', align: 'right' },
                    { key: 'cashOut', label: 'Cash-Out', align: 'right' },
                    { key: 'net', label: 'Net', align: 'right' },
                  ]}
                />
                {plan.toImport.some((r) => r.warnings.length) && (
                  <p className={css.warn} style={{ fontSize: 13 }}>
                    {plan.toImport.filter((r) => r.warnings.length).length} Rows Have Hours But No Start Time. The Hours Are Kept In Their Notes.
                  </p>
                )}
              </>
            )}

            {plan.rejected.length > 0 && <ProblemList title="Rejected Rows" rows={plan.rejected} />}

            <div className={css.footer}>
              <button type="button" className="sd-button" onClick={() => { setStep('pick'); setTable(null); }}>Back</button>
              <button type="button" className="sd-button sd-primary" disabled={!ready} onClick={runImport} data-testid="import-run">
                Import {plan.toImport.length.toLocaleString('en-US')} {plan.toImport.length === 1 ? 'Row' : 'Rows'}
              </button>
            </div>
          </>
        )}

        {step === 'saving' && (
          <div role="status" aria-live="polite">
            <p className={css.hint}>{progress.label}… {progress.done.toLocaleString('en-US')} Of {progress.total.toLocaleString('en-US')}. Keep This Screen Open.</p>
            <div className={css.progress}><div style={{ width: `${percent}%` }} /></div>
          </div>
        )}

        {step === 'done' && result && (
          <div role="status" aria-live="polite">
            <p className={result.error ? css.bad : css.good} style={{ fontSize: 15, fontWeight: 600 }}>
              {result.error
                ? `Saved ${result.saved.toLocaleString('en-US')} Of ${result.total.toLocaleString('en-US')} Rows. ${result.error}`
                : `Imported ${result.saved.toLocaleString('en-US')} ${result.saved === 1 ? 'Row' : 'Rows'}.`}
            </p>
            {result.duplicates > 0 && <p className={css.hint}>{result.duplicates.toLocaleString('en-US')} Duplicate Rows Were Skipped.</p>}
            {result.saved > 0 && (
              <p className={css.hint}>Each Imported Row&apos;s Notes Begin With [Import {result.importId}]. Settings, Undo Last Import Removes Exactly These Rows.</p>
            )}
            {result.rejected.length > 0 && <ProblemList title="Rows Not Imported" rows={result.rejected} />}
            <div className={css.footer}>
              <button type="button" className="sd-button sd-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldPicker({ field, value, options, onChange }) {
  const id = `import-map-${field.id}`;
  return (
    <>
      <label htmlFor={id}>{field.label}</label>
      <select id={id} className={css.select} value={value === undefined ? '' : String(value)} onChange={(e) => onChange(field.id, e.target.value)}>
        <option value="">Not In This File</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </>
  );
}

function ProblemList({ title, rows }) {
  return (
    <>
      <h3 className={css.label}>{title} ({rows.length.toLocaleString('en-US')})</h3>
      <ul className={css.problems} data-testid="import-rejected">
        {rows.slice(0, 500).map((r) => (
          <li key={r.line}><strong>Row {r.line}:</strong> <span className={css.bad}>{r.errors.join('; ')}</span></li>
        ))}
        {rows.length > 500 && <li>And {(rows.length - 500).toLocaleString('en-US')} More.</li>}
      </ul>
    </>
  );
}
