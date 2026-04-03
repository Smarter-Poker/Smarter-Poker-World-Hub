/**
 * LOCATION ENABLE MODAL — Smart platform-specific location instructions
 * 
 * Replaces raw alert() with a premium modal that detects iOS / Android / Desktop
 * and shows step-by-step instructions for enabling location services.
 * Includes "Enter Manually" fallback and auto-retry button.
 */
import React, { useState, useEffect, useCallback } from 'react';

/**
 * Detect device type from user agent
 */
function detectDeviceType() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

/**
 * Detect if user is in a PWA / standalone mode
 */
function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true;
}

/**
 * Detect browser name for more specific instructions
 */
function detectBrowser() {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent || '';
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/FxiOS/i.test(ua)) return 'Firefox';
  if (/EdgiOS|Edg/i.test(ua)) return 'Edge';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  return 'browser';
}

const IOS_STEPS = [
  { step: '1', text: 'Open Settings on your iPhone' },
  { step: '2', text: 'Tap Privacy & Security, then Location Services' },
  { step: '3', text: 'Make sure Location Services is ON' },
  { step: '4', text: 'Scroll down and tap Safari (or your browser)' },
  { step: '5', text: 'Select "While Using The App" or "Ask Next Time"' },
  { step: '6', text: 'Return here and tap "Try Again" below' },
];

const IOS_PWA_STEPS = [
  { step: '1', text: 'Open Settings on your iPhone' },
  { step: '2', text: 'Tap Privacy & Security, then Location Services' },
  { step: '3', text: 'Make sure Location Services is ON' },
  { step: '4', text: 'Scroll down and find Smarter.Poker' },
  { step: '5', text: 'Select "While Using The App"' },
  { step: '6', text: 'Return here and tap "Try Again" below' },
];

const ANDROID_STEPS = [
  { step: '1', text: 'Open Settings on your phone' },
  { step: '2', text: 'Tap Location and make sure it\'s ON' },
  { step: '3', text: 'Tap App Permissions or App Location Permissions' },
  { step: '4', text: 'Find your browser and select "Allow"' },
  { step: '5', text: 'Return here and tap "Try Again" below' },
];

const DESKTOP_STEPS = [
  { step: '1', text: 'Click the lock/info icon in your browser address bar' },
  { step: '2', text: 'Find "Location" and change it to "Allow"' },
  { step: '3', text: 'Close the popup — the page will auto-detect your location' },
];

