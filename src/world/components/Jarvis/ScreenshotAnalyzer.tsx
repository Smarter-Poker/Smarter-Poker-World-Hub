/* ═══════════════════════════════════════════════════════════════════════════
   SCREENSHOT ANALYZER — Upload poker table screenshots for AI analysis
   Uses Grok Vision API to read and analyze the game state
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef } from 'react';

interface ScreenshotAnalyzerProps {
    onAnalysis: (analysis: string) => void;
    onClose?: () => void;
}

export function ScreenshotAnalyzer({ onAnalysis, onClose }: ScreenshotAnalyzerProps) {
    const [image, setImage] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) handleFileSelect(file);
                break;
            }
        }
    };

    const analyzeImage = async () => {
        if (!image) return;

        setIsAnalyzing(true);
        try {
            const response = await fetch('/api/jarvis/analyze-screenshot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('smarter-poker-auth') ?
                        JSON.parse(localStorage.getItem('smarter-poker-auth')!).access_token : ''}`
                },
                body: JSON.stringify({ image })
            });

            if (!response.ok) throw new Error('Analysis failed');

            const data = await response.json();
            onAnalysis(data.analysis);
            onClose?.();
        } catch (error) {
            console.error('[ScreenshotAnalyzer] Error:', error);
            onAnalysis("I couldn't analyze that screenshot. Please try again with a clearer image of a poker table.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div
            style={{
                background: 'rgba(20, 10, 40, 0.98)',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                maxWidth: '400px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
            onPaste={handlePaste}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h4 style={{
                    margin: 0,
                    color: '#FFD700',
                    fontSize: '14px',
                    fontWeight: 600
                }}>
                    📸 Screenshot Analyzer
                </h4>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Drop Zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                    border: `2px dashed ${dragOver ? '#FFD700' : 'rgba(255, 215, 0, 0.3)'}`,
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: dragOver ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.2s ease',
                    marginBottom: '12px'
                }}
            >
                {image ? (
                    <img
                        src={image}
                        alt="Poker table screenshot"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '200px',
                            borderRadius: '6px'
                        }}
                    />
                ) : (
                    <>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
                        <p style={{
                            margin: 0,
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '13px'
                        }}>
                            Drop screenshot here, click to upload,<br />
                            or <strong style={{ color: '#FFD700' }}>Ctrl+V</strong> to paste
                        </p>
                    </>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
            />

            {/* Tips */}
            <div style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: '12px',
                lineHeight: 1.5
            }}>
                <strong style={{ color: '#FFD700' }}>💡 Tips:</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                    <li>Works with PokerStars, GGPoker, ACR, etc.</li>
                    <li>Include visible hole cards and board</li>
                    <li>Stack sizes and pot size help accuracy</li>
                </ul>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
                {image && (
                    <button
                        onClick={() => setImage(null)}
                        style={{
                            padding: '10px 16px',
                            background: 'rgba(255, 100, 100, 0.2)',
                            border: '1px solid rgba(255, 100, 100, 0.3)',
                            borderRadius: '6px',
                            color: '#ff6666',
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        Clear
                    </button>
                )}
                <button
                    onClick={analyzeImage}
                    disabled={!image || isAnalyzing}
                    style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: image && !isAnalyzing
                            ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                            : 'rgba(255, 215, 0, 0.2)',
                        border: 'none',
                        borderRadius: '6px',
                        color: image && !isAnalyzing ? '#000' : 'rgba(255, 255, 255, 0.3)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: image && !isAnalyzing ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                    }}
                >
                    {isAnalyzing ? (
                        <>
                            <span className="spinner" />
                            Analyzing...
                        </>
                    ) : (
                        <>🔍 Analyze Hand</>
                    )}
                </button>
            </div>

            <style jsx>{`
                .spinner {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(0,0,0,0.2);
                    border-top-color: #000;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
