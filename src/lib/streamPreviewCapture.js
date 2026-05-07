/**
 * streamPreviewCapture — Rolling preview clip uploader for live broadcasters.
 *
 * BUG-FIX-LIVE-5 (per Dan: "couldn't we make it as a streaming loop? or a
 * preview video that is just auto playing? make it like a video thats looping
 * for users to click instead of downloading a whole stream").
 *
 * Architecture
 * ────────────
 * Old model (LiveStreamCard with `inlineAutoplay`): every feed card opens its
 * own LiveKit WHEP connection. With N live broadcasters visible in the feed
 * that's N concurrent WebRTC connections per viewer device — battery, data,
 * and CPU disaster on mobile.
 *
 * New model: while the broadcaster is live, this module runs a parallel
 * MediaRecorder on the SAME local stream that LiveKit publishes from. Every
 * ~25 seconds it stops the recorder, uploads the trailing ~12 seconds of
 * footage to Supabase Storage as a single file (overwriting the previous
 * preview), and updates `live_streams.preview_clip_url` + `preview_updated_at`.
 *
 * Feed cards consume this URL via a plain `<video autoplay muted loop>`. No
 * per-card connections, no token fetches, no LiveKit dependency client-side
 * for preview. Just a CDN-fronted ~1MB MP4/WebM that the browser caches and
 * loops for free.
 *
 * Codec choice
 * ────────────
 * MediaRecorder picks the best supported MIME from a preference list. WebM
 * with VP9 plays natively on iOS Safari 16+, Chromium, Firefox. iOS 15 and
 * older fall back to the static thumbnail (graceful degradation — the URL
 * is set but the video element fails silently and `<img>` poster shows).
 *
 * Storage layout
 * ──────────────
 * Bucket: `live-recordings` (existing bucket, already used for thumbnails)
 * Path:   `live-stream-previews/{stream_id}.{ext}`
 *
 * The path is deterministic so each upload overwrites the previous preview
 * — viewers' browser cache busts via the `preview_updated_at` query string
 * appended in LiveStreamCard.
 *
 * Lifecycle
 * ─────────
 *   const cap = new StreamPreviewCapture({
 *     mediaStream,
 *     streamId,
 *     userId,
 *     accessToken,
 *     supabase,
 *   });
 *   cap.start();   // begins the rolling capture
 *   ...
 *   cap.stop();    // halts and clears state on end-of-broadcast
 *
 * The first preview lands ~25s after start. Until then, viewers see the
 * static thumbnail. That's an acceptable cold-start gap — far cheaper than
 * the connection-per-card alternative.
 */

const PREVIEW_WINDOW_MS = 25_000;       // capture window length (~25s clip)
const MIN_BLOB_BYTES = 30_000;          // skip tiny upload if codec dropped most chunks
const PREFERRED_MIMES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];
const STORAGE_BUCKET = 'live-recordings';
const STORAGE_PREFIX = 'live-stream-previews';

function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  for (const m of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function extFromMime(mime) {
  if (!mime) return 'webm';
  if (mime.startsWith('video/mp4')) return 'mp4';
  return 'webm';
}

export class StreamPreviewCapture {
  /**
   * @param {object} opts
   * @param {MediaStream} opts.mediaStream  — the broadcaster's local stream
   * @param {string} opts.streamId          — live_streams.id
   * @param {string} opts.userId            — auth user.id (for storage path scoping)
   * @param {() => string|null|Promise<string|null>} opts.getAccessToken
   *        — returns a fresh JWT (signed-in user). Called per upload so it
   *          stays fresh across token rotation.
   * @param {object} opts.supabase          — supabase-js client (for DB update + getPublicUrl)
   * @param {(err: Error) => void} [opts.onError] — non-fatal error reporter
   */
  constructor({ mediaStream, streamId, userId, getAccessToken, supabase, onError }) {
    if (!mediaStream || !streamId || !userId || !supabase || typeof getAccessToken !== 'function') {
      throw new Error('StreamPreviewCapture: missing required option');
    }
    this.mediaStream = mediaStream;
    this.streamId = streamId;
    this.userId = userId;
    this.getAccessToken = getAccessToken;
    this.supabase = supabase;
    this.onError = onError || (() => {});

    this.mime = null;
    this.recorder = null;
    this.chunks = [];
    this.windowTimer = null;
    this.disposed = false;
    this.uploading = false;
  }

  start() {
    if (this.disposed) return;
    const mime = pickMime();
    if (!mime) {
      this.onError(new Error('No supported MediaRecorder MIME — preview disabled'));
      return;
    }
    this.mime = mime;
    this._startWindow();
  }

  stop() {
    this.disposed = true;
    if (this.windowTimer) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch (_) {}
    }
    this.recorder = null;
    this.chunks = [];
  }

  _startWindow() {
    if (this.disposed) return;
    this.chunks = [];
    let mr;
    try {
      mr = new MediaRecorder(this.mediaStream, {
        mimeType: this.mime,
        videoBitsPerSecond: 800_000,  // 800kbps — preview-quality, not full-bitrate
      });
    } catch (err) {
      this.onError(err);
      return;
    }

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    mr.onstop = () => {
      // Build blob from chunks and upload async; do NOT await before starting
      // the next window, so capture is gap-free.
      if (this.chunks.length > 0) {
        const blob = new Blob(this.chunks, { type: this.mime });
        if (blob.size >= MIN_BLOB_BYTES) {
          this._uploadAndPublish(blob).catch((err) => this.onError(err));
        }
      }
      this.chunks = [];
      // Start next window if not disposed
      if (!this.disposed) this._startWindow();
    };

    mr.onerror = (e) => this.onError(e?.error || new Error('MediaRecorder error'));

    try {
      mr.start(1000);  // 1s timeslice
    } catch (err) {
      this.onError(err);
      return;
    }
    this.recorder = mr;

    this.windowTimer = setTimeout(() => {
      if (this.disposed) return;
      try {
        if (mr.state !== 'inactive') mr.stop();
      } catch (_) {}
      this.windowTimer = null;
      // The new window will begin from inside mr.onstop.
    }, PREVIEW_WINDOW_MS);
  }

  async _uploadAndPublish(blob) {
    if (this.disposed) return;
    if (this.uploading) return;     // skip if previous upload still in flight; a fresh
                                    // window will be along in 25s anyway.
    this.uploading = true;
    try {
      const ext = extFromMime(this.mime);
      const path = `${STORAGE_PREFIX}/${this.streamId}.${ext}`;
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const token = (await this.getAccessToken()) || ANON_KEY;

      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': ANON_KEY,
            'Content-Type': this.mime,
            'x-upsert': 'true',
          },
          body: blob,
        }
      );

      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => '');
        throw new Error(`Storage upload failed ${uploadRes.status}: ${text.slice(0, 200)}`);
      }

      // Public URL via SDK (handles CDN host substitution)
      const { data: urlData } = this.supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);

      // Update the live_streams row so feed cards can see the new preview
      // and bust the CDN cache via preview_updated_at.
      await this.supabase
        .from('live_streams')
        .update({
          preview_clip_url: urlData.publicUrl,
          preview_updated_at: new Date().toISOString(),
        })
        .eq('id', this.streamId);
    } finally {
      this.uploading = false;
    }
  }
}

export default StreamPreviewCapture;
