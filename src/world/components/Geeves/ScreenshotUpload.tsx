/* ═══════════════════════════════════════════════════════════════════════════
   SCREENSHOT UPLOAD — Paste or upload poker table screenshots for analysis
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useCallback } from 'react';

interface ScreenshotUploadProps {
    onAnalyze: (base64: string) => void;
    isAnalyzing?: boolean;
}

export function ScreenshotUpload({ onAnalyze, isAnalyzing = false }: ScreenshotUploadProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) return;
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be under 5MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            setPreview(base64);
        };
        reader.readAsDataURL(file);
    }, []);

    // Handle paste from clipboard
    const handlePaste = useCallback((e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) processFile(file);
                break;
            }
        }
    }, [processFile]);

    // Attach paste listener
    React.useEffect(() => {
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleSend = () => {
        if (preview) {
            onAnalyze(preview);
            setPreview(null);
        }
    };

    const handleCancel = () => {
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (preview) {
        return (
            <div style={{
                padding: '12px',
                background: 'rgba(0, 20, 40, 0.9)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: '12px',
                marginBottom: '8px',
            }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                    📸 Screenshot Preview
                </div>
                <img
                    src={preview}
                    alt="Screenshot preview"
                    style={{
                        maxWidth: '100%',
                        maxHeight: '200px',
                        borderRadius: '8px',
                        border: '1px solid rgba(0, 212, 255, 0.2)',
                    }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                        onClick={handleSend}
                        disabled={isAnalyzing}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: 'linear-gradient(135deg, #00d4ff, #0088ff)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: isAnalyzing ? 'wait' : 'pointer',
                            opacity: isAnalyzing ? 0.6 : 1,
                        }}
                    >
                        {isAnalyzing ? 'Analyzing...' : 'Analyze Screenshot'}
                    </button>
                    <button
                        onClick={handleCancel}
                        style={{
                            padding: '8px 16px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '8px',
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                title="Upload screenshot (or paste with Ctrl+V)"
                style={{
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
            </button>
        </>
    );
}
