import React from 'react';
import { defaultTheme } from './MessengerTheme';
import { Avatar } from './Avatar';

export function SearchBar({ 
    value, 
    onChange, 
    onSearchUser, 
    searchResults, 
    onSelectUser, 
    inputRef, 
    composing,
    theme: C = defaultTheme 
}) {
    return (
        <div style={{ padding: '12px 16px', position: 'relative' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                background: C.bg,
                borderRadius: 24,
                padding: '0 12px',
                border: composing ? `2px solid ${C.blue}` : 'none',
            }}>
                <span style={{ color: C.textSec, marginRight: 8 }}></span>
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={e => { onChange(e.target.value); onSearchUser?.(e.target.value); }}
                    placeholder={composing ? "Type a name to start chatting..." : "Search Messenger"}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        padding: '10px 0',
                        fontSize: 15,
                        outline: 'none',
                        color: '#050505',
                    }}
                />
            </div>

            {/* Search results dropdown */}
            {searchResults?.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 16,
                    right: 16,
                    background: C.card,
                    borderRadius: 12,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    maxHeight: 240,
                    overflowY: 'auto',
                }}>
                    {searchResults.map(user => (
                        <div
                            key={user.id}
                            onClick={() => onSelectUser?.(user)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 16px',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <Avatar src={user.avatar_url} name={user.username} size={40} theme={C} />
                            <div>
                                <div style={{ fontWeight: 500 }}>{user.username}</div>
                                {user.full_name && <div style={{ fontSize: 13, color: C.textSec }}>{user.full_name}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

SearchBar.displayName = 'SearchBar';
