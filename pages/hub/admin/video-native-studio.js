import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), {
  ssr: false,
});
function token() {
  try {
    return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
  } catch {
    return null;
  }
}
async function mediaFacts(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('The source video metadata could not be read.'));
    });
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return {
      duration_seconds: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      sha256: [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join(''),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
const MAX_BROWSER_UPLOAD_BYTES = 500_000_000;
export default function NativeStudio() {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [uploading, setUploading] = useState(false),
    [form, setForm] = useState({
      video_id: '',
      rights_status: 'owned',
      evidence_kind: 'ownership',
      evidence_reference: '',
      territories: 'worldwide',
    }),
    [settings, setSettings] = useState({
      crop_mode: 'vertical_focus',
      focus_x: 50,
      branding: true,
      caption_text: '',
    });
  const fileRef = useRef(null);
  const request = useCallback(async (body) => {
    const access = token();
    if (!access) throw new Error('Admin session expired. Sign in and retry.');
    const response = await fetch('/api/admin/video-native-studio', {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${access}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Native studio returned an unreadable response');
    }
    if (!response.ok) throw new Error(parsed.error || 'Native studio request failed');
    return parsed;
  }, []);
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await request());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [request]);
  useEffect(() => {
    load();
  }, [load]);
  const masters = useMemo(
    () => new Map((data?.masters || []).map((item) => [item.video_id, item])),
    [data]
  );
  const upload = async () => {
    if (uploading) return;
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Choose a source master first.');
    if (file.size > MAX_BROWSER_UPLOAD_BYTES)
      return setError('Source masters uploaded in this console must be 500 MB or smaller.');
    setUploading(true);
    setError('');
    try {
      const facts = await mediaFacts(file);
      const ticket = await request({
        action: 'create_upload',
        video_id: form.video_id,
        mime_type: file.type,
        byte_size: file.size,
      });
      const put = await fetch(ticket.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
        body: file,
      });
      if (!put.ok) throw new Error('Source master upload failed before registration.');
      await request({
        action: 'register_master',
        ...form,
        territories: form.territories
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        storage_path: ticket.path,
        mime_type: file.type,
        byte_size: file.size,
        ...facts,
      });
      fileRef.current.value = '';
      await load();
    } catch (e) {
      setError(e.message || 'Source master upload failed');
    } finally {
      setUploading(false);
    }
  };
  const revoke = async (videoId) => {
    if (uploading) return;
    setUploading(true);
    setError('');
    try {
      await request({ action: 'revoke_master', video_id: videoId, reason: 'revoked_by_admin' });
      await load();
    } catch (e) {
      setError(e.message || 'Master revocation failed');
    } finally {
      setUploading(false);
    }
  };
  const queue = async (candidate) => {
    setError('');
    try {
      await request({
        action: 'queue_rendition',
        video_id: candidate.video_id,
        candidate_id: candidate.id,
        settings: {
          ...settings,
          clip_start_seconds: candidate.clip_start_seconds,
          clip_end_seconds: candidate.clip_end_seconds,
        },
      });
      await load();
    } catch (e) {
      setError(e.message || 'Rendition queue failed');
    }
  };
  return (
    <>
      <Head>
        <title>Native Reel Studio | Smarter Poker</title>
      </Head>
      <UniversalHeader />
      <main aria-busy={busy || uploading}>
        <header>
          <p>Rights-Cleared Media Operations</p>
          <h1>Native Reel Studio</h1>
          <span>
            {data?.limits?.enabled ? 'Studio Online' : 'Studio Paused'} /{' '}
            {data?.limits?.max_jobs_per_day || 0} Daily Render Limit
          </span>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <section className="console">
          <h2>Register Source Master</h2>
          <div className="grid">
            <label>
              Video ID
              <input
                value={form.video_id}
                onChange={(e) => setForm({ ...form, video_id: e.target.value })}
              />
            </label>
            <label>
              Rights
              <select
                value={form.rights_status}
                onChange={(e) => setForm({ ...form, rights_status: e.target.value })}
              >
                <option value="owned">Owned</option>
                <option value="licensed">Licensed</option>
              </select>
            </label>
            <label>
              Evidence
              <select
                value={form.evidence_kind}
                onChange={(e) => setForm({ ...form, evidence_kind: e.target.value })}
              >
                <option value="ownership">Ownership</option>
                <option value="license">License</option>
                <option value="creator_grant">Creator Grant</option>
              </select>
            </label>
            <label>
              Evidence Reference
              <input
                value={form.evidence_reference}
                onChange={(e) => setForm({ ...form, evidence_reference: e.target.value })}
              />
            </label>
            <label>
              Territories
              <input
                value={form.territories}
                onChange={(e) => setForm({ ...form, territories: e.target.value })}
              />
            </label>
            <label>
              Source Master
              <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" />
            </label>
          </div>
          <button disabled={uploading} onClick={upload}>
            {uploading ? 'Uploading And Verifying' : 'Upload Rights-Cleared Master'}
          </button>
        </section>
        <section className="console">
          <h2>Active Source Masters</h2>
          <div className="ledger">
            {(data?.masters || []).map((item) => (
              <div key={item.id}>
                <b>{item.status}</b>
                <span>{item.video_library_videos?.title || item.video_id}</span>
                <span>{Math.round(item.byte_size / 1_000_000)} MB</span>
                <button
                  disabled={uploading || item.status !== 'ready'}
                  onClick={() => revoke(item.video_id)}
                >
                  Revoke And Purge
                </button>
              </div>
            ))}
            {!busy && !data?.masters?.length && <p>No Source Masters Are Registered.</p>}
          </div>
        </section>
        <section className="console">
          <h2>Approved Native Candidates</h2>
          <div className="grid">
            <label>
              Crop
              <select
                value={settings.crop_mode}
                onChange={(e) => setSettings({ ...settings, crop_mode: e.target.value })}
              >
                <option value="vertical_focus">Action-Aware Vertical</option>
                <option value="fit_blur">Fit With Cinematic Blur</option>
                <option value="center_crop">Center Crop</option>
              </select>
            </label>
            <label>
              Horizontal Focus
              <input
                type="range"
                min="0"
                max="100"
                value={settings.focus_x}
                onChange={(e) => setSettings({ ...settings, focus_x: Number(e.target.value) })}
              />
            </label>
            <label>
              Caption Text
              <textarea
                value={settings.caption_text}
                onChange={(e) => setSettings({ ...settings, caption_text: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.branding}
                onChange={(e) => setSettings({ ...settings, branding: e.target.checked })}
              />{' '}
              Smarter Poker Branding
            </label>
          </div>
          <div className="cards">
            {(data?.candidates || []).map((candidate) => (
              <article key={candidate.id}>
                {candidate.video_library_videos?.thumbnail_url ? (
                  <img src={candidate.video_library_videos.thumbnail_url} alt="" />
                ) : (
                  <div className="noMedia">Source Master</div>
                )}
                <div>
                  <small>
                    {candidate.rights_status} / {candidate.clip_start_seconds}s To{' '}
                    {candidate.clip_end_seconds}s
                  </small>
                  <h3>{candidate.video_library_videos?.title || candidate.video_id}</h3>
                  <p>
                    {masters.has(candidate.video_id) ? 'Master Verified' : 'Source Master Required'}
                  </p>
                  <button
                    disabled={
                      !masters.has(candidate.video_id) ||
                      (data?.renditions || []).some(
                        (r) =>
                          r.candidate_id === candidate.id &&
                          !['failed', 'rejected'].includes(r.status)
                      )
                    }
                    onClick={() => queue(candidate)}
                  >
                    Queue Vertical Rendition
                  </button>
                </div>
              </article>
            ))}
            {!busy && !data?.candidates?.length && (
              <p>No Approved Native Candidates Are Waiting.</p>
            )}
          </div>
        </section>
        <section className="console">
          <h2>Rendition Operations</h2>
          <div className="ledger">
            {(data?.renditions || []).map((item) => (
              <div key={item.id}>
                <b>{item.status}</b>
                <span>{item.candidate_id}</span>
                <span>Attempt {item.attempt_count}/5</span>
                <span>{item.last_failure_code || item.output_path || 'Queued'}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
      <style jsx>{`
        main {
          min-height: 100vh;
          background: radial-gradient(circle at 50% 0, #082b47 0, #02070d 42%, #000 100%);
          color: #eef8ff;
          padding: 92px max(16px, 4vw) 60px;
          font-family: Rajdhani, system-ui;
        }
        header,
        .console {
          max-width: 1200px;
          margin: 0 auto 18px;
          border: 1px solid #4ea7d1;
          background: linear-gradient(145deg, rgba(8, 27, 42, 0.96), rgba(0, 5, 10, 0.98));
          box-shadow:
            inset 0 0 0 1px #0b1d2a,
            0 18px 50px #000;
          padding: 20px;
        }
        header p,
        small {
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8fdcff;
        }
        h1 {
          font-size: clamp(34px, 7vw, 72px);
          margin: 4px 0;
        }
        h2 {
          letter-spacing: 0.08em;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        label {
          display: grid;
          gap: 6px;
          color: #a7c7d8;
        }
        input,
        select,
        textarea,
        button {
          min-height: 46px;
          border: 1px solid #397798;
          background: #03111b;
          color: #effaff;
          padding: 10px;
          font: inherit;
        }
        button {
          background: linear-gradient(#164e70, #082b43);
          font-weight: 700;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .check {
          display: flex;
          align-items: center;
        }
        .check input {
          min-height: auto;
        }
        .cards {
          display: grid;
          gap: 14px;
          margin-top: 18px;
        }
        .cards article {
          display: grid;
          grid-template-columns: 120px 1fr;
          border: 1px solid #214e68;
          background: #020b12;
        }
        .cards img,
        .noMedia {
          width: 120px;
          height: 100%;
          min-height: 130px;
          object-fit: cover;
        }
        .noMedia {
          display: grid;
          place-items: center;
          background: radial-gradient(circle, #0c4260, #02080d);
          color: #8fdcff;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          text-align: center;
        }
        .cards div:not(.noMedia) {
          padding: 14px;
        }
        .cards h3 {
          margin: 8px 0;
        }
        .ledger {
          display: grid;
          gap: 8px;
        }
        .ledger div {
          display: grid;
          grid-template-columns: 100px 1fr 120px 1fr;
          gap: 10px;
          border-bottom: 1px solid #17384a;
          padding: 10px;
        }
        .error {
          max-width: 1200px;
          margin: 0 auto 16px;
          border: 1px solid #d47a54;
          background: #35140c;
          padding: 14px;
        }
        @media (max-width: 640px) {
          main {
            padding-top: 78px;
          }
          .ledger div {
            grid-template-columns: 1fr;
          }
          .cards article {
            grid-template-columns: 88px 1fr;
          }
          .cards img,
          .noMedia {
            width: 88px;
          }
        }
      `}</style>
    </>
  );
}
