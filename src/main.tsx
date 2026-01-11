/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — MAIN ENTRY POINT
   Sovereign Reset: Import index.css for full CSS liberation
   ═══════════════════════════════════════════════════════════════════════════ */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
