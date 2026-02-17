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
    { trigger: 'how do i', text: 'How Do I Access Training Games?' },
    { trigger: 'how do i', text: 'How Do I Create A Club?' },
    { trigger: 'how do i', text: 'How Do I Buy Diamonds?' },
    { trigger: 'how do i', text: 'How Do I Join A Club?' },
    { trigger: 'how do i', text: 'How Do I Start A Tournament?' },

    // What is
    { trigger: 'what is', text: 'What Is Club Arena?' },
    { trigger: 'what is', text: 'What Is Diamond Arena?' },
    { trigger: 'what is', text: 'What Is GTO Training?' },
    { trigger: 'what is', text: 'What Is The Ghost Fleet?' },
    { trigger: 'what is', text: 'What Is Poker Near Me?' },

    // Where
    { trigger: 'where', text: 'Where Can I Find My Profile?' },
    { trigger: 'where', text: 'Where Is The Diamond Store?' },
    { trigger: 'where', text: 'Where Are My Settings?' },
    { trigger: 'where', text: 'Where Can I See My Friends?' },

    // Help
    { trigger: 'help', text: 'Help Me Get Started' },
    { trigger: 'help', text: 'Help With Training Games' },
    { trigger: 'help', text: 'Help With Club Management' },
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
                <span>Tab To Select</span>
            </div>
        </div>
    );
}
