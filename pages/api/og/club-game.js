/**
 * OG Club Arena Table & Lightning Card
 * GET /api/og/club-game?kind=table|lightning&id=<uuid>
 *
 * The 1200x630 preview image a messaging app shows for smarter.poker/g/<id>
 * and smarter.poker/l/<id>: game name, club, variant, stakes, buy-in range
 * and seats/fast-fold format framed inside the 3D forged-chrome Smarter.Poker
 * Club Arena chassis. Reads fn_ca_table_share_preview or
 * fn_ca_lightning_share_preview by id only, so nobody can inject arbitrary
 * text into a smarter.poker image. Private, missing, or unavailable RPC IDs
 * render the clean generic Poker Arena card. Amounts are chips/diamonds,
 * never a currency sign. Every JSX element MUST have display:'flex' for
 * Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import {
    buyInRangeWords,
    gameVariantWords,
    normalizeGameId,
    readSharedLightning,
    readSharedTable,
    seatsWords,
    stakesWords,
} from '../../../src/lib/sharedGameLink';

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

function cardText(value, fallback = '') {
    const cleaned = String(value || '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[^\u0020-\u007E\u00A0-\u017F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
}

function Fact({ label, value }) {
    const valStr = cardText(value);
    const valueSize = valStr.length > 20 ? 22 : valStr.length > 15 ? 26 : 34;
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flex: 1,
                padding: '18px 22px',
                borderRadius: 16,
                background: 'linear-gradient(180deg, rgba(16, 30, 48, 0.92) 0%, rgba(5, 11, 20, 0.96) 100%)',
                borderTop: '2px solid rgba(196, 236, 255, 0.68)',
                borderLeft: '2px solid rgba(90, 196, 255, 0.36)',
                borderRight: '2px solid rgba(90, 196, 255, 0.36)',
                borderBottom: '2px solid rgba(12, 26, 44, 0.96)',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 184, 255, 0.16)',
            }}
        >
            <div style={{ display: 'flex', fontSize: 17, fontWeight: 800, letterSpacing: 2.2, color: '#7ce4ff' }}>
                {label}
            </div>
            <div
                style={{
                    display: 'flex',
                    fontSize: valueSize,
                    fontWeight: 900,
                    color: '#ffffff',
                    marginTop: 8,
                    lineHeight: 1.1,
                }}
            >
                {valStr}
            </div>
        </div>
    );
}

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') === 'lightning' ? 'lightning' : 'table';
    const id = normalizeGameId(searchParams.get('id') || '');

    const [bgDataUrl, preview] = await Promise.all([
        loadMetallicBackdrop(req.url),
        (async () => {
            if (!id) return null;
            try {
                const shared = kind === 'lightning' ? await readSharedLightning(id) : await readSharedTable(id);
                return shared.status === 'found' ? shared.preview : null;
            } catch {
                return null;
            }
        })(),
    ]);

    const isLightning = kind === 'lightning';
    const eyebrow = isLightning ? 'SMARTER.POKER  |  LIGHTNING POKER' : 'SMARTER.POKER  |  CLUB ARENA';
    const badge = isLightning ? 'LIGHTNING' : 'CASH TABLE';
    const rawTitle = preview
        ? cardText(preview.name, isLightning ? 'Lightning Game' : 'Live Table')
        : isLightning
          ? 'Club Arena Lightning Poker'
          : 'Club Arena Cash Tables';
    const title = rawTitle.length > 42 ? `${rawTitle.slice(0, 41)}...` : rawTitle;
    const titleSize = title.length > 32 ? 42 : title.length > 24 ? 48 : 54;
    const variant = preview ? gameVariantWords({ ...preview, kind }) : '';
    const sub = preview
        ? cardText([variant, preview.club].filter(Boolean).join('  |  '), 'Private Poker Clubs On Smarter.Poker')
        : isLightning
          ? 'Fast-Fold Poker On Smarter.Poker'
          : 'Private Poker Clubs On Smarter.Poker';

    const stakes = preview ? stakesWords(preview) : '';
    const buyIn = preview ? buyInRangeWords(preview) : '';
    const seats = preview ? seatsWords({ ...preview, kind }) : '';
    const facts = preview
        ? [
              stakes ? { label: 'STAKES', value: stakes } : null,
              buyIn ? { label: 'BUY-IN', value: buyIn } : null,
              seats ? { label: isLightning ? 'FORMAT' : 'SEATS', value: seats } : null,
          ].filter(Boolean)
        : [];

    const fallbackBody = isLightning
        ? 'Instant New Hand On Every Fold'
        : "Live Hold'em, PLO And Mixed Tables";
    const cta = preview
        ? isLightning
            ? 'Tap To Play Lightning'
            : 'Tap To Join Table'
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
                                    {eyebrow}
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
                                lineHeight: 1.04,
                                color: '#ffffff',
                                textShadow: '0 4px 14px rgba(0, 0, 0, 0.95)',
                            }}
                        >
                            {title}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 24,
                                fontWeight: 700,
                                color: '#bcd6ec',
                                marginTop: 6,
                                textShadow: '0 2px 8px rgba(0, 0, 0, 0.95)',
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
                                    {fallbackBody}
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
