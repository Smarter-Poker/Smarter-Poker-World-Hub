/**
 * HORSES ADMIN - /horses
 *
 * Platform staff console: content stable, the horse fleet, pipeline, economy,
 * anti-abuse, Club Arena oversight, bug reports, Geeves KB, review moderation
 * and scraper health.
 *
 * PHASE 3 (2026-09-03): the Grinder tab became Fleet Command, which is its own
 * code-split module (src/components/horses/FleetPanel.jsx) reading
 * /api/horses/fleet-admin. Every fleet reading this file used to hold went with
 * it, so no number about the fleet is computed here any more.
 *
 * --- 2026-08-26 DEEP AUDIT - what changed and why --------------------------
 *
 * 1. NO MORE DEMO DATA. The old file shipped 8 hardcoded DEMO_PERSONAS and fell
 *    back to them whenever a query failed OR returned zero rows. On an admin
 *    console that is worse than an error: it renders confident fiction. A
 *    failure now says so.
 *
 * 2. NO MORE FAKE SUCCESS. Every mutation used to apply an optimistic update,
 *    console.warn the real Supabase error, and still toast "saved". Persona
 *    create even fabricated a local row and said "Horse created (fallback)".
 *    Mutations now revert the optimistic update and surface the failure.
 *
 * 3. CLUB ARENA DATA MOVED SERVER-SIDE. Those queries ran in the browser with
 *    the operator's JWT against tables whose RLS has no admin bypass - verified
 *    in production: 0 of 1501 club_members, 0 of 113 agents, 0 of 200,978
 *    chip_transactions readable. They also used four column names that do not
 *    exist (cashout_requests.user_id, chip_transactions.user_id,
 *    tables.max_seats, club_members.id). Everything now goes through
 *    /api/horses/club-arena-admin, which is service-role behind an admin gate.
 *
 * 4. THE DEAD HALF OF THE CLUB ARENA TAB IS NOW WIRED. caStats, caFinance,
 *    caUnions, caPendingCashouts, searchCaUsers, loadCaUserDetail,
 *    toggleClubStatus and forceCashoutApprove were all implemented and NONE of
 *    them were reachable from the UI. They have sections now.
 *
 * 5. SETTINGS NO LONGER WRITE PER KEYSTROKE. Every input called updateSetting
 *    on change, so dragging the temperature slider fired one upsert per pixel
 *    and clearing a number field wrote NaN. Writes are debounced and validated.
 *
 * 6. NO EMOJI. House rule 7 - bare emoji break the SWC compiler.
 *
 * 7. NO RAW HEX. Colours come from horsesAdminTokens, which points at the CSS
 *    custom properties in horses.module.css. smarter.poker schema only.
 *
 * --- 2026-09-02 PHASE 1 - what changed and why -----------------------------
 *
 * A. AN ERROR BOUNDARY AROUND THE ACTIVE PANEL. One render throw used to
 *    white-screen all sixteen tabs. It now costs one tab, names it, and leaves
 *    the nav usable.
 *
 * B. THE TAB AND THE CLUB ARENA SECTION ARE IN THE URL. ?tab= and ?section=
 *    are mirrored shallowly and validated against the registry on read, so the
 *    Ledger can be bookmarked. The first write (normalising a bare /horses)
 *    is a replace; every navigation after it is a push, which is what makes
 *    Back undo a "Needs Attention" jump instead of leaving the console.
 *    The read and write effects are latched so a deep link cannot be destroyed
 *    by the write effect running in the same commit as the read - the whole
 *    mechanism is written out above `urlHydratedRef` and the pure half lives
 *    in src/components/horses/urlState.js.
 *
 * C. THE NAV IS A REAL TABLIST. role=tablist / tab / tabpanel, aria-selected,
 *    aria-controls, and arrow / Home / End key movement.
 *
 * D. ONE MODAL. src/components/horses/Modal.jsx (ported from hg-moderation)
 *    replaces three hand-rolled dialogs, including the Mint confirmation - the
 *    screen that creates money - which had no dialog role, no Escape and no
 *    focus management at all.
 *
 * E. SERVER PAGING WHERE THERE WAS NONE. The Mint ledger has a pager; Bug
 *    Reports reads a service-role route with status, search and paging instead
 *    of querying live_help_tickets from the browser under the operator's RLS.
 *
 * F. HONEST EXPORTS AND HONEST DEAD BUTTONS. The audit CSV walks every page and
 *    carries details/before/after (the Export CSV button calls exportAuditLog,
 *    which is the only thing that makes that true); the permanently disabled
 *    club-management and pipeline buttons are replaced by a Not Built Yet panel
 *    that says so.
 *
 * --- 2026-09-03 REVIEW PASS - what the adversarial review changed -----------
 *
 * G. NO CAPPED FIGURE PASSES AS A TOTAL. Every list this console renders
 *    without a pager now sends its cap explicitly and renders "Showing N Of
 *    Total" when the route reports `truncated`; every count comes from the
 *    route's own total (memberChipTotal, memberCount, pages.<list>.total,
 *    caStats.pendingCashouts) instead of the length of the array that fitted.
 *    The fleet roster is paged by the ROUTE, not sliced client-side over a
 *    response that never contained those rows (it is Fleet Command's table
 *    since Phase 3, still server-paged, now by /api/horses/fleet-admin).
 *
 * H. THE MINT'S IDEMPOTENCY KEY IS BOUND TO ITS PAYLOAD. It rotates the moment
 *    any field of the composed operation changes and is stable across retries
 *    of the same one, so a key can never outlive the intent it was minted for.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import { eventBus, EventType } from '../../src/engine/EventBus';
import { broadcastSync, listenBroadcast } from '../../src/lib/broadcastSync';
import PokerBrainLaunchButton from '../../src/components/poker-brain/LaunchButton';
import MerchCatalogAdmin from '../../src/components/admin/MerchCatalogAdmin';
import styles from './horses.module.css';
import shared from '../../src/components/horses/shared.module.css';
import { T, num, signed, when, toCsv, downloadCsv, stampedName } from '../../src/lib/horsesAdminTokens';
import {
  TABS, EXTERNAL_LINKS, CA_SECTIONS, DEFAULT_TAB, DEFAULT_CA_SECTION, visibleTabs,
} from '../../src/components/horses/tabRegistry';
import {
  resolveInitialTab, resolveInitialSection, urlMatchesState, nextUrlQuery, urlNeedsNormalising,
} from '../../src/components/horses/urlState';
import {
  AUDIT_FILTER_GROUPS, auditActionFilter,
} from '../../src/components/horses/auditFilters';
// ── Phase 2 ────────────────────────────────────────────────────────────────
// Permissions decide what the NAV shows, never what the server allows; the
// server is the enforcement point. permittedTabs answers "show everything"
// for an operator whose permissions nobody has told us about yet, which is
// the Phase 2 safety rule (PHASE2-CONTRACTS section 0) written as code.
import {
  permittedTabs, permissionsFromPayload, operatorIdFromPayload, relocationTarget,
  isOperatorDenial, operatorRoleFromPayload, operatorContextChange,
} from '../../src/components/horses/operatorPermissions';
import {
  thresholdDecision, isPendingApproval, normalizePolicy,
} from '../../src/components/horses/approvalModel';
import {
  auditTrailUrl, policyUrl, rowsOf, trailActor,
} from '../../src/components/horses/operatorAdmin';
import ErrorBoundary from '../../src/components/horses/ErrorBoundary';
import Modal from '../../src/components/horses/Modal';
import ConfirmDialog from '../../src/components/horses/ConfirmDialog';
import DataTable from '../../src/components/horses/DataTable';
import StatusPill from '../../src/components/horses/StatusPill';
import Pager from '../../src/components/horses/Pager';
import NotBuiltYet from '../../src/components/horses/NotBuiltYet';
import useOperatorFetch from '../../src/components/horses/useOperatorFetch';
import usePagedList from '../../src/components/horses/usePagedList';
import exportAllCsv from '../../src/components/horses/exportAllCsv';

const SYNC_CHANNEL = 'horses-admin-sync';

/** The sign-in refusal, in one place, because two paths (a session found on
 *  load and a fresh sign-in) have to say exactly the same thing. */
const ACCESS_DENIED_MESSAGE = 'Access Denied. Operator Privileges Are Required.';
const VERIFY_FAILED_MESSAGE = 'Could Not Verify Operator Status. Check Your Connection And Try Again.';

/**
 * Chips carry two decimals and the route refuses more (mint.js money2dp);
 * this is the same rule stated on the compose step, so a third decimal is
 * refused before the confirm dialog rather than after the typed confirmation.
 * The trimmed STRING is tested, not the parsed number: Number('100.005') is
 * a perfectly finite value and cannot be told from 100.01 once it has been
 * rounded for display.
 */
const CHIP_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** The asset as a word in a sentence: the value is 'chips' | 'diamonds'. */
function assetLabel(asset) {
  const a = String(asset || '').toLowerCase();
  if (a === 'chips') return 'Chips';
  if (a === 'diamonds') return 'Diamonds';
  return a ? a.charAt(0).toUpperCase() + a.slice(1) : '';
}

/** Chip amounts always show two decimals, so 100.10 chips never reads as
 *  "100.1" in a sentence the operator is about to sign off on. Diamonds are
 *  whole numbers and keep the plain rendering. */
function formatAmount(value, asset) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return asset === 'chips'
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString();
}

/** 593 horses in the stable. Rendering every card at once was the heaviest
 *  thing this page did; the roster is paginated now. */
const HORSES_PER_PAGE = 48;

/** The reviews route clamps `limit` to 500; 100 keeps a page readable. */
const REVIEWS_PER_PAGE = 100;

const SPECIALTIES = [
  ['cash_games', 'Cash Games'],
  ['tournaments', 'Tournaments'],
  ['high_stakes', 'High Stakes'],
  ['plo', 'PLO'],
  ['online', 'Online'],
  ['gto', 'GTO'],
  ['live_reads', 'Live Reads'],
];

const VOICES = [
  'casual', 'analytical', 'enthusiastic', 'experienced',
  'technical', 'street_smart', 'passionate', 'academic',
];

const EMPTY_PERSONA = {
  name: '', gender: 'male', location: '', specialty: 'cash_games',
  stakes: '', bio: '', voice: 'casual',
};

const EMPTY_ABUSE_DATA = {
  abuse: { log: [], stats: { totalSignups: 0, blocked: 0, disposable: 0 }, topIPs: [] },
  audit: [], alerts: [],
  economy: { sourceBreakdown: {}, totalGranted: 0, totalSpent: 0, topHolders: [] },
};

/**
 * The nav, the external links and the Club Arena sections all come from
 * src/components/horses/tabRegistry.js now. It is data-driven for the same
 * reason it always was - a tab cannot be added to the bar and forgotten in the
 * body, which is how /horses/hg-moderation ended up an orphan page with no
 * link to it from anywhere - and it lives in its own module so a Phase 2+ tab
 * can be its own code-split component instead of another thousand lines here.
 *
 * EIGHTEEN entries, and three of them are no longer this file's problem: the
 * registry marks a tab `legacy: true` while its panel is still rendered inline
 * here, and gives it a `load` thunk once it is its own module. `staff` and
 * `approvals` (Phase 2) and `fleet` (Phase 3, which replaced `grinder`) carry
 * `load`; the other fifteen are still inline below, in registry order, with
 * their panel bodies unchanged. That includes
 * { id: 'merch', label: 'Merch Catalog' }, whose panel is the already-extracted
 * MerchCatalogAdmin component.
 */

/** Only tabs whose panel is a separate module carry a `load` thunk. dynamic()
 *  is applied here rather than in the registry so the registry stays a plain
 *  data module. Memoised per id: calling dynamic() during render would create a
 *  new component type on every keystroke and remount the panel. */
const dynamicPanels = new Map();
function panelComponentFor(tab) {
  if (!tab || typeof tab.load !== 'function') return null;
  if (!dynamicPanels.has(tab.id)) {
    // next/dynamic renders `loading` both while the chunk is in flight AND
    // after the import rejected, passing { error, retry } for the second
    // case. Ignoring `error` meant a chunk 404 after a deploy (stale HTML
    // pointing at hashes that no longer exist) or an offline tab showed
    // "Loading Staff And Roles" forever; nothing threw, so the ErrorBoundary
    // never saw it either. The boundary's own classes are used so the two
    // failure screens read as one.
    dynamicPanels.set(tab.id, dynamic(tab.load, {
      ssr: false,
      loading: ({ error, retry }) => (error
        ? (
          <div className={shared.boundary} role="alert">
            <h2 className={shared.boundaryTitle}>{tab.label} Could Not Be Loaded</h2>
            <p className={shared.boundaryText}>
              The Code For This Tab Did Not Arrive. Check The Connection, Or Reload The Page
              If The Console Was Just Deployed.
            </p>
            {error.message && <code className={shared.boundaryCode}>{error.message}</code>}
            <button type="button" className={shared.boundaryBtn} onClick={retry}>
              Try Again
            </button>
          </div>
        )
        : <div className={styles.loadingSpinner}>Loading {tab.label}</div>),
    }));
  }
  return dynamicPanels.get(tab.id);
}

/** How many ledger rows a page of The Mint shows. */
const MINT_LEDGER_PAGE_SIZE = 50;

/** How many tickets a page of Bug Reports shows. */
const TICKETS_PER_PAGE = 50;

/**
 * EXPLICIT ROW CAPS for the lists this console renders WITHOUT a pager.
 *
 * PHASE1-CONTRACTS addendum item 10: a cap must never be invisible. These are
 * the original caps, sent on the request rather than left to a route default,
 * so the number a panel can show is written down in the code that shows it -
 * and every one of those responses carries `truncated`, which is rendered as
 * "Showing N Of Total" wherever it is true.
 */
const CA_OVERVIEW_LIMIT = 200;   // clubs; unions and cashouts ride the same read
const CA_CLUB_LIMIT = 300;       // members, and the agent/table lists beside them
const CA_LEDGER_LIMIT = 200;     // drift rows, circulation, seat exits
const MINT_TARGET_LIMIT = 500;   // club and union pickers

/** The id of the one tabpanel. Every tab's aria-controls points here. */
const HORSES_PANEL_ID = 'horses-panel';

/**
 * A stored timestamp as the LOCAL "YYYY-MM-DDTHH:mm" a datetime-local input
 * means.
 *
 * The promo edit form used to seed the input with the first sixteen characters
 * of the UTC ISO string. `datetime-local` reads whatever it is given as LOCAL
 * time, so an expiry stored at 20:00Z was shown as 20:00 local and saved back
 * as 20:00 local - moving the real expiry by the operator's offset on every
 * save, including saves that never touched the field.
 */
function toLocalDateTimeInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The other half: a datetime-local value as an absolute instant.
 *
 * The bare string carries no zone, and the route resolves it with the SERVER's
 * clock (UTC on Vercel), not the operator's. Converting here - where the
 * offset is actually known - is what makes the instant the operator picked the
 * instant that gets stored.
 */
function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The one sentence a capped list owes the operator.
 *
 * Rendered only when the route says it truncated, so a complete list stays
 * quiet. Never guesses: with no `total` it says the list is capped without
 * inventing the number it was capped from.
 */
function ShowingOf({ truncated, count, total, noun = 'Rows' }) {
  if (!truncated) return null;
  return (
    <div className={styles.warnBanner}>
      Showing {num(count, '0')}
      {total === null || total === undefined ? '' : ` Of ${num(total)}`} {noun}.
      {' '}This List Is Capped By The Route, So It Is A Page And Not A Total.
    </div>
  );
}

/** Rows per request while an export walks every page. */
const EXPORT_PAGE_SIZE = 500;

/** One page of a single record's audit trail (the "Trail" dialog). Small on
 *  purpose: it is read inside a modal, and a modal that scrolls for a hundred
 *  rows is a modal nobody reads to the bottom of. */
const AUDIT_TRAIL_PAGE_SIZE = 25;

/** The bulk routes accept up to 500 ids per call (PHASE1-CONTRACTS item 6). */
const BULK_CHUNK = 500;

/**
 * Exactly the columns the roster renders, edits or exports.
 *
 * This was `select('*')`, which pulled every bio for 1,000+ rows on mount AND
 * on every 2-second sync tick. `bio` is the expensive one and the cards do show
 * it, so it stays; what is gone is everything the panel never reads.
 * Cross-checked against every `persona.` and `p.` access in this file: the
 * cards (name, alias, avatar_url, location, specialty, stakes, bio, voice,
 * is_active), the edit form (gender), the CSV export, and the horse-versus-
 * social-only split (profile_id).
 */
const ROSTER_COLUMNS = 'id, name, alias, gender, location, specialty, stakes, bio, voice, is_active, avatar_url, profile_id';

