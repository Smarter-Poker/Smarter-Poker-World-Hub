/**
 * Smarter.Poker Magazine B2B Poker Room Print Bundle Subscriptions API (/api/news/magazine-rooms)
 *
 * Public POST:
 *   - Rate-limited (`applyRateLimit(req, res, LIMITS.write)`)
 *   - Rejects synthetic/test email domains (`@example.com`, `@horse.ai`, `@*.smarter.poker`, `.invalid`, etc.)
 *   - Validates copy count (`5..1000`), street shipping address (`>= 4` chars), US ZIP (`^\d{5}(-\d{4})?$`),
 *     US state code, city, poker room name, and manager contact
 *   - Deduplicates active `(lower(contact_email), lower(room_name))` rows in place
 *   - Persists `shipping_address_json` and `table_count: tableCount > 0 ? tableCount : null`
 *
 * Admin GET / PATCH:
 *   - Gated behind verified admin session (`admin` / `superadmin` / `god` or `is_admin = true`) or `CRON_SECRET`
 *   - Lists subscriptions and updates `status`, `requested_copies`, or `notes` with UUID validation + `updated_at`.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import { reportApiError } from '../../../src/lib/apiErrorHandler.js';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const ALLOWED_ROOM_STATUSES = ['pending', 'verified', 'active', 'paused', 'cancelled'];
const ACTIVE_COPY_STATUSES = ['pending', 'verified', 'active'];
const ACTIVE_COPY_STATUS_SET = new Set(ACTIVE_COPY_STATUSES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const US_ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const ROOM_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BLOCKED_ROOM_EMAIL_RE =
    /(?:@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|horse\.ai|hydra\.bot|mailinator\.com|tempmail\.com|smarter\.poker|test\.com)|\.(?:invalid|localhost|local|test))$/i;

const BLOCKED_ROOM_EMAIL_DOMAINS = new Set([
    'example.com',
    'example.org',
    'example.net',
    'example',
    'invalid',
    'local',
    'test',
    'localhost',
    'test.com',
    'email.com',
    'horse.ai',
    'hydra.bot',
    'mailinator.com',
    'tempmail.com',
    'smarter.poker',
]);

const BLOCKED_ROOM_EMAIL_SUFFIXES = [
    '.example.com',
    '.example.org',
    '.example.net',
    '.example',
    '.invalid',
    '.local',
    '.test',
    '.localhost',
    '.test.com',
    '.horse.ai',
    '.hydra.bot',
    '.mailinator.com',
    '.tempmail.com',
    '.smarter.poker',
];

const US_STATE_CODES_SET = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC',
]);

const US_STATE_NAME_TO_CODE = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
    hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
    montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
    oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
    virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
    'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC',
};

function stripMagazineDashes(value) {
    return String(value ?? '')
        .replace(/&mdash;|&ndash;|&#8212;|&#8211;|&#x2014;|&#x2013;/gi, ' - ')
        .replace(/\s*[\u2014\u2013]\s*/g, ' - ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function isBlockedMagazineRoomEmail(email) {
    const clean = String(email || '').trim().toLowerCase().replace(/^[<("']+|[>)"',;]+$/g, '');
    const at = clean.lastIndexOf('@');
    if (at <= 0 || at === clean.length - 1) return true;
    const domain = clean.slice(at + 1).trim();
    if (!domain || BLOCKED_ROOM_EMAIL_DOMAINS.has(domain)) return true;
    return BLOCKED_ROOM_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

export function normalizeMagazineRoomEmail(email) {
    const clean = String(email || '').trim().toLowerCase().replace(/^[<("']+|[>)"',;]+$/g, '');
    if (!clean || clean.length < 3 || clean.length > 254) return null;
    if (!ROOM_EMAIL_RE.test(clean) || isBlockedMagazineRoomEmail(clean)) return null;
    return clean;
}

export function normalizeMagazineUsState(code) {
    const raw = String(code ?? '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (US_STATE_CODES_SET.has(upper)) return upper;
    return US_STATE_NAME_TO_CODE[raw.toLowerCase().replace(/\s+/g, ' ')] || null;
}

let _supabase = null;
async function getSupabase(req = null) {
    if (req?._supabase) return req._supabase;
    if (req?._supabaseClient) return req._supabaseClient;
    if (!_supabase) {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        _supabase = createClient();
    }
    return _supabase;
}

const _fallbackRoomRateMap = new Map();
async function checkRoomsRateLimit(req, res, mode = 'write') {
    if (typeof req?._rateLimitFn === 'function') {
        return req._rateLimitFn(req, res, mode);
    }
    try {
        const { applyRateLimit, LIMITS } = await import('../../../src/lib/apiRateLimit.js');
        return applyRateLimit(req, res, mode === 'write' ? LIMITS.write : LIMITS.read);
    } catch (err) {
        if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
        const ip = String(req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'local');
        const key = `rooms:${mode}:${ip}`;
        const now = Date.now();
        const max = mode === 'write' ? 20 : 60;
        const entry = _fallbackRoomRateMap.get(key);
        if (!entry || now > entry.resetAt) {
            _fallbackRoomRateMap.set(key, { count: 1, resetAt: now + 60_000 });
            return true;
        }
        entry.count += 1;
        if (entry.count > max) {
            res.status(429).json({ success: false, error: 'Too Many Requests.' });
            return false;
        }
        return true;
    }
}

function escapeIlikeExact(value) {
    return String(value || '').replace(/([\\%_])/g, '\\$1');
}

async function authorizeRoomAdmin(req, sbClient = null) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = (process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req.headers['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }

    const sb = sbClient || (await getSupabase(req));
    try {
        const authRes = await getServerUserWithFallback(req, sb);
        const user = authRes?.user ?? authRes;
        if (!user?.id) return null;
        const { data: profRows, error } = await sb
            .from('profiles')
            .select('role, is_admin')
            .eq('id', user.id)
            .limit(1);
        const profile = Array.isArray(profRows) ? profRows[0] : null;
        if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) {
            return null;
        }
        return { kind: 'admin', userId: user.id };
    } catch {
        return null;
    }
}

export function validateRoomSubscriptionPayload(body = {}) {
    const rawRoom = stripMagazineDashes(body.room_name ?? body.roomName ?? '').slice(0, 160);
    const rawContact = stripMagazineDashes(body.contact_name ?? body.contactName ?? '').slice(0, 120);
    const rawEmail = String(body.contact_email ?? body.contactEmail ?? body.email ?? '').trim().toLowerCase();
    const rawCity = stripMagazineDashes(body.city ?? '').slice(0, 100);
    const stateCode = normalizeMagazineUsState(body.state ?? '');
    const rawCopies = Number.parseInt(String(body.requested_copies ?? body.requestedCopies ?? ''), 10);
    const rawTablesInput = body.table_count ?? body.tableCount;
    const rawTables =
        rawTablesInput === undefined || rawTablesInput === null || String(rawTablesInput).trim() === ''
            ? 0
            : Number.parseInt(String(rawTablesInput), 10);
    const rawPhone = stripMagazineDashes(body.contact_phone ?? body.contactPhone ?? body.phone ?? '').slice(0, 40);
    const rawAddress = stripMagazineDashes(
        body.shipping_address_json?.street ??
            body.shippingAddress ??
            body.shipping_address ??
            body.address_line1 ??
            body.address ??
            ''
    ).slice(0, 240);
    const rawZip = stripMagazineDashes(
        body.postal_code ?? body.postalCode ?? body.shipping_address_json?.postalCode ?? body.zip ?? ''
    ).slice(0, 20);
    const rawNotes = stripMagazineDashes(body.notes ?? '').slice(0, 500);

    if (!rawRoom || rawRoom.length < 2) {
        return { ok: false, error: 'Enter A Valid Poker Room Name.' };
    }
    if (!rawContact || rawContact.length < 2) {
        return { ok: false, error: 'Enter The Poker Room Manager Or Contact Name.' };
    }

    const normalizedEmail = normalizeMagazineRoomEmail(rawEmail);
    if (
        !rawEmail ||
        BLOCKED_ROOM_EMAIL_RE.test(rawEmail) ||
        isBlockedMagazineRoomEmail(rawEmail) ||
        !normalizedEmail
    ) {
        return { ok: false, error: 'Enter A Valid Business Or Cardroom Email Address.' };
    }

    if (!rawAddress || rawAddress.length < 4) {
        return { ok: false, error: 'Enter A Valid Street Shipping Address.' };
    }
    if (!rawCity || rawCity.length < 2) {
        return { ok: false, error: 'Enter A Valid US City.' };
    }
    if (!stateCode) {
        return { ok: false, error: 'Select A Valid Two-Letter US State.' };
    }
    if (!rawZip || !US_ZIP_RE.test(rawZip)) {
        return { ok: false, error: 'Enter A Valid Five-Digit US ZIP Or ZIP+4 Postal Code.' };
    }

    if (rawPhone) {
        const phoneDigits = rawPhone.replace(/\D/g, '');
        if (!/^[0-9+().\-\s]+$/.test(rawPhone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
            return { ok: false, error: 'Enter A Valid Contact Phone Number.' };
        }
    }

    if (!Number.isInteger(rawCopies) || rawCopies < 5 || rawCopies > 1000) {
        return { ok: false, error: 'Requested Monthly Print Copies Must Be Between 5 And 1,000.' };
    }

    if (Number.isNaN(rawTables) || rawTables < 0 || rawTables > 500) {
        return { ok: false, error: 'Table Count Must Be Between 1 And 500.' };
    }
    const tableCount = Number.isFinite(rawTables) && rawTables > 0 ? Math.min(rawTables, 500) : 0;

    return {
        ok: true,
        record: {
            room_name: rawRoom,
            contact_name: rawContact,
            contact_email: normalizedEmail,
            city: rawCity,
            state: stateCode,
            postal_code: rawZip,
            shipping_address_json: {
                street: rawAddress,
                city: rawCity,
                state: stateCode,
                postalCode: rawZip,
            },
            table_count: tableCount > 0 ? tableCount : null,
            requested_copies: rawCopies,
            status: 'pending',
            ...(rawPhone ? { contact_phone: rawPhone } : {}),
            ...(rawNotes ? { notes: rawNotes } : {}),
        },
    };
}

async function findExistingActiveRoomSubscription(sb, contactEmail, roomName) {
    if (!sb || typeof sb.from !== 'function') return null;
    try {
        let query = sb.from('magazine_room_subscriptions').select('*');
        if (typeof query.ilike === 'function') {
            query = query.ilike('contact_email', escapeIlikeExact(contactEmail));
        } else if (typeof query.eq === 'function') {
            query = query.eq('contact_email', contactEmail);
        }
        if (typeof query.in === 'function') {
            // in-list: bounded 3 active room subscription status constants
            query = query.in('status', ACTIVE_COPY_STATUSES.slice(0, 3));
        }
        const { data } = typeof query.limit === 'function' ? await query.limit(20) : await query;
        const targetEmail = String(contactEmail || '').trim().toLowerCase();
        const targetRoom = String(roomName || '').trim().toLowerCase();
        return (
            (data || []).find(
                (r) =>
                    r?.id &&
                    ACTIVE_COPY_STATUS_SET.has(String(r.status || '')) &&
                    String(r.contact_email || '').trim().toLowerCase() === targetEmail &&
                    String(r.room_name || '').trim().toLowerCase() === targetRoom
            ) || null
        );
    } catch {
        return null;
    }
}

async function upsertOrInsertRoomSubscription(sb, record) {
    const existing = await findExistingActiveRoomSubscription(sb, record.contact_email, record.room_name);
    if (existing?.id) {
        const updatePayload = {
            room_name: record.room_name,
            contact_name: record.contact_name,
            contact_email: record.contact_email,
            city: record.city,
            state: record.state,
            postal_code: record.postal_code,
            shipping_address_json: record.shipping_address_json,
            table_count: record.table_count,
            requested_copies: record.requested_copies,
            ...(record.contact_phone !== undefined ? { contact_phone: record.contact_phone } : {}),
            ...(record.notes !== undefined ? { notes: record.notes } : {}),
            updated_at: new Date().toISOString(),
        };
        const updQuery = sb.from('magazine_room_subscriptions').update(updatePayload).eq('id', existing.id);
        const updRes = typeof updQuery.select === 'function' ? await updQuery.select('*').limit(1) : await updQuery;
        if (updRes?.error) throw updRes.error;
        const row = Array.isArray(updRes?.data) ? updRes.data[0] : updRes?.data;
        return { row: row || { ...existing, ...updatePayload }, deduplicated: true };
    }

    const insQuery = sb.from('magazine_room_subscriptions').insert(record);
    const insRes = typeof insQuery.select === 'function' ? await insQuery.select('*').limit(1) : await insQuery;
    if (!insRes?.error) {
        const created = Array.isArray(insRes?.data) ? insRes.data[0] : insRes?.data || record;
        return { row: created, deduplicated: false };
    }

    const code = String(insRes.error.code || '');
    const msg = String(insRes.error.message || insRes.error.details || '');
    if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
        const raced = await findExistingActiveRoomSubscription(sb, record.contact_email, record.room_name);
        if (raced?.id) {
            const updatePayload = {
                contact_name: record.contact_name,
                city: record.city,
                state: record.state,
                postal_code: record.postal_code,
                shipping_address_json: record.shipping_address_json,
                table_count: record.table_count,
                requested_copies: record.requested_copies,
                ...(record.contact_phone !== undefined ? { contact_phone: record.contact_phone } : {}),
                ...(record.notes !== undefined ? { notes: record.notes } : {}),
                updated_at: new Date().toISOString(),
            };
            const retryQuery = sb.from('magazine_room_subscriptions').update(updatePayload).eq('id', raced.id);
            const retryRes =
                typeof retryQuery.select === 'function' ? await retryQuery.select('*').limit(1) : await retryQuery;
            if (!retryRes?.error) {
                const row = Array.isArray(retryRes?.data) ? retryRes.data[0] : retryRes?.data;
                return { row: row || { ...raced, ...updatePayload }, deduplicated: true };
            }
        }
    }

    throw insRes.error;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ success: false, error: 'Method Not Allowed.' });
    }

    const sb = await getSupabase(req);

    try {
        if (req.method === 'POST') {
            if (!(await checkRoomsRateLimit(req, res, 'write'))) return;

            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const validation = validateRoomSubscriptionPayload(body);
            if (!validation.ok) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const { row: saved, deduplicated } = await upsertOrInsertRoomSubscription(sb, validation.record);

            return res.status(deduplicated ? 200 : 201).json({
                success: true,
                deduplicated,
                subscription: saved,
                message: deduplicated
                    ? 'Active Cardroom Print Bundle Request Updated With Your Latest Shipping And Copy Details.'
                    : 'Cardroom Print Bundle Request Received. Our Distribution Desk Will Confirm Your Shipment Details.',
            });
        }

        // Admin-only GET and PATCH
        if (!(await checkRoomsRateLimit(req, res, req.method === 'GET' ? 'read' : 'write'))) return;

        const auth = await authorizeRoomAdmin(req, sb);
        if (!auth) {
            return res.status(401).json({ success: false, error: 'Administrator Access Required.' });
        }

        if (req.method === 'GET') {
            const { data: rows, error } = await sb
                .from('magazine_room_subscriptions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;

            const list = Array.isArray(rows) ? rows : [];
            const totalRequestedCopies = list.reduce((sum, r) => {
                return ACTIVE_COPY_STATUS_SET.has(String(r?.status || ''))
                    ? sum + Math.max(0, Number(r?.requested_copies || 0))
                    : sum;
            }, 0);

            return res.status(200).json({
                success: true,
                subscriptions: list,
                totalRequestedCopies,
            });
        }

        // PATCH
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const targetId = String(body.id || body.subscriptionId || '').trim();
        if (!targetId || !UUID_RE.test(targetId)) {
            return res.status(400).json({ success: false, error: 'Valid Subscription ID Is Required.' });
        }

        const patch = {};
        if (body.status !== undefined) {
            const nextStatus = String(body.status || '').trim().toLowerCase();
            if (!ALLOWED_ROOM_STATUSES.includes(nextStatus)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Status. Expected Pending, Verified, Active, Paused, Or Cancelled.',
                });
            }
            patch.status = nextStatus;
        }

        const rawCopies = body.requested_copies ?? body.requestedCopies;
        if (rawCopies !== undefined) {
            const parsedCopies = Number.parseInt(String(rawCopies), 10);
            if (!Number.isInteger(parsedCopies) || parsedCopies < 5 || parsedCopies > 1000) {
                return res.status(400).json({
                    success: false,
                    error: 'Requested Copies Must Be Between 5 And 1,000.',
                });
            }
            patch.requested_copies = parsedCopies;
        }

        if (body.notes !== undefined) {
            patch.notes = stripMagazineDashes(body.notes ?? '').slice(0, 500);
        }

        if (Object.keys(patch).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Provide Status, Requested Copies, Or Notes To Update.',
            });
        }

        patch.updated_at = new Date().toISOString();

        const { data: updatedRows, error: patchErr } = await sb
            .from('magazine_room_subscriptions')
            .update(patch)
            .eq('id', targetId)
            .select('*')
            .limit(1);

        if (patchErr) throw patchErr;
        const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Room Subscription Not Found.' });
        }

        return res.status(200).json({
            success: true,
            subscription: updated,
        });
    } catch (error) {
        try {
            reportApiError(error, req);
        } catch {
            /* ignore */
        }
        return res.status(500).json({
            success: false,
            error: 'Magazine Room Subscription Operation Failed.',
        });
    }
}
