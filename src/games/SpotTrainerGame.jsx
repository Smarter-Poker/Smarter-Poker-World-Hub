import Link from 'next/link';
import { ArrowLeft, ArrowRight, Crosshair, Database, ShieldCheck } from 'lucide-react';

export const VERIFIED_SPOT_TRAINER_ROUTE = '/hub/training/spot-trainer?source=preflop-charts';

/**
 * The former embedded Spot Trainer used a browser-owned strategy bank. This
 * component is intentionally only a launcher: the canonical Training route
 * owns question delivery, attempt authority, feedback, and persistence.
 */
export default function SpotTrainerGame({ onExit }) {
    return (
        <section className="spot-trainer-launcher" aria-labelledby="spot-trainer-launcher-title">
            <div className="spot-trainer-launcher__frame">
                <div className="spot-trainer-launcher__orb" aria-hidden>
                    <Crosshair size={42} strokeWidth={1.5} />
                </div>

                <div className="spot-trainer-launcher__copy">
                    <span className="spot-trainer-launcher__eyebrow">
                        <ShieldCheck size={14} aria-hidden />
                        Verified Training Route
                    </span>
                    <h1 id="spot-trainer-launcher-title">Continue In Spot Trainer</h1>
                    <p>
                        Open The Canonical Training Surface For Server-Delivered Questions,
                        Attempt-Bound Results, And Club Arena Gameplay.
                    </p>
                </div>

                <div className="spot-trainer-launcher__authority" role="note">
                    <Database size={19} aria-hidden />
                    <span>
                        This Embedded Legacy Screen Contains No Strategy Bank And Does Not
                        Settle Training Results.
                    </span>
                </div>

                <div className="spot-trainer-launcher__actions">
                    <Link className="spot-trainer-launcher__primary" href={VERIFIED_SPOT_TRAINER_ROUTE}>
                        Open Verified Spot Trainer
                        <ArrowRight size={18} aria-hidden />
                    </Link>
                    <button className="spot-trainer-launcher__secondary" type="button" onClick={onExit}>
                        <ArrowLeft size={18} aria-hidden />
                        Back To Preflop Charts
                    </button>
                </div>
            </div>

            <style jsx>{`
                /* #SMARTERDESIGN (Dan, 2026-11-27): one steel rim, a chrome
                   medallion, a cobalt primary and a steel secondary. */
                .spot-trainer-launcher {
                    display: grid;
                    place-items: center;
                    padding: 10px 0 36px;
                    color: #f2f7ff;
                    font-family: var(--font-inter, Inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }
                .spot-trainer-launcher__frame {
                    width: min(100%, 640px);
                    box-sizing: border-box;
                    display: grid;
                    justify-items: center;
                    gap: 18px;
                    padding: clamp(18px, 5vw, 34px);
                    border: 5px solid transparent;
                    border-image: url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch;
                    background: linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%);
                    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.42);
                }
                .spot-trainer-launcher__orb {
                    width: 92px;
                    height: 92px;
                    display: grid;
                    place-items: center;
                    border: 2px solid #9fb8cc;
                    border-radius: 50%;
                    color: #86daff;
                    background: radial-gradient(circle at 50% 35%, #1b3550, #050c16 72%);
                    box-shadow: inset 0 0 0 2px #0c1a2a, 0 0 0 3px #40576c, 0 8px 18px rgba(0, 0, 0, 0.55);
                }
                .spot-trainer-launcher__copy {
                    max-width: 540px;
                    text-align: center;
                }
                .spot-trainer-launcher__eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    color: #86daff;
                    font: 700 13px/1.2 var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif;
                    letter-spacing: 0.06em;
                }
                .spot-trainer-launcher h1 {
                    margin: 10px 0 10px;
                    color: #f2f7ff;
                    font: 700 clamp(1.7rem, 6vw, 2.3rem)/1.06 var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif;
                    letter-spacing: 0.01em;
                    text-shadow: 0 2px 0 #10243a;
                }
                .spot-trainer-launcher p {
                    margin: 0;
                    color: #bdd0e2;
                    font-size: clamp(15px, 3vw, 17px);
                    line-height: 1.6;
                }
                .spot-trainer-launcher__authority {
                    width: min(100%, 540px);
                    box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 14px;
                    border: 3px solid transparent;
                    border-image: url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch;
                    color: #bdd0e2;
                    background: #071422;
                    font-size: 14px;
                    line-height: 1.5;
                }
                .spot-trainer-launcher__authority :global(svg) {
                    flex: 0 0 auto;
                    color: #86daff;
                }
                .spot-trainer-launcher__actions {
                    width: min(100%, 540px);
                    display: grid;
                    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
                    gap: 10px;
                }
                .spot-trainer-launcher__actions :global(a),
                .spot-trainer-launcher__actions button {
                    box-sizing: border-box;
                    min-height: 52px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 9px;
                    padding: 8px 16px;
                    border: 3px solid transparent;
                    border-radius: 0;
                    font: 700 17px/1.18 var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif;
                    letter-spacing: 0.02em;
                    text-align: center;
                    text-decoration: none;
                    cursor: pointer;
                    touch-action: manipulation;
                }
                .spot-trainer-launcher__actions :global(a):active,
                .spot-trainer-launcher__actions button:active {
                    filter: brightness(0.88);
                }
                .spot-trainer-launcher__actions :global(.spot-trainer-launcher__primary) {
                    border-image: url('/images/smarterdesign/chrome-active-v2.webp') 11 / 4px stretch;
                    color: #ffffff;
                    background: linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba);
                    background-clip: padding-box;
                    text-shadow: 0 1px 2px #021022;
                }
                .spot-trainer-launcher__secondary {
                    border-image: url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch;
                    color: #f2f7ff;
                    background: linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c);
                }
                .spot-trainer-launcher__actions :global(a):focus-visible,
                .spot-trainer-launcher__actions button:focus-visible {
                    outline: 2px solid #9ee3ff;
                    outline-offset: 2px;
                }
                @media (max-width: 560px) {
                    .spot-trainer-launcher__actions {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </section>
    );
}
