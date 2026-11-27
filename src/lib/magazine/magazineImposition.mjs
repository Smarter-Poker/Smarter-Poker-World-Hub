/**
 * Pure Commercial Saddle-Stitch Imposition & Cardroom Print Fulfillment Engine
 *
 * IMPORTANT: Keep this module 100% pure ESM (zero Node `fs`, `crypto`, `sharp`, or
 * server-only Supabase imports) so both client-side React pages (`/hub/magazine/print/[issue]`,
 * `/admin/newsletter`) and server-side tests/APIs can import it cleanly.
 */
import { stripMagazineDashes } from './magazineSchema.mjs';

export const IMPOSITION_SHEET_TRIM = Object.freeze({
    pageWidthIn: 8.375,
    pageHeightIn: 10.875,
    spreadWidthIn: 16.75,
    spreadHeightIn: 10.875,
    bleedIn: 0.125,
    bleedSpreadWidthIn: 17.0,
    bleedSpreadHeightIn: 11.125,
});

/**
 * Escapes a single CSV cell per RFC 4180 and neutralizes spreadsheet formula injection
 * (`=`, `+`, `-`, `@` prefixed with `'`).
 */
export function escapeFulfillmentCsvCell(value) {
    if (value == null) return '';
    let raw = stripMagazineDashes(String(value)).replace(/\r\n|\r|\n/g, ' ');
    if (/^[\t ]*[=+\-@]/.test(raw)) {
        raw = `'${raw}`;
    }
    if (/[",\r\n]/.test(raw)) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
}

/**
 * Extracts normalized USPS/UPS shipping fields from a `magazine_room_subscriptions` row,
 * reading `shipping_address_json` first with clean fallbacks to top-level properties.
 */
export function extractRoomShippingAddress(room = {}) {
    const r = room && typeof room === 'object' ? room : {};
    const addr =
        r.shipping_address_json && typeof r.shipping_address_json === 'object'
            ? r.shipping_address_json
            : {};

    const street = stripMagazineDashes(
        addr.street || addr.address || addr.line1 || addr.address1 || r.street || r.shipping_address || ''
    );
    const city = stripMagazineDashes(addr.city || r.city || '');
    const state = stripMagazineDashes(addr.state || r.state || '').toUpperCase();
    const postalCode = stripMagazineDashes(
        addr.postal_code || addr.postalCode || addr.zip || r.postal_code || r.postalCode || ''
    );
    const country = stripMagazineDashes(addr.country || r.country || 'US').toUpperCase() || 'US';

    return {
        street,
        city,
        state,
        postal_code: postalCode,
        country,
    };
}

/**
 * Pads an arbitrary page array up to a valid commercial saddle-stitch signature multiple
 * (`N >= 4` and `N % 4 === 0`) so UI previews remain resilient even on partial drafts.
 */
export function padPagesToSignature(pages = []) {
    const src = Array.isArray(pages) ? pages : [];
    const targetLen = Math.max(4, Math.ceil(Math.max(1, src.length) / 4) * 4);
    const out = src.slice(0, targetLen).map((p, idx) =>
        p && typeof p === 'object'
            ? { ...p, pageNumber: Number(p.pageNumber) || idx + 1 }
            : { pageNumber: idx + 1, kind: 'news_rail', headline: String(p ?? `Page ${idx + 1}`) }
    );
    while (out.length < targetLen) {
        const pageNumber = out.length + 1;
        out.push({
            pageNumber,
            kind: 'news_rail',
            department: 'Press Blank',
            headline: `Signature Blank Sheet (${pageNumber})`,
            subheadline: 'Reserved For 4-Page Commercial Saddle-Stitch Signature Alignment.',
            paragraphs: [],
            items: [],
        });
    }
    return out;
}

/**
 * Computes exact commercial saddle-stitch printer spreads for an `N`-page issue
 * (`N >= 4` and `N % 4 === 0`, e.g. `44` pages -> `11` physical 16.75"x10.875" sheets -> `22` spreads).
 *
 * Sheet `s` (`0 .. N/4 - 1`):
 *   - Front (`side: 'front'`, `signatureNumber: s + 1`):
 *       Left  = `pages[N - 1 - 2*s]` (Page 44 on Sheet 1 Front Left)
 *       Right = `pages[2*s]`         (Page 1 on Sheet 1 Front Right)
 *   - Back  (`side: 'back'`, `signatureNumber: s + 1`):
 *       Left  = `pages[2*s + 1]`     (Page 2 on Sheet 1 Back Left)
 *       Right = `pages[N - 2 - 2*s]` (Page 43 on Sheet 1 Back Right)
 *
 * Invariant: Every page `1..N` appears exactly once across the `N / 2` spreads, and
 * `leftPageNumber + rightPageNumber === N + 1` on every single spread.
 */
export function computeSaddleStitchSpreads(pages) {
    if (!Array.isArray(pages)) {
        throw new TypeError('computeSaddleStitchSpreads requires an array of pages');
    }
    const n = pages.length;
    if (n < 4 || n % 4 !== 0) {
        throw new RangeError(
            `Saddle-stitch imposition requires N >= 4 and N % 4 === 0 pages (received ${n})`
        );
    }

    const sheetCount = n / 4;
    const spreads = [];

    for (let s = 0; s < sheetCount; s += 1) {
        const signatureNumber = s + 1;

        const frontLeftIdx = n - 1 - 2 * s;
        const frontRightIdx = 2 * s;
        const frontLeftPageNumber = frontLeftIdx + 1;
        const frontRightPageNumber = frontRightIdx + 1;

        spreads.push({
            spreadIndex: s * 2,
            signatureNumber,
            side: 'front',
            leftPageNumber: frontLeftPageNumber,
            rightPageNumber: frontRightPageNumber,
            leftPage: pages[frontLeftIdx],
            rightPage: pages[frontRightIdx],
            label: `Sig ${signatureNumber} Front [P.${frontLeftPageNumber} | P.${frontRightPageNumber}]`,
        });

        const backLeftIdx = 2 * s + 1;
        const backRightIdx = n - 2 - 2 * s;
        const backLeftPageNumber = backLeftIdx + 1;
        const backRightPageNumber = backRightIdx + 1;

        spreads.push({
            spreadIndex: s * 2 + 1,
            signatureNumber,
            side: 'back',
            leftPageNumber: backLeftPageNumber,
            rightPageNumber: backRightPageNumber,
            leftPage: pages[backLeftIdx],
            rightPage: pages[backRightIdx],
            label: `Sig ${signatureNumber} Back [P.${backLeftPageNumber} | P.${backRightPageNumber}]`,
        });
    }

    return spreads;
}

/**
 * Builds a USPS/UPS-ready fulfillment CSV and press-run calculation summary
 * from `magazine_room_subscriptions` rows.
 */
export function buildCardroomFulfillmentCsv(
    rooms = [],
    { issuePeriod = '', overagePct = 10, includePending = false } = {}
) {
    const allowedStatuses = new Set(
        includePending ? ['verified', 'active', 'pending'] : ['verified', 'active']
    );

    const eligibleRooms = (Array.isArray(rooms) ? rooms : []).filter((room) => {
        if (!room || typeof room !== 'object') return false;
        const st = String(room.status || '').trim().toLowerCase();
        return allowedStatuses.has(st);
    });

    const cleanPeriod = stripMagazineDashes(String(issuePeriod || '').trim());
    const safePct =
        Number.isFinite(Number(overagePct)) && Number(overagePct) >= 0 ? Number(overagePct) : 10;

    const headers = [
        'Issue Period',
        'Room Name',
        'Attention Contact',
        'Street Address',
        'City',
        'State',
        'Postal Code',
        'Country',
        'Contact Email',
        'Contact Phone',
        'Table Count',
        'Bundle Copies',
        'Status',
        'Fulfillment Notes',
    ];

    let netCopies = 0;
    const normalizedRows = [];
    const csvLines = [headers.map(escapeFulfillmentCsvCell).join(',')];

    for (const room of eligibleRooms) {
        const copiesRaw = Number(room.requested_copies ?? room.requestedCopies ?? 0);
        const copies = Number.isFinite(copiesRaw) && copiesRaw > 0 ? Math.round(copiesRaw) : 0;
        netCopies += copies;

        const addr = extractRoomShippingAddress(room);
        const roomName = stripMagazineDashes(room.room_name || room.roomName || 'Poker Room');
        const contactName = stripMagazineDashes(room.contact_name || room.contactName || 'Poker Room Manager');
        const contactEmail = String(room.contact_email || room.contactEmail || '').trim().toLowerCase();
        const contactPhone = stripMagazineDashes(room.contact_phone || room.contactPhone || '');
        const tableCount =
            Number.isFinite(Number(room.table_count)) && Number(room.table_count) > 0
                ? Math.round(Number(room.table_count))
                : '';
        const status = stripMagazineDashes(String(room.status || 'active').toLowerCase());
        const notes = stripMagazineDashes(room.notes || '');

        normalizedRows.push({
            id: room.id || null,
            issuePeriod: cleanPeriod,
            roomName,
            contactName,
            street: addr.street,
            city: addr.city,
            state: addr.state,
            postal_code: addr.postal_code,
            country: addr.country,
            contactEmail,
            contactPhone,
            tableCount,
            copies,
            status,
            notes,
        });

        const recordCells = [
            cleanPeriod,
            roomName,
            contactName,
            addr.street,
            addr.city,
            addr.state,
            addr.postal_code,
            addr.country,
            contactEmail,
            contactPhone,
            tableCount,
            copies,
            status,
            notes,
        ];
        csvLines.push(recordCells.map(escapeFulfillmentCsvCell).join(','));
    }

    const activeRoomsCount = eligibleRooms.length;
    const overageCopies = netCopies > 0 ? Math.ceil((netCopies * safePct) / 100) : 0;
    const totalPressRunCopies = netCopies + overageCopies;

    return {
        csv: csvLines.join('\r\n'),
        activeRoomsCount,
        netCopies,
        overageCopies,
        totalPressRunCopies,
        rows: normalizedRows,
    };
}
