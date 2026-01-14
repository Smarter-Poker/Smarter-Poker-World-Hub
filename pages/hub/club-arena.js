/**
 * ♠ SMARTER.POKER HUB — Club Arena
 * Embedded Club Arena application (Orb #2)
 * SSO handshake + XP/Diamond event bus via postMessage
 */

import Head from 'next/head';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';

export default function ClubArenaPage() {
    const [mounted, setMounted] = useState(false);
    const iframeRef = useRef(null);

    // Send session to iframe
    const sendSessionToIframe = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session && iframeRef.current?.contentWindow) {
                console.log('📤 Sending SSO to Club Arena iframe');
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
                }, '*'); // Use * for cross-origin
            } else {
                console.log('⚠️ No session or iframe not ready');
            }
        } catch (error) {
            console.error('Failed to send SSO:', error);
        }
    }, []);

    useEffect(() => {
        setMounted(true);

        // Listen for messages from Club Arena
        const handleMessage = async (event) => {
            // Accept messages from club-arena
            if (!event.origin.includes('club-arena.vercel.app') &&
                !event.origin.includes('localhost')) {
                return;
            }

            console.log('📨 Hub received:', event.data?.type);

            // Handle SSO request from iframe
            if (event.data?.type === 'REQUEST_SSO') {
                console.log('🔗 Club Arena requested SSO');
                sendSessionToIframe();
            }

            // Handle XP/Diamond events
            if (event.data?.type === 'CLUB_ARENA_EVENT') {
                const { eventType, payload } = event.data;

                switch (eventType) {
                    case 'XP_EARNED':
                        console.log('🎯 XP Earned:', payload);
                        break;
                    case 'DIAMOND_EARNED':
                        console.log('💎 Diamond Earned:', payload);
                        break;
                    case 'ACHIEVEMENT_UNLOCKED':
                        console.log('🏆 Achievement:', payload);
                        break;
                    default:
                        console.log('Unknown event:', eventType, payload);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [sendSessionToIframe]);

    // Send auth to iframe when it loads
    const handleIframeLoad = () => {
        console.log('🖼️ Iframe loaded, sending SSO');
        // Small delay to ensure iframe message listener is ready
        setTimeout(sendSessionToIframe, 500);
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
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    border: 'none',
                    display: 'block',
                    zIndex: 9999,
                }}
                title="Club Arena"
                allow="fullscreen"
                onLoad={handleIframeLoad}
            />
        </>
    );
}