export default function HorsesAdmin() {
  const router = useRouter();

  // ── Session ──
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [notification, setNotification] = useState(null);

  // ── Operator context (Phase 2) ──
  //
  // `operatorPermissions` stays NULL until a route has actually told us what
  // this account holds, and null means "show everything". That is the safety
  // rule (PHASE2-CONTRACTS section 0): production has three operator accounts
  // and none of them may lose a tab because /api/horses/operator-admin is not
  // deployed yet, or answered slowly, or failed. A permission list narrows
  // the nav only once it exists.
  //
  // `operatorPolicy` is null for the same reason, and a null policy is read
  // everywhere as approvals OFF - which is the shipped default and the state
  // production is in, so the Mint behaves exactly as it does today.
  const [operatorPermissions, setOperatorPermissions] = useState(null);
  const [operatorPolicy, setOperatorPolicy] = useState(null);
  const [operatorId, setOperatorId] = useState(null);
  // The route counts eligible approvers for us (`aloneRule`), because only it
  // can: it needs the roster. Without it the Mint's confirm dialog promised
  // "nothing moves until a second operator approves it" for an operation the
  // server was about to execute on the spot under the alone-rule.
  const [operatorAloneRule, setOperatorAloneRule] = useState(null);
  // True when the route had to fall back to the LEGACY permission set because
  // fn_ca_operator_permissions did not answer, so a granted role may be
  // missing from the list the nav is filtered by. Surfaced on the Staff tab.
  const [operatorDegraded, setOperatorDegraded] = useState(false);

  // ── Stable ──
  const [personas, setPersonas] = useState([]);
  const [personasError, setPersonasError] = useState(null);
  // Loading and empty are different states. Without this the roster flashed
  // "No Horses In The Stable Yet. Create One To Get Started." on every mount,
  // which is the one sentence an operator must never be shown about a stable
  // that has 593 horses in it.
  const [personasLoading, setPersonasLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  // searchTerm, filter and page belong to the Social Horses roster and to
  // nothing else. The Grinder tab used to share all three, so a search typed
  // here silently filtered a table on another tab; that table is Fleet
  // Command's now (Phase 3) and it owns its own filters, offset and pager.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);
  const [personaForm, setPersonaForm] = useState(EMPTY_PERSONA);
  const [savingPersona, setSavingPersona] = useState(false);
  // Bulk selection over the 593-horse stable.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Avatar generation. 55 horses have no avatar; the endpoint existed with no
  // caller anywhere in the app.
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarResult, setAvatarResult] = useState(null);

  // ── Settings ──
  const [settings, setSettings] = useState({
    posts_per_day: 20, min_delay_minutes: 30, max_delay_minutes: 120,
    ai_model: 'gpt-4o', temperature: 0.8, engine_enabled: true, auto_publish: true,
    peak_hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState(null);

  // ── Pipeline ──
  // No `pipelineBusy` any more: the four quick actions were disabled from the
  // day they shipped and /api/horses/trigger-pipeline answers 501, so the
  // trigger function and its busy flag were unreachable code.
  const [pipelineRuns, setPipelineRuns] = useState([]);

  // ── Analytics ──
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  // Platform pulse -- live tables, seats, hands. None of it had a surface.
  const [platform, setPlatform] = useState(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformError, setPlatformError] = useState(null);

  // ── Geeves ──
  const [geevesAnalytics, setGeevesAnalytics] = useState({ summary: null, questions: [] });
  const [geevesLoaded, setGeevesLoaded] = useState(false);
  const [geevesLoading, setGeevesLoading] = useState(false);
  const [geevesError, setGeevesError] = useState(null);
  const [geevesMarkingId, setGeevesMarkingId] = useState(null);

  // ── Promo ──
  const [promoCodes, setPromoCodes] = useState([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState(null);
  const [promoCreating, setPromoCreating] = useState(false);
  const [promoForm, setPromoForm] = useState({
    code: '', description: '', type: 'signup_bonus', value: 100, maxUses: '', expiresAt: '',
  });
  // The valid reward types come from the route rather than a hardcoded list
  // that included a value the route rejects.
  const [promoRewardTypes, setPromoRewardTypes] = useState([]);
  // The PATCH route has always accepted code, description, max_uses,
  // reward_type, reward_value and expires_at. The panel exposed exactly one of
  // them (is_active), so a typo'd code or a wrong expiry meant issuing a new
  // code and retiring the old one.
  const [promoEditing, setPromoEditing] = useState(null);
  const [promoEditForm, setPromoEditForm] = useState(null);
  const [promoSaving, setPromoSaving] = useState(false);

  // ── Economy ──
  const [economyData, setEconomyData] = useState(null);
  const [economyLoading, setEconomyLoading] = useState(false);
  const [economyLoaded, setEconomyLoaded] = useState(false);
  const [economyError, setEconomyError] = useState(null);

  // ── The Mint ──
  // Issuance is the one thing on this page that creates money out of nothing,
  // so the form state is deliberately explicit rather than one blob: `mintOpId`
  // in particular is generated ONCE per composed operation and reused on every
  // retry, which is what makes a double-click harmless (fn_ca_mint claims the
  // key and replays the original result instead of minting twice).
  const [mintOverview, setMintOverview] = useState(null);
  const [mintTargets, setMintTargets] = useState(null);
  const [mintLedger, setMintLedger] = useState(null);
  const [mintLoading, setMintLoading] = useState(false);
  /** The ledger's OWN in-flight flag. The Pager used to read `mintLoading`,
   *  which only the full panel load sets, so Next and Previous stayed live
   *  while a page was in flight and a double click was two requests racing. */
  const [mintLedgerLoading, setMintLedgerLoading] = useState(false);
  const [mintLoaded, setMintLoaded] = useState(false);
  const [mintError, setMintError] = useState(null);

  const [mintAction, setMintAction] = useState('mint');   // mint | burn
  const [mintAsset, setMintAsset] = useState('chips');    // chips | diamonds
  const [mintTargetKind, setMintTargetKind] = useState('club'); // club | union | player
  const [mintTargetId, setMintTargetId] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [mintReason, setMintReason] = useState('');
  const [mintOpId, setMintOpId] = useState('');
  const [mintSubmitting, setMintSubmitting] = useState(false);
  const [mintConfirm, setMintConfirm] = useState(null);
  const [mintReceipt, setMintReceipt] = useState(null);

  const [mintPlayerQuery, setMintPlayerQuery] = useState('');
  const [mintPlayerResults, setMintPlayerResults] = useState([]);
  const [mintPlayerSearching, setMintPlayerSearching] = useState(false);
  const [mintPickedPlayer, setMintPickedPlayer] = useState(null);

  const [mintLedgerAsset, setMintLedgerAsset] = useState('');
  const [mintLedgerAction, setMintLedgerAction] = useState('');
  // Drill-down: { id, label } of a single holder, or null for the whole journal.
  const [mintLedgerHolder, setMintLedgerHolder] = useState(null);
  /** Where the row came from (ca_mint_ledger.origin): '' is every origin. */
  const [mintLedgerOrigin, setMintLedgerOrigin] = useState('');
  // The ledger was a fixed limit=100 with no offset, so row 101 of the journal
  // that records every chip and diamond ever created was unreachable.
  const [mintLedgerOffset, setMintLedgerOffset] = useState(0);

  // ── Anti-abuse ──
  const [abuseData, setAbuseData] = useState(null);
  const [abuseLoading, setAbuseLoading] = useState(false);
  const [abuseLoaded, setAbuseLoaded] = useState(false);
  const [abuseError, setAbuseError] = useState(null);

  // ── Reviews ──
  const [reviewsData, setReviewsData] = useState([]);
  const [reviewsStats, setReviewsStats] = useState({ total: null, flagged: null, avg_rating: null });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);
  const [reviewsFilter, setReviewsFilter] = useState('newest');
  const [reviewsRatingFilter, setReviewsRatingFilter] = useState('all');
  const [reviewsFlaggedOnly, setReviewsFlaggedOnly] = useState(false);
  // `reviewsSearch` is what the operator is typing; `reviewsQuery` is what has
  // been sent to the route. Debounced 300ms between the two so a search of a
  // 40,000-row table is not one request per keystroke.
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [reviewsQuery, setReviewsQuery] = useState('');
  const [reviewsDeleteConfirm, setReviewsDeleteConfirm] = useState(null);
  const [reviewsProcessing, setReviewsProcessing] = useState(false);
  // The route has always returned `page: { offset, limit, returned }` and
  // accepted offset/limit. The panel hardcoded limit=200 and never sent an
  // offset, so only the newest 200 reviews were ever reachable -- and the
  // search box filtered client-side over those 200 while a KPI labelled
  // "Showing" made it look like a whole-table figure.
  const [reviewsPage, setReviewsPage] = useState(0);

  // ── The fleet ──
  //
  // Nothing here any more. Phase 3 moved every fleet reading this page used to
  // hold - the grinder-stats totals and roster, and the horse-launch status
  // snapshot - into src/components/horses/FleetPanel.jsx, which reads
  // /api/horses/fleet-admin and holds its own state. There is one source for
  // each fleet number and it is that route.

  // ── Bug reports ──
  // The rows, total, paging and error live in usePagedList now (declared below
  // the fetcher it needs). What stays here is the search box, which is debounced
  // into the list's `q` filter rather than sent per keystroke.
  const [bugReportsSearch, setBugReportsSearch] = useState('');

  // ── Scrapers ──
  const [scraperHealth, setScraperHealth] = useState(null);
  const [scraperHealthLoading, setScraperHealthLoading] = useState(false);
  const [scraperHealthError, setScraperHealthError] = useState(null);
  const [scraperHealthLastFetch, setScraperHealthLastFetch] = useState(null);

  // ── Club Arena ──
  // The registry owns the default. Repeating the literal here is how the two
  // silently desync the day a section is renamed.
  const [caSection, setCaSection] = useState(DEFAULT_CA_SECTION);
  const [caLoaded, setCaLoaded] = useState(false);
  const [caLoading, setCaLoading] = useState(false);
  const [caError, setCaError] = useState(null);
  const [caWarnings, setCaWarnings] = useState(null);
  const [caStats, setCaStats] = useState(null);
  const [caClubs, setCaClubs] = useState([]);
  const [caUnions, setCaUnions] = useState([]);
  const [caFinance, setCaFinance] = useState(null);
  const [caPendingCashouts, setCaPendingCashouts] = useState([]);
  const [caSelectedClub, setCaSelectedClub] = useState(null);
  const [caClubDetail, setCaClubDetail] = useState(null);
  const [caClubTab, setCaClubTab] = useState('overview');
  const [caUserSearch, setCaUserSearch] = useState('');
  const [caUserResults, setCaUserResults] = useState([]);
  const [caUserSearching, setCaUserSearching] = useState(false);
  const [caSelectedUser, setCaSelectedUser] = useState(null);
  const [caProcessing, setCaProcessing] = useState(false);
  /** The cashout the operator is about to force through or return, with the
   *  thresholdDecision for it: { cashout, action, decision }. Rendered by the
   *  shared ConfirmDialog, never by window.confirm, so the sentence about
   *  whether chips move on Confirm is the same sentence the Mint shows. */
  const [cashoutConfirm, setCashoutConfirm] = useState(null);
  /**
   * Every OTHER confirmation this console asks for, through the one shared
   * dialog: { title, body, confirmLabel, tone, requireTyped, onConfirm }.
   * window.confirm has no dialog role, no focus management, no Title Case
   * and no way to say what will happen in more than a line of plain text;
   * the shared ConfirmDialog has all four, and the Mint and the cashout
   * already use it. The handler that opens the question and the function
   * that does the work are separate, so the work runs only from the
   * dialog's Confirm.
   */
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [caApplications, setCaApplications] = useState([]);
  const [caAppLoading, setCaAppLoading] = useState(false);
  const [caAppTab, setCaAppTab] = useState('pending');
  const [caAppCommission, setCaAppCommission] = useState({});
  // Keyed by application id, like caAppCommission already was. One shared
  // string meant the reason typed under application A was sent as the
  // rejection reason for application B.
  const [caAppReason, setCaAppReason] = useState({});
  const [caLeaveRequests, setCaLeaveRequests] = useState([]);
  const [caLeaveLoading, setCaLeaveLoading] = useState(false);
  const [caLeaveTab, setCaLeaveTab] = useState('pending');
  // Ledger reconciliation and revenue -- both tables had 0 surface anywhere.
  // The `pages` envelope of the overview read: { clubs, unions, cashouts }
  // each { total, limit, offset, truncated }. Every count the Club Arena tab
  // renders comes from here rather than from the length of a capped array.
  const [caPages, setCaPages] = useState(null);
  const [caLedger, setCaLedger] = useState(null);
  const [caLedgerLoading, setCaLedgerLoading] = useState(false);
  const [caLedgerError, setCaLedgerError] = useState(null);
  const [caRevenue, setCaRevenue] = useState(null);
  const [caRevenueLoading, setCaRevenueLoading] = useState(false);
  const [caRevenueError, setCaRevenueError] = useState(null);
  // Cheap counts fetched once on mount so the nav badges can actually warn.
  const [badges, setBadges] = useState(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // The old showNotification never cleared its timeout, so two toasts in quick
  // succession cancelled each other and the timer kept running after unmount.
  // ═══════════════════════════════════════════════════════════════════════════
  const notifyTimer = useRef(null);
  const showNotification = useCallback((message, type = 'success') => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    setNotification({ message, type });
    notifyTimer.current = setTimeout(() => setNotification(null), 4000);
  }, []);
  useEffect(() => () => { if (notifyTimer.current) clearTimeout(notifyTimer.current); }, []);

  /** Authorized fetch. Same call signature this console has always used; the
   *  implementation moved to src/components/horses/useOperatorFetch.js, which
   *  adds an AbortController per call (aborted on unmount) and surfaces the
   *  operator envelope's `code` and `requestId` on the thrown Error. */
  const authFetch = useOperatorFetch();

  const broadcastUpdate = useCallback((eventType = 'horses-updated') => {
    window.dispatchEvent(new CustomEvent(eventType));
    broadcastSync(SYNC_CHANNEL, { type: 'sync_update', timestamp: Date.now() });
  }, []);

  // Declared HIGH in the component on purpose. `const` is hoisted but sits in
  // the temporal dead zone until its initialiser runs, and useCallback
  // dependency arrays are evaluated during render -- so a loader referenced in
  // the deps of anything declared above it throws
  // "Cannot access '...' before initialization" at prerender, not at runtime.
  // The production build caught exactly that here.
  /** Counts only. Cheap enough to run on mount so the nav can warn on load. */
  const loadBadges = useCallback(async () => {
    try {
      const d = await authFetch('/api/horses/club-arena-admin?section=badges');
      setBadges(d.badges || null);
    } catch {
      // A badge is an affordance, not data. Failing to fetch one is not worth
      // a toast on page load.
    }
  }, [authFetch]);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH
  //
  // THE ROUTE DECIDES WHO IS AN OPERATOR, NOT THIS FILE. The console used to
  // read profiles.role in the browser and refuse anyone outside a list of
  // three legacy strings - which is exactly the list Phase 2 made incomplete.
  // `requireOperator` (src/lib/horses/operatorAuth.js) admits a legacy
  // profile role OR an active ca_operator_grants row, so a `finance` grant to
  // an account whose profile role is `user` is a real operator the old gate
  // sent away with "Access denied". A grant the Staff tab could make and the
  // console could not honour was a grant to nobody.
  //
  // So sign-in asks the one question the route answers on every load anyway:
  // GET section=policy. A 200 is an operator, and the body IS the bootstrap
  // (policy, permissions, own id, alone rule), so the context is applied from
  // the same answer rather than fetched twice. A 401/403 is a refusal. Any
  // other failure is "could not verify", reported as such - it is not a
  // denial and it is not a pass.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * WHO THIS OPERATOR IS, IN PHASE 2 TERMS.
   *
   * The section=policy body carries the policy row and - per PHASE2-CONTRACTS
   * section 2 - the operator envelope this console needs: the permissions the
   * account holds and its own user id. Both are used to DECIDE WHAT TO SHOW,
   * never to decide what is allowed; every route re-checks for itself.
   */
  const applyOperatorContext = useCallback((body, fallbackUserId) => {
    // normalizePolicy, not the raw row: the route answers in camelCase
    // and the contract, the table and every RPC argument are snake_case.
    // Reading only one spelling would report maker-checker as OFF while
    // it is on, which is the wrong way round to be wrong about money.
    setOperatorPolicy(normalizePolicy(body && body.policy));
    setOperatorPermissions(permissionsFromPayload(body));
    setOperatorId(operatorIdFromPayload(body, fallbackUserId));
    setOperatorAloneRule(body && body.aloneRule ? body.aloneRule : null);
    setOperatorDegraded(!!(body && body.operator && body.operator.degraded === true));
  }, []);

  /**
   * The "nobody has told us" state, which is also the safety rule: null
   * permissions and a null policy mean every tab visible and maker-checker
   * off (PHASE2-CONTRACTS section 0). A failed read lands here so nothing
   * from an earlier answer - least of all an alone rule that would let the
   * Mint claim a self-approval this console can no longer verify - survives
   * into a session the read did not vouch for.
   */
  const clearOperatorContext = useCallback((fallbackUserId) => {
    setOperatorPermissions(null);
    setOperatorPolicy(null);
    setOperatorId(fallbackUserId || null);
    setOperatorAloneRule(null);
    setOperatorDegraded(false);
  }, []);

  /**
   * A Staff tab save, flowed back up.
   *
   * The panel hands over `{ policy, aloneRule, permissions }` - the whole of
   * what section=policy answers after the save - and all three are applied.
   * The alone rule is the part that used to go stale: it is computed by the
   * route FROM the policy (approvals on, self-approval allowed, nobody else
   * eligible), so a Mint that kept the pre-toggle rule after Dan switched
   * approvals on told him his money move would wait for a second operator
   * when requireApproval was about to execute it on the spot. A bare policy
   * object is still accepted; for it only the policy changes.
   */
  const handlePolicyChange = useCallback((payload) => {
    const change = operatorContextChange(payload);
    setOperatorPolicy(normalizePolicy(change.policy));
    if (change.aloneRule !== undefined) setOperatorAloneRule(change.aloneRule);
    if (change.permissions !== undefined) setOperatorPermissions(change.permissions);
  }, []);

  /**
   * Ask the route whether this account is an operator, and if so seed the
   * operator context from its answer.
   *
   * @returns {{ ok: true, body: object } | { ok: false, denied: boolean }}
   */
  const readOperatorContext = useCallback(async (authUser) => {
    try {
      const body = await authFetch(policyUrl());
      applyOperatorContext(body, authUser.id);
      return { ok: true, body };
    } catch (err) {
      clearOperatorContext(authUser.id);
      return { ok: false, denied: isOperatorDenial(err) };
    }
  }, [authFetch, applyOperatorContext, clearOperatorContext]);

  const checkAuth = useCallback(async () => {
    try {
      const authUser = getAuthUser();
      if (!authUser?.id) { setLoading(false); return; }

      const answer = await readOperatorContext(authUser);
      if (!answer.ok) {
        setLoginError(answer.denied ? ACCESS_DENIED_MESSAGE : VERIFY_FAILED_MESSAGE);
        setLoading(false);
        return;
      }
      setUser(authUser);
      setRole(operatorRoleFromPayload(answer.body));
    } catch {
      setLoginError('Could Not Reach The Authentication Service.');
    } finally {
      setLoading(false);
    }
  }, [readOperatorContext]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email, password: loginForm.password,
      });
      if (error) { setLoginError(error.message); return; }

      const answer = await readOperatorContext(data.user);
      if (!answer.ok) {
        if (answer.denied) {
          // Do not leave a non-operator holding an authenticated session on a
          // staff page.
          await supabase.auth.signOut();
          setLoginError(ACCESS_DENIED_MESSAGE);
        } else {
          setLoginError(VERIFY_FAILED_MESSAGE);
        }
        return;
      }
      setUser(data.user);
      setRole(operatorRoleFromPayload(answer.body));
    } catch {
      setLoginError('Connection Failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Clear every cached surface - signing out used to leave the previous
    // admin's clubs, members and transactions in memory for the next sign-in.
    setUser(null); setRole(null);
    // The Phase 2 context is per account too: leaving one operator's
    // permissions in memory would decide the next operator's nav.
    setOperatorPermissions(null); setOperatorPolicy(null); setOperatorId(null);
    setOperatorAloneRule(null); setOperatorDegraded(false);
    setPersonas([]); setPipelineRuns([]); setPromoCodes([]);
    setEconomyData(null); setEconomyLoaded(false);
    setAbuseData(null); setAbuseLoaded(false);
    setAnalyticsData(null); setAnalyticsLoaded(false);
    setGeevesAnalytics({ summary: null, questions: [] }); setGeevesLoaded(false);
    setReviewsData([]); setReviewsLoaded(false);
    // The fleet reading is Fleet Command's own state now, and it unmounts with
    // the panel, so there is nothing to clear for it here.
    setScraperHealth(null);
    // Tickets carry a reporter's display name and avatar. Clear them with
    // everything else rather than leaving them for the next sign-in.
    tickets.reset(); setBugReportsSearch('');
    setCaLoaded(false); setCaStats(null); setCaClubs([]); setCaUnions([]);
    setCaFinance(null); setCaPendingCashouts([]); setCaSelectedClub(null);
    setCaClubDetail(null); setCaSelectedUser(null); setCaUserResults([]);
    // These carry PII -- the leave-request rows embed the owner's display name
    // and email -- and were surviving into the next admin's session.
    setCaApplications([]); setCaLeaveRequests([]); setCaAppCommission({});
    setCaAppReason({}); setCaUserSearch(''); setCaAppTab('pending'); setCaLeaveTab('pending');
    setCaLedger(null); setCaRevenue(null); setCaPages(null); setBadges(null);
    setScraperHealthLastFetch(null); setSelectedIds(new Set()); setAvatarResult(null);
    setActiveTab('stable');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE DATA
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Every content_authors row, in pages, so the roster cannot be silently
   * truncated as the fleet grows. Returns the same shape the caller had
   * before: `{ data, error }`.
   */
  const fetchAllAuthors = useCallback(async () => {
    const PAGE = 500;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const res = await supabase
        .from('content_authors')
        .select(ROSTER_COLUMNS)
        .order('name')
        .order('id')
        .range(from, from + PAGE - 1);
      // A failed page is NOT an empty roster. Surface it rather than
      // returning the partial list as though it were whole.
      if (res.error) return { data: null, error: res.error };
      rows.push(...(res.data || []));
      if (!res.data || res.data.length < PAGE) break;
      if (from > 100000) break; // runaway guard
    }
    return { data: rows, error: null };
  }, []);

  const loadData = useCallback(async () => {
    // Every one of these used to be destructured as `{ data }` only, so a failed
    // query was indistinguishable from an empty table and silently fell through
    // to hardcoded demo personas.
    // PAGED, because PostgREST caps an unbounded read and a capped read of a
    // roster is indistinguishable from a smaller roster. On 2026-09-02 the
    // fleet crossed 1,000 rows, which is exactly where that ceiling sits: an
    // unbounded `select('*')` would have started dropping horses off the end
    // of the stable with no error to notice. Same reason `.range()` is used on
    // every other growing table in this estate.
    setPersonasLoading(true);
    try {
      const [authorsRes, settingsRes, runsRes] = await Promise.all([
        fetchAllAuthors(),
        supabase.from('content_settings').select('*').limit(1).maybeSingle(),
        supabase.from('pipeline_runs').select('*').order('started_at', { ascending: false }).limit(10),
      ]);

      if (authorsRes.error) {
        setPersonasError(authorsRes.error.message);
        setPersonas([]);
      } else {
        setPersonasError(null);
        setPersonas(authorsRes.data || []);
      }
      if (settingsRes.data) setSettings((prev) => ({ ...prev, ...settingsRes.data }));
      setPipelineRuns(runsRes.data || []);
    } finally {
      setPersonasLoading(false);
    }
  }, [fetchAllAuthors]);

  const loadPromoCodes = useCallback(async () => {
    setPromoLoading(true);
    setPromoError(null);
    try {
      const data = await authFetch('/api/promo/admin-promo-codes');
      setPromoCodes(data.codes || []);
      if (Array.isArray(data.rewardTypes)) setPromoRewardTypes(data.rewardTypes);
    } catch (err) {
      setPromoError(err.message);
    } finally {
      setPromoLoading(false);
    }
  }, [authFetch]);

  const loadEconomyData = useCallback(async () => {
    setEconomyLoading(true);
    setEconomyError(null);
    try {
      const data = await authFetch('/api/horses/economy-stats');
      setEconomyData(data);
      setEconomyLoaded(true);
    } catch (err) {
      setEconomyError(err.message);
    } finally {
      setEconomyLoading(false);
    }
  }, [authFetch]);

  // ═══════════════════════════════════════════════════════════════════════════
  // THE MINT
  //
  // Chips are issued to a club treasury or a union bank; diamonds to an
  // individual player. That is Dan's law (2026-09-02) and it is enforced in
  // three places on purpose: this component will not offer an illegal pairing,
  // /api/horses/mint refuses one, and fn_ca_mint refuses it again in SQL.
  // ═══════════════════════════════════════════════════════════════════════════

  /** A fresh idempotency key. Generated when the operator starts composing an
   *  operation, NOT when they submit, so every retry of the same intent carries
   *  the same key and cannot mint twice. */
  const newMintOpId = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `mint-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }, []);

  /**
   * THE IDEMPOTENCY KEY IS BOUND TO THE PAYLOAD, NOT TO THE SESSION.
   *
   * fn_ca_mint claims `opId` and replays the ORIGINAL result when it sees the
   * same key twice, which is what makes a double-click harmless. The key used
   * to rotate only on a successful submit or an explicit Clear - so after a
   * FAILED submit the operator could cancel, change the target, the asset or
   * the amount, and re-compose carrying the same key. If that first attempt
   * had actually committed and only the response was lost, the second one
   * replays the first operation: the panel reports "Already Done" for an
   * operation that never happened, with a receipt for the wrong amount and the
   * wrong holder. The route delegates key generation to the client and does
   * not bind the key to the payload, so binding it is this component's job.
   *
   * Derived from the composed payload: it rotates the moment any field changes
   * and stays stable across every retry of the SAME payload, which is the only
   * case idempotency is meant to cover.
   */
  const mintPayloadKey = [
    mintAction, mintAsset, mintTargetKind, mintTargetId,
    String(mintAmount).trim(), mintReason.trim(),
  ].join('|');
  useEffect(() => {
    setMintOpId(newMintOpId());
  }, [mintPayloadKey, newMintOpId]);

  /** Monotonic, like auditSeqRef: a filter change and a page move can be in
   *  flight together, and without this the slower (older) answer landed last
   *  and the table showed one page under another page's pager. */
  const mintLedgerSeqRef = useRef(0);

  /**
   * One page of the Mint journal. The route has always accepted limit/offset
   * (mint.js:136-137) and the panel sent neither, so it showed the newest 100
   * operations and nothing else could ever be reached.
   *
   * `holderId` is the drill-down. The route has always supported it too
   * (mint.js:133-134, uuid-validated `.eq('holder_id', ...)`), and "show me
   * everything ever issued to this club" is the first question anyone asks of
   * an issuance journal.
   *
   * `rows` is the Phase 1 paged field name; `entries` is the legacy one the
   * route keeps alongside it, so this reads whichever arrives.
   */
  const loadMintLedger = useCallback(async (asset = '', action = '', holderId = '', offset = 0, origin = '') => {
    const seq = ++mintLedgerSeqRef.current;
    const params = new URLSearchParams({
      section: 'ledger',
      limit: String(MINT_LEDGER_PAGE_SIZE),
      offset: String(Math.max(0, offset)),
    });
    if (asset) params.set('asset', asset);
    if (action) params.set('action', action);
    if (holderId) params.set('holderId', holderId);
    if (origin) params.set('origin', origin);
    setMintLedgerLoading(true);
    try {
      const data = await authFetch(`/api/horses/mint?${params.toString()}`);
      if (seq !== mintLedgerSeqRef.current) return;
      setMintLedger({
        ...data,
        entries: data.rows || data.entries || [],
        offset: typeof data.offset === 'number' ? data.offset : offset,
      });
    } finally {
      if (seq === mintLedgerSeqRef.current) setMintLedgerLoading(false);
    }
  }, [authFetch]);

  /**
   * THE ONE PLACE THE LEDGER IS RE-READ.
   *
   * Asset, operation, holder and page all come through here, and each one that
   * is not being changed is carried over from state rather than re-supplied at
   * the call site. When each control assembled its own argument list, adding a
   * fourth filter meant editing three unrelated onChange handlers, and any one
   * of them that forgot a sibling would silently widen the journal - the asset
   * select would drop the holder drill-down and show every club again while
   * the "Only <club>" chip still claimed the view was narrowed.
   *
   * Changing a filter resets the page: offset defaults to 0, so page 4 of the
   * unfiltered journal can never survive into a filtered result that has one
   * page. Only goMintLedgerPage passes an offset.
   */
  const refreshMintLedger = useCallback((
    {
      asset = mintLedgerAsset,
      action = mintLedgerAction,
      holder = mintLedgerHolder,
      origin = mintLedgerOrigin,
      offset = 0,
    } = {}
  ) => {
    const nextOffset = Math.max(0, offset);
    setMintLedgerAsset(asset);
    setMintLedgerAction(action);
    setMintLedgerHolder(holder);
    setMintLedgerOrigin(origin);
    setMintLedgerOffset(nextOffset);
    loadMintLedger(asset, action, holder?.id || '', nextOffset, origin)
      .catch((err) => showNotification(err.message, 'error'));
  }, [loadMintLedger, mintLedgerAsset, mintLedgerAction, mintLedgerHolder, mintLedgerOrigin, showNotification]);

  /** Move the ledger pager and load that page, reporting a failure rather than
   *  leaving the operator on a page that silently did not change. Paging is a
   *  filter change like any other, so it goes through the same door. */
  const goMintLedgerPage = useCallback((nextOffset) => {
    refreshMintLedger({ offset: nextOffset });
  }, [refreshMintLedger]);

  const loadMintData = useCallback(async (ledgerOffset = mintLedgerOffset) => {
    setMintLoading(true);
    setMintError(null);
    try {
      // Three independent reads. Promise.all rather than sequential awaits
      // because a slow club list should not delay the supply figures.
      // The picker's cap is sent explicitly (addendum item 10) rather than
      // left to a route default, and `truncated` is rendered beside the select
      // so "the club I want is not in this list" is distinguishable from "that
      // club does not exist".
      const [overview, targets] = await Promise.all([
        authFetch('/api/horses/mint?section=overview'),
        authFetch(`/api/horses/mint?section=targets&limit=${MINT_TARGET_LIMIT}`),
      ]);
      setMintOverview(overview);
      setMintTargets(targets);
      await loadMintLedger(
        mintLedgerAsset, mintLedgerAction, mintLedgerHolder?.id || '', ledgerOffset, mintLedgerOrigin
      );
      setMintLoaded(true);
    } catch (err) {
      setMintError(err.message);
    } finally {
      setMintLoading(false);
    }
  }, [
    authFetch, loadMintLedger,
    mintLedgerAsset, mintLedgerAction, mintLedgerHolder, mintLedgerOffset,
  ]);

  /**
   * Load a past operation back into the form as its OPPOSITE, ready to review.
   *
   * Correcting a mistyped issuance is the single most likely thing an operator
   * needs from a journal, and retyping a holder id and an amount by hand is
   * exactly where a second mistake gets made. This fills the form and stops -
   * the confirmation step still has to be read and accepted.
   *
   * It does NOT touch mintOpId. The key is bound to the payload, not set by
   * hand: writing these six fields changes mintPayloadKey, and the effect
   * above rotates the key for us. Minting one here as well would rotate it
   * twice for one intent, and - worse - would be a second, competing place
   * that decides when a key is new, which is exactly the split the payload
   * binding was written to close.
   */
  const reverseMintOperation = useCallback((row) => {
    setMintAction(row.action === 'mint' ? 'burn' : 'mint');
    setMintAsset(row.asset);
    setMintTargetKind(row.holder_type);
    setMintTargetId(row.holder_id);
    setMintAmount(String(row.amount));
    setMintReason(
      `Reversing ${row.action === 'mint' ? 'Issuance' : 'Retirement'} Of ${formatAmount(row.amount, row.asset)} ${assetLabel(row.asset)} (Operation ${row.op_id}): `
    );
    setMintPickedPlayer(
      row.holder_type === 'player'
        ? { id: row.holder_id, label: row.holder_label, balance: null, playerNumber: null }
        : null
    );
    setMintConfirm(null);
    setMintReceipt(null);
    showNotification('Loaded Into The Form. Add Why, Then Review.', 'success');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [showNotification]);

  const searchMintPlayers = useCallback(async (term) => {
    if (!term || term.trim().length < 2) {
      setMintPlayerResults([]);
      return;
    }
    setMintPlayerSearching(true);
    try {
      const data = await authFetch(
        `/api/horses/mint?section=player_search&q=${encodeURIComponent(term.trim())}`
      );
      setMintPlayerResults(data.players || []);
    } catch (err) {
      showNotification(err.message, 'error');
      setMintPlayerResults([]);
    } finally {
      setMintPlayerSearching(false);
    }
  }, [authFetch, showNotification]);

  /** Reset the form to a clean slate AND rotate the idempotency key, so the
   *  next operation is genuinely a new one rather than a replay of the last. */
  const resetMintForm = useCallback(() => {
    setMintTargetId('');
    setMintAmount('');
    setMintReason('');
    setMintPickedPlayer(null);
    setMintPlayerQuery('');
    setMintPlayerResults([]);
    setMintOpId(newMintOpId());
  }, [newMintOpId]);

  /** Nothing here writes. It assembles what the confirmation step will show, so
   *  the operator reads back the exact sentence before any money moves. */
  const composeMintConfirmation = useCallback(() => {
    const amount = Number(mintAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showNotification('Enter An Amount Greater Than Zero.', 'error');
      return;
    }
    if (mintAsset === 'diamonds' && !Number.isInteger(amount)) {
      showNotification('Diamonds Are Whole Numbers.', 'error');
      return;
    }
    // The same rule the route applies (money2dp), stated before the confirm
    // dialog: 100.005 chips used to reach the typed confirmation and then
    // fail with a 400 the operator could not act on from that screen.
    if (mintAsset === 'chips' && !CHIP_AMOUNT_PATTERN.test(String(mintAmount).trim())) {
      showNotification('Chips Take At Most Two Decimals.', 'error');
      return;
    }
    if (!mintTargetId) {
      showNotification(
        mintAsset === 'chips' ? 'Pick A Club Or Union.' : 'Pick A Player.',
        'error'
      );
      return;
    }
    if (mintReason.trim().length < 10) {
      showNotification('Write A Reason Of At Least Ten Characters.', 'error');
      return;
    }

    let label = mintTargetId;
    let balance = null;
    if (mintTargetKind === 'club') {
      const club = (mintTargets?.clubs || []).find((c) => c.id === mintTargetId);
      label = club?.label || mintTargetId;
      balance = club?.balance ?? null;
    } else if (mintTargetKind === 'union') {
      const union = (mintTargets?.unions || []).find((u) => u.id === mintTargetId);
      label = union?.label || mintTargetId;
      balance = union?.balance ?? null;
    } else if (mintPickedPlayer) {
      label = mintPickedPlayer.label;
      balance = mintPickedPlayer.balance;
    }

    // The key travels ON the confirmation object, not in state read back at
    // submit time. `setMintOpId` would not be visible to submitMint on this
    // render pass, and an empty key would be rejected by the route -- or worse,
    // a later render would supply a different one and defeat the whole point.
    // `mintOpId` is already the key for THIS payload (see mintPayloadKey); the
    // fallback only covers the first render before that effect has run.
    const opId = mintOpId || newMintOpId();
    if (!mintOpId) setMintOpId(opId);

    setMintConfirm({
      opId,
      action: mintAction,
      asset: mintAsset,
      targetKind: mintTargetKind,
      targetId: mintTargetId,
      label,
      balance,
      amount,
      reason: mintReason.trim(),
      projected: balance === null ? null : mintAction === 'mint' ? balance + amount : balance - amount,
      // WILL THIS EXECUTE, OR WILL IT WAIT? Decided here, from the policy the
      // console read on sign-in, so the sentence the operator reads back is
      // the sentence about what is actually going to happen. With no policy
      // (route not deployed, read failed) thresholdDecision answers "This
      // Will Execute Immediately", which is what the console has always done.
      approval: thresholdDecision({
        policy: operatorPolicy,
        // Issue and retire are both the Mint and both read mint_threshold.
        kind: 'mint',
        amount,
        asset: mintAsset,
        // AND WHETHER THIS OPERATOR IS ALONE. With approvals on, the amount
        // over the threshold and one eligible approver, requireApproval
        // answers `required: false` and the money moves the moment Confirm is
        // pressed. The dialog has to say that, not "nothing moves".
        aloneRule: operatorAloneRule,
      }),
    });
  }, [
    mintAmount, mintAsset, mintTargetId, mintReason, mintTargetKind, mintTargets,
    mintPickedPlayer, mintAction, mintOpId, newMintOpId, showNotification,
    operatorPolicy, operatorAloneRule,
  ]);

  const submitMint = useCallback(async () => {
    if (!mintConfirm) return;
    setMintSubmitting(true);
    try {
      const body = await authFetch('/api/horses/mint', {
        method: 'POST',
        body: JSON.stringify({
          action: mintConfirm.action,
          asset: mintConfirm.asset,
          target: mintConfirm.targetKind,
          targetId: mintConfirm.targetId,
          amount: mintConfirm.amount,
          reason: mintConfirm.reason,
          opId: mintConfirm.opId,
        }),
      });

      // ── 202: SENT FOR APPROVAL, NOTHING MOVED ──────────────────────────
      //
      // requireApproval answers 202 { success: true, pending: true,
      // approvalId, message } and does not touch money (PHASE2-CONTRACTS
      // section 2). `pending` is the branch that has to be read FIRST and
      // read exactly: a body without it is an ordinary execution, and
      // treating one as the other either reports a real mint as "waiting"
      // (so the operator mints it again) or reports a queued request as done
      // (so nobody ever approves it). isPendingApproval owns that test.
      //
      // The ledger is deliberately NOT reloaded here: no row was written to
      // it, and re-reading would only make the panel look like it had
      // checked something.
      if (isPendingApproval(body)) {
        setMintReceipt({
          pending: true,
          approvalId: body.approvalId,
          action: mintConfirm.action,
          asset: mintConfirm.asset,
          amount: mintConfirm.amount,
          target_label: mintConfirm.label,
          target_id: mintConfirm.targetId,
          op_id: mintConfirm.opId,
        });
        setMintConfirm(null);
        showNotification(
          body.message || 'Sent For Approval. Nothing Has Moved Yet.',
          'info',
        );
        resetMintForm();
        return;
      }

      const result = body.result || {};
      // THE RECEIPT IS BUILT FROM WHAT THIS CONSOLE COMPOSED, merged with the
      // balance and supply fields the route documents (mint.js only ever
      // touches ok / reason / balance_before / balance_after / supply_before /
      // supply_after / replayed / ledger_id). It used to read action, asset,
      // amount, target_label and op_id straight off the raw fn_ca_mint return,
      // none of which the route promises: if the RPC does not happen to emit
      // `action`, a successful ISSUANCE renders as "Retired" with a blank
      // amount and no holder. The client already knows all five for certain.
      setMintReceipt({
        ...result,
        action: mintConfirm.action,
        asset: mintConfirm.asset,
        amount: mintConfirm.amount,
        target_label: mintConfirm.label,
        target_id: mintConfirm.targetId,
        op_id: mintConfirm.opId,
        replayed: result.replayed === true,
      });
      setMintConfirm(null);
      showNotification(
        result.replayed
          ? 'Already Done. This Operation Had Already Been Recorded, So Nothing Moved Again.'
          : `${mintConfirm.action === 'mint' ? 'Issued' : 'Retired'} ${formatAmount(mintConfirm.amount, mintConfirm.asset)} ${assetLabel(mintConfirm.asset)} ${mintConfirm.action === 'mint' ? 'To' : 'From'} ${mintConfirm.label}.`,
        'success'
      );
      resetMintForm();
      // Re-read rather than patching local state: the supply figures and the
      // journal are the record, and a panel that guesses at them after a write
      // is how a display drifts from the books. Back to page one, because the
      // operation just recorded is the newest row.
      setMintLedgerOffset(0);
      await loadMintData(0);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setMintSubmitting(false);
    }
  }, [authFetch, mintConfirm, resetMintForm, loadMintData, showNotification]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsError(null);
    try {
      const json = await authFetch('/api/horses/analytics?type=summary');
      setAnalyticsData(json.data || null);
    } catch (err) {
      setAnalyticsError(err.message);
    } finally {
      setAnalyticsLoaded(true);
    }
  }, [authFetch]);

  const loadAntiAbuseData = useCallback(async () => {
    setAbuseLoading(true);
    setAbuseError(null);
    try {
      const data = await authFetch('/api/horses/anti-abuse?section=all');
      setAbuseData(data);
      setAbuseLoaded(true);
    } catch (err) {
      setAbuseError(err.message);
      setAbuseData(EMPTY_ABUSE_DATA);
    } finally {
      setAbuseLoading(false);
    }
  }, [authFetch]);

  /**
   * THE GRINDER LOADER IS GONE (Phase 3).
   *
   * loadGrinderData and goGrinderRosterPage read /api/horses/grinder-stats for
   * the fleet totals and one page of its roster. Fleet Command reads the same
   * fleet from /api/horses/fleet-admin - the roster from the engine's state
   * mirror, hands and profit from the daily rows on its P And L - and it pages
   * that roster with usePagedList. This page fetches nothing about the fleet
   * any more, so there is exactly one number per figure and one route to blame
   * when it looks wrong.
   */

  /**
   * One page of support tickets.
   *
   * This used to be a direct browser query against live_help_tickets with an
   * embedded profiles join and NO limit, running under the operator's own RLS -
   * the one Club Arena read left in the browser after everything else moved
   * server-side. It is now GET /api/horses/club-arena-admin?section=tickets
   * (PHASE1-CONTRACTS item 1): service-role behind the admin gate, with status,
   * a server-side q search over subject and description, and real paging.
   */
  const fetchTicketsPage = useCallback(async ({ limit, offset, filters, signal }) => {
    const params = new URLSearchParams({
      section: 'tickets',
      limit: String(limit),
      offset: String(offset),
    });
    if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters?.q) params.set('q', filters.q);
    const d = await authFetch(`/api/horses/club-arena-admin?${params.toString()}`, { signal });
    return {
      rows: d.rows || d.tickets || [],
      total: typeof d.total === 'number' ? d.total : null,
      // Carried through so the Pager can enable Next from the route's own
      // answer when the route cannot count the set (addendum item 15).
      hasMore: typeof d.hasMore === 'boolean' ? d.hasMore : undefined,
    };
  }, [authFetch]);

  const tickets = usePagedList({
    fetchPage: fetchTicketsPage,
    limit: TICKETS_PER_PAGE,
    initialFilters: { status: 'open', q: '' },
    auto: activeTab === 'bugreports' && !!user,
  });

  const loadGeevesAnalytics = useCallback(async () => {
    setGeevesLoading(true);
    setGeevesError(null);
    try {
      // The old version put `.catch(() => ({ ok: false }))` on each fetch and
      // then called .json() on the result - on a network failure that plain
      // object has no .json and threw a TypeError instead of showing an error.
      const [summary, missed] = await Promise.all([
        authFetch('/api/geeves/analytics?action=summary'),
        authFetch('/api/geeves/analytics?action=top_missed').catch(() => ({ questions: [] })),
      ]);
      setGeevesAnalytics({
        summary: summary.summary || null,
        questions: missed.questions || [],
      });
      setGeevesLoaded(true);
    } catch (err) {
      setGeevesError(err.message);
    } finally {
      setGeevesLoading(false);
    }
  }, [authFetch]);

  /** Same guard as the audit log: a filter change resets the page and reloads,
   *  so the stale request must not be allowed to land last. */
  const reviewsSeqRef = useRef(0);

  const loadAdminReviews = useCallback(async () => {
    const seq = ++reviewsSeqRef.current;
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      // `q` is sent to the route (PHASE1-CONTRACTS item 3), which ilikes
      // review_text and the reviewer username. It used to be a client-side
      // filter over the current 100-row page while looking like a search of the
      // whole table, so a review on page 4 was unfindable.
      const params = new URLSearchParams({
        sort: reviewsFilter,
        limit: String(REVIEWS_PER_PAGE),
        offset: String(reviewsPage * REVIEWS_PER_PAGE),
        ...(reviewsRatingFilter !== 'all' ? { rating: reviewsRatingFilter } : {}),
        ...(reviewsFlaggedOnly ? { flagged: 'true' } : {}),
        ...(reviewsQuery.trim() ? { q: reviewsQuery.trim() } : {}),
      });
      const data = await authFetch(`/api/horses/admin-reviews?${params}`);
      if (seq !== reviewsSeqRef.current) return;
      setReviewsData(data.reviews || []);
      setReviewsStats(data.stats || { total: null, flagged: null, avg_rating: null });
      setReviewsLoaded(true);
    } catch (err) {
      if (seq !== reviewsSeqRef.current) return;
      setReviewsError(err.message);
    } finally {
      if (seq === reviewsSeqRef.current) setReviewsLoading(false);
    }
  }, [authFetch, reviewsFilter, reviewsRatingFilter, reviewsFlaggedOnly, reviewsPage, reviewsQuery]);

  const loadScraperHealth = useCallback(async () => {
    setScraperHealthLoading(true);
    setScraperHealthError(null);
    try {
      const data = await authFetch('/api/admin/scraper-health');
      setScraperHealth(data);
      setScraperHealthLastFetch(new Date());
    } catch (err) {
      setScraperHealthError(err.message);
    } finally {
      setScraperHealthLoading(false);
    }
  }, [authFetch]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLUB ARENA - all of this now goes through the service-role admin route.
  // ═══════════════════════════════════════════════════════════════════════════
  const loadClubArenaData = useCallback(async () => {
    setCaLoading(true);
    setCaError(null);
    setCaWarnings(null);
    try {
      // The cap is sent explicitly (addendum item 10) so the number this panel
      // can show is written down in the code that shows it, and `pages` is
      // kept so every count below is the route's total rather than the length
      // of the array that fitted under the cap.
      const d = await authFetch(`/api/horses/club-arena-admin?section=overview&limit=${CA_OVERVIEW_LIMIT}`);
      setCaStats(d.stats || null);
      setCaClubs(d.clubs || []);
      setCaUnions(d.unions || []);
      setCaPendingCashouts(d.pendingCashouts || []);
      setCaFinance(d.finance || null);
      setCaPages(d.pages || null);
      setCaWarnings(d.failedSources || null);
      setCaLoaded(true);
    } catch (err) {
      setCaError(err.message);
    } finally {
      setCaLoading(false);
    }
  }, [authFetch]);

  // Click club A then club B fast enough and A's late response used to render
  // under B's header. Same shape on the user loaders, where the stale response
  // replaced the whole card including the identity.
  const caReqRef = useRef(0);

  const loadCaClubDetail = useCallback(async (club) => {
    const reqId = ++caReqRef.current;
    setCaSelectedClub(club);
    setCaClubTab('overview');
    setCaClubDetail(null);
    setCaLoading(true);
    try {
      // Flags and sessions come from the anti-cheat route, which owns the
      // review and kick actions too. reviewFlag and kickSession have existed
      // in this file with no caller since the tab was written.
      const [d, flagsRes, sessionsRes] = await Promise.all([
        authFetch(`/api/horses/club-arena-admin?section=club&clubId=${encodeURIComponent(club.id)}&limit=${CA_CLUB_LIMIT}`),
        authFetch('/api/club-arena/anti-cheat', {
          method: 'POST', body: JSON.stringify({ action: 'get_flags', clubId: club.id }),
        }).catch((e) => ({ flags: [], error: e.message })),
        authFetch('/api/club-arena/anti-cheat', {
          method: 'POST', body: JSON.stringify({ action: 'get_sessions', clubId: club.id }),
        }).catch((e) => ({ sessions: [], error: e.message })),
      ]);
      if (reqId !== caReqRef.current) return;
      setCaClubDetail({
        ...d,
        flags: flagsRes.flags || [],
        sessions: sessionsRes.sessions || [],
        securityError: flagsRes.error || sessionsRes.error || null,
      });
      if (d.failedSources) setCaWarnings(d.failedSources);
    } catch (err) {
      if (reqId === caReqRef.current) showNotification(err.message, 'error');
    } finally {
      if (reqId === caReqRef.current) setCaLoading(false);
    }
  }, [authFetch, showNotification]);

  const searchCaUsers = useCallback(async (query) => {
    const q = (query || '').trim();
    if (q.length < 2) { setCaUserResults([]); return; }
    const reqId = ++caReqRef.current;
    setCaUserSearching(true);
    try {
      // The query is sanitized server-side. It used to be interpolated straight
      // into a PostgREST .or() filter string in the browser, where a comma or a
      // parenthesis rewrote the whole filter tree.
      const d = await authFetch(`/api/horses/club-arena-admin?section=user_search&q=${encodeURIComponent(q)}`);
      if (reqId !== caReqRef.current) return;
      setCaUserResults(d.results || []);
    } catch (err) {
      if (reqId !== caReqRef.current) return;
      showNotification(err.message, 'error');
      setCaUserResults([]);
    } finally {
      if (reqId === caReqRef.current) setCaUserSearching(false);
    }
  }, [authFetch, showNotification]);

  const loadCaUserDetail = useCallback(async (profile) => {
    const reqId = ++caReqRef.current;
    setCaSelectedUser({ ...profile, loading: true });
    try {
      const d = await authFetch(`/api/horses/club-arena-admin?section=user&userId=${encodeURIComponent(profile.id)}`);
      if (reqId !== caReqRef.current) return;
      setCaSelectedUser({ ...profile, ...d, loading: false });
    } catch (err) {
      if (reqId !== caReqRef.current) return;
      showNotification(err.message, 'error');
      setCaSelectedUser((prev) => (prev ? { ...prev, loading: false } : null));
    }
  }, [authFetch, showNotification]);

  const toggleClubStatus = useCallback(async (club, newStatus) => {
    setCaProcessing(true);
    const previous = club.status;
    setCaClubs((prev) => prev.map((c) => (c.id === club.id ? { ...c, status: newStatus } : c)));
    try {
      await authFetch('/api/horses/club-arena-admin', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_club_status', clubId: club.id, status: newStatus }),
      });
      if (caSelectedClub?.id === club.id) setCaSelectedClub((p) => ({ ...p, status: newStatus }));
      showNotification(newStatus === 'suspended' ? 'Club Suspended' : 'Club Reactivated');
    } catch (err) {
      // Revert. The old code logged the failure and still said it worked.
      setCaClubs((prev) => prev.map((c) => (c.id === club.id ? { ...c, status: previous } : c)));
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, showNotification]);

  /**
   * The route accepts action 'approve' | 'cancel' and the console only ever
   * sent 'approve'. An admin looking at a fraudulent or mistaken request had
   * no way to release it -- their only options were to pay it or leave it
   * pending forever. 'cancel' is the reversible branch: the chips go back to
   * the player's balance.
   *
   * Opening the dialog is separate from sending, so the confirmation can say
   * what will actually happen. A /horses operator takes the platform-override
   * path of /api/club-arena/approve-cashout, which is the path Phase 2 gates
   * with requireApproval: with approvals on and the amount at or over
   * cashout_threshold the route answers 202 and moves nothing. The
   * thresholdDecision here is the same one the Mint shows, so "Force Approve"
   * reads "This Will Be Sent For Approval" before the click when that is the
   * truth.
   */
  const resolveCashout = useCallback((cashout, action) => {
    setCashoutConfirm({
      cashout,
      action,
      decision: action === 'approve'
        ? thresholdDecision({
          policy: operatorPolicy,
          kind: 'cashout',
          amount: cashout.amount,
          asset: 'chips',
          aloneRule: operatorAloneRule,
        })
        : null,
    });
  }, [operatorPolicy, operatorAloneRule]);

  /** Tag a pending cashout row, wherever it is rendered, with the approval
   *  it is now waiting on. The row STAYS: it has not been paid. */
  const markCashoutPendingApproval = useCallback((cashoutId, approvalId) => {
    const tag = (c) => (c.id === cashoutId ? { ...c, pendingApprovalId: approvalId } : c);
    setCaPendingCashouts((prev) => prev.map(tag));
    setCaClubDetail((prev) => (prev
      ? { ...prev, pendingCashouts: (prev.pendingCashouts || []).map(tag) }
      : prev));
  }, []);

  const submitCashout = useCallback(async () => {
    if (!cashoutConfirm) return;
    const { cashout, action } = cashoutConfirm;
    setCaProcessing(true);
    try {
      const body = await authFetch('/api/club-arena/approve-cashout', {
        method: 'POST',
        body: JSON.stringify({ cashoutId: cashout.id, clubId: cashout.club_id, action }),
      });

      // ── 202: SENT FOR APPROVAL, NO CHIPS HAVE MOVED ────────────────────
      //
      // 202 is `res.ok` and `success` is true, so this used to fall straight
      // through: the row vanished from the only list the operator was
      // looking at, the toast said "Cashout Approved", and the request sat
      // pending in the Approvals queue with nobody told to go there. The
      // player was not paid until somebody noticed. The row is kept and
      // tagged instead, so it renders "Waiting For Approval" in place of its
      // buttons, and the toast says exactly what the route said.
      if (isPendingApproval(body)) {
        markCashoutPendingApproval(cashout.id, body.approvalId);
        setCashoutConfirm(null);
        showNotification(body.message || 'Sent For Approval. No Chips Have Moved.', 'info');
        return;
      }

      setCaPendingCashouts((prev) => prev.filter((c) => c.id !== cashout.id));
      setCaClubDetail((prev) => (prev
        ? { ...prev, pendingCashouts: (prev.pendingCashouts || []).filter((c) => c.id !== cashout.id) }
        : prev));
      setCashoutConfirm(null);
      if (action === 'approve' && body && body.trailClosed === false) {
        // The RPC paid the request; markApprovalExecuted could not close the
        // approval row that authorised it. The money is right and the trail
        // is not, and the operator has to hear the second half.
        showNotification(
          'The Cashout Went Through But The Approval Row Could Not Be Closed. Check The Audit Trail.',
          'info',
        );
      } else {
        showNotification(action === 'approve' ? 'Cashout Approved' : 'Cashout Cancelled, Chips Returned');
      }
      loadBadges();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, cashoutConfirm, markCashoutPendingApproval, showNotification, loadBadges]);


  const loadApplications = useCallback(async (statusFilter = 'pending') => {
    setCaAppLoading(true);
    try {
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify({ action: 'list', statusFilter }),
      });
      setCaApplications(d.applications || []);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaAppLoading(false);
    }
  }, [authFetch, showNotification]);

  const loadLeaveRequests = useCallback(async (statusFilter = 'pending') => {
    setCaLeaveLoading(true);
    try {
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify({ action: 'list_leave_requests', statusFilter }),
      });
      setCaLeaveRequests(d.leaveRequests || []);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaLeaveLoading(false);
    }
  }, [authFetch, showNotification]);

  const reviewApplication = useCallback(async (app, decision) => {
    setCaProcessing(true);
    try {
      const rate = parseFloat(caAppCommission[app.id] ?? 90);
      const body = decision === 'approve'
        ? { action: 'approve', applicationId: app.id, commissionRate: Number.isFinite(rate) ? rate / 100 : 0.9 }
        : { action: 'reject', applicationId: app.id, reason: caAppReason[app.id] || '' };
      const d = await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify(body),
      });
      showNotification(d.message || (decision === 'approve' ? 'Application Approved' : 'Application Rejected'));
      setCaAppReason((prev) => {
        const next = { ...prev };
        delete next[app.id];
        return next;
      });
      loadApplications(caAppTab);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caAppCommission, caAppReason, caAppTab, loadApplications, showNotification]);

  const sendLeaveDecision = useCallback(async (req, decision) => {
    setCaProcessing(true);
    try {
      // The deny button used to send { action: 'reject', applicationId } with a
      // union_leave_requests id, which the route looked up in union_applications
      // and always 404'd. There is a reject_leave action now.
      const body = decision === 'approve'
        ? { action: 'approve_leave', leaveRequestId: req.id }
        : { action: 'reject_leave', leaveRequestId: req.id };
      await authFetch('/api/club-arena/union-application', {
        method: 'POST', body: JSON.stringify(body),
      });
      showNotification(decision === 'approve' ? 'Club Removed From Union' : 'Leave Request Denied');
      loadLeaveRequests(caLeaveTab);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caLeaveTab, loadLeaveRequests, showNotification]);

  /** Approving a leave request removes the club from its union, which is the
   *  irreversible direction, so only that one asks first. */
  const reviewLeaveRequest = useCallback((req, decision) => {
    if (decision !== 'approve') {
      sendLeaveDecision(req, decision);
      return;
    }
    setPendingConfirm({
      title: 'Remove Club From Union',
      body: `Remove ${req.club_name} From ${req.unions?.name || 'The Union'}? This Cannot Be Undone.`,
      confirmLabel: 'Yes, Remove The Club',
      tone: 'danger',
      onConfirm: () => sendLeaveDecision(req, decision),
    });
  }, [sendLeaveDecision]);

  const reviewFlag = useCallback(async (flag, verdict) => {
    setCaProcessing(true);
    try {
      const body = verdict === 'kick'
        ? { action: 'kick_player', clubId: caSelectedClub.id, playerId: flag.user_id, targetUserId: flag.user_id, reason: flag.flag_type }
        : { action: 'review_flag', clubId: caSelectedClub.id, flagId: flag.id, newStatus: verdict === 'dismiss' ? 'dismissed' : 'reviewed', verdict };
      await authFetch('/api/club-arena/anti-cheat', { method: 'POST', body: JSON.stringify(body) });
      showNotification(verdict === 'kick' ? 'Player Kicked' : `Flag Marked ${verdict === 'dismiss' ? 'Dismissed' : 'Reviewed'}`);
      loadCaClubDetail(caSelectedClub);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, loadCaClubDetail, showNotification]);

  const kickSession = useCallback(async (session) => {
    setCaProcessing(true);
    try {
      await authFetch('/api/club-arena/anti-cheat', {
        method: 'POST',
        body: JSON.stringify({
          action: 'kick_player', clubId: caSelectedClub.id,
          playerId: session.user_id, targetUserId: session.user_id, reason: 'admin_kick',
        }),
      });
      showNotification('Player Kicked');
      loadCaClubDetail(caSelectedClub);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCaProcessing(false);
    }
  }, [authFetch, caSelectedClub, loadCaClubDetail, showNotification]);

  const loadPlatform = useCallback(async () => {
    setPlatformLoading(true);
    setPlatformError(null);
    try {
      const d = await authFetch('/api/horses/club-arena-admin?section=platform');
      setPlatform(d.platform || null);
    } catch (err) {
      setPlatformError(err.message);
    } finally {
      setPlatformLoading(false);
    }
  }, [authFetch]);

  const loadCaLedger = useCallback(async () => {
    setCaLedgerLoading(true);
    setCaLedgerError(null);
    try {
      setCaLedger(await authFetch(`/api/horses/club-arena-admin?section=ledger&limit=${CA_LEDGER_LIMIT}`));
    } catch (err) {
      setCaLedgerError(err.message);
    } finally {
      setCaLedgerLoading(false);
    }
  }, [authFetch]);

  const loadCaRevenue = useCallback(async () => {
    setCaRevenueLoading(true);
    setCaRevenueError(null);
    try {
      setCaRevenue(await authFetch('/api/horses/club-arena-admin?section=revenue'));
    } catch (err) {
      setCaRevenueError(err.message);
    } finally {
      setCaRevenueLoading(false);
    }
  }, [authFetch]);


  // ── Avatar generation ──
  // /api/horses/generate-avatars has existed, fully built and admin-gated,
  // with NO caller anywhere in the application. It generates and uploads an
  // avatar for horses where avatar_url IS NULL AND profile_id IS NOT NULL,
  // serially, with a 2 second pause between each -- so batches are small and
  // the operator runs it repeatedly.
  const AVATAR_BATCH = 5;
  const runGenerateAvatars = async () => {
    setAvatarBusy(true);
    setAvatarResult(null);
    try {
      const d = await authFetch(`/api/horses/generate-avatars?limit=${AVATAR_BATCH}`, { method: 'POST' });
      // The "nothing eligible" branch returns no `success` key at all, so do
      // not test for one.
      setAvatarResult(d);
      const made = d.generated || 0;
      const failedCount = (d.results || []).filter((r) => !r.success).length;
      showNotification(
        made === 0
          ? (d.message || 'No Horses Were Eligible')
          : `${num(made)} Avatars Generated${failedCount ? `, ${num(failedCount)} Failed` : ''}`,
        failedCount ? 'info' : 'success',
      );
      if (made > 0) loadData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const generateAvatars = () => {
    setPendingConfirm({
      title: 'Generate Avatars',
      body: `Generate Avatars For Up To ${AVATAR_BATCH} Horses? Each One Calls A Paid Image API `
        + 'And Takes Roughly 15 To 25 Seconds, So This Batch May Take A Couple Of Minutes. '
        + 'Horses That Already Have An Avatar Are Never Touched.',
      confirmLabel: `Yes, Generate Up To ${AVATAR_BATCH}`,
      tone: 'go',
      onConfirm: runGenerateAvatars,
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MUTATIONS - every one of these reverts its optimistic update on failure.
  // ═══════════════════════════════════════════════════════════════════════════
  // EVERY WRITE BELOW NOW GOES THROUGH /api/horses/stable-admin.
  //
  // They used to go straight from the browser to PostgREST, and every one of
  // them was a SILENT NO-OP. `content_authors` is gated on
  // `profiles.is_admin = true`, which is true for ZERO rows in production --
  // the three real admin accounts are identified by `profiles.role`. A
  // PostgREST update matching zero rows returns `{ error: null }`, so the
  // optimistic update stuck, the toast said "saved", and nothing had been.
  // The service-role route validates, writes, reports the affected row count,
  // and records an admin_audit_log entry.
  const togglePersona = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: newStatus } : p)));
    try {
      await authFetch('/api/horses/stable-admin', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_active', id, is_active: newStatus }),
      });
      showNotification(`Horse ${newStatus ? 'Activated' : 'Rested'}`);
      broadcastUpdate('horses-updated');
    } catch (err) {
      setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: currentStatus } : p)));
      showNotification(err.message, 'error');
    }
  };

  /**
   * Send a bulk action in batches of BULK_CHUNK ids and report the result
   * HONESTLY.
   *
   * The route caps a call at 500 ids (PHASE1-CONTRACTS item 6) against a fleet
   * that is over 1,000, so "Select All Filtered" followed by any bulk action
   * used to fail outright with nothing applied. Chunking makes the whole
   * selection reachable, and it introduces a failure mode that did not exist
   * before: chunk 1 can succeed and chunk 2 fail. That is aggregated rather
   * than hidden - the caller is told how many were applied, how many were
   * requested, and what the first failure said.
   */
  const runBulkInChunks = useCallback(async (buildBody, ids) => {
    let affected = 0;
    let requested = 0;
    let failedIds = 0;
    let firstError = null;
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      try {
        // eslint-disable-next-line no-await-in-loop
        const d = await authFetch('/api/horses/stable-admin', {
          method: 'POST',
          body: JSON.stringify(buildBody(chunk)),
        });
        affected += d.affected || 0;
        requested += d.requested || chunk.length;
      } catch (err) {
        failedIds += chunk.length;
        requested += chunk.length;
        if (!firstError) firstError = err.message;
      }
    }
    return { affected, requested, failedIds, firstError };
  }, [authFetch]);

  /** Turn a chunked result into one sentence that never overstates the write. */
  const bulkSummary = (label, result) => {
    const { affected, requested, failedIds, firstError } = result;
    if (failedIds > 0) {
      return {
        message: `${label}: ${num(affected, '0')} Of ${num(requested)} Updated. ${num(failedIds)} Could Not Be Sent: ${firstError}`,
        tone: 'error',
      };
    }
    const missed = requested - affected;
    return missed > 0
      ? { message: `${label}: ${num(affected, '0')} Updated, ${num(missed)} No Longer Exist`, tone: 'info' }
      : { message: `${label}: ${num(affected, '0')} Updated`, tone: 'success' };
  };

  /**
   * Reverts, by ID SET rather than by restoring a whole snapshot.
   *
   * `const snapshot = personas` captures the roster at call time, and the
   * two-second sync tick can replace `personas` while the request is in
   * flight - so putting the snapshot back on a failure clobbered every row
   * that had been refreshed meanwhile. These two touch only the rows the
   * failed write touched and leave the rest of the roster alone.
   */
  const revertActiveForRows = useCallback((rows) => {
    const previous = new Map(rows.map((p) => [p.id, p.is_active]));
    setPersonas((prev) => prev.map((p) => (previous.has(p.id)
      ? { ...p, is_active: previous.get(p.id) }
      : p)));
  }, []);

  /** Put optimistically removed rows back, in the loader's own order (name,
   *  then id), without disturbing anything fetched since. */
  const restorePersonaRows = useCallback((rows) => {
    setPersonas((prev) => {
      const present = new Set(prev.map((p) => p.id));
      const missing = rows.filter((p) => !present.has(p.id));
      if (!missing.length) return prev;
      return [...prev, ...missing].sort((a, b) => (
        String(a.name || '').localeCompare(String(b.name || ''))
        || String(a.id).localeCompare(String(b.id))
      ));
    });
  }, []);

  /** Apply an active/rest change to an explicit set of horses. */
  const setActiveForIds = async (ids, activate, label) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const touched = personas.filter((p) => idSet.has(p.id));
    setPersonas((prev) => prev.map((p) => (idSet.has(p.id) ? { ...p, is_active: activate } : p)));
    setBulkBusy(true);
    try {
      const result = await runBulkInChunks(
        (chunk) => ({ action: 'bulk_active', ids: chunk, is_active: activate }),
        ids,
      );
      // Nothing landed at all: this is the same outcome the un-chunked call had
      // on a failure, so put the touched rows back the way they were.
      if (result.affected === 0 && result.firstError) {
        revertActiveForRows(touched);
        showNotification(result.firstError, 'error');
        return;
      }
      const summary = bulkSummary(label, result);
      showNotification(summary.message, summary.tone);
      broadcastUpdate('horses-updated');
      loadData();
    } catch (err) {
      revertActiveForRows(touched);
      showNotification(err.message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleAllPersonas = async (activate) => {
    // BOTH DIRECTIONS CONFIRM. Resting all 593 horses stops the content engine
    // and the grinder fleet; activating them all starts the engine and seats
    // the whole fleet, which moves real chips out of club treasuries. Only the
    // first of those used to ask.
    const ids = personas.map((p) => p.id).filter((id) => id !== undefined && id !== null);
    if (!ids.length) return;
    setPendingConfirm({
      title: activate ? 'Activate Every Horse' : 'Rest Every Horse',
      body: activate
        ? `Activate All ${num(ids.length)} Horses? This Starts The Content Engine And Seats The Whole Grinder Fleet, Which Buys In From Club Treasuries.`
        : `Rest All ${num(ids.length)} Horses? This Stops The Content Engine And Takes The Whole Grinder Fleet Off The Tables.`,
      confirmLabel: activate ? 'Yes, Activate All' : 'Yes, Rest All',
      tone: activate ? 'go' : 'danger',
      onConfirm: () => setActiveForIds(ids, activate, activate ? 'All Horses Activated' : 'All Horses Rested'),
    });
  };

  const runDelete = async (id, name) => {
    const removed = personas.filter((p) => p.id === id);
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    try {
      await authFetch('/api/horses/stable-admin', {
        method: 'POST', body: JSON.stringify({ action: 'delete_horse', id }),
      });
      showNotification(`${name} Retired`, 'info');
      broadcastUpdate('horses-updated');
    } catch (err) {
      restorePersonaRows(removed);
      showNotification(err.message, 'error');
    }
  };

  const handleDelete = (id, name) => {
    // Irreversible: there is no soft-delete column on content_authors. The
    // route writes the whole row into admin_audit_log before removing it, so
    // a mistake is at least recoverable by hand.
    setPendingConfirm({
      title: `Retire ${name}`,
      body: `Retire ${name}? This Permanently Deletes The Horse. It Cannot Be Undone From This Panel.`,
      confirmLabel: 'Yes, Retire',
      tone: 'danger',
      onConfirm: () => runDelete(id, name),
    });
  };

  const runBulkDelete = async (ids) => {
    const idSet = new Set(ids);
    const removed = personas.filter((p) => idSet.has(p.id));
    setPersonas((prev) => prev.filter((p) => !idSet.has(p.id)));
    setBulkBusy(true);
    try {
      const result = await runBulkInChunks((chunk) => ({ action: 'bulk_delete', ids: chunk }), ids);
      if (result.affected === 0 && result.firstError) {
        restorePersonaRows(removed);
        showNotification(result.firstError, 'error');
        return;
      }
      setSelectedIds(new Set());
      const summary = bulkSummary('Retired', result);
      showNotification(summary.message, summary.tone === 'success' ? 'info' : summary.tone);
      broadcastUpdate('horses-updated');
      loadData();
    } catch (err) {
      restorePersonaRows(removed);
      showNotification(err.message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setPendingConfirm({
      title: `Retire ${num(ids.length)} Horses`,
      body: `Retire ${num(ids.length)} Horses? This Permanently Deletes Them. It Cannot Be Undone From This Panel.`,
      confirmLabel: `Yes, Retire ${num(ids.length)}`,
      tone: 'danger',
      // Typed, because one click on a bulk action is too cheap for a
      // permanent delete of a selection the operator may not have re-read.
      requireTyped: 'RETIRE',
      onConfirm: () => runBulkDelete(ids),
    });
  };

  const openCreateModal = () => { setEditingPersona(null); setPersonaForm(EMPTY_PERSONA); setShowCreateModal(true); };
  const openEditModal = (persona) => {
    setEditingPersona(persona);
    setPersonaForm({
      name: persona.name || '', gender: persona.gender || 'male',
      location: persona.location || '', specialty: persona.specialty || 'cash_games',
      stakes: persona.stakes || '', bio: persona.bio || '', voice: persona.voice || 'casual',
    });
    setShowCreateModal(true);
  };

  const handleSavePersona = async (e) => {
    e.preventDefault();
    setSavingPersona(true);
    try {
      if (editingPersona) {
        const d = await authFetch('/api/horses/stable-admin', {
          method: 'POST',
          body: JSON.stringify({ action: 'update_horse', id: editingPersona.id, horse: personaForm }),
        });
        setPersonas((prev) => prev.map((p) => (p.id === d.horse.id ? d.horse : p)));
        showNotification(`${d.horse.name} Updated`);
      } else {
        const d = await authFetch('/api/horses/stable-admin', {
          method: 'POST',
          body: JSON.stringify({ action: 'create_horse', horse: { ...personaForm, is_active: true } }),
        });
        setPersonas((prev) => [d.horse, ...prev]);
        showNotification(`${d.horse.name} Stabled`);
      }
      setShowCreateModal(false);
      setEditingPersona(null);
      setPersonaForm(EMPTY_PERSONA);
      broadcastUpdate('horses-updated');
    } catch (err) {
      showNotification(err.message || 'Could Not Save Horse', 'error');
    } finally {
      setSavingPersona(false);
    }
  };

  // ── Settings ──
  // Writes are debounced. Previously every keystroke and every tick of the
  // temperature slider fired its own content_settings upsert, and clearing a
  // number input wrote NaN straight to the row.
  const settingsTimer = useRef(null);
  const pendingSettings = useRef(null);

  const flushSettings = useCallback(async () => {
    const payload = pendingSettings.current;
    if (!payload) return;
    pendingSettings.current = null;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      // content_settings writes are service_role ONLY in production, so the
      // browser upsert this replaces never wrote a single byte -- every
      // posts-per-day, delay, model, temperature and grinder-* change the
      // operator has ever made was discarded silently.
      const d = await authFetch('/api/horses/stable-admin', {
        method: 'POST', body: JSON.stringify({ action: 'save_settings', settings: payload }),
      });
      if (d.settings) setSettings((prev) => ({ ...prev, ...d.settings }));
      setSettingsSavedAt(new Date());
      broadcastUpdate('horses-settings-updated');
    } catch (err) {
      setSettingsError(err.message);
      showNotification(`Setting Not Saved: ${err.message}`, 'error');
    } finally {
      setSettingsSaving(false);
    }
  }, [authFetch, broadcastUpdate, showNotification]);

  const updateSetting = useCallback((key, value) => {
    // Reject NaN before it reaches state, let alone the database.
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      pendingSettings.current = next;
      return next;
    });
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(flushSettings, 700);
  }, [flushSettings]);

  useEffect(() => () => {
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
  }, []);

  // The Create/Edit Horse dialog's keyboard behaviour used to live here as a
  // hand-rolled effect with Escape, focus move and focus restore but NO focus
  // trap, so Tab from inside it walked straight into the sixteen nav buttons
  // behind it. All three dialogs on this page use src/components/horses/Modal
  // now, which owns the trap, the scroll lock and the restore.

  /**
   * FLEET STATUS IS GONE FROM THIS FILE (Phase 3).
   *
   * It read /api/club-arena/horse-launch, action status, which counts horses by
   * profiles.horse_status and live tables by a `tables` count. Fleet Command
   * answers the same four questions from fn_ca_fleet_overview, so keeping this
   * would have put two Horses Seated and two Cash Tables Live on one console,
   * from two different tables, disagreeing whenever the engine's state mirror
   * lagged behind the seats. The route is unchanged and still returns both the
   * new names and its legacy aliases (PHASE1-CONTRACTS addendum item 13); this
   * console just has one place it asks about the fleet now.
   */

  // ── AUDIT LOG ─────────────────────────────────────────────────────────
  //
  // New surface. The platform wrote to admin_audit_log from three routes and
  // read it from NOWHERE -- nine rows across five months, visible to nobody.
  // Now that every mutating admin route files an entry, this is the tab that
  // makes the trail answerable: who approved that cashout, who kicked that
  // player, who launched the fleet at 3am.
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditTotal, setAuditTotal] = useState(null);
  // total may be null; hasMore is the route's own answer and is what enables
  // Next when nothing can count the set.
  const [auditHasMore, setAuditHasMore] = useState(undefined);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditPage, setAuditPage] = useState(0);
  const [auditPrefix, setAuditPrefix] = useState('');
  const [auditDays, setAuditDays] = useState('90');
  const [auditExpanded, setAuditExpanded] = useState(null);
  const [auditAdmin, setAuditAdmin] = useState('');
  const [auditActors, setAuditActors] = useState([]);
  // "What happened to THIS club / THIS user / THIS ticket" is the second
  // question an audit log exists to answer and the tab could not express it.
  // From/To make the window explicit rather than "the last N days from now".
  //
  // TWO STATES EACH, like the reviews search: `*Input` is what the operator
  // is typing, `auditTarget` / `auditTargetType` is what the query reads, and
  // a 300 ms debounce joins them. Keyed straight off the input, typing a
  // 36-character uuid issued 36 audit_log POSTs (each an exact `eq` on a
  // partial id, each returning nothing) and a fast typist met the route's
  // rate limit as one error toast per keystroke.
  const [auditTargetInput, setAuditTargetInput] = useState('');
  const [auditTarget, setAuditTarget] = useState('');
  // Target TYPE alongside target id (PHASE2-CONTRACTS section 2). An id on its
  // own is ambiguous across tables; "club" plus that id is one record.
  const [auditTargetTypeInput, setAuditTargetTypeInput] = useState('');
  const [auditTargetType, setAuditTargetType] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditExporting, setAuditExporting] = useState(null);
  const AUDIT_PAGE_SIZE = 100;

  // ── One record's full history (the "Trail" action) ──
  //
  // A row of the audit log answers "what happened at 14:02". The question an
  // investigation actually asks is "everything that has ever happened to THIS
  // club", and the log could not express it: filtering by target id required
  // copying an id out of one row and pasting it into a filter, which loses
  // the target TYPE and therefore matches other tables' ids too. This reads
  // fn_ca_operator_audit_trail for the exact (type, id) pair on the row.
  const [auditTrailFor, setAuditTrailFor] = useState(null); // { targetType, targetId }
  const [auditTrailRows, setAuditTrailRows] = useState([]);
  const [auditTrailTotal, setAuditTrailTotal] = useState(null);
  const [auditTrailHasMore, setAuditTrailHasMore] = useState(undefined);
  const [auditTrailOffset, setAuditTrailOffset] = useState(0);
  const [auditTrailLoading, setAuditTrailLoading] = useState(false);
  const [auditTrailError, setAuditTrailError] = useState(null);
  /** Monotonic, so a trail request for one record can never land under
   *  another record's dialog. Bumped by every open and every page. */
  const auditTrailSeqRef = useRef(0);

  /** The filter set as the route wants it (PHASE1-CONTRACTS item 4). Explicit
   *  From/To win over the quick range; `days` is only sent when neither is set,
   *  so the window is never filtered twice by two different rules. */
  const auditQuery = useMemo(() => {
    const q = {
      // A GROUP, not a single prefix: the trail was namespaced in Phase 1, so
      // "Horse Records" has to ask for horse.* AND the pre-rename vocabulary
      // or it hides the older half of its own history. auditFilters.js owns
      // the table; the route ORs the `like` filters (addendum item 14).
      ...auditActionFilter(auditPrefix),
      adminId: auditAdmin || undefined,
      targetId: auditTarget.trim() || undefined,
      targetType: auditTargetType.trim() || undefined,
    };
    if (auditFrom) q.from = auditFrom;
    if (auditTo) q.to = auditTo;
    if (!auditFrom && !auditTo && auditDays) q.days = auditDays;
    return q;
  }, [auditPrefix, auditAdmin, auditTarget, auditTargetType, auditFrom, auditTo, auditDays]);

  /** Monotonic sequence guard. A filter change resets the page AND reloads, so
   *  two requests can be in flight at once; without this the slower one wins
   *  and the operator reads page 4 of the old filter under the new one's
   *  heading. usePagedList solves this properly; these two hand-rolled loaders
   *  borrow the same idea. */
  const auditSeqRef = useRef(0);

  const loadAuditLog = useCallback(async () => {
    const seq = ++auditSeqRef.current;
    setAuditLoading(true);
    try {
      const d = await authFetch('/api/horses/stable-admin', {
        method: 'POST',
        body: JSON.stringify({
          action: 'audit_log',
          ...auditQuery,
          limit: AUDIT_PAGE_SIZE,
          offset: auditPage * AUDIT_PAGE_SIZE,
          page: auditPage,
        }),
      });
      if (seq !== auditSeqRef.current) return;
      // `rows` is the Phase 1 name, `entries` the legacy one kept beside it.
      setAuditEntries(d.rows || d.entries || []);
      setAuditTotal(d.total ?? null);
      setAuditHasMore(typeof d.hasMore === 'boolean' ? d.hasMore : undefined);
      // The actor list comes from the route (a cached distinct query), and is
      // only replaced when the route sends one, so a filtered response cannot
      // empty the dropdown the operator is filtering with.
      if (Array.isArray(d.actors)) setAuditActors(d.actors);
      setAuditLoaded(true);
    } catch (err) {
      if (seq !== auditSeqRef.current) return;
      showNotification(err.message, 'error');
    } finally {
      if (seq === auditSeqRef.current) setAuditLoading(false);
    }
  }, [authFetch, showNotification, auditQuery, auditPage]);

  /**
   * The audit CSV used to be "whatever 100 rows are on screen", without
   * details, before_state or after_state - the three columns that say what
   * actually changed. This walks the route's own offset until it has `total`
   * and carries the JSON columns as JSON strings.
   */
  const exportAuditLog = useCallback(async () => {
    setAuditExporting({ fetched: 0, total: auditTotal });
    try {
      const result = await exportAllCsv({
        filenamePrefix: 'admin-audit-log',
        limit: EXPORT_PAGE_SIZE,
        onProgress: (p) => setAuditExporting(p),
        jsonColumns: ['details', 'before_state', 'after_state'],
        fetchPage: async (offset, limit) => {
          const d = await authFetch('/api/horses/stable-admin', {
            method: 'POST',
            body: JSON.stringify({
              action: 'audit_log',
              ...auditQuery,
              limit,
              offset,
              page: Math.floor(offset / limit),
            }),
          });
          return { rows: d.rows || d.entries || [], total: d.total ?? null };
        },
        columns: [
          ['created_at', 'When'],
          ['admin_name', 'Admin'],
          ['admin_user_id', 'Admin ID'],
          ['admin_role', 'Role'],
          ['action', 'Action'],
          ['target_type', 'Target Type'],
          ['target_id', 'Target'],
          // WHERE FROM, WITH WHAT, AND WHICH REQUEST. The route returns all
          // three on every row now (PHASE2-CONTRACTS section 2), and an
          // export that drops them cannot answer "was that the same session".
          ['ip_address', 'IP'],
          ['user_agent', 'User Agent'],
          ['request_id', 'Request ID'],
          ['details', 'Details'],
          ['before_state', 'Before State'],
          ['after_state', 'After State'],
        ],
      });
      showNotification(
        result.complete
          ? `Exported ${num(result.exported)} Audit Entries`
          : `Exported ${num(result.exported)} Audit Entries. The Export Stopped At Its Page Cap And Is Incomplete.`,
        result.complete ? 'success' : 'info',
      );
    } catch (err) {
      showNotification(`Export Failed: ${err.message}`, 'error');
    } finally {
      setAuditExporting(null);
    }
  }, [authFetch, auditQuery, auditTotal, showNotification]);

  /**
   * One page of a single record's trail.
   *
   * auditTrailUrl returns NULL when there is no target id, and that is the
   * whole guard: a trail request with no id is a request for every audit row
   * ever written, which is not what a per-row button means. The dialog says
   * so rather than opening onto a list of the wrong thing.
   */
  const loadAuditTrail = useCallback(async (target, offset) => {
    // ONE SEQUENCE NUMBER, SO THE SLOWER ANSWER LOSES. Click Trail on row A,
    // then on row B, and without this the slower answer for A lands under the
    // dialog titled B: one record shown with another record's history, on the
    // dialog an operator opens precisely to establish what happened to a
    // record. usePagedList has had this guard since Phase 1.
    auditTrailSeqRef.current += 1;
    const seq = auditTrailSeqRef.current;
    const url = auditTrailUrl({
      targetType: target?.targetType,
      targetId: target?.targetId,
      limit: AUDIT_TRAIL_PAGE_SIZE,
      offset,
    });
    if (!url) {
      setAuditTrailRows([]);
      setAuditTrailTotal(null);
      setAuditTrailHasMore(undefined);
      setAuditTrailError('This Entry Records No Target Type And Id, So It Names No Record To Trail.');
      return;
    }
    setAuditTrailLoading(true);
    setAuditTrailError(null);
    try {
      const d = await authFetch(url);
      if (seq !== auditTrailSeqRef.current) return;
      setAuditTrailRows(rowsOf(d, 'entries', 'trail'));
      setAuditTrailTotal(typeof d.total === 'number' ? d.total : null);
      setAuditTrailHasMore(typeof d.hasMore === 'boolean' ? d.hasMore : undefined);
    } catch (err) {
      if (seq !== auditTrailSeqRef.current) return;
      setAuditTrailRows([]);
      setAuditTrailHasMore(undefined);
      setAuditTrailError(err.message || 'The Trail Could Not Be Read.');
    } finally {
      if (seq === auditTrailSeqRef.current) setAuditTrailLoading(false);
    }
  }, [authFetch]);

  const openAuditTrail = useCallback((entry) => {
    const target = {
      targetType: entry?.target_type || '',
      targetId: entry?.target_id || '',
    };
    setAuditTrailFor(target);
    setAuditTrailOffset(0);
    setAuditTrailRows([]);
    setAuditTrailTotal(null);
    setAuditTrailHasMore(undefined);
    setAuditTrailError(null);
    loadAuditTrail(target, 0);
  }, [loadAuditTrail]);

  const goAuditTrailPage = useCallback((offset) => {
    const next = Math.max(0, offset);
    setAuditTrailOffset(next);
    if (auditTrailFor) loadAuditTrail(auditTrailFor, next);
  }, [auditTrailFor, loadAuditTrail]);

  // Goes through /api/horses/stable-admin rather than straight to PostgREST.
  // The direct call it replaces was the last unaudited mutation in this
  // console, and -- because PostgREST answers a zero-row UPDATE with
  // { error: null } -- it reported "Ticket Marked Resolved" even on the runs
  // where the row was invisible to the caller and nothing was written. The
  // route checks the affected row count and files the change in
  // admin_audit_log, so both of those failure modes are now impossible.
  const updateBugReportStatus = async (ticketId, newStatus) => {
    try {
      await authFetch('/api/horses/stable-admin', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_ticket_status', id: ticketId, status: newStatus }),
      });
    } catch (err) {
      showNotification(`Could Not Update Ticket: ${err.message}`, 'error');
      return;
    }
    showNotification(`Ticket Marked ${newStatus === 'resolved' ? 'Resolved' : 'Open'}`);
    // Re-read the page rather than patching a row: under a status filter the
    // ticket has just left the current view, and patching it in place would
    // leave a resolved ticket sitting in the Open queue.
    tickets.refresh();
    loadBadges();
  };

  const markGeevesQuestionResolved = async (id, addedToKB) => {
    // The live eventBus feed synthesises `live-<timestamp>` ids for questions
    // that have not come back from the API yet. geeves_missed_questions.id is
    // a bigint, so posting one produced a Postgres 22P02 and a 500. Those rows
    // are display-only until a real id arrives.
    if (typeof id === 'string' && id.startsWith('live-')) {
      showNotification('This Question Is Still Arriving. Refresh, Then Mark It.', 'info');
      return;
    }
    setGeevesMarkingId(id);
    try {
      await authFetch('/api/geeves/analytics', {
        method: 'POST',
        body: JSON.stringify({ action: 'mark_resolved', id, added_to_kb: addedToKB }),
      });
      setGeevesAnalytics((prev) => ({ ...prev, questions: prev.questions.filter((q) => q.id !== id) }));
      eventBus.emit(EventType.GEEVES_KB_UPDATED, { questionId: id, addedToKB }, 'GeevesAdmin');
      showNotification(addedToKB ? 'Marked As Added To KB' : 'Marked As Resolved');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setGeevesMarkingId(null);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (reviewsDeleteConfirm !== reviewId) { setReviewsDeleteConfirm(reviewId); return; }
    setReviewsProcessing(true);
    try {
      await authFetch(`/api/horses/admin-reviews?review_id=${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
      setReviewsData((prev) => prev.filter((r) => r.id !== reviewId));
      setReviewsStats((prev) => ({ ...prev, total: prev.total === null ? null : Math.max(0, prev.total - 1) }));
      showNotification('Review Deleted');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setReviewsProcessing(false);
      setReviewsDeleteConfirm(null);
    }
  };

  const handleFlagReview = async (reviewId, action) => {
    setReviewsProcessing(true);
    try {
      await authFetch('/api/horses/admin-reviews', {
        method: 'PATCH', body: JSON.stringify({ review_id: reviewId, action }),
      });
      setReviewsData((prev) => prev.map((r) => (r.id === reviewId
        ? { ...r, is_flagged: action === 'flag', flag_reason: action === 'flag' ? 'Admin Flagged' : null }
        : r)));
      showNotification(action === 'flag' ? 'Review Flagged' : 'Flag Removed');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setReviewsProcessing(false);
    }
  };

  const createPromoCode = async (e) => {
    e.preventDefault();
    setPromoCreating(true);
    try {
      const data = await authFetch('/api/promo/admin-promo-codes', {
        method: 'POST',
        // Same zone correction as the edit form: the operator picked an
        // instant on their clock, so that is the instant that is sent.
        body: JSON.stringify({ ...promoForm, expiresAt: localInputToIso(promoForm.expiresAt) }),
      });
      showNotification(`Promo Code ${data.code?.code || ''} Created`.trim());
      setPromoForm({ code: '', description: '', type: 'signup_bonus', value: 100, maxUses: '', expiresAt: '' });
      await loadPromoCodes();
      window.dispatchEvent(new CustomEvent('promo-codes-updated'));
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setPromoCreating(false);
    }
  };

  const openPromoEdit = (code) => {
    setPromoEditing(code);
    setPromoEditForm({
      // PATCH takes the snake_case column names, unlike POST which takes
      // camelCase. Mirroring the column names here keeps the mapping honest.
      code: code.code || '',
      description: code.description || '',
      reward_type: code.reward_type || code.type || 'diamonds',
      reward_value: code.reward_value ?? code.value ?? 0,
      max_uses: code.max_uses ?? '',
      expires_at: toLocalDateTimeInput(code.expires_at),
    });
  };

  const savePromoEdit = async (e) => {
    e.preventDefault();
    if (!promoEditing || !promoEditForm) return;
    setPromoSaving(true);
    try {
      const body = { id: promoEditing.id, ...promoEditForm };
      // Empty string clears the cap and the expiry; the route treats '' and
      // null the same way for both.
      if (body.max_uses === '') body.max_uses = null;
      // Sent as an absolute instant, not as the zoneless string the input
      // holds: the route resolves a zoneless value against the server's clock.
      body.expires_at = localInputToIso(body.expires_at);
      body.reward_value = parseInt(body.reward_value, 10) || 0;
      await authFetch('/api/promo/admin-promo-codes', { method: 'PATCH', body: JSON.stringify(body) });
      showNotification(`Promo Code ${body.code} Saved`);
      setPromoEditing(null);
      setPromoEditForm(null);
      await loadPromoCodes();
      window.dispatchEvent(new CustomEvent('promo-codes-updated'));
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setPromoSaving(false);
    }
  };

  const togglePromoCode = async (code) => {
    try {
      await authFetch('/api/promo/admin-promo-codes', {
        method: 'PATCH', body: JSON.stringify({ id: code.id, is_active: !code.is_active }),
      });
      showNotification(`Code ${code.is_active ? 'Deactivated' : 'Activated'}`);
      await loadPromoCodes();
      window.dispatchEvent(new CustomEvent('promo-codes-updated'));
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECTS - realtime, lazy tab loads, polling
  // ═══════════════════════════════════════════════════════════════════════════

  // Refs so the realtime handlers never close over a stale value. The old
  // subscription read `caLoaded` from the closure created at mount, where it
  // was always false, so Club Arena data never auto-refreshed.
  const loadDataRef = useRef(loadData);
  const caLoadedRef = useRef(caLoaded);
  const loadCaRef = useRef(loadClubArenaData);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);
  useEffect(() => { caLoadedRef.current = caLoaded; }, [caLoaded]);
  useEffect(() => { loadCaRef.current = loadClubArenaData; }, [loadClubArenaData]);

  useEffect(() => {
    if (!user) return undefined;
    loadData();
    loadPromoCodes();
    loadBadges();
  }, [user, loadData, loadPromoCodes, loadBadges]);

  // ── Cross-tab and in-app sync. Always listening: these are the paths that
  //    actually carry this panel's own mutations between tabs.
  //
  //    The REFETCH is now conditional. Every sync tick re-read the whole
  //    content_authors roster, on every tab - including the fourteen that do
  //    not render a horse. Only Social Horses and Statistics read `personas`,
  //    so only those two pay for a refresh; anywhere else the tick is recorded
  //    and the roster is re-read the next time one of them is opened. ──
  const rosterTabActive = activeTab === 'stable' || activeTab === 'stats';
  const rosterTabActiveRef = useRef(rosterTabActive);
  const rosterStaleRef = useRef(false);
  useEffect(() => { rosterTabActiveRef.current = rosterTabActive; }, [rosterTabActive]);
  useEffect(() => {
    if (rosterTabActive && rosterStaleRef.current) {
      rosterStaleRef.current = false;
      loadDataRef.current();
    }
  }, [rosterTabActive]);

  useEffect(() => {
    if (!user) return undefined;
    let coreTimer = null;
    const refreshCore = () => {
      if (!rosterTabActiveRef.current) { rosterStaleRef.current = true; return; }
      if (coreTimer) return;
      coreTimer = setTimeout(() => { coreTimer = null; loadDataRef.current(); }, 2000);
    };
    const cleanupBc = listenBroadcast(SYNC_CHANNEL, (msg) => {
      if (msg?.type === 'sync_update') refreshCore();
    });
    window.addEventListener('horses-updated', refreshCore);
    window.addEventListener('horses-grinder-updated', refreshCore);
    window.addEventListener('horses-settings-updated', refreshCore);
    const unsubMutated = eventBus.on(EventType.DATA_MUTATED, refreshCore);
    return () => {
      if (coreTimer) clearTimeout(coreTimer);
      cleanupBc();
      window.removeEventListener('horses-updated', refreshCore);
      window.removeEventListener('horses-grinder-updated', refreshCore);
      window.removeEventListener('horses-settings-updated', refreshCore);
      unsubMutated();
    };
  }, [user]);

  // ── Supabase realtime, scoped to the one tab that renders live table data.
  //
  //    THE OLD SUBSCRIPTION WAS EXACTLY INVERTED. Checked against
  //    pg_publication_tables for `supabase_realtime`: content_authors,
  //    content_settings and pipeline_runs are NOT published, so those three
  //    handlers could never fire and the coalescing built for them was dead
  //    code. `tables` IS published, holds ~89,000 rows with seats turning over
  //    every hand, and was subscribed unconditionally from mount -- so an
  //    admin sitting on the Social Horses tab was taking every table event on
  //    the platform over the socket for as long as the tab stayed open. ──
  useEffect(() => {
    if (!user || activeTab !== 'clubarena') return undefined;
    let caTimer = null;
    const refreshCa = () => {
      if (!caLoadedRef.current || caTimer) return;
      caTimer = setTimeout(() => { caTimer = null; loadCaRef.current(); }, 5000);
    };
    const channel = supabase
      .channel('horses-club-arena-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, refreshCa)
      .subscribe();
    return () => {
      if (caTimer) clearTimeout(caTimer);
      supabase.removeChannel(channel);
    };
  }, [user, activeTab]);

  // Geeves live feed
  useEffect(() => {
    const unsubMissed = eventBus.on(EventType.GEEVES_QUESTION_MISSED, (event) => {
      const { question, page: fromPage } = event.payload || {};
      if (!question) return;
      setGeevesAnalytics((prev) => {
        const exists = prev.questions.some((q) => q.question === question);
        if (exists) {
          return {
            ...prev,
            questions: prev.questions.map((q) => (q.question === question
              ? { ...q, asked_count: (q.asked_count || 1) + 1, last_asked: new Date().toISOString() }
              : q)),
          };
        }
        return {
          ...prev,
          questions: [{
            id: `live-${Date.now()}`, question, page: fromPage || null,
            asked_count: 1, last_asked: new Date().toISOString(), grok_answer: null,
          }, ...prev.questions],
        };
      });
    });
    const unsubKB = eventBus.on(EventType.GEEVES_KB_UPDATED, (event) => {
      const { questionId } = event.payload || {};
      if (!questionId) return;
      setGeevesAnalytics((prev) => ({ ...prev, questions: prev.questions.filter((q) => q.id !== questionId) }));
    });
    return () => { unsubMissed(); unsubKB(); };
  }, []);

  // Lazy tab loads, in one place instead of scattered across 14 onClick handlers.
  useEffect(() => {
    if (!user) return;
    // The fleet tab is not listed here: Fleet Command loads its own sections
    // when it mounts and when the operator moves between them.
    if (activeTab === 'stats' && !analyticsLoaded) loadAnalytics();
    if (activeTab === 'stats' && !platform && !platformLoading) loadPlatform();
    if (activeTab === 'economy' && !economyLoaded && !economyLoading) loadEconomyData();
    if (activeTab === 'mint' && !mintLoaded && !mintLoading) loadMintData();
    if (activeTab === 'antiabuse' && !abuseLoaded && !abuseLoading) loadAntiAbuseData();
    if (activeTab === 'geeves' && !geevesLoaded && !geevesLoading) loadGeevesAnalytics();
    if (activeTab === 'reviews' && !reviewsLoaded && !reviewsLoading) loadAdminReviews();
    if (activeTab === 'audit' && !auditLoaded && !auditLoading) loadAuditLog();
    // Bug Reports is not listed here any more. Its guard was
    // `bugReports.length === 0`, which is not "have we loaded this yet" - an
    // empty queue re-queried the database on every single visit to the tab.
    // usePagedList owns the load now and keys it on loaded/page/filters.
    if (activeTab === 'clubarena' && !caLoaded && !caLoading) {
      loadClubArenaData();
      loadApplications('pending');
      loadLeaveRequests('pending');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user]);

  // ── CLUB ARENA SECTION LOADS ──
  //
  // Keyed on caSection, NOT on the sub-nav onClick that used to be the only
  // caller. Arriving at ?section=ledger any other way - a shared link,
  // Back/Forward, or the "Needs Attention" jump on the Statistics tab - left
  // caLedger null with caLedgerLoading false, and the ledger branch renders a
  // spinner in exactly that state. It never resolved. Same for revenue.
  //
  // The error is part of the guard: a failed read must show its Retry button
  // rather than re-firing on every render.
  useEffect(() => {
    if (!user || activeTab !== 'clubarena') return;
    if (caSection === 'ledger' && !caLedger && !caLedgerLoading && !caLedgerError) loadCaLedger();
    if (caSection === 'revenue' && !caRevenue && !caRevenueLoading && !caRevenueError) loadCaRevenue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caSection, activeTab, user, caLedger, caRevenue, caLedgerError, caRevenueError]);

  // ── A FILTER CHANGE RESETS THE PAGE, AND THE RESET IS WHAT LOADS ──
  //
  // A filter change must return to page one, or the operator lands on page 4
  // of a result set that now has one page. Two separate effects (one
  // resetting the page, one loading) cannot do that in one request: a
  // `setAuditPage(0)` in the first does NOT change the `auditPage` closure of
  // the second running in the same commit (the same mechanism the URL-state
  // comment below explains), so with auditPage at 3 a filter change fired a
  // load at offset 300 under the new filter and then a second at 0 after the
  // re-render, and only the sequence guard kept the first from landing.
  //
  // So the audit effect below is ONE effect keyed on the query and the page.
  // It remembers the last query it saw in a ref; when the query changed and
  // the page is not 0 it only resets the page, and the page change re-runs it
  // at offset 0. When the query changed on page 0, or the page changed, it
  // loads. One request per filter change, and the seq guard stays for the
  // in-flight overlap of a page move over a filter change.
  const auditQuerySeenRef = useRef(auditQuery);

  useEffect(() => {
    const filterChanged = auditQuerySeenRef.current !== auditQuery;
    auditQuerySeenRef.current = auditQuery;
    if (filterChanged && auditPage !== 0) {
      setAuditPage(0);
      return;
    }
    if (activeTab === 'audit' && auditLoaded) loadAuditLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditQuery, auditPage]);

  useEffect(() => { setReviewsPage(0); }, [reviewsFilter, reviewsRatingFilter, reviewsFlaggedOnly, reviewsQuery]);

  useEffect(() => {
    if (activeTab === 'reviews' && reviewsLoaded) loadAdminReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsFilter, reviewsRatingFilter, reviewsFlaggedOnly, reviewsPage, reviewsQuery]);

  // ── Debounced searches ──
  // All of these hit a route now rather than filtering an array in memory, so
  // they wait 300ms for the operator to stop typing.
  useEffect(() => {
    const id = setTimeout(() => setReviewsQuery(reviewsSearch), 300);
    return () => clearTimeout(id);
  }, [reviewsSearch]);

  useEffect(() => {
    const id = setTimeout(() => setAuditTarget(auditTargetInput), 300);
    return () => clearTimeout(id);
  }, [auditTargetInput]);

  useEffect(() => {
    const id = setTimeout(() => setAuditTargetType(auditTargetTypeInput), 300);
    return () => clearTimeout(id);
  }, [auditTargetTypeInput]);

  useEffect(() => {
    const id = setTimeout(() => tickets.setFilter('q', bugReportsSearch.trim()), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugReportsSearch]);

  useEffect(() => {
    if (activeTab !== 'scrapers' || !user) return undefined;
    loadScraperHealth();
    // A hidden tab does not need a poll. The 60 second tick used to run for as
    // long as the browser tab existed, in the background, forever: nine daemon
    // health reads a minute that nobody was looking at. The immediate read on
    // becoming visible is what keeps the panel current when it comes back.
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadScraperHealth();
    };
    const interval = setInterval(tick, 60000);
    const onVisible = () => { if (!document.hidden) loadScraperHealth(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeTab, user, loadScraperHealth]);

  // ═══════════════════════════════════════════════════════════════════════════
  // URL STATE
  //
  // The active tab and the Club Arena section lived only in component state, so
  // the Ledger could not be bookmarked, a refresh threw the operator back to
  // Social Horses, and Back did not undo a "Needs Attention" jump. Both are
  // mirrored into the query string.
  //
  // SHALLOW always: Next must not re-run data fetching for a tab switch.
  //
  // PUSH for a real navigation, REPLACE only for the one write that normalises
  // the URL on first load (stamping ?tab= in when the operator arrived at bare
  // /horses). This is deliberate and it is the whole point of the item: with a
  // replace on every write, a "Needs Attention" jump overwrites the history
  // entry it came from, so Back leaves the console entirely instead of undoing
  // the jump - which is the bug audit item 33 names. Sixteen tab clicks do
  // leave sixteen history entries; that is what Back is for, and it is the
  // behaviour of every other tabbed console an operator uses.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * HOW THE DEEP LINK SURVIVES (this is the mechanism, read it before editing
   * either effect).
   *
   * This page exports no getServerSideProps, so it is auto-statically-
   * optimised and `router.isReady` is FALSE on the first client render. When
   * it flips true, React flushes BOTH effects below in the same commit, in
   * declaration order. The read effect's `setActiveTab('mint')` does NOT
   * update `activeTab` for the write effect that runs microseconds later in
   * that same pass - so the write effect saw the initial DEFAULT_TAB, decided
   * the URL disagreed with it, and replaced ?tab=mint with ?tab=stable.
   * Opening /horses?tab=mint landed the operator on Social Horses and rewrote
   * their URL on the way. That is the whole of item B shipping broken.
   *
   * Two refs, and both are load-bearing:
   *
   *   urlHydratedRef - the read effect has applied the URL at least once.
   *                    A ref, not state, because the write effect has to see
   *                    it inside the same commit.
   *   urlSyncedRef   - state and the URL have actually AGREED at least once,
   *                    which is the only proof that the seed has landed.
   *                    Hydration alone is not enough: on the flip commit the
   *                    read effect has hydrated but `activeTab` is still the
   *                    pre-hydration value, and writing then is exactly the
   *                    bug. So the write effect never writes a difference it
   *                    has not first seen resolved.
   *
   * After that first agreement, a difference can only mean the operator moved,
   * and that is when - and only when - the URL is written.
   */
  const urlHydratedRef = useRef(false);
  const urlSyncedRef = useRef(false);

  /** Read the URL into state. Runs on mount and on every router query change,
   *  which is what makes Back and Forward work: Next updates router.query on a
   *  popstate and this follows it. Anything unrecognised falls back to the
   *  registry default rather than rendering a blank panel. */
  useEffect(() => {
    if (!router.isReady) return;
    const nextTab = resolveInitialTab(router.query);
    const nextSection = resolveInitialSection(router.query);
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
    setCaSection((prev) => (prev === nextSection ? prev : nextSection));
    urlHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.tab, router.query.section]);

  /** Write state back into the URL - only after hydration, and only when it
   *  actually differs, or this would fight the read effect above on every
   *  render. */
  useEffect(() => {
    if (!router.isReady || !urlHydratedRef.current) return;

    if (urlMatchesState({ activeTab, caSection }, router.query)) {
      urlSyncedRef.current = true;
      // The ONE write that is not a navigation: making the address say what
      // it resolved to. A REPLACE, so normalising the address the operator
      // arrived at does not cost them a Back press. That covers a bare
      // /horses (stamp ?tab= in) AND an unknown ?tab=bogus, which the read
      // effect mapped to the default but which used to be left in the bar
      // because a tab was "already named" - so the bookmark stayed broken.
      // A URL that already spells the view correctly is not touched: that is
      // the deep link. urlNeedsNormalising answers false for it, and false
      // again once the replace has landed, so this cannot loop.
      if (urlNeedsNormalising({ activeTab, caSection }, router.query)) {
        const query = nextUrlQuery({ activeTab, caSection }, router.query);
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
      }
      return;
    }

    // Hydrated but never reconciled: the read effect seeded state in this very
    // commit and we are still looking at the pre-hydration value. Writing here
    // is what destroyed the deep link.
    if (!urlSyncedRef.current) return;

    // A real navigation. PUSH, which is what makes Back undo a "Needs
    // Attention" jump instead of leaving the console. Called as a method, not
    // hoisted into a bare reference: next/router's push and replace are
    // prototype methods and lose `this` when detached.
    const query = nextUrlQuery({ activeTab, caSection }, router.query);
    router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, caSection, router.isReady]);

  // ── Keep the active tab visible in the mobile nav strip ──
  const navRef = useRef(null);
  useEffect(() => {
    const el = navRef.current?.querySelector(`[data-tabid="${activeTab}"]`);
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    // `badges` is in the deps because the counts land after mount and change
    // the width of the strip, which is what was displacing it.
  }, [activeTab, badges]);

  /**
   * Tablist keyboard movement.
   *
   * ArrowLeft / ArrowRight move by one and wrap; Home and End jump to the ends.
   * Selection follows focus, which is the automatic-activation pattern and the
   * right one here: every panel is already mounted lazily and switching is
   * cheap. The mobile scroll strip is untouched - the effect above still
   * scrolls whatever becomes active into view.
   */
  /**
   * The tabs this operator may see.
   *
   * visibleTabs drops anything registered but not shipped; permittedTabs then
   * drops anything whose declared permission this account does not hold. With
   * `operatorPermissions` null - nobody has told us yet - permittedTabs is
   * the identity function, so the nav is exactly what it has always been.
   */
  const navTabs = useMemo(
    () => permittedTabs(visibleTabs(TABS), operatorPermissions),
    [operatorPermissions],
  );

  /**
   * A deep link, a bookmark or a revoked permission can leave `activeTab`
   * naming a tab this operator cannot see. Land on the first tab they CAN see
   * rather than on an empty panel with a nav that does not highlight anything.
   *
   * EVERY CONDITION LIVES IN `relocationTarget`, which is a pure function and
   * is unit tested against a real `god` permission set - because the version
   * of this guard that trusted `navTabs` unconditionally relocated EVERY
   * operator on EVERY load (the registry was asking for permissions nobody
   * held) and the URL write effect below then rewrote `?tab=`, which is the
   * Phase 1 destroyed-deep-links blocker arriving by a second route. It
   * returns null - leave them exactly where they are - unless the route has
   * actually sent a populated permission list AND the tab they are on
   * declares a permission the vocabulary knows AND they genuinely do not hold
   * it. A legacy operator satisfies none of those, so this cannot fire on one.
   */
  useEffect(() => {
    const target = relocationTarget({
      activeTab,
      tabs: visibleTabs(TABS),
      permissions: operatorPermissions,
    });
    if (target) setActiveTab(target);
  }, [operatorPermissions, activeTab]);

  /**
   * Move to another tab as a real navigation.
   *
   * Only `activeTab` is set here on purpose: the URL write effect above owns
   * every write to the query string, and it pushes through nextUrlQuery. A
   * second router.push from this callback would either race that effect or
   * leave two history entries for one jump, so the jump goes through the one
   * door that already knows how to make it a real navigation.
   */
  const goToTab = useCallback((tabId) => { setActiveTab(tabId); }, []);
  const onTabKeyDown = useCallback((e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const index = navTabs.findIndex((t) => t.id === activeTab);
    if (index < 0) return;
    let nextIndex = index;
    if (e.key === 'ArrowLeft') nextIndex = (index - 1 + navTabs.length) % navTabs.length;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % navTabs.length;
    if (e.key === 'Home') nextIndex = 0;
    if (e.key === 'End') nextIndex = navTabs.length - 1;
    const nextTab = navTabs[nextIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    const el = navRef.current?.querySelector(`[data-tabid="${nextTab.id}"]`);
    if (el && typeof el.focus === 'function') el.focus();
  }, [activeTab, navTabs]);

  const activeTabEntry = useMemo(
    () => navTabs.find((t) => t.id === activeTab) || null,
    [navTabs, activeTab],
  );
  /** Registry tabs that are their own module render here; the legacy panels
   *  below are still inline and unchanged. Three tabs use this seam now:
   *  Staff And Roles, Approvals (Phase 2) and Fleet Command (Phase 3). It is
   *  null on every other tab, so exactly one panel renders. */
  const RegistryPanel = activeTabEntry ? panelComponentFor(activeTabEntry) : null;

  // ── Derived ──
  const filteredPersonas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return personas.filter((p) => {
      const matches = !q
        || p.name?.toLowerCase().includes(q)
        || p.alias?.toLowerCase().includes(q)
        || p.location?.toLowerCase().includes(q);
      if (!matches) return false;
      if (filter === 'active') return p.is_active;
      if (filter === 'inactive') return !p.is_active;
      return true;
    });
  }, [personas, searchTerm, filter]);

  /**
   * A HORSE IS A POKER PROFILE, NOT A CONTENT_AUTHORS ROW (2026-09-02).
   *
   * These two populations are not the same and the stable panel was counting
   * the wrong one. `content_authors` also holds 39 social-only personas from
   * 2026-03-10 that carry no `profile_id`: they post, but they have no wallet,
   * no club membership and cannot be dealt a hand. Counting them as horses
   * overstates the fleet: a persona with no profile has no wallet, no seat and
   * no second job.
   *
   * The roster LIST still shows everything, so a social-only persona stays
   * visible and manageable. Only the counts are narrowed to actual horses.
   */
  const horses = useMemo(() => personas.filter((p) => p.profile_id), [personas]);
  const activeCount = useMemo(() => horses.filter((p) => p.is_active).length, [horses]);
  const socialOnlyCount = useMemo(() => personas.length - horses.length, [personas, horses]);
  const totalPages = Math.max(1, Math.ceil(filteredPersonas.length / HORSES_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedPersonas = filteredPersonas.slice(safePage * HORSES_PER_PAGE, (safePage + 1) * HORSES_PER_PAGE);
  useEffect(() => { setPage(0); }, [searchTerm, filter]);

  // ── Bulk selection ──
  const allPagedSelected = pagedPersonas.length > 0 && pagedPersonas.every((p) => selectedIds.has(p.id));
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleSelectPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const every = pagedPersonas.length > 0 && pagedPersonas.every((p) => next.has(p.id));
      for (const p of pagedPersonas) { if (every) next.delete(p.id); else next.add(p.id); }
      return next;
    });
  }, [pagedPersonas]);
  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredPersonas.map((p) => p.id)));
  }, [filteredPersonas]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const exportHorses = useCallback(() => {
    const rows = (selectedIds.size ? personas.filter((p) => selectedIds.has(p.id)) : filteredPersonas);
    downloadCsv(stampedName('horses'), toCsv(rows, [
      ['id', 'ID'], ['name', 'Name'], ['alias', 'Alias'], ['gender', 'Gender'],
      ['location', 'Location'], ['specialty', 'Specialty'], ['stakes', 'Stakes'],
      ['voice', 'Voice'], ['is_active', 'Active'], ['avatar_url', 'Avatar URL'], ['bio', 'Bio'],
    ]));
    showNotification(`Exported ${num(rows.length)} Horses`);
  }, [personas, filteredPersonas, selectedIds, showNotification]);

  // The page-only client filter that used to live here is gone: `q` goes to the
  // route and the route searches the whole table, so what comes back IS the
  // result set and filtering it again would only hide rows the server matched
  // on a column this filter did not know about.

  const mintLedgerRows = mintLedger?.entries || [];

  const pendingAppCount = useMemo(
    () => caApplications.filter((a) => a.status === 'pending').length, [caApplications],
  );
  const pendingLeaveCount = useMemo(
    () => caLeaveRequests.filter((r) => r.status === 'pending').length, [caLeaveRequests],
  );
  // These used to read only tab-local state, so a badge could not appear until
  // you had already visited the tab it was pointing at. `badges` is fetched
  // once on mount and is what makes them work on page load.
  const deadScrapers = scraperHealth?.summary?.deadCount || 0;
  const ledgerCritical = badges?.ledgerCritical || 0;
  const clubArenaBadge = Math.max(
    pendingAppCount + pendingLeaveCount,
    (badges?.pendingCashouts || 0) + (badges?.ledgerCritical || 0),
  );
  const bugReportBadge = badges?.openTickets || 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.logo}>SP</span>
        <p>Loading Stable</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SEOHead
          title="Stable Admin"
          description="Smarter.Poker Staff Console."
          canonical="/horses"
        >
          <meta name="robots" content="noindex, nofollow" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        </SEOHead>
        <div className={styles.loginContainer}>
          <div className={styles.loginCard}>
            <div className={styles.loginHeader}>
              <h1>STABLE</h1>
              <p>Smarter.Poker Staff Console</p>
            </div>
            <form onSubmit={handleLogin}>
              <div className={styles.inputGroup}>
                <label htmlFor="admin-email">Email</label>
                <input
                  id="admin-email" type="email" autoComplete="username"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  placeholder="admin@smarter.poker" required
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="admin-password">Password</label>
                <input
                  id="admin-password" type="password" autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="Password" required
                />
              </div>
              {loginError && <div className={styles.error}>{loginError}</div>}
              <button type="submit" className={styles.loginBtn} disabled={signingIn}>
                {signingIn ? 'Signing In' : 'Enter The Stable'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Stable Admin | Smarter.Poker</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.dashboard}>
        {/* The toast is the ONLY confirmation channel for every mutation on
            this page -- create, retire, promo toggle, club suspend, force
            cashout approve -- and it was not announced at all. The always-
            mounted region matters: a live region inserted in the same tick as
            its content is unreliable in NVDA and JAWS. */}
        {pendingConfirm && (
          <ConfirmDialog
            title={pendingConfirm.title}
            tone={pendingConfirm.tone || 'danger'}
            confirmLabel={pendingConfirm.confirmLabel || 'Confirm'}
            requireTyped={pendingConfirm.requireTyped || null}
            onConfirm={() => {
              // Close first, then run: the work may open its own toast or a
              // further dialog, and neither should land under this one.
              const run = pendingConfirm.onConfirm;
              setPendingConfirm(null);
              if (typeof run === 'function') run();
            }}
            onCancel={() => setPendingConfirm(null)}
          >
            <p style={{ marginTop: 0 }}>{pendingConfirm.body}</p>
          </ConfirmDialog>
        )}
        <div role="status" aria-live="polite" className={styles.srOnly}>
          {notification?.message || ''}
        </div>
        {notification && (
          <div
            className={`${styles.notification} ${styles[notification.type] || ''}`}
            role={notification.type === 'error' ? 'alert' : 'status'}
          >
            {notification.message}
          </div>
        )}

        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1>STABLE ADMIN</h1>
            <span className={styles.subtitle}>Smarter.Poker Staff Console</span>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.engineStatus}>
              <span className={`${styles.statusDot} ${settings.engine_enabled ? styles.active : ''}`} />
              <span>{settings.engine_enabled ? 'Engine Running' : 'Engine Stopped'}</span>
            </div>
            {settingsSaving && <span style={{ color: T.accent, fontSize: 12 }}>Saving</span>}
            <span className={styles.userInfo}>
              {user?.email}
              {role && <span style={{ color: T.accent, marginLeft: 6, fontSize: 11, textTransform: 'uppercase' }}>{role}</span>}
            </span>
            <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
          </div>
        </header>

        {/* Below 768px this is a horizontal scroll strip. Measured on a real
            375px viewport: the strip is 1173px wide against a 375px window,
            and it was opening scrolled 781px in -- the ACTIVE tab was off the
            left edge with nothing to indicate the panel had more tabs. The
            badges arriving asynchronously change the strip's width after
            mount, which is what moved it. Scroll the active tab into view
            whenever it changes, and once more after the badges land. */}
        {/* A real tablist. It was a row of plain buttons with aria-current,
            which tells a screen reader "this is the current page" and nothing
            about the sixteen panels it controls. Roving tabindex, so Tab
            reaches the nav once and then arrow keys move within it, which is
            what a tablist promises a keyboard user. The external links are NOT
            tabs - they navigate to other pages - so they sit outside the
            tablist with their own label. */}
        {/* aria-controls names ONE element, because there is one. The panel id
            used to be interpolated per tab (`horses-panel-${tab.id}`) while
            only a single <main> existed, so fifteen of the sixteen tabs
            pointed at an element that is not in the document - which is worse
            than omitting the attribute, since a screen reader announces a
            relationship it cannot follow. */}
        <nav className={styles.nav} ref={navRef} aria-label="Console Sections">
          {/* NOT display:contents. That property has a history of dropping the
              element - and with it the role - out of the accessibility tree in
              WebKit and Blink, and the role is what makes these sixteen
              buttons a tablist. shared.tablist is a real flex box sized to
              match the nav. */}
          <div role="tablist" aria-label="Stable Admin Tabs" className={shared.tablist}>
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                id={`horses-tab-${tab.id}`}
                data-tabid={tab.id}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                aria-controls={HORSES_PANEL_ID}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? styles.active : ''}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={onTabKeyDown}
                style={(tab.id === 'scrapers' && deadScrapers > 0)
                  || (tab.id === 'clubarena' && ledgerCritical > 0)
                  ? { color: T.danger, fontWeight: 700 } : undefined}
              >
                {tab.label}
                {/* num() not raw interpolation: the ledger badge is in the tens
                    of thousands and rendered as "Club Arena (20206)". */}
                {tab.id === 'scrapers' && deadScrapers > 0 ? ` (${num(deadScrapers)})` : ''}
                {tab.id === 'clubarena' && clubArenaBadge > 0 ? ` (${num(clubArenaBadge)})` : ''}
                {tab.id === 'bugreports' && bugReportBadge > 0 ? ` (${num(bugReportBadge)})` : ''}
              </button>
            ))}
          </div>
          {EXTERNAL_LINKS.map((link) => (
            <button key={link.href} type="button" onClick={() => router.push(link.href)}>
              {link.label}
            </button>
          ))}
        </nav>

        <main
          className={styles.content}
          id={HORSES_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`horses-tab-${activeTab}`}
          tabIndex={0}
        >
          {/* One throw used to take all sixteen tabs with it. resetKey is the
              active tab, so moving to another tab clears a captured error and
              the nav never goes down with the panel. */}
          <ErrorBoundary
            resetKey={activeTab}
            label={activeTabEntry?.label || 'This Tab'}
          >
          {/* A registry tab is its own module and gets the operator context
              as props rather than reading it again: two fetches for one
              answer is how two panels end up disagreeing about whether
              maker-checker is on. onPolicyChange flows the Staff tab's save
              back up so the Mint's confirmation sentence changes in the same
              session, without a reload. */}
          {RegistryPanel && (
            <RegistryPanel
              authFetch={authFetch}
              showNotification={showNotification}
              permissions={operatorPermissions}
              operatorId={operatorId}
              policy={operatorPolicy}
              permissionsDegraded={operatorDegraded}
              onPolicyChange={handlePolicyChange}
            />
          )}

          {activeTab === 'merch' && <MerchCatalogAdmin authFetch={authFetch} />}

          {/* ─────────────────────────── SOCIAL HORSES ─────────────────────── */}
          {activeTab === 'stable' && (
            <div className={styles.stableView}>
              <h2 className={styles.srOnly}>Social Horses</h2>
              <div className={styles.stableHeader}>
                <div className={styles.stableStats}>
                  {/* Every count in this row is over the SAME population:
                      horses with a poker profile. The social-only personas are
                      counted separately at the end of the row, never folded in,
                      because they are a different thing. */}
                  <div className={styles.statBox}>
                    <span className={styles.statNumber}>{num(horses.length, '0')}</span>
                    <span className={styles.statLabel}>Total Horses (With A Poker Profile)</span>
                  </div>
                  <div className={`${styles.statBox} ${styles.activeBox}`}>
                    <span className={styles.statNumber}>{num(activeCount, '0')}</span>
                    <span className={styles.statLabel}>Active (Of Those Horses)</span>
                  </div>
                  <div className={`${styles.statBox} ${styles.inactiveBox}`}>
                    <span className={styles.statNumber}>{num(horses.length - activeCount, '0')}</span>
                    <span className={styles.statLabel}>Resting (Of Those Horses)</span>
                  </div>
                  {socialOnlyCount > 0 && (
                    <div className={styles.statBox}>
                      <span className={styles.statNumber}>{num(socialOnlyCount, '0')}</span>
                      <span className={styles.statLabel}>Social Only (No Poker Profile)</span>
                    </div>
                  )}
                </div>

                <div className={styles.stableControls}>
                  <input
                    type="search" placeholder="Search Horses" value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)} className={styles.searchInput}
                    aria-label="Search Horses"
                  />
                  <select value={filter} onChange={(e) => setFilter(e.target.value)} className={styles.filterSelect} aria-label="Filter Horses">
                    <option value="all">All Horses</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Resting Only</option>
                  </select>
                  <PokerBrainLaunchButton />
                  <button className={styles.btnSuccess} onClick={() => toggleAllPersonas(true)} disabled={bulkBusy}>
                    Activate All
                  </button>
                  <button className={styles.actionBtn} onClick={() => toggleAllPersonas(false)} disabled={bulkBusy}>
                    Rest All
                  </button>
                  <button className={styles.actionBtn} onClick={exportHorses}>
                    Export CSV
                  </button>
                  <button className={styles.actionBtn} onClick={generateAvatars} disabled={avatarBusy}
                    title="Generate Avatars For Horses That Have None">
                    {avatarBusy ? 'Generating Avatars' : 'Generate Avatars'}
                  </button>
                  <button className={styles.btnCreate} onClick={openCreateModal}>New Horse</button>
                </div>
              </div>

              {personasError && (
                <div className={styles.errorState}>
                  <div>The Stable Could Not Be Loaded: {personasError}</div>
                  <button className={styles.actionBtn} onClick={loadData}>Retry</button>
                </div>
              )}

              {/* Loading and empty are DIFFERENT STATES. Without the first
                  branch this panel told the operator "No horses in the stable
                  yet" on every single mount, for the half second before 593 of
                  them arrived. */}
              {!personasError && personasLoading && personas.length === 0 && (
                <div className={styles.loadingSpinner}>Loading The Stable</div>
              )}

              {!personasError && !personasLoading && filteredPersonas.length === 0 && (
                <div className={styles.emptyState}>
                  {personas.length === 0
                    ? 'No Horses In The Stable Yet. Create One To Get Started.'
                    : 'No Horses Match The Current Search And Filter.'}
                </div>
              )}

              {avatarBusy && (
                <div className={styles.warnBanner} role="status">
                  Generating Avatars. Each Horse Takes Roughly 15 To 25 Seconds And They Run One
                  At A Time, So A Batch Of {AVATAR_BATCH} Can Take A Couple Of Minutes. Leave This Tab Open.
                </div>
              )}
              {avatarResult && !avatarBusy && (
                <div className={styles.warnBanner} role="status">
                  {num(avatarResult.generated, '0')} Generated
                  {/* null now means "the count could not be read", which is a
                      different thing from zero. Rendering it as a dash would
                      read as "none left" and stop the operator running the
                      batch again; say plainly that the number is unknown. */}
                  {avatarResult.remaining === null
                    ? <>, Remaining Count Unavailable</>
                    : avatarResult.remaining !== undefined
                      ? <>, {num(avatarResult.remaining)} Still Without An Avatar</>
                      : null}
                  {(avatarResult.results || []).some((r) => !r.success) && (
                    <> - Failures: {(avatarResult.results || []).filter((r) => !r.success)
                      .map((r) => `${r.horse}: ${r.error}`).join('; ')}</>
                  )}
                  {avatarResult.remaining > 0 && ' Run It Again To Continue.'}
                </div>
              )}

              {/* Bulk selection. 593 horses and, until now, no way to act on
                  more than one at a time. */}
              <div className={styles.bulkBar}>
                <label className={styles.bulkCheck}>
                  <input
                    type="checkbox"
                    checked={allPagedSelected}
                    onChange={toggleSelectPage}
                    aria-label={allPagedSelected ? 'Deselect This Page' : 'Select This Page'}
                  />
                  <span>Select Page</span>
                </label>
                {selectedIds.size > 0 ? (
                  <>
                    <span className={styles.countPill}>{num(selectedIds.size)} Selected</span>
                    <button className={styles.filterBtn} onClick={selectAllFiltered} disabled={bulkBusy}>
                      Select All {num(filteredPersonas.length)}
                    </button>
                    <button className={styles.filterBtn} onClick={clearSelection} disabled={bulkBusy}>Clear</button>
                    <span className={styles.bulkSpacer} />
                    <button className={styles.filterBtn} disabled={bulkBusy}
                      onClick={() => setActiveForIds([...selectedIds], true, 'Activated')}>
                      Activate
                    </button>
                    <button className={styles.filterBtn} disabled={bulkBusy}
                      onClick={() => setActiveForIds([...selectedIds], false, 'Rested')}>
                      Rest
                    </button>
                    <button className={styles.btnDanger} disabled={bulkBusy} onClick={handleBulkDelete}>
                      Retire {num(selectedIds.size)}
                    </button>
                  </>
                ) : (
                  <span className={styles.bulkHint}>
                    Select Horses To Activate, Rest Or Retire Them Together.
                  </span>
                )}
              </div>

              <div className={styles.personaGrid}>
                {pagedPersonas.map((persona) => (
                  <div
                    key={persona.id}
                    className={`${styles.personaCard} ${persona.is_active ? styles.active : styles.inactive}`}
                  >
                    <div className={styles.personaHeader}>
                      <input
                        type="checkbox"
                        className={styles.personaSelect}
                        checked={selectedIds.has(persona.id)}
                        onChange={() => toggleSelect(persona.id)}
                        aria-label={`Select ${persona.name || 'This Horse'}`}
                      />
                      <div className={styles.personaAvatar}>
                        {persona.avatar_url ? (
                          <img
                            src={persona.avatar_url} alt="" className={styles.avatarImage} loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector(`.${styles.avatarFallback}`);
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span
                          className={styles.avatarFallback}
                          style={{ display: persona.avatar_url ? 'none' : 'flex' }}
                          aria-hidden="true"
                        >
                          {(persona.name || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.personaInfo}>
                        <h3>{persona.name || 'Unnamed'}</h3>
                        <span className={styles.alias}>@{persona.alias || 'no-alias'}</span>
                      </div>
                      <label className={styles.toggleSwitch}>
                        {/* The wrapping label had no text content, so this
                            control -- the primary one on all 593 cards -- had
                            no accessible name at all. */}
                        <input
                          type="checkbox" checked={!!persona.is_active}
                          onChange={() => togglePersona(persona.id, persona.is_active)}
                          aria-label={`${persona.is_active ? 'Rest' : 'Activate'} ${persona.name || 'This Horse'}`}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                    <div className={styles.personaDetails}>
                      <p>{persona.location || 'Location Unknown'}</p>
                      <p>{persona.specialty?.replace(/_/g, ' ') || 'No Specialty'}</p>
                      <p>{persona.stakes || 'No Stakes Set'}</p>
                    </div>
                    <div className={styles.personaBio}>{persona.bio || 'No Bio.'}</div>
                    <div className={styles.personaVoice}>
                      <span className={styles.voiceTag}>{persona.voice || 'casual'}</span>
                      {/* Resting used to be signalled by opacity alone. */}
                      {!persona.is_active && <span className={styles.restingTag}>Resting</span>}
                      <div>
                        <button className={styles.editBtn} onClick={() => openEditModal(persona)}>Edit</button>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(persona.id, persona.name)}
                          title="Retire This Horse"
                          aria-label={`Retire ${persona.name}`}
                        >
                          Retire
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredPersonas.length > HORSES_PER_PAGE && (
                <div className={styles.pagination}>
                  <button onClick={() => setPage(0)} disabled={safePage === 0}>First</button>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>Previous</button>
                  <span className={styles.pageInfo}>
                    Page {safePage + 1} Of {totalPages} - {num(filteredPersonas.length)} Horses
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1}>Last</button>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────── FLEET COMMAND (PHASE 3) ───────────────────
              The Grinder panel that used to be here is GONE, and Fleet Command
              (src/components/horses/FleetPanel.jsx, code-split through the tab
              registry's `load` thunk) is what renders in its place. It owns its
              own data through /api/horses/fleet-admin.

              WHAT WAS REMOVED WITH IT, AND WHY THERE IS NOW ONE ANSWER PER
              NUMBER. The old panel reported the fleet from two routes that
              neither of them own it:

                - /api/horses/grinder-stats gave Active Grinders, Currently
                  Playing, Active Tables, Hands Played and Fleet Profit, plus a
                  per-horse roster of hands and profit. Fleet Command reports
                  the same five from the engine's own state mirror
                  (ca_horse_fleet_state) on its Health section, the roster from
                  the same table, and hands and profit on its P And L from the
                  daily rows the platform already keeps.
                - /api/club-arena/horse-launch, action status, gave Cash Tables
                  Live, Horses Seated, Horses In The Fleet and Tournaments Live
                  by counting profiles.horse_status and tables directly. Fleet
                  Command's Capacity tiles count tables and table_seats through
                  fn_ca_fleet_overview.

              Keeping either would have put two Horses Seated and two Tables
              Live on one console, computed from different tables, differing
              whenever the engine's mirror lagged - and an operator cannot act
              on a number that has a second opinion. So the console reads the
              fleet from fleet-admin and from nowhere else. Both routes still
              work and are still tested; this page simply no longer calls them.
              Fleet Command states loudly when the engine has never published a
              heartbeat, which is the honest answer for that state and better
              than a confident second reading from a source the engine does not
              write.

              The four grinder_* controls moved to the Settings tab in Phase 3
              and were DELETED there on 2026-09-04. They were content_settings
              rows that nothing read: not this repo, not the engine. One of
              them, AI Model, additionally claimed the fleet runs on GPT-4o,
              and the fleet has never run on a language model. Fleet Command
              does not supersede them, it replaces them - it is the only place
              a horse-seating decision is made, and the only one the engine
              reads.

              The panel's Club Management "Not Built Yet" list (Add All Horses
              To Shark Club, Add All Horses To Club JAQK, Start Auto-Join, Stop
              All Horses) went with the panel and is NOT reproduced anywhere.
              Phase 1 listed those four honestly because grinder-stats answers
              501 for them. Phase 3 answers the question they were waiting on:
              seating horses and granting chips is not something this console
              does, and PHASE3-CONTRACTS section 0 forbids inventing an
              eviction or a funding control here at all. "Not built yet" would
              now be the dishonest sentence, because it promises a later build.
              What replaces it is on the panel itself, in the intro and on the
              policy dialogs: the only lever is how many horses take seats, and
              nothing here reaches inside a hand.

              The Pipeline tab's Not Built Yet panel stays, per the same
              contract section: its trigger genuinely is unbuilt work waiting
              for its own phase. */}

          {/* ─────────────────────────── PIPELINE ──────────────────────────── */}
          {activeTab === 'pipeline' && (
            <div className={styles.pipelineView}>
              <h2>Content Pipeline</h2>
              <div className={styles.pipelineActions}>
                <h3>Quick Actions</h3>
                {/* Four buttons that were disabled from the day they shipped,
                    posting to a cron handler that does not exist. The route
                    answers 501 rather than fabricating a success - it used to
                    log a pipeline_runs row for work it never did, which made
                    the lie durable - and this says so in the panel instead of
                    hiding it in a title attribute nobody hovers. */}
                <NotBuiltYet
                  title="Not Built Yet - The Content Pipeline Has No Trigger"
                  items={[
                    'Test Run (3 Posts, No Video)',
                    'Quick Cycle (10 Posts, 2 Videos)',
                    `Full Daily (${settings.posts_per_day || 20} Posts)`,
                    'Publish Due (Post Scheduled)',
                  ]}
                >
                  The Content Pipeline Has No Server-Side Implementation:
                  The Trigger Pipeline Route Answers 501 For Every Type. The Runs Below Are
                  Real And Are Recorded By Whatever Else Writes Pipeline_Runs; Nothing On This
                  Tab Can Start One.
                </NotBuiltYet>
              </div>

              {/* The RSS source list used to be five hardcoded names each with a
                  green dot next to it, wired to nothing at all. It is gone
                  rather than left as decoration that reads as a health check. */}

              <div className={styles.recentRuns}>
                <h3>Recent Pipeline Runs</h3>
                {pipelineRuns.length === 0 ? (
                  <p className={styles.noData}>No Pipeline Runs Recorded Yet.</p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Posts</th><th scope="col">Videos</th><th scope="col">Duration</th></tr>
                      </thead>
                      <tbody>
                        {pipelineRuns.map((run) => (
                          <tr key={run.id}>
                            <td>{when(run.started_at, true)}</td>
                            <td><span className={`${styles.runType} ${styles[run.run_type] || ''}`}>{run.run_type}</span></td>
                            <td>{num(run.text_posts_created, '0')}</td>
                            <td>{num(run.videos_created, '0')}</td>
                            <td>{run.duration_seconds !== null && run.duration_seconds !== undefined ? `${run.duration_seconds}s` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────── SETTINGS ──────────────────────────── */}
          {activeTab === 'settings' && (
            <div className={styles.settingsView}>
              <h2>Engine Settings</h2>
              <p style={{ color: T.dim, fontSize: 13, marginBottom: 12 }}>
                Changes Save Automatically About A Second After You Stop Editing.
              </p>
              {/* Until today every one of these saves was discarded silently:
                  content_settings is service_role-write only, and the browser
                  upsert that used to run here matched nothing and reported no
                  error. The save state is now visible either way. */}
              {settingsError ? (
                <div className={styles.errorState} role="alert" style={{ marginBottom: 16 }}>
                  Settings Not Saved: {settingsError}
                </div>
              ) : settingsSavedAt ? (
                <div style={{ color: T.accent, fontSize: 12, marginBottom: 16 }} role="status">
                  Saved At {settingsSavedAt.toLocaleTimeString()}
                </div>
              ) : null}
              <div className={styles.settingsGrid}>
                <div className={styles.settingCard}>
                  <h3>Posting Schedule</h3>
                  {[
                    ['posts_per_day', 'Posts Per Day', 1, 100],
                    ['min_delay_minutes', 'Min Delay (Minutes)', 5, 180],
                    ['max_delay_minutes', 'Max Delay (Minutes)', 15, 300],
                  ].map(([key, label, min, max]) => (
                    <div className={styles.settingItem} key={key}>
                      <label htmlFor={`set-${key}`}>{label}</label>
                      <input
                        id={`set-${key}`} type="number" min={min} max={max}
                        value={settings[key] ?? ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          // Clearing the field used to write NaN to the row.
                          if (Number.isFinite(v)) updateSetting(key, Math.min(Math.max(v, min), max));
                        }}
                      />
                    </div>
                  ))}
                  {settings.min_delay_minutes > settings.max_delay_minutes && (
                    <div className={styles.warnBanner}>
                      Min Delay Is Greater Than Max Delay. The Scheduler Will Not Behave Sensibly.
                    </div>
                  )}
                </div>

                <div className={styles.settingCard}>
                  <h3>AI Settings</h3>
                  <div className={styles.settingItem}>
                    <label htmlFor="set-model">Model</label>
                    <select id="set-model" value={settings.ai_model || 'gpt-4o'}
                      onChange={(e) => updateSetting('ai_model', e.target.value)}>
                      <option value="gpt-4o">GPT-4o (Best)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </select>
                  </div>
                  <div className={styles.settingItem}>
                    <label htmlFor="set-temp">Temperature: {Number(settings.temperature ?? 0.8).toFixed(2)}</label>
                    <input
                      id="set-temp" type="range" min="0" max="100" step="5"
                      value={Math.round(Number(settings.temperature ?? 0.8) * 100)}
                      onChange={(e) => updateSetting('temperature', Number(e.target.value) / 100)}
                    />
                  </div>
                </div>

                {/* THE FOUR GRINDER CONTROLS WERE DELETED HERE ON 2026-09-04.
                    Phase 3 moved them off the Grinder tab and labelled them
                    "not the fleet policy", which was true and was not enough:
                    a control an operator can turn is a promise that turning it
                    does something, and turning any of these four did nothing at
                    all. Nothing on the platform read one back - not this repo,
                    not the engine, which has no reference to content_settings
                    anywhere in server/src.

                    "AI Model" was the one Dan named. It offered GPT-4o or
                    GPT-4o Mini for the poker fleet, and the fleet has never run
                    on a language model: HorseLogic, HorseBehavior and
                    HorseEvEngine decide every action, deterministically, and
                    the Club Arena repo carries no LLM dependency at all.

                    The card stays, with no controls, because an operator who
                    remembers these settings needs to be told where the real
                    ones are rather than left to conclude the page is broken.
                    __tests__/horses-no-language-model-for-the-fleet.test.mjs
                    fails if a model choice for the horses ever comes back. */}
                <div className={styles.settingCard}>
                  <h3>Horse Fleet</h3>
                  <p style={{ color: T.dim, fontSize: 12, margin: 0 }}>
                    The Horses Decide Their Own Play. HorseLogic Is A Deterministic Engine In
                    Club Arena, Not A Language Model, And It Takes No Settings From This Page.
                  </p>
                  <p style={{ color: T.dim, fontSize: 12, margin: '10px 0 0' }}>
                    Seating Is Governed By Fleet Command: The Kill Switch, The Caps, The
                    Occupancy Bias And The Per-Club Policy All Live There, And The Engine
                    Reads Them Once Per Club Per Cycle.
                  </p>
                  {/* Gated on the tab this operator can actually reach. A
                      settings.write account does not necessarily hold
                      fleet.read, and a button that lands on a panel the nav
                      will not show is worse than no button. */}
                  {navTabs.some((t) => t.id === 'fleet') && (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      style={{ marginTop: 12 }}
                      onClick={() => setActiveTab('fleet')}
                    >
                      Open Fleet Command
                    </button>
                  )}
                </div>

                <div className={`${styles.settingCard} ${styles.fullWidth}`}>
                  <h3>System Controls</h3>
                  <div className={styles.systemControls}>
                    <div className={styles.controlItem}>
                      <label htmlFor="set-engine">Content Engine</label>
                      <label className={styles.toggleSwitch}>
                        <input id="set-engine" type="checkbox" checked={!!settings.engine_enabled}
                          onChange={(e) => updateSetting('engine_enabled', e.target.checked)} />
                        <span className={styles.slider} />
                      </label>
                      <span style={{ color: settings.engine_enabled ? T.accent : T.danger }}>
                        {settings.engine_enabled ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div className={styles.controlItem}>
                      <label htmlFor="set-publish">Auto-Publish</label>
                      <label className={styles.toggleSwitch}>
                        <input id="set-publish" type="checkbox" checked={!!settings.auto_publish}
                          onChange={(e) => updateSetting('auto_publish', e.target.checked)} />
                        <span className={styles.slider} />
                      </label>
                      <span style={{ color: settings.auto_publish ? T.accent : T.warn }}>
                        {settings.auto_publish ? 'Active' : 'Manual'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────── STATISTICS ────────────────────────── */}
          {activeTab === 'stats' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>Platform Statistics</h2>
                <button className={styles.actionBtn} onClick={() => { loadPlatform(); loadAnalytics(); }}
                  disabled={platformLoading}>
                  {platformLoading ? 'Refreshing' : 'Refresh'}
                </button>
              </div>

              {/* ── PLATFORM PULSE ──
                  This tab used to show four numbers about the blog-post engine
                  and call itself Statistics. Meanwhile the platform was running
                  137 tables with 680 players seated and nearly 20,000 hands an
                  hour, and none of that was visible anywhere in the console. */}
              <h3 className={styles.sectionTitle}>Live Now</h3>
              {platformError ? (
                <div className={styles.errorState} role="alert">
                  <div>Platform Pulse Unavailable: {platformError}</div>
                  <button className={styles.actionBtn} onClick={loadPlatform}>Retry</button>
                </div>
              ) : platformLoading && !platform ? (
                <div className={styles.loadingSpinner}>Reading The Platform</div>
              ) : platform ? (
                <>
                  <div className={styles.kpiGrid}>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue} style={{ color: T.accent }}>{num(platform.liveTables)}</div>
                      <div className={styles.kpiLabel}>Live Tables</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue}>{num(platform.seatedNow)}</div>
                      <div className={styles.kpiLabel}>Players Seated</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue} style={{ color: T.accent }}>{num(platform.hands1h)}</div>
                      <div className={styles.kpiLabel}>Hands (Last Hour)</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue}>{num(platform.hands24h)}</div>
                      <div className={styles.kpiLabel}>
                        Hands (24h)
                        {platform.handsTrendPct !== null && platform.handsTrendPct !== undefined && (
                          <span style={{
                            marginLeft: 6,
                            color: platform.handsTrendPct >= 0 ? T.accent : T.warn,
                          }}>
                            {platform.handsTrendPct >= 0 ? '+' : ''}{platform.handsTrendPct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue}>{num(platform.waitingTables)}</div>
                      <div className={styles.kpiLabel}>Tables Waiting</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue}>{num(platform.liveTournaments)}</div>
                      <div className={styles.kpiLabel}>Live Tournaments</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue}>{num(platform.signups24h)}</div>
                      <div className={styles.kpiLabel}>Signups (24h)</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.kpiValue}>{num(platform.signups7d)}</div>
                      <div className={styles.kpiLabel}>Signups (7d)</div>
                    </div>
                  </div>

                  {/* ── ATTENTION ──
                      A roll-up of everything that currently wants a human,
                      gathered from the tabs that own each number so an operator
                      does not have to visit six of them to find out. */}
                  {(ledgerCritical > 0 || deadScrapers > 0 || bugReportBadge > 0
                    || (badges?.pendingCashouts || 0) > 0) && (
                    <>
                      <h3 className={styles.sectionTitle}>Needs Attention</h3>
                      <div className={styles.kpiGrid}>
                        {ledgerCritical > 0 && (
                          <button type="button" className={`${styles.kpi} ${styles.kpiAction}`}
                            onClick={() => { setActiveTab('clubarena'); setCaSection('ledger'); if (!caLedger) loadCaLedger(); }}>
                            <div className={styles.kpiValue} style={{ color: T.danger }}>{num(ledgerCritical)}</div>
                            <div className={styles.kpiLabel}>Ledger Drift Rows</div>
                          </button>
                        )}
                        {(badges?.pendingCashouts || 0) > 0 && (
                          <button type="button" className={`${styles.kpi} ${styles.kpiAction}`}
                            onClick={() => { setActiveTab('clubarena'); setCaSection('finance'); }}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>{num(badges.pendingCashouts)}</div>
                            <div className={styles.kpiLabel}>Pending Cashouts</div>
                          </button>
                        )}
                        {bugReportBadge > 0 && (
                          <button type="button" className={`${styles.kpi} ${styles.kpiAction}`}
                            onClick={() => setActiveTab('bugreports')}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>{num(bugReportBadge)}</div>
                            <div className={styles.kpiLabel}>Open Tickets</div>
                          </button>
                        )}
                        {deadScrapers > 0 && (
                          <button type="button" className={`${styles.kpi} ${styles.kpiAction}`}
                            onClick={() => setActiveTab('scrapers')}>
                            <div className={styles.kpiValue} style={{ color: T.danger }}>{num(deadScrapers)}</div>
                            <div className={styles.kpiLabel}>Dead Scrapers</div>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : null}

              <h3 className={styles.sectionTitle}>Content Engine</h3>
              {!analyticsLoaded ? (
                <div className={styles.loadingSpinner}>Loading Analytics</div>
              ) : analyticsError ? (
                <div className={styles.errorState}>
                  <div>Analytics Unavailable: {analyticsError}</div>
                  <button className={styles.actionBtn} onClick={() => { setAnalyticsLoaded(false); setAnalyticsError(null); loadAnalytics(); }}>Retry</button>
                </div>
              ) : (
                <>
                  {/* ONE DENOMINATOR PER TILE, AND IT IS NAMED.
                      "Total Authors" counted every content_authors row while
                      the Social Horses tab's "Total Horses" counted only the
                      rows with a poker profile, and neither label said which
                      population it was. They are two different numbers about
                      two different things: a social-only persona posts but has
                      no wallet, no club membership and cannot be dealt a hand.
                      Both tiles now state their denominator, and the
                      social-only count is its own tile rather than the
                      difference between two figures nobody could reconcile. */}
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(personas.length, '0')}</span>
                      <span className={styles.statLabel}>Total Authors (Every Persona Row)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(horses.length, '0')}</span>
                      <span className={styles.statLabel}>Of Those, Horses With A Poker Profile</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(socialOnlyCount, '0')}</span>
                      <span className={styles.statLabel}>Of Those, Social Only (No Poker Profile)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(analyticsData?.activeHorses ?? activeCount)}</span>
                      <span className={styles.statLabel}>Active Authors (7d)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(pipelineRuns.length, '0')}</span>
                      <span className={styles.statLabel}>Pipeline Runs</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(analyticsData?.totalPosts)}</span>
                      <span className={styles.statLabel}>Posts Created (7d)</span>
                    </div>
                  </div>

                  <div className={styles.contentBreakdown}>
                    <h3>Content Source Breakdown (Last 7 Days)</h3>
                    <div className={styles.breakdownGrid}>
                      {(() => {
                        const dist = analyticsData?.sourceDistribution || {};
                        const entries = Object.entries(dist);
                        if (entries.length === 0) {
                          return <p className={styles.noData}>No Data For The Last 7 Days.</p>;
                        }
                        // Math.max of an empty list is -Infinity, which produced
                        // a NaN width. Guarded.
                        const peak = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
                        return entries.map(([source, count]) => (
                          <div key={source} className={styles.breakdownItem}>
                            <div className={styles.breakdownBar}
                              style={{ width: `${Math.min((Number(count) / peak) * 100, 100)}%`, backgroundColor: T.accent }} />
                            <span className={styles.breakdownLabel}>{source}</span>
                            <span className={styles.breakdownCount}>{num(count, '0')}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── BUG REPORTS ───────────────────────── */}
          {activeTab === 'bugreports' && (
            <div className={styles.statsView}>
              <h2>Bug Reports And Support Tickets</h2>
              {/* This was the last Club Arena read still running in the
                  browser: an unbounded select on live_help_tickets with an
                  embedded profiles join, under the operator's own RLS. It is a
                  service-role route with status, search and paging now, so the
                  queue cannot silently truncate and a ticket on page three is
                  findable. */}
              <div className={styles.filterBar}>
                {[['open', 'Open'], ['in_progress', 'In Progress'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['all', 'All']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.filterBtn} ${tickets.filters.status === value ? styles.active : ''}`}
                    onClick={() => tickets.setFilter('status', value)}
                  >
                    {label}
                  </button>
                ))}
                <input
                  type="search"
                  value={bugReportsSearch}
                  onChange={(e) => setBugReportsSearch(e.target.value)}
                  placeholder="Search Subject Or Description"
                  className={styles.searchInput}
                  aria-label="Search Tickets"
                  style={{ flex: 1, minWidth: 200 }}
                />
                <button className={styles.filterBtn} onClick={tickets.refresh} disabled={tickets.loading}>
                  Refresh
                </button>
              </div>

              {tickets.error ? (
                <div className={styles.errorState}>
                  <div>Tickets Unavailable: {tickets.error}</div>
                  <button className={styles.actionBtn} onClick={tickets.refresh}>Retry</button>
                </div>
              ) : (
                <>
                  <DataTable
                    caption="Support Tickets, Newest First"
                    loading={tickets.loading}
                    loadingLabel="Loading Tickets"
                    empty={tickets.filters.q
                      ? 'No Tickets Match That Search.'
                      : 'No Tickets In This View.'}
                    rows={tickets.rows}
                    columns={[
                      {
                        key: 'user',
                        header: 'User',
                        render: (ticket) => {
                          const who = ticket.reporter || ticket.profiles || null;
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {who?.avatar_url && (
                                <img src={who.avatar_url} alt="" loading="lazy"
                                  style={{ width: 24, height: 24, borderRadius: '50%' }} />
                              )}
                              <div>
                                <div style={{ fontWeight: 600, color: T.text }}>
                                  {who?.display_name || who?.username || 'Anonymous'}
                                </div>
                                <div style={{ fontSize: 11, color: T.muted }}>@{who?.username || 'unknown'}</div>
                              </div>
                            </div>
                          );
                        },
                      },
                      {
                        key: 'subject',
                        header: 'Subject',
                        render: (ticket) => (
                          <>
                            <div style={{ fontWeight: 600, color: T.text }}>{ticket.subject}</div>
                            <div style={{ fontSize: 12, color: T.dim, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ticket.description}
                            </div>
                          </>
                        ),
                      },
                      {
                        key: 'priority',
                        header: 'Priority',
                        render: (ticket) => <StatusPill status={ticket.priority || 'medium'} />,
                      },
                      {
                        key: 'status',
                        header: 'Status',
                        render: (ticket) => <StatusPill status={ticket.status} />,
                      },
                      {
                        key: 'created_at',
                        header: 'Date',
                        render: (ticket) => when(ticket.created_at),
                      },
                      {
                        key: 'actions',
                        header: 'Actions',
                        render: (ticket) => (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {/* THE WRITE VOCABULARY IS NARROWER THAN THE READ
                                VOCABULARY, and the control now says so. The
                                filter bar offers open / in_progress / resolved
                                / closed, but stable-admin accepts only
                                ['open','resolved'] - so a binary button on an
                                in_progress ticket read "Reopen" and silently
                                DOWNGRADED it to open. A select that offers
                                exactly the two settable states cannot mislabel
                                the third and fourth; the ticket's real status
                                is in the Status column beside it. */}
                            <label className={styles.srOnly} htmlFor={`ticket-status-${ticket.id}`}>
                              Set Status For Ticket {ticket.subject || ticket.id}
                            </label>
                            <select
                              id={`ticket-status-${ticket.id}`}
                              className={styles.filterSelect}
                              value={['open', 'resolved'].includes(ticket.status) ? ticket.status : ''}
                              onChange={(e) => {
                                if (e.target.value) updateBugReportStatus(ticket.id, e.target.value);
                              }}
                            >
                              {!['open', 'resolved'].includes(ticket.status) && (
                                <option value="">{ticket.status || 'unknown'} (Set To)</option>
                              )}
                              <option value="open">Open</option>
                              <option value="resolved">Resolved</option>
                            </select>
                            {ticket.conversation_id && (
                              <a
                                href={`/hub/messenger?conversation=${ticket.conversation_id}`}
                                target="_blank" rel="noreferrer"
                                style={{
                                  background: T.accentSoft, border: `1px solid ${T.accentLine}`, color: T.accent,
                                  padding: '6px 12px', borderRadius: 8, fontSize: 12, textDecoration: 'none', fontWeight: 600,
                                }}
                              >Chat</a>
                            )}
                          </div>
                        ),
                      },
                    ]}
                  />
                  <Pager
                    offset={tickets.offset}
                    limit={tickets.limit}
                    count={tickets.rows.length}
                    total={tickets.total}
                    hasMore={tickets.hasMore}
                    loading={tickets.loading}
                    noun="Tickets"
                    onPrevious={tickets.previous}
                    onNext={tickets.next}
                  />
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── PROMO CODES ───────────────────────── */}
          {activeTab === 'promo' && (
            <div className={styles.statsView}>
              <h2>Promo Code Manager</h2>

              <div className={styles.statsOverview}>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>{num(promoCodes.length, '0')}</span>
                  <span className={styles.statLabel}>Total Codes</span>
                </div>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>{num(promoCodes.filter((c) => c.is_active).length, '0')}</span>
                  <span className={styles.statLabel}>Active</span>
                </div>
                <div className={styles.statCardLarge}>
                  <span className={styles.statNumber}>
                    {num(promoCodes.reduce((sum, c) => sum + (Number(c.current_uses ?? c.times_used) || 0), 0), '0')}
                  </span>
                  <span className={styles.statLabel}>Total Redemptions</span>
                </div>
              </div>

              <div className={styles.contentBreakdown} style={{ marginBottom: 24 }}>
                <h3>Create New Promo Code</h3>
                <form onSubmit={createPromoCode}>
                  <div className={styles.formRow} style={{ marginBottom: 12 }}>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-code">Code (Blank Auto-Generates)</label>
                      <input
                        id="promo-code" type="text" maxLength={20} placeholder="Auto-Generated"
                        value={promoForm.code}
                        onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                        style={{ textTransform: 'uppercase', letterSpacing: 2 }}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-desc">Description</label>
                      <input
                        id="promo-desc" type="text" required placeholder="Welcome Bonus For New Users"
                        value={promoForm.description}
                        onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className={styles.formRow} style={{ marginBottom: 12 }}>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-type">Type</label>
                      {/* This select used to offer `vip_trial`, which is not
                          in the route's allowlist at all -- picking it always
                          400'd. The valid list now comes from the API. */}
                      <select id="promo-type" value={promoForm.type}
                        onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}>
                        {(promoRewardTypes.length ? promoRewardTypes : ['signup_bonus', 'diamonds', 'vip_days'])
                          .map((t) => (
                            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                          ))}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-value">
                        Value ({['vip_days', 'free_trial'].includes(promoForm.type) ? 'Days' : 'Diamonds'})
                      </label>
                      <input
                        id="promo-value" type="number" min="1" max="10000" required
                        value={promoForm.value}
                        onChange={(e) => setPromoForm({ ...promoForm, value: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                  </div>
                  <div className={styles.formRow} style={{ marginBottom: 16 }}>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-max">Max Uses (Blank Is Unlimited)</label>
                      <input id="promo-max" type="number" min="1" placeholder="Unlimited"
                        value={promoForm.maxUses}
                        onChange={(e) => setPromoForm({ ...promoForm, maxUses: e.target.value })} />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="promo-exp">Expires At (Optional)</label>
                      <input id="promo-exp" type="datetime-local" value={promoForm.expiresAt}
                        onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })} />
                    </div>
                  </div>
                  <button type="submit" className={styles.btnSubmit} disabled={promoCreating} style={{ width: '100%' }}>
                    {promoCreating ? 'Creating' : 'Create Promo Code'}
                  </button>
                </form>
              </div>

              <div className={styles.contentBreakdown}>
                <h3 className={styles.sectionTitle}>
                  All Promo Codes <span className={styles.countPill}>{num(promoCodes.length, '0')}</span>
                </h3>
                {promoError ? (
                  <div className={styles.errorState}>
                    <div>Promo Codes Unavailable: {promoError}</div>
                    <button className={styles.actionBtn} onClick={loadPromoCodes}>Retry</button>
                  </div>
                ) : promoLoading ? (
                  <div className={styles.loadingSpinner}>Loading Codes</div>
                ) : promoCodes.length === 0 ? (
                  <div className={styles.emptyState}>No Promo Codes Yet. Create One Above.</div>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th scope="col">Code</th><th scope="col">Type</th><th scope="col">Value</th><th scope="col">Uses</th><th scope="col">Status</th><th scope="col">Actions</th></tr>
                      </thead>
                      <tbody>
                        {promoCodes.map((code) => {
                          // redemption_count is the real count from
                          // promo_code_redemptions; times_used is a counter
                          // that can drift from it.
                          const uses = Number(code.redemption_count ?? code.current_uses ?? code.times_used) || 0;
                          const max = code.max_uses;
                          return (
                            <tr key={code.id}>
                              <td>
                                <span style={{
                                  fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1,
                                  color: code.is_active ? T.accent : T.muted, fontSize: 15,
                                }}>{code.code}</span>
                                {code.description && (
                                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{code.description}</div>
                                )}
                              </td>
                              <td>
                                <span style={{
                                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                  background: (code.type || code.reward_type) === 'vip_trial' ? T.warnSoft : T.infoSoft,
                                  color: (code.type || code.reward_type) === 'vip_trial' ? T.warn : T.info,
                                }}>
                                  {(code.reward_type || code.type || 'unknown').replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                {num(code.reward_value ?? code.value)}{' '}
                                {['vip_days', 'free_trial'].includes(code.reward_type || code.type) ? 'days' : 'diamonds'}
                              </td>
                              <td>{num(uses, '0')}{max ? ` / ${num(max)}` : ' / Unlimited'}</td>
                              <td>
                                <span style={{
                                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                  background: code.is_active ? T.accentSoft : T.dangerSoft,
                                  color: code.is_active ? T.accent : T.danger,
                                }}>{code.is_active ? 'Active' : 'Inactive'}</span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    className={styles.filterBtn}
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(code.code);
                                        showNotification(`Copied ${code.code}`);
                                      } catch {
                                        showNotification('Clipboard Unavailable In This Browser', 'error');
                                      }
                                    }}
                                  >Copy</button>
                                  <button className={styles.filterBtn} onClick={() => openPromoEdit(code)}>
                                    Edit
                                  </button>
                                  <button className={styles.filterBtn} onClick={() => togglePromoCode(code)}>
                                    {code.is_active ? 'Deactivate' : 'Activate'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────── ECONOMY ───────────────────────────── */}
          {activeTab === 'economy' && (
            <div className={styles.statsView}>
              <h2>Diamond Economy</h2>
              {economyLoading ? (
                <div className={styles.loadingSpinner}>Loading Economy Data</div>
              ) : economyError ? (
                <div className={styles.errorState}>
                  <div>Economy Data Unavailable: {economyError}</div>
                  <button className={styles.actionBtn} onClick={() => { setEconomyError(null); loadEconomyData(); }}>Retry</button>
                </div>
              ) : !economyData ? (
                <div className={styles.emptyState}>No Economy Data Available.</div>
              ) : (
                <>
                  {economyData.failedSources?.length > 0 && (
                    <div className={styles.warnBanner}>
                      Some Figures Could Not Be Read: {economyData.failedSources.join('; ')}
                    </div>
                  )}
                  {/* Every one of these used to be `stats.x.toLocaleString()`
                      with no guard, so one missing field crashed the tab. */}
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(economyData.stats?.totalUsers)}</span>
                      <span className={styles.statLabel}>Total Users</span>
                    </div>
                    <div className={`${styles.statCardLarge} ${styles.activeBox}`}>
                      <span className={styles.statNumber}>{signed(economyData.stats?.newUsers7d || 0)}</span>
                      <span className={styles.statLabel}>New Users (7d)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.accent }}>
                        {signed(economyData.stats?.totalDiamondsEarned || 0)}
                      </span>
                      <span className={styles.statLabel}>Diamonds Earned</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.danger }}>
                        -{num(economyData.stats?.totalDiamondsSpent, '0')}
                      </span>
                      <span className={styles.statLabel}>Diamonds Spent</span>
                    </div>
                  </div>

                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(economyData.stats?.totalRewardClaims)}</span>
                      <span className={styles.statLabel}>Reward Claims</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.info }}>
                        {num(economyData.stats?.diamondPurchaseCount)}
                      </span>
                      <span className={styles.statLabel}>Diamond Purchases</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.warn }}>
                        {/* Two stacked bugs used to live here. The route summed
                            `amount_paid || price`, and diamond_purchases has
                            NEITHER column -- the real one is `price_usd` -- so
                            the figure was always 0. Then this divided it by
                            100, which would have made a real number 100x too
                            small. price_usd is already dollars. */}
                        ${(Number(economyData.stats?.diamondPurchaseRevenue) || 0).toFixed(2)}
                      </span>
                      <span className={styles.statLabel}>
                        Purchase Revenue
                        {/* The route says when it summed a capped read. A floor
                            presented as a total is the one thing a revenue tile
                            must never be. */}
                        {economyData.stats?.diamondPurchaseTruncated ? ' (Floor, Capped Read)' : ''}
                      </span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.accent }}>
                        {num(economyData.stats?.activeVipCount)} / {num(economyData.stats?.vipSubscriptionCount)}
                      </span>
                      <span className={styles.statLabel}>VIP Subscriptions</span>
                    </div>
                    {/* vip_subscriptions has ZERO rows in production. The live
                        VIP system is vip_points / vip_points_ledger, which had
                        no surface at all. */}
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.accent }}>
                        {num(economyData.vipPoints?.holders)}
                      </span>
                      <span className={styles.statLabel}>VIP Point Holders</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.warn }}>
                        {num(economyData.vipPoints?.pointsOutstanding)}
                      </span>
                      <span className={styles.statLabel}>
                        VIP Points Outstanding
                        {economyData.vipPoints?.truncated ? ' (Floor, Capped Read)' : ''}
                      </span>
                    </div>
                  </div>

                  {(economyData.stats?.diamondPurchaseTruncated || economyData.vipPoints?.truncated) && (
                    <div className={styles.warnBanner}>
                      One Or More Of The Figures Above Is Summed Over A Capped Read, So It Is A
                      Floor Rather Than An Exact Total. PostgREST Aggregate Functions Are Disabled
                      On This Project, So The Sums Are Computed Row By Row.
                    </div>
                  )}

                  {economyData.recentUsers?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Recent Signups</h3>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead><tr><th scope="col">Username</th><th scope="col">Name</th><th scope="col">Joined</th></tr></thead>
                          <tbody>
                            {economyData.recentUsers.map((u) => (
                              <tr key={u.id}>
                                <td>{u.username || '-'}</td>
                                <td>{u.full_name || '-'}</td>
                                <td>{when(u.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                    <h3>Diamond Transaction Log</h3>
                    {(economyData.transactions || []).length === 0 ? (
                      <div className={styles.emptyState}>No Transactions In Range.</div>
                    ) : (
                      <div className={styles.tableWrapper} style={{ maxHeight: 500, overflowY: 'auto' }}>
                        <table className={styles.table}>
                          <thead><tr><th scope="col">Date</th><th scope="col">User</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Source</th><th scope="col">Description</th></tr></thead>
                          <tbody>
                            {(economyData.transactions || []).map((tx, i) => {
                              const credit = tx.type === 'earned' || tx.type === 'reward' || Number(tx.amount) > 0;
                              return (
                                <tr key={tx.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(tx.created_at, true)}</td>
                                  <td style={{ fontSize: 12 }}>{tx.user_id ? `${String(tx.user_id).slice(0, 8)}...` : '-'}</td>
                                  <td>
                                    <span style={{
                                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                      background: credit ? T.accentSoft : T.dangerSoft,
                                      color: credit ? T.accent : T.danger,
                                    }}>{tx.type || 'unknown'}</span>
                                  </td>
                                  <td style={{ fontWeight: 700, color: credit ? T.accent : T.danger }}>{signed(tx.amount)}</td>
                                  <td style={{ fontSize: 12 }}>{tx.source || '-'}</td>
                                  <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {tx.description || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {economyData.vipSubscriptions?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>VIP Subscriptions</h3>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead><tr><th scope="col">Date</th><th scope="col">User</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Expires</th></tr></thead>
                          <tbody>
                            {economyData.vipSubscriptions.map((s, i) => (
                              <tr key={s.id || i}>
                                <td>{when(s.created_at)}</td>
                                <td style={{ fontSize: 12 }}>{s.user_id ? `${String(s.user_id).slice(0, 8)}...` : '-'}</td>
                                <td><span className={styles.voiceTag}>{s.plan || 'VIP'}</span></td>
                                <td style={{ color: s.status === 'active' ? T.accent : T.danger }}>{s.status || '-'}</td>
                                <td>{when(s.current_period_end)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button onClick={loadEconomyData} className={styles.actionBtn} disabled={economyLoading}>
                      Refresh Economy Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ──────────────────────────── THE MINT ─────────────────────────── */}
          {/*
            The only surface on the platform that creates supply. Three things
            about the layout are load-bearing rather than decorative:

            1. The destination control is DERIVED from the asset. Picking
               diamonds removes club and union from the page entirely, because
               chips never reach a person and diamonds never reach a club
               (Dan, 2026-09-02). An impossible pairing is not offered, not
               offered-then-rejected.
            2. Nothing submits from the form. The button composes a
               confirmation that states the balance before, the amount, and the
               balance after, in a sentence -- and THAT is what submits.
            3. The ledger is on the same screen as the button. Issuance you
               cannot see is issuance nobody checks.
          */}
          {activeTab === 'mint' && (
            <div className={styles.statsView}>
              <h2 className={styles.sectionTitle}>The Mint</h2>
              <p className={styles.subtitle} style={{ marginTop: -8, marginBottom: 20 }}>
                Authorized Issuance And Retirement. Chips Go To A Club Treasury Or A Union Bank;
                Diamonds Go To An Individual Player. Every Operation Is Journalled With Its Reason,
                The Register Is Append-Only, And Every Issuance Is Held Under The Policy Ceiling.
              </p>

              {mintError && (
                <div className={styles.errorState}>
                  <div>The Mint Could Not Load: {mintError}</div>
                  {/* NEVER bound bare. loadMintData's first parameter is the
                      ledger offset, so onClick={loadMintData} handed it the
                      React synthetic event: Math.max(0, <event>) is NaN, the
                      route's int() fell back to 0, and the operator was moved
                      to ledger page one while mintLedgerOffset still said 150 -
                      so the pager read "Showing 151-200" over rows 1-50. */}
                  <button onClick={() => { setMintLedgerOffset(0); loadMintData(0); }} className={styles.actionBtn}>Retry</button>
                </div>
              )}

              {mintLoading && !mintLoaded ? (
                <div className={styles.loadingSpinner}>Loading The Mint</div>
              ) : (
                <>
                  {/* ── IS EVERY CHIP ACCOUNTED FOR ────────────────────────── */}
                  {/* Since the 2026-09-04 opening baseline the register FOLLOWS
                      the journal, so it is supposed to equal the supply meter.
                      This card says whether it does, as of the meter's last
                      snapshot: green when the difference is the meter's own
                      unexplained drift and nothing else, which means no chip
                      was issued or retired outside the register. */}
                  {mintOverview?.totals?.reconciliation && (() => {
                    const r = mintOverview.totals.reconciliation;
                    const ok = r.balanced === true;
                    const ageMin = Math.round((Number(r.meter_age_seconds) || 0) / 60);
                    return (
                      <div className={styles.card} style={{ borderColor: ok ? T.accentLine : T.danger, marginBottom: 20 }}>
                        <h3 className={styles.sectionTitle} style={{ color: ok ? T.accent : T.danger }}>
                          {ok ? 'Every Chip Is Accounted For' : 'The Register And The Meter Disagree'}
                        </h3>
                        <p style={{ color: T.dim, margin: '4px 0 12px' }}>
                          {ok
                            ? 'The Register Equals The Supply Meter As Of Its Last Snapshot, Except For The Meter\'s Own Unexplained Drift. Nothing Was Issued Or Retired Outside The Register.'
                            : 'A Chip Reached A Balance Without A Register Row, Or Left One. The Trigger Makes That Impossible For Journal Legs, So Find The Writer.'}
                        </p>
                        <div className={styles.kpiGrid}>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Register At The Snapshot</span>
                            <span className={styles.kpiValue}>{num(r.register_net_at_meter, '0')}</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Supply Meter</span>
                            <span className={styles.kpiValue}>{num(r.meter_total, '0')}</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Difference</span>
                            <span className={styles.kpiValue} style={{ color: ok ? T.accent : T.danger }}>{num(r.difference, '0')}</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Meter Drift Since Baseline</span>
                            <span className={styles.kpiValue}>{num(r.unexplained_since_baseline, '0')}</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Snapshot Age</span>
                            <span className={styles.kpiValue}>{ageMin} Min</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Register Now</span>
                            <span className={styles.kpiValue}>{num(r.register_net, '0')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── THE POLICY ─────────────────────────────────────────── */}
                  {/* ca_mint_policy: a per-operation cap and a rolling 24h
                      ceiling, refused in fn_ca_mint and again at commit for
                      every door. Raising it is fn_ca_mint_policy_set with a
                      reason, recorded in ca_mint_policy_changes. */}
                  {mintOverview?.totals?.policy && (() => {
                    const pol = mintOverview.totals.policy;
                    const iss = mintOverview.totals.issuance || {};
                    const headroom = Number(pol.headroom_24h_chips) || 0;
                    const cap = Number(pol.rolling_24h_cap_chips) || 0;
                    const usedPct = cap > 0 ? Math.min(100, Math.round(((cap - headroom) / cap) * 100)) : 0;
                    return (
                      <div className={styles.card} style={{ marginBottom: 20 }}>
                        <h3 className={styles.sectionTitle}>Issuance Policy</h3>
                        <p style={{ color: T.dim, margin: '4px 0 12px' }}>
                          Per Operation Up To {num(pol.per_operation_cap_chips)} Chips Or {num(pol.per_operation_cap_diamonds)} Diamonds.
                          {' '}Rolling 24 Hours Up To {num(pol.rolling_24h_cap_chips)} Chips Or {num(pol.rolling_24h_cap_diamonds)} Diamonds.
                          {' '}Every Door Is Held To It At Commit. Raising It Is A Recorded Change With A Reason.
                        </p>
                        <div className={styles.kpiGrid}>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Chips Issued, Last 24h</span>
                            <span className={styles.kpiValue}>{num(iss.issued_24h, '0')}</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Chips Retired, Last 24h</span>
                            <span className={styles.kpiValue}>{num(iss.retired_24h, '0')}</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>24h Headroom</span>
                            <span className={styles.kpiValue} style={{ color: usedPct >= 80 ? T.warn : T.text }}>{num(headroom, '0')} ({usedPct}% Used)</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Issued Since Baseline</span>
                            <span className={styles.kpiValue}>{num(iss.issued_since_baseline, '0')}</span>
                          </div>
                          <div className={styles.kpi}>
                            <span className={styles.kpiLabel}>Retired Since Baseline</span>
                            <span className={styles.kpiValue}>{num(iss.retired_since_baseline, '0')}</span>
                          </div>
                        </div>
                        {pol.note && (
                          <p style={{ color: T.muted, fontSize: 12, margin: '10px 0 0' }}>
                            Policy Note: {pol.note}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── SUPPLY ─────────────────────────────────────────────── */}
                  {/* Issued (the register, net of burns) and the circulating
                      stores side by side. Since the baseline they reconcile
                      in the card above; these are the parts. */}
                  <div className={styles.kpiGrid}>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Chips Issued (Net Of Burns)</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.chips_issued, '0')}</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Diamonds Issued (Net Of Burns)</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.diamonds_issued, '0')}</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Mint Operations</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.mint_operations, '0')}</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Club Treasuries</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.club_treasuries, '0')}</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Union Banks</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.union_banks, '0')}</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Member Wallets</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.member_wallets, '0')}</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Chips On The Felt</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.chips_on_the_felt, '0')}</span>
                    </div>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>Diamonds Held</span>
                      <span className={styles.kpiValue}>{num(mintOverview?.totals?.diamonds_held, '0')}</span>
                    </div>
                  </div>

                  {/* ── RECEIPT: SENT FOR APPROVAL ─────────────────────────── */}
                  {/* A 202 is not a success and it is not a failure, and the
                      receipt has to say which of the two it is not. It names
                      the approval id an operator can quote, and the button
                      goes to the queue the request is now sitting in - a real
                      navigation through the URL, so Back returns here. */}
                  {mintReceipt && mintReceipt.pending && (
                    <div className={styles.card} style={{ marginTop: 20, borderColor: T.warn }}>
                      <h3 className={styles.sectionTitle}>Sent For Approval</h3>
                      <p style={{ color: T.dim, margin: '4px 0 12px' }}>
                        Nothing Has Moved. This Request To{' '}
                        {mintReceipt.action === 'mint' ? 'Issue' : 'Retire'}{' '}
                        <strong style={{ color: T.text }}>{formatAmount(mintReceipt.amount, mintReceipt.asset)}</strong>{' '}
                        {assetLabel(mintReceipt.asset)}{' '}
                        {mintReceipt.action === 'mint' ? 'To' : 'From'}{' '}
                        <strong style={{ color: T.text }}>{mintReceipt.target_label || mintReceipt.target_id}</strong>{' '}
                        Is Waiting For A Second Operator To Decide It.
                      </p>
                      <p style={{ color: T.muted, fontSize: 12, margin: 0, wordBreak: 'break-all' }}>
                        Approval {mintReceipt.approvalId}
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        {/* Only when that tab is actually in this operator's
                            nav. Offering a jump the guard would bounce them
                            straight back off is a button that reports a
                            failure as a navigation. */}
                        {navTabs.some((tab) => tab.id === 'approvals') && (
                          <button
                            className={styles.actionBtn}
                            onClick={() => { setMintReceipt(null); goToTab('approvals'); }}
                          >
                            Open The Approvals Tab
                          </button>
                        )}
                        <button className={styles.actionBtn} onClick={() => setMintReceipt(null)}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── RECEIPT OF THE LAST OPERATION ──────────────────────── */}
                  {mintReceipt && !mintReceipt.pending && (
                    <div className={styles.card} style={{ marginTop: 20, borderColor: T.accentLine }}>
                      <h3 className={styles.sectionTitle}>
                        {mintReceipt.replayed ? 'Already Recorded' : 'Done'}
                      </h3>
                      <p style={{ color: T.dim, margin: '4px 0 12px' }}>
                        {mintReceipt.action === 'mint' ? 'Issued' : 'Retired'}{' '}
                        <strong style={{ color: T.text }}>{formatAmount(mintReceipt.amount, mintReceipt.asset)}</strong>{' '}
                        {assetLabel(mintReceipt.asset)}{' '}
                        {mintReceipt.action === 'mint' ? 'To' : 'From'}{' '}
                        <strong style={{ color: T.text }}>{mintReceipt.target_label || mintReceipt.target_id}</strong>.
                        {' '}Balance {num(mintReceipt.balance_before)} To {num(mintReceipt.balance_after)}.
                        {' '}Net Issued Supply Is Now {num(mintReceipt.supply_after)}.
                      </p>
                      <p style={{ color: T.muted, fontSize: 12, margin: 0, wordBreak: 'break-all' }}>
                        Operation {mintReceipt.op_id}
                      </p>
                      <button
                        className={styles.actionBtn}
                        style={{ marginTop: 12 }}
                        onClick={() => setMintReceipt(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* ── THE FORM ───────────────────────────────────────────── */}
                  <div className={styles.card} style={{ marginTop: 20 }}>
                    <h3 className={styles.sectionTitle}>
                      {mintAction === 'mint' ? 'Issue' : 'Retire'}
                    </h3>

                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label htmlFor="mint-action">Operation</label>
                        <select
                          id="mint-action"
                          className={styles.filterSelect}
                          value={mintAction}
                          onChange={(e) => { setMintAction(e.target.value); setMintConfirm(null); }}
                        >
                          <option value="mint">Issue (Create Supply)</option>
                          <option value="burn">Retire (Destroy Supply)</option>
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label htmlFor="mint-asset">Asset</label>
                        <select
                          id="mint-asset"
                          className={styles.filterSelect}
                          value={mintAsset}
                          onChange={(e) => {
                            const asset = e.target.value;
                            setMintAsset(asset);
                            // The destination follows the asset. This is the
                            // law expressed as a control, so an impossible
                            // pairing cannot even be composed.
                            setMintTargetKind(asset === 'chips' ? 'club' : 'player');
                            setMintTargetId('');
                            setMintPickedPlayer(null);
                            setMintConfirm(null);
                          }}
                        >
                          <option value="chips">Chips</option>
                          <option value="diamonds">Diamonds</option>
                        </select>
                      </div>

                      {mintAsset === 'chips' && (
                        <div className={styles.formGroup}>
                          <label htmlFor="mint-holder">Holder</label>
                          <select
                            id="mint-holder"
                            className={styles.filterSelect}
                            value={mintTargetKind}
                            onChange={(e) => {
                              setMintTargetKind(e.target.value);
                              setMintTargetId('');
                              setMintConfirm(null);
                            }}
                          >
                            <option value="club">Club Treasury</option>
                            <option value="union">Union Bank</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Destination: a list for chips, a search for diamonds.
                        1,300 profiles is too many for a select; 17 clubs is not
                        enough to justify a search. */}
                    {mintAsset === 'chips' ? (
                      <div className={styles.formGroup}>
                        <label htmlFor="mint-target">
                          {mintTargetKind === 'club' ? 'Club' : 'Union'}
                        </label>
                        <select
                          id="mint-target"
                          className={styles.filterSelect}
                          value={mintTargetId}
                          onChange={(e) => { setMintTargetId(e.target.value); setMintConfirm(null); }}
                        >
                          <option value="">Select...</option>
                          {((mintTargetKind === 'club' ? mintTargets?.clubs : mintTargets?.unions) || []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}{t.code ? ` (${t.code})` : ''} - Holds {num(t.balance, '0')}
                            </option>
                          ))}
                        </select>
                        {/* "The club I want is not in this list" and "that club
                            does not exist" are different answers, and only the
                            route knows which one applies. It sets `truncated`
                            precisely so this picker can say. */}
                        {mintTargets?.truncated && (
                          <div className={styles.warnBanner} style={{ marginTop: 8 }}>
                            This Picker Is Capped At {num(MINT_TARGET_LIMIT)} Entries And Is Not The
                            Whole List. A Holder Missing From It May Still Exist.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={styles.formGroup}>
                        <label htmlFor="mint-player">Player</label>
                        <div className={styles.inputGroup}>
                          <input
                            id="mint-player"
                            className={styles.searchInput}
                            placeholder="Username, Display Name, Or Player Number"
                            value={mintPlayerQuery}
                            onChange={(e) => setMintPlayerQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchMintPlayers(mintPlayerQuery);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => searchMintPlayers(mintPlayerQuery)}
                            disabled={mintPlayerSearching}
                          >
                            {mintPlayerSearching ? 'Searching...' : 'Search'}
                          </button>
                        </div>

                        {mintPickedPlayer && (
                          <p style={{ color: T.accent, margin: '8px 0 0' }}>
                            Selected: {mintPickedPlayer.label}
                            {mintPickedPlayer.playerNumber ? ` (#${mintPickedPlayer.playerNumber})` : ''}
                            {mintPickedPlayer.isHorse ? ' - Horse' : ''}
                            {' '}- Holds {num(mintPickedPlayer.balance, '0')} Diamonds
                          </p>
                        )}

                        {mintPlayerResults.length > 0 && (
                          <div className={styles.tableWrapper} style={{ marginTop: 10, maxHeight: 240 }}>
                            <table className={styles.table}>
                              <tbody>
                                {mintPlayerResults.map((p) => (
                                  <tr key={p.id}>
                                    <td>
                                      {p.label}
                                      {p.playerNumber ? ` (#${p.playerNumber})` : ''}
                                      {/* Horses are players (section 10.5). The
                                          badge identifies, it does not exclude. */}
                                      {p.isHorse && (
                                        <span style={{ color: T.muted, marginLeft: 6 }}>Horse</span>
                                      )}
                                    </td>
                                    <td>{num(p.balance, '0')}</td>
                                    <td>
                                      <button
                                        type="button"
                                        className={styles.actionBtn}
                                        onClick={() => {
                                          setMintPickedPlayer(p);
                                          setMintTargetId(p.id);
                                          setMintPlayerResults([]);
                                          setMintConfirm(null);
                                        }}
                                      >
                                        Select
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label htmlFor="mint-amount">Amount</label>
                        <input
                          id="mint-amount"
                          className={styles.searchInput}
                          type="number"
                          min="0"
                          step={mintAsset === 'diamonds' ? '1' : '0.01'}
                          placeholder={mintAsset === 'diamonds' ? 'Whole Diamonds' : 'Chips, To Two Decimals'}
                          value={mintAmount}
                          onChange={(e) => { setMintAmount(e.target.value); setMintConfirm(null); }}
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="mint-reason">
                        Reason (At Least Ten Characters, And It Is Permanent)
                      </label>
                      <input
                        id="mint-reason"
                        className={styles.searchInput}
                        placeholder="Why Is This Supply Being Created Or Destroyed?"
                        value={mintReason}
                        onChange={(e) => { setMintReason(e.target.value); setMintConfirm(null); }}
                      />
                    </div>

                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className={mintAction === 'mint' ? styles.btnSuccess : styles.btnDanger}
                        onClick={composeMintConfirmation}
                        disabled={mintSubmitting}
                      >
                        Review {mintAction === 'mint' ? 'Issuance' : 'Retirement'}
                      </button>
                      <button type="button" className={styles.btnCancel} onClick={resetMintForm}>
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* ── CONFIRMATION ───────────────────────────────────────── */}
                  {/* Read back before anything moves. The projected balance is
                      computed from the figure the panel already loaded, so if it
                      looks wrong the operator finds out here rather than in the
                      ledger afterwards. */}
                  {/* This was a plain div: no role, no aria-modal, no Escape,
                      no focus trap and no focus restore, on the one screen in
                      the platform that creates money. It is the shared dialog
                      now. While the write is in flight it is `sticky` and
                      `blockEscape`, so a stray click on the backdrop or a jab
                      at Escape cannot dismiss the confirmation out from under a
                      request whose result the operator has not seen. */}
                  {mintConfirm && (
                    <ConfirmDialog
                      title={`Confirm ${mintConfirm.action === 'mint' ? 'Issuance' : 'Retirement'}`}
                      tone={mintConfirm.action === 'mint' ? 'go' : 'danger'}
                      busy={mintSubmitting}
                      sticky={mintSubmitting}
                      blockEscape={mintSubmitting}
                      confirmLabel={mintConfirm.approval?.willRequest
                        ? 'Yes, Send For Approval'
                        : `Yes, ${mintConfirm.action === 'mint' ? 'Issue' : 'Retire'} ${formatAmount(mintConfirm.amount, mintConfirm.asset)}`}
                      requireTyped={String(mintConfirm.asset).toUpperCase()}
                      onConfirm={submitMint}
                      onCancel={() => setMintConfirm(null)}
                      note="This Is Recorded Permanently And Cannot Be Edited. A Retirement Can Offset An Issuance, But Neither Is Ever Removed From The Journal."
                    >
                      <p style={{ marginTop: 0 }}>
                        {mintConfirm.action === 'mint' ? 'Create' : 'Destroy'}{' '}
                        <strong>{formatAmount(mintConfirm.amount, mintConfirm.asset)} {assetLabel(mintConfirm.asset)}</strong>{' '}
                        {mintConfirm.action === 'mint' ? 'And Place Them In' : 'Taken From'}{' '}
                        <strong>{mintConfirm.label}</strong>
                        {mintConfirm.balance !== null && (
                          <>
                            , Taking That Balance From{' '}
                            <strong>{num(mintConfirm.balance)}</strong> To{' '}
                            <strong>{num(mintConfirm.projected)}</strong>
                          </>
                        )}
                        .
                      </p>
                      <p style={{ color: T.dim, fontStyle: 'italic', margin: 0 }}>
                        Reason: {mintConfirm.reason}
                      </p>
                      {/* WHAT PRESSING THE BUTTON ACTUALLY DOES. With
                          maker-checker off this reads "This Will Execute
                          Immediately", which is what has always happened; with
                          it on and the amount at or over the threshold it says
                          the operation is going to a second operator instead.
                          The sentence comes from approvalModel.thresholdDecision
                          so it cannot drift from the rule the server applies. */}
                      {mintConfirm.approval && (
                        <p
                          style={{
                            margin: '12px 0 0',
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: mintConfirm.approval.willRequest ? T.warnSoft : T.surfaceTint,
                            color: mintConfirm.approval.willRequest ? T.warn : T.dim,
                            border: `1px solid ${mintConfirm.approval.willRequest ? T.warn : T.line}`,
                          }}
                        >
                          <strong>{mintConfirm.approval.headline}.</strong>{' '}
                          {mintConfirm.approval.detail}
                        </p>
                      )}
                    </ConfirmDialog>
                  )}

                  {/* ── THE LEDGER ─────────────────────────────────────────── */}
                  <div className={styles.card} style={{ marginTop: 20 }}>
                    <h3 className={styles.sectionTitle}>Transaction Ledger</h3>

                    <div className={styles.filterBar}>
                      <select
                        className={styles.filterSelect}
                        value={mintLedgerAsset}
                        aria-label="Filter By Asset"
                        onChange={(e) => refreshMintLedger({ asset: e.target.value })}
                      >
                        <option value="">All Assets</option>
                        <option value="chips">Chips</option>
                        <option value="diamonds">Diamonds</option>
                      </select>
                      <select
                        className={styles.filterSelect}
                        value={mintLedgerAction}
                        aria-label="Filter By Operation"
                        onChange={(e) => refreshMintLedger({ action: e.target.value })}
                      >
                        <option value="">Issuance And Retirement</option>
                        <option value="mint">Issuance Only</option>
                        <option value="burn">Retirement Only</option>
                      </select>
                      <select
                        className={styles.filterSelect}
                        value={mintLedgerOrigin}
                        aria-label="Filter By Origin"
                        onChange={(e) => refreshMintLedger({ origin: e.target.value })}
                      >
                        <option value="">Every Origin</option>
                        <option value="operator">Operator (This Panel)</option>
                        <option value="journal">Journal (Registered At Commit)</option>
                        <option value="baseline">Opening Baseline</option>
                        <option value="diamond-mint">Diamond Mint</option>
                        <option value="opening-grant">Club Opening Grant</option>
                        <option value="restoration">Restoration</option>
                        <option value="seed">Seed</option>
                        <option value="deletion">Deletion</option>
                      </select>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() =>
                          downloadCsv(
                            stampedName('the-mint-ledger'),
                            toCsv(mintLedgerRows, [
                              ['created_at', 'When'],
                              ['action', 'Operation'],
                              ['asset', 'Asset'],
                              ['holder_type', 'Holder Type'],
                              ['holder_label', 'Holder'],
                              ['holder_id', 'Holder Id'],
                              ['origin', 'Origin'],
                              ['amount', 'Amount'],
                              ['balance_before', 'Balance Before'],
                              ['balance_after', 'Balance After'],
                              ['supply_after', 'Net Issued Supply After'],
                              ['reason', 'Reason'],
                              ['performed_by_label', 'By'],
                              ['op_id', 'Operation Id'],
                            ])
                          )
                        }
                        disabled={!mintLedgerRows.length}
                        title="Exports The Rows Currently Loaded Below, Not The Whole Journal"
                      >
                        Export Loaded Rows
                      </button>

                      {/* A drill-down you cannot see is a drill-down you cannot
                          leave. The chip states the filter and clears it. */}
                      {mintLedgerHolder && (
                        <button
                          type="button"
                          className={styles.filterBtn}
                          onClick={() => refreshMintLedger({ holder: null })}
                          title="Show Every Holder Again"
                        >
                          Only {mintLedgerHolder.label} - Clear
                        </button>
                      )}
                    </div>

                    {!mintLedgerRows.length ? (
                      /* "Nothing Has Been Issued Or Retired Yet" is a claim
                         about the whole journal, and once a holder drill-down
                         or an asset filter is on it is very likely false: a
                         club with no diamond operations would be told the Mint
                         has never issued anything. An empty FILTER and an empty
                         JOURNAL are different facts and are worded that way. */
                      <div className={styles.emptyState}>
                        {mintLedgerHolder || mintLedgerAsset || mintLedgerAction || mintLedgerOrigin ? (
                          <>
                            No Operations Match These Filters
                            {mintLedgerHolder ? ` For ${mintLedgerHolder.label}` : ''}. Clear Them
                            To See The Whole Journal.
                          </>
                        ) : (
                          <>
                            Nothing Has Been Issued Or Retired Yet. Every Operation Will Appear
                            Here, With Who Did It And Why.
                          </>
                        )}
                      </div>
                    ) : (
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>When</th>
                              <th>Operation</th>
                              <th>Origin</th>
                              <th>Holder</th>
                              <th>Amount</th>
                              <th>Balance</th>
                              <th>Net Issued</th>
                              <th>Reason</th>
                              <th>By</th>
                              <th>Correct</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mintLedgerRows.map((row) => (
                              <tr key={row.id}>
                                <td>{when(row.created_at, true)}</td>
                                <td
                                  style={{ color: row.action === 'mint' ? T.accent : T.danger }}
                                >
                                  {row.action === 'mint' ? 'Issued' : 'Retired'} {assetLabel(row.asset)}
                                </td>
                                <td style={{ color: T.dim }}>{row.origin || '-'}</td>
                                <td>
                                  {/* Clicking a holder narrows the journal to that
                                      holder. The route has always supported it and
                                      "everything ever issued to this club" is the
                                      first question anyone asks of an issuance log. */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      refreshMintLedger({
                                        holder: {
                                          id: row.holder_id,
                                          label: row.holder_label || row.holder_id,
                                        },
                                      })
                                    }
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: T.text,
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                      textUnderlineOffset: 3,
                                      font: 'inherit',
                                    }}
                                    title="Show Only This Holder"
                                  >
                                    {row.holder_label || `${String(row.holder_id).slice(0, 8)}...`}
                                  </button>
                                  <span style={{ color: T.muted, marginLeft: 6 }}>
                                    {row.holder_type}
                                  </span>
                                </td>
                                <td>
                                  {row.action === 'mint' ? '+' : '-'}
                                  {num(row.amount)}
                                </td>
                                <td style={{ color: T.dim }}>
                                  {num(row.balance_before)} To {num(row.balance_after)}
                                </td>
                                <td>{num(row.supply_after)}</td>
                                <td>{row.reason}</td>
                                <td>{row.performed_by_label || '-'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={() => reverseMintOperation(row)}
                                    title={`Load The Opposite Of This ${row.action === 'mint' ? 'Issuance' : 'Retirement'} Into The Form`}
                                  >
                                    Reverse
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* The journal was a fixed limit=100 with no control, so
                        operation 101 could not be reached from this console at
                        all. The route has always accepted limit/offset
                        (PHASE1-CONTRACTS item 5); this drives it. The noun says
                        which journal is being paged, so a narrowed count is not
                        mistaken for the whole Mint. */}
                    <Pager
                      offset={mintLedgerOffset}
                      limit={MINT_LEDGER_PAGE_SIZE}
                      count={mintLedgerRows.length}
                      total={typeof mintLedger?.total === 'number' ? mintLedger.total : null}
                      loading={mintLoading || mintLedgerLoading}
                      noun={
                        mintLedgerHolder
                          ? `Operations For ${mintLedgerHolder.label}`
                          : 'Operations'
                      }
                      onPrevious={() => goMintLedgerPage(mintLedgerOffset - MINT_LEDGER_PAGE_SIZE)}
                      onNext={() => goMintLedgerPage(mintLedgerOffset + MINT_LEDGER_PAGE_SIZE)}
                    />
                  </div>

                  <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button
                      onClick={() => { setMintLedgerOffset(0); loadMintData(0); }}
                      className={styles.actionBtn}
                      disabled={mintLoading}
                    >
                      Refresh The Mint
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── ANTI-ABUSE ────────────────────────── */}
          {activeTab === 'antiabuse' && (
            <div className={styles.statsView}>
              <h2>Anti-Abuse Command Center</h2>
              {abuseLoading ? (
                <div className={styles.loadingSpinner}>Loading Anti-Abuse Data</div>
              ) : abuseError ? (
                <div className={styles.errorState}>
                  <div>Anti-Abuse Data Unavailable: {abuseError}</div>
                  <button className={styles.actionBtn} onClick={() => { setAbuseError(null); loadAntiAbuseData(); }}>Retry</button>
                </div>
              ) : !abuseData ? (
                <div className={styles.emptyState}>No Data Available.</div>
              ) : (
                <>
                  {/* A failed read on THIS tab is a false negative -- an empty
                      abuse log reads as "no abuse", which is the one wrong
                      answer this surface must never give. The route now names
                      what it could not read; say so loudly. */}
                  {abuseData.failedSources?.length > 0 && (
                    <div className={styles.warnBanner} role="alert">
                      This View Is Incomplete. These Sources Could Not Be Read, So An
                      Empty Panel Below Does NOT Mean Nothing Was Found:{' '}
                      {abuseData.failedSources
                        .map((f) => (typeof f === 'string' ? f : `${f.source} (${f.error})`))
                        .join('; ')}
                    </div>
                  )}
                  {/* stats.disposableScope, not abuse.disposableScope. It sits
                      one level deeper than this read expected, so the caveat
                      never rendered and a PAGE-SCOPED count was shown as a
                      whole-table figure on the one tab whose job is to be
                      believed. */}
                  {abuseData.abuse?.stats?.disposableScope && (
                    <div className={styles.warnBanner}>
                      Disposable-Email Count Is Scoped To {abuseData.abuse.stats.disposableScope}.
                    </div>
                  )}
                  <div className={styles.statsOverview}>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber}>{num(abuseData.abuse?.stats?.totalSignups)}</span>
                      <span className={styles.statLabel}>Tracked Signups</span>
                    </div>
                    <div className={styles.statCardLarge} style={{ borderColor: T.danger }}>
                      <span className={styles.statNumber} style={{ color: T.danger }}>
                        {num(abuseData.abuse?.stats?.blocked)}
                      </span>
                      <span className={styles.statLabel}>Blocked Or Flagged</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.warn }}>
                        {num(abuseData.abuse?.stats?.disposable)}
                      </span>
                      <span className={styles.statLabel}>Disposable Emails</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.info }}>
                        {num(abuseData.alerts?.length, '0')}
                      </span>
                      <span className={styles.statLabel}>Alerts (24h)</span>
                    </div>
                    <div className={styles.statCardLarge}>
                      <span className={styles.statNumber} style={{ color: T.warn }}>
                        {num(abuseData.abuse?.stats?.deletedAccounts)}
                      </span>
                      <span className={styles.statLabel}>Deleted Accounts</span>
                    </div>
                  </div>

                  {abuseData.alerts?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24, borderLeft: `3px solid ${T.danger}` }}>
                      <h3>Real-Time Alerts</h3>
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {abuseData.alerts.map((alert, i) => (
                          <div key={i} style={{
                            padding: '10px 14px', borderBottom: `1px solid ${T.line}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                          }}>
                            <div>
                              <div style={{ fontWeight: 600, color: T.danger, fontSize: 13 }}>{alert.reason}</div>
                              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                                {alert.email} - IP {alert.ip} - Deletions {num(alert.deletions, '0')}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap' }}>{when(alert.at, true)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                    <h3>Signup Abuse Log</h3>
                    {(abuseData.abuse?.log || []).length === 0 ? (
                      <div className={styles.emptyState}>No Signup Abuse Recorded.</div>
                    ) : (
                      <div className={styles.tableWrapper} style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <table className={styles.table}>
                          <thead>
                            <tr><th scope="col">Email</th><th scope="col">IP</th><th scope="col">Signups</th><th scope="col">Deletions</th><th scope="col">Welcome</th><th scope="col">Flags</th><th scope="col">Last Signup</th></tr>
                          </thead>
                          <tbody>
                            {(abuseData.abuse?.log || []).map((entry, i) => (
                              <tr key={entry.id || i} style={{ background: entry.deleted_account_count > 0 ? T.dangerSoft : undefined }}>
                                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {entry.raw_email || (entry.email_hash ? `${entry.email_hash.slice(0, 12)}...` : 'Unknown')}
                                </td>
                                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{entry.ip_address || '-'}</td>
                                <td style={{ textAlign: 'center' }}>{num(entry.signup_count, '1')}</td>
                                <td style={{
                                  textAlign: 'center',
                                  color: entry.deleted_account_count > 0 ? T.danger : T.muted,
                                  fontWeight: entry.deleted_account_count > 0 ? 700 : 400,
                                }}>{num(entry.deleted_account_count, '0')}</td>
                                <td style={{ textAlign: 'center', color: entry.welcome_package_granted ? T.accent : T.muted }}>
                                  {entry.welcome_package_granted ? 'Yes' : 'No'}
                                </td>
                                <td style={{ fontSize: 11, maxWidth: 200 }}>
                                  {(entry.abuse_flags || []).map((f, j) => (
                                    <span key={j} style={{
                                      display: 'inline-block', padding: '2px 6px', borderRadius: 3,
                                      background: T.dangerSoft, color: T.danger, fontSize: 10, margin: '1px 2px',
                                    }}>{f.reason || 'flagged'}</span>
                                  ))}
                                </td>
                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(entry.last_signup_at, true)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {abuseData.abuse?.topIPs?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Top IPs By Signup Volume</h3>
                      <div className={styles.breakdownGrid}>
                        {(() => {
                          const peak = Math.max(1, ...abuseData.abuse.topIPs.map((x) => Number(x.count) || 0));
                          return abuseData.abuse.topIPs.map((ip, i) => (
                            <div key={i} className={styles.breakdownItem}>
                              <div className={styles.breakdownBar} style={{
                                width: `${Math.min((Number(ip.count) / peak) * 100, 100)}%`,
                                backgroundColor: ip.count > 3 ? T.danger : ip.count > 1 ? T.warn : T.accent,
                              }} />
                              <span className={styles.breakdownLabel} style={{ fontFamily: 'monospace' }}>{ip.ip}</span>
                              <span className={styles.breakdownCount}>{num(ip.count, '0')} Signups</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {abuseData.economy?.sourceBreakdown && Object.keys(abuseData.economy.sourceBreakdown).length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>
                        Diamond Source Breakdown
                        {/* This was a 30-day figure presented as a lifetime
                            total, with nothing on screen saying so. */}
                        {abuseData.economy?.windowLabel && (
                          <span style={{ color: T.dim, fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
                            ({abuseData.economy.windowLabel}
                            {abuseData.economy.truncated ? ', Truncated' : ''})
                          </span>
                        )}
                      </h3>
                      <div className={styles.statsOverview}>
                        <div className={styles.statCardLarge}>
                          <span className={styles.statNumber} style={{ color: T.accent }}>
                            {signed(abuseData.economy.totalGranted || 0)}
                          </span>
                          <span className={styles.statLabel}>Total Granted</span>
                        </div>
                        <div className={styles.statCardLarge}>
                          <span className={styles.statNumber} style={{ color: T.danger }}>
                            -{num(abuseData.economy.totalSpent, '0')}
                          </span>
                          <span className={styles.statLabel}>Total Spent</span>
                        </div>
                      </div>
                      <div className={styles.breakdownGrid} style={{ marginTop: 12 }}>
                        {(() => {
                          const entries = Object.entries(abuseData.economy.sourceBreakdown);
                          // Math.max(...[]) is -Infinity. This produced NaN widths.
                          const peak = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
                          return entries.sort((a, b) => b[1] - a[1]).map(([source, amount]) => (
                            <div key={source} className={styles.breakdownItem}>
                              <div className={styles.breakdownBar} style={{
                                width: `${Math.min((Number(amount) / peak) * 100, 100)}%`,
                                backgroundColor: T.accent,
                              }} />
                              <span className={styles.breakdownLabel}>{source}</span>
                              <span className={styles.breakdownCount}>{num(amount, '0')}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  {abuseData.economy?.topHolders?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Top Diamond Holders</h3>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          {/* Email was removed from this response: a bulk PII
                              leaderboard did not need it. */}
                          <thead><tr>
                            <th scope="col">Rank</th><th scope="col">Username</th>
                            <th scope="col">Diamonds</th><th scope="col">VIP</th><th scope="col">Phone</th>
                          </tr></thead>
                          <tbody>
                            {abuseData.economy.topHolders.map((holder, i) => (
                              <tr key={holder.id}>
                                <td style={{ fontWeight: 700, color: i < 3 ? T.warn : T.muted }}>{i + 1}</td>
                                <td>{holder.username || '-'}</td>
                                <td style={{ fontWeight: 700, color: T.accent }}>{num(holder.diamonds, '0')}</td>
                                <td>{holder.is_vip ? (holder.vip_tier || 'VIP') : '-'}</td>
                                <td style={{ color: holder.phone_verified ? T.accent : T.muted }}>
                                  {holder.phone_verified ? 'Verified' : 'No'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {abuseData.audit?.length > 0 && (
                    <div className={styles.contentBreakdown} style={{ marginTop: 24 }}>
                      <h3>Admin Audit Log</h3>
                      <div className={styles.tableWrapper} style={{ maxHeight: 300, overflowY: 'auto' }}>
                        <table className={styles.table}>
                          <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Details</th><th scope="col">IP</th></tr></thead>
                          <tbody>
                            {abuseData.audit.map((entry, i) => (
                              <tr key={entry.id || i}>
                                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(entry.created_at, true)}</td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                    background: T.accentSoft, color: T.accent,
                                  }}>{entry.action}</span>
                                </td>
                                <td style={{ fontSize: 12 }}>
                                  {entry.target_type} {entry.target_id ? String(entry.target_id).slice(0, 8) : '-'}
                                </td>
                                <td style={{ fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {JSON.stringify(entry.details || {}).slice(0, 80)}
                                </td>
                                <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{entry.ip_address || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button onClick={loadAntiAbuseData} className={styles.actionBtn} disabled={abuseLoading}>
                      Refresh Anti-Abuse Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── CLUB ARENA ────────────────────────── */}
          {activeTab === 'clubarena' && (
            <div className={styles.statsView}>
              <h2>Club Arena Admin</h2>
              <p style={{ color: T.dim, fontSize: 13, marginBottom: 20 }}>
                Platform-Level Oversight Of Every Club, Union, Agent And Chip Movement.
              </p>

              {caWarnings?.length > 0 && (
                <div className={styles.warnBanner}>
                  Some Sources Could Not Be Read, So The Figures Below Are Incomplete: {caWarnings.join('; ')}
                </div>
              )}

              {/* ── CASHOUT CONFIRMATION ──────────────────────────────────
                  The shared dialog, not window.confirm, because this is the
                  one place a /horses operator moves a player's chips and the
                  sentence about whether they move on Confirm has to come from
                  thresholdDecision, the same as the Mint. Sticky while the
                  request is in flight. */}
              {cashoutConfirm && (
                <ConfirmDialog
                  title={cashoutConfirm.action === 'approve' ? 'Force Approve Cashout' : 'Return Chips To The Player'}
                  tone={cashoutConfirm.action === 'approve' ? 'danger' : 'go'}
                  busy={caProcessing}
                  sticky={caProcessing}
                  blockEscape={caProcessing}
                  confirmLabel={cashoutConfirm.action !== 'approve'
                    ? 'Yes, Return The Chips'
                    : cashoutConfirm.decision?.willRequest
                      ? 'Yes, Send For Approval'
                      : 'Yes, Force Approve'}
                  onConfirm={submitCashout}
                  onCancel={() => setCashoutConfirm(null)}
                >
                  <p style={{ marginTop: 0 }}>
                    {cashoutConfirm.action === 'approve' ? 'Force Approve' : 'Cancel'} A Cashout Of{' '}
                    <strong>{formatAmount(cashoutConfirm.cashout.amount, 'chips')} Chips</strong>
                    {cashoutConfirm.cashout.player_name ? (
                      <> For <strong>{cashoutConfirm.cashout.player_name}</strong></>
                    ) : null}
                    {cashoutConfirm.cashout.club_name ? (
                      <> In <strong>{cashoutConfirm.cashout.club_name}</strong></>
                    ) : null}
                    .
                  </p>
                  <p style={{ color: T.dim, margin: 0 }}>
                    {cashoutConfirm.action === 'approve'
                      ? 'This Pays The Request And Moves Real Chips Into The Club Treasury For Settlement.'
                      : 'This Releases The Request And Returns The Chips To The Player.'}
                  </p>
                  {cashoutConfirm.decision && (
                    <p
                      style={{
                        margin: '12px 0 0',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: cashoutConfirm.decision.willRequest ? T.warnSoft : T.surfaceTint,
                        color: cashoutConfirm.decision.willRequest ? T.warn : T.dim,
                        border: `1px solid ${cashoutConfirm.decision.willRequest ? T.warn : T.line}`,
                      }}
                    >
                      <strong>{cashoutConfirm.decision.headline}.</strong>{' '}
                      {cashoutConfirm.decision.detail}
                    </p>
                  )}
                </ConfirmDialog>
              )}
              <div className={styles.subNav}>
                {CA_SECTIONS.map(([id, label]) => (
                  <button
                    key={id}
                    className={caSection === id ? styles.active : ''}
                    aria-current={caSection === id ? 'page' : undefined}
                    onClick={() => {
                      // Just the section. The data for it is loaded by an
                      // effect keyed on caSection, so a shared link, Back and
                      // the Needs Attention jump all reach it the same way a
                      // click does - this onClick used to be the ONLY caller,
                      // which is why ?section=ledger showed a spinner forever.
                      setCaSection(id);
                      setCaSelectedClub(null);
                      setCaSelectedUser(null);
                    }}
                  >
                    {label}
                    {id === 'approvals' && pendingAppCount + pendingLeaveCount > 0
                      ? ` (${pendingAppCount + pendingLeaveCount})` : ''}
                    {/* caStats.pendingCashouts is the exact platform count.
                        caPendingCashouts.length is a page capped at 100, so the
                        badge under-reported the work waiting. */}
                    {id === 'finance' && (caStats?.pendingCashouts || 0) > 0
                      ? ` (${num(caStats.pendingCashouts)})` : ''}
                    {id === 'ledger' && ledgerCritical > 0 ? ` (${num(ledgerCritical)})` : ''}
                  </button>
                ))}
                {/* margin-left:auto pinned this to the end of the SCROLL width
                    on mobile, where .subNav becomes a nowrap overflow strip --
                    so the primary refresh sat past seven tabs, invisible. */}
                <button onClick={loadClubArenaData} disabled={caLoading} className={styles.subNavRefresh}>
                  {caLoading ? 'Refreshing' : 'Refresh'}
                </button>
              </div>

              {caError ? (
                <div className={styles.errorState}>
                  <div>Club Arena Data Unavailable: {caError}</div>
                  <button className={styles.actionBtn} onClick={loadClubArenaData}>Retry</button>
                </div>
              ) : caLoading && !caLoaded ? (
                <div className={styles.loadingSpinner}>Loading Club Arena Data</div>
              ) : (
                <>
                  {/* ── OVERVIEW ── (caStats was computed and never rendered) */}
                  {caSection === 'overview' && (
                    <>
                      <div className={styles.kpiGrid}>
                        {[
                          ['Clubs', caStats?.totalClubs],
                          ['Members', caStats?.totalMembers],
                          ['Live Tables', caStats?.totalTables],
                          ['Pending Cashouts', caStats?.pendingCashouts],
                          ['Cashout Total', caStats?.pendingCashoutTotal],
                          ['Chips Minted (24h)', caStats?.totalMinted24h],
                        ].map(([label, value]) => (
                          <div key={label} className={styles.kpi}>
                            <div className={styles.kpiValue}>{num(value)}</div>
                            <div className={styles.kpiLabel}>{label}</div>
                          </div>
                        ))}
                      </div>

                      <h3 className={styles.sectionTitle}>
                        Recent Chip Movement
                        <span className={styles.countPill}>{num(caFinance?.recentTxns?.length, '0')}</span>
                      </h3>
                      {(caFinance?.recentTxns || []).length === 0 ? (
                        <div className={styles.emptyState}>No Recent Chip Transactions.</div>
                      ) : (
                        <div className={styles.tableWrapper}>
                          <table className={styles.table}>
                            <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Notes</th></tr></thead>
                            <tbody>
                              {(caFinance?.recentTxns || []).slice(0, 25).map((txn, i) => (
                                <tr key={txn.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                  <td>{txn.club_name || '-'}</td>
                                  <td><span className={styles.voiceTag}>{txn.transaction_type || 'unknown'}</span></td>
                                  <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                    {signed(txn.amount)}
                                  </td>
                                  <td style={{ fontSize: 12, color: T.dim, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {txn.notes || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── CLUBS ── */}
                  {caSection === 'clubs' && !caSelectedClub && (
                    caClubs.length === 0 ? (
                      <div className={styles.emptyState}>No Clubs Found.</div>
                    ) : (
                      <>
                      <ShowingOf
                        truncated={caPages?.clubs?.truncated}
                        count={caClubs.length}
                        total={caPages?.clubs?.total}
                        noun="Clubs"
                      />
                      <div className={styles.cardGrid}>
                        {/* These cards used to be role="button" with a real
                            <button> nested inside, which ARIA forbids:
                            role="button" has presentational children, so the
                            Suspend control may not have been exposed at all.
                            The card is a plain container now and the club name
                            carries the activation, which also gets Space and
                            Enter for free. */}
                        {caClubs.map((club) => (
                          <div key={club.id} className={styles.card}>
                            <button type="button" className={styles.cardTitleBtn}
                              onClick={() => loadCaClubDetail(club)}>
                              {club.name}
                            </button>
                            <div style={{ fontSize: 12, color: T.dim, marginBottom: 10 }}>
                              Code {club.club_id || club.code || '-'} - {num(club.member_count, '0')} Members - {num(club.table_count, '0')} Tables
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
                              Owner {club.owner_name || '-'} - Created {when(club.created_at)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{
                                background: club.status === 'active' ? T.accentSoft : T.dangerSoft,
                                color: club.status === 'active' ? T.accent : T.danger,
                                borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                              }}>{club.status || 'active'}</span>
                              <span style={{ fontSize: 11, color: T.muted }}>
                                Treasury {num(club.chip_treasury, '0')}
                              </span>
                              {/* toggleClubStatus existed in code with no button anywhere. */}
                              <button
                                className={styles.filterBtn}
                                disabled={caProcessing}
                                style={{ marginLeft: 'auto' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleClubStatus(club, club.status === 'suspended' ? 'active' : 'suspended');
                                }}
                              >
                                {club.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      </>
                    )
                  )}

                  {caSection === 'clubs' && caSelectedClub && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                        <button className={styles.filterBtn} onClick={() => { setCaSelectedClub(null); setCaClubDetail(null); }}>
                          All Clubs
                        </button>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{caSelectedClub.name}</span>
                          <span style={{ fontSize: 12, color: T.dim, marginLeft: 10 }}>
                            Code {caSelectedClub.club_id || '-'} - {num(caSelectedClub.member_count, '0')} Members
                          </span>
                        </div>
                        <button className={styles.filterBtn} style={{ marginLeft: 'auto' }}
                          onClick={() => loadCaClubDetail(caSelectedClub)} disabled={caLoading}>
                          Refresh
                        </button>
                      </div>

                      <div className={styles.subNav}>
                        {/* EVERY COUNT HERE IS THE ROUTE'S TOTAL, not the
                            length of the array that fitted under the page cap.
                            `memberCount` is a server-side count over all
                            members; pages.<list>.total covers the rest. A page
                            length rendered as "Members (50)" told the operator
                            a 1,200-member club had fifty. */}
                        {[
                          ['overview', 'Overview'],
                          ['members', `Members (${num(caClubDetail?.memberCount ?? caClubDetail?.pages?.members?.total, '0')})`],
                          ['agents', `Agents (${num(caClubDetail?.agentCount ?? caClubDetail?.pages?.agents?.total, '0')})`],
                          ['tables', `Tables (${num(caClubDetail?.tableCount ?? caClubDetail?.pages?.tables?.total, '0')})`],
                          ['cashouts', `Cashouts (${num(caClubDetail?.pages?.cashouts?.total ?? caClubDetail?.pendingCashouts?.length, '0')})`],
                          ['flags', `Flags (${num(caClubDetail?.flags?.length, '0')})`],
                          ['sessions', `Sessions (${num(caClubDetail?.sessions?.length, '0')})`],
                        ].map(([id, label]) => (
                          <button key={id} className={caClubTab === id ? styles.active : ''}
                            aria-current={caClubTab === id ? 'page' : undefined}
                            onClick={() => setCaClubTab(id)}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {caLoading || !caClubDetail ? (
                        <div className={styles.loadingSpinner}>Loading Club</div>
                      ) : caClubTab === 'overview' ? (
                        <>
                          {/* CHIPS ON BOOKS IS THE ROUTE'S FIGURE, NOT A SUM
                              OF THIS PAGE. It used to reduce over the first 50
                              members of the club and present the result as the
                              club's chips on books - a fabricated balance, on
                              the tab that exists to make chip movement
                              answerable. `memberChipTotal` is summed
                              server-side over every member (addendum item 11).
                              Where the route has not sent one, the tile says
                              the number is unknown rather than showing a page
                              sum that looks like a balance. */}
                          <div className={styles.kpiGrid}>
                            {[
                              ['Members', caClubDetail.memberCount ?? caClubDetail.pages?.members?.total],
                              ['Agents', caClubDetail.agentCount ?? caClubDetail.pages?.agents?.total],
                              ['Tables', caClubDetail.tableCount ?? caClubDetail.pages?.tables?.total],
                              ['Pending Cashouts', caClubDetail.pages?.cashouts?.total],
                              ['Chips On Books', caClubDetail.memberChipTotal ?? null],
                            ].map(([label, value]) => (
                              <div key={label} className={styles.kpi}>
                                <div className={styles.kpiValue}>{num(value)}</div>
                                <div className={styles.kpiLabel}>
                                  {label}
                                  {label === 'Chips On Books' && caClubDetail.memberChipTotalScope
                                    ? ` (${caClubDetail.memberChipTotalScope})` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                          {caClubDetail.memberChipTotalTruncated && (
                            <div className={styles.warnBanner}>
                              Chips On Books Was Summed Over The First{' '}
                              {num(caClubDetail.memberChipTotalRowsRead)} Members This Club Has, So It
                              Is A Floor Rather Than The Whole Balance.
                            </div>
                          )}
                          <h3 className={styles.sectionTitle}>Recent Transactions</h3>
                          {(caClubDetail.recentTxns || []).length === 0 ? (
                            <div className={styles.emptyState}>No Recent Transactions.</div>
                          ) : (
                            <div className={styles.tableWrapper}>
                              <table className={styles.table}>
                                <thead><tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Notes</th></tr></thead>
                                <tbody>
                                  {caClubDetail.recentTxns.map((txn, i) => (
                                    <tr key={txn.id || i}>
                                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                      <td>{txn.transaction_type || 'unknown'}</td>
                                      <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                        {signed(txn.amount)}
                                      </td>
                                      <td style={{ fontSize: 12, color: T.dim }}>{txn.notes || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : caClubTab === 'members' ? (
                        (caClubDetail.members || []).length === 0 ? (
                          <div className={styles.emptyState}>No Members In This Club.</div>
                        ) : (
                          <>
                          <ShowingOf
                            truncated={caClubDetail.pages?.members?.truncated}
                            count={caClubDetail.members.length}
                            total={caClubDetail.memberCount ?? caClubDetail.pages?.members?.total}
                            noun="Members"
                          />
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Player</th><th scope="col">Role</th><th scope="col">Chips</th><th scope="col">Hands</th><th scope="col">Status</th><th scope="col">Joined</th></tr></thead>
                              <tbody>
                                {caClubDetail.members.map((m) => (
                                  // club_members has a COMPOSITE key and no id column;
                                  // the API returns row_key for exactly this reason.
                                  <tr key={m.row_key}>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{m.player_name}</div>
                                      {m.email && <div style={{ fontSize: 11, color: T.muted }}>{m.email}</div>}
                                    </td>
                                    <td><span className={styles.voiceTag}>{m.role || 'member'}</span></td>
                                    <td style={{ fontWeight: 600, color: T.accent }}>{num(m.chip_balance, '0')}</td>
                                    <td>{num(m.hands_played, '0')}</td>
                                    <td style={{ color: m.status === 'active' ? T.accent : T.dim }}>{m.status || '-'}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(m.joined_at || m.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )
                      ) : caClubTab === 'agents' ? (
                        (caClubDetail.agents || []).length === 0 ? (
                          <div className={styles.emptyState}>No Agents In This Club.</div>
                        ) : (
                          <>
                          <ShowingOf
                            truncated={caClubDetail.pages?.agents?.truncated}
                            count={caClubDetail.agents.length}
                            total={caClubDetail.pages?.agents?.total}
                            noun="Agents"
                          />
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Agent</th><th scope="col">Role</th><th scope="col">Commission</th><th scope="col">Credit Used</th><th scope="col">Players</th><th scope="col">Status</th></tr></thead>
                              <tbody>
                                {caClubDetail.agents.map((a) => (
                                  <tr key={a.id}>
                                    <td style={{ fontWeight: 600 }}>{a.player_name}</td>
                                    <td><span className={styles.voiceTag}>{a.role || 'agent'}</span></td>
                                    <td>{a.commission_rate !== null && a.commission_rate !== undefined
                                      ? `${(Number(a.commission_rate) * 100).toFixed(0)}%` : '-'}</td>
                                    <td>{num(a.credit_used, '0')} / {num(a.credit_limit, '0')}</td>
                                    <td>{num(a.total_players, '0')}</td>
                                    <td style={{ color: a.status === 'active' ? T.accent : T.dim }}>{a.status || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )
                      ) : caClubTab === 'tables' ? (
                        (caClubDetail.tables || []).length === 0 ? (
                          <div className={styles.emptyState}>No Tables In This Club.</div>
                        ) : (
                          <>
                          <ShowingOf
                            truncated={caClubDetail.pages?.tables?.truncated}
                            count={caClubDetail.tables.length}
                            total={caClubDetail.pages?.tables?.total}
                            noun="Tables"
                          />
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Table</th><th scope="col">Game</th><th scope="col">Stakes</th><th scope="col">Seats</th><th scope="col">Status</th><th scope="col">Created</th></tr></thead>
                              <tbody>
                                {caClubDetail.tables.map((t) => (
                                  <tr key={t.id}>
                                    <td style={{ fontWeight: 600 }}>{t.name || `Table ${String(t.id).slice(0, 8)}`}</td>
                                    <td>{t.game_type || '-'}</td>
                                    <td>{t.stakes || '-'}</td>
                                    {/* max_players, not max_seats - the old query 42703'd on this column. */}
                                    <td>{num(t.current_players, '0')} / {num(t.max_players)}</td>
                                    <td style={{ color: ['running', 'active'].includes(t.status) ? T.accent : T.dim }}>
                                      {t.status || 'inactive'}
                                    </td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(t.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )
                      ) : caClubTab === 'flags' ? (
                        /* reviewFlag() has existed in this file with no caller
                           since the tab was written. The anti-cheat route
                           exposes nine actions and the console reached two. */
                        (caClubDetail.flags || []).length === 0 ? (
                          <div className={styles.emptyState}>
                            {caClubDetail.securityError
                              ? `Flags Unavailable: ${caClubDetail.securityError}`
                              : 'No Open Anti-Cheat Flags For This Club.'}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {caClubDetail.flags.map((flag) => (
                              <div key={flag.id} className={styles.card} style={{
                                borderLeft: `4px solid ${flag.severity === 'high' ? T.danger
                                  : flag.severity === 'medium' ? T.warn : T.line}`,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                                  <span style={{
                                    background: flag.severity === 'high' ? T.dangerSoft : T.warnSoft,
                                    color: flag.severity === 'high' ? T.danger : T.warn,
                                    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                                    textTransform: 'uppercase',
                                  }}>{flag.severity || 'low'}</span>
                                  <span style={{ fontWeight: 600, color: T.text }}>{flag.flag_type || 'flag'}</span>
                                  <span style={{ fontSize: 11, color: T.muted, marginLeft: 'auto' }}>
                                    {when(flag.created_at || flag.flagged_at, true)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 13, color: T.dim, marginBottom: 10 }}>
                                  Player <strong style={{ color: T.text }}>{flag.player_name || flag.user_id || 'unknown'}</strong>
                                  {flag.description && <> - {flag.description}</>}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button className={styles.filterBtn} disabled={caProcessing}
                                    onClick={() => reviewFlag(flag, 'dismiss')}>Dismiss</button>
                                  <button className={styles.filterBtn} disabled={caProcessing}
                                    onClick={() => reviewFlag(flag, 'reviewed')}>Mark Reviewed</button>
                                  <button className={styles.btnDanger} disabled={caProcessing}
                                    onClick={() => reviewFlag(flag, 'kick')}>Kick Player</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : caClubTab === 'sessions' ? (
                        (caClubDetail.sessions || []).length === 0 ? (
                          <div className={styles.emptyState}>
                            {caClubDetail.securityError
                              ? `Sessions Unavailable: ${caClubDetail.securityError}`
                              : 'No Active Sessions At This Club Right Now.'}
                          </div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Players Currently Seated At This Club</caption>
                              <thead><tr>
                                <th scope="col">Player</th><th scope="col">Table</th>
                                <th scope="col">Duration</th><th scope="col">Action</th>
                              </tr></thead>
                              <tbody>
                                {caClubDetail.sessions.map((session, i) => (
                                  <tr key={session.id || i}>
                                    <td style={{ fontWeight: 600 }}>{session.player_name || session.user_id || 'unknown'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                      {session.table_id ? String(session.table_id).slice(0, 8) : '-'}
                                    </td>
                                    <td>{session.duration_minutes !== undefined && session.duration_minutes !== null
                                      ? `${num(session.duration_minutes)}m` : '-'}</td>
                                    <td>
                                      <button className={styles.btnDanger} disabled={caProcessing}
                                        onClick={() => kickSession(session)}>Kick</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : (
                        (caClubDetail.pendingCashouts || []).length === 0 ? (
                          <div className={styles.emptyState}>No Pending Cashouts For This Club.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <thead><tr><th scope="col">Player</th><th scope="col">Amount</th><th scope="col">Requested</th><th scope="col">Note</th><th scope="col">Action</th></tr></thead>
                              <tbody>
                                {caClubDetail.pendingCashouts.map((c) => (
                                  <tr key={c.id}>
                                    <td style={{ fontWeight: 600 }}>{c.player_name}</td>
                                    <td style={{ fontWeight: 700, color: T.warn }}>{num(c.amount)}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(c.created_at, true)}</td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{c.agent_note || c.player_note || '-'}</td>
                                    <td>
                                      {c.pendingApprovalId ? (
                                        <span title={`Approval ${c.pendingApprovalId}`}>
                                          <StatusPill tone="warn" label="Waiting For Approval" />
                                        </span>
                                      ) : (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          <button className={styles.filterBtn} disabled={caProcessing}
                                            onClick={() => resolveCashout(c, 'approve')}>Approve</button>
                                          <button className={styles.filterBtn} disabled={caProcessing}
                                            onClick={() => resolveCashout(c, 'cancel')}>Return Chips</button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </>
                  )}

                  {/* ── FINANCE ── (caFinance and caPendingCashouts had no UI at all) */}
                  {caSection === 'finance' && (
                    <>
                      <div className={styles.kpiGrid}>
                        <div className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color: T.accent }}>{num(caFinance?.totalMinted24h)}</div>
                          <div className={styles.kpiLabel}>Chips Minted (24h)</div>
                        </div>
                        <div className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color: T.warn }}>{num(caFinance?.pendingCashoutTotal)}</div>
                          <div className={styles.kpiLabel}>
                            Pending Cashout Total
                            {/* The route caps this sum and says when it hit the
                                cap. A floor shown as a total is how a payout
                                queue looks smaller than it is. */}
                            {caStats?.pendingCashoutTotalTruncated ? ' (Floor, Sum Capped)' : ''}
                          </div>
                        </div>
                        <div className={styles.kpi}>
                          {/* The exact platform count - the same figure the
                              Overview tile shows. This used to be
                              caPendingCashouts.length, a page capped at 100, so
                              two near-identical labels carried two different
                              numbers and the smaller one was on the screen an
                              operator works from. */}
                          <div className={styles.kpiValue}>{num(caStats?.pendingCashouts)}</div>
                          <div className={styles.kpiLabel}>Cashout Requests</div>
                        </div>
                      </div>

                      {caStats?.pendingCashoutTotalTruncated && (
                        <div className={styles.warnBanner}>
                          The Pending Cashout Total Is Summed Over A Capped Read, So It Is A Floor.
                          The Real Figure Is At Least This Large.
                        </div>
                      )}

                      <h3 className={styles.sectionTitle}>
                        Pending Cashouts
                        {(caStats?.pendingCashouts || 0) > 0 && (
                          <span className={`${styles.countPill} ${styles.warnPill}`}>{num(caStats.pendingCashouts)}</span>
                        )}
                      </h3>
                      <ShowingOf
                        truncated={caPages?.cashouts?.truncated}
                        count={caPendingCashouts.length}
                        total={caPages?.cashouts?.total ?? caStats?.pendingCashouts}
                        noun="Cashout Requests"
                      />
                      {caPendingCashouts.length === 0 ? (
                        <div className={styles.emptyState}>No Pending Cashouts Anywhere On The Platform.</div>
                      ) : (
                        <div className={styles.tableWrapper}>
                          <table className={styles.table}>
                            <thead><tr><th scope="col">Club</th><th scope="col">Player</th><th scope="col">Amount</th><th scope="col">Requested</th><th scope="col">Note</th><th scope="col">Action</th></tr></thead>
                            <tbody>
                              {caPendingCashouts.map((c) => (
                                <tr key={c.id}>
                                  <td>{c.club_name || '-'}</td>
                                  <td style={{ fontWeight: 600 }}>{c.player_name}</td>
                                  <td style={{ fontWeight: 700, color: T.warn }}>{num(c.amount)}</td>
                                  <td style={{ fontSize: 12, color: T.dim }}>{when(c.created_at, true)}</td>
                                  <td style={{ fontSize: 12, color: T.dim, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.agent_note || c.player_note || '-'}
                                  </td>
                                  <td>
                                    {c.pendingApprovalId ? (
                                      <span title={`Approval ${c.pendingApprovalId}`}>
                                        <StatusPill tone="warn" label="Waiting For Approval" />
                                      </span>
                                    ) : (
                                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <button className={styles.filterBtn} disabled={caProcessing}
                                          onClick={() => resolveCashout(c, 'approve')}>Approve</button>
                                        <button className={styles.filterBtn} disabled={caProcessing}
                                          onClick={() => resolveCashout(c, 'cancel')}>Return Chips</button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <h3 className={styles.sectionTitle}>Recent Chip Movement</h3>
                      {(caFinance?.recentTxns || []).length === 0 ? (
                        <div className={styles.emptyState}>No Recent Transactions.</div>
                      ) : (
                        <div className={styles.tableWrapper} style={{ maxHeight: 420, overflowY: 'auto' }}>
                          <table className={styles.table}>
                            <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Notes</th></tr></thead>
                            <tbody>
                              {caFinance.recentTxns.map((txn, i) => (
                                <tr key={txn.id || i}>
                                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(txn.created_at, true)}</td>
                                  <td>{txn.club_name || '-'}</td>
                                  <td>{txn.transaction_type || 'unknown'}</td>
                                  <td style={{ fontWeight: 700, color: Number(txn.amount) > 0 ? T.accent : T.danger }}>
                                    {signed(txn.amount)}
                                  </td>
                                  <td style={{ fontSize: 12, color: T.dim }}>{txn.notes || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── REVENUE ──
                      rake_records holds 1.37M rows and 4,028,434 chips of rake
                      all time, and had NO surface anywhere in this console.
                      The Cashouts section headlined "Chips Minted (24h)" -- a
                      zero -- while nearly 200,000 chips of rake moved in that
                      same window, invisible. */}
                  {caSection === 'revenue' && (
                    caRevenueError ? (
                      <div className={styles.errorState} role="alert">
                        <div>Revenue Unavailable: {caRevenueError}</div>
                        <button className={styles.actionBtn} onClick={loadCaRevenue}>Retry</button>
                      </div>
                    ) : caRevenueLoading || !caRevenue ? (
                      <div className={styles.loadingSpinner}>Loading Revenue</div>
                    ) : (
                      <>
                        <div className={styles.kpiGrid}>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.accent }}>{num(caRevenue.rake24h?.total)}</div>
                            <div className={styles.kpiLabel}>Rake (24h)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue}>{num(caRevenue.rake7d?.total)}</div>
                            <div className={styles.kpiLabel}>Rake (7d)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>{num(caRevenue.rake24h?.bbj)}</div>
                            <div className={styles.kpiLabel}>Into BBJ (24h)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue}>{num(caRevenue.rake24h?.handCount ?? caRevenue.rake24h?.hands)}</div>
                            <div className={styles.kpiLabel}>Raked Hands (24h)</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>
                              {num(caRevenue.unsettledCommissions?.total)}
                            </div>
                            <div className={styles.kpiLabel}>Unsettled Commission</div>
                          </div>
                        </div>

                        {(caRevenue.rake24h?.truncated || caRevenue.rake7d?.truncated
                          || caRevenue.unsettledCommissions?.truncated) && (
                          <div className={styles.warnBanner}>
                            One Or More Of These Totals Is Summed Over The Most Recent{' '}
                            {num(caRevenue.pageSize)} Rows Only, So It Is A Floor Rather Than An Exact
                            Figure. PostgREST Aggregate Functions Are Disabled On This Project, So The
                            Sums Are Computed Row By Row.
                          </div>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Rake By Club (24h)
                          <button className={styles.filterBtn} style={{ marginLeft: 'auto' }}
                            onClick={() => {
                              downloadCsv(stampedName('rake-by-club'), toCsv(caRevenue.byClub || [], [
                                ['club_name', 'Club'], ['club_id', 'Club ID'],
                                ['rake', 'Rake'], ['bbj', 'BBJ'], ['hands', 'Hands'],
                              ]));
                              showNotification('Exported Rake By Club');
                            }}>Export CSV</button>
                        </h3>
                        {(caRevenue.byClub || []).length === 0 ? (
                          <div className={styles.emptyState}>No Rake Recorded In The Last 24 Hours.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Rake Taken Per Club Over The Last 24 Hours</caption>
                              <thead><tr>
                                <th scope="col">Club</th><th scope="col">Rake</th>
                                <th scope="col">Into BBJ</th><th scope="col">Hands</th>
                              </tr></thead>
                              <tbody>
                                {caRevenue.byClub.map((c) => (
                                  <tr key={c.club_id}>
                                    <td>{c.club_name || <span style={{ color: T.muted }}>Unattributed</span>}</td>
                                    <td style={{ fontWeight: 700, color: T.accent }}>{num(c.rake)}</td>
                                    <td style={{ color: T.warn }}>{num(c.bbj)}</td>
                                    <td>{num(c.hands)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Unsettled Agent Commission
                          {caRevenue.unsettledCommissions?.rowCount > 0 && (
                            <span className={`${styles.countPill} ${styles.warnPill}`}>
                              {num(caRevenue.unsettledCommissions.rowCount)} Rows
                            </span>
                          )}
                        </h3>
                        {(caRevenue.unsettledCommissions?.byAgent || []).length === 0 ? (
                          <div className={styles.emptyState}>Nothing Outstanding.</div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Agent Commission That Has Not Been Settled</caption>
                              <thead><tr>
                                <th scope="col">Agent</th><th scope="col">Club</th>
                                <th scope="col">Owed</th><th scope="col">Entries</th>
                              </tr></thead>
                              <tbody>
                                {caRevenue.unsettledCommissions.byAgent.map((a) => (
                                  <tr key={a.user_id || 'unassigned'}>
                                    <td style={{ fontWeight: 600 }}>{a.agent_name}</td>
                                    <td>{a.club_name || '-'}</td>
                                    <td style={{ fontWeight: 700, color: T.warn }}>{num(a.amount)}</td>
                                    <td>{num(a.rows)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )
                  )}

                  {/* ── LEDGER ──
                      reconcile_ledger_nightly has been filing drift into
                      ledger_reconcile_log every morning and nothing had ever
                      read it. CLAUDE.md section 11.5 built this machinery
                      specifically so chip loss would be LOUD; it was silent
                      because the only surface that could have shown it did not
                      query it. */}
                  {caSection === 'ledger' && (
                    caLedgerError ? (
                      <div className={styles.errorState} role="alert">
                        <div>Ledger Unavailable: {caLedgerError}</div>
                        <button className={styles.actionBtn} onClick={loadCaLedger}>Retry</button>
                      </div>
                    ) : caLedgerLoading || !caLedger ? (
                      <div className={styles.loadingSpinner}>Loading Ledger Reconciliation</div>
                    ) : (
                      <>
                        {caLedger.counts?.critical > 0 && (
                          <div className={styles.errorState} role="alert" style={{ textAlign: 'left' }}>
                            <strong>{num(caLedger.counts.critical)} Critical Reconciliation Rows.</strong>{' '}
                            The Nightly Job Found The Chip Ledger And The Stored Balances Disagreeing.
                            Every Row Below Is A Wallet Whose Recorded History Does Not Add Up To Its Balance.
                          </div>
                        )}

                        <div className={styles.kpiGrid}>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: caLedger.counts?.critical > 0 ? T.danger : T.accent }}>
                              {num(caLedger.counts?.critical)}
                            </div>
                            <div className={styles.kpiLabel}>Critical</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: T.warn }}>{num(caLedger.counts?.warn)}</div>
                            <div className={styles.kpiLabel}>Warnings</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ color: caLedger.counts?.unaccountedSeatExits > 0 ? T.danger : T.accent }}>
                              {num(caLedger.counts?.unaccountedSeatExits)}
                            </div>
                            <div className={styles.kpiLabel}>Unaccounted Seat Exits</div>
                          </div>
                          <div className={styles.kpi}>
                            <div className={styles.kpiValue} style={{ fontSize: 15 }}>{when(caLedger.lastRun?.run_ts, true)}</div>
                            <div className={styles.kpiLabel}>Last Reconciliation</div>
                          </div>
                        </div>

                        {/* THE TRUNCATION FLAGS ARE THE POINT OF THIS PANEL.
                            This is the one surface built to make chip loss
                            loud; a capped list reading as complete here is the
                            failure mode it exists to prevent. All three flags
                            were returned and discarded. */}
                        {caLedger.rpcRowCap && (
                          <div className={styles.warnBanner}>
                            The Reconciliation RPC Returns At Most {num(caLedger.rpcRowCap)} Rows Per
                            Call, So Every List Below Is A Sample Of The Run And Not The Run.
                          </div>
                        )}

                        {caLedger.circulation?.length > 0 && (
                          <>
                            <h3 className={styles.sectionTitle}>Chip Circulation</h3>
                            <ShowingOf
                              truncated={caLedger.circulationTruncated}
                              count={caLedger.circulation.length}
                              total={caLedger.counts?.circulation}
                              noun="Clubs"
                            />
                            <div className={styles.tableWrapper}>
                              <table className={styles.table}>
                                <caption className={styles.srOnly}>Where The Chips Are, Per Club</caption>
                                <thead><tr>
                                  <th scope="col">Club</th><th scope="col">Member Wallets</th>
                                  <th scope="col">On The Felt</th><th scope="col">Treasury</th><th scope="col">Total</th>
                                </tr></thead>
                                <tbody>
                                  {caLedger.circulation.map((c, i) => (
                                    <tr key={c.club_id || i}>
                                      <td>{c.club_name || '-'}</td>
                                      <td>{num(c.member_wallets)}</td>
                                      <td>{num(c.on_the_felt)}</td>
                                      <td>{num(c.treasury)}</td>
                                      <td style={{ fontWeight: 700, color: T.accent }}>{num(c.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Largest Drift
                          <span className={styles.countPill}>
                            Top {num(caLedger.sampleSize)} Of {num(caLedger.counts?.critical)}
                          </span>
                          {/* THE FILE SAYS WHAT IT IS. This exports
                              caLedger.critical - the SAMPLE the route sends,
                              not the set - and an auditor was getting ~200 rows
                              of a 20,000-row problem with nothing in the file
                              or the toast admitting it. A sampling row is
                              written into the CSV itself, because the toast is
                              gone four seconds later and the file is not. */}
                          <button className={styles.filterBtn} style={{ marginLeft: 'auto' }}
                            onClick={() => {
                              const rows = caLedger.critical || [];
                              const total = caLedger.counts?.critical;
                              const partial = typeof total === 'number' && total > rows.length;
                              const noteRow = partial ? [{
                                run_date: '',
                                entity_type: 'EXPORT NOTE',
                                entity_id: '',
                                entity_name: `Sample Of ${rows.length} Rows Out Of ${total} Critical Rows. This File Is NOT The Whole Set.`,
                                ledger_balance: '', stored_balance: '', drift: '',
                                severity: '', notes: '',
                              }] : [];
                              downloadCsv(stampedName('ledger-drift'), toCsv([...noteRow, ...rows], [
                                ['run_date', 'Run Date'], ['entity_type', 'Entity Type'],
                                ['entity_id', 'Entity ID'], ['entity_name', 'Name'],
                                ['ledger_balance', 'Ledger Balance'], ['stored_balance', 'Stored Balance'],
                                ['drift', 'Drift'], ['severity', 'Severity'], ['notes', 'Notes'],
                              ]));
                              showNotification(
                                partial
                                  ? `Exported ${num(rows.length)} Of ${num(total)} Critical Rows. This Is The Sample, Not The Set.`
                                  : `Exported ${num(rows.length)} Critical Rows`,
                                partial ? 'info' : 'success',
                              );
                            }}>Export CSV</button>
                        </h3>
                        {(caLedger.critical || []).length === 0 ? (
                          <div className={styles.emptyState}>No Critical Drift. The Ledger Reconciles.</div>
                        ) : (
                          <div className={styles.tableWrapper} style={{ maxHeight: 520, overflowY: 'auto' }}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Wallets With The Largest Drift Between Ledger And Stored Balance</caption>
                              <thead><tr>
                                <th scope="col">Entity</th><th scope="col">Type</th>
                                <th scope="col">Ledger</th><th scope="col">Stored</th>
                                <th scope="col">Drift</th><th scope="col">Run</th>
                              </tr></thead>
                              <tbody>
                                {caLedger.critical.map((r) => (
                                  <tr key={r.id}>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{r.entity_name || '-'}</div>
                                      <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>
                                        {r.entity_id ? String(r.entity_id).slice(0, 8) : ''}
                                      </div>
                                    </td>
                                    <td>{r.entity_type}</td>
                                    <td>{num(r.ledger_balance)}</td>
                                    <td>{num(r.stored_balance)}</td>
                                    <td style={{ fontWeight: 700, color: Number(r.drift) < 0 ? T.danger : T.warn }}>
                                      {signed(r.drift)}
                                    </td>
                                    <td style={{ fontSize: 12, color: T.dim }}>{when(r.run_date)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h3 className={styles.sectionTitle}>
                          Unaccounted Seat Exits
                          <span style={{ color: T.dim, fontWeight: 400, fontSize: 13 }}>Last 7 Days</span>
                        </h3>
                        <ShowingOf
                          truncated={caLedger.unaccountedSeatExitsTruncated}
                          count={(caLedger.unaccountedSeatExits || []).length}
                          total={caLedger.counts?.unaccountedSeatExits}
                          noun="Seat Exits"
                        />
                        {(caLedger.unaccountedSeatExits || []).length === 0 ? (
                          <div className={styles.emptyState}>
                            Every Non-Zero Stack That Left A Seat Has A Matching Wallet Credit.
                          </div>
                        ) : (
                          <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                              <caption className={styles.srOnly}>Stacks That Left A Seat With No Matching Wallet Credit</caption>
                              <thead><tr>
                                <th scope="col">When</th><th scope="col">Player</th>
                                <th scope="col">Stack</th><th scope="col">Exit</th>
                                <th scope="col">Role</th><th scope="col">Application</th>
                              </tr></thead>
                              <tbody>
                                {caLedger.unaccountedSeatExits.map((e) => (
                                  <tr key={e.exit_id || e.id}>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(e.occurred_at, true)}</td>
                                    <td style={{ fontWeight: 600 }}>{e.player_name}</td>
                                    <td style={{ fontWeight: 700, color: T.danger }}>{num(e.stack)}</td>
                                    <td>{e.exit_kind || '-'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.db_role || '-'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.app_name || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )
                  )}

                  {/* ── USERS ── (searchCaUsers and loadCaUserDetail were unreachable) */}
                  {caSection === 'users' && (
                    <>
                      <form
                        onSubmit={(e) => { e.preventDefault(); searchCaUsers(caUserSearch); }}
                        style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}
                      >
                        <input
                          type="search" value={caUserSearch}
                          onChange={(e) => setCaUserSearch(e.target.value)}
                          placeholder="Search By Name, Username, Email Or Player Number"
                          className={styles.searchInput}
                          style={{ flex: 1, minWidth: 240 }}
                          aria-label="Search Players"
                        />
                        <button type="submit" className={styles.actionBtn} disabled={caUserSearching}>
                          {caUserSearching ? 'Searching' : 'Search'}
                        </button>
                      </form>

                      {caSelectedUser ? (
                        <>
                          <button className={styles.filterBtn} style={{ marginBottom: 16 }}
                            onClick={() => setCaSelectedUser(null)}>Back To Results</button>
                          <div className={styles.card}>
                            <div style={{ fontWeight: 700, fontSize: 17, color: T.text }}>
                              {caSelectedUser.profile?.display_name || caSelectedUser.display_name || 'Unknown'}
                            </div>
                            <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
                              @{caSelectedUser.profile?.username || caSelectedUser.username || 'unknown'}
                              {' - '}{caSelectedUser.profile?.email || caSelectedUser.email || 'No Email'}
                              {' - '}Player #{num(caSelectedUser.profile?.player_number ?? caSelectedUser.player_number)}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
                              Role {caSelectedUser.profile?.role || caSelectedUser.role || 'user'}
                              {' - '}Diamonds {num(caSelectedUser.profile?.diamonds ?? caSelectedUser.diamonds)}
                              {' - '}Joined {when(caSelectedUser.profile?.created_at || caSelectedUser.created_at)}
                            </div>
                          </div>

                          {caSelectedUser.loading ? (
                            <div className={styles.loadingSpinner}>Loading Player</div>
                          ) : (
                            <>
                              <h3 className={styles.sectionTitle}>
                                Club Memberships
                                <span className={styles.countPill}>{num(caSelectedUser.memberships?.length, '0')}</span>
                              </h3>
                              {(caSelectedUser.memberships || []).length === 0 ? (
                                <div className={styles.emptyState}>Not A Member Of Any Club.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th scope="col">Club</th><th scope="col">Role</th><th scope="col">Chips</th><th scope="col">Hands</th><th scope="col">Status</th><th scope="col">Joined</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.memberships.map((m) => (
                                        <tr key={m.row_key}>
                                          <td>{m.club_name || '-'} <span style={{ color: T.muted, fontSize: 11 }}>{m.club_code || ''}</span></td>
                                          <td><span className={styles.voiceTag}>{m.role || 'member'}</span></td>
                                          <td style={{ color: T.accent, fontWeight: 600 }}>{num(m.chip_balance, '0')}</td>
                                          <td>{num(m.hands_played, '0')}</td>
                                          <td>{m.status || '-'}</td>
                                          <td style={{ fontSize: 12, color: T.dim }}>{when(m.joined_at || m.created_at)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <h3 className={styles.sectionTitle}>Chip Transactions</h3>
                              {(caSelectedUser.txns || []).length === 0 ? (
                                <div className={styles.emptyState}>No Chip Transactions.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Direction</th><th scope="col">Type</th><th scope="col">Amount</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.txns.map((t, i) => (
                                        <tr key={t.id || i}>
                                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(t.created_at, true)}</td>
                                          <td>{t.club_name || '-'}</td>
                                          <td style={{ color: t.direction === 'in' ? T.accent : T.danger }}>
                                            {t.direction === 'in' ? 'Received' : 'Sent'}
                                          </td>
                                          <td>{t.transaction_type || 'unknown'}</td>
                                          <td style={{ fontWeight: 700 }}>{num(t.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <h3 className={styles.sectionTitle}>Cashout History</h3>
                              {(caSelectedUser.cashouts || []).length === 0 ? (
                                <div className={styles.emptyState}>No Cashout Requests.</div>
                              ) : (
                                <div className={styles.tableWrapper}>
                                  <table className={styles.table}>
                                    <thead><tr><th scope="col">Time</th><th scope="col">Club</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
                                    <tbody>
                                      {caSelectedUser.cashouts.map((c) => (
                                        <tr key={c.id}>
                                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when(c.created_at, true)}</td>
                                          <td>{c.club_name || '-'}</td>
                                          <td style={{ fontWeight: 700 }}>{num(c.amount)}</td>
                                          <td style={{ color: c.status === 'pending' ? T.warn : T.dim }}>{c.status || '-'}</td>
                                          <td style={{ fontSize: 12, color: T.dim }}>{c.agent_note || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : caUserResults.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caUserSearch.trim().length >= 2 && !caUserSearching
                            ? 'No Players Match That Search.'
                            : 'Search For A Player To Inspect Their Clubs, Chips And Cashouts.'}
                        </div>
                      ) : (
                        <div className={styles.cardGrid}>
                          {/* Same change as the club cards: a real button
                              carries the activation instead of a div with
                              role="button" and an Enter-only key handler. */}
                          {caUserResults.map((u) => (
                            <div key={u.id} className={styles.card}>
                              <button type="button" className={styles.cardTitleBtn}
                                onClick={() => loadCaUserDetail(u)}>
                                {u.display_name || u.username || 'Unknown'}
                              </button>
                              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{u.email || 'No Email'}</div>
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                                Player #{num(u.player_number)} - {u.role || 'user'}
                                {u.is_vip ? ` - ${u.vip_tier || 'VIP'}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── UNIONS ── (caUnions was loaded and never rendered) */}
                  {caSection === 'unions' && (
                    caUnions.length === 0 ? (
                      <div className={styles.emptyState}>No Unions Found.</div>
                    ) : (
                      <>
                      <ShowingOf
                        truncated={caPages?.unions?.truncated}
                        count={caUnions.length}
                        total={caPages?.unions?.total}
                        noun="Unions"
                      />
                      <div className={styles.cardGrid}>
                        {caUnions.map((u) => (
                          <div key={u.id} className={styles.card}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{u.name}</div>
                            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
                              Code {u.union_code || u.code || '-'}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
                              {num(u.club_count, '0')} Clubs - {num(u.member_count, '0')} Members
                            </div>
                            <div style={{ fontSize: 12, color: T.accent, marginTop: 4 }}>
                              Chip Balance {num(u.chip_balance, '0')}
                            </div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Created {when(u.created_at)}</div>
                          </div>
                        ))}
                      </div>
                      </>
                    )
                  )}

                  {/* ── APPROVALS ── */}
                  {caSection === 'approvals' && (
                    <>
                      <h3 className={styles.sectionTitle}>
                        Union Applications
                        {pendingAppCount > 0 && <span className={`${styles.countPill} ${styles.warnPill}`}>{pendingAppCount} Pending</span>}
                      </h3>
                      <div className={styles.filterBar}>
                        {['pending', 'all'].map((f) => (
                          <button key={f} className={`${styles.filterBtn} ${caAppTab === f ? styles.active : ''}`} aria-pressed={caAppTab === f}
                            onClick={() => { setCaAppTab(f); loadApplications(f); }}>
                            {f === 'pending' ? 'Pending' : 'All'}
                          </button>
                        ))}
                        <button className={styles.filterBtn} onClick={() => loadApplications(caAppTab)} disabled={caAppLoading}>
                          Refresh
                        </button>
                      </div>

                      {caAppLoading ? (
                        <div className={styles.loadingSpinner}>Loading Applications</div>
                      ) : caApplications.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caAppTab === 'pending' ? 'No Pending Applications.' : 'No Applications Found.'}
                        </div>
                      ) : caApplications.map((app) => (
                        <div key={app.id} className={styles.card} style={{
                          // T.warn, not a raw rgba literal. The file header
                          // rule is that colours come from horsesAdminTokens.
                          borderColor: app.status === 'pending' ? T.warn : T.line,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{app.club_name}</span>
                            <span style={{ fontSize: 12, color: T.dim }}>Club {app.club_code}</span>
                            <span style={{
                              background: app.status === 'pending' ? T.warnSoft : app.status === 'approved' ? T.accentSoft : T.dangerSoft,
                              color: app.status === 'pending' ? T.warn : app.status === 'approved' ? T.accent : T.danger,
                              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}>{app.status || 'unknown'}</span>
                          </div>
                          {/* The owner line is gone. union_applications rows
                              carry no `profiles` embed - the list branch of
                              union-application selects '*, unions(name)' and
                              nothing else - so these two expressions were dead
                              in every case and the card promised an identity it
                              never had. It comes back when the route attaches
                              profiles the way list_leave_requests does. */}
                          <div style={{ fontSize: 12, color: T.dim }}>
                            {num(app.member_count, '0')} Members - Applied {when(app.applied_at)}
                          </div>
                          {app.message && (
                            <div style={{
                              marginTop: 10, background: T.inset, borderRadius: 8, padding: '10px 14px',
                              fontSize: 13, color: T.dim, borderLeft: `3px solid ${T.accent}`, fontStyle: 'italic',
                            }}>{app.message}</div>
                          )}
                          {app.review_note && (
                            <div style={{ marginTop: 6, fontSize: 12, color: T.muted }}>Review Note: {app.review_note}</div>
                          )}
                          {app.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
                              <label style={{ fontSize: 12, color: T.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Commission %
                                <input
                                  type="number" min="0" max="100" step="1"
                                  value={caAppCommission[app.id] ?? '90'}
                                  onChange={(e) => setCaAppCommission((prev) => ({ ...prev, [app.id]: e.target.value }))}
                                  style={{
                                    width: 64, background: T.inset, border: `1px solid ${T.line}`,
                                    borderRadius: 6, color: T.text, fontSize: 13, padding: '5px 8px', textAlign: 'center',
                                  }}
                                />
                              </label>
                              <button className={styles.btnSuccess} disabled={caProcessing}
                                onClick={() => reviewApplication(app, 'approve')}>
                                Approve And Add To Union
                              </button>
                              <input
                                placeholder="Rejection Reason (Optional)"
                                aria-label={`Rejection Reason For ${app.club_name || 'This Application'}`}
                                value={caAppReason[app.id] ?? ''}
                                onChange={(e) => setCaAppReason((prev) => ({ ...prev, [app.id]: e.target.value }))}
                                style={{
                                  flex: 1, minWidth: 180, background: T.inset, border: `1px solid ${T.line}`,
                                  borderRadius: 6, color: T.text, fontSize: 12, padding: '7px 10px',
                                }}
                              />
                              <button className={styles.btnDanger} disabled={caProcessing}
                                onClick={() => reviewApplication(app, 'reject')}>
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      <h3 className={styles.sectionTitle}>
                        Union Leave Requests
                        {pendingLeaveCount > 0 && <span className={`${styles.countPill} ${styles.warnPill}`}>{pendingLeaveCount} Pending</span>}
                      </h3>
                      <div className={styles.filterBar}>
                        {['pending', 'all'].map((f) => (
                          <button key={f} className={`${styles.filterBtn} ${caLeaveTab === f ? styles.active : ''}`} aria-pressed={caLeaveTab === f}
                            onClick={() => { setCaLeaveTab(f); loadLeaveRequests(f); }}>
                            {f === 'pending' ? 'Pending' : 'All'}
                          </button>
                        ))}
                        <button className={styles.filterBtn} onClick={() => loadLeaveRequests(caLeaveTab)} disabled={caLeaveLoading}>
                          Refresh
                        </button>
                      </div>

                      {caLeaveLoading ? (
                        <div className={styles.loadingSpinner}>Loading Leave Requests</div>
                      ) : caLeaveRequests.length === 0 ? (
                        <div className={styles.emptyState}>
                          {caLeaveTab === 'pending' ? 'No Pending Leave Requests.' : 'No Leave Requests Found.'}
                        </div>
                      ) : caLeaveRequests.map((req) => (
                        <div key={req.id} className={styles.card} style={{
                          borderColor: req.status === 'pending' ? T.warn : T.line,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{req.club_name}</span>
                            {req.club_code && <span style={{ fontSize: 12, color: T.dim }}>Club {req.club_code}</span>}
                            <span style={{
                              background: req.status === 'pending' ? T.warnSoft : req.status === 'approved' ? T.accentSoft : T.dangerSoft,
                              color: req.status === 'pending' ? T.warn : req.status === 'approved' ? T.accent : T.danger,
                              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}>{req.status || 'unknown'}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.dim }}>
                            Requested {when(req.requested_at)}
                            {req.profiles?.display_name && <> - Owner <strong style={{ color: T.text }}>{req.profiles.display_name}</strong></>}
                            {req.unions?.name && <> - Union <strong style={{ color: T.text }}>{req.unions.name}</strong></>}
                          </div>
                          {req.reason && (
                            <div style={{
                              marginTop: 10, background: T.inset, borderRadius: 8, padding: '10px 14px',
                              fontSize: 13, color: T.dim, borderLeft: `3px solid ${T.warn}`, fontStyle: 'italic',
                            }}>{req.reason}</div>
                          )}
                          {req.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                              <button className={styles.btnSuccess} disabled={caProcessing}
                                onClick={() => reviewLeaveRequest(req, 'approve')}>
                                Approve And Remove From Union
                              </button>
                              <button className={styles.btnDanger} disabled={caProcessing}
                                onClick={() => reviewLeaveRequest(req, 'deny')}>
                                Deny
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── GEEVES KB ─────────────────────────── */}
          {activeTab === 'geeves' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Geeves Knowledge Base</h2>
                  <p style={{ margin: '4px 0 0', color: T.dim, fontSize: 14 }}>
                    Questions That Fell Through To Grok. Add Them To The KB To Make Geeves Smarter.
                  </p>
                </div>
                <button className={styles.actionBtn} onClick={loadGeevesAnalytics} disabled={geevesLoading}>
                  {geevesLoading ? 'Loading' : 'Refresh'}
                </button>
              </div>

              {geevesError ? (
                <div className={styles.errorState}>
                  <div>Geeves Analytics Unavailable: {geevesError}</div>
                  <button className={styles.actionBtn} onClick={loadGeevesAnalytics}>Retry</button>
                </div>
              ) : (
                <>
                  {geevesAnalytics.summary && (
                    <div className={styles.kpiGrid}>
                      {[
                        ['Missed This Week', geevesAnalytics.summary.missedThisWeek, T.danger],
                        ['Resolved This Week', geevesAnalytics.summary.resolvedThisWeek, T.accent],
                        ['Total Added To KB', geevesAnalytics.summary.totalAddedToKB, T.accent],
                        ['Cache Answers Served', geevesAnalytics.summary.cacheAnswersServedThisWeek, T.warn],
                        ['Avg Cache Rating', geevesAnalytics.summary.avgCacheRating
                          ? `${geevesAnalytics.summary.avgCacheRating} / 5` : null, T.info],
                      ].map(([label, value, color]) => (
                        <div key={label} className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color }}>
                            {typeof value === 'string' ? value : num(value)}
                          </div>
                          <div className={styles.kpiLabel}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {geevesLoading ? (
                    <div className={styles.loadingSpinner}>Loading Geeves Analytics</div>
                  ) : geevesAnalytics.questions.length === 0 ? (
                    <div className={styles.emptyState}>
                      No Unanswered Questions. Geeves Is Handling Everything Locally.
                    </div>
                  ) : (
                    <div className={styles.tableWrapper}>
                      <table className={styles.table}>
                        <thead>
                          <tr><th scope="col">Question</th><th scope="col">Page</th><th scope="col">Asked</th><th scope="col">Last Asked</th><th scope="col">Actions</th></tr>
                        </thead>
                        <tbody>
                          {geevesAnalytics.questions.map((q) => (
                            <tr key={q.id}>
                              <td style={{ maxWidth: 360, wordBreak: 'break-word' }}>
                                <div>{q.question}</div>
                                {q.grok_answer && (
                                  <details style={{ marginTop: 4 }}>
                                    <summary style={{ fontSize: 11, color: T.accent, cursor: 'pointer' }}>View Grok Answer</summary>
                                    <div style={{
                                      fontSize: 12, color: T.dim, marginTop: 6, lineHeight: 1.5,
                                      maxHeight: 140, overflowY: 'auto', background: T.inset,
                                      padding: '8px 10px', borderRadius: 6,
                                    }}>{q.grok_answer}</div>
                                  </details>
                                )}
                              </td>
                              <td style={{ fontSize: 12, color: T.dim, whiteSpace: 'nowrap' }}>
                                {q.page ? q.page.replace('/hub/', '') : '-'}
                              </td>
                              <td style={{
                                fontWeight: 700, textAlign: 'center',
                                color: q.asked_count >= 5 ? T.danger : T.warn,
                              }}>{num(q.asked_count, '0')}</td>
                              <td style={{ fontSize: 12, color: T.dim, whiteSpace: 'nowrap' }}>{when(q.last_asked)}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button className={styles.filterBtn} style={{ marginRight: 6 }}
                                  onClick={() => markGeevesQuestionResolved(q.id, true)}
                                  disabled={geevesMarkingId === q.id}>
                                  {geevesMarkingId === q.id ? 'Saving' : 'Added To KB'}
                                </button>
                                <button className={styles.filterBtn}
                                  onClick={() => markGeevesQuestionResolved(q.id, false)}
                                  disabled={geevesMarkingId === q.id}>
                                  Dismiss
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─────────────────────────── REVIEWS ───────────────────────────── */}
          {activeTab === 'reviews' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Venue Review Moderation</h2>
                  <p style={{ margin: '4px 0 0', color: T.dim, fontSize: 14 }}>
                    Every Player-Submitted Venue Review On The Platform.
                  </p>
                </div>
                <button className={styles.actionBtn} onClick={loadAdminReviews} disabled={reviewsLoading}>
                  {reviewsLoading ? 'Loading' : 'Refresh'}
                </button>
              </div>

              <div className={styles.kpiGrid}>
                {[
                  ['Total Reviews', reviewsStats.total, T.info],
                  ['Flagged', reviewsStats.flagged, T.warn],
                  ['Avg Rating', reviewsStats.avg_rating !== null && reviewsStats.avg_rating !== undefined
                    ? Number(reviewsStats.avg_rating).toFixed(1) : null, T.accent],
                  // The search is server-side now, so this is simply how many
                  // rows the current page returned, not a filtered subset of it.
                  ['Showing (Page)', reviewsData.length, T.accent],
                ].map(([label, value, color]) => (
                  <div key={label} className={styles.kpi}>
                    <div className={styles.kpiValue} style={{ color }}>
                      {typeof value === 'string' ? value : num(value)}
                    </div>
                    <div className={styles.kpiLabel}>{label}</div>
                  </div>
                ))}
              </div>
              {reviewsStats.avg_rating_sampled && (
                <div className={styles.warnBanner}>
                  The Average Rating Is Sampled, Not Exact - The Review Table Is Larger Than The Sample Cap.
                </div>
              )}

              <div className={styles.filterBar}>
                <select value={reviewsFilter} onChange={(e) => setReviewsFilter(e.target.value)}
                  className={styles.filterSelect} aria-label="Sort Reviews">
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Rated</option>
                  <option value="lowest">Lowest Rated</option>
                  <option value="flagged">Flagged First</option>
                </select>
                <select value={reviewsRatingFilter} onChange={(e) => setReviewsRatingFilter(e.target.value)}
                  className={styles.filterSelect} aria-label="Filter By Rating">
                  <option value="all">All Ratings</option>
                  {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} {r === 1 ? 'Star' : 'Stars'}</option>)}
                </select>
                <button className={`${styles.filterBtn} ${reviewsFlaggedOnly ? styles.active : ''}`}
                  onClick={() => setReviewsFlaggedOnly((f) => !f)}>
                  Flagged Only
                </button>
                <input
                  type="search" value={reviewsSearch} onChange={(e) => setReviewsSearch(e.target.value)}
                  placeholder="Search Reviewer, Venue Or Text" className={styles.searchInput}
                  style={{ flex: 1, minWidth: 200 }} aria-label="Search Reviews"
                />
              </div>

              {reviewsError ? (
                <div className={styles.errorState}>
                  <div>Reviews Unavailable: {reviewsError}</div>
                  <button className={styles.actionBtn} onClick={loadAdminReviews}>Retry</button>
                </div>
              ) : reviewsLoading ? (
                <div className={styles.loadingSpinner}>Loading Reviews</div>
              ) : reviewsData.length === 0 ? (
                <div className={styles.emptyState}>No Reviews Match The Current Filters.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {reviewsData.map((review) => (
                    <div key={review.id} className={styles.card} style={{
                      background: review.is_flagged ? T.warnSoft : undefined,
                      borderColor: review.is_flagged ? T.warn : T.line,
                    }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>
                              {review.reviewer_name || 'Anonymous'}
                            </span>
                            {review.is_flagged && (
                              <span style={{
                                background: T.warnSoft, color: T.warn, fontSize: 11,
                                padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                              }}>FLAGGED</span>
                            )}
                            {review.metadata?.verified_player && (
                              <span style={{
                                background: T.accentSoft, color: T.accent, fontSize: 11,
                                padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                              }}>Verified Player</span>
                            )}
                            <span style={{ color: T.warn, fontSize: 13, letterSpacing: 1 }}>
                              {'*'.repeat(Math.max(0, Math.min(5, review.rating || 0)))}
                              <span style={{ color: T.muted }}>
                                {'*'.repeat(Math.max(0, 5 - (review.rating || 0)))}
                              </span>
                            </span>
                            <span style={{ color: T.muted, fontSize: 12, marginLeft: 'auto' }}>{when(review.created_at)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: T.dim, marginBottom: 6 }}>
                            {review.venue_name || review.venue_id || 'Unknown Venue'}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: T.dim, lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {review.review_text}
                          </p>
                          {review.flag_reason && (
                            <div style={{
                              marginTop: 6, fontSize: 12, color: T.warn,
                              background: T.warnSoft, padding: '4px 10px', borderRadius: 6,
                            }}>Flag Reason: {review.flag_reason}</div>
                          )}
                          <div style={{ marginTop: 6, fontSize: 11, color: T.muted }}>
                            Helpful {num(review.helpful_count, '0')} - Unhelpful {num(review.unhelpful_count, '0')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button className={styles.filterBtn} disabled={reviewsProcessing}
                            onClick={() => handleFlagReview(review.id, review.is_flagged ? 'unflag' : 'flag')}>
                            {review.is_flagged ? 'Unflag' : 'Flag'}
                          </button>
                          <button
                            className={reviewsDeleteConfirm === review.id ? styles.btnDanger : styles.filterBtn}
                            disabled={reviewsProcessing}
                            onClick={() => handleDeleteReview(review.id)}
                          >
                            {reviewsDeleteConfirm === review.id ? 'Confirm Delete' : 'Delete'}
                          </button>
                          {reviewsDeleteConfirm === review.id && (
                            <button className={styles.filterBtn} onClick={() => setReviewsDeleteConfirm(null)}>Cancel</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Server-side paging, and since Phase 1 a server-side search:
                  the box sends `q` to the route, so this pager walks the whole
                  matching set rather than one page the search then re-filtered
                  in the browser. */}
              {(reviewsPage > 0 || reviewsData.length >= REVIEWS_PER_PAGE) && (
                <div className={styles.pagination}>
                  <button onClick={() => setReviewsPage((p) => Math.max(0, p - 1))}
                    disabled={reviewsPage === 0 || reviewsLoading}>Previous</button>
                  <span className={styles.pageInfo}>
                    Page {reviewsPage + 1}
                    {/* filtered_total, not total. The pager has to divide by the
                        count under the CURRENT filters -- dividing by the whole
                        table offered pages that did not exist whenever a filter
                        was on. Falls back to total for an older cached route. */}
                    {(() => {
                      const pageBasis = reviewsStats.filtered_total ?? reviewsStats.total;
                      return pageBasis !== null && pageBasis !== undefined
                        ? ` Of ${Math.max(1, Math.ceil(pageBasis / REVIEWS_PER_PAGE))}` : '';
                    })()}
                    {' '}- Showing {num(reviewsData.length)} On This Page
                  </span>
                  <button onClick={() => setReviewsPage((p) => p + 1)}
                    disabled={reviewsData.length < REVIEWS_PER_PAGE || reviewsLoading}>Next</button>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────── AUDIT LOG ─────────────────────── */}
          {activeTab === 'audit' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Admin Audit Log</h2>
                  <p style={{ margin: '4px 0 0', color: T.dim, fontSize: 14 }}>
                    Every Privileged Action Taken Through This Console. Cashout Approvals,
                    Player Kicks, Fleet Launches, Moderation Decisions And Horse Edits All
                    File Here.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* THE EXPORT WALKS EVERY PAGE. This button used to run an
                      inline downloadCsv over `auditEntries` - the 100 rows on
                      screen - with details, before_state and after_state
                      missing: the three columns that say what actually
                      changed. exportAuditLog was written for exactly this and
                      had no caller at all, so item F of the header shipped
                      non-functional. */}
                  <button
                    className={styles.actionBtn}
                    disabled={!auditEntries.length || !!auditExporting}
                    onClick={exportAuditLog}
                  >
                    {auditExporting ? 'Exporting' : 'Export CSV'}
                  </button>
                  <button className={styles.actionBtn} onClick={loadAuditLog} disabled={auditLoading}>
                    {auditLoading ? 'Loading' : 'Refresh'}
                  </button>
                </div>
              </div>

              {/* The progress state existed and was unreachable. An export that
                  walks 20,000 rows in pages of 500 has to say it is working, or
                  the operator presses the button again. */}
              {auditExporting && (
                <div className={shared.exportProgress} role="status">
                  Exporting Audit Entries: {num(auditExporting.fetched, '0')}
                  {auditExporting.total === null || auditExporting.total === undefined
                    ? ' So Far'
                    : ` Of ${num(auditExporting.total)}`}
                  . Leave This Tab Open.
                </div>
              )}

              <div className={styles.filterBar}>
                {/* A GROUP, not a prefix. The trail was namespaced in Phase 1,
                    so each group asks for the new vocabulary AND the one it
                    replaced (auditFilters.js), sent as `actionPrefixes`. Two of
                    the old options - content_author and content_settings - were
                    TARGET types rather than action prefixes and matched zero
                    rows however long the operator waited; they are legacy
                    members of their real groups now. */}
                <select
                  value={auditPrefix}
                  onChange={(e) => setAuditPrefix(e.target.value)}
                  aria-label="Filter By Action Type"
                >
                  {AUDIT_FILTER_GROUPS.map((group) => (
                    <option key={group.id || 'all'} value={group.id}>{group.label}</option>
                  ))}
                </select>
                {/* "What did this person do?" is the question an audit log
                    exists to answer, and it was the one filter the tab could
                    not express. The route already accepted adminId. */}
                <select
                  value={auditAdmin}
                  onChange={(e) => setAuditAdmin(e.target.value)}
                  aria-label="Filter By Admin"
                >
                  <option value="">All Admins</option>
                  {auditActors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.role ? ` (${a.role})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  value={auditDays}
                  onChange={(e) => setAuditDays(e.target.value)}
                  aria-label="Filter By Time Range"
                >
                  <option value="1">Last 24 Hours</option>
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                  <option value="365">Last Year</option>
                  <option value="">All Time</option>
                </select>
                {/* "WHAT HAPPENED TO THIS CLUB / THIS USER / THIS TICKET" is
                    the second question an audit log exists to answer, and the
                    tab could not express it: auditTarget, auditFrom and auditTo
                    were in state, threaded into the query and into the page
                    reset, and NO input rendered any of them. The route has
                    accepted targetId, from and to all along. */}
                {/* Target TYPE narrows the id to one table. An id filter on
                    its own matches the same uuid wherever it appears, which
                    is how a club's trail picks up a user's rows. */}
                <label className={styles.srOnly} htmlFor="audit-target-type">Target Type</label>
                <input
                  id="audit-target-type"
                  type="search"
                  className={styles.searchInput}
                  style={{ minWidth: 160 }}
                  placeholder="Target Type (Club, User)"
                  value={auditTargetTypeInput}
                  onChange={(e) => setAuditTargetTypeInput(e.target.value)}
                />
                <label className={styles.srOnly} htmlFor="audit-target">Target ID</label>
                <input
                  id="audit-target"
                  type="search"
                  className={styles.searchInput}
                  style={{ minWidth: 220 }}
                  placeholder="Target ID (Club, User, Ticket)"
                  value={auditTargetInput}
                  onChange={(e) => setAuditTargetInput(e.target.value)}
                />
                {/* An explicit window, rather than "the last N days from now".
                    From and To win over the quick range in auditQuery, so the
                    set is never filtered twice by two different rules. */}
                <label className={styles.srOnly} htmlFor="audit-from">From Date</label>
                <input
                  id="audit-from"
                  type="date"
                  className={styles.filterSelect}
                  value={auditFrom}
                  onChange={(e) => setAuditFrom(e.target.value)}
                  aria-label="From Date"
                />
                <label className={styles.srOnly} htmlFor="audit-to">To Date</label>
                <input
                  id="audit-to"
                  type="date"
                  className={styles.filterSelect}
                  value={auditTo}
                  onChange={(e) => setAuditTo(e.target.value)}
                  aria-label="To Date"
                />
                {(auditTargetInput || auditTargetTypeInput || auditFrom || auditTo || auditPrefix || auditAdmin) && (
                  <button
                    type="button"
                    className={styles.filterBtn}
                    onClick={() => {
                      setAuditTargetInput(''); setAuditTargetTypeInput('');
                      setAuditTarget(''); setAuditTargetType('');
                      setAuditFrom(''); setAuditTo('');
                      setAuditPrefix(''); setAuditAdmin('');
                    }}
                  >
                    Clear Filters
                  </button>
                )}
                {(auditFrom || auditTo) && (
                  <span style={{ color: T.muted, fontSize: 12, alignSelf: 'center' }}>
                    The Quick Range Is Ignored While From Or To Is Set.
                  </span>
                )}
                <span style={{ color: T.muted, fontSize: 13, alignSelf: 'center' }}>
                  {auditTotal === null ? '' : `${num(auditTotal)} ${auditTotal === 1 ? 'Entry' : 'Entries'}`}
                </span>
              </div>

              {auditLoading && !auditEntries.length ? (
                <div className={styles.loadingSpinner}>Loading Audit Log</div>
              ) : !auditEntries.length ? (
                <div className={styles.emptyState}>
                  {/* Stated plainly rather than as a bare "no results". Audit
                      coverage only became complete in this release, so an empty
                      window is the expected answer for older ranges, not a bug
                      the operator should go hunting for. */}
                  No Audit Entries In This Range. Full Coverage Of Every Mutating
                  Admin Route Began 2026-08-26; Earlier Actions Were Not Recorded.
                </div>
              ) : (
                <>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">When</th>
                          <th scope="col">Admin</th>
                          <th scope="col">Action</th>
                          <th scope="col">Target</th>
                          {/* THE THREE COLUMNS THAT ANSWER "WAS THAT THE SAME
                              SESSION". They were written to admin_audit_log
                              and rendered nowhere but inside an expanded row,
                              so scanning a page for one IP was impossible. */}
                          <th scope="col">IP</th>
                          <th scope="col">User Agent</th>
                          <th scope="col">Request ID</th>
                          <th scope="col">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditEntries.map((entry) => (
                          <React.Fragment key={entry.id}>
                            <tr>
                              <td style={{ whiteSpace: 'nowrap', color: T.dim, fontSize: 13 }}>
                                {when(entry.created_at)}
                              </td>
                              <td>
                                <div>{entry.admin_name || 'System / Cron'}</div>
                                {entry.admin_role && (
                                  <div style={{ color: T.muted, fontSize: 12 }}>{entry.admin_role}</div>
                                )}
                              </td>
                              <td>
                                <code style={{ color: T.accent, fontSize: 13 }}>{entry.action}</code>
                              </td>
                              <td style={{ color: T.dim, fontSize: 13 }}>
                                <div>{entry.target_type || '-'}</div>
                                {entry.target_id && (
                                  <div style={{ color: T.muted, fontSize: 12, wordBreak: 'break-all' }}>
                                    {entry.target_id}
                                  </div>
                                )}
                              </td>
                              <td style={{ color: T.dim, fontSize: 13, whiteSpace: 'nowrap' }}>
                                {entry.ip_address || '-'}
                              </td>
                              {/* Truncated in the cell and complete in the
                                  title, because a full user agent is 140
                                  characters and would own the table. */}
                              <td
                                style={{ color: T.muted, fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={entry.user_agent || ''}
                              >
                                {entry.user_agent || '-'}
                              </td>
                              <td style={{ color: T.muted, fontSize: 12, wordBreak: 'break-all' }}>
                                {entry.request_id || '-'}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button
                                    className={styles.actionBtn}
                                    onClick={() => setAuditExpanded(auditExpanded === entry.id ? null : entry.id)}
                                    aria-expanded={auditExpanded === entry.id}
                                  >
                                    {auditExpanded === entry.id ? 'Hide' : 'View'}
                                  </button>
                                  {/* "Everything that has ever happened to
                                      THIS record", which is the question the
                                      log existed to answer and could not. */}
                                  <button
                                    className={styles.actionBtn}
                                    onClick={() => openAuditTrail(entry)}
                                    disabled={!entry.target_id || !entry.target_type}
                                    title={entry.target_id && entry.target_type
                                      ? 'Show The Full History Of This Record'
                                      : 'This Entry Records No Target Type And Id, So It Names No Record To Trail'}
                                  >
                                    Trail
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {auditExpanded === entry.id && (
                              <tr>
                                <td colSpan={8} style={{ background: T.inset, padding: 16 }}>
                                  <div style={{ display: 'grid', gap: 12 }}>
                                    <div style={{ color: T.muted, fontSize: 12 }}>
                                      IP {entry.ip_address || 'Not Recorded'}
                                      {entry.request_id ? ` - Request ID ${entry.request_id}` : ''}
                                    </div>
                                    {[['Details', entry.details], ['Before', entry.before_state], ['After', entry.after_state]]
                                      .filter(([, v]) => v && Object.keys(v).length)
                                      .map(([label, v]) => (
                                        <div key={label}>
                                          <div style={{ color: T.dim, fontSize: 12, marginBottom: 4 }}>{label}</div>
                                          <pre style={{
                                            margin: 0, padding: 12, background: T.page, borderRadius: 6,
                                            color: T.text, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                          }}>{JSON.stringify(v, null, 2)}</pre>
                                        </div>
                                      ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* The shared Pager, which knows that total may be null and
                      says "Showing X-Y" without inventing a denominator. */}
                  <Pager
                    offset={auditPage * AUDIT_PAGE_SIZE}
                    limit={AUDIT_PAGE_SIZE}
                    count={auditEntries.length}
                    total={auditTotal}
                    hasMore={auditHasMore}
                    loading={auditLoading}
                    noun="Entries"
                    onPrevious={() => setAuditPage((p) => Math.max(0, p - 1))}
                    onNext={() => setAuditPage((p) => p + 1)}
                  />
                </>
              )}

              {/* ── ONE RECORD'S FULL HISTORY ─────────────────────────────── */}
              {/* The shared Modal, so it has a dialog role, an accessible
                  name, a focus trap and Escape - the same shell the Mint
                  confirmation uses. Paged, because a club that has been
                  edited for a year has more history than one dialog. */}
              {auditTrailFor && (
                <Modal
                  title={`Trail: ${auditTrailFor.targetType || 'Record'} ${auditTrailFor.targetId || ''}`.trim()}
                  onClose={() => setAuditTrailFor(null)}
                  wide
                >
                  {auditTrailError ? (
                    <div className={shared.errorNote} role="alert">{auditTrailError}</div>
                  ) : auditTrailLoading && auditTrailRows.length === 0 ? (
                    <div className={shared.stateNote}>Loading The Trail</div>
                  ) : auditTrailRows.length === 0 ? (
                    <div className={shared.stateNote}>
                      Nothing Else Has Been Recorded Against This Record.
                    </div>
                  ) : (
                    <div>
                      {auditTrailRows.map((row, i) => (
                        <div key={row.id || `${auditTrailOffset}-${i}`} className={shared.trailEntry}>
                          <div className={shared.trailHead}>
                            <strong>{row.action || 'unknown.action'}</strong>
                            <span style={{ color: T.dim }}>{when(row.created_at, true)}</span>
                            {/* fn_ca_operator_audit_trail selects
                                admin_user_id and actor_role; the enriched
                                admin_name / admin_role pair only exists on
                                the stable-admin audit_log route. Reading only
                                that pair attributed every entry in this
                                dialog to "System / Cron" with no role, on the
                                one surface whose entire purpose is who did
                                what to this record. trailActor reads both
                                shapes and shows the id when there is no name,
                                because a uuid is not friendly but it is the
                                answer. */}
                            <span style={{ color: T.muted }}>
                              {trailActor(row).label}
                              {trailActor(row).role ? ` (${trailActor(row).role})` : ''}
                            </span>
                          </div>
                          <div className={shared.mono}>
                            IP {row.ip_address || 'Not Recorded'}
                            {row.request_id ? ` - Request ID ${row.request_id}` : ''}
                          </div>
                          {[['Details', row.details], ['Before', row.before_state], ['After', row.after_state]]
                            .filter(([, v]) => v && Object.keys(v).length)
                            .map(([label, v]) => (
                              <div key={label} style={{ marginTop: 8 }}>
                                <div style={{ color: T.dim, fontSize: 12, marginBottom: 4 }}>{label}</div>
                                <pre className={shared.trailBlock}>{JSON.stringify(v, null, 2)}</pre>
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <Pager
                    offset={auditTrailOffset}
                    limit={AUDIT_TRAIL_PAGE_SIZE}
                    count={auditTrailRows.length}
                    total={auditTrailTotal}
                    hasMore={auditTrailHasMore}
                    loading={auditTrailLoading}
                    noun="Entries"
                    onPrevious={() => goAuditTrailPage(auditTrailOffset - AUDIT_TRAIL_PAGE_SIZE)}
                    onNext={() => goAuditTrailPage(auditTrailOffset + AUDIT_TRAIL_PAGE_SIZE)}
                  />
                </Modal>
              )}
            </div>
          )}

          {/* ─────────────────────────── SCRAPER HEALTH ────────────────────── */}
          {activeTab === 'scrapers' && (
            <div className={styles.statsView}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Scraper Health</h2>
                  <p style={{ margin: '4px 0 0', color: T.dim, fontSize: 14 }}>
                    {/* The old copy hardcoded "all 9 daemons". */}
                    Status Of The Data Collection Daemons. Auto-Refreshes Every 60 Seconds.
                    {scraperHealthLastFetch && (
                      <span style={{ marginLeft: 8, color: T.muted }}>
                        Last Fetched {scraperHealthLastFetch.toLocaleTimeString()}
                      </span>
                    )}
                  </p>
                </div>
                <button className={styles.actionBtn} onClick={loadScraperHealth} disabled={scraperHealthLoading}>
                  {scraperHealthLoading ? 'Loading' : 'Refresh'}
                </button>
              </div>

              {scraperHealthError ? (
                <div className={styles.errorState}>
                  <div>Scraper Health Unavailable: {scraperHealthError}</div>
                  <button className={styles.actionBtn} onClick={loadScraperHealth}>Retry</button>
                </div>
              ) : scraperHealthLoading && !scraperHealth ? (
                <div className={styles.loadingSpinner}>Loading Scraper Status</div>
              ) : !scraperHealth ? (
                <div className={styles.emptyState}>No Scraper Data Available.</div>
              ) : (
                <>
                  {scraperHealth.notice && <div className={styles.warnBanner}>{scraperHealth.notice}</div>}

                  {/* Optional chaining throughout: `scraperHealth.summary.deadCount`
                      with no guard used to crash the entire page, not just this tab. */}
                  {scraperHealth.summary && (
                    <div className={styles.kpiGrid}>
                      {[
                        ['Healthy', scraperHealth.summary.healthyCount, T.accent],
                        ['Warning', scraperHealth.summary.warningCount, T.warn],
                        ['Dead', scraperHealth.summary.deadCount, T.danger],
                        ['Not Instrumented', scraperHealth.summary.notInstrumentedCount, T.muted],
                        ['Disabled', scraperHealth.summary.disabledCount, T.muted],
                        ['Supabase Data', scraperHealth.summary.dataFresh ? 'Fresh' : 'Stale',
                          scraperHealth.summary.dataFresh ? T.accent : T.danger],
                      ].map(([label, value, color]) => (
                        <div key={label} className={styles.kpi}>
                          <div className={styles.kpiValue} style={{ color }}>
                            {typeof value === 'string' ? value : num(value)}
                          </div>
                          <div className={styles.kpiLabel}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(scraperHealth.daemons || []).length === 0 ? (
                    <div className={styles.emptyState}>No Daemons Registered.</div>
                  ) : (
                    <div className={styles.cardGrid}>
                      {scraperHealth.daemons.map((daemon) => {
                        // `not_instrumented` and `disabled` are distinct from
                        // `unknown`: seven daemons publish no heartbeat at all,
                        // and Bravo is intentionally off per the live cash
                        // games policy. Rendering those as faults made the tab
                        // permanently alarming and therefore ignorable.
                        const color = {
                          healthy: T.accent, warning: T.warn, dead: T.danger,
                          unknown: T.muted, not_instrumented: T.muted, disabled: T.muted,
                        }[daemon.status] || T.muted;
                        const statusLabel = {
                          healthy: 'Healthy', warning: 'Warning', dead: 'Dead',
                          unknown: 'Unknown', not_instrumented: 'Not Instrumented', disabled: 'Disabled',
                        }[daemon.status] || daemon.status || 'Unknown';
                        const hb = daemon.heartbeat;
                        return (
                          <div key={daemon.id} className={styles.card} style={{ borderLeft: `4px solid ${color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                              <div>
                                <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{daemon.label}</div>
                                <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
                                  {daemon.type ? `${daemon.type} - ` : ''}Interval {daemon.interval || 'Unknown'}
                                </div>
                                {daemon.statusReason && (
                                  <div style={{ fontSize: 12, color: T.muted, marginTop: 4, maxWidth: 420 }}>
                                    {daemon.statusReason}
                                  </div>
                                )}
                              </div>
                              <span style={{
                                background: `${color}22`, color, border: `1px solid ${color}`,
                                borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700,
                                whiteSpace: 'nowrap', textTransform: 'capitalize',
                              }}>{statusLabel}</span>
                            </div>

                            {hb ? (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 13 }}>
                                {[
                                  ['Status', hb.daemonStatus],
                                  ['PID', hb.pid],
                                  ['Cycle', hb.cycle !== undefined ? `#${hb.cycle}` : undefined],
                                  ['Records Saved', hb.recordsSaved !== undefined ? num(hb.recordsSaved) : undefined],
                                  ['Venues', hb.venuesWithData],
                                  ['Progress', hb.progress],
                                  ['Errors', hb.errors],
                                  ['Last Duration', hb.durationSeconds !== undefined ? `${Math.round(hb.durationSeconds)}s` : undefined],
                                  ['Heartbeat Age', hb.staleMinutes !== undefined ? `${hb.staleMinutes}m Ago` : undefined],
                                ].filter(([, v]) => v !== undefined && v !== null).map(([label, value]) => (
                                  <React.Fragment key={label}>
                                    <div style={{ color: T.dim }}>{label}</div>
                                    <div style={{
                                      color: (label === 'Errors' && Number(value) > 0)
                                        || (label === 'Heartbeat Age' && hb.staleMinutes > 25) ? T.danger : T.text,
                                      fontWeight: 600, textAlign: 'right',
                                    }}>{value}</div>
                                  </React.Fragment>
                                ))}
                              </div>
                            ) : (
                              <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic' }}>
                                No Heartbeat Published. This Daemon May Be Interval-Based Or Not Running.
                              </div>
                            )}

                            {daemon.database?.staleMinutes !== null && daemon.database?.staleMinutes !== undefined && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, fontSize: 12 }}>
                                <span style={{ color: T.dim }}>Database Data Age: </span>
                                <span style={{
                                  color: daemon.database.staleMinutes > 25 ? T.danger : T.accent, fontWeight: 600,
                                }}>{daemon.database.staleMinutes}m</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          </ErrorBoundary>
        </main>


        {/* ── EDIT PROMO CODE ──
            The PATCH route has always accepted these six fields; the panel
            offered only the active toggle, so fixing a typo in a code meant
            issuing a replacement. Note the casing: POST takes camelCase
            (type/value/maxUses/expiresAt), PATCH takes the snake_case column
            names. This form speaks PATCH. */}
        {/* INSIDE A BOUNDARY. Both dialogs used to render as siblings of
            <main>, outside the ErrorBoundary entirely, so a throw in either one
            still white-screened all sixteen tabs - the exact failure item A
            claims to have closed. Each gets its own boundary rather than being
            moved inside the panel's: a dialog is a separate failure domain, and
            resetting on `activeTab` would be the wrong reset key for one. */}
        <ErrorBoundary resetKey={promoEditing?.id || 'promo-dialog'} label="The Promo Code Dialog">
        {promoEditing && promoEditForm && (
          <Modal
            title={`Edit ${promoEditing.code}`}
            onClose={() => setPromoEditing(null)}
            sticky={promoSaving}
            blockEscape={promoSaving}
            wide
          >
            <form onSubmit={savePromoEdit}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="pe-code">Code</label>
                  <input
                    id="pe-code" type="text" maxLength={20} required
                    value={promoEditForm.code}
                    onChange={(e) => setPromoEditForm({
                      ...promoEditForm,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    })}
                    style={{ textTransform: 'uppercase', letterSpacing: 2 }}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="pe-type">Type</label>
                  <select id="pe-type" value={promoEditForm.reward_type}
                    onChange={(e) => setPromoEditForm({ ...promoEditForm, reward_type: e.target.value })}>
                    {(promoRewardTypes.length ? promoRewardTypes : [promoEditForm.reward_type]).map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="pe-desc">Description</label>
                <input id="pe-desc" type="text" value={promoEditForm.description}
                  onChange={(e) => setPromoEditForm({ ...promoEditForm, description: e.target.value })} />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="pe-value">
                    Value ({['vip_days', 'free_trial'].includes(promoEditForm.reward_type) ? 'Days' : 'Diamonds'})
                  </label>
                  <input id="pe-value" type="number" min="0" max="10000" required
                    value={promoEditForm.reward_value}
                    onChange={(e) => setPromoEditForm({ ...promoEditForm, reward_value: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="pe-max">Max Uses (Blank Clears The Cap)</label>
                  <input id="pe-max" type="number" min="1" placeholder="Unlimited"
                    value={promoEditForm.max_uses}
                    onChange={(e) => setPromoEditForm({ ...promoEditForm, max_uses: e.target.value })} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="pe-exp">Expires At (Blank Clears It)</label>
                <input id="pe-exp" type="datetime-local" value={promoEditForm.expires_at}
                  onChange={(e) => setPromoEditForm({ ...promoEditForm, expires_at: e.target.value })} />
                {/* Unlike POST, PATCH accepts a past date, so a code can be
                    retired by expiring it rather than deactivating it. */}
                <small style={{ color: T.muted, fontSize: 11 }}>
                  A Past Date Retires The Code Immediately.
                </small>
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setPromoEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnSubmit} disabled={promoSaving}>
                  {promoSaving ? 'Saving' : 'Save Changes'}
                </button>
              </div>
            </form>
          </Modal>
        )}
        </ErrorBoundary>

        {/* ─────────────────────────── CREATE / EDIT HORSE ──────────────────── */}
        <ErrorBoundary resetKey={editingPersona?.id || 'horse-dialog'} label="The Horse Dialog">
        {showCreateModal && (
          <Modal
            title={editingPersona ? `Edit ${editingPersona.name}` : 'New Horse'}
            onClose={() => setShowCreateModal(false)}
            sticky={savingPersona}
            blockEscape={savingPersona}
            wide
          >
            <form onSubmit={handleSavePersona}>
              <div className={styles.formGroup}>
                <label htmlFor="p-name">Name</label>
                <input id="p-name" type="text" required placeholder="Johnny Sticks"
                  value={personaForm.name}
                  onChange={(e) => setPersonaForm({ ...personaForm, name: e.target.value })} />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="p-gender">Gender</label>
                  <select id="p-gender" value={personaForm.gender}
                    onChange={(e) => setPersonaForm({ ...personaForm, gender: e.target.value })}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="p-location">Location</label>
                  <input id="p-location" type="text" required placeholder="Austin, TX"
                    value={personaForm.location}
                    onChange={(e) => setPersonaForm({ ...personaForm, location: e.target.value })} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="p-bio">Bio</label>
                <textarea id="p-bio" rows="3" required placeholder="Brief Backstory"
                  value={personaForm.bio}
                  onChange={(e) => setPersonaForm({ ...personaForm, bio: e.target.value })} />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="p-specialty">Specialty</label>
                  <select id="p-specialty" value={personaForm.specialty}
                    onChange={(e) => setPersonaForm({ ...personaForm, specialty: e.target.value })}>
                    {SPECIALTIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="p-stakes">Stakes</label>
                  <input id="p-stakes" type="text" required placeholder="2/5 NLH"
                    value={personaForm.stakes}
                    onChange={(e) => setPersonaForm({ ...personaForm, stakes: e.target.value })} />
                </div>
              </div>
              {/* The voice field is part of the record and is shown on every
                  card, but the create form never asked for it. */}
              <div className={styles.formGroup}>
                <label htmlFor="p-voice">Voice</label>
                <select id="p-voice" value={personaForm.voice}
                  onChange={(e) => setPersonaForm({ ...personaForm, voice: e.target.value })}>
                  {VOICES.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnSubmit} disabled={savingPersona}>
                  {savingPersona ? 'Saving' : editingPersona ? 'Save Changes' : 'Stable Horse'}
                </button>
              </div>
            </form>
          </Modal>
        )}
        </ErrorBoundary>
      </div>
    </>
  );
}
