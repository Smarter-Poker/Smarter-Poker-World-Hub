/**
 * Phase 4 - the client half. The URL and body builders, and the panel's
 * source contracts.
 *
 * The builders are IMPORTED AND CALLED, because a wrong parameter name is
 * exactly the defect that fails silently in production: the route reads the
 * name it expects, finds nothing, applies no filter, and the panel shows a
 * list that looks fine and is wrong.
 *
 * THE ONE THING THIS FILE IS MOST FOR: `includeHorses`. CLAUDE.md 10.5 says
 * any include-horses parameter defaults to true, and the only way to be sure
 * of that through a URL builder is to prove that no ordinary value - absent,
 * undefined, null, an unticked-but-uninitialised checkbox - can serialise as
 * false.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
  MIN_NOTE_LENGTH,
  PLAYER_ADMIN,
  PLAYER_SECTIONS,
  enforcedOf,
  liftBody,
  listMeta,
  newRestrictionOpId,
  noteAddBody,
  noteDeleteBody,
  noteIsValid,
  observationsUrl,
  playerUrl,
  reportReviewBody,
  reportsUrl,
  restrictBody,
  restrictionsUrl,
  rgSetBody,
  searchQuery,
  searchUrl,
  tagBody,
  ticketAssignBody,
  ticketsUrl,
} from '../src/components/horses/playerAdmin.js';
import { TABS, findTab, visibleTabs } from '../src/components/horses/tabRegistry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const panel = await readFile(
  path.join(HERE, '..', 'src/components/horses/PlayersPanel.jsx'),
  'utf8'
);

// ── includeHorses, the parameter with a law attached ────────────────────────

test('includeHorses is never serialised unless it is explicitly false', () => {
  // Every shape an unset value can arrive in.
  for (const value of [undefined, null, true, 1, 'true', 'yes', 0, '']) {
    const params = searchQuery({ q: 'x', includeHorses: value });
    if (value === false) continue;
    assert.equal(
      params.includeHorses,
      undefined,
      `includeHorses ${JSON.stringify(value)} must not reach the URL. An absent parameter `
        + 'means the route applies its default of TRUE.'
    );
  }
  assert.equal(searchQuery({ includeHorses: false }).includeHorses, 'false');
});

test('no list URL narrows to humans by default', () => {
  for (const url of [
    searchUrl({}),
    searchUrl({ q: 'dan' }),
    restrictionsUrl({}),
    restrictionsUrl({ status: 'active' }),
    observationsUrl({}),
    ticketsUrl({}),
    reportsUrl({}),
  ]) {
    assert.ok(
      !url.includes('includeHorses'),
      `${url} carries includeHorses without being asked to. Horses are players; a report `
        + 'that leaves the fleet out by default is the defect that cost 39 events their '
        + 'entire rake attribution.'
    );
  }
});

test('only an explicit untick narrows the list', () => {
  assert.match(searchUrl({ includeHorses: false }), /includeHorses=false/);
  assert.match(restrictionsUrl({ includeHorses: false }), /includeHorses=false/);
});

// ── the rest of the builders ────────────────────────────────────────────────

test('every URL names a real section', () => {
  const urls = [
    searchUrl({}), playerUrl('abc'), restrictionsUrl({}),
    observationsUrl({}), ticketsUrl({}), reportsUrl({}),
  ];
  for (const url of urls) {
    assert.ok(url.startsWith(PLAYER_ADMIN), `${url} does not point at the route`);
    const section = new URL(url, 'https://x').searchParams.get('section');
    assert.ok(
      PLAYER_SECTIONS.includes(section),
      `${url} names section ${section}, which the route does not serve`
    );
  }
});

test('an empty filter is dropped, never sent as an empty string', () => {
  // A route reading `?status=` as a filter for the empty string would match
  // nothing, and the panel would show an empty list that looks like a quiet
  // queue.
  const url = restrictionsUrl({ scope: '', status: '', limit: 50, offset: 0 });
  assert.ok(!url.includes('scope='), 'an empty scope must be dropped');
  assert.ok(!url.includes('status='), 'an empty status must be dropped');
  assert.ok(!url.includes('offset='), 'a zero offset is the default and is dropped');
});

test('paging parameters are section-scoped, so two lists can page apart', () => {
  assert.match(searchUrl({ limit: 25, offset: 50 }), /searchLimit=25/);
  assert.match(searchUrl({ limit: 25, offset: 50 }), /searchOffset=50/);
  assert.match(restrictionsUrl({ limit: 10, offset: 20 }), /restrictionsLimit=10/);
  assert.match(ticketsUrl({ limit: 10, offset: 20 }), /ticketsOffset=20/);
});

test('an empty expiry becomes null, not an empty string', () => {
  // The route gates on `expiresAt == null` to decide an indefinite
  // restriction needs a second operator. An empty string is not null and is
  // not a date either, so sending one would slip an indefinite restriction
  // past the gate AND fail the date parse.
  const body = restrictBody({
    userId: 'u', scope: 'cash', reasonCode: 'other', note: 'x', expiresAt: '',
  });
  assert.equal(body.expiresAt, null);
  assert.equal(
    restrictBody({ userId: 'u', scope: 'cash', reasonCode: 'x', expiresAt: undefined }).expiresAt,
    null
  );
});

test('a restriction always carries an idempotency key', () => {
  const body = restrictBody({ userId: 'u', scope: 'cash', reasonCode: 'terms_violation' });
  assert.ok(body.opId, 'restrictBody must mint an opId when none is given');
  assert.notEqual(
    newRestrictionOpId(),
    newRestrictionOpId(),
    'two keys in a row must differ, or one approval covers two different requests'
  );
  // A supplied key is kept: the key the approval was raised under is the key
  // the eventual apply carries.
  assert.equal(
    restrictBody({ userId: 'u', scope: 'cash', reasonCode: 'x', opId: 'keep-me' }).opId,
    'keep-me'
  );
});

test('every body names its action', () => {
  assert.equal(restrictBody({ userId: 'u', scope: 'cash', reasonCode: 'x' }).action, 'restrict');
  assert.equal(liftBody({ restrictionId: 'r' }).action, 'lift');
  assert.equal(noteAddBody({ userId: 'u', body: 'hi' }).action, 'note_add');
  assert.equal(noteDeleteBody({ noteId: 'n' }).action, 'note_delete');
  assert.equal(tagBody({ userId: 'u', tag: 'a-b' }).action, 'tag_add');
  assert.equal(tagBody({ userId: 'u', tag: 'a-b', remove: true }).action, 'tag_remove');
  assert.equal(rgSetBody({ userId: 'u', patch: {} }).action, 'rg_set');
  assert.equal(ticketAssignBody({ ticketId: 't' }).action, 'ticket_assign');
  assert.equal(reportReviewBody({ reportId: 'r', status: 'reviewed' }).action, 'report_review');
});

test('a tag is lower-cased and trimmed before it is sent', () => {
  assert.equal(tagBody({ userId: 'u', tag: '  Watch-List ' }).tag, 'watch-list');
});

test('a note for reason other has to say something', () => {
  assert.equal(noteIsValid('', true), false);
  assert.equal(noteIsValid('   ', true), false);
  assert.equal(noteIsValid('ab', true), false, `under ${MIN_NOTE_LENGTH} characters is not a reason`);
  assert.equal(noteIsValid('because', true), true);
  // Not required for the other reason codes.
  assert.equal(noteIsValid('', false), true);
});

test('enforcedOf is a tristate and never collapses unknown to off', () => {
  assert.equal(enforcedOf({ enforced: true }), true);
  assert.equal(enforcedOf({ enforced: false }), false);
  assert.equal(enforcedOf({}), null);
  assert.equal(enforcedOf(null), null);
  assert.equal(enforcedOf({ enforced: 'yes' }), null, 'a non-boolean is unknown, not true');
});

test('listMeta keeps a null total null', () => {
  // An RPC-backed list may genuinely have no count. Turning that into 0 makes
  // a pager claim there is one page when nobody knows.
  assert.equal(listMeta({ rows: [1, 2] }).total, null);
  assert.equal(listMeta({ rows: [], total: 0 }).total, 0);
  assert.deepEqual(listMeta(null).rows, []);
});

// ── the panel, as a source contract ─────────────────────────────────────────

test('the tab is registered, code split, and gated on players.read', () => {
  const tab = findTab('players');
  assert.ok(tab, 'the players tab is not in the registry');
  assert.equal(tab.permission, 'players.read');
  assert.equal(typeof tab.load, 'function', 'the panel must be code split like fleet and staff');
  assert.ok(
    visibleTabs(TABS).some((t) => t.id === 'players'),
    'the players tab must actually be shipped, not registered and hidden'
  );
});

test('the enforcement banner is rendered from the live value, three times', () => {
  assert.match(
    panel,
    /function EnforcementBanner\(\{ enforced \}\)/,
    'one banner component, so the three places it appears cannot drift apart'
  );
  const uses = panel.match(/<EnforcementBanner enforced=\{enforced\} \/>/g) || [];
  assert.ok(
    uses.length >= 3,
    'the banner must appear on the restriction list, the observation log and INSIDE the '
      + 'restrict dialog. The sentence an operator reads in the half-second before they '
      + 'press the button is the only one that counts.'
  );
  assert.ok(
    !/Enforcement Is (On|Off)['"]/.test(panel),
    'the panel must not hardcode the enforcement sentence; it comes from enforcementNotice'
  );
});

test('the Include Horses control starts ON', () => {
  assert.match(
    panel,
    /useState\(true\);\s*\n\s*const \[onlyRestricted/,
    'includeHorses must be initialised true'
  );
  assert.match(
    panel,
    /const \[includeHorses, setIncludeHorses\] = useState\(true\)/,
    'the Include Horses checkbox starts ticked'
  );
});

test('unticking Include Horses says what it does and does not', () => {
  assert.match(
    panel,
    /Horses Are Hidden By Your Filter/,
    'the panel must say the filter is narrowing the view'
  );
  assert.match(
    panel,
    /They Are Players And Are Counted Everywhere\s*\n?\s*Else/,
    'and must say the fleet is not excluded from anything else'
  );
});

test('a scope with no guard says so before it is chosen', () => {
  assert.match(
    panel,
    /SCOPE_META\[restrictDraft\.scope\]\?\.enforced === false/,
    'the dialog must check whether the chosen scope is actually watched'
  );
  assert.match(
    panel,
    /No Guard Watches This Scope Yet/,
    'and must say plainly that transfers and social record a decision and stop nothing'
  );
});

test('each list only loads while its section is open', () => {
  for (const section of ['search', 'restrictions', 'observations', 'tickets', 'reports']) {
    assert.match(
      panel,
      new RegExp(`auto: section === '${section}'`),
      `the ${section} list must be gated on its section being open. An earlier draft passed `
        + 'auto: false everywhere and called setFilters by hand, which set the filters and '
        + 'never fetched.'
    );
  }
});

test('an empty panel says WHY it is empty', () => {
  assert.match(panel, /function EmptyBecause\(\{ title, reason \}\)/);
  // The four surfaces with no data in production.
  assert.match(panel, /No KYC Event Has Ever Been Recorded/);
  assert.match(panel, /This Player Has Set No Limits/);
  assert.match(panel, /No Player Has Ever Reported Another/);
  assert.match(panel, /This Player Has Never Been Restricted/);
  assert.ok(
    !/empty="No Data"/.test(panel),
    'a blank list is a bug report waiting to be filed; every empty state must say what '
      + 'its emptiness means'
  );
});

test('the observation empty state distinguishes quiet from unknown', () => {
  assert.match(
    panel,
    /obsMeta\?\.activeRestrictions === 0/,
    'nobody restricted is a different emptiness from nobody having tried'
  );
  assert.match(
    panel,
    /obsMeta\?\.activeRestrictions == null/,
    'and an unreadable count is a third one'
  );
  assert.match(panel, /Means Nothing Either Way/);
});

test('the sanction gate is explained before the button, not after', () => {
  assert.match(panel, /gate\.required && \(/, 'the dialog must show the gate when it applies');
  assert.match(
    panel,
    /GATE_TEXT\[gate\.reason\]/,
    'and must use the shared sentence rather than its own wording'
  );
  assert.match(
    panel,
    /The Approvals Queue Does\s*\n?\s*Not Carry Out A Sanction On Its Own/,
    'and must say the queue will not finish it, because sanction is deliberately not '
      + 'executable'
  );
  assert.match(
    panel,
    /gate\.required \? 'Raise For Approval' : 'Apply Restriction'/,
    'the button label must say which of the two is about to happen'
  );
});

test('the destructive controls are gated on moderation.write', () => {
  assert.match(panel, /const canModerate = hasPermission\(permissions, 'moderation\.write'\)/);
  assert.match(
    panel,
    /disabled=\{!restrictReady \|\| busy \|\| !canModerate\}/,
    'the apply button must be disabled without moderation.write. The server refuses it '
      + 'anyway; a button that looks live and answers 403 is a worse experience than one '
      + 'that is plainly not for you.'
  );
});

test('the panel says whose notes these are', () => {
  assert.match(
    panel,
    /They Are Not The Player's Own Notes About Opponents/,
    'public.player_notes is a player-facing feature and the two must never be confused'
  );
});

test('the panel reads no table directly', () => {
  assert.ok(
    !/supabase|from\('/.test(panel),
    'every read goes through /api/horses/player-admin. A panel that queries Supabase '
      + 'directly is Phase 1 defect F1 coming back through the browser.'
  );
  assert.match(panel, /PLAYER_ADMIN/, 'and it uses the shared route constant');
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CORRECTIONS. Each pins a defect adversarial review found in the first
// version of this panel, and every one of them shipped.
// ═══════════════════════════════════════════════════════════════════════════

test('a datetime-local expiry is sent as an INSTANT, not a wall clock', async () => {
  const { toInstant } = await import('../src/components/horses/playerAdmin.js');
  // <input type="datetime-local"> yields no offset, and Date.parse treats an
  // offsetless date-time as local to whoever parses it - which on Vercel is
  // UTC. So an operator in Chicago setting 14:30 got a restriction that
  // lifted at 09:30 their time, and one setting a time an hour ahead got
  // "That Expiry Has Already Passed" for a moment their own clock said was
  // in the future.
  const local = '2027-03-05T14:30';
  const sent = restrictBody({
    userId: 'u', scope: 'cash', reasonCode: 'terms_violation', expiresAt: local,
  }).expiresAt;
  assert.equal(sent, new Date(local).toISOString(), 'the browser parses local, so convert here');
  assert.ok(sent.endsWith('Z'), 'and what is sent must name its zone');

  assert.equal(toInstant(''), null, 'empty stays null, which is what indefinite means');
  assert.equal(toInstant('not a date'), null, 'junk becomes null rather than junk');
});

test('the section nav is a real tablist with a visible active state', () => {
  assert.match(panel, /role="tablist"/, 'the nav must be a tablist');
  assert.match(panel, /aria-selected=\{section === id\}/, 'and mark the open tab');
  assert.match(
    panel,
    /className=\{`\$\{styles\.btn\} \$\{styles\.sectionNavItem\}`\}/,
    'and use the two classes that actually style it. The first draft set aria-current '
      + 'and composed .sectionNavItem with .toneAccent, and BOTH were inert: the only '
      + "rule for .sectionNavItem is scoped [aria-selected='true'], and .toneAccent is a "
      + "descendant selector for a KpiTile's value. Six default grey buttons, no "
      + 'indication of which section was open.'
  );
  assert.ok(!/aria-current=\{section === id/.test(panel), 'aria-current is the wrong token');
});

test('a raised sanction has a surface and a way to be applied', () => {
  assert.match(
    panel,
    /const \[pendingSanction, setPendingSanction\] = useState\(null\)/,
    'the 202 used to be thrown away entirely: approvalId discarded, no pending surface, '
      + 'and a fresh opId minted on the next dialog open - so coming back to apply an '
      + 'approved sanction raised a SECOND one and orphaned the approved row'
  );
  assert.match(
    panel,
    /const applyPendingSanction = useCallback/,
    'and there must be a way to apply it'
  );
  assert.match(
    panel,
    /draft: \{ \.\.\.restrictDraft, opId: data\.opId \|\| restrictDraft\.opId \}/,
    'under THE SAME key, which is what makes an approved request execute exactly once'
  );
  assert.match(
    panel,
    /The Approvals Queue Records The Decision And Does Not Carry It Out/,
    'and it must say why the queue will not finish it'
  );
});

test('the enforcement banner is loudest when enforcement is ON', () => {
  // An operator about to lock somebody out should be told they are about to
  // lock somebody out. The first draft rendered ON in amber and UNKNOWN in
  // red, and announced only ON to assistive tech.
  assert.match(
    panel,
    /notice\.tone === 'live'\s*\n?\s*\? styles\.errorNote/,
    'the live state gets the danger tone'
  );
  assert.match(
    panel,
    /role=\{notice\.tone === 'observing' \? undefined : 'alert'\}/,
    'and both the live and the unknown states are announced'
  );
});

test('a filter change returns to page one', () => {
  // setFilters is the bare state setter; only setFilter resets the offset.
  // Changing a filter on page three of a result set that now has one page
  // shows an empty table and reads as "no match" - on a moderation search,
  // a false negative.
  for (const call of [
    "restrictionList.setFilter('status'",
    "restrictionList.setFilter('scope'",
    "observationList.setFilter('hours'",
    "ticketList.setFilter('status'",
    "reportList.setFilter('status'",
  ]) {
    assert.ok(panel.includes(call), `${call} must use setFilter, not setFilters`);
  }
});

test('pressing Search twice re-reads instead of doing nothing', () => {
  assert.match(
    panel,
    /if \(same\) searchList\.refresh\(\);/,
    'usePagedList keys its effect on the filter object, so an identical search did '
      + 'nothing at all - and there is no other way to re-read a result'
  );
});

test('Assign To Me cannot silently unassign', () => {
  assert.match(
    panel,
    /disabled=\{busy \|\| !operatorId\}/,
    'operatorId is null unless the payload actually names one, and ticketAssignBody '
      + 'turns a null into assigned_to = NULL - so a button labelled "Assign To Me" '
      + 'cleared the assignee and reported success'
  );
});

test('the restrict dialog buttons carry the class that sizes and disables them', () => {
  assert.match(
    panel,
    /\$\{styles\.confirmBtn\} \$\{styles\.confirmDanger\}/,
    '.confirmDanger sets colours only. min-height 44px, the padding and '
      + ':disabled { opacity .5 } all live on .confirmBtn, so without it the '
      + 'destructive button looked identical enabled and disabled'
  );
  assert.match(panel, /\$\{styles\.confirmBtn\} \$\{styles\.confirmCancel\}/);
});

test('the responsible-gaming editor shows all eight fields and seeds from the row', () => {
  assert.ok(
    !/RG_FIELDS\.filter\(\(f\) => f\.kind !== 'time'\)/.test(panel),
    'the two exclusion timestamps were hidden, and they are section 0 rule 7\'s OWN '
      + 'example: "shortening an exclusion, ending a cooling-off early". The rule says '
      + 'the console explains the refusal rather than hiding the control.'
  );
  assert.match(panel, /function seedRgDraft\(rg\)/, 'the draft must be seeded from the row');
  assert.match(
    panel,
    /onClick=\{\(\) => setRgDraft\(rgDraft \? null : seedRgDraft\(rg\)\)\}/,
    'not from {}, which rendered blank boxes over a player who has limits set'
  );
  assert.match(
    panel,
    /function rgPatchOf\(rg, draft\)/,
    'and the panel must send the DIFFERENCE, because the route now refuses a patch that '
      + "changes nothing - an unchanged patch used to push the PLAYER'S own protection "
      + 'hold forward another twenty four hours'
  );
});

test('a cleared limit is an explicit null, not a dropped key', () => {
  assert.ok(
    !/\? undefined : Number\(e\.target\.value\)/.test(panel),
    'undefined is dropped by JSON.stringify, so the panel warned "this loosens a '
      + 'protection and will be refused" and then sent an empty object and reported '
      + '"Limits Saved". The warning, the wire and the toast were three different stories.'
  );
});

test('the 360 shows the flags and the play record the RPC computes', () => {
  assert.match(panel, /Anti-Cheat Flags/, 'an operator choosing collusion_suspected should '
    + 'not have to leave the tab to see whether the platform already flagged this account');
  assert.match(panel, /Play Record/);
  assert.match(panel, /label="Observed Refusals"/, 'and the per-player half of the '
    + 'observation evidence');
});

test('a withheld figure is told apart from a null one', () => {
  assert.match(
    panel,
    /!player\.moneyVisible\s*\n?\s*\? 'Hidden: Needs Money Read'/,
    'keying off the VALUE meant a member with no balance read as a figure the operator '
      + 'was not allowed to see'
  );
});

test('the hidden-horses note reflects the APPLIED filter', () => {
  assert.match(
    panel,
    /searchList\.filters\?\.includeHorses === false/,
    'unticking the box does not narrow anything until Search is pressed, and a note '
      + 'claiming horses are excluded while the table still lists them is the wrong '
      + 'direction to be wrong in'
  );
});

test('a draft is not thrown away before the write succeeds', () => {
  assert.match(panel, /onNoteAdd\(noteDraft\)\.then\(\(ok\) => \{ if \(ok\) setNoteDraft\(''\); \}\)/);
  assert.match(panel, /onTagAdd\(tagDraft\)\.then\(\(ok\) => \{ if \(ok\) setTagDraft\(''\); \}\)/);
});

test('a degraded permission read is said out loud', () => {
  assert.match(
    panel,
    /permissionsDegraded && canModerate/,
    'hasPermission fails OPEN - true for a null or empty list - which is right for tab '
      + 'visibility and wrong for deciding who may sanction. When the read is degraded '
      + 'the controls render, so the operator has to be told the server decides.'
  );
});

test('the reports queue has a filter and a pager like every sibling list', () => {
  assert.match(panel, /aria-label="Report Status"/);
  assert.match(panel, /noun="Reports"/, 'page two was unreachable the moment the table '
    + 'stopped being empty');
});

test('no client vocabulary contradicts the database', async () => {
  const { TICKET_PRIORITIES: clientPriorities } =
    await import('../src/components/horses/playerAdmin.js');
  assert.deepEqual(
    [...clientPriorities],
    ['low', 'medium', 'high', 'critical'],
    'mirrored from live_help_tickets_priority_check'
  );
});
