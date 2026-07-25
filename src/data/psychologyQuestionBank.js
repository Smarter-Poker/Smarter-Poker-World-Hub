/**
 * PSYCHOLOGY QUESTION BANK
 * ===========================================================================
 * Deterministic question source for SCENARIO games (psy-001..psy-020 and
 * cash-020). No AI, no randomness: a curated bank of mental-game
 * multiple-choice questions grounded in accepted poker psychology frameworks
 * (Tendler/Roe-style mental game theory, variance acceptance, bankroll
 * discipline, A-game routines, tilt taxonomy, cognitive biases).
 *
 * Each raw question:
 *   q  - question text
 *   s  - scenario description (rendered above the question)
 *   o  - exactly 4 option strings, exactly one clearly best
 *   c  - index (0-3) of the correct option
 *   e  - 2-3 sentence explanation teaching the principle
 *   d  - difficulty 1-5
 *   m  - optional metadata { tiltLevel, emotionalState, triggerType }
 *        (PsychologyTiltControlUI renders a tilt meter when present)
 *
 * Public API:
 *   getPsychologyQuestions(gameId, level, count, seenIds) -> formatted
 *   questions matching the training contract consumed by useGTOTrainer /
 *   GTOQuestionCard:
 *   { id, gameId, level, question, scenario: { isPsychology, description },
 *     options: [{ id, text }], correctAnswer, explanation,
 *     gtoFrequencies: { <optionId>: 0-100 }, difficulty, metadata? }
 * ===========================================================================
 */

const OPTION_IDS = ['a', 'b', 'c', 'd'];

