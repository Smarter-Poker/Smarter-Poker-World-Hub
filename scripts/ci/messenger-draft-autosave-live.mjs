#!/usr/bin/env node
// DRAFT AUTOSAVE, VERIFIED AGAINST THE PUBLISHED API (2026-11-09).
//
// Searching the published bundle proved the "Save Draft To Account" banner is
// gone. It proved nothing about whether a draft actually saves. This drives
// the REAL continuity controller — the same module both messenger surfaces
// build — over the REAL deployed endpoint as the designated test identity,
// across two owned fixture conversations that address no person.
//
// Scope: the draft field only, on the two fixture conversations, plus one
// send into fixture A. No other conversation, account, field or endpoint.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN, AUTH_ORIGIN, validateConfiguration } from './messenger-live-configuration.mjs';
import { createContinuityController } from '../../src/lib/messengerContinuity.mjs';

export const FIXTURE_TITLE = 'Messenger Verification Only';
export const OFFICIAL_FINGERPRINT = '9fec7638c003ad1c';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The surface debounce both messenger surfaces apply to a draft edit.
export const SURFACE_DEBOUNCE_MS = 600;

export function draftConfiguration(env) {
  validateConfiguration(env);
  assert.equal(env.MESSENGER_VERIFY_MODE, 'isolated-draft-autosave', 'Explicit isolated-draft-autosave mode is required');
  for (const key of ['MESSENGER_FIXTURE_CONVERSATION_ID', 'MESSENGER_FIXTURE_SECOND_CONVERSATION_ID']) {
    assert.match(env[key] || '', UUID, `${key} must be an exact fixture UUID`);
  }
  const a = env.MESSENGER_FIXTURE_CONVERSATION_ID;
  const b = env.MESSENGER_FIXTURE_SECOND_CONVERSATION_ID;
  assert.notEqual(a, b, 'Two distinct fixture conversations are required');
  return { a, b, label: FIXTURE_TITLE };
}

