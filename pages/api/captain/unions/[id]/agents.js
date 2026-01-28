/**
 * Union Agents API
 * GET /api/captain/unions/[id]/agents - List agents in union
 * POST /api/captain/unions/[id]/agents - Create/invite agent
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Union ID required' }
    });
  }

  // Auth check
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

  // Check access (owner or super_agent)
  const { data: union } = await supabase
    .from('captain_unions')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (!union) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Union not found' }
    });
  }

  const isOwner = union.owner_id === user.id;

  // Check if user is a super_agent
  const { data: agentRecord } = await supabase
    .from('captain_agents')
    .select('id, role')
    .eq('union_id', id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  const isSuperAgent = agentRecord?.role === 'super_agent';

  if (!isOwner && !isSuperAgent) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only owners and super agents can manage agents' }
    });
  }

  if (req.method === 'GET') {
    return getAgents(req, res, id, isOwner, agentRecord);
  }

  if (req.method === 'POST') {
    return createAgent(req, res, id, user.id, isOwner, agentRecord);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getAgents(req, res, unionId, isOwner, requestingAgent) {
  try {
    let query = supabase
      .from('captain_agents')
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url, email),
        captain_agent_players (id)
      `)
      .eq('union_id', unionId)
      .order('created_at', { ascending: false });

    // Super agents can only see their own sub-agents
    if (!isOwner && requestingAgent) {
      query = query.or(`id.eq.${requestingAgent.id},parent_agent_id.eq.${requestingAgent.id}`);
    }

    const { data: agents, error } = await query;

    if (error) {
      console.error('Get union agents error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch agents' }
      });
    }

    // Add player counts
    const agentsWithStats = agents?.map(a => ({
      ...a,
      player_count: a.captain_agent_players?.length || 0
    }));

    return res.status(200).json({
      success: true,
      data: { agents: agentsWithStats || [] }
    });
  } catch (error) {
    console.error('Union agents API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function createAgent(req, res, unionId, currentUserId, isOwner, requestingAgent) {
  try {
    const {
      user_id, email, display_name, phone, role,
      commission_rate, commission_type, venue_id,
      can_create_sub_agents, max_sub_agents
    } = req.body;

    if (!display_name?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Display name required' }
      });
    }

    // Validate role
    const validRoles = isOwner ? ['super_agent', 'agent', 'sub_agent'] : ['agent', 'sub_agent'];
    const agentRole = role || 'agent';

    if (!validRoles.includes(agentRole)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid agent role' }
      });
    }

    // Set parent agent for sub-agents created by super agents
    let parentAgentId = null;
    if (!isOwner && requestingAgent) {
      parentAgentId = requestingAgent.id;
    }

    const agentData = {
      union_id: unionId,
      user_id: user_id || null,
      display_name: display_name.trim(),
      email: email || null,
      phone: phone || null,
      role: agentRole,
      commission_rate: commission_rate || 0,
      commission_type: commission_type || 'rake',
      venue_id: venue_id || null,
      parent_agent_id: parentAgentId,
      can_create_sub_agents: agentRole === 'super_agent' ? (can_create_sub_agents !== false) : false,
      max_sub_agents: agentRole === 'super_agent' ? (max_sub_agents || 10) : 0,
      status: 'active'
    };

    const { data: agent, error } = await supabase
      .from('captain_agents')
      .insert(agentData)
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) {
      console.error('Create agent error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to create agent' }
      });
    }

    // Update union agent count
    await supabase
      .from('captain_unions')
      .update({ agent_count: supabase.sql`agent_count + 1` })
      .eq('id', unionId);

    return res.status(201).json({
      success: true,
      data: { agent }
    });
  } catch (error) {
    console.error('Create agent API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
