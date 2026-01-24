/**
 * Club QR Code API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/captain/home-games/groups/[id]/qr - Get QR code for club
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: groupId, format = 'json' } = req.query;

  if (!groupId) {
    return res.status(400).json({ error: 'Group ID required' });
  }

  try {
    // Get group info
    const { data: group, error } = await supabase
      .from('captain_home_groups')
      .select('id, name, club_code, invite_code, is_private')
      .eq('id', groupId)
      .single();

    if (error || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Generate QR code URL
    // The QR code will contain a URL that opens the app/website to the join page
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smarter.poker';
    const joinUrl = `${baseUrl}/clubs/join/${group.club_code}`;

    // QR code data
    const qrData = {
      url: joinUrl,
      club_code: group.club_code,
      invite_code: group.invite_code,
      name: group.name
    };

    // If format is 'svg' or 'png', generate actual QR code
    if (format === 'svg' || format === 'png') {
      // Generate QR code using a simple library or API
      // For now, return a URL to a QR code generator service
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}`;

      if (format === 'png') {
        // Redirect to the QR code image
        return res.redirect(qrCodeUrl);
      }

      // For SVG, we'd need a different approach or library
      return res.status(200).json({
        ...qrData,
        qr_image_url: qrCodeUrl
      });
    }

    // Return QR data as JSON
    return res.status(200).json({
      ...qrData,
      qr_image_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}`
    });
  } catch (error) {
    console.error('QR code error:', error);
    return res.status(500).json({ error: error.message });
  }
}
