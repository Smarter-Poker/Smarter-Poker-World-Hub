/**
 * AlbumPicker — screen 1 of the FB-style compose flow.
 *
 * On entry, if the compose store has no media yet, immediately fires the
 * hidden file input to invoke iOS's native Photos picker (which provides
 * numbered selection circles natively on iOS Safari). After the user
 * confirms in the OS picker, we render their selections in a 3-column
 * grid with our own numbered badges and a bottom thumb-strip, plus a
 * sticky "Next" CTA.
 *
 * The picker is re-triggerable via "+ Add more" so users can append.
 */
import React, { useEffect, useRef } from 'react';
import { useComposeStore } from '../../../stores/composeStore';

const COLS = 3;
const GAP = 2;
const HEADER_H = 56;
const FOOTER_H = 72;
const THUMB_STRIP_H = 80;

function fileType(file) {
    if (file.type?.startsWith('video/')) return 'video';
    if (file.type?.startsWith('image/')) return 'photo';
    // iPhone HEIC/HEIF often arrives without a type — use extension as fallback
    const ext = (file.name || '').toLowerCase().split('.').pop();
    if (['mov','mp4','m4v','3gp','3g2','mkv','avi','webm','hevc','heic','heif'].includes(ext)) return 'video';
    if (['jpg','jpeg','png','gif','webp','heic','heif'].includes(ext)) return 'photo';
    return 'photo';
}

async function probeVideoMeta(blobUrl) {
    return new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        v.src = blobUrl;
        const cleanup = () => { try { v.removeAttribute('src'); v.load(); } catch (_) {} };
        const timeout = setTimeout(() => { cleanup(); resolve(null); }, 4000);
        v.onloadedmetadata = () => {
            clearTimeout(timeout);
            const meta = { durationSec: v.duration || 0, width: v.videoWidth || 0, height: v.videoHeight || 0 };
            cleanup();
            resolve(meta);
        };
        v.onerror = () => { clearTimeout(timeout); cleanup(); resolve(null); };
    });
}

