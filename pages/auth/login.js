/* ═══════════════════════════════════════════════════════════════════════════
   ACCESS NODE — Authentication Entry Point
   Vanguard Silver | Next.js Unified
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LoginPage() {
    const router = useRouter();

    useEffect(() => {
        // Check for existing session
        const session = typeof window !== 'undefined'
            ? localStorage.getItem('pokeriq_session')
            : null;

        if (session) {
            router.push('/hub');
        }
    }, [router]);

    const handleLogin = async () => {
        // TODO: Integrate with Supabase Auth
        console.log('Login initiated');
        localStorage.setItem('pokeriq_session', 'demo_session');
        router.push('/hub');
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #000a14 0%, #001428 50%, #000a14 100%)',
            fontFamily: 'Orbitron, sans-serif',
        }}>
            {/* Logo */}
            <img
                src="/smarter-poker-logo.png"
                alt="Smarter Poker"
                style={{
                    height: 120,
                    marginBottom: 40,
                    filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.3))',
                }}
            />

            {/* Title */}
            <h1 style={{
                fontSize: 32,
                fontWeight: 700,
                color: '#ffffff',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
            }}>
                Welcome To PokerIQ
            </h1>

            <p style={{
                fontSize: 14,
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: 40,
            }}>
                Your GTO Training Command Center
            </p>

            {/* Login Button */}
            <button
                onClick={handleLogin}
                style={{
                    padding: '16px 48px',
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: 'Orbitron, sans-serif',
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, rgba(0, 100, 180, 0.8), rgba(0, 60, 120, 0.9))',
                    border: '2px solid rgba(0, 212, 255, 0.5)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 20px rgba(0, 212, 255, 0.2)',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 6px 30px rgba(0, 212, 255, 0.4)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 212, 255, 0.2)';
                }}
            >
                Enter The Hub
            </button>

            {/* Footer */}
            <p style={{
                position: 'absolute',
                bottom: 24,
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.3)',
            }}>
                © 2026 Smarter.Poker — All Rights Reserved
            </p>
        </div>
    );
}
