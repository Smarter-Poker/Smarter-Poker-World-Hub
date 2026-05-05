/**
 * NEW USER WELCOME MODAL — "Welcome To Smarter.Poker" Official
 * Uses the exact premium popup image provided by the founder.
 * Clickable hotspots overlaid on the image:
 *   • Diamonds card  → /hub/diamond-store
 *   • VIP card       → /hub/diamond-store?tab=vip
 *   • "Let's Go!"    → /hub (World Hub)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * May 5, 2026 — Rebuilt to use the official Welcome To Smarter.Poker
 * image as the entire popup. All interactive areas are transparent
 * overlays positioned with percentage-based coordinates so they stay
 * aligned on every screen size.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const ANIM = `
    @keyframes welcomeFadeIn { from { opacity:0; transform:scale(0.92) translateY(24px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes welcomePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(100,180,255,0); } 50% { box-shadow: 0 0 18px 4px rgba(100,180,255,0.25); } }
    .welcome-hotspot:hover { box-shadow: 0 0 20px 4px rgba(100,180,255,0.3) !important; }
    .welcome-hotspot:active { box-shadow: 0 0 30px 6px rgba(100,180,255,0.45) !important; transform: scale(0.98); }
`;

export default function NewUserWelcomeModal({ isOpen, onClose, userName }) {
    const [isVisible, setIsVisible] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (isOpen) {
            // Slight delay for dramatic entrance
            setTimeout(() => setIsVisible(true), 100);
        }
    }, [isOpen]);

    const handleNavigate = (path) => {
        setIsVisible(false);
        setTimeout(() => {
            onClose();
            router.push(path);
        }, 300);
    };

    const handleLetsGo = () => handleNavigate('/hub');
    const handleDiamonds = () => handleNavigate('/hub/diamond-store');
    const handleVIP = () => handleNavigate('/hub/diamond-store?activeTab=vip');

    if (!isOpen) return null;

    return (
        <>
            <style>{ANIM}</style>
            <div style={s.overlay} onClick={handleLetsGo}>
                <div
                    style={{
                        ...s.modal,
                        opacity: isVisible ? 1 : 0,
                        transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(24px)',
                        transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* The official Welcome To Smarter.Poker image */}
                    <img
                        src="/images/welcome-popup.jpg"
                        alt="Welcome To Smarter.Poker — 500 Diamonds + 30-Day VIP Card"
                        style={s.heroImage}
                        draggable={false}
                    />

                    {/* ── Invisible Clickable Hotspots ────────────────────────── */}

                    {/* Diamonds card hotspot (left card) */}
                    <button
                        className="welcome-hotspot"
                        onClick={handleDiamonds}
                        style={{ ...s.hotspot, ...s.diamondsHotspot }}
                        aria-label="View Your 500 Diamonds"
                        title="Go to Diamond Wallet"
                    />

                    {/* VIP card hotspot (right card) */}
                    <button
                        className="welcome-hotspot"
                        onClick={handleVIP}
                        style={{ ...s.hotspot, ...s.vipHotspot }}
                        aria-label="View Your 30-Day VIP Card"
                        title="Go to VIP Card"
                    />

                    {/* "Let's Go!" button hotspot (bottom CTA) */}
                    <button
                        className="welcome-hotspot"
                        onClick={handleLetsGo}
                        style={{ ...s.hotspot, ...s.letsGoHotspot }}
                        aria-label="Let's Go — Enter The World Hub"
                        title="Enter The World Hub"
                    />
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────
// STYLES — Image-first popup with invisible clickable hotspots
// All hotspot positions use percentage-based coordinates so they
// scale correctly with the image on any screen size.
// ─────────────────────────────────────────────────────────────────────
const s = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: 16,
    },
    modal: {
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 0 80px rgba(0,0,0,0.8), 0 0 40px rgba(80,160,255,0.15)',
    },
    heroImage: {
        display: 'block',
        width: '100%',
        height: 'auto',
        borderRadius: 20,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        pointerEvents: 'none',
    },
    // Base hotspot — invisible, accessible button
    hotspot: {
        position: 'absolute',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        margin: 0,
        outline: 'none',
        borderRadius: 12,
        // Subtle hover glow so users feel the interactivity
        transition: 'box-shadow 0.2s ease',
    },
    // Diamonds card — left half, middle area
    diamondsHotspot: {
        left: '5%',
        top: '38%',
        width: '44%',
        height: '32%',
    },
    // VIP card — right half, middle area
    vipHotspot: {
        right: '5%',
        top: '38%',
        width: '44%',
        height: '32%',
    },
    // "Let's Go!" CTA — bottom center
    letsGoHotspot: {
        left: '18%',
        bottom: '6%',
        width: '64%',
        height: '10%',
        borderRadius: 8,
    },
};
