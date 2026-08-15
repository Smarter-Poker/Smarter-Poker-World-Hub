/**
 * 🚨 HORSE ERROR ALERTING SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tracks errors and sends alerts via webhooks (Discord/Slack)
 * Also provides analytics and monitoring APIs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const ERROR_TYPES = {
    DOWNLOAD: 'download',
    CONVERSION: 'conversion',
    UPLOAD: 'upload',
    POST: 'post',
    SOCIAL: 'social',
    DATABASE: 'database'
};

// ═══════════════════════════════════════════════════════════════════════════
// HORSE ALERTING SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class HorseAlertingService {
    constructor(supabaseUrl, supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.webhookUrl = process.env.HORSE_ALERT_WEBHOOK || null;
        this.errorCounts = new Map(); // Track errors for rate limiting
        this.lastAlertTime = 0;
        this.alertCooldown = 60000; // 1 minute between alerts
    }

    // ═══════════════════════════════════════════════════════════════════
    // ERROR LOGGING
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Log an error to database
     */
    async logError(authorId, errorType, errorMessage, context = {}) {
        try {
            // Log to database
            const { data, error } = await this.supabase
                .from('horse_error_log')
                // 2026-08-15 CHECK 13 fix: author_id is not a column (real: horse_id)
                .insert({
                    horse_id: authorId,
                    error_type: errorType,
                    error_message: errorMessage,
                    context
                })
                .select()
                .maybeSingle();

            if (error) {
                console.warn('Failed to log error:', error.message);
                return null;
            }

            // Track for rate limiting
            const key = errorType;
            this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

            // Check if we should send alert
            await this.checkAndAlert(errorType, errorMessage, context);

            return data || null;
        } catch (e) {
            console.warn('Error logging failed:', e.message);
        }
    }

    /**
     * Check if alert should be sent and send it
     */
    async checkAndAlert(errorType, errorMessage, context) {
        // Rate limit alerts
        const now = Date.now();
        if (now - this.lastAlertTime < this.alertCooldown) {
            return;
        }

        // Only alert on critical or repeated errors
        const errorCount = this.errorCounts.get(errorType) || 0;
        const shouldAlert =
            errorCount >= 5 || // 5+ of same type
            errorType === ERROR_TYPES.DATABASE; // Always alert on DB errors

        if (shouldAlert && this.webhookUrl) {
            await this.sendWebhookAlert(errorType, errorMessage, context, errorCount);
            this.lastAlertTime = now;
            this.errorCounts.clear(); // Reset after alert
        }
    }

    /**
     * Send alert to Discord/Slack webhook
     */
    async sendWebhookAlert(errorType, errorMessage, context, count) {
        if (!this.webhookUrl) return;

        const payload = {
            embeds: [{
                title: `🚨 Horse System Alert: ${errorType.toUpperCase()}`,
                description: errorMessage,
                color: 0xFF4444,
                fields: [
                    { name: 'Error Type', value: errorType, inline: true },
                    { name: 'Count', value: `${count} occurrences`, inline: true },
                    { name: 'Context', value: JSON.stringify(context).slice(0, 500), inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        try {
            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.debug('📣 Alert sent to webhook');
        } catch (e) {
            console.warn('Webhook alert failed:', e.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ANALYTICS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Get analytics summary for dashboard
     */
    async getAnalyticsSummary(days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // 2026-08-15 CHECK 13 fix: horse_analytics is a METRIC table
        // (horse_id, metric_type, metric_value, recorded_at, details) — the old
        // code assumed per-day wide rows (date/posts_created/likes_received/...)
        // and 42703'd, so analytics summaries were always empty. Pivot the
        // metric rows instead.
        const { data: analytics } = await this.supabase
            .from('horse_analytics')
            .select('horse_id, metric_type, metric_value, recorded_at, details')
            .gte('recorded_at', startDate.toISOString());

        if (!analytics || analytics.length === 0) {
            return this.getEmptySummary();
        }

        // Aggregate metrics
        const summary = {
            period: `${days} days`,
            totalPosts: 0,
            totalStories: 0,
            totalComments: 0,
            totalLikes: 0,
            totalErrors: 0,
            sourceDistribution: {},
            dailyActivity: [],
            activeHorses: new Set()
        };

        const METRIC_TARGETS = {
            posts_created: 'totalPosts',
            stories_created: 'totalStories',
            comments_made: 'totalComments',
            likes_given: 'totalLikes',
            download_failures: 'totalErrors',
            upload_failures: 'totalErrors',
        };
        for (const row of analytics) {
            const target = METRIC_TARGETS[row.metric_type];
            if (target) summary[target] += Number(row.metric_value) || 0;

            if (row.horse_id) summary.activeHorses.add(row.horse_id);

            const source = row.details?.source;
            if (source) {
                summary.sourceDistribution[source] =
                    (summary.sourceDistribution[source] || 0) + (Number(row.metric_value) || 0);
            }
        }

        summary.activeHorses = summary.activeHorses.size;

        return summary;
    }

    /**
     * Get recent errors for debugging
     */
    async getRecentErrors(limit = 20) {
        const { data: errors } = await this.supabase
            .from('horse_error_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        return errors || [];
    }

    /**
     * Get error counts by type
     */
    async getErrorBreakdown(days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: errors } = await this.supabase
            .from('horse_error_log')
            .select('error_type')
            .gte('created_at', startDate.toISOString());

        const breakdown = {};
        (errors || []).forEach(e => {
            breakdown[e.error_type] = (breakdown[e.error_type] || 0) + 1;
        });

        return breakdown;
    }

    /**
     * Get top performing horses
     */
    async getTopHorses(days = 7, limit = 10) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // 2026-08-15 CHECK 13 fix: same metric-table pivot as
        // getAnalyticsSummary — the wide-row select 42703'd and top-horses was
        // always empty.
        const { data: analytics } = await this.supabase
            .from('horse_analytics')
            .select('horse_id, metric_type, metric_value')
            .gte('recorded_at', startDate.toISOString());

        // Aggregate by horse
        const METRIC_KEYS = { posts_created: 'posts', likes_received: 'likes', comments_received: 'comments' };
        const horseStats = {};
        (analytics || []).forEach(a => {
            const key = METRIC_KEYS[a.metric_type];
            if (!key) return;
            if (!horseStats[a.horse_id]) {
                horseStats[a.horse_id] = { posts: 0, likes: 0, comments: 0 };
            }
            horseStats[a.horse_id][key] += Number(a.metric_value) || 0;
            horseStats[a.author_id].likes += a.likes_received || 0;
            horseStats[a.author_id].comments += a.comments_received || 0;
        });

        // Sort by total engagement
        return Object.entries(horseStats || {})
            .map(([id, stats]) => ({
                authorId: id,
                ...stats,
                engagement: stats.likes + stats.comments
            }))
            .sort((a, b) => b.engagement - a.engagement)
            .slice(0, limit);
    }

    getEmptySummary() {
        return {
            period: '7 days',
            totalPosts: 0,
            totalStories: 0,
            totalComments: 0,
            totalLikes: 0,
            totalErrors: 0,
            sourceDistribution: {},
            activeHorses: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIP USAGE TRACKER (Database Persistence)
// ═══════════════════════════════════════════════════════════════════════════
class ClipUsageTracker {
    constructor(supabaseUrl, supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Check if clip is available (not used in last 24h)
     */
    async isClipAvailable(clipId, hours = 24) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);

        const { data } = await this.supabase
            .from('clip_usage_log')
            .select('id')
            .eq('clip_id', clipId)
            .eq('success', true)
            .gte('used_at', cutoff.toISOString())
            .limit(1);

        return !data || data.length === 0;
    }

    /**
     * Record clip usage
     */
    async recordUsage(clipId, authorId, source, videoId, postId = null, storyId = null) {
        const { data, error } = await this.supabase
            .from('clip_usage_log')
            .insert({
                clip_id: clipId,
                author_id: authorId,
                source,
                video_id: videoId,
                post_id: postId,
                story_id: storyId,
                success: true
            })
            .select()
            .maybeSingle();

        if (error) {
            console.warn('Failed to record clip usage:', error.message);
        }

        return data || null;
    }

    /**
     * Record failed usage attempt
     */
    async recordFailure(clipId, authorId, source, errorMessage) {
        const { error: err_clip_usage_log_5cz4o } = await this.supabase
          .from('clip_usage_log')
          .insert({
                clip_id: clipId,
                author_id: authorId,
                source,
                success: false,
                error_message: errorMessage
            });
        if (err_clip_usage_log_5cz4o) console.warn('[Supabase] Silent mutation failed in clip_usage_log:', err_clip_usage_log_5cz4o.message);
    }

    /**
     * Get recently used clips
     */
    async getRecentlyUsedClips(hours = 24) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);

        const { data } = await this.supabase
            .from('clip_usage_log')
            .select('clip_id')
            .eq('success', true)
            .gte('used_at', cutoff.toISOString());

        return (data || []).map(d => d.clip_id);
    }
}

export { HorseAlertingService, ClipUsageTracker, ERROR_TYPES };
export default HorseAlertingService;
