/**
 * Commander Leads API
 * POST /api/commander/leads - Capture lead from landing page
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, source, referrer, plan } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if lead already exists
    const { data: existing } = await supabase
      .from('commander_leads')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      // Update existing lead with new activity
      await supabase
        .from('commander_leads')
        .update({
          last_activity: new Date().toISOString(),
          visit_count: supabase.sql`visit_count + 1`
        })
        .eq('id', existing.id);

      return res.status(200).json({
        success: true,
        message: 'Welcome back!',
        lead_id: existing.id
      });
    }

    // Create new lead
    const { data: lead, error } = await supabase
      .from('commander_leads')
      .insert({
        email: email.toLowerCase(),
        source: source || 'landing_page',
        referrer: referrer || req.headers.referer,
        interested_plan: plan || null,
        status: 'new',
        visit_count: 1,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      // Table might not exist, just log and continue
      console.error('Lead capture error:', error);
      return res.status(200).json({
        success: true,
        message: 'Thanks for your interest!'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Thanks for your interest!',
      lead_id: lead?.id
    });
  } catch (error) {
    console.error('Leads API error:', error);
    // Don't fail the user experience if lead capture fails
    return res.status(200).json({
      success: true,
      message: 'Thanks for your interest!'
    });
  }
}
