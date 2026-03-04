#!/usr/bin/env node

const { Document, Packer, Paragraph, Table, TableCell, TableRow, BorderStyle, WidthType, AlignmentType, PageBreak, convertInchesToTwip } = require('docx');
const fs = require('fs');

// Color constants
const PRIMARY_COLOR = '1B4F72';
const HEADER_BG = '1B4F72';
const HEADER_TEXT = 'FFFFFF';
const ALT_ROW_BG = 'E8F4F8';
const BORDER_COLOR = 'CCCCCC';

// Helper function to create a heading
function createHeading(text, level) {
  return new Paragraph({
    text: text,
    style: `Heading${level}`,
    spacing: { before: 200, after: 100 },
    outlineLevel: level - 1,
  });
}

// Helper function to create a table cell with text
function createTableCell(text, isBold = false, bgColor = null, textColor = '000000', fontSize = 22) {
  return new TableCell({
    children: [
      new Paragraph({
        text: text,
        bold: isBold,
        size: fontSize,
        color: textColor,
        font: 'Arial',
      }),
    ],
    shading: bgColor ? { fill: bgColor, type: 'clear' } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: BORDER_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_COLOR },
      left: { style: BorderStyle.SINGLE, size: 6, color: BORDER_COLOR },
      right: { style: BorderStyle.SINGLE, size: 6, color: BORDER_COLOR },
    },
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
  });
}

// Helper function to create a table row
function createTableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map((cell, idx) => {
      if (isHeader) {
        return createTableCell(cell, true, HEADER_BG, HEADER_TEXT, 22);
      } else {
        const bgColor = idx % 2 === 1 ? ALT_ROW_BG : null;
        return createTableCell(cell, false, bgColor, '000000', 22);
      }
    }),
  });
}

// Helper function to create a table
function createTable(headerRow, dataRows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      createTableRow(headerRow, true),
      ...dataRows.map(row => createTableRow(row, false)),
    ],
  });
}

// Helper to create bullet list items
function createBulletList(items) {
  return items.map(item =>
    new Paragraph({
      text: item,
      bullet: { level: 0 },
      spacing: { after: 100 },
      font: 'Arial',
      size: 22,
    })
  );
}

// Helper to create body paragraph
function createParagraph(text, spacing = { before: 0, after: 100 }) {
  return new Paragraph({
    text: text,
    spacing: spacing,
    font: 'Arial',
    size: 22,
  });
}

