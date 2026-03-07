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
import '../src/styles/worlds/poker-near-me-lobby.css';
import '../src/styles/worlds/memory-games.css';
import '../src/styles/worlds/diamond-arcade.css';
import '../src/styles/worlds/personal-assistant.css';
import '../src/styles/worlds/bankroll.css';
import '../src/styles/worlds/trivia.css';
import '../src/styles/commander-futuristic.css';
import '../styles/landing.css';
import { Orbitron, Inter, Plus_Jakarta_Sans, Space_Grotesk, Rajdhani } from 'next/font/google';

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-orbitron',
  display: 'swap',
  preload: true,
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
  preload: false,
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
  preload: false,
});


import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { SWRConfig } from 'swr';
import { swrLocalStorageProvider, SWR_DEFAULTS } from '../src/lib/swrCacheProvider';
import { swrCacheMiddleware } from '../src/lib/swrCacheMiddleware';
import { useEffect, createContext, useState, useContext } from 'react';
import { AntiGravityProvider } from '../src/providers/AntiGravityProvider';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { UnreadProvider } from '../src/hooks/useUnreadCount';
import { SoundEngine } from '../src/audio/SoundEngine';
import { AvatarProvider } from '../src/contexts/AvatarContext';
import { ExternalLinkProvider } from '../src/components/ui/ExternalLinkModal';
import { OneSignalProvider } from '../src/contexts/OneSignalContext';
import { TrainingSettingsProvider } from '../src/contexts/TrainingSettingsContext';
import { ActiveIdentityProvider } from '../src/contexts/ActiveIdentityContext';
import ToastContainer from '../src/components/ui/ToastContainer';
import GlobalNotificationPrompt from '../src/components/ui/GlobalNotificationPrompt';
import PWAInstallPrompt from '../src/components/ui/PWAInstallPrompt';
import PageErrorBoundary from '../src/components/ui/PageErrorBoundary';
import { HubErrorBoundary } from '../src/components/ui/HubErrorBoundary';
import { WorldThemeProvider } from '../src/components/WorldThemeProvider';
import { ProactiveHelp } from '../src/world/components/Geeves/ProactiveHelp';
import { JarvisPanel } from '../src/world/components/Jarvis/JarvisPanel';
import { useJarvis } from '../src/world/components/Jarvis/useJarvis';
// ═══════════════════════════════════════════════════════════════════════════
// CACHE BUSTER — Clears stale caches on new deploys
// Uses build timestamp to detect version changes
// ═══════════════════════════════════════════════════════════════════════════
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_ID
  || (typeof window !== 'undefined' && window.__NEXT_DATA__?.buildId)
  || 'stable'; // CRITICAL: Never use Date.now() — it changes every load and triggers cache clears every time

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

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE ABORT ERROR DEFENSE — Suppress harmless navigator.locks AbortError
  // This MUST run BEFORE React mounts to prevent the dev overlay from catching it.
  // The AbortError from @supabase/auth-js/locks.js is a known non-critical issue
  // that occurs during page transitions when in-flight session refreshes are aborted.
  // ═══════════════════════════════════════════════════════════════════════════
  window.addEventListener('unhandledrejection', function earlyAbortSuppressor(event) {
    const msg = String(event?.reason?.message || event?.reason || '').toLowerCase();
    if (msg.includes('aborterror') || msg.includes('signal is aborted') || msg.includes('aborted without reason')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Silently swallow — this is Supabase auth-js lock cleanup, not a real error
    }
  }, true); // 'true' = capture phase, fires before React's handler

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL AUTH FETCH INTERCEPTOR — Auto-inject JWT for all /api/ calls
  // ═══════════════════════════════════════════════════════════════════════════
  // This wraps window.fetch to automatically add the Authorization: Bearer header
  // to ALL internal API route calls (/api/*). This prevents 401 errors caused by
  // pages that forget to include the JWT token in their fetch requests.
  // Existing Authorization headers are preserved (not overwritten).
  // ═══════════════════════════════════════════════════════════════════════════
  const _originalFetch = window.fetch;
  window.fetch = function patchedFetch(input, init) {
    // Determine the URL from the input
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof Request) {
      url = input.url;
    } else if (input?.toString) {
      url = input.toString();
    }

    // Only intercept internal /api/ calls (not external Supabase REST calls)
    const isInternalApi = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');

    if (isInternalApi) {
      // Check if Authorization header is already present
      const existingHeaders = init?.headers || {};
      let hasAuthHeader = false;

      if (existingHeaders instanceof Headers) {
        hasAuthHeader = existingHeaders.has('Authorization');
      } else if (Array.isArray(existingHeaders)) {
        hasAuthHeader = existingHeaders.some(([key]) => key.toLowerCase() === 'authorization');
      } else if (typeof existingHeaders === 'object') {
        hasAuthHeader = Object.keys(existingHeaders).some(k => k.toLowerCase() === 'authorization');
      }

      // If no Authorization header, inject one from localStorage
      if (!hasAuthHeader) {
        try {
          const authData = localStorage.getItem('smarter-poker-auth');
          if (authData) {
            const parsed = JSON.parse(authData);
            const token = parsed?.access_token;
            if (token) {
              init = init || {};
              if (existingHeaders instanceof Headers) {
                existingHeaders.set('Authorization', `Bearer ${token}`);
                init.headers = existingHeaders;
              } else if (typeof existingHeaders === 'object' && !Array.isArray(existingHeaders)) {
                init.headers = { ...existingHeaders, 'Authorization': `Bearer ${token}` };
              } else {
                init.headers = { 'Authorization': `Bearer ${token}` };
              }
            }
          }
        } catch (e) {
          // Silently fail — don't break the fetch if localStorage read fails
        }
      }
    }

    return _originalFetch.call(window, input, init);
  };
  console.log('[ANTIGRAVITY] Global auth fetch interceptor installed');
}

