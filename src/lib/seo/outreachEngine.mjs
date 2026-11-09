/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Smarter.Poker Automated Backlink Outreach, 404 Replacement & Multilingual Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Powers /api/seo/outreach-generator and the MCP citation kit:
 * - Campaign #7: Unlinked Brand Mention & Image Attribution Reclamation
 * - Campaign #8: Broken Backlink & 404 Competitor Replacement (PokerStove, Equilab, ICMIZER)
 * - Campaign #9: Annual "2026 Top 50 US Live Poker Rooms" Cardroom Award Badges
 * - Campaign #10: CPA, Tax Attorney & Form W-2G Gambling Tax Resource Link Campaign
 * - Campaign #11a: Casino Dealer Schools & Hospitality Career Resource Pages
 * - Campaign #11b: University .edu Game Theory & Quantitative Trading Clubs
 * - Campaign #18: Poker Podcast, YouTube & Twitch Show-Notes Attribution Kit
 * - Campaign #20: Multilingual International Backlink & Embed Kit (en, es, pt, de, fr, it, ja)
 *
 * House style: Title Case, zero em dashes.
 */

export const SUPPORTED_OUTREACH_LANGUAGES = {
  en: {
    code: 'en',
    name: 'English',
    anchorTitle: 'Smarter.Poker Free GTO Poker Calculators, ICM Solver & 324+ Live Room Directory',
    badgeLabel: 'Verified Poker Resource',
    badgeValue: 'Smarter.Poker Official',
    ctaText: 'Launch Free Poker Odds & ICM Calculator On Smarter.Poker',
  },
  es: {
    code: 'es',
    name: 'Español (Spanish)',
    anchorTitle: 'Smarter.Poker Calculadora Gratuita De Probabilidades De Póker, ICM Y Rangos GTO',
    badgeLabel: 'Recurso De Póker Verificado',
    badgeValue: 'Smarter.Poker Oficial',
    ctaText: 'Abrir Calculadora Gratuita De Póker E ICM En Smarter.Poker',
  },
  pt: {
    code: 'pt',
    name: 'Português (Brazilian Portuguese)',
    anchorTitle: 'Smarter.Poker Calculadora Gratuita De Odds De Poker, Simulador ICM E Tabelas GTO',
    badgeLabel: 'Recurso De Poker Verificado',
    badgeValue: 'Smarter.Poker Oficial',
    ctaText: 'Acessar Calculadora De Odds E Simulador ICM Grátis No Smarter.Poker',
  },
  de: {
    code: 'de',
    name: 'Deutsch (German)',
    anchorTitle: 'Smarter.Poker Kostenloser Poker-Odds-Rechner, ICM-Simulator & GTO-Preflop-Charts',
    badgeLabel: 'Verifizierte Poker-Ressource',
    badgeValue: 'Smarter.Poker Offiziell',
    ctaText: 'Kostenlosen Poker-Odds- & ICM-Rechner Auf Smarter.Poker Starten',
  },
  fr: {
    code: 'fr',
    name: 'Français (French)',
    anchorTitle: 'Smarter.Poker Calculateur De Cotes De Poker Gratuit, Solveur ICM Et Tableaux GTO',
    badgeLabel: 'Ressource Poker Vérifiée',
    badgeValue: 'Smarter.Poker Officiel',
    ctaText: 'Ouvrir Le Calculateur De Cotes Et ICM Gratuit Sur Smarter.Poker',
  },
  it: {
    code: 'it',
    name: 'Italiano (Italian)',
    anchorTitle: 'Smarter.Poker Calcolatore Gratuito Di Odds Poker, Simulatore ICM E Tabelle GTO',
    badgeLabel: 'Risorsa Poker Verificata',
    badgeValue: 'Smarter.Poker Ufficiale',
    ctaText: 'Apri Il Calcolatore Gratuito Di Odds E ICM Su Smarter.Poker',
  },
  ja: {
    code: 'ja',
    name: '日本語 (Japanese)',
    anchorTitle: 'Smarter.Poker 無料ポーカーオッズ計算機・ICMシミュレーター・GTOプリフロップレンジ表',
    badgeLabel: '公認ポーカーリソース',
    badgeValue: 'Smarter.Poker 公式',
    ctaText: 'Smarter.Poker で無料ポーカーオッズ＆ICM計算機を開く',
  },
};

