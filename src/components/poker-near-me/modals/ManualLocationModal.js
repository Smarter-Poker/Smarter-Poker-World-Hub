import React from 'react';

export default function ManualLocationModal({
showManualLocation, setShowManualLocation, manualAddress, setManualAddress, handleGeocodeAddress, isSearching
}) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 150,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 'min(440px, 92vw)',
              background: 'linear-gradient(160deg, rgba(18,24,40,0.98), rgba(10,16,28,0.98))',
              borderRadius: 20,
              border: '1.5px solid rgba(148,163,184,0.15)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#e0e8f0' }}>Set Your Location</div>
                  <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>Enter your city to find poker near you</div>
                </div>
                <button onClick={() => { setShowManualLocation(false); dismissLocationPrompt(); }} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 22, padding: 4 }}>&times;</button>
              </div>
              {/* Body */}
              <div style={{ padding: '20px 24px' }}>
                {/* Try GPS Again button */}
                <button onClick={() => handleGpsClick({ fromModal: true })}
                  disabled={gpsLoading}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 12,
                    border: gpsLoading ? '1.5px solid rgba(212,168,83,0.4)' : '1px solid rgba(63,185,80,0.4)',
                    background: gpsLoading ? 'rgba(212,168,83,0.12)' : 'linear-gradient(135deg, #238636, #196c2e)',
                    color: '#ffffff', fontSize: 14, fontWeight: 700,
                    cursor: gpsLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
                    boxShadow: gpsLoading ? 'none' : '0 4px 16px rgba(35,134,54,0.3)', marginBottom: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}>
                  {gpsLoading ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31" strokeDashoffset="10" />
                      </svg>
                      Locating...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      Try GPS Again
                    </>
                  )}
                </button>
                {gpsError && (
                  <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                    {gpsError}
                  </div>
                )}

                <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(200,214,229,0.35)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>or enter manually</div>

                {/* City Input */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>City</label>
                  <input
                    type="text" placeholder="e.g. Chicago" value={manualCity} maxLength={100}
                    onChange={(e) => setManualCity(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualLocationSet(); }}
                    autoFocus
                    autoComplete="off"
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1px solid rgba(48,54,61,0.6)', background: '#0d1117',
                      color: '#e0e8f0', fontSize: 15, fontFamily: 'inherit', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* State Select */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>State</label>
                  <select value={manualState} onChange={(e) => setManualState(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1px solid rgba(48,54,61,0.6)', background: '#0d1117',
                      color: '#c9d1d9', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                      boxSizing: 'border-box',
                    }}>
                    <option value="">Select State (optional)</option>
                    {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* Set Location Button */}
                <button onClick={handleManualLocationSet}
                  disabled={!manualCity.trim()}
                  style={{
                    width: '100%', padding: '13px 0', borderRadius: 12,
                    border: '1.5px solid rgba(212,168,83,0.4)',
                    background: manualCity.trim() ? 'linear-gradient(135deg, #1f6feb, #1a5cc7)' : 'rgba(212,168,83,0.08)',
                    color: manualCity.trim() ? '#ffffff' : 'rgba(200,214,229,0.4)',
                    fontSize: 15, fontWeight: 800, cursor: manualCity.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', boxShadow: manualCity.trim() ? '0 4px 16px rgba(31,111,235,0.3)' : 'none',
                    transition: 'all 0.2s',
                  }}>
                  Set Location
                </button>
              </div>
            </div>
          </div>
    );
}
