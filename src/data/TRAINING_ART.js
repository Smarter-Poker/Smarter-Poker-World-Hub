/**
 * Individual game-cover art for the complete Training Games catalogue.
 * Shared #SMARTERDESIGN materials, with distinct scenes and compositions.
 * Playing-card faces are exact Club Arena assets layered by TrainingGameArt.
 */
const concepts = [
  ["mtt-001","A low circular chrome training stage with cobalt chip stacks at both edges and a large silver targeting disc in the lower foreground",["As","Ks"],"center"],
  ["mtt-002","ICM Fundamentals: chip quantity and tournament prize value balanced on a polished mechanical scale, a tall cobalt stack on the nearer pan and three differently sized silver prize ingots on the far pan",[],"none"],
  ["mtt-003","A large clear glass pressure dome on a blue-lit circular chrome base, empty inside, flanked by black and cobalt chip stacks",["Ks","Qh"],"center"],
  ["mtt-004","Final Table ICM: an escalating payout staircase physically integrated into the arc of a final poker table, with the remaining seats represented by a few unequal chip stacks",[],"none"],
  ["mtt-005","PKO Bounty Hunter: a large silver bounty medallion being split into two halves over a black poker felt, one half feeding the pot and the other attaching to a growing bounty stack",[],"none"],
  ["mtt-006","Satellite Survival: one last empty cobalt tournament seat beyond a narrow admission gate, with equal silver entry tokens already allocated to the neighboring chairs",[],"none"],
  ["mtt-007","Deep Stack MTT: two immense columns of cobalt poker chips seen from table level, dwarfing a fresh compact opening pot between them",[],"none"],
  ["mtt-008","Short Stack Ninja: a tiny disciplined group of twelve cobalt chips threading a narrow opening between two much larger black chip formations",[],"none"],
  ["mtt-009","Resteal Wars: an initial line of small black chips is intercepted by a forceful opposing stream of cobalt chips across a live poker betting line",[],"none"],
  ["mtt-010","Squeeze Master: three player contributions compressed into one contested pot by a large raised cobalt chip stack entering from the rear",[],"none"],
  ["mtt-011","Ante Theft: a small ring of unattended ante chips being swept from the center of a tournament table by a swift silver chip rake",[],"none"],
  ["mtt-012","Big Stack Bully: an overwhelming wall of cobalt poker chips advancing into the territory of three visibly shorter black stacks",[],"none"],
  ["mtt-013","Ladder Jump: a solitary silver poker chip pauses before a steep series of payout steps while two competing stacks below fall away into shadow",[],"none"],
  ["mtt-014","3-Max Blitz: a compact triangular poker table with exactly three energized player positions and chips racing toward the center",[],"none"],
  ["mtt-015","Heads Up Duel: the final two tournament seats face each other across a narrow black poker table with unequal cobalt chip stacks and a distant silver winner's cup",["Ah","Ks"],"left"],
  ["mtt-016","Chip & Chair: one lone cobalt chip on the felt in front of a single empty black tournament chair, with a distant mountain of rival chips softly out of focus",[],"none"],
  ["mtt-017","Blind Defense MTT: a short cobalt big-blind stack protected at the curved table rail as a larger incoming wager crosses the betting line",["Ad","Jh"],"right"],
  ["mtt-018","Button Warfare: a large chrome dealer button on black felt with several curved betting paths radiating toward adjacent stacks",[],"none"],
  ["mtt-019","Stop & Go: a short chip stack held behind a raised metal betting gate, while the next section of table opens into a clear shove lane",[],"none"],
  ["mtt-020","Multi-way Bounty: three separate silver bounty medallions and three unequal chip commitments converge into one contested tournament pot",[],"none"],
  ["mtt-021","Check-Shove Power: a low quiet checking position transforms into a powerful forward surge of cobalt chips over the betting line",[],"none"],
  ["mtt-022","Clock Management: a precision chrome tournament timebank with a large analog sweep hand, beside a finite ordered row of small timebank chips",[],"none"],
  ["mtt-023","Registration Edge: a tournament entry ticket arriving through a chrome slot just before a mechanical gate closes, with shorter and taller starting stacks beyond",[],"none"],
  ["mtt-024","Triple Barrel: three successive waves of cobalt betting chips grow in size across three connected sections of a poker table",[],"none"],
  ["tournament-prep","Tournament Prep: a real working poker strategy desk with a carefully organized chip tray, chrome stopwatch, open blank notebook and a translucent blue tournament structure model",[],"none"],
  ["final-table-sim","Final Table Sim: a complete final poker table rendered as a precise cutaway model, with remaining seat stacks and silver equity ribbons of unequal height rising from each position",[],"none"],
  ["mtt-025","MTT Champion: a victorious tournament trophy on the final poker table under a dramatic arena spotlight, with the winning stack gathered around its base",[],"none"],
  ["cash-001","An open dark drafting folio containing a large tactile six-max opening-range plan: six distinct seat sectors, stepped clusters of cobalt and silver square tiles, and a chrome drafting compass resting across one corner. The tiles are blank, showing varying range breadth without pretending to be a readable chart.",[],"none"],
  ["cash-002","A close poker-table decision scene in which a modest continuation bet has just slid away from a larger existing pot. Two unlettered chrome sizing dividers compare the bet footprint with the pot footprint, making the sizing relationship the subject.",["As","7h","2c"],"left"],
  ["cash-003","An incoming stream of cobalt chips reaches a defensive decision wall made of three broad hinged chrome shutters. One shutter absorbs the pressure, one opens a narrow continuation route, and one redirects the flow. It is a visual metaphor for choosing a response to aggression, not a cage around a chip stack.",[],"none"],
  ["cash-004","An extreme close-up of one extra matching cobalt chip being slid into the edge of a modest pot by a black-sleeved human hand. That small final chip, almost touching the larger collection, communicates extracting one more call.",[],"none"],
  ["cash-005","A tense cinematic hero-call moment: a calm adult poker player's eyes watch an oversized opposing wager across the felt while their fingers hold one calling chip at the edge of the betting line. Render the face in cool silver monochrome and the clothing in black.",[],"none"],
  ["cash-006","A real poker table seen down its long rail, contrasting an early-position seat half-hidden behind the curve with a clearly lit button seat that can see the whole action. A plain chrome dealer disc rests beside the far active seat.",[],"none"],
  ["cash-007","A substantial contested pot tightly squeezed between two shorter remaining chip reserves. Three broad action tracks feed the pot, but the available space behind each player's wager is visibly reduced, suggesting the lower room for maneuver after a preflop three-bet.",[],"none"],
  ["cash-008","Two opposing lines of escalating poker wagers rush toward one another: four chunky successive tiers of chips on each side, frozen at the moment the largest wagers meet. The scene should feel like a costly preflop confrontation, not a trophy.",[],"none"],
  ["cash-009","A deep-stacked cash player's workspace viewed from high over the player's right shoulder. Two clear rectangular chip racks hold substantial, irregular reserves; a black-sleeved hand peels a small wager from the nearest column while several widely separated future wager piles remain available farther across the felt. The abundant reserve and room for later decisions communicate 200BB-plus play.",[],"none"],
  ["cash-010","A sleek little gunmetal rat character rapidly slipping along a poker-table rail with a compact bundle of cobalt chips, while enormous out-of-focus opponent reserves loom behind. The compact take and quick exit express a short-stack hit-and-run strategy.",[],"none"],
  ["cash-011","An unexpected lead bet arrives from the near blind seat before the far aggressor can act. The leading chips cross the usual flow of action at a sharp angle, while a defender's larger reserve and real hole cards wait beyond the crossing.",["Ah","Qs"],"right"],
  ["cash-012","The final-street decision on a poker table: a completed five-card board divides a large opposing river bet from a small call chip poised at the near rail. The human hand has paused, conveying a consequential final choice.",["As","Kd","Jh","8c","3s"],"center"],
  ["cash-013","A neglected pot beyond an opponent's withdrawn hand, with a new line of cobalt betting chips confidently entering the open space. The withdrawal and the entering bet tell the checked-through-then-probe story without a literal scientific probe.",[],"none"],
  ["cash-014","A restrained first bet path makes a sharp return and rises into a much larger counter-wager. The visual is a sculptural poker-action U-turn: a small line of chips passes a recessed quiet zone and is met by a forceful returning wave.",[],"none"],
  ["cash-015","A wager dramatically larger than the existing pot, shown through extreme scale contrast. A dense rectangular wall of cobalt chips advances toward a small loose cluster of black-and-silver pot chips.",[],"none"],
  ["cash-016","Four players' distinct betting motions meet in one contested poker pot. Black sleeves and cool monochrome hands approach from four edges; each player contributes a different-sized chip group.",[],"none"],
  ["cash-017","A poker-table rake slot siphons one small chip away from a larger pot. A clear cutaway reveals that chip dropping into a separate collection tray beneath the felt, making the otherwise easy-to-ignore cost physically visible.",[],"none"],
  ["cash-018","Two adjacent blind seats clash across the tight elbow of a poker table. Their nearby chip reserves and opposing small wagers occupy the same corner while the rest of the table falls out of focus.",[],"none"],
  ["cash-019","A row of three forced bets expands along the opening edge of a cash table, with the added third straddle conspicuously larger and farther forward. A plain chrome marker beside the third post emphasizes the additional pressure.",[],"none"],
  ["cash-020","A compact overhead casino-floor study of three large cash-table sections: one crowded with imposing reserves, one nearly empty, and one with a clear inviting seat beside modest uneven stacks. A focused cobalt light picks out the strategically attractive seat.",[],"none"],
  ["cash-021","A physical randomizer sorts identical poker chips into two action channels in an uneven but controlled mixture. Broad chrome baffles and dark branching paths make the distribution visible without numbers or a fabricated chart.",[],"none"],
  ["cash-022","A tactile split poker-analysis surface: one side smooth, dry and sparsely patterned, the other interconnected by dense cobalt channels. The contrasting surfaces express how connectedness changes board texture. There are absolutely no playing cards or card-shaped objects in this generated scene.",["Ks","Qs","7h"],"center"],
  ["cash-023","A firm betting barrier closes the routes that drawing hands could otherwise take to a protected pot. Thin cobalt paths approach from the left and terminate at a broad angular chrome shutter driven into place by a compact wager.",[],"none"],
  ["cash-024","A calm human hand holds back further chips at the rim of a modest existing pot. A low transparent acrylic stop, lit silver-blue, makes the intentional limit visible without portraying the hand as weak or passive.",[],"none"],
  ["cash-025","A seasoned adult cash-game player at the end of a demanding session, calmly organizing multiple chip racks while the last active cash table glows behind. The subject is mastery and endurance across a session, not a crown floating over generic chips.",[],"none"],
  ["spins-001","The first betting decision of a three-player spin tournament seen from one seated player's perspective. A black-clothed shoulder and forearm lead into a hand advancing a small opening wager; two opponents across the compact table watch beside balanced early-game chip reserves.",[],"none"],
  ["spins-002","An intimidating high-multiplier prize looms above a tight three-player decision: a huge wall of cobalt prize chips rises behind the small active table, dwarfing the players' immediate betting resources.",[],"none"],
  ["spins-003","A deliberately modest single-chip entry from the button conceals a strong holding and a much deeper reserve in shadow. A plain chrome dealer disc lies beside the entry, while native pocket aces make the trap readable.",["As","Ah"],"left"],
  ["spins-004","The last two opponents face one another across a compact poker table, while the now-empty third seat is pushed back and falls into darkness. Two unequal remaining stacks and a tight contested pot suggest a decisive heads-up endgame.",[],"none"],
  ["spins-005","A continuous poker-chip reserve changes from deep to medium to short as it advances along three sharply stepped layers of felt. The available action lanes visibly narrow alongside the shrinking reserves, expressing the changing strategy with stack depth.",[],"none"],
  ["spins-006","A small initial limp is followed by an opposing raise, then an exact matching return that keeps the hand alive. Three distinct chip movements trace a broad hooked path across the felt, communicating the limp-call line without any playing cards.",[],"none"],
  ["spins-007","A short poker-chip stack pauses just before a risky gap while two equal silver payout ledges remain safely within reach. A few loose chips tumble into the dark gap, emphasizing survival over marginal accumulation.",[],"none"],
  ["spins-008","Successive waves of betting chips relentlessly push across a compact table, forcing a smaller opponent reserve toward the rail. The scene shows sustained repeated pressure rather than one isolated all-in.",[],"none"],
  ["spins-009","A dominant chip reserve forms a controlled defensive boundary around the player's side of a three-player table, leaving only a narrow deliberate betting lane open. Two smaller opposing reserves remain outside that boundary.",[],"none"],
  ["spins-010","A complete three-player spin tournament condensed into three bold overlapping snapshots: three active seats and balanced opening reserves, two remaining seats in a close contest, then one collected winning pot. The changing table population tells the full simulation story.",[],"none"],
  ["psy-001","A finely sculpted chrome brain suspended inside a calm concentric blue-lit gyroscope, perfectly balanced and centered",[],"none"],
  ["psy-002","Timing Discipline: a chrome metronome keeping one consistent beat beside a calm disciplined line of poker chips",[],"none"],
  ["psy-003","Cooler Cage: a single cobalt chip remains intact inside an angular protective steel cage while a wave of shattered ice crashes outside",[],"none"],
  ["psy-004","Pressure Chamber: a clear thick glass pressure vessel holds one perfectly steady cobalt poker chip while massive silver press walls close around it",[],"none"],
  ["psy-005","Patience Master: a silver hourglass slowly releases a few cobalt grains beside one carefully untouched poker chip",[],"none"],
  ["psy-006","Focus Flow: one sharp cobalt beam travels cleanly through a series of offset optical apertures while diffuse light fades harmlessly around it",[],"none"],
  ["psy-007","Result Detachment: two diverging paths leave the same careful poker decision, one carrying rising chips and one scattered losses, while a polished process compass stays steady at the fork",[],"none"],
  ["psy-008","Confidence Builder: a firm human hand in a dark sleeve places one decisive cobalt poker chip cleanly across a silver betting line",[],"none"],
  ["psy-009","Fear Eraser: a solid cobalt poker chip breaks through a thin fogged-glass barrier, opening a clean view of the table beyond",[],"none"],
  ["psy-010","Ego Killer: a polished silver crown is set aside beside an open unmarked study notebook and one humble stack of cobalt chips",[],"none"],
  ["psy-011","Session Stamina: a long ordered path of poker chips advances through alternating pools of dark and cobalt light toward a steady silver finish marker",[],"none"],
  ["psy-012","Snap Decision: a fingertip sends one silver-edged cobalt chip through a rapidly closing split-second opening",[],"none"],
  ["psy-013","Tell Blindness: a reflective dark poker visor filters a chaotic field of misleading silhouettes into one clean focused reflection of the betting chips",[],"none"],
  ["psy-014","Bankroll Mind: poker chips are methodically divided into several transparent budgeting compartments, with a separate small playable stack kept outside",[],"none"],
  ["psy-015","Winners Tilt: an exuberant leaning tower of poker chips is being steadied by a precise chrome spirit level across its top",[],"none"],
  ["psy-016","Variance Zen: smooth alternating cobalt and silver waves pass beneath a calm balanced poker chip resting on a flat stone",[],"none"],
  ["psy-017","Study Habits: a thoughtfully used poker study desk with an open blank notebook, neat chrome pen, arranged chips, and a small focused task lamp",[],"none"],
  ["psy-018","Table Image: one empty poker chair appears as three different silhouettes in angled polished mirror panels around the table",[],"none"],
  ["psy-019","Autopilot Escape: a monotonous conveyor of identical poker-chip motions is interrupted by one deliberately lifted cobalt chip taking a new route",[],"none"],
  ["psy-020","Mind Master: a serene seated poker competitor seen from behind at a dark table, with a balanced field of blue decision lights reflected in the polished rail",[],"none"],
  ["adv-001","Solver Mimicry: a physical poker-chip arrangement and its precise mirrored counterpart align across a thin sheet of blue glass",[],"none"],
  ["adv-002","Blocker Logic: a polished mechanical combination grid with several routes visibly closed by two strategically placed silver blockers",["As","Kd"],"left"],
  ["adv-003","Node Locking: a branching chrome decision tree suspended across black space, one pivotal blue node physically clamped in place while the other branches reroute around it",[],"none"],
  ["adv-004","Range Construction: an incomplete mosaic of brushed-steel and cobalt tiles being assembled into a coherent poker range on a drafting table",[],"none"],
  ["adv-005","Frequency Math: a precise mechanical distributor splits an incoming line of cobalt beads into differently sized streams of silver and blue outcomes",[],"none"],
  ["adv-006","EV Calculations: a silver balance beam compares a weighted potential reward with a smaller certain cost, connected by elegant translucent probability blocks",[],"none"],
  ["adv-007","Indifference Theory: two equal paths for a single cobalt poker chip sit in perfect balance on opposite ends of a slim chrome seesaw",[],"none"],
  ["adv-008","Range Advantage: two broad fields of cobalt and silver equity blocks overlap, one field consistently rising above the other across a textured poker workbench",[],"none"],
  ["adv-009","Nut Advantage: one rare immaculate silver pinnacle rises far above a broad field of ordinary cobalt strategy pieces",[],"none"],
  ["adv-010","Board Coverage: a flexible silver mesh conforms over several very different cobalt terrain surfaces without leaving a gap",[],"none"],
  ["adv-011","SPR Mastery: an exceptionally clear close comparison of a tall remaining chip stack against a shallow central pot, connected by a precision chrome proportional divider",[],"none"],
  ["adv-012","MDF Defender: a calibrated line of defensive cobalt blocks retains just enough coverage while a stream of silver pressure pieces approaches",[],"none"],
  ["adv-013","Combo Counting: an elegant black felt counting tray with paired silver and cobalt markers arranged in small, unambiguous combinations",["Ah","Ad"],"left"],
  ["adv-014","Bet Sizing Theory: an expanding geometric sequence of poker wagers is measured by a flexible polished chrome divider across the felt",[],"none"],
  ["adv-015","Population Reads: a mosaic of many dark poker-seat silhouettes reveals a few coherent cobalt clusters seen through a large analytical glass lens",[],"none"],
  ["adv-016","Exploit Ladder: a precise cobalt route deviates from a regular chrome strategy lattice to climb through a series of exposed weaknesses",[],"none"],
  ["quiz-gauntlet","Quiz Gauntlet: a rapid series of chrome decision gates extends across a dark poker-training track, one cobalt chip racing through the correct openings",[],"none"],
  ["adv-017","Capped Ranges: a broad field of low rectangular cobalt range blocks and short poker-chip columns is constrained by a strict horizontal glass ceiling, while one much taller polished silver column rises beyond that limit.",[],"none"],
  ["adv-018","Polarity Index: a dispersed stream of poker chips separates sharply into two strong poles while the middle becomes empty",[],"none"],
  ["adv-019","Solver Scripts: layers of transparent blue simulation plates reveal a hidden decision structure when aligned under a chrome reading arm",[],"none"],
  ["hand-lab","Hand Lab V2: a poker-analysis light table with a precise clear glass equity prism and several adjustable chrome sliders",["As","Kh"],"left"],
  ["bluff-catcher","Bluff Catcher: a large investigative chrome lens reveals the hollow interior of an imposing wager-chip stack",["Ks","Qh"],"left"],
  ["mixed-strategy-lab","Mixed Strategy Lab: two transparent blue mixing channels weave around a chrome probability wheel and emerge as a deliberately varied sequence of poker chips",[],"none"],
  ["study-group","Study Group: several different hands in dark sleeves gather around a shared black poker study table, each arranging a different part of the same chip exercise",[],"none"],
  ["adv-020","GTO Apex: a complex black-and-chrome strategy landscape converges into one precise silver summit under a narrow cobalt light",[],"none"],
];

