/**
 * Birthday Reward API — 300 Diamonds
 * 
 * POST /api/rewards/birthday-reward
 * Body: { userId }
 * 
 * Rules:
 * - Account must be 60+ days old
 * - Birthday must match today (month+day)
 * - One claim per year (deduplicated via diamond_ledger)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

const getSupabase = () => createClient();

const BIRTHDAY_DIAMONDS = 300;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    try {
        const supabase = getSupabase();
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, birthday, created_at')
            .eq('id', userId)
            .maybeSingle();

        if (profileError || !profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        if (!profile.birthday) {
            return res.status(400).json({ error: 'No birthday set' });
        }

        // Check account age (60+ days)
        const createdAt = new Date(profile.created_at);
        const now = new Date();
        const daysSinceCreation = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        if (daysSinceCreation < 60) {
            return res.status(403).json({
                error: 'Account must be at least 60 days old to claim birthday reward',
                daysRemaining: 60 - daysSinceCreation
            });
        }

        // Check if today is birthday (month + day match)
        const birthday = new Date(profile.birthday + 'T00:00:00');
        const todayMonth = now.getMonth();
        const todayDay = now.getDate();
        if (birthday.getMonth() !== todayMonth || birthday.getDate() !== todayDay) {
            return res.status(400).json({ error: 'Today is not your birthday' });
        }

        // Check for existing claim this year
        const currentYear = now.getFullYear();
        const yearStart = `${currentYear}-01-01T00:00:00Z`;
        const yearEnd = `${currentYear}-12-31T23:59:59Z`;

        const { data: existing } = await supabase
            .from('diamond_ledger')
            .select('id')
            .eq('user_id', userId)
            .eq('reason', 'birthday_reward')
            .gte('created_at', yearStart)
            .lte('created_at', yearEnd)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'Birthday reward already claimed this year' });
        }

        // Award diamonds
        const { error: ledgerError } = await supabase
            .from('diamond_ledger')
            .insert({
                user_id: userId,
                amount: BIRTHDAY_DIAMONDS,
                reason: 'birthday_reward',
                description: `Happy Birthday! 🎂 ${BIRTHDAY_DIAMONDS} diamonds awarded`,
            });

        if (ledgerError) {
            console.error('Birthday reward ledger error:', ledgerError);
            return res.status(500).json({ error: 'Failed to award diamonds' });
        }

        // Update diamond balance
        const { error: balanceError } = await supabase.rpc('increment_diamonds', {
            p_user_id: userId,
            p_amount: BIRTHDAY_DIAMONDS,
        });

        if (balanceError) {
            console.error('Birthday reward balance error:', balanceError);
            // Ledger entry was created, balance will reconcile
        }

        return res.status(200).json({
            success: true,
            diamonds: BIRTHDAY_DIAMONDS,
            message: `Happy Birthday! You received ${BIRTHDAY_DIAMONDS} diamonds!`
        });
    } catch (err) {
        console.error('Birthday reward error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
