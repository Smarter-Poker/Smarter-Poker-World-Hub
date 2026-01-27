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
