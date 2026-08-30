import { motion } from 'framer-motion';
import { ArrowRight, Check, Lock } from 'lucide-react';
import TRAINING_CONFIG from '../../config/trainingConfig';
import { getLevel } from '../../config/LevelRegistry';
import { getGameImage } from '../../data/GAME_IMAGES';
import TrainingGameArt from './TrainingGameArt';

const TOTAL_LEVELS = TRAINING_CONFIG.totalLevels;

const CATEGORY_META = {
    MTT: { label: 'Tournament Sector', accent: '#f3b151' },
    CASH: { label: 'Cash Sector', accent: '#62e9a6' },
    SPINS: { label: 'Spin Sector', accent: '#ffe16a' },
    PSYCHOLOGY: { label: 'Mental Sector', accent: '#c99cff' },
    ADVANCED: { label: 'Solver Sector', accent: '#68d8ff' },
};

export default function GameCard({ game, onClick, index = 0, image, progress }) {
    if (!game) return null;

    const meta = CATEGORY_META[game.category] || CATEGORY_META.MTT;
    const currentLevel = Math.min(progress?.levelsCompleted || 0, TOTAL_LEVELS);
    const bestScore = progress?.bestScore || 0;
    const percent = Math.round((currentLevel / TOTAL_LEVELS) * 100);
    const isMastered = currentLevel >= TOTAL_LEVELS;
    const hasPlayed = currentLevel > 0 || bestScore > 0;
    const levelDef = getLevel(Math.max(1, currentLevel || 1));
    const artwork = image || game.image || getGameImage(game.id);
    const action = isMastered ? 'Review Mastery' : hasPlayed ? 'Resume Campaign' : 'Enter Campaign';

    return (
        <motion.button
            type="button"
            className="sp-casino-game-card"
            style={{ '--game-accent': meta.accent }}
            onClick={() => onClick?.(game)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.025, duration: 0.28 }}
            whileTap={{ y: 1 }}
            aria-label={`${game.name}. ${game.focus}. ${action}.`}
        >
            <span className="sp-casino-game-rail" aria-hidden="true" />
            <span className="sp-casino-game-visual">
                {artwork === getGameImage(game.id) ? (
                    <TrainingGameArt gameId={game.id} />
                ) : (
                    <img src={artwork} alt="" loading="lazy" decoding="async" />
                )}
                <span className="sp-casino-game-vignette" aria-hidden="true" />
                <span className="sp-casino-game-topline">
                    <span>{meta.label}</span>
                    <span>{game.id.toUpperCase()}</span>
                </span>
                {game.vipOnly && <span className="sp-casino-game-lock"><Lock size={12} /> VIP Access</span>}
                {isMastered && <span className="sp-casino-game-mastered"><Check size={12} /> Mastered</span>}
            </span>

            <span className="sp-casino-game-body">
                <span className="sp-casino-game-title">{game.name}</span>
                <span className="sp-casino-game-focus">{game.focus}</span>

                <span className="sp-casino-game-readout">
                    <span><b>{currentLevel}</b> / {TOTAL_LEVELS} Levels</span>
                    <span>{levelDef?.name || 'Foundation'}</span>
                    <span><b>{bestScore}</b>% Best</span>
                </span>

                <span className="sp-casino-game-progress" aria-label={`${percent}% complete`}>
                    <span style={{ width: `${percent}%` }} />
                </span>

                <span className="sp-casino-game-action">
                    <span>{action}</span>
                    <ArrowRight size={16} aria-hidden="true" />
                </span>
            </span>

            <style jsx>{`
                .sp-casino-game-card {
                    position: relative;
                    display: grid;
                    grid-template-rows: auto 1fr;
                    width: 100%;
                    min-width: 0;
                    min-height: 430px;
                    padding: 7px !important;
                    overflow: hidden;
                    border: 1px solid #607987 !important;
                    border-top: 2px solid #d9edf4 !important;
                    border-bottom-color: #17272f !important;
                    border-radius: 0 !important;
                    clip-path: none !important;
                    color: #edf8fb !important;
                    background: linear-gradient(145deg, #243741 0%, #091116 9%, #020507 82%, #14242c 100%) !important;
                    box-shadow: inset 0 1px rgba(255,255,255,.18), inset 0 0 36px rgba(0,0,0,.72), 0 24px 46px rgba(0,0,0,.66) !important;
                    text-align: left;
                    cursor: pointer;
                    transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
                }
                .sp-casino-game-card:hover,
                .sp-casino-game-card:focus-visible {
                    z-index: 2;
                    transform: translateY(-4px);
                    border-color: #a9eaff !important;
                    box-shadow: inset 0 1px #fff, inset 0 0 34px rgba(0,0,0,.66), 0 30px 58px rgba(0,0,0,.76), 0 0 28px color-mix(in srgb, var(--game-accent) 24%, transparent) !important;
                    outline: none;
                }
                .sp-casino-game-rail {
                    position: absolute;
                    z-index: 5;
                    top: -2px;
                    left: 9%;
                    width: 43%;
                    height: 2px;
                    background: var(--game-accent);
                    box-shadow: 0 0 14px var(--game-accent);
                }
                .sp-casino-game-visual {
                    position: relative;
                    display: block;
                    aspect-ratio: 16 / 10;
                    overflow: hidden;
                    border: 1px solid #38515e;
                    background:
                        radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--game-accent) 12%, transparent), transparent 36%),
                        linear-gradient(rgba(1,4,6,.84), rgba(1,4,6,.94)),
                        url('/circuit-brain-bg.png') center / cover no-repeat,
                        #010405;
                    box-shadow: inset 0 0 26px #000, 0 10px 26px rgba(0,0,0,.65);
                }
                .sp-casino-game-visual img {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    filter: saturate(.98) contrast(1.12) brightness(.88);
                    transition: transform .45s ease, filter .25s ease;
                }
                .sp-casino-game-card:hover img {
                    transform: scale(1.035);
                    filter: saturate(1.1) contrast(1.12) brightness(.98);
                }
                .sp-casino-game-vignette {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(180deg, rgba(0,3,5,.12), transparent 42%, rgba(0,4,7,.86)), radial-gradient(circle at 50% 44%, transparent 40%, rgba(0,0,0,.42));
                }
                .sp-casino-game-topline {
                    position: absolute;
                    inset: 10px 11px auto;
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    color: #eaf6fa;
                    font: 700 8px/1.2 var(--font-orbitron, 'Orbitron'), sans-serif;
                    letter-spacing: .13em;
                    text-shadow: 0 2px 5px #000;
                    text-transform: uppercase;
                }
                .sp-casino-game-topline span:first-child { color: var(--game-accent); }
                .sp-casino-game-lock,
                .sp-casino-game-mastered {
                    position: absolute;
                    right: 10px;
                    bottom: 10px;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 5px 7px;
                    border: 1px solid rgba(211,235,243,.5);
                    color: #f1f8fa;
                    background: rgba(1,5,7,.86);
                    box-shadow: 0 5px 14px #000;
                    font: 700 8px/1 var(--font-orbitron, 'Orbitron'), sans-serif;
                    letter-spacing: .08em;
                    text-transform: uppercase;
                }
                .sp-casino-game-mastered { color: #70f2bf; border-color: rgba(75,238,176,.58); }
                .sp-casino-game-body {
                    display: flex;
                    min-width: 0;
                    flex-direction: column;
                    padding: 18px 11px 10px;
                }
                .sp-casino-game-title {
                    display: block;
                    color: #f4f8fa;
                    font: 500 clamp(17px, 1.5vw, 22px)/1.2 var(--font-orbitron, 'Orbitron'), sans-serif;
                    letter-spacing: .015em;
                    text-shadow: 0 2px 2px #000;
                }
                .sp-casino-game-focus {
                    display: block;
                    min-height: 39px;
                    margin-top: 7px;
                    color: #9db1bb;
                    font: 500 13px/1.45 var(--font-rajdhani, 'Rajdhani'), sans-serif;
                }
                .sp-casino-game-readout {
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    align-items: center;
                    gap: 8px;
                    margin-top: 15px;
                    color: #738c98;
                    font: 650 8px/1.25 var(--font-orbitron, 'Orbitron'), sans-serif;
                    letter-spacing: .06em;
                    text-transform: uppercase;
                }
                .sp-casino-game-readout span:nth-child(2) { text-align: center; color: var(--game-accent); }
                .sp-casino-game-readout b { color: #ecf7fb; font-size: 11px; }
                .sp-casino-game-progress {
                    display: block;
                    height: 5px;
                    margin-top: 8px;
                    overflow: hidden;
                    border: 1px solid #263943;
                    background: #010405;
                    box-shadow: inset 0 2px 5px #000;
                }
                .sp-casino-game-progress > span {
                    display: block;
                    height: 100%;
                    background: linear-gradient(90deg, color-mix(in srgb, var(--game-accent) 66%, #087eaa), var(--game-accent));
                    box-shadow: 0 0 10px var(--game-accent);
                }
                .sp-casino-game-action {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    min-height: 42px;
                    margin-top: 14px;
                    padding: 0 12px;
                    border: 1px solid #425864;
                    border-top-color: #98adb6;
                    color: #e6f2f6;
                    background: linear-gradient(180deg, #21313a, #070b0e 72%);
                    box-shadow: inset 0 1px rgba(255,255,255,.1), 0 6px 14px rgba(0,0,0,.55);
                    font: 700 9px/1 var(--font-orbitron, 'Orbitron'), sans-serif;
                    letter-spacing: .09em;
                    text-transform: uppercase;
                }
                .sp-casino-game-action :global(svg) { color: var(--game-accent); filter: drop-shadow(0 0 6px var(--game-accent)); }
                @media (max-width: 700px) {
                    .sp-casino-game-card { min-height: 0; }
                    .sp-casino-game-body { padding: 15px 9px 8px; }
                    .sp-casino-game-title { font-size: 17px; }
                    .sp-casino-game-focus { min-height: 0; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .sp-casino-game-card, .sp-casino-game-visual img { transition: none; }
                }
            `}</style>
        </motion.button>
    );
}
