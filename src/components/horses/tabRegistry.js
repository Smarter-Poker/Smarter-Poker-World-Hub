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

/**
 * EVERY `permission` BELOW IS A MEMBER OF THE VOCABULARY IN
 * src/lib/horses/permissions.js, AND A TEST ASSERTS IT.
 *
 * It has to be, because Phase 2 turned this field from documentation into a
 * live nav filter. Until Phase 2 nothing read it, so thirteen of these tabs
 * carried invented names (`mint.write`, `stable.read`, `clubarena.read`,
 * `economy.read` ...) that no role has ever held and no route has ever
 * checked. The moment `section=policy` started answering with a populated
 * permission list, those thirteen names became thirteen tabs that a `god`
 * could not see - including the default tab, which then made the stranding
 * guard relocate and rewrite the URL on every single load.
 *
 * TWO RULES KEEP IT FIXED:
 *
 *   1. A TAB DECLARES THE PERMISSION THAT LETS AN OPERATOR *LOOK*, never the
 *      one that lets them act. The Mint is `money.read` because reading the
 *      supply is not moving it; issuing chips is `money.write` and the route
 *      checks that for itself. Promo Codes is `console.read` because the list
 *      is a list; writing a code is `promo.write`, gated inside the panel.
 *      A tab hidden behind its write permission is a report a read-only
 *      auditor cannot open, which is a narrowing nobody asked for.
 *   2. THE NAME MUST EXIST. `isKnownPermission` is the check, and
 *      `hasPermission` refuses to hide a tab whose permission it does not
 *      recognise, so a future typo costs a failing test rather than a tab.
 */
export const TABS = [
  // The fleet: three views of the same horses, so one read permission.
  { id: 'stable', label: 'Social Horses', permission: 'fleet.read', legacy: true },
  // ── Phase 3. The Grinder tab BECAME Fleet Command ─────────────────────────
  //
  // Same slot in the bar, same read permission, its own module. The panel it
  // replaces read /api/horses/grinder-stats and /api/club-arena/horse-launch;
  // Fleet Command reads /api/horses/fleet-admin, which is the one route that
  // answers "what is the fleet doing" now. Two panels reporting seated horses
  // from two different tables is how a console starts disagreeing with itself.
  //
  // `aliases` keeps every /horses?tab=grinder bookmark working (see
  // resolveTabFromQuery below). The id changed because the tab is not the
  // grinder roster any more, and a bookmark is not a reason to keep a name
  // that has stopped being true.
  { id: 'fleet', label: 'Fleet Command', permission: 'fleet.read',
    aliases: ['grinder'],
    load: () => import('./FleetPanel') },
  { id: 'pipeline', label: 'Pipeline', permission: 'fleet.read', legacy: true },
  // The only tab whose view IS its write: there is no settings.read, and the
  // panel is the form.
  { id: 'settings', label: 'Settings', permission: 'settings.write', legacy: true },
  // Statistics and Economy both report money. Reading them is money.read.
  { id: 'stats', label: 'Statistics', permission: 'money.read', legacy: true },
  { id: 'merch', label: 'Merch Catalog', permission: 'console.read', legacy: true },
  { id: 'promo', label: 'Promo Codes', permission: 'console.read', legacy: true },
  { id: 'economy', label: 'Economy', permission: 'money.read', legacy: true },
  { id: 'mint', label: 'The Mint', permission: 'money.read', legacy: true },
  // Anti-Abuse and Bug Reports are both player records read side by side.
  { id: 'antiabuse', label: 'Anti-Abuse', permission: 'players.read', legacy: true },
  { id: 'clubarena', label: 'Club Arena', permission: 'clubs.read', legacy: true },
  { id: 'bugreports', label: 'Bug Reports', permission: 'players.read', legacy: true },
  // Geeves and Reviews moderate content; moderation.write gates the buttons
  // inside them, console.read opens the page.
  { id: 'geeves', label: 'Geeves KB', permission: 'console.read', legacy: true },
  { id: 'reviews', label: 'Reviews', permission: 'console.read', legacy: true },
  { id: 'scrapers', label: 'Scrapers', permission: 'console.read', legacy: true },
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
  // Union applications and leave requests. The KEY stays `approvals` so every
  // bookmarked ?section=approvals still lands here; the LABEL changed because
  // the maker-checker tab above is also called Approvals, and two unrelated
  // screens with one name in one nav is a wrong click waiting to happen.
  ['approvals', 'Union Applications'],
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
 * A tab's retired ids, as a list.
 *
 * A tab that was RENAMED carries the id it used to answer to. Nothing else
 * may: an alias is a promise that an old link still works, not a second name
 * a new tab may invent for itself.
 */
export function aliasesOf(tab) {
  return Array.isArray(tab?.aliases) ? tab.aliases.filter((a) => typeof a === 'string' && a) : [];
}

/**
 * Find the tab that answers to a retired id, or null.
 *
 * A real id always wins: if some future tab is registered under an id that is
 * also somebody's alias, the tab that OWNS the id gets it, because `findTab`
 * runs first in `resolveTabFromQuery`.
 */
export function findTabByAlias(id, tabs = TABS) {
  const wanted = String(id || '').trim();
  if (!wanted) return null;
  return visibleTabs(tabs).find((tab) => aliasesOf(tab).includes(wanted)) || null;
}

/**
 * Validate a ?tab= value against the registry.
 *
 * A URL is operator input: a stale bookmark, a hand-edited query string or a
 * tab that has since been renamed must land on the default, never on a blank
 * panel. Arrays (?tab=a&tab=b) take the first value, which is what Next's
 * router hands over.
 *
 * THE ALIAS STEP IS PHASE 3 (2026-09-03). `grinder` became `fleet`, and an
 * operator's bookmark is not a thing this console is allowed to break: an
 * unknown id resolves to the DEFAULT tab, so without this step every
 * /horses?tab=grinder link would have quietly landed on Social Horses - the
 * same silent relocation the Phase 1 deep-link blocker was about, arriving by
 * a rename instead of by a permission. A retired id resolves to the tab that
 * took it over; only an id nobody claims falls through to the default.
 */
export function resolveTabFromQuery(value, tabs = TABS) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw) return DEFAULT_TAB;
  const wanted = raw.trim();
  const found = findTab(wanted, tabs);
  if (found) return found.id;
  const aliased = findTabByAlias(wanted, tabs);
  return aliased ? aliased.id : DEFAULT_TAB;
}

/** Same rule for the Club Arena ?section= value. */
export function resolveSectionFromQuery(value, sections = CA_SECTIONS) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw) return DEFAULT_CA_SECTION;
  const match = sections.find(([id]) => id === raw.trim());
  return match ? match[0] : DEFAULT_CA_SECTION;
}
