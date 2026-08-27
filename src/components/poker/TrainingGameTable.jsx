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
  2: [{ x: 50, y: 100 }, { x: 50, y: 5 }],
  3: [{ x: 50, y: 100 }, { x: 20.5, y: 6 }, { x: 79.5, y: 6 }],
  4: [{ x: 50, y: 100 }, { x: 8, y: 45 }, { x: 50, y: 5 }, { x: 92, y: 45 }],
  5: [{ x: 50, y: 100 }, { x: 8, y: 55 }, { x: 20.5, y: 6 }, { x: 79.5, y: 6 }, { x: 92, y: 55 }],
  6: [{ x: 50, y: 100 }, { x: 8, y: 66 }, { x: 8, y: 33 }, { x: 50, y: 5 }, { x: 92, y: 33 }, { x: 92, y: 66 }],
  7: [{ x: 50, y: 100 }, { x: 8, y: 62 }, { x: 8, y: 33 }, { x: 27, y: 6 }, { x: 73, y: 6 }, { x: 92, y: 33 }, { x: 92, y: 62 }],
  8: [{ x: 50, y: 100 }, { x: 10.5, y: 82.5 }, { x: 8, y: 52 }, { x: 8, y: 23 }, { x: 50, y: 5 }, { x: 92, y: 23 }, { x: 92, y: 52 }, { x: 89.5, y: 82.5 }],
  9: [{ x: 50, y: 100 }, { x: 10.5, y: 82.5 }, { x: 8, y: 58 }, { x: 8, y: 30 }, { x: 27, y: 6 }, { x: 73, y: 6 }, { x: 92, y: 30 }, { x: 92, y: 58 }, { x: 89.5, y: 82.5 }],
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
  const path = `/hub/club-arena/cards/2color/${SUIT_MAP[card[1]]}_${RANK_MAP[card[0]] || card[0].toLowerCase()}.webp`;
  return <span className={`sp-club-card ${className}`}><img src={path} alt={card} /></span>;
}

function CardBackFan({ count = 2 }) {
  return (
    <div className="sp-club-card-fan" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <img
          key={index}
          src="/hub/club-arena/cards/backs/table/classic_red.webp"
          alt=""
          style={{ '--fan-index': index, '--fan-count': count }}
        />
      ))}
    </div>
  );
}

function HeroCards({ cards }) {
  const count = cards.length;
  const cardSizing = count >= 6
    ? { width: 54, height: 76, step: 21 }
    : count === 5
      ? { width: 57, height: 80, step: 23 }
      : count === 4
        ? { width: 60, height: 84, step: 25 }
        : { width: 44, height: 62, step: 32 };

  return (
    <div
      className={`sp-club-hero-cards ${count >= 4 ? 'is-fanned' : ''}`}
      style={{
        '--hero-card-width': `${cardSizing.width}px`,
        '--hero-card-height': `${cardSizing.height}px`,
        '--hero-card-step': `${cardSizing.step}px`,
        '--hero-card-count': count,
      }}
    >
      {cards.map((card, index) => (
        <span
          key={`${card}-${index}`}
          className="sp-club-hero-card-wrap"
          style={{ '--card-index': index }}
        >
          <Card card={card} />
        </span>
      ))}
    </div>
  );
}

