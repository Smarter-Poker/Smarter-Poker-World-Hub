// Execute SQL migration to add profile columns via Supabase REST API
// Uses pg_query function if available, otherwise provides manual instructions

export default async function handler(req, res) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const sql = `
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'hometown') THEN
                ALTER TABLE profiles ADD COLUMN hometown TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'cover_photo_url') THEN
                ALTER TABLE profiles ADD COLUMN cover_photo_url TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'occupation') THEN
                ALTER TABLE profiles ADD COLUMN occupation TEXT;
            END IF;
        END $$;
    `;

    try {
        // Try using Supabase's SQL execution endpoint (pg_query RPC)
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
                message: 'Columns added successfully via exec_sql RPC'
            });
        }

        // If RPC doesn't exist, try direct pg endpoint
        const sqlResponse = await fetch(`${supabaseUrl}/pg/sql`, {
            method: 'POST',
            headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sql })
        });

        if (sqlResponse.ok) {
            return res.status(200).json({
                status: 'SUCCESS',
                message: 'Columns added successfully via pg/sql endpoint'
            });
        }

        // Neither worked - provide manual instructions
        const errorText = await response.text();

        return res.status(200).json({
            status: 'MANUAL_REQUIRED',
            message: 'Automatic migration not available. Please run this SQL in Supabase SQL Editor:',
            sql: `
-- Add missing profile columns for Facebook-style profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hometown TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation TEXT;
            `.trim(),
            supabaseDashboard: `${supabaseUrl.replace('.supabase.co', '')}/sql`,
            apiError: errorText.substring(0, 200)
        });

    } catch (error) {
        return res.status(500).json({
            error: error.message,
            manualSql: `
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hometown TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation TEXT;
            `.trim()
        });
    }
}
