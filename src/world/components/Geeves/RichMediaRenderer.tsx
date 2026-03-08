/* ═══════════════════════════════════════════════════════════════════════════
   RICH MEDIA RENDERER — Render markdown formatting in Geeves messages
   Supports: **bold**, *italic*, `code`, ```code blocks```, ## headers,
   - bullet lists, [links](url), ![images](url)
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';

interface RichMediaRendererProps {
    content: string;
}

export function RichMediaRenderer({ content }: RichMediaRendererProps) {
    if (!content) return null;

    // Split content into blocks (code blocks, paragraphs)
    const blocks = parseBlocks(content);

    return (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#fff' }}>
            {blocks.map((block, i) => renderBlock(block, i))}
        </div>
    );
}

// ── Block-level parsing ──
interface Block {
    type: 'code-block' | 'header' | 'bullet-list' | 'paragraph';
    content: string;
    language?: string;
    level?: number;
    items?: string[];
}

function parseBlocks(text: string): Block[] {
    const blocks: Block[] = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Code block: ```lang ... ```
        if (line.trim().startsWith('```')) {
            const lang = line.trim().replace(/^```/, '').trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            blocks.push({ type: 'code-block', content: codeLines.join('\n'), language: lang || undefined });
            i++; // skip closing ```
            continue;
        }

        // Header: ## Text
        const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
        if (headerMatch) {
            blocks.push({ type: 'header', content: headerMatch[2], level: headerMatch[1].length });
            i++;
            continue;
        }

        // Bullet list: - item or • item or * item (at start of line)
        if (/^\s*[-•*]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-•*]\s+/, ''));
                i++;
            }
            blocks.push({ type: 'bullet-list', content: '', items });
            continue;
        }

        // Empty lines — skip
        if (line.trim() === '') {
            i++;
            continue;
        }

        // Paragraph: collect consecutive non-special lines
        const paraLines: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !lines[i].trim().startsWith('```') &&
            !lines[i].match(/^#{1,4}\s+/) &&
            !/^\s*[-•*]\s+/.test(lines[i])
        ) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length > 0) {
            blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
        }
    }

    return blocks;
}

// ── Block rendering ──
function renderBlock(block: Block, key: number): React.ReactElement {
    switch (block.type) {
        case 'code-block':
            return (
                <pre
                    key={key}
                    style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(0, 212, 255, 0.15)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        margin: '8px 0',
                        overflowX: 'auto',
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                        color: '#e0e0e0',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                >
                    {block.content}
                </pre>
            );

        case 'header': {
            const sizes: Record<number, number> = { 1: 18, 2: 16, 3: 15, 4: 14 };
            return (
                <div
                    key={key}
                    style={{
                        fontSize: sizes[block.level || 2] || 16,
                        fontWeight: 700,
                        color: '#00d4ff',
                        margin: '12px 0 6px',
                        fontFamily: "'Rajdhani', 'Inter', sans-serif",
                        letterSpacing: '0.02em',
                    }}
                >
                    {renderInline(block.content)}
                </div>
            );
        }

        case 'bullet-list':
            return (
                <ul
                    key={key}
                    style={{
                        margin: '6px 0',
                        paddingLeft: 20,
                        listStyleType: 'none',
                    }}
                >
                    {(block.items || []).map((item, j) => (
                        <li
                            key={j}
                            style={{
                                position: 'relative',
                                paddingLeft: 12,
                                marginBottom: 4,
                                fontSize: 14,
                            }}
                        >
                            <span
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    color: '#00d4ff',
                                    fontWeight: 700,
                                }}
                            >
                                •
                            </span>
                            {renderInline(item)}
                        </li>
                    ))}
                </ul>
            );

        case 'paragraph':
        default:
            return (
                <p key={key} style={{ margin: '4px 0' }}>
                    {renderInline(block.content)}
                </p>
            );
    }
}

// ── Inline formatting ──
// Handles: **bold**, *italic*, `code`, [text](url)
function renderInline(text: string): React.ReactNode {
    if (!text) return null;

    // Combined regex to match all inline patterns in order
    // Order matters: ** must come before * to avoid conflicts
    const regex = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*([^*]+)\*)/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyCounter = 0;

    while ((match = regex.exec(text)) !== null) {
        // Add text before this match
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }

        if (match[1]) {
            // **bold**
            parts.push(
                <strong key={`b-${keyCounter++}`} style={{ fontWeight: 700, color: '#fff' }}>
                    {match[2]}
                </strong>
            );
        } else if (match[3]) {
            // `code`
            parts.push(
                <code
                    key={`c-${keyCounter++}`}
                    style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(0, 212, 255, 0.15)',
                        padding: '1px 5px',
                        borderRadius: 4,
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        color: '#00d4ff',
                    }}
                >
                    {match[4]}
                </code>
            );
        } else if (match[5]) {
            // [text](url)
            parts.push(
                <a
                    key={`a-${keyCounter++}`}
                    href={match[7]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: '#00d4ff',
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                    }}
                >
                    {match[6]}
                </a>
            );
        } else if (match[8]) {
            // *italic*
            parts.push(
                <em key={`i-${keyCounter++}`} style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.9)' }}>
                    {match[9]}
                </em>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
}
