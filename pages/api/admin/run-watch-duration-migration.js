// Execute SQL migration to add watch_duration_seconds column to video_watch_history
// This enables the 60-second threshold for marking videos as "watched"

export default async function handler(req, res) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const sql = `
        ALTER TABLE video_watch_history 
        ADD COLUMN IF NOT EXISTS watch_duration_seconds INTEGER DEFAULT 0;
    `;

    try {
        // Try using Supabase's SQL execution endpoint (exec_sql RPC)
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ sql })
        });

        if (response.ok) {
            return res.status(200).json({
                status: 'SUCCESS',
                message: 'watch_duration_seconds column added successfully'
            });
        }

        // If RPC doesn't exist, provide manual instructions
        const errorText = await response.text();

        return res.status(200).json({
            status: 'MANUAL_REQUIRED',
            message: 'Please run this SQL in Supabase SQL Editor:',
            sql: sql.trim(),
            supabaseDashboard: `${supabaseUrl.replace('.supabase.co', '')}/sql`,
            apiError: errorText.substring(0, 200)
        });

    } catch (error) {
        return res.status(500).json({
            error: error.message,
            manualSql: sql.trim()
        });
    }
}
