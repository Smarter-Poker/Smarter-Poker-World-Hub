// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER POKER — PREMIUM VIDEO GAME LOBBY
   Exact replica of the mockup design with:
   - Glassmorphism header bar
   - Left side floating menu orbs
   - Holographic 3D carousel with light beam
   - Purple/Cyan/Pink gradient palette
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 FLOATING SIDE MENU ORB
// ─────────────────────────────────────────────────────────────────────────────
interface SideMenuOrbProps {
    icon: string;
    label: string;
    onClick: () => void;
    index: number;
}

function SideMenuOrb({ icon, label, onClick, index }: SideMenuOrbProps) {
    const [hovered, setHovered] = useState(false);
    const [ringOpacity, setRingOpacity] = useState(0.3);

    useEffect(() => {
        const interval = setInterval(() => {
            const t = Date.now() / 1000;
            const pulse = (Math.sin(t * 1.5 + index) + 1) / 2;
            setRingOpacity(0.2 + pulse * 0.3);
        }, 50);
        return () => clearInterval(interval);
    }, [index]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                cursor: 'pointer',
                transition: 'transform 0.3s ease',
                transform: hovered ? 'translateX(8px) scale(1.05)' : 'translateX(0)',
            }}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Holographic Ring Base */}
            <div style={{ position: 'relative' }}>
                {/* Outer ring */}
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotateX(60deg)',
                        width: 70,
                        height: 20,
                        borderRadius: '50%',
                        border: `2px solid rgba(0, 212, 255, ${ringOpacity})`,
                        boxShadow: `0 0 15px rgba(0, 212, 255, ${ringOpacity * 0.5})`,
                    }}
                />
                {/* Icon orb */}
                <div
                    style={{
                        width: 50,
                        height: 50,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(20, 30, 60, 0.9), rgba(10, 20, 40, 0.95))',
                        border: '2px solid rgba(0, 212, 255, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        boxShadow: hovered
                            ? '0 0 25px rgba(0, 212, 255, 0.6), inset 0 0 15px rgba(0, 212, 255, 0.2)'
                            : '0 0 15px rgba(0, 212, 255, 0.3)',
                        transition: 'box-shadow 0.3s ease',
                    }}
                >
                    {icon}
                </div>
            </div>
            {/* Label */}
            <span
                style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 14,
                    fontWeight: 600,
                    color: hovered ? '#00d4ff' : 'rgba(255, 255, 255, 0.9)',
                    textShadow: hovered ? '0 0 10px rgba(0, 212, 255, 0.5)' : 'none',
                    letterSpacing: 1,
                    transition: 'color 0.3s ease, text-shadow 0.3s ease',
                }}
            >
                {label}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🃏 HOLOGRAPHIC MAIN CARD
// ─────────────────────────────────────────────────────────────────────────────
interface HoloCardProps {
    icon: string;
    label: string;
    color: string;
    onClick: () => void;
    offset: number; // -1, 0, 1 for left, center, right
    isActive: boolean;
}

function HoloCard({ icon, label, color, onClick, offset, isActive }: HoloCardProps) {
    const rotateY = offset * 25;
    const translateX = offset * 180;
    const translateZ = isActive ? 50 : -Math.abs(offset) * 100;
    const scale = isActive ? 1 : 0.85;
    const opacity = isActive ? 1 : 0.7;

    return (
        <div
            style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `
                    translateX(calc(-50% + ${translateX}px))
                    translateY(-50%)
                    translateZ(${translateZ}px)
                    rotateY(${rotateY}deg)
                    scale(${scale})
                `,
                width: 180,
                height: 260,
                cursor: 'pointer',
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity,
                transformStyle: 'preserve-3d',
            }}
            onClick={onClick}
        >
            {/* Glass card */}
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 20,
                    background: `linear-gradient(135deg, 
                        rgba(${color}, 0.3) 0%, 
                        rgba(${color}, 0.15) 50%,
                        rgba(${color}, 0.25) 100%)`,
                    backdropFilter: 'blur(10px)',
                    border: `2px solid rgba(255, 255, 255, 0.3)`,
                    boxShadow: `
                        0 0 40px rgba(${color}, 0.4),
                        inset 0 0 30px rgba(255, 255, 255, 0.1),
                        0 20px 60px rgba(0, 0, 0, 0.5)
                    `,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 20,
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Shine effect */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '50%',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)',
                        borderRadius: '20px 20px 0 0',
                    }}
                />

                {/* Icon */}
                <div
                    style={{
                        fontSize: 60,
                        filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.5))',
                    }}
                >
                    {icon}
                </div>

                {/* Label */}
                <span
                    style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#ffffff',
                        textShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
                        letterSpacing: 2,
                    }}
                >
                    {label}
                </span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 📰 BOTTOM CARD
