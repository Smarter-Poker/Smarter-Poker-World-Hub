import React, { useState, useEffect } from 'react';
import { generateFrames } from '../../lib/videoCompressor';
import { SP_COLORS } from './SmarterPokerStyleCard';

export const VideoThumbnailPicker = ({ file, currentThumbnail, onSelect }) => {
    const [frames, setFrames] = useState([]);
    const [loading, setLoading] = useState(true);
    // Keep onSelect in a ref so the effect doesn't need it as a dep (avoids stale closure)
    const onSelectRef = React.useRef(onSelect);
    React.useLayoutEffect(() => { onSelectRef.current = onSelect; });

    useEffect(() => {
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
                
                // If we don't have a current thumbnail yet, pick the first frame
                if (!currentThumbnail && validFrames.length > 0) {
                    onSelectRef.current(validFrames[0].dataUrl);
                }
            } catch (err) {
                console.warn('Failed to load video frames', err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadFrames();
        return () => { mounted = false; };
    }, [file]);

    const handleCustomUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target.result) {
                onSelect(event.target.result);
            }
        };
        reader.readAsDataURL(file);
    };

    if (!file) return null;

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
                                    className={`frame-btn ${currentThumbnail === frame.dataUrl ? 'active' : ''}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onSelectRef.current(frame.dataUrl);
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
