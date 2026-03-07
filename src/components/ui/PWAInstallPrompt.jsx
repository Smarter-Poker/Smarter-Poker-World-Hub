/**
 * PWA Install Prompt
 * Shows a native-style install banner when the browser fires 'beforeinstallprompt'
 * 
 * Dismissal persistence:
 *  - 1st "Later" → 30-day cooldown before showing again
 *  - 2nd "Later" → permanently dismissed (never shows again)
 *  - "Install" clicked → permanently stored as installed
 *  - Also listens for browser 'appinstalled' event as backup
 *  - Detects standalone/installed mode to avoid redundant prompts
 */
import { useState, useEffect } from 'react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      // ─── Already installed (user clicked Install or appinstalled fired) ───
      if (localStorage.getItem('pwa_installed')) return;

      // ─── Running as installed PWA ───
      if (window.matchMedia('(display-mode: standalone)').matches) {
        localStorage.setItem('pwa_installed', 'true');
        return;
      }

      // ─── Escalating dismissal logic ───
      const dismissCount = parseInt(localStorage.getItem('pwa_dismiss_count') || '0');
      if (dismissCount >= 2) return; // Permanently dismissed after 2nd "Later"

      const dismissedAt = localStorage.getItem('pwa_prompt_dismissed');
      if (dismissedAt) {
        const cooldown = 30 * 24 * 60 * 60 * 1000; // 30 days
        if (Date.now() - parseInt(dismissedAt) < cooldown) return;
      }
    } catch {
      // localStorage disabled (Safari private browsing, quota exceeded) — don't show prompt
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ─── Listen for the browser 'appinstalled' event (fires after actual install) ───
  useEffect(() => {
    const onInstalled = () => {
      localStorage.setItem('pwa_installed', 'true');
      setShow(false);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
    try {
      if (outcome === 'accepted') {
        // User accepted the install — permanently remember
        localStorage.setItem('pwa_installed', 'true');
      } else {
        // User dismissed the browser prompt — escalate dismiss count
        const count = parseInt(localStorage.getItem('pwa_dismiss_count') || '0') + 1;
        localStorage.setItem('pwa_dismiss_count', count.toString());
        localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
      }
    } catch {
      // localStorage disabled — silently continue
    }
  };

  const handleDismiss = () => {
    setShow(false);
    try {
      const count = parseInt(localStorage.getItem('pwa_dismiss_count') || '0') + 1;
      localStorage.setItem('pwa_dismiss_count', count.toString());
      localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
    } catch {
      // localStorage disabled — silently continue
    }
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)',
      maxWidth: 420,
      background: 'linear-gradient(135deg, #1a1f2e, #0f1318)',
      border: '1px solid rgba(255,215,0,0.3)',
      borderRadius: 16,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ fontSize: 36, flexShrink: 0 }}>♠</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 2 }}>
          Install Smarter.Poker
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
          Add to home screen for faster access
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.5)',
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          style={{
            background: 'linear-gradient(135deg, #FFD700, #FF8C00)',
            border: 'none',
            borderRadius: 8,
            color: '#0a0a15',
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Install
        </button>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
