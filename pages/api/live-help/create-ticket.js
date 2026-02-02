/* ═══════════════════════════════════════════════════════════════════════════
   API: Create Live Help Ticket
   Escalates conversation to support ticket
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';
import { sendTicketNotification } from '../../../src/lib/emailService';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { conversationId, subject, description, priority = 'medium' } = req.body;

        if (!subject?.trim() || !description?.trim()) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify conversation belongs to user (if provided)
        if (conversationId) {
            const { data: conversation } = await supabase
                .from('live_help_conversations')
                .select('id')
                .eq('id', conversationId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (!conversation) {
                return res.status(404).json({ error: 'Conversation not found' });
            }

            // Update conversation status to escalated
            await supabase
                .from('live_help_conversations')
                .update({ status: 'escalated' })
                .eq('id', conversationId);
        }

        // Create ticket
        const { data: ticket, error: ticketError } = await supabase
            .from('live_help_tickets')
            .insert({
                user_id: user.id,
                conversation_id: conversationId || null,
                subject: subject.trim(),
                description: description.trim(),
                priority: priority,
                status: 'open'
            })
            .select()
            .single();

        if (ticketError) {
            console.error('Failed to create ticket:', ticketError);
            return res.status(500).json({ error: 'Failed to create ticket' });
        }

        // Get user profile for email
        const { data: profile } = await supabase
            .from('profiles')
            .select('username, email')
            .eq('id', user.id)
            .single();

        // Send email notification via Resend
        try {
            await sendTicketNotification({
                ticketId: ticket.id,
                userId: user.id,
                userEmail: profile?.email || user.email,
                userName: profile?.username || 'Unknown User',
                subject: subject.trim(),
                description: description.trim(),
                priority: priority,
                conversationId: conversationId
            });
            console.log('[LiveHelp] Ticket notification email sent successfully');
        } catch (emailError) {
            console.error('[LiveHelp] Failed to send ticket email:', emailError);
            // Don't fail the request if email fails
        }

        // Generate ticket number (e.g., HELP-12345)
        const ticketNumber = `HELP-${ticket.id.substring(0, 8).toUpperCase()}`;

        return res.status(200).json({
            ticketId: ticket.id,
            ticketNumber,
            status: ticket.status,
            createdAt: ticket.created_at
        });

    } catch (error) {
        console.error('Create ticket error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}


