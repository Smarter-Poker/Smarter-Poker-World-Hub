import { createClient } from '../../../src/lib/supabaseServerClient';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { dispatchTournamentReminders } from '../../../src/lib/push/tournament-reminder-delivery';

export const config = { maxDuration: 90 };
let client;
export default async function handler(req, res) {
    try {
        if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
        // Authenticated read-only readiness. It neither claims nor sends a push.
        if (req.method === 'GET') return res.status(200).json({ reminderProtocol: 1 });
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
        client ||= createClient();
        return res.status(200).json(await dispatchTournamentReminders(client));
    } catch {
        return res.status(503).json({ error: 'Reminder Dispatch Unavailable' });
    }
}
