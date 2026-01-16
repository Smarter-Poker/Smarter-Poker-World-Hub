/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver + Anti-Gravity Auto-Boot
   Global styles, providers, and Diamond Celebration System
   
   FIX: Global navigation guard to prevent loading freeze on back button
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/index.css';
import '../src/styles/premium.css';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, createContext, useState, useContext } from 'react';
import { AntiGravityProvider } from '../src/providers/AntiGravityProvider';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { UnreadProvider } from '../src/hooks/useUnreadCount';

// Dynamic import to avoid SSR issues with celebration animations
const CelebrationManager = dynamic(
  () => import('../src/components/diamonds/CelebrationManager').then(mod => mod.CelebrationManager),
  { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION GUARD — Prevents loading freeze when pressing back button
// ═══════════════════════════════════════════════════════════════════════════
const NavigationContext = createContext({ isNavigating: false });

export function useNavigation() {
  return useContext(NavigationContext);
}

function NavigationGuard({ children }) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const handleStart = () => {
      setIsNavigating(true);
      // Force stop all videos on the page
      document.querySelectorAll('video').forEach(video => {
        video.pause();
        video.src = '';
      });
      // Force stop all audio
      document.querySelectorAll('audio').forEach(audio => {
        audio.pause();
      });
    };

    const handleComplete = () => {
      // Small delay to ensure page transition is complete
      setTimeout(() => setIsNavigating(false), 100);
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
    };
  }, [router.events]);

  return (
    <NavigationContext.Provider value={{ isNavigating }}>
      {/* When navigating, render nothing to immediately clear all UI */}
      {isNavigating ? null : children}
    </NavigationContext.Provider>
  );
}

/**
 * App Root - AntiGravityProvider wraps everything for automatic boot.
 * ThemeProvider handles dark/light mode with localStorage persistence.
 * UnreadProvider tracks unread message count globally.
 * NavigationGuard prevents loading freeze on back button navigation.
 * On startup, Anti-Gravity:
 *   1. Verifies required env vars
 *   2. Initializes runtime
 *   3. Connects to Supabase
 *   4. Prints heartbeat proof to console
 * 
 * If any requirement fails → fail-closed → SystemOffline screen
 */
export default function App({ Component, pageProps }) {
  return (
    <AntiGravityProvider>
      <ThemeProvider>
        <UnreadProvider>
          <NavigationGuard>
            <Component {...pageProps} />
            <CelebrationManager />
          </NavigationGuard>
        </UnreadProvider>
      </ThemeProvider>
    </AntiGravityProvider>
  );
}

