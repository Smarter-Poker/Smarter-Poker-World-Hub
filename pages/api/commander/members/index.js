/**
 * Commander Members API — List & Create
 * GET: List members for a venue (with search, filter, pagination)
 * POST: Create a new member (auto-generates member_number + qr_code)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    // Auth guard: require staff auth for write operations
    const _authResult = await guardWriteStaff(req, res);
    if (!_authResult) return;

    if (req.method === 'GET') {
        return handleList(req, res);
    } else if (req.method === 'POST') {
        return handleCreate(req, res);
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleList(req, res) {
    const { venue_id, search, status, tier, page = 1, limit = 50 } = req.query;

    if (!venue_id) {
        return res.status(400).json({ success: false, error: 'venue_id is required' });
    }

    let query = supabase
        .from('commander_members')
        .select('*', { count: 'exact' })
        .eq('venue_id', venue_id)
        .order('created_at', { ascending: false })
            .limit(100);

    if (status) {
        query = query.eq('membership_status', status);
    }

    if (tier) {
        query = query.eq('membership_tier', tier);
    }

    if (search) {
        // BUG #270 FIX: Sanitize to prevent PostgREST filter injection
        const s = search.trim().replace(/[,().]/g, ' ').trim();
        if (s) {
            query = query.or(
                `first_name.ilike.%${s}%,last_name.ilike.%${s}%,member_number.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`
            );
        }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: members, error, count } = await query;

    if (error) {
        console.error('Members list error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
        success: true,
        data: {
            members: members || [],
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit),
        },
    });
}

async function handleCreate(req, res) {
    const {
        venue_id,
        first_name,
        last_name,
        email,
        phone,
        date_of_birth,
        id_type,
        id_number,
        id_state,
        id_expiry,
        photo_url,
        address,
        membership_tier = 'daily',
        notes,
        created_by,
    } = req.body;

    if (!venue_id || !first_name || !last_name) {
        return res.status(400).json({
            success: false,
            error: 'venue_id, first_name, and last_name are required',
        });
    }

    try {
        // ═══ DUPLICATE DETECTION ═══
        // Check by name (case-insensitive) in same venue
        let existingQuery = supabase
            .from('commander_members')
            .select('*')
            .eq('venue_id', venue_id)
            .ilike('first_name', first_name.trim())
            .ilike('last_name', last_name.trim())
                .limit(100);

        const { data: nameMatches } = await existingQuery;

        if (nameMatches && nameMatches.length > 0) {
            return res.status(200).json({
                success: true,
                data: { member: nameMatches[0] },
                duplicate: true,
                message: `Member "${first_name} ${last_name}" already exists`,
            });
        }

        // Check by email (case-insensitive) if provided
        if (email && email.trim()) {
            const { data: emailMatches } = await supabase
                .from('commander_members')
                .select('*')
                .eq('venue_id', venue_id)
                .ilike('email', email.trim())
                    .limit(100);

            if (emailMatches && emailMatches.length > 0) {
                return res.status(200).json({
                    success: true,
                    data: { member: emailMatches[0] },
                    duplicate: true,
                    message: `Member with email "${email}" already exists`,
                });
            }
        }

        // Generate unique member number: PREFIX-NNNNN
        const { data: venue } = await supabase
            .from('poker_venues')
            .select('name')
            .eq('id', venue_id)
            .single();

        const prefix = (venue?.name || 'CLUB')
            .replace(/[^A-Za-z]/g, '')
            .substring(0, 4)
            .toUpperCase();

        // Get current member count for sequential numbering
        const { count } = await supabase
            .from('commander_members')
            .select('id', { count: 'exact', head: true })
            .eq('venue_id', venue_id);

        const memberNumber = `${prefix}-${String((count || 0) + 1).padStart(5, '0')}`;

        // Generate unique QR code
        const qrCode = `CMD-${venue_id}-${crypto.randomUUID().split('-')[0]}`;

        const { data: member, error } = await supabase
            .from('commander_members')
            .insert({
                venue_id,
                member_number: memberNumber,
                qr_code: qrCode,
                first_name: first_name.trim(),
                last_name: last_name.trim(),
                email: email?.trim() || null,
                phone: phone?.trim() || null,
                date_of_birth: date_of_birth || null,
                id_type: id_type || 'drivers_license',
                id_number: id_number?.trim() || null,
                id_state: id_state || null,
                id_expiry: id_expiry || null,
                photo_url: photo_url || null,
                address: address || {},
                membership_tier,
                membership_status: 'active',
                notes: notes || null,
                created_by: created_by || null,
            })
            .select()
            .single();

        if (error) {
            console.error('Member create error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(201).json({ success: true, data: { member } });
    } catch (err) {
        console.error('Member create exception:', err);
        return res.status(500).json({ success: false, error: 'Failed to create member' });
    }
}
