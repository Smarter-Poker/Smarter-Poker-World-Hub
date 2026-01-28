/**
 * Venue Onboarding Request API
 * POST /api/captain/onboarding/request
 * Captures lead information for new venue signups
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const {
    venueName,
    contactName,
    email,
    phone,
    city,
    state,
    tableCount,
    currentSystem,
    notes
  } = req.body;

  // Validate required fields
  if (!venueName || !contactName || !email || !phone || !city || !state) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'Required fields missing' }
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_EMAIL', message: 'Invalid email format' }
    });
  }

  try {
    // Store lead in database
    const { data, error } = await supabase
      .from('captain_onboarding_leads')
      .insert({
        venue_name: venueName,
        contact_name: contactName,
        email,
        phone,
        city,
        state,
        table_count: tableCount || null,
        current_system: currentSystem || null,
        notes: notes || null,
        status: 'new',
        source: 'website'
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, just log and return success
      if (error.code === '42P01') {
        console.log('Onboarding leads table not created yet. Lead data:', {
          venueName, contactName, email, city, state
        });
        return res.status(200).json({
          success: true,
          data: { lead_id: 'pending-table-creation' }
        });
      }
      console.error('Database error:', error);
      throw error;
    }

    // TODO: Send notification email to sales team
    // TODO: Send confirmation email to venue contact

    // Send email notifications via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        // Send confirmation email to venue contact
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'Smarter Captain <captain@smarter.poker>',
            to: email,
            subject: 'Welcome to Smarter Captain - We Received Your Request',
            html: `
              <h2>Thank you for your interest in Smarter Captain!</h2>
              <p>Hi ${contactName},</p>
              <p>We've received your request for <strong>${venueName}</strong> in ${city}, ${state}.</p>
              <p>A member of our team will reach out within 24 hours to schedule a demo and discuss how Smarter Captain can help streamline your poker room operations.</p>
              <p>In the meantime, feel free to reply to this email with any questions.</p>
              <br/>
              <p>Best regards,</p>
              <p>The Smarter Captain Team</p>
            `
          })
        });

        // Send notification to sales team
        const salesEmail = process.env.SALES_EMAIL || 'sales@smarter.poker';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'Smarter Captain <captain@smarter.poker>',
            to: salesEmail,
            subject: `New Captain Lead: ${venueName} - ${city}, ${state}`,
            html: `
              <h2>New Venue Onboarding Request</h2>
              <table style="border-collapse: collapse;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Venue</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${venueName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Contact</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${contactName}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${email}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${phone}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Location</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${city}, ${state}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tables</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${tableCount || 'Not specified'}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Current System</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${currentSystem || 'Not specified'}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Notes</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${notes || 'None'}</td></tr>
              </table>
              <br/>
              <p><a href="https://smarter.poker/admin/leads/${data.id}">View Lead in Admin</a></p>
            `
          })
        });
      } catch (emailError) {
        console.error('Failed to send emails:', emailError);
        // Don't fail the request if email fails
      }
    }

    return res.status(200).json({
      success: true,
      data: { lead_id: data.id }
    });

  } catch (error) {
    console.error('Onboarding request error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to submit request' }
    });
  }
}