export default function LocationEnableModal({ 
  isOpen, 
  onClose, 
  onRetry,
  onManualEntry,
}) {
  const [deviceType, setDeviceType] = useState('desktop');
  const [browserName, setBrowserName] = useState('browser');
  const [isPwa, setIsPwa] = useState(false);
  const [permissionState, setPermissionState] = useState('denied');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setDeviceType(detectDeviceType());
    setBrowserName(detectBrowser());
    setIsPwa(isStandalone());

    // Check permission state
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        setPermissionState(status.state);
        status.onchange = () => {
          setPermissionState(status.state);
          if (status.state === 'granted' && onRetry) {
            onRetry();
          }
        };
      }).catch(() => {
        setPermissionState('denied');
      });
    }
  }, []);

  const handleRetry = useCallback(() => {
    setRetrying(true);
    if (permissionState !== 'denied') {
      // Permission is 'prompt' — trigger native dialog
      if (onRetry) onRetry();
      return;
    }
    // Permission is denied — try anyway (some browsers may re-prompt)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setRetrying(false);
          if (onRetry) onRetry();
        },
        () => {
          setRetrying(false);
          // Still denied — instructions remain visible
        },
        { timeout: 5000 }
      );
    } else {
      setRetrying(false);
    }
  }, [permissionState, onRetry]);

  if (!isOpen) return null;

  const steps = deviceType === 'ios'
    ? (isPwa ? IOS_PWA_STEPS : IOS_STEPS)
    : deviceType === 'android'
      ? ANDROID_STEPS
      : DESKTOP_STEPS;

  const platformLabel = deviceType === 'ios'
    ? (isPwa ? 'Smarter.Poker App' : `iPhone / ${browserName}`)
    : deviceType === 'android'
      ? `Android / ${browserName}`
      : browserName;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(3,4,8,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'locModalFadeIn 0.25s ease-out',
      padding: '20px',
    }}>
      <div style={{
        width: 'min(460px, 94vw)',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'linear-gradient(160deg, rgba(18,24,40,0.98), rgba(10,16,28,0.98))',
        borderRadius: 22,
        border: '1.5px solid rgba(148,163,184,0.18)',
        boxShadow: '0 24px 72px rgba(0,0,0,0.65), 0 0 40px rgba(212,168,83,0.08)',
        overflow: 'hidden',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid rgba(148,163,184,0.1)',
          background: 'linear-gradient(180deg, rgba(212,168,83,0.06), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.08))',
              border: '1px solid rgba(34,197,94,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'locGpsPulse 2s ease-in-out infinite',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#e6edf5', letterSpacing: '-0.3px' }}>Enable Location</div>
              <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 1 }}>Find poker rooms near you instantly</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.45)', cursor: 'pointer', fontSize: 24, padding: 4, lineHeight: 1 }}
            aria-label="Close"
          >&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* Primary CTA */}
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14,
              border: '1px solid rgba(34,197,94,0.45)',
              background: retrying
                ? 'linear-gradient(135deg, #1a5c28, #144a22)'
                : 'linear-gradient(135deg, #238636, #196c2e)',
              color: '#ffffff', fontSize: 15, fontWeight: 800,
              cursor: retrying ? 'wait' : 'pointer', fontFamily: 'inherit',
              boxShadow: '0 6px 20px rgba(34,197,94,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.2s',
              marginBottom: 20,
              opacity: retrying ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
            </svg>
            {retrying ? 'Checking...' : permissionState === 'denied' ? 'Try Again' : 'Enable Location Now'}
          </button>

          {/* Device-specific instructions panel */}
          <div style={{
            background: 'rgba(212,168,83,0.05)',
            border: '1.5px solid rgba(148,163,184,0.12)',
            borderRadius: 14, padding: '16px 18px',
            marginBottom: 20,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#d4a853', textTransform: 'uppercase',
              letterSpacing: '0.8px', marginBottom: 12,
            }}>
              {platformLabel} — How To Enable
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {steps.map(s => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    minWidth: 26, height: 26, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                    border: '1.5px solid rgba(212,168,83,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#d4a853',
                    flexShrink: 0,
                  }}>{s.step}</div>
                  <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.75)', lineHeight: 1.5, paddingTop: 3 }}>
                    {s.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Reload page CTA */}
            {deviceType === 'desktop' && (
              <button
                onClick={() => window.location.reload()}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, marginTop: 14,
                  border: '1.5px solid rgba(148,163,184,0.18)',
                  background: 'rgba(212,168,83,0.08)',
                  color: '#d4a853', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                Reload Page After Enabling
              </button>
            )}
          </div>

          {/* Divider */}
          <div style={{
            textAlign: 'center', fontSize: 11, color: 'rgba(200,214,229,0.3)',
            marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1.5px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(200,214,229,0.1)' }} />
            or
            <div style={{ flex: 1, height: 1, background: 'rgba(200,214,229,0.1)' }} />
          </div>

          {/* Manual Entry CTA */}
          {onManualEntry && (
            <button
              onClick={() => { onClose(); onManualEntry(); }}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12,
                border: '1.5px solid rgba(148,163,184,0.15)',
                background: 'rgba(212,168,83,0.06)',
                color: 'rgba(200,214,229,0.7)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
              Enter Location Manually Instead
            </button>
          )}

          {/* Skip / Close */}
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: 'rgba(200,214,229,0.35)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Skip For Now
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes locModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes locGpsPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
      `}</style>
    </div>
  );
}