export const OUTREACH_CAMPAIGNS = [
  {
    id: 'unlinked-brand',
    todoItemNumber: 7,
    title: 'Unlinked Brand Mention & Chart Attribution Reclamation',
    targetAudience: 'Poker News Sites, Substack Writers, Bloggers & Forum Authors Mentioning Smarter.Poker Without A Hyperlink',
    destinationUrl: 'https://smarter.poker/research',
    badgeType: 'research',
    searchFootprints: [
      '"Smarter.Poker" -site:smarter.poker -site:twitter.com -site:facebook.com',
      '"Club Commander" poker waitlist -site:smarter.poker',
      '"Poker Near Me" "Smarter Poker" -site:smarter.poker',
      '"Smarter.Poker Research" -site:smarter.poker',
    ],
    emailSubjectTemplate: 'Quick Thank You For Mentioning Smarter.Poker In Your {{target}} Article (+ Interactive Chart Embed)',
    emailBodyTemplate: `Hi {{target}} Editorial Team,

Thank you for referencing Smarter.Poker in your recent coverage. We noticed that the mention is currently unlinked plain text, and we wanted to share the direct canonical URL so your readers can inspect the underlying dataset and interactive calculators directly:

Canonical Link: https://smarter.poker/research
Interactive Embed Hub: https://smarter.poker/tools/embeds

If you would like to include an interactive calculator or our verified SVG data source badge directly in the article, here is the zero-dependency HTML snippet:

<a href="https://smarter.poker/research" target="_blank" rel="noopener">Smarter.Poker Empirical Poker Research & Benchmarks</a>

Best regards,
Smarter.Poker Research & Partnerships Team`,
  },
  {
    id: 'competitor-404',
    todoItemNumber: 8,
    title: 'Broken Backlink & 404 Legacy Tool Replacement (PokerStove / Equilab / ICMIZER)',
    targetAudience: 'Poker Strategy Blogs, Resource Directories & Forum Sticky Threads Linking To Dead Or Windows-Only Legacy Software',
    destinationUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    comparisonUrl: 'https://smarter.poker/compare/smarter-poker-vs-equilab-pokerstove',
    badgeType: 'gto',
    searchFootprints: [
      'intitle:"poker tools" OR intitle:"poker resources" "pokerstove.com"',
      'intitle:"poker calculators" "equilab" OR "pokerstove"',
      '"icmizer" "free alternative" poker blog',
      'inurl:resources "poker odds calculator" "download"',
    ],
    emailSubjectTemplate: 'Broken / Legacy Poker Calculator Link On {{target}} (+ Free Web-Native Replacement)',
    emailBodyTemplate: `Hi {{target}} Team,

While reviewing your poker strategy resource page, we noticed a link pointing to legacy Windows-only software (PokerStove / Equilab). Since most players now study on mobile and modern browsers without Windows installers, we built a 100% free, zero-download browser replacement that supports Hold'em, PLO4/5/6, Stud, Razz, and Malmuth-Harville ICM:

Direct Calculator: https://smarter.poker/tools/poker-odds-calculator
Side-By-Side Benchmark Comparison: https://smarter.poker/compare/smarter-poker-vs-equilab-pokerstove
Iframe Widget Embed (If You Want Readers To Calculate Odds On Your Page): https://smarter.poker/tools/embeds

Feel free to swap in or add the web version so mobile and Mac readers have a working calculator.

Best regards,
Smarter.Poker Engineering Team`,
  },
  {
    id: 'cardroom-awards',
    todoItemNumber: 9,
    title: 'US Live Poker Room Directory & Regional Benchmark Attribution Badges',
    targetAudience: 'Poker Room Marketing Directors, Casino Resort Webmasters & Texas Card Club Owners',
    destinationUrl: 'https://smarter.poker/hub/poker-near-me',
    researchUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    badgeType: 'award-top50',
    searchFootprints: [
      '"poker room" "waitlist" "promotions" site:.com',
      '"card club" "texas" "daily tournaments" poker',
      '"las vegas" "poker room" "cash games" schedule',
      '"florida" "poker room" "high hand" promotions',
    ],
    emailSubjectTemplate: 'Smarter.Poker Live Venue Directory Listing & Benchmark Badge For {{target}}',
    emailBodyTemplate: `Hi {{target}} Poker Room Management,

{{target}} is listed in the Smarter.Poker US Live Poker Room Directory (324+ tracked venues) and regional rake/tournament benchmark studies.

If your team would like to link to your listing or display our Live Poker Room Index SVG Badge on your website footer or poker room information page, here is the zero-dependency HTML snippet:

<a href="https://smarter.poker/hub/poker-near-me" target="_blank" rel="noopener" title="{{target}} In The Smarter.Poker US Live Poker Room Directory"><img src="https://smarter.poker/api/seo/badge?type=award-top50" alt="US Live Poker Room Index: Smarter.Poker Directory" height="28" /></a>

US Rake & Jackpot Benchmark Study: https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark
Club Commander Floor & Waitlist Platform: https://smarter.poker/features/club-commander-poker-room-management

Best regards,
Smarter.Poker Live Venue Directory Team`,
  },
  {
    id: 'cpa-tax-w2g',
    todoItemNumber: 10,
    title: 'CPA, Tax Attorney & Form W-2G Gambling Tax Resource Link Campaign',
    targetAudience: 'Gaming CPA Firms, Tax Attorneys, Enrolled Agents & Financial Planning Blogs Covering IRS Form W-2G',
    destinationUrl: 'https://smarter.poker/features/bankroll-tax-tracker',
    researchUrl: 'https://smarter.poker/research/us-poker-player-tax-w2g-reporting-and-session-accounting-benchmark',
    badgeType: 'award-cpa',
    searchFootprints: [
      '"Form W-2G" "gambling losses" "Schedule C" poker CPA',
      '"professional gambler" "tax deductions" "session log" IRS',
      '"poker tax" "win loss statement" accountant blog',
    ],
    emailSubjectTemplate: 'Free IRS Form W-2G & Schedule C Poker Session Ledger Resource For {{target}} Clients',
    emailBodyTemplate: `Hi {{target}} Tax Advisory Team,

We saw your guide on reporting gambling income, IRS Form W-2G jackpots, and contemporaneously logged session records. To help poker players and casino dealers maintain audit-ready documentation for their CPAs, Smarter.Poker provides a 100% free Form W-2G & Schedule C Session Ledger with receipt scanning and one-click CSV accountant exports:

Tax & Bankroll Ledger Guide: https://smarter.poker/features/bankroll-tax-tracker
W-2G Tax Reporting Study: https://smarter.poker/research/us-poker-player-tax-w2g-reporting-and-session-accounting-benchmark

If you maintain a client resource list on your website, here is a clean citation snippet:

<a href="https://smarter.poker/features/bankroll-tax-tracker" target="_blank" rel="noopener">Smarter.Poker Free IRS Form W-2G & Schedule C Poker Session Tax Ledger</a>

Best regards,
Smarter.Poker Compliance & Financial Tools Team`,
  },
  {
    id: 'dealer-schools',
    todoItemNumber: 11,
    title: 'Casino Dealer Schools & Hospitality Career Resource Pages',
    targetAudience: 'Casino Dealing Academies, Vocational Hospitality Programs & Casino Career Portals',
    destinationUrl: 'https://smarter.poker/features/poker-dealer-toke-tracker',
    researchUrl: 'https://smarter.poker/research/poker-dealer-toke-and-hourly-rate-benchmark',
    badgeType: 'award-dealer',
    searchFootprints: [
      '"casino dealer school" OR "poker dealer training" resources',
      '"become a poker dealer" "audition" "toke" guide',
      '"hospitality management" "casino operations" site:.edu',
    ],
    emailSubjectTemplate: 'Free Dealer Toke Tracker, Shift Income Benchmark & Pot-Limit Calculator For {{target}} Students',
    emailBodyTemplate: `Hi {{target}} Instructor Team,

We built two free resources specifically for graduating and working casino poker dealers that your students can use on their phones without any subscription:

1. 2026 Casino Poker Dealer Toke & Hourly Rate Benchmark Study: https://smarter.poker/research/poker-dealer-toke-and-hourly-rate-benchmark
2. Free Poker Dealer Toke Tracker & Multi-Casino Shift Calendar: https://smarter.poker/features/poker-dealer-toke-tracker
3. Six-Game Odds & Pot Calculator (Hold'em, PLO4/5/6, Stud, Razz): https://smarter.poker/tools/poker-odds-calculator

You are welcome to link or embed these on your student career resources page.

Best regards,
Smarter.Poker Casino Operations Team`,
  },
  {
    id: 'edu-quant-clubs',
    todoItemNumber: 11,
    title: 'University .edu Game Theory, Computer Science & Quantitative Trading Poker Clubs',
    targetAudience: 'University Quantitative Finance Clubs, Collegiate Poker Societies & Game Theory Course Syllabi',
    destinationUrl: 'https://smarter.poker/api/datasets/catalog',
    researchUrl: 'https://smarter.poker/research',
    badgeType: 'award-edu',
    searchFootprints: [
      'site:.edu "poker" "game theory" OR "quantitative"',
      'site:.edu "texas holdem" "monte carlo" OR "nash equilibrium"',
      '"quant poker" OR "MIT pokerbots" resources',
    ],
    emailSubjectTemplate: 'Open CC-BY 4.0 Quantitative Poker Datasets & Browser ICM/GTO Solvers For {{target}}',
    emailBodyTemplate: `Hi {{target}} Officers & Faculty,

For students researching imperfect-information game theory, Malmuth-Harville ICM, or Monte Carlo equity simulation, Smarter.Poker has released our 2026 Open Quantitative Poker Data Catalog under Creative Commons CC-BY 4.0, along with a public 26-tool Model Context Protocol (MCP) server:

Open Dataset Catalog (Schema.org / Zenodo / CITATION.cff): https://smarter.poker/api/datasets/catalog
Empirical Research Library (15 Studies): https://smarter.poker/research
169 Starting Hand GTO Preflop Encyclopedia: https://smarter.poker/learn/hands
Official Poker Rules & TDA Floor Rulings (30 Rules): https://smarter.poker/rules
Poker Variants & Mixed Games Hub (15 Games): https://smarter.poker/games

Feel free to include our open dataset catalog in your club resources or course reading list.

Best regards,
Smarter.Poker Quantitative Research Division`,
  },
  {
    id: 'podcast-show-notes',
    todoItemNumber: 18,
    title: 'Poker Podcast, YouTube & Twitch Vlog Show-Notes Attribution Kit',
    targetAudience: 'Poker Podcasters, YouTube Hand Breakdown Creators, Live Vloggers & Twitch Streamers',
    destinationUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    researchUrl: 'https://smarter.poker/tools/embeds',
    badgeType: 'gto',
    searchFootprints: [
      '"poker podcast" "show notes" "hand breakdown"',
      '"poker vlog" "pot odds" "icm" youtube description',
      '"twitch.tv" poker streamer "!odds" OR "nightbot"',
    ],
    emailSubjectTemplate: 'One-Click Hand Equity Links & Twitch !odds / !icm Chatbot Commands For {{target}}',
    emailBodyTemplate: `Hi {{target}},

To make hand breakdowns faster for your viewers and chat, we launched two free creator utilities on Smarter.Poker:

1. Show-Notes Attribution Links: Drop exact preflop range, ICM, and pot-odds calculator links into your YouTube/Podcast descriptions so viewers can run the math alongside your episode: https://smarter.poker/tools/poker-odds-calculator
2. Twitch / YouTube Nightbot & StreamElements Commands (!odds, !icm, !pushfold, !potodds): Add live poker math directly to your stream chat with zero setup: https://smarter.poker/api/stream/cmd?cmd=help

All embed codes and streamer widgets are available at: https://smarter.poker/tools/embeds

Best regards,
Smarter.Poker Creator Partnerships`,
  },
  {
    id: 'multilingual',
    todoItemNumber: 20,
    title: 'Multilingual International Backlink & Calculator Embed Campaign (ES, PT-BR, DE, FR, IT, JA)',
    targetAudience: 'Latin American, Brazilian, European & Japanese Poker Portals, Forums & Strategy Blogs',
    destinationUrl: 'https://smarter.poker/tools/embeds',
    researchUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    badgeType: 'gto',
    searchFootprints: [
      '"calculadora de odds" poker blog site:.br OR site:.es',
      '"poker odds rechner" kostenlos site:.de OR site:.at',
      '"calculateur cote poker" gratuit site:.fr',
      '"ポーカー オッズ 計算" ツール',
    ],
    emailSubjectTemplate: 'Free Embeddable Poker Calculators & Localized Badges For {{target}}',
    emailBodyTemplate: `Hi {{target}} Editorial Team,

Your readers can now embed Smarter.Poker's free web calculators (Odds, ICM, Push/Fold, Pot Odds, Bankroll & Bounty) with localized attribution snippets in Spanish, Brazilian Portuguese, German, French, Italian, and Japanese:

Embed Gallery: https://smarter.poker/tools/embeds
Localized Outreach & Snippet API: https://smarter.poker/api/seo/outreach-generator?campaign=multilingual

Best regards,
Smarter.Poker International Syndication Team`,
  },
];

