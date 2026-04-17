// pages/api/email/send-seat-request.js
// Sends a notification email to a home-game HOST when a public user
// requests a seat at one of their scheduled games via the Phase 9
// request-seat endpoint.
//
// Internal-only: called server-side from
//   pages/api/public/home-games/[slug]/events/[eventId]/request-seat.js
// after the membership + RSVP upserts succeed. Protected by the
// same x-admin-secret header contract used by send-welcome.js.

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
  // isoDate is a 'YYYY-MM-DD' string from commander_home_games.scheduled_date
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
    // hhmm is either 'HH:MM:SS' or 'HH:MM' from commander_home_games.start_time
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

  // Internal-only endpoint — called server-side by request-seat.js.
  // Require admin secret to prevent external abuse.
  const adminSecret = req.headers['x-admin-secret'];
  const envSecret = process.env.ADMIN_ROUTE_SECRET;

  if (!envSecret || !adminSecret || adminSecret !== envSecret) {
    return res.status(403).json({ success: false, error: 'This endpoint is for internal use only' });
  }

  const {
    to,                     // host email
    hostName,               // host display name (optional; greeting)
    requesterName,          // requester display name
    requesterMessage,       // optional free-text note from requester
    groupName,              // home-game group name
    eventTitle,             // event title
    eventDate,              // 'YYYY-MM-DD'
    eventStartTime,         // 'HH:MM:SS' or null
    eventStakes,            // e.g. '$1/$2 NLHE' — optional cosmetic
    response,               // 'yes' | 'waitlist'
    bringingGuests,         // integer
    manageUrl,              // link to commander manage page
  } = req.body || {};

  if (!to || !requesterName || !groupName || !eventDate) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: to, requesterName, groupName, eventDate',
    });
  }

  const safe = {
    hostName: escapeHtml(hostName || 'Host'),
    requesterName: escapeHtml(requesterName),
    requesterMessage: escapeHtml(requesterMessage || ''),
    groupName: escapeHtml(groupName),
    eventTitle: escapeHtml(eventTitle || 'Upcoming game'),
    eventStakes: escapeHtml(eventStakes || ''),
    dateNice: escapeHtml(formatDateNice(eventDate)),
    timeNice: escapeHtml(formatTimeNice(eventStartTime)),
    manageUrl: manageUrl || 'https://smarter.poker/hub/commander/home-games',
  };

  const isWaitlist = response === 'waitlist';
  const statusBadge = isWaitlist
    ? '<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">Waitlist</span>'
    : '<span style="display:inline-block;background:#ede9fe;color:#6d28d9;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">Awaiting your approval</span>';

  const guestsLine = Number(bringingGuests) > 0
    ? `<tr><td style="padding:6px 0;color:#52525b;font-size:14px;">Bringing guests</td><td style="padding:6px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">+${Number(bringingGuests)}</td></tr>`
    : '';

  const messageBlock = safe.requesterMessage
    ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
        <tr>
          <td style="background:#f4f4f5;border-left:4px solid #7c3aed;padding:16px 20px;border-radius:8px;">
            <p style="margin:0 0 6px 0;color:#7c3aed;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Message from ${safe.requesterName}</p>
            <p style="margin:0;color:#3f3f46;font-size:14px;line-height:1.6;white-space:pre-wrap;">${safe.requesterMessage}</p>
          </td>
        </tr>
      </table>
    `
    : '';

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New seat request at ${safe.groupName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
              <div style="font-size: 40px; margin-bottom: 12px;">🎰</div>
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">New seat request</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 15px;">${safe.groupName}</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

              <p style="font-size: 16px; color: #18181b; margin: 0 0 8px 0;">
                Hi ${safe.hostName},
              </p>

              <p style="font-size: 16px; color: #3f3f46; line-height: 1.6; margin: 0 0 24px 0;">
                <strong>${safe.requesterName}</strong> just requested a seat at one of your upcoming games. They found you through your public home-game page.
              </p>

              <!-- Event box -->
              <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
                <tr>
                  <td style="background:#faf9ff;border:1px solid #e9d5ff;padding:20px;border-radius:12px;">
                    <p style="margin:0 0 4px 0;color:#7c3aed;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">The game</p>
                    <p style="margin:0 0 12px 0;color:#18181b;font-size:17px;font-weight:700;">${safe.eventTitle}</p>
                    <table role="presentation" style="width:100%;border-collapse:collapse;">
                      <tr><td style="padding:4px 0;color:#52525b;font-size:14px;">Date</td><td style="padding:4px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">${safe.dateNice}</td></tr>
                      ${safe.timeNice ? `<tr><td style="padding:4px 0;color:#52525b;font-size:14px;">Time</td><td style="padding:4px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">${safe.timeNice}</td></tr>` : ''}
                      ${safe.eventStakes ? `<tr><td style="padding:4px 0;color:#52525b;font-size:14px;">Stakes</td><td style="padding:4px 0;color:#18181b;font-size:14px;text-align:right;font-weight:600;">${safe.eventStakes}</td></tr>` : ''}
                      ${guestsLine}
                      <tr><td style="padding:8px 0 0 0;color:#52525b;font-size:14px;">Status</td><td style="padding:8px 0 0 0;text-align:right;">${statusBadge}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${messageBlock}

              <!-- Privacy note -->
              <p style="font-size: 13px; color: #71717a; line-height: 1.6; margin: 0 0 24px 0; padding: 12px 16px; background: #fafafa; border-radius: 8px;">
                🔒 Your game's address is private until you approve this request. ${safe.requesterName} will only see it once you confirm them on the dashboard.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${safe.manageUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 12px; font-size: 16px; font-weight: 600;">
                      Review and approve →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #71717a; line-height: 1.6; margin: 0; padding-top: 20px; border-top: 1px solid #e4e4e7;">
                You'll only get these when someone requests a seat at one of your public games. You can manage all your notifications from the dashboard.
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
                You're receiving this because you host a public home game on Smarter.Poker.
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
      subject: `New seat request at ${groupName} — ${formatDateNice(eventDate)}`,
      html: emailHtml,
      // Put the requester's plain email in reply-to if provided so
      // the host can respond directly. Left null by caller if privacy-
      // sensitive; in that case Resend routes replies to noreply@.
      ...(req.body.requesterEmail && { reply_to: req.body.requesterEmail }),
    });

    return res.status(200).json({ success: true, id: data?.id });
  } catch (error) {
    console.error('[send-seat-request] Resend error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