// Dynamic import to avoid SSR issues with celebration animations
const CelebrationManager = dynamic(
  () => import('../src/components/diamonds/CelebrationManager').then(mod => mod.CelebrationManager),
  { ssr: false }
);

// Dynamic import for DiamondToast (3-second auto-dismiss popup)
const DiamondToast = dynamic(
  () => import('../src/components/diamonds/DiamondToast'),
  { ssr: false }
);

// Dynamic import for Phone Verification VIP Modal
const PhoneVerifyVIPModal = dynamic(
  () => import('../src/components/modals/PhoneVerifyVIPModal'),
  { ssr: false }
);

// Dynamic import for Global Error Catcher (catches async/event handler errors)
const GlobalErrorCatcher = dynamic(
  () => import('../src/components/ui/GlobalErrorCatcher'),
  { ssr: false }
);

// Dynamic import for Chunk Load Recovery (auto-reloads on stale chunks after deploy)
const ChunkLoadRecovery = dynamic(
  () => import('../src/components/ui/ChunkLoadRecovery'),
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
// ═══════════════════════════════════════════════════════════════════════════
// PHONE VERIFY VIP GATE — Shows phone verification popup for new signups
// Checks sessionStorage for `needs_phone_verify` flag set by auth callback
// ONLY shows if user hasn't already verified their phone
// ═══════════════════════════════════════════════════════════════════════════
function PhoneVerifyGate() {
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [verifyUserId, setVerifyUserId] = useState(null);
  const router = useRouter();

  useEffect(() => {
    // Check on route change or mount — slight delay to let page settle
    const timer = setTimeout(async () => {
      const userId = sessionStorage.getItem('needs_phone_verify');
      if (!userId || userId.length < 10) return;

      // Only show on hub or commander pages, not auth pages
      const path = router.asPath;
      if (!path.startsWith('/hub') && !path.startsWith('/commander/dashboard')) return;

      // ── CRITICAL: Check if user already has phone verified ──────────
      // Don't show popup for returning users who already verified
      try {
        const { supabase } = await import('../src/lib/supabase');
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone_verified, phone')
          .eq('id', userId)
          .maybeSingle();

        if (profile?.phone_verified && profile?.phone) {
          // Already verified — don't show popup, clean up flag
          sessionStorage.removeItem('needs_phone_verify');
          console.log('[PhoneVerifyGate] User already verified phone, skipping popup');
          return;
        }
      } catch (err) {
        console.warn('[PhoneVerifyGate] Profile check failed (showing popup):', err.message);
        // On error, still show popup — better to ask again than skip
      }

      setVerifyUserId(userId);
      setShowPhoneVerify(true);
    }, 2500); // 2.5s delay so the user sees the page first
    return () => clearTimeout(timer);
  }, [router.asPath]);

  if (!showPhoneVerify || !verifyUserId) return null;

  return (
    <PhoneVerifyVIPModal
      userId={verifyUserId}
      onClose={() => {
        setShowPhoneVerify(false);
        sessionStorage.removeItem('needs_phone_verify');
      }}
      onVerified={() => {
        setShowPhoneVerify(false);
        sessionStorage.removeItem('needs_phone_verify');
      }}
    />
  );
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const { isOpen: isJarvisOpen, onClose: onJarvisClose } = useJarvis();
  const isCommander = router.asPath.startsWith('/commander');

  // Determine if this route requires global capitalization per User specification
  const path = router.asPath.split('?')[0];

  // Do NOT capitalize specific poker/trainer tool screens where exact statistical/range string casing (e.g., AQs, cbet, EV) is mathematically critical
  const isPokerTool = path.includes('/training') || path.includes('/gto') || path.includes('/solver') || path.includes('/sandbox');

  // Apply to Settings, Hub, Commander, Club Arena, and Union screens
  const shouldCapitalize = (
    path.includes('/settings') ||
    path.startsWith('/hub') ||
    path.startsWith('/commander') ||
    path.includes('/club') ||
    path.includes('/union')
  ) && !isPokerTool;

  return (
    <SWRConfig value={{ ...SWR_DEFAULTS, provider: swrLocalStorageProvider, use: [swrCacheMiddleware] }}>
      <div className={`${orbitron.variable} ${inter.variable} ${plusJakartaSans.variable} ${spaceGrotesk.variable} ${rajdhani.variable} ${shouldCapitalize ? 'capitalize-world' : ''}`} style={{ minHeight: '100vh' }}>
        {shouldCapitalize && (
          <style dangerouslySetInnerHTML={{
            __html: `
              /* Target ONLY structural UI elements, buttons, headers, and discrete labels */
              .capitalize-world .settingLabel,
              .capitalize-world .settingDesc,
              .capitalize-world button,
              .capitalize-world a.nav-link,
              .capitalize-world .orb-badge,
              .capitalize-world label,
              .capitalize-world .ui-heading,
              .capitalize-world .menu-item,
              .capitalize-world .tab-label,
              .capitalize-world .btn,
              .capitalize-world .button-text {
                text-transform: capitalize !important;
                white-space: normal !important;
                word-wrap: break-word !important;
              }

              /* Protect user inputs and system globals from capitalization */
              .capitalize-world input, 
              .capitalize-world textarea, 
              .capitalize-world select, 
              .capitalize-world [contenteditable="true"], 
              .capitalize-world .no-capitalize,
              .capitalize-world .no-capitalize * {
                text-transform: none !important;
              }
            `
          }} />
        )}
        <>
          {/* PWA Manifest — route-based: Commander gets its own manifest/icon/title */}
          <Head>
            {isCommander ? (
              <>
                <link rel="manifest" href="/commander-manifest.json" />
                <link rel="apple-touch-icon" sizes="180x180" href="/icons/commander-apple-touch-icon.png" />
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/commander-icon-192.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/icons/commander-icon-512.png" />
                <meta name="apple-mobile-web-app-title" content="Club Commander" />
                <meta name="application-name" content="Club Commander" />
              </>
            ) : (
              <>
                <link rel="manifest" href="/manifest.json" />
                <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
                <meta name="apple-mobile-web-app-title" content="Smarter.Poker" />
                <meta name="application-name" content="Smarter.Poker" />
              </>
            )}
          </Head>
          <AntiGravityProvider>
            <ThemeProvider>
              <UnreadProvider>
                <AvatarProvider>
                  <ExternalLinkProvider>
                    <OneSignalProvider>
                      <TrainingSettingsProvider>
                        <NavigationGuard>
                          <ActiveIdentityProvider>
                            <WorldThemeProvider>
                              <PageErrorBoundary key={router.asPath}>
                                <Component {...pageProps} />
                              </PageErrorBoundary>
                              <HubErrorBoundary name="Celebrations" fallback={<></>}>
                                <CelebrationManager />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Diamond Toast" fallback={<></>}>
                                <DiamondToast />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Toast Container" fallback={<></>}>
                                <ToastContainer />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Notification Prompt" fallback={<></>}>
                                <GlobalNotificationPrompt />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="PWA Install Prompt" fallback={<></>}>
                                <PWAInstallPrompt />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Phone Verify Gate" fallback={<></>}>
                                <PhoneVerifyGate />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Proactive Help" fallback={<></>}>
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
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Jarvis Panel" fallback={<></>}>
                                <JarvisPanel isOpen={isJarvisOpen} onClose={onJarvisClose} />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Global Error Catcher" fallback={<></>}>
                                <GlobalErrorCatcher />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Chunk Load Recovery" fallback={<></>}>
                                <ChunkLoadRecovery />
                              </HubErrorBoundary>
                            </WorldThemeProvider>
                          </ActiveIdentityProvider>
                        </NavigationGuard>
                      </TrainingSettingsProvider>
                    </OneSignalProvider>
                  </ExternalLinkProvider>
                </AvatarProvider>
              </UnreadProvider>
            </ThemeProvider>
          </AntiGravityProvider>
        </>
      </div>
    </SWRConfig>
  );
}




// Report Web Vitals to Sentry for performance monitoring
export function reportWebVitals({ id, name, label, value }) {
  try {
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.metrics?.distribution(name, value, {
        tags: { id, label },
        unit: name === 'CLS' ? 'none' : 'millisecond',
      });
    }
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebVital] ${name}: ${Math.round(value)}${name === 'CLS' ? '' : 'ms'}`);
    }
  } catch (_) { }
}
