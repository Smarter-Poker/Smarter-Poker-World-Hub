/**
 * Destination adapters. Gate 3 (I-1): written but DISABLED. They hold no
 * credentials; every call refuses unless the destination row is enabled and
 * connected (Gate 4) and a token is supplied from Supabase Vault at that time.
 *
 * Contract: submit(post, ctx) -> { remote_id }; status(post, ctx) -> { found, remote_id?, remote_url?, account_ref?, published_at? };
 * proof(post, ctx) -> same shape as status. Errors carry code TOKEN_REVOKED, TIMEOUT, AMBIGUOUS or RATE_LIMIT.
 */
const GRAPH = 'https://graph.facebook.com/v25.0';

function refuse(dest) {
  const e = new Error(`DESTINATION_DISABLED: ${dest} needs Gate 4 approval and a connected account`);
  e.code = 'DESTINATION_DISABLED';
  return e;
}

function guard(dest, ctx) {
  if (!ctx?.dest?.enabled || ctx.dest.connection_state !== 'connected' || !ctx.token) throw refuse(dest);
}

async function call(url, init, timeoutMs = 30000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 || body?.error?.code === 190) { const e = new Error('token rejected'); e.code = 'TOKEN_REVOKED'; throw e; }
    if (res.status === 429 || body?.error?.code === 4 || body?.error?.code === 32) { const e = new Error('rate limited'); e.code = 'RATE_LIMIT'; throw e; }
    if (!res.ok) { const e = new Error(body?.error?.message || `HTTP ${res.status}`); e.code = 'HTTP'; throw e; }
    return body;
  } catch (err) {
    if (err.name === 'AbortError') { const e = new Error('request timed out after a possible upload'); e.code = 'TIMEOUT'; throw e; }
    throw err;
  } finally { clearTimeout(timer); }
}

const videoOf = (ctx) => ctx.renders.find((r) => r.kind === 'video_9x16');

/** Internal feed: one social_posts row by the Smarter.Poker Official account, publication_key = idempotency key. */
export const internalFeed = {
  async submit(post, ctx) {
    guard('internal_feed', { ...ctx, token: true });
    const { data, error } = await ctx.supabase.from('social_posts').insert({
      author_id: ctx.officialAccountId, content: ctx.edition.caption, content_type: 'video',
      media_urls: [ctx.mediaUrl], visibility: 'public', publication_key: post.idempotency_key, ai_label: false,
    }).select('id').single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code === '23505' ? 'AMBIGUOUS' : 'HTTP' });
    return { remote_id: data.id };
  },
  async status(post, ctx) {
    const { data } = await ctx.supabase.from('social_posts').select('id, created_at').eq('publication_key', post.idempotency_key).maybeSingle();
    return data ? { found: true, remote_id: data.id, remote_url: `https://smarter.poker/hub/social?post=${data.id}`, account_ref: 'smarterpoker', published_at: data.created_at } : { found: false };
  },
  async proof(post, ctx) { return this.status(post, ctx); },
};

/** Facebook Page Reels: start, upload by URL, finish with PUBLISHED; proof from the video's status. */
export const facebook = {
  async submit(post, ctx) {
    guard('facebook', ctx);
    const page = ctx.dest.account_ref;
    const start = await call(`${GRAPH}/${page}/video_reels?upload_phase=start&access_token=${ctx.token}`, { method: 'POST' });
    await call(`https://rupload.facebook.com/video-upload/v25.0/${start.video_id}`, { method: 'POST', headers: { Authorization: `OAuth ${ctx.token}`, file_url: ctx.mediaUrl } }, 120000);
    await call(`${GRAPH}/${page}/video_reels?upload_phase=finish&video_id=${start.video_id}&video_state=PUBLISHED&description=${encodeURIComponent(ctx.edition.caption)}&access_token=${ctx.token}`, { method: 'POST' });
    return { remote_id: start.video_id };
  },
  async status(post, ctx) {
    guard('facebook', ctx);
    if (!post.remote_id) return { found: false };
    const s = await call(`${GRAPH}/${post.remote_id}?fields=status,permalink_url,created_time&access_token=${ctx.token}`, { method: 'GET' });
    const live = s?.status?.publishing_phase?.status === 'complete' || s?.status?.video_status === 'ready';
    return live ? { found: true, remote_id: post.remote_id, remote_url: s.permalink_url ? `https://www.facebook.com${s.permalink_url}` : null, account_ref: ctx.dest.account_ref, published_at: s.created_time } : { found: false, phase: s?.status };
  },
  async proof(post, ctx) { return this.status(post, ctx); },
};

