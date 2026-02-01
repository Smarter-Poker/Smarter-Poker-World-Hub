/**
 * Resend Transactional Email Templates for Smarter.Poker
 *
 * Full email service with templates for all platform notifications.
 * Uses Resend for delivery.
 *
 * SETUP: Add RESEND_API_KEY to environment variables
 * Install: npm install resend (already installed)
 */

import { Resend } from 'resend';

let resendClient = null;

function getResend() {
    if (resendClient) return resendClient;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Email] RESEND_API_KEY not configured - emails disabled');
        return null;
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
}

/**
 * Check if email is configured
 */
export function isEmailConfigured() {
    return !!process.env.RESEND_API_KEY;
}

/**
 * Base HTML email wrapper
 */
function emailWrapper(title, bodyContent) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #F0F2F5; }
        .container { max-width: 560px; margin: 0 auto; padding: 20px; }
        .card { background: #FFFFFF; border-radius: 12px; border: 1px solid #DADDE1; overflow: hidden; }
        .header { background: #1877F2; padding: 24px; text-align: center; }
        .header h1 { color: #FFFFFF; margin: 0; font-size: 22px; font-weight: 800; }
        .header p { color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px; }
        .body { padding: 24px; }
        .body h2 { font-size: 18px; font-weight: 700; color: #050505; margin: 0 0 12px; }
        .body p { font-size: 14px; color: #050505; line-height: 1.6; margin: 0 0 12px; }
        .body .muted { color: #65676B; font-size: 13px; }
        .btn { display: inline-block; padding: 12px 28px; background: #1877F2; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; }
        .btn:hover { background: #166FE5; }
        .btn-secondary { background: #E4E6EB; color: #050505; }
        .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #F0F2F5; }
        .info-label { font-size: 13px; color: #65676B; width: 120px; flex-shrink: 0; }
        .info-value { font-size: 13px; color: #050505; font-weight: 500; }
        .footer { padding: 16px 24px; border-top: 1px solid #DADDE1; text-align: center; }
        .footer p { font-size: 11px; color: #8A8D91; margin: 0; }
        .footer a { color: #1877F2; text-decoration: none; }
        .divider { height: 1px; background: #DADDE1; margin: 16px 0; }
        .highlight { background: #E7F3FF; border: 1px solid #1877F2; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
        .highlight p { color: #1877F2; font-weight: 600; margin: 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <h1>Smarter.Poker</h1>
                <p>Your poker companion</p>
            </div>
            <div class="body">
                ${bodyContent}
            </div>
            <div class="footer">
                <p>Smarter.Poker - Play smarter, win bigger</p>
                <p><a href="https://smarter.poker/hub/settings">Manage email preferences</a></p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Send an email
 */
async function sendEmail({ to, subject, html, from }) {
    const resend = getResend();
    if (!resend) {
        console.log('[Email MOCK]', { to, subject });
        return { success: false, reason: 'Resend not configured' };
    }

    try {
        const { data, error } = await resend.emails.send({
            from: from || 'Smarter.Poker <noreply@smarter.poker>',
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
        });

        if (error) {
            console.error('[Email] Send error:', error);
            return { success: false, reason: error.message || 'Send failed' };
        }

        return { success: true, messageId: data?.id };
    } catch (err) {
        console.error('[Email] Error:', err.message);
        return { success: false, reason: err.message };
    }
}

// ==========================================
// Welcome & Auth Emails
// ==========================================

export async function sendWelcomeEmail(email, name) {
    return sendEmail({
        to: email,
        subject: 'Welcome to Smarter.Poker!',
        html: emailWrapper('Welcome', `
            <h2>Welcome to Smarter.Poker, ${name || 'Player'}!</h2>
            <p>Your account has been created and you're ready to start playing smarter.</p>
            <p>Here's what you can do:</p>
            <ul style="padding-left: 20px; color: #050505; font-size: 14px; line-height: 2;">
                <li>Find poker games near you</li>
                <li>Join the waitlist at your favorite venues</li>
                <li>Track your sessions and progress</li>
                <li>Connect with other players</li>
                <li>Create or join home games</li>
            </ul>
            <div style="text-align: center; margin: 24px 0;">
                <a href="https://smarter.poker/hub" class="btn">Get Started</a>
            </div>
        `),
    });
}

export async function sendPasswordResetEmail(email, resetLink) {
    return sendEmail({
        to: email,
        subject: 'Reset your Smarter.Poker password',
        html: emailWrapper('Password Reset', `
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your password. Click the button below to create a new password.</p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="${resetLink}" class="btn">Reset Password</a>
            </div>
            <p class="muted">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        `),
    });
}

// ==========================================
// Waitlist & Seat Notifications
// ==========================================

export async function sendSeatReadyEmail(email, name, venueName, game) {
    return sendEmail({
        to: email,
        subject: `Your seat is ready at ${venueName}!`,
        html: emailWrapper('Seat Ready', `
            <h2>Your Seat is Ready!</h2>
            <p>Hi ${name || 'Player'},</p>
            <p>Great news - your seat at <strong>${venueName}</strong> for <strong>${game}</strong> is ready!</p>
            <div class="highlight">
                <p>Please check in within 5 minutes or you may lose your spot.</p>
            </div>
            <div style="text-align: center; margin: 24px 0;">
                <a href="https://smarter.poker/hub/commander/check-in" class="btn">Check In Now</a>
            </div>
        `),
    });
}

export async function sendWaitlistUpdateEmail(email, name, venueName, position, estimatedWait) {
    return sendEmail({
        to: email,
        subject: `Waitlist update - You're #${position} at ${venueName}`,
        html: emailWrapper('Waitlist Update', `
            <h2>Waitlist Position Update</h2>
            <p>Hi ${name || 'Player'},</p>
            <p>Your position at <strong>${venueName}</strong> has been updated.</p>
            <div class="highlight">
                <p>Position: #${position} | Estimated wait: ${estimatedWait} minutes</p>
            </div>
            <p class="muted">We'll notify you when your seat is ready.</p>
        `),
    });
}

// ==========================================
// Tournament Notifications
// ==========================================

export async function sendTournamentConfirmationEmail(email, name, tournamentName, venueName, startTime, buyin) {
    return sendEmail({
        to: email,
        subject: `Registration confirmed: ${tournamentName}`,
        html: emailWrapper('Tournament Registration', `
            <h2>You're Registered!</h2>
            <p>Hi ${name || 'Player'},</p>
            <p>Your registration for <strong>${tournamentName}</strong> is confirmed.</p>
            <div style="margin: 16px 0;">
                <div class="info-row"><span class="info-label">Tournament</span><span class="info-value">${tournamentName}</span></div>
                <div class="info-row"><span class="info-label">Venue</span><span class="info-value">${venueName}</span></div>
                <div class="info-row"><span class="info-label">Start Time</span><span class="info-value">${startTime}</span></div>
                ${buyin ? `<div class="info-row"><span class="info-label">Buy-in</span><span class="info-value">$${buyin}</span></div>` : ''}
            </div>
            <p class="muted">Good luck at the tables!</p>
        `),
    });
}

export async function sendTournamentReminderEmail(email, name, tournamentName, venueName, minutesUntil) {
    return sendEmail({
        to: email,
        subject: `Reminder: ${tournamentName} starts in ${minutesUntil} minutes`,
        html: emailWrapper('Tournament Reminder', `
            <h2>Tournament Starting Soon</h2>
            <p>Hi ${name || 'Player'},</p>
            <p><strong>${tournamentName}</strong> at <strong>${venueName}</strong> starts in <strong>${minutesUntil} minutes</strong>.</p>
            <p>Please arrive on time for registration.</p>
        `),
    });
}

// ==========================================
// Home Game Notifications
// ==========================================

export async function sendHomeGameInviteEmail(email, name, hostName, gameName, date, location) {
    return sendEmail({
        to: email,
        subject: `You're invited to ${gameName}!`,
        html: emailWrapper('Game Invite', `
            <h2>You're Invited!</h2>
            <p>Hi ${name || 'Player'},</p>
            <p><strong>${hostName}</strong> invited you to <strong>${gameName}</strong>.</p>
            <div style="margin: 16px 0;">
                <div class="info-row"><span class="info-label">Game</span><span class="info-value">${gameName}</span></div>
                <div class="info-row"><span class="info-label">Host</span><span class="info-value">${hostName}</span></div>
                <div class="info-row"><span class="info-label">Date</span><span class="info-value">${date}</span></div>
                ${location ? `<div class="info-row"><span class="info-label">Area</span><span class="info-value">${location}</span></div>` : ''}
            </div>
            <div style="text-align: center; margin: 24px 0;">
                <a href="https://smarter.poker/hub/commander/home-games" class="btn">RSVP Now</a>
            </div>
        `),
    });
}

export async function sendHomeGameReminderEmail(email, name, gameName, date, hostName) {
    return sendEmail({
        to: email,
        subject: `Reminder: ${gameName} is coming up!`,
        html: emailWrapper('Game Reminder', `
            <h2>Game Reminder</h2>
            <p>Hi ${name || 'Player'},</p>
            <p><strong>${gameName}</strong> hosted by <strong>${hostName}</strong> is on <strong>${date}</strong>.</p>
            <p>The host will share the exact location closer to game time.</p>
            <p class="muted">Have fun at the tables!</p>
        `),
    });
}

// ==========================================
// Social Notifications
// ==========================================

export async function sendNewFollowerEmail(email, name, followerName) {
    return sendEmail({
        to: email,
        subject: `${followerName} started following you`,
        html: emailWrapper('New Follower', `
            <h2>New Follower</h2>
            <p>Hi ${name || 'Player'},</p>
            <p><strong>${followerName}</strong> started following you on Smarter.Poker.</p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="https://smarter.poker/hub/friends" class="btn">View Profile</a>
            </div>
        `),
    });
}

export async function sendPageFollowerEmail(email, pageName, followerName) {
    return sendEmail({
        to: email,
        subject: `${followerName} followed ${pageName}`,
        html: emailWrapper('Page Update', `
            <h2>New Page Follower</h2>
            <p><strong>${followerName}</strong> started following <strong>${pageName}</strong>.</p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="https://smarter.poker/hub/social-pages" class="btn">View Page</a>
            </div>
        `),
    });
}

// ==========================================
// Promotion & Comp Notifications
// ==========================================

export async function sendPromotionWinnerEmail(email, name, venueName, promotionName, prizeAmount) {
    return sendEmail({
        to: email,
        subject: `You won ${promotionName} at ${venueName}!`,
        html: emailWrapper('Winner', `
            <h2>Congratulations, ${name || 'Player'}!</h2>
            <p>You won <strong>${promotionName}</strong> at <strong>${venueName}</strong>!</p>
            <div class="highlight">
                <p>Prize: $${prizeAmount}</p>
            </div>
            <p>See staff to claim your prize.</p>
        `),
    });
}

export async function sendCompBalanceEmail(email, name, venueName, compAmount, newBalance) {
    return sendEmail({
        to: email,
        subject: `You earned $${compAmount.toFixed(2)} in comps at ${venueName}`,
        html: emailWrapper('Comps Earned', `
            <h2>Comps Earned</h2>
            <p>Hi ${name || 'Player'},</p>
            <p>You earned <strong>$${compAmount.toFixed(2)}</strong> in comps at <strong>${venueName}</strong>.</p>
            <div class="highlight">
                <p>New balance: $${newBalance.toFixed(2)}</p>
            </div>
            <p class="muted">Ask staff to redeem your comps.</p>
        `),
    });
}

// ==========================================
// Admin & System Emails
// ==========================================

export async function sendVenueOnboardingEmail(email, venueName, adminName) {
    return sendEmail({
        to: email,
        subject: `Welcome to Club Commander - ${venueName}`,
        html: emailWrapper('Venue Onboarding', `
            <h2>Welcome to Club Commander!</h2>
            <p>Hi ${adminName || 'Admin'},</p>
            <p><strong>${venueName}</strong> has been set up on Club Commander. Here's how to get started:</p>
            <ol style="padding-left: 20px; color: #050505; font-size: 14px; line-height: 2;">
                <li>Set up your tables and games</li>
                <li>Configure your waitlist</li>
                <li>Add staff members</li>
                <li>Create your first tournament</li>
                <li>Set up promotions</li>
            </ol>
            <div style="text-align: center; margin: 24px 0;">
                <a href="https://smarter.poker/commander/dashboard" class="btn">Go to Dashboard</a>
            </div>
        `),
    });
}

/**
 * Get email service status for health checks
 */
export function getEmailStatus() {
    return {
        configured: isEmailConfigured(),
        hasApiKey: !!process.env.RESEND_API_KEY,
        provider: 'Resend',
    };
}
