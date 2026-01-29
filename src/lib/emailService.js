/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL SERVICE — Resend Integration for Support Tickets
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send support ticket notification email
 */
export async function sendTicketNotification({
    ticketId,
    userId,
    userEmail,
    userName,
    subject,
    description,
    priority,
    conversationId
}) {
    try {
        const { data, error } = await resend.emails.send({
            from: 'Live Help <support@smarter.poker>',
            to: ['support@smarter.poker'], // Your support team email
            replyTo: userEmail,
            subject: `[${priority.toUpperCase()}] Support Ticket #${ticketId.slice(0, 8)}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: 'Inter', Arial, sans-serif; background: #0a0e1a; color: #ffffff; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, rgba(0, 20, 45, 0.98), rgba(0, 10, 30, 0.99)); border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 12px; padding: 30px; }
                        .header { border-bottom: 2px solid #00d4ff; padding-bottom: 20px; margin-bottom: 20px; }
                        .header h1 { color: #00d4ff; margin: 0; font-size: 24px; }
                        .priority { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
                        .priority.high { background: #ff4444; color: white; }
                        .priority.medium { background: #ffa500; color: white; }
                        .priority.low { background: #00ff88; color: black; }
                        .field { margin-bottom: 15px; }
                        .label { color: rgba(255, 255, 255, 0.6); font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
                        .value { color: #ffffff; font-size: 14px; }
                        .description { background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.2); border-radius: 8px; padding: 15px; margin-top: 20px; }
                        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(0, 212, 255, 0.2); font-size: 12px; color: rgba(255, 255, 255, 0.6); }
                        a { color: #00d4ff; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎫 New Support Ticket</h1>
                            <span class="priority ${priority}">${priority}</span>
                        </div>
                        
                        <div class="field">
                            <div class="label">Ticket ID</div>
                            <div class="value"><code>${ticketId}</code></div>
                        </div>
                        
                        <div class="field">
                            <div class="label">User</div>
                            <div class="value">${userName} (${userEmail})</div>
                        </div>
                        
                        <div class="field">
                            <div class="label">User ID</div>
                            <div class="value"><code>${userId}</code></div>
                        </div>
                        
                        <div class="field">
                            <div class="label">Subject</div>
                            <div class="value"><strong>${subject}</strong></div>
                        </div>
                        
                        <div class="description">
                            <div class="label">Description</div>
                            <div class="value">${description.replace(/\n/g, '<br>')}</div>
                        </div>
                        
                        <div class="footer">
                            <p>
                                <a href="https://smarter.poker/admin/support-tickets/${ticketId}">View Ticket in Admin Panel</a>
                                ${conversationId ? ` | <a href="https://smarter.poker/admin/live-help/${conversationId}">View Conversation</a>` : ''}
                            </p>
                            <p>This ticket was created via the Live Help system at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        if (error) {
            console.error('[EmailService] Failed to send ticket notification:', error);
            throw error;
        }

        console.log('[EmailService] Ticket notification sent:', data);
        return data;

    } catch (error) {
        console.error('[EmailService] Error sending email:', error);
        throw error;
    }
}

/**
 * Send ticket status update email to user
 */
export async function sendTicketStatusUpdate({
    userEmail,
    userName,
    ticketId,
    subject,
    status,
    responseMessage
}) {
    try {
        const { data, error } = await resend.emails.send({
            from: 'Live Help <support@smarter.poker>',
            to: [userEmail],
            subject: `Support Ticket Update: ${subject}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: 'Inter', Arial, sans-serif; background: #0a0e1a; color: #ffffff; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, rgba(0, 20, 45, 0.98), rgba(0, 10, 30, 0.99)); border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 12px; padding: 30px; }
                        .header { border-bottom: 2px solid #00d4ff; padding-bottom: 20px; margin-bottom: 20px; }
                        .header h1 { color: #00d4ff; margin: 0; font-size: 24px; }
                        .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; background: #00ff88; color: black; }
                        .message { background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.2); border-radius: 8px; padding: 15px; margin-top: 20px; }
                        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(0, 212, 255, 0.2); font-size: 12px; color: rgba(255, 255, 255, 0.6); }
                        a { color: #00d4ff; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>📬 Support Ticket Update</h1>
                            <span class="status">${status}</span>
                        </div>
                        
                        <p>Hi ${userName},</p>
                        <p>Your support ticket has been updated:</p>
                        
                        <p><strong>Subject:</strong> ${subject}</p>
                        <p><strong>Ticket ID:</strong> <code>${ticketId.slice(0, 8)}</code></p>
                        
                        ${responseMessage ? `
                            <div class="message">
                                <p><strong>Response from Support Team:</strong></p>
                                <p>${responseMessage.replace(/\n/g, '<br>')}</p>
                            </div>
                        ` : ''}
                        
                        <div class="footer">
                            <p><a href="https://smarter.poker/hub/help">View Your Tickets</a></p>
                            <p>Thank you for using Smarter.Poker Live Help!</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        if (error) {
            console.error('[EmailService] Failed to send status update:', error);
            throw error;
        }

        console.log('[EmailService] Status update sent:', data);
        return data;

    } catch (error) {
        console.error('[EmailService] Error sending email:', error);
        throw error;
    }
}
