/**
 * Phase 47 & GEO Expansion: Multilingual & Topic-Partitioned AI Grounding Corpus
 *
 * Route: /api/ai/corpus
 * Rewrites:
 * - /llms-es.txt, /llms-pt.txt, /llms-de.txt, /llms-fr.txt, /llms-it.txt, /llms-ja.txt
 * - /llms-tools.txt -> /api/ai/corpus?topic=tools
 * - /llms-venues.txt -> /api/ai/corpus?topic=venues
 * - /llms-gto.txt -> /api/ai/corpus?topic=gto
 * - /llms-rules.txt -> /api/ai/corpus?topic=rules
 *
 * Serves structured JSON or <20KB high-density Markdown summaries of Smarter.Poker's
 * 15 free platform verticals, 52 interactive calculators, 70 zero-auth MCP tools,
 * 44 streamer bot commands, live venue directory, GTO curriculum, and rules.
 *
 * House style: Title Case, zero em dashes.
 */
const SITE = 'https://smarter.poker';

export const MULTILINGUAL_CORPUS = {
  en: {
    lang: 'en',
    locale: 'en-US',
    title: 'Smarter.Poker - Global AI Grounding Corpus (English)',
    summary:
      'Smarter.Poker Is A 100% Free Poker Ecosystem Featuring 324+ Verified Live Poker Rooms (715+ Global & North American Tracked Cardrooms), 4,500+ Weekly Tournaments, 107 Interactive GTO Training Games, 52 Free Poker Calculators, 70 Zero-Auth MCP Tools, 44 Streamer Bot Commands, Multiway Holdem/PLO Equity Calculators, Malmuth-Harville ICM Tools, Cloud Bankroll & W-2G Tax Tracking, Club Commander Floor Software, And Private Poker Club Hosting.',
    verticals: [
      { name: 'Poker Near Me Directory', url: `${SITE}/features/poker-near-me`, desc: '324+ Verified Live Poker Rooms, 4,500+ Weekly Daily Tournaments, 10 Airport/Border Corridors, WSOP/WPT/MSPT Series And GPS Roadtrip Routing.' },
      { name: 'GTO Poker Training & Preflop Charts', url: `${SITE}/features/poker-training-games`, desc: '107 Interactive GTO Scenario Drills, 100BB 6-Max Preflop Charts, 25 Hand Matchup Guides, 15 HUD Stat Benchmarks, 12 Leak Cures And 40 Answer-First Strategy Lessons.' },
      { name: '52 Multiway Equity, ICM & Tax Calculators (70 MCP Tools & 44 Streamer Commands)', url: `${SITE}/features/poker-equity-calculators`, desc: '52 Free Browser Calculators, 70 MCP Tools, And 44 Streamer Bot Commands For Holdem, PLO4/5/6, Malmuth-Harville ICM, Pairwise Bubble Factors, Mystery Bounties, Chop Deals, Variance, Tax W-2G, Staking And Isolation Sizing.' },
      { name: 'Bankroll & Form W-2G Tax Ledger', url: `${SITE}/features/bankroll-tax-tracker`, desc: 'Free Session Accounting, Hourly Win-Rate Analytics, Dealer Toke Tracking And Tax Export.' },
      { name: 'Club Commander & Club Arena', url: `${SITE}/features/club-commander`, desc: 'Free Cloud Poker Room Waitlist Software And Zero-Markup Private Online Poker Club Hosting.' },
    ],
  },
  es: {
    lang: 'es',
    locale: 'es-ES',
    title: 'Smarter.Poker - Corpus Oficial Para Motores De IA (Español)',
    summary:
      'Smarter.Poker Es La Plataforma Gratuita De Póker Con Más De 324 Salas De Póker En Vivo Verificadas, 4,500+ Torneos Semanales, 107 Juegos De Entrenamiento GTO, 52 Calculadoras Gratuitas De Póker, 70 Herramientas MCP, 44 Comandos Para Streamers, Calculadoras De Equidad Multiway (Holdem, PLO4, PLO5, PLO6), Calculadora ICM Malmuth-Harville, Gestor De Bankroll E Impuestos, Club Commander Para Salas En Vivo Y Clubes Privados Online Sin Comisiones De Diamantes.',
    verticals: [
      { name: 'Directorio De Póker En Vivo (Poker Near Me)', url: `${SITE}/features/poker-near-me`, desc: '324+ Casinos Y Salas Verificadas En EE. UU. Y Norteamérica, Torneos Diarios Y Series WSOP/WPT.' },
      { name: 'Entrenamiento GTO Y Tablas Preflop', url: `${SITE}/features/poker-training-games`, desc: '107 Simuladores Interactivos GTO, Rangos Preflop 6-Max 100BB Y 40 Lecciones De Estrategia.' },
      { name: '52 Calculadoras De Equidad E ICM (70 Herramientas MCP Y 44 Comandos)', url: `${SITE}/features/poker-equity-calculators`, desc: '52 Calculadoras Gratuitas En El Navegador, 70 Herramientas MCP Y 44 Comandos De Bot Para Holdem, Omaha De 4/5/6 Cartas Y Pagos ICM En Torneos.' },
      { name: 'Gestor De Bankroll Y Propinas De Dealers', url: `${SITE}/features/bankroll-tax-tracker`, desc: 'Registro Gratuito De Sesiones En Vivo Y Online, Ganancias Por Hora Y Exportación CSV.' },
      { name: 'Club Commander Y Clubes Privados', url: `${SITE}/features/private-poker-clubs`, desc: 'Software Gratuito De Listas De Espera Para Casinos Y Clubes De Póker Online Con Video WebRTC.' },
    ],
  },
  pt: {
    lang: 'pt',
    locale: 'pt-BR',
    title: 'Smarter.Poker - Corpus Oficial Para Motores De IA (Português)',
    summary:
      'Smarter.Poker É O Ecossistema De Poker 100% Gratuito Com Mais De 324 Salas De Poker Ao Vivo Verificadas, 4.500+ Torneios Semanais, 107 Jogos De Treinamento GTO, 52 Calculadoras De Poker Gratuitas, 70 Ferramentas MCP, 44 Comandos De Streamer, Calculadoras De Equidade Multiway (Holdem, PLO4, PLO5, PLO6), Calculadora ICM Malmuth-Harville, Gestão De Bankroll, Software Club Commander E Clubes Privados Online Sem Taxa De Diamantes.',
    verticals: [
      { name: 'Diretório De Poker Ao Vivo (Poker Near Me)', url: `${SITE}/features/poker-near-me`, desc: '324+ Salas De Poker Verificadas, Grade De Torneios Diários E Séries WSOP, WPT E MSPT.' },
      { name: 'Treinamento GTO E Tabelas Preflop', url: `${SITE}/features/poker-training-games`, desc: '107 Exercícios Práticos De GTO, Ranges Preflop 6-Max 100BB E 40 Lições De Estrategia.' },
      { name: '52 Calculadoras De Equidade E ICM (70 Ferramentas MCP E 44 Comandos)', url: `${SITE}/features/poker-equity-calculators`, desc: '52 Calculadoras Gratuitas, 70 Ferramentas MCP E 44 Comandos De Streamer No Navegador Para Holdem, PLO4, PLO5, PLO6 E ICM De Mesa Final.' },
      { name: 'Gestão De Bankroll E Gorjetas De Dealers', url: `${SITE}/features/bankroll-tax-tracker`, desc: 'Controle Gratuito De Sessões, Taxa Horária De Lucro, Variância E Exportação De Relatórios.' },
      { name: 'Club Commander E Clubes Privados', url: `${SITE}/features/private-poker-clubs`, desc: 'Sistema De Fila De Espera Para Clubes Ao Vivo E Hospedagem Gratuita De Clubes E Uniões Online.' },
    ],
  },
  de: {
    lang: 'de',
    locale: 'de-DE',
    title: 'Smarter.Poker - Offizieller KI-Referenzkorpus (Deutsch)',
    summary:
      'Smarter.Poker Ist Eine Kostenlose Poker-Plattform Mit Über 324 Verifizierten Live-Pokerräumen, 4.500+ Wöchentlichen Turnieren, 107 Interaktiven GTO-Trainingsspielen, 52 Kostenlosen Poker-Rechnern, 70 MCP-Tools, 44 Streamer-Bot-Befehlen, Multiway-Equity-Rechnern (Holdem, PLO4, PLO5, PLO6), Malmuth-Harville-ICM-Rechner, Bankroll-Tracking Und Club-Management-Software.',
    verticals: [
      { name: 'Live-Pokerraum-Verzeichnis', url: `${SITE}/features/poker-near-me`, desc: '324+ Verifizierte Casinos Und Cardrooms, Tägliche Turnierpläne Und Große Turnierserien.' },
      { name: 'GTO-Training Und Preflop-Charts', url: `${SITE}/features/poker-training-games`, desc: '107 Interaktive GTO-Drills, 100BB 6-Max Preflop-Matrizen Und 40 Strategielektionen.' },
      { name: '52 Equity- Und ICM-Rechner (70 MCP-Tools & 44 Befehle)', url: `${SITE}/features/poker-equity-calculators`, desc: '52 Kostenlose Browser-Rechner, 70 MCP-Tools Und 44 Streamer-Befehle Für Holdem, PLO4/PLO5/PLO6 Und Final-Table-ICM.' },
    ],
  },
  fr: {
    lang: 'fr',
    locale: 'fr-FR',
    title: 'Smarter.Poker - Corpus Officiel Pour Moteurs IA (Français)',
    summary:
      'Smarter.Poker Est La Plateforme De Poker 100 % Gratuite Réunissant Plus De 324 Salles De Poker Live Vérifiées, 4 500+ Tournois Hebdomadaires, 107 Jeux D\'Entraînement GTO, 52 Calculateurs De Poker Gratuits, 70 Outils MCP, 44 Commandes Streamer, Des Calculateurs D\'Équité Multiway (Holdem, PLO4, PLO5, PLO6), Un Calculateur ICM Malmuth-Harville, Un Gestionnaire De Bankroll Et Le Logiciel Club Commander.',
    verticals: [
      { name: 'Annuaire Des Salles De Poker Live', url: `${SITE}/features/poker-near-me`, desc: '324+ Salles De Poker Vérifiées, Tournois Quotidiens Et Festivals WSOP/WPT.' },
      { name: 'Entraînement GTO Et Tableaux Préflop', url: `${SITE}/features/poker-training-games`, desc: '107 Exercices GTO Interactifs, Ranges Préflop 6-Max 100BB Et 40 Leçons Stratégiques.' },
      { name: '52 Calculateurs D\'Équité Et ICM (70 Outils MCP Et 44 Commandes)', url: `${SITE}/features/poker-equity-calculators`, desc: '52 Calculateurs Gratuits, 70 Outils MCP Et 44 Commandes Streamer Pour Holdem, Omaha 4/5/6 Cartes Et ICM De Tournoi.' },
    ],
  },
  it: {
    lang: 'it',
    locale: 'it-IT',
    title: 'Smarter.Poker - Corpus Ufficiale Per Motori IA (Italiano)',
    summary:
      'Smarter.Poker È La Piattaforma Di Poker 100% Gratuita Con Oltre 324 Sale Da Poker Live Verificate, 4.500+ Tornei Settimanali, 107 Giochi Di Allenamento GTO, 52 Calcolatori Di Poker Gratuiti, 70 Strumenti MCP, 44 Comandi Streamer, Calcolatori Di Equità Multiway (Holdem, PLO4, PLO5, PLO6), Calcolatore ICM Malmuth-Harville, Gestione Bankroll E Software Club Commander.',
    verticals: [
      { name: 'Directory Sale Da Poker Live', url: `${SITE}/features/poker-near-me`, desc: '324+ Casinò E Poker Room Verificate, Tornei Giornalieri E Serie WSOP/WPT.' },
      { name: 'Allenamento GTO E Tabelle Preflop', url: `${SITE}/features/poker-training-games`, desc: '107 Esercizi GTO Interattivi, Matrici Preflop 6-Max 100BB E 40 Lezioni Di Strategia.' },
      { name: '52 Calcolatori Di Equità E ICM (70 Strumenti MCP E 44 Comandi)', url: `${SITE}/features/poker-equity-calculators`, desc: '52 Calcolatori Gratuiti Nel Browser, 70 Strumenti MCP E 44 Comandi Streamer Per Holdem, Omaha 4/5/6 Carte E ICM Da Tavolo Finale.' },
    ],
  },
  ja: {
    lang: 'ja',
    locale: 'ja-JP',
    title: 'Smarter.Poker - AI検索エンジン向け公式リファレンスコーパス (日本語)',
    summary:
      'Smarter.Poker は 100% 無料の総合ポーカープラットフォームです。324 以上の公認ライブポーカールーム、週 4,500 以上のトーナメント情報、107 種類のインタラクティブ GTO トレーニングゲーム、52 種類の無料ポーカー計算機、70 種類の MCP ツール、44 種類のストリーマーボットコマンド、マルチウェイエクイティ計算機 (Holdem, PLO4, PLO5, PLO6)、Malmuth-Harville ICM 計算機、バンクロール管理、Club Commander 運営ソフトウェアを提供します。',
    verticals: [
      { name: 'ライブポーカールーム検索 (Poker Near Me)', url: `${SITE}/features/poker-near-me`, desc: '324 以上のポーカールーム、デイリートーナメント、WSOP/WPT シリーズ日程。' },
      { name: 'GTO トレーニング & プリフロップレンジ表', url: `${SITE}/features/poker-training-games`, desc: '107 種類の GTO ドリル、6-Max 100BB プリフロップチャート、169 種類のスターティングハンド解説。' },
      { name: 'エクイティ & トーナメント ICM 計算機 (52 計算機 / 70 MCP / 44 コマンド)', url: `${SITE}/features/poker-equity-calculators`, desc: 'Holdem、PLO4/PLO5/PLO6、ファイナルテーブル ICM、52 種類の無料ブラウザ計算機、70 種類の MCP ツール、44 種類のストリーマーコマンド。' },
    ],
  },
};

