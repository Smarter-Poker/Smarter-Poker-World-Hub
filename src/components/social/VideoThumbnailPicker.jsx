import React, { useState, useEffect } from 'react';
import { generateFrames, captureFrameAt } from '../../lib/videoCompressor';
import { SP_COLORS } from './SmarterPokerStyleCard';

export const VideoThumbnailPicker = ({ file, currentThumbnail, onSelect }) => {
    const [frames, setFrames] = useState([]);
    const [loading, setLoading] = useState(true);
    // 2026-08-15 media-quality fix: the value handed to onSelect is now a
    // high-res re-capture, not the filmstrip tile, so `currentThumbnail ===
    // frame.dataUrl` no longer identifies the active tile. Track the index.
    const [selectedIdx, setSelectedIdx] = useState(null);

    // Keep onSelect stable so effects don't need it as a dep
    const onSelectRef = React.useRef(onSelect);
    React.useLayoutEffect(() => { onSelectRef.current = onSelect; });

    // Detect mobile — skip HEVC frame generation entirely on iOS/Android.
    // generateFrames() decodes the full video stream, which causes OOM crashes
    // and 30+ second hangs on iPhones with HEVC content. Mobile users get a
    // clean "Add Cover Photo" button instead; desktop keeps the filmstrip.
    const isMobile = typeof navigator !== 'undefined'
        && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');

    useEffect(() => {
        // Never attempt frame extraction on mobile — OOM / hang risk
        if (isMobile) { setLoading(false); return; }
        let mounted = true;
        if (!file) return;

        const loadFrames = async () => {
            setLoading(true);
            try {
                // Generate 6 frames evenly spaced
                const generated = await generateFrames(file, 6);
                if (!mounted) return;

                const validFrames = generated.filter(f => f && f.dataUrl);
                setFrames(validFrames);

                // Auto-select first frame only if no thumbnail is already set
                if (!currentThumbnail && validFrames.length > 0) {
                    setSelectedIdx(0);
                    // Show the cheap tile immediately, then upgrade in place.
                    onSelectRef.current(validFrames[0].dataUrl);
                    const hi = await captureFrameAt(file, validFrames[0].timeSeconds);
                    if (mounted && hi) onSelectRef.current(hi);
                }
            } catch (err) {
                console.warn('Failed to load video frames', err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadFrames();
        return () => { mounted = false; };
    }, [file, isMobile]);

    const handleCustomUpload = (e) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target.result) {
                onSelect(event.target.result);
            }
        };
        reader.readAsDataURL(uploadedFile);
    };

    if (!file) return null;

    // ── MOBILE: Custom image upload only (no frame decode) ──────────────────
    if (isMobile) {
        return (
            <div className="sp-thumbnail-picker">
                <div className="picker-header">
                    <span className="picker-title">Cover Image</span>
                    <span className="picker-subtitle">Upload a cover photo for your video</span>
                </div>
                <div className="mobile-cover-row">
                    {currentThumbnail && (
                        <div className="mobile-current-thumb">
                            <img src={currentThumbnail} alt="Selected cover" />
                        </div>
                    )}
                    <label className="mobile-upload-btn">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleCustomUpload}
                            style={{ display: 'none' }}
                        />
                        <span className="icon">📸</span>
                        <span className="label">
                            {currentThumbnail ? 'Change Cover' : 'Add Cover Photo'}
                        </span>
                    </label>
                </div>
                <style>{`
                    .sp-thumbnail-picker {
                        background: rgba(0,0,0,0.2);
                        border-radius: 8px;
                        padding: 12px;
                        margin-top: 12px;
                        margin-bottom: 16px;
                    }
                    .picker-header { margin-bottom: 12px; }
                    .picker-title {
                        display: block;
                        font-weight: 600;
                        color: ${SP_COLORS.textPrimary};
                        font-size: 14px;
                    }
                    .picker-subtitle {
                        display: block;
                        font-size: 12px;
                        color: ${SP_COLORS.textSecondary};
                        margin-top: 2px;
                    }
                    .mobile-cover-row {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-top: 8px;
                    }
                    .mobile-current-thumb {
                        width: 72px;
                        height: 48px;
                        border-radius: 6px;
                        overflow: hidden;
                        flex-shrink: 0;
                        border: 2px solid ${SP_COLORS.blue};
                    }
                    .mobile-current-thumb img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    }
                    .mobile-upload-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        background: ${SP_COLORS.bgHover};
                        border: 1px dashed ${SP_COLORS.divider};
                        border-radius: 8px;
                        padding: 10px 16px;
                        cursor: pointer;
                        flex: 1;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .mobile-upload-btn:active {
                        border-color: ${SP_COLORS.blue};
                        background: ${SP_COLORS.bgMain};
                    }
                    .mobile-upload-btn .icon { font-size: 20px; }
                    .mobile-upload-btn .label {
                        font-size: 14px;
                        font-weight: 500;
                        color: ${SP_COLORS.textPrimary};
                    }
                `}</style>
            </div>
        );
    }

    // ── DESKTOP: Full 6-frame filmstrip picker ───────────────────────────────
    return (
        <div className="sp-thumbnail-picker">
            <div className="picker-header">
                <span className="picker-title">Cover Image</span>
                <span className="picker-subtitle">Choose a frame or upload a custom cover</span>
            </div>
            
            <div className="picker-content">
                {/* Active Selection Preview */}
                <div className="active-preview">
                    {currentThumbnail ? (
                        <img src={currentThumbnail} alt="Selected Cover" />
                    ) : (
                        <div className="empty-preview">
                            {loading ? <div className="spinner"></div> : 'No cover'}
                        </div>
                    )}
                </div>
                
                {/* Filmstrip & Custom Upload */}
                <div className="filmstrip-container">
                    <label className="custom-upload-btn">
                        <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleCustomUpload} 
                            style={{ display: 'none' }} 
                        />
                        <span className="icon">📸</span>
                        <span className="label">Custom</span>
                    </label>
                    
                    <div className="filmstrip">
                        {loading && frames.length === 0 ? (
                            <div className="loading-frames">Generating frames...</div>
                        ) : (
                            frames.map((frame, idx) => (
                                <button 
                                    key={idx}
                                    className={`frame-btn ${selectedIdx === idx || currentThumbnail === frame.dataUrl ? 'active' : ''}`}
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        setSelectedIdx(idx);
                                        // Instant feedback from the filmstrip
                                        // tile, then swap in the poster-quality
                                        // recapture of the same timestamp.
                                        onSelectRef.current(frame.dataUrl);
                                        const hi = await captureFrameAt(file, frame.timeSeconds);
                                        if (hi) onSelectRef.current(hi);
                                    }}
                                >
                                    <img src={frame.dataUrl} alt={`Frame ${idx}`} />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .sp-thumbnail-picker {
                    background: rgba(0,0,0,0.2);
                    border-radius: 8px;
                    padding: 12px;
                    margin-top: 12px;
                    margin-bottom: 16px;
                }
                
                .picker-header {
                    margin-bottom: 12px;
                }
                
                .picker-title {
                    display: block;
                    font-weight: 600;
                    color: ${SP_COLORS.textPrimary};
                    font-size: 14px;
                }
                
                .picker-subtitle {
                    display: block;
                    font-size: 12px;
                    color: ${SP_COLORS.textSecondary};
                    margin-top: 2px;
                }
                
                .picker-content {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                .active-preview {
                    width: 100%;
                    height: 160px;
                    background: #111;
                    border-radius: 6px;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .active-preview img {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                }
                
                .empty-preview {
                    color: ${SP_COLORS.textSecondary};
                    font-size: 13px;
                }
                
                .filmstrip-container {
                    display: flex;
                    gap: 8px;
                    align-items: stretch;
                    height: 60px;
                }
                
                .custom-upload-btn {
                    width: 60px;
                    min-width: 60px;
                    background: ${SP_COLORS.bgHover};
                    border: 1px dashed ${SP_COLORS.divider};
                    border-radius: 6px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    gap: 4px;
                }
                
                .custom-upload-btn:hover {
                    background: ${SP_COLORS.bgMain};
                    border-color: ${SP_COLORS.blue};
                }
                
                .custom-upload-btn .icon {
                    font-size: 18px;
                }
                
                .custom-upload-btn .label {
                    font-size: 10px;
                    color: ${SP_COLORS.textSecondary};
                }
                
                .filmstrip {
                    flex: 1;
                    display: flex;
                    gap: 4px;
                    overflow-x: auto;
                    padding-bottom: 4px; /* for scrollbar */
                }
                
                .filmstrip::-webkit-scrollbar {
                    height: 4px;
                }
                
                .filmstrip::-webkit-scrollbar-thumb {
                    background: ${SP_COLORS.divider};
                    border-radius: 2px;
                }
                
                .frame-btn {
                    flex: 0 0 40px;
                    height: 100%;
                    padding: 0;
                    border: 2px solid transparent;
                    border-radius: 4px;
                    overflow: hidden;
                    cursor: pointer;
                    background: #222;
                }
                
                .frame-btn.active {
                    border-color: ${SP_COLORS.blue};
                }
                
                .frame-btn img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                
                .loading-frames {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    font-size: 12px;
                    color: ${SP_COLORS.textSecondary};
                }
                
                /* Simple spinner */
                .spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid ${SP_COLORS.divider};
                    border-top-color: ${SP_COLORS.blue};
                    border-radius: 50%;
                    animation: sp-spin 1s linear infinite;
                }
                
                @keyframes sp-spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
