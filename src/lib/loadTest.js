/**
 * Load Testing Infrastructure for Smarter.Poker
 * Built-in load testing tool that can be run from API or CLI
 *
 * Usage:
 *   // From API route:
 *   import { runLoadTest } from '@/lib/loadTest';
 *   const results = await runLoadTest({ url: '/api/poker/pages', concurrency: 10 });
 *
 *   // From CLI, run from the repo root:
 *   node -e "require(process.cwd() + '/src/lib/loadTest').runLoadTestCLI()"
 */

/**
 * Execute a single request and measure timing
 * @param {string} url - Full URL to test
 * @param {object} options - Fetch options
 * @returns {object} { status, duration, success, error }
 */
async function executeRequest(url, options = {}) {
    const start = Date.now();
    try {
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const duration = Date.now() - start;
        return {
            status: res.status,
            duration,
            success: res.status >= 200 && res.status < 400,
        };
    } catch (error) {
        return {
            status: 0,
            duration: Date.now() - start,
            success: false,
            error: error.message,
        };
    }
}

/**
 * Run a load test against an endpoint
 * @param {object} config
 * @param {string} config.url - URL to test (full URL)
 * @param {string} [config.method='GET'] - HTTP method
 * @param {object} [config.headers] - Request headers
 * @param {object} [config.body] - Request body for POST/PUT
 * @param {number} [config.concurrency=10] - Concurrent requests
 * @param {number} [config.totalRequests=100] - Total requests to send
 * @param {number} [config.rampUpMs=1000] - Ramp-up period in ms
 * @returns {object} Test results
 */
export async function runLoadTest(config) {
    const {
        url,
        method = 'GET',
        headers = {},
        body,
        concurrency = 10,
        totalRequests = 100,
        rampUpMs = 1000,
    } = config;

    const results = [];
    const startTime = Date.now();
    let completed = 0;

    // Create batches based on concurrency
    const batches = [];
    for (let i = 0; i < totalRequests; i += concurrency) {
        const batchSize = Math.min(concurrency, totalRequests - i);
        batches.push(batchSize);
    }

    // Execute batches with ramp-up delay
    const delayPerBatch = rampUpMs / Math.max(batches.length, 1);

    for (const batchSize of batches) {
        const batchPromises = [];
        for (let j = 0; j < batchSize; j++) {
            batchPromises.push(
                executeRequest(url, { method, headers, body }).then(r => {
                    completed++;
                    results.push(r);
                    return r;
                })
            );
        }
        await Promise.all(batchPromises);

        if (delayPerBatch > 0) {
            await new Promise(resolve => setTimeout(resolve, delayPerBatch));
        }
    }

    const totalDuration = Date.now() - startTime;

    // Calculate statistics
    const durations = results.map(r => r.duration).sort((a, b) => a - b);
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    const stats = {
        // Summary
        url,
        method,
        totalRequests: results.length,
        concurrency,
        totalDurationMs: totalDuration,

        // Success/Failure
        successCount,
        failCount,
        successRate: ((successCount / results.length) * 100).toFixed(1) + '%',

        // Throughput
        requestsPerSecond: ((results.length / totalDuration) * 1000).toFixed(1),

        // Latency
        latency: {
            min: durations[0] || 0,
            max: durations[durations.length - 1] || 0,
            mean: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) || 0,
            median: durations[Math.floor(durations.length / 2)] || 0,
            p95: durations[Math.floor(durations.length * 0.95)] || 0,
            p99: durations[Math.floor(durations.length * 0.99)] || 0,
        },

        // Status code distribution
        statusCodes: results.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {}),

        // Error summary
        errors: results.filter(r => r.error).map(r => r.error).slice(0, 10),
    };

    return stats;
}

/**
 * Run load tests against multiple endpoints
 * @param {object[]} tests - Array of test configs
 * @returns {object} Combined results
 */
export async function runLoadTestSuite(tests) {
    const results = {};

    for (const test of tests) {
        const name = test.name || test.url;
        console.debug(`[LoadTest] Running: ${name}`);
        results[name] = await runLoadTest(test);
        console.debug(`[LoadTest] ${name}: ${results[name].requestsPerSecond} req/s, p95=${results[name].latency.p95}ms`);
    }

    return results;
}

/**
 * Predefined test suite for Smarter.Poker
 * @param {string} baseUrl - Base URL (e.g., 'http://localhost:3000')
 */
export function getDefaultTestSuite(baseUrl) {
    return [
        {
            name: 'Homepage',
            url: `${baseUrl}/`,
            concurrency: 20,
            totalRequests: 100,
        },
        {
            name: 'Poker Pages API',
            url: `${baseUrl}/api/poker/pages?category=all&sort=popular&limit=20`,
            concurrency: 15,
            totalRequests: 100,
        },
        {
            name: 'Social Interactions API',
            url: `${baseUrl}/api/social/interactions?post_id=test&type=like`,
            concurrency: 10,
            totalRequests: 50,
        },
        {
            name: 'Social Pages API',
            url: `${baseUrl}/api/social/pages?limit=20`,
            concurrency: 15,
            totalRequests: 100,
        },
        {
            name: 'Follow API',
            url: `${baseUrl}/api/poker/follow?page_type=venue&page_id=test`,
            concurrency: 10,
            totalRequests: 50,
        },
        {
            name: 'Notifications API',
            url: `${baseUrl}/api/notifications`,
            concurrency: 10,
            totalRequests: 50,
        },
    ];
}
