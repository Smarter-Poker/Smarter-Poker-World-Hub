/**
 * PWA Install Prompt
 * Shows a native-style install banner when the browser fires 'beforeinstallprompt'
 * Respects user dismissal (stores in localStorage for 7 days)
 */
import { useState, useEffect } from 'react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed recently
    const dismissed = localStorage.getItem('pwa_prompt_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
    if (outcome === 'dismissed') {
      localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
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
