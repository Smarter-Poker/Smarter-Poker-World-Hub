/**
 * Staff Schedule Broadcast API — POST /api/commander/schedule/broadcast
 * Sends the week's schedule to all staff via SMS and/or email
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';
import twilio from 'twilio';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: { message: 'Method not allowed' } });
    }

    const { venue_id, week_start, channel = 'sms' } = req.body;

    if (!venue_id || !week_start) {
        return res.status(400).json({
            success: false,
            error: { message: 'venue_id and week_start required' }
        });
    }

    const staff = await requireStaff(req, res, venue_id, ['owner', 'manager']);
    if (!staff) return;

    try {
        // Fetch shifts for the week
        const start = new Date(week_start + 'T00:00:00');
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        const endStr = end.toISOString().split('T')[0];

        const { data: shifts, error: shiftsErr } = await supabase
            .from('commander_staff_shifts')
            .select('*')
            .eq('venue_id', venue_id)
            .gte('shift_date', week_start)
            .lt('shift_date', endStr)
            .order('shift_date')
            .order('start_time');

        if (shiftsErr) throw shiftsErr;

        if (!shifts || shifts.length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'No shifts scheduled for this week' }
            });
        }

        // Fetch all staff to get phone/email
        const { data: allStaff, error: staffErr } = await supabase
            .from('commander_staff')
            .select('id, display_name, phone, email, role')
            .eq('venue_id', venue_id)
            .eq('is_active', true);

        if (staffErr) throw staffErr;

        // Get venue name
        const venueName = staff.venue_name || 'Your Venue';

        // Group shifts by staff_id
        const shiftsByStaff = {};
        for (const shift of shifts) {
            if (!shiftsByStaff[shift.staff_id]) shiftsByStaff[shift.staff_id] = [];
            shiftsByStaff[shift.staff_id].push(shift);
        }

        const weekLabel = new Date(week_start + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'short', day: 'numeric'
        });
        const weekEndLabel = new Date(end.getTime() - 86400000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric'
        });

        const results = { sent: 0, failed: 0, skipped: 0 };

        // Send each staff member THEIR schedule
        for (const member of allStaff) {
            const myShifts = shiftsByStaff[member.id];
            if (!myShifts || myShifts.length === 0) continue; // No shifts = skip

            // Format their personal schedule
            const lines = myShifts.map(s => {
                const day = new Date(s.shift_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const startFormatted = formatTime12(s.start_time);
                const endFormatted = formatTime12(s.end_time);
                return `${day}: ${startFormatted} - ${endFormatted}`;
            });

            const message = `📋 ${venueName} Schedule (${weekLabel} - ${weekEndLabel})\n\nHi ${member.display_name || 'Team Member'},\n\nYour shifts:\n${lines.join('\n')}\n\nQuestions? Contact your manager.`;

            // Send SMS
            if ((channel === 'sms' || channel === 'both') && member.phone) {
                try {
                    const phone = normalizePhone(member.phone);
                    if (phone) {
                        await twilioClient.messages.create({
                            body: message,
                            to: phone,
                            from: TWILIO_FROM
                        });
                        results.sent++;
                    } else {
                        results.skipped++;
                    }
                } catch (smsErr) {
                    console.error(`[Broadcast] SMS failed for ${member.display_name}:`, smsErr.message);
                    results.failed++;
                }
            } else if (channel === 'sms' && !member.phone) {
                results.skipped++; // No phone
            }

            // Send Email
            if ((channel === 'email' || channel === 'both') && member.email) {
                try {
                    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker'}/api/commander/notifications/send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            venue_id,
                            type: 'custom',
                            channel: 'email',
                            recipient_email: member.email,
                            title: `Your Schedule — ${weekLabel} to ${weekEndLabel}`,
                            message,
                            skip_auth: true,
                            internal_key: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20)
                        })
                    });
                    results.sent++;
                } catch (emailErr) {
                    console.error(`[Broadcast] Email failed for ${member.display_name}:`, emailErr.message);
                    results.failed++;
                }
            } else if (channel === 'email' && !member.email) {
                results.skipped++;
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                ...results,
                total_staff: allStaff.length,
                total_shifts: shifts.length
            }
        });
    } catch (err) {
        console.error('[Schedule Broadcast] Error:', err);
        return res.status(500).json({
            success: false,
            error: { message: 'Failed to broadcast schedule' }
        });
    }
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
    if (digits.length > 10) return '+' + digits;
    return null;
}
