/**
 * ♠ SMARTER.POKER HUB — Club Arena
 * Embedded Club Arena application (Orb #2)
 * SSO handshake + XP/Diamond event bus via postMessage
 */

import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function ClubArenaPage() {
    const [mounted, setMounted] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);
    const iframeRef = useRef(null);
    const supabase = createClientComponentClient();

    useEffect(() => {
        setMounted(true);

        // Listen for events from Club Arena (XP, Diamonds, etc.)
        const handleMessage = async (event) => {
            if (!event.origin.includes('club-arena.vercel.app')) return;

            if (event.data?.type === 'CLUB_ARENA_EVENT') {
                const { eventType, payload } = event.data;

                switch (eventType) {
                    case 'XP_EARNED':
                        console.log('🎯 XP Earned:', payload);
                        // TODO: Call Supabase RPC to add XP
                        // await supabase.rpc('add_xp', { amount: payload.amount, reason: payload.reason });
                        break;

                    case 'DIAMOND_EARNED':
                        console.log('💎 Diamond Earned:', payload);
                        // TODO: Call Supabase RPC to add diamonds
                        // await supabase.rpc('add_diamonds', { amount: payload.amount, reason: payload.reason });
                        break;

                    case 'ACHIEVEMENT_UNLOCKED':
                        console.log('🏆 Achievement:', payload);
                        // TODO: Trigger celebration queue
                        break;

                    default:
                        console.log('Unknown event:', eventType, payload);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Send auth to iframe when it loads
    const handleIframeLoad = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session && iframeRef.current) {
                // Send session to iframe
                iframeRef.current.contentWindow.postMessage({
                    type: 'SMARTER_POKER_SSO',
                    payload: {
                        user: {
                            id: session.user.id,
                            email: session.user.email,
                            username: session.user.user_metadata?.username || session.user.email?.split('@')[0],
                            display_name: session.user.user_metadata?.display_name || session.user.user_metadata?.username,
                            avatar_url: session.user.user_metadata?.avatar_url,
                        },
                        access_token: session.access_token,
                        expires_at: session.expires_at,
                    }
                }, 'https://club-arena.vercel.app');

                setSessionReady(true);
            }
        } catch (error) {
            console.error('Failed to send SSO:', error);
        }
    };

    if (!mounted) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#050507',
                color: '#fff'
            }}>
                Loading Club Arena...
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Club Arena | Smarter.Poker</title>
                <meta name="description" content="Private poker clubs, better than PokerBros" />
            </Head>
            <iframe
                ref={iframeRef}
                src="https://club-arena.vercel.app"
                style={{
                    width: '100vw',
                    height: '100vh',
                    border: 'none',
                    display: 'block'
                }}
                title="Club Arena"
                allow="fullscreen"
                onLoad={handleIframeLoad}
            />
        </>
    );
}
