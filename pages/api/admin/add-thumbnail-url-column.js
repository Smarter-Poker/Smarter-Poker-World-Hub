// Add thumbnail_url column to video_watch_history table

export default async function handler(req, res) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const sql = `
        ALTER TABLE video_watch_history 
        ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
    `;

    try {
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
                message: 'thumbnail_url column added successfully'
            });
        }

        return res.status(200).json({
            status: 'MANUAL_REQUIRED',
            message: 'Please run this SQL in Supabase SQL Editor:',
            sql: sql.trim()
        });

    } catch (error) {
        return res.status(500).json({
            error: error.message,
            manualSql: sql.trim()
        });
    }
}
