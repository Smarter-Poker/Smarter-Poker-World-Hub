/**
 * Captain Unions API
 * GET /api/captain/unions - List user's unions
 * POST /api/captain/unions - Create a new union
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return getUnions(req, res);
  }

  if (req.method === 'POST') {
    return createUnion(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getUnions(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
      });
    }

    // Get unions where user is owner
    const { data: ownedUnions, error: ownedError } = await supabase
      .from('captain_unions')
      .select(`
        *,
        captain_union_venues (
          id,
          venue_id,
          tier,
          status,
          poker_venues:venue_id (id, name, city, state)
        )
      `)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (ownedError) {
      console.error('Get unions error:', ownedError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch unions' }
      });
    }

    // Get unions where user is an agent
    const { data: agentUnions } = await supabase
      .from('captain_agents')
      .select(`
        id,
        role,
        status,
        captain_unions:union_id (
          id, name, logo_url, venue_count, agent_count, status
        )
      `)
      .eq('user_id', user.id)
      .not('union_id', 'is', null);

    return res.status(200).json({
      success: true,
      data: {
        owned_unions: ownedUnions || [],
        agent_unions: agentUnions?.filter(a => a.captain_unions) || []
      }
    });
  } catch (error) {
    console.error('Unions API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function createUnion(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
      });
    }

    const { name, description, logo_url, website, contact_email, contact_phone } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Union name is required' }
      });
    }

    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug exists
    const { data: existing } = await supabase
      .from('captain_unions')
      .select('id')
      .eq('slug', slug)
      .single();

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const { data: union, error } = await supabase
      .from('captain_unions')
      .insert({
        name: name.trim(),
        slug: finalSlug,
        description: description || null,
        logo_url: logo_url || null,
        website: website || null,
        contact_email: contact_email || user.email,
        contact_phone: contact_phone || null,
        owner_id: user.id,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error('Create union error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to create union' }
      });
    }

    return res.status(201).json({
      success: true,
      data: { union }
    });
  } catch (error) {
    console.error('Create union API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
