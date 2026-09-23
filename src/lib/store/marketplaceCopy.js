const BANNED_LONG_BARS = /\s*[\u2013\u2014]\s*/gu;
const WORD_TOKEN = /[A-Za-z]+(?:\.[A-Za-z]+)*(?:['’][A-Za-z]+)?/gu;
const MARKETPLACE_ACRONYMS = new Map([
  ['ai', 'AI'],
  ['api', 'API'],
  ['bbj', 'BBJ'],
  ['dhl', 'DHL'],
  ['ev', 'EV'],
  ['faq', 'FAQ'],
  ['fedex', 'FedEx'],
  ['gto', 'GTO'],
  ['gtd', 'GTD'],
  ['gps', 'GPS'],
  ['http', 'HTTP'],
  ['https', 'HTTPS'],
  ['id', 'ID'],
  ['ios', 'iOS'],
  ['kyc', 'KYC'],
  ['mtt', 'MTT'],
  ['nlhe', 'NLHE'],
  ['nlh', 'NLH'],
  ['ofc', 'OFC'],
  ['otp', 'OTP'],
  ['pko', 'PKO'],
  ['plo', 'PLO'],
  ['pod', 'POD'],
  ['pwa', 'PWA'],
  ['pvp', 'PvP'],
  ['roi', 'ROI'],
  ['sku', 'SKU'],
  ['sng', 'SNG'],
  ['sms', 'SMS'],
  ['smarter.poker', 'Smarter.Poker'],
  ['tos', 'TOS'],
  ['ups', 'UPS'],
  ['url', 'URL'],
  ['utc', 'UTC'],
  ['uid', 'UID'],
  ['ui', 'UI'],
  ['usps', 'USPS'],
  ['usd', 'USD'],
  ['ux', 'UX'],
  ['vip', 'VIP'],
  ['wpt', 'WPT'],
  ['wsop', 'WSOP'],
  ['xl', 'XL'],
  ['xxl', 'XXL'],
]);
const STRUCTURED_COPY_FIELDS = new Set(['category', 'description', 'headline', 'name']);
const MARKETPLACE_FULFILLMENT_LABELS = new Map([
  ['printful_provider_state_persistence_failed', 'Printful Provider State Could Not Be Saved'],
  ['printful_submission_state_unknown', 'Printful Submission Status Requires Review'],
]);
const MARKETPLACE_CARRIER_LABELS = new Map([
  ['usps', 'USPS'],
  ['ups', 'UPS'],
  ['fedex', 'FedEx'],
  ['dhl', 'DHL eCommerce'],
  ['dhl ecommerce', 'DHL eCommerce'],
  ['dhl_ecommerce', 'DHL eCommerce'],
  ['dhl-ecommerce', 'DHL eCommerce'],
]);
const PROTECTED_MACHINE_TOKEN = new RegExp(
  [
    'https?:\\/\\/[^\\s<>"\']+',
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
    '@[A-Za-z0-9_]{1,32}',
    '\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b',
    '\\b(?=[A-Z0-9_-]{3,}\\b)(?=[A-Z0-9_-]*[A-Z])(?=[A-Z0-9_-]*\\d)[A-Z0-9][A-Z0-9_-]*\\b',
    '\\b(?=[A-Za-z0-9_-]{8,}\\b)(?=[A-Za-z0-9_-]*\\d)(?=[A-Za-z0-9_-]*[_-])[A-Za-z0-9][A-Za-z0-9_-]*\\b',
    '\\b(?=[A-Za-z0-9_-]{5,}\\b)(?=[A-Za-z0-9_-]*[_-])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])[A-Za-z0-9][A-Za-z0-9_-]*\\b',
    '\\b(?:SKU|PROMO|COUPON|ORDER|RECEIPT|REF)[_-][A-Za-z0-9][A-Za-z0-9_-]*\\b',
  ].join('|'),
  'gu'
);
const TECHNICAL_ERROR_DETAIL = new RegExp(
  [
    'https?:\\/\\/',
    '\\/api\\/',
    '\\b(?:SQL|Supabase|Stripe|UUID|HTTP|JSON|ECONN[A-Z]+|stack trace|environment variable)\\b',
    '\\b(?:sk|pk|cs)_(?:test|live)_[A-Za-z0-9_]+\\b',
    '\\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\\b',
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
    '\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b',
  ].join('|'),
  'iu'
);
const GENERIC_MARKETPLACE_ERROR =
  'The Marketplace Request Could Not Be Completed. Please Try Again.';

/**
 * A member's display name is not prose. `marketplaceCopy` Title Cases every
 * word and turns `_` into a space, which is right for item names and server
 * enums and wrong for a name somebody typed: `ALLIN_ACE` reads as "Allin Ace",
 * and two different members can be rendered identically in a ledger that
 * refunds are issued from. The rendered surfaces print names raw, but a toast
 * has only one string, and every toast goes through `marketplaceToastCopy`.
 * Wrapping a name in this marker carries it through byte for byte.
 *
 * The markers are private-use characters, and any already in the value are
 * stripped first, so a name cannot smuggle one in and free the rest of a
 * message from formatting. They are consumed by `protectMachineTokens` below,
 * so nothing that goes through `marketplaceCopy` can ever print them.
 */
const PRESERVED_OPEN = '\uE002';
const PRESERVED_CLOSE = '\uE003';
const PRESERVED_SPAN = /\uE002([\s\S]*?)\uE003/gu;

export function marketplacePreservedName(value) {
  const raw = String(value ?? '')
    .replace(/[\uE000-\uE003]/gu, '')
    .trim();
  if (!raw) return '';
  return `${PRESERVED_OPEN}${raw}${PRESERVED_CLOSE}`;
}

function protectMachineTokens(value) {
  const tokens = [];
  const capture = (token) => `\uE000${tokens.push(token) - 1}\uE001`;
  const text = value
    .replace(PRESERVED_SPAN, (_match, preserved) => capture(preserved))
    .replace(PROTECTED_MACHINE_TOKEN, (token) => capture(token));
  return {
    text,
    restore: (formatted) =>
      formatted.replace(/\uE000(\d+)\uE001/gu, (_match, index) => tokens[Number(index)]),
  };
}

/**
 * Normalize shopper-facing Marketplace prose at its render boundary.
 * Machine tokens are restored byte-for-byte after surrounding copy is styled.
 */
export function marketplaceCopy(value) {
  if (value == null) return '';
  const protectedValue = protectMachineTokens(String(value));
  return protectedValue.restore(
    protectedValue.text
      .replace(BANNED_LONG_BARS, ': ')
      .replace(/_/gu, ' ')
      .replace(/\s{2,}/gu, ' ')
      .replace(WORD_TOKEN, (word) => {
        const known = MARKETPLACE_ACRONYMS.get(word.toLowerCase());
        if (known) return known;
        const rest = word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1);
        return `${word.charAt(0).toUpperCase()}${rest}`;
      })
      .trim()
  );
}

export function marketplaceToastCopy(type, value) {
  const raw = String(value || '').trim();
  if (!raw) return type === 'error' ? GENERIC_MARKETPLACE_ERROR : '';
  if (type === 'error' && (raw.length > 240 || TECHNICAL_ERROR_DETAIL.test(raw))) {
    return GENERIC_MARKETPLACE_ERROR;
  }
  return marketplaceCopy(raw);
}

/**
 * Translate server/provider fulfillment enums without leaking implementation
 * vocabulary into shopper copy. Unknown future values remain visible through
 * the ordinary Marketplace formatter instead of being silently discarded.
 */
export function marketplaceFulfillmentStatus(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return MARKETPLACE_FULFILLMENT_LABELS.get(raw.toLowerCase()) || marketplaceCopy(raw);
}

/**
 * Known carrier identifiers use their official brand casing. An operator's
 * custom carrier value is otherwise preserved exactly; it is business data,
 * not prose for the Title Case normalizer to rewrite.
 */
export function marketplaceCarrierName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return MARKETPLACE_CARRIER_LABELS.get(raw.toLowerCase()) || raw;
}

export function marketplaceStructuredData(value, field = '') {
  if (Array.isArray(value)) {
    return value.map((entry) => marketplaceStructuredData(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, marketplaceStructuredData(entry, key)])
    );
  }
  if (typeof value === 'string' && STRUCTURED_COPY_FIELDS.has(field)) {
    return marketplaceCopy(value);
  }
  return value;
}