export const TRAINING_ART_VERSION = 'approved-chrome-v2';
export const ARENA_CARD_ROOT = '/hub/club-arena/cards/2color';
const RANK_ORDER = '23456789TJQKA';
const SUIT_FILES = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const RANK_FILES = { T: '10', J: 'j', Q: 'q', K: 'k', A: 'a' };
// Per-scene placements keep native faces clear of the meaningful wager,
// sizing divider and hand gestures identified during visual review.
const CARD_LAYOUT_OVERRIDES = {
  'cash-002': { bottom: 7, width: 52, height: 45 },
  'cash-011': { bottom: 5 },
  'cash-012': { bottom: 35 },
  'spins-003': { left: 22, bottom: 4, width: 32, height: 43 },
};

// Only illustrative hand groups are sorted. This never reorders a live board.
export const sortTrainingArtCards = (cards = []) => [...cards].sort(
  (a, b) => RANK_ORDER.indexOf(b[0]) - RANK_ORDER.indexOf(a[0]),
);

export const getTrainingArenaCardSrc = (card, extension = 'webp') => {
  if (!/^[2-9TJQKA][cdhs]$/.test(card || '')) return null;
  if (extension !== 'webp' && extension !== 'png') return null;
  return `${ARENA_CARD_ROOT}/${SUIT_FILES[card[1]]}_${RANK_FILES[card[0]] || card[0]}.${extension}`;
};

export const TRAINING_ART = Object.freeze(Object.fromEntries(concepts.map(
  ([id, subject, cards, placement]) => [id, Object.freeze({
    id,
    subject,
    cards: Object.freeze(sortTrainingArtCards(cards)),
    placement,
    overlay: Object.freeze(CARD_LAYOUT_OVERRIDES[id] || {}),
    alt: subject,
  })],
)));

export const getTrainingArt = (gameId) => TRAINING_ART[gameId] || TRAINING_ART['quiz-gauntlet'];

export const getTrainingArtCardLayout = ({ cards = [], placement = 'none', overlay = {} } = {}) => {
  const isBoard = cards.length > 2;
  const sideCenter = isBoard ? 31 : 26;
  return {
    left: placement === 'left' ? sideCenter : placement === 'right' ? 100 - sideCenter : 50,
    bottom: placement === 'center' ? 20 : 17,
    width: isBoard ? cards.length === 5 ? 82 : 56 : placement === 'center' ? 43 : 36,
    height: isBoard ? 52 : placement === 'center' ? 62 : 58,
    ...overlay,
  };
};
