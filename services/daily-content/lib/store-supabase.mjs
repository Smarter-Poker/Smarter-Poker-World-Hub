/**
 * Supabase store (service role). Tables public.daily_content_*, bucket
 * 'daily-content' (private). Leases use the database clock via
 * fn_daily_content_claim_job.
 */
import { readFile } from 'node:fs/promises';

const T = (n) => `daily_content_${n}`;

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export class SupabaseStore {
  constructor(client) { this.sb = client; }

  async getJobByKey(k) { return must(await this.sb.from(T('jobs')).select('*').eq('job_key', k).maybeSingle(), 'getJobByKey'); }
  async insertJob(row) {
    must(await this.sb.from(T('jobs')).upsert(row, { onConflict: 'job_key', ignoreDuplicates: true }), 'insertJob');
    return this.getJobByKey(row.job_key);
  }
  async claimJob(owner, leaseSec, dryRun) {
    const rows = must(await this.sb.rpc('fn_daily_content_claim_job', { p_owner: owner, p_lease_seconds: leaseSec, p_dry_run: dryRun }), 'claimJob');
    return rows?.[0] || null;
  }
  async updateJob(id, patch) {
    return must(await this.sb.from(T('jobs')).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single(), 'updateJob');
  }

  async latestSnapshot(key) {
    return must(await this.sb.from(T('snapshots')).select('*').eq('snapshot_key', key).order('revision', { ascending: false }).limit(1).maybeSingle(), 'latestSnapshot');
  }
  async insertSnapshot(row) {
    must(await this.sb.from(T('snapshots')).upsert(row, { onConflict: 'snapshot_key,revision', ignoreDuplicates: true }), 'insertSnapshot');
    return must(await this.sb.from(T('snapshots')).select('*').eq('snapshot_key', row.snapshot_key).eq('revision', row.revision).single(), 'readSnapshot');
  }
  async getSnapshot(id) { return must(await this.sb.from(T('snapshots')).select('*').eq('id', id).maybeSingle(), 'getSnapshot'); }

  async insertEdition(row) {
    must(await this.sb.from(T('editions')).upsert(row, { onConflict: 'edition_date,slot,revision', ignoreDuplicates: true }), 'insertEdition');
    return must(await this.sb.from(T('editions')).select('*').eq('edition_date', row.edition_date).eq('slot', row.slot).eq('revision', row.revision).single(), 'readEdition');
  }
  async latestEdition(ymd, slot) {
    return must(await this.sb.from(T('editions')).select('*').eq('edition_date', ymd).eq('slot', slot).order('revision', { ascending: false }).limit(1).maybeSingle(), 'latestEdition');
  }
  async getEdition(id) { return must(await this.sb.from(T('editions')).select('*').eq('id', id).single(), 'getEdition'); }
  async updateEdition(id, patch) {
    return must(await this.sb.from(T('editions')).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single(), 'updateEdition');
  }

  async listRenders(editionId) { return must(await this.sb.from(T('renders')).select('*').eq('edition_id', editionId), 'listRenders'); }
  async upsertRender(row) { return must(await this.sb.from(T('renders')).upsert(row, { onConflict: 'edition_id,kind' }).select().single(), 'upsertRender'); }
  async uploadObject(path, file, contentType) {
    const body = await readFile(file);
    must(await this.sb.storage.from('daily-content').upload(path, body, { contentType, upsert: true }), `upload ${path}`);
  }
  async uploadJson(path, obj) {
    must(await this.sb.storage.from('daily-content').upload(path, Buffer.from(JSON.stringify(obj, null, 2)), { contentType: 'application/json', upsert: true }), `upload ${path}`);
  }

  async insertPost(row) {
    must(await this.sb.from(T('posts')).upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true }), 'insertPost');
    return must(await this.sb.from(T('posts')).select('*').eq('idempotency_key', row.idempotency_key).single(), 'readPost');
  }
  async getPost(id) { return must(await this.sb.from(T('posts')).select('*').eq('id', id).single(), 'getPost'); }
  async updatePost(id, patch) {
    return must(await this.sb.from(T('posts')).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single(), 'updatePost');
  }
  async listPosts(editionId) { return must(await this.sb.from(T('posts')).select('*').eq('edition_id', editionId), 'listPosts'); }
  async addReceipt(row) { must(await this.sb.from(T('receipts')).insert(row), 'addReceipt'); }

  async listPauses() { return must(await this.sb.from(T('pauses')).select('*'), 'listPauses'); }
  async listDestinations() { return must(await this.sb.from(T('destinations')).select('*'), 'listDestinations'); }
  async updateDestination(d, patch) {
    must(await this.sb.from(T('destinations')).update({ ...patch, updated_at: new Date().toISOString() }).eq('destination', d), 'updateDestination');
  }
  async logEvent(e) { must(await this.sb.from(T('events')).insert(e), 'logEvent'); }
  /** Actionable failures are recorded as alert events the dashboard shows. */
  async raiseAlert(a) { await this.logEvent({ actor: 'dc-worker', entity: 'alert', entity_id: null, event: 'alert', detail: a }); }
}

/** Source reader over the read-only RPCs. */
export function supabaseReader(client) {
  return {
    async source(from, to, detail) {
      const { data, error } = await client.rpc('fn_daily_content_source', { p_from: from, p_to: to, p_detail: detail });
      if (error) throw new Error(`source: ${error.message}`);
      return data;
    },
    async schedule(from, to) {
      const { data, error } = await client.rpc('fn_daily_content_schedule', { p_from: from, p_to: to });
      if (error) throw new Error(`schedule: ${error.message}`);
      return data;
    },
  };
}