// ─────────────────────────────────────────────────────────────────────────────
interface BottomCardProps {
    imageUrl?: string;
    label: string;
    onClick: () => void;
}

function BottomCard({ imageUrl, label, onClick }: BottomCardProps) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                transform: hovered ? 'translateY(-8px) scale(1.05)' : 'translateY(0)',
                transition: 'transform 0.3s ease',
            }}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div
                style={{
                    width: 140,
                    height: 90,
                    borderRadius: 12,
                    background: imageUrl
                        ? `url('${imageUrl}') center/cover`
                        : 'linear-gradient(135deg, rgba(30, 40, 70, 0.9), rgba(20, 30, 50, 0.95))',
                    border: '2px solid rgba(0, 212, 255, 0.4)',
                    boxShadow: hovered
                        ? '0 0 25px rgba(0, 212, 255, 0.5), 0 10px 30px rgba(0, 0, 0, 0.5)'
                        : '0 0 15px rgba(0, 212, 255, 0.2), 0 5px 20px rgba(0, 0, 0, 0.4)',
                    transition: 'box-shadow 0.3s ease',
                }}
            />
            <span
                style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.9)',
                    textShadow: '0 0 8px rgba(0, 212, 255, 0.4)',
                    letterSpacing: 1,
                }}
            >
                {label}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌍 PREMIUM HUB — MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function PremiumHub() {
    const router = useRouter();
    const [activeCard, setActiveCard] = useState(1); // 0=left, 1=center, 2=right
    const [diamonds, setDiamonds] = useState(10000);
    const [particlePositions, setParticlePositions] = useState<Array<{ x: number, y: number, size: number, speed: number }>>([]);

    // Initialize floating particles
    useEffect(() => {
        const particles = Array.from({ length: 30 }, () => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 1 + Math.random() * 3,
            speed: 0.5 + Math.random() * 1,
        }));
        setParticlePositions(particles);

        // Animate particles
        const interval = setInterval(() => {
            setParticlePositions(prev => prev.map(p => ({
                ...p,
                y: p.y - p.speed * 0.1 < 0 ? 100 : p.y - p.speed * 0.1,
                x: p.x + Math.sin(Date.now() / 1000 + p.y) * 0.02,
            })));
        }, 50);
        return () => clearInterval(interval);
    }, []);

    const mainCards = [
        { icon: '⚙️', label: 'TRAINING', color: '100, 150, 255', route: '/hub/training' },
        { icon: '👥', label: 'SOCIAL', color: '180, 100, 255', route: '/hub/social-media' },
        { icon: '🏆', label: 'ARENA', color: '255, 100, 180', route: '/hub/diamond-arena' },
    ];

    const handleCardClick = (index: number, route: string) => {
        if (activeCard === index) {
            router.push(route);
        } else {
            setActiveCard(index);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'linear-gradient(180deg, #0a0a18 0%, #0f0a20 50%, #0a1018 100%)',
                overflow: 'hidden',
                fontFamily: 'Inter, sans-serif',
            }}
        >
            {/* ═══════════════════════════════════════════════════════════════
                FLOATING PARTICLES
                ═══════════════════════════════════════════════════════════════ */}
            {particlePositions.map((p, i) => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        borderRadius: '50%',
                        background: 'rgba(0, 212, 255, 0.6)',
                        boxShadow: '0 0 6px rgba(0, 212, 255, 0.8)',
                        pointerEvents: 'none',
                    }}
                />
            ))}

            {/* ═══════════════════════════════════════════════════════════════
                HEXAGON GRID FLOOR
                ═══════════════════════════════════════════════════════════════ */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '45vh',
                    background: `
                        linear-gradient(180deg, transparent 0%, rgba(100, 50, 150, 0.05) 100%),
                        repeating-linear-gradient(
                            0deg,
                            transparent,
                            transparent 50px,
                            rgba(100, 50, 150, 0.08) 50px,
                            rgba(100, 50, 150, 0.08) 51px
                        ),
                        repeating-linear-gradient(
                            90deg,
                            transparent,
                            transparent 50px,
                            rgba(100, 50, 150, 0.08) 50px,
                            rgba(100, 50, 150, 0.08) 51px
                        )
                    `,
                    transform: 'perspective(600px) rotateX(65deg) translateY(40%)',
                    transformOrigin: 'center bottom',
                    pointerEvents: 'none',
                }}
            />

            {/* ═══════════════════════════════════════════════════════════════
                HEADER BAR — Glassmorphism
                ═══════════════════════════════════════════════════════════════ */}
            <div
                style={{
                    position: 'absolute',
                    top: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 30px',
                    background: 'linear-gradient(180deg, rgba(20, 30, 50, 0.9), rgba(10, 20, 40, 0.95))',
                    backdropFilter: 'blur(15px)',
                    borderRadius: 50,
                    border: '1px solid rgba(0, 212, 255, 0.4)',
                    boxShadow: `
                        0 0 30px rgba(0, 212, 255, 0.2),
                        0 10px 40px rgba(0, 0, 0, 0.5),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1)
                    `,
                    minWidth: 600,
                    zIndex: 100,
                }}
            >
                {/* Cyan accent lines on sides */}
                <div style={{
                    position: 'absolute',
                    left: 20,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 4,
                    height: 30,
                    background: '#00d4ff',
                    borderRadius: 2,
                    boxShadow: '0 0 10px #00d4ff',
                }} />
                <div style={{
                    position: 'absolute',
                    right: 20,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 4,
                    height: 30,
                    background: '#00d4ff',
                    borderRadius: 2,
                    boxShadow: '0 0 10px #00d4ff',
                }} />

                {/* Profile Avatar */}
                <div
                    style={{
                        width: 45,
                        height: 45,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1a2a4a, #0a1828)',
                        border: '2px solid rgba(0, 212, 255, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        cursor: 'pointer',
                        marginLeft: 20,
                    }}
                    onClick={() => router.push('/hub/social-media')}
                >
                    👤
                </div>

                {/* Title */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span
                        style={{
                            fontFamily: 'Orbitron, sans-serif',
                            fontSize: 14,
                            fontWeight: 400,
                            color: 'rgba(255, 255, 255, 0.7)',
                            letterSpacing: 3,
                        }}
                    >
                        SMARTER
                    </span>
                    <span
                        style={{
                            fontFamily: 'Orbitron, sans-serif',
                            fontSize: 24,
                            fontWeight: 700,
                            color: '#ffffff',
                            letterSpacing: 4,
                            textShadow: '0 0 20px rgba(0, 212, 255, 0.5)',
                        }}
                    >
                        POKER
                    </span>
                </div>

                {/* Diamond Count */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: 25,
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        marginRight: 20,
                        cursor: 'pointer',
                    }}
                    onClick={() => router.push('/hub/diamond-store')}
                >
                    <span style={{ fontSize: 20 }}>💎</span>
                    <span
                        style={{
                            fontFamily: 'Orbitron, sans-serif',
                            fontSize: 16,
                            fontWeight: 600,
                            color: '#00d4ff',
                        }}
                    >
                        {diamonds.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                LEFT SIDE MENU
                ═══════════════════════════════════════════════════════════════ */}
            <div
                style={{
                    position: 'absolute',
                    left: 30,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 40,
                    zIndex: 50,
                }}
            >
                <SideMenuOrb icon="🏠" label="DASHBOARD" onClick={() => router.push('/hub')} index={0} />
                <SideMenuOrb icon="🏆" label="CHALLENGES" onClick={() => router.push('/hub/challenges')} index={1} />
                <SideMenuOrb icon="🛒" label="STORE" onClick={() => router.push('/hub/diamond-store')} index={2} />
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                MAIN CAROUSEL — 3D Glass Cards
                ═══════════════════════════════════════════════════════════════ */}
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '45%',
                    transform: 'translateX(-50%) translateY(-50%)',
                    width: 600,
                    height: 400,
                    perspective: 1200,
                    perspectiveOrigin: 'center center',
                }}
            >
                {/* Holographic light beam */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: -80,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 300,
                        height: 150,
                        background: `
                            radial-gradient(ellipse at center bottom, 
                                rgba(150, 100, 255, 0.3) 0%, 
                                rgba(100, 200, 255, 0.15) 30%,
                                transparent 70%)
                        `,
                        filter: 'blur(2px)',
                        pointerEvents: 'none',
                    }}
                />

                {/* Holographic ring */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: -40,
                        left: '50%',
                        transform: 'translateX(-50%) rotateX(70deg)',
                        width: 250,
                        height: 60,
                        borderRadius: '50%',
                        border: '3px solid rgba(0, 212, 255, 0.4)',
                        boxShadow: `
                            0 0 30px rgba(0, 212, 255, 0.3),
                            inset 0 0 30px rgba(0, 212, 255, 0.1)
                        `,
                    }}
                />

                {/* Cards */}
                <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d' }}>
                    {mainCards.map((card, index) => (
                        <HoloCard
                            key={card.label}
                            icon={card.icon}
                            label={card.label}
                            color={card.color}
                            offset={index - activeCard}
                            isActive={index === activeCard}
                            onClick={() => handleCardClick(index, card.route)}
                        />
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                BOTTOM CARDS
                ═══════════════════════════════════════════════════════════════ */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 30,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 30,
                    zIndex: 50,
                }}
            >
                <BottomCard label="NEWS" onClick={() => router.push('/hub/news')} />
                <BottomCard label="LEADERBOARD" onClick={() => router.push('/hub/leaderboard')} />
                <BottomCard label="SETTINGS" onClick={() => router.push('/hub/settings')} />
            </div>
        </div>
    );
}
