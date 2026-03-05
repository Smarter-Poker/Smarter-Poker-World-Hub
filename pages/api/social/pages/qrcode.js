/**
 * QR Code Generator API
 * 
 * GET /api/social/pages/qrcode?page_id=xxx  - Generate QR code for a club page
 * GET /api/social/pages/qrcode?ref=xxx       - Get page info from referral code
 * 
 * Returns a QR code SVG or PNG data URL that encodes a direct link to follow the page.
 * The link includes a referral code so new signups auto-follow the referring club.
 */
import { createClient } from '@supabase/supabase-js';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Simple QR code generation using a free API
function getQRCodeUrl(data, size = 300) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=svg&margin=10&color=1a1a2e&bgcolor=ffffff`;
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { page_id, ref } = req.query;

    // === Lookup page by referral code ===
    if (ref) {
        const { data: page, error } = await supabase
            .from('social_pages')
            .select('id, name, slug, avatar_url, cover_url, description, category, follower_count')
            .eq('metadata->>referral_code', ref)
            .single();

        if (error || !page) {
            return res.status(404).json({ success: false, error: 'Invalid referral code' });
        }
        return res.status(200).json({ success: true, data: page });
    }

    // === Generate QR code for a page ===
    if (!page_id) {
        return res.status(400).json({ success: false, error: 'page_id or ref required' });
    }

    // Get page with referral code
    const { data: page, error } = await supabase
        .from('social_pages')
        .select('id, name, slug, metadata')
        .eq('id', page_id)
        .single();

    if (error || !page) {
        return res.status(404).json({ success: false, error: 'Page not found' });
    }

    // Generate referral code if it doesn't exist
    let referralCode = page.metadata?.referral_code;
    if (!referralCode) {
        referralCode = page.slug ? page.slug.substring(0, 20) : page.id.substring(0, 8);
        referralCode = referralCode + '-' + Math.random().toString(36).substring(2, 6);

        // Save to metadata
        const newMeta = { ...page.metadata, referral_code: referralCode };
        await supabase.from('social_pages').update({ metadata: newMeta }).eq('id', page_id);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';
    const followUrl = `${siteUrl}/hub/social-media?ref=${referralCode}`;
    const qrCodeUrl = getQRCodeUrl(followUrl);

    return res.status(200).json({
        success: true,
        data: {
            referral_code: referralCode,
            follow_url: followUrl,
            qr_code_url: qrCodeUrl,
            page_name: page.name,
            page_id: page.id,
        }
    });
}