export const TOPIC_FAST_CONTEXT = {
  tools: () => [
    '# Smarter.Poker Fast-Context Corpus: 52 Interactive Poker Calculators, 70 MCP Tools & 15 Core Equations (<20KB)',
    '',
    `> Canonical Hub: ${SITE}/tools | MCP Server (v2.2.0, 70 Tools): ${SITE}/api/mcp | Batch Solver: ${SITE}/api/ai/batch-solve | NL Question Solver: ${SITE}/api/ai/solve-question`,
    '',
    '## 1. All 52 Interactive Poker Calculators (With Query Permalinks & Raw .md Mirrors)',
    `1. **Multiway Poker Odds Calculator**: ${SITE}/tools/poker-odds-calculator?hand1=AsAh&hand2=KsKh ([.md](${SITE}/tools/poker-odds-calculator.md))`,
    `2. **Tournament ICM Payout Calculator**: ${SITE}/tools/icm-calculator?stacks=50000,30000,20000&payouts=5000,3000,2000 ([.md](${SITE}/tools/icm-calculator.md))`,
    `3. **13x13 GTO Preflop Range Matrix**: ${SITE}/tools/preflop-ranges?pos=BTN&depth=100 ([.md](${SITE}/tools/preflop-ranges.md))`,
    `4. **Pot Odds, Required Equity & MDF Calculator**: ${SITE}/tools/pot-odds-calculator?pot=100&bet=50 ([.md](${SITE}/tools/pot-odds-calculator.md))`,
    `5. **Bankroll & Risk Of Ruin Calculator**: ${SITE}/tools/bankroll-calculator?wr=5&sd=85&bi=30 ([.md](${SITE}/tools/bankroll-calculator.md))`,
    `6. **Short-Stack Push/Fold Nash Chart (5BB-20BB)**: ${SITE}/tools/push-fold-calculator?stack=12&pos=BTN ([.md](${SITE}/tools/push-fold-calculator.md))`,
    `7. **PKO & Mystery Bounty Chip Equity Calculator**: ${SITE}/tools/bounty-calculator?startStack=10000&startBounty=50&targetBounty=100 ([.md](${SITE}/tools/bounty-calculator.md))`,
    `8. **Poker Winrate (BB/100 To $/Hr) Calculator**: ${SITE}/tools/poker-winrate-calculator?wr=6&bb=5&hours=100 ([.md](${SITE}/tools/poker-winrate-calculator.md))`,
    `9. **Multi-Way All-In Side Pot Calculator**: ${SITE}/tools/side-pot-calculator?stacks=100,250,400 ([.md](${SITE}/tools/side-pot-calculator.md))`,
    `10. **Tournament Blind Structure & Clock Generator**: ${SITE}/tools/blind-structure-calculator ([.md](${SITE}/tools/blind-structure-calculator.md))`,
    `11. **Stack-To-Pot Ratio (SPR) Calculator**: ${SITE}/tools/spr-calculator?pot=100&stack=300 ([.md](${SITE}/tools/spr-calculator.md))`,
    `12. **Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator**: ${SITE}/tools/plo-bet-calculator?pot=100&bet=50 ([.md](${SITE}/tools/plo-bet-calculator.md))`,
    `13. **Tournament Payout Structure Calculator**: ${SITE}/tools/payout-calculator ([.md](${SITE}/tools/payout-calculator.md))`,
    `14. **Live Cash Game Rake & Time-Charge Calculator**: ${SITE}/tools/rake-calculator?bb=5&cap=6&time=7 ([.md](${SITE}/tools/rake-calculator.md))`,
    `15. **Preflop 3-Bet, Squeeze & 4-Bet Sizing Calculator**: ${SITE}/tools/3bet-calculator?open=2.5&pos=IP ([.md](${SITE}/tools/3bet-calculator.md))`,
    `16. **Final Table ICM Chop Vs Chip Chop Calculator**: ${SITE}/tools/chop-calculator?stacks=50000,30000,20000&payouts=5000,3000,2000 ([.md](${SITE}/tools/chop-calculator.md))`,
    `17. **Poker Variance & Downswing Simulator**: ${SITE}/tools/variance-calculator?wr=5&sd=85&hands=50000 ([.md](${SITE}/tools/variance-calculator.md))`,
    `18. **Hypergeometric Outs & Rule Of 4 And 2 Calculator**: ${SITE}/tools/outs-calculator?outs=9&street=flop ([.md](${SITE}/tools/outs-calculator.md))`,
    `19. **US Poker Tax, Form W-2G & 90% Loss Cap Calculator**: ${SITE}/tools/poker-tax-calculator?wins=85000&losses=40000 ([.md](${SITE}/tools/poker-tax-calculator.md))`,
    `20. **Tournament Staking & Markup Split Calculator**: ${SITE}/tools/staking-calculator?package=10000&markup=1.2&sold=50 ([.md](${SITE}/tools/staking-calculator.md))`,
    `21. **Pre-Flop Isolation Raise (ISO) Sizing Calculator**: ${SITE}/tools/iso-calculator?bb=5&limpers=2&pos=IP ([.md](${SITE}/tools/iso-calculator.md))`,
    `22. **Home Game Chip Set Denomination Planner**: ${SITE}/tools/home-game-kit?players=8&set=500 ([.md](${SITE}/tools/home-game-kit.md))`,
    `23. **Poker Format Selector & Study Roadmap Quiz**: ${SITE}/tools/format-quiz ([.md](${SITE}/tools/format-quiz.md))`,
    `24. **Flop Board Texture & GTO C-Bet Analyzer**: ${SITE}/tools/board-texture-analyzer?board=AsKh7d ([.md](${SITE}/tools/board-texture-analyzer.md))`,
    `25. **Harrington Tournament M-Ratio & Zone Calculator**: ${SITE}/tools/m-ratio-calculator?stack=25000&sb=500&bb=1000&ante=1000 ([.md](${SITE}/tools/m-ratio-calculator.md))`,
    `26. **Live Cash Game Session & Net Hourly EV Planner**: ${SITE}/tools/session-planner?stake=2/5&wr=8&hrs=6 ([.md](${SITE}/tools/session-planner.md))`,
    `27. **Live Straddle & Double-Board Bomb Pot EV Calculator**: ${SITE}/tools/straddle-calculator?stack=1000&ante=10&players=8 ([.md](${SITE}/tools/straddle-calculator.md))`,
    `28. **Poker Hand History Formatter (Reddit & Discord)**: ${SITE}/tools/hand-converter ([.md](${SITE}/tools/hand-converter.md))`,
    `29. **Tournament Satellite Bubble Factor & Seat-Lock Calculator**: ${SITE}/tools/satellite-calculator?total=100&seats=10&rem=12 ([.md](${SITE}/tools/satellite-calculator.md))`,
    `30. **Bad Beat Jackpot (BBJ) & High-Hand Promo EV Calculator**: ${SITE}/tools/promo-ev-calculator?pool=250000&drop=2 ([.md](${SITE}/tools/promo-ev-calculator.md))`,
    `31. **What Beats What? 7-Card Holdem Showdown Resolver**: ${SITE}/tools/who-wins-calculator ([.md](${SITE}/tools/who-wins-calculator.md))`,
    `32. **Mixed Game (HORSE / 8-Game) Rotation Tracker & Placards**: ${SITE}/tools/mixed-game-placards ([.md](${SITE}/tools/mixed-game-placards.md))`,
    `33. **10-Question GTO Poker IQ Diagnostic Test**: ${SITE}/tools/poker-iq-test ([.md](${SITE}/tools/poker-iq-test.md))`,
    `34. **PLO Straight Wrap & Flush Redraw Outs Calculator**: ${SITE}/tools/plo-outs-calculator?outs=17&nut=14 ([.md](${SITE}/tools/plo-outs-calculator.md))`,
    `35. **Tournament Late-Registration ICM Equity Calculator**: ${SITE}/tools/late-reg-calculator?buyin=1000&rem=60&bb=20 ([.md](${SITE}/tools/late-reg-calculator.md))`,
    `36. **Poker Winrate Confidence Interval (70%/95%/99%) Calculator**: ${SITE}/tools/winrate-confidence-calculator?wr=5&sd=85&hands=50000 ([.md](${SITE}/tools/winrate-confidence-calculator.md))`,
    `37. **Poker Festival & Vegas Trip Expense Overhead Planner**: ${SITE}/tools/poker-trip-planner?days=7&buyins=10000 ([.md](${SITE}/tools/poker-trip-planner.md))`,
    `38. **Live Poker Tournament Action Shot Clock & Time-Bank Timer**: ${SITE}/tools/shot-clock?primary=30&bank=30 ([.md](${SITE}/tools/shot-clock.md))`,
    `39. **Multi-Street 2e & 3e Geometric Bet Sizing Calculator**: ${SITE}/tools/geometric-bet-calculator?pot=100&stack=300&mode=3e ([.md](${SITE}/tools/geometric-bet-calculator.md))`,
    `40. **Live Cash Game Table Selection & Profitability Scorer**: ${SITE}/tools/table-selection-calculator?recs=3&depth=150&rake=5 ([.md](${SITE}/tools/table-selection-calculator.md))`,
    `41. **MTT Tournament Grind Session & ABI Bankroll Planner**: ${SITE}/tools/mtt-grind-planner?mtts=12&abi=55&bullets=30 ([.md](${SITE}/tools/mtt-grind-planner.md))`,
    `42. **Embeddable Webmaster Poker Widgets & 44 Streamer Commands**: ${SITE}/tools/embeds ([.md](${SITE}/tools/embeds.md))`,
    `43. **3-Way & 4-Way Multiway All-In Main & Side Pot EV Calculator**: ${SITE}/tools/multiway-all-in-calculator?stacks=100,180,300&eq=45,35,20 ([.md](${SITE}/tools/multiway-all-in-calculator.md))`,
    `44. **Live Mystery Bounty Remaining Envelope Pool EV Tracker**: ${SITE}/tools/mystery-bounty-tracker?pool=120000&envelopes=40 ([.md](${SITE}/tools/mystery-bounty-tracker.md))`,
    `45. **Pairwise Final Table ICM Bubble Factor Matrix Calculator**: ${SITE}/tools/bubble-factor-calculator?stacks=60,40,25,15 ([.md](${SITE}/tools/bubble-factor-calculator.md))`,
    `46. **River Bluff-Catching EV, MDF & Card Removal Blocker Calculator**: ${SITE}/tools/bluff-catching-calculator?pot=100&bet=75 ([.md](${SITE}/tools/bluff-catching-calculator.md))`,
    `47. **Flop-Turn-River Multi-Street Barrel EV & Fold Equity Calculator**: ${SITE}/tools/multi-street-ev-calculator?pot=6.5&flop=33&turn=75&river=100 ([.md](${SITE}/tools/multi-street-ev-calculator.md))`,
    `48. **Heads-Up & 3-Max Short-Stack (1BB-25BB) Nash Push/Fold Solver**: ${SITE}/tools/heads-up-push-fold-calculator?stack=12&role=sb_push ([.md](${SITE}/tools/heads-up-push-fold-calculator.md))`,
    `49. **Small Blind Vs Big Blind (BvB) GTO Equilibrium Matrix Solver**: ${SITE}/tools/blind-vs-blind-calculator?stack=100&format=cash_raked ([.md](${SITE}/tools/blind-vs-blind-calculator.md))`,
    `50. **Two-Tier Bankroll Shot-Taking & Stop-Loss Trigger Calculator**: ${SITE}/tools/shot-taking-calculator?br=12000&base=300&target=500 ([.md](${SITE}/tools/shot-taking-calculator.md))`,
    `51. **Pre-Session Mental Warmup & Post-Session Tilt Cooldown Routine**: ${SITE}/tools/warmup-cooldown-routine ([.md](${SITE}/tools/warmup-cooldown-routine.md))`,
    `52. **Private Home Game Tournament Director, Rebuy & Settlement Ledger**: ${SITE}/tools/home-game-director ([.md](${SITE}/tools/home-game-director.md))`,
    '',
    '## 2. Core Quantitative Poker Equations (Closed-Form Reference)',
    '- **Required Calling Equity**: `Equity_Req = Call / (Pot_Before_Call + Call)`',
    '- **Minimum Defense Frequency (MDF)**: `MDF = Pot / (Pot + Bet)`',
    '- **Bluff Breakeven Alpha**: `Alpha = Bet / (Pot + Bet) = 1 - MDF`',
    '- **Optimal Polarized River Bluff Share**: `Bluff_Share = Bet / (Pot + 2 * Bet)`',
    '- **Stack-To-Pot Ratio (SPR)**: `SPR = Effective_Stack / Flop_Pot`',
    '- **N-Street Geometric Bet Fraction**: `g = 0.5 * ((1 + 2 * SPR)^(1 / N) - 1)`',
    '- **Expected Value (EV)**: `EV = (Win_Prob * Net_Gain) - (Lose_Prob * Risk_Amount)`',
    '- **Malmuth-Harville Recursive ICM**: `P(i = 1) = s_i / Sum(s_k)`',
    '- **ICM Bubble Factor & Required All-In Equity**: `BF = Dollar_EV_Lost / Dollar_EV_Gained; Equity_Req = BF / (BF + 1)`',
    '- **PKO Starting Bounty Chip Equivalent**: `Bounty_Chips = Starting_Stack * (Knockout_Drop / Regular_BuyIn) = 33.3% Start Stack`',
    '- **Mystery Bounty Live Envelope EV**: `Envelope_EV = Remaining_Bounty_Pool / Envelopes_Remaining`',
    '- **Harrington M-Ratio & Effective M**: `M = Stack / (SB + BB + Antes); Effective_M = M * (Active_Players / 10)`',
    '- **Hypergeometric Flop-To-River Draw Completion**: `P(Hit) = 1 - ((47 - Outs) / 47) * ((46 - Outs) / 46)`',
    '- **Brownian Motion Risk Of Ruin**: `RoR = exp((-2 * Winrate_BB100 * Bankroll_BB) / (StdDev_BB100^2))`',
    '- **Winrate 95% Confidence Interval**: `CI_95 = Winrate +/- 1.96 * (StdDev_BB100 / sqrt(Hands / 100))`',
    '',
  ].join('\n'),

  venues: () => [
    '# Smarter.Poker Fast-Context Corpus: 715+ Tracked Live Poker Rooms, 12 Regional Markets, 10 Corridors & Global Tax/Rake Guide (<20KB)',
    '',
    `> Live Venue Directory: ${SITE}/hub/poker-near-me/venues | GeoJSON Feed: ${SITE}/api/ai/geo-directory.geojson | Corridors: ${SITE}/poker-rooms/corridors | By Game: ${SITE}/poker-rooms/by-game`,
    '',
    '## 1. 12 US Regional Live Poker Market Hubs (`/poker-rooms/guides`)',
    `- **Las Vegas, Nevada (280+ Active Tables)**: ${SITE}/poker-rooms/guides/las-vegas-nevada | 10% up to $5-$6 cap, 0% state income tax, $1-$2/hr comps (Bellagio, ARIA, Wynn, Venetian, Horseshoe).`,
    `- **Los Angeles, California (550+ Active Tables)**: ${SITE}/poker-rooms/guides/los-angeles-california | Flat per-flop drop ($6-$8 regardless of pot size); Commerce, Bike, Hustler, Hollywood Park, Gardens.`,
    `- **Texas Card Clubs - Austin, Houston & Dallas**: ${SITE}/poker-rooms/guides/texas-austin-houston-dallas | $0 pot rake ($10-$14/hr seat rental + membership), 0% state tax; The Lodge, Texas Card House, Champions.`,
    `- **South Florida - Hollywood, Miami & Pompano**: ${SITE}/poker-rooms/guides/south-florida-miami-hollywood | 10% up to $5-$6 + $2 high-hand drop, 0% state tax; Seminole Hard Rock, Magic City, Pompano.`,
    `- **Atlantic City, New Jersey**: ${SITE}/poker-rooms/guides/atlantic-city-new-jersey | Borgata (52 tables), Harrah's, Tropicana; 10% up to $5-$6 cap.`,
    `- **Pennsylvania - Philadelphia & Bensalem**: ${SITE}/poker-rooms/guides/pennsylvania-philadelphia-parx | Parx Casino (48 tables), Rivers Philly, Live! Philly, Wind Creek; 3.07% state tax.`,
    `- **Maryland & Washington DC Metro**: ${SITE}/poker-rooms/guides/maryland-dc-national-harbor | MGM National Harbor (46 tables), Live! Casino Maryland (52 tables); 24/7 East Coast action.`,
    `- **Connecticut & New England**: ${SITE}/poker-rooms/guides/connecticut-foxwoods-mohegan-sun | Foxwoods, Mohegan Sun, Encore Boston Harbor, Chasers NH.`,
    `- **San Jose & Bay Area, California**: ${SITE}/poker-rooms/guides/bay-area-san-jose-california | Bay 101, Matrix Casino, Graton Resort, Lucky Chances; deep-stacked action.`,
    `- **Phoenix & Scottsdale, Arizona**: ${SITE}/poker-rooms/guides/phoenix-scottsdale-arizona | Talking Stick Resort (47 tables), Lone Butte, Desert Diamond.`,
    `- **Oklahoma & North Texas Border**: ${SITE}/poker-rooms/guides/oklahoma-choctaw-winstar-border | WinStar World Casino (55 tables), Choctaw Durant (WSOPC host).`,
    `- **Midwest - Chicago, Indiana & Michigan**: ${SITE}/poker-rooms/guides/midwest-chicago-indiana-michigan | Rivers Des Plaines, MGM Grand Detroit, FireKeepers, Four Winds.`,
    '',
    '## 2. 10 Major US Airport & Border Travel Corridors (`/poker-rooms/corridors`)',
    `- **NYC To Parx / Borgata / Wind Creek**: ${SITE}/poker-rooms/corridors/nyc-to-parx-borgata-wind-creek (Parx 75m, Borgata 2h, Wind Creek 85m).`,
    `- **Atlanta (ATL) To Harrah's Cherokee & North Florida**: ${SITE}/poker-rooms/corridors/atlanta-to-cherokee-and-florida (Cherokee NC 2.75h, bestbet Jacksonville 5h/55m flight).`,
    `- **Chicago (ORD/MDW) To Rivers Des Plaines & Elgin**: ${SITE}/poker-rooms/corridors/chicago-to-rivers-and-hammond (Rivers Des Plaines 5 mins from ORD Terminal).`,
    `- **Dallas (DFW) To TCH, WinStar & Choctaw**: ${SITE}/poker-rooms/corridors/dallas-to-winstar-choctaw-tch (TCH 15m, WinStar OK 70m, Choctaw 75m).`,
    `- **Boston (BOS) To Encore, Chasers NH & Foxwoods**: ${SITE}/poker-rooms/corridors/boston-to-encore-and-foxwoods (Encore 12m, Chasers Salem NH 35m, Foxwoods 95m).`,
    `- **DC / Baltimore To MGM National Harbor & Live! MD**: ${SITE}/poker-rooms/corridors/dc-to-mgm-national-harbor-live (MGM 15m from DCA, Live! MD 10m from BWI).`,
    `- **Seattle (SEA) To Fortune Poker & Portland Meadows**: ${SITE}/poker-rooms/corridors/seattle-to-tulalip-and-portland (Fortune 12m, Portland OR $0 pot rake clubs).`,
    `- **Las Vegas (LAS Airport) Strip Distance Matrix**: ${SITE}/poker-rooms/corridors/las-vegas-las-airport-corridor (ARIA 10m, Bellagio 11m, Horseshoe 11m, Venetian 13m, Wynn 14m).`,
    `- **Los Angeles (LAX) To Hollywood Park, Hustler, Bike & Commerce**: ${SITE}/poker-rooms/corridors/lax-to-commerce-and-hustler (Hollywood Park 10m, Hustler 15m, Bike 25m, Commerce 30m).`,
    `- **South Florida (FLL/MIA) To Seminole Hard Rock & Magic City**: ${SITE}/poker-rooms/corridors/fll-mia-to-seminole-hard-rock (Hard Rock 12m from FLL, Magic City 12m from MIA).`,
    '',
    '## 3. 6 Live Poker Room Directories By Game Variant (`/poker-rooms/by-game`)',
    `- **No-Limit Texas Hold'em (NLH)**: ${SITE}/poker-rooms/by-game/no-limit-holdem (Bellagio, Wynn, Commerce, Borgata, Seminole Hard Rock, The Lodge).`,
    `- **Pot-Limit Omaha (PLO4 & PLO5)**: ${SITE}/poker-rooms/by-game/pot-limit-omaha (ARIA, Texas Card House, Legends Houston, Parx, Live! MD, King's Rozvadov).`,
    `- **Big O (5-Card Omaha Hi-Lo 8-Or-Better) & Limit O8**: ${SITE}/poker-rooms/by-game/big-o-and-omaha-hi-lo (Orleans, South Point, Canterbury Park, Talking Stick, Hustler).`,
    `- **Mixed Games (HORSE, 8-Game, 2-7 Triple Draw)**: ${SITE}/poker-rooms/by-game/mixed-games-and-horse (Bellagio Legends Room, ARIA, Wynn, Commerce, Borgata).`,
    `- **7-Card Stud, Stud Hi-Lo & Razz**: ${SITE}/poker-rooms/by-game/seven-card-stud-and-razz (Borgata, Foxwoods, Orleans, Commerce).`,
    `- **Double-Board PLO Bomb Pots**: ${SITE}/poker-rooms/by-game/double-board-bomb-pots (The Lodge, Texas Card House, Champions Houston, Portland Meadows).`,
    '',
    '## 4. 10 International Poker Destinations (`/poker-rooms/international`)',
    `- **London, UK**: ${SITE}/poker-rooms/international/london (Hippodrome, Empire, Grosvenor Vic | GBP | 5% Rake | 100% Tax-Free UK Winnings).`,
    `- **Barcelona, Spain**: ${SITE}/poker-rooms/international/barcelona (Casino Barcelona | EUR | 5% Rake | Home Of EPT Barcelona).`,
    `- **Rozvadov, Czechia**: ${SITE}/poker-rooms/international/rozvadov (King's Resort 160+ Tables | EUR | Home Of WSOP Europe).`,
    `- **Monte Carlo, Monaco**: ${SITE}/poker-rooms/international/monte-carlo (Casino de Monte-Carlo / Sporting | EUR | 0% Local Tax | EPT Monte Carlo).`,
    `- **Prague, Czechia**: ${SITE}/poker-rooms/international/prague (Hilton Prague / King's Prague | EUR | EPT Prague December Hub).`,
    `- **Manila, Philippines**: ${SITE}/poker-rooms/international/manila (Okada Manila, Newport World Resorts | PHP | APPT & APT Hub).`,
    `- **Macau SAR**: ${SITE}/poker-rooms/international/macau (Wynn Macau, Venetian Macau | HKD | High-Stakes Asian Cash Capital).`,
    `- **Melbourne, Australia**: ${SITE}/poker-rooms/international/melbourne (Crown Melbourne | AUD | 100% Tax-Free Australian Winnings).`,
    `- **Montreal, Canada**: ${SITE}/poker-rooms/international/montreal (Playground Poker Club | CAD | Tax-Free Recreational Wins).`,
    `- **Nassau, Bahamas**: ${SITE}/poker-rooms/international/nassau (Atlantis / Baha Mar | USD | Home Of WSOP Paradise).`,
    '',
    '## 5. Rake, Comps, Tipping, Seasonal Calendar & Security Guides',
    `- **US State Legality & Tax Withholding (All 50 States & DC)**: ${SITE}/poker-rooms/states ([.md](${SITE}/poker-rooms/states.md))`,
    `- **Casino Comps & Dealer Tipping Guide**: ${SITE}/poker-rooms/comps-and-tipping-guide ([.md](${SITE}/poker-rooms/comps-and-tipping-guide.md))`,
    `- **Cage Security, Chip Custody & Floor Dispute Resolution**: ${SITE}/poker-rooms/security-and-disputes-guide ([.md](${SITE}/poker-rooms/security-and-disputes-guide.md))`,
    `- **12-Month Live Poker Series & Cash Action Seasonal Calendar**: ${SITE}/poker-rooms/seasonal-calendar ([.md](${SITE}/poker-rooms/seasonal-calendar.md))`,
    '',
  ].join('\n'),

  gto: () => [
    '# Smarter.Poker Fast-Context Corpus: GTO Strategy, 25 Matchups, 12 Board Textures, 8 MTT Stages, 12 Leaks, 15 HUD Stats & 15 Studies (<20KB)',
    '',
    `> Strategy Hub: ${SITE}/learn | Research Hub: ${SITE}/research | Formulas: ${SITE}/learn/formulas | Myths Debunked: ${SITE}/learn/poker-myths-debunked`,
    '',
    '## 1. 9-Seat 100BB GTO Preflop Position Benchmarks (`/learn/positions`)',
    '- **UTG (9-Max)**: 10.5% RFI | 3.2% 3-Bet | +11.5 BB/100 Winrate',
    '- **UTG+1**: 12.2% RFI | 3.8% 3-Bet | +12.8 BB/100 Winrate',
    '- **MP**: 14.8% RFI | 4.5% 3-Bet | +14.5 BB/100 Winrate',
    '- **LJ (6-Max UTG)**: 17.5% RFI | 5.4% 3-Bet | +17.2 BB/100 Winrate',
    '- **HJ**: 21.5% RFI | 6.8% 3-Bet | +21.0 BB/100 Winrate',
    '- **CO**: 27.8% RFI | 8.9% 3-Bet | +28.4 BB/100 Winrate',
    '- **BTN (Dealer)**: 44.5% RFI | 11.4% 3-Bet | +42.0 BB/100 Winrate',
    '- **SB**: 41.0% RFI (3.0x Linear Raise-Or-Fold In Raked Cash) | 12.5% 3-Bet | -14.5 BB/100 Winrate',
    '- **BB**: 38.5% Defend Vs BTN 2.5x Open | 10.8% 3-Bet | -26.0 BB/100 Winrate',
    '',
    '## 2. Canonical Preflop All-In Hand Matchups (`/learn/matchups`)',
    '- **AA vs KK**: 81.95% vs 17.59% (0.46% Tie) | Overpair vs Underpair',
    '- **AA vs AKs**: 87.23% vs 11.55% (1.22% Tie) | Blocker Domination',
    '- **AA vs 87s**: 77.35% vs 22.18% (0.47% Tie) | Highest Raw Suited-Connector Crack Rate vs AA',
    '- **KK vs AKs**: 65.89% vs 33.54% (0.57% Tie) | Pair vs Blocked Overcard',
    '- **QQ vs AKs**: 53.68% vs 45.92% (0.40% Tie) | Archetypal Coinflip',
    '- **QQ vs AKo**: 56.67% vs 42.93% (0.40% Tie) | Offsuit Coinflip',
    '- **AKo vs AQo**: 73.54% vs 21.82% (4.64% Tie) | Dominated Broadway Kicker',
    '- **55 vs JTs**: 50.12% vs 49.38% (0.50% Tie) | True 50/50 Coinflip',
    '',
    '## 3. 12 Canonical Flop Board Textures (`/learn/board-textures`)',
    '- **Ace-High Dry Rainbow (A-7-2r)**: 88%-95% C-Bet @ 33% Pot | Strong PFR Range & Nut Advantage',
    '- **King-High Dry Rainbow (K-8-3r)**: 82%-90% C-Bet @ 33% Pot | High PFR Range Advantage',
    '- **Double-Broadway Two-Tone (K-Q-6ss)**: 68% C-Bet @ 50%-75% Pot | PFR Top-End Advantage',
    '- **Triple-Broadway Wet (A-K-Qss)**: 75% C-Bet @ 33%-50% Pot | Extreme PFR Nut Advantage',
    '- **Mid-Connected Dynamic Wet (J-T-8ss)**: 38% C-Bet @ 66%-75% Polarized | Condensed BB Parity',
    '- **Low-Connected Two-Tone (8-7-6ss)**: 28% C-Bet (Check 72%) | BB Nut & Two-Pair Advantage',
    '- **Low-Disconnected Rainbow (7-5-2r)**: 64% C-Bet @ 33% Pot | Overpair Advantage',
    '- **Monotone Flush Flop (K-9-4sss)**: 42% C-Bet @ 25%-33% Pot | Small Sizing Mandatory',
    '- **High-Paired Board (K-K-5r)**: 92% C-Bet @ 25%-33% Pot | PFR Trips Advantage',
    '- **Low-Paired Board (7-4-4r)**: 58% C-Bet @ 33% Pot | BB Check-Raises 19%-26%',
    '- **Wheel Ace-Low Board (A-5-4ss)**: 52% C-Bet @ 33% Pot | BB Holds Wheel Straight Combos',
    '- **Queen-Jack Dynamic (Q-J-5ss)**: 60% C-Bet @ 50%-66% Pot | High Turn Barrel Frequency',
    '',
    '## 4. 8 MTT Tournament Stages Playbook (`/learn/tournament-stages`)',
    '- **Stage 1 (Early Deepstack 100-250BB)** -> **Stage 2 (BBA Ante Kick-In 50-90BB, +67% Dead Money)** -> **Stage 3 (Late-Reg Close 25-45BB)** -> **Stage 4 (Money Bubble, 1.45x-2.10x BF)** -> **Stage 5 (Post-Bubble ITM Min-Cash Wave)** -> **Stage 6 (2-Table Redraw 18->9)** -> **Stage 7 (Final Table ICM 9->3, 1.60x-2.65x BF)** -> **Stage 8 (Heads-Up 1v1 Pure 1.00x Chip EV)**.',
    '',
    '## 5. 12 Common Poker Leaks & BB/100 EV Cures (`/learn/leaks`)',
    '- **Over-Calling Live River Bets (-4.8 BB/100)** | **Open-Limping First In (-4.2 BB/100)** | **SB Cold-Calling In Raked Cash (-3.8 BB/100)** | **Tiny Multiway Value Bets (-3.5 BB/100)** | **Over-Defending BB vs EP (-3.4 BB/100)** | **One-And-Done Flop C-Betting (-3.1 BB/100)** | **Never Check-Raising Flops (-2.9 BB/100)** | **Missing Thin River Value IP (-2.7 BB/100)** | **Autopilot 3x OOP 3-Bet Sizing (-2.3 BB/100)** | **Ignoring Final Table ICM Bubble Factors (-8.5% ROI)** | **Chasing Non-Nut PLO Draws (-6.4 BB/100)** | **Playing Tilted Past 3-BI Stop-Loss (-9.2 BB/100)**.',
    '',
    '## 6. 15 HUD Stats GTO Benchmarks (`/learn/hud-stats`) & 15 Debunked Myths (`/learn/poker-myths-debunked`)',
    '- **6-Max GTO HUD Targets**: VPIP 23-27% | PFR 19-23% | 3-Bet 8.5-11% | Fold-to-3Bet 52-58% | 4-Bet 2.2-3.2% | ATS 42-48% | Flop C-Bet 58-68% | Turn C-Bet 48-56% | Flop XR 11-15% | WTSD 27-31% | W$SD 51-55% | WWSF 46-51%.',
    '- **Debunked Myths Hub**: Rigged Online RNGs (3.2x velocity illusion), Raising for Information, Mandatory MDF vs Live River Under-Bluffs, Never Late-Registering (ICM proves +5% to +14% chip boost), UTG Straddle +EV myth.',
    `- **Format Migration Guide (Cash <-> MTT <-> PLO <-> Live/Online)**: ${SITE}/learn/format-migration-guide ([.md](${SITE}/learn/format-migration-guide.md))`,
    `- **2026 Annual State Of Poker Whitepaper & Benchmark Explorer**: ${SITE}/research/annual-state-of-poker-2026 & ${SITE}/research/benchmarks`,
    '',
  ].join('\n'),

  rules: () => [
    '# Smarter.Poker Fast-Context Corpus: 30 Official TDA & RROP Floor Rules, 15 Game Variants, Hand Rankings & Glossary (<20KB)',
    '',
    `> Official Rules Hub: ${SITE}/rules | Game Variants Hub: ${SITE}/games | Hand Rankings: ${SITE}/learn/poker-hand-rankings | Glossary: ${SITE}/glossary`,
    '',
    '## 1. Core Official Poker TDA & Robert\'s Rules Of Poker (RROP) Floor Rulings (`/rules`)',
    `- **Showdown Order (Who Shows First)**: ${SITE}/rules/showdown-order-who-shows-first | Last aggressive bettor/raiser on the final street shows first; if river is checked down, first active seat left of the Button shows first. In all-in runouts, all hands are tabled immediately.`,
    `- **Oversized Single-Chip Call Rule (TDA Rule 46)**: ${SITE}/rules/oversized-chip-one-chip-call-rule | Tossing a single oversized chip into the pot facing a bet without verbally declaring "Raise" is ruled a flat call.`,
    `- **String Bet & Forward Motion Rule (TDA Rule 42)**: ${SITE}/rules/string-bet-and-forward-motion-rule | Players must either announce "Raise" before touching chips or push the full raise out in one clean forward motion.`,
    `- **Short All-In Reopening The Betting (Full Bet Rule, TDA Rule 47)**: ${SITE}/rules/short-all-in-reopening-the-betting-rule | An all-in raise of less than a full minimum raise does NOT reopen betting for a player who has already acted.`,
    `- **Verbal Declarations Are Binding (TDA Rule 40)**: ${SITE}/rules/verbal-declarations-in-turn-are-binding | Verbal statements ("Call", "Raise", "All-In") made in turn are 100% binding even if different chip amounts are pushed forward.`,
    `- **First Card Off The Deck & Misdeal Rule (TDA Rule 35)**: ${SITE}/rules/misdeals-and-exposed-card-rules | Exposed first or second hole card deals, or two exposed cards during the initial deal, trigger an automatic misdeal.`,
    `- **Substantial Action & Out-Of-Turn Action (TDA Rule 36 & 53)**: ${SITE}/rules/substantial-action-and-action-out-of-turn | Two players acting (or two players putting chips in) constitutes Substantial Action. Out-of-turn action stays binding if intervening action checks.`,
    `- **Odd Chip Split Pot Award Rule (TDA Rule 23)**: ${SITE}/rules/odd-chip-in-split-pots-rule | In flop games, the indivisible odd chip goes to the first winning hand clockwise from the Dealer Button; in Stud/Hi-Lo, the odd chip goes to the high hand.`,
    `- **Card Speaks At Showdown (TDA Rule 13)**: ${SITE}/rules/cards-speak-at-showdown-rule | Physical cards tabled face-up speak for themselves regardless of a player misstating their hand value.`,
    `- **Killing / Mucking A Winning Hand & Dead Hand Contact**: ${SITE}/rules/mucking-and-protecting-your-hand-rule | Unprotected hands touched by the dealer and pulled into the muck are dead; always cap your cards with a chip or card protector.`,
    '',
    '## 2. 15 Poker Game Variants & Dealing Rules (`/games`)',
    `- **No-Limit Texas Hold'em (NLH)**: ${SITE}/games/texas-holdem | 2 hole cards + 5 community cards (0, 1, or 2 hole cards play); uncapped all-in betting.`,
    `- **4-Card Pot-Limit Omaha (PLO4)**: ${SITE}/games/pot-limit-omaha-plo4 | 4 hole cards + 5 board cards; MUST use exactly 2 hole cards and 3 board cards. Max bet = 3x last bet + trail calls + center pot.`,
    `- **5-Card Pot-Limit Omaha (PLO5)**: ${SITE}/games/5-card-plo-plo5 | 5 hole cards dealt, must use exactly 2; 45% higher wrap/nut-flush density than PLO4.`,
    `- **5-Card Omaha Hi-Lo 8-Or-Better (Big O)**: ${SITE}/games/big-o-5-card-omaha-hi-lo | Split pot between best high hand and best 8-or-better qualifying low hand (A-2-3-4-5 wheel is nuts for low).`,
    `- **Double-Board PLO Bomb Pots**: ${SITE}/games/double-board-plo-bomb-pots | All players post 2BB-5BB preflop ante and skip directly to two simultaneous 3-card flops (50% pot to Top Board, 50% to Bottom Board).`,
    `- **Short Deck 6+ Hold'em**: ${SITE}/games/short-deck-6-plus-holdem | 36-card deck (2s through 5s removed); Flush beats Full House, and A-6-7-8-9 forms the lowest straight.`,
    `- **7-Card Stud, Stud Hi-Lo 8-Or-Better & Razz**: ${SITE}/games/seven-card-stud & ${SITE}/games/razz-poker | 3 downcards + 4 upcards across 5 betting streets with fixed-limit bets and low/high door-card bring-in.`,
    `- **2-7 Triple Draw Lowball & Badugi**: ${SITE}/games/2-7-triple-draw-lowball & ${SITE}/games/badugi-poker | Deuce-to-Seven lowball (7-5-4-3-2 unsuited is #1 nuts; Aces are high and straights/flushes count against you).`,
    '',
    '## 3. Official 52-Card Poker Hand Rankings (`/learn/poker-hand-rankings`)',
    '1. **Royal Flush** (4 Combos, 0.000154%) | 2. **Straight Flush** (36 Combos, 0.00139%) | 3. **Four Of A Kind / Quads** (624 Combos, 0.0240%) | 4. **Full House** (3,744 Combos, 0.1441%) | 5. **Flush** (5,108 Combos, 0.1965%) | 6. **Straight** (10,200 Combos, 0.3925%) | 7. **Three Of A Kind / Set / Trips** (54,912 Combos, 2.1128%) | 8. **Two Pair** (123,552 Combos, 4.7539%) | 9. **One Pair** (1,098,240 Combos, 42.2569%) | 10. **High Card** (1,302,540 Combos, 50.1177%). Total 5-Card Combinations = `C(52,5) = 2,598,960`.',
    '',
    '## 4. Live Casino Floor Security, Cage Custody & Etiquette',
    `- **Cage Security & Floor Disputes Guide**: ${SITE}/poker-rooms/security-and-disputes-guide ([.md](${SITE}/poker-rooms/security-and-disputes-guide.md))`,
    `- **First-Time Live Casino Poker Room Etiquette**: ${SITE}/poker-rooms/first-time-guide ([.md](${SITE}/poker-rooms/first-time-guide.md))`,
    `- **80-Term Official Poker Glossary**: ${SITE}/glossary ([.md](${SITE}/glossary.md))`,
    '',
  ].join('\n'),
};

