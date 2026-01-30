/* ═══════════════════════════════════════════════════════════════════════════
   VOICE INPUT — Speech-to-text for Jarvis
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface VoiceInputProps {
    onTranscript: (text: string) => void;
    onError?: (error: string) => void;
}

export function VoiceInput({ onTranscript, onError }: VoiceInputProps) {
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [recognition, setRecognition] = useState<any>(null);

    useEffect(() => {
        // Check if browser supports speech recognition
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (SpeechRecognition) {
            setIsSupported(true);
            const recognitionInstance = new SpeechRecognition();
            recognitionInstance.continuous = false;
            recognitionInstance.interimResults = false;
            recognitionInstance.lang = 'en-US';

            recognitionInstance.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                onTranscript(transcript);
                setIsListening(false);
            };

            recognitionInstance.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                onError?.(event.error);
                setIsListening(false);
            };

            recognitionInstance.onend = () => {
                setIsListening(false);
            };

            setRecognition(recognitionInstance);
        }
    }, [onTranscript, onError]);

    const toggleListening = () => {
        if (!recognition) return;

        if (isListening) {
            recognition.stop();
            setIsListening(false);
        } else {
            recognition.start();
            setIsListening(true);
        }
    };

    if (!isSupported) {
        return null; // Don't show button if not supported
    }

    return (
        <button
            onClick={toggleListening}
            style={{
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isListening
                    ? 'linear-gradient(135deg, #ff6464, #ff3333)'
                    : 'rgba(255, 255, 255, 0.1)',
                border: isListening
                    ? '2px solid #ff6464'
                    : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                animation: isListening ? 'pulse 1.5s infinite' : 'none'
            }}
            title={isListening ? 'Stop recording' : 'Voice input'}
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                {isListening ? (
                    // Stop icon
                    <rect x="6" y="6" width="12" height="12" />
                ) : (
                    // Microphone icon
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
                )}
            </svg>

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.8; }
                }
            `}</style>
        </button>
    );
}
