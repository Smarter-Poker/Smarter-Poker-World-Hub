/**
 * server-stability.js — Server-Side Crash Prevention
 * 
 * Import this in pages/_app.js to add global error handling that prevents
 * unhandled rejections and uncaught exceptions from crashing the dev server.
 * 
 * In production (Vercel), these are handled by the platform. In dev mode,
 * a single unhandled promise rejection kills the entire Next.js process.
 */

if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
    // Only install once
    if (!global.__STABILITY_INSTALLED__) {
        global.__STABILITY_INSTALLED__ = true;

        process.on('unhandledRejection', (reason, promise) => {
            console.error('[STABILITY] Unhandled Rejection caught (server stayed alive):', reason?.message || reason);
        });

        process.on('uncaughtException', (error) => {
            // Let webpack/Next.js errors through — they have their own handling
            if (error?.code === 'MODULE_NOT_FOUND' || error?.message?.includes('webpack')) {
                return;
            }
            console.error('[STABILITY] Uncaught Exception caught (server stayed alive):', error?.message || error);
        });

        console.log('[STABILITY] Server-side crash prevention installed');
    }
}
