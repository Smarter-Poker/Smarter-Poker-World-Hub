/**
 * /g/[id] - a shared Club Arena table (live cash, Must-Move, or Heads-Up)
 * ═══════════════════════════════════════════════════════════════════════════
 * Server-rendered so iMessage, WhatsApp, Discord, Telegram and other apps draw
 * a rich preview card (table name, variant, stakes, buy-in range, seats and
 * club name) instead of the generic Poker Arena card.
 *
 * Preserves optional ?i=<CODE>, ?cluster=<UUID>, and ?invite=<TOKEN> into the
 * Club Arena target (/hub/club-arena/table/<id>?...).
 *
 * - Signed-in players are sent straight on via window.location.replace(target).
 * - Signed-out visitors see the table card with Create Account & Play (when an
 *   invite code is present) or Open Table, plus first-party invite attribution.
 * - Preview crawlers are never redirected and never receive attribution cookies.
 * - Private or non-public-club tables answer { found: false } identically to
 *   missing UUIDs; uninstalled/unavailable RPCs degrade cleanly to the plain card.
 */
import { useEffect } from 'react';
import Head from 'next/head';
import {
    CLUB_INVITE_COOKIE,
    CLUB_INVITE_TTL_MS,
    inviteCookieValue,
    isInviteFresh,
    isLinkPreviewBot,
    normalizeInviteCode,
    parseInviteCookieValue,
    readCookie,
    rememberInvite,
} from '../../src/lib/clubInvite';
import {
    buyInRangeWords,
    clubArenaTablePath,
    clubInviteSignupPath,
    gamePreviewText,
    gameVariantWords,
    hasSignedInSession,
    normalizeGameId,
    readSharedTable,
    sanitizeShareParams,
    seatsWords,
    stakesWords,
} from '../../src/lib/sharedGameLink';

const ORIGIN = 'https://smarter.poker';

export async function getServerSideProps({ params, query, req, res }) {
    const id = normalizeGameId(String(params?.id || ''));
    if (!id) return { notFound: true };

    const shareParams = sanitizeShareParams(query);
    const bot = isLinkPreviewBot(req?.headers?.['user-agent']);
    const canonicalInvite = normalizeInviteCode(shareParams.i);

    if (canonicalInvite && !bot) {
        const existing = parseInviteCookieValue(readCookie(req?.headers?.cookie, CLUB_INVITE_COOKIE));
        // First link wins: only write the cookie when there is no live one already.
        if (!isInviteFresh(existing)) {
            res.setHeader(
                'Set-Cookie',
                `${CLUB_INVITE_COOKIE}=${encodeURIComponent(inviteCookieValue(canonicalInvite, Date.now()))}; Max-Age=${Math.floor(
                    CLUB_INVITE_TTL_MS / 1000
                )}; Path=/; SameSite=Lax; Secure`
            );
        }
    }

    let shared = { status: 'unknown' };
    try {
        shared = await readSharedTable(id);
    } catch (err) {
        shared = { status: 'unknown' };
        console.warn('[shared-table] read failed:', err?.message || err);
    }

    // Never CDN-cache responses carrying an invite code so every fresh visitor
    // receives their own first-party attribution cookie.
    res.setHeader(
        'Cache-Control',
        shareParams.i ? 'private, no-store' : 'public, max-age=60, s-maxage=60'
    );

    return {
        props: {
            id,
            status: shared?.status || 'unknown',
            preview: shared?.status === 'found' ? shared.preview : null,
            shareParams,
        },
    };
}

export default function SharedTableLanding({ id, status, preview, shareParams }) {
    const target = clubArenaTablePath(id, shareParams);
    const inviteCode = shareParams?.i || null;

    useEffect(() => {
        if (inviteCode) rememberInvite(inviteCode);
        // Signed in: straight to the table. replace(): Back returns to
        // wherever the link was tapped.
        if (hasSignedInSession(window.localStorage)) window.location.replace(target);
    }, [inviteCode, target]);

    const pageUrl = `${ORIGIN}/g/${id}`;
    const found = status === 'found' && preview;
    const { headline, description } = found
        ? gamePreviewText(preview, 'table')
        : {
              headline: 'A Club Arena Table',
              description: 'Play Live Poker Tables In Private Clubs On Smarter.Poker.',
          };
    const ogImage = found
        ? `${ORIGIN}/api/og/club-game?kind=table&id=${encodeURIComponent(id)}`
        : `${ORIGIN}/api/og/club-game?kind=table`;

    const variant = found ? gameVariantWords(preview) : '';
    const stakes = found ? stakesWords(preview) : '';
    const buyIn = found ? buyInRangeWords(preview) : '';
    const seats = found ? seatsWords(preview) : '';
    const facts = found
        ? [
              variant ? ['Game', variant] : null,
              stakes ? ['Stakes', stakes] : null,
              buyIn ? ['Buy-In', buyIn] : null,
              seats ? ['Seats', seats] : null,
          ].filter(Boolean)
        : [];

    const signupHref = inviteCode ? clubInviteSignupPath(target, inviteCode) : null;

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
            <section style={styles.card} aria-labelledby="shared-table-title">
                <p style={styles.eyebrow}>Smarter.Poker | Club Arena</p>
                <h1 id="shared-table-title" style={styles.title}>
                    {found ? preview.name || 'Live Table' : 'Club Arena Table'}
                </h1>
                {found && (variant || preview.club) && (
                    <p style={styles.sub}>{[variant, preview.club].filter(Boolean).join(' | ')}</p>
                )}
                {found && facts.length > 0 ? (
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
                            ? 'This Table Is Private Or No Longer Active. Members Can Open It In Club Arena.'
                            : 'Open Club Arena To Join This Table.'}
                    </p>
                )}
                {signupHref ? (
                    <>
                        <a href={signupHref} style={styles.button}>
                            Create Account &amp; Play
                        </a>
                        <a href={target} style={styles.secondaryButton}>
                            Sign In To Open Table
                        </a>
                    </>
                ) : (
                    <a href={target} style={styles.button}>
                        Open Table
                    </a>
                )}
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
    secondaryButton: {
        display: 'block',
        textAlign: 'center',
        padding: '12px 16px',
        background: 'transparent',
        color: '#e7ebf2',
        border: '1px solid rgba(139,215,255,0.28)',
        fontWeight: 700,
        fontSize: 15,
        borderRadius: 10,
        textDecoration: 'none',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    small: { margin: 0, color: '#6b7380', fontSize: 12, textAlign: 'center' },
};
