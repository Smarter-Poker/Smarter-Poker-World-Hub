import { createClient } from '@supabase/supabase-js';

/**
 * Quick fix to update system account avatar
 */
export default async function handler(req, res) {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data, error } = await supabase
            .from('profiles')
            .update({ avatar_url: '/smarter-poker-logo.png' })
            .eq('id', '00000000-0000-0000-0000-000000000001')
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({
            success: true,
            message: 'System account avatar updated',
            profile: data
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
