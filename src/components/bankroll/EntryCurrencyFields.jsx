/**
 * ENTRY CURRENCY FIELDS
 *
 * The currency picker and exchange-rate field on the session form. US dollars
 * are the default and need no rate. Euros start at the European Central Bank
 * reference rate the Bankroll Manager already uses for Display EUR; every
 * other currency asks the player for the rate they were actually given. The
 * line under the field always says where the rate came from and its date.
 *
 * What the player types is stored as typed (original_gross_in/out); the
 * ledger's gross_in/gross_out are the US dollar amounts at this rate, so every
 * total stays in US dollars. See src/lib/bankroll/entryCurrency.mjs.
 */

import {
  ENTRY_CURRENCIES,
  chooseCurrency,
  isForeignCurrency,
  rateSourceNote,
  typeRate,
} from '../../lib/bankroll/entryCurrency.mjs';

export default function EntryCurrencyFields({ value, onChange, entryDay, editEntry = null, idPrefix = 'entry' }) {
  const foreign = isForeignCurrency(value.currency);

  return (
    <div style={styles.wrap} data-testid="entry-currency">
      <div style={foreign ? styles.row : styles.rowSingle}>
        <div style={styles.group}>
          <label htmlFor={`${idPrefix}-currency`} style={styles.label}>Currency</label>
          <select
            id={`${idPrefix}-currency`}
            value={value.currency}
            onChange={(e) => onChange(chooseCurrency(value, e.target.value, editEntry))}
            style={styles.select}
          >
            {ENTRY_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
            ))}
          </select>
        </div>
        {foreign && (
          <div style={styles.group}>
            <label htmlFor={`${idPrefix}-rate`} style={styles.label}>USD Per 1 {value.currency}</label>
            <input
              id={`${idPrefix}-rate`}
              type="text"
              inputMode="decimal"
              value={value.rate}
              onChange={(e) => onChange(typeRate(value, e.target.value.replace(',', '.')))}
              placeholder="e.g. 1.0957"
              aria-describedby={`${idPrefix}-rate-note`}
              style={styles.input}
              required
            />
          </div>
        )}
      </div>
      {foreign && (
        <p id={`${idPrefix}-rate-note`} style={styles.note} data-testid="entry-rate-note">
          {rateSourceNote({ code: value.currency, source: value.source, day: entryDay })}
          {' '}Type Amounts In {value.currency}; They Are Saved In US Dollars At This Rate, And All Totals Stay In US Dollars.
        </p>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  rowSingle: { display: 'grid', gridTemplateColumns: '1fr', gap: 12 },
  group: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 14, fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)' },
  select: {
    padding: '12px 14px', background: 'rgba(0, 0, 0, 0.3)', border: '2px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8, color: '#fff', fontSize: 16, minHeight: 44, outline: 'none', cursor: 'pointer',
    width: '100%', boxSizing: 'border-box',
  },
  input: {
    padding: '12px 14px', background: 'rgba(0, 0, 0, 0.3)', border: '2px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8, color: '#fff', fontSize: 16, minHeight: 44, outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  note: { fontSize: 12, lineHeight: 1.45, color: '#a5b7cc', margin: 0 },
};
