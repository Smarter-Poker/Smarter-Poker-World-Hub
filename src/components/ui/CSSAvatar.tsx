/**
 * 👤 CSS AVATAR GENERATOR - No PNGs Needed
 * 
 * Generates beautiful avatars using pure CSS when images fail to load.
 * Features:
 * - Unique gradient backgrounds hashed from name
 * - Icon overlays based on avatar type
 * - Aggression-based glow effects
 */

import React, { useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type VillainProfile = 'Nit' | 'TAG' | 'LAG' | 'Maniac' | 'Fish' | 'Unknown';

interface CSSAvatarProps {
    name: string;
    size?: number;
    profile?: VillainProfile;
    isHero?: boolean;
    showBorder?: boolean;
    onClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICON MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const AVATAR_ICONS: Record<string, string> = {
    // Animals
    'wolf': '🐺',
    'lion': '🦁',
    'eagle': '🦅',
    'shark': '🦈',
    'bear': '🐻',
    'fox': '🦊',
    'tiger': '🐯',
    'snake': '🐍',
    'dragon': '🐉',
    'owl': '🦉',

    // Mythical
    'wizard': '🧙',
    'knight': '⚔️',
    'viking': '🪓',
    'ninja': '🥷',
    'samurai': '⚔️',
    'pirate': '🏴‍☠️',
    'robot': '🤖',
    'alien': '👽',
    'werewolf': '🐺',
    'vampire': '🧛',

    // Poker themed
    'ace': '🂡',
    'king': '👑',
    'queen': '👸',
    'joker': '🃏',
    'chip': '🎰',
    'diamond': '💎',
    'spade': '♠️',
    'heart': '♥️',
    'club': '♣️',

    // Generic
    'player': '👤',
    'pro': '😎',
    'fish': '🐟',
    'whale': '🐋',
    'shark_player': '🦈',

    // Default
    'default': '👤'
};

// ═══════════════════════════════════════════════════════════════════════════
// COLOR GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// Simple hash function for consistent colors
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

function generateGradientColors(name: string): [string, string] {
    const hash = hashString(name);

    // Predefined color pairs for visual appeal
    const colorPairs: [string, string][] = [
        ['#667eea', '#764ba2'], // Purple gradient
        ['#f093fb', '#f5576c'], // Pink gradient
        ['#4facfe', '#00f2fe'], // Cyan gradient
        ['#43e97b', '#38f9d7'], // Green gradient
        ['#fa709a', '#fee140'], // Orange-pink gradient
        ['#a18cd1', '#fbc2eb'], // Lavender gradient
        ['#ff9a9e', '#fecfef'], // Soft pink
        ['#667eea', '#f093fb'], // Purple-pink
        ['#0ba360', '#3cba92'], // Forest green
        ['#f5af19', '#f12711'], // Fire gradient
        ['#4776e6', '#8e54e9'], // Blue-purple
        ['#00d2ff', '#3a7bd5'], // Ocean blue
        ['#f83600', '#f9d423'], // Sunset
        ['#e65c00', '#f9d423'], // Golden
        ['#6a3093', '#a044ff'], // Deep purple
    ];

    return colorPairs[hash % colorPairs.length];
}

// Get glow color based on villain profile
function getProfileGlow(profile: VillainProfile): string {
    switch (profile) {
        case 'Maniac': return 'rgba(239, 68, 68, 0.6)';   // Red - most aggressive
        case 'LAG': return 'rgba(245, 158, 11, 0.5)';      // Orange
        case 'TAG': return 'rgba(59, 130, 246, 0.4)';      // Blue - controlled
        case 'Nit': return 'rgba(107, 114, 128, 0.3)';     // Gray - passive
        case 'Fish': return 'rgba(34, 197, 94, 0.4)';      // Green - target
        default: return 'rgba(255, 255, 255, 0.2)';
    }
}

function getProfileBorderColor(profile: VillainProfile): string {
    switch (profile) {
        case 'Maniac': return '#ef4444';
        case 'LAG': return '#f59e0b';
        case 'TAG': return '#3b82f6';
        case 'Nit': return '#6b7280';
        case 'Fish': return '#22c55e';
        default: return '#888888';
    }
}

// Extract icon from name
function getIconFromName(name: string): string {
    const lowerName = name.toLowerCase();

    for (const [key, icon] of Object.entries(AVATAR_ICONS)) {
        if (lowerName.includes(key)) {
            return icon;
        }
    }

    // Use first letter as fallback
    return name.charAt(0).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function CSSAvatar({
    name,
    size = 60,
    profile = 'Unknown',
    isHero = false,
    showBorder = true,
    onClick
}: CSSAvatarProps) {
    const [color1, color2] = useMemo(() => generateGradientColors(name), [name]);
    const icon = useMemo(() => getIconFromName(name), [name]);
    const glowColor = useMemo(() => getProfileGlow(profile), [profile]);
    const borderColor = useMemo(() => getProfileBorderColor(profile), [profile]);

    const fontSize = icon.length === 1 ? size * 0.45 : size * 0.4;

    return (
        <div
            onClick={onClick}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${color1}, ${color2})`,
                border: showBorder ? `3px solid ${isHero ? '#00d4ff' : borderColor}` : 'none',
                boxShadow: `
                    0 0 ${size * 0.3}px ${glowColor},
                    inset 0 -${size * 0.1}px ${size * 0.2}px rgba(0,0,0,0.3),
                    inset 0 ${size * 0.05}px ${size * 0.1}px rgba(255,255,255,0.2)
                `,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize,
                fontWeight: 700,
                color: '#fff',
                textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform 0.2s, box-shadow 0.2s',
                userSelect: 'none'
            }}
            onMouseEnter={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
            }}
        >
            {icon}

            {/* Hero badge */}
            {isHero && (
                <div style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: size * 0.35,
                    height: size * 0.35,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                    border: '2px solid #0a0a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: size * 0.18,
                    color: '#fff'
                }}>
                    ★
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// AVATAR WITH FALLBACK (Tries image first)
// ═══════════════════════════════════════════════════════════════════════════

interface AvatarWithFallbackProps extends CSSAvatarProps {
    imageUrl?: string;
}

export function AvatarWithFallback({
    imageUrl,
    ...cssAvatarProps
}: AvatarWithFallbackProps) {
    const [imageError, setImageError] = React.useState(false);

    if (imageUrl && !imageError) {
        return (
            <div style={{
                position: 'relative',
                width: cssAvatarProps.size || 60,
                height: cssAvatarProps.size || 60
            }}>
                <img
                    src={imageUrl}
                    alt={cssAvatarProps.name}
                    onError={() => setImageError(true)}
                    style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: cssAvatarProps.showBorder
                            ? `3px solid ${getProfileBorderColor(cssAvatarProps.profile || 'Unknown')}`
                            : 'none',
                        boxShadow: `0 0 ${(cssAvatarProps.size || 60) * 0.3}px ${getProfileGlow(cssAvatarProps.profile || 'Unknown')}`
                    }}
                />
                {cssAvatarProps.isHero && (
                    <div style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: (cssAvatarProps.size || 60) * 0.35,
                        height: (cssAvatarProps.size || 60) * 0.35,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                        border: '2px solid #0a0a1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: (cssAvatarProps.size || 60) * 0.18,
                        color: '#fff'
                    }}>
                        ★
                    </div>
                )}
            </div>
        );
    }

    return <CSSAvatar {...cssAvatarProps} />;
}

export default CSSAvatar;
