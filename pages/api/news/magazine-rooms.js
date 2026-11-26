/**
 * Smarter.Poker Magazine B2B Poker Room Print Bundle Subscriptions API (/api/news/magazine-rooms)
 *
 * Public POST:
 *   - Rate-limited (`applyRateLimit(req, res, LIMITS.write)`)
 *   - Rejects synthetic/test email domains (`@example.com`, `@horse.ai`, `.invalid`, etc.)
 *   - Validates copy count (`5..1000`), US state code, city, poker room name, and manager contact
 *   - Inserts into `public.magazine_room_subscriptions` (`status = 'pending'`)
 *
 * Admin GET / PATCH:
 *   - Gated behind verified admin session (`admin` / `superadmin` / `god` or `is_admin = true`) or `CRON_SECRET`
 *   - Lists subscriptions and updates `status` (`'pending' | 'verified' | 'active' | 'paused' | 'cancelled'`)
 *     or `requested_copies` (`5..1000`).
 */
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { isBlockedCaptureEmail } from './subscribe.js';
import { normalizeDeliverableEmail } from '../../../src/lib/promoCampaigns/dispatch.mjs';
import { normalizeUsStateCode } from '../../../src/lib/newsletter/weeklyWireEngine.mjs';
import { stripMagazineDashes } from '../../../src/lib/magazine/magazineSchema.mjs';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const ALLOWED_ROOM_STATUSES = ['pending', 'verified', 'active', 'paused', 'cancelled'];
const ACTIVE_COPY_STATUSES = new Set(['pending', 'verified', 'active']);
const BLOCKED_ROOM_EMAIL_RE =
    /(?:@example\.(?:com|org|net)|@horse\.ai|@hydra\.bot|@test\.com|\.(?:invalid|localhost|local|test))$/i;

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

async function authorizeRoomAdmin(req) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = (process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req.headers['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }

    const sb = getSupabase();
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
    const stateCode = normalizeUsStateCode(body.state ?? '');
    const rawCopies = Number.parseInt(String(body.requested_copies ?? body.requestedCopies ?? ''), 10);
    const rawTables = Number.parseInt(String(body.table_count ?? body.tableCount ?? '0'), 10);
    const rawPhone = stripMagazineDashes(body.contact_phone ?? body.contactPhone ?? body.phone ?? '').slice(0, 40);
    const rawAddress = stripMagazineDashes(
        body.shipping_address ?? body.shippingAddress ?? body.address_line1 ?? body.address ?? ''
    ).slice(0, 240);
    const rawZip = stripMagazineDashes(body.postal_code ?? body.postalCode ?? body.zip ?? '').slice(0, 20);
    const rawNotes = stripMagazineDashes(body.notes ?? '').slice(0, 500);

    if (!rawRoom || rawRoom.length < 2) {
        return { ok: false, error: 'Enter a valid poker room name.' };
    }
    if (!rawContact || rawContact.length < 2) {
        return { ok: false, error: 'Enter the poker room manager or contact name.' };
    }
    if (
        !rawEmail ||
        BLOCKED_ROOM_EMAIL_RE.test(rawEmail) ||
        isBlockedCaptureEmail(rawEmail) ||
        !normalizeDeliverableEmail(rawEmail)
    ) {
        return { ok: false, error: 'Enter a valid business or cardroom email address.' };
    }
    if (!rawCity || rawCity.length < 2) {
        return { ok: false, error: 'Enter a valid US city.' };
    }
    if (!stateCode) {
        return { ok: false, error: 'Select a valid two-letter US state.' };
    }
    if (!Number.isInteger(rawCopies) || rawCopies < 5 || rawCopies > 1000) {
        return { ok: false, error: 'Requested monthly print copies must be between 5 and 1,000.' };
    }

    const tableCount = Number.isFinite(rawTables) ? Math.min(Math.max(rawTables, 0), 500) : 0;

    return {
        ok: true,
        record: {
            room_name: rawRoom,
            contact_name: rawContact,
            contact_email: rawEmail,
            city: rawCity,
            state: stateCode,
            table_count: tableCount,
            requested_copies: rawCopies,
            status: 'pending',
            ...(rawPhone ? { contact_phone: rawPhone } : {}),
            ...(rawAddress ? { shipping_address: rawAddress } : {}),
            ...(rawZip ? { postal_code: rawZip } : {}),
            ...(rawNotes ? { notes: rawNotes } : {}),
        },
    };
}

async function insertRoomSubscriptionResilient(sb, record) {
    let payload = { ...record };
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const query = sb.from('magazine_room_subscriptions').insert(payload);
        const res = typeof query.select === 'function' ? await query.select('*').limit(1) : await query;
        if (!res?.error) {
            return Array.isArray(res?.data) ? res.data[0] : res?.data || payload;
        }
        const msg = String(res.error.message || res.error.details || '');
        const missingColMatch =
            msg.match(/Could not find the '([^']+)' column/i) ||
            msg.match(/column "([^"]+)" of relation "magazine_room_subscriptions" does not exist/i) ||
            msg.match(/column "([^"]+)" does not exist/i);
        if (missingColMatch?.[1] && missingColMatch[1] in payload) {
            delete payload[missingColMatch[1]];
            continue;
        }
        throw res.error;
    }
    return payload;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const sb = getSupabase();

    try {
        if (req.method === 'POST') {
            if (!applyRateLimit(req, res, LIMITS.write)) return;

            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const validation = validateRoomSubscriptionPayload(body);
            if (!validation.ok) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const created = await insertRoomSubscriptionResilient(sb, validation.record);

            return res.status(201).json({
                success: true,
                subscription: created,
                message: 'Cardroom print bundle request received. Our distribution desk will confirm your shipment details.',
            });
        }

        // Admin-only GET and PATCH
        if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

        const auth = await authorizeRoomAdmin(req);
        if (!auth) {
            return res.status(401).json({ success: false, error: 'Administrator access required' });
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
                return ACTIVE_COPY_STATUSES.has(String(r?.status || ''))
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
        if (!targetId) {
            return res.status(400).json({ success: false, error: 'Subscription id is required' });
        }

        const patch = {};
        if (body.status !== undefined) {
            const nextStatus = String(body.status || '').trim().toLowerCase();
            if (!ALLOWED_ROOM_STATUSES.includes(nextStatus)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid status. Expected pending, verified, active, paused, or cancelled.',
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
                    error: 'Requested copies must be between 5 and 1,000.',
                });
            }
            patch.requested_copies = parsedCopies;
        }

        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ success: false, error: 'Provide status or requested_copies to update' });
        }

        const { data: updatedRows, error: patchErr } = await sb
            .from('magazine_room_subscriptions')
            .update(patch)
            .eq('id', targetId)
            .select('*')
            .limit(1);

        if (patchErr) throw patchErr;
        const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Room subscription not found' });
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
            error: error?.message || 'Magazine room subscription operation failed',
        });
    }
}
