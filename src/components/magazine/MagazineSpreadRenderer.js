import Link from 'next/link';
import { useState } from 'react';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_POSTAL_ADDRESS,
    MAGAZINE_SITE_URL,
    MAGAZINE_TAGLINE,
    MAGAZINE_TOC_GROUPS,
    MAGAZINE_TRIM,
    buildMagazineQrDataUri,
    formatChipsOnly,
    formatPeriodLabel,
    stripMagazineDashes,
} from '../../lib/magazine/magazineSchema.mjs';

export const FALLBACK_MAGAZINE_IMAGE = '/api/news/email-image?fallback=1&w=960&h=540';

export function handleMagazineImageError(e) {
    if (!e?.currentTarget) return;
    if (!e.currentTarget.dataset.fb) {
        e.currentTarget.dataset.fb = '1';
        e.currentTarget.src = FALLBACK_MAGAZINE_IMAGE;
    }
}

export function toInternalMagazineHref(rawUrl, fallback = '/hub/magazine') {
    const clean = String(rawUrl || '').trim();
    if (!clean) return fallback;
    if (clean.startsWith('/')) return clean;
    if (clean.startsWith(MAGAZINE_SITE_URL)) {
        const sliced = clean.slice(MAGAZINE_SITE_URL.length);
        return sliced.startsWith('/') ? sliced : `/${sliced}`;
    }
    return fallback;
}

export function formatReadableShortPath(rawUrl) {
    const clean = String(rawUrl || MAGAZINE_SITE_URL).trim();
    try {
        const parsed = clean.startsWith('http') ? new URL(clean) : new URL(clean, MAGAZINE_SITE_URL);
        const searchPart = parsed.search
            ? (() => {
                  const p = new URLSearchParams(parsed.search);
                  p.delete('utm_source');
                  p.delete('utm_medium');
                  p.delete('utm_campaign');
                  p.delete('utm_content');
                  const rest = p.toString();
                  return rest ? `?${rest}` : '';
              })()
            : '';
        const full = `smarter.poker${parsed.pathname === '/' ? '' : parsed.pathname}${searchPart}`;
        return full.length > 44 ? `${full.slice(0, 41)}...` : full;
    } catch {
        return 'smarter.poker/hub/magazine';
    }
}

function cleanText(val, fallback = '') {
    const out = stripMagazineDashes(val ?? '');
    return out || fallback;
}

function formatSafeChips(item) {
    if (typeof item === 'number') return formatChipsOnly(item);
    if (item && typeof item === 'object') {
        const rawNum =
            item.prizeChips ??
            item.prize_chips ??
            item.prize_pool ??
            item.prizePool ??
            item.chips ??
            item.guaranteed_prize ??
            item.amount;
        if (Number.isFinite(Number(rawNum)) && Number(rawNum) > 0) {
            return formatChipsOnly(Number(rawNum));
        }
        const rawLabel = String(item.prizeLabel || item.prize || item.value || '').replace(/\$/g, '').trim();
        if (rawLabel) {
            return /chips/i.test(rawLabel) ? stripMagazineDashes(rawLabel) : `${stripMagazineDashes(rawLabel)} Chips`;
        }
    }
    const parsed = Number(String(item || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? formatChipsOnly(parsed) : '0 Chips';
}

function getThemeTokens(mode) {
    const isPrint = mode === 'print';
    if (isPrint) {
        return {
            isPrint: true,
            sheetBg: '#ffffff',
            cardBg: '#f8fafc',
            subtleBg: '#f1f5f9',
            ink: '#05070a',
            inkSecondary: '#0f172a',
            inkMuted: '#334155',
            border: '#cbd5e1',
            borderStrong: '#0f172a',
            accent: '#05070a',
            accentTeal: '#0d9488',
            accentBlue: '#2563eb',
            badgeBg: '#05070a',
            badgeInk: '#ffffff',
        };
    }
    return {
        isPrint: false,
        sheetBg: '#0b1520',
        cardBg: '#05070a',
        subtleBg: '#102131',
        ink: '#ffffff',
        inkSecondary: '#e2e8f0',
        inkMuted: '#9fb3c8',
        border: '#1b2c3d',
        borderStrong: '#4fc1b3',
        accent: '#4fc1b3',
        accentTeal: '#4fc1b3',
        accentBlue: '#60a5fa',
        badgeBg: '#4fc1b3',
        badgeInk: '#05070a',
    };
}

function QrActionBadge({ page, theme, compact = false }) {
    const qrTarget = page?.qrUrl || page?.ctaUrl || `${MAGAZINE_SITE_URL}/hub/magazine`;
    const qrSrc = buildMagazineQrDataUri(qrTarget, compact ? 64 : 76);
    const shortPath = formatReadableShortPath(qrTarget);
    const href = toInternalMagazineHref(page?.ctaUrl || qrTarget, '/hub/magazine');
    const ctaText = cleanText(page?.ctaLabel, 'Open Interactive Feature');

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: compact ? '8px' : '10px',
                padding: compact ? '6px 8px' : '8px 10px',
                borderRadius: '8px',
                background: theme.isPrint ? '#f8fafc' : '#05070a',
                border: `1px solid ${theme.isPrint ? '#0f172a' : '#1b2c3d'}`,
            }}
        >
            <img
                src={qrSrc}
                alt="Scan Smarter.Poker Page QR Code"
                width={compact ? 52 : 62}
                height={compact ? 52 : 62}
                onError={handleMagazineImageError}
                style={{
                    width: compact ? '52px' : '62px',
                    height: compact ? '52px' : '62px',
                    borderRadius: '4px',
                    background: '#ffffff',
                    padding: '2px',
                    flexShrink: 0,
                }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
                <div
                    style={{
                        fontSize: '8.5px',
                        fontWeight: 800,
                        letterSpacing: '1.2px',
                        textTransform: 'uppercase',
                        color: theme.isPrint ? '#2563eb' : '#4fc1b3',
                        marginBottom: '2px',
                    }}
                >
                    Scan At The Table
                </div>
                {theme.isPrint ? (
                    <div
                        style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            color: theme.ink,
                            lineHeight: 1.25,
                            marginBottom: '2px',
                        }}
                    >
                        {ctaText}
                    </div>
                ) : (
                    <Link
                        href={href}
                        style={{
                            display: 'inline-block',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            color: '#60a5fa',
                            textDecoration: 'none',
                            lineHeight: 1.25,
                            marginBottom: '2px',
                        }}
                    >
                        {ctaText} &rarr;
                    </Link>
                )}
                <div
                    className="no-capitalize"
                    style={{
                        fontSize: '8.5px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        color: theme.inkMuted,
                        wordBreak: 'break-all',
                    }}
                >
                    {shortPath}
                </div>
            </div>
        </div>
    );
}

function SheetRunningChrome({ page, issueMeta, theme, children }) {
    const pageNum = Number(page?.pageNumber || 1);
    const isEven = pageNum % 2 === 0;
    const dept = cleanText(page?.department, MAGAZINE_MASTHEAD);
    const headerLabel = cleanText(page?.runningHeader, issueMeta?.periodLabel || MAGAZINE_MASTHEAD);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                padding: theme.isPrint ? '0.42in 0.46in 0.38in 0.46in' : '18px 20px 16px 20px',
                boxSizing: 'border-box',
                background: theme.sheetBg,
                color: theme.ink,
                justifyContent: 'space-between',
            }}
        >
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `2px solid ${theme.isPrint ? '#0f172a' : '#1b2c3d'}`,
                    paddingBottom: '6px',
                    marginBottom: '10px',
                    flexShrink: 0,
                }}
            >
                <span
                    style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '1.6px',
                        textTransform: 'uppercase',
                        color: theme.isPrint ? '#2563eb' : '#4fc1b3',
                    }}
                >
                    {isEven ? MAGAZINE_MASTHEAD : dept}
                </span>
                <span
                    style={{
                        fontSize: '8.5px',
                        fontWeight: 700,
                        letterSpacing: '1.2px',
                        textTransform: 'uppercase',
                        color: theme.inkMuted,
                    }}
                >
                    {isEven ? dept : headerLabel}
                </span>
            </header>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {children}
            </div>

            <footer
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: `1px solid ${theme.border}`,
                    paddingTop: '6px',
                    marginTop: '8px',
                    flexShrink: 0,
                    fontSize: '8.5px',
                    fontWeight: 700,
                    color: theme.inkMuted,
                }}
            >
                <span>
                    {isEven
                        ? `Page ${pageNum} \u2022 ${MAGAZINE_MASTHEAD}`
                        : `${issueMeta?.periodLabel || 'Monthly Edition'} \u2022 Vol. ${issueMeta?.volumeNumber || 1} No. ${issueMeta?.issueNumber || 1}`}
                </span>
                <span>
                    {isEven
                        ? `${issueMeta?.periodLabel || 'Monthly Edition'} \u2022 Smarter.Poker`
                        : `Page ${pageNum} \u2022 ${MAGAZINE_MASTHEAD}`}
                </span>
            </footer>
        </div>
    );
}

