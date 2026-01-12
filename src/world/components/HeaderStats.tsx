/* ═══════════════════════════════════════════════════════════════════════════
   HEADER STATS — Inline Diamond and XP displays for top bar
   LIVE DATA: Fetches real user profile from Supabase
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// 📊 DEFAULT NEW USER STATS
// These are the starting values for new users (300 diamonds, 50 XP, Level 1)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_USER_STATS = {
    diamonds: 300,
    xp: 50,
    level: 1,
    streak: 0,
    streakMultiplier: 1.0,
};

// Calculate level from XP (every 500 XP = 1 level, minimum level 1)
function calculateLevel(xp: number): number {
    return Math.max(1, Math.floor(xp / 500) + 1);
}

// Shared bar height for consistency
const BAR_HEIGHT = 32;
const FONT_SIZE = 13;

// ─────────────────────────────────────────────────────────────────────────────
// 🔄 USER PROFILE HOOK — Fetches real data from Supabase
// ─────────────────────────────────────────────────────────────────────────────
function useUserProfile() {
    const [profile, setProfile] = useState<{
        diamonds: number;
        xp: number;
        level: number;
        streak: number;
        streakMultiplier: number;
        isLoading: boolean;
        error: string | null;
    }>({
        ...DEFAULT_USER_STATS,
        isLoading: true,
        error: null,
    });

    useEffect(() => {
        let isMounted = true;

        const fetchProfile = async () => {
            try {
                // Get current user
                const { data: { user }, error: authError } = await supabase.auth.getUser();

                if (authError) {
                    console.log('Auth error:', authError);
                    // Not logged in, use defaults
                    if (isMounted) {
                        setProfile(prev => ({ ...prev, isLoading: false }));
                    }
                    return;
                }

                if (!user) {
                    // Not logged in, use defaults
                    if (isMounted) {
                        setProfile(prev => ({ ...prev, isLoading: false }));
                    }
                    return;
                }

                // Fetch user profile from Supabase
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('diamonds, xp_total, streak_days, diamond_multiplier')
                    .eq('id', user.id)
                    .single();

                if (profileError) {
                    console.log('Profile fetch error:', profileError);
                    // Profile might not exist yet, use defaults
                    if (isMounted) {
                        setProfile(prev => ({ ...prev, isLoading: false }));
                    }
                    return;
                }

                if (profileData && isMounted) {
                    const xp = profileData.xp_total || 0;
                    setProfile({
                        diamonds: profileData.diamonds || DEFAULT_USER_STATS.diamonds,
                        xp: xp,
                        level: calculateLevel(xp),
                        streak: profileData.streak_days || 0,
                        streakMultiplier: profileData.diamond_multiplier || 1.0,
                        isLoading: false,
                        error: null,
                    });
                }
            } catch (err) {
                console.error('Profile fetch error:', err);
                if (isMounted) {
                    setProfile(prev => ({
                        ...prev,
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Unknown error'
                    }));
                }
            }
        };

        fetchProfile();

        // Subscribe to auth changes to refresh profile
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                fetchProfile();
            } else {
                // User logged out, reset to defaults
                setProfile({ ...DEFAULT_USER_STATS, isLoading: false, error: null });
            }
        });

        return () => {
            isMounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    return profile;
}

// ─────────────────────────────────────────────────────────────────────────────
// 💎 DIAMOND STAT — With + button to buy more
// ─────────────────────────────────────────────────────────────────────────────
interface DiamondStatProps {
    onBuyClick?: () => void;
}

export function DiamondStat({ onBuyClick }: DiamondStatProps) {
    const { diamonds, isLoading } = useUserProfile();
    const [isPlusHovered, setIsPlusHovered] = useState(false);

    const handleBuyClick = () => {
        console.log('Buy diamonds clicked');
        onBuyClick?.();
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: BAR_HEIGHT,
                padding: '0 8px 0 14px',
                background: 'rgba(0, 20, 40, 0.6)',
                borderRadius: 20,
                border: '1px solid rgba(0, 212, 255, 0.4)',
            }}
        >
            <span style={{ fontSize: 16 }}>💎</span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: '#00d4ff',
                    opacity: isLoading ? 0.5 : 1,
                }}
            >
                {isLoading ? '...' : diamonds.toLocaleString()}
            </span>
            {/* + Button to buy more */}
            <button
                onClick={handleBuyClick}
                onMouseEnter={() => setIsPlusHovered(true)}
                onMouseLeave={() => setIsPlusHovered(false)}
                style={{
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isPlusHovered
                        ? 'rgba(0, 212, 255, 0.3)'
                        : 'rgba(0, 212, 255, 0.15)',
                    border: '1px solid rgba(0, 212, 255, 0.5)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    transform: isPlusHovered ? 'scale(1.1)' : 'scale(1)',
                    padding: 0,
                    marginLeft: 2,
                }}
                title="Buy Diamonds"
            >
                <span
                    style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#00d4ff',
                        lineHeight: 1,
                    }}
                >
                    +
                </span>
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⬆️ XP STAT — Shows "XP: total • LV level" (same height as Diamond)
// ─────────────────────────────────────────────────────────────────────────────
export function XPStat() {
    const { xp, level, isLoading } = useUserProfile();

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: BAR_HEIGHT,
                padding: '0 14px',
                background: 'rgba(0, 20, 40, 0.6)',
                borderRadius: 20,
                border: '1px solid rgba(0, 212, 255, 0.4)',
            }}
        >
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.6)',
                    textTransform: 'uppercase',
                }}
            >
                XP
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: '#00d4ff',
                    opacity: isLoading ? 0.5 : 1,
                }}
            >
                {isLoading ? '...' : xp.toLocaleString()}
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.5)',
                }}
            >
                •
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: '#ffffff',
                    opacity: isLoading ? 0.5 : 1,
                }}
            >
                LV {isLoading ? '...' : level}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 STREAK STAT (kept for compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export function StreakStat() {
    const { streak, streakMultiplier, isLoading } = useUserProfile();
    const [isFlaming, setIsFlaming] = useState(false);

    useEffect(() => {
        if (streak >= 5) {
            const interval = setInterval(() => setIsFlaming(prev => !prev), 600);
            return () => clearInterval(interval);
        }
    }, [streak]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: BAR_HEIGHT,
                padding: '0 14px',
                background: 'rgba(0, 20, 40, 0.6)',
                borderRadius: 20,
                border: `1px solid ${streak >= 5 ? 'rgba(255, 100, 0, 0.5)' : 'rgba(0, 212, 255, 0.4)'}`,
            }}
        >
            <span
                style={{
                    fontSize: 16,
                    transform: isFlaming ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.3s ease',
                }}
            >
                🔥
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: streak >= 5 ? '#ff6600' : '#00d4ff',
                    opacity: isLoading ? 0.5 : 1,
                }}
            >
                {isLoading ? '...' : streak}
            </span>
            {streakMultiplier > 1 && (
                <span
                    style={{
                        fontFamily: 'Orbitron, monospace',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#00ff88',
                    }}
                >
                    {streakMultiplier}x
                </span>
            )}
        </div>
    );
}
