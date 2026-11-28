/**
 * TRAINING CALENDAR — Activity Heatmap
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GitHub-style contribution heatmap showing daily training activity.
 * Clickable days, streak counter, monthly stats.
 *
 * Route: /hub/training/training-calendar
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-61 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-51 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
function buildHeatmap(sessions) {
  const dayMap = {};
  if (!sessions) return dayMap;
  sessions.forEach((s) => {
    const day = new Date(s.created_at).toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { hands: 0, sessions: 0, correct: 0 };
    dayMap[day].hands += s.hands_played || s.total_questions || 0;
    dayMap[day].correct += s.correct_count || s.correct_answers || 0;
    dayMap[day].sessions += 1;
  });
  return dayMap;
}

function getIntensity(hands) {
  if (!hands || hands === 0) return 0;
  if (hands < 10) return 1;
  if (hands < 30) return 2;
  if (hands < 60) return 3;
  return 4;
}

const INTENSITY_COLORS = [
  '#0a1828', // 0 - none
  'rgba(73,198,255,0.28)', // 1 - light
  'rgba(73,198,255,0.48)', // 2 - medium
  'rgba(73,198,255,0.70)', // 3 - heavy
  'rgba(134,218,255,0.95)', // 4 - extreme
];
const INTENSITY_LABELS = ['No Hands', '1-9 Hands', '10-29 Hands', '30-59 Hands', '60+ Hands'];

// BUG FIX (TRAIN-CALENDAR-A11Y-1): SVG icon components replacing the
// goal-met ★ indicator and the bare ← back arrow entity. Heatmap cells
// gain per-day aria-labels so screen readers announce date+hands when
// focused/inspected. Same surface-specific a11y pattern as PR #320/
// #322/#324/#327/#328/#329/#330/#331/#332/#333.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function StarSparkleIcon({ size=12 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <polygon points="12 2 14 9 22 12 14 15 12 22 10 15 2 12 10 9 12 2"/>
      <circle cx="20" cy="4" r="1"/>
      <circle cx="4" cy="20" r="1"/>
    </svg>
  );
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function computeStreak(dayMap) {
  let streak = 0;
  const today = new Date();
  let d = new Date(today);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (dayMap[key]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (streak === 0 && d.toDateString() === today.toDateString()) {
      // Today hasn't had a session yet, check yesterday
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function computeWeeklyStats(dayMap) {
  const today = new Date();
  let hands = 0,
    correct = 0,
    sessions = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const data = dayMap[d.toISOString().slice(0, 10)];
    if (data) {
      hands += data.hands;
      correct += data.correct;
      sessions += data.sessions;
    }
  }
  return {
    hands,
    sessions,
    accuracy: hands > 0 ? Math.round((correct / hands) * 100) : 0,
  };
}

export default function TrainingCalendarPage() {
  const router = useRouter();
  useTrainingBus('training-calendar');
  const [loading, setLoading] = useState(true);
  // `null` means the authenticated history has not been verified. An empty
  // object is reserved for a successful response with no completed sessions.
  const [dayMap, setDayMap] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [signedOut, setSignedOut] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const user = getAuthUser();
    if (!user?.id) {
      setSignedOut(true);
      setDayMap(null);
      setLoading(false);
      return;
    }
    setSignedOut(false);
    try {
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      if (!token) throw new Error('Authenticated Training history requires a valid access token.');
      const res = await authedFetch('/api/training/get-sessions?limit=500', {
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data?.success !== true || !Array.isArray(data.sessions)) {
        throw new Error('Verified Training history was not returned.');
      }
      setDayMap(buildHeatmap(data.sessions));
    } catch (e) {
      console.warn('[Calendar]', e);
      setDayMap(null);
      setFetchError('Failed To Load Training Calendar. Please Try Again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    const h = () => fetchData();
    const unsub = eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => unsub();
  }, [fetchData]);

  // Generate calendar grid (last 16 weeks)
  const weeks = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 16 * 7 + (6 - today.getDay()));

  for (let w = 0; w < 16; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + w * 7 + d);
      const key = date.toISOString().slice(0, 10);
      const dayData = dayMap ? dayMap[key] || null : null;
      const isToday = date.toDateString() === today.toDateString();
      const isFuture = date > today;
      week.push({ key, date: new Date(date), data: dayData, isToday, isFuture });
    }
    weeks.push(week);
  }

  const authoritativeDataReady = dayMap !== null;
  const streak = authoritativeDataReady ? computeStreak(dayMap) : null;
  const weeklyStats = authoritativeDataReady ? computeWeeklyStats(dayMap) : null;
  const todayHands = authoritativeDataReady
    ? dayMap[today.toISOString().slice(0, 10)]?.hands || 0
    : null;
  const totalDays = authoritativeDataReady ? Object.keys(dayMap).length : null;
  const totalHands = authoritativeDataReady
    ? Object.values(dayMap).reduce((s, d) => s + d.hands, 0)
    : null;
  const selectedData = authoritativeDataReady && selectedDay ? dayMap[selectedDay] : null;

  return (
    <>
      <Head>
        <title>Training Calendar | Smarter.Poker GTO Training</title>
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={`sp-training-journey sp-training-journey--calendar ${st.shell}`}>
        <TrainingPageHead slug="training-training-calendar" note="Your Activity Heatmap" />
        <div className={`sp-journey-main ${st.page} ${st.journey}`}>

          {loading && (
            <section className={`sd-panel ${st.panel}`} role="status" aria-label="Loading Calendar">
              <div className={st.skeleton} aria-hidden><span /><span /><span /><span /><span /><span /></div>
              <p className={st.small}>Loading Verified Training History...</p>
            </section>
          )}

          {!loading && signedOut && (
            <section role="status" className={`sd-panel ${st.panel} ${st.state}`}>
              <h2 className={st.title}>Sign In To View Your Training Calendar</h2>
              <p className={st.copy}>Your Verified Sessions, Activity Heatmap, And Streak Appear After You Sign In.</p>
              <button
                type="button"
                onClick={() => router.push('/auth/login?redirect=/hub/training/training-calendar')}
                className="sd-button sd-primary"
              >
                Sign In
              </button>
            </section>
          )}

          {!loading && !signedOut && (fetchError || !authoritativeDataReady) && (
            <ErrorBanner
              message={fetchError || 'Verified Training Calendar Data Is Unavailable.'}
              onRetry={fetchData}
            />
          )}

          {!loading && !signedOut && !fetchError && authoritativeDataReady && (
            <>
              {/* Stats Row */}
              <section className={st.metrics} style={{ '--cols': 3 }} aria-label="Calendar Summary">
                <div className={`sd-metric ${st.metric}`}>
                  <strong className={st.metricValue} data-tone="ice" role="status" aria-label={`${streak} day streak`}>{streak}</strong>
                  <span className={st.metricLabel}>Day Streak</span>
                </div>
                <div className={`sd-metric ${st.metric}`}>
                  <strong className={st.metricValue}>{totalDays}</strong>
                  <span className={st.metricLabel}>Active Days</span>
                </div>
                <div className={`sd-metric ${st.metric}`}>
                  <strong className={st.metricValue}>{totalHands}</strong>
                  <span className={st.metricLabel}>Total Hands</span>
                </div>
              </section>

              {/* Heatmap Grid */}
              <section className={`sd-panel ${st.panel}`} aria-labelledby="calendar-heatmap-title">
                <div className={st.panelHead}>
                  <h2 id="calendar-heatmap-title" className={st.title}>Last 16 Weeks</h2>
                  <span className={st.small}>Tap A Day For Details</span>
                </div>
                <div className={st.heatmap}>
                  <div className={st.heatDays} aria-hidden>
                    {DAYS.map((d, i) => (
                      <span key={i} title={DAY_NAMES[i]}>{i % 2 === 1 ? d : ''}</span>
                    ))}
                  </div>
                  <div className={st.heatWeeks}>
                    {weeks.map((week, wIdx) => (
                      <div key={wIdx} className={st.heatWeek}>
                        {week.map((cell) => (
                          <button
                            key={cell.key}
                            type="button"
                            disabled={cell.isFuture}
                            aria-label={cell.isFuture ? `${cell.date.toDateString()} (future)` : `${cell.date.toDateString()}: ${cell.data?.hands || 0} hands, ${cell.data?.sessions || 0} sessions${cell.isToday ? ' - today' : ''}`}
                            aria-pressed={selectedDay === cell.key}
                            onClick={() =>
                              !cell.isFuture &&
                              setSelectedDay(cell.key === selectedDay ? null : cell.key)
                            }
                            className={st.heatCell}
                            data-today={cell.isToday ? 'true' : undefined}
                            data-future={cell.isFuture ? 'true' : undefined}
                            data-level={getIntensity(cell.data?.hands || 0)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Legend */}
                <div className={st.heatLegend}>
                  <span>Less</span>
                  {INTENSITY_COLORS.map((c, i) => (
                    <span key={c} className={st.heatSwatch} data-level={i} title={INTENSITY_LABELS[i]} aria-label={INTENSITY_LABELS[i]} role="img" />
                  ))}
                  <span>More</span>
                </div>
              </section>

              {/* Selected Day Detail */}
              {selectedDay && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`sd-panel ${st.panel}`}
                  aria-live="polite"
                  aria-labelledby="calendar-day-title"
                >
                  <div className={st.panelHead}>
                    <h2 id="calendar-day-title" className={st.title}>
                      {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </h2>
                    <button type="button" className={`sd-button ${st.close}`} aria-label="Close Day Details" onClick={() => setSelectedDay(null)}>✕</button>
                  </div>
                  {selectedData ? (
                    <dl className={st.facts3}>
                      <div><dt>Hands</dt><dd className={st.ice}>{selectedData.hands}</dd></div>
                      <div><dt>Sessions</dt><dd>{selectedData.sessions}</dd></div>
                      <div>
                        <dt>Accuracy</dt>
                        <dd>
                          {selectedData.hands > 0
                            ? Math.round((selectedData.correct / selectedData.hands) * 100)
                            : 0}
                          %
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className={st.small}>No Training On This Day</p>
                  )}
                </motion.section>
              )}

              {/* Daily Goal */}
              <section className={`sd-panel ${st.panel}`} aria-labelledby="calendar-goal-title">
                <div className={st.panelHead}>
                  <h2 id="calendar-goal-title" className={st.title}>Daily Training Goal</h2>
                  <strong className={st.ice}>{todayHands} / 50 Hands</strong>
                </div>
                <div className={st.track} role="progressbar" aria-label="Daily Training Goal" aria-valuenow={Math.min(50, todayHands)} aria-valuemin={0} aria-valuemax={50}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (todayHands / 50) * 100)}%` }}
                    className={st.fill}
                  />
                </div>
                {todayHands >= 50 && (
                  <p className={`${st.small} ${st.ice}`}>
                    {/* TRAIN-CALENDAR-A11Y-1: SVG sparkle replaces ★ */}
                    <span style={{ display: 'inline-flex', verticalAlign: '-1px', marginRight: 6 }} aria-hidden><StarSparkleIcon size={12} /></span>
                    Goal Met! +1 To Streak
                  </p>
                )}
              </section>

              {/* Weekly Summary */}
              <section className={`sd-panel ${st.panel}`} aria-labelledby="calendar-week-title">
                <h2 id="calendar-week-title" className={st.title}>Last 7 Days Summary</h2>
                <dl className={st.facts3}>
                  <div><dt>Sessions</dt><dd>{weeklyStats.sessions}</dd></div>
                  <div><dt>Hands Played</dt><dd>{weeklyStats.hands}</dd></div>
                  <div><dt>Avg Accuracy</dt><dd className={st.ice}>{weeklyStats.accuracy}%</dd></div>
                </dl>
              </section>
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
