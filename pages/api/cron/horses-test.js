// Simple test endpoint for horse system diagnosis
export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const env = {
        hasNextPublicSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasXAI: !!process.env.XAI_API_KEY,
        nodeEnv: process.env.NODE_ENV
    };

    return res.status(200).json({
        status: 'ok',
        message: '🐴 Horses test endpoint working',
        env,
        timestamp: new Date().toISOString()
    });
}
