/**
 * 🎮 TRAINING PAGE — PIXEL-PERFECT MATCH TO REFERENCE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * - Hero: Uses reference image as background
 * - Cards: Slanted parallelograms, full-width grid (4 cards = 100% width)
 * - Layout: Matches reference exactly
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════

const LANES = [
    {
        id: 'gto-basics',
        title: 'GTO BASICS',
        games: [
            { id: 'gto-grid', name: 'GTO Grid', rank: 'S' },
            { id: 'icm-mastery', name: 'ICM Mastery', rank: 'A' },
            { id: 'preflop-drills', name: 'Preflop Drills', rank: 'B' },
            { id: 'range-builder', name: 'Range Builder', rank: 'B' },
        ],
    },
    {
        id: 'tournament-life',
        title: 'TOURNAMENT LIFE',
        games: [
            { id: 'final-table', name: 'Final Table ICM', rank: 'A' },
            { id: 'bubble-defense', name: 'Bubble Defense', rank: 'B' },
            { id: 'short-stack', name: 'Short Stack Play', rank: 'B' },
            { id: 'push-fold', name: 'Push/Fold', rank: 'S' },
        ],
    },
    {
        id: 'fix-your-leaks',
        title: 'FIX YOUR LEAKS',
        badge: 'BELOW 70%!',
        games: [
            { id: 'tilt-control', name: 'Tilt Control', rank: 'C' },
            { id: 'river-mistakes', name: 'River Mistakes', rank: 'C' },
            { id: 'bet-sizing', name: 'Bet Sizing Errors', rank: 'D' },
            { id: 'position-leaks', name: 'Position Leaks', rank: 'C' },
        ],
    },
];

const FILTERS = [
    { id: 'ALL', color: null },  // White filled when active
    { id: 'GTO', color: '#FFD700' },  // Gold/Yellow
    { id: 'EXPLOITATIVE', color: '#4CAF50' },  // Green
    { id: 'MATH', color: '#2196F3' },  // Blue
];

const RANK_COLORS = {
    S: { bg: '#FFD700', text: '#000' },
    A: { bg: '#4CAF50', text: '#fff' },
    B: { bg: '#2196F3', text: '#fff' },
    C: { bg: '#FF9800', text: '#fff' },
    D: { bg: '#9E9E9E', text: '#fff' },
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT: Slanted Rank Badge
// ═══════════════════════════════════════════════════════════════════════════

const RankBadge = ({ rank }) => {
    const colors = RANK_COLORS[rank] || RANK_COLORS.D;
    return (
        <div style={{
            position: 'absolute',
            top: 8,
            right: -25,
            width: 90,
            textAlign: 'center',
            background: colors.bg,
            color: colors.text,
            fontSize: 10,
            fontWeight: 800,
            padding: '3px 0',
            transform: 'rotate(40deg)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            letterSpacing: 0.5,
            zIndex: 20,
        }}>
            {rank}-RANK
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT: SLANTED Game Card (parallelogram, LARGE - fills screen)
// ═══════════════════════════════════════════════════════════════════════════

const GameCard = ({ game, onClick, isHovered, onHover }) => {
    return (
        <div
            onClick={() => onClick(game)}
            onMouseEnter={() => onHover(game.id)}
            onMouseLeave={() => onHover(null)}
            style={{
                position: 'relative',
                // 4 cards = 100% width, minus gaps
                width: 'calc(25% - 15px)',
                height: 120,
                background: 'linear-gradient(150deg, rgba(50,40,65,0.95) 0%, rgba(25,20,35,0.98) 100%)',
                borderRadius: 10,
                overflow: 'visible',
                cursor: 'pointer',
                border: isHovered ? '2px solid #FF6B35' : '1px solid rgba(255,107,53,0.3)',
                transition: 'all 0.2s ease',
                // PARALLELOGRAM SKEW
                transform: isHovered ? 'skewX(-5deg) scale(1.02)' : 'skewX(-5deg)',
                boxShadow: isHovered
                    ? '8px 8px 25px rgba(0,0,0,0.6), 0 0 20px rgba(255,107,53,0.3)'
                    : '5px 5px 15px rgba(0,0,0,0.5)',
            }}
        >
            {/* Rank Badge */}
            <RankBadge rank={game.rank} />

            {/* Inner content - counter-skew to keep text readable */}
            <div style={{ transform: 'skewX(5deg)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Image placeholder */}
                <div style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, rgba(80,60,100,0.4) 0%, rgba(40,30,55,0.6) 100%)',
                    borderRadius: '10px 10px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{ fontSize: 36, opacity: 0.4 }}>🎴</div>
                </div>

                {/* Title bar */}
                <div style={{
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,0.5)',
                    borderRadius: '0 0 10px 10px',
                }}>
                    <div style={{
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                    }}>{game.name}</div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT: Game Lane (FULL WIDTH - 4 cards centered)
// ═══════════════════════════════════════════════════════════════════════════

