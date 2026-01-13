/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver + Anti-Gravity Auto-Boot
   Global styles, providers, and Diamond Celebration System
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/index.css';
import dynamic from 'next/dynamic';
import { AntiGravityProvider } from '../src/providers/AntiGravityProvider';

// Dynamic import to avoid SSR issues with celebration animations
const CelebrationManager = dynamic(
  () => import('../src/components/diamonds/CelebrationManager').then(mod => mod.CelebrationManager),
  { ssr: false }
);

/**
 * App Root - AntiGravityProvider wraps everything for automatic boot.
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
      <Component {...pageProps} />
      <CelebrationManager />
    </AntiGravityProvider>
  );
}
