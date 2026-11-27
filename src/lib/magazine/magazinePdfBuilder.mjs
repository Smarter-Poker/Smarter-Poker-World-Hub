/**
 * Server-Side Commercial 44-Page PDF Builder for Smarter.Poker Magazine
 *
 * Builds an exact `8.375in x 10.875in` multi-page Vanguard edition PDF (`%PDF-1.x`)
 * using `jspdf` and pure-vector ISO/IEC 18004 QR matrices from `qrcode/lib/core/qrcode.js`.
 *
 * Security & Print Guarantees:
 *   - Strict SSRF allowlist on optional cover image embedding: ONLY fetches `https:`
 *     objects inside `*.supabase.co/storage/v1/object/public/magazine-assets/` with a
 *     3-second timeout, manual redirect rejection, and JPEG signature validation.
 *   - Zero yellow/purple hexes (Vanguard `#05070a`, `#0b1520`, `#102131`, `#4fc1b3`, `#60a5fa`, `#ffffff`).
 *   - Zero em/en dashes and zero `$` currency symbols on Club Arena / Kings Club chip prizes.
 *   - Pure vector QR codes drawn module-by-module via `doc.rect(...)` on every page.
 */
import QRCodeCore from 'qrcode/lib/core/qrcode.js';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_POSTAL_ADDRESS,
    MAGAZINE_SITE_URL,
    MAGAZINE_STORAGE_BUCKET,
    MAGAZINE_TAGLINE,
    MAGAZINE_TRIM,
    formatChipsOnly,
    formatPeriodLabel,
    normalizeIssueManifest,
    stripMagazineDashes,
} from './magazineSchema.mjs';
import { padPagesToSignature } from './magazineImposition.mjs';

const PAGE_W = MAGAZINE_TRIM.widthIn; // 8.375 in
const PAGE_H = MAGAZINE_TRIM.heightIn; // 10.875 in
const MARGIN_X = 0.48;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 7.415 in

const MAX_EMBED_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 3000;

const createIsoQrCode =
    typeof QRCodeCore?.create === 'function'
        ? (text, opts) => QRCodeCore.create(text, opts)
        : (text, opts) => QRCodeCore.default.create(text, opts);

const RGB = Object.freeze({
    obsidian: [5, 7, 10], // #05070a
    navyDark: [11, 21, 32], // #0b1520
    navyCard: [16, 33, 49], // #102131
    navyBorder: [27, 44, 61], // #1b2c3d
    teal: [79, 193, 179], // #4fc1b3
    tealInk: [13, 148, 136], // #0d9488
    blue: [96, 165, 250], // #60a5fa
    blueInk: [37, 99, 235], // #2563eb
    slateInk: [15, 23, 42], // #0f172a
    slateBody: [51, 65, 85], // #334155
    slateMuted: [159, 179, 200], // #9fb3c8
    paperCard: [248, 250, 252], // #f8fafc
    paperSubtle: [241, 245, 249], // #f1f5f9
    paperBorder: [203, 213, 225], // #cbd5e1
    white: [255, 255, 255], // #ffffff
});

/**
 * Converts text into clean WinAnsi/ASCII-safe PDF copy with zero em/en dashes.
 */
