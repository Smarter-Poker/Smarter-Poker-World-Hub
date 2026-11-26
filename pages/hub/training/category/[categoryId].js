import { useRouter } from 'next/router';
import { ArrowLeft, Atom, DollarSign, Rocket, Trophy, Brain } from 'lucide-react';
import SEOHead from '../../../../src/components/seo/SEOHead';
import GameCard from '../../../../src/components/training/GameCard';
import { getGamesByCategory } from '../../../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../../../src/hooks/useTrainingProgress';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import { getGameImage } from '../../../../src/data/GAME_IMAGES';
import PageTransition from '../../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import TrainingGameArt from '../../../../src/components/training/TrainingGameArt';
import { resolvePresetForGame } from '../../../../src/lib/training/trainingPresets.mjs';

const CATEGORY_META = {
    MTT: {
        title: 'Tournaments',
        Icon: Trophy,
        accent: '#f3b151',
        description: 'Tournament pressure, stack survival, ICM and final-table execution.'
    },
    CASH: {
        title: 'Cash Games',
        Icon: DollarSign,
        accent: '#62e9a6',
        description: 'Street-by-street range discipline for deep, repeatable cash-game decisions.'
    },
    SPINS: {
        title: 'Spins & SNGs',
        Icon: Rocket,
        accent: '#ffe16a',
        description: 'Fast stack transitions, heads-up pressure and hyper-turbo execution.'
    },
    PSYCHOLOGY: {
        title: 'Mental Game',
        Icon: Brain,
        accent: '#c99cff',
        description: 'Decision discipline, emotional control and resilient performance under pressure.'
    },
    ADVANCED: {
        title: 'Poker Strategy',
        Icon: Atom,
        accent: '#68d8ff',
        description: 'Range construction, equilibrium mechanics and high-resolution strategic theory.'
    },
};

