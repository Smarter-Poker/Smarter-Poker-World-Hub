/**
 * The one USD display formatter for store pages (cart, orders, receipts,
 * checkout status, wishlist, club shop card charges).
 *
 * - Whole amounts show with no decimals: $20, $1,250.
 * - Fractional amounts stay exact to the cent: $4.99, $1,234.50.
 * - Thousands separators always; negatives read -$5.
 * - Never spells cents out ("And 99 Cents"); that is formatStoreUsd's job on
 *   offer copy and it is left as it is.
 * - Anything that is not a finite number shows as $0, matching the cart.
 */
function toCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function formatCentsInternal(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100).toLocaleString('en-US');
  const rest = abs % 100;
  return rest === 0 ? `${sign}$${dollars}` : `${sign}$${dollars}.${String(rest).padStart(2, '0')}`;
}

/** Dollars in, "$1,234" or "$1,234.50" out. */
export function formatUsd(value) {
  return formatCentsInternal(toCents(value));
}

/** Integer cents in (Stripe/order rows), same display as formatUsd. */
export function formatUsdCents(cents) {
  const amount = Number(cents);
  return formatCentsInternal(Number.isFinite(amount) ? Math.round(amount) : 0);
}
