/**
 * Time Clock API — Staff Clock In/Out
 * POST: Clock in or out via QR code scan
 * GET: List today's time clock entries for a venue
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleGet(req, res) {
    try {
        const { venue_id, date } = req.query;
        if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });

        // Default to today
        const targetDate = date ? new Date(date) : new Date();
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
            .from('commander_time_clock')
            .select('*')
            .eq('venue_id', venue_id)
            .gte('clock_in', start.toISOString())
            .lte('clock_in', end.toISOString())
            .order('clock_in', { ascending: false });

        if (error) throw error;

        // Enrich with staff names
        const staffIds = [...new Set((data || []).map(e => e.staff_id))];
        let staffMap = {};
        if (staffIds.length > 0) {
            const { data: staffList } = await supabase
                .from('commander_staff')
                .select('id, display_name, role, qr_code')
                .in('id', staffIds);
            if (staffList) {
                staffMap = Object.fromEntries(staffList.map(s => [s.id, s]));
            }
        }

        const entries = (data || []).map(e => ({
            ...e,
            staff_name: staffMap[e.staff_id]?.display_name || 'Unknown',
            staff_role: staffMap[e.staff_id]?.role || 'unknown',
        }));

        // Summary
        const onShift = entries.filter(e => !e.clock_out);
        const totalHours = entries
            .filter(e => e.hours_worked)
            .reduce((sum, e) => sum + parseFloat(e.hours_worked || 0), 0);

        return res.status(200).json({
            success: true,
            data: {
                entries,
                summary: {
                    total_entries: entries.length,
                    on_shift: onShift.length,
                    total_hours: Math.round(totalHours * 100) / 100,
                }
            }
        });
    } catch (err) {
        console.error('Time clock GET error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function handlePost(req, res) {
    try {
        const { venue_id, qr_code, action } = req.body;
        if (!venue_id || !qr_code) {
            return res.status(400).json({ success: false, error: 'venue_id and qr_code required' });
        }

        // Look up staff member by QR code
        const { data: staffList } = await supabase
            .from('commander_staff')
            .select('id, display_name, role, venue_id, is_active')
            .eq('qr_code', qr_code)
            .eq('venue_id', venue_id)
            .eq('is_active', true)
            .limit(1);

        const staff = staffList?.[0];
        if (!staff) {
            // Also try looking up via commander_members QR code
            const { data: memberList } = await supabase
                .from('commander_members')
                .select('id, qr_code')
                .eq('qr_code', qr_code)
                .eq('venue_id', venue_id)
                .limit(1);

            if (memberList?.[0]) {
                // Find staff linked to this member
                const { data: linkedStaff } = await supabase
                    .from('commander_staff')
                    .select('id, display_name, role, venue_id, is_active')
                    .eq('member_id', memberList[0].id)
                    .eq('is_active', true)
                    .limit(1);

                if (!linkedStaff?.[0]) {
                    return res.status(404).json({ success: false, error: 'No active staff member found for this QR code' });
                }
                // Use the linked staff
                Object.assign(staff || {}, linkedStaff[0]);
            } else {
                return res.status(404).json({ success: false, error: 'Invalid QR code or staff not found' });
            }
        }

        const staffId = staff?.id || staffList?.[0]?.id;
        const staffName = staff?.display_name || staffList?.[0]?.display_name || 'Unknown';

        // Check for open shift (clocked in but not out)
        const { data: openShift } = await supabase
            .from('commander_time_clock')
            .select('id, clock_in')
            .eq('staff_id', staffId)
            .eq('venue_id', venue_id)
            .is('clock_out', null)
            .order('clock_in', { ascending: false })
            .limit(1);

        if (openShift?.[0]) {
            // Clock OUT — close the open shift
            const clockIn = new Date(openShift[0].clock_in);
            const clockOut = new Date();
            const hoursWorked = Math.round(((clockOut - clockIn) / 3600000) * 100) / 100;

            const { data: updated, error } = await supabase
                .from('commander_time_clock')
                .update({ clock_out: clockOut.toISOString(), hours_worked: hoursWorked })
                .eq('id', openShift[0].id)
                .select()
                .single();

            if (error) throw error;

            return res.status(200).json({
                success: true,
                data: {
                    action: 'clock_out',
                    staff_name: staffName,
                    staff_role: staff?.role,
                    clock_in: openShift[0].clock_in,
                    clock_out: clockOut.toISOString(),
                    hours_worked: hoursWorked,
                    entry: updated,
                }
            });
        } else {
            // Clock IN — create new entry
            const { data: entry, error } = await supabase
                .from('commander_time_clock')
                .insert({
                    venue_id,
                    staff_id: staffId,
                    clock_in: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({
                success: true,
                data: {
                    action: 'clock_in',
                    staff_name: staffName,
                    staff_role: staff?.role,
                    clock_in: entry.clock_in,
                    entry,
                }
            });
        }
    } catch (err) {
        console.error('Time clock POST error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
