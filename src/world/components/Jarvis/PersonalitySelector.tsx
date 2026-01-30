/* ═══════════════════════════════════════════════════════════════════════════
   PERSONALITY SELECTOR — Choose Jarvis' coaching style
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';

export type JarvisPersonality =
    | 'balanced'
    | 'aggressive'
    | 'encouraging'
    | 'technical'
    | 'storyteller';

interface PersonalityOption {
    id: JarvisPersonality;
    name: string;
    icon: string;
    description: string;
    systemPrompt: string;
}

export const PERSONALITIES: PersonalityOption[] = [
    {
        id: 'balanced',
        name: 'Balanced',
        icon: '⚖️',
        description: 'Default coaching style',
        systemPrompt: 'You are Jarvis, a world-class poker strategy expert. Provide clear, balanced advice mixing theory and practical application.'
    },
    {
        id: 'aggressive',
        name: 'Aggressive Coach',
        icon: '🔥',
        description: 'Push you to play stronger',
        systemPrompt: 'You are Jarvis, an aggressive poker coach who pushes players to play more assertively. Be direct and challenge weak plays. Use phrases like "You need to be more aggressive here!" and "Stop being passive!" Encourage bold, winning plays.'
    },
    {
        id: 'encouraging',
        name: 'Encouraging',
        icon: '💪',
        description: 'Supportive and positive',
        systemPrompt: 'You are Jarvis, an encouraging poker mentor. Be supportive, celebrate good thinking, and gently guide improvements. Use phrases like "Great question!" and "You\'re on the right track!" Focus on building confidence while teaching.'
    },
    {
        id: 'technical',
        name: 'Technical GTO',
        icon: '🧮',
        description: 'Pure math and frequencies',
        systemPrompt: 'You are Jarvis, a technical GTO expert. Focus solely on game theory optimal play, frequencies, EV calculations, and mathematical concepts. Be precise and use poker terminology. Avoid emotional or exploitative advice - stick to balanced GTO solutions.'
    },
    {
        id: 'storyteller',
        name: 'Storyteller',
        icon: '📚',
        description: 'Learn through pro examples',
        systemPrompt: 'You are Jarvis, a poker historian and storyteller. Explain concepts through examples from famous pros and historic hands. Reference players like Doyle Brunson, Phil Ivey, Daniel Negreanu, Stu Ungar, and others. Make lessons memorable through stories.'
    }
];

interface PersonalitySelectorProps {
    selected: JarvisPersonality;
    onSelect: (personality: JarvisPersonality) => void;
}

export function PersonalitySelector({ selected, onSelect }: PersonalitySelectorProps) {
    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderTop: '1px solid rgba(255, 215, 0, 0.1)'
        }}>
            <span style={{
                fontSize: '10px',
                color: 'rgba(255, 215, 0, 0.5)',
                alignSelf: 'center',
                marginRight: '4px',
                whiteSpace: 'nowrap'
            }}>
                Style:
            </span>
            {PERSONALITIES.map(p => (
                <button
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    style={{
                        padding: '4px 8px',
                        background: selected === p.id
                            ? 'rgba(255, 215, 0, 0.25)'
                            : 'rgba(255, 215, 0, 0.05)',
                        border: selected === p.id
                            ? '1px solid rgba(255, 215, 0, 0.5)'
                            : '1px solid rgba(255, 215, 0, 0.15)',
                        borderRadius: '12px',
                        color: selected === p.id ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                    }}
                    title={p.description}
                >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                </button>
            ))}
        </div>
    );
}

// Helper to get system prompt for a personality
export function getPersonalityPrompt(personality: JarvisPersonality): string {
    const p = PERSONALITIES.find(p => p.id === personality);
    return p?.systemPrompt || PERSONALITIES[0].systemPrompt;
}
