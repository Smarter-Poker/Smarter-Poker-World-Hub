/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER ASSISTANT — AI Poker Coach
   Your personal AI assistant for poker strategy and analysis
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════
const SAMPLE_PROMPTS = [
    "What hands should I 3-bet from the button?",
    "How do I play pocket jacks on a wet flop?",
    "Explain pot odds vs implied odds",
    "When should I continuation bet?",
    "How do I adjust against tight players?",
    "What's my range for opening UTG?",
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SMARTER ASSISTANT PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function SmarterAssistantPage() {
    const router = useRouter();
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: "Hey! I'm your Smarter Poker Assistant. Ask me anything about poker strategy, hand analysis, or GTO concepts. What would you like to learn today?",
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (!inputValue.trim()) return;

        // Add user message
        setMessages(prev => [...prev, { role: 'user', content: inputValue }]);
        setInputValue('');
        setIsTyping(true);

        // Simulate AI response (replace with actual API call)
        setTimeout(() => {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Thanks for your question! The Smarter Assistant is currently being trained on advanced poker strategies. Full AI capabilities coming soon! In the meantime, check out our Training Hub for GTO exercises.",
            }]);
            setIsTyping(false);
        }, 1500);
    };

    const handleSamplePrompt = (prompt) => {
        setInputValue(prompt);
    };

    return (
        <PageTransition>
            <Head>
                <title>Smarter Assistant — Smarter.Poker</title>
                <meta name="description" content="Your AI poker coach and strategy assistant" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    .assistant-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .assistant-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .assistant-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .assistant-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .assistant-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .assistant-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="assistant-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Header */}
                <UniversalHeader pageDepth={1} />

                <div style={styles.header}>
                    <h1 style={styles.pageTitle}>🤖 Smarter Assistant</h1>
                </div>

                {/* Chat Container */}
                <div style={styles.chatContainer}>
                    {/* Messages */}
                    <div style={styles.messagesContainer}>
                        {messages.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    ...styles.message,
                                    ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
                                }}
                            >
                                <div style={styles.messageAvatar}>
                                    {msg.role === 'user' ? '👤' : '🤖'}
                                </div>
                                <div style={styles.messageContent}>
                                    {msg.content}
                                </div>
                            </motion.div>
                        ))}
                        {isTyping && (
                            <div style={{ ...styles.message, ...styles.assistantMessage }}>
                                <div style={styles.messageAvatar}>🤖</div>
                                <div style={styles.typingIndicator}>
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Sample Prompts */}
                    <div style={styles.promptsContainer}>
                        <div style={styles.promptsLabel}>Try asking:</div>
                        <div style={styles.promptsGrid}>
                            {SAMPLE_PROMPTS.map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSamplePrompt(prompt)}
                                    style={styles.promptButton}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Input Area */}
                    <div style={styles.inputContainer}>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask me anything about poker..."
                            style={styles.input}
                        />
                        <button onClick={handleSend} style={styles.sendButton}>
                            Send →
                        </button>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @keyframes bounce {
                    0%, 80%, 100% { transform: scale(0); }
                    40% { transform: scale(1); }
                }
            `}</style>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '50%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 212, 255, 0.08), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(10, 22, 40, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },
    pageTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
    },
    chatContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 800,
        margin: '0 auto',
        width: '100%',
        padding: '24px',
    },
    messagesContainer: {
        flex: 1,
        overflowY: 'auto',
        marginBottom: 20,
        maxHeight: '400px',
    },
    message: {
        display: 'flex',
        gap: 12,
        marginBottom: 16,
        padding: '16px',
        borderRadius: 16,
    },
    userMessage: {
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        marginLeft: 40,
    },
    assistantMessage: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginRight: 40,
    },
    messageAvatar: {
        fontSize: 24,
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        flexShrink: 0,
    },
    messageContent: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: 1.6,
    },
    typingIndicator: {
        display: 'flex',
        gap: 4,
        padding: '8px 0',
    },
    promptsContainer: {
        marginBottom: 20,
    },
    promptsLabel: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 10,
    },
    promptsGrid: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
    },
    promptButton: {
        padding: '8px 14px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 20,
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.7)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    inputContainer: {
        display: 'flex',
        gap: 12,
    },
    input: {
        flex: 1,
        padding: '16px 20px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        fontSize: 16,
        color: '#fff',
        outline: 'none',
    },
    sendButton: {
        padding: '16px 28px',
        background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
        border: 'none',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },
};