const BANK = {

    // ═══════════════════════════════════════════════════════════════════════
    // psy-001: TILT CONTROL — Emotional regulation
    // ═══════════════════════════════════════════════════════════════════════
    'psy-001': [
        {
            q: 'What is the most effective FIRST response the moment you notice anger rising mid-session?',
            s: 'You just lost a 200BB pot when a short stack jammed 72o into your aces and rivered trips. Your next hand is being dealt and you feel heat in your chest.',
            o: [
                'Take a deep breath, name the emotion, and use a pre-planned reset routine before the next decision',
                'Tighten up to only premium hands until the feeling passes on its own',
                'Play the next few hands faster to get past the bad memory quickly',
                'Immediately move up a stake where players respect your raises more',
            ],
            c: 0,
            e: 'Recognizing and labeling the emotion interrupts the automatic tilt spiral, and a rehearsed reset routine (breath, posture, strategic reminder) restores logical control. Tightening up is a passive band-aid that does not address the emotion, and speeding up or moving up stakes lets tilt drive your decisions.',
            d: 1,
            m: { tiltLevel: 'High', emotionalState: 'Angry', triggerType: 'Bad Beat' },
        },
        {
            q: 'According to the injecting-logic approach to tilt, why does simply "trying to stay calm" usually fail?',
            s: 'A student keeps telling himself "just do not tilt" before sessions, yet still blows up whenever he takes two bad beats in a row.',
            o: [
                'Because calmness is genetic and cannot be trained',
                'Because under emotional pressure the brain reverts to trained habits, so you must rehearse specific corrective statements in advance',
                'Because tilt can only be removed by winning sessions that restore confidence',
                'Because the only reliable fix is to quit every session after the first bad beat',
            ],
            c: 1,
            e: 'When emotion spikes, higher reasoning degrades and you fall back on whatever responses are actually trained. Vague intentions are not trained habits; rehearsed, specific logic statements ("variance is the price of my edge") are available under pressure because they were practiced in advance.',
            d: 3,
        },
        {
            q: 'Which of these is the clearest EARLY warning sign of tilt, before your play visibly degrades?',
            s: 'You want to build a personal tilt profile so you can intervene before losing a big pot to emotion.',
            o: [
                'Your win rate over the last 10,000 hands has dropped',
                'You start feeling physical cues: tense shoulders, faster breathing, narrating bad luck in your head',
                'You lose three buy-ins in one session',
                'Opponents begin raising you more often',
            ],
            c: 1,
            e: 'Tilt begins in the body and in self-talk before it appears in your decisions. Mapping your personal early signals lets you intervene at the cheapest point, long before results or stack sizes reveal the damage.',
            d: 2,
            m: { tiltLevel: 'Low', emotionalState: 'Tense', triggerType: 'Accumulated Frustration' },
        },
        {
            q: 'You catch yourself wanting to punish a specific opponent who sucked out on you. Which tilt type is this, and what is the correct counter?',
            s: 'A recreational player check-raised your flop bet with a gutshot and hit. You now want to 3-bet him every single hand.',
            o: [
                'Entitlement tilt; counter it by moving to a different table',
                'Injustice tilt; counter it by showing him your folds',
                'Revenge tilt; counter it by refocusing on making the highest-EV decision against his actual range, not against him personally',
                'Desperation tilt; counter it by doubling your buy-in to intimidate him',
            ],
            c: 2,
            e: 'Wanting to target a specific player for personal payback is revenge tilt, and it destroys EV because your decisions optimize for punishment instead of profit. The counter is to depersonalize the situation: he is simply a range making mistakes you can exploit with disciplined, standard play.',
            d: 2,
            m: { tiltLevel: 'High', emotionalState: 'Vengeful', triggerType: 'Suckout' },
        },
        {
            q: 'What is the primary purpose of a written stop-loss rule in tilt management?',
            s: 'You are deciding whether to add "quit after losing 3 buy-ins" to your session rules.',
            o: [
                'It guarantees you will be a winning player over the month',
                'It removes the quit decision from your tilted in-the-moment brain and gives it to your rational planning brain',
                'It signals to opponents that you are disciplined',
                'It reduces the rake you pay in losing sessions',
            ],
            c: 1,
            e: 'When you are stuck and emotional, you are the worst-qualified version of yourself to judge whether you should keep playing. A pre-committed stop-loss makes the decision in advance, while you are rational, so tilt never gets a vote.',
            d: 2,
        },
        {
            q: 'Which statement about tilt accumulation across sessions is accurate?',
            s: 'A player claims he "never carries anything over" even though he ended yesterday furious after a downswing and skipped his usual wind-down routine.',
            o: [
                'Emotion resets automatically after a night of sleep, so carryover is a myth',
                'Unprocessed frustration accumulates like water behind a dam, lowering the tilt threshold in future sessions until it is deliberately processed',
                'Carryover tilt only affects live players, not online players',
                'Accumulated tilt is beneficial because it keeps you alert',
            ],
            c: 1,
            e: 'Tendler describes accumulated emotion as water rising behind a dam: each unprocessed frustration raises the baseline, so a smaller trigger causes tomorrow\'s blowup. Deliberate post-session review and emotional processing drain the reservoir and restore a normal tilt threshold.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Frustrated', triggerType: 'Carryover' },
        },
        {
            q: 'During a session you notice you have started open-raising hands you would normally fold, "to get unstuck." What is the correct classification and response?',
            s: 'You are down two buy-ins with 40 minutes left in your planned session and your VPIP has crept from 24 to 38.',
            o: [
                'This is a creative adjustment; keep the wider range since your image is loose anyway',
                'This is desperation tilt (trying to win it back fast); either restore your standard ranges immediately or end the session',
                'This is table-image leveraging; it is fine if you win the next pot',
                'This is standard variance; changing ranges is irrelevant to results',
            ],
            c: 1,
            e: 'Loosening your ranges specifically to recover losses is desperation or "get even" tilt, one of the most expensive tilt patterns because it compounds losses with bad fundamentals. The only two acceptable responses are an immediate return to your proven strategy or quitting the session.',
            d: 3,
            m: { tiltLevel: 'High', emotionalState: 'Desperate', triggerType: 'Being Stuck' },
        },
        {
            q: 'Why is a between-hands breathing routine (for example, one slow exhale after every showdown loss) effective against tilt?',
            s: 'A coach assigns a player a physical routine to run after every lost pot, win or lose the session.',
            o: [
                'Slow exhalation activates the parasympathetic nervous system, lowering arousal so the thinking brain stays in charge of the next decision',
                'It wastes time so opponents get bored and play worse',
                'It guarantees the next hand will be played perfectly',
                'It signals confidence, which makes opponents fold more often',
            ],
            c: 0,
            e: 'Tilt is a physiological arousal state as much as a mental one; controlled slow breathing directly downregulates the stress response. Running the routine after every lost pot, not just big ones, keeps arousal from stacking up across the session.',
            d: 3,
        },
        {
            q: 'What distinguishes entitlement tilt from other tilt types?',
            s: 'A strong regular fumes: "I am clearly the best player at this table, I DESERVE to win tonight," after losing several pots to weaker players.',
            o: [
                'It comes from believing skill should exempt you from short-term variance, so losing to worse players feels like a personal violation',
                'It only occurs when playing above your bankroll',
                'It is triggered exclusively by slow play from opponents',
                'It is the healthiest tilt type because it reflects real skill',
            ],
            c: 0,
            e: 'Entitlement tilt stems from the false belief that being better means you should win now, when in reality skill only shifts long-run probabilities. The correction is internalizing that worse players must win often enough to keep playing; their bad calls are the source of your income, not an injustice.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Indignant', triggerType: 'Losing To Weaker Players' },
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-002: TIMING DISCIPLINE — Consistent action speed
    // ═══════════════════════════════════════════════════════════════════════
    'psy-002': [
        {
            q: 'Why is a consistent pre-action routine (same pace for most decisions) valuable in poker?',
            s: 'A live regular snap-folds trash, snap-raises premiums, and tanks only with medium-strength hands.',
            o: [
                'It makes sessions finish faster',
                'It prevents your action speed from leaking information about your hand strength',
                'It is required by casino rules',
                'It intimidates recreational players into folding',
            ],
            c: 1,
            e: 'Varying your tempo by hand strength creates one of the most reliable live tells: instant actions with easy decisions and tanks with marginal ones. A consistent baseline pace strips that signal away and also gives every decision a minimum standard of thought.',
            d: 1,
        },
        {
            q: 'You feel the urge to snap-call a river shove "because you already decided on the turn." What is the disciplined response?',
            s: 'Villain overbet-jams a river that completes the obvious flush draw. You hold top set.',
            o: [
                'Snap-call; changing plans mid-hand is weak',
                'Take your standard time anyway and re-evaluate: the river card and sizing are new information your turn plan did not include',
                'Tank for three minutes to look strong, then call',
                'Fold instantly since he probably has the flush',
            ],
            c: 1,
            e: 'A turn plan is a hypothesis, not a contract; the river card and villain\'s chosen sizing are new data that deserve a full evaluation at your normal pace. Snap-acting on stale conclusions is how prepared players still make unforced errors.',
            d: 2,
        },
        {
            q: 'What is the main mental-game cost of chronically rushing decisions when multi-tabling online?',
            s: 'A 6-tabling grinder notices he clicks within one second on almost every street, even in raised pots.',
            o: [
                'Higher rake per hour',
                'The B-game and C-game become the trained default, because thousands of low-quality reps reinforce autopilot rather than deliberate play',
                'Opponents can see his timing and adjust in real time',
                'It causes repetitive strain injury, which is the only real issue',
            ],
            c: 1,
            e: 'You do not just play hands, you train habits with every rep; rushed, thoughtless clicks groove autopilot into your unconscious game. Cutting tables or forcing a beat of deliberation on non-trivial spots ensures each rep reinforces your A-game process instead of eroding it.',
            d: 3,
        },
        {
            q: 'Which timing behavior most often signals YOUR OWN rising tilt rather than an opponent tell?',
            s: 'You are reviewing your session tape to build self-awareness.',
            o: [
                'Taking the same 5 seconds on every preflop decision',
                'Your actions getting progressively faster and more impulsive after losing pots',
                'Occasionally tanking on a genuinely close river decision',
                'Using a time bank in a tough multiway spot',
            ],
            c: 1,
            e: 'Acceleration after losses is a classic behavioral marker of tilt: the emotional brain wants action and revenge, so it strips out deliberation. Monitoring your own tempo is a cheap, objective tilt alarm because pace changes before results collapse.',
            d: 2,
            m: { tiltLevel: 'Medium', emotionalState: 'Impulsive', triggerType: 'Recent Losses' },
        },
        {
            q: 'What is the best use of a structured decision checklist (range, position, sizing, plan) during play?',
            s: 'A student wants to stop making impulsive calls but worries a checklist will make him too slow.',
            o: [
                'Run it consciously on every significant decision until it becomes automatic; deliberate practice is how the checklist migrates into instinct',
                'Only run it when you are already tilted',
                'Use it in theory study but never at the table',
                'Replace it with gut feel as soon as possible, since checklists are for beginners',
            ],
            c: 0,
            e: 'Skills move from conscious effort to unconscious competence only through repeated deliberate use; the checklist feels slow precisely because it is still being learned. Once ingrained, the same quality of thought happens in seconds, which is the entire goal of process training.',
            d: 3,
        },
        {
            q: 'In a live game, an opponent is berating you for "taking too long" on a genuinely difficult river decision. What is the correct response?',
            s: 'You face a large check-raise on a paired river with a bluff-catcher, and a regular starts needling you about speed.',
            o: [
                'Snap-act to end the criticism',
                'Calmly finish your normal process; his needle is an attempt to rush you into an error, and your obligation is to the decision, not his comfort',
                'Berate him back to establish dominance',
                'Fold immediately as a punishment to yourself for being slow',
            ],
            c: 1,
            e: 'Needling a tanking player is a common pressure tactic aimed at forcing a rushed mistake. Yielding trains opponents that pressure works on you; completing your standard process shows the needle costs him nothing but gains him nothing either.',
            d: 2,
            m: { tiltLevel: 'Low', emotionalState: 'Pressured', triggerType: 'Opponent Needle' },
        },
        {
            q: 'Why do mental-game coaches recommend acting at a steady pace even with the nuts?',
            s: 'You flop a royal flush draw and complete it on the turn. Your instinct is to bet instantly with excitement.',
            o: [
                'Fast bets are illegal with strong hands',
                'Snap-betting monsters and pausing with bluffs creates an exploitable timing pattern; balance requires the same tempo across your whole range',
                'Slow play is always more profitable with strong hands',
                'It gives you time to celebrate internally',
            ],
            c: 1,
            e: 'If your strong hands come out fast and your bluffs come out slow (or vice versa), observant opponents get a free read on every bet you make. Uniform tempo is the timing equivalent of range balance: it makes each individual action uninformative.',
            d: 2,
        },
        {
            q: 'A player uses his full time bank on trivial decisions to "annoy the table." What is the mental-game assessment of this habit?',
            s: 'An online regular stalls every fold in the big blind, hoping to tilt opponents.',
            o: [
                'It is a costless exploit worth keeping',
                'It is a negative-EV habit: it trades focus and goodwill for a tiny speculative tilt effect, and often signals his own frustration leaking out',
                'It is the strongest known form of table image control',
                'It is mandatory in tournament play',
            ],
            c: 1,
            e: 'Deliberate stalling rarely tilts competent opponents but reliably degrades your own rhythm, attention, and the game\'s overall quality. Angle-adjacent habits like this usually originate from the staller\'s own frustration, which is the actual problem to address.',
            d: 4,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-003: COOLER CAGE — Bad beat resilience
    // ═══════════════════════════════════════════════════════════════════════
    'psy-003': [
        {
            q: 'What is the correct mental frame for losing a huge pot with kings against aces, both all-in preflop?',
            s: 'You 4-bet jammed KK for 150BB, ran into AA, and lost. You feel sick and want to review "what you did wrong."',
            o: [
                'You misplayed it; KK should fold to heavy action to avoid coolers',
                'Your play was correct and the loss was a cooler: when the money goes in well, the result carries no lesson about your decision',
                'You should have folded preflop because you "had a feeling"',
                'The site or dealer is likely biased and you should change where you play',
            ],
            c: 1,
            e: 'A cooler is a spot where standard, correct play loses to a stronger holding; the decision quality and the outcome are independent. Searching for a mistake that does not exist trains outcome-oriented thinking, which corrodes confidence in genuinely correct plays.',
            d: 1,
            m: { tiltLevel: 'High', emotionalState: 'Sick', triggerType: 'Cooler' },
        },
        {
            q: 'After a two-outer beats you on the river for a full stack, which self-talk statement best rebuilds equilibrium?',
            s: 'Villain called your turn jam with a dominated pair and binked one of two outs.',
            o: [
                '"I never win the big ones; this game hates me"',
                '"He got there this time, and I want him making that exact call forever; my profit lives inside his mistake"',
                '"I need to win the money back from him specifically before I leave"',
                '"I will avoid big pots for the rest of the session to stay safe"',
            ],
            c: 1,
            e: 'Your entire long-term edge is opponents putting money in with the worst of it; the beat is the visible cost of an invisible income stream. Reframing the suckout as confirmation of a profitable dynamic converts the sting into reinforcement of correct play.',
            d: 2,
            m: { tiltLevel: 'High', emotionalState: 'Stunned', triggerType: 'Two-Outer' },
        },
        {
            q: 'Why do bad beats feel disproportionately painful compared to the pleasure of equivalent wins?',
            s: 'A player notices one suckout ruins his mood more than three won flips improve it.',
            o: [
                'Because bad beats are objectively rarer than wins',
                'Loss aversion: losses are psychologically weighted roughly twice as heavily as equal gains, so the ledger of feelings never matches the ledger of money',
                'Because winning players are supposed to feel nothing',
                'Because opponents celebrate, which doubles the pain',
            ],
            c: 1,
            e: 'Loss aversion is a documented cognitive bias in which losses loom larger than equivalent gains. Knowing the pain is a biased signal, not an accurate measure of what happened, lets you discount it instead of treating it as evidence something is wrong with your game.',
            d: 3,
        },
        {
            q: 'What is the single most useful post-session action after an evening filled with coolers?',
            s: 'You lost four buy-ins tonight; review software shows all-in EV far above actual results.',
            o: [
                'Replay the beats repeatedly to desensitize yourself',
                'Do a short written review confirming decision quality, note any real mistakes separately, then deliberately close the session mentally before tomorrow',
                'Immediately play a long recovery session while the hands are fresh',
                'Post the beats in a forum to collect sympathy',
            ],
            c: 1,
            e: 'A brief structured review separates what you controlled (decisions) from what you did not (cards), which is exactly the boundary bad-beat tilt blurs. Consciously closing the session prevents emotional carryover from lowering tomorrow\'s tilt threshold.',
            d: 3,
        },
        {
            q: 'A player starts fearing the river card every time he is ahead, bracing for disaster. What has gone wrong, and what is the fix?',
            s: 'After a brutal week, he feels dread as each river peels off, even in small pots.',
            o: [
                'Nothing is wrong; vigilance prevents beats',
                'Recency bias has inflated his felt probability of disaster; the fix is grounding in actual frequencies, since made hands hold the vast majority of the time',
                'He should bet smaller so beats cost less, solving the emotion with sizing',
                'He should stop looking at rivers until showdown',
            ],
            c: 1,
            e: 'A cluster of recent beats makes rare events feel common, a distortion of recency and availability bias. Reviewing the true math, that his hands held far more often than they were cracked even during the bad week, recalibrates the emotional forecast to reality.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Anxious', triggerType: 'Recent Bad Run' },
        },
        {
            q: 'Which reaction to a cooler indicates genuinely elite mental game rather than suppressed emotion?',
            s: 'Two players both lose set-over-set pots. One goes silent and rigid; the other briefly acknowledges the sting, resets with a routine, and plays the next hand on-strategy.',
            o: [
                'The silent player, because showing nothing is the goal',
                'The second player: acknowledging the emotion and processing it through a routine, because suppression stores the charge for a later explosion',
                'Neither; elite players feel nothing at all',
                'The silent player, because talking about feelings is a leak',
            ],
            c: 1,
            e: 'Suppression is not regulation: unfelt frustration accumulates and resurfaces as a bigger blowup later. Elite emotional control means noticing the reaction, processing it quickly, and returning to baseline, not pretending the reaction never happened.',
            d: 4,
        },
        {
            q: 'How should you think about a night where you lost every single all-in despite getting the money in ahead each time?',
            s: 'Tracking software shows you were a 70 percent-plus favorite in five stacks and lost all five.',
            o: [
                'The probability of that is so low that something must be rigged',
                'Painful but unremarkable: 0.3 percent-ish nights happen regularly across thousands of players and sessions, and your EV was strongly positive even as results were not',
                'Proof that all-in equity numbers do not apply to you',
                'A sign to start getting money in as the underdog, since favorites lose anyway',
            ],
            c: 1,
            e: 'Low-probability clusters are guaranteed to occur somewhere given enough trials, and every grinder collects them eventually. The night\'s EV, not its outcome, is what compounds into your long-term result; the gap between them is variance doing what variance does.',
            d: 3,
        },
        {
            q: 'What is the danger of telling bad beat stories repeatedly between sessions?',
            s: 'A player retells tonight\'s river disaster to three different friends, getting angrier with each telling.',
            o: [
                'None; venting always discharges emotion completely',
                'Rehearsing the injustice narrative deepens the emotional groove, strengthening the belief that you are uniquely unlucky and priming faster tilt next session',
                'It is only a problem if the story is exaggerated',
                'The only cost is boring your friends',
            ],
            c: 1,
            e: 'Each dramatic retelling is a rehearsal of the victim narrative, consolidating the memory with its emotional charge intact. A single structured debrief that ends in accurate framing ("standard cooler, played fine") processes the event; repeated venting entrenches it.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Resentful', triggerType: 'Rumination' },
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-004: PRESSURE CHAMBER — High stakes decisions
    // ═══════════════════════════════════════════════════════════════════════
    'psy-004': [
        {
            q: 'You take a shot at a bigger game and notice every pot feels enormous. What is the root cause and the correct fix?',
            s: 'You moved from 1/2 to 5/10 with a proper shot-taking bankroll, but your hands shake when you bet.',
            o: [
                'The stakes are objectively too high for anyone; move down permanently',
                'You are thinking in cash value instead of big blinds; retrain your focus on decision quality and bet in units, letting the bankroll math you already did carry the monetary worry',
                'Play only premium hands so the money rarely goes in',
                'Drink something calming before sessions',
            ],
            c: 1,
            e: 'Pressure at new stakes usually comes from translating chips into rent money mid-hand, which hijacks attention from strategy. Since bankroll management already answered the money question before you sat down, in-game thinking should stay in big blinds and ranges.',
            d: 2,
            m: { tiltLevel: 'Medium', emotionalState: 'Nervous', triggerType: 'Moving Up Stakes' },
        },
        {
            q: 'What does the Yerkes-Dodson principle imply about arousal and performance in big pots?',
            s: 'A coach explains why some nerves before a final table are not a problem.',
            o: [
                'Performance is best at zero arousal, so you should aim to feel nothing',
                'Moderate arousal improves performance while extreme arousal degrades it, so the goal is regulating intensity into the productive middle range, not eliminating it',
                'More arousal is always better; fear means you care',
                'Arousal has no measurable effect on decisions',
            ],
            c: 1,
            e: 'The arousal-performance curve is an inverted U: too flat and you are careless, too spiked and fine judgment collapses. Elite performers do not delete nerves; they manage intensity with breathing and routine to stay in the effective band.',
            d: 3,
        },
        {
            q: 'Deep in a tournament, the money jumps are life-changing and you notice yourself avoiding every confrontation. What bias is operating?',
            s: 'You fold several profitable spots at a final table because "I cannot bust here."',
            o: [
                'Gambler\'s fallacy',
                'Loss aversion amplified by the payout ladder, causing you to surrender EV beyond what correct ICM adjustments justify',
                'Sunk cost fallacy',
                'Anchoring on your starting stack',
            ],
            c: 1,
            e: 'ICM legitimately tightens some ranges, but fear-driven folding goes far beyond the math and hands aggressive opponents your equity for free. The discipline is to compute what ICM actually demands and then execute it, rather than letting the fear of busting set your ranges.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Fearful', triggerType: 'Payout Pressure' },
        },
        {
            q: 'What is the best pre-session preparation for a match you know will be emotionally intense?',
            s: 'Tomorrow you play the biggest buy-in event of your year.',
            o: [
                'Avoid thinking about it so you arrive fresh',
                'Visualize the pressure moments in advance (big bluff, cooler, deep run) and mentally rehearse your composed response to each',
                'Study new advanced lines all night so you have fresh weapons',
                'Plan to caffeinate heavily right before the first hand',
            ],
            c: 1,
            e: 'Mental rehearsal pre-exposes your nervous system to the stressors, so when they arrive live they are familiar rather than novel threats. Rehearsing the response, not just the scenario, is what makes the composed version of you available under fire.',
            d: 3,
        },
        {
            q: 'Mid-hand in the largest pot of your life, your mind goes blank. What is the correct emergency protocol?',
            s: 'You face a river check-raise for your tournament life and cannot form a thought.',
            o: [
                'Act immediately since thinking is not working anyway',
                'Use a physiological reset (slow exhale, feel your feet, sip water), then rebuild the hand aloud in your head from preflop as a structured story',
                'Look at the opponent and decide purely from his face',
                'Fold; blanking always means you are beaten',
            ],
            c: 1,
            e: 'Acute stress can momentarily block working memory; the fastest route back is calming physiology first, because reasoning cannot restart while the alarm is loud. Rebuilding the action sequence step-by-step then reloads the context that panic wiped out.',
            d: 4,
            m: { tiltLevel: 'High', emotionalState: 'Frozen', triggerType: 'Huge Pot' },
        },
        {
            q: 'Why does having a clearly defined bankroll and shot-taking plan directly improve decision quality in big games?',
            s: 'Two players sit in the same 10/20 game: one with 10 buy-ins earmarked from a 150 buy-in roll and a stop-loss, one with his last 3 buy-ins.',
            o: [
                'It does not; skill is independent of funding',
                'Knowing the worst case is survivable frees attention from self-preservation to strategy, so the properly rolled player can execute thin value bets and hero folds the scared player cannot',
                'A big bankroll makes the cards run better',
                'The plan matters only for taxes',
            ],
            c: 1,
            e: 'Scared money plays scared because part of the brain is genuinely defending survival, and that fear taxes every close decision. A pre-approved downside converts the game back into a pure decision exercise, which is the only mode where your full skill is available.',
            d: 2,
        },
        {
            q: 'You just won the biggest pot of the session and your heart is still pounding two hands later. What is the professional move?',
            s: 'A 400BB pot shipped your way and you can feel adrenaline pushing you to "keep the rush going."',
            o: [
                'Ride the momentum with looser calls while you are running hot',
                'Treat post-win adrenaline exactly like tilt: run your reset routine and consciously re-tighten to standard ranges before the next meaningful decision',
                'Cash out immediately; big wins must be protected at all costs',
                'Show the table your hand history to build a fearsome image',
            ],
            c: 1,
            e: 'Excitement and tilt are both high-arousal states that degrade judgment; euphoria just feels better while it costs you. Momentum is not a real force in card distribution, so the winning move is returning to baseline before adrenaline writes your next range.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Euphoric', triggerType: 'Big Win' },
        },
        {
            q: 'Which reframe best converts final-table pressure into usable focus?',
            s: 'You feel crushing weight at your first major final table.',
            o: [
                '"Everything rides on the next few hours"',
                '"Pressure is a privilege: this moment exists because I earned it, and my only job is the next decision"',
                '"If I lose this, the whole year was wasted"',
                '"Everyone watching expects me to fail"',
            ],
            c: 1,
            e: 'Framing pressure as evidence of earned opportunity converts threat arousal into challenge arousal, which supports rather than suppresses performance. Narrowing scope to the next decision keeps attention on what you control instead of the imagined verdict of the outcome.',
            d: 3,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-005: PATIENCE MASTER — Waiting for spots
    // ═══════════════════════════════════════════════════════════════════════
    'psy-005': [
        {
            q: 'You have folded for 90 minutes straight in a live game. Which thought pattern signals danger?',
            s: 'Card-dead all night, you look down at K9o under the gun and feel a strong pull to "finally play a hand."',
            o: [
                '"Folding is also a decision that earns money by avoiding losses"',
                '"I am due for a playable hand, and boredom means it is time to loosen up"',
                '"My discipline is my edge over everyone else who cracks in this seat"',
                '"Blind pressure is real but small; my ranges already account for it"',
            ],
            c: 1,
            e: 'Feeling "due" is the gambler\'s fallacy, and using boredom as a range-widening signal converts an emotional state into a strategic error. The deck has no memory; K9o under the gun is the same losing open it was an hour ago.',
            d: 1,
            m: { tiltLevel: 'Low', emotionalState: 'Bored', triggerType: 'Card Dead' },
        },
        {
            q: 'What is the most productive way to spend the time while folding trash hands?',
            s: 'A student asks what "playing" actually means during the 75 percent of hands he folds preflop.',
            o: [
                'Checking your phone to keep boredom manageable',
                'Actively studying opponents: sizing patterns, timing, showdowns, and emotional states, building the reads that pay off when you do enter a pot',
                'Calculating exactly how much the blinds have cost you tonight',
                'Chatting constantly so opponents like you',
            ],
            c: 1,
            e: 'Folded hands are free observation time, and reads gathered while uninvolved are often cleaner because you are emotionally neutral. Boredom is a signal you have stopped working, not a signal the game has stopped offering information.',
            d: 2,
        },
        {
            q: 'Why does impatience typically cost more than most technical leaks?',
            s: 'A database review shows a player\'s biggest losses come from hands he had no business entering.',
            o: [
                'Because impatience adds entirely new negative-EV hands to your range, compounding every postflop street with dominated holdings and bad positions',
                'Because impatience only affects tournament players',
                'Because technical leaks cannot be fixed while impatience can',
                'It does not; patience is overrated in aggressive modern games',
            ],
            c: 0,
            e: 'A technical leak misplays hands you should be playing; impatience manufactures losing situations that should never exist, each one dragging a full postflop tree of further losses behind it. Range discipline is therefore among the highest-ROI mental skills.',
            d: 3,
        },
        {
            q: 'A tight player finally picks up aces after hours of folding and overplays them into an obvious flopped straight. What psychological force is at work?',
            s: 'He refuses to fold despite four bets going in on a terrible runout, saying "I waited all night for this."',
            o: [
                'Outcome bias',
                'Sunk cost and entitlement: the waiting felt like an investment that the hand now "owes" him, so folding feels like wasting the wait',
                'Gambler\'s fallacy about flush cards',
                'Anchoring on preflop equity percentages',
            ],
            c: 1,
            e: 'Hours of folding create a felt investment, and entitlement converts aces from a strong preflop hand into a lottery ticket that must pay off. Each street is a fresh decision about current equity; the wait is a sunk cost with zero claim on this pot.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Entitled', triggerType: 'Long Card-Dead Stretch' },
        },
        {
            q: 'What distinguishes disciplined tightness from fear-based passivity?',
            s: 'Two players both fold a lot; one is a winner and one is a loser.',
            o: [
                'The winner folds less often overall',
                'The winner folds hands outside his strategy but plays the hands inside it aggressively; the passive player also folds profitable spots because confrontation feels risky',
                'The passive player is actually correct in tough games',
                'There is no meaningful difference; tight is tight',
            ],
            c: 1,
            e: 'Patience means waiting for profitable situations and then attacking them fully; passivity means avoiding variance even when EV commands action. The fold button is a tool in one case and a hiding place in the other.',
            d: 3,
        },
        {
            q: 'How should you respond internally when a maniac wins three huge pots with junk hands you disciplined yourself to fold?',
            s: 'The table wildman has run 74o and J3s into two stacks tonight while you fold and wait.',
            o: [
                'Loosen up to his level, since the game is obviously rewarding junk tonight',
                'Recommit to your ranges: his style donates over any meaningful sample, and your discipline is exactly the mechanism that will eventually collect it',
                'Leave the table; maniacs make games unbeatable',
                'Start limping more hands to see cheap flops and out-gamble him',
            ],
            c: 1,
            e: 'Short-run results from a hyper-loose player are a variance advertisement, not a strategy lesson. Envy of his rush is a patience trap; the correct emotional stance is gratitude that the table contains a long-term donor.',
            d: 2,
            m: { tiltLevel: 'Medium', emotionalState: 'Envious', triggerType: 'Loose Player Winning' },
        },
        {
            q: 'What role does a pre-defined starting-hand strategy play in patience?',
            s: 'A coach insists his student write down opening ranges by position before the next session.',
            o: [
                'It is a beginner crutch that strong players discard',
                'It converts patience from a continuous willpower battle into simple rule-following, saving mental energy for postflop decisions that actually need it',
                'It exists only so hands can be reviewed later',
                'It makes you predictable, which outweighs any benefit',
            ],
            c: 1,
            e: 'Willpower is a depleting resource, and re-litigating every marginal preflop temptation drains it fast. Pre-committed ranges make the fold automatic, preserving cognitive fuel for the genuinely complex decisions later in hands.',
            d: 2,
        },
        {
            q: 'Late in a long session, you notice "close enough" creeping into your preflop calls. What is actually happening and what should you do?',
            s: 'Hands like QTo in early position have started feeling "basically the same" as hands in your range.',
            o: [
                'Your ranges were too tight before and fatigue is revealing the truth',
                'Standards erode as mental fatigue rises; either consciously re-tighten using your written ranges or recognize the session is over',
                'This is fine as long as you win the next few pots',
                'Switch to playing every suited hand to simplify decisions',
            ],
            c: 1,
            e: 'Fatigue lowers inhibition first, and range discipline is usually the first casualty, disguised as flexible judgment. The written range is the sober reference point; when you keep arguing with it, the argument itself is the signal to stop playing.',
            d: 4,
            m: { tiltLevel: 'Low', emotionalState: 'Fatigued', triggerType: 'Long Session' },
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-006: FOCUS FLOW — Concentration drills
    // ═══════════════════════════════════════════════════════════════════════
    'psy-006': [
        {
            q: 'What is the most effective structural change for a player whose attention drifts to his phone between hands?',
            s: 'An online grinder checks messages during every hand he folds, then feels "out of the loop" in big pots.',
            o: [
                'Willpower: promise himself he will simply try harder to ignore the phone',
                'Environment design: phone in another room, blockers on distracting sites, so focus does not depend on constantly winning a willpower fight',
                'Play more tables so there is no idle time to be distracted',
                'Keep the phone but only check it after winning pots',
            ],
            c: 1,
            e: 'Relying on in-the-moment willpower against an engineered distraction machine is a losing battle by design. Removing the cue removes the fight entirely, which is why environment design consistently beats resolve in habit research.',
            d: 1,
        },
        {
            q: 'Which practice most directly trains the skill of noticing when your mind has wandered at the table?',
            s: 'A player realizes he often "wakes up" three hands after losing focus, having absorbed nothing.',
            o: [
                'Playing longer sessions to build tolerance',
                'A daily mindfulness practice of returning attention to the breath each time it drifts, which is literally a repetition of the notice-and-return skill',
                'Drinking more caffeine before sessions',
                'Watching training videos at double speed',
            ],
            c: 1,
            e: 'Meditation is not about achieving a blank mind; every noticed drift and gentle return is one rep of the exact attention-recovery muscle poker requires. Trained daily, the gap between drifting and noticing shrinks from hands to seconds.',
            d: 2,
        },
        {
            q: 'What does flow-state research say about the difficulty level of tasks that produce deep focus?',
            s: 'A crusher feels bored and distracted in a very soft home game, yet locked-in at tougher lineups.',
            o: [
                'Flow requires tasks far below your skill so you feel safe',
                'Flow arises when challenge slightly exceeds comfortable skill; too easy produces boredom and too hard produces anxiety, both of which fragment attention',
                'Flow is random and cannot be influenced',
                'Flow only occurs in physical sports, not card games',
            ],
            c: 1,
            e: 'The flow channel sits where challenge and skill are matched with a slight stretch. In soft games you can restore engagement by raising your internal challenge, such as targeting perfect reads or exploit precision, rather than waiting for the game to demand it.',
            d: 3,
        },
        {
            q: 'You notice your focus reliably collapses after about 75 minutes of play. What is the professional response?',
            s: 'Session review shows your biggest errors cluster in the second hour of uninterrupted play.',
            o: [
                'Schedule deliberate breaks before the collapse point (for example, 5 minutes every hour), treating attention as a resource you manage rather than a virtue you demand',
                'Push through; breaks are for weak players and you must build stamina by suffering',
                'Only play 60-minute sessions forever',
                'Double your caffeine at the 70-minute mark',
            ],
            c: 0,
            e: 'Attention degrades on a physiological schedule and no amount of self-criticism changes that curve. Planned recovery before the cliff keeps every played minute at high quality, and stamina then extends gradually with training.',
            d: 2,
        },
        {
            q: 'Which pre-session routine element most improves in-game concentration?',
            s: 'A player wants a repeatable warm-up that gets him focused from hand one instead of hand fifty.',
            o: [
                'A consistent 10-15 minute ritual: brief review of strategic focus points, a few hands of visualization, and a physiological settle-down before the first deal',
                'Jumping in cold to save energy for the session itself',
                'An hour of intense theory study immediately before playing',
                'Watching entertainment until the moment the session starts',
            ],
            c: 0,
            e: 'A warm-up primes the exact mental circuits the session will use and signals the brain that deep-focus mode is beginning. Consistency matters more than content volume; the ritual itself becomes a conditioned trigger for concentration.',
            d: 2,
        },
        {
            q: 'During a hand you are not in, what is the highest-value focus target?',
            s: 'You folded preflop and two regulars are now three-betting each other with 100BB stacks.',
            o: [
                'Planning what you will eat after the session',
                'The showdown-bound action: what sizings, timings, and lines these players choose, information that will be revealed as true or false when cards flip',
                'Your cumulative losses for the week',
                'The television above the table',
            ],
            c: 1,
            e: 'Hands that reach showdown are the rare moments where hidden information becomes public, letting you calibrate every read you have on those players. Watching action you are not emotionally invested in is also the easiest place to practice clean observation.',
            d: 2,
        },
        {
            q: 'What is the cognitive cost of playing while carrying an unresolved argument from earlier in the day?',
            s: 'A player sits down right after a heated phone call, insisting he can "compartmentalize."',
            o: [
                'None, if he wins the first few pots',
                'Unresolved emotional threads keep consuming working memory in the background, shrinking the capacity available for range analysis and reads',
                'It sharpens play by providing aggressive energy',
                'It only matters in live games where opponents can see his face',
            ],
            c: 1,
            e: 'Working memory is small, and background emotional processing occupies it whether or not you consent. A short pre-session reset, writing the issue down with a scheduled time to address it, parks the thread so the table gets your full capacity.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Distracted', triggerType: 'Off-Table Stress' },
        },
        {
            q: 'A player claims multitasking (poker plus streaming shows) costs him nothing because he wins anyway. What is the accurate assessment?',
            s: 'A winning 4-tabler always has a second monitor of entertainment running.',
            o: [
                'He has proven multitasking is free for him',
                'Attention-switching carries a measurable cost on every transition; he is winning despite the leak, and his error rate in non-standard spots is where the invisible cost concentrates',
                'Entertainment improves poker by preventing overthinking',
                'The cost exists but only for losing players',
            ],
            c: 1,
            e: 'Task-switching research is unambiguous: each switch leaves attention residue and degrades performance on the harder task. Standard spots survive on autopilot, so the damage hides in exactly the rare, high-stakes decisions that define win rate differences.',
            d: 4,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-007: RESULT DETACHMENT — Process over outcome
    // ═══════════════════════════════════════════════════════════════════════
    'psy-007': [
        {
            q: 'Which of these is a process goal rather than an outcome goal?',
            s: 'A coach asks a student to restate "win 2,000 this month" as something fully within his control.',
            o: [
                'Finish the month up at least one buy-in',
                'Complete 20 focused sessions with a written pre-game routine and a post-game review for each',
                'Never lose two sessions in a row',
                'Beat a specific rival in head-to-head pots',
            ],
            c: 1,
            e: 'Process goals specify controllable behaviors; outcome goals depend on variance and other people. Sessions played, routines executed, and reviews completed are 100 percent yours, and long-run results emerge from exactly these inputs.',
            d: 1,
        },
        {
            q: 'You bluffed a river, got called, and lost. Villain then showed a bizarre bottom-pair call. How should this hand be graded?',
            s: 'Your triple-barrel told a consistent story on a board that smashed your perceived range; a calling-station called anyway.',
            o: [
                'A failed play, since it lost money',
                'Grade the decision against the information you had: if the bluff was high-EV versus a reasonable range but villain is now revealed as a station, the play was fine and the read should update for next time',
                'Proof that bluffing is unprofitable at this level',
                'Irrelevant; single hands cannot be evaluated at all',
            ],
            c: 1,
            e: 'Outcome bias grades decisions by results, but a decision can only be as good as the information available when it was made. The correct takeaway is a two-part ledger: the process was sound, and the new showdown data updates future bluffing frequency against this player.',
            d: 2,
        },
        {
            q: 'Why is a won pot sometimes worse for your long-term game than a lost one?',
            s: 'A player wins a big pot after a terrible cold-call and an even worse river hero-call.',
            o: [
                'Winning attracts tougher opponents to your table',
                'Rewarded mistakes get reinforced: the win teaches your brain that the bad line works, entrenching a leak that will cost far more than the pot paid',
                'Won pots increase rake exposure',
                'It cannot be; winning is always good for your game',
            ],
            c: 1,
            e: 'Behavior followed by reward strengthens regardless of whether the reward was earned or lucky. Reviewing wins with the same rigor as losses is the antidote; the honest question is "was that decision correct," never "did it work."',
            d: 3,
        },
        {
            q: 'What is the healthiest relationship between a session\'s monetary result and your self-evaluation that night?',
            s: 'Two nights: Tuesday you played your A-game and lost 3 buy-ins; Friday you played distracted C-game and won 2.',
            o: [
                'Tuesday was a bad night and Friday was a good night',
                'Tuesday was a good night and Friday was a bad night: evaluation should track the quality of play you controlled, with money treated as a noisy long-run scoreboard',
                'Both nights were neutral because they nearly cancel out',
                'Neither can be evaluated without a 100,000-hand sample',
            ],
            c: 1,
            e: 'Money in a single session is mostly variance, while quality of execution is fully yours and fully visible. Grading yourself on process keeps reinforcement pointed at the behaviors that actually generate the long-term graph.',
            d: 2,
        },
        {
            q: 'A player checks his cashier balance after every orbit. What is the mental-game effect of this habit?',
            s: 'He says watching the number keeps him "motivated and accountable."',
            o: [
                'It is a harmless accounting habit',
                'It welds his emotional state to short-term variance, guaranteeing mood swings that leak into decisions; balance checks belong in scheduled reviews, not mid-session',
                'It improves focus by raising the stakes of each hand',
                'It is beneficial only when the number is going up',
            ],
            c: 1,
            e: 'Minute-to-minute balance watching turns random fluctuation into an emotional rollercoaster, and each dip invites recovery-mode thinking. Professionals audit results on a schedule measured in weeks, keeping in-session attention on decisions.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Result-Obsessed', triggerType: 'Balance Watching' },
        },
        {
            q: 'What does "playing for the long run" concretely mean during a single decision?',
            s: 'A student says he understands variance intellectually but does not know how to use the idea mid-hand.',
            o: [
                'Assume you will get unlucky and act defensively',
                'Choose the action you would want to repeat in this exact spot ten thousand times, accepting that this single instance may lose',
                'Refuse all high-variance plays regardless of EV',
                'Think about your yearly results while acting',
            ],
            c: 1,
            e: 'The repeated-trial frame converts an emotional one-shot gamble into a frequency question, which is where EV lives. If the action is what you would automate across ten thousand identical spots, this instance\'s outcome is irrelevant to whether it was right.',
            d: 3,
        },
        {
            q: 'After a losing month with solid play confirmed by review, a player concludes "my strategy has stopped working." Which error is he making?',
            s: 'His database shows standard all-in luck far below expectation, and his coach found no strategic regression.',
            o: [
                'None; a month is decisive evidence about strategy',
                'He is drawing conclusions from a sample dominated by variance while ignoring the direct evidence (review, EV data) that his process remained sound',
                'He is correct because winning players never have losing months',
                'The error is reviewing at all; results speak for themselves',
            ],
            c: 1,
            e: 'A month of poker is a small sample in which luck routinely overwhelms skill differences, and his EV data explicitly locates the shortfall in variance. Overweighting recent noisy results against direct process evidence is textbook recency plus outcome bias.',
            d: 4,
        },
        {
            q: 'Which review-session structure best trains outcome detachment over time?',
            s: 'A player wants his weekly review to actively strengthen process orientation, not just find leaks.',
            o: [
                'Review only losing sessions, since wins need no explanation',
                'Mark hands for review during play before results are known, then grade each purely on decision quality, explicitly including won hands that were misplayed and lost hands that were perfect',
                'Sort all hands by money lost and study the top ten',
                'Review only hands where the river changed the outcome',
            ],
            c: 1,
            e: 'Tagging hands before the outcome resolves prevents result-based selection, and grading both directions of the process-outcome mismatch trains the separation directly. Sorting by money lost, by contrast, teaches your attention that losses are what matter.',
            d: 4,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-008: CONFIDENCE BUILDER — Trust your reads
    // ═══════════════════════════════════════════════════════════════════════
    'psy-008': [
        {
            q: 'You develop a strong, specific read that villain\'s river bet is a busted draw, but calling feels scary. What is the disciplined action?',
            s: 'All session this player has bet big with air and checked his made hands; he now bombs the river when the flush misses and you hold second pair.',
            o: [
                'Fold anyway; feelings of fear usually mean the read is wrong',
                'Call: a read built from repeated observed behavior is exactly the evidence that should override generic caution, and refusing to act on it makes gathering reads pointless',
                'Raise as a bluff to avoid having to trust the read',
                'Ask him if he has the flush before deciding',
            ],
            c: 1,
            e: 'Reads earn their value only when converted into action, and this one rests on repeated observed behavior, not a hunch. Fear of being shown a winner is loss aversion talking; the evidence-based call is the profitable play whether or not it wins this time.',
            d: 2,
        },
        {
            q: 'What is the difference between earned confidence and false confidence in poker?',
            s: 'Two players both feel sure of themselves: one after months of study and honest review, one after a hot week of running above EV.',
            o: [
                'There is no difference; confidence is confidence',
                'Earned confidence rests on demonstrated skill and survives downswings; false confidence rests on recent results and shatters the moment variance turns',
                'False confidence is better because it is more optimistic',
                'Earned confidence is impossible in a luck-based game',
            ],
            c: 1,
            e: 'Confidence anchored in verifiable skill development is stable because its foundation does not fluctuate with the cards. Results-based confidence is borrowed from variance and gets repossessed by variance, usually at the worst possible emotional moment.',
            d: 2,
        },
        {
            q: 'After two hero calls fail in one night, you notice yourself abandoning reads entirely. What is the correct correction?',
            s: 'Both calls were built on thin one-hand samples; tonight you refuse to trust even well-founded patterns.',
            o: [
                'Continue avoiding reads; two failures prove your reading skill is broken',
                'Calibrate rather than swing: distinguish read quality (repeated evidence versus single-hand hunches) and keep acting on high-quality reads while demanding better evidence for thin ones',
                'Double down on every hunch to rebuild confidence through volume',
                'Only trust reads on players you have watched for years',
            ],
            c: 1,
            e: 'The lesson in the failed calls is about evidence standards, not about whether reads work. Swinging from overtrust to zero trust replaces one calibration error with another; the skill is grading your own confidence by the quality of its inputs.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Doubtful', triggerType: 'Failed Hero Calls' },
        },
        {
            q: 'How does keeping a "correct decisions ledger" build durable confidence?',
            s: 'A coach has his student log three well-executed decisions after every session, regardless of results.',
            o: [
                'It inflates ego, which is the real goal',
                'It builds a personal evidence base of competence that is independent of variance, giving confidence a foundation that downswings cannot erase',
                'It is busywork that only helps beginners',
                'It works by making the student feel guilty about mistakes',
            ],
            c: 1,
            e: 'Memory under stress is biased toward failures, so downswings can make skilled players genuinely forget they play well. A written record of quality decisions is objective counter-evidence, available exactly when the emotional brain claims you have never won a hand in your life.',
            d: 3,
        },
        {
            q: 'You are about to attempt a big river bluff your analysis says is clearly profitable, and your hands are shaking. What does the shaking mean?',
            s: 'The spot checks every box you studied: capped range, blocked value, perfect story.',
            o: [
                'Your body knows the bluff will fail; abort',
                'Arousal, not information: nerves accompany meaningful action and say nothing about the play\'s EV, so execute the analysis',
                'You should only bluff when completely calm',
                'Shaking means you should turn the bluff into a small value bet instead',
            ],
            c: 1,
            e: 'Physical arousal signals that the moment matters, not that the decision is wrong; interpreting nerves as prophecy is a common confidence leak. The analysis was done by your best thinking; execution is about trusting that work over transient physiology.',
            d: 3,
            m: { tiltLevel: 'Low', emotionalState: 'Nervous', triggerType: 'Big Bluff Spot' },
        },
        {
            q: 'A player only feels confident when he is winning, and plays timidly whenever stuck. What is the structural fix?',
            s: 'His aggression metrics collapse in every losing session, independent of opponents.',
            o: [
                'Anchor in-session identity to preparation and process: a pre-session statement of strategy and evidence of skill, reviewed when stuck, so confidence follows the work rather than the scoreboard',
                'Avoid ever being stuck by quitting at the first lost pot',
                'Increase stakes when losing to force courage',
                'Accept that confidence must follow results and play accordingly',
            ],
            c: 0,
            e: 'Confidence tied to the current score is guaranteed to vanish precisely when courage is most needed. Re-anchoring to preparation, a stable fact that does not change when a flush hits, keeps the aggressive, correct version of you available while stuck.',
            d: 3,
        },
        {
            q: 'What is the proper role of doubt in a strong player\'s decision process?',
            s: 'A student asks whether elite players ever feel unsure.',
            o: [
                'Elite players have eliminated doubt entirely',
                'Doubt is data: it flags genuinely close decisions and knowledge gaps for later study, but it is examined rather than obeyed in the moment',
                'Doubt should always be obeyed; it is intuition in disguise',
                'Doubt means you should always take the passive line',
            ],
            c: 1,
            e: 'Feeling uncertain in genuinely close spots is accurate perception, not weakness, and pretending certainty is its own error. The skill is a two-step: act on the best available analysis now, then convert the recorded doubt into targeted study later.',
            d: 4,
        },
        {
            q: 'How should you handle a table where a respected pro is berating your (correct) plays as "fishy"?',
            s: 'You made a well-reasoned exploitative call and a known pro loudly mocks it, shaking your certainty.',
            o: [
                'Adjust your play to whatever he seems to approve of',
                'Log the hand for objective review later and keep executing your strategy: authority is not evidence, and table talk from an opponent has incentives attached',
                'Explain your full reasoning to him so he stops',
                'Leave the table; you cannot play under criticism',
            ],
            c: 1,
            e: 'An opponent, however skilled, benefits from steering your strategy, and social pressure is not analysis. Confidence with humility means neither crumbling nor arguing: schedule the objective review, and let the strategy you can defend on paper keep running meanwhile.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Self-Conscious', triggerType: 'Criticism' },
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-009: FEAR ERASER — Bold decision making
    // ═══════════════════════════════════════════════════════════════════════
    'psy-009': [
        {
            q: 'What is the most common way fear disguises itself in a hand history?',
            s: 'A coach reviews a student\'s database and finds no wild plays, yet calls the game "fear-soaked."',
            o: [
                'Obvious panic folds with strong hands face-up',
                'A thousand small surrenders: checks where thin value bets belonged, calls where raises belonged, folds in profitable bluff-catching spots, each defensible alone',
                'Excessive bluffing in bad spots',
                'Playing too many tables at once',
            ],
            c: 1,
            e: 'Fear rarely produces dramatic errors; it shaves EV quietly by always selecting the lowest-variance branch of close decisions. Because each spot looks "reasonable," only aggregate statistics like aggression frequency and showdown lines reveal the pattern.',
            d: 3,
        },
        {
            q: 'You identify a perfect bluff spot but think "if this fails, I will feel stupid." Which fear is operating and what is the counter?',
            s: 'Villain\'s line caps his range on a scare-card river and your hand blocks his few calls.',
            o: [
                'Fear of losing money; counter by betting smaller',
                'Fear of embarrassment (ego protection); counter by separating decision quality from social outcome: a correct bluff that gets called is still correct',
                'Fear of variance; counter by never bluffing',
                'Fear of success; counter with visualization of winning',
            ],
            c: 1,
            e: 'The imagined audience reaction, not the chips, is doing the frightening, which is ego protection masquerading as prudence. Since opponents see your cards only when the play fails, ego systematically vetoes exactly the aggressive plays your strategy needs.',
            d: 3,
            m: { tiltLevel: 'Low', emotionalState: 'Hesitant', triggerType: 'Bluff Opportunity' },
        },
        {
            q: 'Why does a strategy of "never bluffing to avoid risk" actually increase risk to your win rate?',
            s: 'A cautious player is proud he "never gets caught bluffing."',
            o: [
                'It does not; bluff-free poker is the safest winning style',
                'Opponents can fold to his bets and attack his checks with impunity: his aggression only ever means value, making him transparently exploitable and bleeding EV every orbit',
                'Bluffing is only needed in tournaments',
                'The only cost is boredom',
            ],
            c: 1,
            e: 'A range that bets only with strong hands lets observant opponents play perfectly against it, folding all worse and continuing all better. The certain, continuous leak of being exploitable dwarfs the occasional visible loss of a failed bluff; avoiding one kind of pain purchases a larger hidden one.',
            d: 2,
        },
        {
            q: 'What is the best training method for a player who knows the right aggressive plays but freezes when executing them?',
            s: 'In review he instantly identifies the check-raise bluffs he should have made live.',
            o: [
                'More theory study until freezing stops on its own',
                'Graduated exposure: commit to executing the play in lower-stakes games first, log each execution, and scale stakes as the action becomes routine',
                'Force the biggest possible bluff at his highest stake immediately',
                'Accept a passive style as his natural personality',
            ],
            c: 1,
            e: 'The gap between knowing and doing is an emotional barrier, and emotional barriers respond to repeated safe exposure, not to more knowledge. Starting where mistakes are cheap lets the nervous system learn the play is survivable, after which boldness scales with familiarity.',
            d: 4,
        },
        {
            q: 'How should you evaluate a big hero fold you made purely because "losing that pot would have felt terrible"?',
            s: 'Facing a river shove with a strong bluff-catcher and a pot-odds price your analysis said was clearly a call, you folded to avoid the pain.',
            o: [
                'A good fold; comfort has value beyond EV',
                'A fear-driven error: the decision criterion was pain avoidance rather than range analysis, and letting feelings set folding standards invites opponents to shove relentlessly',
                'Automatically correct because folding cannot lose money',
                'Unratable without seeing villain\'s cards',
            ],
            c: 1,
            e: 'Folding never shows an immediate loss, which makes it the perfect hiding place for fear; the cost appears only as forfeited pots across time. When "how losing would feel" replaces "what beats me and at what frequency," the fold button has become an emotional shelter rather than a strategic tool.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Avoidant', triggerType: 'Big River Decision' },
        },
        {
            q: 'What role does a pre-committed plan ("if the flush misses, I jam") play in overcoming in-the-moment fear?',
            s: 'A player plans a river jam on brick cards while betting the turn, then chickens out when the brick arrives.',
            o: [
                'Plans are pointless because rivers always change things',
                'Deciding during low emotion binds your future self: honoring pre-committed plans (absent genuinely new information) executes your best thinking instead of your loudest feeling',
                'Plans should be abandoned whenever fear appears, since fear is information',
                'The plan failed because it was not announced to the table',
            ],
            c: 1,
            e: 'The turn version of you had full reasoning capacity and no adrenaline; the river version has the opposite. Unless the river brought real new information, deviating from the plan means the decision was re-made by fear, and each capitulation trains the flinch deeper.',
            d: 3,
        },
        {
            q: 'A player fears the "big confrontation" with the table\'s aggressive chip leader and keeps dodging pots against him. What is the strategic and mental cost?',
            s: 'He folds playable hands whenever the big stack has position, admitting he "does not want that battle."',
            o: [
                'None; avoiding the strongest player is pure prudence',
                'He has granted one opponent a permanent tax on his ranges: the avoidance is broadcast, invites relentless pressure, and rehearses the belief that he cannot compete',
                'The cost is only social, not monetary',
                'It is correct as long as he wins pots elsewhere',
            ],
            c: 1,
            e: 'Systematic avoidance is visible and exploitable, and aggressive players escalate against opponents who reliably yield. Internally, every dodge is a repetition of "I cannot handle this," building the fear it was meant to manage; measured engagement in solid spots reverses both spirals.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Intimidated', triggerType: 'Aggressive Opponent' },
        },
        {
            q: 'Which reframe most accurately describes the risk of a well-chosen bluff?',
            s: 'A student calls bluffing "gambling" and value betting "real poker."',
            o: [
                'Bluffing is gambling; the label is accurate',
                'A well-chosen bluff is a calculated investment: it needs to succeed only at the frequency the sizing math demands, and the fold equity you purchase is as real as any value bet\'s equity',
                'Bluffs are riskier than value bets in every situation',
                'Bluffing is only justified when you are losing',
            ],
            c: 1,
            e: 'A pot-sized bluff profits if opponents fold more than half the time, a threshold routinely exceeded in capped-range spots; that is arithmetic, not gambling. Framing bluffs as investments with known break-even points strips away the moral drama that fear attaches to them.',
            d: 2,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-010: EGO KILLER — Humble learning
    // ═══════════════════════════════════════════════════════════════════════
    'psy-010': [
        {
            q: 'A weaker player at your table makes a suggestion about a hand you played. What is the ego-free response?',
            s: 'A recreational player you consider far below you says your turn sizing looked too small, and your instinct is to dismiss him instantly.',
            o: [
                'Dismiss it; considering advice from weaker players undermines your authority',
                'Evaluate the idea on its merits later: arguments do not inherit the skill level of the person making them, and reflexive dismissal is ego filtering your information supply',
                'Immediately agree to be polite, then ignore it',
                'Explain in detail why he is unqualified to comment',
            ],
            c: 1,
            e: 'Ideas are true or false independent of their source, and ego\'s job is to protect status by filtering input, which quietly starves your learning. A brief, honest evaluation costs minutes; a habit of source-based dismissal costs every insight that arrives in low-status packaging.',
            d: 2,
        },
        {
            q: 'What is the surest sign that ego rather than analysis is driving a player\'s study routine?',
            s: 'A regular spends hours reviewing hands he won with brilliant plays and rarely opens the sessions where he lost big.',
            o: [
                'He uses a solver in his reviews',
                'He curates his review material to confirm he is great: revisiting triumphs and avoiding the losses where his actual leaks are documented',
                'He studies alone instead of in a group',
                'He reviews more than one hour per week',
            ],
            c: 1,
            e: 'Study driven by learning goes where the errors are; study driven by ego goes where the applause is. The losing sessions he avoids contain precisely the information that would improve him, which is why they feel so aversive to open.',
            d: 2,
        },
        {
            q: 'How does the fixed versus growth mindset distinction apply to being shown a major leak in your game?',
            s: 'A coach demonstrates that a player\'s cherished river overbet strategy has been burning money for a year.',
            o: [
                'Fixed mindset accepts the evidence; growth mindset defends the strategy',
                'Fixed mindset hears "you are flawed" and defends; growth mindset hears "here is exactly where improvement lives" and gets to work; the leak is identical, only its meaning differs',
                'Mindset research does not apply to gambling games',
                'Both mindsets respond identically to concrete evidence',
            ],
            c: 1,
            e: 'A fixed mindset treats ability as identity, so evidence of a leak becomes an attack to repel with rationalization. A growth mindset treats ability as buildable, making the same evidence a map to the next gain; over years this single difference compounds into enormous skill gaps.',
            d: 3,
        },
        {
            q: 'You realize mid-discussion that the hand analysis you have been arguing for is wrong. What does strong mental game look like?',
            s: 'In a study group you defended a call for ten minutes before a range breakdown showed it clearly burns money.',
            o: [
                'Keep arguing; conceding damages your credibility permanently',
                'Update out loud: "You are right, I had this wrong," because normalizing being wrong keeps the group\'s information flowing and trains your own flexibility',
                'Go silent and change the subject',
                'Concede publicly but privately keep playing it your way',
            ],
            c: 1,
            e: 'The purpose of analysis is accuracy, not victory, and visible updating is what makes a study group worth having. Players who cannot lose arguments gracefully soon stop being offered honest feedback at all, which is a quiet catastrophe for their development.',
            d: 2,
        },
        {
            q: 'Why is "I already know that" one of the most expensive sentences in poker improvement?',
            s: 'A student skips a fundamentals module because the topics look familiar.',
            o: [
                'It is not expensive; avoiding redundant material is efficient',
                'Familiarity is not mastery: recognizing a concept feels identical to being able to execute it under pressure, and ego uses that feeling to wall off exactly the reps that would close the gap',
                'The sentence is only a problem for beginners',
                'It is expensive only if said aloud to a coach',
            ],
            c: 1,
            e: 'The fluency illusion makes recognized material feel mastered, while execution under fatigue and pressure is a different, trainable capacity. Elite performers in every field re-drill fundamentals precisely because knowing-about and being-able-to diverge without maintenance.',
            d: 3,
        },
        {
            q: 'A player refuses to move down in stakes during an extended downswing because "that is where fish play, and I am beyond that." What is the diagnosis?',
            s: 'His bankroll has fallen below any sensible requirement for his current stake.',
            o: [
                'Sound reasoning; moving down damages skills',
                'Ego-driven identity protection overriding bankroll math: stake level has become self-worth, and defending the image now risks the entire roll',
                'Correct, because downswings end faster at higher stakes',
                'A scheduling problem, not a psychological one',
            ],
            c: 1,
            e: 'When stake level becomes identity, moving down feels like demotion of the self rather than routine risk management. The bankroll does not care about image; players who cannot separate worth from stakes routinely convert survivable downswings into busted rolls.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Prideful', triggerType: 'Downswing' },
        },
        {
            q: 'What is the learning cost of always blaming losses on variance?',
            s: 'A player\'s post-session summary is "ran bad again" for the tenth straight losing week.',
            o: [
                'None; attributing losses to variance protects confidence, which is paramount',
                'Blanket variance-blame is self-serving attribution bias: it feels protective but switches off leak detection, leaving real errors unexamined and permanent',
                'The cost is only reputational among peers',
                'Variance-blame is always accurate after any losing week',
            ],
            c: 1,
            e: 'Variance is real, but using it as the universal explanation means no loss ever triggers investigation. The honest protocol reviews every significant losing stretch for decision errors first and grants the variance verdict only after the process audit comes back clean.',
            d: 3,
        },
        {
            q: 'How should a strong player relate to coaching and feedback after reaching a winning level?',
            s: 'A solid mid-stakes winner wonders whether outside input still matters.',
            o: [
                'Winners have graduated from feedback; self-review suffices forever',
                'Blind spots are invisible by definition at every level: external eyes remain the only reliable detector, and the willingness to be examined is what separates players who plateau from players who keep climbing',
                'Feedback is useful only during downswings',
                'Only coaches at least two stakes higher can say anything useful',
            ],
            c: 1,
            e: 'Improvement science is consistent across domains: the best performers consume the most feedback, not the least, because self-assessment degrades exactly where habits feel most natural. Winning is compatible with large hidden leaks, and only outside observation finds them before opponents do.',
            d: 4,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-011: SESSION STAMINA — Long session focus
    // ═══════════════════════════════════════════════════════════════════════
    'psy-011': [
        {
            q: 'Which factor has the largest influence on late-session decision quality?',
            s: 'A player wants to know why his last two hours are always his worst, regardless of results.',
            o: [
                'The card distribution late in sessions',
                'Physiological state: sleep debt, hydration, blood sugar, and accumulated mental fatigue set the ceiling on how well anyone can think after hour four',
                'Opponent skill increasing as the night goes on',
                'The rake structure changing late at night',
            ],
            c: 1,
            e: 'Cognition runs on biology, and no amount of motivation overrides depleted glucose, dehydration, or sleep debt. Managing the body across a session, through breaks, water, and real food, is managing the quality of every decision the mind will make.',
            d: 1,
        },
        {
            q: 'The game is fantastic but you have hit hour nine and caught yourself misreading a board. What is the professional decision?',
            s: 'Two whales are stuck and splashing, and you just miscounted your own outs for the first time tonight.',
            o: [
                'Stay; games this good outweigh any fatigue penalty',
                'Quit or take a serious break: a concrete cognitive error is objective evidence your edge is degrading, and a great game only pays a player capable of exploiting it',
                'Stay but only play premium hands on autopilot',
                'Order an energy drink and re-commit for four more hours',
            ],
            c: 1,
            e: 'A misread board is not a warning of decline; it is decline, observed directly. Game quality is only half the profit equation: your realized edge is table softness multiplied by your current capacity, and the second factor just failed a live test.',
            d: 3,
            m: { tiltLevel: 'Low', emotionalState: 'Depleted', triggerType: 'Marathon Session' },
        },
        {
            q: 'What is the best structural approach to playing a planned 12-hour live tournament day?',
            s: 'A player preparing for a major event asks how to still be sharp at the midnight bubble.',
            o: [
                'Maximum caffeine early to bank alertness for later',
                'Treat it as an endurance event: full sleep beforehand, real meals, water over sugar, movement on every break, and caffeine held in reserve for the late stages',
                'Skip meals to avoid post-food drowsiness',
                'Play every hand early while fresh, then coast tight later',
            ],
            c: 1,
            e: 'Long tournament days are athletic events for the brain, and the players still sharp at midnight prepared like athletes. Front-loading stimulants guarantees a crash at the money stages; sleep banking, steady fueling, and reserved caffeine flatten the fatigue curve.',
            d: 2,
        },
        {
            q: 'Why do short breaks restore focus even when you do not feel tired?',
            s: 'A coach mandates a five-minute walk every hour, and the student protests he "was fine."',
            o: [
                'They do not; breaks are placebo rituals',
                'Attention fatigue accumulates below conscious awareness: performance degrades before the feeling of tiredness arrives, so scheduled recovery repairs a deficit you cannot yet feel',
                'Breaks work only because you might see other tables',
                'Breaks help only players over forty',
            ],
            c: 1,
            e: 'Vigilance research consistently shows measurable performance decline preceding subjective fatigue, meaning "I feel fine" is an unreliable gauge. Scheduling recovery by the clock rather than by feel repairs the invisible deficit before it surfaces as a blown pot.',
            d: 3,
        },
        {
            q: 'A grinder plays his best poker for 90 minutes but forces daily 6-hour sessions "for volume." What should he optimize instead?',
            s: 'His database shows a sharply negative win rate in hours three through six.',
            o: [
                'Total hours at any quality, since volume is king',
                'Quality-hours: several focused blocks with real recovery between them will beat one long degradation curve, and stamina can then be extended gradually from a winning baseline',
                'Switching to higher stakes so fewer hours are needed',
                'Playing tired on purpose to toughen up',
            ],
            c: 1,
            e: 'Volume of losing poker is negative volume; his hours three through six are actively buying back his morning\'s profit. Structuring play into proven-quality blocks converts the same calendar time into positive EV, and endurance training can extend block length over months.',
            d: 3,
        },
        {
            q: 'What is the relationship between physical fitness and poker stamina?',
            s: 'A skeptical player asks why his coach keeps mentioning cardio.',
            o: [
                'None; poker is played sitting down',
                'Aerobic fitness improves cerebral blood flow, glucose regulation, and stress recovery, directly extending how long high-level cognition can be sustained in a chair',
                'Fitness matters only for live players who carry chip racks',
                'Exercise helps only by improving table image',
            ],
            c: 1,
            e: 'The brain is the most metabolically expensive organ, and its endurance rides on cardiovascular infrastructure. Across cognitive-performance research, aerobically fit individuals sustain attention longer and recover from stress spikes faster, which is a literal description of a long session\'s demands.',
            d: 2,
        },
        {
            q: 'Late in a session you feel a "second wind" of energy after a big won pot. How should you interpret it?',
            s: 'Hour eight, you double up, and suddenly feel wide awake and eager to keep playing.',
            o: [
                'Genuine recovery; fatigue is gone and the session can extend safely',
                'An adrenaline masking effect: the underlying cognitive fatigue is intact beneath the excitement, and decisions made on this borrowed alertness remain degraded',
                'Proof that winning cures tiredness',
                'A sign you should raise your stakes for the remaining hours',
            ],
            c: 1,
            e: 'Adrenaline suppresses the feeling of fatigue without restoring the depleted capacities underneath, the same mechanism that lets injured athletes finish games badly. The honest fatigue assessment is the one you made before the pot shipped; excitement changed the mood, not the math.',
            d: 4,
            m: { tiltLevel: 'Low', emotionalState: 'Wired', triggerType: 'Late-Session Win' },
        },
        {
            q: 'Which end-of-session habit most protects the NEXT session\'s quality?',
            s: 'A daily grinder wants his mornings to start sharp instead of foggy and vaguely tilted.',
            o: [
                'Reviewing every hand immediately no matter how late it is',
                'A brief shutdown ritual: log results and notable hands, note emotional residue, then a deliberate wind-down with screens off, protecting the sleep that tomorrow\'s cognition is built from',
                'Falling asleep to poker streams to stay immersed',
                'A large late meal to reward the grind',
            ],
            c: 1,
            e: 'Tomorrow\'s A-game is manufactured tonight, primarily by sleep quality, and unprocessed session residue is what keeps grinders wired at 3 a.m. The shutdown ritual closes the mental tabs cheaply; the full analytical review belongs in tomorrow\'s fresh hours.',
            d: 2,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-012: SNAP DECISION — Instinct training
    // ═══════════════════════════════════════════════════════════════════════
    'psy-012': [
        {
            q: 'When is trusting a fast intuitive judgment most defensible in poker?',
            s: 'A veteran gets an immediate "this is a bluff" signal and wonders whether to trust it.',
            o: [
                'Whenever the feeling is strong, since intensity indicates accuracy',
                'When the pattern comes from a domain where he has thousands of reviewed, feedback-corrected repetitions; intuition is compressed experience and is only as good as the database behind it',
                'Never; intuition has no place in a math game',
                'Only when losing, because desperation sharpens instinct',
            ],
            c: 1,
            e: 'Research on expert intuition (Klein, Kahneman) converges on this: fast judgments are trustworthy where the environment offers regular patterns and the expert has extensive practice with quality feedback. Strength of feeling is not evidence; depth of relevant, reviewed experience is.',
            d: 3,
        },
        {
            q: 'What is the difference between a trained instinct and an impulse at the table?',
            s: 'Two fast decisions: one snap-call from a pro who has studied this exact spot for years, one snap-call from a frustrated player who "just wanted to see it."',
            o: [
                'Nothing; both are fast decisions and speed is what defines them',
                'Trained instinct is pattern recognition emerging from deliberate practice; impulse is emotion seizing the controls, and the two feel similar from inside, which is exactly the danger',
                'Impulses are always wrong and instincts are always right',
                'Instincts occur only in live poker, impulses only online',
            ],
            c: 1,
            e: 'Both arrive instantly and feel certain, but one is compressed expertise and the other is arousal bypassing analysis. The practical test is state and history: a calm mind with deep reps in this pattern can trust the flash, while a frustrated or bored mind should assume impulse and slow down.',
            d: 2,
        },
        {
            q: 'How do you build reliable snap decisions for common preflop spots?',
            s: 'A student wants button-versus-blind decisions to become automatic and correct.',
            o: [
                'Play high volume and let automation happen by itself',
                'Drill the spots deliberately away from the table (range work, trainers, flashcard-style reps with feedback) until correct responses fire without conscious effort, then verify with in-game review',
                'Memorize one default action for all situations',
                'Copy whatever the fastest player at your table does',
            ],
            c: 1,
            e: 'Automation without accuracy just makes mistakes faster; unsupervised volume automates whatever you happen to be doing. Deliberate drilling with immediate feedback installs the correct pattern first, and then repetition wires it for speed.',
            d: 2,
        },
        {
            q: 'Your gut screams "fold" in a spot your studied strategy says is a clear call. You have no specific read. What is the disciplined action?',
            s: 'Standard bluff-catching spot against an unknown; the math is unambiguous but dread is loud.',
            o: [
                'Fold; gut feelings outrank calculations',
                'Call: with no specific information behind it, the dread is more likely loss-aversion noise than signal, and the studied strategy encodes far more evidence than a feeling',
                'Ask for time and flip a mental coin',
                'Call but only half the required amount',
            ],
            c: 1,
            e: 'Unattributed dread in a standard spot is usually the emotional cost of variance talking, not perception. Intuition earns override rights only when tied to something noticed, such as a bet-sizing pattern or timing anomaly; free-floating fear does not carry information about villain\'s cards.',
            d: 4,
            m: { tiltLevel: 'Low', emotionalState: 'Uneasy', triggerType: 'Close Decision' },
        },
        {
            q: 'A player notices something "off" about villain\'s river bet but cannot articulate what. How should this half-formed signal be used?',
            s: 'The bet is sized normally, but the whole sequence produced a strong wrongness feeling in an experienced player.',
            o: [
                'Ignore it entirely; unarticulated means unreliable',
                'Weight it as one input: pause, actively search for what triggered it (timing, sizing history, story inconsistency), and let it tip genuinely close decisions while never overriding clear math',
                'Treat it as certainty and make a huge hero play',
                'Announce the feeling to the table to gauge reactions',
            ],
            c: 1,
            e: 'Expert pattern recognition often fires before conscious explanation catches up, so the feeling deserves an investigation, not blind obedience. Using it as a tiebreaker in close spots captures its value while capping the damage when it turns out to be noise.',
            d: 4,
        },
        {
            q: 'Why does tilt specifically corrupt fast decisions more than slow ones?',
            s: 'A player\'s snap-calls become wild when frustrated while his long-tank decisions stay reasonable.',
            o: [
                'It does not; tilt affects all speeds equally',
                'Fast decisions run on the automatic system where emotion lives; deliberate slow analysis can partially bypass the emotional signal, so tilt hijacks snap judgments first and worst',
                'Slow decisions are immune to all emotion permanently',
                'Fast decisions are corrupted only in tournaments',
            ],
            c: 1,
            e: 'Snap judgments and emotions share the same fast, automatic machinery, so a tilted state contaminates them at the source. Deliberate reasoning offers a partial firewall, which is why forcing a slower pace when emotionally activated is a core tilt-containment tactic.',
            d: 3,
            m: { tiltLevel: 'High', emotionalState: 'Agitated', triggerType: 'Frustration' },
        },
        {
            q: 'What is the correct post-session treatment of your intuitive calls, both the winners and the losers?',
            s: 'A player wants his gut to actually improve over time rather than stay static.',
            o: [
                'Remember the winners and forget the losers to protect confidence',
                'Log them all and audit accuracy: what did the gut say, what was true, what pattern was it responding to; feedback is the only mechanism that converts guessing into calibrated instinct',
                'Never review intuition; analysis destroys it',
                'Review only the losers, since winners need no explanation',
            ],
            c: 1,
            e: 'Intuition improves through the same loop as any skill: prediction, outcome, correction. Without honest tracking, memory keeps the hits and discards the misses, manufacturing false confidence in a gut that is actually running near chance.',
            d: 3,
        },
        {
            q: 'In a time-pressured spot (short clock, big pot), what preparation determines whether your fast decision is any good?',
            s: 'Online, the time bank is nearly gone and you face an unexpected check-raise all-in.',
            o: [
                'Nothing; time-pressured decisions are pure luck',
                'The work done before the moment: pre-built ranges, rehearsed decision rules, and prior study of similar nodes are what a compressed clock forces you to fall back on',
                'Typing speed and mouse accuracy',
                'Having the largest possible stack so the decision matters less',
            ],
            c: 1,
            e: 'Under time pressure there is no capacity for fresh analysis; you can only retrieve what already exists. Players who systematize their strategy in study effectively pre-compute the hard spots, which is why their snap decisions resemble their deliberate ones.',
            d: 3,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-013: TELL BLINDNESS — Ignoring false reads
    // ═══════════════════════════════════════════════════════════════════════
    'psy-013': [
        {
            q: 'What is the fundamental requirement before any physical tell can be used against a specific player?',
            s: 'A live player wants to act on the classic "shaky hands means strong" heuristic against a stranger.',
            o: [
                'The tell must appear in a big pot',
                'A baseline: knowing how this individual normally behaves, because a behavior is only informative as a deviation from that player\'s own normal',
                'Confirmation from another player at the table',
                'The tell must match what a famous tells book says',
            ],
            c: 1,
            e: 'Generic tell lore fails because behaviors mean different things across individuals; a stranger\'s shaking could be caffeine, nerves about stakes, or a medical condition. Reads become reliable only as deviations from an established personal baseline observed across many hands.',
            d: 2,
        },
        {
            q: 'You made a huge fold based on a "read" and were wrong. Reviewing honestly, the read was one hand of weak evidence. What bias inflated it?',
            s: 'Villain had once shown a bluff with a similar bet speed, and from that single event you built a confident story.',
            o: [
                'Loss aversion',
                'Overgeneralization from a tiny sample plus confirmation bias: one memorable data point became a rule, and everything afterward was interpreted to fit it',
                'The sunk cost fallacy',
                'Anchoring on the pot size',
            ],
            c: 1,
            e: 'Single vivid events feel like patterns because memory weights them heavily, and confirmation bias then recruits ambiguous evidence to support the new rule. Real reads require repetition; the discipline is asking "how many times have I actually seen this, and did it reach showdown?"',
            d: 3,
        },
        {
            q: 'Why is actively hunting for tells in every hand often counterproductive for intermediate players?',
            s: 'A student stares intensely at opponents all session and his own play deteriorates.',
            o: [
                'Staring is against the rules in most rooms',
                'The search itself manufactures false positives from noise, consumes attention needed for strategy, and generates overconfident hero plays built on fiction',
                'Tells do not exist at any level of play',
                'It is counterproductive only against professionals',
            ],
            c: 1,
            e: 'Human perception finds patterns in randomness on demand, so an aggressive tell hunt reliably "discovers" meaningless signals. For most players, solid range-based strategy funds the win rate, and behavioral reads should be occasional cheap bonuses, not the main course.',
            d: 3,
        },
        {
            q: 'A talkative opponent suddenly goes silent and rigid, then bets big. Which interpretation discipline is correct?',
            s: 'You have three hours of baseline on this chatty recreational player.',
            o: [
                'Silence universally means bluffing; call',
                'A real deviation from an established baseline is worth weighting, but it should adjust your range estimate, not replace it; combine the read with the action line and price before deciding',
                'Ignore it; behavior never carries information',
                'Fold immediately since silence universally means strength',
            ],
            c: 1,
            e: 'This is the good case for tells: a clear deviation from hours of personal baseline. Even then, behavioral evidence is probabilistic and belongs inside the strategic calculation as a range-shifter, not as an oracle that overrides pot odds and line logic.',
            d: 4,
        },
        {
            q: 'What is a "false tell," and what is the correct defense against it?',
            s: 'A tricky regular has noticed you watching him and begins acting weak with monsters.',
            o: [
                'False tells are a myth; behavior cannot be faked',
                'Deliberately performed behavior meant to trigger your read; the defense is weighting acted, theatrical signals near zero and trusting involuntary micro-behavior and betting patterns instead',
                'The defense is to stop looking at opponents forever',
                'The defense is to always do the opposite of every read',
            ],
            c: 1,
            e: 'Observant opponents will feed staged signals to anyone who visibly reacts to behavior, and staged signals are typically loud and theatrical. The reliable channel remains what is hard to fake: bet sizing patterns, timing under pressure, and lines that must survive showdown.',
            d: 3,
        },
        {
            q: 'After correctly ignoring a weak read and losing the pot anyway, a player concludes "I should have trusted my instinct." What error is this?',
            s: 'His process said the evidence was insufficient; the fold turned out wrong this one time.',
            o: [
                'No error; results validate instincts',
                'Outcome bias rewriting history: the read was unjustified by the evidence available, and one contrary result does not convert a bad evidentiary standard into a good one',
                'The gambler\'s fallacy',
                'Correct updating from new information',
            ],
            c: 1,
            e: 'Judging the discipline by this single outcome would train him to act on flimsy reads, a policy that loses over any real sample. The review question is never "would it have won" but "was the evidence sufficient at decision time," and here it was not.',
            d: 4,
        },
        {
            q: 'Which information source should carry the MOST weight in a typical read on a live opponent?',
            s: 'You must rank evidence quality: a facial expression this hand, his bet-sizing pattern across 40 showdowns, and a tells chapter you once studied.',
            o: [
                'The facial expression, because it is happening right now',
                'The sizing pattern across 40 showdowns: repeated, showdown-verified betting behavior is the highest-quality read data available, far above one-off body language or generic literature',
                'The tells chapter, because it is professionally written',
                'All three equally, averaged together',
            ],
            c: 1,
            e: 'Betting patterns verified by showdowns are large-sample, involuntary, and directly about how this player constructs ranges. Momentary expressions are single noisy data points and book heuristics are population averages; both are weak next to forty verified observations.',
            d: 2,
        },
        {
            q: 'You have no reads at a table of strangers. What should your strategy lean on, and what should you resist?',
            s: 'First orbit at a new casino, and you feel pressure to "figure everyone out" immediately.',
            o: [
                'Lean on invented reads from appearance and age; resist boring default play',
                'Lean on solid baseline strategy and population tendencies while quietly building baselines; resist the urge to manufacture confident individual reads from clothing, age, or one hand',
                'Refuse to play any significant pot until reads exist',
                'Copy the table\'s loosest player until information arrives',
            ],
            c: 1,
            e: 'Stereotype-based instant reads are mostly prejudice dressed as insight, and acting on them creates unforced errors. Sound default strategy needs no reads to be profitable; genuine individual information accumulates naturally through observed hands and showdowns.',
            d: 2,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-014: BANKROLL MIND — Money management
    // ═══════════════════════════════════════════════════════════════════════
    'psy-014': [
        {
            q: 'What is the primary PSYCHOLOGICAL function of proper bankroll management, beyond ruin protection?',
            s: 'A coach insists on 40+ buy-ins for cash games even for a clearly winning student.',
            o: [
                'It impresses backers and peers',
                'It makes any single buy-in emotionally survivable, so decisions can be made on EV rather than fear; scared money cannot play its best game',
                'It eliminates downswings entirely',
                'It lets you skip studying since the roll absorbs mistakes',
            ],
            c: 1,
            e: 'The mathematical function is ruin avoidance, but the daily function is emotional: when a stack is a small fraction of the roll, losing it is an expense rather than a threat. That psychological safety is what allows thin value bets, correct calls, and honest aggression.',
            d: 1,
        },
        {
            q: 'A player mixes his poker bankroll with living expenses "because it is all my money anyway." What is the mental-game consequence?',
            s: 'Rent is due next week and part of it is sitting on the table in tonight\'s game.',
            o: [
                'None, if he is a winning player',
                'Every pot now carries survival stakes: loss aversion intensifies, aggression collapses, and the game is played by a frightened brain defending rent money',
                'It improves motivation because losses hurt more',
                'It only matters for tournament players',
            ],
            c: 1,
            e: 'Segregating the bankroll is a psychological firewall: it pre-answers "what does losing mean" with "a tracked business expense" instead of "trouble at home." When the firewall is gone, fear leaks into every close decision, and fear is a strategy tax opponents happily collect.',
            d: 2,
            m: { tiltLevel: 'Medium', emotionalState: 'Anxious', triggerType: 'Playing With Rent Money' },
        },
        {
            q: 'When is moving DOWN in stakes the strong psychological play rather than an admission of failure?',
            s: 'A downswing has cut a player\'s roll from 50 to 22 buy-ins for his current game.',
            o: [
                'Never; moving down destroys confidence permanently',
                'Now: dropping down restores the roll-to-stakes ratio, lowers emotional load, and lets him rebuild rhythm and confidence in games he beats comfortably; it is risk management, not a verdict on his skill',
                'Only after the roll reaches exactly zero',
                'Only if his coach forces him',
            ],
            c: 1,
            e: 'Moving down is the professional response that keeps the career alive and the mind calm; refusing it usually stems from ego, not analysis. Players who treat stake changes as routine logistics preserve both bankroll and confidence through inevitable variance.',
            d: 2,
        },
        {
            q: 'What is "shot-taking" done correctly, from a psychological standpoint?',
            s: 'A 2/5 winner wants to try 5/10 without endangering his mental game or roll.',
            o: [
                'Sitting in the bigger game whenever it looks juicy, with no plan',
                'A pre-defined experiment: a fixed number of buy-ins allocated in advance, clear stop-loss and retreat rules, and an explicit agreement with himself that returning down is part of the plan, not a failure',
                'Selling action secretly so losses do not count emotionally',
                'Waiting until he can afford to lose without noticing',
            ],
            c: 1,
            e: 'Defining the downside and the retreat path in advance strips the shot of catastrophic meaning, so he can play freely rather than defensively. Ambiguous shots invite tilt-chasing when they go badly, because no line exists where the experiment officially ends.',
            d: 3,
        },
        {
            q: 'A player refuses to cash out any winnings, always gambling the full roll at the highest stake it allows. Which bias-driven pattern is this?',
            s: 'Three times he has run a small roll up aggressively and lost it all back at the top stake.',
            o: [
                'Sound compounding strategy interrupted by bad luck',
                'The house-money effect plus no risk-of-ruin discipline: treating won money as "free" leads to systematically oversized risk, and repeated busts are the predictable output',
                'Loss aversion causing excessive caution',
                'The endowment effect protecting his stack',
            ],
            c: 1,
            e: 'Mental-accounting research shows people gamble recent winnings more recklessly than earned savings, though the money is identical. A rule-based structure, fixed stake ladders and scheduled cash-outs, replaces the felt distinction between "real money" and "winnings" with arithmetic.',
            d: 4,
        },
        {
            q: 'How should a professional emotionally frame a standard 15 buy-in downswing?',
            s: 'A full-time cash player with a 60 buy-in roll and years of winning data hits a 15 buy-in slide.',
            o: [
                'As a crisis demanding immediate strategic overhaul',
                'As weather: a statistically routine event his bankroll was explicitly sized to absorb, warranting a process review for leaks but no panic and no identity crisis',
                'As proof that poker has been solved and his era is over',
                'As a sign to double stakes and win it back quickly',
            ],
            c: 1,
            e: 'Downswings of this scale are guaranteed occurrences in any long winning career, which is precisely why bankroll requirements exist. The disciplined response audits play quality for real leaks while treating the variance itself as pre-purchased, already-budgeted weather.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Worried', triggerType: 'Downswing' },
        },
        {
            q: 'Why do tournament players need far larger bankrolls (in buy-ins) than cash players, psychologically as well as mathematically?',
            s: 'An MTT player wonders why 100 buy-ins is considered thin for his format.',
            o: [
                'Tournament rake is higher, which is the whole story',
                'Payout concentration means even great MTT players cash rarely and win huge mainly through rare deep runs; both the math of long droughts and the psyche enduring them require a much deeper cushion',
                'They do not; the requirements are actually identical',
                'Because tournament players tilt more by nature',
            ],
            c: 1,
            e: 'Top-heavy payout structures make hundred-buy-in losing stretches unremarkable even for elite MTT players. The bankroll must fund the drought financially, and knowing it can is what lets the player keep making correct high-variance plays through months of red.',
            d: 3,
        },
        {
            q: 'What is the correct relationship between bankroll rules and in-session emotions?',
            s: 'Mid-downswing, a player feels a powerful urge to "just take one shot" two stakes up tonight.',
            o: [
                'Rules should flex with strong feelings; conviction is information',
                'Rules exist precisely to outvote feelings like this one: the urge to jump stakes while stuck is the desperation pattern the rules were written, in a calm state, to prevent',
                'Rules apply only when winning',
                'The urge should be obeyed once per month as a release valve',
            ],
            c: 1,
            e: 'Bankroll rules are instructions from your rational self to your future emotional self, and mid-downswing is exactly when the emotional self petitions for an exception. The strength of the urge is not a reason to grant it; it is the confirmation that the firewall is being tested.',
            d: 2,
            m: { tiltLevel: 'High', emotionalState: 'Desperate', triggerType: 'Downswing' },
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-015: WINNERS TILT — Staying sharp ahead
    // ═══════════════════════════════════════════════════════════════════════
    'psy-015': [
        {
            q: 'What is "winner\'s tilt"?',
            s: 'A player is up five buy-ins and has started limping junk, showing bluffs, and calling "for fun."',
            o: [
                'Anger at winning too slowly',
                'Performance degradation caused by winning: euphoria, overconfidence, and the house-money effect loosening discipline exactly when the session is going best',
                'A myth; winning cannot harm play',
                'Fear of giving back profits, causing over-tight play only',
            ],
            c: 1,
            e: 'Tilt is any emotion-driven departure from your A-game, and euphoria qualifies just as anger does. The big win relaxes vigilance, inflates perceived skill, and reclassifies profit as play money, a combination that quietly refunds winnings to the table.',
            d: 1,
            m: { tiltLevel: 'Medium', emotionalState: 'Euphoric', triggerType: 'Big Winning Session' },
        },
        {
            q: 'Why does a big early win often lead to a worse hourly rate for the rest of the session?',
            s: 'Database analysis shows a player\'s win rate after doubling up early is far below his baseline.',
            o: [
                'Opponents play better against winners',
                'The house-money effect: profits feel like the casino\'s money rather than his own, licensing looser calls and thinner gambles than his strategy permits',
                'The deck equalizes after big wins',
                'Fatigue from stacking chips',
            ],
            c: 1,
            e: 'Mental accounting treats recent winnings as a separate, less valuable currency, though every big blind has identical value. Recognizing that "playing with their money" is a bookkeeping illusion restores the same range discipline that built the win in the first place.',
            d: 2,
        },
        {
            q: 'You are massively up and notice the thought "I cannot lose today, I am running too hot." What cognitive error is this, and what follows if you obey it?',
            s: 'Everything has held for three hours and invincibility has set in.',
            o: [
                'Accurate pattern detection; hot streaks are real and predictive',
                'The hot-hand fallacy applied to cards: past run-good does not change the next hand\'s probabilities, and obeying the feeling means taking worse spots at exactly your loosest moment',
                'Healthy confidence that should be ridden as far as it goes',
                'Gambler\'s fallacy, meaning you are actually due to lose',
            ],
            c: 1,
            e: 'Card distribution is memoryless; the streak lives in your results, not in the deck\'s future. The invincibility feeling is dangerous because it arrives bundled with loosened standards, so the correct response is treating it as a cue to re-tighten, not a license.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Invincible', triggerType: 'Heater' },
        },
        {
            q: 'What is the strongest argument AGAINST quitting a great game purely to "lock up the win"?',
            s: 'A player in a soft lineup, playing well and feeling fresh, wants to leave early only to protect a two-buy-in profit.',
            o: [
                'There is no argument; protecting wins is always priority one',
                'If conditions are excellent (soft game, strong mental state, no fatigue), the future hands are exactly the high-EV opportunities he plays poker to find; leaving is letting a scoreboard emotion overrule expected value',
                'Quitting early is rude to the table',
                'Winning sessions must always be extended to maximum length no matter the conditions',
            ],
            c: 1,
            e: 'Session boundaries are accounting fiction; the only question is whether the next hour is +EV given the game and his state. When both are genuinely good, quitting to protect a number is loss aversion in disguise, though quitting remains correct the moment fatigue or euphoria degrades his edge.',
            d: 4,
        },
        {
            q: 'How should you handle the urge to show your successful bluffs while running hot?',
            s: 'You just bluffed the table captain off a big pot and your hand is reaching to flip the cards face up.',
            o: [
                'Show it; the tilt you induce outweighs everything',
                'Muck it: showing donates strategy information, is usually driven by ego seeking applause rather than any calculated purpose, and the urge itself is a winner\'s-tilt symptom worth noticing',
                'Show only the bluffs, never the value hands',
                'Show it but claim it was a misclick',
            ],
            c: 1,
            e: 'Occasionally a strategic show exists, but the heater-driven urge is ego wanting recognition, not strategy. Free information compounds against you across the session, and the desire itself is a useful alarm that euphoria has begun steering decisions.',
            d: 2,
        },
        {
            q: 'A player wins a life-changing tournament score. What is the mental-game protocol for the following weeks?',
            s: 'His biggest career cash is 40 times his normal weekly earnings, and offers, opinions, and confidence are flooding in.',
            o: [
                'Immediately jump permanently to nosebleed stakes; results earned the promotion',
                'Deliberate stabilization: bank the money by pre-set bankroll rules, keep playing his proven stakes and routines, and let any stake move follow sample-based evidence rather than a single result',
                'Quit poker at the peak forever',
                'Spend heavily to celebrate, since confidence is now the roll',
            ],
            c: 1,
            e: 'One score, however large, is a single data point that says little about sustainable edge at higher stakes. The dangerous months after a windfall are when overconfidence and lifestyle inflation dismantle careers; routines and pre-set rules carry him through the euphoria intact.',
            d: 4,
        },
        {
            q: 'Which in-session habit best detects winner\'s tilt before it becomes expensive?',
            s: 'A player wants an objective tripwire, since euphoria feels wonderful rather than wrong.',
            o: [
                'Watching whether the profit number keeps rising',
                'Periodic range audits: every 30 minutes, compare the hands you are actually entering pots with against your written standards; widening ranges while winning is the earliest measurable symptom',
                'Asking opponents if you seem overconfident',
                'Counting how often you smile',
            ],
            c: 1,
            e: 'Unlike anger, euphoria carries no internal alarm, so detection must be behavioral rather than emotional. Range discipline is the first thing euphoria loosens, making a scheduled comparison of played hands against written standards a reliable tripwire.',
            d: 3,
        },
        {
            q: 'Why is the phrase "playing with house money" a leak in disguise?',
            s: 'Up big, a player rationalizes a wild call: "even if I lose it, I am still up for the night."',
            o: [
                'It is not a leak; risk tolerance should scale with session profit',
                'Because every chip has full value regardless of its origin story: the phrase is mental accounting that licenses negative-EV decisions by pretending some money matters less',
                'It is only a leak in live poker where chips are physical',
                'The phrase is fine as long as the session ends positive',
            ],
            c: 1,
            e: 'A big blind won an hour ago buys exactly what a big blind from your wallet buys, and EV math does not consult your session graph. The house-money frame exists to make bad gambles feel free; naming it as an accounting trick restores honest evaluation of each decision.',
            d: 2,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-016: VARIANCE ZEN — Accepting swings
    // ═══════════════════════════════════════════════════════════════════════
    'psy-016': [
        {
            q: 'What is the most accurate one-sentence description of variance in poker?',
            s: 'A new serious player asks a coach to define the concept precisely.',
            o: [
                'Variance is bad luck that targets good players',
                'Variance is the natural, unavoidable gap between expected value and short-term results, in both directions, shrinking in relative size only over very large samples',
                'Variance is a flaw in shuffling algorithms',
                'Variance is another word for losing streaks',
            ],
            c: 1,
            e: 'Variance is symmetric and structural: it produces heaters exactly as readily as downswings and applies to everyone dealt cards. Internalizing that it shrinks only relative to sample size, tens of thousands of hands, resets expectations about what any single week can prove.',
            d: 1,
        },
        {
            q: 'Why do winning players NEED variance rather than merely tolerate it?',
            s: 'A frustrated student says he wishes poker had no luck at all.',
            o: [
                'They do not; luck-free poker would pay professionals more',
                'Variance is why weaker players win often enough to keep playing and paying: remove the luck and the losing players leave, taking the entire profit pool with them',
                'Variance keeps rake low',
                'Variance only benefits recreational players',
            ],
            c: 1,
            e: 'In a pure-skill game the weaker side loses every time and rationally quits, as no ecosystem of profitable opponents can exist. The suckouts that hurt are the same mechanism that keeps the fish hopeful and funded; a professional\'s income is paid out of variance\'s existence.',
            d: 2,
        },
        {
            q: 'A player runs 8 buy-ins below all-in EV this month. Which conclusion is statistically and mentally sound?',
            s: 'His tracker shows solid decisions, positive expected value, and brutal all-in luck.',
            o: [
                'His game has secretly deteriorated in ways trackers cannot see',
                'The month is within normal variance for his volume: the EV line is the meaningful signal, the results line is noise, and his job is unchanged, keep making the same +EV decisions',
                'He should switch sites or venues to change his luck',
                'He should tighten up drastically until results recover',
            ],
            c: 1,
            e: 'All-in EV deficits of this scale occur routinely in any honest sample of a grinder\'s career. Strategy changes should be driven by decision-quality evidence, not by which side of expectation the coin landed; chasing results with strategy changes converts variance into real losses.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Discouraged', triggerType: 'Running Below EV' },
        },
        {
            q: 'What does the gambler\'s fallacy predict a player will wrongly believe after losing six flips in a row?',
            s: 'He has lost six consecutive all-in coinflips this week.',
            o: [
                'That flips are 50/50 events with no memory',
                'That he is "due" to win the next several flips, as if the deck owes him a correction',
                'That sample size determines confidence',
                'That his flip results are within normal variance',
            ],
            c: 1,
            e: 'The gambler\'s fallacy is the intuition that independent events self-correct in the short run; in reality the next flip is 50/50 regardless of history. The danger is behavioral: feeling "due" licenses taking worse spots on the expectation that fate now owes payment.',
            d: 2,
        },
        {
            q: 'How does properly understanding variance change the emotional meaning of a downswing?',
            s: 'Two equally skilled players are in identical 20 buy-in downswings; one is calm, one is in crisis.',
            o: [
                'It does not; downswings feel identical to everyone',
                'The calm player pre-accepted downswings as a certainty of the profession, already priced into bankroll and expectations, so the event is painful weather rather than shocking evidence about his worth',
                'The calm player simply cares less about poker',
                'Understanding variance removes all pain from losing',
            ],
            c: 1,
            e: 'Expectation management is emotional management: an event you have genuinely accepted as inevitable arrives as a known cost, not a betrayal. The crisis player implicitly believed skill should exempt him, so the same math that the calm player budgeted for strikes him as injustice.',
            d: 3,
        },
        {
            q: 'What sample size mindset should govern conclusions about your own win rate?',
            s: 'A player wants to declare himself a 10bb/100 winner after 5,000 good hands.',
            o: [
                '5,000 hands is plenty; results are results',
                'Hold conclusions loosely for tens of thousands of hands: at 5,000 hands the confidence interval around a win rate spans from significant loser to crusher, so humility is the only honest position',
                'Win rates can never be estimated at any sample',
                'One live session is sufficient if it was long',
            ],
            c: 1,
            e: 'Standard deviations in no-limit hold\'em are enormous relative to win rates, so short samples are dominated by noise. Treating early results, good or bad, as provisional protects against both crushing false despair and expensive false confidence.',
            d: 3,
        },
        {
            q: 'Which daily practice most builds genuine (not merely intellectual) variance acceptance?',
            s: 'A student says he understands the math but still feels every beat as an injustice.',
            o: [
                'Rereading variance formulas until the feelings stop',
                'Repeated exposure with deliberate reframing: after every beat, briefly running the accepted-truth script ("correct play, expected cost, my edge is intact") so the emotional brain learns through repetition what the intellect already knows',
                'Avoiding all-ins so acceptance is never tested',
                'Watching other players take beats on stream',
            ],
            c: 1,
            e: 'Intellectual understanding lives in one system and emotional reaction in another; only repeated practice at the moment of the sting transfers the knowledge across. Each beat processed with the script is a training rep, and over months the initial flash of injustice genuinely shrinks.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Frustrated', triggerType: 'Bad Beat' },
        },
        {
            q: 'A player says: "I accept variance when I lose flips, but three-outers on the river are different, those are unfair." What is the error?',
            s: 'He has constructed categories of "acceptable" and "unacceptable" luck.',
            o: [
                'No error; some beats genuinely violate probability',
                'Selective variance acceptance: a 3-outer arriving its expected 7 percent of the time is exactly as lawful as a lost flip, and carving out "unfair" categories preserves a hidden entitlement that variance must behave politely',
                'The error is accepting flips, which are also unfair',
                'River cards follow different mathematics than earlier streets',
            ],
            c: 1,
            e: 'All variance is the same phenomenon at different frequencies; rare events must occur at their rate or the probabilities would be false. The "unfair" category is where residual entitlement hides, and it will keep generating tilt until low-frequency outcomes are accepted as fully lawful.',
            d: 4,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-017: STUDY HABITS — Effective learning
    // ═══════════════════════════════════════════════════════════════════════
    'psy-017': [
        {
            q: 'Which study method produces the most durable improvement per hour invested?',
            s: 'A player has five weekly study hours and must choose how to spend them.',
            o: [
                'Passively watching training videos at high volume',
                'Active work: solving spots himself before checking solutions, reviewing his own marked hands, and drilling weaknesses with immediate feedback',
                'Reading forum debates about famous hands',
                'Watching the highest-stakes streams available',
            ],
            c: 1,
            e: 'Learning research is unambiguous: retrieval and self-generated answers with feedback outperform passive consumption several-fold. Videos feel productive because recognition is easy, but the skill built is watching, not deciding; deliberate practice targets the deciding.',
            d: 1,
        },
        {
            q: 'What is the ideal ratio relationship between playing and studying for a developing player?',
            s: 'A student plays 30 hours weekly and studies zero, wondering why he has plateaued.',
            o: [
                'Playing is studying; volume alone eventually teaches everything',
                'A meaningful dedicated study block (commonly 15-25 percent of poker time) is required, because play generates experience but only review converts experience into corrected skill',
                'Studying should exceed playing ten to one at all levels',
                'Study is only for players who have never won',
            ],
            c: 1,
            e: 'Unreviewed play reinforces existing habits, including the bad ones, which is exactly what a plateau is. The review loop, marking confusing spots in-game and resolving them off-table, is the conversion mechanism between raw hands played and actual improvement.',
            d: 2,
        },
        {
            q: 'How should a player choose WHAT to study next?',
            s: 'He owns three courses, two solvers, and a coaching library, and jumps randomly between topics.',
            o: [
                'Study whatever is newest, since the game evolves',
                'Let his own data lead: database stats and marked hands reveal where money is actually leaking, and the biggest leak with the highest frequency is the highest-ROI study target',
                'Study the most advanced topic available to stay ahead',
                'Rotate topics alphabetically for balanced coverage',
            ],
            c: 1,
            e: 'Study ROI equals leak size times how often the spot occurs, which personal data reveals precisely. Random or novelty-driven study optimizes for interest rather than earnings; a boring frequent leak, like big-blind defense, usually outpays an exotic rare one by an order of magnitude.',
            d: 2,
        },
        {
            q: 'Why does reviewing hands immediately after a losing session often backfire?',
            s: 'A player opens his tracker at 2 a.m. still furious about the night\'s beats.',
            o: [
                'Hand histories are inaccurate until the next day',
                'The review is conducted by a tilted brain: emotional residue biases analysis toward self-flagellation or blame, and the fatigued mind cannot do the careful range work real review requires',
                'It does not backfire; heat improves honesty',
                'Trackers mislabel hands at night',
            ],
            c: 1,
            e: 'Review quality depends on the state of the reviewer, and post-loss emotion plus fatigue is the worst configuration available. The professional pattern is a brief note capture that night, then real analysis in tomorrow\'s calm hours, when hands can be graded on process rather than pain.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Frustrated', triggerType: 'Post-Session Rumination' },
        },
        {
            q: 'What is the purpose of spaced repetition in poker study?',
            s: 'A student masters preflop ranges each Sunday and has forgotten half by Friday.',
            o: [
                'It is a memorization gimmick with no poker application',
                'Revisiting material at increasing intervals interrupts natural forgetting: ranges reviewed at expanding gaps consolidate into long-term memory that survives at the table under pressure',
                'It works only for language learning',
                'Its purpose is to make study feel harder',
            ],
            c: 1,
            e: 'The forgetting curve erases most unreinforced learning within days, which is why Sunday mastery evaporates by Friday. Scheduled re-exposure at expanding intervals is the most evidence-backed fix in learning science, converting fragile familiarity into durable recall.',
            d: 2,
        },
        {
            q: 'A player consumes solver outputs daily but cannot explain WHY the solver prefers its lines. What is the risk?',
            s: 'He memorizes "bet 33 percent here" across hundreds of nodes without grasping the underlying logic.',
            o: [
                'None; memorized outputs are all that matters in-game',
                'Brittle knowledge: without the underlying principles (range interaction, equity denial, nut advantage), he cannot adapt when spots deviate from memorized nodes, which real hands constantly do',
                'The risk is only that solvers might be wrong',
                'Solver study is inherently harmful',
            ],
            c: 1,
            e: 'Real hands land between memorized nodes, and interpolation requires principles rather than lookup tables. The productive solver workflow interrogates outputs, asking what features of the ranges drive the strategy, so the compressed understanding generalizes to unseen spots.',
            d: 4,
        },
        {
            q: 'What role should a study group play in a serious player\'s development?',
            s: 'A self-studier wonders whether joining a hand-history discussion group is worth the schedule cost.',
            o: [
                'None; groups leak your strategies to future opponents',
                'A well-run group supplies what solo study cannot: exposure to different thinking styles, defense of your reasoning out loud, accountability, and detection of blind spots that self-review misses by definition',
                'Groups are useful only for absolute beginners',
                'Groups matter only for networking toward staking deals',
            ],
            c: 1,
            e: 'Articulating and defending analysis forces a depth of processing that silent study rarely reaches, and peers spot the assumptions you cannot see around. The accountability effect alone, scheduled sessions with people expecting your work, measurably raises study consistency.',
            d: 3,
        },
        {
            q: 'How should study intensity change during a brutal downswing?',
            s: 'A player mid-downswing wants to either study frantically for 6 hours daily or abandon study entirely.',
            o: [
                'Abandon study; downswings mean rest is all that matters',
                'Maintain the normal sustainable routine with emphasis on confirming fundamentals: moderate structured study rebuilds confidence through evidence, while panic-study driven by desperation mostly rehearses anxiety',
                'Triple study hours; suffering must be answered with grinding',
                'Study only the hands from the downswing itself',
            ],
            c: 1,
            e: 'Desperation-driven marathon study is emotionally motivated and poorly retained, while quitting study removes the main source of legitimate confidence. The steady middle path audits for real leaks, confirms the process is sound, and gives the player evidence-based grounds to keep executing.',
            d: 4,
            m: { tiltLevel: 'Medium', emotionalState: 'Desperate', triggerType: 'Downswing' },
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-018: TABLE IMAGE — Perception awareness
    // ═══════════════════════════════════════════════════════════════════════
    'psy-018': [
        {
            q: 'What is the correct definition of table image as a strategic concept?',
            s: 'A student uses the phrase constantly but cannot define it.',
            o: [
                'How well-dressed and confident you appear',
                'The model of your strategy that each opponent currently holds, built from what they have observed, which determines how they will respond to your future actions',
                'Your lifetime results reputation',
                'The average of what the whole table thinks of everyone',
            ],
            c: 1,
            e: 'Image is opponent-specific and observation-based: each player runs a different model of you depending on what they have seen and remembered. Its strategic value is predictive, knowing their model of you tells you how they will interpret your next bet.',
            d: 1,
        },
        {
            q: 'You have been caught bluffing twice in the last 30 minutes. What is the correct exploitation of your new image?',
            s: 'The table now visibly distrusts your bets, and players are talking about your bluffs.',
            o: [
                'Bluff more; they will assume you cannot possibly bluff again',
                'Shift toward value-heavy betting: opponents inclined to call you down will now pay off your strong hands at a premium, and bluffs should wait until the image fades',
                'Stop betting entirely for an hour',
                'Show your next three strong hands to reset the image manually',
            ],
            c: 1,
            e: 'Image exploitation is about second-level thinking: they think you bluff too much, so their calling ranges widen, which raises value-bet EV and craters bluff EV. Playing into their adjustment, not against your own caricature, is the profitable response.',
            d: 2,
        },
        {
            q: 'Against which opponent type is cultivating a table image nearly worthless?',
            s: 'A player carefully constructs a tight image at a table of drinking tourists playing their first session.',
            o: [
                'Aggressive professionals',
                'Unobservant recreational players: image only works on opponents who are watching, remembering, and adjusting, and this group is doing none of the three',
                'Tight elderly regulars',
                'Online players with tracking software',
            ],
            c: 1,
            e: 'Image is a message, and messages require a receiver; players focused on their own cards and cocktails are not decoding your folding frequency. Against non-observers, straightforward value-oriented play beats any image investment, which is pure cost with no audience.',
            d: 2,
        },
        {
            q: 'How does anchoring bias shape the image opponents form of you?',
            s: 'In your first orbit you showed down a wild three-barrel bluff; two hours of tight play later, opponents still call you "the maniac."',
            o: [
                'It does not; images update instantly with new evidence',
                'First impressions anchor disproportionately: early vivid actions set a reference model that later evidence adjusts only slowly, so your early showdowns purchase hours of influence',
                'Anchoring applies only to bet sizing decisions',
                'Opponents forget everything within one orbit',
            ],
            c: 1,
            e: 'Human impression-formation overweights initial and vivid data, and a showdown bluff is both. Knowing this, early-session showdowns are disproportionately valuable advertising, and you should expect opponents\' models of you to lag your actual current strategy by a wide margin.',
            d: 3,
        },
        {
            q: 'What is the psychological trap of becoming attached to a "fearless bluffer" image?',
            s: 'A player has built a wild image he is proud of, and keeps bluffing even as the table adjusts to call everything.',
            o: [
                'There is no trap; consistency of image is paramount',
                'Identity capture: the image has become ego rather than tool, so he defends the persona when strategy demands abandoning it, paying real money to protect a self-concept',
                'The trap is that bluffing is inherently unprofitable',
                'The image will attract cheaters to his table',
            ],
            c: 1,
            e: 'An image is a rented billboard, useful only while it manipulates opponents profitably; the moment they adjust, its value inverts. When persona becomes identity, ego blocks the pivot to value-betting that the new table dynamic screams for, converting an edge into a leak.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Prideful', triggerType: 'Image Attachment' },
        },
        {
            q: 'A quiet tight player suddenly makes a huge river raise. How should your read incorporate his image management?',
            s: 'He has played 11 percent of hands over four hours and never raised a river.',
            o: [
                'Assume he is finally bluffing, since everyone bluffs eventually',
                'Weight his demonstrated range heavily: players rarely deviate from four hours of behavior at maximum stakes moments, and unprecedented aggression from tight players is overwhelmingly value',
                'Ignore the history; each hand is independent',
                'Call to send a message about not being pushed around',
            ],
            c: 1,
            e: 'Behavioral consistency is strongest exactly where money peaks: tight players do not select their first river raise of the night as the moment to start bluffing. "Unprecedented action from a predictable player" is among the most reliable read categories in live poker, and it points firmly toward folding.',
            d: 3,
        },
        {
            q: 'How should awareness of your OWN image change after you win several big pots in a row?',
            s: 'You have dragged four consecutive significant pots, some at showdown, and the table has gone quiet around you.',
            o: [
                'Assume nothing changed; images require weeks to form',
                'Expect fear-adjusted responses: opponents now over-fold to your aggression and only continue with strength, so widen your bluffing in good spots and tighten your value-bet calls accordingly',
                'Expect everyone to attack you out of jealousy',
                'Leave immediately before they adapt',
            ],
            c: 1,
            e: 'A visible heater manufactures a temporarily fearsome image, and fear shows up as over-folding and strength-only continues. That means bluffs print and thin value shrinks, the exact opposite adjustment most players make while euphoric, which is why image self-awareness pays.',
            d: 4,
        },
        {
            q: 'What is the mental-game skill underlying all image play?',
            s: 'A coach says image work is "empathy with a scorecard."',
            o: [
                'Acting talent from theater training',
                'Perspective-taking: continuously modeling what each specific opponent has observed about you and what conclusions their particular mind would draw, rather than assuming they see what you see',
                'Memorizing your own statistics',
                'Maintaining a single permanent persona across all games',
            ],
            c: 1,
            e: 'Image play fails most often through projection, assuming opponents noticed what you noticed and reason as you reason. The skill is running their model: an unobservant player saw nothing, a sharp regular saw everything, and your image-based moves must be addressed to the actual audience.',
            d: 4,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-019: AUTOPILOT ESCAPE — Staying present
    // ═══════════════════════════════════════════════════════════════════════
    'psy-019': [
        {
            q: 'What is "autopilot" in poker, and why is it dangerous even for strong players?',
            s: 'A veteran realizes he has played two full orbits with no memory of any decision he made.',
            o: [
                'A useful energy-saving mode with no real cost',
                'Defaulting to habitual actions without present-moment evaluation: it silently substitutes generic responses for situation-specific ones, missing exploits, dynamics shifts, and creeping errors',
                'A technical term for playing too tight',
                'A problem only beginners experience',
            ],
            c: 1,
            e: 'Autopilot runs on cached defaults, which by definition ignore what is specific about the current table, opponents, and dynamics. Strong players suffer it worst in familiar games precisely because their habits are good enough to hide the decay; the cost is every exploit they no longer notice.',
            d: 1,
        },
        {
            q: 'Which moment is the most effective anchor for snapping back to full presence each hand?',
            s: 'A coach wants a built-in mindfulness trigger that occurs every single hand.',
            o: [
                'Whenever you win a pot',
                'The moment cards are dealt to you: a fixed physical ritual (look, position check, one breath, scan the table) attached to that event resets attention dozens of times per hour',
                'Only at the start of each new dealer',
                'Whenever you feel like it, to keep things natural',
            ],
            c: 1,
            e: 'Presence fades continuously, so it must be re-established on a schedule, and the deal is the perfect metronome because it precedes every decision. Anchoring a brief ritual to it converts an abstract intention ("stay present") into an automatic behavior with dozens of daily reps.',
            d: 2,
        },
        {
            q: 'Why do familiar environments (home game, regular casino, usual site) accelerate autopilot?',
            s: 'A player is razor-sharp in new card rooms but sleepy in his Tuesday home game.',
            o: [
                'Familiar environments have worse lighting',
                'The brain economizes attention where it predicts nothing new: familiarity suppresses the novelty signals that drive alertness, so vigilance must be generated deliberately where the environment no longer provides it',
                'Home games are objectively easier so focus is unnecessary',
                'Friends are distracting, which is the entire effect',
            ],
            c: 1,
            e: 'Attention is budgeted by predicted information gain, and a familiar room predicts none, regardless of how much money is moving. The fix is manufacturing novelty internally, fresh observation goals, seat-by-seat re-reads, session challenges, because the environment has stopped doing it for you.',
            d: 3,
        },
        {
            q: 'What is the best in-game test of whether you are actually present versus autopiloting?',
            s: 'A player wants a quick self-check he can run at any moment.',
            o: [
                'Checking whether you are winning',
                'Reconstruction: can you state the last three hands\' actions, who is playing how tonight, and your current specific reads; if the answers are vague, presence left some time ago',
                'Checking your posture only',
                'Asking whether you feel relaxed',
            ],
            c: 1,
            e: 'Presence produces retrievable detail; autopilot produces a fog where hands blur together. The reconstruction test is objective and immediate, and failing it is not a verdict but a cue to run your reset routine and rebuild the table model from live observation.',
            d: 2,
        },
        {
            q: 'A player says: "My defaults are solver-approved, so autopilot is fine for me." What is the flaw?',
            s: 'His baseline strategy is genuinely strong and studied.',
            o: [
                'Nothing; strong defaults make presence unnecessary',
                'Maximum EV against real humans comes from deviations that exploit specific opponents; autopilot plays only the baseline, forfeiting the entire exploitative layer, and cannot even detect when conditions demand adaptation',
                'Solver strategies expire weekly, which is the real problem',
                'Autopilot is fine online but not live',
            ],
            c: 1,
            e: 'A solver baseline is designed to be unexploitable, not maximally exploitative; against imperfect humans the profit peak lies in targeted deviations. Deviations require noticing, and noticing is precisely the faculty autopilot switches off, so his ceiling quietly drops to baseline-only EV.',
            d: 4,
        },
        {
            q: 'Boredom during a slow session tempts you to play a junk hand "just to be involved." What is the mindful alternative?',
            s: 'Hours of folding have made the session feel like a waiting room.',
            o: [
                'Playing the junk hand; engagement has value',
                'Redirecting the restlessness into observation work: set a concrete study target at the table (profile every player\'s three-bet response, track sizing tells), making folded hands active instead of empty',
                'Leaving every slow session immediately',
                'Playing a phone game to pass the folds',
            ],
            c: 1,
            e: 'Boredom is unallocated attention, and it will spend itself on bad hands or distractions unless given a job. Structured observation converts dead time into read equity that pays off in later pots, and the engagement itself dissolves the boredom that was pushing you toward junk.',
            d: 2,
            m: { tiltLevel: 'Low', emotionalState: 'Bored', triggerType: 'Slow Game' },
        },
        {
            q: 'How does mindfulness meditation transfer to fewer autopilot episodes at the table?',
            s: 'A skeptic asks why sitting with his breath should change his poker.',
            o: [
                'It does not transfer; meditation is relaxation only',
                'It trains meta-awareness, the capacity to notice where attention currently is: practitioners catch the drift into autopilot earlier and re-engage faster, shrinking episodes from orbits to hands',
                'It transfers only if practiced at the table itself',
                'It works by lowering heart rate exclusively',
            ],
            c: 1,
            e: 'The core rep of meditation is detecting that attention wandered and returning it, which is exactly the anti-autopilot skill. Trained daily, the detection latency drops, and at the table that difference is measured in how many hands pass before you notice you have gone dim.',
            d: 3,
        },
        {
            q: 'You catch yourself having auto-folded a hand that deserved real consideration. What is the highest-value response?',
            s: 'The fold is done and irreversible; the button has moved on.',
            o: [
                'Ruminate on the mistake for the next several orbits',
                'Treat it as a presence alarm, not a poker tragedy: run your reset ritual, note the drift trigger if identifiable, and re-enter full engagement with the current hand, the only one that still exists',
                'Play the next hand regardless of holding to compensate',
                'Ignore it completely; noticing mistakes is negativity',
            ],
            c: 1,
            e: 'The auto-fold cost a fraction of a big blind; rumination or compensation plays would cost far more. Mistakes noticed in real time are gifts, live evidence of the drift and its trigger, and the professional response is a fast reset that converts the alarm into renewed presence.',
            d: 3,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // psy-020: MIND MASTER — Full mental game (VIP capstone)
    // ═══════════════════════════════════════════════════════════════════════
    'psy-020': [
        {
            q: 'In Tendler\'s adult learning model, what separates "conceptual understanding" from "unconscious competence" in a mental-game skill?',
            s: 'A student can lecture about tilt theory yet still blows up under pressure.',
            o: [
                'Nothing; understanding a skill is possessing it',
                'Skills must be trained through repetition under progressively realistic pressure until they run automatically; knowledge held only conceptually collapses exactly when emotion spikes and takes conscious thinking offline',
                'Unconscious competence is genetic and cannot be built',
                'The difference is vocabulary size',
            ],
            c: 1,
            e: 'Under emotional load, the brain sheds its newest, least-practiced layers first, which is why theory evaporates mid-blowup. The learning model demands taking each skill through staged repetition, from effortful to automatic, because only what is automatic survives the moment it is needed most.',
            d: 4,
        },
        {
            q: 'What is the correct integrated response to a session containing a cooler, a needling opponent, and a rising urge to chase losses?',
            s: 'All three stressors have landed within 20 minutes and you feel the composite pressure building.',
            o: [
                'Handle them after the session; mid-game is for poker only',
                'Run the layered protocol: physiological reset first (breath, posture), then injected logic for each trigger, then an honest capacity check deciding whether quality play remains possible, quitting without shame if not',
                'Pick the strongest stressor and ignore the others',
                'Immediately quit; three stressors always exceeds anyone\'s capacity',
            ],
            c: 1,
            e: 'Compound tilt requires a sequence, not a single trick: calm the body so thinking is possible, apply the specific rehearsed reframes each trigger needs, then make a truthful assessment of remaining capacity. Elite mental game is knowing that quitting well is itself an advanced skill, and so is continuing well.',
            d: 5,
            m: { tiltLevel: 'High', emotionalState: 'Overloaded', triggerType: 'Compound Stressors' },
        },
        {
            q: 'How do A-game, B-game, and C-game function in a serious improvement plan?',
            s: 'A player maps his range of play quality from inspired to disastrous.',
            o: [
                'Only A-game matters; the plan is maximizing brilliance',
                'Improvement moves the whole range: raising the floor by eliminating C-game errors usually adds more EV than polishing the ceiling, because your worst poker occurs in your biggest emotional pots',
                'B-game should be ignored as an average artifact',
                'C-game cannot change; it is your fixed baseline',
            ],
            c: 1,
            e: 'Tendler\'s range model observes that money flows disproportionately through your worst moments, since tilt and big pots correlate. Systematically deleting your most common C-game errors, the back end of your range, is the highest-leverage work in the entire mental game.',
            d: 4,
        },
        {
            q: 'What does a complete personal tilt profile contain, and why must it be written?',
            s: 'A coach assigns a formal document rather than a mental note.',
            o: [
                'A list of hated opponents; memory suffices for the rest',
                'Specific triggers, earliest physical and mental signs, escalation stages, historical costs, and matched interventions per stage; written because a tilted mind cannot generate this material at the moment it is needed',
                'Only a maximum-loss number for stop-losses',
                'Aspirational statements about staying calm',
            ],
            c: 1,
            e: 'The document is an emergency manual authored by your rational self for use by your compromised self, and the compromised self cannot write it on demand. Mapping stages to interventions converts vague self-knowledge into an executable protocol that works when working memory is flooded.',
            d: 5,
        },
        {
            q: 'A world-class player still feels a flash of anger at a brutal beat, then plays the next hand perfectly. What does this reveal about the end-state of mental game mastery?',
            s: 'A student expected masters to feel nothing at all.',
            o: [
                'The player is secretly not world-class',
                'Mastery is response, not absence: the initial emotional flash is human and largely involuntary, and the skill is the microseconds-to-seconds recovery that prevents the flash from touching a single decision',
                'True masters have surgically removed all emotion',
                'The flash proves emotions are strategically useful and should be amplified',
            ],
            c: 1,
            e: 'The goal of mental-game training is not emotional deletion, which is impossible, but a recovery gap so short that emotion never reaches the controls. Measuring progress by shrinking recovery time, rather than by absence of feeling, sets a standard humans can actually attain.',
            d: 4,
        },
        {
            q: 'How should mental game and technical study be integrated rather than treated as separate subjects?',
            s: 'A player keeps psychology in one notebook and strategy in another, and neither improves the other.',
            o: [
                'They are unrelated domains and should stay separate',
                'Each feeds the other: unresolved technical doubt creates fear and tilt in those spots, while emotional data (which spots spike anxiety) is a map of technical gaps; the review process should trace every mental-game incident to any strategic uncertainty underneath',
                'Mental game replaces technical study after a certain level',
                'Technical mastery automatically produces emotional mastery',
            ],
            c: 1,
            e: 'Much of what presents as tilt is actually unresolved strategic confusion, anger and anxiety flourish where you secretly do not know what is correct. Auditing emotional flashpoints for hidden technical gaps, and vice versa, makes each notebook a diagnostic tool for the other.',
            d: 5,
        },
        {
            q: 'What is the master-level understanding of the relationship between self-worth and poker results?',
            s: 'After fifteen years, a professional describes how he survived the swings intact.',
            o: [
                'Winning enough eventually secures self-worth permanently',
                'Full decoupling: identity rests on values, conduct, and craft (decision quality, discipline, honesty in review), while results are treated as weather over which only long-run influence exists; this is what makes both downswings and heaters survivable',
                'Caring less about poker overall is the only path',
                'Self-worth should track the yearly graph, just not the daily one',
            ],
            c: 1,
            e: 'Any coupling of worth to results, at any timescale, hands your psychological stability to variance. Careers survive on identities anchored in controllables, the quality of decisions and the integrity of the work, which no river card can confiscate.',
            d: 5,
        },
        {
            q: 'Design question: what does a complete daily mental-game practice look like for a full-time player?',
            s: 'A newly professional player asks for the full structure, not fragments.',
            o: [
                'Play whenever motivated and address problems as they explode',
                'A closed loop: pre-session warm-up with strategic and emotional priming, in-session monitoring with anchored reset routines and written protocols, post-session cool-down logging emotional and technical data, and periodic review that feeds patterns back into the warm-up',
                'One long meditation each morning covers everything',
                'Weekly reflection is sufficient; daily structure causes burnout',
            ],
            c: 1,
            e: 'The professional structure is a feedback loop where each phase supplies the next: warm-ups prime what reviews revealed, in-session tools capture live data, and cool-downs process residue before it accumulates. Fragmented practices leak at the joints; the loop is what makes improvement compound.',
            d: 5,
        },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // cash-020: TABLE SELECTION — Finding soft spots
    // ═══════════════════════════════════════════════════════════════════════
    'cash-020': [
        {
            q: 'What is the single most important factor when choosing between available cash games?',
            s: 'Three tables run at your stake: one full of regulars, one mixed, one with several loose recreational players.',
            o: [
                'The table with the best seat aesthetics and atmosphere',
                'The presence of weaker players: your win rate is primarily a function of opponent mistakes, and choosing softer opposition is often worth more than years of marginal study',
                'The table where you have the best history of running hot',
                'The table with the most professional players to learn from',
            ],
            c: 1,
            e: 'Edge comes from the skill gap, and table selection is the only decision that sets the gap directly. A modest player in a great game outearns a great player in a tough one; selection is the highest-ROI skill most players systematically neglect.',
            d: 1,
        },
        {
            q: 'Which observable signs most reliably indicate a soft live cash game?',
            s: 'You are scanning tables from the rail before requesting a seat.',
            o: [
                'Quiet players with neat, full stacks and headphones',
                'Multiway limped pots, drinks on the table, laughter, short or deep sloppy stacks, players showing cards casually, and calls of raises with obvious junk at showdown',
                'Fast, silent, efficient dealing with no conversation',
                'A long waiting list, which always means softness',
            ],
            c: 1,
            e: 'Recreational games advertise themselves: loose passive preflop play, social atmosphere, and showdown junk are direct evidence of the mistakes that fund your win rate. Silent efficient tables full of postured regulars are the opposite signal, a rake battle among sharks.',
            d: 2,
        },
        {
            q: 'Seat selection: the table\'s wild aggressive player is seated, and one seat opens. Where do you want him relative to you?',
            s: 'A maniac is raising every other hand, and you may choose the open seat to his left or his right.',
            o: [
                'On your left, so he raises after you act',
                'On your right (you to his left): acting after him lets you isolate his junk raises, control pot sizes with position, and make informed decisions with his action already known',
                'It makes no difference where aggression sits',
                'Directly across the table for the best view of his face',
            ],
            c: 1,
            e: 'Money flows clockwise from loose aggression, and position over the maniac converts his volatility into your equity: you see his action first and hold positional control in the biggest pots. With him on your left, every pot you enter risks a squeeze behind you, taxing your whole range.',
            d: 2,
        },
        {
            q: 'What psychological barrier most commonly stops players from leaving a table that has become tough?',
            s: 'The two whales busted an hour ago, five regulars remain, and a player stays "because I am stuck 400 here."',
            o: [
                'Fear of offending the dealer by leaving',
                'Sunk cost plus the felt need to win it back at the same table: the 400 is gone regardless of where he sits, and only future EV, which is now negative here, should drive the stay-or-go decision',
                'Uncertainty about whether other games exist',
                'Loyalty programs that reward continuous play',
            ],
            c: 1,
            e: 'Losses feel attached to the table where they happened, creating the illusion that this specific game owes repayment. EV lives only in the future: a table of regulars is now a worse investment than the lobby, and leaving stuck is a skill that separates professionals from patrons.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Stuck', triggerType: 'Sunk Cost' },
        },
        {
            q: 'How should game selection discipline change during a downswing?',
            s: 'A player mid-downswing feels drawn to tougher games "to prove he can still beat real players."',
            o: [
                'Seek the toughest lineups; proving ability restores confidence',
                'Tighten selection standards further: during emotional vulnerability you need the largest margin for error available, and the desire to prove something is ego demanding a payment your bankroll makes',
                'Abandon selection entirely; games are all the same in a downswing',
                'Play only heads-up against the best regular you can find',
            ],
            c: 1,
            e: 'A downswing already taxes decision quality, so the rational move increases edge cushion rather than shrinking it. The "prove myself" pull is entitlement and ego, not strategy; validation belongs in review data, while the seat belongs in the softest game running.',
            d: 3,
            m: { tiltLevel: 'Medium', emotionalState: 'Defiant', triggerType: 'Downswing' },
        },
        {
            q: 'In an online lobby, which statistics best identify soft tables at a glance?',
            s: 'The client displays players-per-flop percentage, average pot size, and hands per hour for each table.',
            o: [
                'Low players-per-flop and small average pots',
                'High players-per-flop percentage combined with large average pots: many players seeing flops means loose preflop calling, and inflated pots mean the money goes in badly after',
                'The fastest hands-per-hour tables',
                'Tables where the biggest stack is exactly 100 big blinds',
            ],
            c: 1,
            e: 'Players-per-flop is a direct census of preflop looseness, the foundational recreational error, and big average pots confirm the looseness continues postflop. Tight, fast tables with small pots are regular-dominated; the lobby numbers are a free soft-game detector most players never read.',
            d: 2,
        },
        {
            q: 'A player refuses to change tables because he "finally has reads on everyone here," though a visibly softer game just opened. What is the correct analysis?',
            s: 'His current table is break-even regulars he knows well; the new table has three splashy unknowns.',
            o: [
                'Stay; reads are the most valuable asset in poker',
                'Move: reads on break-even regulars are precise knowledge of a barren field, while the soft game offers a structural edge that dwarfs read value, and new reads accumulate within an orbit or two anyway',
                'Stay, because switching tables resets rake considerations',
                'Split time equally between both tables out of fairness',
            ],
            c: 1,
            e: 'Information has value only in proportion to the EV it unlocks, and perfect reads on players who make few mistakes unlock little. The structural edge of weak opposition is the prize; comfort with the familiar table is the endowment effect wearing a strategy costume.',
            d: 4,
        },
        {
            q: 'What is the professional\'s attitude toward waiting lists and game-starting effort?',
            s: 'The best game in the room has a 45-minute list, while a mediocre seat is open now.',
            o: [
                'Always take the immediate seat; playing time is everything',
                'Treat selection effort as paid work: joining the list, monitoring the room, helping start good games, and even waiting beats grinding hours in a marginal lineup, because hourly EV is set before the first card',
                'Waiting lists are for players without confidence',
                'Never wait more than five minutes for anything',
            ],
            c: 1,
            e: 'The hourly rate difference between a great game and a marginal one routinely exceeds anything achievable through in-game skill alone. Professionals treat the lobby and the floor as part of the job: time invested in acquiring the right seat is often the best-paid time of the session.',
            d: 3,
        },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
// GENERAL POOL — fallback for unknown SCENARIO gameIds
// ═══════════════════════════════════════════════════════════════════════════
const GENERAL_POOL_KEYS = ['psy-001', 'psy-007', 'psy-014', 'psy-016'];

function buildGeneralPool() {
    const pool = [];
    for (const key of GENERAL_POOL_KEYS) {
        for (const raw of BANK[key]) pool.push(raw);
    }
    return pool;
}
const GENERAL_POOL = buildGeneralPool();

// ═══════════════════════════════════════════════════════════════════════════
// SELECTION + FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/** Map a training level (1-12) to an inclusive difficulty band. */
function difficultyBandForLevel(level) {
    const lvl = Math.min(12, Math.max(1, parseInt(level, 10) || 1));
    if (lvl <= 4) return [1, 2];
    if (lvl <= 8) return [2, 4];
    return [3, 5];
}

/** Format one raw bank entry into the standard training question contract. */
function formatQuestion(raw, idx, gameId, level) {
    const correctId = OPTION_IDS[raw.c];
    const gtoFrequencies = {};
    OPTION_IDS.forEach((id) => { gtoFrequencies[id] = id === correctId ? 100 : 0; });

    const question = {
        id: `psych_${gameId}_${idx}`,
        gameId,
        level,
        question: raw.q,
        scenario: {
            isPsychology: true,
            description: raw.s,
        },
        options: raw.o.map((text, i) => ({ id: OPTION_IDS[i], text })),
        correctAnswer: correctId,
        explanation: raw.e,
        gtoFrequencies,
        difficulty: raw.d,
        source: 'PSYCHOLOGY_BANK',
    };
    if (raw.m) question.metadata = raw.m;
    return question;
}

/**
 * Deterministically select psychology/scenario questions for a game.
 *
 * @param {string} gameId  - e.g. 'psy-001' or 'cash-020'
 * @param {number} level   - training level 1-12 (scales difficulty band)
 * @param {number} count   - how many questions to return
 * @param {string[]|Set<string>} seenIds - question ids to avoid when possible
 * @returns {Object[]} formatted questions (cycles through the bank when exhausted)
 */
export function getPsychologyQuestions(gameId, level, count = 10, seenIds = []) {
    const bucket = BANK[gameId] || GENERAL_POOL;
    if (!bucket || bucket.length === 0) return [];

    const requested = Math.max(1, parseInt(count, 10) || 1);
    const [minDiff, maxDiff] = difficultyBandForLevel(level);
    const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);

    // Index entries so ids stay stable regardless of filtering order
    const indexed = bucket.map((raw, idx) => ({ raw, idx }));

    // Prefer entries inside the level's difficulty band; widen if too few
    let eligible = indexed.filter((e) => e.raw.d >= minDiff && e.raw.d <= maxDiff);
    if (eligible.length < Math.min(requested, indexed.length)) eligible = indexed;

    // Deterministic rotation so different levels lead with different questions
    const lvl = Math.min(12, Math.max(1, parseInt(level, 10) || 1));
    const start = (lvl * 7) % eligible.length;
    const rotated = eligible.slice(start).concat(eligible.slice(0, start));

    // Unseen first, then seen (cycling), duplicates only when truly exhausted.
    // If the difficulty band leaves too few unseen questions, widen to unseen
    // questions from the whole bucket before repeating anything already seen.
    const qid = (e) => `psych_${gameId}_${e.idx}`;
    const unseen = rotated.filter((e) => !seen.has(qid(e)));
    if (unseen.length < requested) {
        const included = new Set(unseen.map((e) => e.idx));
        for (const e of indexed) {
            if (!included.has(e.idx) && !seen.has(qid(e))) {
                unseen.push(e);
                included.add(e.idx);
            }
        }
    }
    const unseenIdx = new Set(unseen.map((e) => e.idx));
    const seenAgain = rotated.filter((e) => !unseenIdx.has(e.idx));
    const ordered = unseen.concat(seenAgain);

    const results = [];
    for (let i = 0; i < requested; i++) {
        const entry = ordered[i % ordered.length];
        results.push(formatQuestion(entry.raw, entry.idx, gameId, lvl));
    }
    return results;
}

/** List of gameIds with a dedicated bucket (useful for tests/tooling). */
export function getPsychologyGameIds() {
    return Object.keys(BANK);
}

export default { getPsychologyQuestions, getPsychologyGameIds };
