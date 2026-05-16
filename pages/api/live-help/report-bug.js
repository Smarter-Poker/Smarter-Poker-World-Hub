/* ═══════════════════════════════════════════════════════════════════════════
   API: Report a Bug — Direct to admin@smarter.poker
   
   Receives bug reports from the Geeves messenger widget and emails them
   directly to admin@smarter.poker. Optional auth — logged-in users get
   profile attribution, anonymous users can still report.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ─── HTML escape — prevents content injection in admin email ─────────────────
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Rate limit: prevent spam
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { subject, description, priority = 'medium', currentPage, userAgent } = req.body;

        if (!subject?.trim() || !description?.trim()) {
            return res.status(400).json({ error: 'Subject and description are required' });
        }

        // ── Optional auth — attribute to user if logged in ──
        let userId = null;
        let userName = 'Anonymous User';
        let userEmail = 'unknown';
        const authHeader = req.headers.authorization;

        if (authHeader?.startsWith('Bearer ')) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const { data: authData } = await getSupabase().auth.getUser(token);
                const user = authData?.user;
                if (user) {
                    userId = user.id;
                    userEmail = user.email || 'unknown';
                    // Get profile
                    const { data: profile } = await getSupabase()
                        .from('profiles')
                        .select('username')
                        .eq('id', user.id)
                        .maybeSingle();
                    userName = profile?.username || user.email || 'Unknown User';
                }
            } catch { /* proceed as anonymous */ }
        }

        // ── Store in database (atomic RPC + real-time DM injection) ──
        let ticketId = null;
        try {
            const { data: result, error: rpcError } = await getSupabase().rpc('fn_submit_bug_report_to_admin', {
                p_sender_id: userId,
                p_subject: subject.trim(),
                p_description: description.trim(),
                p_priority: priority,
                p_current_page: currentPage || 'unknown',
                p_user_agent: userAgent || 'unknown'
            });

            if (rpcError) throw rpcError;
            if (result?.success) {
                ticketId = result.ticket_id;
                console.debug(`[ReportBug] Atomic bug report successful: Ticket ${ticketId}, MSG: ${result.message_id}`);
            } else {
                console.warn('[ReportBug] Atomic bug report failed internally:', result?.error);
            }
        } catch (dbErr) {
            console.warn('[ReportBug] DB insert failed (non-fatal):', dbErr.message);
        }

        // ── Send email to admin@smarter.poker via Resend ──
        try {
            const { Resend } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);

            const priorityColors = {
                low: { bg: '#00ff88', text: 'black' },
                medium: { bg: '#ffa500', text: 'white' },
                high: { bg: '#ff4444', text: 'white' },
            };
            const pColor = priorityColors[priority] || priorityColors.medium;
            const ticketRef = ticketId ? `BUG-${ticketId.substring(0, 8).toUpperCase()}` : `BUG-${Date.now().toString(36).toUpperCase()}`;

            await resend.emails.send({
                from: `Bug Reports <${process.env.RESEND_FROM_EMAIL || 'alerts@smarter.poker'}>`,
                to: ['support@smarter.poker'],
                replyTo: userEmail !== 'unknown' ? userEmail : undefined,
                subject: `[${priority.toUpperCase()}] Bug Report: ${subject.trim().substring(0, 80)}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: 'Inter', Arial, sans-serif; background: #0a0e1a; color: #ffffff; padding: 20px; margin: 0; }
                            .container { max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, rgba(0, 20, 45, 0.98), rgba(0, 10, 30, 0.99)); border: 1px solid rgba(255, 80, 80, 0.3); border-radius: 12px; padding: 30px; }
                            .header { border-bottom: 2px solid #ff4444; padding-bottom: 20px; margin-bottom: 20px; }
                            .header h1 { color: #ff6b6b; margin: 0; font-size: 22px; }
                            .priority { display: inline-block; padding: 4px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
                            .field { margin-bottom: 16px; }
                            .label { color: rgba(255, 255, 255, 0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
                            .value { color: #ffffff; font-size: 14px; line-height: 1.6; }
                            .description-box { background: rgba(255, 80, 80, 0.08); border: 1px solid rgba(255, 80, 80, 0.2); border-radius: 8px; padding: 16px; margin-top: 16px; }
                            .meta { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 12px; color: rgba(255, 255, 255, 0.4); }
                            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255, 80, 80, 0.15); font-size: 11px; color: rgba(255, 255, 255, 0.4); }
                            code { background: rgba(0, 212, 255, 0.1); padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #00d4ff; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>Bug Report</h1>
                                <span class="priority" style="background: ${pColor.bg}; color: ${pColor.text};">${priority}</span>
                                <span style="float: right; font-size: 12px; color: rgba(255,255,255,0.4);">${ticketRef}</span>
                            </div>
                            
                            <div class="field">
                                <div class="label">Subject</div>
                                <div class="value"><strong>${escapeHtml(subject.trim())}</strong></div>
                            </div>
                            
                            <div class="field">
                                <div class="label">Reported By</div>
                                <div class="value">${escapeHtml(userName)}${userEmail !== 'unknown' ? ` (<a href="mailto:${escapeHtml(userEmail)}" style="color: #00d4ff;">${escapeHtml(userEmail)}</a>)` : ''}</div>
                            </div>

                            ${userId ? `
                            <div class="field">
                                <div class="label">User ID</div>
                                <div class="value"><code>${escapeHtml(userId)}</code></div>
                            </div>
                            ` : ''}
                            
                            <div class="description-box">
                                <div class="label">Bug Description</div>
                                <div class="value">${escapeHtml(description.trim()).replace(/\n/g, '<br>')}</div>
                            </div>
                            
                            <div class="meta">
                                <div><strong>Page:</strong> ${escapeHtml(currentPage || 'N/A')}</div>
                                <div style="margin-top: 4px;"><strong>Browser:</strong> ${escapeHtml((userAgent || 'N/A').substring(0, 120))}</div>
                                <div style="margin-top: 4px;"><strong>Reported At:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST</div>
                            </div>
                            
                            <div class="footer">
                                <p>This bug report was submitted via the Geeves messenger widget on Smarter.Poker</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
            });

            console.debug(`[ReportBug] Bug report sent to admin@smarter.poker: ${ticketRef}`);
        } catch (emailErr) {
            console.warn('[ReportBug] Email send failed:', emailErr.message);
            // Still return success if DB insert worked
        }

        return res.status(200).json({
            success: true,
            ticketId: ticketId,
            message: 'Bug report submitted successfully',
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[ReportBug] Error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
