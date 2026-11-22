/**
 * OG Club Arena Tournament Card
 * GET /api/og/club-tournament?id=<tournament uuid>
 *
 * The 1200x630 preview image a messaging app shows for smarter.poker/t/<id>:
 * the event's name, its club, the game, buy-in, guarantee/stack and start rule
 * framed inside the 3D forged-chrome Smarter.Poker Club Arena chassis.
 *
 * Spins and Sit & Go's start when full (never on a scheduled clock time), so
 * they render "When Full (N Players)" instead of a clock timestamp.
 *
 * Reads fn_ca_tournament_share_preview by id, so the card shows only what the
 * lobby shows and nobody can put their own words on a smarter.poker image.
 * A private, VIP-only or non-public-club event draws the plain card, exactly
 * like a missing one. Amounts are chips, with no currency sign (Club Arena
 * rule). Every element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import { fitOgFactValue, fitOgSubtitle, fitOgTitle } from '../../../src/lib/sharedOgTypography';
import {
    gameLine,
    isOpenForEntry,
    isSeatBasedTournament,
    normalizeTournamentId,
    readSharedTournament,
    tournamentOgFacts,
} from '../../../src/lib/sharedTournamentLink';

export const config = { runtime: 'edge' };

let cachedBgPromise = null;

function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

async function loadMetallicBackdrop(reqUrl) {
    if (!cachedBgPromise) {
        cachedBgPromise = (async () => {
            try {
                const res = await fetch(new URL('../../../public/images/og/club-arena-invite-bg.jpg', import.meta.url));
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    if (buf.byteLength > 0) {
                        return `data:image/jpeg;base64,${arrayBufferToBase64(buf)}`;
                    }
                }
            } catch {
                // Fall through to origin fetch below.
            }
            if (reqUrl) {
                try {
                    const origin = new URL(reqUrl).origin;
                    const res = await fetch(`${origin}/images/og/club-arena-invite-bg.jpg`, {
                        signal: AbortSignal.timeout(2500),
                    });
                    if (res.ok) {
                        const buf = await res.arrayBuffer();
                        if (buf.byteLength > 0) {
                            return `data:image/jpeg;base64,${arrayBufferToBase64(buf)}`;
                        }
                    }
                } catch {
                    // Graceful CSS fallback renders if asset fetch is unavailable.
                }
            }
            return null;
        })();
    }
    const bg = await cachedBgPromise;
    if (!bg) cachedBgPromise = null;
    return bg;
}

function formatBadgeText(preview) {
    if (!preview) return 'TOURNAMENT';
    const fmt = String(preview.format || '').trim().toLowerCase();
    if (fmt === 'spin' || fmt === 'spin_and_go') return 'SPIN';
    if (fmt === 'sng' || fmt === 'sit_and_go' || fmt === 'sng_satellite') return 'SIT & GO';
    if (isSeatBasedTournament(preview)) {
        return /\bspin\b/i.test(String(preview.name || '')) ? 'SPIN' : 'SIT & GO';
    }
    return 'TOURNAMENT';
}

function Fact({ label, value }) {
    const { text: valStr, fontSize: valueSize, singleLine } = fitOgFactValue(value);
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flex: 1,
                minWidth: 0,
                padding: '16px 18px',
                borderRadius: 16,
                background: 'linear-gradient(180deg, rgba(16, 30, 48, 0.92) 0%, rgba(5, 11, 20, 0.96) 100%)',
                borderTop: '2px solid rgba(196, 236, 255, 0.68)',
                borderLeft: '2px solid rgba(90, 196, 255, 0.36)',
                borderRight: '2px solid rgba(90, 196, 255, 0.36)',
                borderBottom: '2px solid rgba(12, 26, 44, 0.96)',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 184, 255, 0.16)',
                overflow: 'hidden',
            }}
        >
            <div style={{ display: 'flex', fontSize: 16, fontWeight: 800, letterSpacing: 2.2, color: '#7ce4ff' }}>
                {label}
            </div>
            <div
                style={{
                    display: 'flex',
                    fontSize: valueSize,
                    fontWeight: 900,
                    color: '#ffffff',
                    marginTop: 8,
                    lineHeight: singleLine ? 1.1 : 1.15,
                    whiteSpace: singleLine ? 'nowrap' : 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                }}
            >
                {valStr}
            </div>
        </div>
    );
}

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const id = normalizeTournamentId(searchParams.get('id') || '');
    const [bgDataUrl, preview] = await Promise.all([
        loadMetallicBackdrop(req.url),
        (async () => {
            if (!id) return null;
            try {
                const shared = await readSharedTournament(id);
                return shared.status === 'found' ? shared.preview : null;
            } catch {
                return null;
            }
        })(),
    ]);

    const now = Date.now();
    const { text: title, fontSize: titleSize } = fitOgTitle(
        preview ? preview.name : 'Club Arena Tournaments',
        'Tournament'
    );
    const { text: sub, fontSize: subSize } = fitOgSubtitle(
        preview
            ? [gameLine(preview), preview.club].filter(Boolean).join('  |  ')
            : 'Private Poker Clubs On Smarter.Poker',
        'Private Poker Clubs On Smarter.Poker'
    );
    const badge = formatBadgeText(preview);
    const facts = preview ? tournamentOgFacts(preview, now) : [];
    const open = Boolean(preview && isOpenForEntry(preview, now));
    const cta = open
        ? isSeatBasedTournament(preview)
            ? 'Tap To Play'
            : 'Tap To Register'
        : 'Tap To Open Club Arena';

    return new ImageResponse(
        (
            <div
                style={{
                    display: 'flex',
                    position: 'relative',
                    width: 1200,
                    height: 630,
                    background: 'linear-gradient(155deg, #263541 0%, #0d151e 26%, #04080d 70%, #101c28 100%)',
                    color: '#f2f7ff',
                    fontFamily: 'sans-serif',
                    overflow: 'hidden',
                }}
            >
                {bgDataUrl ? (
                    <img
                        src={bgDataUrl}
                        width={1200}
                        height={630}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: 1200,
                            height: 630,
                            objectFit: 'cover',
                        }}
                    />
                ) : null}
                <div
                    style={{
                        display: 'flex',
                        position: 'relative',
                        flexDirection: 'column',
                        width: 1200,
                        height: 630,
                        paddingTop: 90,
                        paddingBottom: 96,
                        paddingLeft: 146,
                        paddingRight: 146,
                    }}
                >
                    {/* Upper diamond-quilted header bay (y: 90..226) */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            height: 136,
                            width: '100%',
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        width: 10,
                                        height: 10,
                                        borderRadius: 5,
                                        background: '#48e0ff',
                                        boxShadow: '0 0 12px #48e0ff',
                                        marginRight: 12,
                                    }}
                                />
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 20,
                                        letterSpacing: 3.5,
                                        color: '#7ce4ff',
                                        fontWeight: 800,
                                    }}
                                >
                                    SMARTER.POKER  |  CLUB ARENA
                                </div>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    padding: '6px 18px',
                                    borderRadius: 999,
                                    background: 'linear-gradient(180deg, rgba(44, 72, 102, 0.94) 0%, rgba(12, 24, 40, 0.98) 100%)',
                                    borderTop: '2px solid rgba(214, 244, 255, 0.8)',
                                    borderLeft: '2px solid rgba(114, 218, 255, 0.42)',
                                    borderRight: '2px solid rgba(114, 218, 255, 0.42)',
                                    borderBottom: '2px solid rgba(10, 22, 38, 0.95)',
                                    color: '#e8f7ff',
                                    fontSize: 16,
                                    fontWeight: 900,
                                    letterSpacing: 2.2,
                                }}
                            >
                                {badge}
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                fontSize: titleSize,
                                fontWeight: 900,
                                marginTop: 8,
                                lineHeight: 1.08,
                                color: '#ffffff',
                                textShadow: '0 4px 14px rgba(0, 0, 0, 0.95)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%',
                            }}
                        >
                            {title}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                fontSize: subSize,
                                fontWeight: 700,
                                color: '#bcd6ec',
                                marginTop: 6,
                                lineHeight: 1.12,
                                textShadow: '0 2px 8px rgba(0, 0, 0, 0.95)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%',
                            }}
                        >
                            {sub}
                        </div>
                    </div>

                    {/* Lower smoked-glass arena bay (y: 266..534) */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            flex: 1,
                            width: '100%',
                            marginTop: 40,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'stretch',
                                gap: 18,
                                width: '100%',
                            }}
                        >
                            {facts.length ? (
                                facts.map(f => <Fact key={f.label} label={f.label} value={f.value} />)
                            ) : (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flex: 1,
                                        padding: '22px 28px',
                                        borderRadius: 16,
                                        background: 'linear-gradient(180deg, rgba(16, 30, 48, 0.9) 0%, rgba(5, 11, 20, 0.96) 100%)',
                                        borderTop: '2px solid rgba(196, 236, 255, 0.62)',
                                        borderLeft: '2px solid rgba(90, 196, 255, 0.34)',
                                        borderRight: '2px solid rgba(90, 196, 255, 0.34)',
                                        borderBottom: '2px solid rgba(12, 26, 44, 0.96)',
                                        fontSize: 32,
                                        fontWeight: 800,
                                        color: '#dcebf8',
                                    }}
                                >
                                    MTTs, Spins And Sit &amp; Gos
                                </div>
                            )}
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                marginTop: 18,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        width: 6,
                                        height: 32,
                                        borderRadius: 3,
                                        background: 'linear-gradient(180deg, #6ce6ff 0%, #1577f2 100%)',
                                        boxShadow: '0 0 14px rgba(56, 217, 255, 0.75)',
                                        marginRight: 14,
                                    }}
                                />
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 20,
                                        fontWeight: 800,
                                        letterSpacing: 2.2,
                                        color: '#a3c6df',
                                    }}
                                >
                                    SMARTER.POKER ARENA
                                </div>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '14px 34px',
                                    borderRadius: 14,
                                    background: 'linear-gradient(180deg, #4cc4ff 0%, #1a7bf4 48%, #0c47a6 100%)',
                                    borderTop: '2px solid rgba(226, 248, 255, 0.95)',
                                    borderLeft: '2px solid rgba(128, 220, 255, 0.72)',
                                    borderRight: '2px solid rgba(128, 220, 255, 0.72)',
                                    borderBottom: '3px solid #06255c',
                                    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.78), 0 0 24px rgba(42, 164, 255, 0.52)',
                                    color: '#ffffff',
                                    fontSize: 23,
                                    fontWeight: 900,
                                    letterSpacing: 2,
                                    textTransform: 'uppercase',
                                }}
                            >
                                {cta}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
            headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
        }
    );
}
