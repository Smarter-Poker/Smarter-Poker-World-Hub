// Fixtures and network mocks for the marketplace render harness.
// The data below is validated against the repo's own normalizers by
// validate-fixtures.mjs (and __tests__/render-marketplace-fixtures.test.mjs),
// so a fixture that drifts from the server contract fails before any render.
// prep() at the bottom installs the auth seed and every route mock on a
// Playwright browser context.
export const USER_ID = '11111111-2222-4333-8444-555555555555';
export const CLUB_ID = '7c1e0a52-3b9d-4f61-8a2e-9d4b6c8f0a11';
export const BALANCE = 12500;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.now() / 1000) + 6 * 3600;
// JWT-shaped so getFreshAccessToken() accepts it without a refresh round-trip.
export const ACCESS_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, exp: EXP, role: 'authenticated', aud: 'authenticated' })}.c2ln`;

export const USER = { id: USER_ID, email: 'dan@example.com', user_metadata: { username: 'DanB' }, app_metadata: { provider: 'email' }, aud: 'authenticated', role: 'authenticated', created_at: '2025-01-02T00:00:00Z' };
export const AUTH = { access_token: ACCESS_TOKEN, refresh_token: 'render-refresh', token_type: 'bearer', expires_in: 6 * 3600, expires_at: EXP, user: USER };

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const uuid = (n) => `aa${String(n).padStart(6, '0')}-1111-4222-8333-${String(n).padStart(12, '0')}`;

// A server-shaped card quote consistent with normalizeVerifiedClubShopItem's arithmetic.
function quote(price, balance) {
  const unit = 500, cents = 500;
  const shortfall = Math.max(0, price - balance);
  const quantity = Math.max(1, Math.ceil(shortfall / unit));
  const diamondsPurchased = unit * quantity;
  return {
    packageId: 'starter', quantity, unitPriceCents: cents, baseDiamonds: unit, bonusDiamonds: 0,
    cardCharge: (cents * quantity) / 100, cardChargeCents: cents * quantity, diamondsPurchased,
    diamondPurchaseBalance: Math.max(0, balance - price), diamondShortfall: shortfall,
    cardPurchaseBalance: balance + diamondsPurchased - price,
  };
}

function item(n, { name, description, category, qty, price, sale = null, available = true, reason = null, card = true, bought = 0, mine = 0, image = null }) {
  const effective = sale ?? price;
  const isThrow = category === 'Throwables';
  return {
    id: uuid(n), club_id: CLUB_ID, name, description, category,
    item_type: isThrow ? 'throwable' : 'time_bank',
    grant_spec: { type: isThrow ? 'throwable' : 'time_bank', qty },
    stackable: true, image_url: image, price, list_price: price, effective_price: effective,
    sale_price: sale, on_sale: effective < price, sale_ends_at: sale != null ? new Date(Date.now() + 3 * 86400e3).toISOString() : null,
    available, availability_reason: available ? null : reason,
    card_checkout_available: card, card_quote: card ? quote(effective, BALANCE) : null,
    card_checkout_reason: card ? null : 'Card Checkout Is Paused For This Item.',
    purchase_count: bought, my_purchase_count: mine, is_active: true,
    stock_limit: null, created_at: ago(24 * 20),
  };
}

export const CLUB_ITEMS = [
  item(1, { name: 'Time Bank Boost (5)', description: 'Five Extra 30-Second Time Banks For Tough Spots.', category: 'Time Banks', qty: 5, price: 250, bought: 142, mine: 2 }),
  item(2, { name: 'Time Bank Stack (20)', description: 'Twenty Time Banks. Best Value For Grinders.', category: 'Time Banks', qty: 20, price: 900, sale: 650, bought: 87, mine: 1 }),
  item(3, { name: 'All Throwables Pack (10)', description: 'Ten Throwables: Tomatoes, Roses, Chips And More.', category: 'Throwables', qty: 10, price: 400, bought: 233, mine: 3 }),
  item(4, { name: 'Time Bank Vault (100)', description: 'One Hundred Time Banks For Marathon Sessions.', category: 'Time Banks', qty: 100, price: 15000, card: true, bought: 12 }),
  item(5, { name: 'Time Bank Single (1)', description: 'A Single Emergency Time Bank.', category: 'Time Banks', qty: 1, price: 60, card: false, bought: 410 }),
  item(6, { name: 'Time Bank Weekly (10)', description: 'Ten Time Banks, Limited Weekly Drop.', category: 'Time Banks', qty: 10, price: 500, available: false, reason: 'Weekly Limit Reached', card: false, bought: 58, mine: 1 }),
];

export const CLUB_PURCHASES = [
  { id: uuid(101), item_id: uuid(1), price_paid: 250, currency: 'diamonds', created_at: ago(5), refunded_at: null, item_name: 'Time Bank Boost (5)', item_category: 'Time Banks' },
  { id: uuid(102), item_id: uuid(3), price_paid: 400, currency: 'diamonds', created_at: ago(30), refunded_at: null, item_name: 'All Throwables Pack (10)', item_category: 'Throwables' },
  { id: uuid(103), item_id: uuid(2), price_paid: 650, currency: 'diamonds', created_at: ago(54), refunded_at: null, item_name: 'Time Bank Stack (20)', item_category: 'Time Banks' },
  { id: uuid(104), item_id: uuid(6), price_paid: 500, currency: 'diamonds', created_at: ago(140), refunded_at: ago(120), item_name: 'Time Bank Weekly (10)', item_category: 'Time Banks' },
];

export const marketplaceItems = (role = 'player') => ({
  success: true, accountId: USER_ID, clubId: CLUB_ID, clubName: 'Diamond Ridge Poker Club', role,
  balance: BALANCE, items: CLUB_ITEMS, purchases: CLUB_PURCHASES,
});

export const MANAGE_SHOP = {
  success: true,
  maximumCardFundedPrice: 50000,
  items: CLUB_ITEMS.map((i, k) => ({ ...i, is_active: k !== 5, purchase_count: i.purchase_count, refunded_purchase_count: k === 5 ? 3 : k === 1 ? 1 : 0, net_purchase_count: i.purchase_count - (k === 5 ? 3 : k === 1 ? 1 : 0), revenue: i.purchase_count * i.effective_price })),
  report: {
    complete: true, processedRows: 942, totalRows: 942, totalRowsExact: true,
    diamondTotals: { sales: 942, netSales: 938, gross: 214300, refunded: 2150, net: 212150 },
    legacyChipTotals: { sales: 0, netSales: 0, net: 0 },
  },
};

const series = Array.from({ length: 30 }, (_, d) => {
  const date = new Date(Date.now() - (29 - d) * 86400e3).toISOString().slice(0, 10);
  const sales = 8 + ((d * 7) % 13);
  return { date, sales, netSales: sales, revenue: sales * 310, netRevenue: sales * 310 - (d % 9 === 0 ? 400 : 0) };
});
export const SHOP_ANALYTICS = {
  success: true, days: 30, truncated: false,
  totals: { grossSales: 420, netSales: 417, grossRevenue: 130200, refundedAmount: 1250, netRevenue: 128950, uniqueBuyers: 96, averageSale: 309 },
  series,
  topItems: [
    { itemId: uuid(3), name: 'All Throwables Pack (10)', netSales: 160, netRevenue: 64000 },
    { itemId: uuid(2), name: 'Time Bank Stack (20)', netSales: 61, netRevenue: 39650 },
    { itemId: uuid(1), name: 'Time Bank Boost (5)', netSales: 98, netRevenue: 24500 },
  ],
  topBuyers: [
    { userId: uuid(201), name: 'RiverRat', netPurchases: 22, netSpent: 9800 },
    { userId: uuid(202), name: 'AcesUp_Kim', netPurchases: 17, netSpent: 7300 },
    { userId: uuid(203), name: 'NitNoMore', netPurchases: 11, netSpent: 4100 },
  ],
};
export const SHOP_PURCHASES = {
  success: true, total: 4,
  purchases: [
    { id: uuid(301), buyerName: 'RiverRat', itemName: 'All Throwables Pack (10)', pricePaid: 400, currency: 'diamonds', createdAt: ago(2), status: 'owned', refundable: true },
    { id: uuid(302), buyerName: 'AcesUp_Kim', itemName: 'Time Bank Stack (20)', pricePaid: 650, currency: 'diamonds', createdAt: ago(7), status: 'owned', refundable: true },
    { id: uuid(303), buyerName: 'NitNoMore', itemName: 'Time Bank Boost (5)', pricePaid: 250, currency: 'diamonds', createdAt: ago(26), status: 'consumed', refundable: false },
    { id: uuid(304), buyerName: 'FoldEquity', itemName: 'Time Bank Weekly (10)', pricePaid: 500, currency: 'diamonds', createdAt: ago(80), status: 'refunded', refundable: false },
  ],
};

export const CART_ITEMS = [
  { id: 'hoodie-neural-l', productId: 'hoodie-neural', catalogId: 'hoodie-neural', variantId: 'hoodie-neural-l', name: 'Diamond Altitude Hoodie', variantLabel: 'Black / L', price: 60, priceDiamonds: 6000, quantity: 1, size: 'L', type: 'merch', image: '/images/merch/neural-steel/mockups/diamond-altitude-hoodie.webp' },
  { id: 'hat-diamond', productId: 'hat-diamond', catalogId: 'hat-diamond', name: 'Neural Steel Diamond Hat', price: 30, priceDiamonds: 3000, quantity: 2, type: 'merch', image: '/images/merch/neural-steel/mockups/diamond-dad-hat.webp' },
];

const v = (id, size, price, stock = 25) => ({ id, size, color: 'Black', price_usd: price, price_diamonds: Math.ceil(price * 100), stock, in_stock: stock > 0, fulfillment_ready: true });
const merch = (id, name, category, price, variants = null, extra = {}) => ({
  id, name, description: `${name} From The Smarter.Poker Neural Steel Collection.`, category,
  price_usd: price, price_diamonds: Math.ceil(price * 100), in_stock: true, stock: 40,
  has_variants: Boolean(variants), variants: variants || [], fulfillment_ready: true,
  fulfillment_provider: 'printful', made_to_order: true, requires_shipping: true, ...extra,
});
export const MERCH_CATALOG = {
  success: true,
  data: {
    currency: 'usd', catalog_available: true,
    items: [
      merch('hoodie-neural', 'Diamond Altitude Hoodie', 'apparel', 60, [v('hoodie-neural-s', 'S', 60), v('hoodie-neural-m', 'M', 60), v('hoodie-neural-l', 'L', 60), v('hoodie-neural-xl', 'XL', 64, 0)]),
      merch('tshirt-gto', 'Royal Circuit Tee', 'apparel', 32, [v('tshirt-gto-m', 'M', 32), v('tshirt-gto-l', 'L', 32)]),
      merch('hat-diamond', 'Neural Steel Diamond Hat', 'headwear', 30),
      merch('card-protector-gold', 'Gold Card Protector', 'tabletop', 25, null, { fulfillment_provider: 'inhouse', made_to_order: false }),
      merch('deck-premium', 'Premium Playing Cards', 'tabletop', 15, null, { fulfillment_provider: 'inhouse', made_to_order: false }),
      merch('chip-set-500', '500 Piece Chip Set', 'tabletop', 199.99, null, { fulfillment_provider: 'inhouse', made_to_order: false }),
    ],
  },
};
MERCH_CATALOG.data.count = MERCH_CATALOG.data.items.length;

export const WISHLIST = [
  { id: uuid(401), product_id: 'hoodie-neural', product_type: 'merch', product_name: 'Diamond Altitude Hoodie', product_price: 60, created_at: ago(3) },
  { id: uuid(402), product_id: 'chip-set-500', product_type: 'merch', product_name: '500 Piece Chip Set', product_price: 199.99, created_at: ago(50) },
  { id: uuid(403), product_id: 'deck-premium', product_type: 'merch', product_name: 'Premium Playing Cards', product_price: 15, created_at: ago(200) },
];

export const ORDER_ID = 'b7f3c2d1-5e4a-4b6c-9d8e-0f1a2b3c4d5e';
export const ORDERS = [
  {
    key: `merch-${ORDER_ID}`, id: ORDER_ID, source: 'merchandise', title: 'Merchandise Order', created_at: ago(30),
    status: 'shipped', currency: 'usd', amount: 12000, refundAmount: 0, netAmount: 12000, refundedAt: null, recordType: 'settlement',
    trackingNumber: '1Z999AA10123456784', trackingUrl: 'https://www.ups.com/track?tracknum=1Z999AA10123456784', carrier: 'ups',
    shippedAt: ago(8), deliveredAt: null, fulfillmentStatus: 'in_transit',
    items: [
      { name: 'Diamond Altitude Hoodie', option: 'Black / L', quantity: 1, amount: 6000, currency: 'usd' },
      { name: 'Neural Steel Diamond Hat', option: 'Black', quantity: 2, amount: 6000, currency: 'usd' },
    ],
  },
  {
    key: 'diamond-c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f', id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f', source: 'diamonds', title: 'Standard Stack Diamond Package', created_at: ago(72),
    status: 'completed', currency: 'usd', amount: 5000, refundAmount: 0, refundedDiamonds: 0, netAmount: 5000, category: 'diamonds', recordType: 'settlement', fundedDiamonds: 5000,
    clubItemPrice: null, redemptionStatus: null, redemptionError: null,
    items: [{ name: 'Standard Stack (5,000 Diamonds)', option: null, quantity: 1, amount: 5000, currency: 'usd' }],
  },
  {
    key: `club-${uuid(102)}`, id: uuid(102), source: 'club', category: 'club', title: 'Club Shop Purchase', created_at: ago(96),
    status: 'completed', currency: 'diamonds', amount: 400, refundAmount: 0, netAmount: 400, refundedAt: null, recordType: 'settlement',
    items: [{ name: 'All Throwables Pack (10)', option: 'Throwables', quantity: 1, amount: 400, currency: 'diamonds' }],
  },
  {
    key: 'merch-d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70', id: 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70', source: 'merchandise', title: 'Merchandise Order', created_at: ago(24 * 12),
    status: 'delivered', currency: 'diamonds', amount: 1500, refundAmount: 0, netAmount: 1500, refundedAt: null, recordType: 'settlement',
    trackingNumber: '9400111899223856789012', trackingUrl: null, carrier: 'usps', shippedAt: ago(24 * 10), deliveredAt: ago(24 * 7), fulfillmentStatus: 'delivered',
    items: [{ name: 'Premium Playing Cards', option: null, quantity: 1, amount: 1500, currency: 'diamonds' }],
  },
];
export const ORDER_LEDGER = { success: true, data: { orders: ORDERS, hasMore: false, nextCursor: null, partial: false, unavailableSources: [] } };

export const REWARDS_PROGRESS = { success: true, earnedToday: 340, dailyCap: 1000, dailyRemaining: 660, earnedThisMonth: 8450, monthlyCap: 25000, monthlyRemaining: 16550, loginStreak: 12, multiplier: 1.5, isVip: false, partial: false, timezone: 'America/Chicago' };
export const HEADER_STATS = { success: true, profile: { id: USER_ID, username: 'DanB', diamonds: BALANCE, xp: 4200, level: 14, avatar_url: null, vip_status: false } };
export const DIAMOND_TX = { success: true, balance: BALANCE, transactions: [
  { id: uuid(501), amount: 5000, type: 'purchase', transaction_type: 'purchase', description: 'Standard Stack', created_at: ago(72), balance_after: BALANCE },
] };

// Diamond package catalog served by /api/club-arena/store-catalog.
const PKG = (id, name, diamonds, bonus, price, popular = false) => ({ id, name, diamonds, bonus, price, priceCents: Math.round(price * 100), popular, hasDiscount: bonus > 0, cardCheckoutReady: true, diamondCheckoutReady: false });
export const CATALOG = {
  success: true, diamondCatalogSource: 'database', warnings: [],
  diamondPackages: [
    PKG('starter', 'Starter Stack', 500, 0, 5), PKG('small', 'Small Stack', 1000, 0, 10),
    PKG('medium', 'Medium Stack', 2500, 0, 25), PKG('standard', 'Standard Stack', 5000, 0, 50, true),
    PKG('large', 'Large Stack', 10000, 500, 100), PKG('value', 'Value Stack', 25000, 1250, 250),
    PKG('premium', 'Premium Stack', 50000, 2500, 500), PKG('whale', 'Whale Stack', 100000, 5000, 1000),
  ],
  vipPlans: [],
};

export const EMPTY_ORDER_LEDGER = { success: true, data: { orders: [], hasMore: false, nextCursor: null, partial: false, unavailableSources: [] } };

// PostgREST-shaped reply: single object for .single()/.maybeSingle(), else an array.
function rest(r, rows) {
  const accept = r.request().headers()['accept'] || '';
  if (accept.includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
  return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
}

/**
 * Install the auth seed and all route mocks on a Playwright context.
 * @param ctx       Playwright BrowserContext
 * @param auth      seed a signed-in session (false renders signed-out)
 * @param role      club role for the club shop ('player' | 'owner' | ...)
 * @param populated true: orders, transactions, wishlist populated; false: empty
 *                  (the plain route renders of shoot.mjs)
 * @param supabase  Supabase origin the dev build calls (mocked entirely)
 */
const FULFILLMENT_ADDRESS = { name: 'Dan Fisher', address1: '1200 Main Street', address2: 'Suite 400', city: 'Dallas', state_code: 'TX', zip: '75201', country_code: 'US' };
export const FULFILLMENT_ORDERS = [
  { id: 'b7f3c2d1-5e4a-4c11-9f20-0a1b2c3d4e5f', status: 'paid', payment_method: 'card', total_usd: 60, items: [{ name: 'Diamond Altitude Hoodie', quantity: 1 }], shipping_address: FULFILLMENT_ADDRESS, metadata: { fulfillment_mode: 'manual', fulfillment_status: 'paid' }, fulfillment_version: 1 },
  { id: 'c81e7a90-2f3b-4d55-8a66-1b2c3d4e5f60', status: 'processing', payment_method: 'diamonds', diamonds_spent: 6000, items: [{ name: 'Neural Steel Diamond Hat', quantity: 2 }], shipping_address: FULFILLMENT_ADDRESS, metadata: { fulfillment_mode: 'manual', fulfillment_status: 'processing' }, fulfillment_version: 2 },
  { id: 'd92f8b01-3a4c-4e66-9b77-2c3d4e5f6071', status: 'shipped', payment_method: 'card', total_usd: 34.5, carrier: 'usps', tracking_number: '9400 1000 0000 0000 0000 00', items: [{ name: 'Smarter Poker Card Protector', quantity: 1 }], shipping_address: FULFILLMENT_ADDRESS, metadata: { fulfillment_mode: 'manual', fulfillment_status: 'shipped' }, fulfillment_version: 3 },
  { id: 'e0a19c12-4b5d-4f77-8c88-3d4e5f607182', status: 'paid', payment_method: 'card', total_usd: 90, items: [{ name: 'Diamond Altitude Hoodie', quantity: 1 }, { name: 'Neural Steel Diamond Hat', quantity: 1 }], shipping_address: FULFILLMENT_ADDRESS, metadata: { needs_review: true, reason: 'Provider Order State Requires Reconciliation.', printful_order_id: '88231457' }, fulfillment_version: 1 },
];
export const OPERATIONS_SUMMARY = { success: true, data: {
  readiness: { ready: true, fulfillmentMode: 'Manual' },
  summary: { orders: { created: 42, awaitingAttention: 3, providerReview: 1 }, lifetimeVip: { monthlyDiamondsIssued: 18000 }, funnel: { store_checkout_complete: 37 } },
} };

export async function prep(ctx, { auth = true, role = 'player', populated = true, supabase = 'http://127.0.0.1:54399' } = {}) {
  if (auth) {
    await ctx.addInitScript(([a, cart, uid, bal]) => {
      try {
        localStorage.setItem('smarter-poker-auth', JSON.stringify(a));
        sessionStorage.setItem('sp_auth_confirmed', '1');
        localStorage.setItem('sp-cached-header-user', JSON.stringify({ id: uid, userId: uid, username: 'DanB', diamonds: bal, _ts: Date.now() }));
        if (!localStorage.getItem('smarter-poker-cart')) localStorage.setItem('smarter-poker-cart', JSON.stringify({ version: 3, state: { ownerId: uid, items: cart, syncPending: false } }));
      } catch {}
    }, [AUTH, CART_ITEMS, USER_ID, BALANCE]);
  }
  const J = (json) => (r) => r.fulfill({ json });
  await ctx.route('**/api/club-arena/store-catalog**', J(CATALOG));
  await ctx.route('**/api/club-arena/marketplace-items**', (r) => auth ? r.fulfill({ json: marketplaceItems(role) }) : r.fulfill({ status: 401, json: { success: false, error: 'Authorization required' } }));
  await ctx.route('**/api/club-arena/manage-shop**', J(MANAGE_SHOP));
  await ctx.route('**/api/club-arena/shop-analytics**', J(SHOP_ANALYTICS));
  await ctx.route('**/api/club-arena/shop-purchases**', J(SHOP_PURCHASES));
  await ctx.route('**/api/store/order-ledger**', (r) => {
    if (!populated) return r.fulfill({ json: EMPTY_ORDER_LEDGER });
    const u = new URL(r.request().url());
    if (u.searchParams.get('id')) {
      const order = ORDERS.find((o) => o.id === u.searchParams.get('id') && o.source === u.searchParams.get('source'));
      return order ? r.fulfill({ json: { success: true, data: { order } } }) : r.fulfill({ status: 404, json: { success: false, error: 'Order not found' } });
    }
    return r.fulfill({ json: ORDER_LEDGER });
  });
  await ctx.route('**/api/store/diamond-transactions**', J(populated ? DIAMOND_TX : { success: true, balance: BALANCE, transactions: [] }));
  await ctx.route('**/api/store/merch-catalog**', J(MERCH_CATALOG));
  await ctx.route('**/api/store/vip-membership-status**', J({ success: true, active: false }));
  await ctx.route('**/api/rewards/progress**', J(REWARDS_PROGRESS));
  // Operator fulfillment console (/hub/merch-store/fulfillment): a populated
  // queue (manual card order, manual diamond order in processing, a shipped
  // order, a quarantined provider order) and a ready operations summary.
  await ctx.route('**/api/store/fulfillment-operations**', (r) => r.request().method() === 'GET'
    ? r.fulfill({ json: { success: true, data: { orders: FULFILLMENT_ORDERS, nextCursor: null } } })
    : r.fulfill({ json: { success: true, data: {} } }));
  await ctx.route('**/api/store/operations-summary**', J(OPERATIONS_SUMMARY));
  await ctx.route('**/api/user/get-header-stats**', (r) => auth ? r.fulfill({ json: HEADER_STATS }) : r.fulfill({ status: 401, json: { success: false } }));
  await ctx.route(`${supabase}/**`, (r) => {
    const u = r.request().url();
    if (u.includes('/auth/v1/user')) return auth ? r.fulfill({ json: USER }) : r.fulfill({ status: 401, json: { message: 'no session' } });
    if (u.includes('/auth/v1/')) return auth ? r.fulfill({ json: AUTH }) : r.fulfill({ status: 400, json: { error: 'invalid_grant' } });
    if (u.includes('/rest/v1/profiles')) return rest(r, [{ id: USER_ID, username: 'DanB', diamonds: BALANCE, xp: 4200, vip_status: false }]);
    if (u.includes('/rest/v1/user_preferences')) return rest(r, [{ user_id: USER_ID, preferences: { diamond_cart: CART_ITEMS } }]);
    if (u.includes('/rest/v1/wishlists')) return rest(r, populated ? WISHLIST : []);
    return rest(r, []);
  });
}
