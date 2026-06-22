import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { createClient } from '@supabase/supabase-js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const mainDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { user: localUser } = await getServerUserWithFallback(req, mainDb);
    if (!localUser) return res.status(401).json({ error: 'Auth required' });

    // Validate admin permissions
    const { data: profile } = await mainDb
      .from('profiles')
      .select('is_admin')
      .eq('id', localUser.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const mlbDb = getMlbSupabase();

    // 1. Fetch recent unresolved alerts from MLB backend
    // Only fetch alerts from the last 2 hours to avoid spamming historical alerts
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: alerts, error: alertsError } = await mlbDb
      .from('alert_log')
      .select('id, alert_type, message, created_at')
      .eq('resolved', false)
      .gte('created_at', twoHoursAgo)
      .limit(100);

    if (alertsError) throw alertsError;
    if (!alerts || alerts.length === 0) {
      return res.status(200).json({ ok: true, synced: 0 });
    }

    const alertIds = alerts.map(a => a.id);

    // 2. Fetch existing MLB notifications for this admin to avoid duplicates
    // We use the alert ID embedded in the data to track it
    const { data: existingNotifs, error: notifError } = await mainDb
      .from('notifications')
      .select('data')
      .eq('user_id', localUser.id)
      .eq('type', 'system')
      .in('data->>alert_id', alertIds);

    if (notifError) throw notifError;

    const existingAlertIds = new Set((existingNotifs || []).map((n: any) => n.data?.alert_id));
    const newAlerts = alerts.filter(a => !existingAlertIds.has(a.id));

    if (newAlerts.length === 0) {
      return res.status(200).json({ ok: true, synced: 0 });
    }

    // 3. Insert new notifications
    const inserts = newAlerts.map(a => ({
      user_id: localUser.id,
      title: 'MLB Pipeline Alert',
      message: `[${a.alert_type}] ${a.message}`,
      type: 'system',
      link: '/hub/MLB-ANALYTICS/status',
      data: { alert_id: a.id },
      read: false,
      is_read: false
    }));

    const { error: insertError } = await mainDb.from('notifications').insert(inserts);
    if (insertError) throw insertError;

    return res.status(200).json({ ok: true, synced: inserts.length });
  } catch (error) {
    console.error('[API/MLB/Sync-Alerts] Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
