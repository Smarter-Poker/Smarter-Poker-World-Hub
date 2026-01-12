/**
 * 💬 FACEBOOK-STYLE MESSENGER
 * src/app/social/components/FacebookMessenger.jsx
 * 
 * Chat system with conversation list and message threads
 */

import React, { useState, useRef, useEffect } from 'react';
import { FBAvatar, FB_COLORS } from './FacebookStyleCard';

// ═══════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════════════

const MessageBubble = ({ message, isOwn, showAvatar, user }) => (
    <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
        {!isOwn && showAvatar && (
            <FBAvatar src={user?.avatar} size={28} />
        )}
        {!isOwn && !showAvatar && <div className="avatar-spacer" />}

        <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
            {message.text}

            {/* Reactions */}
            {message.reactions?.length > 0 && (
                <div className="message-reactions">
                    {message.reactions.map((r, i) => (
                        <span key={i}>{r.emoji}</span>
                    ))}
                </div>
            )}
        </div>

        {/* Timestamp (on hover) */}
        <span className="message-time">{message.time}</span>

        <style>{`
            .message-row {
                display: flex;
                align-items: flex-end;
                gap: 8px;
                margin-bottom: 2px;
                padding: 0 12px;
            }

            .message-row.own {
                flex-direction: row-reverse;
            }

            .avatar-spacer {
                width: 28px;
            }

            .message-bubble {
                max-width: 65%;
                padding: 8px 12px;
                border-radius: 18px;
                font-size: 15px;
                line-height: 1.34;
                position: relative;
            }

            .message-bubble.own {
                background: ${FB_COLORS.blue};
                color: white;
                border-bottom-right-radius: 4px;
            }

            .message-bubble.other {
                background: ${FB_COLORS.bgMain};
                color: ${FB_COLORS.textPrimary};
                border-bottom-left-radius: 4px;
            }

            .message-reactions {
                position: absolute;
                bottom: -8px;
                right: 8px;
                background: white;
                border-radius: 10px;
                padding: 2px 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                font-size: 12px;
            }

            .message-time {
                font-size: 11px;
                color: ${FB_COLORS.textSecondary};
                opacity: 0;
                white-space: nowrap;
            }

            .message-row:hover .message-time {
                opacity: 1;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT WINDOW
// ═══════════════════════════════════════════════════════════════════════════

export const ChatWindow = ({
    conversation,
    messages = [],
    currentUser,
    onSend,
    onClose,
    onMinimize,
    minimized = false
}) => {
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (inputText.trim()) {
            onSend?.(inputText);
            setInputText('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const otherUser = conversation?.participants?.find(p => p.id !== currentUser?.id);

    if (minimized) {
        return (
            <div className="chat-minimized" onClick={onMinimize}>
                <FBAvatar src={otherUser?.avatar} size={48} online={otherUser?.online} />
                {conversation?.unreadCount > 0 && (
                    <span className="unread-badge">{conversation.unreadCount}</span>
                )}
                <style>{`
                    .chat-minimized {
                        position: relative;
                        cursor: pointer;
                    }
                    .unread-badge {
                        position: absolute;
                        top: -4px;
                        right: -4px;
                        min-width: 18px;
                        height: 18px;
                        background: #E41E3F;
                        color: white;
                        font-size: 11px;
                        font-weight: 700;
                        border-radius: 9px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="chat-window">
            {/* Header */}
            <div className="chat-header">
                <FBAvatar src={otherUser?.avatar} size={32} online={otherUser?.online} />
                <div className="chat-user-info">
                    <span className="chat-user-name">{otherUser?.name}</span>
                    <span className="chat-user-status">
                        {otherUser?.online ? 'Active now' : 'Active 2h ago'}
                    </span>
                </div>
                <div className="chat-header-actions">
                    <button className="header-btn" title="Start a call">📞</button>
                    <button className="header-btn" title="Start a video call">📹</button>
                    <button className="header-btn" onClick={onMinimize}>−</button>
                    <button className="header-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
                {messages.map((msg, i) => {
                    const isOwn = msg.senderId === currentUser?.id;
                    const prevMsg = messages[i - 1];
                    const showAvatar = !isOwn && (!prevMsg || prevMsg.senderId !== msg.senderId);

                    return (
                        <MessageBubble
                            key={msg.id || i}
                            message={msg}
                            isOwn={isOwn}
                            showAvatar={showAvatar}
                            user={otherUser}
                        />
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-input">
                <button className="input-btn">➕</button>
                <button className="input-btn">📷</button>
                <button className="input-btn">🎁</button>
                <button className="input-btn">🎵</button>

                <div className="input-wrapper">
                    <input
                        type="text"
                        placeholder="Aa"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={handleKeyPress}
                    />
                    <button className="emoji-btn">😊</button>
                </div>

                <button
                    className="send-btn"
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                >
                    {inputText.trim() ? '➤' : '👍'}
                </button>
            </div>

            <style>{`
                .chat-window {
                    width: 328px;
                    height: 455px;
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px 8px 0 0;
                    box-shadow: 0 0 8px rgba(0,0,0,0.15);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .chat-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    background: ${FB_COLORS.bgWhite};
                    border-bottom: 1px solid ${FB_COLORS.divider};
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                .chat-user-info {
                    flex: 1;
                }

                .chat-user-name {
                    display: block;
                    font-weight: 600;
                    font-size: 13px;
                    color: ${FB_COLORS.textPrimary};
                }

                .chat-user-status {
                    font-size: 11px;
                    color: ${FB_COLORS.textSecondary};
                }

                .chat-header-actions {
                    display: flex;
                    gap: 4px;
                }

                .header-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 14px;
                }

                .header-btn:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px 0;
                }

                .chat-input {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 8px;
                    border-top: 1px solid ${FB_COLORS.divider};
                }

                .input-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    color: ${FB_COLORS.blue};
                }

                .input-btn:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .input-wrapper {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    background: ${FB_COLORS.bgMain};
                    border-radius: 20px;
                    padding: 0 8px;
                }

                .input-wrapper input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    padding: 8px;
                    font-size: 14px;
                }

                .input-wrapper input:focus {
                    outline: none;
                }

                .emoji-btn {
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 16px;
                }

                .send-btn {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 18px;
                    color: ${FB_COLORS.blue};
                }

                .send-btn:disabled {
                    opacity: 0.5;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CONVERSATION LIST
// ═══════════════════════════════════════════════════════════════════════════

export const ConversationList = ({
    conversations = [],
    currentUser,
    onSelectConversation,
    onNewMessage
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredConversations = conversations.filter(conv => {
        const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
        return otherUser?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="conversation-list">
            {/* Header */}
            <div className="conv-header">
                <h2 className="conv-title">Chats</h2>
                <div className="conv-header-actions">
                    <button className="header-btn" title="Options">⋯</button>
                    <button className="header-btn" title="See all in Messenger">↗️</button>
                    <button className="header-btn" onClick={onNewMessage} title="New message">✏️</button>
                </div>
            </div>

            {/* Search */}
            <div className="conv-search">
                <span className="search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search Messenger"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Conversation Items */}
            <div className="conv-items">
                {filteredConversations.map((conv, i) => {
                    const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
                    const lastMessage = conv.lastMessage;

                    return (
                        <div
                            key={conv.id || i}
                            className={`conv-item ${conv.unread ? 'unread' : ''}`}
                            onClick={() => onSelectConversation?.(conv)}
                        >
                            <FBAvatar
                                src={otherUser?.avatar}
                                size={56}
                                online={otherUser?.online}
                            />
                            <div className="conv-info">
                                <span className="conv-name">{otherUser?.name}</span>
                                <span className="conv-preview">
                                    {lastMessage?.isOwn && 'You: '}
                                    {lastMessage?.text?.slice(0, 30)}
                                    {lastMessage?.text?.length > 30 && '...'}
                                    <span className="conv-time"> · {lastMessage?.time}</span>
                                </span>
                            </div>
                            {conv.unread && <div className="unread-dot" />}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="conv-footer">
                <a href="/messenger" className="see-all-link">See all in Messenger</a>
            </div>

            <style>{`
                .conversation-list {
                    width: 360px;
                    max-height: 500px;
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
                    display: flex;
                    flex-direction: column;
                }

                .conv-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                }

                .conv-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: ${FB_COLORS.textPrimary};
                    margin: 0;
                }

                .conv-header-actions {
                    display: flex;
                    gap: 8px;
                }

                .header-btn {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: ${FB_COLORS.bgMain};
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                }

                .header-btn:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .conv-search {
                    display: flex;
                    align-items: center;
                    margin: 0 16px 8px;
                    padding: 8px 12px;
                    background: ${FB_COLORS.bgMain};
                    border-radius: 20px;
                }

                .conv-search input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 15px;
                    margin-left: 8px;
                }

                .conv-search input:focus {
                    outline: none;
                }

                .search-icon {
                    color: ${FB_COLORS.textSecondary};
                }

                .conv-items {
                    flex: 1;
                    overflow-y: auto;
                }

                .conv-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 16px;
                    cursor: pointer;
                }

                .conv-item:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .conv-info {
                    flex: 1;
                    min-width: 0;
                }

                .conv-name {
                    display: block;
                    font-weight: 500;
                    font-size: 15px;
                    color: ${FB_COLORS.textPrimary};
                }

                .conv-item.unread .conv-name {
                    font-weight: 600;
                }

                .conv-preview {
                    font-size: 13px;
                    color: ${FB_COLORS.textSecondary};
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .conv-item.unread .conv-preview {
                    color: ${FB_COLORS.textPrimary};
                    font-weight: 500;
                }

                .conv-time {
                    color: ${FB_COLORS.textSecondary};
                }

                .unread-dot {
                    width: 12px;
                    height: 12px;
                    background: ${FB_COLORS.blue};
                    border-radius: 50%;
                }

                .conv-footer {
                    padding: 12px;
                    text-align: center;
                    border-top: 1px solid ${FB_COLORS.divider};
                }

                .see-all-link {
                    color: ${FB_COLORS.blue};
                    font-size: 15px;
                    font-weight: 500;
                    text-decoration: none;
                }

                .see-all-link:hover {
                    text-decoration: underline;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT DOCK (Bottom right floating chats)
// ═══════════════════════════════════════════════════════════════════════════

export const ChatDock = ({
    openChats = [],
    currentUser,
    onClose,
    onMinimize,
    onSend
}) => {
    return (
        <div className="chat-dock">
            {openChats.map((chat, i) => (
                <ChatWindow
                    key={chat.conversation.id || i}
                    conversation={chat.conversation}
                    messages={chat.messages}
                    currentUser={currentUser}
                    minimized={chat.minimized}
                    onClose={() => onClose?.(chat.conversation.id)}
                    onMinimize={() => onMinimize?.(chat.conversation.id)}
                    onSend={(text) => onSend?.(chat.conversation.id, text)}
                />
            ))}

            <style>{`
                .chat-dock {
                    position: fixed;
                    bottom: 0;
                    right: 80px;
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                    z-index: 1000;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    ChatWindow,
    ConversationList,
    ChatDock
};
