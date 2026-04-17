// pages/api/email/send-seat-approved.js
// Sends a confirmation email to a REQUESTER when a host approves their
// RSVP via the Phase 11 commander approval endpoint.
//
// Internal-only: called server-side from
//   pages/api/commander/home-games/rsvps/[id].js
// after the RSVP state flips from is_confirmed=false -> true. Protected
// by the same x-admin-secret header contract used by send-welcome.js
// and send-seat-request.js.
//
// Crucially: this email INCLUDES the game's physical address, since the
// requester is now a confirmed guest per the address_visible_to='rsvp'
// contract. The email is the first place they see it.

import { Resend } from 'resend';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateNice(isoDate) {
  if (!isoDate) return '';
  try {
    const [y, m, d] = String(isoDate).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return isoDate;
  }
}

function formatTimeNice(hhmm) {
  if (!hhmm) return '';
  try {
    const [hStr, mStr] = String(hhmm).split(':');
    const h = Number(hStr);
    const m = Number(mStr || 0);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = String(m).padStart(2, '0');
    return `${h12}:${mm} ${ampm}`;
  } catch {
    return hhmm;
  }
}

export default async function handler(req, res) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const adminSecret = req.headers['x-admin-secret'];
  const envSecret = process.env.ADMIN_ROUTE_SECRET;
  if (!envSecret || !adminSecret || adminSecret !== envSecret) {
    return res.status(403).json({ success: false, error: 'This endpoint is for internal use only' });
  }

  const {
    to,
    requesterName,
    hostName,
    groupName,
    eventTitle,
    eventDate,
    eventStartTime,
    eventStakes,
    eventAddress,
    bringingGuests,
    pageUrl,
  } = req.body || {};

  if (!to || !groupName || !eventDate) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: to, groupName, eventDate',
    });
  }

  const safe = {
    requesterName: escapeHtml(requesterName || 'there'),
    hostName: escapeHtml(hostName || 'The host'),
    groupName: escapeHtml(groupName),
    eventTitle: escapeHtml(eventTitle || 'Upcoming game'),
    eventStakes: escapeHtml(eventStakes || ''),
    eventAddress: escapeHtml(eventAddress || ''),
    dateNice: escapeHtml(formatDateNice(eventDate)),
    timeNice: escapeHtml(formatTimeNice(eventStartTime)),
    pageUrl: pageUrl || 'https://smarter.poker/hub/home-games',
  };

  // The address is the headline of this email — if the host hasn't set
  // one we still send the confirmation, but with a softer copy line.
  const addressBlock = safe.eventAddress
    ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
        <tr>
          <td style="background:linear-gradient(135deg,#faf5ff 0%,#fdf4ff 100%);border:2px solid #c4b5fd;padding:20px;border-radius:12px;">
            <p style="margin:0 0 6px 0;color:#6d28d9;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">📍 The address (now visible)</p>
            <p style="margin:0;color:#18181b;font-size:16px;font-weight:600;line-height:1.5;">${safe.eventAddress}</p>
          </td>
        </tr>
      </table>
    `
    : `
      <p style="font-size:14px;color:#71717a;line-height:1.6;margin:0 0 24px 0;padding:12px 16px;background:#fafafa;border-radius:8px;">
        ${safe.hostName} hasn't added a specific address yet — they'll share it with you directly closer to game day.
      </p>
    `;

  const guestsLine = Number(bringingGuests) > 0
    ? `<tr><td style="padding:6px 0;color:#52525b;font-size:14px;">Bringing guests</td><td style="padding:6px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">+${Number(bringingGuests)}</td></tr>`
    : '';

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're confirmed at ${safe.groupName}!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #7c3aed 100%); padding: 40px 32px 32px; text-align: center; border-radius: 16px 16px 0 0;">
              <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">You're in!</h1>
              <p style="color: rgba(255,255,255,0.92); margin: 10px 0 0 0; font-size: 16px;">${safe.groupName}</p>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

              <p style="font-size: 18px; color: #18181b; margin: 0 0 8px 0;">
                Hi ${safe.requesterName},
              </p>

              <p style="font-size: 16px; color: #3f3f46; line-height: 1.6; margin: 0 0 24px 0;">
                Great news — ${safe.hostName} just confirmed your seat. See you at the table.
              </p>

              <!-- Event box -->
              <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px 0;">
                <tr>
                  <td style="background:#f8fafc;border:1px solid #e2e8f0;padding:20px;border-radius:12px;">
                    <p style="margin:0 0 4px 0;color:#059669;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">The game</p>
                    <p style="margin:0 0 12px 0;color:#18181b;font-size:17px;font-weight:700;">${safe.eventTitle}</p>
                    <table role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr><td style="padding:4px 0;color:#52525b;font-size:14px;">Date</td><td style="padding:4px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">${safe.dateNice}</td></tr>
                      ${safe.timeNice ? `<tr><td style="padding:4px 0;color:#52525b;font-size:14px;">Time</td><td style="padding:4px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">${safe.timeNice}</td></tr>` : ''}
                      ${safe.eventStakes ? `<tr><td style="padding:4px 0;color:#52525b;font-size:14px;">Stakes</td><td style="padding:4px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">${safe.eventStakes}</td></tr>` : ''}
                      ${guestsLine}
                    </table>
                  </td>
                </tr>
              </table>

              ${addressBlock}

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${safe.pageUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #7c3aed 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-size: 16px; font-weight: 600;">
                      View home-game page →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Etiquette note -->
              <p style="font-size: 13px; color: #71717a; line-height: 1.6; margin: 0; padding-top: 20px; border-top: 1px solid #e4e4e7;">
                Heads up — home games are personal. Be on time, bring exact cash for the buy-in, and let ${safe.hostName} know in advance if anything changes. Enjoy the game!
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 20px; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
                © 2026 Smarter.Poker • <a href="https://smarter.poker" style="color: #a1a1aa;">Website</a> • <a href="https://smarter.poker/legal/terms" style="color: #a1a1aa;">Terms</a> • <a href="https://smarter.poker/legal/privacy" style="color: #a1a1aa;">Privacy</a>
              </p>
              <p style="color: #d4d4d8; font-size: 11px; margin: 8px 0 0 0;">
                You're receiving this because you requested a seat at a public home game on Smarter.Poker.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const data = await resend.emails.send({
      from: 'Smarter.Poker Home Games <noreply@smarter.poker>',
      to: [to],
      subject: `You're in at ${groupName} — ${formatDateNice(eventDate)}`,
      html: emailHtml,
    });
    return res.status(200).json({ success: true, id: data?.id });
  } catch (error) {
    console.error('[send-seat-approved] Resend error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
