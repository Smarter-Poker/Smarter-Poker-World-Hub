/**
 * SESSION SHARE CARD — Shareable Results Image Generator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 19: Generates a beautiful, shareable results card that users can
 * download or share on social media. Uses SVG → Canvas → PNG pipeline.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CLASSIFICATION_CONFIG } from '../../hooks/useGTOWScore';
import { getArenaScoreColor, formatSignedScore } from '../../engines/GTOScoreEngine';

const CARD_WIDTH = 600;
const CARD_HEIGHT = 400;

function generateCardSVG({ gameName, level, gtowScore, totalQuestions, correctCount, totalEVLoss, bestStreak, classificationCounts, sessionMistakes }) {
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    // GTOW parity #25: gtowScore is on the signed -100..+100 scale. The legacy
    // 80/60 ramp and the 90/80/70/60/50 grade ladder were written for 0-100 and
    // stamped an "F" onto shareable cards from perfectly good sessions. Old
    // cut-offs map through v*2-100.
    const scoreColor = getArenaScoreColor(gtowScore);
    const grade = gtowScore >= 80 ? 'S' : gtowScore >= 60 ? 'A' : gtowScore >= 40 ? 'B' : gtowScore >= 20 ? 'C' : gtowScore >= 0 ? 'D' : 'F';

    // Classification bars
    const classKeys = ['best', 'correct', 'inaccuracy', 'wrong', 'blunder'];
    const classColors = { best: '#22c55e', correct: '#3b82f6', inaccuracy: '#fbbf24', wrong: '#f97316', blunder: '#ef4444' };
    const total = classKeys.reduce((sum, k) => sum + (classificationCounts?.[k] || 0), 0) || 1;

    const barY = 245;
    const barHeight = 12;
    let barX = 40;
    const barWidth = CARD_WIDTH - 80;

    const classBarSegments = classKeys.map(k => {
        const count = classificationCounts?.[k] || 0;
        const pct = count / total;
        const w = Math.max(pct > 0 ? 2 : 0, pct * barWidth);
        const segment = { key: k, x: barX, w, color: classColors[k], count, pct };
        barX += w;
        return segment;
    });

    // Stats
    const evPerHand = totalQuestions > 0 ? (totalEVLoss / totalQuestions).toFixed(2) : '0.00';
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#0f172a"/>
                <stop offset="50%" style="stop-color:#1e1b4b"/>
                <stop offset="100%" style="stop-color:#0f172a"/>
            </linearGradient>
            <linearGradient id="scoreGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:${scoreColor};stop-opacity:0.3"/>
                <stop offset="100%" style="stop-color:${scoreColor};stop-opacity:0"/>
            </linearGradient>
            <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>

        <!-- Background -->
        <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="16" fill="url(#bg)"/>
        <rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="16" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

        <!-- Score glow circle -->
        <circle cx="${CARD_WIDTH / 2}" cy="105" r="70" fill="url(#scoreGlow)"/>

        <!-- Title bar -->
        <text x="${CARD_WIDTH / 2}" y="30" text-anchor="middle" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="700" fill="#64748b" letter-spacing="2">${(gameName || 'GTO TRAINING').toUpperCase()}</text>
        <text x="${CARD_WIDTH / 2}" y="48" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="#475569">Level ${level || 1} • ${date}</text>

        <!-- Big score circle -->
        <circle cx="${CARD_WIDTH / 2}" cy="120" r="52" fill="rgba(0,0,0,0.4)" stroke="${scoreColor}" stroke-width="3" filter="url(#glow)"/>
        <text x="${CARD_WIDTH / 2}" y="115" text-anchor="middle" font-family="Inter, monospace" font-size="36" font-weight="900" fill="${scoreColor}">${formatSignedScore(gtowScore)}</text>
        <text x="${CARD_WIDTH / 2}" y="135" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#94a3b8">GTOW SCORE</text>

        <!-- Grade badge -->
        <rect x="${CARD_WIDTH / 2 + 46}" y="80" width="28" height="28" rx="6" fill="${scoreColor}20" stroke="${scoreColor}" stroke-width="1.5"/>
        <text x="${CARD_WIDTH / 2 + 60}" y="100" text-anchor="middle" font-family="Inter, monospace" font-size="16" font-weight="900" fill="${scoreColor}">${grade}</text>

        <!-- Stats row -->
        <text x="80" y="200" text-anchor="middle" font-family="Inter, monospace" font-size="20" font-weight="800" fill="#e2e8f0">${accuracy}%</text>
        <text x="80" y="215" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#64748b">ACCURACY</text>

        <text x="200" y="200" text-anchor="middle" font-family="Inter, monospace" font-size="20" font-weight="800" fill="#00d4ff">${totalQuestions}</text>
        <text x="200" y="215" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#64748b">HANDS</text>

        <text x="320" y="200" text-anchor="middle" font-family="Inter, monospace" font-size="20" font-weight="800" fill="#fbbf24">${bestStreak || 0}</text>
        <text x="320" y="215" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#64748b">BEST STREAK</text>

        <text x="440" y="200" text-anchor="middle" font-family="Inter, monospace" font-size="20" font-weight="800" fill="${totalEVLoss > 5 ? '#ef4444' : '#22c55e'}">${evPerHand}</text>
        <text x="440" y="215" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#64748b">EV/HAND</text>

        <text x="540" y="200" text-anchor="middle" font-family="Inter, monospace" font-size="20" font-weight="800" fill="${sessionMistakes > 5 ? '#ef4444' : '#22c55e'}">${sessionMistakes || 0}</text>
        <text x="540" y="215" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#64748b">MISTAKES</text>

        <!-- Classification bar -->
        <text x="40" y="${barY - 6}" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="#64748b" letter-spacing="1">MOVE BREAKDOWN</text>
        ${classBarSegments.map((s, i) => `<rect x="${s.x}" y="${barY}" width="${s.w}" height="${barHeight}" rx="${i === 0 ? '4' : '0'}" fill="${s.color}"/>`).join('\n        ')}

        <!-- Classification labels -->
        ${classBarSegments.map((s, i) => {
            const labelX = 40 + (i * (barWidth / 5)) + (barWidth / 10);
            return `
            <circle cx="${labelX - 30}" cy="${barY + barHeight + 18}" r="4" fill="${s.color}"/>
            <text x="${labelX - 22}" y="${barY + barHeight + 22}" font-family="Inter, sans-serif" font-size="9" font-weight="600" fill="#94a3b8">${s.key.charAt(0).toUpperCase() + s.key.slice(1)} ${s.count}</text>`;
        }).join('')}

        <!-- Divider -->
        <line x1="40" y1="${CARD_HEIGHT - 55}" x2="${CARD_WIDTH - 40}" y2="${CARD_HEIGHT - 55}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

        <!-- Footer branding -->
        <text x="40" y="${CARD_HEIGHT - 28}" font-family="Inter, sans-serif" font-size="14" font-weight="800" fill="#e2e8f0">smarter.poker</text>
        <text x="40" y="${CARD_HEIGHT - 14}" font-family="Inter, sans-serif" font-size="9" fill="#475569">GTO Training • Train Smarter. Play Smarter.</text>
        <text x="${CARD_WIDTH - 40}" y="${CARD_HEIGHT - 20}" text-anchor="end" font-family="Inter, sans-serif" font-size="9" fill="#475569">${accuracy >= 70 ? 'PASSED' : 'TRAINING'} • Level ${level || 1}</text>
    </svg>`;
}

export default function SessionShareCard({
    gameName, level, gtowScore, totalQuestions, correctCount,
    totalEVLoss, bestStreak, classificationCounts, sessionMistakes,
    onClose,
}) {
    const canvasRef = useRef(null);
    const [status, setStatus] = useState(null); // 'generating' | 'ready' | 'copied' | 'downloaded' | 'error'
    const [imageUrl, setImageUrl] = useState(null);

    const generateImage = useCallback(async () => {
        setStatus('generating');
        try {
            const svg = generateCardSVG({
                gameName, level, gtowScore, totalQuestions, correctCount,
                totalEVLoss, bestStreak, classificationCounts, sessionMistakes,
            });

            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            // Create image from SVG
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = CARD_WIDTH * 2; // 2x for retina
                canvas.height = CARD_HEIGHT * 2;
                const ctx = canvas.getContext('2d');
                ctx.scale(2, 2);
                ctx.drawImage(img, 0, 0, CARD_WIDTH, CARD_HEIGHT);
                URL.revokeObjectURL(url);

                const pngUrl = canvas.toDataURL('image/png');
                setImageUrl(pngUrl);
                setStatus('ready');
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                // Fallback: just show SVG
                setImageUrl(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`);
                setStatus('ready');
            };
            img.src = url;
        } catch (err) {
            console.warn('[ShareCard] Generation error:', err);
            setStatus('error');
        }
    }, [gameName, level, gtowScore, totalQuestions, correctCount, totalEVLoss, bestStreak, classificationCounts, sessionMistakes]);

    // Auto-generate on mount
    React.useEffect(() => { generateImage(); }, [generateImage]);

    const handleDownload = useCallback(() => {
        if (!imageUrl) return;
        const link = document.createElement('a');
        link.download = `smarter-poker-session-${Date.now()}.png`;
        link.href = imageUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatus('downloaded');
        setTimeout(() => setStatus('ready'), 2000);
    }, [imageUrl]);

    const handleCopyImage = useCallback(async () => {
        if (!imageUrl) return;
        try {
            // Try clipboard API
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            setStatus('copied');
            setTimeout(() => setStatus('ready'), 2000);
        } catch (err) {
            console.warn('[ShareCard] Clipboard copy failed:', err?.message || err);
            // Fallback: copy text to clipboard
            try {
                await navigator.clipboard.writeText(`I scored ${formatSignedScore(gtowScore)} on smarter.poker!`);
                setStatus('copied');
                setTimeout(() => setStatus('ready'), 2000);
            } catch {
                setStatus('error');
            }
        }
    }, [imageUrl, gtowScore]);

    const handleNativeShare = useCallback(async () => {
        if (!navigator.share) {
            handleCopyImage();
            return;
        }
        try {
            const shareData = {
                title: `GTO Training - ${formatSignedScore(gtowScore)} Score`,
                text: `I scored ${formatSignedScore(gtowScore)} in ${gameName || 'GTO Training'} on smarter.poker! ${correctCount}/${totalQuestions} correct.`,
                url: 'https://smarter.poker',
            };
            // Try sharing with image if available
            if (imageUrl) {
                try {
                    const res = await fetch(imageUrl);
                    const blob = await res.blob();
                    const file = new File([blob], 'smarter-poker-results.png', { type: 'image/png' });
                    shareData.files = [file];
                } catch (e) { console.warn('[App] Handled exception:', e); }
            }
            await navigator.share(shareData);
        } catch (err) {
            if (err.name !== 'AbortError') handleCopyImage();
        }
    }, [imageUrl, gtowScore, gameName, correctCount, totalQuestions, handleCopyImage]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={styles.overlay}
                onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    style={styles.card}
                >
                    {/* Close button */}
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>

                    {/* Preview */}
                    {status === 'generating' && (
                        <motion.div
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 40 }}
                        >
                            Generating share card...
                        </motion.div>
                    )}

                    {imageUrl && (
                        <img
                            src={imageUrl}
                            alt="Session Results"
                            style={styles.preview}
                        />
                    )}

                    {/* Action buttons */}
                    {(status === 'ready' || status === 'copied' || status === 'downloaded') && (
                        <div style={styles.actions}>
                            <button onClick={handleNativeShare} style={{ ...styles.actionBtn, ...styles.primaryBtn }}>
                                {typeof navigator !== 'undefined' && navigator.share ? 'Share' : 'Copy'}
                            </button>
                            <button onClick={handleDownload} style={styles.actionBtn}>
                                {status === 'downloaded' ? '✓ Saved!' : 'Download PNG'}
                            </button>
                            <button onClick={handleCopyImage} style={styles.actionBtn}>
                                {status === 'copied' ? '✓ Copied!' : 'Copy Image'}
                            </button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div style={{ color: '#ef4444', fontSize: 11, textAlign: 'center', padding: 8 }}>
                            Failed to generate. Try again.
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

const styles = {
    overlay: {
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
    },
    card: {
        position: 'relative',
        background: '#0f172a', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: 16, maxWidth: 640, width: '100%',
    },
    closeBtn: {
        position: 'absolute', top: 8, right: 8,
        background: 'rgba(255,255,255,0.05)', border: 'none',
        borderRadius: 8, width: 32, height: 32,
        color: '#64748b', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    preview: {
        width: '100%', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.06)',
    },
    actions: {
        display: 'flex', gap: 8, marginTop: 12,
    },
    actionBtn: {
        flex: 1, padding: '10px 0', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)',
        color: '#e2e8f0', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.15s',
    },
    primaryBtn: {
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        border: 'none', color: '#fff',
    },
};