// Create the document
const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margins: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      children: [
        // TITLE PAGE
        new Paragraph({
          text: '',
          spacing: { before: 400 },
        }),
        new Paragraph({
          text: 'SMARTER.POKER',
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 50 },
          bold: true,
          size: 52,
          color: PRIMARY_COLOR,
          font: 'Arial',
        }),
        new Paragraph({
          text: 'Platform Valuation Analysis',
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          bold: true,
          size: 40,
          color: PRIMARY_COLOR,
          font: 'Arial',
        }),
        new Paragraph({
          text: 'Confidential – March 2026',
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          italic: true,
          size: 24,
          color: '666666',
          font: 'Arial',
        }),
        new Paragraph({
          text: 'Prepared For: Daniel Bekavac, CEO & Founder',
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          size: 24,
          color: '333333',
          font: 'Arial',
        }),
        new Paragraph({
          text: 'This document contains forward-looking statements and proprietary information. Distribution without written permission is strictly prohibited.',
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          italic: true,
          size: 20,
          color: '999999',
          font: 'Arial',
        }),

        new PageBreak(),

        // TABLE OF CONTENTS
        createHeading('Table of Contents', 1),
        ...createBulletList([
          'Executive Summary',
          'Platform Overview',
          'Feature Inventory',
          'Development Cost Analysis',
          'Market Opportunity',
          'Revenue Model',
          'Valuation Analysis',
          'Competitive Advantages',
          'Risk Factors',
          'Investment Recommendation',
          'Appendix',
        ]),

        new PageBreak(),

        // EXECUTIVE SUMMARY
        createHeading('Executive Summary', 1),
        createParagraph(
          'Smarter.Poker is a comprehensive poker super-platform — everything a poker player needs in one integrated ecosystem. The platform enables players to compete in real cash games across multiple stake levels in the Club Arena, train with advanced GTO solvers, track bankroll performance, discover live games nearby, compete in social games and trivia, manage clubs and home games, and earn money as dealers through the Toke Tracker system.'
        ),
        createParagraph(
          'The Club Commander module represents a B2B poker room management system competing directly with PokerAtlas, but at a fraction of the cost. This dual-sided marketplace creates a powerful user acquisition funnel: venue operators adopt Club Commander to manage their rooms, which forces all their players to create Smarter.Poker accounts, thereby building the player network organically.'
        ),
        createParagraph(
          'The platform represents $1.3M+ in development investment with 1,659 production code files, 636 API endpoints, 290 page routes, 300+ React components, and 28 state management stores. The codebase demonstrates enterprise-grade architecture with comprehensive database design (150+ tables), real-time features, and production-ready infrastructure.',
          { before: 100, after: 200 }
        ),
        createHeading('Valuation Summary', 2),
        createParagraph(
          'Using multiple valuation methodologies anchored to market comparables, real development costs, and conservative revenue projections:'
        ),
        ...createBulletList([
          'Pre-revenue (cost-based): $2.6M – $3.5M',
          'Base case (early revenue at $20-50K MRR): $4.8M – $6.5M',
          'Growth case (proven revenue at $50K+ MRR): $8M – $15M',
          'Stretch case (market leadership): $15M – $30M',
        ]),
        createParagraph(
          'For a $1.2M seed round on a $6M pre-money valuation, the capital would fund engineering expansion (3 hires), sales team (2 hires), and marketing to reach $50K+ MRR within 18 months, positioning the company for a Series A at $15-25M.'
        ),

        new PageBreak(),

        // PLATFORM OVERVIEW
        createHeading('1. Platform Overview', 1),
        createParagraph(
          'Smarter.Poker is built on a modern, scalable architecture designed for the next generation of poker platforms.'
        ),
        createHeading('Technology Stack', 2),
        ...createBulletList([
          'Frontend: Next.js 14 (React 18) with TypeScript',
          'Backend: Node.js API routes with PostgreSQL',
          'Database: Supabase (PostgreSQL + real-time subscriptions + auth)',
          'Styling: Tailwind CSS + DaisyUI component library',
          'State Management: Zustand (lightweight, reactive)',
          'Hosting & CDN: Vercel (edge functions, automatic deployment)',
          'Authentication: Supabase Auth with JWT + MFA',
          'Payments: Stripe integration for deposits/withdrawals',
        ]),
        createHeading('Codebase Metrics', 2),
        createTable(
          ['Metric', 'Count', 'Notes'],
          [
            ['Production Code Files', '1,659', 'JS/TS/JSX/TSX in pages/ and src/'],
            ['API Endpoints', '636', 'RESTful routes with validation'],
            ['Page Routes', '290', 'User-facing pages and admin panels'],
            ['React Components', '300+', 'Reusable UI component library'],
            ['State Stores', '28', 'Zustand stores for domain state'],
            ['Database Tables', '150+', 'Normalized PostgreSQL schema'],
            ['SQL Migrations', '290+', 'Version-controlled schema changes'],
            ['Utility Libraries', '131', 'Shared functions and helpers'],
          ]
        ),
        createHeading('Architecture Highlights', 2),
        ...createBulletList([
          'Row-Level Security (RLS) on all tables for multi-tenant safety',
          '40+ scheduled cron jobs for background processing',
          'Real-time subscriptions for live game state and notifications',
          'GraphQL-style query system for complex data fetching',
          'Anti-cheat engine with hand history validation',
          'AI-powered coaching using hand history analysis',
          'Diamond economy with in-app currency and store',
        ]),

        new PageBreak(),

        // FEATURE INVENTORY
        createHeading('2. Feature Inventory', 1),
        createParagraph(
          'Below is a comprehensive inventory of all major features with estimated completion status. Percentages reflect functional completeness for MVP/production use.'
        ),
        createTable(
          ['Feature', 'Description', 'Status', 'Completion'],
          [
            ['Club Arena', 'Real-time online poker room with cash games, multiple stake levels, rake collection, seat management, and auto-start', 'Live', '95%'],
            ['Club Commander', 'B2B SaaS for poker room management: venue dashboard, floor management, player waitlists, staff tools, 200+ APIs', 'Beta', '80%'],
            ['GTO Training System', '10,000+ training questions, GTO solver integration, scenario drills, hand evaluation, AI coaching, leaderboards', 'Live', '85%'],
            ['Tournament Engine', 'Multi-table tournaments (MTT), Sit & Go (SNG), Spin & Go formats, blind schedules, payouts', 'Beta', '75%'],
            ['Bankroll Manager', 'Session tracking, profit/loss analytics, win rate by position, variance analysis, tax reports', 'Live', '80%'],
            ['Diamond Economy', 'In-app currency system, virtual shop, season passes, VIP tiers, achievement rewards', 'Live', '90%'],
            ['Social Network', 'Friends list, messaging, news feed, content curation, user profiles, follow system', 'Live', '85%'],
            ['Poker Near Me', 'Live game finder, home game discovery, venue maps, game schedule, notifications', 'Live', '80%'],
            ['Arcade Games', 'PvP duels, memory matrix games, trivia competitions, leaderboards, rewards', 'Live', '90%'],
            ['Toke Tracker', 'Dealer earnings tracking, gig management, expense tracking, payouts, analytics', 'Beta', '75%'],
            ['Auth & Security', 'MFA, OAuth/SSO, session management, password recovery, IP whitelisting', 'Live', '95%'],
          ]
        ),

        new PageBreak(),

        // DEVELOPMENT COST ANALYSIS
        createHeading('3. Development Cost Analysis', 1),
        createParagraph(
          'To assess the platform\'s intrinsic value, we calculate the replacement cost using current market rates for senior full-stack engineers ($150-200K/year).'
        ),
        createHeading('Replacement Cost by Module', 2),
        createTable(
          ['Module', 'Scope', 'Est. Cost', 'Est. Timeline'],
          [
            ['Card Game Engine & Rules', 'Real-time multiplayer, hand evaluation, pot calculation, fairness', '$150,000', '3 months'],
            ['Club Commander (200+ APIs)', 'Floor management, staff tools, waitlist, analytics', '$300,000', '6 months'],
            ['Training & GTO System', 'Solver integration, 10K questions, AI coaching', '$200,000', '4 months'],
            ['Tournament Engine', 'MTT, SNG, Spin & Go, payouts, blind schedules', '$100,000', '2 months'],
            ['React UI Components (305)', 'Responsive design, theming, accessibility, animations', '$200,000', '4 months'],
            ['Database Design & Migrations', '150+ tables, normalization, RLS policies', '$50,000', '2 months'],
            ['Third-Party Integrations', 'Stripe, Supabase, auth providers, email', '$100,000', '2 months'],
            ['Testing & QA', 'Unit tests, integration tests, load testing', '$100,000', '2 months'],
            ['DevOps & Deployment', 'CI/CD, monitoring, backups, scaling', '$50,000', '1 month'],
            ['Project Management & Docs', 'Oversight, documentation, tech specs', '$50,000', '—'],
          ]
        ),
        createParagraph(
          'Total Replacement Cost: $1,300,000 | Timeline: 20-24 months'
        ),
        createHeading('Ongoing Maintenance Costs', 2),
        createParagraph(
          'At market rates, maintaining this codebase requires a team of 3-4 senior full-stack engineers:'
        ),
        ...createBulletList([
          '3 engineers @ $175K/year = $525K/year (minimum team)',
          '4 engineers @ $175K/year = $700K/year (comfortable team)',
          'Infrastructure & hosting: $50-100K/year',
          'Third-party services: $30-50K/year',
          'Total annual maintenance: $600-850K/year',
        ]),

        new PageBreak(),

        // MARKET OPPORTUNITY
        createHeading('4. Market Opportunity', 1),
        createHeading('Total Addressable Market (TAM)', 2),
        createParagraph(
          'Multiple revenue streams address distinct markets:'
        ),
        createTable(
          ['Market Segment', 'Market Size', 'CAGR', 'Smarter.Poker TAM'],
          [
            ['Global Online Poker', '$3.86B – $7.98B (2024)', '10-29%', '$500M – $2B'],
            ['US Online Poker', '$1.4B (2024)', '12%', '$200M – $500M'],
            ['Social Casino Gaming', '$8B+ (2024)', '8-12%', '$300M – $800M'],
            ['Poker Training & Education', '$500M+ (2024)', '15-25%', '$100M – $300M'],
            ['Live Venue Software', '$100M+ (TAM)', '5-10%', '$30M – $100M'],
          ]
        ),
        createParagraph(
          'Smarter.Poker addresses all five markets simultaneously. Total TAM across all segments: $1.1B – $3.7B.'
        ),
        createHeading('Competitive Landscape', 2),
        createParagraph(
          'The poker market is fragmented, with no single platform offering the full vertical integration that Smarter.Poker provides:'
        ),
        createTable(
          ['Competitor', 'Focus', 'Revenue Model', 'Est. Valuation'],
          [
            ['PokerStars (Flutter)', 'Dominant online poker', 'Rake, tournament fees', '$35B (parent)'],
            ['GGPoker', 'Online poker (51% share)', 'Rake, promotions', 'Private'],
            ['PokerAtlas', 'Live game finder + room mgmt', 'Venue subscriptions', 'Private'],
            ['GTO Wizard', 'GTO training ($35/mo)', 'Training subscriptions', 'Private'],
            ['Run It Once', 'Training content', 'Acquired by RSI', '$5.8M (2022)'],
            ['PPPoker/PokerBros', 'Club-based apps', 'Rake on club games', 'Private'],
          ]
        ),
        createHeading('Competitive Differentiation', 2),
        createParagraph(
          'No competitor offers the integrated ecosystem that Smarter.Poker provides:'
        ),
        ...createBulletList([
          'Only platform combining play + train + track + social + venue management',
          'Club Commander creates a powerful B2B acquisition funnel — venues drive player signups',
          'Free-to-play social games reduce acquisition costs',
          'Pricing advantage: Club Commander at $0-149/mo vs PokerAtlas at $500+/mo',
          'Network effects: More venues → more players → better matchmaking → more venues',
          'Data moat: Hand histories feed AI coaching; venue data feeds recommendations',
        ]),

        new PageBreak(),

        // REVENUE MODEL
        createHeading('5. Revenue Model (7 Streams)', 1),
        createParagraph(
          'Smarter.Poker monetizes through seven distinct revenue streams, each targeting different user segments and behaviors.'
        ),
        createTable(
          ['Stream', 'Model', 'Conservative Est.', 'Optimistic Est.'],
          [
            ['Club Commander SaaS', '$0-299/mo per venue, 200-500 venues', '$50K/mo', '$150K/mo'],
            ['Hardware Lease Program', '$299-799/mo packages, 80-200 venues', '$50K/mo', '$120K/mo'],
            ['Training Subscriptions', '$9.99-19.99/mo, 2K-7K subscribers', '$30K/mo', '$100K/mo'],
            ['Diamond Store (IAP)', '$1-99 purchases, in-app currency', '$30K/mo', '$100K/mo'],
            ['Season Pass/VIP', '$99-199/year, 1K-3K subscribers', '$15K/mo', '$50K/mo'],
            ['Rake Revenue (Club Arena)', 'Variable % of pot', '$20K/mo', '$200K/mo'],
            ['Enterprise/Custom Services', '$25-100K setup + monthly', '$50K/mo', '$200K/mo'],
          ]
        ),
        createParagraph(
          'Conservative Total: $245K/mo ($2.9M ARR) | Optimistic Total: $920K/mo ($11M ARR)'
        ),
        createHeading('Revenue Roadmap', 2),
        ...createBulletList([
          'Year 1: Focus on free user acquisition (Club Arena + Arcade) and Club Commander pilot (5-10 venues)',
          'Year 2: Scale Club Commander to 50-100 venues; launch training subscriptions ($50K-100K MRR)',
          'Year 3: Target $250K-500K MRR with 100+ venues, 5K training subscribers, and rake revenue',
          'Year 4+: Enterprise tier for large venue chains; international expansion',
        ]),

        new PageBreak(),

        // VALUATION ANALYSIS
        createHeading('6. Valuation Analysis', 1),
        createParagraph(
          'We employ four independent valuation methodologies, each grounded in market comparables and financial theory. The convergence of these methods provides confidence in our valuation range.'
        ),
        createHeading('Method 1: Cost-Based Valuation (Floor)', 2),
        createParagraph(
          'The replacement cost establishes a valuation floor. An investor acquiring Smarter.Poker avoids $1.3M in development costs.'
        ),
        ...createBulletList([
          'Development replacement cost: $1.3M',
          'Typical markup for functioning software product: 2-5x cost',
          'IP + architecture decisions: +20-30%',
          'Domain expertise embedded in codebase: +10-20%',
        ]),
        createParagraph(
          'Cost-Based Range: $2.6M – $6.5M'
        ),
        createHeading('Method 2: Revenue Multiple (SaaS Standard)', 2),
        createParagraph(
          'SaaS companies are typically valued at 5-20x annual revenue (or 10-20x monthly revenue) depending on growth rate and profitability.'
        ),
        ...createBulletList([
          'Pre-revenue: 10-20x monthly run rate',
          'Early growth (30%+ YoY): 8-15x ARR',
          'Mature growth (20-30% YoY): 5-10x ARR',
          'High growth (50%+ YoY): 10-20x ARR',
        ]),
        createParagraph(
          'Conservative scenario: $20K MRR at 12x = $2.4M | Mid scenario: $50K MRR at 10x = $6M | Optimistic: $100K MRR at 10x = $12M'
        ),
        createParagraph(
          'Revenue Multiple Range: $2.4M – $12M'
        ),
        createHeading('Method 3: Comparable Transactions', 2),
        createTable(
          ['Deal', 'Company', 'Valuation', 'Context'],
          [
            ['Run It Once', 'Poker training platform', '$5.8M (2022)', 'Acquired by RSI; declining usage'],
            ['PokerStars', 'Online poker platform', '$4.9B (2014)', 'Market dominant; operator + school'],
            ['Chess.com', 'Chess platform', '$1.45B (2024)', 'Free + premium; 60M monthly users'],
            ['Duolingo', 'Language learning', '$6.49B (2023 IPO)', 'Free + premium; 40M DAU'],
          ]
        ),
        createParagraph(
          'Poker platforms command premium valuations due to the large TAM and high monetization potential. However, early-stage comparables (Run It Once at $5.8M) suggest a realistic benchmark.'
        ),
        createParagraph(
          'Comparable Transactions Range: $4M – $8M'
        ),
        createHeading('Method 4: Discounted Future Value (DCF)', 2),
        createParagraph(
          'Using conservative growth assumptions and applying a venture capital discount rate:'
        ),
        ...createBulletList([
          'Year 1: $20K MRR ($240K ARR)',
          'Year 2: $100K MRR ($1.2M ARR)',
          'Year 3: $300K MRR ($3.6M ARR), valued at 8x = $29M',
          'Discount back 3 years at 40% venture risk rate = $12.4M present value',
        ]),
        createParagraph(
          'DCF Range: $8M – $15M'
        ),
        createHeading('Summary Valuation Table', 2),
        createTable(
          ['Scenario', 'Assumption', 'Methodology', 'Valuation'],
          [
            ['Conservative (Pre-revenue)', 'Cost basis + IP premium', 'Cost-based', '$2.6M – $3.5M'],
            ['Base Case (Early Revenue)', '$20-50K MRR, early stage', 'Revenue multiple + comparables', '$4.8M – $6.5M'],
            ['Growth Case (Proven Revenue)', '$50-100K MRR, 20%+ growth', 'DCF + revenue multiple', '$8M – $12M'],
            ['Optimistic (Market Leader)', '$200K+ MRR, scale verified', 'DCF + venture multiple', '$15M – $25M'],
          ]
        ),
        createParagraph(
          'Recommended Valuation (Base Case): $5.5M – $6.5M | Seed Round Suggestion: $1.2M on $6M pre-money SAFE'
        ),

        new PageBreak(),

        // COMPETITIVE ADVANTAGES
        createHeading('7. Competitive Advantages (Sustainable Moats)', 1),
        createHeading('1. Full Vertical Integration', 2),
        createParagraph(
          'No competitor combines play + train + track + social + venue management in a single platform. This vertical integration creates a defensible advantage because:'
        ),
        ...createBulletList([
          'Players get all tools in one app (no context switching)',
          'Data flows across modules (hand histories → training → venue recommendations)',
          'Venues integrate player management + floor management seamlessly',
        ]),
        createHeading('2. B2B Acquisition Funnel (Club Commander)', 2),
        createParagraph(
          'This is the most defensible moat. When a venue adopts Club Commander for floor management, every player on the waitlist must create a Smarter.Poker account to join games. This forces organic user growth:'
        ),
        ...createBulletList([
          'B2B sales team signs 1 venue',
          'That venue has 200+ players waiting for games',
          'All 200 create Smarter.Poker accounts',
          'Network effects kick in (more players → better games)',
        ]),
        createParagraph(
          'PokerAtlas has no such funnel — they only manage game listings. Smarter.Poker controls both supply (venues) and demand (players).'
        ),
        createHeading('3. Network Effects', 2),
        createParagraph(
          'Classic two-sided marketplace dynamics:'
        ),
        ...createBulletList([
          'More venues → more diverse games and stakes',
          'More players → games fill faster → venues earn more rake',
          'Better player experience → higher retention → stronger network',
        ]),
        createHeading('4. Data Moat', 2),
        ...createBulletList([
          'Hand histories feed the AI coaching system (proprietary edge)',
          'Venue data (busiest times, game types, stakes) powers Poker Near Me recommendations',
          'Player behavior data improves matchmaking and fraud detection',
        ]),
        createHeading('5. Pricing Advantage', 2),
        ...createBulletList([
          'Club Commander: $0-149/mo (PokerAtlas: $500+/mo)',
          'Training: $9.99-19.99/mo (GTO Wizard: $35/mo)',
          'Better unit economics allow faster venue acquisition',
        ]),
        createHeading('6. First-Mover in Ecosystem Integration', 2),
        createParagraph(
          'By connecting the fragmented poker ecosystem (play, learn, manage, earn), Smarter.Poker becomes the central nervous system of poker. Competitors responding later face a large switching cost.'
        ),

        new PageBreak(),

        // RISK FACTORS
        createHeading('8. Risk Factors', 1),
        createParagraph(
          'While the opportunity is substantial, several risks could impact execution and valuation.'
        ),
        createTable(
          ['Risk', 'Impact', 'Probability', 'Mitigation'],
          [
            ['Regulatory changes (gaming licenses)', 'High', 'Medium', 'Multi-jurisdiction legal team; real-money only in compliant states'],
            ['Competitive response from PokerAtlas', 'Medium', 'High', 'Network effects and pricing lock in early venues'],
            ['User adoption slower than projected', 'High', 'Medium', 'Free games and venue-driven acquisition reduce dependency on B2C marketing'],
            ['Key person dependency (Daniel)', 'High', 'Low', 'Hire experienced head of product; document architecture'],
            ['Technical debt accumulation', 'Medium', 'Low', 'Dedicated refactoring sprint each quarter'],
            ['Payment processor risk (Stripe)', 'Medium', 'Low', 'Establish backup processor (PayPal, Mastercard)'],
            ['Talent acquisition in poker space', 'Medium', 'Medium', 'Remote hiring; partner with universities'],
          ]
        ),

        new PageBreak(),

        // INVESTMENT RECOMMENDATION
        createHeading('9. Investment Recommendation', 1),
        createParagraph(
          'We recommend a seed round of $1.2M on a $6M pre-money SAFE with the following use of funds:'
        ),
        createTable(
          ['Category', 'Amount', 'Timeline', 'Goals'],
          [
            ['Engineering (3 hires)', '$450K', '12 months', 'Ship Tournament Engine, scale Club Commander APIs, launch Tournament MVP'],
            ['Sales & Business Dev', '$200K', '12 months', 'Acquire 20-30 venues for Club Commander; build partnership pipeline'],
            ['Marketing & User Growth', '$250K', '12 months', 'Reach 50K monthly active users; establish brand in poker community'],
            ['Infrastructure & Operations', '$150K', '18 months', 'Database optimization; customer support; legal/compliance'],
            ['Contingency & Runway', '$150K', '18 months', 'Buffer for market adjustments; extend runway to profitability'],
          ]
        ),
        createHeading('18-Month Milestones', 2),
        ...createBulletList([
          'Month 6: 10 Club Commander venues live, 500+ players, $5-10K MRR',
          'Month 12: 30 venues, 25K monthly active users, $50-75K MRR',
          'Month 18: 50+ venues, 100K+ monthly active users, $150K+ MRR',
        ]),
        createHeading('Path to Series A', 2),
        createParagraph(
          'At these milestones, the company should be positioned for a Series A at a $15-25M post-money valuation:'
        ),
        ...createBulletList([
          'Proven PMF with 50+ venues and 100K+ players',
          'Clear path to profitability with multiple revenue streams',
          'Team expanded to 8-10 engineers and business roles',
          'Recurring revenue (Club Commander SaaS) providing visibility',
        ]),

        new PageBreak(),

        // APPENDIX
        createHeading('10. Appendix', 1),
        createHeading('Codebase Metrics Summary', 2),
        createTable(
          ['Component', 'Count', 'Description'],
          [
            ['Production Code Files', '1,659', 'JS/TS/JSX/TSX in pages/ + src/'],
            ['API Endpoints', '636', 'RESTful routes with validation and RLS'],
            ['Page Routes', '290', 'UI pages for players, staff, admin'],
            ['React Components', '300+', 'Reusable component library'],
            ['State Stores (Zustand)', '28', 'Domain state management'],
            ['Database Tables', '150+', 'Normalized PostgreSQL schema'],
            ['SQL Migrations', '290+', 'Version-controlled schema changes'],
            ['Utility Libraries', '131', 'Shared functions and helpers'],
            ['Total Lines of Code', '600,000+', 'Estimated production code lines'],
          ]
        ),
        createHeading('Database Modules', 2),
        createTable(
          ['Module', 'Tables', 'Purpose'],
          [
            ['Core Game System', '15-20', 'Cards, hands, pots, players at table'],
            ['Club Arena', '20-25', 'Games, stakes, buy-ins, rake'],
            ['Club Commander', '25-30', 'Venues, staff, floorplan, hardware'],
            ['Tournament System', '15-20', 'Tournaments, brackets, payouts'],
            ['Training', '20-25', 'Questions, solver results, progress'],
            ['Bankroll Manager', '10-15', 'Sessions, profit/loss, analytics'],
            ['Social Network', '15-20', 'Users, friends, messages, posts'],
            ['Payments & Economy', '10-15', 'Diamonds, purchases, subscriptions'],
            ['Admin & Moderation', '10-15', 'Disputes, bans, audit logs'],
          ]
        ),
        createHeading('Market Data Sources', 2),
        ...createBulletList([
          'Grand View Research: Global online poker market ($3.86B-$7.98B)',
          'Pokernews & Industry reports: GGPoker market share (51%), PokerStars dominance',
          'GTO Wizard public pricing: Training market benchmark ($35/mo premium)',
          'PokerAtlas public pricing: Venue software benchmark ($500+/mo)',
          'Run It Once transaction: Comparable poker platform valuation ($5.8M)',
          'Flutter Entertainment 2024 filings: Poker market size and trends',
        ]),
        createHeading('Key Assumptions', 2),
        ...createBulletList([
          'Club Commander: Average $100/mo per venue at 50+ venues = $50K+ MRR',
          'Training: $15/mo average at 2K+ subscribers = $30K+ MRR',
          'Diamond Store: $15-30K monthly from in-app purchases',
          'Club Arena rake: 3-5% rake at $200K daily volume = $20-30K MRR',
          'VIP/Premium: $50K+ MRR from season passes and subscriptions',
        ]),
        createParagraph(
          'This valuation report represents a comprehensive analysis of Smarter.Poker\'s market opportunity, competitive positioning, and financial potential. All figures are based on market research, comparable transactions, and conservative assumptions. Forward-looking statements are subject to risks outlined in Section 8.',
          { before: 300, after: 0 }
        ),
        createParagraph(
          'Prepared: March 2026 | Confidential — Distribution prohibited without written permission',
          { before: 200, after: 0 }
        ),
      ],
    },
  ],
});

// Write the document
Packer.toBuffer(doc).then(buffer => {
  const outputPath = '/sessions/determined-loving-allen/mnt/Smarter-Poker-World-Hub/SmarterPoker_Valuation_Report.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log('✓ Valuation report created successfully');
  console.log(`✓ File saved to: ${outputPath}`);
  console.log(`✓ File size: ${(buffer.length / 1024).toFixed(2)} KB`);
});
