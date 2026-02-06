/* ═══════════════════════════════════════════════════════════════════════════
   MULTI-LANGUAGE SUPPORT — Internationalization for Live Help
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

export type Language = 'en' | 'es' | 'pt' | 'zh' | 'fr' | 'de';

interface LanguageSelectorProps {
    onLanguageChange?: (lang: Language) => void;
}

export function LanguageSelector({ onLanguageChange }: LanguageSelectorProps) {
    const [language, setLanguage] = useState<Language>('en');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Load saved preference or detect browser language
        const saved = localStorage.getItem('geeves-language') as Language;
        if (saved) {
            setLanguage(saved);
        } else {
            const browserLang = navigator.language.split('-')[0] as Language;
            if (['en', 'es', 'pt', 'zh', 'fr', 'de'].includes(browserLang)) {
                setLanguage(browserLang);
            }
        }
    }, []);

    const languages = [
        { code: 'en' as Language, name: 'English', flag: '🇺🇸' },
        { code: 'es' as Language, name: 'Español', flag: '🇪🇸' },
        { code: 'pt' as Language, name: 'Português', flag: '🇧🇷' },
        { code: 'zh' as Language, name: '中文', flag: '🇨🇳' },
        { code: 'fr' as Language, name: 'Français', flag: '🇫🇷' },
        { code: 'de' as Language, name: 'Deutsch', flag: '🇩🇪' }
    ];

    const selectLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('geeves-language', lang);
        setIsOpen(false);
        onLanguageChange?.(lang);
    };

    const currentLang = languages.find(l => l.code === language);

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <span>{currentLang?.flag}</span>
                <span>{currentLang?.code.toUpperCase()}</span>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    background: 'rgba(0, 20, 40, 0.98)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                    zIndex: 100,
                    minWidth: '150px'
                }}>
                    {languages.map(lang => (
                        <div
                            key={lang.code}
                            onClick={() => selectLanguage(lang.code)}
                            style={{
                                padding: '10px 16px',
                                cursor: 'pointer',
                                background: language === lang.code ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'background 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (language !== lang.code) {
                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (language !== lang.code) {
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>{lang.flag}</span>
                            <span style={{ fontSize: '13px', color: '#fff' }}>{lang.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Translation strings
export const translations = {
    en: {
        askGeeves: 'Ask Geeves',
        typeYourQuestion: 'Type Your Question...',
        helpful: 'Helpful',
        notHelpful: 'Not Helpful',
        copy: 'Copy',
        copied: 'Copied!',
        quickActions: 'Quick Actions',
        history: 'History',
        recentConversations: 'Recent Conversations',
        newConversation: 'New Conversation',
        noPreviousConversations: 'No previous conversations'
    },
    es: {
        askGeeves: 'Preguntar a Geeves',
        typeYourQuestion: 'Escribe tu pregunta...',
        helpful: 'Útil',
        notHelpful: 'No útil',
        copy: 'Copiar',
        copied: '¡Copiado!',
        quickActions: 'Acciones Rápidas',
        history: 'Historial',
        recentConversations: 'Conversaciones Recientes',
        newConversation: 'Nueva Conversación',
        noPreviousConversations: 'Sin conversaciones previas'
    },
    pt: {
        askGeeves: 'Perguntar ao Geeves',
        typeYourQuestion: 'Digite sua pergunta...',
        helpful: 'Útil',
        notHelpful: 'Não útil',
        copy: 'Copiar',
        copied: 'Copiado!',
        quickActions: 'Ações Rápidas',
        history: 'Histórico',
        recentConversations: 'Conversas Recentes',
        newConversation: 'Nova Conversa',
        noPreviousConversations: 'Sem conversas anteriores'
    },
    zh: {
        askGeeves: '询问 Geeves',
        typeYourQuestion: '输入您的问题...',
        helpful: '有帮助',
        notHelpful: '无帮助',
        copy: '复制',
        copied: '已复制！',
        quickActions: '快速操作',
        history: '历史',
        recentConversations: '最近对话',
        newConversation: '新对话',
        noPreviousConversations: '没有以前的对话'
    },
    fr: {
        askGeeves: 'Demander à Geeves',
        typeYourQuestion: 'Tapez votre question...',
        helpful: 'Utile',
        notHelpful: 'Pas utile',
        copy: 'Copier',
        copied: 'Copié!',
        quickActions: 'Actions Rapides',
        history: 'Historique',
        recentConversations: 'Conversations Récentes',
        newConversation: 'Nouvelle Conversation',
        noPreviousConversations: 'Aucune conversation précédente'
    },
    de: {
        askGeeves: 'Geeves fragen',
        typeYourQuestion: 'Geben Sie Ihre Frage ein...',
        helpful: 'Hilfreich',
        notHelpful: 'Nicht hilfreich',
        copy: 'Kopieren',
        copied: 'Kopiert!',
        quickActions: 'Schnellaktionen',
        history: 'Verlauf',
        recentConversations: 'Letzte Gespräche',
        newConversation: 'Neues Gespräch',
        noPreviousConversations: 'Keine vorherigen Gespräche'
    }
};

export function useTranslation(language: Language = 'en') {
    return translations[language] || translations.en;
}
