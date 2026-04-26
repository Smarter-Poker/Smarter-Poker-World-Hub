/**
 * useTranscodeStatus — polls the transcode status API for a video post.
 * Returns { status, progress, outputUrl, isProcessing }
 * 
 * Usage:
 *   const { isProcessing, status } = useTranscodeStatus(postId, isVideoPost);
 *   if (isProcessing) return <div>Processing video...</div>;
 */

import { useState, useEffect, useRef } from 'react';
import { getAccessToken } from '../lib/authUtils';

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLLS = 60;       // Stop after 5 minutes

export function useTranscodeStatus(postId, enabled = false) {
    const [status, setStatus] = useState(null);     // 'queued' | 'processing' | 'complete' | 'error' | null
    const [progress, setProgress] = useState(0);
    const [outputUrl, setOutputUrl] = useState(null);
    const pollCountRef = useRef(0);
    const intervalRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        // Reset on postId change
        mountedRef.current = true;
        pollCountRef.current = 0;

        if (!enabled || !postId) return;

        async function poll() {
            try {
                const token = getAccessToken();
                if (!token) return;

                const res = await fetch(`/api/video/transcode-status?postId=${postId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                
                if (!res.ok || !mountedRef.current) return;
                const data = await res.json();
                if (!mountedRef.current) return;
                
                if (!data.success || !data.job) {
                    // No job found — video doesn't need transcoding
                    setStatus(null);
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    return;
                }

                const job = data.job;
                setStatus(job.status);
                setProgress(job.progress || 0);
                
                if (job.status === 'complete') {
                    setOutputUrl(job.output_url);
                    if (intervalRef.current) clearInterval(intervalRef.current);
                } else if (job.status === 'error') {
                    if (intervalRef.current) clearInterval(intervalRef.current);
                }

                pollCountRef.current++;
                if (pollCountRef.current >= MAX_POLLS) {
                    if (intervalRef.current) clearInterval(intervalRef.current);
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
            mountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [postId, enabled]);

    return {
        status,
        progress,
        outputUrl,
        isProcessing: status === 'queued' || status === 'processing',
    };
}
