/**
 * Download Tax Packet (PDF), Tax Reports (2026-11-28). One PDF for a chosen
 * tax year from /api/bankroll/tax-packet: summary, quarters, the W-2Gs filed
 * in the Vault, expenses by type, mileage at the IRS rate on each date and
 * the session log. US dollars; not tax advice.
 */
import { useRef, useState } from 'react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import { requestErrorMessage } from '../../lib/bankroll/apiGuard.mjs';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import toast from '../../stores/toastStore';
import { saveFile } from '../../lib/bankroll/saveFile.mjs';
import css from './BankrollDataTools.module.css';

export default function TaxPacketDownload() {
  const today = localDay();
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 5 }, (_, i) => thisYear - i);
  const [year, setYear] = useState(thisYear);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const working = useRef(false);

  const download = async () => {
    if (working.current || !requireOnlineNow(toast)) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error('Please Sign In To Download Your Tax Packet');
      const res = await fetch(`/api/bankroll/tax-packet?year=${year}&today=${today}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(requestErrorMessage(res.status, 'Could Not Build The Tax Packet', { signIn: 'Please Sign In To Download Your Tax Packet' }));
      if (!String(res.headers.get('content-type') || '').includes('application/pdf')) throw new Error('Could Not Build The Tax Packet');
      saveFile(await res.blob(), `tax-packet-${year}.pdf`);
      toast.success(`${year} Tax Packet Downloaded`);
    } catch (e) {
      setError(e?.message || 'Could Not Build The Tax Packet');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return (
    <section className={css.card} aria-labelledby="tax-packet-title" data-testid="tax-packet">
      <h3 id="tax-packet-title" className={css.cardTitle}>Tax Packet</h3>
      <span className={css.hint}>
        One PDF For Your Preparer: Summary, W-2Gs From Your Vault With Image Links, Expenses By Type, Mileage At The IRS Rate For Each Date, And Every Session. All US Dollars. Not Tax Advice.
      </span>
      <div className={css.row}>
        <label htmlFor="tax-packet-year" className={css.hint} style={{ margin: 0 }}>Tax Year</label>
        <select id="tax-packet-year" className={css.select} style={{ width: 'auto', flex: '1 1 100px' }} value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={busy}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="button" className="sd-button sd-primary" style={{ minHeight: 44, flex: '2 1 180px' }} onClick={download} disabled={busy}>
          {busy ? 'Building…' : 'Download Tax Packet (PDF)'}
        </button>
      </div>
      {error && <p role="alert" className={css.bad} style={{ margin: '8px 0 0', fontSize: 13 }}>{error}</p>}
    </section>
  );
}
