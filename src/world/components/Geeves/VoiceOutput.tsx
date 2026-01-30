/* ═══════════════════════════════════════════════════════════════════════════
   VOICE OUTPUT — Text-to-speech for Geeves responses
   Uses Web Speech Synthesis API
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface VoiceOutputProps {
    text: string;
}

export function VoiceOutput({ text }: VoiceOutputProps) {
    const [isSpeaking, setIsSpeaking] = useState(false);

    const speak = () => {
        if (!('speechSynthesis' in window)) {
            console.error('[VoiceOutput] Speech synthesis not supported');
            return;
        }

        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            return;
        }

        // Clean up text for speaking
        const cleanText = text
            .replace(/\*\*/g, '')  // Remove bold markers
            .replace(/`/g, '')     // Remove code markers
            .replace(/##/g, '')    // Remove headers
            .replace(/\n/g, '. '); // Convert newlines to pauses

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to use a natural voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v =>
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('Google UK English Male') ||
            v.lang === 'en-GB'
        );
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.onend = () => {
            setIsSpeaking(false);
        };

        utterance.onerror = () => {
            setIsSpeaking(false);
        };

        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    };

    if (!('speechSynthesis' in window)) {
        return null;
    }

    return (
        <button
            onClick={speak}
            style={{
                background: 'none',
                border: 'none',
                color: isSpeaking ? '#ff6666' : 'rgba(255, 215, 0, 0.6)',
                fontSize: '14px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
            }}
            title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
        >
            {isSpeaking ? '🔊' : '🔈'} {isSpeaking ? 'Stop' : 'Listen'}
        </button>
    );
}
