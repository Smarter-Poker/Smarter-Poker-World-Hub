/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver + Anti-Gravity Auto-Boot
   Global styles, providers, and Diamond Celebration System
   
   FIX: Global navigation guard to prevent loading freeze on back button
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/index.css';
import '../src/styles/premium.css';
import '../src/styles/global-tokens.css';
import '../src/styles/worlds/club-arena.css';
import '../src/styles/worlds/diamond-arena.css';
import '../src/styles/worlds/social-hub.css';
import '../src/styles/worlds/training.css';
import '../src/styles/worlds/marketplace.css';
import '../src/styles/worlds/news.css';
import '../src/styles/worlds/video-library.css';
import '../src/styles/worlds/poker-near-me.css';
import '../src/styles/worlds/memory-games.css';
import '../src/styles/worlds/diamond-arcade.css';
import '../src/styles/worlds/personal-assistant.css';
import '../src/styles/worlds/bankroll.css';
import '../src/styles/worlds/trivia.css';
import '../src/styles/commander-futuristic.css';
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
import { TrainingSettingsProvider } from '../src/contexts/TrainingSettingsContext';
import ToastContainer from '../src/components/ui/ToastContainer';
import GlobalNotificationPrompt from '../src/components/ui/GlobalNotificationPrompt';
import { WorldThemeProvider } from '../src/components/WorldThemeProvider';
import { ProactiveHelp } from '../src/world/components/LiveHelp/ProactiveHelp';
import { GeevesPanel } from '../src/world/components/Geeves/GeevesPanel';
import { useGeeves } from '../src/world/components/Geeves/useGeeves';
// ═══════════════════════════════════════════════════════════════════════════
// CACHE BUSTER — Clears stale caches on new deploys
// Uses build timestamp to detect version changes
// ═══════════════════════════════════════════════════════════════════════════
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString();

if (typeof window !== 'undefined') {
  const CACHE_VERSION_KEY = 'smarter_poker_cache_version';
  const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);

  if (storedVersion && storedVersion !== BUILD_VERSION) {
    console.log('[Cache Buster] New version detected! Clearing caches...');
    console.log(`[Cache Buster] Old: ${storedVersion.slice(0, 8)}, New: ${BUILD_VERSION.slice(0, 8)}`);

    // Clear all caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          console.log(`[Cache Buster] Deleting cache: ${name}`);
          caches.delete(name);
        });
      });
    }

    // Unregister all service workers (except OneSignal will re-register itself)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          console.log('[Cache Buster] Unregistering service worker');
          registration.unregister();
        });
      });
    }
  }

  // Store current version
  localStorage.setItem(CACHE_VERSION_KEY, BUILD_VERSION);
}

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
        const oldKeysToRemove = [];

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
              // CRITICAL: Remove old Supabase key to prevent token refresh failure loop
              // If old key exists, Supabase will try to refresh it → 400 error → SIGNED_OUT
              oldKeysToRemove.push(key);
            } catch (e) {
              console.warn('[Auth Migration v6] Failed to migrate:', e);
            }
          }
        }

        // Remove old Supabase auth keys AFTER migration completes
        oldKeysToRemove.forEach(key => {
          console.log(`[Auth Migration v6] Removing old key: ${key.substring(0, 20)}...`);
          localStorage.removeItem(key);
        });

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
  const { isOpen: isGeevesOpen, onClose: onGeevesClose } = useGeeves();

  return (
    <AntiGravityProvider>
      <ThemeProvider>
        <UnreadProvider>
          <AvatarProvider>
            <ExternalLinkProvider>
              <OneSignalProvider>
                <TrainingSettingsProvider>
                  <NavigationGuard>
                    <WorldThemeProvider>
                      <Component {...pageProps} />
                      <CelebrationManager />
                      <ToastContainer />
                      <GlobalNotificationPrompt />
                      <ProactiveHelp
                        onAccept={() => {
                          // Open Jarvis when user accepts help
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('open-jarvis'));
                          }
                        }}
                        onDismiss={() => {
                          console.log('[ProactiveHelp] User dismissed help prompt');
                        }}
                      />
                      <GeevesPanel isOpen={isGeevesOpen} onClose={onGeevesClose} />
                    </WorldThemeProvider>
                  </NavigationGuard>
                </TrainingSettingsProvider>
              </OneSignalProvider>
            </ExternalLinkProvider>
          </AvatarProvider>
        </UnreadProvider>
      </ThemeProvider>
    </AntiGravityProvider>
  );
}

