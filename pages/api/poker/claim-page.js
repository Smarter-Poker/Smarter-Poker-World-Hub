import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
};

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { page_type, page_id, user_id, contact_name, contact_email, contact_phone, role, verification_notes } = req.body;

      if (!page_type || !page_id || !user_id || !contact_name || !contact_email || !role) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: page_type, page_id, user_id, contact_name, contact_email, role',
        });
      }

      // Check if claim already exists for this page
      const { data: existingClaim, error: checkError } = await supabase
        .from('page_claims')
        .select('id, status, user_id')
        .eq('page_type', page_type)
        .eq('page_id', page_id)
        .limit(1);

      if (checkError) {
        console.error('Error checking existing claim:', checkError);
        return res.status(500).json({ success: false, error: checkError.message });
      }

      if (existingClaim && existingClaim.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'A claim already exists for this page',
          existing_claim: {
            status: existingClaim[0].status,
            is_yours: existingClaim[0].user_id === user_id,
          },
        });
      }

      const insertData = {
        page_type,
        page_id,
        user_id,
        contact_name,
        contact_email,
        role,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      if (verification_notes) {
        insertData.verification_notes = verification_notes;
      }
      if (contact_phone !== undefined && contact_phone !== null) {
        insertData.contact_phone = contact_phone;
      }

      const { data, error } = await supabase
        .from('page_claims')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error creating claim:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(201).json({ success: true, claim: data });
    }

    if (req.method === 'GET') {
      const { page_type, page_id, user_id } = req.query;

      // Get claim status for a specific page
      if (page_type && page_id) {
        const { data, error } = await supabase
          .from('page_claims')
          .select('*')
          .eq('page_type', page_type)
          .eq('page_id', page_id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Error fetching claim:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        if (!data || data.length === 0) {
          return res.status(200).json({ success: true, claimed: false, claim: null });
        }

        return res.status(200).json({ success: true, claimed: true, claim: data[0] });
      }

      // Get all claims for a user
      if (user_id) {
        const { data, error } = await supabase
          .from('page_claims')
          .select('*')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching user claims:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, claims: data || [] });
      }

      return res.status(400).json({ success: false, error: 'page_type+page_id or user_id is required' });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Claim page API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
