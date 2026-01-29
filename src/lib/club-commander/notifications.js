/**
 * Club Commander Notifications Service - Twilio SMS Integration
 * Reference: IMPLEMENTATION_PHASES.md - Step 1.6
 */

// Twilio client initialization
let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.warn('Twilio credentials not configured');
      return null;
    }

    try {
      const twilio = require('twilio');
      twilioClient = twilio(accountSid, authToken);
    } catch (error) {
      console.error('Failed to initialize Twilio client:', error);
      return null;
    }
  }

  return twilioClient;
}

/**
 * Send SMS notification for seat availability
 * @param {string} phone - Phone number to send to
 * @param {string} venue - Venue name
 * @param {string} game - Game description (e.g., "NLH 1/3")
 * @returns {Promise<object>} - Message result
 */
export async function sendSeatNotification(phone, venue, game) {
  const message = `Your seat is ready at ${venue} for ${game}. Please check in within 5 minutes.`;
  return sendSms(phone, message);
}

/**
 * Send SMS notification for tournament starting
 * @param {string} phone - Phone number
 * @param {string} venue - Venue name
 * @param {string} tournament - Tournament name
 * @param {number} minutes - Minutes until start
 * @returns {Promise<object>} - Message result
 */
export async function sendTournamentNotification(phone, venue, tournament, minutes) {
  const message = `${tournament} at ${venue} starts in ${minutes} minutes. Registration closes soon.`;
  return sendSms(phone, message);
}

/**
 * Send custom SMS notification
 * @param {string} phone - Phone number
 * @param {string} message - Message content
 * @returns {Promise<object>} - Message result
 */
export async function sendSms(phone, message) {
  const client = getTwilioClient();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!client || !fromNumber) {
    console.warn('SMS not sent - Twilio not configured');
    return {
      success: false,
      error: 'SMS service not configured',
      mock: true
    };
  }

  try {
    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedPhone) {
      return {
        success: false,
        error: 'Invalid phone number format'
      };
    }

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: normalizedPhone
    });

    return {
      success: true,
      messageId: result.sid,
      status: result.status
    };
  } catch (error) {
    console.error('SMS send error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Input phone number
 * @returns {string|null} - Normalized number or null
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Remove all non-numeric characters
  const digits = phone.replace(/\D/g, '');

  // Check for valid US number (10 digits or 11 with leading 1)
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  } else if (digits.length > 10 && digits[0] !== '1') {
    // International number - assume it's already correct
    return `+${digits}`;
  }

  return null;
}

/**
 * Check if Twilio is configured
 * @returns {boolean}
 */
export function isSmsConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

/**
 * Get SMS configuration status for debugging
 * @returns {object}
 */
export function getSmsStatus() {
  return {
    configured: isSmsConfigured(),
    hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
    hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
    hasPhoneNumber: !!process.env.TWILIO_PHONE_NUMBER
  };
}

// Message templates
export const MESSAGE_TEMPLATES = {
  SEAT_READY: (venue, game) =>
    `Your seat is ready at ${venue} for ${game}. Please check in within 5 minutes.`,

  CALLED_FOR_SEAT: (venue, game, position) =>
    `You're up! ${venue} is calling you for ${game}. You were #${position} on the waitlist.`,

  POSITION_UPDATE: (venue, game, position, wait) =>
    `Update: You're now #${position} for ${game} at ${venue}. Estimated wait: ${wait} minutes.`,

  TOURNAMENT_REMINDER: (venue, tournament, minutes) =>
    `Reminder: ${tournament} at ${venue} starts in ${minutes} minutes.`,

  TOURNAMENT_STARTING: (venue, tournament) =>
    `${tournament} at ${venue} is starting now. Please take your seat.`,

  PROMOTION_ALERT: (venue, promo) =>
    `${venue}: ${promo}`,

  CUSTOM: (message) => message
};
