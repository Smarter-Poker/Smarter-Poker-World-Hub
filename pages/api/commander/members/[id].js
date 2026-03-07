/**
 * Commander Member Detail API — Get, Update, Delete
 * GET: Fetch single member by ID
 * PUT: Update member fields
 * DELETE: Deactivate member (soft delete)
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
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

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ success: false, error: 'Member ID is required' });
    }

    if (req.method === 'GET') {
        return handleGet(req, res, id);
    } else if (req.method === 'PUT') {
        return handleUpdate(req, res, id);
    } else if (req.method === 'DELETE') {
        return handleDelete(req, res, id);
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleGet(req, res, id) {
    const { data: member, error } = await supabase
        .from('commander_members')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !member) {
        return res.status(404).json({ success: false, error: 'Member not found' });
    }

    return res.status(200).json({ success: true, data: { member } });
}

async function handleUpdate(req, res, id) {
    const allowedFields = [
        'first_name', 'last_name', 'email', 'phone', 'date_of_birth',
        'id_type', 'id_number', 'id_state', 'id_expiry',
        'photo_url', 'address', 'membership_tier', 'membership_status',
        'membership_expires', 'notes', 'time_balance_minutes',
        'comp_balance', 'comp_lifetime_earned', 'comp_lifetime_redeemed',
        'last_edited_by', 'last_edited_by_staff_id', 'last_edited_at',
    ];

    const updates = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: member, error } = await supabase
        .from('commander_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Member update error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data: { member } });
}

async function handleDelete(req, res, id) {
    // Soft delete: set status to 'suspended'
    const { data: member, error } = await supabase
        .from('commander_members')
        .update({
            membership_status: 'suspended',
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Member delete error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data: { member } });
}
