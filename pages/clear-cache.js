// FORCE CACHE CLEAR PAGE
// Visit this page to clear ALL caches and service workers, then redirect to hub
// URL: https://smarter.poker/clear-cache

export default function ClearCachePage() {
    // This runs on client only
    if (typeof window !== 'undefined') {
        // Clear immediately on load
        (async () => {
            console.log('[ClearCache] Starting deep cache clear...');

            // 1. Clear all Cache API caches
            if ('caches' in window) {
                const names = await caches.keys();
                console.log('[ClearCache] Deleting caches:', names);
                await Promise.all(names.map(name => caches.delete(name)));
            }

            // 2. Unregister ALL service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                console.log('[ClearCache] Unregistering', registrations.length, 'service workers');
                await Promise.all(registrations.map(r => r.unregister()));
            }

            // 3. Clear localStorage cache markers
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('cache') || key.includes('version'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => {
                console.log('[ClearCache] Removing:', k);
                localStorage.removeItem(k);
            });

            // 4. Clear sessionStorage
            sessionStorage.clear();

            console.log('[ClearCache] ✅ All caches cleared! Redirecting...');

            // 5. Redirect to hub with cache-bust param
            setTimeout(() => {
                window.location.href = '/hub?cleared=' + Date.now();
            }, 500);
        })();
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0a0e1a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: 'system-ui'
        }}>
            <div style={{
                fontSize: 48,
                marginBottom: 20
            }}>🧹</div>
            <h1 style={{ marginBottom: 10 }}>Clearing Cache...</h1>
            <p style={{ color: '#888' }}>Removing old data and reloading fresh content</p>
            <div style={{
                marginTop: 30,
                width: 200,
                height: 4,
                background: '#333',
                borderRadius: 2,
                overflow: 'hidden'
            }}>
                <div style={{
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(90deg, #00f5ff, #0088ff)',
                    animation: 'loading 1s ease infinite'
                }} />
            </div>
            <style jsx>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
        </div>
    );
}