export default function CategoryPage() {
    const router = useRouter();
    const categoryId = typeof router.query.categoryId === 'string'
        ? router.query.categoryId.toUpperCase()
        : '';
    const { getGameProgress } = useTrainingProgress();
    useTrainingBus('training-category', { categoryId });

    // AEO phase 3 (2026-09-18): the head used to sit below this guard.
    // The guard is true on the server, so the branch a crawler always
    // takes returned nothing and the page served a 200 with no title and
    // zero words. The head is hoisted above it and returned from it, so
    // the page says what it is before it says it is still loading.
    // categoryId comes from router.query, which is empty during the server
    // render, so the head has to work without it rather than assume it.
    const category = CATEGORY_META[categoryId];
    const pageHead = (
      <SEOHead
          title={category ? `${category.title} | Training` : 'GTO Training Category'}
          description={category?.description || 'A Category Of Smarter.Poker GTO Training Drills.'}
          noindex={true}
      />
    );

    if (!router.isReady) return pageHead;

    const games = category ? getGamesByCategory(categoryId) : [];
    const heroArtId = games[0]?.id || 'quiz-gauntlet';
    const featuredGame = games[0] || null;
    const featuredPreset = featuredGame ? resolvePresetForGame(featuredGame) : null;

    if (!category || games.length === 0) {
        return (
            <PageTransition>
                <UniversalHeader pageDepth={2} />
                <main className="sp-category-missing">
                    <p>Training Sector Unavailable.</p>
                    <button type="button" onClick={() => router.push('/hub/training')}>Return To Training</button>
                </main>
            </PageTransition>
        );
    }

    const Icon = category.Icon;
    const playGame = (game) => router.push({
        pathname: '/hub/training/arena/[gameId]',
        query: { gameId: game.id, start: '1', source: 'training-category' },
    });

    return (
        <PageTransition>
            {pageHead}
            <div className="sp-training-category" style={{ '--category-accent': 'var(--sd-ice)' }}>
                <UniversalHeader pageDepth={2} />

                <main>
                    <section className="sp-category-hero sd-masthead">
                        <TrainingGameArt
                            gameId={heroArtId}
                            className="sp-category-hero-art"
                            sizes="(max-width: 700px) 100vw, 1500px"
                            loading="eager"
                            fetchPriority="high"
                        />
                        <div className="sp-category-hero-shade" aria-hidden="true" />
                        <button className="sp-category-back sd-button" type="button" onClick={() => router.push('/hub/training')}>
                            <ArrowLeft size={15} aria-hidden="true" /> Training Hub
                        </button>
                        <div className="sp-category-copy">
                            <div className="sp-category-title-row">
                                <span className="sp-category-icon"><Icon size={24} aria-hidden="true" /></span>
                                <h1>{category.title}</h1>
                            </div>
                            <p>{category.description}</p>
                            {featuredGame && (
                                <div
                                    data-category-preset-summary="true"
                                    style={{
                                        marginTop: 18,
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        padding: '12px 14px',
                                        border: '1px solid #688299',
                                        borderTopColor: '#aec0d0',
                                        background: 'linear-gradient(180deg, rgba(9, 23, 39, 0.94) 0%, rgba(3, 11, 20, 0.98) 100%)',
                                    }}
                                >
                                    <div>
                                        <div style={{ color: '#8fd0ff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {featuredGame.name}
                                        </div>
                                        <div style={{ marginTop: 3, color: '#dbe8f2', fontSize: 13 }}>
                                            {featuredPreset?.summary || '6-Max Cash · NLHE · 100 BB · 20 Hands'}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        data-category-quick-start="true"
                                        className="sp-mtt-primary-cta sd-button sd-primary"
                                        onClick={() => playGame(featuredGame)}
                                        style={{
                                            minHeight: 44,
                                            padding: '0 18px',
                                            border: '1px solid #56d8ff',
                                            borderTopColor: '#b9f3ff',
                                            background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                                            color: '#ffffff',
                                            fontSize: 13,
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Play Now
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="sp-category-library" aria-labelledby="category-library-title">
                        <header className="sp-category-library-head">
                            <div>
                                <h2 id="category-library-title">Choose A Game</h2>
                            </div>
                            <p><i aria-hidden="true" /> {games.length} Games</p>
                        </header>

                        <div className="sp-category-grid">
                            {games.map((game, index) => (
                                <GameCard
                                    key={game.id}
                                    game={game}
                                    progress={getGameProgress(game.id)}
                                    onClick={playGame}
                                    playLabel="Play"
                                    index={index}
                                    image={getGameImage(game.id)}
                                />
                            ))}
                        </div>
                    </section>
                </main>
            </div>

            <style jsx>{`
                .sp-training-category {
                    min-height: 100dvh;
                    color: #f2f7fb;
                    background:
                        radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%),
                        linear-gradient(180deg, #040d18 0%, #02070d 100%);
                    font-family: var(--font-rajdhani, 'Rajdhani'), sans-serif;
                }
                main { width: min(1500px, calc(100% - 40px)); margin: 0 auto; padding: 22px 0 90px; }
                .sp-category-hero {
                    position: relative;
                    min-height: 340px;
                    overflow: hidden;
                    border: 5px solid transparent;
                    border-image: url("/images/smarterdesign/chrome-readout.webp") 21 / 8px stretch;
                    border-radius: 0;
                    background: #040d18;
                    box-shadow: inset 0 1px rgba(255,255,255,.13), 0 32px 70px rgba(0,0,0,.72);
                }
                .sp-category-hero-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; filter: saturate(1.02) contrast(1.1) brightness(.8); }
                .sp-category-hero-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(1,4,6,.98) 0%, rgba(1,5,8,.91) 32%, rgba(1,5,8,.42) 62%, rgba(1,4,6,.08) 100%), linear-gradient(0deg, rgba(0,3,5,.76), transparent 45%); }
                .sp-category-back {
                    position: absolute;
                    z-index: 3;
                    top: 24px;
                    left: 25px;
                    display: inline-flex;
                    align-items: center;
                    gap: 9px;
                    min-height: 44px;
                    padding: 0 14px;
                    border: 1px solid #718894 !important;
                    border-top-color: #dbe9ee !important;
                    border-radius: 0 !important;
                    color: #dce8ed !important;
                    background: linear-gradient(180deg, #26343b, #06090b 74%) !important;
                    box-shadow: inset 0 1px rgba(255,255,255,.14), 0 8px 19px rgba(0,0,0,.58) !important;
                    font: 700 12px/1 var(--font-orbitron, 'Orbitron'), sans-serif;
                    letter-spacing: .08em;
                    cursor: pointer;
                }
                .sp-category-copy { position: relative; z-index: 2; width: min(610px, 62%); padding: 112px 0 60px clamp(28px, 5.3vw, 78px); }
                .sp-category-kicker { display: flex; align-items: center; gap: 10px; color: #a4b7bf; font: 700 12px/1.3 var(--font-orbitron, 'Orbitron'), sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
                .sp-category-kicker i { width: 28px; height: 1px; background: var(--category-accent); box-shadow: 0 0 10px var(--category-accent); }
                .sp-category-title-row { display: flex; align-items: center; gap: 16px; margin-top: 21px; }
                .sp-category-icon { display: grid; width: 50px; height: 50px; place-items: center; border: 1px solid #78909b; border-top-color: #e6f3f6; color: var(--category-accent); background: linear-gradient(145deg, #263941, #05090b 72%); box-shadow: inset 0 1px rgba(255,255,255,.17), 0 10px 22px #000, 0 0 19px color-mix(in srgb, var(--category-accent) 24%, transparent); }
                h1 { margin: 0; color: #f0f5f7; font: 450 clamp(34px, 4.6vw, 67px)/1.05 var(--font-orbitron, 'Orbitron'), sans-serif; letter-spacing: .01em; text-shadow: 0 3px 2px #000, 0 15px 34px #000; }
                .sp-category-copy > p { max-width: 560px; margin: 23px 0 27px; color: #c2d0d5; font-size: clamp(16px, 1.45vw, 20px); line-height: 1.55; text-shadow: 0 2px 7px #000; }
                .sp-category-readouts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #42535b; border-top-color: #8ba0a9; background: rgba(2,6,8,.82); box-shadow: inset 0 1px rgba(255,255,255,.06), 0 14px 28px rgba(0,0,0,.55); }
                .sp-category-readouts span { min-height: 65px; display: flex; flex-direction: column; justify-content: center; padding: 0 14px; border-right: 1px solid #33434a; color: #8298a2; font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
                .sp-category-readouts span:last-child { border-right: 0; }
                .sp-category-readouts b { margin-bottom: 5px; color: var(--category-accent); font: 550 16px/1 var(--font-orbitron, 'Orbitron'), sans-serif; letter-spacing: .02em; }
                .sp-category-plate { position: absolute; right: 27px; bottom: 25px; z-index: 2; display: flex; gap: 13px; padding: 8px 12px; border: 1px solid rgba(178,205,214,.36); color: #80949d; background: rgba(1,5,7,.82); box-shadow: 0 8px 22px #000; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
                .sp-category-plate strong { color: var(--category-accent); font-weight: 700; }
                .sp-category-library { margin-top: 43px; }
                .sp-category-library-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 20px; padding: 17px 20px 18px; border: 1px solid #3c4d55; border-top-color: #8fa3ac; background: linear-gradient(180deg, #172127, #05080a 72%); box-shadow: inset 0 1px rgba(255,255,255,.08), 0 14px 31px rgba(0,0,0,.48); }
                .sp-category-library-head span { display: block; margin-bottom: 4px; color: #758c96; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
                h2 { margin: 0; color: #edf4f6; font: 450 clamp(20px, 2.2vw, 29px)/1.2 var(--font-orbitron, 'Orbitron'), sans-serif; }
                .sp-category-library-head p { display: flex; align-items: center; gap: 9px; margin: 0 0 3px; color: #8fa3ac; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
                .sp-category-library-head p i { width: 4px; height: 4px; transform: rotate(45deg); background: var(--category-accent); box-shadow: 0 0 8px var(--category-accent); }
                .sp-category-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
                .sp-category-missing { min-height: calc(100dvh - 60px); display: grid; place-content: center; gap: 14px; color: #dce9ee; background: #020608; text-align: center; }
                @media (max-width: 900px) { .sp-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sp-category-copy { width: min(620px, 74%); } }
                @media (max-width: 768px) {
                    main { width: 100%; padding: 0 0 calc(74px + env(safe-area-inset-bottom, 0px)); }
                    .sp-category-hero { min-height: 0; }
                    .sp-category-hero-art { height: 100%; object-position: 65% center; }
                    .sp-category-hero-shade { background: linear-gradient(90deg, rgba(4,13,24,.98), rgba(4,13,24,.7) 65%, rgba(4,13,24,.25)), linear-gradient(0deg, #040d18 12%, transparent 90%); }
                    .sp-category-back { top: 14px; left: 13px; }
                    .sp-category-copy { width: auto; padding: 62px 16px 24px; }
                    .sp-category-title-row { align-items: flex-start; gap: 11px; }
                    .sp-category-icon { width: 42px; height: 42px; flex: 0 0 auto; }
                    h1 { font-size: clamp(28px, 9vw, 40px); }
                    .sp-category-copy > p { margin: 17px 0 20px; font-size: 16px; }
                    .sp-category-readouts { grid-template-columns: 1fr; }
                    .sp-category-readouts span { min-height: 48px; border-right: 0; border-bottom: 1px solid #33434a; flex-direction: row; align-items: center; justify-content: space-between; }
                    .sp-category-readouts span:last-child { border-bottom: 0; }
                    .sp-category-readouts b { margin: 0; }
                    .sp-category-plate { display: none; }
                    .sp-category-library { margin-top: 22px; padding: 0 10px; }
                    .sp-category-library-head { align-items: start; margin-bottom: 12px; padding: 14px; }
                    .sp-category-library-head p { display: none; }
                    .sp-category-grid { grid-template-columns: 1fr; gap: 13px; }
                }
            `}</style>
        </PageTransition>
    );
}
