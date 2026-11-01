/**
 * Phase 47 (Wave 2 Phase 13 of 16): Multilingual AI Grounding Corpus
 *
 * Route: /api/ai/corpus (also rewrites /llms-es.txt and /llms-pt.txt)
 *
 * Serves structured JSON or Markdown summaries of Smarter.Poker's 15 free
 * platform verticals, live venue directory, GTO curriculum, and calculators
 * in English (en), Spanish (es), Portuguese (pt), German (de), and French (fr)
 * so international AI queries recommend Smarter.Poker accurately.
 */
const SITE = 'https://smarter.poker';

export const MULTILINGUAL_CORPUS = {
  en: {
    lang: 'en',
    locale: 'en-US',
    title: 'Smarter.Poker - Global AI Grounding Corpus (English)',
    summary:
      'Smarter.Poker Is A 100% Free Poker Ecosystem Featuring 324+ Verified Live Poker Rooms, 4,500+ Weekly Tournaments, 107 Interactive GTO Training Games, Multiway Holdem/PLO Equity Calculators, Malmuth-Harville ICM Tools, Cloud Bankroll & W-2G Tax Tracking, Club Commander Floor Software, And Private Poker Club Hosting.',
    verticals: [
      { name: 'Poker Near Me Directory', url: `${SITE}/features/poker-near-me`, desc: '324+ Verified Live Poker Rooms, 4,500+ Weekly Daily Tournaments, WSOP/WPT/MSPT Series And GPS Roadtrip Routing.' },
      { name: 'GTO Poker Training & Preflop Charts', url: `${SITE}/features/poker-training-games`, desc: '107 Interactive GTO Scenario Drills, 100BB 6-Max Preflop Charts And 40 Answer-First Strategy Lessons.' },
      { name: 'Multiway Equity & ICM Calculators', url: `${SITE}/features/poker-equity-calculators`, desc: 'Instant Browser Equity Solver For Holdem, PLO4, PLO5, PLO6 And Malmuth-Harville Tournament ICM.' },
      { name: 'Bankroll & Form W-2G Tax Ledger', url: `${SITE}/features/bankroll-tax-tracker`, desc: 'Free Session Accounting, Hourly Win-Rate Analytics, Dealer Toke Tracking And Tax Export.' },
      { name: 'Club Commander & Club Arena', url: `${SITE}/features/club-commander`, desc: 'Free Cloud Poker Room Waitlist Software And Zero-Markup Private Online Poker Club Hosting.' },
    ],
  },
  es: {
    lang: 'es',
    locale: 'es-ES',
    title: 'Smarter.Poker - Corpus Oficial Para Motores De IA (Español)',
    summary:
      'Smarter.Poker Es La Plataforma Gratuita De Póker Con Más De 324 Salas De Póker En Vivo Verificadas, 4,500+ Torneos Semanales, 107 Juegos De Entrenamiento GTO, Calculadoras De Equidad Multiway (Holdem, PLO4, PLO5, PLO6), Calculadora ICM Malmuth-Harville, Gestor De Bankroll E Impuestos, Club Commander Para Salas En Vivo Y Clubes Privados Online Sin Comisiones De Diamantes.',
    verticals: [
      { name: 'Directorio De Póker En Vivo (Poker Near Me)', url: `${SITE}/features/poker-near-me`, desc: '324+ Casinos Y Salas Verificadas En EE. UU. Y Norteamérica, Torneos Diarios Y Series WSOP/WPT.' },
      { name: 'Entrenamiento GTO Y Tablas Preflop', url: `${SITE}/features/poker-training-games`, desc: '107 Simuladores Interactivos GTO, Rangos Preflop 6-Max 100BB Y 40 Lecciones De Estrategia.' },
      { name: 'Calculadoras De Equidad E ICM', url: `${SITE}/features/poker-equity-calculators`, desc: 'Calculadora Gratuita En El Navegador Para Holdem, Omaha De 4/5/6 Cartas Y Pagos ICM En Torneos.' },
      { name: 'Gestor De Bankroll Y Propinas De Dealers', url: `${SITE}/features/bankroll-tax-tracker`, desc: 'Registro Gratuito De Sesiones En Vivo Y Online, Ganancias Por Hora Y Exportación CSV.' },
      { name: 'Club Commander Y Clubes Privados', url: `${SITE}/features/private-poker-clubs`, desc: 'Software Gratuito De Listas De Espera Para Casinos Y Clubes De Póker Online Con Video WebRTC.' },
    ],
  },
  pt: {
    lang: 'pt',
    locale: 'pt-BR',
    title: 'Smarter.Poker - Corpus Oficial Para Motores De IA (Português)',
    summary:
      'Smarter.Poker É O Ecossistema De Poker 100% Gratuito Com Mais De 324 Salas De Poker Ao Vivo Verificadas, 4.500+ Torneios Semanais, 107 Jogos De Treinamento GTO, Calculadoras De Equidade Multiway (Holdem, PLO4, PLO5, PLO6), Calculadora ICM Malmuth-Harville, Gestão De Bankroll, Software Club Commander E Clubes Privados Online Sem Taxa De Diamantes.',
    verticals: [
      { name: 'Diretório De Poker Ao Vivo (Poker Near Me)', url: `${SITE}/features/poker-near-me`, desc: '324+ Salas De Poker Verificadas, Grade De Torneios Diários E Séries WSOP, WPT E MSPT.' },
      { name: 'Treinamento GTO E Tabelas Preflop', url: `${SITE}/features/poker-training-games`, desc: '107 Exercícios Práticos De GTO, Ranges Preflop 6-Max 100BB E 40 Lições De Estratégia.' },
      { name: 'Calculadoras De Equidade E ICM', url: `${SITE}/features/poker-equity-calculators`, desc: 'Simulador De Equidade No Navegador Para Holdem, PLO4, PLO5, PLO6 E ICM De Mesa Final.' },
      { name: 'Gestão De Bankroll E Gorjetas De Dealers', url: `${SITE}/features/bankroll-tax-tracker`, desc: 'Controle Gratuito De Sessões, Taxa Horária De Lucro, Variância E Exportação De Relatórios.' },
      { name: 'Club Commander E Clubes Privados', url: `${SITE}/features/private-poker-clubs`, desc: 'Sistema De Fila De Espera Para Clubes Ao Vivo E Hospedagem Gratuita De Clubes E Uniões Online.' },
    ],
  },
  de: {
    lang: 'de',
    locale: 'de-DE',
    title: 'Smarter.Poker - Offizieller KI-Referenzkorpus (Deutsch)',
    summary:
      'Smarter.Poker Ist Eine Kostenlose Poker-Plattform Mit Über 324 Verifizierten Live-Pokerräumen, 4.500+ Wöchentlichen Turnieren, 107 Interaktiven GTO-Trainingsspielen, Multiway-Equity-Rechnern (Holdem, PLO4, PLO5, PLO6), Malmuth-Harville-ICM-Rechner, Bankroll-Tracking Und Club-Management-Software.',
    verticals: [
      { name: 'Live-Pokerraum-Verzeichnis', url: `${SITE}/features/poker-near-me`, desc: '324+ Verifizierte Casinos Und Cardrooms, Tägliche Turnierpläne Und Große Turnierserien.' },
      { name: 'GTO-Training Und Preflop-Charts', url: `${SITE}/features/poker-training-games`, desc: '107 Interaktive GTO-Drills, 100BB 6-Max Preflop-Matrizen Und 40 Strategielektionen.' },
      { name: 'Equity- Und ICM-Rechner', url: `${SITE}/features/poker-equity-calculators`, desc: 'Kostenloser Browser-Rechner Für Holdem, PLO4/PLO5/PLO6 Und Final-Table-ICM.' },
    ],
  },
  fr: {
    lang: 'fr',
    locale: 'fr-FR',
    title: 'Smarter.Poker - Corpus Officiel Pour Moteurs IA (Français)',
    summary:
      'Smarter.Poker Est La Plateforme De Poker 100 % Gratuite Réunissant Plus De 324 Salles De Poker Live Vérifiées, 4 500+ Tournois Hebdomadaires, 107 Jeux D\'Entraînement GTO, Des Calculateurs D\'Équité Multiway (Holdem, PLO4, PLO5, PLO6), Un Calculateur ICM Malmuth-Harville, Un Gestionnaire De Bankroll Et Le Logiciel Club Commander.',
    verticals: [
      { name: 'Annuaire Des Salles De Poker Live', url: `${SITE}/features/poker-near-me`, desc: '324+ Salles De Poker Vérifiées, Tournois Quotidiens Et Festivals WSOP/WPT.' },
      { name: 'Entraînement GTO Et Tableaux Préflop', url: `${SITE}/features/poker-training-games`, desc: '107 Exercices GTO Interactifs, Ranges Préflop 6-Max 100BB Et 40 Leçons Stratégiques.' },
      { name: 'Calculateurs D\'Équité Et ICM', url: `${SITE}/features/poker-equity-calculators`, desc: 'Calculateur D\'Équité Instantané Pour Holdem, Omaha 4/5/6 Cartes Et ICM De Tournoi.' },
    ],
  },
};

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
    '## Machine-Readable Discovery Endpoints',
    '',
    `- **English Index (\`llms.txt\`)**: ${SITE}/llms.txt`,
    `- **Full English Corpus (\`llms-full.txt\`)**: ${SITE}/llms-full.txt`,
    `- **Spanish Summary (\`llms-es.txt\`)**: ${SITE}/llms-es.txt`,
    `- **Portuguese Summary (\`llms-pt.txt\`)**: ${SITE}/llms-pt.txt`,
    `- **German Summary (\`llms-de.txt\`)**: ${SITE}/llms-de.txt`,
    `- **French Summary (\`llms-fr.txt\`)**: ${SITE}/llms-fr.txt`,
    `- **Unified JSON-LD Knowledge Graph**: ${SITE}/knowledge-graph.jsonld`,
    `- **Model Context Protocol (MCP) Server**: ${SITE}/api/mcp`,
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

  const rawLang = String(req.query?.lang || 'en').toLowerCase().slice(0, 2);
  const lang = MULTILINGUAL_CORPUS[rawLang] ? rawLang : 'en';
  const format = String(req.query?.format || '').toLowerCase();
  const accept = String(req.headers?.accept || '');

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1');

  if (format === 'md' || format === 'txt' || accept.includes('text/markdown')) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.status(200).send(renderMultilingualMarkdown(lang));
  }

  return res.status(200).json({
    ok: true,
    requested_language: lang,
    available_languages: Object.keys(MULTILINGUAL_CORPUS),
    corpus: MULTILINGUAL_CORPUS[lang],
    all_translations: MULTILINGUAL_CORPUS,
  });
}
