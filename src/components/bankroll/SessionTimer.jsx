/**
 * SESSION TIMER
 * Track live session duration with auto-fill for log entry
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function SessionTimer({ onSessionEnd, onOpenLog }) {
    const [isRunning, setIsRunning] = useState(false);
    const [startTime, setStartTime] = useState(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const intervalRef = useRef(null);

    // Timer tick
    useEffect(() => {
        if (isRunning && startTime) {
            intervalRef.current = setInterval(() => {
                setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        }
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isRunning, startTime]);

    // Persist to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('bankroll-session-timer');
            if (saved) {
                const { startTime: savedStart, isRunning: savedRunning } = JSON.parse(saved);
                if (savedRunning && savedStart) {
                    setStartTime(savedStart);
                    setIsRunning(true);
                    setElapsedSeconds(Math.floor((Date.now() - savedStart) / 1000));
                }
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (isRunning && startTime) {
                localStorage.setItem('bankroll-session-timer', JSON.stringify({ startTime, isRunning }));
            } else {
                localStorage.removeItem('bankroll-session-timer');
            }
        }
    }, [isRunning, startTime]);

    function handleStart() {
        const now = Date.now();
        setStartTime(now);
        setIsRunning(true);
        setElapsedSeconds(0);
    }

    function handleStop() {
        setIsRunning(false);
        if (onSessionEnd) {
            onSessionEnd({
                startTime: startTime ? new Date(startTime).toTimeString().slice(0, 5) : null,
                endTime: new Date().toTimeString().slice(0, 5),
                durationMinutes: Math.floor(elapsedSeconds / 60)
            });
        }
    }

    function handleLogAndReset() {
        handleStop();
        if (onOpenLog) {
            onOpenLog({
                start_time: startTime ? new Date(startTime).toTimeString().slice(0, 5) : null,
                end_time: new Date().toTimeString().slice(0, 5)
            });
        }
        // Reset after short delay
        setTimeout(() => {
            setStartTime(null);
            setElapsedSeconds(0);
        }, 500);
    }

    function formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={styles.title}>Session Timer</span>
            </div>

            {isRunning ? (
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    style={styles.timerActive}
                >
                    <div style={styles.timerDisplay}>
                        {formatTime(elapsedSeconds)}
                    </div>
                    <div style={styles.startedAt}>
                        Started at {startTime ? new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </div>
                    <div style={styles.buttonRow}>
                        <button onClick={handleStop} style={styles.stopBtn}>
                            Stop
                        </button>
                        <button onClick={handleLogAndReset} style={styles.logBtn}>
                            Log Session
                        </button>
                    </div>
                </motion.div>
            ) : (
                <button onClick={handleStart} style={styles.startBtn}>
                    <span style={{ fontSize: 16 }}>▶</span>
                    Start Session
                </button>
            )}
        </div>
    );
}

const styles = {
    container: {
        padding: 16,
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 12,
        marginBottom: 16,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    icon: {
        fontSize: 16,
    },
    title: {
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    },
    timerActive: {
        textAlign: 'center',
    },
    timerDisplay: {
        fontSize: 32,
        fontWeight: 700,
        color: '#2374e1',
        fontFamily: 'monospace',
        marginBottom: 4,
    },
    startedAt: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 12,
    },
    buttonRow: {
        display: 'flex',
        gap: 8,
    },
    stopBtn: {
        flex: 1,
        padding: '10px 12px',
        background: 'rgba(239, 68, 68, 0.2)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
    },
    logBtn: {
        flex: 1,
        padding: '10px 12px',
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
    },
    startBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '12px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#2374e1',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
};
