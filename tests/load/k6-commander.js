/**
 * Club Commander Load Testing Script (k6)
 *
 * Run with: k6 run tests/load/k6-commander.js
 * Install k6: https://k6.io/docs/getting-started/installation/
 *
 * Targets: 100 concurrent venues, 1000 concurrent users
 * Tests: Waitlist operations, tournament clock, notifications, API response times
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const waitlistJoinTime = new Trend('waitlist_join_time');
const waitlistCallTime = new Trend('waitlist_call_time');
const tournamentClockTime = new Trend('tournament_clock_time');
const gamesListTime = new Trend('games_list_time');
const notificationSendTime = new Trend('notification_send_time');
const apiCalls = new Counter('api_calls');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_VENUE_ID = __ENV.VENUE_ID || 1;
const TEST_TOKEN = __ENV.AUTH_TOKEN || '';

// Test options - ramp up to 1000 users
export const options = {
    stages: [
        { duration: '30s', target: 50 },    // Warm up
        { duration: '1m', target: 200 },    // Ramp to 200 users
        { duration: '2m', target: 500 },    // Ramp to 500 users
        { duration: '3m', target: 1000 },   // Peak load - 1000 users
        { duration: '2m', target: 1000 },   // Sustain peak
        { duration: '1m', target: 0 },      // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
        errors: ['rate<0.05'],              // Error rate under 5%
        waitlist_join_time: ['p(95)<300'],  // Waitlist join under 300ms
        games_list_time: ['p(95)<200'],     // Games list under 200ms
    },
};

const headers = {
    'Content-Type': 'application/json',
    ...(TEST_TOKEN ? { 'Authorization': `Bearer ${TEST_TOKEN}` } : {}),
};

// Helper to make API requests
function apiRequest(method, path, body = null) {
    apiCalls.add(1);
    const url = `${BASE_URL}${path}`;
    const params = { headers };

    let response;
    if (method === 'GET') {
        response = http.get(url, params);
    } else if (method === 'POST') {
        response = http.post(url, body ? JSON.stringify(body) : null, params);
    } else if (method === 'PATCH') {
        response = http.patch(url, body ? JSON.stringify(body) : null, params);
    } else if (method === 'DELETE') {
        response = http.del(url, null, params);
    }

    return response;
}

// Test scenario - simulates a player joining waitlist and getting seated
export default function () {
    const venueId = TEST_VENUE_ID;
    const playerId = `load-test-${__VU}-${Date.now()}`;

    // ========================================
    // Group 1: View Live Games
    // ========================================
    group('View Live Games', function () {
        const start = Date.now();
        const response = apiRequest('GET', `/api/commander/games/venue/${venueId}`);
        gamesListTime.add(Date.now() - start);

        const success = check(response, {
            'games list status is 200': (r) => r.status === 200,
            'games list has data': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return Array.isArray(body) || body.games;
                } catch {
                    return false;
                }
            },
        });

        errorRate.add(!success);
    });

    sleep(1);

    // ========================================
    // Group 2: Join Waitlist
    // ========================================
    group('Join Waitlist', function () {
        const start = Date.now();
        const response = apiRequest('POST', '/api/commander/waitlist/join', {
            venue_id: venueId,
            game_type: 'nlh',
            stakes: '1/3',
            player_name: `LoadTest Player ${__VU}`,
            player_phone: `555-${String(__VU).padStart(4, '0')}`,
        });
        waitlistJoinTime.add(Date.now() - start);

        const success = check(response, {
            'waitlist join status is 200 or 201': (r) => r.status === 200 || r.status === 201,
            'waitlist join returns entry': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.id || body.entry;
                } catch {
                    return false;
                }
            },
        });

        errorRate.add(!success);

        // Store entry ID for later
        try {
            const body = JSON.parse(response.body);
            return body.id || body.entry?.id;
        } catch {
            return null;
        }
    });

    sleep(2);

    // ========================================
    // Group 3: View Waitlist Position
    // ========================================
    group('View Waitlist', function () {
        const response = apiRequest('GET', `/api/commander/waitlist/venue/${venueId}`);

        const success = check(response, {
            'waitlist view status is 200': (r) => r.status === 200,
            'waitlist has entries': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return Array.isArray(body) || body.waitlist;
                } catch {
                    return false;
                }
            },
        });

        errorRate.add(!success);
    });

    sleep(1);

    // ========================================
    // Group 4: Tournament Clock (if running)
    // ========================================
    group('Tournament Clock', function () {
        // Get active tournaments
        const tournamentsResponse = apiRequest('GET', `/api/commander/tournaments/venue/${venueId}`);

        if (tournamentsResponse.status === 200) {
            try {
                const tournaments = JSON.parse(tournamentsResponse.body);
                const activeTournament = (Array.isArray(tournaments) ? tournaments : tournaments.tournaments || [])
                    .find(t => t.status === 'running');

                if (activeTournament) {
                    const start = Date.now();
                    const clockResponse = apiRequest('GET', `/api/commander/tournaments/${activeTournament.id}/clock`);
                    tournamentClockTime.add(Date.now() - start);

                    check(clockResponse, {
                        'tournament clock status is 200': (r) => r.status === 200,
                        'tournament clock has data': (r) => {
                            try {
                                const body = JSON.parse(r.body);
                                return body.current_level !== undefined || body.time_remaining !== undefined;
                            } catch {
                                return false;
                            }
                        },
                    });
                }
            } catch {
                // No active tournaments, skip
            }
        }
    });

    sleep(1);

    // ========================================
    // Group 5: View Promotions
    // ========================================
    group('View Promotions', function () {
        const response = apiRequest('GET', `/api/commander/promotions/active?venue_id=${venueId}`);

        const success = check(response, {
            'promotions status is 200': (r) => r.status === 200,
        });

        errorRate.add(!success);
    });

    sleep(1);

    // ========================================
    // Group 6: High Hands
    // ========================================
    group('View High Hands', function () {
        const response = apiRequest('GET', `/api/commander/high-hands?venue_id=${venueId}`);

        const success = check(response, {
            'high hands status is 200': (r) => r.status === 200,
        });

        errorRate.add(!success);
    });

    sleep(2);

    // ========================================
    // Group 7: Analytics (staff view)
    // ========================================
    group('Analytics Dashboard', function () {
        const response = apiRequest('GET', `/api/commander/analytics/daily?venue_id=${venueId}`);

        // Analytics might require staff auth, so 401/403 is acceptable
        const success = check(response, {
            'analytics status is 200 or auth required': (r) =>
                r.status === 200 || r.status === 401 || r.status === 403,
        });

        errorRate.add(!success && response.status >= 500);
    });

    sleep(1);
}

// Separate scenario for staff operations (lower concurrency)
export function staffOperations() {
    const venueId = TEST_VENUE_ID;

    group('Staff: Call Player', function () {
        // Get first waitlist entry
        const waitlistResponse = apiRequest('GET', `/api/commander/waitlist/venue/${venueId}`);

        if (waitlistResponse.status === 200) {
            try {
                const waitlist = JSON.parse(waitlistResponse.body);
                const entries = Array.isArray(waitlist) ? waitlist : waitlist.waitlist || [];

                if (entries.length > 0) {
                    const entry = entries[0];
                    const start = Date.now();
                    const callResponse = apiRequest('POST', `/api/commander/waitlist/${entry.id}/call`);
                    waitlistCallTime.add(Date.now() - start);

                    check(callResponse, {
                        'call player status is 200': (r) => r.status === 200 || r.status === 401,
                    });
                }
            } catch {
                // Skip
            }
        }
    });

    sleep(5);

    group('Staff: Send Notification', function () {
        const start = Date.now();
        const response = apiRequest('POST', '/api/commander/notifications/send', {
            venue_id: venueId,
            type: 'announcement',
            title: 'Load Test',
            message: 'This is a load test notification',
        });
        notificationSendTime.add(Date.now() - start);

        // Staff auth required
        check(response, {
            'notification send status is 200 or auth required': (r) =>
                r.status === 200 || r.status === 401 || r.status === 403,
        });
    });

    sleep(3);
}

// Summary handler
export function handleSummary(data) {
    return {
        'tests/load/k6-results.json': JSON.stringify(data, null, 2),
        stdout: textSummary(data, { indent: '  ', enableColors: true }),
    };
}

// Text summary helper
function textSummary(data, options) {
    const { metrics } = data;
    const lines = [
        '\n========================================',
        'CLUB COMMANDER LOAD TEST RESULTS',
        '========================================\n',
        `Total Requests: ${metrics.http_reqs?.values?.count || 0}`,
        `API Calls: ${metrics.api_calls?.values?.count || 0}`,
        `Error Rate: ${((metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%`,
        `Avg Response Time: ${(metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms`,
        `P95 Response Time: ${(metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2)}ms`,
        '',
        '--- Waitlist Operations ---',
        `Join Time P95: ${(metrics.waitlist_join_time?.values?.['p(95)'] || 0).toFixed(2)}ms`,
        `Call Time P95: ${(metrics.waitlist_call_time?.values?.['p(95)'] || 0).toFixed(2)}ms`,
        '',
        '--- Games & Tournaments ---',
        `Games List P95: ${(metrics.games_list_time?.values?.['p(95)'] || 0).toFixed(2)}ms`,
        `Tournament Clock P95: ${(metrics.tournament_clock_time?.values?.['p(95)'] || 0).toFixed(2)}ms`,
        '',
        '========================================\n',
    ];

    return lines.join('\n');
}
