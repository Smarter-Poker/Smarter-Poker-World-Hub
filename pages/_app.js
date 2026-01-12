/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver
   Global styles and providers
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/index.css';

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
