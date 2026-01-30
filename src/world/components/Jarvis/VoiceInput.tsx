/* ═══════════════════════════════════════════════════════════════════════════
   VOICE INPUT — Speech-to-text for hands-free poker questions
   Uses Web Speech API for browser-native speech recognition
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef } from 'react';

interface VoiceInputProps {
    onTranscript: (text: string) => void;
    isDisabled?: boolean;
}

export function VoiceInput({ onTranscript, isDisabled = false }: VoiceInputProps) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isSupported, setIsSupported] = useState(true);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        // Check for browser support
        const SpeechRecognition = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setIsSupported(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                setTranscript(finalTranscript);
                onTranscript(finalTranscript);
                setIsListening(false);
            } else {
                setTranscript(interimTranscript);
            }
        };

        recognition.onerror = (event: any) => {
            console.error('[VoiceInput] Error:', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [onTranscript]);

    const toggleListening = () => {
        if (!recognitionRef.current) return;

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            setTranscript('');
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    if (!isSupported) {
        return null; // Don't show button if not supported
    }

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={toggleListening}
                disabled={isDisabled}
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: 'none',
                    background: isListening
                        ? 'linear-gradient(135deg, #ff4444, #ff6666)'
                        : 'rgba(255, 215, 0, 0.15)',
                    color: isListening ? '#fff' : '#FFD700',
                    fontSize: '18px',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: isListening
                        ? '0 0 20px rgba(255, 68, 68, 0.5)'
                        : 'none',
                    animation: isListening ? 'pulse 1s infinite' : 'none'
                }}
                title={isListening ? 'Click to stop' : 'Click to speak'}
            >
                🎤
            </button>

            {/* Listening indicator */}
            {isListening && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '8px',
                    padding: '6px 12px',
                    background: 'rgba(255, 68, 68, 0.9)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    animation: 'fadeIn 0.2s ease'
                }}>
                    {transcript || 'Listening...'}
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </div>
    );
}
