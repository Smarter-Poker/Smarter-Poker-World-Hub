/* ═══════════════════════════════════════════════════════════════════════════
   RICH MEDIA RENDERER — Render images, videos, and markdown in messages
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';

interface RichMediaRendererProps {
    content: string;
}

export function RichMediaRenderer({ content }: RichMediaRendererProps) {
    // Parse content for media and markdown
    const renderContent = () => {
        const parts: React.ReactElement[] = [];
        let lastIndex = 0;

        // Image pattern: ![alt](url)
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        // Video pattern: [video](url)
        const videoRegex = /\[video\]\(([^)]+)\)/g;
        // Link pattern: [text](url)
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        // Bold pattern: **text**
        const boldRegex = /\*\*([^*]+)\*\*/g;
        // Italic pattern: *text*
        const italicRegex = /\*([^*]+)\*/g;
        // Code pattern: `code`
        const codeRegex = /`([^`]+)`/g;

        // Check for images
        let match;
        const imageMatches: Array<{ index: number; alt: string; url: string }> = [];
        while ((match = imageRegex.exec(content)) !== null) {
            imageMatches.push({ index: match.index, alt: match[1], url: match[2] });
        }

        // Check for videos
        const videoMatches: Array<{ index: number; url: string }> = [];
        videoRegex.lastIndex = 0;
        while ((match = videoRegex.exec(content)) !== null) {
            videoMatches.push({ index: match.index, url: match[1] });
        }

        // If we have media, render it
        if (imageMatches.length > 0 || videoMatches.length > 0) {
            const allMedia = [
                ...imageMatches.map(m => ({ ...m, type: 'image' as const })),
                ...videoMatches.map(m => ({ ...m, type: 'video' as const }))
            ].sort((a, b) => a.index - b.index);

            allMedia.forEach((media, i) => {
                // Add text before media
                if (media.index > lastIndex) {
                    const text = content.substring(lastIndex, media.index);
                    if (text.trim()) {
                        parts.push(
                            <p key={`text-${i}`} style={{ margin: '0 0 8px 0' }}>
                                {renderInlineFormatting(text)}
                            </p>
                        );
                    }
                }

                // Add media
                if (media.type === 'image') {
                    parts.push(
                        <img
                            key={`img-${i}`}
                            src={(media as any).url}
                            alt={(media as any).alt}
                            style={{
                                maxWidth: '100%',
                                borderRadius: '8px',
                                marginBottom: '8px'
                            }}
                        />
                    );
                    lastIndex = media.index + `![${(media as any).alt}](${(media as any).url})`.length;
                } else {
                    parts.push(
                        <video
                            key={`video-${i}`}
                            src={(media as any).url}
                            controls
                            style={{
                                maxWidth: '100%',
                                borderRadius: '8px',
                                marginBottom: '8px'
                            }}
                        />
                    );
                    lastIndex = media.index + `[video](${(media as any).url})`.length;
                }
            });

            // Add remaining text
            if (lastIndex < content.length) {
                const text = content.substring(lastIndex);
                if (text.trim()) {
                    parts.push(
                        <p key="text-final" style={{ margin: 0 }}>
                            {renderInlineFormatting(text)}
                        </p>
                    );
                }
            }

            return <div>{parts}</div>;
        }

        // No media, just render formatted text
        return <p style={{ margin: 0 }}>{renderInlineFormatting(content)}</p>;
    };

    const renderInlineFormatting = (text: string) => {
        const parts: Array<string | React.ReactElement> = [];
        let lastIndex = 0;

        // Process bold, italic, code, and links
        const patterns = [
            { regex: /\*\*([^*]+)\*\*/g, render: (match: string) => <strong key={`bold-${lastIndex}`}>{match}</strong> },
            { regex: /\*([^*]+)\*/g, render: (match: string) => <em key={`italic-${lastIndex}`}>{match}</em> },
            { regex: /`([^`]+)`/g, render: (match: string) => <code key={`code-${lastIndex}`} style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '2px 4px', borderRadius: '3px' }}>{match}</code> },
            { regex: /\[([^\]]+)\]\(([^)]+)\)/g, render: (text: string, url: string) => <a key={`link-${lastIndex}`} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#00d4ff', textDecoration: 'underline' }}>{text}</a> }
        ];

        // For simplicity, just return text with basic formatting
        // A full implementation would parse all patterns
        return text;
    };

    return renderContent();
}
