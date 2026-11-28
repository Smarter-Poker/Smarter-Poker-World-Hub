/**
 * Chart Study Progress - the gto_chart_study reward on the range browser.
 *
 * The server records the session (pages/api/training/chart-study.js ->
 * public.fn_chart_study_event). This component only reports what is on screen
 * and whether the player is actually here: it pings every 20 seconds while
 * the tab is visible AND the player touched, scrolled or typed in the last
 * minute, and once immediately when the chart changes. The server credits
 * time from its own clock, so a throttled or tampered client cannot earn
 * faster than real study. Signed-out players see nothing.
 */
import { useEffect, useRef, useState } from 'react';
import { authedFetch } from '../../lib/authUtils';
import at from '../../styles/training/analysis-tools.module.css';

const PING_MS = 20000;
const ACTIVE_WINDOW_MS = 60000;
const ENDPOINT = '/api/training/chart-study';
const CAPPED_REASONS = new Set(['daily_cap', 'monthly_cap', 'diamond_issuance_frozen']);

async function send(body, keepalive = false) {
    try {
        const res = await authedFetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive,
        });
        if (res.status === 401 || res.status === 403) return { signedOut: true };
        const data = await res.json().catch(() => null);
        return data && typeof data === 'object' ? data : null;
    } catch (_) {
        return null;
    }
}

function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ChartStudyProgress({ chartKey }) {
    const [status, setStatus] = useState(null);
    const sessionRef = useRef(null);
    const settledRef = useRef(false);
    const lastActiveRef = useRef(Date.now());
    const chartRef = useRef(chartKey);
    const busyRef = useRef(false);
    const stoppedRef = useRef(false);

    chartRef.current = chartKey;

    const apply = (data) => {
        if (!data) return;
        if (data.signedOut || data.available === false) {
            stoppedRef.current = true;
            setStatus(null);
            return;
        }
        if (!data.ok) return;
        if (data.session_id) sessionRef.current = data.session_id;
        settledRef.current = data.state !== 'studying';
        // The overall diamond allowance is spent (or issuance is paused): new
        // sessions could not pay today, so stop opening them.
        if (settledRef.current && CAPPED_REASONS.has(data.reason)) stoppedRef.current = true;
        setStatus(data);
    };

    const tick = async (force = false) => {
        if (stoppedRef.current || busyRef.current || typeof document === 'undefined') return;
        if (document.visibilityState !== 'visible') return;
        if (!force && Date.now() - lastActiveRef.current > ACTIVE_WINDOW_MS) return;
        busyRef.current = true;
        try {
            const canEarnMore = !status || status.paid_today < status.max_per_day;
            if (!sessionRef.current || (settledRef.current && canEarnMore)) {
                apply(await send({ event: 'start', chart: chartRef.current }));
            } else if (!settledRef.current) {
                apply(await send({ event: 'ping', sessionId: sessionRef.current, chart: chartRef.current }));
            }
        } finally {
            busyRef.current = false;
        }
    };
    const tickRef = useRef(tick);
    tickRef.current = tick;

    // Start once, ping on a timer, settle on leave.
    useEffect(() => {
        const markActive = () => { lastActiveRef.current = Date.now(); };
        const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
        events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
        tickRef.current(true);
        const timer = window.setInterval(() => tickRef.current(false), PING_MS);
        const leave = () => {
            if (sessionRef.current && !settledRef.current) {
                send({ event: 'finish', sessionId: sessionRef.current, chart: chartRef.current }, true);
                settledRef.current = true;
            }
        };
        window.addEventListener('pagehide', leave);
        return () => {
            events.forEach((e) => window.removeEventListener(e, markActive));
            window.clearInterval(timer);
            window.removeEventListener('pagehide', leave);
            leave();
        };
    }, []);

    // A chart change is study activity: record it now.
    useEffect(() => {
        lastActiveRef.current = Date.now();
        if (sessionRef.current) tickRef.current(true);
    }, [chartKey]);

    if (!status) return null;

    const need = status.min_active_seconds || 180;
    const needCharts = status.min_charts || 3;
    const limitReached = status.paid_today >= status.max_per_day;
    const justEarned = status.state === 'awarded' && status.awarded_diamonds > 0;
    const pct = Math.min(100, Math.round((Math.min(status.active_seconds, need) / need) * 50
        + (Math.min(status.charts, needCharts) / needCharts) * 50));

    let headline = 'Study Progress';
    let note = `Study ${clock(need)} Across ${needCharts} Charts To Earn A Chart Study Reward. Two Rewards Per Day.`;
    if (justEarned) {
        headline = 'Reward Earned';
        note = `${status.awarded_diamonds} Diamonds Added For This Study Session.`;
    } else if (limitReached) {
        headline = 'Daily Limit Reached';
        note = 'You Have Earned Both Chart Study Rewards Today. Keep Studying - Rewards Reset At Midnight Central.';
    } else if (status.state !== 'studying' && CAPPED_REASONS.has(status.reason)) {
        headline = 'Diamond Limit Reached';
        note = status.reason === 'diamond_issuance_frozen'
            ? 'Diamond Rewards Are Paused Right Now. Your Study Still Counts For Practice.'
            : 'Your Diamond Reward Limit Is Used Up For Now. Your Study Still Counts For Practice.';
    }

    return (
        <section className={`sd-panel ${at.panel} ${at.tight}`} aria-labelledby="pc-study-title" aria-live="polite">
            <div className={at.panelHead}>
                <h2 id="pc-study-title" className={at.sectionTitle}>{headline}</h2>
            </div>
            <div className={`${at.metrics} ${at.metrics3}`}>
                <div className={at.metric}>
                    <span className={at.metricLabel}>Time Studied</span>
                    <span className={at.metricValue} data-tone="ice">
                        {clock(Math.min(status.active_seconds, need))} / {clock(need)}
                    </span>
                </div>
                <div className={at.metric}>
                    <span className={at.metricLabel}>Charts Viewed</span>
                    <span className={at.metricValue}>
                        {Math.min(status.charts, needCharts)} / {needCharts}
                    </span>
                </div>
                <div className={at.metric}>
                    <span className={at.metricLabel}>Rewards Today</span>
                    <span className={at.metricValue}>
                        {Math.min(status.paid_today, status.max_per_day)} / {status.max_per_day}
                    </span>
                </div>
            </div>
            {status.state === 'studying' && !limitReached && (
                <div
                    className={at.track}
                    role="progressbar"
                    aria-label="Chart Study Progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                >
                    <div className={at.fill} style={{ inlineSize: `${pct}%` }} />
                </div>
            )}
            <p className={at.small}>{note}</p>
        </section>
    );
}
