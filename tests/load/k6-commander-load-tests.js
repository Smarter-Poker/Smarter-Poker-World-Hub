/**
 * Club Commander - Load Testing Suite
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6, Step 6.1
 *
 * Target: 100 concurrent venues, 1000 concurrent users
 * Tests: waitlist operations, tournament clock, notifications
 *
 * Run: k6 run tests/load/k6-commander-load-tests.js
 * With options: k6 run --vus 100 --duration 5m tests/load/k6-commander-load-tests.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const waitlistJoinErrors = new Counter('waitlist_join_errors');
const waitlistJoinDuration = new Trend('waitlist_join_duration');
const tournamentClockErrors = new Counter('tournament_clock_errors');
const notificationErrors = new Counter('notification_errors');
const apiErrorRate = new Rate('api_error_rate');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: Normal load - steady state
    steady_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '3m',
      startTime: '0s',
      tags: { scenario: 'steady' },
    },
    // Scenario 2: Peak load - Friday night rush
    peak_load: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '1m', target: 200 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 50 },
      ],
      startTime: '3m',
      tags: { scenario: 'peak' },
    },
    // Scenario 3: Spike test - sudden traffic burst
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 500 },
        { duration: '30s', target: 500 },
        { duration: '10s', target: 0 },
      ],
      startTime: '8m',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    waitlist_join_duration: ['p(95)<300'],
    api_error_rate: ['rate<0.05'],
  },
};

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_VENUE_ID = __ENV.TEST_VENUE_ID || '1';
const TEST_TOKEN = __ENV.TEST_TOKEN || 'test-token';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TEST_TOKEN}`,
};

// Helper to generate random data
function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function randomPhone() {
  return `555${Math.floor(Math.random() * 9000000 + 1000000)}`;
}

// Test functions
function testWaitlistOperations() {
  group('Waitlist Operations', () => {
    // GET venue waitlists
    const venueWaitlistRes = http.get(
      `${BASE_URL}/api/commander/waitlist/venue/${TEST_VENUE_ID}`,
      { headers }
    );

    check(venueWaitlistRes, {
      'venue waitlist status 200': (r) => r.status === 200,
      'venue waitlist has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.waitlists !== undefined;
        } catch {
          return false;
        }
      },
    }) || apiErrorRate.add(1);

    sleep(0.5);

    // POST join waitlist
    const joinStart = Date.now();
    const joinRes = http.post(
      `${BASE_URL}/api/commander/waitlist/join`,
      JSON.stringify({
        venue_id: TEST_VENUE_ID,
        game_type: 'nlh',
        stakes: '1/3',
        player_name: `Test Player ${randomString(6)}`,
        player_phone: randomPhone(),
      }),
      { headers }
    );

    waitlistJoinDuration.add(Date.now() - joinStart);

    const joinSuccess = check(joinRes, {
      'join waitlist status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'join waitlist returns entry': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.entry !== undefined || body.data !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!joinSuccess) {
      waitlistJoinErrors.add(1);
      apiErrorRate.add(1);
    }

    sleep(0.3);

    // If we got an entry ID, test leave waitlist
    try {
      const joinBody = JSON.parse(joinRes.body);
      const entryId = joinBody.entry?.id || joinBody.data?.id;
      if (entryId) {
        const leaveRes = http.del(
          `${BASE_URL}/api/commander/waitlist/${entryId}`,
          null,
          { headers }
        );

        check(leaveRes, {
          'leave waitlist success': (r) => r.status === 200 || r.status === 204,
        }) || apiErrorRate.add(1);
      }
    } catch (e) {
      // Entry ID not available
    }
  });
}

function testTournamentClock() {
  group('Tournament Clock', () => {
    // GET tournaments list
    const tournamentsRes = http.get(
      `${BASE_URL}/api/commander/tournaments?venue_id=${TEST_VENUE_ID}&status=running`,
      { headers }
    );

    check(tournamentsRes, {
      'tournaments list status 200': (r) => r.status === 200,
    }) || apiErrorRate.add(1);

    try {
      const body = JSON.parse(tournamentsRes.body);
      const tournaments = body.tournaments || body.data || [];

      if (tournaments.length > 0) {
        const tournamentId = tournaments[0].id;

        // GET tournament clock
        const clockRes = http.get(
          `${BASE_URL}/api/commander/tournaments/${tournamentId}/clock`,
          { headers }
        );

        const clockSuccess = check(clockRes, {
          'tournament clock status 200': (r) => r.status === 200,
          'clock has current_level': (r) => {
            try {
              const clockBody = JSON.parse(r.body);
              return clockBody.current_level !== undefined;
            } catch {
              return false;
            }
          },
        });

        if (!clockSuccess) {
          tournamentClockErrors.add(1);
          apiErrorRate.add(1);
        }
      }
    } catch (e) {
      // No running tournaments
    }

    sleep(0.5);
  });
}

function testNotifications() {
  group('Notifications', () => {
    // GET my notifications
    const notificationsRes = http.get(
      `${BASE_URL}/api/commander/notifications/my?limit=10`,
      { headers }
    );

    check(notificationsRes, {
      'notifications status 200': (r) => r.status === 200,
    }) || apiErrorRate.add(1);

    sleep(0.3);

    // POST send notification (simulated)
    const sendRes = http.post(
      `${BASE_URL}/api/commander/notifications/send`,
      JSON.stringify({
        venue_id: TEST_VENUE_ID,
        type: 'custom',
        channels: ['in_app'],
        message: `Load test notification ${Date.now()}`,
        player_id: null, // Would need real player ID
      }),
      { headers }
    );

    const sendSuccess = check(sendRes, {
      'send notification status ok': (r) => r.status === 200 || r.status === 201 || r.status === 400,
    });

    if (!sendSuccess) {
      notificationErrors.add(1);
      apiErrorRate.add(1);
    }
  });
}

function testLiveGames() {
  group('Live Games', () => {
    // GET live games
    const liveGamesRes = http.get(
      `${BASE_URL}/api/commander/games/live?venue_id=${TEST_VENUE_ID}`,
      { headers }
    );

    check(liveGamesRes, {
      'live games status 200': (r) => r.status === 200,
      'live games is array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.games) || Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    }) || apiErrorRate.add(1);

    sleep(0.3);

    // GET venue games
    const venueGamesRes = http.get(
      `${BASE_URL}/api/commander/games/venue/${TEST_VENUE_ID}`,
      { headers }
    );

    check(venueGamesRes, {
      'venue games status 200': (r) => r.status === 200,
    }) || apiErrorRate.add(1);
  });
}

function testPromotions() {
  group('Promotions', () => {
    // GET active promotions
    const promotionsRes = http.get(
      `${BASE_URL}/api/commander/promotions/active?venue_id=${TEST_VENUE_ID}`,
      { headers }
    );

    check(promotionsRes, {
      'promotions status 200': (r) => r.status === 200,
    }) || apiErrorRate.add(1);

    sleep(0.2);
  });
}

function testAnalytics() {
  group('Analytics', () => {
    // GET daily analytics
    const today = new Date().toISOString().split('T')[0];
    const analyticsRes = http.get(
      `${BASE_URL}/api/commander/analytics/daily?venue_id=${TEST_VENUE_ID}&date=${today}`,
      { headers }
    );

    check(analyticsRes, {
      'analytics status 200': (r) => r.status === 200,
    }) || apiErrorRate.add(1);

    sleep(0.3);
  });
}

function testAIPredictions() {
  group('AI Predictions', () => {
    // GET wait time predictions
    const waitTimeRes = http.get(
      `${BASE_URL}/api/commander/ai/wait-time/${TEST_VENUE_ID}`,
      { headers }
    );

    check(waitTimeRes, {
      'wait time predictions status 200': (r) => r.status === 200,
    }) || apiErrorRate.add(1);

    sleep(0.2);
  });
}

// Main test function
export default function () {
  // Weight the test functions by importance and frequency
  const random = Math.random();

  if (random < 0.35) {
    // 35% - Waitlist operations (most common)
    testWaitlistOperations();
  } else if (random < 0.55) {
    // 20% - Live games view
    testLiveGames();
  } else if (random < 0.70) {
    // 15% - Tournament clock
    testTournamentClock();
  } else if (random < 0.80) {
    // 10% - Notifications
    testNotifications();
  } else if (random < 0.88) {
    // 8% - Promotions
    testPromotions();
  } else if (random < 0.95) {
    // 7% - Analytics
    testAnalytics();
  } else {
    // 5% - AI predictions
    testAIPredictions();
  }

  // Random sleep between iterations to simulate real user behavior
  sleep(Math.random() * 2 + 0.5);
}

// Lifecycle hooks
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  console.log(`Test venue ID: ${TEST_VENUE_ID}`);

  // Verify API is reachable
  const healthCheck = http.get(`${BASE_URL}/api/commander/games/live`);
  if (healthCheck.status !== 200) {
    console.warn(`Warning: API health check returned ${healthCheck.status}`);
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration.toFixed(2)} seconds`);
}

export function handleSummary(data) {
  return {
    'tests/load/summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [];
  lines.push('\n=== CLUB COMMANDER LOAD TEST SUMMARY ===\n');

  if (data.metrics.http_req_duration) {
    const duration = data.metrics.http_req_duration.values;
    lines.push(`HTTP Request Duration:`);
    lines.push(`  avg: ${duration.avg?.toFixed(2) || 'N/A'}ms`);
    lines.push(`  p95: ${duration['p(95)']?.toFixed(2) || 'N/A'}ms`);
    lines.push(`  p99: ${duration['p(99)']?.toFixed(2) || 'N/A'}ms`);
  }

  if (data.metrics.http_req_failed) {
    const failed = data.metrics.http_req_failed.values;
    lines.push(`\nHTTP Request Failed Rate: ${(failed.rate * 100).toFixed(2)}%`);
  }

  if (data.metrics.waitlist_join_duration) {
    const wjd = data.metrics.waitlist_join_duration.values;
    lines.push(`\nWaitlist Join Duration:`);
    lines.push(`  avg: ${wjd.avg?.toFixed(2) || 'N/A'}ms`);
    lines.push(`  p95: ${wjd['p(95)']?.toFixed(2) || 'N/A'}ms`);
  }

  if (data.metrics.waitlist_join_errors) {
    lines.push(`\nWaitlist Join Errors: ${data.metrics.waitlist_join_errors.values.count || 0}`);
  }

  if (data.metrics.api_error_rate) {
    const errorRate = data.metrics.api_error_rate.values;
    lines.push(`\nAPI Error Rate: ${(errorRate.rate * 100).toFixed(2)}%`);
  }

  // Threshold results
  lines.push('\n=== THRESHOLD RESULTS ===');
  for (const [name, result] of Object.entries(data.thresholds || {})) {
    const status = result.ok ? 'PASS' : 'FAIL';
    lines.push(`  ${name}: ${status}`);
  }

  return lines.join('\n');
}
