/**
 * Newsletter Subscription API
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, source = 'news_hub' } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: 'Valid email required' });
        }

        // Check if already subscribed
        const { data: existing } = await supabase
            .from('newsletter_subscribers')
            .select('id, is_active')
            .eq('email', email.toLowerCase())
            .single();

        if (existing) {
            if (!existing.is_active) {
                // Reactivate subscription
                await supabase
                    .from('newsletter_subscribers')
                    .update({ is_active: true, unsubscribed_at: null })
                    .eq('id', existing.id);

                return res.status(200).json({ success: true, message: 'Subscription reactivated!' });
            }
            return res.status(200).json({ success: true, message: 'Already subscribed!' });
        }

        // New subscription
        const { error } = await supabase
            .from('newsletter_subscribers')
            .insert({ email: email.toLowerCase(), source });

        if (error) throw error;

        return res.status(200).json({ success: true, message: 'Successfully subscribed!' });
    } catch (error) {
        console.error('Newsletter subscription error:', error);
        return res.status(500).json({ success: false, error: 'Subscription failed' });
    }
}
