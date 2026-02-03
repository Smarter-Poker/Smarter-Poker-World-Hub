/**
 * Upload GTO Panel Template to Supabase Storage
 * POST /api/admin/upload-gto-template
 * 
 * Uploads the locked-in GTO panel template image to Supabase storage.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Read the locked-in template from public folder
        const templatePath = path.join(process.cwd(), 'public', 'images', 'gto-panel-template.png');

        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({
                error: 'Template not found',
                path: templatePath,
                message: 'Please ensure gto-panel-template.png exists in public/images/'
            });
        }

        const imageBuffer = fs.readFileSync(templatePath);

        // Upload to Supabase storage
        const { data, error } = await supabase.storage
            .from('gto-panels')
            .upload('gto-panel-locked-template.png', imageBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) {
            console.error('[Upload Template] Error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Get the public URL
        const { data: urlData } = supabase.storage
            .from('gto-panels')
            .getPublicUrl('gto-panel-locked-template.png');

        return res.status(200).json({
            success: true,
            message: 'Template uploaded successfully',
            url: urlData.publicUrl
        });

    } catch (error) {
        console.error('[Upload Template] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
