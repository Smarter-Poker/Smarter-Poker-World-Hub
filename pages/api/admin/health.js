/**
 * Health Check API - System status for all services
 *
 * GET /api/admin/health
 *   Returns status of all configured services
 */
import { isTwilioConfigured } from '../../../src/lib/commander/twilio';
import { getOneSignalStatus } from '../../../src/lib/commander/pushNotifications';
import { getEmailStatus } from '../../../src/lib/emailTemplates';
import { getSentryStatus } from '../../../src/lib/sentry';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const services = {
        supabase: {
            status: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
            url: process.env.NEXT_PUBLIC_SUPABASE_URL ? '[SET]' : '[NOT SET]',
            anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '[SET]' : '[NOT SET]',
            serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '[SET]' : '[NOT SET]',
        },
        sentry: getSentryStatus(),
        onesignal: getOneSignalStatus(),
        twilio: {
            configured: isTwilioConfigured(),
            hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
            hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
            hasPhoneNumber: !!process.env.TWILIO_PHONE_NUMBER,
        },
        email: getEmailStatus(),
        stripe: {
            configured: !!process.env.STRIPE_SECRET_KEY,
            hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
            hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
        },
        googleMaps: {
            configured: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
            hasApiKey: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
        },
    };

    const configuredCount = Object.values(services).filter(s => s.configured || s.status === 'configured').length;
    const totalServices = Object.keys(services).length;

    return res.status(200).json({
        success: true,
        health: {
            status: configuredCount === totalServices ? 'healthy' : 'partial',
            environment: process.env.NODE_ENV || 'unknown',
            timestamp: new Date().toISOString(),
            version: process.env.BUILD_ID || 'development',
            services,
            summary: {
                configured: configuredCount,
                total: totalServices,
                percentage: Math.round((configuredCount / totalServices) * 100),
            },
        },
    });
}
