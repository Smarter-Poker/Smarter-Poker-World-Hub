/**
 * ═══════════════════════════════════════════════════════════════════
 * useAssetPreloader — ORB-8 (The Artist)
 * ═══════════════════════════════════════════════════════════════════
 *
 * React hook that preloads all poker-critical assets from the
 * centralized manifest BEFORE a table or lobby component mounts.
 *
 * Works WITH the existing Workbox Service Worker — each fetch()
 * triggers the SW's StaleWhileRevalidate strategy for
 * `static-image-assets`, so second loads are instant from cache.
 *
 * USAGE:
 *   const { ready, progress } = useAssetPreloader('tableImages');
 *   if (!ready) return <Skeleton />;
 *
 * CATEGORIES: 'all' | 'tableImages' | 'cardFaces' | 'stickers' |
 *             'feltTextures' | 'uiAssets'
 */

import { useState, useEffect, useRef } from 'react';
import { getAssetUrls } from '../lib/assetPreloadManifest';

/**
 * Non-blocking image preloader using Image() constructor.
 * @param {string[]} urls
 * @param {(progress: number) => void} onProgress
 * @returns {Promise<void>}
 */
function preloadImages(urls, onProgress) {
    if (!urls.length) {
        onProgress(100);
        return Promise.resolve();
    }

    let loaded = 0;
    const total = urls.length;

    return new Promise((resolve) => {
        urls.forEach((url) => {
            const img = new Image();
            const done = () => {
                loaded++;
                onProgress(Math.round((loaded / total) * 100));
                if (loaded >= total) resolve();
            };
            img.onload = done;
            img.onerror = done; // Don't block on missing assets
            img.src = url;
        });

        // Safety timeout — don't block UI forever
        setTimeout(() => {
            if (loaded < total) {
                onProgress(100);
                resolve();
            }
        }, 10000);
    });
}

/**
 * @param {'all'|'tableImages'|'cardFaces'|'stickers'|'feltTextures'|'uiAssets'} category
 * @returns {{ ready: boolean, progress: number }}
 */
export function useAssetPreloader(category = 'tableImages') {
    const [progress, setProgress] = useState(0);
    const [ready, setReady] = useState(false);
    const started = useRef(false);

    useEffect(() => {
        // SSR guard
        if (typeof window === 'undefined') return;
        // Only run once per mount
        if (started.current) return;
        started.current = true;

        const urls = getAssetUrls(category);

        preloadImages(urls, (p) => {
            setProgress(p);
            if (p >= 100) setReady(true);
        });
    }, [category]);

    return { ready, progress };
}

export default useAssetPreloader;
