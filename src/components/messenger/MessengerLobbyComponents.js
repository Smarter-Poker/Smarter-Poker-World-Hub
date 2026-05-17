import React, { useEffect } from 'react';
import Link from 'next/link';
import { defaultTheme } from './MessengerTheme';

// ═══════════════════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function Toast({ toast, onDismiss, theme: C = defaultTheme }) {
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => onDismiss(), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast, onDismiss]);

    if (!toast) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 130,
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? C.red : toast.type === 'success' ? C.green : C.blue,
            color: 'white',
            padding: '12px 24px',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '90vw',
        }}>
            <span>{toast.type === 'error' ? '!' : toast.type === 'success' ? '>' : 'i'}</span>
            <span>{toast.message}</span>
            <button
                onClick={onDismiss}
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', marginLeft: 8 }}
            >×</button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ⌨️ TYPING INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function TypingIndicator({ name, theme: C = defaultTheme }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            color: C.textSec,
            fontSize: 13,
        }}>
            <div style={{ display: 'flex', gap: 3 }}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', background: C.textSec,
                        animation: `bounce 1.4s infinite ${i * 0.2}s`,
                    }} />
                ))}
            </div>
            <span>{name} is typing...</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 💀 SKELETON LOADING COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function ConversationSkeleton({ count = 6, theme: C = defaultTheme }) {
    return (
        <div style={{ padding: '8px 0' }}>
            {Array.from({ length: count }).map((_, i) => {
                const nameW = 100 + ((i * 37) % 60);
                const prevW = 140 + ((i * 53) % 80);
                return (
                <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                }}>
                    {/* Avatar skeleton */}
                    <div style={{
                        width: 50, height: 50, borderRadius: '50%',
                        background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite',
                        flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                        {/* Name skeleton */}
                        <div style={{
                            width: nameW, height: 14, borderRadius: 7,
                            background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s infinite',
                            marginBottom: 8,
                        }} />
                        {/* Message preview skeleton */}
                        <div style={{
                            width: prevW, height: 12, borderRadius: 6,
                            background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s infinite',
                        }} />
                    </div>
                </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📭 EMPTY CONVERSATION STATE
// ═══════════════════════════════════════════════════════════════════════════
export function EmptyConversationState({ theme: C = defaultTheme }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '60px 24px', textAlign: 'center',
        }}>
            <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: `linear-gradient(135deg, ${C.blue}22, ${C.blue}11)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, marginBottom: 20,
                border: `2px dashed ${C.blue}44`,
            }}>💬</div>
            <h3 style={{ margin: '0 0 8px', color: C.text, fontSize: 18, fontWeight: 600 }}>
                No Conversations Yet
            </h3>
            <p style={{ margin: '0 0 20px', color: C.textSec, fontSize: 14, lineHeight: 1.5 }}>
                Add friends and start chatting! Your poker network is waiting.
            </p>
            <Link href="/hub/friends" style={{
                padding: '10px 24px', background: C.blue,
                color: 'white', borderRadius: 20,
                fontWeight: 600, fontSize: 14,
                textDecoration: 'none',
                transition: 'opacity 0.2s',
            }}>Find Friends</Link>
        </div>
    );
}
