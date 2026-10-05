import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { num, when } from '../../lib/horsesAdminTokens';
import DataTable from './DataTable';
import NotBuiltYet from './NotBuiltYet';
import styles from '../../../pages/horses/horses.module.css';

export default function PipelinePanel({ postsPerDay = 20 }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true); setError('');
    const result = await supabase.from('pipeline_runs').select('*').order('started_at', { ascending: false }).limit(10);
    if (seq !== sequence.current) return;
    if (result.error) setError(result.error.message || 'Pipeline Runs Could Not Be Read');
    else setRuns(result.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); return () => { sequence.current += 1; }; }, [load]);

  return <div className={styles.pipelineView}><div className={styles.panelHeading}><h2>Content Pipeline</h2><button className={styles.actionBtn} onClick={load} disabled={loading}>Refresh</button></div><div className={styles.pipelineActions}><h3>Quick Actions</h3><NotBuiltYet title="Not Built Yet - The Content Pipeline Has No Trigger" items={['Test Run (3 Posts, No Video)', 'Quick Cycle (10 Posts, 2 Videos)', `Full Daily (${postsPerDay || 20} Posts)`, 'Publish Due (Post Scheduled)']}>The Content Pipeline Has No Server-Side Implementation. The Trigger Pipeline Route Answers 501 For Every Type. The Runs Below Are Real; Nothing On This Tab Can Start One.</NotBuiltYet></div>{error ? <div className={styles.errorState} role="alert">Pipeline Runs Unavailable: {error}</div> : null}<DataTable caption="Recent Pipeline Runs" loading={loading} loadingLabel="Loading Pipeline Runs" empty="No Pipeline Runs Recorded Yet." rows={runs} columns={[
    { key: 'time', header: 'Time', render: (row) => when(row.started_at, true) },
    { key: 'type', header: 'Type', render: (row) => row.run_type || 'Unknown' },
    { key: 'posts', header: 'Posts', render: (row) => num(row.text_posts_created, '0') },
    { key: 'videos', header: 'Videos', render: (row) => num(row.videos_created, '0') },
    { key: 'duration', header: 'Duration', render: (row) => row.duration_seconds == null ? '-' : `${row.duration_seconds}s` },
  ]} /></div>;
}
