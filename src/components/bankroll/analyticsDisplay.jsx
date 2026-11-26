import { convertCurrency, getCurrencySymbol } from '../../lib/bankroll/currencyUtils';
import styles from './BankrollAnalytics.module.css';

export function money(cents, euro = false, signed = false, compact = false) {
  if (cents == null || !Number.isFinite(cents)) return 'N/A';
  const value = convertCurrency(cents / 100, euro);
  const options = compact
    ? { notation: 'compact', maximumFractionDigits: 2 }
    : { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 };
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return sign + getCurrencySymbol(euro) + Math.abs(value).toLocaleString('en-US', options);
}

export function periodDate(date, monthly = false, full = false) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: full ? 'long' : 'short',
    day: monthly ? undefined : 'numeric',
    year: monthly || full ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

export function tone(value) {
  if (value == null || value === 0) return styles.neutral;
  return value > 0 ? styles.gain : styles.loss;
}

export function Measure({ label, children, value }) {
  return (
    <div className={styles.measure}>
      <dt>{label}</dt>
      <dd className={tone(value)}>{children}</dd>
    </div>
  );
}