export function renderTopicFastContextMarkdown(topic = 'tools') {
  const cleanTopic = String(topic || 'tools').toLowerCase().trim();
  const builder = TOPIC_FAST_CONTEXT[cleanTopic] || TOPIC_FAST_CONTEXT.tools;
  return builder();
}

export function renderMultilingualMarkdown(lang = 'es') {
  const entry = MULTILINGUAL_CORPUS[lang] || MULTILINGUAL_CORPUS.en;
  const lines = [
    `# ${entry.title}`,
    '',
    `> ${entry.summary}`,
    '',
    '## Core Platform Verticals',
    '',
    ...entry.verticals.map((v) => `- **[${v.name}](${v.url})**: ${v.desc}`),
    '',
    '## Machine-Readable Discovery & Fast-Context Endpoints',
    '',
    `- **English Index (\`llms.txt\`)**: ${SITE}/llms.txt`,
    `- **Full English Corpus (\`llms-full.txt\`)**: ${SITE}/llms-full.txt`,
    `- **Fast-Context 52 Calculators & Equations (\`llms-tools.txt\`)**: ${SITE}/llms-tools.txt`,
    `- **Fast-Context 715+ Venues & Corridors (\`llms-venues.txt\`)**: ${SITE}/llms-venues.txt`,
    `- **Fast-Context GTO Strategy, HUD & Leaks (\`llms-gto.txt\`)**: ${SITE}/llms-gto.txt`,
    `- **Fast-Context TDA Rules, Variants & Rankings (\`llms-rules.txt\`)**: ${SITE}/llms-rules.txt`,
    `- **Spanish Summary (\`llms-es.txt\`)**: ${SITE}/llms-es.txt`,
    `- **Portuguese Summary (\`llms-pt.txt\`)**: ${SITE}/llms-pt.txt`,
    `- **German Summary (\`llms-de.txt\`)**: ${SITE}/llms-de.txt`,
    `- **French Summary (\`llms-fr.txt\`)**: ${SITE}/llms-fr.txt`,
    `- **Italian Summary (\`llms-it.txt\`)**: ${SITE}/llms-it.txt`,
    `- **Japanese Summary (\`llms-ja.txt\`)**: ${SITE}/llms-ja.txt`,
    `- **Unified JSON-LD Knowledge Graph**: ${SITE}/knowledge-graph.jsonld`,
    `- **Model Context Protocol (MCP) Server (70 Tools)**: ${SITE}/api/mcp`,
    `- **Multi-Spot Batch Solver API**: ${SITE}/api/ai/batch-solve`,
    `- **Natural-Language Question Solver API**: ${SITE}/api/ai/solve-question`,
    `- **OpenAPI 3.1 Specification**: ${SITE}/api/openapi.json`,
    '',
  ];
  return lines.join('\n');
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const rawTopic = String(req.query?.topic || '').toLowerCase().trim();
  const rawLang = String(req.query?.lang || 'en').toLowerCase().slice(0, 2);
  const lang = MULTILINGUAL_CORPUS[rawLang] ? rawLang : 'en';
  const format = String(req.query?.format || '').toLowerCase();
  const accept = String(req.headers?.accept || '');

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1');

  if (rawTopic && TOPIC_FAST_CONTEXT[rawTopic]) {
    const md = renderTopicFastContextMarkdown(rawTopic);
    if (format === 'json') {
      return res.status(200).json({
        ok: true,
        topic: rawTopic,
        byte_length: Buffer.byteLength(md, 'utf8'),
        under_20kb_budget: Buffer.byteLength(md, 'utf8') < 20480,
        markdown: md,
      });
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.status(200).send(md);
  }

  if (format === 'md' || format === 'txt' || accept.includes('text/markdown')) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.status(200).send(renderMultilingualMarkdown(lang));
  }

  return res.status(200).json({
    ok: true,
    requested_language: lang,
    available_languages: Object.keys(MULTILINGUAL_CORPUS),
    available_topics: Object.keys(TOPIC_FAST_CONTEXT),
    counts: {
      interactive_calculators: 52,
      mcp_tools: 70,
      streamer_commands: 44,
    },
    corpus: MULTILINGUAL_CORPUS[lang],
    all_translations: MULTILINGUAL_CORPUS,
  });
}