export function buildMultilingualEmbedBundle(lang = 'en', canonicalUrl = 'https://smarter.poker/tools/poker-odds-calculator') {
  const locale = SUPPORTED_OUTREACH_LANGUAGES[lang] || SUPPORTED_OUTREACH_LANGUAGES.en;
  const badgeUrl = `https://smarter.poker/api/seo/badge?type=gto&label=${encodeURIComponent(locale.badgeLabel)}&value=${encodeURIComponent(locale.badgeValue)}`;

  return {
    language: locale.code,
    languageName: locale.name,
    canonicalUrl,
    htmlBacklink: `<a href="${canonicalUrl}" target="_blank" rel="noopener" hreflang="${locale.code}">${locale.anchorTitle}</a>`,
    badgeEmbedHtml: `<a href="${canonicalUrl}" target="_blank" rel="noopener" title="${locale.anchorTitle}"><img src="${badgeUrl}" alt="${locale.badgeLabel}: ${locale.badgeValue}" height="28" /></a>`,
    markdownCitation: `[${locale.anchorTitle}](${canonicalUrl})`,
    bbcodeCitation: `[url=${canonicalUrl}]${locale.anchorTitle}[/url]`,
    iframeEmbed: `<div style="max-width:720px;margin:16px auto;"><iframe src="${canonicalUrl}?embed=true&lang=${locale.code}" width="100%" height="620" style="border:1px solid #1e293b;border-radius:12px;background:#0a0e1a;" loading="lazy" title="${locale.anchorTitle}"></iframe><p style="font-size:12px;text-align:right;margin:6px 0 0 0;font-family:sans-serif;"><a href="${canonicalUrl}" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none;">${locale.ctaText}</a></p></div>`,
  };
}

