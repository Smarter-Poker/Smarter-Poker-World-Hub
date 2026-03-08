/* ═══════════════════════════════════════════════════════════════════════════
   SMART AUTO-COMPLETE — Suggestion dropdown for common questions
   Merges static fallback suggestions with popular cached questions
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef } from 'react';

interface AutoCompleteProps {
    inputValue: string;
    onSelect: (suggestion: string) => void;
}

// Static fallback suggestions
const STATIC_SUGGESTIONS = [
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

    // Poker strategy
    { trigger: 'what is gto', text: 'What Is GTO Strategy?' },
    { trigger: 'explain', text: 'Explain Pot Odds And Equity' },
    { trigger: 'explain', text: 'Explain ICM Pressure In Tournaments' },
    { trigger: 'how to', text: 'How To Manage My Bankroll?' },
    { trigger: 'best', text: 'Best Pre-Flop Opening Ranges?' },
];

export function AutoComplete({ inputValue, onSelect }: AutoCompleteProps) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [cachedQuestions, setCachedQuestions] = useState<string[]>([]);
    const hasFetched = useRef(false);

    // Fetch popular questions from cache on first mount
    useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;

        const fetchPopular = async () => {
            try {
                const token = typeof window !== 'undefined'
                    ? (() => {
                        try {
                            const auth = localStorage.getItem('smarter-poker-auth');
                            return auth ? JSON.parse(auth)?.access_token : null;
                        } catch { return null; }
                    })()
                    : null;

                if (!token) return;

                const res = await fetch('/api/geeves/conversations', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                // We don't have a dedicated "popular questions" endpoint yet,
                // but we pull from conversations to extract recent topics
                if (res.ok) {
                    const data = await res.json();
                    if (data.conversations && Array.isArray(data.conversations)) {
                        const titles = data.conversations
                            .map((c: any) => c.title)
                            .filter((t: string) => t && t !== 'New Poker Conversation')
                            .slice(0, 5);
                        setCachedQuestions(titles);
                    }
                }
            } catch {
                // Non-critical — static suggestions still work
            }
        };

        fetchPopular();
    }, []);

    useEffect(() => {
        const input = inputValue.toLowerCase().trim();

        if (input.length < 3) {
            setSuggestions([]);
            return;
        }

        // Combine static + cached suggestions
        const staticMatches = STATIC_SUGGESTIONS
            .filter(s => s.trigger.startsWith(input) || s.text.toLowerCase().includes(input))
            .map(s => s.text);

        const cacheMatches = cachedQuestions
            .filter(q => q.toLowerCase().includes(input));

        // Deduplicate and limit to 5
        const combined = [...new Set([...cacheMatches, ...staticMatches])].slice(0, 5);

        setSuggestions(combined);
        setSelectedIndex(0);
    }, [inputValue, cachedQuestions]);

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
