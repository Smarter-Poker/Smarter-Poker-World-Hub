/**
 * FRIEND CHALLENGE MODAL — Send trivia challenges to friends
 * Stakes: 5-50💎, winner takes all
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Gem, X, Search, User, Check } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';

const STAKE_OPTIONS = [5, 10, 25, 50];

export default function FriendChallengeModal({
    isOpen,
    onClose,
    userDiamonds = 0,
    friends = [],
    onSendChallenge,
    onSearchFriends
}) {
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [selectedStake, setSelectedStake] = useState(10);
    const [searchQuery, setSearchQuery] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const filteredFriends = friends.filter(f =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSend = async () => {
        if (!selectedFriend || userDiamonds < selectedStake) return;

        setSending(true);
        await onSendChallenge?.({
            friendId: selectedFriend.id,
            stake: selectedStake
        });
        setSending(false);
        setSent(true);

        setTimeout(() => {
            onClose?.();
            setSent(false);
            setSelectedFriend(null);
        }, 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="challenge-overlay">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="challenge-modal"
            >
                <MetalFrame padding="24px" showBolts={true}>
                    <div className="modal-header">
                        <Send size={32} className="header-icon" />
                        <h2>Challenge a Friend</h2>
                        <button className="close-btn" onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>

                    {!sent ? (
                        <>
                            {/* Search Friends */}
                            <div className="search-section">
                                <div className="search-input">
                                    <Search size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search Friends..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                <div className="friends-list">
                                    {filteredFriends.length > 0 ? (
                                        filteredFriends.map((friend) => (
                                            <button
                                                key={friend.id}
                                                className={`friend-item ${selectedFriend?.id === friend.id ? 'selected' : ''}`}
                                                onClick={() => setSelectedFriend(friend)}
                                            >
                                                <div className="friend-avatar">
                                                    {friend.avatar ? (
                                                        <img src={friend.avatar} alt={friend.username} />
                                                    ) : (
                                                        <User size={20} />
                                                    )}
                                                </div>
                                                <span className="friend-name">{friend.username}</span>
                                                {selectedFriend?.id === friend.id && (
                                                    <Check size={18} className="check-icon" />
                                                )}
                                            </button>
                                        ))
                                    ) : (
                                        <p className="no-friends">
                                            {searchQuery ? 'No friends found' : 'Add friends to challenge them!'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Stake Selection */}
                            <div className="stake-section">
                                <h3>Select Stake</h3>
                                <div className="stake-grid">
                                    {STAKE_OPTIONS.map((stake) => {
                                        const canAfford = userDiamonds >= stake;
                                        return (
                                            <button
                                                key={stake}
                                                className={`stake-btn ${selectedStake === stake ? 'selected' : ''} ${!canAfford ? 'disabled' : ''}`}
                                                onClick={() => canAfford && setSelectedStake(stake)}
                                                disabled={!canAfford}
                                            >
                                                <Gem size={16} />
                                                <span>{stake}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Challenge Summary */}
                            {selectedFriend && (
                                <div className="challenge-summary">
                                    <p>
                                        Challenge <strong>{selectedFriend.username}</strong> for{' '}
                                        <strong>{selectedStake} 💎</strong>
                                    </p>
                                    <p className="win-text">
                                        Winner takes <strong>{selectedStake * 2} 💎</strong>
                                    </p>
                                </div>
                            )}

                            {/* Balance & Send */}
                            <div className="modal-footer">
                                <div className="balance">
                                    <Gem size={14} />
                                    <span>Balance: {userDiamonds}</span>
                                </div>
                                <HexButton
                                    label={sending ? 'Sending...' : 'Send Challenge'}
                                    icon={Send}
                                    onClick={handleSend}
                                    variant="primary"
                                    disabled={!selectedFriend || userDiamonds < selectedStake || sending}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="sent-confirmation">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="sent-icon"
                            >
                                <Check size={48} />
                            </motion.div>
                            <h3>Challenge Sent!</h3>
                            <p>{selectedFriend?.username} has 24 hours to accept</p>
                        </div>
                    )}
                </MetalFrame>
            </motion.div>

            <style jsx>{`
                .challenge-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.85);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                }

                .challenge-modal {
                    max-width: 420px;
                    width: 100%;
                }

                .modal-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                    position: relative;
                }

                .header-icon {
                    color: #00d4ff;
                }

                .modal-header h2 {
                    font-size: 20px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0;
                    flex: 1;
                }

                .close-btn {
                    position: absolute;
                    right: 0;
                    top: 0;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    border-radius: 8px;
                    padding: 8px;
                    cursor: pointer;
                    color: rgba(255, 255, 255, 0.6);
                    transition: all 0.2s;
                }

                .close-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    color: #fff;
                }

                .search-section {
                    margin-bottom: 20px;
                }

                .search-input {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    margin-bottom: 12px;
                }

                .search-input input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #fff;
                    font-size: 14px;
                    outline: none;
                }

                .search-input input::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }

                .friends-list {
                    max-height: 180px;
                    overflow-y: auto;
                }

                .friend-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.15);
                    border: 2px solid transparent;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-bottom: 8px;
                }

                .friend-item:hover {
                    background: rgba(0, 0, 0, 0.25);
                }

                .friend-item.selected {
                    border-color: #00d4ff;
                    background: rgba(0, 212, 255, 0.1);
                }

                .friend-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    color: rgba(255, 255, 255, 0.5);
                }

                .friend-avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .friend-name {
                    flex: 1;
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    text-align: left;
                }

                .check-icon {
                    color: #00d4ff;
                }

                .no-friends {
                    text-align: center;
                    color: rgba(255, 255, 255, 0.4);
                    padding: 20px;
                    font-size: 14px;
                }

                .stake-section {
                    margin-bottom: 16px;
                }

                .stake-section h3 {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0 0 10px 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .stake-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 8px;
                }

                .stake-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    padding: 12px 8px;
                    background: rgba(0, 0, 0, 0.2);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    cursor: pointer;
                    color: #fff;
                    font-weight: 600;
                    transition: all 0.2s;
                }

                .stake-btn:hover:not(.disabled) {
                    border-color: #00d4ff;
                }

                .stake-btn.selected {
                    border-color: #00d4ff;
                    background: rgba(0, 212, 255, 0.15);
                }

                .stake-btn.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .challenge-summary {
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.2);
                    border-radius: 10px;
                    padding: 14px;
                    margin-bottom: 16px;
                    text-align: center;
                }

                .challenge-summary p {
                    margin: 0;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                }

                .challenge-summary .win-text {
                    color: #22c55e;
                    margin-top: 6px;
                }

                .modal-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .balance {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #00d4ff;
                    font-size: 13px;
                }

                .sent-confirmation {
                    text-align: center;
                    padding: 40px 20px;
                }

                .sent-icon {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 16px;
                    background: rgba(34, 197, 94, 0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #22c55e;
                }

                .sent-confirmation h3 {
                    font-size: 22px;
                    color: #22c55e;
                    margin: 0 0 8px 0;
                }

                .sent-confirmation p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }
            `}</style>
        </div>
    );
}
