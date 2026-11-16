/**
 * /t/[id] - a shared Club Arena tournament (2026-11-15)
 * ═══════════════════════════════════════════════════════════════════════════
 * Server-rendered so iMessage, WhatsApp, Discord, Telegram and the rest draw a
 * preview card (the event's name, buy-in, guarantee and start time) instead of
 * the generic Poker Arena card.
 *
 * A person who is already signed in is sent straight on to the tournament in
 * Club Arena. A person who is not sees what they were invited to, with one
 * Register button that goes to the same place, where Club Arena's sign-in
 * keeps the return path. A preview crawler is never redirected.
 *
 * Private, VIP-only and non-public-club events answer exactly like a missing
 * one (fn_ca_tournament_share_preview), so this page can never show a stranger
 * an event they could not see in the lobby. Amounts are chips, never a
 * currency sign.
 */
import { useEffect } from 'react';
import Head from 'next/head';
import {
    buyInWords,
    clubArenaTournamentPath,
    gameLine,
    guaranteeWords,
    hasSignedInSession,
    isOpenForEntry,
    normalizeTournamentId,
    readSharedTournament,
    startWords,
    statusWords,
    tournamentPreviewText,
} from '../../src/lib/sharedTournamentLink';

const ORIGIN = 'https://smarter.poker';

export async function getServerSideProps({ params, res }) {
    const id = normalizeTournamentId(String(params?.id || ''));
    if (!id) return { notFound: true };
    let shared = null;
    try {
        shared = await readSharedTournament(id);
    } catch (err) {
        // The database could not be asked: still offer the way in, and draw the
        // plain card rather than a wrong one.
        shared = { status: 'unknown' };
        console.warn('[shared-tournament] read failed:', err?.message || err);
    }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return {
        props: {
            id,
            status: shared?.status || 'unknown',
            preview: shared?.status === 'found' ? shared.preview : null,
            renderedAt: Date.now(),
        },
    };
}

export default function SharedTournamentLanding({ id, status, preview, renderedAt }) {
    const target = clubArenaTournamentPath(id);

    useEffect(() => {
        // Signed in: straight to the tournament. replace(): Back returns to
        // wherever the link was tapped.
        if (hasSignedInSession(window.localStorage)) window.location.replace(target);
    }, [target]);

    const pageUrl = `${ORIGIN}/t/${id}`;
    const found = status === 'found' && preview;
    const { headline, description } = found
        ? tournamentPreviewText(preview, renderedAt)
        : {
              headline: 'A Club Arena Tournament',
              description: 'Play Poker Tournaments In Private Clubs On Smarter.Poker.',
          };
    const ogImage = found
        ? `${ORIGIN}/api/og/club-tournament?id=${encodeURIComponent(id)}`
        : `${ORIGIN}/api/og/club-tournament`;
    const open = found && isOpenForEntry(preview, renderedAt);
    const facts = found
        ? [
              ['Buy-In', buyInWords(preview).replace(/^Buy-In /, '')],
              // The label already says Guarantee: the value is just the chips.
              ['Guarantee', guaranteeWords(preview).replace(/ GTD$/, '') || 'None'],
              ['Starts', startWords(preview.startTime) || 'Soon'],
              ['Status', statusWords(preview, renderedAt)],
          ]
        : [];

    return (
        <main style={styles.page}>
            <Head>
                <title>{`${headline} | Smarter.Poker`}</title>
                <meta name="description" content={description} />
                <meta name="robots" content="noindex" />
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
            <section style={styles.card} aria-labelledby="shared-tournament-title">
                <p style={styles.eyebrow}>Smarter.Poker | Club Arena</p>
                <h1 id="shared-tournament-title" style={styles.title}>
                    {found ? preview.name || 'Tournament' : 'Club Arena Tournament'}
                </h1>
                {found && (preview.club || gameLine(preview)) && (
                    <p style={styles.sub}>{[gameLine(preview), preview.club].filter(Boolean).join(' | ')}</p>
                )}
                {found ? (
                    <dl style={styles.facts}>
                        {facts.map(([label, value]) => (
                            <div key={label} style={styles.fact}>
                                <dt style={styles.factLabel}>{label}</dt>
                                <dd style={styles.factValue}>{value}</dd>
                            </div>
                        ))}
                    </dl>
                ) : (
                    <p style={styles.note}>
                        {status === 'missing'
                            ? 'This Tournament Is Private Or No Longer Available. Members Can Open It In Club Arena.'
                            : 'Open Club Arena To See This Tournament.'}
                    </p>
                )}
                <a href={target} style={styles.button}>
                    {open ? 'Register' : 'Open Tournament'}
                </a>
                <p style={styles.small}>Free To Play. No Real-Money Gambling.</p>
            </section>
        </main>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: '#04060b',
        color: '#e7ebf2',
        fontFamily: "'Roboto Condensed', system-ui, sans-serif",
    },
    card: {
        width: '100%',
        maxWidth: 440,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '24px 20px',
        background: '#0d151e',
        border: '1px solid rgba(139,215,255,0.28)',
        borderRadius: 14,
    },
    eyebrow: { margin: 0, color: '#8bd7ff', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', fontSize: 12 },
    title: { margin: 0, fontSize: 28, lineHeight: 1.1, fontWeight: 900 },
    sub: { margin: 0, color: '#9aa4b2', fontSize: 15 },
    facts: { margin: '4px 0 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    fact: { margin: 0, padding: '10px 12px', background: '#04080d', borderRadius: 10 },
    factLabel: { margin: 0, color: '#9aa4b2', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    factValue: { margin: '4px 0 0', fontSize: 16, fontWeight: 700 },
    note: { margin: 0, color: '#9aa4b2', fontSize: 15 },
    button: {
        marginTop: 6,
        display: 'block',
        textAlign: 'center',
        padding: '14px 16px',
        background: '#1877F2',
        color: '#ffffff',
        fontWeight: 800,
        fontSize: 17,
        borderRadius: 10,
        textDecoration: 'none',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    small: { margin: 0, color: '#6b7380', fontSize: 12, textAlign: 'center' },
};
