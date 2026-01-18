/**
 * 🛡️ ASSET PRELOADER - The Loading Safety Net
 * 
 * Pre-fetches all game assets before gameplay begins.
 * Handles failures gracefully with timeout fallbacks.
 * 
 * Key Features:
 * - Progress tracking for visual feedback
 * - 3-second timeout per asset (never stuck)
 * - Placeholder fallbacks for failed loads
 * - Works even if all assets fail
 */

import { useState, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// ASSET MANIFEST - All required game assets
// ═══════════════════════════════════════════════════════════════════════════
export const ASSET_MANIFEST = {
    // Avatar images (9 players)
    avatars: [
        '/avatars/vip/viking_warrior.png',
        '/avatars/free/wizard.png',
        '/avatars/free/ninja.png',
        '/avatars/vip/wolf.png',
        '/avatars/vip/spartan.png',
        '/avatars/vip/pharaoh.png',
        '/avatars/free/pirate.png',
        '/avatars/free/cowboy.png',
        '/avatars/free/fox.png',
    ],

    // Card assets
    cards: [
        '/images/cards/deck_sprite.png',
        '/images/cards/card_back.png',
    ],

    // Chip assets
    chips: [
        '/images/chips/chip_red.png',
        '/images/chips/chip_blue.png',
        '/images/chips/chip_green.png',
        '/images/chips/chip_black.png',
    ],

    // Table assets
    table: [
        '/images/table/felt.png',
        '/images/table/dealer_button.png',
    ],
};

// Calculate total assets
const getAllAssets = (): string[] => {
    return [
        ...ASSET_MANIFEST.avatars,
        ...ASSET_MANIFEST.cards,
        ...ASSET_MANIFEST.chips,
        ...ASSET_MANIFEST.table,
    ];
};

// ═══════════════════════════════════════════════════════════════════════════
// ASSET PRELOADER HOOK
// ═══════════════════════════════════════════════════════════════════════════
interface UseAssetPreloaderReturn {
    isLoading: boolean;
    isReady: boolean;
    progress: number; // 0-100
    loadedCount: number;
    totalCount: number;
    failedAssets: string[];
}

export function useAssetPreloader(): UseAssetPreloaderReturn {
    const [loadedCount, setLoadedCount] = useState(0);
    const [failedAssets, setFailedAssets] = useState<string[]>([]);
    const [isReady, setIsReady] = useState(false);

    const allAssets = getAllAssets();
    const totalCount = allAssets.length;

    useEffect(() => {
        let isMounted = true;

        const preloadAsset = async (src: string): Promise<boolean> => {
            return new Promise((resolve) => {
                const img = new Image();

                // Timeout after 3 seconds - mark as "loaded" anyway
                const timeout = setTimeout(() => {
                    if (isMounted) {
                        console.warn(`⏱️ Asset timeout (fallback): ${src}`);
                        setFailedAssets(prev => [...prev, src]);
                    }
                    resolve(false);
                }, 3000);

                img.onload = () => {
                    clearTimeout(timeout);
                    resolve(true);
                };

                img.onerror = () => {
                    clearTimeout(timeout);
                    if (isMounted) {
                        console.warn(`❌ Asset failed: ${src}`);
                        setFailedAssets(prev => [...prev, src]);
                    }
                    resolve(false);
                };

                img.src = src;
            });
        };

        const preloadAll = async () => {
            for (const asset of allAssets) {
                await preloadAsset(asset);
                if (isMounted) {
                    setLoadedCount(prev => prev + 1);
                }
            }

            if (isMounted) {
                setIsReady(true);
            }
        };

        preloadAll();

        return () => {
            isMounted = false;
        };
    }, []);

    const progress = totalCount > 0 ? Math.round((loadedCount / totalCount) * 100) : 0;

    return {
        isLoading: !isReady,
        isReady,
        progress,
        loadedCount,
        totalCount,
        failedAssets,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER GENERATOR
// ═══════════════════════════════════════════════════════════════════════════
export function getPlaceholderColor(assetType: 'avatar' | 'card' | 'chip' | 'table'): string {
    const colors = {
        avatar: '#3a4a5a',
        card: '#2a3a4a',
        chip: '#4a3a2a',
        table: '#1a4a2a',
    };
    return colors[assetType] || '#333';
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSET IMAGE COMPONENT (with fallback)
// ═══════════════════════════════════════════════════════════════════════════
interface GameAssetProps {
    src: string;
    alt: string;
    fallbackType?: 'avatar' | 'card' | 'chip' | 'table';
    style?: React.CSSProperties;
    className?: string;
}

export function GameAsset({ src, alt, fallbackType = 'avatar', style, className }: GameAssetProps) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        return (
            <div
                style={{
                    ...style,
                    backgroundColor: getPlaceholderColor(fallbackType),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666',
                    fontSize: '12px',
                }}
                className={className}
            >
                ?
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            style={style}
            className={className}
            onError={() => setHasError(true)}
        />
    );
}
