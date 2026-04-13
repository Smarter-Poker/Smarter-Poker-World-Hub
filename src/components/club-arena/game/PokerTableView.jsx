/**
 * PokerTableView -- Main game table component (PokerBros-style)
 *
 * Renders the complete poker table UI:
 *   - Oval felt table with gold rim
 *   - Player seats around the perimeter
 *   - Community cards + pot display in center
 *   - Hero section at bottom (hole cards + hand strength)
 *   - Action buttons or advance toggles at bottom
 *   - Bet slider overlay when sizing a bet
 *   - Fold protection dialog
 *
 * Integrates with existing engines:
 *   - HandStateMachine (src/engines/HandStateMachine.js)
 *   - SoundManager (src/lib/SoundManager.ts)
 *   - CardAssets (src/lib/CardAssets.js)
 */
import React, { useState, useCallback } from 'react';
import PlayerSeat from './PlayerSeat';
import HeroSection from './HeroSection';
import ActionButtons from './ActionButtons';
import BetSlider from './BetSlider';
import AdvanceToggles from './AdvanceToggles';
import FoldProtection from './FoldProtection';
import CommunityCards from './CommunityCards';
import PotDisplay from './PotDisplay';

// Seat positions as percentage [left%, top%] for 2-9 player layouts
const SEAT_LAYOUTS = {
  2: [
    { left: 50, top: 8 },   // Opponent (top center)
    { left: 50, top: 72 },  // Hero (bottom center) -- replaced by HeroSection
  ],
  6: [
    { left: 50, top: 5 },    // Seat 0 - top center
    { left: 88, top: 20 },   // Seat 1 - top right
    { left: 88, top: 58 },   // Seat 2 - bottom right
    { left: 50, top: 72 },   // Seat 3 - bottom center (hero)
    { left: 12, top: 58 },   // Seat 4 - bottom left
    { left: 12, top: 20 },   // Seat 5 - top left
  ],
  9: [
    { left: 50, top: 3 },    // Seat 0
    { left: 82, top: 8 },    // Seat 1
    { left: 95, top: 30 },   // Seat 2
    { left: 92, top: 55 },   // Seat 3
    { left: 72, top: 72 },   // Seat 4
    { left: 50, top: 72 },   // Seat 5 (hero)
    { left: 28, top: 72 },   // Seat 6
    { left: 8, top: 55 },    // Seat 7
    { left: 5, top: 30 },    // Seat 8
  ],
};

function getSeatLayout(maxSeats) {
  return SEAT_LAYOUTS[maxSeats] || SEAT_LAYOUTS[6];
}

