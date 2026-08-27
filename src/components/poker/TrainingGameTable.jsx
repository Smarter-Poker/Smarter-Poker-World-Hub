/**
 * TRAINING GAME TABLE — Club Arena visual system
 *
 * The training engine owns the hand state. This component intentionally owns
 * the same vertical stadium, seat treatment and action dock used by Club Arena
 * so every trainer feels like practice inside the live product.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { dealSeatAvatars, HERO_DEFAULT_AVATAR } from '../../lib/tableAvatars';

const CLUB_SEAT_LAYOUTS = {
  2: [{ x: 50, y: 93 }, { x: 50, y: 5 }],
  3: [{ x: 50, y: 93 }, { x: 3, y: 36 }, { x: 97, y: 36 }],
  4: [{ x: 50, y: 93 }, { x: 3, y: 50 }, { x: 50, y: 5 }, { x: 97, y: 50 }],
  5: [{ x: 50, y: 93 }, { x: 3, y: 66 }, { x: 18, y: 7 }, { x: 82, y: 7 }, { x: 97, y: 66 }],
  6: [{ x: 50, y: 93 }, { x: 3, y: 68 }, { x: 3, y: 32 }, { x: 50, y: 5 }, { x: 97, y: 32 }, { x: 97, y: 68 }],
  7: [{ x: 50, y: 93 }, { x: 7, y: 76 }, { x: 2, y: 43 }, { x: 24, y: 6 }, { x: 76, y: 6 }, { x: 98, y: 43 }, { x: 93, y: 76 }],
  8: [{ x: 50, y: 93 }, { x: 11, y: 78 }, { x: 2, y: 50 }, { x: 13, y: 17 }, { x: 50, y: 5 }, { x: 87, y: 17 }, { x: 98, y: 50 }, { x: 89, y: 78 }],
  9: [{ x: 50, y: 93 }, { x: 14, y: 80 }, { x: 2, y: 54 }, { x: 7, y: 25 }, { x: 31, y: 5 }, { x: 69, y: 5 }, { x: 93, y: 25 }, { x: 98, y: 54 }, { x: 86, y: 80 }],
};

const FALLBACK_PLAYERS = [
  { name: 'Kingfish', stack: 198, position: 'MP' },
  { name: 'Ella Lundin', stack: 597, position: 'CO' },
  { name: 'Rebecca Fisher', stack: 188, position: 'D' },
  { name: 'Tiffany Brooks', stack: 176, position: 'SB' },
  { name: 'Ryan Marquez', stack: 388, position: 'BB' },
  { name: 'CO Captain', stack: 155, position: 'UTG' },
  { name: 'Jordan Lee', stack: 264, position: 'HJ' },
  { name: 'Morgan Cruz', stack: 413, position: 'LJ' },
  { name: 'Sam Rivera', stack: 329, position: 'BTN' },
];

const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = { A: 'a', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', T: '10', J: 'j', Q: 'q', K: 'k' };

function normalizeTableAvatar(src) {
  if (!src || src.includes('/avatars/table/')) return src || HERO_DEFAULT_AVATAR;
  const match = src.match(/\/avatars\/(free|vip)\/([^/.]+)/);
  return match ? `/avatars/table/${match[1]}_${match[2]}.webp` : src;
}

function Card({ card, className = '' }) {
  if (!card || card.length < 2) return <span className={`sp-club-card sp-club-card--empty ${className}`} aria-hidden="true" />;
  const path = `/cards/${SUIT_MAP[card[1]]}_${RANK_MAP[card[0]] || card[0].toLowerCase()}.png`;
  return <span className={`sp-club-card ${className}`}><img src={path} alt={card} /></span>;
}

function CardBackFan() {
  return (
    <div className="sp-club-card-fan" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => <img key={index} src="/images/card-backs/red.png" alt="" style={{ '--fan-index': index }} />)}
    </div>
  );
}

function PlayerSeat({ seat, player, avatarSrc, index }) {
  const canvasX = 29 + (seat.x * 0.42);
  const canvasY = 9 + (seat.y * 0.84);
  const isHero = index === 0;
  return (
    <div
      className={`sp-club-seat ${isHero ? 'sp-club-seat--hero' : ''} ${player.isFolded ? 'is-folded' : ''}`}
      style={{ left: `${canvasX}%`, top: `${canvasY}%` }}
    >
      {!isHero && <CardBackFan />}
      <motion.img
        className="sp-club-portrait"
        src={normalizeTableAvatar(avatarSrc)}
        alt={player.name}
        initial={{ scale: 0.82, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: index * 0.04 }}
        onError={(event) => { event.currentTarget.src = '/avatars/table/free_fox.webp'; }}
      />
      <span className="sp-club-position">{player.position}</span>
      <div className="sp-club-nameplate">
        {player.isFolded && <em>Fold</em>}
        <span>{player.name}</span>
        <strong>{player.stack}</strong>
      </div>
    </div>
  );
}

function MiniBoard({ cards }) {
  const displayCards = cards.length ? cards.slice(0, 5) : ['Ks', 'Jh', 'Tc', '7d', '6s'];
  return <div className="sp-club-mini-board">{displayCards.map((card, index) => <Card key={`${card}-${index}`} card={card} />)}</div>;
}

function TrainingGameTable({
  heroCards = ['Ah', 'Kh'], communityCards = [], pot = 0, timer = 15,
  questionNumber = 1, totalQuestions = 20, gameTitle = 'GTO Training',
  questionText = 'Choose The Highest-Value Action For This Decision.',
  diamonds = 500, heroAvatarUrl = null, seatCount = 6, players = [],
  onFold, onCall, onRaise, onAllIn, onBack,
}) {
  const resolvedSeatCount = Math.max(2, Math.min(9, seatCount || 6));
  const seatLayout = CLUB_SEAT_LAYOUTS[resolvedSeatCount] || CLUB_SEAT_LAYOUTS[6];
  const resolvedPlayers = seatLayout.map((_, index) => ({ ...FALLBACK_PLAYERS[index], ...(players[index] || {}) }));
  const handAvatarKey = `${gameTitle}|${questionNumber}|${resolvedSeatCount}`;
  const seatAvatars = React.useMemo(
    () => dealSeatAvatars(handAvatarKey, resolvedSeatCount, heroAvatarUrl || HERO_DEFAULT_AVATAR),
    [handAvatarKey, heroAvatarUrl, resolvedSeatCount]
  );

  return (
    <div className="sp-club-training-table">
      <header className="sp-club-game-hud">
        <button type="button" className="sp-club-hud-button sp-club-menu" onClick={onBack} aria-label="Back To Training"><span /><span /><span /></button>
        <MiniBoard cards={communityCards} />
        <button type="button" className="sp-club-hud-button sp-club-add-seat" aria-label="Table Options">+</button>
        <div className="sp-club-hud-spacer" />
        <button type="button" className="sp-club-hud-button sp-club-stats" aria-label="Training Statistics">▥</button>
        <button type="button" className="sp-club-hud-button sp-club-chat" aria-label="Training Coach">▰</button>
        <div className="sp-club-wallet"><img src="/images/diamond.png" alt="" /><span>{diamonds.toLocaleString()}</span></div>
      </header>

      <main className="sp-club-game-stage">
        <aside className="sp-club-decision-panel">
          <span>Live Training Decision</span>
          <h2>{gameTitle}</h2>
          <p>{questionText}</p>
          <div><strong>{questionNumber}</strong><span>Of {totalQuestions}</span></div>
        </aside>

        <div className="sp-club-mobile-decision">
          <span>{gameTitle}</span><strong>Decision {questionNumber} Of {totalQuestions}</strong>
        </div>

        <div className="sp-club-arena-canvas">
          <img className="sp-club-table-art" src="/images/training/table-vertical-stadium-transparent.png" alt="" />

          <div className={`sp-club-timer ${timer <= 5 ? 'is-urgent' : ''}`}><span>Time</span><strong>{timer}</strong></div>
          <div className="sp-club-pot"><span>Pot</span><strong>{pot}</strong></div>
          <div className="sp-club-brandmark"><strong>Smarter.Poker</strong><span>Training Arena · Decision {questionNumber}</span></div>

          {communityCards.length > 0 && (
            <div className="sp-club-community-cards">{communityCards.map((card, index) => <Card key={`${card}-${index}`} card={card} />)}</div>
          )}

          <span className="sp-club-chip-marker is-top"><i />1</span>
          <span className="sp-club-chip-marker is-right"><i />2</span>
          <span className="sp-club-chip-marker is-bottom"><i />2</span>

          {seatLayout.map((seat, index) => (
            <PlayerSeat key={resolvedPlayers[index].id || `seat-${index}`} seat={seat} player={resolvedPlayers[index]} avatarSrc={seatAvatars[index]} index={index} />
          ))}

          <div className="sp-club-hero-cards">
            {heroCards.map((card, index) => (
              <motion.span
                key={`${card}-${index}`}
                className="sp-club-hero-card-wrap"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.16 + (index * 0.07) }}
                style={{ '--card-index': index, '--card-count': heroCards.length }}
              ><Card card={card} /></motion.span>
            ))}
          </div>
        </div>

        <aside className="sp-club-session-panel">
          <span>Training Session</span>
          <strong>{Math.round((questionNumber / Math.max(totalQuestions, 1)) * 100)}%</strong>
          <div><i style={{ width: `${Math.min(100, (questionNumber / Math.max(totalQuestions, 1)) * 100)}%` }} /></div>
          <p>Read The Table. Trust The Process.</p>
        </aside>
      </main>

      <footer className="sp-club-action-dock" data-sticky-action-bar>
        <div className="sp-club-utilities">
          <button type="button" aria-label="Hand History">♠</button>
          <button type="button" aria-label="All-In Preset" onClick={onAllIn}>◎<span>All-In</span></button>
        </div>
        <div className="sp-club-primary-actions">
          <button type="button" className="sp-club-action is-fold" onClick={onFold}>Fold</button>
          <button type="button" className="sp-club-action is-check" onClick={onCall}>Check</button>
          <button type="button" className="sp-club-action is-raise" onClick={onRaise}>Raise</button>
        </div>
      </footer>

      <style jsx global>{`
        .sp-club-training-table{--club-cyan:#45d9ff;--club-gold:#b09b43;position:relative;width:100%;min-height:calc(100dvh - 59px);height:calc(100dvh - 59px);display:grid;grid-template-rows:54px minmax(0,1fr) 92px;overflow:hidden;color:#f5fbff;font-family:var(--font-rajdhani,'Rajdhani'),sans-serif;background:radial-gradient(circle at 50% 18%,rgba(52,129,161,.55),transparent 34%),radial-gradient(circle at 50% 75%,rgba(16,118,150,.34),transparent 38%),linear-gradient(135deg,#142a36,#071019 48%,#102a34)}
        .sp-club-training-table:before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.36;background:radial-gradient(circle at 12% 20%,rgba(182,239,255,.26),transparent 18%),radial-gradient(circle at 90% 74%,rgba(71,214,238,.2),transparent 19%),linear-gradient(90deg,rgba(255,255,255,.04),transparent 22%,transparent 78%,rgba(255,255,255,.04));filter:blur(22px)}
        .sp-club-game-hud{position:relative;z-index:80;display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid rgba(91,210,242,.42);background:linear-gradient(180deg,#05090d,#0b1117 56%,#020508);box-shadow:0 10px 24px rgba(0,0,0,.56),inset 0 -1px rgba(255,255,255,.07)}
        .sp-club-hud-button,.sp-club-utilities button{min-height:40px!important;width:40px;display:grid;place-items:center;padding:0;border:2px solid #0a0d10!important;border-radius:9px!important;background:linear-gradient(180deg,#424950,#101419 48%,#030506)!important;color:#e8f6fb!important;box-shadow:inset 0 1px 1px rgba(255,255,255,.4),inset 0 -3px 4px #000,0 0 0 1px #56616a!important;text-shadow:0 1px 2px #000;font-size:18px;cursor:pointer}
        .sp-club-menu{display:flex;flex-direction:column;justify-content:center;gap:4px}.sp-club-menu span{width:20px;height:2px;background:#c7d2d8;box-shadow:0 1px #000}.sp-club-add-seat{border-radius:50%!important;background:rgba(5,10,14,.7)!important;border:1px dashed rgba(171,195,208,.35)!important;box-shadow:none!important;color:#77838a!important;font-size:25px}.sp-club-hud-spacer{flex:1}.sp-club-stats{font-size:20px}.sp-club-chat{font-size:16px}.sp-club-wallet{height:40px;display:flex;align-items:center;gap:6px;padding:0 10px;border:1px solid #475762;background:linear-gradient(#233541,#071018);box-shadow:inset 0 1px rgba(255,255,255,.2)}.sp-club-wallet img{width:15px;height:15px;object-fit:contain}.sp-club-wallet span{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:10px;color:#bff4ff}
        .sp-club-mini-board{display:flex;align-items:center;padding:3px 5px;border:1px solid #5a6870;border-radius:7px;background:#10161b;box-shadow:inset 0 0 0 2px #030506}.sp-club-mini-board .sp-club-card{width:22px;height:31px;margin-left:-1px;border-radius:2px}.sp-club-mini-board .sp-club-card:first-child{margin-left:0}
        .sp-club-game-stage{position:relative;min-height:0;display:grid;grid-template-columns:minmax(210px,1fr) minmax(420px,760px) minmax(190px,1fr);align-items:center;overflow:hidden}
        .sp-club-decision-panel,.sp-club-session-panel{position:relative;z-index:30;align-self:center;margin:24px;padding:18px;border:1px solid rgba(132,208,232,.32);background:linear-gradient(145deg,rgba(22,44,56,.9),rgba(2,8,13,.92));box-shadow:0 18px 38px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.1)}.sp-club-decision-panel>span,.sp-club-session-panel>span{color:#73b6c9;font-size:9px;letter-spacing:2px;text-transform:uppercase}.sp-club-decision-panel h2{margin:9px 0 12px!important;color:#f2fbff!important;font-size:clamp(16px,1.5vw,23px)!important;line-height:1.14}.sp-club-decision-panel p,.sp-club-session-panel p{margin:0;color:#a8c3ce!important;font-size:12px;line-height:1.45}.sp-club-decision-panel>div{display:flex;align-items:baseline;gap:7px;margin-top:17px;padding-top:12px;border-top:1px solid rgba(119,207,234,.2)}.sp-club-decision-panel>div strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:22px;color:#72e8ff}.sp-club-decision-panel>div span{color:#8aa8b4;font-size:10px;letter-spacing:1px;text-transform:uppercase}.sp-club-session-panel{text-align:right}.sp-club-session-panel>strong{display:block;margin:7px 0;color:#d8f8ff;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:28px}.sp-club-session-panel>div{height:3px;margin:8px 0 13px;background:#071016}.sp-club-session-panel>div i{display:block;height:100%;background:#44dfff;box-shadow:0 0 10px #44dfff}
        .sp-club-mobile-decision{display:none}
        .sp-club-arena-canvas{position:relative;z-index:10;justify-self:center;height:100%;max-height:900px;aspect-ratio:1/1}
        .sp-club-table-art{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 24px 30px rgba(0,0,0,.72)) saturate(.18) contrast(1.08)}
        .sp-club-timer{position:absolute;right:17.8%;top:7.5%;z-index:36;min-width:62px;padding:5px 8px;border:1px solid #69737a;border-radius:6px;background:linear-gradient(180deg,#f8fdff,#b9c6cb 45%,#4f5c62 48%,#dbe4e7);box-shadow:0 7px 15px rgba(0,0,0,.58);transform:rotate(3deg);text-align:center;color:#091015}.sp-club-timer span{display:block;font-size:7px;letter-spacing:1px;text-transform:uppercase}.sp-club-timer strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:16px}.sp-club-timer.is-urgent strong{color:#d50d22}
        .sp-club-pot{position:absolute;left:50%;top:23%;z-index:25;transform:translateX(-50%);display:flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid #21272a;border-radius:15px;background:linear-gradient(#1b2024,#07090b);box-shadow:0 7px 14px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.08)}.sp-club-pot span{color:#f4b629;font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}.sp-club-pot strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:11px;color:#e5ecf0}
        .sp-club-brandmark{position:absolute;left:50%;top:56%;z-index:18;transform:translate(-50%,-50%);width:34%;text-align:center;text-shadow:0 2px 2px #000;opacity:.72}.sp-club-brandmark strong{display:block;color:#aab0b4;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(12px,2.1vh,25px);letter-spacing:-1px}.sp-club-brandmark span{display:block;margin-top:4px;color:#a99742;font-size:clamp(5px,.65vh,8px);letter-spacing:1.2px;text-transform:uppercase}
        .sp-club-community-cards{position:absolute;z-index:28;left:50%;top:34%;transform:translateX(-50%);display:flex;gap:2px}.sp-club-card{display:inline-block;width:clamp(24px,3.2vh,38px);aspect-ratio:46/64;overflow:hidden;border:1px solid rgba(255,255,255,.84);border-radius:3px;background:#fff;box-shadow:0 5px 11px rgba(0,0,0,.72)}.sp-club-card img{display:block;width:100%;height:100%;object-fit:contain}.sp-club-card--empty{background:linear-gradient(#263039,#0b1116);border-color:#3a474f}
        .sp-club-seat{position:absolute;z-index:40;width:clamp(68px,10.7vh,112px);height:clamp(84px,13vh,138px);transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;pointer-events:none}.sp-club-seat--hero{z-index:46;width:clamp(78px,12vh,126px);height:clamp(98px,15vh,152px)}.sp-club-portrait{position:absolute;z-index:3;left:50%;bottom:23px;transform:translateX(-50%);width:100%;height:calc(100% - 12px);object-fit:contain;object-position:center bottom;filter:drop-shadow(0 5px 4px rgba(0,0,0,.82))}.sp-club-seat.is-folded{filter:grayscale(1);opacity:.56}
        .sp-club-card-fan{position:absolute;z-index:2;left:50%;bottom:48px;width:118%;height:52%;transform:translateX(-50%)}.sp-club-card-fan img{position:absolute;left:50%;bottom:0;width:34%;height:auto;transform-origin:50% 100%;transform:translateX(-50%) rotate(calc((var(--fan-index) - 2) * 12deg));filter:drop-shadow(0 2px 1px #000)}
        .sp-club-position{position:absolute;z-index:6;right:1px;bottom:27px;padding:1px 4px;border-radius:3px;background:#273846;color:#a6b4c1;font-size:6px;line-height:1.3;text-transform:uppercase}.sp-club-nameplate{position:relative;z-index:7;width:78%;min-width:66px;padding:5px 4px 4px;border:1px solid rgba(126,111,37,.55);border-radius:6px;background:linear-gradient(180deg,rgba(27,28,24,.96),rgba(7,9,8,.98));box-shadow:0 7px 12px rgba(0,0,0,.7);text-align:center}.sp-club-nameplate span{display:block;overflow:hidden;color:#f3f5f5;font-size:clamp(7px,1.05vh,11px);line-height:1.05;white-space:nowrap;text-overflow:ellipsis}.sp-club-nameplate strong{display:block;margin-top:2px;color:#10d36b;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(7px,1.05vh,11px);line-height:1}.sp-club-nameplate em{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);padding:2px 8px;border-radius:8px;background:rgba(30,31,29,.84);color:#d7d9da;font-size:8px;font-style:normal;text-transform:uppercase}
        .sp-club-hero-cards{position:absolute;z-index:55;left:54%;top:82%;display:flex;align-items:flex-end}.sp-club-hero-card-wrap{display:block;transform-origin:50% 100%;transform:rotate(calc((var(--card-index) - (var(--card-count) - 1)/2) * 7deg))}.sp-club-hero-card-wrap+.sp-club-hero-card-wrap{margin-left:clamp(-13px,-1.4vh,-9px)}.sp-club-hero-card-wrap .sp-club-card{width:clamp(38px,5.8vh,61px);box-shadow:0 8px 12px rgba(0,0,0,.72)}
        .sp-club-chip-marker{position:absolute;z-index:29;display:flex;align-items:center;gap:3px;color:#dce4e7;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:9px;text-shadow:0 1px 2px #000}.sp-club-chip-marker i{display:block;width:18px;height:18px;border:2px solid #c9d0d2;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0 25%,#bec6c9 27% 50%,#fafafa 53% 62%,#7f898e 65%);box-shadow:0 3px 3px #000}.sp-club-chip-marker.is-top{left:49%;top:17%}.sp-club-chip-marker.is-right{right:25%;top:40%}.sp-club-chip-marker.is-bottom{left:49%;bottom:14%}
        .sp-club-action-dock{position:relative;z-index:90;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;padding:9px max(12px,env(safe-area-inset-right)) max(9px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));border-top:2px solid #096be6;background:linear-gradient(180deg,#12243f,#061226 48%,#02060c);box-shadow:0 -10px 25px rgba(0,0,0,.65),inset 0 1px rgba(255,255,255,.08)}.sp-club-utilities{display:flex;gap:6px}.sp-club-utilities button{position:relative;width:38px;min-height:38px!important;font-size:15px}.sp-club-utilities button span{position:absolute;left:50%;top:-8px;transform:translateX(-50%);display:none;padding:2px 5px;border-radius:4px;background:#020508;color:#a9bbc4;font-size:7px;white-space:nowrap}.sp-club-primary-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.sp-club-action{min-height:66px!important;border:0!important;border-radius:14px!important;color:#fff!important;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(14px,1.6vw,20px);font-weight:800;letter-spacing:.5px;text-transform:capitalize!important;text-shadow:0 2px 2px rgba(0,0,0,.75);box-shadow:inset 0 2px rgba(255,255,255,.24),inset 0 -5px rgba(0,0,0,.28),0 8px 15px rgba(0,0,0,.5)!important;cursor:pointer}.sp-club-action.is-fold{background:linear-gradient(180deg,#ff4b52,#f00819 56%,#a5000b)!important}.sp-club-action.is-check{background:linear-gradient(180deg,#1aa2ff,#0879ef 56%,#004aa8)!important}.sp-club-action.is-raise{background:linear-gradient(180deg,#14df75,#00ad4e 56%,#006d30)!important}
        @media(max-width:980px){.sp-club-game-stage{display:block}.sp-club-decision-panel,.sp-club-session-panel{display:none}.sp-club-mobile-decision{position:absolute;z-index:65;left:8px;top:8px;display:flex;flex-direction:column;padding:5px 8px;border-left:2px solid #4bdffc;background:rgba(2,8,13,.72);box-shadow:0 5px 12px rgba(0,0,0,.45)}.sp-club-mobile-decision span{max-width:150px;overflow:hidden;color:#e1f8ff;font-size:9px;white-space:nowrap;text-overflow:ellipsis}.sp-club-mobile-decision strong{color:#72b6ca;font-size:7px;letter-spacing:1px;text-transform:uppercase}.sp-club-arena-canvas{position:absolute;left:50%;top:0;height:100%;max-height:none;transform:translateX(-50%)}}
        @media(max-width:640px){.sp-club-training-table{min-height:calc(100dvh - 35px);height:calc(100dvh - 35px);grid-template-rows:52px minmax(0,1fr) 86px}.sp-club-game-hud{gap:6px;padding:5px 6px}.sp-club-hud-button{width:37px;min-height:37px!important}.sp-club-wallet{display:none}.sp-club-mini-board{padding:3px}.sp-club-mini-board .sp-club-card{width:20px;height:28px}.sp-club-game-stage{background:radial-gradient(circle at 50% 14%,rgba(181,229,243,.2),transparent 20%)}.sp-club-mobile-decision{top:5px;left:5px}.sp-club-timer{right:27%;top:7%;min-width:50px;padding:3px 6px}.sp-club-timer strong{font-size:13px}.sp-club-pot{top:22.5%;padding:4px 9px}.sp-club-brandmark{top:56%;width:37%}.sp-club-community-cards{top:34%}.sp-club-chip-marker.is-right{right:24%}.sp-club-seat{width:clamp(58px,10.2vh,88px);height:clamp(72px,12.6vh,108px)}.sp-club-seat--hero{width:clamp(68px,11.7vh,98px);height:clamp(84px,14.4vh,124px)}.sp-club-nameplate{min-width:56px;padding:4px 3px}.sp-club-card-fan{bottom:42px}.sp-club-hero-cards{left:54%;top:81.5%}.sp-club-action-dock{grid-template-columns:1fr;padding:7px 7px max(7px,env(safe-area-inset-bottom))}.sp-club-utilities{position:absolute;left:5px;bottom:100%;gap:4px}.sp-club-utilities button{width:32px;min-height:32px!important;border-radius:7px!important}.sp-club-primary-actions{gap:7px}.sp-club-action{min-height:65px!important;border-radius:13px!important;font-size:15px}}
        @media(max-height:700px) and (max-width:640px){.sp-club-training-table{grid-template-rows:45px minmax(0,1fr) 72px}.sp-club-game-hud{padding:3px 5px}.sp-club-hud-button{width:34px;min-height:34px!important}.sp-club-mini-board .sp-club-card{width:18px;height:25px}.sp-club-action{min-height:53px!important}.sp-club-mobile-decision{display:none}}
      `}</style>
    </div>
  );
}

export default React.memo(TrainingGameTable);
