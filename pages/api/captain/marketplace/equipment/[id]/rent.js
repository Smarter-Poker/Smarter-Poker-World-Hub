/**
 * Rent Equipment API
 * POST /api/captain/marketplace/equipment/[id]/rent - Request to rent equipment
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

  const { id } = req.query;

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

    const { home_game_id, rental_start, rental_end, message } = req.body;

    if (!rental_start || !rental_end) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'rental_start and rental_end required' }
      });
    }

    // Get equipment listing
    const { data: equipment, error: equipError } = await supabase
      .from('captain_equipment_rentals')
      .select('*, profiles:vendor_id (id, display_name, email)')
      .eq('id', id)
      .eq('available', true)
      .single();

    if (equipError || !equipment) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Equipment not found or unavailable' }
      });
    }

    // Calculate rental duration and cost
    const start = new Date(rental_start);
    const end = new Date(rental_end);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    let estimatedCost;
    if (days >= 7 && equipment.weekly_rate) {
      const weeks = Math.floor(days / 7);
      const remainingDays = days % 7;
      estimatedCost = (weeks * equipment.weekly_rate) + (remainingDays * equipment.daily_rate);
    } else {
      estimatedCost = days * equipment.daily_rate;
    }

    // Create rental request notification to vendor
    const { data: notification, error: notifError } = await supabase
      .from('captain_notifications')
      .insert({
        player_id: equipment.vendor_id,
        notification_type: 'equipment_rental_request',
        channel: 'in_app',
        title: 'New Rental Request',
        message: `${user.email} wants to rent "${equipment.name}" from ${rental_start} to ${rental_end}`,
        metadata: {
          equipment_id: id,
          renter_id: user.id,
          home_game_id,
          rental_start,
          rental_end,
          estimated_days: days,
          estimated_cost: estimatedCost,
          message
        },
        status: 'sent'
      })
      .select()
      .single();

    if (notifError) {
      console.error('Notification error:', notifError);
    }

    return res.status(200).json({
      success: true,
      data: {
        message: 'Rental request sent to vendor',
        equipment_name: equipment.name,
        estimated_days: days,
        estimated_cost: estimatedCost,
        deposit_required: equipment.deposit_required,
        notification_id: notification?.id
      }
    });
  } catch (error) {
    console.error('Rent equipment error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to send rental request' }
    });
  }
}
