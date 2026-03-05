/**
 * BANKROLL ALERTS CRON
 * Check goals and stop-loss triggers, send push notifications
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Verify cron secret
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }


    try {
        // Get all active goals
        const { data: goals, error: goalsError } = await supabase
            .from('bankroll_goals')
            .select('id, user_id, goal_type, target_amount, current_amount, stop_loss_amount, notified_complete, notified_stop_loss')
            .eq('is_active', true)
                .limit(100);

        if (goalsError) throw goalsError;
        if (!goals?.length) {
            return res.json({ success: true, message: 'No active goals' });
        }

        const alertsSent = [];

        for (const goal of goals) {
            // Check goal completion
            if (goal.current_amount >= goal.target_amount && !goal.notified_complete) {
                // Goal reached!
                await sendPushNotification(
                    goal.user_id,
                    '🎯 Goal Reached!',
                    `You hit your ${goal.goal_type} goal of $${goal.target_amount.toLocaleString()}!`
                );

                await supabase
                    .from('bankroll_goals')
                    .update({ notified_complete: true })
                    .eq('id', goal.id);

                alertsSent.push({ type: 'goal_complete', userId: goal.user_id, goalId: goal.id });
            }

            // Check stop-loss trigger
            if (goal.stop_loss_amount && goal.current_amount <= goal.stop_loss_amount && !goal.notified_stop_loss) {
                // Stop-loss triggered!
                await sendPushNotification(
                    goal.user_id,
                    '⚠️ Stop-Loss Alert',
                    `Your bankroll dropped to $${goal.current_amount.toLocaleString()}. Consider taking a break.`
                );

                await supabase
                    .from('bankroll_goals')
                    .update({ notified_stop_loss: true })
                    .eq('id', goal.id);

                alertsSent.push({ type: 'stop_loss', userId: goal.user_id, goalId: goal.id });
            }
        }

        res.json({ success: true, alertsSent });

    } catch (err) {
        console.error('[Bankroll Alerts] Error:', err);
        res.status(500).json({ error: err.message });
    }
}

async function sendPushNotification(userId, title, message) {
    try {
        // Get user's OneSignal player ID
        const { data: profile } = await supabase
            .from('profiles')
            .select('onesignal_player_id')
            .eq('id', userId)
            .single();

        if (!profile?.onesignal_player_id) {
            return;
        }

        // Send via OneSignal
        await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${process.env.ONESIGNAL_REST_API_KEY}`
            },
            body: JSON.stringify({
                app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
                include_player_ids: [profile.onesignal_player_id],
                headings: { en: title },
                contents: { en: message },
                data: { type: 'bankroll_alert' }
            })
        });

    } catch (err) {
        console.error('[Bankroll Alerts] Push error:', err);
    }
}
