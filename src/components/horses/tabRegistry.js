/**
 * TABS - the one list of tabs in the /horses console.
 *
 * The nav has always been data-driven so a tab cannot be added to the bar and
 * forgotten in the body. Moving the list here adds two things:
 *
 *   1. A `permission` per tab. There is exactly ONE role tier today
 *      (admin | superadmin | god, repeated as a literal in twelve files), so
 *      the same grant that resolves a support ticket also mints a billion
 *      chips. Naming the permission per tab is the first half of splitting
 *      that; the server side is the half that will enforce it.
 *   2. A `load` thunk for tabs that are their OWN module. index.js is 5,900
 *      lines of one component; every tab written from Phase 2 on lives in its
 *      own file and is code-split. index.js wraps `load` in next/dynamic with
 *      ssr: false - dynamic() is not imported here on purpose, so this module
 *      stays importable by a plain `node --test` with no node_modules.
 *
 * `legacy: true` means the panel is still rendered inline by index.js. Those
 * come out one at a time in Phase 9; nothing else about a tab changes when it
 * moves, which is the point of the registry.
 *
 * There are NO placeholder tabs in the nav. A tab appears here when its panel
 * exists. `placeholder: true` is supported by the nav filter below so a future
 * tab can be registered before it ships without being shown to an operator -
 * an entry nobody can click is a promise nobody made.
 */

/** The single role tier that exists today. */
export const OPERATOR_PERMISSION = 'operator.console';

export const TABS = [
  { id: 'stable', label: 'Social Horses', permission: 'stable.read', legacy: true },
  { id: 'grinder', label: 'Grinder Horses', permission: 'grinder.read', legacy: true },
  { id: 'pipeline', label: 'Pipeline', permission: 'pipeline.read', legacy: true },
  { id: 'settings', label: 'Settings', permission: 'settings.write', legacy: true },
  { id: 'stats', label: 'Statistics', permission: 'stats.read', legacy: true },
  { id: 'merch', label: 'Merch Catalog', permission: 'merch.write', legacy: true },
  { id: 'promo', label: 'Promo Codes', permission: 'promo.write', legacy: true },
  { id: 'economy', label: 'Economy', permission: 'economy.read', legacy: true },
  { id: 'mint', label: 'The Mint', permission: 'mint.write', legacy: true },
  { id: 'antiabuse', label: 'Anti-Abuse', permission: 'abuse.read', legacy: true },
  { id: 'clubarena', label: 'Club Arena', permission: 'clubarena.read', legacy: true },
  { id: 'bugreports', label: 'Bug Reports', permission: 'support.read', legacy: true },
  { id: 'geeves', label: 'Geeves KB', permission: 'geeves.read', legacy: true },
  { id: 'reviews', label: 'Reviews', permission: 'reviews.moderate', legacy: true },
  { id: 'scrapers', label: 'Scrapers', permission: 'scrapers.read', legacy: true },
  { id: 'audit', label: 'Audit Log', permission: 'audit.read', legacy: true },

  // ── Phase 2. The first two tabs that are their OWN modules ────────────────
  //
  // Both declare `console.read`, which is the permission that lets an account
  // open this console at all, because SEEING who holds what and what is
  // waiting for a decision is not itself a privileged act. The privileged
  // halves declare their own permissions inside the panels: `admin.manage`
  // gates granting, revoking and the policy panel, and deciding a request
  // needs whatever permission the underlying kind needs (money.write for
  // mint/burn/fund, cashier.write for cashout - approvalModel.js owns that
  // table). PHASE2-CONTRACTS section 3.
  //
  // `load` makes them code-split: index.js wraps it in next/dynamic. dynamic()
  // is deliberately not imported here so this module stays importable by a
  // plain `node --test` with no node_modules.
  { id: 'staff', label: 'Staff And Roles', permission: 'console.read',
    load: () => import('./StaffPanel') },
  { id: 'approvals', label: 'Approvals', permission: 'console.read',
    load: () => import('./ApprovalsPanel') },
];

export const DEFAULT_TAB = 'stable';

/** Sections of the Club Arena tab, mirrored into ?section=. */
export const CA_SECTIONS = [
  ['overview', 'Overview'],
  ['clubs', 'Clubs'],
  ['revenue', 'Revenue'],
  ['ledger', 'Ledger'],
  ['finance', 'Cashouts'],
  ['users', 'Users'],
  ['unions', 'Unions'],
  ['approvals', 'Approvals'],
];

export const DEFAULT_CA_SECTION = 'overview';

/** Pages that live outside this SPA but belong to the same console. */
export const EXTERNAL_LINKS = [
  { href: '/horses/sql-console', label: 'SQL Console' },
  { href: '/horses/hg-moderation', label: 'HG Moderation' },
  { href: '/horses/hand-reviews', label: 'Hand Reviews' },
];

/** What the nav renders: everything registered that is not a placeholder. */
export function visibleTabs(tabs = TABS) {
  return tabs.filter((tab) => !tab.placeholder);
}

export function findTab(id, tabs = TABS) {
  return visibleTabs(tabs).find((tab) => tab.id === id) || null;
}

/**
 * Validate a ?tab= value against the registry.
 *
 * A URL is operator input: a stale bookmark, a hand-edited query string or a
 * tab that has since been renamed must land on the default, never on a blank
 * panel. Arrays (?tab=a&tab=b) take the first value, which is what Next's
 * router hands over.
 */
export function resolveTabFromQuery(value, tabs = TABS) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw) return DEFAULT_TAB;
  const found = findTab(raw.trim(), tabs);
  return found ? found.id : DEFAULT_TAB;
}

/** Same rule for the Club Arena ?section= value. */
export function resolveSectionFromQuery(value, sections = CA_SECTIONS) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw) return DEFAULT_CA_SECTION;
  const match = sections.find(([id]) => id === raw.trim());
  return match ? match[0] : DEFAULT_CA_SECTION;
}
