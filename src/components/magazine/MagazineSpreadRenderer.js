/**
 * Smarter.Poker Magazine page renderer.
 *
 * Every page renders as a true 8.375in x 10.875in magazine sheet styled by
 * magazine-print.css (container query units, so a page scales like paper on a
 * phone, in the desktop flipbook and in the print proof).
 *
 * Art direction comes from finalizeMagazineIssueManifest:
 *   - page.imageRole: 'photo' | 'art' | 'spot' | 'video' | 'none'. A page with
 *     'none' prints no picture at all, so no placeholder plate ever shows.
 *   - page.showQr / page.qrLabel: a QR code prints only where the plan put one.
 *   - page.runIndex / page.runLength: opener versus continuation pages.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_POSTAL_ADDRESS,
    MAGAZINE_SITE_URL,
    MAGAZINE_TAGLINE,
    MAGAZINE_TOC_GROUPS,
    buildMagazineQrDataUri,
    formatChipsOnly,
    formatPeriodLabel,
    isMagazineFallbackImageUrl,
    magazineContinuedLabel,
    stripMagazineDashes,
} from '../../lib/magazine/magazineSchema.mjs';

export const FALLBACK_MAGAZINE_IMAGE = '/api/news/email-image?fallback=1&w=960&h=540';

// The Smarter.Poker wordmark (silver "Smarter." and blue "Poker"), cut with a
// transparent background from the approved global header artwork the live site uses.
// The brain icon is not part of the Smarter.Poker logo and never appears in the magazine.
const WORDMARK = '/images/magazine/smarter-poker-wordmark.webp';
const LOGO_LIGHT = WORDMARK;

/**
 * Shared image error handler. A picture inside a figure is removed from the
 * layout (the page never shows a broken frame or a stand-in plate); any other
 * image swaps once to the neutral fallback. dataset.fb stops retry loops.
 */
