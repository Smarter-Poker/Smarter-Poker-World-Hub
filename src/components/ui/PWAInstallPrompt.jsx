/**
 * PWA Install Prompt — Military-Grade Persistence
 * Shows a native-style install banner when the browser fires 'beforeinstallprompt'
 *
 * Dismissal persistence (3 layers):
 *  1. localStorage: Immediate client-side check (fastest)
 *  2. Server-side IP tracking: Survives cache clears, incognito, new browsers
 *  3. Standalone detection: If already installed, never shows
 *
 * ONE CLICK = PERMANENT. If a user clicks "Later" or "Install", the prompt
 * NEVER comes back, even if they clear all browser data.
 */
import { useState, useEffect, useRef } from 'react';

const DISMISS_KEY = 'pwa_prompt_dismissed_permanent';
const INSTALLED_KEY = 'pwa_installed';

/**
 * Check server-side if this IP already dismissed/installed the PWA prompt.
 * Reuses the same API + Supabase table pattern as the notification prompt.
 */
async function checkServerDismissed() {
  try {
    const res = await fetch('/api/pwa/prompt-status', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.dismissed === true;
  } catch {
    return false;
  }
}

/**
 * Record on server that this IP responded to the PWA prompt.
 * Fire-and-forget — never blocks the UI.
 */
function recordOnServer(action) {
  try {
    fetch('/api/pwa/prompt-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => { });
  } catch {
    // Silently ignore
  }
}

/** Safe localStorage write */
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/** Safe localStorage read */
function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // ─── Layer 1: localStorage checks (instant) ───
    if (safeGet(INSTALLED_KEY)) return;
    if (safeGet(DISMISS_KEY)) return;

    // ─── Running as installed PWA — mark permanently ───
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      safeSet(INSTALLED_KEY, 'true');
      recordOnServer('standalone_detected');
      return;
    }

    // ─── Layer 2: Server-side IP check (survives cache clears) ───
    checkServerDismissed().then(serverDismissed => {
      if (!mountedRef.current) return;

      if (serverDismissed) {
        // Server confirms this IP already responded — sync localStorage
        safeSet(DISMISS_KEY, `server_confirmed_${Date.now()}`);
        return; // Don't show
      }

      // ─── All clear — listen for the browser install event ───
      const handler = (e) => {
        e.preventDefault();
        if (!mountedRef.current) return;
        // Final guard: re-check localStorage in case another tab dismissed
        if (safeGet(DISMISS_KEY) || safeGet(INSTALLED_KEY)) return;
        setDeferredPrompt(e);
        setShow(true);
      };

      window.addEventListener('beforeinstallprompt', handler);
      // Cleanup is handled by the parent effect unmount
      return () => window.removeEventListener('beforeinstallprompt', handler);
    });
  }, []);

  // ─── Listen for the browser 'appinstalled' event ───
  useEffect(() => {
    const onInstalled = () => {
      safeSet(INSTALLED_KEY, 'true');
      recordOnServer('installed');
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

    if (outcome === 'accepted') {
      // User accepted — permanently installed
      safeSet(INSTALLED_KEY, 'true');
      recordOnServer('installed');
    } else {
      // User dismissed the native browser prompt — STILL permanently dismiss our custom UI
      safeSet(DISMISS_KEY, `dismissed_native_${Date.now()}`);
      recordOnServer('dismissed');
    }
  };

  const handleDismiss = () => {
    setShow(false);
    // ONE CLICK = PERMANENT — both client and server
    safeSet(DISMISS_KEY, `later_${Date.now()}`);
    recordOnServer('later');
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
