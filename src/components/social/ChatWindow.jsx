/**
 * ChatWindow — A small chat thread panel: a message list, a composer, a send button.
 *
 * This file used to open with a verbatim copy of the social-media feed page's
 * "PROTECTED FILE" banner, followed by ~3,000 lines of that page's code:
 * LinkPreviewCard and the whole PostCard component, none of it reachable from
 * here (ChatWindow never rendered a PostCard). The banner described features that
 * live in pages/hub/social-media/index.js, not in this component, and it
 * carried that page's line numbers - which were wrong even there.
 *
 * Removed 2026-09-08 along with the imports the dead code was the only
 * consumer of. If you need the feed's behaviour, import from the feed's
 * modules; do not copy this file again.
 */

import React, { useState, useEffect, useRef } from 'react';

// God-Mode Stack

import dynamic from 'next/dynamic';
const SharePostModal = dynamic(() => import('../../../src/components/social/SharePostModal'), {
  ssr: false,
});
const ShareStreakLeaderboard = dynamic(
  () => import('../../../src/components/social/ShareStreakLeaderboard'),
  { ssr: false }
);
// Shared utilities — single source of truth (extracted from this file)
import { SOCIAL_COLORS as C } from '../../../src/lib/socialHelpers';
import { SharedAvatar as Avatar } from '../../../src/components/social/SharedAvatar';

function ChatWindow({ chat, messages, currentUserId, onSend, onClose }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    await onSend(text);
    setText('');
  };

  // Group messages by date for timestamp labels
  const getDateLabel = (msg, prevMsg) => {
    if (!msg.createdAt) return null;
    const d = new Date(msg.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = d.toDateString();
    if (prevMsg) {
      const prevD = new Date(prevMsg.createdAt);
      if (prevD.toDateString() === dateStr) return null; // Same day, no label
    }
    if (dateStr === today.toDateString()) return 'Today';
    if (dateStr === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      style={{
        width: 328,
        height: 400,
        background: C.card,
        borderRadius: '8px 8px 0 0',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          padding: 8,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Avatar src={chat.avatar} name={chat.name} size={32} online={chat.online} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{chat.name}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {messages.map((m, i) => {
          const label = getDateLabel(m, i > 0 ? messages[i - 1] : null);
          return (
            <React.Fragment key={i}>
              {label && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: C.textSec,
                    padding: '8px 0 4px',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: m.senderId === currentUserId ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '6px 10px',
                    borderRadius: 16,
                    background: m.senderId === currentUserId ? C.blue : C.bg,
                    color: m.senderId === currentUserId ? 'white' : C.text,
                    fontSize: 14,
                  }}
                >
                  {m.text}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 8, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Aa"
          style={{
            flex: 1,
            padding: '6px 12px',
            borderRadius: 18,
            border: 'none',
            background: C.bg,
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.blue,
            fontSize: 16,
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