// Every request this probe may make. Anything else is refused before it is sent.
export function allowedDraftRequest(method, address, body, fixture) {
  let target;
  try { target = new URL(address); } catch { return false; }
  if (!fixture || target.origin !== APP_ORIGIN || target.search || target.hash || method !== 'POST') return false;
  const owned = id => id === fixture.a || id === fixture.b;
  if (target.pathname === '/api/messenger/continuity') {
    // The controller sends `workspace` on both read shapes, and a
    // whole-workspace read carries no conversationId at all.
    if (body?.action === 'read') {
      const keys = Object.keys(body).sort().join(',');
      if (keys === 'action,workspace') return body.workspace?.workspace === 'social';
      return keys === 'action,conversationId,workspace' && owned(body.conversationId) && body.workspace?.workspace === 'social';
    }
    if (!owned(body?.conversationId)) return false;
    return body.action === 'write' && body.field === 'draft'
      && Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 0
      && body.value && typeof body.value.text === 'string' && body.value.replyToId === null
      && (body.value.text === '' || body.value.text.startsWith(FIXTURE_TITLE));
  }
  if (target.pathname === '/api/messenger/send-message') {
    return body?.conversationId === fixture.a && typeof body.content === 'string'
      && body.content.startsWith(FIXTURE_TITLE);
  }
  return false;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runDraftAutosave() {
  const evidenceDir = process.env.MESSENGER_EVIDENCE_DIR || 'test-results/messenger-draft-autosave-live';
  await mkdir(evidenceDir, { recursive: true });
  const report = {
    observedAt: new Date().toISOString(), status: 'running', checks: [], cleanup: 'not-needed',
    limitation: 'Authenticated deployed API with the real continuity controller. Keystroke rendering, '
      + 'the composer textarea and cross-tab storage events are browser behaviour and are not asserted here. '
      + 'The fixture carries one message each because a conversation with no messages is not listed by '
      + 'fn_get_user_conversations, so a whole-workspace read does not carry its state; such a draft is '
      + 'recovered only by opening that conversation by id.',
  };
  let fixture, session, post, sentMessageId = null;
  try {
    fixture = draftConfiguration(process.env);
    report.expectedSha = process.env.MESSENGER_EXPECTED_SHA;
    report.fixture = { a: fixture.a, b: fixture.b };

    const health = async () => {
      const response = await fetch(`${APP_ORIGIN}/api/health`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      assert.ok(response.ok && data.status === 'ok', 'Production health is not healthy');
      assert.equal(data.commitSha, report.expectedSha, 'Published revision differs from expected protected SHA');
      report.deploymentId = data.deploymentId;
      return data;
    };
    await health();

    const { createClient } = await import('@supabase/supabase-js');
    const auth = createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signedIn = await auth.auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
    session = signedIn.data?.session;
    assert.ok(!signedIn.error && session?.access_token, 'Configured test identity could not authenticate; no fallback used');
    const verified = await auth.auth.getUser(session.access_token);
    assert.ok(!verified.error && verified.data?.user?.id === session.user.id, 'Test identity verification failed');
    report.accountFingerprint = createHash('sha256').update(session.user.id).digest('hex').slice(0, 16);
    assert.equal(report.accountFingerprint, OFFICIAL_FINGERPRINT, 'Only the established official test identity may run this probe');
    const actorId = session.user.id;

    post = async (route, body, expectedStatus = 200) => {
      assert.equal(allowedDraftRequest('POST', APP_ORIGIN + route, body, fixture), true, 'Request is outside exact draft fixture scope');
      const response = await fetch(APP_ORIGIN + route, {
        method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (expectedStatus !== null) assert.equal(response.status, expectedStatus, `Fixture API returned ${response.status}, expected ${expectedStatus}`);
      return { ok: response.ok, status: response.status, body: data };
    };

    // A browser-shaped storage, and a controller built exactly as the surfaces
    // build it. A fresh controller with EMPTY storage is what a reload is.
    const makeStorage = () => {
      const data = new Map();
      return { get length() { return data.size; }, key: i => [...data.keys()][i],
        getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), data };
    };
    const makeController = storage => createContinuityController({
      actorId, workspace: { workspace: 'social', folder: 'messages' }, storage,
      request: body => post('/api/messenger/continuity', body, null).then(r => ({ ok: r.ok, status: r.status, body: r.body })),
    });

    // The surface debounce, reproduced exactly: edit now, write after 600ms.
    const typeInto = (controller, conversationId, text) => {
      controller.edit(conversationId, 'draft', { text, replyToId: null });
      return new Promise(resolve => setTimeout(() => resolve(controller.write(conversationId, 'draft')), SURFACE_DEBOUNCE_MS));
    };
    const draftOf = (controller, id) => controller.state(id).draft.text;
    // A read that fails is recorded on the controller rather than thrown, so
    // every read is asserted to have actually happened. Without this a refused
    // request reads as an empty draft and a lost draft reads as a pass.
    const readOk = async (controller, conversationId = null) => {
      await controller.read(conversationId);
      const failures = [...controller.errors.values()].filter(e => e.read);
      assert.deepEqual(failures.map(e => e.message), [],
        `A continuity read failed instead of returning state${conversationId ? ` for ${conversationId}` : ''}`);
    };

    const textA = `${FIXTURE_TITLE}: Draft A ${randomUUID()}`;
    const textB = `${FIXTURE_TITLE}: Draft B ${randomUUID()}`;

    // ── 1. A fresh fixture holds no draft ───────────────────────────────
    const typist = makeController(makeStorage());
    await readOk(typist, fixture.a);
    await readOk(typist, fixture.b);
    assert.equal(draftOf(typist, fixture.a), '', 'Fixture A already contains a draft');
    assert.equal(draftOf(typist, fixture.b), '', 'Fixture B already contains a draft');
    assert.equal(typist.state(fixture.a).draft.revision, 0, 'Fixture A is not fresh; inspect the owning outcome before reuse');
    assert.equal(typist.state(fixture.b).draft.revision, 0, 'Fixture B is not fresh; inspect the owning outcome before reuse');
    report.checks.push('Both fixture conversations started with no stored draft, from reads that succeeded');

    // ── 2. Typing saves after the debounce, with no prompt to press ─────
    typist.edit(fixture.a, 'draft', { text: `${FIXTURE_TITLE}: partial`, replyToId: null });
    typist.edit(fixture.a, 'draft', { text: textA, replyToId: null });
    assert.equal(typist.state(fixture.a).draft.dirty, true, 'An unsaved draft should be marked dirty while typing');
    await sleep(SURFACE_DEBOUNCE_MS);
    await typist.write(fixture.a, 'draft');
    assert.equal(typist.state(fixture.a).draft.dirty, false, 'Draft remained unsaved after the debounce elapsed');
    assert.ok(typist.state(fixture.a).draft.revision > 0, 'Draft save did not advance the stored revision');
    report.checks.push('Typing saved the draft after the surface debounce with no user action');

    // ── 3. Switching conversations preserves BOTH drafts ────────────────
    await typeInto(typist, fixture.b, textB);
    assert.equal(draftOf(typist, fixture.a), textA, 'Switching conversations disturbed the first draft');
    assert.equal(draftOf(typist, fixture.b), textB, 'Second conversation did not keep its own draft');
    report.checks.push('Two conversations each kept their own draft');

    // ── 4. A reload recovers both from the account, not from the device ─
    // Two reloads, because the surfaces perform two different reads: the whole
    // workspace when the app loads, and one conversation when it is opened.
    const reloaded = makeController(makeStorage());
    await readOk(reloaded);
    assert.equal(draftOf(reloaded, fixture.a), textA, 'Draft A did not survive a reload with empty device storage');
    assert.equal(draftOf(reloaded, fixture.b), textB, 'Draft B did not survive a reload with empty device storage');
    assert.equal(reloaded.state(fixture.a).draft.dirty, false, 'A recovered draft must not be marked unsaved');

    const opened = makeController(makeStorage());
    await readOk(opened, fixture.a);
    assert.equal(draftOf(opened, fixture.a), textA, 'Opening the conversation did not recover its draft');
    report.checks.push('A fresh client with empty device storage recovered both drafts from the account, '
      + 'through a whole-workspace read and through opening one conversation');

    // ── 5. The draft belongs to this account and this conversation ──────
    const direct = await post('/api/messenger/continuity', { action: 'read', conversationId: fixture.a, workspace: { workspace: 'social', folder: 'messages' } });
    const state = direct.body.state || direct.body.states?.[fixture.a];
    assert.equal(state.draft.text, textA, 'Direct API read returned a different draft');
    assert.notEqual(textA, textB, 'Fixture texts must differ for the scoping check to mean anything');
    const anonymous = await fetch(`${APP_ORIGIN}/api/messenger/continuity`, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', conversationId: fixture.a }),
    });
    assert.equal(anonymous.status, 401, 'An unauthenticated reader must not reach a stored draft');
    report.checks.push('The stored draft is scoped to its conversation and refused to an unauthenticated reader');

    // ── 6. A stale write is a conflict that keeps the typed text ────────
    const conflicted = makeController(makeStorage());
    await readOk(conflicted, fixture.a);
    conflicted.state(fixture.a).draft.revision = 0; // a device that missed the newer revision
    const localText = `${FIXTURE_TITLE}: Conflicting local ${randomUUID()}`;
    conflicted.edit(fixture.a, 'draft', { text: localText, replyToId: null });
    await conflicted.write(fixture.a, 'draft');
    const conflictState = conflicted.state(fixture.a).draft;
    assert.equal(conflictState.conflict, true, 'A stale draft write must be reported as a conflict');
    assert.equal(conflictState.text, localText, 'A conflict must keep the text the person typed');
    assert.equal(conflictState.remote?.text, textA, 'A conflict must carry the other device’s draft to choose from');
    assert.equal(draftOf(conflicted, fixture.a), localText, 'The typed text must remain visible during a conflict');
    report.checks.push('A cross-device conflict kept the typed text and offered the stored one');

    // ── 7. A failed save keeps the text and reports it ──────────────────
    const offline = createContinuityController({
      actorId, workspace: { workspace: 'social', folder: 'messages' }, storage: makeStorage(),
      request: async () => { throw new Error('Network Unavailable'); },
    });
    const unsent = `${FIXTURE_TITLE}: Unsaved ${randomUUID()}`;
    offline.edit(fixture.a, 'draft', { text: unsent, replyToId: null });
    await offline.write(fixture.a, 'draft');
    assert.equal(draftOf(offline, fixture.a), unsent, 'A failed save must not discard the typed text');
    assert.equal(offline.state(fixture.a).draft.dirty, true, 'A failed save must leave the draft marked unsaved');
    const failure = offline.errors.get(`${fixture.a}:draft`);
    assert.ok(failure?.message, 'A failed save must surface a message the surface can show');
    assert.equal(failure.field, 'draft', 'The reported failure must name the draft field');
    report.checks.push(`A failed save kept the text and reported "${failure.message}"`);

    // ── 8. Sending clears the draft, and no pending save restores it ────
    const sender = makeController(makeStorage());
    await readOk(sender, fixture.a);
    assert.equal(draftOf(sender, fixture.a), textA, 'The draft to be sent was not loaded');
    const outgoing = `${FIXTURE_TITLE}: Sent ${randomUUID()}`;
    sender.edit(fixture.a, 'draft', { text: outgoing, replyToId: null });
    const captured = { ...sender.state(fixture.a).draft };
    // The send happens while the typing debounce is still pending, which is
    // the case a stale timer could resurrect the text in.
    const sent = await post('/api/messenger/send-message', { conversationId: fixture.a, content: outgoing });
    assert.equal(sent.body.success, true, 'Fixture send failed');
    sentMessageId = sent.body.msgId || null;
    assert.equal(sender.clearDraftIfUnchanged(fixture.a, captured), true, 'Send did not clear an unchanged draft');
    await sleep(SURFACE_DEBOUNCE_MS + 3200); // outlast every debounce in play
    await sender.write(fixture.a, 'draft');
    assert.equal(draftOf(sender, fixture.a), '', 'A pending save restored the sent draft');
    const afterSend = makeController(makeStorage());
    await readOk(afterSend, fixture.a);
    assert.equal(draftOf(afterSend, fixture.a), '', 'The account still holds the draft that was already sent');
    report.checks.push('Sending cleared the draft and no pending save restored it');

    // ── 9. Clearing B leaves the fixture as it was found ────────────────
    await typeInto(reloaded, fixture.b, '');
    const finalRead = makeController(makeStorage());
    await readOk(finalRead);
    assert.equal(draftOf(finalRead, fixture.a), '', 'Fixture A was not left empty');
    assert.equal(draftOf(finalRead, fixture.b), '', 'Fixture B was not left empty');
    report.cleanup = sentMessageId ? 'fixture drafts cleared; one fixture message retained for the owning cleanup' : 'fixture drafts cleared';
    report.sentMessageId = sentMessageId;

    await health();
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error?.message || String(error);
  }
  await writeFile(`${evidenceDir}/result.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runDraftAutosave();
  process.exit(report.status === 'passed' ? 0 : 1);
}
