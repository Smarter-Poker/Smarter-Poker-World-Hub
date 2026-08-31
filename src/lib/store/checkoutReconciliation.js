const MAX_RECONCILIATION_LINES = 50;

function safeCartQuantity(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 10) : 1;
}

function safePurchasedQuantity(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 10 ? quantity : 0;
}

function normalizedIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function cartLineIdentity(item) {
  if (item?.type === 'diamonds') {
    const packageId = normalizedIdentity(item.packageId || item.id).replace(/^diamond-/, '');
    return packageId ? `diamonds:${packageId}` : null;
  }

  if (item?.type === 'vip') return null;
  const productId = normalizedIdentity(item?.catalogId || String(item?.id || '').split('::')[0]);
  if (!productId) return null;
  const variantId = normalizedIdentity(item?.variantId || item?.variant_id || 'standard');
  return `merchandise:${productId}:${variantId}`;
}

function purchasedLineIdentity(line) {
  const kind = line?.kind;
  if (!['diamonds', 'merchandise'].includes(kind)) return null;
  const itemId = normalizedIdentity(line?.id);
  if (!itemId) return null;
  if (kind === 'diamonds') return `diamonds:${itemId.replace(/^diamond-/, '')}`;
  const variantId = normalizedIdentity(line?.variantId || 'standard');
  return `merchandise:${itemId}:${variantId}`;
}

/**
 * Remove only the quantities proven by an owner-scoped checkout receipt.
 * Lines added or increased after checkout remain in the cart.
 */
export function reconcilePurchasedCart(cartItems, purchasedLines) {
  const current = Array.isArray(cartItems) ? cartItems : [];
  const remainingByIdentity = new Map();

  (Array.isArray(purchasedLines) ? purchasedLines : [])
    .slice(0, MAX_RECONCILIATION_LINES)
    .forEach((line) => {
      const identity = purchasedLineIdentity(line);
      const quantity = safePurchasedQuantity(line?.quantity);
      if (!identity || quantity === 0) return;
      remainingByIdentity.set(
        identity,
        (remainingByIdentity.get(identity) || 0) + quantity
      );
    });

  if (remainingByIdentity.size === 0) return current;
  let changed = false;
  const reconciled = [];

  current.forEach((item) => {
    const identity = cartLineIdentity(item);
    const purchasedQuantity = identity ? remainingByIdentity.get(identity) || 0 : 0;
    if (purchasedQuantity <= 0) {
      reconciled.push(item);
      return;
    }

    const currentQuantity = safeCartQuantity(item?.quantity);
    const removedQuantity = Math.min(currentQuantity, purchasedQuantity);
    const nextQuantity = currentQuantity - removedQuantity;
    remainingByIdentity.set(identity, purchasedQuantity - removedQuantity);
    changed = true;
    if (nextQuantity > 0) reconciled.push({ ...item, quantity: nextQuantity });
  });

  return changed ? reconciled : current;
}

export function checkoutReceiptHref(receipt) {
  const source = normalizedIdentity(receipt?.orderSource);
  const orderId = String(receipt?.orderId || '').trim();
  if (!['diamonds', 'merchandise', 'vip'].includes(source) || !orderId) return null;
  return `/hub/diamond-store/orders/${encodeURIComponent(orderId)}?source=${encodeURIComponent(source)}`;
}

export const checkoutReconciliationLimits = Object.freeze({
  maxLines: MAX_RECONCILIATION_LINES,
});
