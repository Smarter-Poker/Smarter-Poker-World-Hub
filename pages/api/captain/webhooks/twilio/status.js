/**
 * Twilio SMS Status Webhook
 * POST /api/captain/webhooks/twilio/status - Receive SMS delivery status updates
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Twilio sends form-encoded data
    const {
      MessageSid,
      MessageStatus,
      To,
      From,
      ErrorCode,
      ErrorMessage
    } = req.body;

    if (!MessageSid || !MessageStatus) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Map Twilio status to our status
    const statusMap = {
      queued: 'pending',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'failed',
      failed: 'failed'
    };

    const mappedStatus = statusMap[MessageStatus] || MessageStatus;

    // Update notification by message_sid in metadata
    const { data: notifications, error: findError } = await supabase
      .from('captain_notifications')
      .select('id')
      .eq('channel', 'sms')
      .contains('metadata', { message_sid: MessageSid });

    if (findError) {
      console.error('Find notification error:', findError);
    }

    if (notifications && notifications.length > 0) {
      const updates = {
        status: mappedStatus,
        metadata: {
          message_sid: MessageSid,
          twilio_status: MessageStatus,
          error_code: ErrorCode,
          error_message: ErrorMessage
        }
      };

      if (mappedStatus === 'delivered') {
        updates.delivered_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('captain_notifications')
        .update(updates)
        .eq('id', notifications[0].id);

      if (updateError) {
        console.error('Update notification error:', updateError);
      }
    }

    // Log the status update
    console.log(`Twilio status: ${MessageSid} -> ${MessageStatus}`);

    // Always return 200 to acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Twilio webhook error:', error);
    // Still return 200 to prevent Twilio from retrying
    return res.status(200).json({ received: true, error: error.message });
  }
}

// Disable body parsing - Twilio sends form data
export const config = {
  api: {
    bodyParser: true
  }
};
