/**
 * /t/[id] - a shared Club Arena tournament (2026-11-15)
 * ═══════════════════════════════════════════════════════════════════════════
 * Server-rendered so iMessage, WhatsApp, Discord, Telegram and the rest draw a
 * preview card (the event's name, buy-in, guarantee/stack and start rule)
 * instead of the generic Poker Arena card.
 *
 * A person who is already signed in is sent straight on to the tournament in
 * Club Arena. A person who is not sees what they were invited to, with one
 * Register button that goes to the same place, where Club Arena's sign-in
 * keeps the return path. A preview crawler is never redirected.
 *
 * The link's club code (?i=) and seat-hold token (?invite=) go on to Club
 * Arena with it (2026-11-22), sanitised exactly as /g/ does, so a friend who is
 * not yet in the club is offered its join step there instead of "Tournament
 * Not Found". The preview card and its cache are unchanged: the code changes
 * where the button goes, not what the card says.
 *
 * Spins and Sit & Go's launch when full (never on a scheduled clock time), so
 * they show "When Full" instead of a timestamp and never render a useless
 * "Guarantee: None" box.
 *
 * Private, VIP-only and non-public-club events answer exactly like a missing
 * one (fn_ca_tournament_share_preview), so this page can never show a stranger
 * an event they could not see in the lobby. Amounts are chips, never a
 * currency sign.
 */
import { useEffect } from 'react';
import Head from 'next/head';
import { arenaCardStyles as styles } from '../../src/lib/sharedArenaCardStyles';
import { sanitizeShareParams } from '../../src/lib/sharedGameLink';
import {
    clubArenaTournamentPath,
    gameLine,
    hasSignedInSession,
    isOpenForEntry,
    isSeatBasedTournament,
    normalizeTournamentId,
    readSharedTournament,
    tournamentLandingFacts,
    tournamentPreviewText,
} from '../../src/lib/sharedTournamentLink';

const ORIGIN = 'https://smarter.poker';

export async function getServerSideProps({ params, query, res }) {
    const id = normalizeTournamentId(String(params?.id || ''));
    if (!id) return { notFound: true };
    // The club code (and a seat-hold token) ride on to Club Arena, sanitised
    // exactly as /g/ sanitises them (2026-11-22). Nothing else is forwarded.
    const shareParams = sanitizeShareParams(query);
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
            shareParams,
        },
    };
}

function formatBadgeLabel(preview) {
    if (!preview) return 'Tournament';
    const fmt = String(preview.format || '').trim().toLowerCase();
    if (fmt === 'spin' || fmt === 'spin_and_go') return 'Spin';
    if (fmt === 'sng' || fmt === 'sit_and_go' || fmt === 'sng_satellite') return 'Sit & Go';
    if (isSeatBasedTournament(preview)) {
        return /\bspin\b/i.test(String(preview.name || '')) ? 'Spin' : 'Sit & Go';
    }
    return 'Tournament';
}

export default function SharedTournamentLanding({ id, status, preview, renderedAt, shareParams }) {
    const target = clubArenaTournamentPath(id, shareParams);

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
    const seatBased = Boolean(found && isSeatBasedTournament(preview));
    const facts = found ? tournamentLandingFacts(preview, renderedAt) : [];
    const badge = formatBadgeLabel(found ? preview : null);
    const ctaLabel = open ? (seatBased ? 'Play Now' : 'Register') : 'Open Tournament';

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
                <div style={styles.eyebrowRow}>
                    <div style={styles.eyebrowGroup}>
                        <span style={styles.eyebrowDot} aria-hidden="true" />
                        <p style={styles.eyebrow}>Smarter.Poker | Club Arena</p>
                    </div>
                    <span style={styles.badge}>{badge}</span>
                </div>
                <h1 id="shared-tournament-title" style={styles.title}>
                    {found ? preview.name || 'Tournament' : 'Club Arena Tournament'}
                </h1>
                {found && (preview.club || gameLine(preview)) && (
                    <p style={styles.sub}>{[gameLine(preview), preview.club].filter(Boolean).join(' | ')}</p>
                )}
                <div style={styles.divider} aria-hidden="true" />
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
                    {ctaLabel}
                </a>
            </section>
        </main>
    );
}