export default function PokerTableView({
  // Game state
  gameState = {},
  players = [],
  heroIndex = 0,
  activePlayerIndex = -1,
  communityCards = [],
  potAmount = 0,
  gameType = 'NLH',
  blinds = { small: 100, big: 200 },
  maxSeats = 6,
  // Hero state
  heroHoleCards = [],
  heroHandStrength = '',
  amountToCall = 0,
  minBet = 0,
  heroStack = 0,
  // Showdown
  isShowdown = false,
  winningCardIndices = [],
  netProfit = null,
  // Timer
  timerProgress = 1,
  timerUrgent = false,
  // Callbacks
  onFold,
  onCheckCall,
  onBet,
  onJoinSeat,
  onToggleAdvance,
  onOpenHandHistory,
  onOpenChat,
}) {
  const [showBetSlider, setShowBetSlider] = useState(false);
  const [showFoldProtection, setShowFoldProtection] = useState(false);

  const isHeroTurn = activePlayerIndex === heroIndex;
  const heroPlayer = players[heroIndex];
  const canCheck = amountToCall <= 0;
  const seatLayout = getSeatLayout(maxSeats);

  // Handle fold with protection
  const handleFold = useCallback(() => {
    if (canCheck) {
      setShowFoldProtection(true);
    } else {
      onFold?.();
    }
  }, [canCheck, onFold]);

  const handleFoldConfirm = useCallback(() => {
    setShowFoldProtection(false);
    onFold?.();
  }, [onFold]);

  const handleCheckFromProtection = useCallback(() => {
    setShowFoldProtection(false);
    onCheckCall?.();
  }, [onCheckCall]);

  const handleBetConfirm = useCallback((amount) => {
    setShowBetSlider(false);
    onBet?.(amount);
  }, [onBet]);

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col overflow-hidden">

      {/* === TABLE AREA === */}
      <div className="flex-1 relative flex items-center justify-center px-2 pt-2 pb-0">

        {/* Oval table */}
        <div
          className="relative w-full max-w-[95vw] sm:max-w-[500px]"
          style={{ aspectRatio: '3 / 2' }}
        >
          {/* Table felt */}
          <div
            className="absolute inset-0 rounded-[50%] overflow-hidden"
            style={{
              background: 'radial-gradient(ellipse at center, #1a5c30 0%, #0f3d1f 60%, #0a2914 100%)',
              border: '3px solid #b8860b',
              boxShadow: '0 0 30px rgba(184,134,11,0.3), inset 0 2px 20px rgba(0,0,0,0.5)',
            }}
          >
            {/* Diamond pattern overlay */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 10px,
                  rgba(255,255,255,0.1) 10px,
                  rgba(255,255,255,0.1) 11px
                )`,
              }}
            />
          </div>

          {/* Community cards + Pot (centered on table) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
            <CommunityCards
              cards={communityCards}
              winningCardIndices={winningCardIndices}
              isShowdown={isShowdown}
            />
            <PotDisplay
              potAmount={potAmount}
              gameType={gameType}
              blinds={blinds}
              netProfit={netProfit}
            />
          </div>

          {/* Player seats (excluding hero) */}
          {seatLayout.map((pos, seatIdx) => {
            if (seatIdx === heroIndex) return null; // Hero rendered separately below
            const player = players[seatIdx] || null;
            const isActive = seatIdx === activePlayerIndex;
            const isEmpty = !player;

            return (
              <PlayerSeat
                key={seatIdx}
                player={player}
                isActive={isActive}
                isDealer={player?.isDealer}
                isSB={player?.isSB}
                isBB={player?.isBB}
                actionTag={player?.actionTag || null}
                currentBet={player?.currentBet || 0}
                timerProgress={isActive ? timerProgress : 1}
                timerUrgent={isActive ? timerUrgent : false}
                isEmpty={isEmpty}
                onJoinSeat={() => onJoinSeat?.(seatIdx)}
                style={{
                  left: `${pos.left}%`,
                  top: `${pos.top}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* === HERO SECTION === */}
      <div className="flex-shrink-0 border-t border-gray-800/50 bg-gray-900/80">
        <HeroSection
          name={heroPlayer?.name || 'Hero'}
          stack={heroPlayer?.stack || heroStack}
          avatarUrl={heroPlayer?.avatarUrl}
          holeCards={heroHoleCards}
          handStrength={heroHandStrength}
          isMyTurn={isHeroTurn}
          isFolded={heroPlayer?.isFolded}
        />
      </div>

      {/* === ACTION BAR === */}
      <div className="flex-shrink-0 bg-gray-900/95 border-t border-gray-800/50 pb-safe">
        {showBetSlider ? (
          <BetSlider
            minBet={minBet || blinds.big}
            maxBet={heroPlayer?.stack || heroStack}
            potSize={potAmount}
            bigBlind={blinds.big}
            isPreflop={communityCards.filter(c => c != null).length === 0}
            onConfirm={handleBetConfirm}
            onCancel={() => setShowBetSlider(false)}
          />
        ) : isHeroTurn && !heroPlayer?.isFolded ? (
          <ActionButtons
            amountToCall={amountToCall}
            minBet={minBet}
            canCheck={canCheck}
            isRaise={amountToCall > 0}
            onFold={handleFold}
            onCheckCall={onCheckCall}
            onOpenBetSlider={() => setShowBetSlider(true)}
          />
        ) : (
          <AdvanceToggles
            hasPendingBet={amountToCall > 0}
            pendingBetAmount={amountToCall}
            onToggle={onToggleAdvance}
            onOpenHandHistory={onOpenHandHistory}
            onOpenChat={onOpenChat}
          />
        )}
      </div>

      {/* === FOLD PROTECTION MODAL === */}
      {showFoldProtection && (
        <FoldProtection
          onCheck={handleCheckFromProtection}
          onFold={handleFoldConfirm}
          onClose={() => setShowFoldProtection(false)}
        />
      )}
    </div>
  );
}
