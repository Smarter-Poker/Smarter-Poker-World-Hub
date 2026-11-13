/**
 * Daily Content Engine: planner, leased job runner and the post state machine.
 *
 * States per post: candidate -> validated -> rendered -> authorized -> scheduled
 * -> submitting -> processing -> published, with held, expired, failed,
 * uncertain, cancelled and superseded as side states. Only stored proof moves a
 * post to published. Gate 3 (I-1): nothing is authorized, every destination is
 * disabled and the global pause is on, so a dry run stops every post at
 * "rendered" with the reason "Awaiting Gate 4 authorization".
 */
import { SLOTS, SLOT_ORDER, slotTimes, buildSlot, FEATURES, weekStart } from './boards.mjs';
import { snapshotHash, contentOf } from './snapshot.mjs';
import { specFor } from './specs.mjs';
import { addDays } from './time.mjs';

export const DESTINATIONS = ['internal_feed', 'facebook', 'instagram', 'youtube'];
export const LEASE_SECONDS = 300;
const SCHEDULE_SLOTS = new Set(['today', 'tonight']);

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export class Engine {
  /**
   * @param {object} deps
   *   store     storage backend (memory or supabase)
   *   reader    { source(from,to,detail), schedule(from,to) }
   *   renderer  { render(spec, jobKey) -> { video, stills, renderer_version } } (files on disk)
   *   adapters  { [destination]: { submit(post, ctx), status(post, ctx), proof(post, ctx) } }
   *   clock     () => Date
   *   owner     worker id for leases
   *   dryRun    true in I-1
   */
  constructor({ store, reader, renderer, adapters = {}, clock = () => new Date(), owner = 'dc-worker', dryRun = true, log = () => {} }) {
    Object.assign(this, { store, reader, renderer, adapters, clock, owner, dryRun, log });
  }

  async event(entity, entityId, event, detail = {}) {
    await this.store.logEvent({ actor: this.owner, entity, entity_id: entityId ? String(entityId) : null, event, detail });
  }

  // ── Planning ──────────────────────────────────────────────────────────
  /** Enqueue build jobs whose snapshot time has come; record missed slots as skipped. */
  async plan(ymd) {
    const now = this.clock();
    for (const slot of SLOT_ORDER) {
      const t = slotTimes(ymd, slot);
      if (now < t.snapshotAt) continue;
      const jobKey = `${ymd}:${slot}:build:r1`;
      if (await this.store.getJobByKey(jobKey)) continue;
      const existing = await this.store.latestEdition(ymd, slot);
      if (existing) continue;
      if (now >= t.postExpiresAt) {
        // Downtime recovery: a slot more than 45 minutes late is dropped, never posted late.
        const ed = await this.store.insertEdition({ edition_date: ymd, slot, revision: 1, family: SLOTS[slot].family, status: 'skipped',
          status_reason: `Missed slot: worker was not running between ${t.snapshotAt.toISOString()} and ${t.postExpiresAt.toISOString()}`,
          slot_at: t.slotAt.toISOString(), expires_at: t.editionExpiresAt.toISOString(), dry_run: this.dryRun });
        await this.event('edition', ed.id, 'slot_dropped', { slot, ymd });
        continue;
      }
      await this.store.insertJob({ job_key: jobKey, kind: 'build', edition_date: ymd, slot, run_after: t.snapshotAt.toISOString(), dry_run: this.dryRun });
    }
  }

  /** Re-queue a fresh revision for any slot of the day whose latest edition failed (an operator action). */
  async retryFailed(ymd) {
    const queued = [];
    for (const slot of SLOT_ORDER) {
      const ed = await this.store.latestEdition(ymd, slot);
      if (!ed || ed.status !== 'failed') continue;
      const key = `${ymd}:${slot}:build:r${ed.revision + 1}`;
      await this.store.insertJob({ job_key: key, kind: 'build', edition_date: ymd, slot, run_after: this.clock().toISOString(), dry_run: this.dryRun });
      await this.event('edition', ed.id, 'edition_retry_queued', { job_key: key });
      queued.push(key);
    }
    return queued;
  }

  // ── Job runner ────────────────────────────────────────────────────────
  async tick(ymd) {
    if (ymd) await this.plan(ymd);
    let ran = 0;
    for (;;) {
      const job = await this.store.claimJob(this.owner, LEASE_SECONDS, this.dryRun, this.clock());
      if (!job) break;
      ran += 1;
      try {
        const result = await this.runJob(job);
        await this.store.updateJob(job.id, { state: 'done', result: result || {}, lease_owner: null, lease_expires_at: null, last_error: null });
      } catch (err) {
        const retry = err.retryAfterSec;
        const exhausted = job.attempts >= job.max_attempts;
        await this.store.updateJob(job.id, {
          state: exhausted ? 'failed' : 'queued', last_error: String(err.message || err).slice(0, 500), lease_owner: null, lease_expires_at: null,
          run_after: new Date(this.clock().getTime() + (retry || 60) * 1000).toISOString(),
        });
        await this.event('job', job.id, exhausted ? 'job_failed' : 'job_retry', { job_key: job.job_key, error: String(err.message || err).slice(0, 300) });
        if (exhausted && job.edition_id) await this.store.updateEdition(job.edition_id, { status: 'failed', status_reason: String(err.message || err).slice(0, 300) });
      }
      if (ran > 200) break;
    }
    return ran;
  }

  async runJob(job) {
    if (job.kind === 'build') return this.runBuild(job);
    if (job.kind === 'render') return this.runRender(job);
    if (job.kind === 'submit') return this.runSubmit(job);
    throw new Error(`unknown job kind ${job.kind}`);
  }

  async featureContext(ymd) {
    const monday = weekStart(ymd);
    const used = [];
    for (let d = monday; d < ymd; d = addDays(d, 1)) {
      const ed = await this.store.latestEdition(d, 'feature');
      const snap = ed?.snapshot_id ? await this.store.getSnapshot(ed.snapshot_id) : null;
      if (snap && ed.status === 'rendered' && snap.payload?.feature) used.push(snap.payload.feature);
    }
    // Repetition rule: one name leading 3 Top 10s running is skipped from the feature that day.
    const leaders = [];
    for (let i = 0; i < 3; i += 1) {
      const ed = await this.store.latestEdition(addDays(ymd, -i), 'top10');
      const snap = ed?.snapshot_id ? await this.store.getSnapshot(ed.snapshot_id) : null;
      leaders.push(snap?.payload?.rows?.[0]?.user_id || null);
    }
    const avoid = leaders[0] && leaders.every((u) => u === leaders[0]) ? [leaders[0]] : [];
    return { usedThisWeek: used, avoidUserIds: avoid };
  }

  async runBuild(job) {
    const { edition_date: ymd, slot } = job;
    const t = slotTimes(ymd, slot);
    const revision = Number(/:r(\d+)$/.exec(job.job_key)?.[1] || 1);
    const ctx = slot === 'feature' ? await this.featureContext(ymd) : {};
    const built = await buildSlot(this.reader, ymd, slot, ctx);
    const family = built.family;
    const periodKey = slot === 'top10' ? addDays(ymd, -1) : ymd;
    const snapshotKey = `${slug(family)}-${periodKey}${built.feature ? `-${built.feature}` : ''}`;
    const prior = await this.store.latestSnapshot(snapshotKey);
    let snapshot = prior;
    if (!prior || snapshotHash(contentOf(prior.payload)) !== snapshotHash(contentOf(built.payload))) {
      snapshot = await this.store.insertSnapshot({
        snapshot_key: snapshotKey, revision: prior ? prior.revision + 1 : 1, family, slot,
        period_start: built.period?.start || null, period_end: built.period?.end || null,
        taken_at: this.clock().toISOString(), scoring_version: built.payload.scoring_version || null,
        eligibility_version: built.payload.eligibility_version || null, completeness: built.completeness || 'NOT_APPLICABLE',
        payload: built.payload, sha256: snapshotHash(built.payload), supersedes: prior?.id || null, dry_run: this.dryRun,
      });
      await this.event('snapshot', snapshot.id, prior ? 'snapshot_revised' : 'snapshot_frozen', { snapshot_key: snapshotKey, revision: snapshot.revision, sha256: snapshot.sha256 });
    }
    const renderable = built.status === 'ok' || built.status === 'fallback';
    const edition = await this.store.insertEdition({
      edition_date: ymd, slot, revision, family, snapshot_id: snapshot.id,
      status: renderable ? 'building' : built.status === 'held' ? 'held' : 'skipped',
      status_reason: built.reason || null, headline: built.headline, caption: built.caption,
      slot_at: t.slotAt.toISOString(), expires_at: t.editionExpiresAt.toISOString(), dry_run: this.dryRun,
    });
    await this.event('edition', edition.id, renderable ? 'edition_built' : `edition_${edition.status}`, { slot, ymd, revision, reason: built.reason || null });
    if (!renderable) return { edition_id: edition.id, status: edition.status };
    await this.store.insertJob({ job_key: `${ymd}:${slot}:render:r${revision}`, kind: 'render', edition_date: ymd, slot,
      edition_id: edition.id, run_after: this.clock().toISOString(), dry_run: this.dryRun, checkpoint: { built_status: built.status, fallback: built.fallback || null } });
    return { edition_id: edition.id, snapshot_id: snapshot.id, sha256: snapshot.sha256 };
  }

  async runRender(job) {
    const edition = await this.store.getEdition(job.edition_id);
    const snapshot = await this.store.getSnapshot(edition.snapshot_id);
    const built = { fallback: job.checkpoint?.fallback || null };
    const spec = specFor(edition.slot, built, snapshot, { dryRun: this.dryRun });
    // Resume: a render already stored for this edition is reused, never duplicated.
    const have = await this.store.listRenders(edition.id);
    if (!have.some((r) => r.kind === 'video_9x16')) {
      const out = await this.renderer.render(spec, job.job_key);
      const base = `${edition.edition_date}/${edition.slot}/r${edition.revision}`;
      const files = [
        { kind: 'video_9x16', file: out.video, ct: 'video/mp4', name: 'video.mp4' },
        { kind: 'still_9x16', file: out.stills.still_9x16, ct: 'image/png', name: 'still-9x16.png' },
        { kind: 'still_4x5', file: out.stills.still_4x5, ct: 'image/png', name: 'still-4x5.png' },
      ];
      for (const f of files) {
        const path = `${base}/${f.name}`;
        await this.store.uploadObject(path, f.file.path, f.ct);
        await this.store.upsertRender({ edition_id: edition.id, kind: f.kind, storage_path: path, sha256: f.file.sha256, bytes: f.file.bytes,
          width: f.file.width, height: f.file.height, duration_s: f.file.duration_s ?? null, renderer_version: out.renderer_version });
      }
      await this.store.uploadJson(`${base}/spec.json`, spec);
    }
    await this.store.updateEdition(edition.id, { status: 'rendered', status_reason: null });
    await this.event('edition', edition.id, 'edition_rendered', { slot: edition.slot, revision: edition.revision });
    await this.createPosts(edition);
    return { edition_id: edition.id };
  }

  async createPosts(edition) {
    const t = slotTimes(edition.edition_date, edition.slot);
    const destinations = await this.store.listDestinations();
    for (const d of DESTINATIONS) {
      const dest = destinations.find((x) => x.destination === d);
      const key = `${edition.edition_date}:${edition.slot}:r${edition.revision}:${d}`;
      const post = await this.store.insertPost({
        edition_id: edition.id, destination: d, idempotency_key: key, state: 'rendered',
        state_reason: dest?.enabled ? 'Awaiting authorization' : 'Awaiting Gate 4 authorization (destination disabled)',
        scheduled_for: t.slotAt.toISOString(), expires_at: t.postExpiresAt.toISOString(), dry_run: this.dryRun,
      });
      if (post.state === 'authorized') await this.scheduleSubmit(post, edition);
    }
  }

  /** Called when a person authorizes a post (Gate 4 and later). */
  async authorize(postId, by) {
    const post = await this.store.getPost(postId);
    if (post.state !== 'rendered' && post.state !== 'held') throw new Error(`cannot authorize a post in state ${post.state}`);
    const upd = await this.store.updatePost(post.id, { state: 'authorized', authorized_by: by, authorized_at: this.clock().toISOString(), state_reason: null });
    await this.event('post', post.id, 'post_authorized', { by });
    const edition = await this.store.getEdition(post.edition_id);
    await this.scheduleSubmit(upd, edition);
    return upd;
  }

  async scheduleSubmit(post, edition) {
    await this.store.updatePost(post.id, { state: 'scheduled' });
    await this.store.insertJob({ job_key: `${post.idempotency_key}:submit`, kind: 'submit', edition_date: edition.edition_date, slot: edition.slot,
      edition_id: edition.id, post_id: post.id, run_after: post.scheduled_for, dry_run: this.dryRun, max_attempts: 5 });
  }

  async isPaused(destination, slot) {
    const pauses = await this.store.listPauses();
    const hit = pauses.find((p) => p.paused && (p.scope === 'global' || p.scope === `destination:${destination}` || p.scope === `series:${slot}`));
    return hit || null;
  }

  /** Re-read a schedule card's events 2 minutes before submit; a cancelled or vanished event forces a rebuild. */
  async scheduleStillValid(edition) {
    if (!SCHEDULE_SLOTS.has(edition.slot)) return { ok: true };
    const snap = await this.store.getSnapshot(edition.snapshot_id);
    const w = snap.payload.window;
    const now = await this.reader.schedule(w.from, w.to);
    const byId = new Map(now.events.map((e) => [e.id, e]));
    const bad = snap.payload.items.filter((i) => { const e = byId.get(i.event_id); return !e || e.status === 'CANCELLED'; });
    return bad.length ? { ok: false, cancelled: bad.map((b) => b.event_id) } : { ok: true };
  }

  async runSubmit(job) {
    let post = await this.store.getPost(job.post_id);
    const edition = await this.store.getEdition(post.edition_id);
    const now = this.clock();
    const receipt = (kind, payload) => this.store.addReceipt({ post_id: post.id, kind, payload });

    if (post.state === 'published') return { already: true }; // duplicate run: one post
    if (['cancelled', 'superseded', 'expired', 'failed'].includes(post.state)) return { skipped: post.state };

    if (now > new Date(post.expires_at)) {
      await this.store.updatePost(post.id, { state: 'expired', state_reason: 'More than 45 minutes past its slot; never posted late' });
      await receipt('expired', { at: now.toISOString() });
      await this.event('post', post.id, 'post_expired', {});
      return { expired: true };
    }

    const pause = await this.isPaused(post.destination, edition.slot);
    if (pause) {
      await this.store.updatePost(post.id, { state: 'held', state_reason: `Paused (${pause.scope}): ${pause.reason || ''}`.trim() });
      await receipt('pause_stop', { scope: pause.scope, at: now.toISOString() });
      await this.event('post', post.id, 'post_paused', { scope: pause.scope });
      return { paused: pause.scope };
    }

    const fresh = await this.scheduleStillValid(edition);
    if (!fresh.ok) {
      await this.store.updatePost(post.id, { state: 'superseded', state_reason: `Listed event cancelled: ${fresh.cancelled.join(', ')}` });
      await this.store.updateEdition(edition.id, { status: 'superseded', status_reason: 'A listed event was cancelled; rebuilt as a new revision' });
      await this.store.insertJob({ job_key: `${edition.edition_date}:${edition.slot}:build:r${edition.revision + 1}`, kind: 'build',
        edition_date: edition.edition_date, slot: edition.slot, run_after: now.toISOString(), dry_run: this.dryRun });
      await this.event('edition', edition.id, 'edition_superseded_cancelled_event', { cancelled: fresh.cancelled });
      return { rebuild: true };
    }

    const dest = (await this.store.listDestinations()).find((d) => d.destination === post.destination);
    if (!dest || !dest.enabled || dest.connection_state !== 'connected') {
      await this.store.updatePost(post.id, { state: 'held', state_reason: `Destination ${post.destination} is not enabled and connected` });
      return { held: 'destination_off' };
    }
    const adapter = this.adapters[post.destination];
    const ctx = { edition, dest, renders: await this.store.listRenders(edition.id), store: this.store };

    // A previous attempt may have uploaded: ask the platform before any retry.
    if (post.state === 'uncertain' || post.state === 'submitting' || post.state === 'processing') {
      const st = await adapter.status(post, ctx);
      await receipt('status', st);
      if (st.found) return this.finishPublished(post, st, receipt);
    }

    post = await this.store.updatePost(post.id, { state: 'submitting', attempts: post.attempts + 1 });
    let sub;
    try {
      sub = await adapter.submit(post, ctx);
    } catch (err) {
      if (err.code === 'TOKEN_REVOKED') {
        await this.store.updateDestination(post.destination, { connection_state: 'revoked', enabled: false });
        await this.store.updatePost(post.id, { state: 'held', state_reason: 'Token revoked: destination paused' });
        await receipt('error', { code: err.code, message: err.message });
        await this.store.raiseAlert({ title: `Daily content: ${post.destination} token revoked`, detail: { post_id: post.id } });
        await this.event('destination', post.destination, 'destination_revoked', { post_id: post.id });
        return { revoked: true };
      }
      if (err.code === 'TIMEOUT' || err.code === 'AMBIGUOUS') {
        await this.store.updatePost(post.id, { state: 'uncertain', state_reason: 'Upload outcome unknown; remote status is checked before any retry' });
        await receipt('error', { code: err.code, message: err.message });
        const e = new Error('uncertain upload'); e.retryAfterSec = 60; throw e;
      }
      await receipt('error', { code: err.code || 'ERROR', message: String(err.message || err) });
      await this.store.updatePost(post.id, { state: 'failed', state_reason: String(err.message || err).slice(0, 300) });
      throw err;
    }
    await receipt('submit', sub);
    await this.store.updatePost(post.id, { state: 'processing', remote_id: sub.remote_id || null });
    const proof = await adapter.proof({ ...post, remote_id: sub.remote_id }, ctx);
    await receipt('proof', proof);
    if (!proof.found) {
      await this.store.updatePost(post.id, { state: 'uncertain', state_reason: 'No proof yet; shown as unconfirmed' });
      const e = new Error('no proof yet'); e.retryAfterSec = 120; throw e;
    }
    return this.finishPublished(post, proof, receipt);
  }

  async finishPublished(post, proof, receipt) {
    await this.store.updatePost(post.id, { state: 'published', remote_id: proof.remote_id, remote_url: proof.remote_url || null,
      account_ref: proof.account_ref || null, published_at: proof.published_at || this.clock().toISOString(), state_reason: null });
    await this.event('post', post.id, 'post_published', { remote_id: proof.remote_id });
    return { published: proof.remote_id };
  }

  /**
   * Late settlement / correction: rebuild a slot's snapshot now. If its content
   * changed, a new snapshot revision supersedes the old one and every unpublished
   * post of the old edition is held; nothing is edited in place.
   */
  async recheck(ymd, slot) {
    const ed = await this.store.latestEdition(ymd, slot);
    if (!ed?.snapshot_id) return { changed: false };
    const old = await this.store.getSnapshot(ed.snapshot_id);
    const ctx = slot === 'feature' ? await this.featureContext(ymd) : {};
    const built = await buildSlot(this.reader, ymd, slot, ctx);
    if (snapshotHash(contentOf(old.payload)) === snapshotHash(contentOf(built.payload))) return { changed: false };
    for (const p of await this.store.listPosts(ed.id)) {
      if (p.state !== 'published') await this.store.updatePost(p.id, { state: 'superseded', state_reason: 'Source changed after the snapshot; superseded by a new revision' });
    }
    await this.store.updateEdition(ed.id, { status: 'superseded', status_reason: 'Source changed after the snapshot' });
    await this.store.insertJob({ job_key: `${ymd}:${slot}:build:r${ed.revision + 1}`, kind: 'build', edition_date: ymd, slot, run_after: this.clock().toISOString(), dry_run: this.dryRun });
    await this.event('edition', ed.id, 'edition_superseded_source_changed', {});
    return { changed: true };
  }
}

export { FEATURES };