/** Instagram Reels: container (media_type REELS, public video_url), wait FINISHED, media_publish; proof = PUBLISHED + media id. */
export const instagram = {
  async submit(post, ctx) {
    guard('instagram', ctx);
    const ig = ctx.dest.account_ref;
    const c = await call(`${GRAPH}/${ig}/media?media_type=REELS&video_url=${encodeURIComponent(ctx.mediaUrl)}&caption=${encodeURIComponent(ctx.edition.caption)}&access_token=${ctx.token}`, { method: 'POST' });
    for (let i = 0; i < 30; i += 1) {
      const st = await call(`${GRAPH}/${c.id}?fields=status_code&access_token=${ctx.token}`, { method: 'GET' });
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw Object.assign(new Error(`container ${st.status_code}`), { code: 'HTTP' });
      await new Promise((r) => setTimeout(r, 5000));
    }
    const pub = await call(`${GRAPH}/${ig}/media_publish?creation_id=${c.id}&access_token=${ctx.token}`, { method: 'POST' });
    return { remote_id: pub.id, container_id: c.id };
  },
  async status(post, ctx) {
    guard('instagram', ctx);
    if (!post.remote_id) return { found: false };
    const m = await call(`${GRAPH}/${post.remote_id}?fields=permalink,timestamp&access_token=${ctx.token}`, { method: 'GET' });
    return m?.permalink ? { found: true, remote_id: post.remote_id, remote_url: m.permalink, account_ref: ctx.dest.account_ref, published_at: m.timestamp } : { found: false };
  },
  async proof(post, ctx) { return this.status(post, ctx); },
};

/** YouTube Shorts: videos.insert (resumable), proof = returned video id + processing status. */
export const youtube = {
  async submit(post, ctx) {
    guard('youtube', ctx);
    const meta = { snippet: { title: ctx.edition.headline.slice(0, 100), description: ctx.edition.caption, categoryId: '20' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST', headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'video/mp4' }, body: JSON.stringify(meta) });
    if (init.status === 401) throw Object.assign(new Error('token rejected'), { code: 'TOKEN_REVOKED' });
    const loc = init.headers.get('location');
    const video = await ctx.readVideo(videoOf(ctx));
    const up = await call(loc, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: video }, 300000);
    return { remote_id: up.id };
  },
  async status(post, ctx) {
    guard('youtube', ctx);
    if (!post.remote_id) return { found: false };
    const r = await call(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${post.remote_id}`, { method: 'GET', headers: { Authorization: `Bearer ${ctx.token}` } });
    const v = r.items?.[0];
    return v ? { found: true, remote_id: post.remote_id, remote_url: `https://www.youtube.com/shorts/${post.remote_id}`, account_ref: ctx.dest.account_ref, published_at: v.snippet?.publishedAt } : { found: false };
  },
  async proof(post, ctx) { return this.status(post, ctx); },
};

export const REAL_ADAPTERS = { internal_feed: internalFeed, facebook, instagram, youtube };

/**
 * Simulated adapter for acceptance tests 10 to 16 (no network). Behaviour is
 * scripted per call: 'ok', 'timeout_after_upload', 'revoked'.
 */
export function simulatedAdapter(script = []) {
  const remote = new Map();
  let n = 0;
  const api = {
    calls: { submit: 0, status: 0, proof: 0 },
    async submit(post) {
      api.calls.submit += 1;
      const step = script.shift() || 'ok';
      if (step === 'revoked') throw Object.assign(new Error('token rejected'), { code: 'TOKEN_REVOKED' });
      const id = `sim-${++n}`;
      remote.set(post.idempotency_key, { id, at: new Date().toISOString() });
      if (step === 'timeout_after_upload') throw Object.assign(new Error('timed out after upload'), { code: 'TIMEOUT' });
      return { remote_id: id };
    },
    async status(post) {
      api.calls.status += 1;
      const r = remote.get(post.idempotency_key);
      return r ? { found: true, remote_id: r.id, remote_url: `https://example.test/${r.id}`, account_ref: 'sim', published_at: r.at } : { found: false };
    },
    async proof(post) { api.calls.proof += 1; return api.status(post); },
    remoteCount() { return remote.size; },
  };
  return api;
}
