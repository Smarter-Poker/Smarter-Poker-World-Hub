import { readFile } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url);

export const HORSES_CONSOLE_SOURCES = Object.freeze([
  'pages/horses/index.js',
  'src/components/horses/dynamicPanels.js',
  'src/components/horses/tabRegistry.js',
  'src/components/horses/StablePanel.jsx',
  'src/components/horses/FleetPanel.jsx',
  'src/components/horses/PipelinePanel.jsx',
  'src/components/horses/SettingsPanel.jsx',
  'src/components/horses/StatsPanel.jsx',
  'src/components/horses/MerchPanel.jsx',
  'src/components/horses/PromoPanel.jsx',
  'src/components/horses/EconomyPanel.jsx',
  'src/components/horses/MintPanel.jsx',
  'src/components/horses/AntiAbusePanel.jsx',
  'src/components/horses/ClubArenaPanel.jsx',
  'src/components/horses/BugReportsPanel.jsx',
  'src/components/horses/GeevesPanel.jsx',
  'src/components/horses/ReviewsPanel.jsx',
  'src/components/horses/ScrapersPanel.jsx',
  'src/components/horses/AuditPanel.jsx',
  'src/components/horses/StaffPanel.jsx',
  'src/components/horses/ApprovalsPanel.jsx',
  'src/components/horses/PlayersPanel.jsx',
  'src/components/horses/IntegrityPanel.jsx',
  'src/components/horses/FloorPanel.jsx',
  'src/components/horses/TournamentsPanel.jsx',
  'src/components/horses/CashierPanel.jsx',
  'src/components/horses/RakePanel.jsx',
  'src/components/horses/PlatformPanel.jsx',
  'src/components/horses/SqlConsolePanel.jsx',
  'src/components/horses/HgModerationPanel.jsx',
  'src/components/horses/HandReviewsPanel.jsx',
]);

export const readHorsesSource = (path) => readFile(new URL(path, ROOT), 'utf8');

export async function readHorsesConsoleSource() {
  return (await Promise.all(HORSES_CONSOLE_SOURCES.map(readHorsesSource))).join('\n');
}
