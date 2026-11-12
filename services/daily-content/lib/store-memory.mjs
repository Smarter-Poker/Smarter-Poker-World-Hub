/** In-memory store with the same contract as the Supabase store (tests and fixtures). */
import { randomUUID } from 'node:crypto';

export class MemoryStore {
  constructor(clock = () => new Date()) {
    this.clock = clock;
    this.t = { snapshots: [], editions: [], renders: [], posts: [], receipts: [], jobs: [], events: [], alerts: [], objects: new Map() };
    this.pauses = [{ scope: 'global', paused: true, reason: 'Gate 4 not approved: publishing is off', set_by: 'seed' }];
    this.destinations = ['internal_feed', 'facebook', 'instagram', 'youtube'].map((d) => ({ destination: d, enabled: false, connection_state: 'not_connected', daily_cap: 4 }));
  }
  now() { return this.clock().toISOString(); }

  async getJobByKey(k) { return this.t.jobs.find((j) => j.job_key === k) || null; }
  async insertJob(row) {
    const ex = await this.getJobByKey(row.job_key);
    if (ex) return ex;
    const j = { id: randomUUID(), state: 'queued', attempts: 0, max_attempts: 3, checkpoint: {}, dry_run: true, lease_owner: null, lease_expires_at: null, ...row, created_at: this.now() };
    this.t.jobs.push(j); return j;
  }
  async claimJob(owner, leaseSec, dryRun, now = this.clock()) {
    const n = now.getTime();
    const ready = this.t.jobs.filter((j) => j.dry_run === dryRun && j.attempts < j.max_attempts
      && ((j.state === 'queued' && new Date(j.run_after).getTime() <= n) || (j.state === 'running' && new Date(j.lease_expires_at).getTime() < n)))
      .sort((a, b) => String(a.run_after).localeCompare(String(b.run_after)) || String(a.created_at).localeCompare(String(b.created_at)));
    const j = ready[0];
    if (!j) return null;
    Object.assign(j, { state: 'running', lease_owner: owner, lease_expires_at: new Date(n + leaseSec * 1000).toISOString(), attempts: j.attempts + 1 });
    return { ...j };
  }
  async updateJob(id, patch) { const j = this.t.jobs.find((x) => x.id === id); Object.assign(j, patch); return { ...j }; }

  async latestSnapshot(key) { return this.t.snapshots.filter((s) => s.snapshot_key === key).sort((a, b) => b.revision - a.revision)[0] || null; }
  async insertSnapshot(row) {
    const ex = this.t.snapshots.find((s) => s.snapshot_key === row.snapshot_key && s.revision === row.revision);
    if (ex) return ex;
    const s = { id: randomUUID(), ...row, created_at: this.now() }; this.t.snapshots.push(s); return s;
  }
  async getSnapshot(id) { return this.t.snapshots.find((s) => s.id === id) || null; }

  async insertEdition(row) {
    const ex = this.t.editions.find((e) => e.edition_date === row.edition_date && e.slot === row.slot && e.revision === row.revision);
    if (ex) return ex;
    const e = { id: randomUUID(), ...row, created_at: this.now() }; this.t.editions.push(e); return e;
  }
  async latestEdition(ymd, slot) { return this.t.editions.filter((e) => e.edition_date === ymd && e.slot === slot).sort((a, b) => b.revision - a.revision)[0] || null; }
  async getEdition(id) { return this.t.editions.find((e) => e.id === id) || null; }
  async updateEdition(id, patch) { const e = this.t.editions.find((x) => x.id === id); Object.assign(e, patch); return e; }

  async listRenders(editionId) { return this.t.renders.filter((r) => r.edition_id === editionId); }
  async upsertRender(row) {
    const ex = this.t.renders.find((r) => r.edition_id === row.edition_id && r.kind === row.kind);
    if (ex) { Object.assign(ex, row); return ex; }
    const r = { id: randomUUID(), ...row }; this.t.renders.push(r); return r;
  }
  async uploadObject(path, file) { this.t.objects.set(path, file); }
  async uploadJson(path, obj) { this.t.objects.set(path, JSON.stringify(obj)); }

  async insertPost(row) {
    const ex = this.t.posts.find((p) => p.idempotency_key === row.idempotency_key);
    if (ex) return ex;
    const p = { id: randomUUID(), attempts: 0, ...row, created_at: this.now() }; this.t.posts.push(p); return p;
  }
  async getPost(id) { return { ...this.t.posts.find((p) => p.id === id) }; }
  async updatePost(id, patch) { const p = this.t.posts.find((x) => x.id === id); Object.assign(p, patch); return { ...p }; }
  async listPosts(editionId) { return this.t.posts.filter((p) => p.edition_id === editionId); }
  async addReceipt(row) { this.t.receipts.push({ ...row, created_at: this.now() }); }

  async listPauses() { return this.pauses.map((p) => ({ ...p })); }
  async setPause(scope, paused, reason = '') {
    const ex = this.pauses.find((p) => p.scope === scope);
    if (ex) Object.assign(ex, { paused, reason }); else this.pauses.push({ scope, paused, reason, set_by: 'test' });
  }
  async listDestinations() { return this.destinations.map((d) => ({ ...d })); }
  async updateDestination(d, patch) { Object.assign(this.destinations.find((x) => x.destination === d), patch); }
  async logEvent(e) { this.t.events.push({ ...e, at: this.now() }); }
  async raiseAlert(a) { this.t.alerts.push({ ...a, at: this.now() }); }
}
