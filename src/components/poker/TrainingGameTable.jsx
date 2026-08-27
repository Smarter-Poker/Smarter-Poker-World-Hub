/**
 * TRAINING GAME TABLE — Club Arena training skin
 * The training engine supplies decisions; this component supplies the shared
 * table presentation used by every table-based training game.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { dealSeatAvatars, HERO_DEFAULT_AVATAR } from '../../lib/tableAvatars';

const SEATS = [
  { id: 'hero', x: 50, y: 91, isHero: true, name: 'Hero' },
  { id: 'v1', x: 25, y: 83, name: 'Villain 1' },
  { id: 'v2', x: 7, y: 61, name: 'Villain 2' },
  { id: 'v3', x: 11, y: 24, name: 'Villain 3' },
  { id: 'v4', x: 34, y: 6, name: 'Villain 4' },
  { id: 'v5', x: 66, y: 6, name: 'Villain 5' },
  { id: 'v6', x: 89, y: 24, name: 'Villain 6' },
  { id: 'v7', x: 93, y: 61, name: 'Villain 7' },
  { id: 'v8', x: 75, y: 83, name: 'Villain 8' },
];
const DEFAULT_STACKS = [45, 32, 28, 55, 41, 38, 62, 29, 51];
const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = { A: 'a', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', T: '10', J: 'j', Q: 'q', K: 'k' };

function Card({ card, hero = false }) {
  if (!card) return null;
  const imagePath = `/cards/${SUIT_MAP[card[1]]}_${RANK_MAP[card[0]] || card[0].toLowerCase()}.png`;
  return <div className={`sp-arena-card ${hero ? 'sp-arena-card--hero' : ''}`}><img src={imagePath} alt={card} /></div>;
}

function PlayerSeat({ seat, stack, avatarSrc }) {
  return (
    <div className={`sp-arena-seat ${seat.isHero ? 'sp-arena-seat--hero' : ''}`} style={{ left: `${seat.x}%`, top: `${seat.y}%` }}>
      <motion.div className="sp-arena-avatar-shell" initial={{ scale: 0.82, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <img className="sp-arena-avatar" src={avatarSrc} alt={seat.name} onError={(event) => { event.currentTarget.src = '/avatars/default.png'; }} />
      </motion.div>
      <div className="sp-arena-seat-plate"><span>{seat.name}</span><strong>{stack} BB</strong></div>
    </div>
  );
}

function TrainingGameTable({
  heroCards = ['Ah', 'Kh'], communityCards = [], pot = 0, timer = 15,
  questionNumber = 1, totalQuestions = 20, gameTitle = 'ICM Fundamentals',
  questionText = 'You Are On The Button. The Player To Your Right Bets 2.5BB. What Is Your Best Move?',
  diamonds = 500, heroAvatarUrl = null, onFold, onCall, onRaise, onAllIn, onBack,
}) {
  const handAvatarKey = `${gameTitle}|${questionNumber}`;
  const seatAvatars = React.useMemo(
    () => dealSeatAvatars(handAvatarKey, SEATS.length, heroAvatarUrl || HERO_DEFAULT_AVATAR),
    [handAvatarKey, heroAvatarUrl]
  );
  const actions = [
    { label: 'Fold', detail: 'Exit Hand', className: 'is-fold', onClick: onFold },
    { label: 'Call', detail: 'Match Bet', className: 'is-call', onClick: onCall },
    { label: 'Raise To 8BB', detail: 'Apply Pressure', className: 'is-raise', onClick: onRaise },
    { label: 'All-In', detail: 'Commit Stack', className: 'is-allin', onClick: onAllIn },
  ];

  return (
    <div className="sp-club-training-table">
      <div className="sp-arena-statusbar">
        <button type="button" className="sp-arena-back" onClick={onBack}>← Back To Training</button>
        <div className="sp-arena-titleblock"><span>Live Training Table</span><strong>{gameTitle}</strong></div>
        <div className="sp-arena-wallet"><img src="/images/diamond.png" alt="" /> {diamonds.toLocaleString()}</div>
      </div>

      <section className="sp-arena-question" aria-label="Current Training Question">
        <div><span>Decision {questionNumber} / {totalQuestions}</span><strong>{questionText}</strong></div>
        <div className={`sp-arena-timer ${timer <= 5 ? 'is-urgent' : ''}`}><span>Time</span><strong>{timer}</strong></div>
      </section>

      <div className="sp-arena-table-zone">
        <div className="sp-arena-ambient" />
        <div className="sp-arena-table-wrap">
          <div className="sp-arena-table-rail"><div className="sp-arena-table-trim"><div className="sp-arena-felt">
            <div className="sp-arena-felt-grid" />
            <div className="sp-arena-pot"><span>Pot</span><strong>{pot} BB</strong></div>
            <div className="sp-arena-brandmark"><span>SMARTER.POKER</span><strong>TRAINING ARENA</strong></div>
            {communityCards.length > 0 && <div className="sp-arena-board">{communityCards.map((card, index) => <Card key={`${card}-${index}`} card={card} />)}</div>}
          </div></div></div>
          {SEATS.map((seat, index) => <PlayerSeat key={seat.id} seat={seat} stack={DEFAULT_STACKS[index]} avatarSrc={seatAvatars[index]} />)}
          <div className="sp-arena-hero-cards">
            {heroCards.map((card, index) => (
              <motion.div key={`${card}-${index}`} initial={{ y: 20, opacity: 0, rotate: index === 0 ? -10 : 10 }} animate={{ y: 0, opacity: 1, rotate: index === 0 ? -5 : 5 }} transition={{ delay: 0.18 + index * 0.08 }}>
                <Card card={card} hero />
              </motion.div>
            ))}
          </div>
          <div className="sp-arena-dealer">D</div>
        </div>
      </div>

      <div className="sp-arena-actions" data-sticky-action-bar>
        {actions.map((action) => <button type="button" key={action.label} className={`sp-arena-action ${action.className}`} onClick={action.onClick}><span>{action.detail}</span><strong>{action.label}</strong></button>)}
      </div>

      <style jsx global>{`
        .sp-club-training-table{width:100%;min-height:calc(100dvh - 59px);height:calc(100dvh - 59px);display:flex;flex-direction:column;overflow:hidden;color:#eefbff;font-family:var(--font-rajdhani,'Rajdhani'),sans-serif;background:radial-gradient(circle at 50% 42%,rgba(0,124,255,.22),transparent 44%),linear-gradient(90deg,rgba(35,215,255,.035) 1px,transparent 1px) 0 0/52px 52px,linear-gradient(rgba(35,215,255,.03) 1px,transparent 1px) 0 0/52px 52px,#02070d}
        .sp-arena-statusbar{min-height:54px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:7px clamp(10px,2vw,24px);border-top:1px solid rgba(225,248,255,.26);border-bottom:1px solid rgba(35,215,255,.5);background:linear-gradient(180deg,rgba(37,58,71,.98),rgba(5,15,23,.98) 52%,rgba(13,31,42,.98));box-shadow:0 10px 28px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.14);z-index:30}
        .sp-arena-back,.sp-arena-wallet{min-height:38px;border:1px solid rgba(157,226,255,.48);border-radius:0;background:linear-gradient(180deg,#294858,#081a26 50%,#020a11);color:#eafaff;box-shadow:inset 0 1px rgba(255,255,255,.22),inset 0 -2px rgba(0,0,0,.72)}
        .sp-arena-back{justify-self:start;padding:0 14px;font-weight:700;cursor:pointer}.sp-arena-titleblock{text-align:center;line-height:1.05}.sp-arena-titleblock span{display:block;color:#6c9aaf;font-size:9px;letter-spacing:2.4px;text-transform:uppercase}.sp-arena-titleblock strong{display:block;margin-top:4px;color:#f5fdff;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(12px,1.4vw,17px);letter-spacing:1px;text-transform:capitalize}
        .sp-arena-wallet{justify-self:end;display:flex;align-items:center;gap:7px;padding:0 12px;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:11px}.sp-arena-wallet img{width:18px;height:18px;object-fit:contain;filter:drop-shadow(0 0 7px rgba(35,215,255,.75))}
        .sp-arena-question{display:grid;grid-template-columns:1fr auto;align-items:stretch;margin:8px clamp(10px,2vw,24px) 0;border:1px solid rgba(139,234,255,.48);background:linear-gradient(135deg,rgba(23,49,65,.97),rgba(3,13,21,.97) 44%,rgba(9,28,41,.97));box-shadow:0 12px 28px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.14);z-index:25}.sp-arena-question>div:first-child{display:flex;flex-direction:column;justify-content:center;gap:3px;padding:8px 16px;text-align:center}.sp-arena-question span{color:#6e9aad;font-size:9px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase}.sp-arena-question strong{color:#e7f8ff;font-size:clamp(12px,1.4vw,15px);line-height:1.25}.sp-arena-timer{min-width:66px;display:grid;place-content:center;text-align:center;border-left:1px solid rgba(139,234,255,.34);background:linear-gradient(180deg,#173b4c,#071923)}.sp-arena-timer strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:20px;color:#7be9ff}.sp-arena-timer.is-urgent strong{color:#ff6868;text-shadow:0 0 14px rgba(255,54,54,.8)}
        .sp-arena-table-zone{position:relative;flex:1;min-height:0;display:grid;place-items:center;padding:10px 34px 4px}.sp-arena-ambient{position:absolute;width:min(76vw,960px);height:44%;border-radius:50%;background:rgba(0,140,255,.18);filter:blur(48px)}.sp-arena-table-wrap{position:relative;width:min(82vw,1040px);max-height:100%;aspect-ratio:1.92/1}.sp-arena-table-rail{position:absolute;inset:7% 4%;border-radius:50%;padding:13px;background:linear-gradient(145deg,#c9edf8 0%,#3d6273 13%,#0a1821 31%,#7ab2c7 49%,#101f29 68%,#d9f8ff 88%,#395c6b 100%);box-shadow:0 28px 55px rgba(0,0,0,.78),0 0 34px rgba(35,215,255,.28),inset 0 2px 3px rgba(255,255,255,.76),inset 0 -6px 10px rgba(0,0,0,.82)}.sp-arena-table-trim{width:100%;height:100%;border-radius:50%;padding:10px;background:linear-gradient(180deg,#1a3342,#02080d 48%,#132b39);box-shadow:inset 0 0 0 2px rgba(139,234,255,.42),inset 0 0 18px #000}.sp-arena-felt{position:relative;width:100%;height:100%;overflow:hidden;border-radius:50%;background:radial-gradient(ellipse at 50% 42%,#0a5270 0%,#062f45 42%,#021825 72%,#010a11 100%);box-shadow:inset 0 0 44px rgba(0,0,0,.78),inset 0 0 0 1px rgba(139,234,255,.2)}.sp-arena-felt-grid{position:absolute;inset:0;opacity:.13;background:linear-gradient(90deg,rgba(116,229,255,.55) 1px,transparent 1px) 0 0/34px 34px,linear-gradient(rgba(116,229,255,.45) 1px,transparent 1px) 0 0/34px 34px;transform:perspective(340px) rotateX(50deg) scale(1.25)}
        .sp-arena-pot{position:absolute;top:20%;left:50%;transform:translateX(-50%);padding:4px 12px;border:1px solid rgba(139,234,255,.38);background:rgba(1,8,13,.78);text-align:center;box-shadow:0 8px 18px rgba(0,0,0,.46)}.sp-arena-pot span{display:block;color:#709aac;font-size:8px;letter-spacing:1.8px;text-transform:uppercase}.sp-arena-pot strong{color:#f2fbff;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:11px}.sp-arena-brandmark{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);text-align:center;opacity:.52}.sp-arena-brandmark span{display:block;color:#c7f5ff;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(10px,1.7vw,22px);letter-spacing:2px}.sp-arena-brandmark strong{display:block;color:#38c7f4;font-size:clamp(7px,.9vw,11px);letter-spacing:4px}.sp-arena-board{position:absolute;top:34%;left:50%;transform:translateX(-50%);display:flex;gap:4px;z-index:8}
        .sp-arena-seat{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;z-index:15}.sp-arena-avatar-shell{width:clamp(42px,5.2vw,72px);height:clamp(42px,5.2vw,72px);border-radius:50%;padding:3px;background:linear-gradient(145deg,#e0faff,#3c7186 45%,#061620 72%,#8ddcf1);box-shadow:0 8px 20px rgba(0,0,0,.68),0 0 13px rgba(35,215,255,.28)}.sp-arena-seat--hero .sp-arena-avatar-shell{width:clamp(48px,6vw,82px);height:clamp(48px,6vw,82px);box-shadow:0 9px 24px rgba(0,0,0,.7),0 0 22px rgba(35,215,255,.58)}.sp-arena-avatar{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover;background:#07141d}.sp-arena-seat-plate{min-width:clamp(58px,7vw,92px);margin-top:-4px;padding:3px 7px 4px;border:1px solid rgba(184,235,255,.5);background:linear-gradient(180deg,#315467,#071923 52%,#020a10);text-align:center;box-shadow:0 7px 16px rgba(0,0,0,.62),inset 0 1px rgba(255,255,255,.18)}.sp-arena-seat-plate span{display:block;color:#dff8ff;font-size:clamp(7px,.8vw,10px);line-height:1;white-space:nowrap}.sp-arena-seat-plate strong{display:block;margin-top:2px;color:#74e5ff;font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(7px,.85vw,10px);line-height:1}
        .sp-arena-card{width:clamp(30px,4vw,48px);aspect-ratio:46/64;overflow:hidden;border:1px solid rgba(231,249,255,.8);border-radius:3px;background:#fff;box-shadow:0 8px 16px rgba(0,0,0,.6),0 0 9px rgba(35,215,255,.2)}.sp-arena-card img{width:100%;height:100%;display:block;object-fit:contain}.sp-arena-card--hero{width:clamp(40px,5vw,60px)}.sp-arena-hero-cards{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);display:flex;z-index:24}.sp-arena-hero-cards>div+div{margin-left:-12px}.sp-arena-dealer{position:absolute;left:58%;bottom:24%;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;border:2px solid #486575;background:linear-gradient(145deg,#fff,#8aa7b5);color:#041019;font-size:9px;font-weight:900;box-shadow:0 5px 12px rgba(0,0,0,.5);z-index:25}
        .sp-arena-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding:7px clamp(10px,2vw,24px) max(8px,env(safe-area-inset-bottom));border-top:1px solid rgba(139,234,255,.32);background:linear-gradient(180deg,rgba(20,42,55,.98),rgba(2,10,16,.99));box-shadow:0 -12px 28px rgba(0,0,0,.55);z-index:35}.sp-arena-action{min-height:50px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:0;border:1px solid rgba(193,239,255,.58);background:linear-gradient(180deg,#31576a,#0a2130 50%,#020a11);color:#f1fbff;cursor:pointer;box-shadow:inset 0 1px rgba(255,255,255,.24),inset 0 -3px rgba(0,0,0,.72),0 8px 16px rgba(0,0,0,.3)}.sp-arena-action span{color:#7fa4b5;font-size:8px;letter-spacing:1.2px;text-transform:uppercase}.sp-arena-action strong{font-family:var(--font-orbitron,'Orbitron'),sans-serif;font-size:clamp(10px,1.2vw,13px);letter-spacing:.5px}.sp-arena-action.is-fold{border-color:rgba(255,104,104,.62);background:linear-gradient(180deg,#63353b,#271116 52%,#0e0507)}.sp-arena-action.is-call{border-color:rgba(112,232,255,.72)}.sp-arena-action.is-raise{border-color:rgba(74,166,255,.72);background:linear-gradient(180deg,#28587e,#09233d 52%,#020b15)}.sp-arena-action.is-allin{border-color:rgba(195,125,255,.65);background:linear-gradient(180deg,#50346e,#1d102d 52%,#09040f)}
        @media(max-width:640px){.sp-club-training-table{min-height:calc(100dvh - 35px);height:calc(100dvh - 35px)}.sp-arena-statusbar{min-height:42px;grid-template-columns:auto 1fr auto;gap:6px;padding:4px 6px}.sp-arena-back{min-height:34px;padding:0 8px;font-size:9px}.sp-arena-titleblock span{display:none}.sp-arena-titleblock strong{font-size:10px;letter-spacing:.4px}.sp-arena-wallet{min-height:34px;padding:0 7px;font-size:9px}.sp-arena-wallet img{width:14px;height:14px}.sp-arena-question{margin:5px 6px 0}.sp-arena-question>div:first-child{padding:5px 8px}.sp-arena-question strong{font-size:10px}.sp-arena-timer{min-width:48px}.sp-arena-timer strong{font-size:15px}.sp-arena-table-zone{padding:2px 4px 0}.sp-arena-table-wrap{width:min(96vw,620px);aspect-ratio:1.2/1}.sp-arena-table-rail{inset:11% 5%;padding:8px}.sp-arena-table-trim{padding:6px}.sp-arena-avatar-shell{width:38px;height:38px;padding:2px}.sp-arena-seat--hero .sp-arena-avatar-shell{width:44px;height:44px}.sp-arena-seat-plate{min-width:50px;padding:2px 4px 3px}.sp-arena-seat-plate span,.sp-arena-seat-plate strong{font-size:7px}.sp-arena-card{width:27px}.sp-arena-card--hero{width:37px}.sp-arena-brandmark span{font-size:9px}.sp-arena-brandmark strong{font-size:6px;letter-spacing:2px}.sp-arena-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px 6px max(5px,env(safe-area-inset-bottom))}.sp-arena-action{min-height:40px}.sp-arena-action span{display:none}.sp-arena-action strong{font-size:10px}}
        @media(max-height:670px) and (max-width:640px){.sp-arena-question{display:none}.sp-arena-actions{grid-template-columns:repeat(4,minmax(0,1fr))}.sp-arena-action{min-height:38px}}
      `}</style>
    </div>
  );
}

export default React.memo(TrainingGameTable);