function FrontCoverLayout({ page, issueMeta, theme }) {
    const heroImg = (theme.isPrint ? page?.masterImageUrl : page?.imageUrl) || issueMeta?.coverImageUrl || FALLBACK_MAGAZINE_IMAGE;
    const rawLines = Array.isArray(page?.meta?.coverLines) && page.meta.coverLines.length > 0
        ? page.meta.coverLines
        : Array.isArray(issueMeta?.coverLines) && issueMeta.coverLines.length > 0
          ? issueMeta.coverLines
          : (page?.items || []).map((it) => it?.headline || it?.title).filter(Boolean);
    const callouts = (
        rawLines.length > 0
            ? rawLines
            : [
                  'Global Player Of The Year Top 25 Standings',
                  'NLH, ICM & PLO5 Solver Strategy Columns',
                  'Kings Club 25450 Monthly Champions Circle',
              ]
    )
        .slice(0, 3)
        .map((c) => cleanText(c));

    const vol = issueMeta?.volumeNumber || page?.meta?.volumeNumber || 1;
    const iss = issueMeta?.issueNumber || page?.meta?.issueNumber || 1;
    const periodLabel = issueMeta?.periodLabel || formatPeriodLabel(issueMeta?.issuePeriod);
    const coverHeadline = cleanText(page?.headline || issueMeta?.coverHeadline, 'Inside The Month In Poker');
    const coverSub = cleanText(
        page?.subheadline || issueMeta?.coverSubheadline,
        'Major Champions, GTO Solver Labs, POY Standings & Coast-To-Coast Live Series'
    );

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                background: '#05070a',
                color: '#ffffff',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
            }}
        >
            <img
                src={heroImg}
                alt={coverHeadline}
                onError={handleMagazineImageError}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.62,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                        'linear-gradient(180deg, rgba(5,7,10,0.92) 0%, rgba(5,7,10,0.28) 38%, rgba(5,7,10,0.72) 68%, rgba(5,7,10,0.97) 100%)',
                }}
            />

            <div style={{ position: 'relative', zIndex: 2, padding: theme.isPrint ? '0.38in 0.44in 0 0.44in' : '18px 20px 0 20px' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '1.8px',
                        textTransform: 'uppercase',
                        color: '#4fc1b3',
                        borderBottom: '2px solid #4fc1b3',
                        paddingBottom: '6px',
                        marginBottom: '8px',
                    }}
                >
                    <span>{`Volume ${vol} \u2022 Issue ${iss} \u2022 ${periodLabel}`}</span>
                    <span style={{ color: '#60a5fa' }}>Smarter.Poker Print &amp; Digital</span>
                </div>

                <div
                    style={{
                        fontSize: theme.isPrint ? '36px' : 'clamp(22px, 3.6vw, 34px)',
                        fontWeight: 900,
                        letterSpacing: '2.2px',
                        lineHeight: 0.98,
                        textTransform: 'uppercase',
                        color: '#ffffff',
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        textShadow: '0 4px 18px rgba(5,7,10,0.9)',
                    }}
                >
                    SMARTER.POKER
                </div>
                <div
                    style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        background: '#4fc1b3',
                        color: '#05070a',
                        padding: '2px 10px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 900,
                        letterSpacing: '3px',
                        textTransform: 'uppercase',
                    }}
                >
                    MAGAZINE
                </div>
            </div>

            <div
                style={{
                    position: 'relative',
                    zIndex: 2,
                    padding: theme.isPrint ? '0 0.44in' : '0 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '7px',
                    maxWidth: '72%',
                }}
            >
                {callouts.map((line, i) => (
                    <div
                        key={i}
                        style={{
                            borderLeft: `3px solid ${i === 0 ? '#4fc1b3' : '#60a5fa'}`,
                            paddingLeft: '8px',
                            background: 'rgba(5, 7, 10, 0.68)',
                            paddingTop: '4px',
                            paddingBottom: '4px',
                            paddingRight: '8px',
                            borderRadius: '0 6px 6px 0',
                        }}
                    >
                        <div
                            style={{
                                fontSize: '8px',
                                fontWeight: 800,
                                letterSpacing: '1.4px',
                                textTransform: 'uppercase',
                                color: i === 0 ? '#4fc1b3' : '#60a5fa',
                            }}
                        >
                            {i === 0 ? 'Inside This Issue' : i === 1 ? 'The Strategy Lab' : 'Club Arena Spotlight'}
                        </div>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>
                            {line}
                        </div>
                    </div>
                ))}
            </div>

            <div
                style={{
                    position: 'relative',
                    zIndex: 2,
                    padding: theme.isPrint ? '0 0.44in 0.38in 0.44in' : '0 20px 18px 20px',
                }}
            >
                <div
                    style={{
                        display: 'inline-block',
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '1.6px',
                        textTransform: 'uppercase',
                        color: '#05070a',
                        background: '#60a5fa',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        marginBottom: '6px',
                    }}
                >
                    Cover Story
                </div>
                <h2
                    style={{
                        margin: '0 0 6px 0',
                        fontSize: theme.isPrint ? '25px' : 'clamp(18px, 2.5vw, 24px)',
                        fontWeight: 900,
                        lineHeight: 1.12,
                        color: '#ffffff',
                        fontFamily: "Georgia, 'Times New Roman', serif",
                    }}
                >
                    {coverHeadline}
                </h2>
                <p
                    style={{
                        margin: '0 0 12px 0',
                        fontSize: '11px',
                        lineHeight: 1.4,
                        color: '#cbd5e1',
                    }}
                >
                    {coverSub}
                </p>

                <QrActionBadge
                    page={{
                        ...page,
                        ctaLabel: page?.ctaLabel || 'Read Digital Edition Online',
                        ctaUrl: page?.ctaUrl || `/hub/magazine/${issueMeta?.slug || 'latest'}`,
                        qrUrl: page?.qrUrl || `${MAGAZINE_SITE_URL}/hub/magazine/${issueMeta?.slug || 'latest'}`,
                    }}
                    theme={{ ...theme, isPrint: false }}
                    compact
                />
            </div>
        </div>
    );
}