export function toPdfSafeText(value, fallback = '') {
    const stripped = stripMagazineDashes(value ?? '')
        .replace(/[\u2022\u00b7]/g, ' | ')
        .replace(/\u2192/g, '->')
        .replace(/\u2190/g, '<-')
        .replace(/\u00d7/g, 'x')
        .replace(/[^\x20-\x7e\xa0-\xff]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return stripped || fallback;
}

function formatSafePdfChips(item) {
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
        const rawLabel = toPdfSafeText(
            String(item.prizePoolLabel || item.prizeLabel || item.prize || item.value || '').replace(/\$/g, '')
        );
        if (rawLabel) {
            return /chips/i.test(rawLabel) ? rawLabel : `${rawLabel} Chips`;
        }
        return '0 Chips';
    }
    const parsed = Number(String(item || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? formatChipsOnly(parsed) : '0 Chips';
}

function buildDefaultUrl(pathname = '/hub/magazine') {
    try {
        return new URL(pathname, MAGAZINE_SITE_URL).href;
    } catch {
        return MAGAZINE_SITE_URL;
    }
}

function formatShortPdfPath(rawUrl) {
    const clean = String(rawUrl || MAGAZINE_SITE_URL).trim();
    try {
        const parsed = clean.startsWith('http') ? new URL(clean) : new URL(clean, MAGAZINE_SITE_URL);
        const params = new URLSearchParams(parsed.search);
        params.delete('utm_source');
        params.delete('utm_medium');
        params.delete('utm_campaign');
        params.delete('utm_content');
        const rest = params.toString();
        const full = `smarter.poker${parsed.pathname === '/' ? '' : parsed.pathname}${rest ? `?${rest}` : ''}`;
        return full.length > 48 ? `${full.slice(0, 45)}...` : full;
    } catch {
        return 'smarter.poker';
    }
}

/**
 * Strictly allowlists `https://*.supabase.co/storage/v1/object/public/magazine-assets/*`
 * for server-side PDF image embedding so arbitrary third-party or internal hosts are never fetched.
 */
export function isAllowedMagazineAssetImageUrl(rawUrl) {
    const clean = String(rawUrl || '').trim();
    if (!clean) return false;
    try {
        const parsed = new URL(clean);
        if (parsed.protocol !== 'https:') return false;
        const host = parsed.hostname.toLowerCase();
        if (!host.endsWith('.supabase.co') || host === 'supabase.co') return false;
        const requiredPrefix = `/storage/v1/object/public/${MAGAZINE_STORAGE_BUCKET}/`;
        if (!parsed.pathname.startsWith(requiredPrefix)) return false;
        if (parsed.pathname.includes('..')) return false;
        return true;
    } catch {
        return false;
    }
}

async function fetchAllowlistedJpegDataUri(rawUrl, fetchImpl = fetch) {
    if (!isAllowedMagazineAssetImageUrl(rawUrl) || typeof fetchImpl !== 'function') {
        return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
        const response = await fetchImpl(rawUrl, {
            method: 'GET',
            redirect: 'error',
            signal: controller.signal,
        });
        if (!response || !response.ok) return null;
        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('image/jpeg') && !contentType.includes('image/jpg')) {
            return null;
        }
        const ab = await response.arrayBuffer();
        if (!ab || ab.byteLength < 16 || ab.byteLength > MAX_EMBED_IMAGE_BYTES) return null;
        const buf = Buffer.from(ab);
        // Verify genuine JPEG SOI marker (FF D8 FF)
        if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
            return null;
        }
        return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function setFill(doc, rgb) {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setStroke(doc, rgb) {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function setTextRgb(doc, rgb) {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function drawWrappedLines(doc, text, x, y, maxWidth, lineHeightIn, maxLines = 6) {
    const clean = toPdfSafeText(text);
    if (!clean) return y;
    const rawLines = doc.splitTextToSize(clean, maxWidth);
    const lines = Array.isArray(rawLines) ? rawLines.slice(0, maxLines) : [String(rawLines)];
    for (let i = 0; i < lines.length; i += 1) {
        doc.text(String(lines[i]), x, y + i * lineHeightIn);
    }
    return y + lines.length * lineHeightIn;
}

/**
 * Draws a genuine ISO/IEC 18004 Reed-Solomon QR code directly as vector rectangles in jsPDF.
 */
function drawVectorQrBadge(
    doc,
    {
        qrUrl,
        ctaLabel = 'Scan At The Table',
        x = MARGIN_X,
        y = PAGE_H - 1.38,
        width = CONTENT_W,
        height = 0.82,
        darkSurface = false,
    } = {}
) {
    const cleanUrl = String(qrUrl || buildDefaultUrl('/hub/magazine')).trim() || buildDefaultUrl('/hub/magazine');
    setFill(doc, darkSurface ? RGB.navyDark : RGB.paperCard);
    setStroke(doc, darkSurface ? RGB.teal : RGB.slateInk);
    doc.setLineWidth(0.01);
    doc.roundedRect(x, y, width, height, 0.06, 0.06, 'FD');

    const qrBoxSize = Math.min(height - 0.14, 0.68);
    const qrX = x + 0.08;
    const qrY = y + (height - qrBoxSize) / 2;

    setFill(doc, RGB.white);
    doc.rect(qrX, qrY, qrBoxSize, qrBoxSize, 'F');

    const qr = createIsoQrCode(cleanUrl, { errorCorrectionLevel: 'M' });
    const modCount = qr.modules.size;
    const quiet = 3;
    const totalMods = modCount + quiet * 2;
    const cell = qrBoxSize / totalMods;

    setFill(doc, RGB.obsidian);
    for (let r = 0; r < modCount; r += 1) {
        for (let c = 0; c < modCount; c += 1) {
            if (qr.modules.get(r, c)) {
                doc.rect(qrX + (c + quiet) * cell, qrY + (r + quiet) * cell, cell * 1.02, cell * 1.02, 'F');
            }
        }
    }

    const textX = qrX + qrBoxSize + 0.14;
    const textMaxW = Math.max(1.5, width - (textX - x) - 0.12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setTextRgb(doc, darkSurface ? RGB.teal : RGB.blueInk);
    doc.text('SCAN AT THE TABLE', textX, y + 0.23);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setTextRgb(doc, darkSurface ? RGB.white : RGB.obsidian);
    drawWrappedLines(doc, toPdfSafeText(ctaLabel, 'Open Interactive Feature On Smarter.Poker'), textX, y + 0.42, textMaxW, 0.15, 2);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    setTextRgb(doc, darkSurface ? RGB.slateMuted : RGB.slateBody);
    doc.text(formatShortPdfPath(cleanUrl), textX, y + height - 0.11);
}

function drawInteriorChrome(doc, page, issueMeta, darkPage = false) {
    const pageNum = Number(page?.pageNumber || 1);
    const isEven = pageNum % 2 === 0;
    const dept = toPdfSafeText(page?.department, MAGAZINE_MASTHEAD).toUpperCase();
    const running = toPdfSafeText(page?.runningHeader, issueMeta?.periodLabel || MAGAZINE_MASTHEAD).toUpperCase();
    const periodLabel = toPdfSafeText(issueMeta?.periodLabel || formatPeriodLabel(issueMeta?.issuePeriod), 'Monthly Edition');

    setFill(doc, darkPage ? RGB.obsidian : RGB.white);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    // Running Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    setTextRgb(doc, darkPage ? RGB.teal : RGB.blueInk);
    doc.text(isEven ? MAGAZINE_MASTHEAD.toUpperCase() : dept, MARGIN_X, 0.46);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setTextRgb(doc, darkPage ? RGB.slateMuted : RGB.slateBody);
    doc.text(isEven ? dept : running, PAGE_W - MARGIN_X, 0.46, { align: 'right' });

    setStroke(doc, darkPage ? RGB.navyBorder : RGB.slateInk);
    doc.setLineWidth(0.015);
    doc.line(MARGIN_X, 0.54, PAGE_W - MARGIN_X, 0.54);

    // Running Folio Footer
    setStroke(doc, darkPage ? RGB.navyBorder : RGB.paperBorder);
    doc.setLineWidth(0.008);
    doc.line(MARGIN_X, PAGE_H - 0.46, PAGE_W - MARGIN_X, PAGE_H - 0.46);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setTextRgb(doc, darkPage ? RGB.slateMuted : RGB.slateBody);
    const leftFolio = isEven
        ? `Page ${pageNum} | ${MAGAZINE_MASTHEAD}`
        : `${periodLabel} | Vol. ${issueMeta?.volumeNumber || 1} No. ${issueMeta?.issueNumber || 1}`;
    const rightFolio = isEven
        ? `${periodLabel} | Smarter.Poker`
        : `Page ${pageNum} | ${MAGAZINE_MASTHEAD}`;

    doc.text(leftFolio, MARGIN_X, PAGE_H - 0.3);
    doc.text(rightFolio, PAGE_W - MARGIN_X, PAGE_H - 0.3, { align: 'right' });
}

function renderFrontCoverPdfPage(doc, page, issueMeta, coverJpegDataUri) {
    setFill(doc, RGB.obsidian);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    if (coverJpegDataUri) {
        try {
            doc.addImage(coverJpegDataUri, 'JPEG', 0, 1.85, PAGE_W, 5.25);
        } catch {
            // Graceful vector fallback below if image decode fails
            setFill(doc, RGB.navyDark);
            doc.rect(0, 1.85, PAGE_W, 5.25, 'F');
        }
    } else {
        setFill(doc, RGB.navyDark);
        doc.rect(0.36, 1.95, PAGE_W - 0.72, 5.0, 'F');
        setStroke(doc, RGB.navyBorder);
        doc.setLineWidth(0.015);
        doc.rect(0.36, 1.95, PAGE_W - 0.72, 5.0, 'S');
    }

    // Top masthead banner
    setFill(doc, RGB.obsidian);
    doc.rect(0, 0, PAGE_W, 1.88, 'F');
    setStroke(doc, RGB.teal);
    doc.setLineWidth(0.025);
    doc.line(MARGIN_X, 0.56, PAGE_W - MARGIN_X, 0.56);

    const vol = issueMeta?.volumeNumber || 1;
    const iss = issueMeta?.issueNumber || 1;
    const periodLabel = toPdfSafeText(issueMeta?.periodLabel || formatPeriodLabel(issueMeta?.issuePeriod));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextRgb(doc, RGB.teal);
    doc.text(`VOLUME ${vol} | ISSUE #${iss} | ${periodLabel.toUpperCase()}`, MARGIN_X, 0.44);

    setTextRgb(doc, RGB.blue);
    doc.text('SMARTER.POKER PRINT & DIGITAL', PAGE_W - MARGIN_X, 0.44, { align: 'right' });

    doc.setFont('times', 'bold');
    doc.setFontSize(34);
    setTextRgb(doc, RGB.white);
    doc.text('SMARTER.POKER', MARGIN_X, 1.12);

    setFill(doc, RGB.teal);
    doc.roundedRect(MARGIN_X, 1.24, 1.65, 0.28, 0.04, 0.04, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setTextRgb(doc, RGB.obsidian);
    doc.text('MAGAZINE', MARGIN_X + 0.825, 1.43, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setTextRgb(doc, RGB.slateMuted);
    doc.text(toPdfSafeText(MAGAZINE_TAGLINE), MARGIN_X + 1.8, 1.43);

    // Cover callouts
    const rawLines =
        Array.isArray(page?.meta?.coverLines) && page.meta.coverLines.length > 0
            ? page.meta.coverLines
            : Array.isArray(issueMeta?.coverLines) && issueMeta.coverLines.length > 0
              ? issueMeta.coverLines
              : [
                    'Champions Board: The Month\'s Title Winners',
                    'NLH, ICM & PLO5 Solver Strategy Columns',
                    'Kings Club 25450: The Month\'s Biggest Prize Pools',
                ];

    let calloutY = 2.35;
    rawLines.slice(0, 3).forEach((line, idx) => {
        setFill(doc, RGB.obsidian);
        setStroke(doc, idx === 0 ? RGB.teal : RGB.blue);
        doc.setLineWidth(0.015);
        doc.roundedRect(MARGIN_X, calloutY, 4.85, 0.62, 0.05, 0.05, 'FD');

        setFill(doc, idx === 0 ? RGB.teal : RGB.blue);
        doc.rect(MARGIN_X, calloutY, 0.07, 0.62, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        setTextRgb(doc, idx === 0 ? RGB.teal : RGB.blue);
        const kicker = idx === 0 ? 'INSIDE THIS ISSUE' : idx === 1 ? 'THE STRATEGY LAB' : 'CLUB ARENA SPOTLIGHT';
        doc.text(kicker, MARGIN_X + 0.16, calloutY + 0.21);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.8);
        setTextRgb(doc, RGB.white);
        drawWrappedLines(doc, line, MARGIN_X + 0.16, calloutY + 0.42, 4.55, 0.15, 2);
        calloutY += 0.76;
    });

    // Cover headline & QR dock
    setFill(doc, RGB.obsidian);
    doc.rect(0, 6.95, PAGE_W, PAGE_H - 6.95, 'F');
    setStroke(doc, RGB.navyBorder);
    doc.setLineWidth(0.012);
    doc.line(MARGIN_X, 7.05, PAGE_W - MARGIN_X, 7.05);

    setFill(doc, RGB.blue);
    doc.roundedRect(MARGIN_X, 7.22, 1.35, 0.24, 0.04, 0.04, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setTextRgb(doc, RGB.obsidian);
    doc.text('COVER STORY', MARGIN_X + 0.675, 7.38, { align: 'center' });

    const coverHeadline = toPdfSafeText(
        page?.headline || issueMeta?.coverHeadline,
        'Inside The Month In Poker'
    );
    const coverSub = toPdfSafeText(
        issueMeta?.coverSubheadline || page?.subheadline,
        'Major Champions, GTO Solver Labs, POY Standings & Coast-To-Coast Live Series'
    );

    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    setTextRgb(doc, RGB.white);
    const afterHeadY = drawWrappedLines(doc, coverHeadline, MARGIN_X, 7.78, CONTENT_W, 0.3, 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setTextRgb(doc, RGB.slateMuted);
    drawWrappedLines(doc, coverSub, MARGIN_X, afterHeadY + 0.12, CONTENT_W, 0.18, 3);

    const slugUrl = new URL('/hub/magazine', MAGAZINE_SITE_URL);
    const qrTarget = page?.qrUrl || `${slugUrl.href}/${encodeURIComponent(issueMeta?.slug || 'latest')}`;
    drawVectorQrBadge(doc, {
        qrUrl: qrTarget,
        ctaLabel: page?.ctaLabel || 'Read Digital Edition Online At Smarter.Poker',
        x: MARGIN_X,
        y: PAGE_H - 1.32,
        width: CONTENT_W,
        height: 0.84,
        darkSurface: true,
    });
}

function renderBackCoverPdfPage(doc, page, issueMeta) {
    setFill(doc, RGB.obsidian);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    setStroke(doc, RGB.teal);
    doc.setLineWidth(0.02);
    doc.roundedRect(0.36, 0.36, PAGE_W - 0.72, PAGE_H - 0.72, 0.1, 0.1, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextRgb(doc, RGB.teal);
    doc.text('THE COMPLETE MODERN POKER ECOSYSTEM', MARGIN_X + 0.12, 0.92);

    doc.setFont('times', 'bold');
    doc.setFontSize(22);
    setTextRgb(doc, RGB.white);
    const headEnd = drawWrappedLines(
        doc,
        toPdfSafeText(page?.headline, 'Every Tool, Live Room & Solver Tree In One Hub'),
        MARGIN_X + 0.12,
        1.34,
        CONTENT_W - 0.24,
        0.32,
        3
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.2);
    setTextRgb(doc, RGB.slateMuted);
    drawWrappedLines(
        doc,
        toPdfSafeText(
            page?.subheadline,
            'Visit Smarter.Poker On Any Phone, Tablet, Or Desktop To Study GTO Spots, Find Live Games Near You, And Compete Free In Kings Club 25450.'
        ),
        MARGIN_X + 0.12,
        headEnd + 0.14,
        CONTENT_W - 0.24,
        0.18,
        4
    );

    const pillars = [
        { badge: '42 FREE TOOLS', title: 'Pro Equity, ICM & Push-Fold Calculators', desc: 'Instant Browser Math For Tournaments And Cash Games.' },
        { badge: 'POKER NEAR ME', title: 'Live Cardroom Games & 60-Day Series Radar', desc: 'Verified Tables, Daily Guarantees, And Major Stops.' },
        { badge: 'GTO HAND LAB', title: 'Interactive NLH, ICM & PLO5 Solver Trees', desc: 'Drill Real Championship Spots With EV Diagnostics.' },
        { badge: 'CLUB ID 25450', title: 'Nightly Kings Club Action & Leaderboards', desc: 'Compete In Spins, Heads-Up, And Championship Majors.' },
    ];

    const colW = (CONTENT_W - 0.42) / 2;
    pillars.forEach((box, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const bx = MARGIN_X + 0.12 + col * (colW + 0.18);
        const by = 3.65 + row * 1.65;

        setFill(doc, RGB.navyCard);
        setStroke(doc, RGB.navyBorder);
        doc.setLineWidth(0.012);
        doc.roundedRect(bx, by, colW, 1.45, 0.07, 0.07, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        setTextRgb(doc, idx % 2 === 0 ? RGB.teal : RGB.blue);
        doc.text(box.badge, bx + 0.14, by + 0.28);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setTextRgb(doc, RGB.white);
        const tEnd = drawWrappedLines(doc, box.title, bx + 0.14, by + 0.54, colW - 0.28, 0.18, 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        setTextRgb(doc, RGB.slateMuted);
        drawWrappedLines(doc, box.desc, bx + 0.14, tEnd + 0.1, colW - 0.28, 0.15, 3);
    });

    drawVectorQrBadge(doc, {
        qrUrl: page?.qrUrl || buildDefaultUrl('/hub'),
        ctaLabel: page?.ctaLabel || 'Explore Smarter.Poker World Hub',
        x: MARGIN_X + 0.12,
        y: PAGE_H - 1.75,
        width: CONTENT_W - 0.24,
        height: 0.86,
        darkSurface: true,
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextRgb(doc, RGB.slateMuted);
    doc.text(
        `${MAGAZINE_MASTHEAD} | ${toPdfSafeText(MAGAZINE_POSTAL_ADDRESS)}`,
        PAGE_W / 2,
        PAGE_H - 0.56,
        { align: 'center' }
    );
}

function renderTocPdfPage(doc, page, issueMeta) {
    drawInteriorChrome(doc, page, issueMeta, false);
    const isLeft = page?.kind === 'toc_left';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextRgb(doc, RGB.tealInk);
    doc.text(isLeft ? 'TABLE OF CONTENTS | PART I' : 'TABLE OF CONTENTS | PART II', MARGIN_X, 0.82);

    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    setTextRgb(doc, RGB.obsidian);
    doc.text(
        toPdfSafeText(page?.headline, isLeft ? 'Inside This Month In Smarter.Poker' : 'Departments & The Strategy Lab'),
        MARGIN_X,
        1.12
    );

    const allToc = Array.isArray(issueMeta?.toc) ? issueMeta.toc : [];
    const pageItems =
        Array.isArray(page?.items) && page.items.length > 0
            ? page.items
            : isLeft
              ? allToc.slice(0, Math.ceil(allToc.length / 2))
              : allToc.slice(Math.ceil(allToc.length / 2));

    let y = 1.48;
    for (const entry of pageItems.slice(0, 11)) {
        if (y > PAGE_H - 1.85) break;
        setFill(doc, RGB.paperCard);
        setStroke(doc, RGB.paperBorder);
        doc.setLineWidth(0.008);
        doc.roundedRect(MARGIN_X, y, CONTENT_W, 0.58, 0.04, 0.04, 'FD');

        const pNum = Number(entry?.pageNumber || 1);
        const endNum = Number(entry?.endPageNumber || 0);
        const pageBadge = endNum > pNum ? `P.${pNum}-${endNum}` : `P.${pNum}`;

        setFill(doc, RGB.obsidian);
        doc.roundedRect(MARGIN_X + 0.08, y + 0.11, 0.74, 0.36, 0.04, 0.04, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setTextRgb(doc, RGB.teal);
        doc.text(pageBadge, MARGIN_X + 0.45, y + 0.33, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setTextRgb(doc, RGB.obsidian);
        doc.text(
            toPdfSafeText(entry?.title || entry?.headline, 'Monthly Feature').slice(0, 78),
            MARGIN_X + 0.94,
            y + 0.25
        );

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        setTextRgb(doc, RGB.slateBody);
        doc.text(
            toPdfSafeText(entry?.subtitle || entry?.subheadline || entry?.groupLabel, '').slice(0, 96),
            MARGIN_X + 0.94,
            y + 0.44
        );
        y += 0.66;
    }

    drawVectorQrBadge(doc, {
        qrUrl: page?.qrUrl || buildDefaultUrl('/hub/magazine'),
        ctaLabel: page?.ctaLabel || 'Jump Directly To Any Story Online',
    });
}

function renderStandingsPdfPage(doc, page, issueMeta) {
    drawInteriorChrome(doc, page, issueMeta, false);
    const isKingsClub = page?.kind === 'kings_club_champions';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    setTextRgb(doc, RGB.tealInk);
    doc.text(
        isKingsClub
            ? 'CLUB ARENA | KINGS CLUB ID 25450 RESULTS'
            : toPdfSafeText(page?.kicker, 'Player Of The Year').toUpperCase(),
        MARGIN_X,
        0.82
    );

    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    setTextRgb(doc, RGB.obsidian);
    const hEnd = drawWrappedLines(
        doc,
        toPdfSafeText(page?.headline, isKingsClub ? 'Kings Club 25450 Results' : 'Player Of The Year Standings'),
        MARGIN_X,
        1.1,
        CONTENT_W,
        0.25,
        2
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setTextRgb(doc, RGB.slateBody);
    const subEnd = drawWrappedLines(doc, toPdfSafeText(page?.subheadline), MARGIN_X, hEnd + 0.04, CONTENT_W, 0.15, 2);

    const rows = Array.isArray(page?.standings) ? page.standings.slice(0, 13) : [];
    let y = subEnd + 0.14;

    // Table header
    setFill(doc, RGB.obsidian);
    doc.rect(MARGIN_X, y, CONTENT_W, 0.3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setTextRgb(doc, RGB.teal);
    doc.text('RANK', MARGIN_X + 0.1, y + 0.2);
    // A page's own labels win, so a money list or champions board is never
    // printed as points (MAG LAW 26).
    const labels = page?.standingsLabels && typeof page.standingsLabels === 'object' ? page.standingsLabels : {};
    doc.text(isKingsClub ? 'CHAMPIONSHIP EVENT' : toPdfSafeText(labels.player, 'Contender').toUpperCase(), MARGIN_X + 0.72, y + 0.2);
    doc.text(isKingsClub ? 'FORMAT & FIELD' : labels.player ? '' : 'TOUR / CIRCUIT', MARGIN_X + 3.85, y + 0.2);
    doc.text(isKingsClub ? 'PRIZE POOL (CHIPS)' : toPdfSafeText(labels.value, 'POY Points').toUpperCase(), PAGE_W - MARGIN_X - 0.1, y + 0.2, { align: 'right' });
    y += 0.32;

    rows.forEach((row, idx) => {
        if (y > PAGE_H - 1.78) return;
        setFill(doc, idx % 2 === 0 ? RGB.paperCard : RGB.white);
        setStroke(doc, RGB.paperBorder);
        doc.setLineWidth(0.006);
        doc.rect(MARGIN_X, y, CONTENT_W, 0.44, 'FD');

        const rank = Number(row?.rank || idx + 1);
        const primaryName = isKingsClub
            ? toPdfSafeText(String(row?.name || row?.headline || 'Kings Club Event').replace(/\$/g, ''))
            : toPdfSafeText(row?.playerName || row?.name || `Contender #${rank}`);
        const detail = isKingsClub
            ? toPdfSafeText(String(row?.eventDetail || row?.gameType || 'NLH').replace(/\$/g, ''))
            : toPdfSafeText(row?.detail || row?.tour || '');
        const metric = isKingsClub
            ? formatSafePdfChips(row)
            : Number.isFinite(Number(row?.points)) && String(row?.points ?? '').trim() !== ''
              ? `${Number(row.points).toLocaleString('en-US')} Pts`
              : toPdfSafeText(row?.points || '');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        setTextRgb(doc, RGB.blueInk);
        doc.text(`#${rank}`, MARGIN_X + 0.1, y + 0.27);

        setTextRgb(doc, RGB.obsidian);
        doc.text(primaryName.slice(0, 42), MARGIN_X + 0.72, y + 0.27);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        setTextRgb(doc, RGB.slateBody);
        doc.text(detail.slice(0, 38), MARGIN_X + 3.85, y + 0.27);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        setTextRgb(doc, RGB.tealInk);
        doc.text(metric, PAGE_W - MARGIN_X - 0.1, y + 0.27, { align: 'right' });

        y += 0.44;
    });

    drawVectorQrBadge(doc, {
        qrUrl: page?.qrUrl || buildDefaultUrl(isKingsClub ? '/hub/club-arena/?join=25450' : '/hub/news'),
        ctaLabel: page?.ctaLabel || (isKingsClub ? 'Take A Seat In Kings Club 25450' : 'View Live POY Leaderboard'),
    });
}

function renderStrategyColumnPdfPage(doc, page, issueMeta) {
    drawInteriorChrome(doc, page, issueMeta, false);
    const spot = page?.spot && typeof page.spot === 'object' ? page.spot : {};
    const spreadHalf = String(page?.meta?.spreadHalf || 'setup');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    setTextRgb(doc, RGB.tealInk);
    doc.text(
        `THE STRATEGY LAB | ${spreadHalf === 'verdict' ? 'SOLVER VERDICT & EV BREAKDOWN' : 'TABLE SETUP & DECISION TREE'}`,
        MARGIN_X,
        0.82
    );

    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    setTextRgb(doc, RGB.obsidian);
    const hEnd = drawWrappedLines(
        doc,
        toPdfSafeText(page?.headline || spot?.title, 'GTO Solver Spot Analysis'),
        MARGIN_X,
        1.1,
        CONTENT_W,
        0.25,
        2
    );

    // Spot summary box
    setFill(doc, RGB.navyDark);
    setStroke(doc, RGB.teal);
    doc.setLineWidth(0.012);
    doc.roundedRect(MARGIN_X, hEnd + 0.08, CONTENT_W, 1.55, 0.06, 0.06, 'FD');

    const heroCards = Array.isArray(spot.heroCards) && spot.heroCards.length ? spot.heroCards.join(' ') : 'Ah Kd';
    const boardCards = Array.isArray(spot.boardCards) && spot.boardCards.length ? spot.boardCards.join(' ') : 'Ks 9h 4d 2c';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTextRgb(doc, RGB.teal);
    doc.text(`HERO HAND: ${toPdfSafeText(heroCards)}    |    BOARD: ${toPdfSafeText(boardCards)}`, MARGIN_X + 0.14, hEnd + 0.34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    setTextRgb(doc, RGB.white);
    drawWrappedLines(
        doc,
        toPdfSafeText(spot.situation || page?.subheadline, 'Analyze stack-to-pot geometry and range advantage before committing chips.'),
        MARGIN_X + 0.14,
        hEnd + 0.58,
        CONTENT_W - 0.28,
        0.16,
        3
    );

    if (spreadHalf === 'verdict') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setTextRgb(doc, RGB.blue);
        doc.text(
            `SOLVER LINE (${toPdfSafeText(spot.correctKey, 'A')}): ${toPdfSafeText(spot.solverFrequency || `${spot.solverPct || 68}% Preferred`)}`,
            MARGIN_X + 0.14,
            hEnd + 1.24
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        setTextRgb(doc, RGB.slateMuted);
        drawWrappedLines(doc, toPdfSafeText(spot.evSummary), MARGIN_X + 0.14, hEnd + 1.44, CONTENT_W - 0.28, 0.14, 1);
    } else if (Array.isArray(spot.options) && spot.options.length > 0) {
        const optLine = spot.options
            .slice(0, 3)
            .map((o) => `[${toPdfSafeText(o.key)}] ${toPdfSafeText(o.label)}`)
            .join('   ');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setTextRgb(doc, RGB.blue);
        drawWrappedLines(doc, optLine, MARGIN_X + 0.14, hEnd + 1.28, CONTENT_W - 0.28, 0.15, 2);
    }

    let y = hEnd + 1.85;
    const paragraphs = Array.isArray(page?.paragraphs) ? page.paragraphs : [];
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    setTextRgb(doc, RGB.slateInk);
    for (const para of paragraphs.slice(0, 5)) {
        if (y > PAGE_H - 1.85) break;
        y = drawWrappedLines(doc, para, MARGIN_X, y, CONTENT_W, 0.19, 6) + 0.14;
    }

    drawVectorQrBadge(doc, {
        qrUrl: page?.qrUrl || spot?.handLabUrl || buildDefaultUrl('/hub/training/hand-lab'),
        ctaLabel: page?.ctaLabel || 'Drill This Solver Tree In GTO Hand Lab',
    });
}

function renderQuizPdfPage(doc, page, issueMeta) {
    drawInteriorChrome(doc, page, issueMeta, false);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    setTextRgb(doc, RGB.tealInk);
    doc.text('THE TEST | MONTHLY POKER IQ CHALLENGE', MARGIN_X, 0.82);

    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    setTextRgb(doc, RGB.obsidian);
    doc.text(toPdfSafeText(page?.headline, 'Test Your Championship Poker IQ'), MARGIN_X, 1.1);

    const questions = Array.isArray(page?.items) ? page.items.slice(0, 2) : [];
    let y = 1.42;
    const answerSummaries = [];

    questions.forEach((q, idx) => {
        const qNum = q?.number || idx + 1;
        setFill(doc, RGB.paperCard);
        setStroke(doc, RGB.paperBorder);
        doc.setLineWidth(0.01);
        doc.roundedRect(MARGIN_X, y, CONTENT_W, 3.15, 0.06, 0.06, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setTextRgb(doc, RGB.blueInk);
        doc.text(`QUESTION #${qNum}`, MARGIN_X + 0.14, y + 0.28);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.2);
        setTextRgb(doc, RGB.obsidian);
        let qY = drawWrappedLines(
            doc,
            toPdfSafeText(q?.question || q?.headline, 'Select the highest-EV play in this tournament spot.'),
            MARGIN_X + 0.14,
            y + 0.52,
            CONTENT_W - 0.28,
            0.18,
            4
        );

        qY += 0.1;
        const opts = Array.isArray(q?.options) ? q.options.slice(0, 4) : [];
        opts.forEach((opt, oIdx) => {
            const key = toPdfSafeText(opt?.key || String.fromCharCode(65 + oIdx));
            const label = toPdfSafeText(typeof opt === 'string' ? opt : opt?.label || '');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.2);
            setTextRgb(doc, RGB.slateInk);
            qY = drawWrappedLines(doc, `${key}) ${label}`, MARGIN_X + 0.22, qY, CONTENT_W - 0.44, 0.17, 2) + 0.06;
        });

        answerSummaries.push(
            `Q${qNum}: ${toPdfSafeText(q?.correctKey || 'A')} (${toPdfSafeText(q?.explanation || '').slice(0, 90)})`
        );
        y += 3.35;
    });

    if (answerSummaries.length > 0 && y < PAGE_H - 1.65) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        setTextRgb(doc, RGB.slateBody);
        doc.text(`ANSWER KEY: ${answerSummaries.join('  |  ').slice(0, 128)}`, MARGIN_X, PAGE_H - 1.52);
    }

    drawVectorQrBadge(doc, {
        qrUrl: page?.qrUrl || buildDefaultUrl('/hub/trivia'),
        ctaLabel: page?.ctaLabel || 'Play Daily Poker Trivia & Win Free Diamonds',
    });
}

function renderItemsOrFeaturePdfPage(doc, page, issueMeta) {
    const kind = String(page?.kind || '');
    const isDarkSpread =
        kind === 'house_promo_spread' ||
        kind === 'capture_the_moment_left' ||
        kind === 'capture_the_moment_right';

    drawInteriorChrome(doc, page, issueMeta, isDarkSpread);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    setTextRgb(doc, isDarkSpread ? RGB.teal : RGB.tealInk);
    doc.text(toPdfSafeText(page?.department, MAGAZINE_MASTHEAD).toUpperCase(), MARGIN_X, 0.82);

    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    setTextRgb(doc, isDarkSpread ? RGB.white : RGB.obsidian);
    let y = drawWrappedLines(
        doc,
        toPdfSafeText(page?.headline, MAGAZINE_MASTHEAD),
        MARGIN_X,
        1.12,
        CONTENT_W,
        0.26,
        3
    );

    if (page?.subheadline) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.8);
        setTextRgb(doc, isDarkSpread ? RGB.slateMuted : RGB.slateBody);
        y = drawWrappedLines(doc, page.subheadline, MARGIN_X, y + 0.06, CONTENT_W, 0.17, 3);
    }

    if (page?.byline) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        setTextRgb(doc, isDarkSpread ? RGB.blue : RGB.blueInk);
        doc.text(`BY ${toPdfSafeText(page.byline).toUpperCase()}`, MARGIN_X, y + 0.14);
        y += 0.24;
    } else {
        y += 0.14;
    }

    const items = Array.isArray(page?.items) ? page.items : [];
    const paragraphs = Array.isArray(page?.paragraphs) ? page.paragraphs : [];
    const stats = Array.isArray(page?.stats) ? page.stats : [];

    if (items.length > 0 && paragraphs.length === 0) {
        for (const item of items.slice(0, 6)) {
            if (y > PAGE_H - 1.95) break;
            setFill(doc, isDarkSpread ? RGB.navyCard : RGB.paperCard);
            setStroke(doc, isDarkSpread ? RGB.navyBorder : RGB.paperBorder);
            doc.setLineWidth(0.008);
            doc.roundedRect(MARGIN_X, y, CONTENT_W, 1.02, 0.05, 0.05, 'FD');

            const badge = toPdfSafeText(
                item?.category || item?.badge || item?.dates || [item?.city, item?.state].filter(Boolean).join(', ')
            );
            if (badge) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                setTextRgb(doc, isDarkSpread ? RGB.teal : RGB.blueInk);
                doc.text(badge.toUpperCase().slice(0, 68), MARGIN_X + 0.12, y + 0.22);
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.4);
            setTextRgb(doc, isDarkSpread ? RGB.white : RGB.obsidian);
            const itemTitle = toPdfSafeText(
                item?.headline || item?.title || item?.venueName || item?.name,
                'Smarter.Poker Highlight'
            );
            const tEnd = drawWrappedLines(doc, itemTitle, MARGIN_X + 0.12, y + 0.43, CONTENT_W - 0.24, 0.17, 2);

            const bodyCopy = toPdfSafeText(
                item?.summary || item?.description || item?.subheadline || item?.prizePoolLabel || ''
            );
            if (bodyCopy) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.6);
                setTextRgb(doc, isDarkSpread ? RGB.slateMuted : RGB.slateBody);
                drawWrappedLines(doc, bodyCopy, MARGIN_X + 0.12, tEnd + 0.04, CONTENT_W - 0.24, 0.14, 2);
            }
            y += 1.12;
        }
    } else {
        doc.setFont('times', 'normal');
        doc.setFontSize(10.8);
        setTextRgb(doc, isDarkSpread ? RGB.white : RGB.slateInk);
        for (const para of paragraphs.slice(0, 6)) {
            if (y > PAGE_H - 2.15) break;
            y = drawWrappedLines(doc, para, MARGIN_X, y + 0.06, CONTENT_W, 0.2, 8) + 0.12;
        }

        if (page?.pullQuote && y < PAGE_H - 2.35) {
            setFill(doc, isDarkSpread ? RGB.navyCard : RGB.paperSubtle);
            setStroke(doc, isDarkSpread ? RGB.teal : RGB.blueInk);
            doc.setLineWidth(0.014);
            doc.roundedRect(MARGIN_X, y + 0.06, CONTENT_W, 0.78, 0.05, 0.05, 'FD');

            doc.setFont('times', 'bolditalic');
            doc.setFontSize(10.5);
            setTextRgb(doc, isDarkSpread ? RGB.teal : RGB.obsidian);
            drawWrappedLines(doc, `"${toPdfSafeText(page.pullQuote)}"`, MARGIN_X + 0.16, y + 0.34, CONTENT_W - 0.32, 0.18, 3);
            y += 0.96;
        }

        if (stats.length > 0 && y < PAGE_H - 2.2) {
            const boxW = (CONTENT_W - 0.24) / 3;
            stats.slice(0, 3).forEach((st, idx) => {
                const bx = MARGIN_X + idx * (boxW + 0.12);
                setFill(doc, isDarkSpread ? RGB.navyCard : RGB.paperCard);
                setStroke(doc, isDarkSpread ? RGB.navyBorder : RGB.paperBorder);
                doc.setLineWidth(0.008);
                doc.roundedRect(bx, y + 0.06, boxW, 0.62, 0.04, 0.04, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                setTextRgb(doc, isDarkSpread ? RGB.teal : RGB.tealInk);
                doc.text(toPdfSafeText(String(st?.value ?? '').replace(/\$/g, ''), '100%'), bx + 0.1, y + 0.33);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.8);
                setTextRgb(doc, isDarkSpread ? RGB.slateMuted : RGB.slateBody);
                doc.text(toPdfSafeText(st?.label, 'Metric').slice(0, 28), bx + 0.1, y + 0.54);
            });
        }
    }

    drawVectorQrBadge(doc, {
        qrUrl: page?.qrUrl || page?.ctaUrl || buildDefaultUrl('/hub/magazine'),
        ctaLabel: page?.ctaLabel || 'Scan To Open Interactive Feature On Smarter.Poker',
        darkSurface: isDarkSpread,
    });
}

function buildSynthesizedPagesWhenEmpty(normalized) {
    const count = Math.max(4, normalized.pageCount || 44);
    const out = [];
    for (let i = 1; i <= count; i += 1) {
        if (i === 1) {
            out.push({
                pageNumber: 1,
                kind: 'front_cover',
                headline: normalized.coverHeadline,
                subheadline: normalized.coverSubheadline,
                qrUrl: buildDefaultUrl('/hub/magazine'),
            });
        } else if (i === count) {
            out.push({
                pageNumber: count,
                kind: 'back_cover',
                headline: 'Every Tool, Live Room & Solver Tree In One Hub',
                subheadline: MAGAZINE_TAGLINE,
                qrUrl: buildDefaultUrl('/hub'),
            });
        } else {
            out.push({
                pageNumber: i,
                kind: 'cover_feature',
                department: MAGAZINE_MASTHEAD,
                runningHeader: normalized.periodLabel,
                headline: `${normalized.title} - Page ${i}`,
                subheadline: normalized.coverSubheadline,
                paragraphs: [
                    normalized.editorNote ||
                        'Smarter.Poker Magazine delivers monthly GTO strategy, Top 25 POY standings, Kings Club 25450 champions, and verified live cardroom schedules.',
                ],
                qrUrl: buildDefaultUrl('/hub/magazine'),
            });
        }
    }
    return out;
}

/**
 * Generates a commercial `8.375in x 10.875in` multi-page PDF Buffer (`%PDF-1.x`)
 * for a compiled `magazine_issues` manifest.
 */
export async function buildMagazineIssuePdfBuffer(
    manifest = {},
    { embedImages = true, fetchImpl = fetch } = {}
) {
    const normalized = normalizeIssueManifest(manifest);
    const rawPages =
        Array.isArray(normalized.pages) && normalized.pages.length > 0
            ? normalized.pages
            : buildSynthesizedPagesWhenEmpty(normalized);
    const pages =
        rawPages.length >= 4 && rawPages.length % 4 === 0
            ? rawPages
            : padPagesToSignature(rawPages);

    let coverJpegDataUri = null;
    if (embedImages) {
        const candidateUrl =
            pages[0]?.masterImageUrl || pages[0]?.imageUrl || normalized.coverImageUrl || '';
        coverJpegDataUri = await fetchAllowlistedJpegDataUri(candidateUrl, fetchImpl);
    }

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: [PAGE_W, PAGE_H],
        compress: true,
    });

    doc.setProperties({
        title: toPdfSafeText(normalized.title, MAGAZINE_MASTHEAD),
        subject: toPdfSafeText(normalized.coverHeadline, MAGAZINE_TAGLINE),
        author: MAGAZINE_MASTHEAD,
        creator: MAGAZINE_MASTHEAD,
    });

    pages.forEach((page, idx) => {
        if (idx > 0) {
            doc.addPage([PAGE_W, PAGE_H], 'portrait');
        }
        const kind = String(page?.kind || 'cover_feature');
        if (kind === 'front_cover' || idx === 0) {
            renderFrontCoverPdfPage(doc, page, normalized, coverJpegDataUri);
        } else if (kind === 'back_cover') {
            renderBackCoverPdfPage(doc, page, normalized);
        } else if (kind === 'toc_left' || kind === 'toc_right') {
            renderTocPdfPage(doc, page, normalized);
        } else if (kind === 'poy_standings' || kind === 'kings_club_champions') {
            renderStandingsPdfPage(doc, page, normalized);
        } else if (kind === 'strategy_nlh' || kind === 'strategy_icm' || kind === 'strategy_plo') {
            renderStrategyColumnPdfPage(doc, page, normalized);
        } else if (kind === 'the_test_quiz') {
            renderQuizPdfPage(doc, page, normalized);
        } else {
            renderItemsOrFeaturePdfPage(doc, page, normalized);
        }
    });

    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
}
