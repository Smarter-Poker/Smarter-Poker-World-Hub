/**
 * Send Hand to GodMode Analysis API
 * POST /api/commander/hands/[handId]/analyze
 * Per API_REFERENCE.md: /hands/:handId/analyze
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

  const { handId } = req.query;

  // Require authentication
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Invalid token' }
      });
    }

    // Get hand data
    const { data: hand, error } = await supabase
      .from('commander_hand_history')
      .select('*')
      .eq('id', handId)
      .single();

    if (error || !hand) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Hand not found' }
      });
    }

    // Create analysis record (would integrate with GodMode AI system)
    const analysisId = `analysis_${handId}_${Date.now()}`;

    // In a real implementation, this would:
    // 1. Format hand data for GodMode
    // 2. Queue analysis job
    // 3. Return redirect URL to analysis page

    // For now, return redirect to GodMode with hand context
    const redirectUrl = `/hub/godmode?source=commander&hand=${handId}&analysis=${analysisId}`;

    return res.status(200).json({
      success: true,
      data: {
        analysis_id: analysisId,
        redirect_url: redirectUrl
      }
    });

  } catch (error) {
    console.error('Analyze API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to start analysis' }
    });
  }
}