function PlayerSeat({ seat, player, avatarSrc, index, holeCardCount, heroCards }) {
  const isHero = index === 0;
  return (
    <div
      className={`sp-club-seat ${isHero ? 'sp-club-seat--hero' : ''} ${player.isFolded ? 'is-folded' : ''}`}
      style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
    >
      {!isHero && <CardBackFan count={holeCardCount} />}
      <motion.img
        className="sp-club-portrait"
        src={normalizeTableAvatar(avatarSrc)}
        alt={player.name}
        // Keep positional transforms in CSS. Framer Motion writes its transform
        // inline, which used to erase translateX(-50%) and shift every avatar
        // half a seat to the right while the cards/nameplate stayed centered.
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: index * 0.04 }}
        onError={(event) => { event.currentTarget.src = '/avatars/table/free_fox.webp'; }}
      />
      <span className="sp-club-position">{player.position}</span>
      <div className="sp-club-nameplate">
        {player.isFolded && <em>Fold</em>}
        <span>{player.name}</span>
        <strong>{player.stack}</strong>
      </div>
      {isHero && <HeroCards cards={heroCards} />}
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
          <img className="sp-club-table-art" src="/hub/club-arena/assets/skin_carbon_ion-CuncF2Ud-v6.png" alt="" />

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
            <PlayerSeat
              key={resolvedPlayers[index].id || `seat-${index}`}
              seat={seat}
              player={resolvedPlayers[index]}
              avatarSrc={seatAvatars[index]}
              index={index}
              holeCardCount={Math.max(2, heroCards.length)}
              heroCards={heroCards}
            />
          ))}
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
        .sp-club-game-stage{position:relative;min-height:0;display:grid;grid-template-columns:minmax(220px,1fr) minmax(320px,605px) minmax(210px,1fr);align-items:stretch;overflow:hidden}
        .sp-club-decision-panel,.sp-club-session-panel{position:relative;z-index:30;align-self:center;margin:clamp(12px,2vw,28px);padding:20px;border:1px solid rgba(159,224,244,.46);border-radius:6px;background:linear-gradient(180deg,rgba(63,82,93,.88) 0,rgba(18,31,40,.96) 10%,rgba(2,8,13,.97) 72%,rgba(24,42,51,.96) 100%);box-shadow:0 22px 44px rgba(0,0,0,.55),inset 0 2px rgba(255,255,255,.16),inset 0 -3px 8px rgba(0,0,0,.72),0 0 0 1px rgba(0,0,0,.72)}.sp-club-decision-panel:before,.sp-club-session-panel:before{content:'';position:absolute;left:12px;right:12px;top:7px;height:1px;background:linear-gradient(90deg,transparent,#bdeeff 22%,#5cdcff 50%,#bdeeff 78%,transparent);opacity:.65}.sp-club-decision-panel>span,.sp-club-session-panel>span{color:#8ed8eb;font-size:9px;letter-spacing:2px;text-transform:uppercase}.sp-club-decision-panel h2{margin:9px 0 12px!important;color:#f2fbff!important;font-size:clamp(16px,1.5vw,23px)!important;line-height:1.14}.sp-club-decision-panel p,.sp-club-session-panel p{margin:0;color:#bdd3dc!important;font-size:12px;line-height:1.45}.sp-club-decision-panel>div{display:flex;align-items:baseline;gap:7px;margin-top:17px;padding-top:12px;border-top:1px solid rgba(119,207,234,.2)}.sp-club-decision-panel>div strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:22px;color:#72e8ff}.sp-club-decision-panel>div span{color:#9db7c1;font-size:10px;letter-spacing:1px;text-transform:uppercase}.sp-club-session-panel{text-align:right}.sp-club-session-panel>strong{display:block;margin:7px 0;color:#d8f8ff;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:28px}.sp-club-session-panel>div{height:5px;margin:8px 0 13px;padding:1px;border:1px solid rgba(91,197,225,.18);border-radius:5px;background:#02070b;box-shadow:inset 0 2px 3px rgba(0,0,0,.8)}.sp-club-session-panel>div i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#1599c5,#63edff);box-shadow:0 0 10px #44dfff}
        .sp-club-mobile-decision{display:none}
        .sp-club-arena-canvas{position:relative;z-index:10;justify-self:center;height:calc(100% - 62px);max-height:1000px;margin-top:62px;aspect-ratio:605/1000;overflow:visible}
        .sp-club-table-art{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;filter:drop-shadow(0 18px 26px rgba(0,0,0,.7))}
        .sp-club-timer{position:absolute;right:-4%;top:4.8%;z-index:36;min-width:62px;padding:5px 8px;border:1px solid #69737a;border-radius:6px;background:linear-gradient(180deg,#f8fdff,#b9c6cb 45%,#4f5c62 48%,#dbe4e7);box-shadow:0 7px 15px rgba(0,0,0,.58);transform:rotate(3deg);text-align:center;color:#091015}.sp-club-timer span{display:block;font-size:7px;letter-spacing:1px;text-transform:uppercase}.sp-club-timer strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:16px}.sp-club-timer.is-urgent strong{color:#d50d22}
        .sp-club-pot{position:absolute;left:49.9%;top:35.4%;z-index:25;transform:translate(-50%,-50%);display:flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid #21272a;border-radius:15px;background:linear-gradient(#1b2024,#07090b);box-shadow:0 7px 14px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.08)}.sp-club-pot span{color:#f4b629;font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}.sp-club-pot strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:11px;color:#e5ecf0}
        .sp-club-brandmark{position:absolute;left:50%;top:56%;z-index:18;transform:translate(-50%,-50%);width:34%;text-align:center;text-shadow:0 2px 2px #000;opacity:.72}.sp-club-brandmark strong{display:block;color:#aab0b4;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(12px,2.1vh,25px);letter-spacing:-1px}.sp-club-brandmark span{display:block;margin-top:4px;color:#a99742;font-size:clamp(5px,.65vh,8px);letter-spacing:1.2px;text-transform:uppercase}
        .sp-club-community-cards{position:absolute;z-index:28;left:50%;top:43.5%;transform:translate(-50%,-50%);display:flex;gap:3px;width:68%;justify-content:center;perspective:700px;filter:drop-shadow(0 8px 10px rgba(0,0,0,.55))}.sp-club-community-cards .sp-club-card{border:2px solid rgba(245,251,255,.96);box-shadow:inset 0 0 0 1px rgba(4,12,20,.24),0 5px 10px rgba(0,0,0,.62)}.sp-club-card{display:inline-block;width:clamp(24px,3.2vh,38px);aspect-ratio:64/92;overflow:hidden;border:1px solid rgba(255,255,255,.84);border-radius:4px;background:#fff;box-shadow:0 5px 11px rgba(0,0,0,.72)}.sp-club-card img{display:block;width:100%;height:100%;object-fit:contain}.sp-club-card--empty{background:linear-gradient(#263039,#0b1116);border-color:#3a474f}
        .sp-club-seat{position:absolute;z-index:40;width:96px;height:122px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;pointer-events:none}.sp-club-seat--hero{z-index:46;width:128px;height:150px;transform:translate(-50%,calc(-50% - 16px))}.sp-club-portrait{position:absolute;z-index:3;left:50%;bottom:23px;transform:translateX(-50%);width:100%;height:calc(100% - 12px);object-fit:contain;object-position:center bottom;filter:drop-shadow(0 5px 4px rgba(0,0,0,.82))}.sp-club-seat.is-folded{filter:grayscale(1);opacity:.56}
        .sp-club-card-fan{--fan-card-h:33px;position:absolute;z-index:2;left:50%;bottom:44px;width:100%;height:54px;transform:translateX(-50%)}.sp-club-card-fan img{position:absolute!important;left:50%;bottom:0;width:auto!important;height:var(--fan-card-h)!important;max-width:none!important;transform-origin:50% 120%;transform:translateX(-50%) rotate(calc((var(--fan-index) - (var(--fan-count) - 1)/2) * 7deg));filter:drop-shadow(0 2px 2px rgba(0,0,0,.7));border-radius:2px}
        .sp-club-position{position:absolute;z-index:6;right:1px;bottom:27px;padding:1px 4px;border-radius:3px;background:#273846;color:#a6b4c1;font-size:6px;line-height:1.3;text-transform:uppercase}.sp-club-nameplate{position:relative;z-index:7;width:78%;min-width:66px;padding:5px 4px 4px;border:1px solid rgba(126,111,37,.55);border-radius:6px;background:linear-gradient(180deg,rgba(27,28,24,.96),rgba(7,9,8,.98));box-shadow:0 7px 12px rgba(0,0,0,.7);text-align:center}.sp-club-nameplate span{display:block;overflow:hidden;color:#f3f5f5;font-size:clamp(7px,1.05vh,11px);line-height:1.05;white-space:nowrap;text-overflow:ellipsis}.sp-club-nameplate strong{display:block;margin-top:2px;color:#10d36b;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(7px,1.05vh,11px);line-height:1}.sp-club-nameplate em{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);padding:2px 8px;border-radius:8px;background:rgba(30,31,29,.84);color:#d7d9da;font-size:8px;font-style:normal;text-transform:uppercase}
        .sp-club-hero-cards{position:absolute;z-index:55;left:calc(100% + 1px);top:0;display:flex;align-items:center;justify-content:flex-start;pointer-events:none;filter:drop-shadow(0 5px 8px rgba(0,0,0,.65))}.sp-club-hero-card-wrap{display:block;flex:0 0 auto;margin-left:calc(var(--hero-card-step) - var(--hero-card-width));transform-origin:bottom center;animation:spClubHeroCardDeal .26s cubic-bezier(.22,.61,.36,1) backwards;animation-delay:calc(var(--card-index) * 55ms)}.sp-club-hero-card-wrap:first-child{margin-left:0}.sp-club-hero-card-wrap .sp-club-card{width:var(--hero-card-width);height:var(--hero-card-height);aspect-ratio:auto;border:2px solid #fff;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.55)}.sp-club-hero-cards.is-fanned .sp-club-hero-card-wrap{--fan-center:calc(var(--card-index) - (var(--hero-card-count) - 1)/2);transform:rotate(calc(var(--fan-center) * 3deg)) translateY(calc(var(--fan-center) * var(--fan-center) * 1.4px))}@keyframes spClubHeroCardDeal{from{opacity:0;translate:0 14px;scale:.94}to{opacity:1;translate:0 0;scale:1}}
        .sp-club-chip-marker{position:absolute;z-index:29;display:flex;align-items:center;gap:5px;padding:2px 6px 3px 4px;border:1px solid rgba(177,213,225,.2);border-radius:13px;background:linear-gradient(180deg,rgba(21,31,37,.8),rgba(3,7,10,.82));box-shadow:0 5px 9px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.08);color:#e6f1f5;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:9px;text-shadow:0 1px 2px #000}.sp-club-chip-marker i{position:relative;display:block;width:18px;height:18px;border:2px solid #d8e2e5;border-radius:50%;background:radial-gradient(circle at 34% 27%,#fff 0 19%,#cbd3d6 22% 43%,#f8fafb 46% 57%,#77858b 60% 75%,#d9e1e3 78%);box-shadow:0 3px 3px #000,inset 0 0 0 1px rgba(0,0,0,.32)}.sp-club-chip-marker i:before,.sp-club-chip-marker i:after{content:'';position:absolute;z-index:-1;left:-2px;width:18px;height:18px;border:2px solid #aab6bb;border-radius:50%;background:#5f6d73}.sp-club-chip-marker i:before{top:3px}.sp-club-chip-marker i:after{top:6px;box-shadow:0 3px 3px rgba(0,0,0,.65)}.sp-club-chip-marker.is-top{left:49%;top:17%}.sp-club-chip-marker.is-right{right:25%;top:40%}.sp-club-chip-marker.is-bottom{left:49%;bottom:14%}
        .sp-club-action-dock{position:relative;z-index:90;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;padding:9px max(12px,env(safe-area-inset-right)) max(9px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));border-top:2px solid #096be6;background:linear-gradient(180deg,#12243f,#061226 48%,#02060c);box-shadow:0 -10px 25px rgba(0,0,0,.65),inset 0 1px rgba(255,255,255,.08)}.sp-club-utilities{display:flex;gap:6px}.sp-club-utilities button{position:relative;width:38px;min-height:38px!important;font-size:15px}.sp-club-utilities button span{position:absolute;left:50%;top:-8px;transform:translateX(-50%);display:none;padding:2px 5px;border-radius:4px;background:#020508;color:#a9bbc4;font-size:7px;white-space:nowrap}.sp-club-primary-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.sp-club-action{height:66px!important;min-height:66px!important;padding:0!important;border:0!important;border-radius:14px!important;color:#fff!important;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(14px,1.6vw,20px);font-weight:800;letter-spacing:.5px;text-transform:capitalize!important;text-shadow:0 2px 2px rgba(0,0,0,.75);box-shadow:inset 0 2px rgba(255,255,255,.24),inset 0 -5px rgba(0,0,0,.28),0 8px 15px rgba(0,0,0,.5)!important;cursor:pointer}.sp-club-action.is-fold{background:linear-gradient(180deg,#ff4b52,#f00819 56%,#a5000b)!important}.sp-club-action.is-check{background:linear-gradient(180deg,#1aa2ff,#0879ef 56%,#004aa8)!important}.sp-club-action.is-raise{background:linear-gradient(180deg,#14df75,#00ad4e 56%,#006d30)!important}
        @media(max-width:980px){.sp-club-game-stage{display:block}.sp-club-decision-panel,.sp-club-session-panel{display:none}.sp-club-mobile-decision{position:absolute;z-index:65;left:8px;top:8px;display:flex;flex-direction:column;padding:5px 8px;border-left:2px solid #4bdffc;background:rgba(2,8,13,.72);box-shadow:0 5px 12px rgba(0,0,0,.45)}.sp-club-mobile-decision span{max-width:150px;overflow:hidden;color:#e1f8ff;font-size:9px;white-space:nowrap;text-overflow:ellipsis}.sp-club-mobile-decision strong{color:#72b6ca;font-size:7px;letter-spacing:1px;text-transform:uppercase}.sp-club-arena-canvas{position:absolute;left:50%;top:60px;height:calc(100% - 122px);max-height:none;margin-top:0;transform:translateX(-50%)}}
        @media(max-width:640px){.sp-club-training-table{min-height:calc(100dvh - 35px);height:calc(100dvh - 35px);grid-template-rows:52px minmax(0,1fr) 86px}.sp-club-game-hud{gap:6px;padding:5px 6px}.sp-club-hud-button{width:37px;min-height:37px!important}.sp-club-wallet{display:none}.sp-club-mini-board{padding:3px}.sp-club-mini-board .sp-club-card{width:20px;height:28px}.sp-club-game-stage{background:radial-gradient(circle at 50% 14%,rgba(181,229,243,.2),transparent 20%)}.sp-club-mobile-decision{top:5px;left:5px}.sp-club-timer{right:-5%;top:5%;min-width:50px;padding:3px 6px}.sp-club-timer strong{font-size:13px}.sp-club-pot{padding:4px 9px}.sp-club-brandmark{top:56%;width:52%}.sp-club-chip-marker.is-right{right:24%}.sp-club-seat{width:88px;height:99px}.sp-club-seat--hero{width:101px;height:121px}.sp-club-nameplate{min-width:56px;padding:4px 3px}.sp-club-card-fan{--fan-card-h:30px;bottom:42px}.sp-club-action-dock{grid-template-columns:1fr;padding:7px 7px max(7px,env(safe-area-inset-bottom))}.sp-club-utilities{position:absolute;left:5px;bottom:100%;gap:4px}.sp-club-utilities button{width:32px;min-height:32px!important;border-radius:7px!important}.sp-club-primary-actions{gap:7px}.sp-club-action{height:65px!important;min-height:65px!important;border-radius:13px!important;font-size:15px}}
        @media(max-width:480px){.sp-club-seat{width:80px;height:88px}.sp-club-seat--hero{width:88px;height:108px}.sp-club-card-fan{--fan-card-h:28px}}
        @media(max-width:380px){.sp-club-seat{width:72px;height:79px}.sp-club-seat--hero{width:79px;height:96px}.sp-club-card-fan{--fan-card-h:25px}}
        @media(max-height:700px) and (max-width:640px){.sp-club-training-table{grid-template-rows:45px minmax(0,1fr) 72px}.sp-club-game-hud{padding:3px 5px}.sp-club-hud-button{width:34px;min-height:34px!important}.sp-club-mini-board .sp-club-card{width:18px;height:25px}.sp-club-action{height:53px!important;min-height:53px!important}.sp-club-mobile-decision{display:none}}
      `}</style>
    </div>
  );
}

export default React.memo(TrainingGameTable);
