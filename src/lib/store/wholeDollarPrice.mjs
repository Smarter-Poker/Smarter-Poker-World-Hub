/** Marketplace sale prices are whole USD, rounded upward before checkout. */
export function roundSalePriceUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Invalid sale price');
  return Math.ceil(amount);
}

/** For already-priced offers. Historical fractional amounts remain exact in cents. */
export function formatStoreUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new TypeError('Invalid USD amount');
  if (Number.isInteger(amount)) return amount.toLocaleString('en-US');
  const cents = Math.round(amount * 100);
  return `${Math.trunc(cents / 100).toLocaleString('en-US')} And ${Math.abs(cents % 100)} Cents`;
}
