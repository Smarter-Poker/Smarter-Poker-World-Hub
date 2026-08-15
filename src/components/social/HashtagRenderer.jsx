/**
 * 🏷️ HASHTAG & MENTION RENDERER
 * src/components/social/HashtagRenderer.jsx
 * 
 * Parses post text for #hashtags and @mentions, rendering them as
 * styled, interactive elements. Drop-in replacement for inline renderMentions().
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React from 'react';

const HASHTAG_REGEX = /#(\w{2,30})/g;
// (?<![\w.]) stops "dan@gmail.com" from rendering "@gmail" as a mention;
// [\w.]* interior keeps dotted usernames whole (composer stores them dotted).
const MENTION_REGEX = /(?<![\w.])@([\w][\w.]{0,28}[\w]|[\w]{2})/g;
const COMBINED_REGEX = /(#\w{2,30}|(?<![\w.])@[\w][\w.]{0,29})/g;

const COLORS = {
    hashtag: '#1877F2',
    mention: '#1877F2',
};

/**
 * Renders text with clickable #hashtags and @mentions
 * @param {Object} props
 * @param {string} props.text - The text to render
 * @param {Function} [props.onHashtagClick] - Called with hashtag string (without #)
 * @param {Function} [props.onMentionClick] - Called with username string (without @)
 * @param {Object} [props.style] - Additional styles for the container
 */
export default function HashtagRenderer({ text, onHashtagClick, onMentionClick, style = {} }) {
    if (!text) return null;

    const parts = text.split(COMBINED_REGEX);

    return (
        <span style={style}>
            {parts.map((part, i) => {
                if (part.startsWith('#')) {
                    const tag = part.slice(1);
                    return (
                        <span
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                onHashtagClick?.(tag);
                            }}
                            style={{
                                color: COLORS.hashtag,
                                fontWeight: 600,
                                cursor: onHashtagClick ? 'pointer' : 'inherit',
                                textDecoration: 'none',
                            }}
                            role={onHashtagClick ? 'button' : undefined}
                            tabIndex={onHashtagClick ? 0 : undefined}
                        >
                            {part}
                        </span>
                    );
                }
                if (part.startsWith('@')) {
                    const username = part.slice(1);
                    return (
                        <a
                            key={i}
                            href={`/hub/user/${username}`}
                            onClick={(e) => {
                                if (onMentionClick) {
                                    e.preventDefault();
                                    onMentionClick(username);
                                }
                            }}
                            style={{
                                color: COLORS.mention,
                                fontWeight: 600,
                                textDecoration: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            {part}
                        </a>
                    );
                }
                return part;
            })}
        </span>
    );
}

/**
 * Utility: Extract all hashtags from text
 * @param {string} text
 * @returns {string[]} Array of hashtag strings (without #)
 */
export function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(HASHTAG_REGEX);
    return matches ? matches.map(m => m.slice(1).toLowerCase()) : [];
}

/**
 * Utility: Extract all mentions from text
 * @param {string} text
 * @returns {string[]} Array of username strings (without @)
 */
export function extractMentions(text) {
    if (!text) return [];
    const matches = text.match(MENTION_REGEX);
    return matches ? matches.map(m => m.slice(1)) : [];
}
