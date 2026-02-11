/**
 * Stripe Connection Diagnostic
 * GET /api/store/stripe-test
 * Tests Stripe API connectivity from Vercel runtime
 * TEMPORARY - remove after debugging
 */

export default async function handler(req, res) {
    const results = {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        checks: {}
    };

    // Check 1: Environment variables
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    results.checks.envVars = {
        hasSecretKey: !!secretKey,
        secretKeyPrefix: secretKey ? secretKey.substring(0, 7) : 'MISSING',
        secretKeyLength: secretKey ? secretKey.length : 0,
        hasPublishableKey: !!publishableKey,
        publishableKeyPrefix: publishableKey ? publishableKey.substring(0, 7) : 'MISSING'
    };

    // Check 2: Can we reach api.stripe.com via fetch?
    try {
        const fetchStart = Date.now();
        const fetchResponse = await fetch('https://api.stripe.com/v1/customers?limit=1', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            signal: AbortSignal.timeout(10000)
        });
        const fetchData = await fetchResponse.json();
        results.checks.directFetch = {
            success: true,
            status: fetchResponse.status,
            statusText: fetchResponse.statusText,
            responseType: fetchData.object,
            durationMs: Date.now() - fetchStart
        };
    } catch (fetchErr) {
        results.checks.directFetch = {
            success: false,
            error: fetchErr.message,
            errorName: fetchErr.name,
            durationMs: 0
        };
    }

    // Check 3: Can we use the Stripe SDK?
    try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(secretKey, {
            timeout: 10000,
            maxNetworkRetries: 1,
            telemetry: false
        });

        const sdkStart = Date.now();
        const customers = await stripe.customers.list({ limit: 1 });
        results.checks.stripeSdk = {
            success: true,
            responseType: customers.object,
            customerCount: customers.data.length,
            durationMs: Date.now() - sdkStart
        };
    } catch (sdkErr) {
        results.checks.stripeSdk = {
            success: false,
            errorType: sdkErr.type,
            errorCode: sdkErr.code,
            statusCode: sdkErr.statusCode,
            message: sdkErr.message,
            rawType: sdkErr.rawType,
            detail: sdkErr.detail
        };
    }

    // Check 4: DNS resolution test
    try {
        const dnsStart = Date.now();
        const dnsResponse = await fetch('https://api.stripe.com', {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000)
        });
        results.checks.dns = {
            success: true,
            status: dnsResponse.status,
            durationMs: Date.now() - dnsStart
        };
    } catch (dnsErr) {
        results.checks.dns = {
            success: false,
            error: dnsErr.message,
            errorName: dnsErr.name
        };
    }

    return res.status(200).json(results);
}
