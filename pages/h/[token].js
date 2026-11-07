/**
 * /h/[token] - a shared Club Arena hand (2026-11-06)
 * ═══════════════════════════════════════════════════════════════════════════
 * Server-rendered so iMessage, WhatsApp, Discord, Telegram and the rest draw a
 * preview card ("Mongo's Hand #56019216", the board, the pot) instead of a bare
 * URL. A person is sent straight on to Club Arena's replay for the token,
 * /hub/club-arena/h/<token>, which opens the hand and counts the view. A
 * preview crawler gets the card and is never counted.
 */
import { useEffect } from 'react';
import Head from 'next/head';
import { isLinkPreviewBot } from '../../src/lib/clubInvite';
import {
    clubArenaHandPath,
    handPreviewText,
    normalizeHandToken,
    readSharedHand,
} from '../../src/lib/sharedHandLink';

const ORIGIN = 'https://smarter.poker';

export async function getServerSideProps({ params, req, res }) {
    const token = normalizeHandToken(String(params?.token || ''));
    if (!token) return { notFound: true };
    const bot = isLinkPreviewBot(req.headers['user-agent']);
    let shared = null;
    try {
        shared = await readSharedHand(token);
    } catch (err) {
        // The database could not be asked: still send the person on, where
        // Club Arena says "could not load" rather than "does not exist", and
        // draw the plain card rather than a wrong one.
        shared = { status: 'unknown' };
        console.warn('[shared-hand] read failed:', err?.message || err);
    }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return {
        props: {
            token,
            bot,
            status: shared?.status || 'unknown',
            preview: shared?.status === 'found' ? shared.preview : null,
        },
    };
}

export default function SharedHandLanding({ token, bot, status, preview }) {
    const target = clubArenaHandPath(token);

    useEffect(() => {
        // replace(): Back returns to wherever the link was tapped.
        window.location.replace(target);
    }, [target]);

    const pageUrl = `${ORIGIN}/h/${token}`;
    const found = status === 'found';
    const { headline, description } = found
        ? handPreviewText(preview)
        : { headline: 'A Club Arena Hand', description: 'Watch Poker Hands And Play In Private Clubs On Smarter.Poker.' };
    const ogImage = found ? `${ORIGIN}/api/og/club-hand?token=${encodeURIComponent(token)}` : `${ORIGIN}/api/og/club-hand`;

    return (
        <main style={styles.page}>
            <Head>
                <title>{`${headline} | Smarter.Poker`}</title>
                <meta name="description" content={description} />
                <meta name="robots" content="noindex" />
                {!bot && <meta httpEquiv="refresh" content={`0;url=${target}`} />}
                <link key="canonical" rel="canonical" href={pageUrl} />
                <meta key="og-type" property="og:type" content="website" />
                <meta key="og-site-name" property="og:site_name" content="Smarter.Poker" />
                <meta key="og-url" property="og:url" content={pageUrl} />
                <meta key="og-title" property="og:title" content={headline} />
                <meta key="og-description" property="og:description" content={description} />
                <meta key="og-image" property="og:image" content={ogImage} />
                <meta key="og-image-width" property="og:image:width" content="1200" />
                <meta key="og-image-height" property="og:image:height" content="630" />
                <meta key="og-image-type" property="og:image:type" content="image/png" />
                <meta key="twitter-card" name="twitter:card" content="summary_large_image" />
                <meta key="twitter-title" name="twitter:title" content={headline} />
                <meta key="twitter-description" name="twitter:description" content={description} />
                <meta key="twitter-image" name="twitter:image" content={ogImage} />
            </Head>
            <p style={styles.text}>Opening The Hand</p>
            <a href={target} style={styles.link}>Open The Replay</a>
        </main>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: '#04060b',
        color: '#e7ebf2',
        fontFamily: "'Roboto Condensed', system-ui, sans-serif",
    },
    text: { margin: 0, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 1 },
    link: { color: '#8bd7ff', fontWeight: 700, textDecoration: 'none' },
};
