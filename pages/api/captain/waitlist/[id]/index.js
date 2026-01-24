/**
 * Captain Waitlist Entry API - DELETE /api/captain/waitlist/:id
 * Leave/remove from waitlist
 * Reference: API_REFERENCE.md - Waitlist section
 */
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Waitlist entry ID required' }
    });
  }

  try {
    // Get authenticated user (optional - staff can also remove)
    const supabaseServerClient = createPagesServerClient({ req, res });
    const { data: { user } } = await supabaseServerClient.auth.getUser();

    // Verify entry exists
    const { data: entry, error: fetchError } = await supabase
      .from('captain_waitlist')
      .select('id, player_id, venue_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' }
      });
    }

    if (entry.status !== 'waiting' && entry.status !== 'called') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Entry cannot be removed' }
      });
    }

    // Check authorization: user can only remove their own entry
    // TODO: Add staff check (Step 1.3) - staff can remove any entry
    if (user && entry.player_id && entry.player_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot remove another player\'s entry' }
      });
    }

    // Update status to removed
    const { error: updateError } = await supabase
      .from('captain_waitlist')
      .update({ status: 'removed' })
      .eq('id', id);

    if (updateError) {
      console.error('Captain waitlist remove error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to remove from waitlist' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Successfully removed from waitlist' }
    });
  } catch (error) {
    console.error('Captain waitlist remove API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
