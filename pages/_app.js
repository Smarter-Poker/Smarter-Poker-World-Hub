/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver + Anti-Gravity Auto-Boot
   Global styles, providers, and Diamond Celebration System
   
   FIX: Global navigation guard to prevent loading freeze on back button
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/index.css';
import '../src/styles/premium.css';
import '../styles/landing.css';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, createContext, useState, useContext } from 'react';
import { AntiGravityProvider } from '../src/providers/AntiGravityProvider';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { UnreadProvider } from '../src/hooks/useUnreadCount';
import { SoundEngine } from '../src/audio/SoundEngine';
import { AvatarProvider } from '../src/contexts/AvatarContext';
import { ExternalLinkProvider } from '../src/components/ui/ExternalLinkModal';
import { OneSignalProvider } from '../src/contexts/OneSignalContext';
import ToastContainer from '../src/components/ui/ToastContainer';

// Dynamic import to avoid SSR issues with celebration animations
const CelebrationManager = dynamic(
  () => import('../src/components/diamonds/CelebrationManager').then(mod => mod.CelebrationManager),
  { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION GUARD — Prevents loading freeze when pressing back button
// Uses SYNCHRONOUS DOM manipulation for instant hiding (no React state delay)
// ═══════════════════════════════════════════════════════════════════════════
const NavigationContext = createContext({ isNavigating: false });

export function useNavigation() {
  return useContext(NavigationContext);
}

function NavigationGuard({ children }) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    // ═══════════════════════════════════════════════════════════════════════
    // AUTH MIGRATION v6: Migrate to explicit 'smarter-poker-auth' key
    // Ensures cross-window session persistence by using consistent storage key
    // ═══════════════════════════════════════════════════════════════════════
    const AUTH_MIGRATION_VERSION = 'v6_2026_01_21_explicit_storage_key';
    const migrationKey = 'smarter_poker_auth_migration';
    const NEW_AUTH_KEY = 'smarter-poker-auth';

    if (typeof window !== 'undefined') {
      const completedMigration = localStorage.getItem(migrationKey);

      if (completedMigration !== AUTH_MIGRATION_VERSION) {
        console.log('[Auth Migration v6] Running storage key migration...');

        // Look for existing Supabase auth sessions with old auto-generated keys
        let migratedSession = false;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.includes('-auth-token')) {
            try {
              const sessionData = localStorage.getItem(key);
              if (sessionData && !localStorage.getItem(NEW_AUTH_KEY)) {
                // Migrate to new explicit key
                localStorage.setItem(NEW_AUTH_KEY, sessionData);
                console.log(`[Auth Migration v6] Migrated session from ${key} to ${NEW_AUTH_KEY}`);
                migratedSession = true;
              }
            } catch (e) {
              console.warn('[Auth Migration v6] Failed to migrate:', e);
            }
          }
        }

        // Also clear any corrupted keys with newlines
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('\n') || key.includes('\r'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => {
          console.log(`[Auth Migration v6] Removing corrupted key`);
          localStorage.removeItem(key);
        });

        localStorage.setItem(migrationKey, AUTH_MIGRATION_VERSION);
        console.log(`[Auth Migration v6] Complete! Migrated: ${migratedSession}`);
      }
    }

    // Initialize SoundEngine for audio playback
    SoundEngine.init().catch(err => console.warn('[App] SoundEngine init failed:', err));

    // Inject the hiding CSS on mount
    const style = document.createElement('style');
    style.id = 'nav-guard-style';
    style.textContent = `
      body.page-transitioning * {
        animation-play-state: paused !important;
        transition: none !important;
      }
      body.page-transitioning video,
      body.page-transitioning audio,
      body.page-transitioning iframe,
      body.page-transitioning canvas,
      body.page-transitioning .loading-overlay,
      body.page-transitioning [class*="loading"],
      body.page-transitioning [class*="spinner"],
      body.page-transitioning [class*="intro"],
      body.page-transitioning [class*="outro"],
      body.page-transitioning [class*="modal"],
      body.page-transitioning [class*="overlay"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `;
    if (!document.getElementById('nav-guard-style')) {
      document.head.appendChild(style);
    }

    const handleStart = () => {
      // SYNCHRONOUS: Add class immediately (no React state delay)
      document.body.classList.add('page-transitioning');

      // Force stop all media SYNCHRONOUSLY
      document.querySelectorAll('video').forEach(video => {
        try {
          video.pause();
          video.currentTime = 0;
          video.src = '';
          video.load();
        } catch (e) { }
      });
      document.querySelectorAll('audio').forEach(audio => {
        try { audio.pause(); } catch (e) { }
      });
      document.querySelectorAll('iframe').forEach(iframe => {
        try { iframe.src = 'about:blank'; } catch (e) { }
      });

      // Also set React state (for components that check it)
      setIsNavigating(true);
    };

    const handleComplete = () => {
      // Remove the hiding class
      document.body.classList.remove('page-transitioning');
      setIsNavigating(false);
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
      // Cleanup class if component unmounts during transition
      document.body.classList.remove('page-transitioning');
    };
  }, [router.events]);

  return (
    <NavigationContext.Provider value={{ isNavigating }}>
      {children}
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
          <AvatarProvider>
            <ExternalLinkProvider>
              <OneSignalProvider>
                <NavigationGuard>
                  <Component {...pageProps} />
                  <CelebrationManager />
                  <ToastContainer />
                </NavigationGuard>
              </OneSignalProvider>
            </ExternalLinkProvider>
          </AvatarProvider>
        </UnreadProvider>
      </ThemeProvider>
    </AntiGravityProvider>
  );
}

