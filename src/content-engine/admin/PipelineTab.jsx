/**
 * 🐴 HORSES ADMIN - PIPELINE TAB
 * Pipeline controls for the admin panel
 */

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

export function PipelineTab() {
    const [rssSources, setRssSources] = useState([]);
    const [recentRuns, setRecentRuns] = useState([]);
    const [videoQueue, setVideoQueue] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);

        // Load recent pipeline runs
        const { data: runs } = await supabase
            .from('pipeline_runs')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(10);

        // Load video queue
        const { data: queue } = await supabase
            .from('video_generation_queue')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        setRecentRuns(runs || []);
        setVideoQueue(queue || []);
        setLoading(false);
    };

    const triggerPipeline = async (type, params = {}) => {
        const { data, error } = await supabase.functions.invoke('run-pipeline', {
            body: { type, ...params }
        });

        if (error) {
            alert('Pipeline trigger failed: ' + error.message);
        } else {
            alert(`Pipeline ${type} started!`);
            loadData();
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '-';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    if (loading) {
        return <div className="loading">Loading pipeline data...</div>;
    }

    return (
        <div className="pipeline-tab">
            <h2>🚀 Content Pipeline</h2>

            {/* Quick Actions */}
            <div className="pipeline-actions">
                <h3>Quick Actions</h3>
                <div className="action-buttons">
                    <button
                        onClick={() => triggerPipeline('test')}
                        className="action-btn test"
                    >
                        <span className="icon">🧪</span>
                        <span className="label">Test Run</span>
                        <span className="desc">3 posts, no video</span>
                    </button>

                    <button
                        onClick={() => triggerPipeline('cycle', { posts: 10, videos: 2 })}
                        className="action-btn cycle"
                    >
                        <span className="icon">🔄</span>
                        <span className="label">Quick Cycle</span>
                        <span className="desc">10 posts + 2 videos</span>
                    </button>

                    <button
                        onClick={() => triggerPipeline('daily')}
                        className="action-btn daily"
                    >
                        <span className="icon">📅</span>
                        <span className="label">Full Daily</span>
                        <span className="desc">Full daily run</span>
                    </button>

                    <button
                        onClick={() => triggerPipeline('publish')}
                        className="action-btn publish"
                    >
                        <span className="icon">📤</span>
                        <span className="label">Publish Due</span>
                        <span className="desc">Post scheduled content</span>
                    </button>
                </div>
            </div>

            {/* RSS Sources */}
            <div className="rss-sources">
                <h3>📡 RSS Sources</h3>
                <div className="source-list">
                    {[
                        { id: 'pokernews', name: 'PokerNews', status: 'active' },
                        { id: 'cardplayer', name: 'Card Player', status: 'active' },
                        { id: 'pocketfives', name: 'PocketFives', status: 'active' },
                        { id: 'upswing', name: 'Upswing Poker', status: 'active' },
                        { id: 'twoplustwo', name: '2+2 Forums', status: 'active' }
                    ].map(source => (
                        <div key={source.id} className={`source-item ${source.status}`}>
                            <span className="source-name">{source.name}</span>
                            <span className="source-status">
                                {source.status === 'active' ? '🟢' : '🔴'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Runs */}
            <div className="recent-runs">
                <h3>📊 Recent Pipeline Runs</h3>
                {recentRuns.length === 0 ? (
                    <p className="no-data">No pipeline runs yet</p>
                ) : (
                    <table className="runs-table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Type</th>
                                <th>Posts</th>
                                <th>Videos</th>
                                <th>Errors</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentRuns.map(run => (
                                <tr key={run.id}>
                                    <td>{new Date(run.started_at).toLocaleString()}</td>
                                    <td><span className={`run-type ${run.run_type}`}>{run.run_type}</span></td>
                                    <td>{run.text_posts_created}</td>
                                    <td>{run.videos_created}</td>
                                    <td className={run.errors > 0 ? 'error' : ''}>{run.errors}</td>
                                    <td>{formatDuration(run.duration_seconds)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Video Queue */}
            <div className="video-queue">
                <h3>🎬 Video Generation Queue</h3>
                {videoQueue.length === 0 ? (
                    <p className="no-data">No videos in queue</p>
                ) : (
                    <div className="queue-list">
                        {videoQueue.map(item => (
                            <div key={item.id} className={`queue-item ${item.status}`}>
                                <div className="queue-status">
                                    {item.status === 'pending' && '⏳'}
                                    {item.status === 'processing' && '🔄'}
                                    {item.status === 'completed' && '✅'}
                                    {item.status === 'failed' && '❌'}
                                </div>
                                <div className="queue-details">
                                    <span className="queue-topic">{item.topic?.slice(0, 60) || 'From article'}...</span>
                                    <span className="queue-time">{new Date(item.created_at).toLocaleString()}</span>
                                </div>
                                {item.status === 'completed' && item.duration_seconds && (
                                    <span className="queue-duration">{item.duration_seconds}s</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style jsx>{`
                .pipeline-tab {
                    padding: 24px 0;
                }

                .pipeline-tab h2 {
                    margin-bottom: 24px;
                }

                .pipeline-tab h3 {
                    font-size: 16px;
                    margin-bottom: 16px;
                    color: var(--horses-text-muted);
                }

                .action-buttons {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 16px;
                    margin-bottom: 32px;
                }

                .action-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 24px;
                    background: var(--horses-surface);
                    border: 2px solid var(--horses-border);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .action-btn:hover {
                    border-color: var(--horses-primary);
                    transform: translateY(-2px);
                }

                .action-btn .icon {
                    font-size: 32px;
                    margin-bottom: 8px;
                }

                .action-btn .label {
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--horses-text);
                }

                .action-btn .desc {
                    font-size: 12px;
                    color: var(--horses-text-muted);
                    margin-top: 4px;
                }

                .source-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-bottom: 32px;
                }

                .source-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: var(--horses-surface);
                    border: 1px solid var(--horses-border);
                    border-radius: 8px;
                }

                .runs-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 32px;
                }

                .runs-table th,
                .runs-table td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid var(--horses-border);
                }

                .runs-table th {
                    color: var(--horses-text-muted);
                    font-weight: 500;
                    font-size: 12px;
                    text-transform: uppercase;
                }

                .run-type {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    text-transform: uppercase;
                }

                .run-type.test { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
                .run-type.daily { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
                .run-type.cycle { background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
                .run-type.manual { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }

                .error { color: var(--horses-danger); }

                .queue-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .queue-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: var(--horses-surface);
                    border: 1px solid var(--horses-border);
                    border-radius: 8px;
                }

                .queue-status {
                    font-size: 20px;
                }

                .queue-details {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .queue-topic {
                    color: var(--horses-text);
                }

                .queue-time {
                    font-size: 12px;
                    color: var(--horses-text-muted);
                }

                .queue-duration {
                    color: var(--horses-primary);
                    font-weight: 600;
                }

                .no-data {
                    color: var(--horses-text-muted);
                    font-style: italic;
                }
            `}</style>
        </div>
    );
}

export default PipelineTab;
