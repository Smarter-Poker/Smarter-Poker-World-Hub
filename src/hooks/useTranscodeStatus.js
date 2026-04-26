/**
 * useTranscodeStatus — polls the transcode status API for a video post.
 * Returns { status, progress, outputUrl, isProcessing }
 * 
 * Usage:
 *   const { isProcessing, status } = useTranscodeStatus(postId, isVideoPost);
 *   if (isProcessing) return <div>Processing video...</div>;
 */

import { useState, useEffect, useRef } from 'react';
import { getAccessToken } from '../../providers/SupabaseProvider';

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLLS = 60;       // Stop after 5 minutes

export function useTranscodeStatus(postId, enabled = false) {
    const [status, setStatus] = useState(null);     // 'queued' | 'processing' | 'complete' | 'error' | null
    const [progress, setProgress] = useState(0);
    const [outputUrl, setOutputUrl] = useState(null);
    const pollCountRef = useRef(0);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (!enabled || !postId) return;

        async function poll() {
            try {
                const token = await getAccessToken();
                if (!token) return;

                const res = await fetch(`/api/video/transcode-status?postId=${postId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                
                if (!res.ok) return;
                const data = await res.json();
                
                if (!data.success || !data.job) {
                    // No job found — video doesn't need transcoding
                    setStatus(null);
                    clearInterval(intervalRef.current);
                    return;
                }

                const job = data.job;
                setStatus(job.status);
                setProgress(job.progress || 0);
                
                if (job.status === 'complete') {
                    setOutputUrl(job.output_url);
                    clearInterval(intervalRef.current);
                } else if (job.status === 'error') {
                    clearInterval(intervalRef.current);
                }

                pollCountRef.current++;
                if (pollCountRef.current >= MAX_POLLS) {
                    clearInterval(intervalRef.current);
                }
            } catch (_) {
                // Silently fail — polling should be resilient
            }
        }

        // Initial poll
        poll();
        // Start interval
        intervalRef.current = setInterval(poll, POLL_INTERVAL);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [postId, enabled]);

    return {
        status,
        progress,
        outputUrl,
        isProcessing: status === 'queued' || status === 'processing',
    };
}
