import React from 'react';
import { useRouter } from 'next/router';

export default function LoginPromptModal({
showLoginPrompt, setShowLoginPrompt
}) {
    const router = useRouter();
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowLoginPrompt(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              width: 'min(380px, 85vw)', padding: '32px 28px', textAlign: 'center',
              background: 'rgba(18,24,40,0.97)', borderRadius: 20,
              border: '1px solid rgba(148,163,184,0.12)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ marginBottom: 12, opacity: 0.6 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign In Required</h3>
              <p style={{ color: 'rgba(200,214,229,0.5)', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
                You need to be signed in to check in at venues and leave reviews. Create a free account to unlock all features.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => setShowLoginPrompt(false)} style={{
                  padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.12)',
                  background: 'transparent', color: 'rgba(200,214,229,0.6)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
                <button onClick={() => { setShowLoginPrompt(false); router.push('/auth/login?redirect=' + encodeURIComponent('/hub/poker-near-me/lobby')); }} style={{
                  padding: '10px 28px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #d4a853, #b8860b)', color: '#0a1628', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(0,212,255,0.25)',
                }}>Sign In</button>
              </div>
            </div>
          </div>
    );
}
