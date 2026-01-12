/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver
   Global styles and providers + Diamond Celebration System
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/index.css';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with celebration animations
const CelebrationManager = dynamic(
  () => import('../src/components/diamonds/CelebrationManager').then(mod => mod.CelebrationManager),
  { ssr: false }
);

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <CelebrationManager />
    </>
  );
}
