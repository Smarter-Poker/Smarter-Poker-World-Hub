/**
 * CoverFramePicker — screen 3 of the FB-style compose flow.
 *
 * Big preview of the chosen frame on top, horizontal scrubber strip of 8
 * evenly-spaced frames at the bottom. User taps a frame to select it; the
 * big preview seeks to that timestamp. "+ Add from gallery" lets the user
 * upload a custom thumbnail file instead.
 *
 * Strategy:
 *   • Try to extract 8 frames client-side via generateFrames (works on
 *     H.264 videos). Renders the strip as <img>.
 *   • If extraction returns null frames (HEVC on iOS Safari), fall back to
 *     a static label-only strip ("0:11" "0:22" etc.). The big preview is
 *     a live <video> element that seeks to the selected timestamp — that
 *     works on HEVC even when canvas readback doesn't.
 *
 * State written to compose store: coverFrameIndex (0..7) OR customCoverFile.
 * The transcode-videos cron uses cover_frame_index to pick which of its
 * 8 server-extracted frames becomes the post's thumbnail_url.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useComposeStore } from '../../../stores/composeStore';
import { generateFrames } from '../../../lib/videoCompressor';

const FRAME_COUNT = 8;
const HEADER_H = 56;

function formatTime(sec) {
    if (!sec || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec - m * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CoverFramePicker({ onBack, onSave }) {
    const primaryVideo = useComposeStore(s => s.media.find(m => m.type === 'video'));
    const coverFrameIndex = useComposeStore(s => s.coverFrameIndex);
    const customCoverFile = useComposeStore(s => s.customCoverFile);
    const customCoverPreviewUrl = useComposeStore(s => s.customCoverPreviewUrl);
    const setCoverFrameIndex = useComposeStore(s => s.setCoverFrameIndex);
    const setCustomCover = useComposeStore(s => s.setCustomCover);

    const fileInputRef = useRef(null);
    const previewVideoRef = useRef(null);
    const [frames, setFrames] = useState([]);   // [{ dataUrl, timeSeconds }]
    const [duration, setDuration] = useState(0);
    const [extracting, setExtracting] = useState(true);

    // Default to frame 0 if neither cover_frame_index nor custom cover is set
    useEffect(() => {
        if (coverFrameIndex === null && !customCoverFile) {
            setCoverFrameIndex(0);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Extract 8 frames from the video
    useEffect(() => {
        let cancelled = false;
        if (!primaryVideo?.file) {
            setExtracting(false);
            return;
        }

        // Probe duration first so the strip can show timestamps even if frame
        // extraction fails on HEVC.
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        probe.playsInline = true;
        probe.src = primaryVideo.url;
        probe.onloadedmetadata = () => {
            if (!cancelled) setDuration(probe.duration || 0);
            try { probe.removeAttribute('src'); probe.load(); } catch (_) {}
        };

        generateFrames(primaryVideo.file, FRAME_COUNT)
            .then(result => {
                if (cancelled) return;
                setFrames(result || []);
                setExtracting(false);
            })
            .catch(() => {
                if (cancelled) return;
                setFrames([]);
                setExtracting(false);
            });

        return () => { cancelled = true; };
    }, [primaryVideo?.file]);

    // Seek the preview video when the selected frame index changes
    useEffect(() => {
        const v = previewVideoRef.current;
        if (!v || coverFrameIndex === null || customCoverFile) return;
        // Use the captured timeSeconds from generateFrames if available, else
        // calculate from duration.
        let target = null;
        if (frames[coverFrameIndex]?.timeSeconds != null) {
            target = frames[coverFrameIndex].timeSeconds;
        } else if (duration > 0) {
            target = (duration * 0.05) + (duration * 0.9 * coverFrameIndex) / Math.max(FRAME_COUNT - 1, 1);
        }
        if (target != null && isFinite(target)) {
            try { v.currentTime = Math.max(0.05, target); } catch (_) {}
        }
    }, [coverFrameIndex, frames, duration, customCoverFile]);

    const handleAddFromGallery = (e) => {
        const file = e?.target?.files?.[0];
        if (file) setCustomCover(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const triggerGalleryPicker = () => fileInputRef.current?.click();

    const handleSave = () => {
        // The store already has the right values; parent handles the route push.
        onSave?.();
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#fff', color: '#050505',
            display: 'flex', flexDirection: 'column', zIndex: 9999,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}>
            {/* ── Header ────────────────────────────────────── */}
            <div style={{
                height: HEADER_H, paddingTop: 'env(safe-area-inset-top, 0px)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', borderBottom: '1px solid #e4e6eb',
                flexShrink: 0,
            }}>
                <button
                    onClick={onBack}
                    aria-label="Back"
                    style={{
                        background: 'none', border: 'none', color: '#050505',
                        fontSize: 22, padding: 8, cursor: 'pointer',
                    }}
                >&#x2190;</button>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Edit cover</div>
                <button
                    onClick={handleSave}
                    style={{
                        background: 'none', border: 'none', color: '#1877F2',
                        fontSize: 16, fontWeight: 600, padding: 8, cursor: 'pointer',
                    }}
                >Save</button>
            </div>

            {/* ── Big preview ─────────────────────────────────── */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-start',
                padding: 16, gap: 16, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            }}>
                <div style={{
                    width: '100%', maxWidth: 360, aspectRatio: '9 / 16',
                    background: '#000', borderRadius: 12, overflow: 'hidden',
                    position: 'relative',
                }}>
                    {customCoverFile && customCoverPreviewUrl ? (
                        <img
                            src={customCoverPreviewUrl}
                            alt="Custom cover"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <video
                            ref={previewVideoRef}
                            src={primaryVideo?.url || ''}
                            muted
                            playsInline
                            preload="auto"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    )}
                </div>

                <div style={{ fontSize: 13, color: '#65676B', textAlign: 'center', maxWidth: 320, lineHeight: 1.4 }}>
                    To select a cover photo, choose a frame from your video or an image from your gallery.
                </div>

                {/* ── Frame scrubber strip ─────────────────────── */}
                <div style={{
                    width: '100%', maxWidth: 480,
                    display: 'flex', gap: 6, padding: '4px 0',
                    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                }}>
                    {Array.from({ length: FRAME_COUNT }).map((_, idx) => {
                        const isSelected = !customCoverFile && idx === coverFrameIndex;
                        const frame = frames[idx];
                        const tSec = frame?.timeSeconds ?? (
                            duration > 0
                                ? (duration * 0.05) + (duration * 0.9 * idx) / Math.max(FRAME_COUNT - 1, 1)
                                : null
                        );
                        return (
                            <button
                                key={idx}
                                onClick={() => setCoverFrameIndex(idx)}
                                aria-label={`Frame ${idx + 1}${tSec != null ? ' at ' + formatTime(tSec) : ''}`}
                                style={{
                                    flexShrink: 0, position: 'relative',
                                    width: 56, height: 80,
                                    border: isSelected ? '3px solid #1877F2' : '1px solid #e4e6eb',
                                    borderRadius: 6, background: '#1c1c1e',
                                    overflow: 'hidden', padding: 0, cursor: 'pointer',
                                    boxSizing: 'border-box',
                                }}
                            >
                                {frame?.dataUrl ? (
                                    <img
                                        src={frame.dataUrl}
                                        alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '100%', height: '100%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontSize: 11, fontWeight: 600,
                                        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                                    }}>
                                        {extracting ? '…' : (tSec != null ? formatTime(tSec) : '·')}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── Add from gallery ─────────────────────────── */}
                <button
                    onClick={triggerGalleryPicker}
                    style={{
                        width: '100%', maxWidth: 360, height: 44,
                        background: '#f0f2f5', color: '#050505',
                        border: 'none', borderRadius: 8,
                        fontSize: 15, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>&#xff0b;</span>
                    Add from gallery
                </button>

                {customCoverFile && (
                    <button
                        onClick={() => setCustomCover(null)}
                        style={{
                            background: 'none', border: 'none', color: '#1877F2',
                            fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 8,
                        }}
                    >Remove custom cover</button>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAddFromGallery}
            />
        </div>
    );
}
