import React from 'react';
import dynamic from 'next/dynamic';
import styles from './shared.module.css';

function loadingState(label) {
  function DynamicPanelState({ error, retry }) {
    if (!error) return <div className={styles.stateNote} role="status">Loading {label}</div>;
    return (
      <div className={styles.boundary} role="alert">
        <h2 className={styles.boundaryTitle}>{label} Could Not Be Loaded</h2>
        <p className={styles.boundaryText}>
          The Code For This Tab Did Not Arrive. Check The Connection, Or Reload
          The Page If The Console Was Just Deployed.
        </p>
        {error.message ? <code className={styles.boundaryCode}>{error.message}</code> : null}
        <button type="button" className={styles.boundaryBtn} onClick={retry}>Try Again</button>
      </div>
    );
  }
  DynamicPanelState.displayName = `Dynamic${label.replace(/[^A-Za-z0-9]/g, '')}State`;
  return DynamicPanelState;
}

/* Every import and options object is explicit at module scope. */
const FleetPanel = dynamic(() => import('./FleetPanel'), { ssr: false, loading: loadingState('Fleet Command') });
const StablePanel = dynamic(() => import('./StablePanel'), { ssr: false, loading: loadingState('Social Horses') });
const PipelinePanel = dynamic(() => import('./PipelinePanel'), { ssr: false, loading: loadingState('Pipeline') });
const SettingsPanel = dynamic(() => import('./SettingsPanel'), { ssr: false, loading: loadingState('Settings') });
const StatsPanel = dynamic(() => import('./StatsPanel'), { ssr: false, loading: loadingState('Statistics') });
const MerchPanel = dynamic(() => import('./MerchPanel'), { ssr: false, loading: loadingState('Merch Catalog') });
const EconomyPanel = dynamic(() => import('./EconomyPanel'), { ssr: false, loading: loadingState('Economy') });
const MintPanel = dynamic(() => import('./MintPanel'), { ssr: false, loading: loadingState('The Mint') });
const StaffPanel = dynamic(() => import('./StaffPanel'), { ssr: false, loading: loadingState('Staff And Roles') });
const ApprovalsPanel = dynamic(() => import('./ApprovalsPanel'), { ssr: false, loading: loadingState('Approvals') });
const PlayersPanel = dynamic(() => import('./PlayersPanel'), { ssr: false, loading: loadingState('Players') });
const IntegrityPanel = dynamic(() => import('./IntegrityPanel'), { ssr: false, loading: loadingState('Integrity') });
const FloorPanel = dynamic(() => import('./FloorPanel'), { ssr: false, loading: loadingState('Live Floor') });
const TournamentsPanel = dynamic(() => import('./TournamentsPanel'), { ssr: false, loading: loadingState('Tournaments') });
const CashierPanel = dynamic(() => import('./CashierPanel'), { ssr: false, loading: loadingState('Cashier') });
const RakePanel = dynamic(() => import('./RakePanel'), { ssr: false, loading: loadingState('Rake') });
const PlatformPanel = dynamic(() => import('./PlatformPanel'), { ssr: false, loading: loadingState('Platform Operations') });
const AntiAbusePanel = dynamic(() => import('./AntiAbusePanel'), { ssr: false, loading: loadingState('Anti-Abuse') });
const ClubArenaPanel = dynamic(() => import('./ClubArenaPanel'), { ssr: false, loading: loadingState('Club Arena') });
const BugReportsPanel = dynamic(() => import('./BugReportsPanel'), { ssr: false, loading: loadingState('Bug Reports') });
const GeevesPanel = dynamic(() => import('./GeevesPanel'), { ssr: false, loading: loadingState('Geeves KB') });
const ReviewsPanel = dynamic(() => import('./ReviewsPanel'), { ssr: false, loading: loadingState('Reviews') });
const ScrapersPanel = dynamic(() => import('./ScrapersPanel'), { ssr: false, loading: loadingState('Scrapers') });
const PromoPanel = dynamic(() => import('./PromoPanel'), { ssr: false, loading: loadingState('Promo Codes') });
const AuditPanel = dynamic(() => import('./AuditPanel'), { ssr: false, loading: loadingState('Audit Log') });
const SqlConsolePanel = dynamic(() => import('./SqlConsolePanel'), { ssr: false, loading: loadingState('SQL Console') });
const HgModerationPanel = dynamic(() => import('./HgModerationPanel'), { ssr: false, loading: loadingState('HG Moderation') });
const HandReviewsPanel = dynamic(() => import('./HandReviewsPanel'), { ssr: false, loading: loadingState('Hand Reviews') });
const ClubsUnionsPanel = dynamic(() => import('./ClubsUnionsPanel'), { ssr: false, loading: loadingState('Club And Union Operations') });
const AnnouncementsPanel = dynamic(() => import('./AnnouncementsPanel'), { ssr: false, loading: loadingState('Announcements') });

export const TAB_PANEL_COMPONENTS = Object.freeze({
  stable: StablePanel,
  fleet: FleetPanel,
  pipeline: PipelinePanel,
  settings: SettingsPanel,
  stats: StatsPanel,
  merch: MerchPanel,
  promo: PromoPanel,
  economy: EconomyPanel,
  mint: MintPanel,
  antiabuse: AntiAbusePanel,
  clubarena: ClubArenaPanel,
  bugreports: BugReportsPanel,
  geeves: GeevesPanel,
  reviews: ReviewsPanel,
  scrapers: ScrapersPanel,
  audit: AuditPanel,
  staff: StaffPanel,
  approvals: ApprovalsPanel,
  players: PlayersPanel,
  integrity: IntegrityPanel,
  floor: FloorPanel,
  tournaments: TournamentsPanel,
  cashier: CashierPanel,
  rake: RakePanel,
  platform: PlatformPanel,
  'sql-console': SqlConsolePanel,
  'hg-moderation': HgModerationPanel,
  'hand-reviews': HandReviewsPanel,
});

export const CLUB_ARENA_SECTION_COMPONENTS = Object.freeze({
  operations: ClubsUnionsPanel,
  announcements: AnnouncementsPanel,
});

export const panelComponentFor = (tabId) => TAB_PANEL_COMPONENTS[tabId] || null;
export const clubArenaSectionComponentFor = (sectionId) => (
  CLUB_ARENA_SECTION_COMPONENTS[sectionId] || null
);
