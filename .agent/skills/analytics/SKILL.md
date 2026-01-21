---
name: Analytics & Tracking
description: User behavior tracking, event logging, and analytics dashboards
---

# Analytics & Tracking Skill

## Overview
Track user behavior, game metrics, and business KPIs for data-driven decisions.

## Event Types
| Category | Events |
|----------|--------|
| Auth | sign_up, sign_in, sign_out |
| Navigation | page_view, tab_change, modal_open |
| Social | post_create, like, comment, follow |
| Training | game_start, game_complete, answer_submit |
| Economy | diamond_purchase, diamond_spend, xp_gain |
| Gameplay | hand_played, action_taken, session_start |

## Event Logging
```javascript
// lib/analytics.js
class Analytics {
  static async track(userId, event, properties = {}) {
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_name: event,
      properties,
      timestamp: new Date(),
      session_id: getSessionId(),
      device_info: getDeviceInfo()
    });
    
    // Also send to external analytics (Mixpanel, Amplitude, etc.)
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.track(event, { ...properties, user_id: userId });
    }
  }
  
  static async pageView(userId, page, referrer = null) {
    await this.track(userId, 'page_view', { page, referrer });
  }
  
  static async gameEvent(userId, gameId, eventType, data) {
    await this.track(userId, `game_${eventType}`, { game_id: gameId, ...data });
  }
}

export default Analytics;
```

## Database Schema
```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  session_id TEXT,
  device_info JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_user ON analytics_events(user_id, timestamp DESC);
CREATE INDEX idx_analytics_event ON analytics_events(event_name, timestamp DESC);

-- Aggregated metrics table (updated by cron)
CREATE TABLE daily_metrics (
  date DATE PRIMARY KEY,
  dau INTEGER DEFAULT 0, -- Daily Active Users
  new_signups INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  total_xp_awarded INTEGER DEFAULT 0,
  revenue DECIMAL DEFAULT 0
);
```

## Key Metrics Queries
```javascript
// Daily Active Users
async function getDAU(date) {
  const { count } = await supabase
    .from('analytics_events')
    .select('user_id', { count: 'exact', head: true })
    .gte('timestamp', `${date}T00:00:00Z`)
    .lt('timestamp', `${date}T23:59:59Z`);
  return count;
}

// Retention (Day 1, 7, 30)
async function getRetention(cohortDate, daysAfter) {
  const { data } = await supabase.rpc('calculate_retention', {
    cohort_date: cohortDate,
    days_after: daysAfter
  });
  return data;
}

// Funnel Analysis
async function getFunnel(steps, startDate, endDate) {
  const result = [];
  for (const step of steps) {
    const { count } = await supabase
      .from('analytics_events')
      .select('user_id', { count: 'exact', head: true })
      .eq('event_name', step)
      .gte('timestamp', startDate)
      .lte('timestamp', endDate);
    result.push({ step, count });
  }
  return result;
}
```

## React Hook
```javascript
function useAnalytics() {
  const { session } = useAuth();
  
  const track = useCallback((event, properties) => {
    if (session?.user) {
      Analytics.track(session.user.id, event, properties);
    }
  }, [session]);
  
  const pageView = useCallback((page) => {
    if (session?.user) {
      Analytics.pageView(session.user.id, page, document.referrer);
    }
  }, [session]);
  
  return { track, pageView };
}

// Usage
function TrainingGame() {
  const { track } = useAnalytics();
  
  const handleGameComplete = (score) => {
    track('game_complete', { game_id: 'preflop_trainer', score });
  };
}
```

## Admin Dashboard
```jsx
function AnalyticsDashboard() {
  return (
    <div className="analytics-dashboard">
      <MetricCard title="DAU" value={dau} change={dauChange} />
      <MetricCard title="New Users" value={signups} />
      <MetricCard title="Revenue" value={`$${revenue}`} />
      
      <LineChart data={dauHistory} title="DAU Trend" />
      <FunnelChart data={onboardingFunnel} title="Onboarding Funnel" />
      <RetentionChart data={retentionCohorts} title="Retention" />
    </div>
  );
}
```