export function generateOutreachPackage({
  campaign = '',
  lang = 'en',
  target = 'Your Publication',
} = {}) {
  const normalizedCampaign = String(campaign || '').trim().toLowerCase();
  const normalizedLang = String(lang || 'en').trim().toLowerCase();
  const cleanTarget = String(target || 'Your Publication').slice(0, 80);

  const selectedCampaigns = normalizedCampaign
    ? OUTREACH_CAMPAIGNS.filter((c) => c.id === normalizedCampaign)
    : OUTREACH_CAMPAIGNS;

  const renderedCampaigns = selectedCampaigns.map((c) => {
    const localized = buildMultilingualEmbedBundle(normalizedLang, c.destinationUrl);
    return {
      ...c,
      renderedSubject: c.emailSubjectTemplate.replace(/\{\{target\}\}/g, cleanTarget),
      renderedBody: c.emailBodyTemplate.replace(/\{\{target\}\}/g, cleanTarget),
      localizedSnippets: localized,
    };
  });

  const allLanguageBundles = Object.keys(SUPPORTED_OUTREACH_LANGUAGES).map((code) =>
    buildMultilingualEmbedBundle(code, 'https://smarter.poker/tools/poker-odds-calculator')
  );

  return {
    schema_version: '2026-11-09',
    platform: 'Smarter.Poker Automated Backlink Outreach & Multilingual Syndication Engine',
    endpoint: 'https://smarter.poker/api/seo/outreach-generator',
    requested_language: SUPPORTED_OUTREACH_LANGUAGES[normalizedLang] ? normalizedLang : 'en',
    supported_languages: Object.keys(SUPPORTED_OUTREACH_LANGUAGES),
    campaigns_count: renderedCampaigns.length,
    campaigns: renderedCampaigns,
    multilingual_bundles: allLanguageBundles,
  };
}
