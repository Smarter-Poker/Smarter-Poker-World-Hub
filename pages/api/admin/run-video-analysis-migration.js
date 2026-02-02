// Execute SQL migration to create video_analysis table

export default async function handler(req, res) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const sql = `
        CREATE TABLE IF NOT EXISTS video_analysis (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            video_id TEXT UNIQUE NOT NULL,
            video_title TEXT,
            analysis JSONB NOT NULL DEFAULT '{}',
            has_transcript BOOLEAN DEFAULT false,
            transcript_length INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
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
                message: 'video_analysis table created successfully'
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
