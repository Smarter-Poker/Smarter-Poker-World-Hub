import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { adjustBankroll } from '../../lib/bankroll/bankrollSelectors';
import { formatCents, toCents } from '../../lib/bankroll/ledgerMath.mjs';
import toast from '../../stores/toastStore';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import styles from './BankrollForms.module.css';

export default function AdjustBankrollModal({ userId, currentBalance, onComplete, onClose }) {
  const [type, setType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef(null);
  const close = () => { if (!submitting.current) onClose(); };
  useModalHistory(true, close);
  const scrim = useScrimDismiss(close);
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    node.showModal();
    return () => { node.close(); opener?.focus?.({ preventScroll: true }); };
  }, []);
  const value = Number(amount);
  const valid = value > 0 && Number.isFinite(value) && /^\d*(?:\.\d{1,2})?$/.test(amount);
  // currentBalance is the Bankroll Balance tile's figure; the preview shows
  // what that tile will read once this adjustment is saved.
  const knownBalance = Number.isFinite(Number(currentBalance)) && currentBalance !== null && currentBalance !== undefined;
  const balanceCents = knownBalance ? toCents(currentBalance) : 0;
  const afterCents = balanceCents + (valid ? (type === 'deposit' ? 1 : -1) * toCents(value) : 0);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !valid || !requireOnlineNow(toast)) return;
    submitting.current = true;
    setSaving(true);
    try {
      await adjustBankroll(userId, value, type, reason);
      toast.success(formatCents(toCents(value)) + (type === 'deposit' ? ' Added To Bankroll' : ' Withdrawn From Bankroll'));
      onComplete();
    } catch (error) {
      toast.error(error.message || 'Failed To Adjust Bankroll');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return <dialog ref={dialog} className={styles.adjust} aria-labelledby="adjust-bankroll-title"
    onCancel={event => { event.preventDefault(); close(); }} {...scrim}>
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.heading}>
        <h2 id="adjust-bankroll-title">Adjust Bankroll</h2>
        <button type="button" aria-label="Close Adjust Bankroll" className={styles.close} disabled={saving} onClick={close}><X aria-hidden="true" size={20} /></button>
      </div>
      <fieldset className={styles.toggle} disabled={saving}><legend>Transaction Type</legend>
        <button type="button" className="sd-button" aria-pressed={type === 'deposit'} onClick={() => setType('deposit')}><ArrowDownLeft size={16} aria-hidden="true" />Deposit</button>
        <button type="button" className="sd-button" aria-pressed={type === 'withdrawal'} onClick={() => setType('withdrawal')}><ArrowUpRight size={16} aria-hidden="true" />Withdraw</button>
      </fieldset>
      <label className={styles.field}>Amount
        <span className={styles.amount}><span aria-hidden="true">{type === 'deposit' ? '+' : '−'}$</span>
          <input type="text" inputMode="decimal" autoComplete="off" value={amount} placeholder="0.00"
            onChange={e => { if (/^\d*(?:\.\d{0,2})?$/.test(e.target.value)) setAmount(e.target.value); }} disabled={saving} />
        </span>
      </label>
      {knownBalance && <p className={styles.adjustPreview} aria-live="polite">
        <span>Current Balance <strong>{formatCents(balanceCents)}</strong></span>
        {valid && <span>After {type === 'deposit' ? 'Deposit' : 'Withdrawal'} <strong>{formatCents(afterCents)}</strong></span>}
      </p>}
      <label className={styles.field}>Note (Optional)<input type="text" value={reason} maxLength={200} onChange={e => setReason(e.target.value)} disabled={saving} /></label>
      <div className={styles.actions}>
        <button type="button" className="sd-button" disabled={saving} onClick={close}>Cancel</button>
        <button type="submit" className="sd-button sd-primary" disabled={saving || !valid}>{saving ? 'Processing…' : type === 'deposit' ? 'Add To Bankroll' : 'Withdraw From Bankroll'}</button>
      </div>
    </form>
  </dialog>;
}