const GameLane = ({ lane, onGameClick, hoveredGame, onHover }) => {
    return (
        <div style={{ marginBottom: 25, padding: '0 20px', position: 'relative', zIndex: 5 }}>
            {/* Lane Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
            }}>
                <span style={{ color: '#FF6B35', fontSize: 14, fontWeight: 700 }}>&gt;&gt;</span>
                <h3 style={{
                    color: '#FF6B35',
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: 2,
                    margin: 0,
                }}>{lane.title}</h3>

                {lane.badge && (
                    <span style={{
                        background: 'linear-gradient(90deg, #FF5722, #FF9800)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 4,
                    }}>{lane.badge}</span>
                )}
            </div>

            {/* 4 cards grid - full width, centered */}
            <div style={{
                display: 'flex',
                gap: 20,
                justifyContent: 'center',
            }}>
                {lane.games.map(game => (
                    <GameCard
                        key={game.id}
                        game={game}
                        onClick={onGameClick}
                        isHovered={hoveredGame === game.id}
                        onHover={onHover}
                    />
                ))}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT: Filter Pills
// ═══════════════════════════════════════════════════════════════════════════

const FilterBar = ({ active, onFilter }) => {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            padding: '18px 0',
            background: '#1a1525',
            position: 'relative',
            zIndex: 10,
        }}>
            {FILTERS.map(filter => {
                const isActive = active === filter.id;
                const neonColor = filter.color || '#fff';
                return (
                    <button
                        key={filter.id}
                        onClick={() => onFilter(filter.id)}
                        style={{
                            padding: '10px 24px',
                            borderRadius: 22,
                            // DIFFERENT NEON COLORS PER FILTER
                            border: isActive ? 'none' : `2px solid ${neonColor}`,
                            background: isActive ? '#fff' : 'transparent',
                            color: isActive ? '#0a0a15' : '#fff',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 1.5,
                            cursor: 'pointer',
                            boxShadow: isActive
                                ? 'none'
                                : `0 0 12px ${neonColor}66, inset 0 0 8px ${neonColor}33`,
                            transition: 'all 0.2s ease',
                        }}
                    >{filter.id}</button>
                );
            })}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT: Hero Section (REFERENCE IMAGE AS BACKGROUND)
// ═══════════════════════════════════════════════════════════════════════════

const HeroSection = ({ onPlayNow }) => {
    return (
        <div style={{
            position: 'relative',
            height: 380,
            overflow: 'hidden',
            zIndex: 5,
        }}>
            {/* Reference image as background - shows hero content including PLAY NOW */}
            <img
                src="/images/training_reference.jpg"
                alt=""
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: 'auto',
                    minHeight: '100%',
                    objectFit: 'cover',
                    objectPosition: 'top center',
                }}
            />

            {/* Dark overlay for text readability */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)',
            }} />

            {/* Clickable PLAY NOW overlay positioned exactly on the button in the image */}
            <div
                onClick={onPlayNow}
                style={{
                    position: 'absolute',
                    top: '68%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 120,
                    height: 36,
                    cursor: 'pointer',
                    borderRadius: 4,
                }}
            />
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TrainingPage() {
    const router = useRouter();
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [hoveredGame, setHoveredGame] = useState(null);

    const handleGameClick = (game) => {
        console.log('🎮 Game clicked:', game.name);
        alert(`Launching: ${game.name}\n\n20-question run. 85% to pass.`);
    };

    const handlePlayNow = () => {
        console.log('🎯 Daily Challenge');
        alert('Daily Challenge: HIGH STAKES BLUFFS\n\n20 questions, XP ×2.5!');
    };

    return (
        <>
            <Head>
                <title>Training — PokerIQ</title>
                <style>{`
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { background: #0a0a15; }
                `}</style>
            </Head>

            <div style={{
                minHeight: '100vh',
                background: '#0a0a15',
                position: 'relative',
                zIndex: 1,
            }}>
                {/* Logo */}
                <div style={{
                    position: 'absolute',
                    top: 12,
                    left: 16,
                    zIndex: 100,
                }}>
                    <span style={{ fontSize: 16, color: '#FF6B35' }}>
                        Poker<strong>IQ</strong>
                    </span>
                </div>

                {/* Hero - reference image as background */}
                <HeroSection onPlayNow={handlePlayNow} />

                {/* Filters */}
                <FilterBar active={activeFilter} onFilter={setActiveFilter} />

                {/* Game Lanes - full width */}
                <div style={{ paddingTop: 20, paddingBottom: 30 }}>
                    {LANES.map(lane => (
                        <GameLane
                            key={lane.id}
                            lane={lane}
                            onGameClick={handleGameClick}
                            hoveredGame={hoveredGame}
                            onHover={setHoveredGame}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}
