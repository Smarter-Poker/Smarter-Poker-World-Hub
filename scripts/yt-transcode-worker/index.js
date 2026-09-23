/**
 * SMARTER POKER — YouTube → Native MP4 Worker (Operation TikTok Reels M1b)
 * scripts/yt-transcode-worker/index.js
 *
 * Standalone worker that runs alongside the existing HEVC transcode worker
 * (scripts/transcode-worker/index.js → sp-transcode.service) on the same
 * Hetzner box. Separate process, separate systemd unit (sp-yt-transcode.service),
 * separate concerns:
 *
 *   - HEVC worker (sp-transcode.service):   user iPhone uploads → H.264 MP4
 *     Polls social_posts.transcode_status='queued'.
 *
 *   - YouTube worker (sp-yt-transcode.service, THIS FILE):
 *     YouTube URLs in social_reels → native Supabase-hosted H.264 MP4.
 *     Polls video_transcode_jobs WHERE source_type='youtube' AND status='queued'.
 *     Requires yt-dlp + python3 (not installable on Vercel serverless,
 *     hence Hetzner-exclusive).
 *
 * Why separate processes?
 *   1. Blast-radius isolation. If yt-dlp segfaults on a malformed video, only
 *      the YouTube pipeline goes down. HEVC user uploads keep flowing.
 *   2. Independent deploys. Bumping yt-dlp doesn't require restarting the
 *      HEVC pipeline (and vice versa).
 *   3. Independent log streams (journalctl -u sp-yt-transcode).
 *   4. Independent concurrency tuning (HEVC is single-job, YT runs 3 in
 *      parallel because downloads are slow + bandwidth-bound).
 *
 * Pipeline:
 *   1. Atomically claim oldest queued YouTube job (UPDATE WHERE status='queued')
 *   2. yt-dlp downloads at <=1080p, MP4 container preferred
 *   3. ffmpeg re-encodes to libx264 main + AAC + faststart (web-safe, matches
 *      the cron transcoder's output for visual parity)
 *   4. Upload to a claim-scoped social-media object path
 *   5. social_reels.video_url ← public Supabase URL
 *      social_reels.source_type ← 'native'
 *      social_reels.media_status ← 'ready'
 *      video_transcode_jobs.status ← 'completed'
 *
 * On failure: transient errors leave the explicit native request in place for
 * bounded recovery. Terminal conversion errors retire that request and keep the
 * existing YouTube embed; trusted access verdicts own availability fallback.
 *
 * Required env (loaded from /etc/sp-yt-transcode.env on Hetzner):
 *   SUPABASE_SERVICE_ROLE_KEY  — required
 *   NEXT_PUBLIC_SUPABASE_URL   — required, exact project origin
 *   WORKER_ID                  — optional, defaults to hostname
 *   MAX_CONCURRENT_YT          — optional, defaults to 3
 *
 * Required runtime components:
 *   ffmpeg    (apt install ffmpeg)
 *   python3   (apt install python3)
 *   yt-dlp    (pinned into this release's vendor/ directory by deployment)
 *   Node.js >= 18
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { mkdtemp, rm, readFile, stat, access } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[yt-worker] FATAL: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
try {
  const parsedSupabaseUrl = new URL(SUPABASE_URL);
  if (
    parsedSupabaseUrl.protocol !== 'https:'
    || parsedSupabaseUrl.username
    || parsedSupabaseUrl.password
    || parsedSupabaseUrl.port
    || (parsedSupabaseUrl.pathname && parsedSupabaseUrl.pathname !== '/')
    || parsedSupabaseUrl.search
    || parsedSupabaseUrl.hash
  ) {
    throw new Error('invalid Supabase origin');
  }
} catch (_) {
  console.error('[yt-worker] FATAL: Supabase URL must be a credential-free HTTPS origin');
  process.exit(1);
}

const DATABASE_REQUEST_TIMEOUT_MS = 20_000;
const CONTROL_REQUEST_TIMEOUT_MS = 4_000;
const STORAGE_UPLOAD_TIMEOUT_MS = 10 * 60_000;
const activeStorageUploadControllers = new Set();

function fetchWithDeadline(input, init = {}) {
  const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
  const method = String(init.method || input?.method || 'GET').toUpperCase();
  const isStorageUpload = requestUrl.includes('/storage/v1/object/')
    && ['POST', 'PUT', 'PATCH'].includes(method);
  const isControlRequest = requestUrl.includes('/rest/v1/video_reels_pipeline_controls');
  const timeoutMs = isStorageUpload
    ? STORAGE_UPLOAD_TIMEOUT_MS
    : (isControlRequest ? CONTROL_REQUEST_TIMEOUT_MS : DATABASE_REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  const upstreamSignal = init.signal || input?.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error(`request_timeout_${timeoutMs}ms`)),
    timeoutMs,
  );
  timer.unref?.();
  if (isStorageUpload) activeStorageUploadControllers.add(controller);

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    activeStorageUploadControllers.delete(controller);
  });
}

function abortActiveStorageUploads(reason = 'native_control_not_enabled') {
  for (const controller of activeStorageUploadControllers) {
    controller.abort(new Error(reason));
  }
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchWithDeadline },
});

const POLL_MS = 60_000;                  // Idle poll interval
const FAST_POLL_MS = 5_000;              // When jobs are flowing, poll faster
const STORAGE_BUCKET = 'social-media';
const WORKER_ID = process.env.WORKER_ID || `hetzner-${hostname()}`;
if (!/^[A-Za-z0-9._:-]{1,80}$/.test(WORKER_ID)) {
  console.error('[yt-worker] FATAL: WORKER_ID must use 1-80 safe identifier characters');
  process.exit(1);
}
const MAX_CONCURRENT_YT = Number(process.env.MAX_CONCURRENT_YT || 3);
if (!Number.isInteger(MAX_CONCURRENT_YT) || MAX_CONCURRENT_YT < 1 || MAX_CONCURRENT_YT > 6) {
  console.error('[yt-worker] FATAL: MAX_CONCURRENT_YT must be an integer from 1 through 6');
  process.exit(1);
}
// 2026-08-15: raised 300s -> 900s as a direct consequence of the
// player_client fix below. The old budget was sized for the 360p muxed
// file that was previously the ONLY format on offer (~14 MB). Now that
// yt-dlp sees the real ladder we pull a 1080p video+audio pair, which is
// several times larger, and on a box that sits at load ~18 the 5-minute
// budget started expiring mid-download: 19 jobs failed as
// 'yt-dlp_timeout_300s' in the first hour after the fix. The download is
// still bounded (--max-filesize 400m, --match-filter duration < 600).
const YT_DOWNLOAD_TIMEOUT = 900_000;     // 15 min per yt-dlp call
const FFMPEG_TIMEOUT = 600_000;          // 10 min per re-encode
const MAX_FILE_SIZE = 500_000_000;       // 500 MB hard cap
const LEASE_HEARTBEAT_MS = 60_000;
const CONTROL_WATCH_MS = 5_000;
const STALE_LEASE_MS = 35 * 60_000;
const MAX_TRANSIENT_ATTEMPTS = 5;
const WORKER_ROOT = dirname(fileURLToPath(import.meta.url));
const VENDORED_YT_DLP_ROOT = join(WORKER_ROOT, 'vendor');
const PINNED_YT_DLP_VERSION_FILE = join(WORKER_ROOT, 'yt-dlp.version');

// Native copies of YouTube material are an exception, not the default.  The
// database migration also enforces this for new rows, but the worker must not
// trust an old queue row, a maintenance sweep, or a service-role caller to
// have done the right thing.  Every path that can reach yt-dlp re-checks both
// the queued authorization and the linked Reel's current, explicit request.
const NATIVE_PROCESSING_RIGHTS = ['owned', 'licensed'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasNativeProcessingRights = (rightsStatus) =>
  NATIVE_PROCESSING_RIGHTS.includes(rightsStatus);

function extractYouTubeVideoId(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    return null;
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  let candidate = null;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (parsed.pathname === '/watch') candidate = parsed.searchParams.get('v');
    else {
      const match = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/)?$/);
      candidate = match?.[1] || null;
    }
  } else if (host === 'youtu.be') {
    candidate = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})(?:\/)?$/)?.[1] || null;
  } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    candidate = parsed.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})(?:\/)?$/)?.[1] || null;
  }
  return /^[A-Za-z0-9_-]{11}$/.test(candidate || '') ? candidate : null;
}

const canonicalYouTubeUrl = (videoId) =>
  `https://www.youtube.com/watch?v=${videoId}`;

function isNativeProcessingAuthorized(job, reel) {
  const jobYoutubeId = extractYouTubeVideoId(job?.youtube_url);
  return Boolean(
    UUID_RE.test(job?.id || '') &&
    UUID_RE.test(job?.reel_id || '') &&
    reel &&
    reel.id === job.reel_id &&
    UUID_RE.test(job.user_id || '') &&
    UUID_RE.test(reel.author_id || '') &&
    UUID_RE.test(reel.source_post_id || '') &&
    (!job.source_asset_id || UUID_RE.test(job.source_asset_id)) &&
    (!reel.source_asset_id || UUID_RE.test(reel.source_asset_id)) &&
    !reel.is_deleted &&
    reel.native_processing_requested === true &&
    hasNativeProcessingRights(job.rights_status) &&
    hasNativeProcessingRights(reel.rights_status) &&
    job.rights_status === reel.rights_status &&
    job.user_id === reel.author_id &&
    job.source_type === 'youtube' &&
    reel.source_type === 'youtube' &&
    reel.origin_type !== 'video_library' &&
    job.origin_type === reel.origin_type &&
    (job.source_asset_id || null) === (reel.source_asset_id || null) &&
    jobYoutubeId &&
    extractYouTubeVideoId(job.source_url) === jobYoutubeId &&
    extractYouTubeVideoId(reel.video_url) === jobYoutubeId &&
    extractYouTubeVideoId(reel.original_youtube_url) === jobYoutubeId &&
    reel.youtube_video_id === jobYoutubeId &&
    job.canonical_asset_key === `youtube:${jobYoutubeId}` &&
    reel.canonical_asset_key === `youtube:${jobYoutubeId}`
  );
}

async function loadNativeTranscodeControl() {
  const { data, error } = await supa
    .from('video_reels_pipeline_controls')
    .select('control_key, enabled, reason, updated_at')
    .eq('control_key', 'youtube_native_transcode')
    .maybeSingle();
  if (error) {
    warn('native-transcode control lookup failed:', error.message);
    return { state: 'indeterminate', reason: 'native_control_lookup_failed', error };
  }
  if (!data) {
    return { state: 'indeterminate', reason: 'native_control_missing' };
  }
  if (data.enabled !== true) {
    return { state: 'denied', reason: 'native_control_disabled' };
  }
  return { state: 'enabled' };
}

let activeJobs = 0;
let shutdownRequested = false;

// ─── Logging ─────────────────────────────────────────────────────────────────
const log = (...args) => console.log(`[yt-worker ${new Date().toISOString()}]`, ...args);
const warn = (...args) => console.warn(`[yt-worker ${new Date().toISOString()}]`, ...args);

const JOB_IDENTITY_FIELDS = [
  'id', 'reel_id', 'user_id', 'youtube_url', 'source_url', 'source_type',
  'rights_status', 'origin_type', 'source_asset_id', 'canonical_asset_key',
  'claim_token', 'worker_id', 'locked_at', 'heartbeat_at', 'attempts',
].join(', ');

const REEL_IDENTITY_FIELDS = [
  'id', 'author_id', 'rights_status', 'native_processing_requested',
  'is_deleted', 'source_type', 'origin_type', 'source_asset_id',
  'canonical_asset_key', 'youtube_video_id', 'video_url',
  'original_youtube_url', 'source_post_id',
].join(', ');

const POST_ACK_FIELDS = [
  'id', 'author_id', 'media_urls', 'playback_type', 'is_deleted',
  'canonical_asset_key', 'rights_status',
].join(', ');

async function verifyBundledRuntime() {
  await Promise.all([
    access('/usr/bin/python3', fsConstants.X_OK),
    access('/usr/bin/ffmpeg', fsConstants.X_OK),
    access(join(VENDORED_YT_DLP_ROOT, 'yt_dlp', '__main__.py'), fsConstants.R_OK),
  ]);
  const pinnedVersion = (await readFile(PINNED_YT_DLP_VERSION_FILE, 'utf8')).trim();
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(pinnedVersion)) {
    throw new Error('yt_dlp_version_pin_invalid');
  }
  const versionSource = await readFile(
    join(VENDORED_YT_DLP_ROOT, 'yt_dlp', 'version.py'),
    'utf8',
  );
  const installedVersion = versionSource.match(
    /^__version__\s*=\s*['"]([^'"]+)['"]/m,
  )?.[1];
  if (installedVersion !== pinnedVersion) {
    throw new Error(`yt_dlp_version_mismatch:${installedVersion || 'missing'}:${pinnedVersion}`);
  }
}

async function runStartupPreflight() {
  await verifyBundledRuntime();
  const [jobSchema, reelSchema, postSchema, verdictSchema] = await Promise.all([
    supa.from('video_transcode_jobs').select(JOB_IDENTITY_FIELDS).limit(1),
    supa.from('social_reels').select(REEL_IDENTITY_FIELDS).limit(1),
    supa.from('social_posts').select(POST_ACK_FIELDS).limit(1),
    supa.from('youtube_embed_failures')
      .select('video_id,verification_status,resolved,last_verified_at')
      .limit(1),
  ]);
  if (jobSchema.error) {
    throw new Error(`job_schema_preflight_failed:${jobSchema.error.message}`);
  }
  if (reelSchema.error) {
    throw new Error(`reel_schema_preflight_failed:${reelSchema.error.message}`);
  }
  if (postSchema.error) {
    throw new Error(`post_schema_preflight_failed:${postSchema.error.message}`);
  }
  if (verdictSchema.error) {
    throw new Error(`verdict_schema_preflight_failed:${verdictSchema.error.message}`);
  }

  const control = await loadNativeTranscodeControl();
  if (control.state === 'indeterminate') {
    throw new Error(`native_control_preflight_failed:${control.reason}`);
  }

  // Exercise PostgREST's exact function signature without touching a row. The
  // RPC validates this deliberately malformed text id before any SELECT/UPDATE
  // and must answer with SQLSTATE 22023. A missing/stale signature instead
  // returns a different PostgREST/SQL error and keeps the service from starting.
  const { error: rpcProbeError } = await supa.rpc(
    'complete_rights_cleared_youtube_transcode',
    {
      p_job_id: 'schema-preflight',
      p_claim_token: randomUUID(),
      p_worker_id: WORKER_ID,
      p_output_url: 'https://invalid.example/schema-preflight.mp4',
      p_thumbnail_url: null,
    },
  );
  if (!rpcProbeError || String(rpcProbeError.code || '') !== '22023') {
    throw new Error(
      `completion_rpc_preflight_failed:${rpcProbeError?.code || 'unexpected_success'}:${rpcProbeError?.message || 'no_error'}`
    );
  }

  // Probe the control/claim branch with a syntactically valid but nonexistent
  // job. This is read-only, yet distinguishes the current kill-switch-aware RPC
  // from an older same-signature implementation that would pass the shape probe.
  const { error: behaviorProbeError } = await supa.rpc(
    'complete_rights_cleared_youtube_transcode',
    {
      p_job_id: randomUUID(),
      p_claim_token: randomUUID(),
      p_worker_id: WORKER_ID,
      p_output_url: 'https://invalid.example/schema-preflight.mp4',
      p_thumbnail_url: null,
    },
  );
  const expectedBehaviorCode = control.state === 'enabled' ? '40001' : '55000';
  if (String(behaviorProbeError?.code || '') !== expectedBehaviorCode) {
    throw new Error(
      `completion_rpc_behavior_preflight_failed:${behaviorProbeError?.code || 'unexpected_success'}:${behaviorProbeError?.message || 'no_error'}`
    );
  }

  const { error: verdictProbeError } = await supa.rpc(
    'record_youtube_embed_failure_verdict',
    {
      p_video_id: 'schema-preflight',
      p_verdict: 'error',
      p_error_code: null,
      p_surface: 'yt_transcode_worker_preflight',
      p_verification_started_at: null,
    },
  );
  if (String(verdictProbeError?.code || '') !== '22023') {
    throw new Error(
      `verdict_rpc_preflight_failed:${verdictProbeError?.code || 'unexpected_success'}:${verdictProbeError?.message || 'no_error'}`
    );
  }

  return control;
}

async function loadNativeAuthorization(job) {
  if (!job?.reel_id || !hasNativeProcessingRights(job.rights_status)) {
    return { state: 'denied', reason: 'job_rights_or_reel_missing' };
  }

  const control = await loadNativeTranscodeControl();
  if (control.state !== 'enabled') return control;

  const { data: reel, error } = await supa
    .from('social_reels')
    .select(REEL_IDENTITY_FIELDS)
    .eq('id', job.reel_id)
    .maybeSingle();

  if (error) {
    warn(`rights lookup failed for job ${job.id}:`, error.message);
    return { state: 'indeterminate', reason: 'reel_lookup_failed', error };
  }
  if (!isNativeProcessingAuthorized(job, reel)) {
    return { state: 'denied', reason: 'job_reel_identity_or_rights_mismatch', reel };
  }
  return {
    state: 'authorized',
    reel,
    youtubeId: reel.youtube_video_id,
    sourceUrl: canonicalYouTubeUrl(reel.youtube_video_id),
  };
}

function applyClaimScope(query, job) {
  let scoped = query.eq('id', job.id);
  if (job.claim_token) scoped = scoped.eq('claim_token', job.claim_token);
  if (job.worker_id) scoped = scoped.eq('worker_id', job.worker_id);
  return scoped;
}

const DEFINITIVE_COMPLETION_ERROR_CODES = new Set([
  '22023', '23503', '23514', '40001', '42501', '55000',
]);

function isDefinitiveCompletionRejection(error) {
  const code = String(error?.code || '');
  return DEFINITIVE_COMPLETION_ERROR_CODES.has(code);
}

function normalizeCompletionUrl(value) {
  return String(value || '').trim().split(/[?#]/, 1)[0];
}

async function reconcileCompletionAck(job, outputUrl) {
  const { data: persistedJob, error: jobError } = await supa
    .from('video_transcode_jobs')
    .select('id,reel_id,status,claim_token,worker_id,output_url')
    .eq('id', job.id)
    .maybeSingle();
  if (jobError) return { state: 'indeterminate', error: jobError };
  if (!persistedJob) return { state: 'rejected', reason: 'job_missing' };

  const exactClaim = persistedJob.claim_token === job.claim_token
    && persistedJob.worker_id === WORKER_ID;
  if (
    persistedJob.status === 'processing'
    && exactClaim
  ) return { state: 'pending' };
  if (
    persistedJob.status === 'completed'
    && exactClaim
    && normalizeCompletionUrl(persistedJob.output_url) === normalizeCompletionUrl(outputUrl)
    && persistedJob.reel_id === job.reel_id
  ) {
    // The completed exact-claim job is the durable commit record. Reel/Post
    // state is mutable after publication; using it to reject an ACK could make
    // a stale worker delete the object belonging to a successful publication.
    return { state: 'committed' };
  }

  return { state: 'rejected', reason: 'job_state_mismatch' };
}

async function releaseClaimForRetry(job, reason) {
  let query = supa.from('video_transcode_jobs').update({
    status: 'queued',
    worker_id: null,
    claim_token: null,
    locked_at: null,
    heartbeat_at: new Date().toISOString(),
    error_message: `retry:${reason}`,
  }).eq('status', 'processing');
  query = applyClaimScope(query, job);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) warn(`could not release claim for job ${job.id}:`, error.message);
  return Boolean(!error && data?.id === job.id);
}

async function cancelUnauthorizedJob(job, stage) {
  const message = `native_processing_not_authorized:${stage}`;
  let cancelQuery = supa
    .from('video_transcode_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error_message: message,
      worker_id: null,
      claim_token: null,
      locked_at: null,
      heartbeat_at: new Date().toISOString(),
    })
    .in('status', ['queued', 'processing', 'running']);
  cancelQuery = applyClaimScope(cancelQuery, job);
  const { data: cancelledJob, error } = await cancelQuery
    .select('id')
    .maybeSingle();
  if (error) {
    warn(`could not cancel unauthorized job ${job.id}:`, error.message);
    return false;
  }
  if (!cancelledJob || cancelledJob.id !== job.id) {
    warn(`did not cancel stale/lost job claim ${job.id}; linked Reel was left untouched`);
    return false;
  }

  // Reel authorization/visibility belongs to the database trigger and trusted
  // verifier. A worker-side follow-up write would race a concurrent grant or
  // revocation after this exact job was cancelled.
  warn(`cancelled unauthorized YouTube native-processing job ${job.id} (${stage})`);
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// Terminal conversion patterns. These cannot be fixed by retrying the same
// native pipeline, so the exact Reel request is retired and its embed retained.
// Infrastructure exits/timeouts are deliberately absent and use bounded cron
// recovery instead.
//
// 2026-05-07 incident: 187 jobs stacked in 'processing' state with 0
// completing or failing in 10 min. Diagnosis: worker had been up 24h+
// since the 2026-05-06 12:52 deploy and accumulated orphaned 'processing'
// rows from prior restarts (each restart claimed MAX_CONCURRENT_YT=6
// jobs, crashed before finishing them, jobs stayed in DB processing state).
// resetStaleProcessing's then-10-minute threshold should have cleaned them up
// but the poll loop itself was likely stuck on a hung subprocess.
//
// Fix: trigger a fresh deploy to force `systemctl restart sp-yt-transcode`,
// which calls resetStaleProcessing('worker_startup') and clears the
// stuck 'processing' rows back to 'queued' before resuming normal claims.
// ════════════════════════════════════════════════════════════════════════════
const PERMANENT_PATTERNS = [
  /Video unavailable/i,
  /This video is private/i,
  /This video has been removed/i,
  /removed by the uploader/i,
  /This live event will begin/i,
  /age-restricted/i,
  /members-only/i,
  /copyright claim/i,
  /available to this channel's members/i,           // YouTube channel members-only (different msg from /members-only/)
  /Use --cookies-from-browser or --cookies/i,       // cookie auth required (datacenter IP blocked)
  /from-browser or --cookies for the authentication/i, // alternate phrasing
  /not available in your country/i,                 // region-blocked
  /use a VPN or a proxy server/i,                   // alternate region-block phrasing
  /Sign in to confirm/i,                            // YouTube anti-bot challenge
  /filtered_too_long_or_large/i,                    // yt-dlp --match-filter rejected (>10min or >400MB) — fundamentally unconvertible by this pipeline
  /raw_too_large_/i,
  /output_too_large_/i,
];
const isPermanentFailure = (msg) => PERMANENT_PATTERNS.some((rx) => rx.test(msg));
const ACCESS_RESTRICTED_PATTERNS = [
  /Video unavailable/i,
  /This video is private/i,
  /This video has been removed/i,
  /removed by the uploader/i,
  /age-restricted/i,
  /members-only/i,
  /available to this channel's members/i,
  /not available in your country/i,
  /use a VPN or a proxy server/i,
];
const isAccessRestrictedFailure = (msg) =>
  ACCESS_RESTRICTED_PATTERNS.some((rx) => rx.test(msg));

// ════════════════════════════════════════════════════════════════════════════
// Atomic claim — UPDATE only succeeds if status is still 'queued', so two
// workers can't race on the same job. Returns the claimed row, or null if
// another worker grabbed it (or queue is empty).
// ════════════════════════════════════════════════════════════════════════════
async function claimJob() {
  const { data: candidates, error } = await supa
    .from('video_transcode_jobs')
    .select(JOB_IDENTITY_FIELDS)
    .eq('status', 'queued')
    .eq('source_type', 'youtube')
    .order('created_at', { ascending: true })
    // A bounded batch lets us actively retire legacy/invalid queue rows
    // instead of letting the oldest bad row starve all eligible work.
    .limit(25);

  if (error) { warn('poll error:', error.message); return null; }
  if (!candidates || candidates.length === 0) return null;

  for (const candidate of candidates) {
    const authorization = await loadNativeAuthorization(candidate);
    if (authorization.state === 'indeterminate') {
      continue;
    }
    if (authorization.state === 'denied') {
      await cancelUnauthorizedJob(candidate, `claim:${authorization.reason}`);
      continue;
    }

    const claimToken = randomUUID();
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supa
      .from('video_transcode_jobs')
      .update({
        status: 'processing',
        worker_id: WORKER_ID,
        claim_token: claimToken,
        started_at: claimedAt,
        locked_at: claimedAt,
        heartbeat_at: claimedAt,
      })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .select(JOB_IDENTITY_FIELDS)
      .maybeSingle();

    if (claimErr) { warn('claim error:', claimErr.message); continue; }
    if (claimed) return claimed;
  }
  return null;
}

async function renewJobLease(job) {
  const now = new Date().toISOString();
  let query = supa.from('video_transcode_jobs')
    .update({ locked_at: now, heartbeat_at: now })
    .eq('status', 'processing');
  query = applyClaimScope(query, job);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) return { state: 'indeterminate', error };
  if (!data) return { state: 'lost' };
  return { state: 'renewed' };
}

async function revalidateClaimForSideEffect(job, stage) {
  const lease = await renewJobLease(job);
  if (lease.state !== 'renewed') {
    const error = new Error(`transcode_lease_${lease.state}:${stage}`);
    error.interruptionState = lease.state;
    throw error;
  }
  const authorization = await loadNativeAuthorization(job);
  if (authorization.state === 'indeterminate') {
    const error = new Error(`authorization_recheck_indeterminate:${stage}`);
    error.interruptionState = 'indeterminate';
    throw error;
  }
  if (authorization.state === 'denied') {
    const disabled = authorization.reason === 'native_control_disabled';
    const error = new Error(
      `${disabled ? 'native_control_disabled' : 'authorization_revoked'}:${stage}:${authorization.reason}`
    );
    error.interruptionState = disabled ? 'disabled' : 'denied';
    throw error;
  }
  return authorization;
}

// ════════════════════════════════════════════════════════════════════════════
// Process one job: download → re-encode → upload → DB update
// ════════════════════════════════════════════════════════════════════════════
async function processJob(job) {
  // Defense in depth against rights changing between the queue claim and the
  // worker slot becoming available.  This is intentionally before mkdtemp and
  // before the first yt-dlp invocation: unauthorized URLs are never fetched.
  const initialAuthorization = await loadNativeAuthorization(job);
  if (initialAuthorization.state === 'indeterminate') {
    await releaseClaimForRetry(job, initialAuthorization.reason);
    return;
  }
  if (initialAuthorization.state === 'denied') {
    await cancelUnauthorizedJob(job, `before_download:${initialAuthorization.reason}`);
    return;
  }

  // Never pass a queue-controlled URL spelling to yt-dlp. Authorization above
  // proves one exact ID across job and Reel; this canonical URL is derived
  // locally from that identity.
  const ytUrl = initialAuthorization.sourceUrl;
  const dir = await mkdtemp(join(tmpdir(), `yt-${job.id}-`));
  const rawFile = join(dir, 'raw.mp4');
  const outFile = join(dir, 'out.mp4');
  // Never disclose Supabase credentials to yt-dlp, its JavaScript runtime, or
  // ffmpeg. A job-private HOME plus ignored configs/plugins also prevents a
  // retired cookie/POT installation on the host from changing this release.
  const isolatedSubprocessEnv = {
    HOME: dir,
    TMPDIR: dir,
    PATH: '/usr/bin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  };
  let leaseState = 'renewed';
  let heartbeatInFlight = false;
  let controlCheckInFlight = false;
  let storagePath = null;
  let thumbPath = null;
  let publicUrl = null;
  let publicationCommitted = false;
  let completionAttempted = false;
  let completionAckAmbiguous = false;
  let completionRejected = false;
  let completionErrorCode = null;
  const controlTimer = setInterval(() => {
    if (controlCheckInFlight || leaseState !== 'renewed') return;
    controlCheckInFlight = true;
    loadNativeTranscodeControl()
      .then((control) => {
        if (control.state !== 'enabled') {
          leaseState = control.reason === 'native_control_disabled' ? 'disabled' : 'indeterminate';
          abortActiveStorageUploads(`native_transcode_${leaseState}`);
        }
      })
      .catch(() => {
        leaseState = 'indeterminate';
        abortActiveStorageUploads('native_transcode_control_indeterminate');
      })
      .finally(() => { controlCheckInFlight = false; });
  }, CONTROL_WATCH_MS);
  controlTimer.unref?.();

  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    if (leaseState !== 'renewed') {
      heartbeatInFlight = false;
      return;
    }
    renewJobLease(job)
      .then((result) => { leaseState = result.state; })
      .catch(() => { leaseState = 'indeterminate'; })
      .finally(() => { heartbeatInFlight = false; });
  }, LEASE_HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  log(`▶ Job ${job.id} — ${ytUrl}`);

  try {
    // ── 1. Download via yt-dlp (<=1080p, MP4 preferred) ─────────────────────
    // QUALITY: pick the BEST overall quality up to 1080p, regardless of codec.
    //
    // Earlier version preferred avc1 (H.264) so we could stream-copy.
    // Verified 2026-05-06: that produced ~1.5 Mbps output because YouTube
    // intentionally caps its H.264 renditions at low bitrates and reserves
    // the high-quality 1080p tier for VP9/AV1 only. Stream-copy of avc1
    // therefore preserves a low-source-quality file — exactly the regression
    // we were trying to avoid.
    //
    // New strategy: take the best video+audio under 1080p (commonly VP9
    // 1080p ~ 4-5 Mbps), and rely on the HQ re-encode path below
    // (preset=slow / crf=18 / profile=high / 192k AAC) to land at
    // 5-8 Mbps H.264 for native playback. Stream-copy is still tried
    // first in the rare case yt-dlp delivered avc1+aac+mp4.
    const ytdlpArgs = [
      // 2026-08-15: added explicit 720p + muxed rungs. With the client pin
      // removed we now see the full ladder, but a few videos expose no
      // <=1080 video+audio PAIR and the old chain fell straight through to
      // 'b' (or errored 'Requested format is not available'). Stepping
      // 1080 -> 720 -> any-muxed keeps those on HD instead of dropping
      // them to whatever single format happens to exist.
      '-f',
        'bv*[height<=1080]+ba/' +
        'b[height<=1080]/' +
        'bv*[height<=720]+ba/' +
        'b[height<=720]/' +
        'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--ignore-config',
      '--no-plugin-dirs',
      '--no-cache-dir',
      '--restrict-filenames',
      '--js-runtimes', 'node:/usr/bin/node',
      '--max-filesize', '400m',          // Abort download if file > 400 MB (before re-encode)
      '--match-filter', 'duration < 600', // Skip videos longer than 10 minutes
      // Keep the default public extractor surface. The former cookie-harvester
      // and local proof-token services were retired; account-authenticated or
      // access-restricted videos fail closed instead of being scraped.
      '--extractor-args', 'youtube:player_client=default',
    ];
    ytdlpArgs.push('-o', rawFile, ytUrl);

    await runProcess(
      '/usr/bin/python3',
      ['-m', 'yt_dlp', ...ytdlpArgs],
      YT_DOWNLOAD_TIMEOUT,
      () => leaseState,
      {
        env: {
          ...isolatedSubprocessEnv,
          PYTHONPATH: VENDORED_YT_DLP_ROOT,
          PYTHONNOUSERSITE: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        label: 'yt-dlp',
      },
    );

    // --match-filter exits with code 0 but creates no file when video is filtered
    //
    // 2026-05-07 BUG FIX: previous code did .update({status:'skipped'}) here.
    // The CHECK constraint on video_transcode_jobs.status only allows
    // (queued, processing, running, completed, done, failed, cancelled) —
    // 'skipped' violates the constraint, the UPDATE silently rejects, the
    // worker returns, and the row stays in 'processing' state FOREVER.
    // resetStaleProcessing flips it back to queued after 10 min, the worker
    // re-claims it, re-skips it — infinite loop. As of this morning, 198
    // jobs were stuck in this loop with 0 forward progress in 2+ hours.
    //
    // Fix: throw an Error with a unique pattern that PERMANENT_PATTERNS
    // matches. The catch block first owns the exact job failure, then retires
    // only that still-matching native request back to its source embed.
    const rawExists = await access(rawFile).then(() => true).catch(() => false);
    if (!rawExists) {
      throw new Error('filtered_too_long_or_large: yt-dlp --match-filter rejected (duration ≥ 600s or size > 400m)');
    }

    const rawStat = await stat(rawFile);
    if (rawStat.size > MAX_FILE_SIZE) {
      throw new Error(`raw_too_large_${rawStat.size}_bytes`);
    }
    log(`  Downloaded ${(rawStat.size / 1_048_576).toFixed(1)} MB`);

    // ── 2. Always re-encode at HQ to H.264 ─────────────────────────────────
    //
    // History: prior versions tried stream-copy first to avoid double-encoding,
    // but the codec-agnostic format selector picks AV1 1080p (most efficient
    // codec). Stream-copying AV1 at YouTube's native ~0.5-0.75 Mbps gives
    // outputs that (a) are below browser playback compatibility for some
    // devices, (b) look low-res to viewers despite AV1's bitrate efficiency.
    //
    // Always re-encoding at preset=slow / crf=18 / profile=high / level=4.1
    // / 192k AAC produces ~5-8 Mbps H.264 1080p output — universally
    // browser-playable, visually high quality, and consistent regardless
    // of source codec (H.264 / VP9 / AV1).
    //
    // Cost: ~10-30s per video on Hetzner CPU. Worker concurrency 3 + 600s
    // ffmpeg timeout per job → comfortable headroom even for outliers.
    const SCALE_1080P =
      "scale='if(gt(iw,ih), min(1920,iw), -2)':'if(gt(iw,ih), -2, min(1920,ih))'";
    await runProcess('/usr/bin/ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', rawFile,
      '-vf', SCALE_1080P,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',   // 'fast' is what the box has run since it sat at load ~18 on 'slow'; the repo now says so too
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outFile,
    ], FFMPEG_TIMEOUT, () => leaseState, { env: isolatedSubprocessEnv, label: 'ffmpeg' });

    const outStat = await stat(outFile);
    if (outStat.size > MAX_FILE_SIZE) {
      throw new Error(`output_too_large_${outStat.size}_bytes`);
    }
    log(`  Re-encoded HQ → ${(outStat.size / 1_048_576).toFixed(1)} MB`);

    // Rights are mutable.  Re-attest immediately before writing a native
    // object or changing public playback, so a revoked request cannot race a
    // long download/re-encode.
    await revalidateClaimForSideEffect(job, 'before_thumbnail_extraction');

    // ── 3. Extract thumbnail (1s frame) ─────────────────────────────────────
    // Pull from rawFile (yt-dlp's pristine source) NOT outFile — avoids
    // inheriting any re-encode artifacts. Native resolution preserved
    // (caller can downscale via CSS); q:v 2 ≈ 95% jpeg quality.
    const thumbFile = join(dir, 'thumb.jpg');
    let thumbUrl = null;
    try {
      await runProcess('/usr/bin/ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', '1',
        '-i', rawFile,
        '-vframes', '1',
        '-q:v', '2',
        thumbFile,
      ], 30_000, () => leaseState, { env: isolatedSubprocessEnv, label: 'ffmpeg' });
      const thumbBuf = await readFile(thumbFile);
      await revalidateClaimForSideEffect(job, 'thumbnail_upload');
      thumbPath = `reels/thumbs/${job.user_id}/youtube-${job.id}-${job.claim_token}.jpg`;
      const { error: thumbErr } = await supa.storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, thumbBuf, { contentType: 'image/jpeg', upsert: false });
      if (thumbErr) {
        warn(`  thumbnail upload warn:`, thumbErr.message);
      } else {
        const { data: thumbPub } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(thumbPath);
        thumbUrl = thumbPub.publicUrl;
        log(`  Thumbnail → ${thumbUrl}`);
      }
    } catch (thumbEx) {
      if (thumbEx?.interruptionState) throw thumbEx;
      warn(`  thumbnail extract skipped: ${thumbEx.message}`);
    }

    // ── 4. Upload video to social-media bucket ───────────────────────────────
    storagePath = `reels/${job.user_id}/youtube-${job.id}-${job.claim_token}.mp4`;
    const fileBuf = await readFile(outFile);
    // Reading a near-limit output into memory can overlap a control change. Do
    // the side-effect guard after that read so a disabled watcher cannot be
    // followed by the start of a new upload that it did not get a chance to
    // abort. The watcher still aborts an upload if the switch changes after
    // this final pre-upload attestation.
    await revalidateClaimForSideEffect(job, 'video_upload');
    const { error: upErr } = await supa.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuf, {
        contentType: 'video/mp4',
        upsert: false,
        cacheControl: '3600',
      });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    publicUrl = pub.publicUrl;

    // ── 5. Atomically publish Reel + post + job ─────────────────────────────
    const completionAuthorization = await revalidateClaimForSideEffect(job, 'completion');
    completionAttempted = true;
    const completionResultIsExact = (rows) => Array.isArray(rows)
      && rows.length === 1
      && rows[0].transcode_job_id === job.id
      && rows[0].social_reel_id === job.reel_id
      && rows[0].social_post_id === completionAuthorization.reel.source_post_id;
    let { data: completionRows, error: completionError } = await supa.rpc(
      'complete_rights_cleared_youtube_transcode',
      {
        p_job_id: job.id,
        p_claim_token: job.claim_token,
        p_worker_id: WORKER_ID,
        p_output_url: publicUrl,
        p_thumbnail_url: thumbUrl,
      },
    );
    let completionConfirmed = completionResultIsExact(completionRows);
    if (!completionConfirmed && !isDefinitiveCompletionRejection(completionError)) {
      // A transport response can disappear after the database committed. The
      // RPC is replay-safe for this exact claim/output, so one retry is an ACK
      // reconciliation and cannot publish twice.
      const replay = await supa.rpc(
        'complete_rights_cleared_youtube_transcode',
        {
          p_job_id: job.id,
          p_claim_token: job.claim_token,
          p_worker_id: WORKER_ID,
          p_output_url: publicUrl,
          p_thumbnail_url: thumbUrl,
        },
      );
      completionRows = replay.data;
      completionError = replay.error;
      completionConfirmed = completionResultIsExact(completionRows);
    }
    if (!completionConfirmed) {
      completionErrorCode = String(completionError?.code || '') || null;
      const reconciliation = await reconcileCompletionAck(job, publicUrl);
      if (reconciliation.state === 'committed') {
        // The exact completed job is the durable commit record even if its
        // mutable Reel/Post were edited before an ACK replay reached us.
        completionConfirmed = true;
        completionError = null;
      } else if (reconciliation.state === 'rejected') {
        // Claim-token-scoped object paths make cleanup safe when another claim
        // owns the job or the database definitively rejected this attempt.
        completionRejected = true;
      } else if (
        isDefinitiveCompletionRejection(completionError)
        && reconciliation.state === 'pending'
      ) {
        completionRejected = true;
      } else {
        completionAckAmbiguous = true;
      }
    }
    if (!completionConfirmed) {
      const failure = new Error(
        `atomic_transcode_completion_failed:${completionError?.message || (completionAckAmbiguous ? 'ack_ambiguous' : 'unconfirmed_result')}`
      );
      failure.code = completionErrorCode;
      throw failure;
    }
    publicationCommitted = true;

    log(`✓ Job ${job.id} → ${publicUrl}`);

  } catch (err) {
    const msg = (err?.message || String(err)).slice(0, 500);
    warn(`✗ Job ${job.id} failed: ${msg}`);

    const permanent = isPermanentFailure(msg);
    const accessRestricted = isAccessRestrictedFailure(msg);
    const retryBudgetExhausted = Number(job.attempts || 0) >= MAX_TRANSIENT_ATTEMPTS;
    const terminal = permanent || retryBudgetExhausted;
    const objectPaths = [storagePath, thumbPath].filter(Boolean);
    const cleanupClaimObjects = async () => {
      if (!objectPaths.length) return true;
      const { error: cleanupError } = await supa.storage
        .from(STORAGE_BUCKET)
        .remove(objectPaths);
      if (cleanupError) {
        warn(`  orphan cleanup failed for job ${job.id}:`, cleanupError.message);
        return false;
      }
      return true;
    };

    if (completionAckAmbiguous) {
      const released = await releaseClaimForRetry(job, 'completion_ack_ambiguous');
      if (released) await cleanupClaimObjects();
      warn(
        `  completion ACK remains ambiguous for job ${job.id}; ` +
        (released
          ? 'the exact claim was requeued and its claim-scoped objects were retired'
          : 'claim-scoped objects were preserved for database reconciliation')
      );
      return;
    }

    const interruptionState = err?.interruptionState
      || (!completionAttempted && leaseState !== 'renewed' ? leaseState : null);
    if (interruptionState === 'disabled' || completionErrorCode === '55000') {
      await cleanupClaimObjects();
      await cancelUnauthorizedJob(job, 'native_control_disabled');
      return;
    }
    if (interruptionState === 'denied') {
      await cleanupClaimObjects();
      await cancelUnauthorizedJob(job, 'rights_or_identity_revoked');
      return;
    }
    if (interruptionState === 'indeterminate') {
      await cleanupClaimObjects();
      await releaseClaimForRetry(job, 'authorization_recheck_indeterminate');
      return;
    }
    if (interruptionState === 'lost') {
      await cleanupClaimObjects();
      warn(`  claim ${job.claim_token} is no longer current; Reel state was left untouched`);
      return;
    }

    if (!publicationCommitted && (!completionAttempted || completionRejected)) {
      await cleanupClaimObjects();
    }

    // Establish ownership of the failure before touching the linked Reel. A
    // stale worker that lost its claim must never overwrite a newer claim's
    // playback state.
    let jobFailureConfirmed = false;
    try {
      let failureQuery = supa.from('video_transcode_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
        locked_at: null,
        heartbeat_at: new Date().toISOString(),
      }).eq('status', 'processing');
      failureQuery = applyClaimScope(failureQuery, job);
      const { data: failedJob, error: failureError } = await failureQuery
        .select('id')
        .maybeSingle();
      if (failureError) throw failureError;
      jobFailureConfirmed = Boolean(failedJob?.id);
      if (!jobFailureConfirmed) {
        warn(`  Job ${job.id} failure state was not changed; claim may have moved`);
        return;
      }
    } catch (failureError) {
      warn(`  Job ${job.id} failure update failed:`, failureError?.message);
      return;
    }

    // A transient conversion failure must not touch media_status: the Reel
    // trigger treats such an update as a fresh queue request and would bypass
    // the attempts cap. A terminal failure retires only the exact current
    // request. Trusted access verdicts additionally perform their atomic
    // all-sibling fallback inside record_youtube_embed_failure_verdict.
    let terminalFallbackConfirmed = !terminal || !job.reel_id;
    if (terminal && job.reel_id) {
      try {
        const fallbackAuthorization = await loadNativeAuthorization(job);
        if (fallbackAuthorization.state !== 'authorized') {
          warn(`  Reel ${job.reel_id} terminal fallback skipped: authorization is ${fallbackAuthorization.state}`);
        } else {
          const currentReel = fallbackAuthorization.reel;
          let fallbackQuery = supa
          .from('social_reels')
          .update({
            media_status: 'ready',
            native_processing_requested: false,
          })
          .eq('id', job.reel_id)
          .eq('author_id', job.user_id)
          .eq('source_type', 'youtube')
          .eq('rights_status', job.rights_status)
          .eq('native_processing_requested', true)
          .eq('youtube_video_id', fallbackAuthorization.youtubeId)
          .eq('canonical_asset_key', job.canonical_asset_key)
          .eq('video_url', currentReel.video_url)
          .eq('original_youtube_url', currentReel.original_youtube_url)
          .eq('source_post_id', currentReel.source_post_id)
          .in('media_status', ['queued', 'processing', 'failed']);
          fallbackQuery = job.origin_type === null || job.origin_type === undefined
            ? fallbackQuery.is('origin_type', null)
            : fallbackQuery.eq('origin_type', job.origin_type);
          fallbackQuery = currentReel.is_deleted === null || currentReel.is_deleted === undefined
            ? fallbackQuery.is('is_deleted', null)
            : fallbackQuery.eq('is_deleted', currentReel.is_deleted);
          fallbackQuery = job.source_asset_id === null || job.source_asset_id === undefined
            ? fallbackQuery.is('source_asset_id', null)
            : fallbackQuery.eq('source_asset_id', job.source_asset_id);
          const { data: fallbackReel, error: fallbackError } = await fallbackQuery
            .select('id')
            .maybeSingle();
          if (fallbackError) throw fallbackError;
          terminalFallbackConfirmed = Boolean(fallbackReel?.id);
          if (!terminalFallbackConfirmed) {
            warn(`  Reel ${job.reel_id} terminal fallback lost its identity compare-and-set`);
          }
        }
      } catch (fallbackError) {
        warn(`  Reel ${job.reel_id} terminal fallback failed:`, fallbackError?.message);
      }
    }

    let verdictConfirmed = !accessRestricted;
    if (accessRestricted) {
      try {
        const { data: verdictRows, error: verdictError } = await supa.rpc('record_youtube_embed_failure_verdict', {
          p_video_id: extractYouTubeVideoId(job.youtube_url),
          p_verdict: /private|members-only|channel's members/i.test(msg) ? 'private' : 'restricted',
          p_error_code: /private|removed|unavailable/i.test(msg) ? 100 : 150,
          p_surface: 'yt_transcode_worker',
          p_verification_started_at: null,
        });
        if (verdictError) throw verdictError;
        verdictConfirmed = Array.isArray(verdictRows)
          && verdictRows.length === 1
          && verdictRows[0].verification_status === 'confirmed'
          && verdictRows[0].resolved === false;
        if (!verdictConfirmed) throw new Error('failure verdict was not confirmed');
      } catch (verdictError) {
        warn(`  YouTube failure verdict failed for job ${job.id}:`, verdictError?.message);
      }
    }

    if (accessRestricted && terminalFallbackConfirmed && verdictConfirmed && jobFailureConfirmed) {
      log(`  (access restricted — trusted verdict confirmed and canonical fallback applied)`);
    } else if (accessRestricted) {
      warn(`  access-restriction handling incomplete for job ${job.id}; reconciliation required`);
    }
    else if (terminal && terminalFallbackConfirmed) {
      log(`  (${permanent ? 'terminal conversion failure' : 'transient retry budget exhausted'} — source embed retained)`);
    }
    else if (terminal) warn(`  terminal fallback incomplete for job ${job.id}; reconciliation required`);
  } finally {
    clearInterval(controlTimer);
    clearInterval(heartbeatTimer);
    try { await rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Tick: claim up to MAX_CONCURRENT_YT jobs and dispatch in parallel.
// Fire-and-forget — does NOT await jobs to finish, lets them run concurrently.
// ════════════════════════════════════════════════════════════════════════════
async function tick() {
  if (shutdownRequested) return 0;  // No new jobs after SIGTERM
  let dispatched = 0;
  while (activeJobs < MAX_CONCURRENT_YT) {
    const job = await claimJob();
    if (!job) break;
    activeJobs++;
    dispatched++;
    processJob(job)
      .catch((e) => warn('uncaught processJob:', e?.message))
      .finally(() => { activeJobs--; });
  }
  return dispatched;
}

// ════════════════════════════════════════════════════════════════════════════
// Generic process runner — captures stderr tail in the rejected error so
// failures are diagnosable from journalctl without repro.
// ════════════════════════════════════════════════════════════════════════════
function runProcess(cmd, args, timeoutMs, shouldContinue = null, options = {}) {
  return new Promise((resolve, reject) => {
    const { label = cmd, ...spawnOptions } = options;
    const detached = process.platform !== 'win32';
    const proc = spawn(cmd, args, { ...spawnOptions, detached });
    let stderrTail = '';
    let settled = false;
    let terminationError = null;
    let timeoutTimer = null;
    let authorizationTimer = null;
    let forceKillTimer = null;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      if (authorizationTimer) clearInterval(authorizationTimer);
      if (error) reject(error);
      else resolve();
    };
    const signalProcessTree = (signal) => {
      try {
        if (detached && proc.pid) process.kill(-proc.pid, signal);
        else proc.kill(signal);
      } catch (error) {
        if (error?.code !== 'ESRCH') warn(`${label} ${signal} failed:`, error?.message);
      }
    };
    const terminate = (error) => {
      if (terminationError || settled) return;
      terminationError = error;
      signalProcessTree('SIGTERM');
      forceKillTimer = setTimeout(() => signalProcessTree('SIGKILL'), 5_000);
      forceKillTimer.unref?.();
    };
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      stderrTail = (stderrTail + s).slice(-1000);
    });
    proc.on('error', (err) => finish(new Error(`${label}_spawn_${err.code || err.message}`)));
    proc.on('close', (code) => {
      if (terminationError) finish(terminationError);
      else if (code === 0) finish();
      else finish(new Error(`${label}_exit_${code}: ${stderrTail.slice(-300)}`));
    });
    timeoutTimer = setTimeout(() => {
      terminate(new Error(`${label}_timeout_${timeoutMs / 1000}s`));
    }, timeoutMs);
    authorizationTimer = typeof shouldContinue === 'function'
      ? setInterval(() => {
        let continuation;
        try {
          continuation = shouldContinue();
        } catch (_) {
          continuation = 'indeterminate';
        }
        if (continuation !== true && continuation !== 'renewed') {
          const interruptionState = typeof continuation === 'string'
            ? continuation
            : 'denied';
          const error = new Error(`${label}_interrupted_${interruptionState}`);
          error.interruptionState = interruptionState;
          terminate(error);
        }
      }, 2_000)
      : null;
    authorizationTimer?.unref?.();
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Stale-processing reset requeues only a claim whose renewable lease has been
// silent longer than the full 15m download + 10m encode budget. Called at
// startup (worker_startup) AND on every poll tick (periodic_stale_reset) so
// orphans from crashed workers / previous deploys are never permanent zombies.
// ════════════════════════════════════════════════════════════════════════════
async function resetStaleProcessing(reason = 'periodic_stale_reset') {
  const staleBefore = new Date(Date.now() - STALE_LEASE_MS).toISOString();
  const { data, error } = await supa.from('video_transcode_jobs')
    .select(JOB_IDENTITY_FIELDS)
    .eq('status', 'processing')
    .eq('source_type', 'youtube')
    .lt('locked_at', staleBefore)
    .limit(100);

  if (error) { warn('stale reset error:', error.message); return; }
  if (!data?.length) return;

  let requeued = 0;
  let cancelled = 0;
  for (const job of data) {
    const authorization = await loadNativeAuthorization(job);
    if (authorization.state === 'indeterminate') {
      warn(`stale reset deferred job ${job.id}: authorization is indeterminate`);
      continue;
    }
    if (authorization.state === 'denied') {
      await cancelUnauthorizedJob(job, `${reason}:${authorization.reason}`);
      cancelled++;
      continue;
    }
    let requeueQuery = supa.from('video_transcode_jobs')
      .update({
        status: 'queued',
        worker_id: null,
        claim_token: null,
        started_at: null,
        locked_at: null,
        heartbeat_at: new Date().toISOString(),
        error_message: reason,
      })
      .eq('status', 'processing')
      .eq('locked_at', job.locked_at)
      .lt('locked_at', staleBefore);
    requeueQuery = applyClaimScope(requeueQuery, job);
    const { data: requeuedJob, error: requeueError } = await requeueQuery
      .select('id')
      .maybeSingle();
    if (requeueError) {
      warn(`stale reset failed for job ${job.id}:`, requeueError.message);
      continue;
    }
    if (requeuedJob?.id === job.id) requeued++;
  }
  log(`Reset ${requeued} stale authorized row(s); cancelled ${cancelled} unauthorized row(s) (${reason})`);
}

// ════════════════════════════════════════════════════════════════════════════
// Cookie/POT refreshers and heuristic Reel repair sweeps were intentionally
// retired. Queue creation, availability verdicts, and fallback state now belong
// to their database/API owners; this worker only reclaims and processes explicit
// rights-cleared claims.
// Main loop — adaptive polling. Fast (5s) when jobs are flowing, slow (60s)
// when the queue is idle. Saves wasted DB roundtrips during quiet hours.
// ════════════════════════════════════════════════════════════════════════════
async function startWorker() {
  log(`Starting yt-transcode-worker`);
  log(`  Worker ID:        ${WORKER_ID}`);
  log(`  Supabase:         ${SUPABASE_URL}`);
  log(`  Concurrency:      ${MAX_CONCURRENT_YT}`);
  log(`  Poll: idle ${POLL_MS / 1000}s / busy ${FAST_POLL_MS / 1000}s`);

  let prefetchedControl = await runStartupPreflight();
  let lastControlState = null;
  log('  Startup preflight: schema and RPC behavior contract verified');

  async function pollLoop() {
    try {
      const control = prefetchedControl || await loadNativeTranscodeControl();
      prefetchedControl = null;

      if (control.state !== 'enabled') {
        if (lastControlState !== control.state) {
          warn(`Native processing idle (${control.reason}); no queue, Reel, or Storage writes will run`);
        }
        lastControlState = control.state;
        if (!shutdownRequested) setTimeout(pollLoop, POLL_MS);
        return;
      }

      // The legacy heuristic sweeps are intentionally not scheduled here. New
      // work must enter through the database's rights-gated queue trigger, and
      // the trusted availability verifier owns embed health. This worker only
      // renews/reclaims explicit claims and processes them while the database
      // control is enabled.
      const enabledTransition = lastControlState !== 'enabled';
      lastControlState = 'enabled';
      await resetStaleProcessing(enabledTransition ? 'worker_enabled' : 'periodic_stale_reset');
      const dispatched = await tick();
      // If we just dispatched work or are still busy, poll fast; else slow.
      const nextDelay = (dispatched > 0 || activeJobs > 0) ? FAST_POLL_MS : POLL_MS;
      if (!shutdownRequested) setTimeout(pollLoop, nextDelay);
    } catch (e) {
      warn('tick error:', e?.message);
      lastControlState = 'indeterminate';
      if (!shutdownRequested) setTimeout(pollLoop, POLL_MS);
    }
  }
  await pollLoop();
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  log(`${signal} received — draining ${activeJobs} active job(s) before exit...`);
  const waitForDrain = () => {
    if (activeJobs === 0) {
      log('All jobs drained. Exiting cleanly.');
      process.exit(0);
    } else {
      log(`  Waiting for ${activeJobs} job(s) to finish...`);
      setTimeout(waitForDrain, 2_000);
    }
  };
  waitForDrain();
  // Hard kill after 10 min if jobs are stuck
  setTimeout(() => {
    warn('Drain timeout (10 min) — forcing exit.');
    process.exit(1);
  }, 600_000).unref();
}
if (process.env.YT_WORKER_TEST_MODE !== '1') {
  if (process.argv.includes('--preflight-only')) {
    await runStartupPreflight();
    log('Startup preflight-only check passed');
  } else {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
    await startWorker();
  }
}

export {
  hasNativeProcessingRights,
  isNativeProcessingAuthorized,
  normalizeCompletionUrl,
};
