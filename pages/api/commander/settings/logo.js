/**
 * Club Logo Upload API
 * POST /api/commander/settings/logo - Upload club logo to Supabase Storage
 * DELETE /api/commander/settings/logo - Remove club logo
 * 
 * Stores the logo in Supabase Storage bucket 'club-logos'
 * and saves the public URL to commander_venue_settings.club_logo_url
 */
import { createClient } from '@supabase/supabase-js';
import { guardManager } from '../../../../src/lib/commander/auth';
import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const staff = await guardManager(req, res);
    if (!staff) return;

    try {
        // ── DELETE: Remove logo ──────────────────────────────────────
        if (req.method === 'DELETE') {
            // Get current logo URL to delete from storage
            const { data: settings } = await supabase
                .from('commander_venue_settings')
                .select('club_logo_url')
                .eq('venue_id', staff.venue_id)
                .single();

            if (settings?.club_logo_url) {
                // Extract file path from URL
                const urlParts = settings.club_logo_url.split('/club-logos/');
                if (urlParts[1]) {
                    await supabase.storage.from('club-logos').remove([urlParts[1]]);
                }
            }

            // Clear the URL in settings
            const { error } = await supabase
                .from('commander_venue_settings')
                .upsert({
                    venue_id: staff.venue_id,
                    club_logo_url: null,
                    updated_at: new Date().toISOString(),
                    updated_by: staff.id
                }, { onConflict: 'venue_id' });

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true, data: { club_logo_url: null } });
        }

        // ── POST: Upload logo ────────────────────────────────────────
        if (req.method === 'POST') {
            const form = formidable({
                maxFileSize: 5 * 1024 * 1024, // 5MB max
                filter: ({ mimetype }) => mimetype && mimetype.startsWith('image/'),
            });

            const [fields, files] = await form.parse(req);
            const file = files.logo?.[0];

            if (!file) {
                return res.status(400).json({ success: false, error: 'No logo file provided' });
            }

            // Validate file type
            const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
            if (!allowedTypes.includes(file.mimetype)) {
                return res.status(400).json({ success: false, error: 'Invalid file type. Use PNG, JPG, WebP, SVG, or GIF.' });
            }

            // Read file buffer
            const fileBuffer = fs.readFileSync(file.filepath);
            const ext = file.originalFilename?.split('.').pop() || 'png';
            const fileName = `${staff.venue_id}/logo-${Date.now()}.${ext}`;

            // Delete any existing logo first
            const { data: existingSettings } = await supabase
                .from('commander_venue_settings')
                .select('club_logo_url')
                .eq('venue_id', staff.venue_id)
                .single();

            if (existingSettings?.club_logo_url) {
                const urlParts = existingSettings.club_logo_url.split('/club-logos/');
                if (urlParts[1]) {
                    await supabase.storage.from('club-logos').remove([urlParts[1]]);
                }
            }

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('club-logos')
                .upload(fileName, fileBuffer, {
                    contentType: file.mimetype,
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.error('Logo upload error:', uploadError);
                return res.status(500).json({ success: false, error: `Upload failed: ${uploadError.message}` });
            }

            // Get public URL
            const { data: publicUrlData } = supabase.storage
                .from('club-logos')
                .getPublicUrl(fileName);

            const logoUrl = publicUrlData.publicUrl;

            // Save URL to settings
            const { error: saveError } = await supabase
                .from('commander_venue_settings')
                .upsert({
                    venue_id: staff.venue_id,
                    club_logo_url: logoUrl,
                    updated_at: new Date().toISOString(),
                    updated_by: staff.id
                }, { onConflict: 'venue_id' });

            if (saveError) {
                return res.status(500).json({ success: false, error: saveError.message });
            }

            // Also update the staff session's cached branding
            return res.status(200).json({
                success: true,
                data: { club_logo_url: logoUrl }
            });
        }

        return res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (err) {
        console.error('Logo API error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
