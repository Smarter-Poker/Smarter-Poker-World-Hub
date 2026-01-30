/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGE CONTENT — Markdown renderer for Jarvis responses
   Supports bold, bullets, code blocks, headers, and range formatting
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';

interface MessageContentProps {
    content: string;
    isUser: boolean;
}

export function MessageContent({ content, isUser }: MessageContentProps) {
    if (isUser) {
        return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>;
    }

    // Parse and render markdown for Jarvis messages
    const renderContent = () => {
        const lines = content.split('\n');
        const elements: React.ReactNode[] = [];
        let inCodeBlock = false;
        let codeContent = '';
        let codeLanguage = '';

        lines.forEach((line, index) => {
            // Code block handling
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    codeLanguage = line.slice(3).trim();
                    codeContent = '';
                } else {
                    elements.push(
                        <div key={`code-${index}`} style={{
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            margin: '8px 0',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            color: '#FFD700',
                            overflowX: 'auto',
                            whiteSpace: 'pre'
                        }}>
                            {codeContent.trim()}
                        </div>
                    );
                    inCodeBlock = false;
                    codeContent = '';
                }
                return;
            }

            if (inCodeBlock) {
                codeContent += line + '\n';
                return;
            }

            // Headers
            if (line.startsWith('## ')) {
                elements.push(
                    <h3 key={index} style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#FFD700',
                        margin: '12px 0 6px 0',
                        borderBottom: '1px solid rgba(255, 215, 0, 0.1)',
                        paddingBottom: '4px'
                    }}>
                        {line.slice(3)}
                    </h3>
                );
                return;
            }

            if (line.startsWith('# ')) {
                elements.push(
                    <h2 key={index} style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#FFD700',
                        margin: '12px 0 8px 0'
                    }}>
                        {line.slice(2)}
                    </h2>
                );
                return;
            }

            // Bullet points
            if (line.match(/^[\-\•]\s/)) {
                elements.push(
                    <div key={index} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        marginLeft: '8px',
                        marginBottom: '4px'
                    }}>
                        <span style={{ color: '#FFD700' }}>•</span>
                        <span>{renderInlineFormatting(line.slice(2))}</span>
                    </div>
                );
                return;
            }

            // Numbered lists
            if (line.match(/^\d+\.\s/)) {
                const [num, ...rest] = line.split(/\.\s/);
                elements.push(
                    <div key={index} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        marginLeft: '8px',
                        marginBottom: '4px'
                    }}>
                        <span style={{ color: '#FFD700', minWidth: '16px' }}>{num}.</span>
                        <span>{renderInlineFormatting(rest.join('. '))}</span>
                    </div>
                );
                return;
            }

            // Empty lines
            if (line.trim() === '') {
                elements.push(<div key={index} style={{ height: '8px' }} />);
                return;
            }

            // Regular paragraph
            elements.push(
                <p key={index} style={{ margin: '4px 0' }}>
                    {renderInlineFormatting(line)}
                </p>
            );
        });

        return elements;
    };

    // Render inline formatting (bold, code, etc.)
    const renderInlineFormatting = (text: string): React.ReactNode => {
        const parts: React.ReactNode[] = [];
        let remaining = text;
        let key = 0;

        while (remaining.length > 0) {
            // Bold: **text**
            const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
            if (boldMatch && boldMatch.index !== undefined) {
                if (boldMatch.index > 0) {
                    parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
                }
                parts.push(
                    <strong key={key++} style={{ color: '#FFD700', fontWeight: 600 }}>
                        {boldMatch[1]}
                    </strong>
                );
                remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
                continue;
            }

            // Inline code: `text`
            const codeMatch = remaining.match(/`([^`]+)`/);
            if (codeMatch && codeMatch.index !== undefined) {
                if (codeMatch.index > 0) {
                    parts.push(<span key={key++}>{remaining.slice(0, codeMatch.index)}</span>);
                }
                parts.push(
                    <code key={key++} style={{
                        background: 'rgba(255, 215, 0, 0.15)',
                        color: '#FFD700',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontSize: '12px',
                        fontFamily: 'monospace'
                    }}>
                        {codeMatch[1]}
                    </code>
                );
                remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
                continue;
            }

            // No more formatting found
            parts.push(<span key={key++}>{remaining}</span>);
            break;
        }

        return parts;
    };

    return <div style={{ wordBreak: 'break-word' }}>{renderContent()}</div>;
}