function formatDuration(sec) {
    if (!sec || !isFinite(sec) || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AlbumPicker({ onClose, onNext }) {
    const fileInputRef = useRef(null);
    const autoOpenedRef = useRef(false);
    const media = useComposeStore(s => s.media);
    const addMedia = useComposeStore(s => s.addMedia);
    const removeMedia = useComposeStore(s => s.removeMedia);

    // KILL-AUTO-CLICK (2026-05-01 per Dan): AlbumPicker is no longer in the
    // active flow (compose.js dropped its import; default step is now
    // 'edit'). Even if some stale chunk somehow mounts this component,
<<<<<<< Updated upstream
    // the auto-click is permanently disabled — it was firing a SECOND iOS
    // Photos picker on iPhone after the upload had already started, breaking
    // real uploads. Component kept around only as a defensive fallback.
=======
    // the auto-click is disabled — it was firing a SECOND iOS Photos
    // picker on iPhone after the upload had already started, breaking
    // real uploads. Component kept around only as a defensive fallback.
    // No-op effect.
>>>>>>> Stashed changes
    useEffect(() => {
        autoOpenedRef.current = true;
    }, []);

    const handleFiles = async (e) => {
        const files = Array.from(e?.target?.files || []);
        if (!files.length) return;

        // Build media entries with blob URLs + lightweight metadata
        const entries = await Promise.all(files.map(async (file) => {
            const type = fileType(file);
            const url = (typeof URL !== 'undefined' && URL.createObjectURL)
                ? URL.createObjectURL(file)
                : null;
            const id = `${file.name}|${file.size}|${file.lastModified}|${Math.random().toString(36).slice(2, 8)}`;
            const entry = { id, type, file, url, thumbnail: null, durationSec: 0, width: 0, height: 0 };
            if (type === 'video' && url) {
                const meta = await probeVideoMeta(url);
                if (meta) {
                    entry.durationSec = meta.durationSec;
                    entry.width = meta.width;
                    entry.height = meta.height;
                }
            }
            return entry;
        }));

        addMedia(entries);
        // Reset the input so the same file can be re-selected later
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const openPicker = () => fileInputRef.current?.click();

    const canNext = media.length > 0;

    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#000', color: '#fff',
            display: 'flex', flexDirection: 'column', zIndex: 9999,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}>
            {/* ── Header ────────────────────────────────────── */}
            <div style={{
                height: HEADER_H, paddingTop: 'env(safe-area-inset-top, 0px)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', borderBottom: '1px solid #1c1c1e',
                position: 'relative', flexShrink: 0,
            }}>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    style={{
                        background: 'none', border: 'none', color: '#fff',
                        fontSize: 24, padding: 8, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >&#x2715;</button>
                <div style={{ fontSize: 17, fontWeight: 600 }}>
                    {media.length > 0 ? `${media.length} selected` : 'Select media'}
                </div>
                <button
                    onClick={openPicker}
                    aria-label="Add from library"
                    title="Add more from your photo library"
                    style={{
                        background: 'none', border: 'none', color: '#fff',
                        fontSize: 22, padding: 8, cursor: 'pointer',
                    }}
                >&#xff0b;</button>
            </div>

            {/* ── Scrollable grid area ───────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {media.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: 32, height: '100%', textAlign: 'center', color: '#8e8e93', gap: 16,
                    }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 32,
                            background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 28, color: '#fff',
                        }}>&#x2295;</div>
                        <div style={{ fontSize: 17, fontWeight: 600, color: '#fff' }}>Pick photos or videos</div>
                        <div style={{ fontSize: 14, lineHeight: 1.4, maxWidth: 280 }}>
                            Tap below to open your library. Select up to 10 items in the order you want them shown.
                        </div>
                        <button
                            onClick={openPicker}
                            style={{
                                marginTop: 8,
                                background: '#1877F2', color: '#fff', border: 'none',
                                padding: '12px 24px', borderRadius: 8, fontSize: 15, fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >Open library</button>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                        gap: GAP, padding: GAP,
                    }}>
                        {media.map((m, idx) => (
                            <div
                                key={m.id}
                                style={{
                                    position: 'relative', aspectRatio: '1 / 1',
                                    background: '#1c1c1e', overflow: 'hidden',
                                }}
                            >
                                {/* Preview — image tag for both photos and the first frame
                                    of videos (browsers render <video poster> reliably; for
                                    HEVC we fall back to a still <video> with no autoplay). */}
                                {m.type === 'photo' ? (
                                    <img
                                        src={m.url}
                                        alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <video
                                        src={m.url}
                                        muted
                                        playsInline
                                        preload="metadata"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                )}
                                {/* Numbered selection badge (1, 2, 3...) — top-right */}
                                <button
                                    onClick={() => removeMedia(m.id)}
                                    aria-label={`Remove item ${idx + 1}`}
                                    style={{
                                        position: 'absolute', top: 6, right: 6,
                                        width: 26, height: 26, borderRadius: 13,
                                        background: '#1877F2', color: '#fff',
                                        border: '2px solid #fff',
                                        fontSize: 13, fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', padding: 0,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                    }}
                                >{idx + 1}</button>
                                {/* Duration overlay for videos */}
                                {m.type === 'video' && m.durationSec > 0 && (
                                    <div style={{
                                        position: 'absolute', bottom: 6, right: 6,
                                        padding: '2px 6px', borderRadius: 4,
                                        background: 'rgba(0,0,0,0.6)', color: '#fff',
                                        fontSize: 11, fontWeight: 600,
                                    }}>{formatDuration(m.durationSec)}</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Bottom thumb-strip + Next CTA ──────────────── */}
            {media.length > 0 && (
                <div style={{
                    flexShrink: 0,
                    borderTop: '1px solid #1c1c1e',
                    background: '#000',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                }}>
                    {/* Horizontal selection strip */}
                    <div style={{
                        height: THUMB_STRIP_H, padding: '8px 12px',
                        display: 'flex', gap: 8, overflowX: 'auto',
                        WebkitOverflowScrolling: 'touch',
                    }}>
                        {media.map((m, idx) => (
                            <div
                                key={`strip-${m.id}`}
                                style={{
                                    position: 'relative', flexShrink: 0,
                                    width: 56, height: 56, borderRadius: 6,
                                    overflow: 'hidden', background: '#1c1c1e',
                                    border: idx === 0 ? '2px solid #1877F2' : '2px solid transparent',
                                }}
                            >
                                {m.type === 'photo' ? (
                                    <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <video src={m.url} muted playsInline preload="metadata"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                <button
                                    onClick={() => removeMedia(m.id)}
                                    aria-label="Remove"
                                    style={{
                                        position: 'absolute', top: -2, right: -2,
                                        width: 18, height: 18, borderRadius: 9,
                                        background: 'rgba(0,0,0,0.8)', color: '#fff',
                                        border: '1px solid #fff', fontSize: 12,
                                        cursor: 'pointer', padding: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >&#x2715;</button>
                            </div>
                        ))}
                    </div>
                    {/* Next CTA */}
                    <div style={{ padding: '8px 16px 16px' }}>
                        <button
                            onClick={canNext ? onNext : undefined}
                            disabled={!canNext}
                            style={{
                                width: '100%', height: 48, borderRadius: 8,
                                background: canNext ? '#1877F2' : '#1c1c1e',
                                color: canNext ? '#fff' : '#48484a',
                                border: 'none', fontSize: 16, fontWeight: 600,
                                cursor: canNext ? 'pointer' : 'not-allowed',
                            }}
                        >Next</button>
                    </div>
                </div>
            )}

            {/* Hidden native file input — multi-select; iOS shows numbered circles */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={handleFiles}
            />
        </div>
    );
}