export function handleMagazineImageError(e) {
    const el = e?.currentTarget;
    if (!el || el.dataset.fb) return;
    el.dataset.fb = '1';
    const figure = typeof el.closest === 'function' ? el.closest('[data-spm-figure]') : null;
    if (figure) {
        figure.style.display = 'none';
        return;
    }
    el.src = FALLBACK_MAGAZINE_IMAGE;
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
                  p.delete('redirect');
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
            item.prizePoolChips ??
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
        const rawLabel = String(item.prizePoolLabel || item.prizeLabel || item.prize || item.value || '')
            .replace(/\$/g, '')
            .trim();
        if (rawLabel) {
            return /chips/i.test(rawLabel) ? stripMagazineDashes(rawLabel) : `${stripMagazineDashes(rawLabel)} Chips`;
        }
        return '0 Chips';
    }
    const parsed = Number(String(item || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? formatChipsOnly(parsed) : '0 Chips';
}

function normKey(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** A deck that only repeats the opening paragraph is dropped (it would print twice). */
export function deckEchoesCopy(deck, paragraphs = []) {
    const d = normKey(deck);
    if (!d) return true;
    const first = normKey(paragraphs[0]);
    if (!first) return false;
    return first.startsWith(d.slice(0, Math.min(d.length, 80))) || d.startsWith(first.slice(0, 80));
}

function firstSentence(text, max = 170) {
    const clean = cleanText(text);
    if (clean.length <= max) return clean;
    const cut = clean.split(/(?<=[.!?])\s+/)[0] || clean;
    return cut.length <= max ? cut : `${cut.slice(0, max - 3).replace(/\s+\S*$/, '')}...`;
}

function stripContinued(headline) {
    return cleanText(headline).replace(/\s*\(continued\)\s*$/i, '');
}

function isPrint(mode) {
    return mode === 'print';
}

function pagePicture(page, mode) {
    if (!page || page.imageRole === 'none') return '';
    const url = isPrint(mode) ? page.masterImageUrl || page.imageUrl : page.imageUrl;
    if (!url || isMagazineFallbackImageUrl(url)) return '';
    return url;
}

function itemPicture(item, mode) {
    const url = isPrint(mode) ? item?.masterImageUrl || item?.imageUrl : item?.imageUrl;
    if (!url || isMagazineFallbackImageUrl(url)) return '';
    return url;
}

function isRedCard(card) {
    return /[♥♦]|[hd]$/i.test(String(card || ''));
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function MagImg({ src, alt = '', className, mode, style }) {
    return (
        <img
            src={src}
            alt={alt}
            className={className}
            style={style}
            onError={handleMagazineImageError}
            loading={isPrint(mode) ? 'eager' : 'lazy'}
            decoding="async"
        />
    );
}

/** Internal links stay in the app; external sources open in a new tab; print renders plain text. */
function MagLink({ href, mode, className, children }) {
    const raw = String(href || '').trim();
    if (!raw || isPrint(mode)) return <span className={className}>{children}</span>;
    const internal = toInternalMagazineHref(raw, '');
    if (internal) {
        return (
            <Link href={internal} className={className}>
                {children}
            </Link>
        );
    }
    if (/^https:\/\//i.test(raw)) {
        return (
            <a href={raw} className={className} target="_blank" rel="noopener noreferrer">
                {children}
            </a>
        );
    }
    return <span className={className}>{children}</span>;
}

function Figure({ src, alt, caption, credit, mode, ratio = '3 / 2', contain = false, flex, fill = false, play = false, href }) {
    if (!src) return null;
    // fill: the figure takes whatever height the page has left and, through a
    // container query in magazine-print.css, drops out entirely when that space
    // is too shallow to show the art, so a crowded page never prints a sliver.
    const frame = (
        <div
            className={`spm-figure__frame${contain ? ' spm-figure__frame--contain' : ''}`}
            style={flex ? { flex: '1 1 auto', minHeight: 0 } : fill ? undefined : { aspectRatio: ratio }}
        >
            <MagImg src={src} alt={alt || caption || ''} mode={mode} />
            {play ? <span className="spm-play" aria-hidden="true" /> : null}
        </div>
    );
    return (
        <figure
            className={`spm-figure${fill ? ' spm-figure--fill' : ''}`}
            data-spm-figure="1"
            style={flex ? { flex, minHeight: '18cqw', display: 'flex', flexDirection: 'column' } : undefined}
        >
            {href && !isPrint(mode) ? (
                <MagLink href={href} mode={mode} className="spm-figure__link">
                    {frame}
                </MagLink>
            ) : (
                frame
            )}
            {caption || credit ? (
                <figcaption className="spm-caption">
                    {credit ? <b>{credit}</b> : null}
                    {caption}
                </figcaption>
            ) : null}
        </figure>
    );
}

function QrBlock({ page, mode }) {
    if (!page?.showQr) return null;
    const target = page.qrUrl || page.ctaUrl;
    if (!target) return null;
    const label = cleanText(page.qrLabel, 'Scan To Open On Smarter.Poker');
    const path = formatReadableShortPath(target);
    return (
        <div className="spm-qr">
            <MagImg src={buildMagazineQrDataUri(target, 240)} alt={label} mode={mode} />
            <div>
                <div className="spm-qr__label">{label}</div>
                <MagLink href={page.ctaUrl || target} mode={mode} className="spm-qr__path">
                    {path}
                </MagLink>
            </div>
        </div>
    );
}

function Stats({ stats, cols = 3 }) {
    const list = (Array.isArray(stats) ? stats : []).filter((s) => s && (s.value || s.label));
    if (!list.length) return null;
    return (
        <div className="spm-stats" style={{ gridTemplateColumns: `repeat(${Math.min(cols, list.length)}, 1fr)` }}>
            {list.map((s, i) => (
                <div key={`${s.label}-${i}`}>
                    <div className="spm-stat__value">{cleanText(s.value)}</div>
                    <div className="spm-stat__label">{cleanText(s.label)}</div>
                    {s.detail ? <div className="spm-stat__detail">{cleanText(s.detail)}</div> : null}
                </div>
            ))}
        </div>
    );
}

function Copy({ paragraphs, dropcap = false, cols = false, endmark = false, style }) {
    const list = (Array.isArray(paragraphs) ? paragraphs : []).map((p) => cleanText(p)).filter(Boolean);
    if (!list.length) return null;
    return (
        <div className={`spm-copy${cols ? ' spm-copy--cols' : ''}${dropcap ? ' spm-copy--dropcap' : ''}`} style={style}>
            {list.map((p, i) => (
                <p key={i}>
                    {p}
                    {endmark && i === list.length - 1 ? (
                        <span className="spm-endmark" aria-hidden="true">
                            {'■'}
                        </span>
                    ) : null}
                </p>
            ))}
        </div>
    );
}

function PullQuote({ text }) {
    const clean = cleanText(text);
    if (!clean) return null;
    return <blockquote className="spm-pullquote">{clean}</blockquote>;
}

function Byline({ byline, label = 'By' }) {
    const clean = cleanText(byline);
    if (!clean) return null;
    return (
        <div className="spm-byline">
            {label ? `${label} ` : ''}
            <span>{clean}</span>
        </div>
    );
}

function Folio({ page, issueMeta }) {
    const num = Number(page?.pageNumber || 1);
    const period = issueMeta?.periodLabel || formatPeriodLabel(issueMeta?.issuePeriod);
    const brand = `${MAGAZINE_MASTHEAD} • ${period}`;
    const even = num % 2 === 0;
    return (
        <footer className="spm-folio">
            {even ? <span className="spm-folio__num">{num}</span> : <span className="spm-folio__brand">{brand}</span>}
            {even ? <span className="spm-folio__brand">{brand}</span> : <span className="spm-folio__num">{num}</span>}
        </footer>
    );
}

/** Standard interior page: navy running head with the logo, editorial body, folio. */
function Frame({ page, issueMeta, mode, section, children }) {
    const label = cleanText(section || page?.department, MAGAZINE_MASTHEAD);
    return (
        <div className="spm-frame">
            <header className="spm-runhead">
                <MagImg src={LOGO_LIGHT} alt={MAGAZINE_MASTHEAD} className="spm-runhead__logo" mode={mode} />
                <span className="spm-runhead__section">{label}</span>
            </header>
            <div className="spm-body">{children}</div>
            <Folio page={page} issueMeta={issueMeta} />
        </div>
    );
}

function SectionHead({ kicker, headline, deck, size = '', byline, bylineLabel }) {
    return (
        <div className="spm-head">
            {kicker ? <div className="spm-kicker">{cleanText(kicker)}</div> : null}
            {headline ? <h2 className={`spm-headline${size ? ` spm-headline--${size}` : ''}`}>{cleanText(headline)}</h2> : null}
            {deck ? <p className="spm-deck">{cleanText(deck)}</p> : null}
            {byline ? <Byline byline={byline} label={bylineLabel} /> : null}
        </div>
    );
}

function Briefs({ items, mode, grid = false }) {
    if (!items.length) return null;
    return (
        <div className={grid ? 'spm-grid-2' : undefined}>
            {items.map((it, i) => {
                const thumb = itemPicture(it, mode);
                const meta = [it.duration, it.category, it.sourceName || it.byline].filter(Boolean).map((v) => cleanText(v));
                return (
                    <article key={i} className={`spm-brief${thumb ? '' : ' spm-brief--noimg'}`}>
                        {thumb ? (
                            <div className="spm-brief__thumb" data-spm-figure="1">
                                <MagImg src={thumb} alt={cleanText(it.headline || it.title)} mode={mode} />
                            </div>
                        ) : null}
                        <div>
                            {it.badge ? <div className="spm-kicker spm-kicker--sm">{cleanText(it.badge)}</div> : null}
                            <h4 className="spm-brief__title">
                                <MagLink href={it.url} mode={mode}>
                                    {cleanText(it.headline || it.title)}
                                </MagLink>
                            </h4>
                            {it.summary ? <p className="spm-brief__text">{cleanText(it.summary)}</p> : null}
                            {meta.length ? <div className="spm-brief__source">{meta.join(' • ')}</div> : null}
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page layouts                                                        */
/* ------------------------------------------------------------------ */

const COVER_LINE_LABELS = [
    [/\b(poy|player of the year)\b/i, 'Player Of The Year'],
    [/\bkings club\b/i, 'Kings Club'],
    [/\bstrategy\b|\bsolver\b|\bgto\b/i, 'The Strategy Lab'],
    [/\bseries\b|\btour\b|\bradar\b/i, 'Live Series'],
    [/\bquiz\b|\btest\b/i, 'The Test'],
];

export function parseCoverLine(raw) {
    const text = cleanText(raw);
    const pageMatch = /\(p\.?\s*(\d+)\)\s*$/i.exec(text);
    const body = text.replace(/\s*\(p\.?\s*\d+\)\s*$/i, '');
    const label = (COVER_LINE_LABELS.find(([re]) => re.test(body)) || [null, 'Inside This Issue'])[1];
    const colon = body.indexOf(':');
    const line = colon > 0 && colon < 48 ? body.slice(colon + 1).trim() : body;
    return { label, line: line || body, pageNumber: pageMatch ? Number(pageMatch[1]) : null };
}

function FrontCoverLayout({ page, issueMeta, mode, onSelectPage }) {
    const fromIssue = issueMeta?.coverImageUrl && !isMagazineFallbackImageUrl(issueMeta.coverImageUrl) ? issueMeta.coverImageUrl : '';
    const hero = pagePicture(page, mode) || fromIssue;
    const rawLines =
        Array.isArray(page?.meta?.coverLines) && page.meta.coverLines.length
            ? page.meta.coverLines
            : Array.isArray(issueMeta?.coverLines)
              ? issueMeta.coverLines
              : [];
    const lines = rawLines.slice(0, 3).map(parseCoverLine);
    const vol = issueMeta?.volumeNumber || page?.meta?.volumeNumber || 1;
    const iss = issueMeta?.issueNumber || page?.meta?.issueNumber || 1;
    const period = issueMeta?.periodLabel || formatPeriodLabel(issueMeta?.issuePeriod);
    const headline = cleanText(page?.headline || issueMeta?.coverHeadline, 'Inside The Month In Poker');
    const deck = firstSentence(issueMeta?.coverSubheadline || page?.subheadline || page?.paragraphs?.[0] || '', 150);
    const canJump = !isPrint(mode) && typeof onSelectPage === 'function';

    return (
        <>
            {hero ? (
                <div className="spm-bleed" data-spm-figure="1">
                    <MagImg src={hero} alt={headline} mode={mode} />
                </div>
            ) : null}
            <div className="spm-shade-top" />
            <div className="spm-shade-bottom" />
            <div className="spm-masthead">
                <div className="spm-masthead__mark">
                    <MagImg src={WORDMARK} alt={MAGAZINE_MASTHEAD} className="spm-masthead__wordmark" mode={mode} />
                </div>
                <div className="spm-masthead__strip">
                    <b>Magazine</b>
                    <span>{`Vol. ${vol} • No. ${iss}`}</span>
                    <span>{period}</span>
                </div>
            </div>
            {lines.length ? (
                <div className="spm-coverlines">
                    {lines.map((l, i) => {
                        const content = (
                            <>
                                <span className="spm-coverline__label">{l.label}</span>
                                <span className="spm-coverline__text">
                                    {l.line}
                                    {l.pageNumber ? <span className="spm-coverline__page">{` p. ${l.pageNumber}`}</span> : null}
                                </span>
                            </>
                        );
                        return canJump && l.pageNumber ? (
                            <button type="button" key={i} className="spm-coverline spm-coverline--button" onClick={() => onSelectPage(l.pageNumber)}>
                                {content}
                            </button>
                        ) : (
                            <div key={i} className="spm-coverline">
                                {content}
                            </div>
                        );
                    })}
                </div>
            ) : null}
            <div className="spm-cover-story">
                <div className="spm-kicker">Cover Story</div>
                <h1 className="spm-headline spm-headline--xl">{headline}</h1>
                {deck ? <p className="spm-deck">{deck}</p> : null}
            </div>
            <div className="spm-cover-foot">
                <span>Smarter.Poker</span>
                <span>{MAGAZINE_TAGLINE.split(',')[0]}</span>
            </div>
        </>
    );
}

/** House ads: Kings Club offer (p2), Weekly Wire and cardroom bundles (pp42 to 43). */
function AdLayout({ page, mode }) {
    const art = pagePicture(page, mode);
    const isBundle = page?.kind === 'cardroom_bundle_cta';
    const href = isBundle ? page?.ctaUrl || '/hub/magazine/poker-rooms' : page?.ctaUrl || '/auth/signup';
    const items = (Array.isArray(page?.items) ? page.items : []).filter((it) => it && (it.title || it.headline));
    const badge = isBundle ? (/wire/i.test(href) ? 'Free Every Tuesday' : 'Cardroom Program') : 'Members Offer';

    return (
        <div className="spm-ad">
            {art ? (
                <div className="spm-ad__art" data-spm-figure="1">
                    <MagImg src={art} alt={cleanText(page?.headline)} mode={mode} />
                    <div className="spm-ad__fade" />
                </div>
            ) : null}
            <div className={`spm-ad__body${art ? '' : ' spm-ad__body--noart'}`}>
                <div className="spm-ad__top">
                    <MagImg src={LOGO_LIGHT} alt={MAGAZINE_MASTHEAD} className="spm-ad__logo" mode={mode} />
                    <span className="spm-ad__badge">{badge}</span>
                </div>
                <h2 className="spm-headline spm-headline--md">{cleanText(page?.headline)}</h2>
                {page?.subheadline ? <p className="spm-deck">{cleanText(page.subheadline)}</p> : null}
                {items.length ? (
                    <ul className="spm-ad__list">
                        {items.slice(0, 4).map((it, i) => (
                            <li key={i}>
                                <div>
                                    <b>{cleanText(it.title || it.headline)}</b>
                                    {cleanText(it.summary)}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : null}
                <Stats stats={page?.stats} cols={3} />
                {!items.length ? <Copy paragraphs={page?.paragraphs} /> : null}
                <div className="spm-ad__action">
                    {page?.ctaLabel ? (
                        <MagLink href={href} mode={mode} className="spm-cta">
                            {cleanText(page.ctaLabel)}
                        </MagLink>
                    ) : null}
                    <QrBlock page={page} mode={mode} />
                </div>
            </div>
        </div>
    );
}

function EditorFirstHandLayout({ page, issueMeta, mode }) {
    const art = pagePicture(page, mode);
    const masthead = (Array.isArray(page?.items) ? page.items : []).filter((it) => it?.name);
    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section="First Hand">
            <Figure src={art} mode={mode} ratio="16 / 5" alt="" />
            <SectionHead kicker="From The Editor" headline={page?.headline} size="md" />
            <div className="spm-split">
                <div className="spm-stack">
                    <Copy paragraphs={page?.paragraphs} dropcap />
                    <PullQuote text={page?.pullQuote} />
                    <Byline byline={page?.byline || 'The Smarter.Poker Editorial Desk'} label="" />
                </div>
                <div className="spm-stack">
                    {masthead.length ? (
                        <div className="spm-box">
                            <div className="spm-box__title">Masthead</div>
                            {masthead.map((m, i) => (
                                <div key={i} className="spm-masthead-row">
                                    <div className="spm-brief__title">{cleanText(m.name)}</div>
                                    <div className="spm-brief__source">{cleanText(m.role)}</div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {Array.isArray(page?.stats) && page.stats.length ? (
                        <div className="spm-box">
                            <div className="spm-box__title">This Issue By The Numbers</div>
                            <Stats stats={page.stats} cols={2} />
                        </div>
                    ) : null}
                    <div className="spm-caption">{`${MAGAZINE_MASTHEAD}, ${MAGAZINE_POSTAL_ADDRESS}`}</div>
                </div>
            </div>
        </Frame>
    );
}

function TocSpreadLayout({ page, issueMeta, mode, onSelectPage }) {
    const isLeft = page?.kind === 'toc_left';
    const rawItems =
        Array.isArray(page?.items) && page.items.length
            ? page.items
            : (issueMeta?.toc || []).filter((_, idx) => (isLeft ? idx % 2 === 0 : idx % 2 === 1));
    const grouped = MAGAZINE_TOC_GROUPS.map((grp) => ({
        ...grp,
        entries: rawItems.filter((it) => (it?.tocGroup || it?.group || 'departments') === grp.key),
    })).filter((g) => g.entries.length);
    const groups = grouped.length ? grouped : [{ key: 'all', label: 'In This Issue', entries: rawItems }];
    const art = pagePicture(page, mode);
    const canJump = !isPrint(mode) && typeof onSelectPage === 'function';
    const period = issueMeta?.periodLabel || formatPeriodLabel(issueMeta?.issuePeriod);

    const entry = (it, i) => {
        const num = Number(it?.pageNumber) || null;
        const inner = (
            <>
                <span className="spm-toc-entry__num">{num || ''}</span>
                <span>
                    <span className="spm-toc-entry__title">{cleanText(it?.title || it?.headline)}</span>
                    {it?.subtitle || it?.subheadline ? (
                        <span className="spm-toc-entry__sub">{cleanText(it.subtitle || it.subheadline)}</span>
                    ) : null}
                </span>
            </>
        );
        return canJump && num ? (
            <button type="button" key={i} className="spm-toc-entry" onClick={() => onSelectPage(num)}>
                {inner}
            </button>
        ) : (
            <div key={i} className="spm-toc-entry spm-toc-entry--static">
                {inner}
            </div>
        );
    };

    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section="Contents">
            {isLeft ? (
                <div className="spm-toc-title">
                    <h2 className="spm-headline spm-headline--xl">Contents</h2>
                    <span className="spm-kicker">{period}</span>
                </div>
            ) : null}
            {isLeft ? <Figure src={art} caption={page?.imageCaption} mode={mode} ratio="16 / 8" /> : null}
            <div className="spm-stack">
                {groups.map((g) => (
                    <section key={g.key} className="spm-toc-group">
                        <div className="spm-toc-group__title">{g.label}</div>
                        {g.entries.map(entry)}
                    </section>
                ))}
            </div>
            {!isLeft ? <Figure src={art} caption={page?.imageCaption} mode={mode} flex="1 1 auto" /> : null}
        </Frame>
    );
}

function NewsRailLayout({ page, issueMeta, mode }) {
    const items = (Array.isArray(page?.items) ? page.items : []).filter((it) => it && (it.headline || it.title));
    const art = pagePicture(page, mode);
    const leadIdx =
        Number.isInteger(page?.leadItemIndex) && page.leadItemIndex >= 0 && page.leadItemIndex < items.length
            ? page.leadItemIndex
            : 0;
    const lead = items[leadIdx];
    const rest = items.filter((_, i) => i !== leadIdx);
    const isOpener = !page?.runIndex;
    const isFinalTable = page?.kind === 'final_table_live';
    const section = isFinalTable ? 'Final Table' : 'The Rail';
    const leadHeadline = cleanText(lead?.headline || lead?.title);
    const leadSource = cleanText(lead?.sourceName || lead?.byline);
    // The caption names the picture; when the picture belongs to the lead story the headline already does.
    const caption = normKey(page?.imageCaption) === normKey(leadHeadline) ? '' : cleanText(page?.imageCaption);

    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section={section}>
            {isOpener ? (
                <SectionHead kicker={section} headline={page?.headline} size="md" deck={page?.subheadline} />
            ) : (
                <div className="spm-continued">{magazineContinuedLabel(section, cleanText(page?.headline))}</div>
            )}
            {lead ? (
                <article className="spm-stack spm-stack--tight">
                    <Figure
                        src={art}
                        mode={mode}
                        ratio={isOpener ? '16 / 8' : '16 / 9'}
                        caption={caption}
                        credit={leadSource && !caption ? `Photo: ${leadSource}` : caption ? 'Photo' : ''}
                        href={lead.url}
                    />
                    <h3 className="spm-headline spm-headline--md">
                        <MagLink href={lead.url} mode={mode}>
                            {leadHeadline}
                        </MagLink>
                    </h3>
                    <Copy paragraphs={[lead.summary]} />
                    {leadSource ? <div className="spm-brief__source">{`Source: ${leadSource}`}</div> : null}
                </article>
            ) : null}
            <Briefs items={rest} mode={mode} />
        </Frame>
    );
}

function CaptureTheMomentLayout({ page, mode }) {
    const photo = pagePicture(page, mode);
    const isLeft = page?.kind === 'capture_the_moment_left';
    const num = Number(page?.pageNumber || 0);
    const caption = cleanText(page?.imageCaption);
    return (
        <>
            {photo ? (
                <div className="spm-bleed" data-spm-figure="1">
                    <MagImg src={photo} alt={caption || cleanText(page?.headline)} mode={mode} />
                </div>
            ) : null}
            <div className="spm-shade-top" style={{ height: '22%' }} />
            <div className="spm-shade-bottom" style={{ height: '66%' }} />
            <div className="spm-overlay-head">
                <MagImg src={LOGO_LIGHT} alt={MAGAZINE_MASTHEAD} className="spm-runhead__logo" mode={mode} />
                <span className="spm-kicker">Capture The Moment</span>
            </div>
            <div className="spm-overlay-story">
                {isLeft ? <PullQuote text={page?.pullQuote} /> : null}
                <h2 className="spm-headline spm-headline--md">{cleanText(page?.headline)}</h2>
                <Copy paragraphs={page?.paragraphs} />
                {caption && normKey(caption) !== normKey(page?.headline) ? (
                    <div className="spm-caption">
                        <b>Photo</b>
                        {caption}
                    </div>
                ) : null}
            </div>
            <div className="spm-cover-foot">
                <span>{num % 2 === 0 ? num : MAGAZINE_MASTHEAD}</span>
                <span>{num % 2 === 0 ? MAGAZINE_MASTHEAD : num}</span>
            </div>
        </>
    );
}

const FEATURE_KICKERS = {
    cover_feature: 'Cover Story',
    secondary_feature: 'Feature',
    platform_feature: 'Inside Smarter.Poker',
    strategy_ai_coach: 'Coaching Desk',
};

function parseNumberedPoint(text) {
    const m = /^(\d+)[.)]\s*([^:]{4,90}):\s*([\s\S]+)$/.exec(cleanText(text));
    return m ? { n: m[1], title: m[2], body: m[3] } : null;
}

/** Cover story, secondary feature, platform feature and AI coach pages. */
function FeatureArticleLayout({ page, issueMeta, mode }) {
    const kind = page?.kind;
    const runIndex = Number(page?.runIndex || 0);
    const runLength = Number(page?.runLength || 1);
    const isOpener = runIndex === 0;
    const isLast = runIndex === runLength - 1;
    const pic = pagePicture(page, mode);
    const paragraphs = Array.isArray(page?.paragraphs) ? page.paragraphs : [];
    const kicker = FEATURE_KICKERS[kind] || cleanText(page?.department, 'Feature');
    const deck = page?.subheadline && !deckEchoesCopy(page.subheadline, paragraphs) ? page.subheadline : '';
    const numbered = kind === 'strategy_ai_coach' ? paragraphs.map(parseNumberedPoint) : [];
    const allNumbered = numbered.length > 0 && numbered.every(Boolean);
    const cards = kind === 'platform_feature' ? (page?.items || []).filter((it) => it && (it.title || it.headline)) : [];
    const isStory = kind === 'cover_feature' || kind === 'secondary_feature';
    const headline = stripContinued(page?.headline);

    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section={kicker}>
            {isOpener ? (
                <SectionHead kicker={kicker} headline={headline} size={headline.length > 64 ? 'md' : ''} deck={deck} byline={page?.byline} />
            ) : (
                <div className="spm-head">
                    <div className="spm-continued">{isStory ? `${kicker} • Continued` : kicker}</div>
                    <h3 className={`spm-headline${isStory ? ' spm-headline--sm' : ' spm-headline--md'}`}>{headline}</h3>
                    {deck ? <p className="spm-deck">{cleanText(deck)}</p> : null}
                </div>
            )}
            <Figure src={pic} mode={mode} ratio={isOpener ? '3 / 2' : '16 / 9'} caption={cleanText(page?.imageCaption)} />
            {allNumbered ? (
                <div className="spm-stack">
                    {numbered.map((pt) => (
                        <div key={pt.n} className="spm-point">
                            <span className="spm-point__num">{pt.n}</span>
                            <div>
                                <div className="spm-point__title">{pt.title}</div>
                                <p className="spm-point__text">{pt.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <Copy
                    paragraphs={paragraphs}
                    dropcap={isOpener && kind !== 'platform_feature'}
                    cols={!pic && isStory}
                    endmark={isLast && isStory}
                    style={!pic && isStory ? { fontSize: '2.5cqw' } : undefined}
                />
            )}
            <PullQuote text={page?.pullQuote} />
            <Briefs items={cards} mode={mode} />
            {Array.isArray(page?.stats) && page.stats.length ? (
                <div className="spm-box">
                    <div className="spm-box__title">By The Numbers</div>
                    <Stats stats={page.stats} cols={3} />
                </div>
            ) : null}
            <div className="spm-push">
                <QrBlock page={page} mode={mode} />
            </div>
        </Frame>
    );
}

function StandingsTableLayout({ page, issueMeta, mode }) {
    const isKings = page?.kind === 'kings_club_champions';
    const rows =
        Array.isArray(page?.standings) && page.standings.length
            ? page.standings
            : Array.isArray(page?.items)
              ? page.items
              : [];
    const displayRows = rows.slice(0, 13);
    const isOpener = !page?.runIndex;
    const art = pagePicture(page, mode);
    // A page may carry its own kicker and column labels, so a real results
    // board (a money list, a champions board) is never mislabeled as points.
    const kicker = cleanText(page?.kicker) || (isKings ? 'Kings Club 25450' : 'Player Of The Year');
    const labels = page?.standingsLabels && typeof page.standingsLabels === 'object' ? page.standingsLabels : {};
    const rankLabel = cleanText(labels.rank) || 'Rank';
    const playerLabel = cleanText(labels.player) || 'Player';
    const valueLabel = cleanText(labels.value) || 'Points';

    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section={kicker}>
            <SectionHead kicker={kicker} headline={page?.headline} size="md" deck={isOpener ? page?.subheadline : ''} />
            {isOpener ? <Figure src={art} mode={mode} ratio={isKings ? '16 / 7' : '16 / 5'} /> : null}
            <table className="spm-table">
                <thead>
                    {isKings ? (
                        <tr>
                            <th>#</th>
                            <th>Event</th>
                            <th className="spm-num">Entries</th>
                            <th className="spm-num">Buy-In</th>
                            <th className="spm-num">Prize Pool</th>
                        </tr>
                    ) : (
                        <tr>
                            <th>{rankLabel}</th>
                            <th>{playerLabel}</th>
                            <th className="spm-num">{valueLabel}</th>
                        </tr>
                    )}
                </thead>
                <tbody>
                    {displayRows.map((r, i) =>
                        isKings ? (
                            <tr key={i}>
                                <td className="spm-rank">{r.rank || i + 1}</td>
                                <td>
                                    <b>{cleanText(r.name || r.eventName || r.headline)}</b>
                                    {r.gameType ? <small>{cleanText(r.gameType)}</small> : null}
                                </td>
                                <td className="spm-num">{Number(r.players) > 0 ? Number(r.players).toLocaleString('en-US') : ''}</td>
                                <td className="spm-num">{Number(r.buyInChips) > 0 ? formatChipsOnly(Number(r.buyInChips)) : cleanText(r.buyInLabel)}</td>
                                <td className="spm-num">{formatSafeChips(r)}</td>
                            </tr>
                        ) : (
                            <tr key={i}>
                                <td className="spm-rank">{r.rank || i + 1}</td>
                                <td>
                                    <b>{cleanText(r.playerName || r.name)}</b>
                                    {r.detail || r.country ? <small>{cleanText(r.detail || r.country)}</small> : null}
                                </td>
                                <td className="spm-num">{Number(r.points) ? Number(r.points).toLocaleString('en-US') : cleanText(r.points)}</td>
                            </tr>
                        )
                    )}
                </tbody>
            </table>
            <Copy paragraphs={page?.paragraphs} />
            <div className="spm-push">
                <QrBlock page={page} mode={mode} />
            </div>
        </Frame>
    );
}

function PlayingCards({ cards }) {
    const list = (Array.isArray(cards) ? cards : []).map((c) => String(c || '').trim()).filter(Boolean);
    if (!list.length) return null;
    return (
        <span className="spm-cards">
            {list.map((c, i) => (
                <span key={i} className={`spm-card${isRedCard(c) ? ' spm-card--red' : ''}`}>
                    {c}
                </span>
            ))}
        </span>
    );
}

function OptionRow({ option, className, interactive, onPick, children }) {
    const key = String(option?.key || '');
    const body = (
        <>
            <span className="spm-option__key">{key}</span>
            <span>
                {cleanText(option?.label)}
                {children}
            </span>
        </>
    );
    return interactive ? (
        <button type="button" className={`${className} spm-option--button`} onClick={() => onPick(key)}>
            {body}
        </button>
    ) : (
        <div className={className}>{body}</div>
    );
}

const SPOT_VOTE_BUS_EVENT = 'sp_magazine_spot_vote_updated';
const spotVoteSessionCache = new Map();

/**
 * Live reader tallies for a Strategy Lab spot. Reads the current count from
 * /api/news/spot-vote, records the reader's pick, and shares fresh tallies
 * between the setup and verdict pages of the same spot. Print proofs never
 * fetch: they keep the tallies frozen in the manifest.
 */
function useLiveSpotVotes(spotSlug, fallbackVotes, live) {
    const [votes, setVotes] = useState(() =>
        spotSlug && spotVoteSessionCache.has(spotSlug)
            ? spotVoteSessionCache.get(spotSlug)
            : parseLiveSpotVotePayload(null, fallbackVotes)
    );
    const reqSeqRef = useRef(0);
    const postAbortRef = useRef(null);

    useEffect(() => {
        setVotes(
            spotSlug && spotVoteSessionCache.has(spotSlug)
                ? spotVoteSessionCache.get(spotSlug)
                : parseLiveSpotVotePayload(null, fallbackVotes)
        );
        if (!live || !spotSlug || typeof window === 'undefined' || typeof fetch !== 'function') return undefined;

        const reqId = reqSeqRef.current + 1;
        reqSeqRef.current = reqId;
        const controller = new AbortController();
        fetch(`/api/news/spot-vote?spot=${encodeURIComponent(spotSlug)}`, { method: 'GET', signal: controller.signal })
            .then((res) => (res.ok ? res.json().catch(() => null) : null))
            .then((data) => {
                if (controller.signal.aborted || reqSeqRef.current !== reqId) return;
                const parsed = parseLiveSpotVotePayload(data);
                if (parsed) {
                    spotVoteSessionCache.set(spotSlug, parsed);
                    setVotes(parsed);
                }
            })
            .catch(() => {});

        const onExternalVote = (evt) => {
            const detail = evt?.detail;
            if (detail && detail.slug === spotSlug && detail.votes) setVotes(detail.votes);
        };
        window.addEventListener(SPOT_VOTE_BUS_EVENT, onExternalVote);
        return () => {
            controller.abort();
            if (postAbortRef.current) {
                postAbortRef.current.abort();
                postAbortRef.current = null;
            }
            window.removeEventListener(SPOT_VOTE_BUS_EVENT, onExternalVote);
        };
    }, [spotSlug, live, fallbackVotes]);

    const castVote = useCallback(
        (rawKey) => {
            const key = String(rawKey || '').trim().toUpperCase();
            if (!live || !spotSlug || !['A', 'B', 'C'].includes(key) || typeof fetch !== 'function') return;
            if (postAbortRef.current) postAbortRef.current.abort();
            const controller = new AbortController();
            postAbortRef.current = controller;
            const reqId = reqSeqRef.current + 1;
            reqSeqRef.current = reqId;
            fetch('/api/news/spot-vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spot: spotSlug, pick: key }),
                signal: controller.signal,
            })
                .then((res) => (res.ok ? res.json().catch(() => null) : null))
                .then((data) => {
                    if (controller.signal.aborted || reqSeqRef.current !== reqId) return;
                    const parsed = parseLiveSpotVotePayload(data);
                    if (!parsed) return;
                    spotVoteSessionCache.set(spotSlug, parsed);
                    setVotes(parsed);
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent(SPOT_VOTE_BUS_EVENT, { detail: { slug: spotSlug, votes: parsed } }));
                    }
                })
                .catch(() => {});
        },
        [live, spotSlug]
    );

    return [votes, castVote];
}

export function parseLiveSpotVotePayload(data, fallbackVotes = null) {
    const src = data?.votes || data?.counts || fallbackVotes;
    if (!src || typeof src !== 'object') return null;
    const a = Math.max(0, Math.floor(Number(src.A || 0)));
    const b = Math.max(0, Math.floor(Number(src.B || 0)));
    const c = Math.max(0, Math.floor(Number(src.C || 0)));
    const computedTotal = a + b + c;
    const rawTotal = Number(data?.total ?? src.total ?? computedTotal);
    const total = Number.isFinite(rawTotal) && rawTotal >= computedTotal ? Math.floor(rawTotal) : computedTotal;
    return { A: a, B: b, C: c, total };
}

function StrategyColumnLayout({ page, issueMeta, mode }) {
    const [picked, setPicked] = useState('');
    const spot = page?.spot || {};
    const options = Array.isArray(page?.items) && page.items.length ? page.items : Array.isArray(spot.options) ? spot.options : [];
    const correctKey = String(spot.correctKey || '');
    const freqMatch = typeof spot.solverFrequency === 'string' ? /^(\d+(?:\.\d+)?)%/.exec(spot.solverFrequency.trim()) : null;
    const rawSolverPct = spot.solverPct ?? (freqMatch ? Number(freqMatch[1]) : null);
    const solverPct =
        rawSolverPct != null && Number.isFinite(Number(rawSolverPct)) ? Math.min(100, Math.max(0, Number(rawSolverPct))) : null;
    const interactive = !isPrint(mode);
    const spotSlug = String(spot.slug || '').trim();
    const [liveVotes, castVote] = useLiveSpotVotes(spotSlug, spot.communityVotes, interactive);
    const votes = (interactive && liveVotes) || spot.communityVotes || {};
    const totalVotes = Number(votes.total) || 0;
    const pickOption = (key) => {
        setPicked(key);
        castVote(key);
    };
    const isSetup =
        page?.meta?.spreadHalf === 'setup' ||
        (page?.meta?.spreadHalf !== 'verdict' && Array.isArray(page?.items) && page.items.length > 0);
    const spotCard = pagePicture(page, mode);
    const paragraphs = Array.isArray(page?.paragraphs) ? page.paragraphs : [];
    const labLabel = page?.kind === 'strategy_icm' ? 'ICM Lab' : page?.kind === 'strategy_plo' ? 'PLO Lab' : 'NLH Lab';

    if (isSetup) {
        const [situation, ...rest] = paragraphs;
        return (
            <Frame page={page} issueMeta={issueMeta} mode={mode} section="The Strategy Lab">
                <SectionHead kicker={`The Strategy Lab • ${labLabel}`} headline={page?.headline} size="md" deck={page?.subheadline} byline={page?.byline} />
                <Figure src={spotCard} mode={mode} fill contain alt={cleanText(spot.title)} />
                <div className="spm-box">
                    <div className="spm-box__title">The Situation</div>
                    <div className="spm-hand">
                        {Array.isArray(spot.heroCards) && spot.heroCards.some(Boolean) ? (
                            <div>
                                <div className="spm-stat__label">Hero</div>
                                <PlayingCards cards={spot.heroCards} />
                            </div>
                        ) : null}
                        {Array.isArray(spot.boardCards) && spot.boardCards.some(Boolean) ? (
                            <div>
                                <div className="spm-stat__label">Board</div>
                                <PlayingCards cards={spot.boardCards} />
                            </div>
                        ) : null}
                    </div>
                    <Copy paragraphs={[situation || spot.situation]} style={{ textAlign: 'left' }} />
                </div>
                <div>
                    <div className="spm-box__title">Your Move</div>
                    {options.map((o) => (
                        <OptionRow
                            key={o?.key}
                            option={o}
                            className={`spm-option${picked && picked === String(o?.key) ? ' spm-option--picked' : ''}`}
                            interactive={interactive}
                            onPick={pickOption}
                        >
                            {picked && totalVotes > 0 ? (
                                <span className="spm-bar">
                                    <i style={{ width: `${Math.round(((Number(votes[String(o?.key)]) || 0) * 100) / totalVotes)}%` }} />
                                </span>
                            ) : null}
                        </OptionRow>
                    ))}
                </div>
                <p className="spm-caption spm-caption--note">
                    {picked
                        ? `You picked ${picked}. Turn the page for the solver verdict.`
                        : cleanText(rest.join(' '), 'Lock in your answer, then turn the page for the solver verdict.')}
                </p>
                <div className="spm-push">
                    <QrBlock page={page} mode={mode} />
                </div>
            </Frame>
        );
    }

    const takeaway = paragraphs.find((p) => /^key takeaway/i.test(String(p)));
    const analysis = paragraphs.filter((p) => p !== takeaway);
    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section="The Strategy Lab">
            <SectionHead kicker={`Solver Verdict • ${labLabel}`} headline={page?.headline} size="md" deck={page?.subheadline} />
            <div className="spm-verdict">
                <div>
                    {solverPct != null ? <div className="spm-bignum">{`${solverPct}%`}</div> : null}
                    <div className="spm-stat__label">{cleanText(spot.solverFrequency, 'Solver Frequency')}</div>
                </div>
                <div>
                    {options.map((o) => {
                        const key = String(o?.key || '');
                        const share = totalVotes > 0 ? Math.round(((Number(votes[key]) || 0) * 100) / totalVotes) : null;
                        return (
                            <OptionRow key={key} option={o} className={`spm-option${key === correctKey ? ' spm-option--correct' : ''}`} interactive={false}>
                                {share != null ? (
                                    <span className="spm-bar">
                                        <i style={{ width: `${share}%` }} />
                                    </span>
                                ) : null}
                            </OptionRow>
                        );
                    })}
                    <div className="spm-caption">
                        {totalVotes > 0 ? `${totalVotes.toLocaleString('en-US')} reader votes` : 'Reader voting is open on Smarter.Poker'}
                    </div>
                </div>
            </div>
            <div className="spm-box">
                <div className="spm-box__title">Why It Works</div>
                <Copy paragraphs={analysis.length ? analysis : [spot.evSummary]} style={{ textAlign: 'left' }} />
            </div>
            {takeaway ? <PullQuote text={String(takeaway).replace(/^key takeaway:\s*/i, '')} /> : null}
            <div className="spm-push">
                <QrBlock page={page} mode={mode} />
            </div>
        </Frame>
    );
}

function TheTestQuizLayout({ page, issueMeta, mode }) {
    const [answers, setAnswers] = useState({});
    const questions = (Array.isArray(page?.items) ? page.items : []).slice(0, 4);
    const isOpener = !page?.runIndex;
    const isLast = Number(page?.runIndex || 0) === Number(page?.runLength || 1) - 1;
    const answerKey = Array.isArray(page?.meta?.answerKey) ? page.meta.answerKey : [];
    const art = pagePicture(page, mode);
    const interactive = !isPrint(mode);

    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section="The Smarter.Poker Test">
            {isOpener ? <Figure src={art} mode={mode} ratio="16 / 5" /> : null}
            <SectionHead
                kicker={isOpener ? 'The Smarter.Poker Test' : 'The Test • Continued'}
                headline={isOpener ? page?.headline : ''}
                size="md"
                deck={isOpener ? page?.subheadline : ''}
            />
            <div className="spm-stack">
                {questions.map((q, qIdx) => {
                    const qNum = Number(q?.number || qIdx + 1);
                    const qKey = String(q?.slug || qNum);
                    const correct = String(q?.answerKey || q?.correctKey || '');
                    const picked = answers[qKey] || '';
                    return (
                        <div key={qKey}>
                            <div className="spm-question">
                                <span className="spm-toc-entry__num">{qNum}</span>
                                <div>
                                    {q?.badge || q?.categoryLabel ? (
                                        <div className="spm-kicker spm-kicker--sm">{cleanText(q.badge || q.categoryLabel)}</div>
                                    ) : null}
                                    <div className="spm-brief__title">{cleanText(q?.question)}</div>
                                </div>
                            </div>
                            {(Array.isArray(q?.options) ? q.options.slice(0, 4) : []).map((o) => {
                                const key = String(o?.key || '');
                                const cls = `spm-option${picked && key === correct ? ' spm-option--correct' : ''}${picked && key === picked && key !== correct ? ' spm-option--wrong' : ''}`;
                                return (
                                    <OptionRow
                                        key={key}
                                        option={o}
                                        className={cls}
                                        interactive={interactive && !picked}
                                        onPick={(k) => setAnswers((prev) => ({ ...prev, [qKey]: k }))}
                                    />
                                );
                            })}
                            {picked && q?.explanation ? (
                                <p className="spm-caption spm-caption--note">
                                    <b>{picked === correct ? 'Correct.' : `Answer: ${correct}.`}</b>
                                    {cleanText(q.explanation)}
                                </p>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {isLast && answerKey.length ? (
                <div className="spm-box">
                    <div className="spm-box__title">Answer Key</div>
                    {answerKey.map((a, i) => (
                        <p key={i} className="spm-caption spm-answer">
                            <b>{`${a.number || i + 1}. ${cleanText(a.answerKey)}`}</b>
                            {cleanText(a.explanation)}
                        </p>
                    ))}
                </div>
            ) : null}
            <div className="spm-push">
                <QrBlock page={page} mode={mode} />
            </div>
        </Frame>
    );
}

function DirectoryGridLayout({ page, issueMeta, mode }) {
    const kind = page?.kind;
    const items = (Array.isArray(page?.items) ? page.items : []).filter((it) => it && (it.headline || it.title));
    const art = pagePicture(page, mode);
    const isVideo = kind === 'video_tool_spotlight' && items.some((it) => it.videoId);
    const isTools = kind === 'video_tool_spotlight' && !isVideo;
    const isRadar = kind === 'live_series_radar';
    const isOpener = !page?.runIndex;
    const section = isVideo ? 'Video Spotlight' : isTools ? 'Pro Tools' : isRadar ? 'Live Series Radar' : 'Poker Rooms';
    const leadIdx = Number.isInteger(page?.leadItemIndex) && page.leadItemIndex >= 0 ? page.leadItemIndex : -1;
    const lead = isVideo && leadIdx >= 0 && art ? items[leadIdx] : null;
    const others = items.filter((it) => it !== lead);

    return (
        <Frame page={page} issueMeta={issueMeta} mode={mode} section={section}>
            <SectionHead kicker={section} headline={page?.headline} size="md" deck={page?.subheadline} />
            {lead ? (
                <article className="spm-stack spm-stack--tight">
                    <Figure
                        src={art}
                        mode={mode}
                        ratio="16 / 9"
                        play
                        href={lead.url}
                        credit={cleanText(lead.sourceName)}
                        caption={lead.duration ? `Runtime ${cleanText(lead.duration)}` : ''}
                    />
                    <h3 className="spm-headline spm-headline--md">
                        <MagLink href={lead.url} mode={mode}>
                            {cleanText(lead.headline)}
                        </MagLink>
                    </h3>
                    <Copy paragraphs={[lead.summary]} />
                </article>
            ) : (
                <Figure src={art} mode={mode} ratio={isOpener ? '16 / 6' : '16 / 5'} caption={page?.imageCaption} />
            )}
            {isRadar ? (
                <table className="spm-table">
                    <thead>
                        <tr>
                            <th>Dates</th>
                            <th>Series</th>
                            <th>Where</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it, i) => (
                            <tr key={i}>
                                <td className="spm-nowrap">{cleanText(it.dates)}</td>
                                <td>
                                    <b>
                                        <MagLink href={it.url} mode={mode}>
                                            {cleanText(it.headline)}
                                        </MagLink>
                                    </b>
                                </td>
                                <td>
                                    {cleanText(it.venueName)}
                                    {it.city || it.state ? <small>{[it.city, it.state].filter(Boolean).join(', ')}</small> : null}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <Briefs items={others} mode={mode} grid={kind === 'poker_rooms_directory'} />
            )}
            <div className="spm-push">
                <QrBlock page={page} mode={mode} />
            </div>
        </Frame>
    );
}

function BackCoverLayout({ page, mode }) {
    const art = pagePicture(page, mode);
    return (
        <>
            {art ? (
                <div className="spm-bleed" data-spm-figure="1">
                    <MagImg src={art} alt="" mode={mode} />
                </div>
            ) : null}
            <div className="spm-shade-bottom" style={{ height: '80%' }} />
            <div className="spm-overlay-story spm-overlay-story--back">
                <MagImg src={WORDMARK} alt={MAGAZINE_MASTHEAD} className="spm-back__wordmark" mode={mode} />
                <h2 className="spm-headline spm-headline--xl">{cleanText(page?.headline)}</h2>
                {page?.subheadline ? <p className="spm-deck">{cleanText(page.subheadline)}</p> : null}
                <Copy paragraphs={page?.paragraphs} />
                <Stats stats={page?.stats} cols={3} />
                <QrBlock page={page} mode={mode} />
            </div>
            <div className="spm-cover-foot">
                <span>Smarter.Poker</span>
                <span className="spm-cover-foot__address">{MAGAZINE_POSTAL_ADDRESS}</span>
            </div>
        </>
    );
}

const DARK_KINDS = new Set([
    'front_cover',
    'house_promo_spread',
    'capture_the_moment_left',
    'capture_the_moment_right',
    'cardroom_bundle_cta',
    'back_cover',
]);

export function MagazinePageSheet({ page, issueMeta = {}, mode = 'screen', onSelectPage, style = {} }) {
    const kind = String(page?.kind || 'news_rail');
    const props = { page, issueMeta, mode };

    let inner = null;
    if (kind === 'front_cover') {
        inner = <FrontCoverLayout {...props} onSelectPage={onSelectPage} />;
    } else if (kind === 'house_promo_spread') {
        inner = <AdLayout {...props} />;
    } else if (kind === 'editor_first_hand') {
        inner = <EditorFirstHandLayout {...props} />;
    } else if (kind === 'toc_left' || kind === 'toc_right') {
        inner = <TocSpreadLayout {...props} onSelectPage={onSelectPage} />;
    } else if (kind === 'news_rail' || kind === 'final_table_live') {
        inner = <NewsRailLayout {...props} />;
    } else if (kind === 'capture_the_moment_left' || kind === 'capture_the_moment_right') {
        inner = <CaptureTheMomentLayout {...props} />;
    } else if (
        kind === 'cover_feature' ||
        kind === 'secondary_feature' ||
        kind === 'platform_feature' ||
        kind === 'strategy_ai_coach'
    ) {
        inner = <FeatureArticleLayout {...props} />;
    } else if (kind === 'poy_standings' || kind === 'kings_club_champions') {
        inner = <StandingsTableLayout {...props} />;
    } else if (kind === 'strategy_nlh' || kind === 'strategy_icm' || kind === 'strategy_plo') {
        inner = <StrategyColumnLayout {...props} />;
    } else if (kind === 'the_test_quiz') {
        inner = <TheTestQuizLayout {...props} />;
    } else if (kind === 'video_tool_spotlight' || kind === 'live_series_radar' || kind === 'poker_rooms_directory') {
        inner = <DirectoryGridLayout {...props} />;
    } else if (kind === 'cardroom_bundle_cta') {
        inner = <AdLayout {...props} />;
    } else if (kind === 'back_cover') {
        inner = <BackCoverLayout {...props} />;
    } else {
        inner = <FeatureArticleLayout {...props} />;
    }

    return (
        <div
            className={`spm-sheet${DARK_KINDS.has(kind) ? ' spm-sheet--dark' : ''}`}
            data-magazine-page={page?.pageNumber || 1}
            data-magazine-kind={kind}
            data-magazine-mode={isPrint(mode) ? 'print' : 'screen'}
            style={style}
        >
            {inner}
        </div>
    );
}

export default MagazinePageSheet;
