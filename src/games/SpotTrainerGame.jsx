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
                .spot-trainer-launcher {
                    min-height: min(720px, calc(100dvh - 108px));
                    display: grid;
                    place-items: center;
                    padding: clamp(20px, 5vw, 56px) 16px;
                    color: #f4fbff;
                    background:
                        radial-gradient(circle at 50% 12%, rgba(0, 194, 255, 0.18), transparent 42%),
                        linear-gradient(180deg, #07141f 0%, #02080e 100%);
                }

                .spot-trainer-launcher__frame {
                    width: min(100%, 720px);
                    position: relative;
                    display: grid;
                    justify-items: center;
                    gap: 22px;
                    padding: clamp(28px, 6vw, 54px);
                    border: 1px solid rgba(145, 226, 255, 0.55);
                    border-radius: 14px;
                    background:
                        linear-gradient(145deg, rgba(24, 51, 68, 0.96), rgba(3, 12, 20, 0.99) 62%),
                        #06111a;
                    box-shadow:
                        inset 0 1px 0 rgba(255, 255, 255, 0.2),
                        inset 0 -18px 32px rgba(0, 0, 0, 0.42),
                        0 24px 70px rgba(0, 0, 0, 0.58),
                        0 0 42px rgba(0, 186, 255, 0.12);
                    overflow: hidden;
                }

                .spot-trainer-launcher__frame::before {
                    content: '';
                    position: absolute;
                    inset: 8px;
                    pointer-events: none;
                    border: 1px solid rgba(104, 207, 244, 0.16);
                    border-radius: 9px;
                }

                .spot-trainer-launcher__orb {
                    width: 92px;
                    height: 92px;
                    display: grid;
                    place-items: center;
                    border: 1px solid rgba(161, 232, 255, 0.7);
                    border-radius: 50%;
                    color: #8ee8ff;
                    background:
                        radial-gradient(circle at 36% 28%, rgba(255, 255, 255, 0.32), transparent 20%),
                        linear-gradient(145deg, #16445d, #041019 68%);
                    box-shadow:
                        inset 0 2px 5px rgba(255, 255, 255, 0.24),
                        inset 0 -12px 20px rgba(0, 0, 0, 0.58),
                        0 12px 24px rgba(0, 0, 0, 0.45),
                        0 0 30px rgba(0, 203, 255, 0.22);
                }

                .spot-trainer-launcher__copy {
                    position: relative;
                    max-width: 570px;
                    text-align: center;
                }

                .spot-trainer-launcher__eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    color: #8ee8ff;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                }

                .spot-trainer-launcher h1 {
                    margin: 12px 0 10px;
                    color: #ffffff;
                    font-family: var(--font-orbitron), var(--font-rajdhani), sans-serif;
                    font-size: clamp(28px, 6vw, 46px);
                    line-height: 1.05;
                    letter-spacing: -0.02em;
                    text-shadow: 0 3px 12px rgba(0, 0, 0, 0.8), 0 0 22px rgba(68, 205, 255, 0.2);
                }

                .spot-trainer-launcher p {
                    margin: 0;
                    color: #c3d4df;
                    font-size: clamp(15px, 3vw, 18px);
                    line-height: 1.65;
                }

                .spot-trainer-launcher__authority {
                    position: relative;
                    width: min(100%, 560px);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 16px;
                    border: 1px solid rgba(94, 211, 255, 0.28);
                    border-radius: 8px;
                    color: #b9d8e6;
                    background: linear-gradient(180deg, rgba(15, 40, 54, 0.86), rgba(4, 16, 25, 0.92));
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 8px 22px rgba(0, 0, 0, 0.28);
                    font-size: 13px;
                    line-height: 1.5;
                }

                .spot-trainer-launcher__authority :global(svg) {
                    flex: 0 0 auto;
                    color: #68d9ff;
                }

                .spot-trainer-launcher__actions {
                    position: relative;
                    width: min(100%, 560px);
                    display: grid;
                    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
                    gap: 12px;
                }

                .spot-trainer-launcher__actions :global(a),
                .spot-trainer-launcher__actions button {
                    min-height: 52px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 9px;
                    padding: 12px 18px;
                    border-radius: 8px;
                    font: inherit;
                    font-size: 13px;
                    font-weight: 850;
                    letter-spacing: 0.035em;
                    text-align: center;
                    text-decoration: none;
                    cursor: pointer;
                    touch-action: manipulation;
                }

                .spot-trainer-launcher__primary {
                    border: 1px solid #9eebff;
                    color: #031019;
                    background: linear-gradient(180deg, #b9f3ff 0%, #42c9f4 48%, #0879ad 100%);
                    box-shadow: inset 0 1px 0 #ffffff, inset 0 -4px 8px rgba(0, 39, 65, 0.4), 0 10px 25px rgba(0, 171, 230, 0.24);
                }

                .spot-trainer-launcher__secondary {
                    border: 1px solid rgba(180, 221, 239, 0.36);
                    color: #e1f3fa;
                    background: linear-gradient(180deg, #203543, #0a1822 62%, #061018);
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -4px 8px rgba(0, 0, 0, 0.34);
                }

                .spot-trainer-launcher__actions :global(a):focus-visible,
                .spot-trainer-launcher__actions button:focus-visible {
                    outline: 3px solid #ffffff;
                    outline-offset: 3px;
                }

                @media (max-width: 560px) {
                    .spot-trainer-launcher__frame {
                        padding: 30px 18px;
                    }

                    .spot-trainer-launcher__actions {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </section>
    );
}
