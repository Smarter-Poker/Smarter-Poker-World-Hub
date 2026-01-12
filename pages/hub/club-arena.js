/**
 * ♠ SMARTER.POKER HUB — Club Arena
 * Embedded Club Arena application (Orb #2)
 */

import Head from 'next/head';
import { useEffect, useState } from 'react';

export default function ClubArenaPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

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
                src="https://club-arena.vercel.app"
                style={{
                    width: '100vw',
                    height: '100vh',
                    border: 'none',
                    display: 'block'
                }}
                title="Club Arena"
                allow="fullscreen"
            />
        </>
    );
}
