/* ═══════════════════════════════════════════════════════════════════════════
   SMART AUTO-COMPLETE — Suggestion dropdown for common questions
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface AutoCompleteProps {
    inputValue: string;
    onSelect: (suggestion: string) => void;
}

const SUGGESTIONS = [
    // Navigation
    { trigger: 'how do i', text: 'How do I access training games?' },
    { trigger: 'how do i', text: 'How do I create a club?' },
    { trigger: 'how do i', text: 'How do I buy diamonds?' },
    { trigger: 'how do i', text: 'How do I join a club?' },
    { trigger: 'how do i', text: 'How do I start a tournament?' },

    // What is
    { trigger: 'what is', text: 'What is Club Arena?' },
    { trigger: 'what is', text: 'What is Diamond Arena?' },
    { trigger: 'what is', text: 'What is GTO Training?' },
    { trigger: 'what is', text: 'What is the Ghost Fleet?' },
    { trigger: 'what is', text: 'What is Poker Near Me?' },

    // Where
    { trigger: 'where', text: 'Where can I find my profile?' },
    { trigger: 'where', text: 'Where is the Diamond Store?' },
    { trigger: 'where', text: 'Where are my settings?' },
    { trigger: 'where', text: 'Where can I see my friends?' },

    // Help
    { trigger: 'help', text: 'Help me get started' },
    { trigger: 'help', text: 'Help with training games' },
    { trigger: 'help', text: 'Help with club management' },
];

export function AutoComplete({ inputValue, onSelect }: AutoCompleteProps) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        const input = inputValue.toLowerCase().trim();

        if (input.length < 3) {
            setSuggestions([]);
            return;
        }

        // Find matching suggestions
        const matches = SUGGESTIONS
            .filter(s => s.trigger.startsWith(input) || s.text.toLowerCase().includes(input))
            .map(s => s.text)
            .slice(0, 5); // Max 5 suggestions

        setSuggestions(matches);
        setSelectedIndex(0);
    }, [inputValue]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (suggestions.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Tab' && suggestions.length > 0) {
                e.preventDefault();
                onSelect(suggestions[selectedIndex]);
                setSuggestions([]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [suggestions, selectedIndex, onSelect]);

    if (suggestions.length === 0) return null;

    return (
        <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: '8px',
            background: 'rgba(0, 20, 40, 0.95)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
            zIndex: 10
        }}>
            {suggestions.map((suggestion, index) => (
                <div
                    key={index}
                    onClick={() => {
                        onSelect(suggestion);
                        setSuggestions([]);
                    }}
                    style={{
                        padding: '12px 16px',
                        background: index === selectedIndex
                            ? 'rgba(0, 212, 255, 0.2)'
                            : 'transparent',
                        borderBottom: index < suggestions.length - 1
                            ? '1px solid rgba(255, 255, 255, 0.05)'
                            : 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#fff',
                        transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                >
                    {suggestion}
                </div>
            ))}
            <div style={{
                padding: '8px 16px',
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.4)',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                justifyContent: 'space-between'
            }}>
                <span>↑↓ Navigate</span>
                <span>Tab to select</span>
            </div>
        </div>
    );
}