function HousePromoLayout({ page, issueMeta, theme }) {
    const pillars =
        Array.isArray(page?.items) && page.items.length > 0
            ? page.items.slice(0, 4)
            : [
                  {
                      title: '25 Free Bonus Chips In Kings Club 25450',
                      summary: 'Jump Straight Into Nightly Tournaments And Ring Action Inside Club Arena.',
                  },
                  {
                      title: '30-Day Free VIP Membership',
                      summary: 'Unlock Pro Equity Calculators, ICM Simulators, And Unlimited GTO Hand Lab Access.',
                  },
                  {
                      title: '500 Free Smarter.Poker Diamonds',
                      summary: 'Compete In Daily Poker Trivia Challenges And Climb National Leaderboards.',
                  },
                  {
                      title: 'Coast-To-Coast Live Poker Near Me',
                      summary: 'Track Verified Cardrooms, Daily Structures, And Major Series Schedules.',
                  },
              ];

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: '#05070a',
                    color: '#ffffff',
                    borderRadius: '12px',
                    padding: '18px',
                    border: '2px solid #4fc1b3',
                }}
            >
                <div>
                    <div
                        style={{
                            display: 'inline-block',
                            background: '#4fc1b3',
                            color: '#05070a',
                            fontSize: '9px',
                            fontWeight: 900,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            marginBottom: '8px',
                        }}
                    >
                        Official Player Welcome Package &bull; Club ID 25450
                    </div>
                    <h2
                        style={{
                            margin: '0 0 6px 0',
                            fontSize: '21px',
                            fontWeight: 900,
                            lineHeight: 1.15,
                            color: '#ffffff',
                        }}
                    >
                        {cleanText(page?.headline, 'Train Smarter, Find Live Action & Play In Kings Club 25450')}
                    </h2>
                    <p style={{ margin: '0 0 12px 0', fontSize: '11px', lineHeight: 1.45, color: '#9fb3c8' }}>
                        {cleanText(
                            page?.subheadline,
                            'New Readers Claim 25 Free Chips, 30-Day Free VIP Access, And 500 Free Diamonds On Smarter.Poker.'
                        )}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {pillars.map((item, idx) => (
                            <div
                                key={idx}
                                style={{
                                    background: '#0b1520',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '8px',
                                    padding: '10px',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '10.5px',
                                        fontWeight: 800,
                                        color: idx % 2 === 0 ? '#4fc1b3' : '#60a5fa',
                                        marginBottom: '4px',
                                        lineHeight: 1.25,
                                    }}
                                >
                                    {cleanText(item?.title || item?.headline, 'Smarter.Poker Benefit')}
                                </div>
                                <div style={{ fontSize: '9.5px', color: '#cbd5e1', lineHeight: 1.38 }}>
                                    {cleanText(item?.summary || item?.description, '')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                    <QrActionBadge
                        page={{
                            ...page,
                            ctaLabel: page?.ctaLabel || 'Claim Free Kings Club 25450 Welcome Package',
                            ctaUrl: page?.ctaUrl || '/go/promo',
                            qrUrl: page?.qrUrl || `${MAGAZINE_SITE_URL}/go/promo`,
                        }}
                        theme={{ ...theme, isPrint: false }}
                    />
                </div>
            </div>
        </SheetRunningChrome>
    );
}

function EditorFirstHandLayout({ page, issueMeta, theme }) {
    const paragraphs =
        Array.isArray(page?.paragraphs) && page.paragraphs.length > 0
            ? page.paragraphs
            : [
                  issueMeta?.editorNote ||
                      'Welcome To This Month In Smarter.Poker Magazine, Built For Players Studying At Home And Grinding Live Cardrooms Coast To Coast.',
                  'Every Page Combines Verified Tournament Reporting, Kings Club 25450 Championship Standings, And Pure GTO Solver Breakdowns Ready To Scan Right At The Table.',
              ];
    const stats =
        Array.isArray(page?.stats) && page.stats.length > 0
            ? page.stats.slice(0, 6)
            : Array.isArray(issueMeta?.stats) && issueMeta.stats.length > 0
              ? issueMeta.stats.slice(0, 6)
              : [
                    { label: 'Magazine Pages', value: String(issueMeta?.pageCount || 44) },
                    { label: 'Pro Calculators', value: '42' },
                    { label: 'POY Contenders', value: 'Top 25' },
                    { label: 'Strategy Columns', value: '4 Labs' },
                    { label: 'Kings Club ID', value: '25450' },
                    { label: 'Poker IQ Spots', value: '4 Questions' },
                ];

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', justifyContent: 'space-between' }}>
                <div>
                    <div
                        style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            color: theme.accentTeal,
                            marginBottom: '3px',
                        }}
                    >
                        First Hand &bull; From The Editorial Desk
                    </div>
                    <h2
                        style={{
                            margin: '0 0 8px 0',
                            fontSize: '18px',
                            fontWeight: 900,
                            lineHeight: 1.18,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(page?.headline, 'The Modern Grinder Playbook: Live Felt Meets Solver Precision')}
                    </h2>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {paragraphs.slice(0, 4).map((para, idx) => (
                                <p
                                    key={idx}
                                    style={{
                                        margin: 0,
                                        fontSize: '9.8px',
                                        lineHeight: 1.46,
                                        color: theme.inkSecondary,
                                    }}
                                >
                                    {cleanText(para)}
                                </p>
                            ))}
                            {page?.byline && (
                                <div style={{ fontSize: '9px', fontWeight: 800, color: theme.accentBlue, marginTop: '2px' }}>
                                    {cleanText(page.byline)}
                                </div>
                            )}
                        </div>

                        <aside
                            style={{
                                background: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '8px',
                                padding: '9px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '5px',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '9px',
                                    fontWeight: 900,
                                    letterSpacing: '1.4px',
                                    textTransform: 'uppercase',
                                    color: theme.accentTeal,
                                    borderBottom: `1px solid ${theme.border}`,
                                    paddingBottom: '4px',
                                }}
                            >
                                Masthead
                            </div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: theme.ink }}>{MAGAZINE_MASTHEAD}</div>
                            <div style={{ fontSize: '8.5px', lineHeight: 1.35, color: theme.inkMuted }}>{MAGAZINE_TAGLINE}</div>
                            <div style={{ fontSize: '8.5px', lineHeight: 1.35, color: theme.inkSecondary }}>
                                <strong>Editorial Desk:</strong> Smarter.Poker Intelligence Team
                            </div>
                            <div style={{ fontSize: '8.5px', lineHeight: 1.35, color: theme.inkSecondary }}>
                                <strong>Strategy Lab:</strong> GTO Hand Lab &amp; ICM Engine
                            </div>
                            <div style={{ fontSize: '8px', lineHeight: 1.35, color: theme.inkMuted }}>{MAGAZINE_POSTAL_ADDRESS}</div>
                        </aside>
                    </div>
                </div>

                <div>
                    <div
                        style={{
                            fontSize: '9px',
                            fontWeight: 900,
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            color: theme.accentBlue,
                            marginBottom: '6px',
                        }}
                    >
                        Month By The Numbers
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        {stats.map((st, idx) => (
                            <div
                                key={idx}
                                style={{
                                    background: theme.cardBg,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: '6px',
                                    padding: '7px 8px',
                                }}
                            >
                                <div style={{ fontSize: '13px', fontWeight: 900, color: theme.accentTeal, lineHeight: 1.1 }}>
                                    {cleanText(String(st?.value ?? '').replace(/\$/g, ''), '100%')}
                                </div>
                                <div style={{ fontSize: '8.2px', fontWeight: 700, color: theme.inkMuted, marginTop: '2px' }}>
                                    {cleanText(st?.label, 'Monthly Metric')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </SheetRunningChrome>
    );
}

function TocSpreadLayout({ page, issueMeta, theme, onSelectPage }) {
    const isLeft = page?.kind === 'toc_left';
    const rawItems =
        Array.isArray(page?.items) && page.items.length > 0
            ? page.items
            : (issueMeta?.toc || []).filter((_, idx) => (isLeft ? idx % 2 === 0 : idx % 2 === 1));

    const grouped = MAGAZINE_TOC_GROUPS.map((grp) => ({
        ...grp,
        entries: rawItems.filter((it) => (it?.tocGroup || it?.group || 'departments') === grp.key),
    })).filter((g) => g.entries.length > 0);

    const displayGroups =
        grouped.length > 0
            ? grouped
            : [
                  {
                      key: 'all',
                      label: isLeft ? 'Features & Departments' : 'The Strategy Lab & Directories',
                      entries: rawItems,
                  },
              ];

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                <div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            borderBottom: `2px solid ${theme.accentTeal}`,
                            paddingBottom: '6px',
                            marginBottom: '10px',
                        }}
                    >
                        <h2
                            style={{
                                margin: 0,
                                fontSize: '19px',
                                fontWeight: 900,
                                fontFamily: "Georgia, 'Times New Roman', serif",
                                color: theme.ink,
                            }}
                        >
                            {cleanText(page?.headline, isLeft ? 'Contents: Features & Circuits' : 'Contents: Strategy & Directories')}
                        </h2>
                        <span style={{ fontSize: '9px', fontWeight: 800, color: theme.accentBlue, textTransform: 'uppercase' }}>
                            {issueMeta?.periodLabel || 'Monthly Issue'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {displayGroups.map((grp) => (
                            <div key={grp.key}>
                                <div
                                    style={{
                                        fontSize: '9px',
                                        fontWeight: 900,
                                        letterSpacing: '1.5px',
                                        textTransform: 'uppercase',
                                        color: theme.accentTeal,
                                        marginBottom: '5px',
                                    }}
                                >
                                    {grp.label}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {grp.entries.slice(0, 9).map((entry, idx) => {
                                        const targetPage = Number(entry?.pageNumber || entry?.page || idx + 1);
                                        const entryTitle = cleanText(entry?.headline || entry?.title, `Section ${targetPage}`);
                                        const entrySub = cleanText(entry?.subheadline || entry?.summary || entry?.department, '');
                                        const clickable = !theme.isPrint && typeof onSelectPage === 'function';

                                        if (clickable) {
                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => onSelectPage(targetPage)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'baseline',
                                                        justifyContent: 'space-between',
                                                        gap: '8px',
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        background: theme.cardBg,
                                                        border: `1px solid ${theme.border}`,
                                                        borderRadius: '6px',
                                                        padding: '5px 8px',
                                                        cursor: 'pointer',
                                                        color: theme.ink,
                                                    }}
                                                >
                                                    <span style={{ minWidth: 0, flex: 1 }}>
                                                        <strong style={{ fontSize: '10px', display: 'block', color: theme.ink }}>
                                                            {entryTitle}
                                                        </strong>
                                                        {entrySub && (
                                                            <span style={{ fontSize: '8.5px', color: theme.inkMuted, display: 'block' }}>
                                                                {entrySub}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: '11px',
                                                            fontWeight: 900,
                                                            color: theme.accentBlue,
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {`P. ${targetPage}`}
                                                    </span>
                                                </button>
                                            );
                                        }

                                        return (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'baseline',
                                                    justifyContent: 'space-between',
                                                    gap: '8px',
                                                    borderBottom: `1px dotted ${theme.border}`,
                                                    paddingBottom: '3px',
                                                }}
                                            >
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: theme.ink }}>{entryTitle}</div>
                                                    {entrySub && (
                                                        <div style={{ fontSize: '8.3px', color: theme.inkMuted }}>{entrySub}</div>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '10.5px', fontWeight: 900, color: theme.accentBlue, flexShrink: 0 }}>
                                                    {targetPage}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {!isLeft && <QrActionBadge page={page} theme={theme} compact />}
            </div>
        </SheetRunningChrome>
    );
}

function NewsRailLayout({ page, issueMeta, theme }) {
    const stories =
        Array.isArray(page?.items) && page.items.length > 0
            ? page.items.slice(0, 3)
            : [
                  {
                      headline: page?.headline || 'Major Live Circuit Guarantees Surge Across Championship Stops',
                      summary:
                          page?.subheadline ||
                          'Mid-Major And Championship Poker Stops Continue Posting Record Main Event Turnouts Across North America.',
                      sourceName: 'Smarter.Poker Wire',
                      imageUrl: page?.imageUrl || FALLBACK_MAGAZINE_IMAGE,
                  },
              ];

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', height: '100%', justifyContent: 'space-between' }}>
                <div>
                    <div
                        style={{
                            fontSize: '9px',
                            fontWeight: 900,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            color: theme.accentTeal,
                            marginBottom: '2px',
                        }}
                    >
                        The Monthly Wire &bull; Industry &amp; Tour Digest
                    </div>
                    <h2
                        style={{
                            margin: '0 0 8px 0',
                            fontSize: '17px',
                            fontWeight: 900,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(page?.headline, 'Around The Poker World')}
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {stories.map((st, idx) => {
                            const img =
                                (theme.isPrint ? st?.masterImageUrl || st?.vaultedMasterUrl : null) ||
                                st?.imageUrl ||
                                st?.vaultedImageUrl ||
                                st?.vaulted_image_url ||
                                page?.imageUrl ||
                                FALLBACK_MAGAZINE_IMAGE;
                            const outlet = cleanText(st?.sourceName || st?.source_name || st?.outlet, 'Smarter.Poker News');
                            return (
                                <article
                                    key={idx}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '112px 1fr',
                                        gap: '10px',
                                        background: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: '8px',
                                        padding: '8px',
                                        alignItems: 'start',
                                    }}
                                >
                                    <img
                                        src={img}
                                        alt={cleanText(st?.headline || st?.title, 'Poker News Story')}
                                        onError={handleMagazineImageError}
                                        style={{
                                            width: '112px',
                                            height: '76px',
                                            objectFit: 'cover',
                                            borderRadius: '6px',
                                            background: '#05070a',
                                        }}
                                    />
                                    <div style={{ minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontSize: '8px',
                                                fontWeight: 800,
                                                letterSpacing: '1.2px',
                                                textTransform: 'uppercase',
                                                color: theme.accentBlue,
                                                marginBottom: '2px',
                                            }}
                                        >
                                            {outlet}
                                        </div>
                                        <h3
                                            style={{
                                                margin: '0 0 4px 0',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                lineHeight: 1.25,
                                                color: theme.ink,
                                            }}
                                        >
                                            {cleanText(st?.headline || st?.title, 'Poker Headline')}
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '9.2px', lineHeight: 1.4, color: theme.inkSecondary }}>
                                            {cleanText(st?.summary || st?.excerpt || st?.body_text, '').slice(0, 220)}
                                        </p>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>

                <QrActionBadge page={page} theme={theme} compact />
            </div>
        </SheetRunningChrome>
    );
}

function CaptureTheMomentLayout({ page, issueMeta, theme }) {
    const isLeft = page?.kind === 'capture_the_moment_left';
    const heroImg = (theme.isPrint ? page?.masterImageUrl : page?.imageUrl) || FALLBACK_MAGAZINE_IMAGE;
    const insets = Array.isArray(page?.items) ? page.items.slice(0, 2) : [];

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                background: '#05070a',
                color: '#ffffff',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: theme.isPrint ? '0.4in 0.44in' : '18px 20px',
                boxSizing: 'border-box',
            }}
        >
            <img
                src={heroImg}
                alt={cleanText(page?.headline, 'Capture The Moment')}
                onError={handleMagazineImageError}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.72,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                        'linear-gradient(180deg, rgba(5,7,10,0.82) 0%, rgba(5,7,10,0.12) 45%, rgba(5,7,10,0.92) 100%)',
                }}
            />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                    style={{
                        background: '#4fc1b3',
                        color: '#05070a',
                        padding: '3px 9px',
                        borderRadius: '4px',
                        fontSize: '8.5px',
                        fontWeight: 900,
                        letterSpacing: '1.6px',
                        textTransform: 'uppercase',
                    }}
                >
                    {isLeft ? 'Capture The Moment \u2022 Part I' : 'Capture The Moment \u2022 Part II'}
                </span>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#cbd5e1' }}>
                    {`Page ${page?.pageNumber || 10} \u2022 ${MAGAZINE_MASTHEAD}`}
                </span>
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
                {insets.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                        {insets.map((ins, i) => (
                            <div
                                key={i}
                                style={{
                                    background: 'rgba(11, 21, 32, 0.88)',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '6px',
                                    padding: '6px',
                                }}
                            >
                                <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#4fc1b3' }}>
                                    {cleanText(ins?.headline || ins?.title, 'Championship Frame')}
                                </div>
                                <div style={{ fontSize: '8.5px', color: '#cbd5e1', lineHeight: 1.3 }}>
                                    {cleanText(ins?.summary || ins?.caption, '').slice(0, 110)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div
                    style={{
                        background: 'rgba(5, 7, 10, 0.86)',
                        borderLeft: '4px solid #4fc1b3',
                        borderRadius: '0 8px 8px 0',
                        padding: '10px 12px',
                    }}
                >
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: 900, color: '#ffffff' }}>
                        {cleanText(page?.headline, 'Under The Championship Lights')}
                    </h2>
                    <p style={{ margin: 0, fontSize: '10px', lineHeight: 1.42, color: '#cbd5e1' }}>
                        {cleanText(
                            page?.subheadline || page?.paragraphs?.[0],
                            'High-Stakes Tension, Trophy Ceremonies, And Deep-Run Drama Captured Across Major Live Stops.'
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}

function FeatureArticleLayout({ page, issueMeta, theme }) {
    const heroImg = (theme.isPrint ? page?.masterImageUrl : page?.imageUrl) || FALLBACK_MAGAZINE_IMAGE;
    const paragraphs =
        Array.isArray(page?.paragraphs) && page.paragraphs.length > 0
            ? page.paragraphs
            : [
                  page?.subheadline ||
                      'Deep-Stack Championship Poker Rewards Preparation, Disciplined Bankroll Structure, And Fearless Late-Stage Execution.',
                  'Across Major Live Tours And Smarter.Poker Training Labs, Top Performers Pair Relentless Hand Review With Real-Time ICM Awareness.',
                  'Every Decision Spot Highlighted In This Feature Connects Directly To Interactive Calculators And Solver Trees On Smarter.Poker.',
              ];
    const sideStats = Array.isArray(page?.stats) && page.stats.length > 0 ? page.stats.slice(0, 3) : [];
    const sideItems = Array.isArray(page?.items) && page.items.length > 0 ? page.items.slice(0, 2) : [];
    const leadPara = cleanText(paragraphs[0], '');
    const firstChar = leadPara.charAt(0) || 'S';
    const restLead = leadPara.slice(1);

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', justifyContent: 'space-between' }}>
                <div>
                    <div
                        style={{
                            position: 'relative',
                            height: '132px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            marginBottom: '8px',
                            border: `1px solid ${theme.border}`,
                        }}
                    >
                        <img
                            src={heroImg}
                            alt={cleanText(page?.headline, 'Magazine Feature')}
                            onError={handleMagazineImageError}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </div>

                    <div
                        style={{
                            fontSize: '8.5px',
                            fontWeight: 900,
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            color: theme.accentTeal,
                            marginBottom: '2px',
                        }}
                    >
                        {cleanText(page?.department, 'Feature Story')}
                    </div>
                    <h2
                        style={{
                            margin: '0 0 4px 0',
                            fontSize: '17px',
                            fontWeight: 900,
                            lineHeight: 1.15,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(page?.headline, 'Championship Feature')}
                    </h2>
                    {page?.subheadline && (
                        <div style={{ fontSize: '10px', color: theme.inkMuted, marginBottom: '6px', lineHeight: 1.3 }}>
                            {cleanText(page.subheadline)}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <p style={{ margin: 0, fontSize: '9.5px', lineHeight: 1.45, color: theme.inkSecondary }}>
                                <span
                                    style={{
                                        float: 'left',
                                        fontSize: '25px',
                                        fontWeight: 900,
                                        lineHeight: 0.88,
                                        paddingRight: '5px',
                                        paddingTop: '2px',
                                        color: theme.accentTeal,
                                        fontFamily: "Georgia, 'Times New Roman', serif",
                                    }}
                                >
                                    {firstChar}
                                </span>
                                {restLead}
                            </p>
                            {paragraphs.slice(1, 3).map((p, idx) => (
                                <p key={idx} style={{ margin: 0, fontSize: '9.4px', lineHeight: 1.44, color: theme.inkSecondary }}>
                                    {cleanText(p)}
                                </p>
                            ))}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {paragraphs.slice(3, 5).map((p, idx) => (
                                <p key={idx} style={{ margin: 0, fontSize: '9.4px', lineHeight: 1.44, color: theme.inkSecondary }}>
                                    {cleanText(p)}
                                </p>
                            ))}

                            {page?.pullQuote && (
                                <blockquote
                                    style={{
                                        margin: 0,
                                        padding: '7px 9px',
                                        borderLeft: `3px solid ${theme.accentBlue}`,
                                        background: theme.cardBg,
                                        borderRadius: '0 6px 6px 0',
                                        fontSize: '9.8px',
                                        fontWeight: 800,
                                        fontStyle: 'italic',
                                        lineHeight: 1.35,
                                        color: theme.ink,
                                    }}
                                >
                                    {`"${cleanText(page.pullQuote)}"`}
                                </blockquote>
                            )}

                            {sideStats.length > 0 && (
                                <div style={{ display: 'grid', gap: '4px' }}>
                                    {sideStats.map((st, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                background: theme.cardBg,
                                                border: `1px solid ${theme.border}`,
                                                borderRadius: '5px',
                                                padding: '4px 7px',
                                                fontSize: '8.8px',
                                            }}
                                        >
                                            <span style={{ color: theme.inkMuted, fontWeight: 700 }}>{cleanText(st?.label)}</span>
                                            <strong style={{ color: theme.accentTeal }}>
                                                {cleanText(String(st?.value ?? '').replace(/\$/g, ''))}
                                            </strong>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {sideItems.map((it, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        background: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: '6px',
                                        padding: '6px 8px',
                                    }}
                                >
                                    <div style={{ fontSize: '9.3px', fontWeight: 800, color: theme.accentBlue }}>
                                        {cleanText(it?.title || it?.headline)}
                                    </div>
                                    <div style={{ fontSize: '8.5px', color: theme.inkSecondary, lineHeight: 1.32 }}>
                                        {cleanText(it?.summary || it?.description, '').slice(0, 120)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <QrActionBadge page={page} theme={theme} compact />
            </div>
        </SheetRunningChrome>
    );
}

function StandingsTableLayout({ page, issueMeta, theme }) {
    const isKings = page?.kind === 'kings_club_champions';
    const isPoy = page?.kind === 'poy_standings';
    const rows =
        Array.isArray(page?.standings) && page.standings.length > 0
            ? page.standings
            : Array.isArray(page?.items) && page.items.length > 0
              ? page.items
              : [];

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                <div>
                    <div
                        style={{
                            fontSize: '8.5px',
                            fontWeight: 900,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            color: theme.accentTeal,
                            marginBottom: '2px',
                        }}
                    >
                        {isKings
                            ? 'Kings Club 25450 \u2022 Monthly Champions Circle'
                            : isPoy
                              ? 'Global Player Of The Year Standings'
                              : 'Final Table Live \u2022 Championship Results'}
                    </div>
                    <h2
                        style={{
                            margin: '0 0 4px 0',
                            fontSize: '17px',
                            fontWeight: 900,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(
                            page?.headline,
                            isKings ? 'Kings Club 25450 Champions' : isPoy ? 'POY Top 25 Leaderboard' : 'Major Circuit Results'
                        )}
                    </h2>
                    {page?.subheadline && (
                        <div style={{ fontSize: '9.5px', color: theme.inkMuted, marginBottom: '8px' }}>
                            {cleanText(page.subheadline)}
                        </div>
                    )}

                    <div
                        style={{
                            border: `1px solid ${theme.border}`,
                            borderRadius: '8px',
                            overflow: 'hidden',
                            background: theme.cardBg,
                        }}
                    >
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '38px 1.3fr 1.2fr 100px',
                                padding: '6px 8px',
                                background: theme.subtleBg,
                                borderBottom: `1px solid ${theme.border}`,
                                fontSize: '8.2px',
                                fontWeight: 900,
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                color: theme.accentBlue,
                            }}
                        >
                            <span>Rank</span>
                            <span>{isKings ? 'Champion' : 'Player'}</span>
                            <span>{isPoy ? 'Circuit / Cashes' : 'Event'}</span>
                            <span style={{ textAlign: 'right' }}>{isPoy ? 'POY Points' : 'Prize Pool'}</span>
                        </div>

                        {rows.length === 0 ? (
                            <div style={{ padding: '14px', fontSize: '9.5px', color: theme.inkMuted }}>
                                Verified Monthly Standings Sync Automatically With Official Leaderboard Snapshots.
                            </div>
                        ) : (
                            rows.slice(0, 12).map((row, idx) => {
                                const rank = Number(row?.rank || row?.place || idx + 1);
                                const player = cleanText(
                                    row?.playerName || row?.player_name || row?.username || row?.winner || row?.name,
                                    `Contender #${rank}`
                                );
                                const detail = cleanText(
                                    row?.eventName ||
                                        row?.tournamentName ||
                                        row?.tournament_name ||
                                        row?.tour ||
                                        row?.headline ||
                                        row?.summary,
                                    isKings ? 'Kings Club Major' : 'Championship Circuit'
                                );
                                const metric = isPoy
                                    ? `${Number(row?.points || row?.poy_points || row?.score || 0).toLocaleString('en-US')} Pts`
                                    : formatSafeChips(row);

                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '38px 1.3fr 1.2fr 100px',
                                            padding: '5px 8px',
                                            borderBottom: idx < rows.slice(0, 12).length - 1 ? `1px solid ${theme.border}` : 'none',
                                            fontSize: '9px',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <strong style={{ color: rank <= 3 ? theme.accentTeal : theme.inkMuted }}>{`#${rank}`}</strong>
                                        <strong
                                            style={{
                                                color: theme.ink,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                paddingRight: '6px',
                                            }}
                                        >
                                            {player}
                                        </strong>
                                        <span
                                            style={{
                                                color: theme.inkSecondary,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                paddingRight: '6px',
                                            }}
                                        >
                                            {detail}
                                        </span>
                                        <strong style={{ textAlign: 'right', color: theme.accentTeal }}>{metric}</strong>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <QrActionBadge
                    page={{
                        ...page,
                        ctaLabel:
                            page?.ctaLabel ||
                            (isKings ? 'Enter Kings Club 25450 In Club Arena' : 'View Full Live Standings On Smarter.Poker'),
                        ctaUrl: page?.ctaUrl || (isKings ? '/hub/club-arena/' : '/hub/leaderboards'),
                    }}
                    theme={theme}
                    compact
                />
            </div>
        </SheetRunningChrome>
    );
}

function StrategyColumnLayout({ page, issueMeta, theme }) {
    const spot = page?.spot || {};
    const cardImg =
        spot?.cardImageUrl ||
        spot?.imageUrl ||
        (theme.isPrint ? page?.masterImageUrl : page?.imageUrl) ||
        FALLBACK_MAGAZINE_IMAGE;
    const options = Array.isArray(spot?.options) ? spot.options : [];
    const correctKey = String(spot?.correctKey || 'A');
    const solverPct = Math.min(100, Math.max(0, Number(spot?.solverPct ?? spot?.solverFreqPct ?? 68) || 68));
    const communityPct = Math.min(100, Math.max(0, Number(spot?.communityPct ?? spot?.solverPickPct ?? 44) || 44));
    const spotSlug = String(spot?.slug || '');
    const handLabHref = spotSlug
        ? `/hub/training/hand-lab?spot=${encodeURIComponent(spotSlug)}`
        : toInternalMagazineHref(page?.ctaUrl, '/hub/training/hand-lab');

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: '8px' }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <span
                            style={{
                                fontSize: '8.5px',
                                fontWeight: 900,
                                letterSpacing: '1.5px',
                                textTransform: 'uppercase',
                                color: theme.accentTeal,
                            }}
                        >
                            {cleanText(page?.department, 'The Strategy Lab')}
                        </span>
                        {page?.byline && (
                            <span style={{ fontSize: '8.5px', fontWeight: 700, color: theme.accentBlue }}>
                                {cleanText(page.byline)}
                            </span>
                        )}
                    </div>

                    <h2
                        style={{
                            margin: '0 0 6px 0',
                            fontSize: '16.5px',
                            fontWeight: 900,
                            lineHeight: 1.16,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(page?.headline || spot?.title, 'GTO Solver Decision Breakdown')}
                    </h2>

                    <div
                        style={{
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: `1px solid ${theme.border}`,
                            marginBottom: '7px',
                            background: '#05070a',
                        }}
                    >
                        <img
                            src={cardImg}
                            alt={cleanText(spot?.title || page?.headline, 'Poker Strategy Felt Diagram')}
                            onError={handleMagazineImageError}
                            style={{ width: '100%', height: '112px', objectFit: 'cover', display: 'block' }}
                        />
                    </div>

                    {(spot?.situation || page?.subheadline) && (
                        <p style={{ margin: '0 0 7px 0', fontSize: '9.4px', lineHeight: 1.42, color: theme.inkSecondary }}>
                            {cleanText(spot?.situation || page?.subheadline)}
                        </p>
                    )}

                    {options.length > 0 && (
                        <div style={{ display: 'grid', gap: '4px', marginBottom: '7px' }}>
                            {options.slice(0, 4).map((opt, idx) => {
                                const isGto = String(opt?.key) === correctKey;
                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            background: isGto ? (theme.isPrint ? '#f1f5f9' : '#102131') : theme.cardBg,
                                            border: `1px solid ${isGto ? theme.accentTeal : theme.border}`,
                                            fontSize: '9px',
                                        }}
                                    >
                                        <span style={{ color: theme.ink, fontWeight: isGto ? 800 : 600 }}>
                                            {`${cleanText(opt?.key, 'A')}. ${cleanText(opt?.label)}`}
                                        </span>
                                        {isGto && (
                                            <span
                                                style={{
                                                    fontSize: '8px',
                                                    fontWeight: 900,
                                                    color: theme.accentTeal,
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                GTO Preferred
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div
                        style={{
                            background: theme.cardBg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '7px',
                            padding: '7px 9px',
                            marginBottom: '6px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '8.5px',
                                fontWeight: 800,
                                marginBottom: '4px',
                            }}
                        >
                            <span style={{ color: theme.accentTeal }}>{`GTO Solver Frequency: ${solverPct}%`}</span>
                            <span style={{ color: theme.accentBlue }}>{`Community Pick Rate: ${communityPct}%`}</span>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                height: '7px',
                                borderRadius: '999px',
                                overflow: 'hidden',
                                background: theme.subtleBg,
                            }}
                        >
                            <div style={{ width: `${solverPct}%`, background: '#4fc1b3' }} />
                            <div style={{ width: `${Math.max(0, 100 - solverPct)}%`, background: '#2563eb' }} />
                        </div>
                        {(spot?.evSummary || page?.paragraphs?.[0]) && (
                            <p style={{ margin: '5px 0 0 0', fontSize: '8.9px', lineHeight: 1.38, color: theme.inkSecondary }}>
                                {cleanText(spot?.evSummary || page?.paragraphs?.[0])}
                            </p>
                        )}
                    </div>
                </div>

                <QrActionBadge
                    page={{
                        ...page,
                        ctaLabel: page?.ctaLabel || 'Run Interactive Spot In GTO Hand Lab',
                        ctaUrl: handLabHref,
                        qrUrl: page?.qrUrl || `${MAGAZINE_SITE_URL}${handLabHref}`,
                    }}
                    theme={theme}
                    compact
                />
            </div>
        </SheetRunningChrome>
    );
}

function TheTestQuizLayout({ page, issueMeta, theme }) {
    const [selectedAnswers, setSelectedAnswers] = useState({});
    const questions =
        Array.isArray(page?.items) && page.items.length > 0
            ? page.items.slice(0, 4)
            : [
                  {
                      slug: 'pot-odds-turn',
                      question: 'Facing A Half-Pot River Bet, What Minimum Equity Is Required To Break Even On A Call?',
                      options: [
                          { key: 'A', label: '20% Equity' },
                          { key: 'B', label: '25% Equity' },
                          { key: 'C', label: '33% Equity' },
                          { key: 'D', label: '50% Equity' },
                      ],
                      answerKey: 'B',
                      explanation: 'Calling 0.5 Pot To Win 1.5 Total Pot Requires 0.5 / 2.0 = 25% Equity.',
                  },
              ];

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: '6px' }}>
                <div>
                    <div
                        style={{
                            fontSize: '8.5px',
                            fontWeight: 900,
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            color: theme.accentTeal,
                            marginBottom: '2px',
                        }}
                    >
                        The Smarter.Poker Test &bull; Monthly Poker IQ Challenge
                    </div>
                    <h2
                        style={{
                            margin: '0 0 6px 0',
                            fontSize: '16.5px',
                            fontWeight: 900,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(page?.headline, 'Test Your Table IQ: Four Real Decision Spots')}
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {questions.map((q, qIdx) => {
                            const qKey = String(q?.slug || q?.id || qIdx);
                            const picked = selectedAnswers[qKey] || '';
                            const correct = String(q?.answerKey || q?.correctKey || 'A');
                            const opts = Array.isArray(q?.options) ? q.options.slice(0, 4) : [];

                            return (
                                <div
                                    key={qKey}
                                    style={{
                                        background: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: '7px',
                                        padding: '6px 8px',
                                    }}
                                >
                                    <div style={{ fontSize: '9.4px', fontWeight: 800, color: theme.ink, marginBottom: '4px', lineHeight: 1.3 }}>
                                        {`${qIdx + 1}. ${cleanText(q?.question || q?.headline || q?.title)}`}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                        {opts.map((opt) => {
                                            const optKey = String(opt?.key || 'A');
                                            const isPicked = picked === optKey;
                                            const isRight = optKey === correct;
                                            if (theme.isPrint) {
                                                return (
                                                    <div
                                                        key={optKey}
                                                        style={{
                                                            fontSize: '8.5px',
                                                            color: theme.inkSecondary,
                                                            padding: '2px 4px',
                                                            border: `1px solid ${theme.border}`,
                                                            borderRadius: '4px',
                                                        }}
                                                    >
                                                        {`(${optKey}) ${cleanText(opt?.label)}`}
                                                    </div>
                                                );
                                            }
                                            return (
                                                <button
                                                    key={optKey}
                                                    type="button"
                                                    onClick={() => setSelectedAnswers((prev) => ({ ...prev, [qKey]: optKey }))}
                                                    style={{
                                                        textAlign: 'left',
                                                        fontSize: '8.5px',
                                                        fontWeight: 700,
                                                        padding: '4px 6px',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        background:
                                                            picked && isRight
                                                                ? '#102131'
                                                                : isPicked
                                                                  ? '#1b2c3d'
                                                                  : '#05070a',
                                                        color: picked && isRight ? '#4fc1b3' : '#ffffff',
                                                        border: `1px solid ${
                                                            picked && isRight
                                                                ? '#4fc1b3'
                                                                : isPicked
                                                                  ? '#60a5fa'
                                                                  : '#1b2c3d'
                                                        }`,
                                                    }}
                                                >
                                                    {`${optKey}. ${cleanText(opt?.label)}`}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {!theme.isPrint && picked && (
                                        <div style={{ marginTop: '4px', fontSize: '8.3px', color: '#4fc1b3', lineHeight: 1.3 }}>
                                            {`Correct Answer: ${correct}. ${cleanText(q?.explanation, '')}`}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {theme.isPrint ? (
                    <div
                        style={{
                            border: '1.5px solid #0f172a',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            background: '#f8fafc',
                        }}
                    >
                        <div
                            style={{
                                fontSize: '8px',
                                fontWeight: 900,
                                letterSpacing: '1.3px',
                                textTransform: 'uppercase',
                                color: '#2563eb',
                                marginBottom: '2px',
                            }}
                        >
                            Official Answer Key (Inverted For Table Play)
                        </div>
                        <div
                            style={{
                                fontSize: '8.2px',
                                color: '#0f172a',
                                transform: 'rotate(180deg)',
                                textAlign: 'right',
                            }}
                        >
                            {questions
                                .map((q, i) => `Q${i + 1}: ${cleanText(q?.answerKey || q?.correctKey, 'A')} (${cleanText(q?.explanation, '').slice(0, 55)})`)
                                .join(' \u2022 ')}
                        </div>
                    </div>
                ) : (
                    <QrActionBadge
                        page={{
                            ...page,
                            ctaLabel: page?.ctaLabel || 'Play Daily Poker Trivia For Free Diamonds',
                            ctaUrl: page?.ctaUrl || '/hub/trivia',
                            qrUrl: page?.qrUrl || `${MAGAZINE_SITE_URL}/hub/trivia`,
                        }}
                        theme={theme}
                        compact
                    />
                )}
            </div>
        </SheetRunningChrome>
    );
}

function DirectoryGridLayout({ page, issueMeta, theme }) {
    const kind = page?.kind || 'video_tool_spotlight';
    const items = Array.isArray(page?.items) ? page.items.slice(0, 6) : [];
    const eyebrow =
        kind === 'live_series_radar'
            ? '60-Day Coast-To-Coast Tournament Radar'
            : kind === 'poker_rooms_directory'
              ? 'Featured Cardrooms Across America'
              : 'Video Library & Pro Calculator Spotlight';

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: '8px' }}>
                <div>
                    <div
                        style={{
                            fontSize: '8.5px',
                            fontWeight: 900,
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            color: theme.accentTeal,
                            marginBottom: '2px',
                        }}
                    >
                        {eyebrow}
                    </div>
                    <h2
                        style={{
                            margin: '0 0 8px 0',
                            fontSize: '17px',
                            fontWeight: 900,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(page?.headline, eyebrow)}
                    </h2>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                        {items.map((item, idx) => {
                            const title = cleanText(item?.title || item?.headline || item?.name || item?.room_name, 'Featured Entry');
                            const sub = cleanText(
                                item?.location ||
                                    (item?.city && item?.state ? `${item.city}, ${item.state}` : '') ||
                                    item?.category ||
                                    item?.sourceName ||
                                    item?.dates,
                                'Smarter.Poker Verified'
                            );
                            const desc = cleanText(item?.summary || item?.tip || item?.description || item?.games, '').slice(0, 115);
                            const itemHref = toInternalMagazineHref(
                                item?.ctaUrl || item?.url || item?.watchPath,
                                kind === 'poker_rooms_directory'
                                    ? '/hub/poker-near-me'
                                    : kind === 'live_series_radar'
                                      ? '/hub/poker-series'
                                      : '/tools'
                            );

                            return (
                                <div
                                    key={idx}
                                    style={{
                                        background: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: '7px',
                                        padding: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '4px',
                                    }}
                                >
                                    <div>
                                        <div
                                            style={{
                                                fontSize: '8px',
                                                fontWeight: 800,
                                                textTransform: 'uppercase',
                                                color: theme.accentBlue,
                                                marginBottom: '2px',
                                            }}
                                        >
                                            {sub}
                                        </div>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: theme.ink, lineHeight: 1.25 }}>
                                            {title}
                                        </div>
                                        {desc && (
                                            <div style={{ fontSize: '8.5px', color: theme.inkSecondary, lineHeight: 1.34, marginTop: '3px' }}>
                                                {desc}
                                            </div>
                                        )}
                                    </div>
                                    {!theme.isPrint && (
                                        <Link
                                            href={itemHref}
                                            style={{
                                                fontSize: '8.5px',
                                                fontWeight: 800,
                                                color: '#4fc1b3',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            Open Details &rarr;
                                        </Link>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <QrActionBadge page={page} theme={theme} compact />
            </div>
        </SheetRunningChrome>
    );
}

function CardroomBundleCtaLayout({ page, issueMeta, theme }) {
    const benefits =
        Array.isArray(page?.items) && page.items.length > 0
            ? page.items.slice(0, 4)
            : [
                  {
                      title: '44-Page Monthly Print Bundles',
                      summary: 'Shipped Directly To Verified Poker Room Podiums, Waiting Lists, And Brush Desks.',
                  },
                  {
                      title: 'Complimentary Table-Tent QR Kit',
                      summary: 'Players Scan Between Hands To Study GTO Spots And View Your Live Tournament Clock.',
                  },
                  {
                      title: 'Featured Poker Near Me Placement',
                      summary: 'Partner Cardrooms Appear Inside Our Print Directory And Geo-Targeted Weekly Wire.',
                  },
                  {
                      title: 'Weekly Wire Digital Dispatch',
                      summary: 'Every Tuesday, Subscribers Receive Fresh Tour News And Solver Spots In Their Inbox.',
                  },
              ];

    return (
        <SheetRunningChrome page={page} issueMeta={issueMeta} theme={theme}>
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: theme.cardBg,
                    border: `2px solid ${theme.accentTeal}`,
                    borderRadius: '10px',
                    padding: '14px',
                }}
            >
                <div>
                    <div
                        style={{
                            fontSize: '8.5px',
                            fontWeight: 900,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            color: theme.accentTeal,
                            marginBottom: '4px',
                        }}
                    >
                        Cardroom Print Distribution &amp; Weekly Wire
                    </div>
                    <h2
                        style={{
                            margin: '0 0 6px 0',
                            fontSize: '18.5px',
                            fontWeight: 900,
                            lineHeight: 1.16,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            color: theme.ink,
                        }}
                    >
                        {cleanText(page?.headline, 'Stock Smarter.Poker Magazine Free In Your Poker Room')}
                    </h2>
                    <p style={{ margin: '0 0 10px 0', fontSize: '9.8px', lineHeight: 1.44, color: theme.inkSecondary }}>
                        {cleanText(
                            page?.subheadline,
                            'Poker Room Managers And Tournament Directors Can Request Monthly Commercial Print Bundles At Zero Cost.'
                        )}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {benefits.map((b, idx) => (
                            <div
                                key={idx}
                                style={{
                                    background: theme.subtleBg,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: '7px',
                                    padding: '8px',
                                }}
                            >
                                <div style={{ fontSize: '9.8px', fontWeight: 800, color: theme.ink, marginBottom: '3px' }}>
                                    {cleanText(b?.title || b?.headline)}
                                </div>
                                <div style={{ fontSize: '8.6px', color: theme.inkSecondary, lineHeight: 1.35 }}>
                                    {cleanText(b?.summary || b?.description)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <QrActionBadge
                    page={{
                        ...page,
                        ctaLabel: page?.ctaLabel || 'Request Poker Room Print Copies',
                        ctaUrl: '/hub/magazine/poker-rooms',
                        qrUrl: page?.qrUrl || `${MAGAZINE_SITE_URL}/hub/magazine/poker-rooms`,
                    }}
                    theme={theme}
                />
            </div>
        </SheetRunningChrome>
    );
}

function BackCoverLayout({ page, issueMeta, theme }) {
    const bgImg = (theme.isPrint ? page?.masterImageUrl : page?.imageUrl) || issueMeta?.coverImageUrl || FALLBACK_MAGAZINE_IMAGE;

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                background: '#05070a',
                color: '#ffffff',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: theme.isPrint ? '0.45in' : '22px',
                boxSizing: 'border-box',
            }}
        >
            <img
                src={bgImg}
                alt="Smarter.Poker Ecosystem Back Cover"
                onError={handleMagazineImageError}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.25,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(5,7,10,0.92) 0%, rgba(11,21,32,0.9) 55%, rgba(5,7,10,0.98) 100%)',
                }}
            />

            <div style={{ position: 'relative', zIndex: 2 }}>
                <div
                    style={{
                        fontSize: '9px',
                        fontWeight: 900,
                        letterSpacing: '2.2px',
                        textTransform: 'uppercase',
                        color: '#4fc1b3',
                        marginBottom: '6px',
                    }}
                >
                    The Complete Modern Poker Ecosystem
                </div>
                <h2
                    style={{
                        margin: '0 0 8px 0',
                        fontSize: '24px',
                        fontWeight: 900,
                        lineHeight: 1.12,
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        color: '#ffffff',
                    }}
                >
                    {cleanText(page?.headline, 'Every Tool, Live Room & Solver Tree In One Hub')}
                </h2>
                <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.48, color: '#9fb3c8' }}>
                    {cleanText(
                        page?.subheadline,
                        'Visit Smarter.Poker On Any Phone, Tablet, Or Desktop To Study GTO Spots, Find Live Games Near You, And Compete Free In Kings Club 25450.'
                    )}
                </p>
            </div>

            <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                    { badge: '42 Free Tools', title: 'Pro Equity, ICM & Push-Fold Calculators' },
                    { badge: 'Poker Near Me', title: 'Live Cardroom Games & 60-Day Series Radar' },
                    { badge: 'GTO Hand Lab', title: 'Interactive NLH, ICM & PLO5 Solver Trees' },
                    { badge: 'Club ID 25450', title: 'Nightly Kings Club Action & Leaderboards' },
                ].map((box, idx) => (
                    <div
                        key={idx}
                        style={{
                            background: 'rgba(16, 33, 49, 0.85)',
                            border: '1px solid #1b2c3d',
                            borderRadius: '8px',
                            padding: '10px',
                        }}
                    >
                        <div
                            style={{
                                fontSize: '8.5px',
                                fontWeight: 900,
                                letterSpacing: '1.3px',
                                textTransform: 'uppercase',
                                color: idx % 2 === 0 ? '#4fc1b3' : '#60a5fa',
                                marginBottom: '3px',
                            }}
                        >
                            {box.badge}
                        </div>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff', lineHeight: 1.28 }}>
                            {box.title}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
                <QrActionBadge
                    page={{
                        ...page,
                        ctaLabel: page?.ctaLabel || 'Explore Smarter.Poker World Hub',
                        ctaUrl: page?.ctaUrl || '/hub',
                        qrUrl: page?.qrUrl || `${MAGAZINE_SITE_URL}/hub`,
                    }}
                    theme={{ ...theme, isPrint: false }}
                />
            </div>
        </div>
    );
}

export function MagazinePageSheet({ page, issueMeta = {}, mode = 'screen', onSelectPage, style = {} }) {
    const theme = getThemeTokens(mode);
    const kind = String(page?.kind || 'news_rail');

    let inner = null;
    if (kind === 'front_cover') {
        inner = <FrontCoverLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'house_promo_spread') {
        inner = <HousePromoLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'editor_first_hand') {
        inner = <EditorFirstHandLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'toc_left' || kind === 'toc_right') {
        inner = <TocSpreadLayout page={page} issueMeta={issueMeta} theme={theme} onSelectPage={onSelectPage} />;
    } else if (kind === 'news_rail') {
        inner = <NewsRailLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'capture_the_moment_left' || kind === 'capture_the_moment_right') {
        inner = <CaptureTheMomentLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'cover_feature' || kind === 'secondary_feature' || kind === 'platform_feature') {
        inner = <FeatureArticleLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'poy_standings' || kind === 'final_table_live' || kind === 'kings_club_champions') {
        inner = <StandingsTableLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (
        kind === 'strategy_nlh' ||
        kind === 'strategy_icm' ||
        kind === 'strategy_plo' ||
        kind === 'strategy_ai_coach'
    ) {
        inner = <StrategyColumnLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'the_test_quiz') {
        inner = <TheTestQuizLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (
        kind === 'video_tool_spotlight' ||
        kind === 'live_series_radar' ||
        kind === 'poker_rooms_directory'
    ) {
        inner = <DirectoryGridLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'cardroom_bundle_cta') {
        inner = <CardroomBundleCtaLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else if (kind === 'back_cover') {
        inner = <BackCoverLayout page={page} issueMeta={issueMeta} theme={theme} />;
    } else {
        inner = <FeatureArticleLayout page={page} issueMeta={issueMeta} theme={theme} />;
    }

    return (
        <div
            data-magazine-page={page?.pageNumber || 1}
            data-magazine-kind={kind}
            style={{
                width: '100%',
                aspectRatio: MAGAZINE_TRIM.aspectRatio,
                background: theme.sheetBg,
                color: theme.ink,
                position: 'relative',
                overflow: 'hidden',
                boxSizing: 'border-box',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                ...style,
            }}
        >
            {inner}
        </div>
    );
}

export default MagazinePageSheet;
