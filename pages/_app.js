/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver + Anti-Gravity Auto-Boot
   Global styles, providers, Neural Conduction Field, and Diamond Celebration
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/index.css';
import '../src/styles/premium.css';
import dynamic from 'next/dynamic';
import { AntiGravityProvider } from '../src/providers/AntiGravityProvider';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { UnreadProvider } from '../src/hooks/useUnreadCount';

// Dynamic imports to avoid SSR issues with canvas/animations
const CelebrationManager = dynamic(
  () => import('../src/components/diamonds/CelebrationManager').then(mod => mod.CelebrationManager),
  { ssr: false }
);

const NeuralConductionField = dynamic(
  () => import('../src/components/ui/background/NeuralConductionField').then(mod => mod.NeuralConductionField),
  { ssr: false }
);

/**
 * App Root - AntiGravityProvider wraps everything for automatic boot.
 * ThemeProvider handles dark/light mode with localStorage persistence.
 * UnreadProvider tracks unread message count globally.
 * NeuralConductionField renders the always-on background visual system.
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
          {/* Neural Conduction Field - Core visual identity, always-on background */}
          <NeuralConductionField />
          <Component {...pageProps} />
          <CelebrationManager />
        </UnreadProvider>
      </ThemeProvider>
    </AntiGravityProvider>
  );
}
