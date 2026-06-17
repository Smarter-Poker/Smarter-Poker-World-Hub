import React from 'react';

export default function LocationEnablePopup({
showEnablePopup, setShowEnablePopup, handleRefreshLocation
}) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 155,
            background: 'rgba(3,4,8,0.88)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'lobby-fadeIn 0.25s ease-out',
            padding: '16px 8px env(safe-area-inset-bottom, 8px)',
          }}>
            <div style={{
              width: 'min(420px, 96vw)',
              maxHeight: '70vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: 'linear-gradient(160deg, rgba(18,24,40,0.98), rgba(10,16,28,0.98))',
              borderRadius: 18,
              border: '1.5px solid rgba(148,163,184,0.18)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.65), 0 0 30px rgba(212,168,83,0.08)',
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,0.1)',
                background: 'linear-gradient(180deg, rgba(212,168,83,0.06), transparent)',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.08))',
                    border: '1px solid rgba(34,197,94,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'lobby-gpsPulse 2s ease-in-out infinite',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#e6edf5', letterSpacing: '-0.3px' }}>Enable Location</div>
                    <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.5)', marginTop: 1 }}>Find poker rooms near you</div>
                  </div>
                </div>
                <button
                  onClick={() => { setShowEnablePopup(false); dismissLocationPrompt(); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.45)', cursor: 'pointer', fontSize: 22, padding: 4, lineHeight: 1 }}
                >&times;</button>
              </div>

              {/* Body */}
              <div style={{ padding: '14px 16px' }}>
                {/* Primary CTA — triggers browser permission prompt */}
                <button
                  onClick={() => {
                    // Close popup and attempt GPS — this triggers the native browser prompt
                    // On iOS Safari, permissionState may report 'prompt' even when denied,
                    // so always attempt GPS and handleGpsClick handles the error cases
                    setShowEnablePopup(false);
                    handleGpsClick({ fromModal: true });
                  }}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 12,
                    border: '1px solid rgba(34,197,94,0.45)',
                    background: 'linear-gradient(135deg, #238636, #196c2e)',
                    color: '#ffffff', fontSize: 14, fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 16px rgba(34,197,94,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                    marginBottom: 14,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
                  </svg>
                  Try Enabling Location
                </button>

                {/* Device-specific instructions — ALWAYS show (Safari doesn't support Permissions API for geolocation, so permissionState may never read 'denied') */}
                <div style={{
                  background: 'rgba(212,168,83,0.05)',
                  border: '1.5px solid rgba(148,163,184,0.12)',
                  borderRadius: 12, padding: '12px 14px',
                  marginBottom: 14,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#d4a853', textTransform: 'uppercase',
                    letterSpacing: '0.8px', marginBottom: 10,
                  }}>
                    {deviceType === 'ios' ? 'iPhone / iPad' : deviceType === 'android' ? 'Android' : 'Browser'} — How To Enable
                  </div>

                  {deviceType === 'ios' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { step: '1', text: 'Open Settings on your iPhone' },
                        { step: '2', text: 'Tap Privacy & Security → Location Services' },
                        { step: '3', text: 'Make sure Location Services is ON' },
                        { step: '4', text: 'Scroll down, tap Safari (or your browser)' },
                        { step: '5', text: 'Select "While Using The App" or "Ask"' },
                        { step: '6', text: 'Return here and tap the button above' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            minWidth: 22, height: 22, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                            border: '1.5px solid rgba(212,168,83,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: '#d4a853',
                            flexShrink: 0,
                          }}>{s.step}</div>
                          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.75)', lineHeight: 1.45, paddingTop: 2 }}>
                            {s.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {deviceType === 'android' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { step: '1', text: 'Open Settings on your phone' },
                        { step: '2', text: 'Tap Location and make sure it\'s ON' },
                        { step: '3', text: 'Tap App Permissions → your browser' },
                        { step: '4', text: 'Select "Allow" and return here' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            minWidth: 22, height: 22, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                            border: '1.5px solid rgba(212,168,83,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: '#d4a853',
                            flexShrink: 0,
                          }}>{s.step}</div>
                          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.75)', lineHeight: 1.45, paddingTop: 2 }}>
                            {s.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {deviceType === 'desktop' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { step: '1', text: 'Click the lock icon in your address bar' },
                        { step: '2', text: 'Find "Location" → change to "Allow"' },
                        { step: '3', text: 'Reload the page' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            minWidth: 22, height: 22, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                            border: '1.5px solid rgba(212,168,83,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: '#d4a853',
                            flexShrink: 0,
                          }}>{s.step}</div>
                          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.75)', lineHeight: 1.45, paddingTop: 2 }}>
                            {s.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{
                  textAlign: 'center', fontSize: 10, color: 'rgba(200,214,229,0.3)',
                  marginBottom: 10, textTransform: 'uppercase', letterSpacing: '1.5px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(200,214,229,0.1)' }} />
                  or
                  <div style={{ flex: 1, height: 1, background: 'rgba(200,214,229,0.1)' }} />
                </div>

                {/* Manual Entry CTA */}
                <button
                  onClick={() => {
                    setShowEnablePopup(false);
                    setShowManualLocation(true);
                  }}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 10,
                    border: '1.5px solid rgba(148,163,184,0.15)',
                    background: 'rgba(212,168,83,0.06)',
                    color: 'rgba(200,214,229,0.7)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                  Enter Location Manually Instead
                </button>
              </div>
            </div>
          </div>
    );
}
