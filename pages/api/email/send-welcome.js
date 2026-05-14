// pages/api/email/send-welcome.js
// Sends welcome email to new Club Commander users

import { Resend } from 'resend';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const resend = new Resend(process.env.RESEND_API_KEY);

import { COMMANDER_FREE_MODE, COMMANDER_FREE_TAGLINE } from '../../../src/lib/commander/tierConfig';

export default async function handler(req, res) {
  try {

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Internal-only endpoint — called server-side by create-subscription.js.
  // Require admin secret to prevent external abuse (phishing via branded emails).
  const adminSecret = req.headers['x-admin-secret'];
  const envSecret = process.env.ADMIN_ROUTE_SECRET;

  if (!envSecret || !adminSecret || adminSecret !== envSecret) {
    return res.status(403).json({ success: false, error: 'This endpoint is for internal use only' });
  }

  const { to, name, clubName, tier, loginUrl } = req.body;

  if (!to || !name || !clubName) {
    return res.status(400).json({ success: false, error: 'Missing required fields: to, name, clubName' });
  }

  // While COMMANDER_FREE_MODE is on, all tiers display as "Free".
  // Flip the flag in tierConfig.js when pricing goes live to restore
  // the original monthly prices.
  const tierInfo = {
    home_game: { name: 'Home Game', price: COMMANDER_FREE_MODE ? 'Free' : '$99/month', tables: '5', staff: '3', sms: '100' },
    charity:   { name: 'Charity',   price: COMMANDER_FREE_MODE ? 'Free' : '$199/month', tables: '15', staff: '10', sms: '500' },
    club:      { name: 'Club',      price: COMMANDER_FREE_MODE ? 'Free' : '$399/month', tables: 'Unlimited', staff: 'Unlimited', sms: 'Unlimited' },
  };

  const plan = tierInfo[tier] || tierInfo.charity;


  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Club Commander</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); padding: 40px; text-align: center; border-radius: 16px 16px 0 0;">
              <div style="font-size: 48px; margin-bottom: 16px;">♠️</div>
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Welcome to Club Commander!</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Your poker room management journey starts now</p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              
              <p style="font-size: 18px; color: #18181b; margin: 0 0 24px 0;">
                Hi ${name},
              </p>
              
              <p style="font-size: 16px; color: #3f3f46; line-height: 1.6; margin: 0 0 24px 0;">
                Congratulations! Your <strong>${clubName}</strong> account has been created. ${COMMANDER_FREE_MODE ? `All Club Commander features are <strong>${COMMANDER_FREE_TAGLINE}</strong> — no credit card required.` : 'Your <strong>14-day free trial</strong> is now active.'}
              </p>
              
              <!-- Plan Info Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 32px 0;">
                <tr>
                  <td style="background: #f4f4f5; padding: 24px; border-radius: 12px;">
                    <h3 style="color: #7c3aed; margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Plan: ${plan.name}</h3>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 4px 0; color: #52525b; font-size: 14px;">Tables</td>
                        <td style="padding: 4px 0; color: #18181b; font-size: 14px; text-align: right; font-weight: 600;">Up to ${plan.tables}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #52525b; font-size: 14px;">Staff Accounts</td>
                        <td style="padding: 4px 0; color: #18181b; font-size: 14px; text-align: right; font-weight: 600;">${plan.staff}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #52525b; font-size: 14px;">SMS Notifications</td>
                        <td style="padding: 4px 0; color: #18181b; font-size: 14px; text-align: right; font-weight: 600;">${plan.sms}/month</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0 0 0; color: #52525b; font-size: 14px;">After trial</td>
                        <td style="padding: 8px 0 0 0; color: #7c3aed; font-size: 14px; text-align: right; font-weight: 700;">${plan.price}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl || 'https://smarter.poker/hub/commander'}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); color: white; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 16px; font-weight: 600;">
                      Go to Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Getting Started -->
              <h3 style="color: #18181b; margin: 0 0 16px 0; font-size: 16px;">Getting Started:</h3>
              <ol style="color: #3f3f46; font-size: 14px; line-height: 1.8; margin: 0 0 32px 0; padding-left: 20px;">
                <li>Log in to your dashboard</li>
                <li>Set up your poker tables</li>
                <li>Add your staff members</li>
                <li>Customize your waitlist settings</li>
                <li>Download the desktop app for quick access</li>
              </ol>
              
              <!-- Help -->
              <p style="font-size: 14px; color: #71717a; line-height: 1.6; margin: 0; padding-top: 24px; border-top: 1px solid #e4e4e7;">
                Need help? Reply to this email or visit our <a href="https://docs.smarter.poker/commander" style="color: #7c3aed;">documentation</a>.
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
                You're receiving this because you signed up for Club Commander.
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
      from: 'Club Commander <noreply@smarter.poker>',
      to: [to],
      subject: `Welcome to Club Commander, ${name}! ♠️`,
      html: emailHtml,
    });

    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
      try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Email error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
