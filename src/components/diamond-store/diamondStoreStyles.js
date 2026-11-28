// ═══════════════════════════════════════════════════════════════════════════
// DIAMOND STORE STYLES: single source of truth.
// Imported by pages/hub/diamond-store.js AND the extracted tab components in
// this directory (MerchTab, VIPTab, ClubShopTab, RewardsTab). Edit here only.
// ═══════════════════════════════════════════════════════════════════════════

// #SMARTERDESIGN materials. These are the ONLY paint in this file: nine-slice
// chrome rims over ink-navy (panels, cards, wells) or control gradients.
// `border` must stay BEFORE `borderImage` in every object: the border
// shorthand resets border-image.
const SD_WHITE = '#F2F7FF';
const SD_SILVER = '#BDD0E2';
const SD_ICE = '#86DAFF';
const SD_CYAN = '#67E8F9';
const SD_LINE = '#445E77';
export const SD_PANEL = Object.freeze({
  border: '5px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
  borderRadius: 0,
  background: 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
  boxShadow: 'none',
  clipPath: 'none',
});
export const SD_CARD = Object.freeze({
  border: '5px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
  borderRadius: 0,
  background: 'linear-gradient(155deg, #162a3f 0%, #0a1a2a 43%, #050e18 87%)',
  boxShadow: '0 8px 18px rgba(0, 0, 0, 0.38)',
  clipPath: 'none',
});
export const SD_STAT = Object.freeze({
  border: '3px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-stat.webp') 11 / 4px stretch",
  borderRadius: 0,
  background: 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
  boxShadow: 'none',
  clipPath: 'none',
});
export const SD_ROW = Object.freeze({
  border: '3px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
  borderRadius: 0,
  background: 'linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c)',
  boxShadow: 'none',
  clipPath: 'none',
  color: SD_WHITE,
  minHeight: 44,
});
export const SD_COBALT = Object.freeze({
  border: '3px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-active.webp') 11 / 4px stretch",
  borderRadius: 0,
  background: 'linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba)',
  boxShadow: 'none',
  clipPath: 'none',
  color: '#FFFFFF',
});
// Selected/highlighted card: card surface with the active chrome rim.
const SD_CARD_SELECTED = Object.freeze({
  ...SD_CARD,
  borderImage: "url('/images/smarterdesign/chrome-active.webp') 11 / 4px stretch",
});

const CONTROL_FONT =
  "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif";
const PAINTED_CONTROL = {
  display: 'inline-flex',
  minHeight: 44,
  alignItems: 'center',
  justifyContent: 'center',
  ...SD_ROW,
  color: SD_WHITE,
  cursor: 'pointer',
  fontFamily: CONTROL_FONT,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.025em',
  lineHeight: 1.1,
  textAlign: 'center',
  textDecoration: 'none',
  textShadow: '0 1px 2px #000',
};
const ANGULAR_METAL_PLATE = {
  ...SD_PANEL,
};

const styles = {
  paintedPrimaryAction: {
    ...PAINTED_CONTROL,
    ...SD_COBALT,
  },
  paintedSecondaryAction: {
    ...PAINTED_CONTROL,
  },
  rewardStatusFrame: {
    ...ANGULAR_METAL_PLATE,
  },
  rewardMultiplierPlate: {
    ...PAINTED_CONTROL,
    display: 'inline-grid',
    minWidth: 118,
    minHeight: 36,
    placeItems: 'center',
    margin: '2px 3px',
    padding: '6px 12px',
    ...SD_STAT,
    color: SD_ICE,
    cursor: 'default',
    fontFamily: CONTROL_FONT,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.025em',
    textShadow: '0 1px 2px #000',
  },
  rewardMultiplierPlateGold: {
    ...SD_COBALT,
    color: '#FFFFFF',
  },
  vipPriceDeck: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  vipPricePlate: {
    ...SD_STAT,
    minWidth: 142,
    padding: '12px 20px',
    textAlign: 'center',
  },
  vipPricePlateGold: {
    ...SD_COBALT,
  },
  vipPlanAction: {
    ...PAINTED_CONTROL,
    minWidth: 196,
    marginTop: 12,
    padding: '12px 30px',
    ...SD_COBALT,
    color: '#FFFFFF',
  },
  clubSuccessStatus: {
    ...ANGULAR_METAL_PLATE,
    position: 'fixed',
    top: 80,
    left: '50%',
    zIndex: 9999,
    maxWidth: 'min(680px, calc(100vw - 32px))',
    minHeight: 52,
    padding: '14px 30px',
    transform: 'translateX(-50%)',
    boxShadow: '0 12px 26px rgba(0, 0, 0, 0.5)',
    color: SD_WHITE,
    fontFamily: CONTROL_FONT,
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '0.02em',
    textAlign: 'center',
    textShadow: '0 1px 2px #000',
  },
  clubBalanceStatus: {
    display: 'inline-flex',
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 18px',
    ...SD_STAT,
    color: SD_ICE,
    fontFamily: CONTROL_FONT,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.025em',
    fontVariantNumeric: 'tabular-nums',
    textShadow: '0 1px 2px #000',
  },
  clubEmptyState: {
    ...ANGULAR_METAL_PLATE,
    maxWidth: 520,
    margin: '0 auto',
    padding: '36px 28px',
    textAlign: 'center',
  },
  clubLedgerViewport: {
    overflowX: 'auto',
    ...SD_PANEL,
  },
  clubLedgerTable: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'transparent',
  },
  clubCategoryPlate: {
    display: 'inline-flex',
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px 12px',
    ...SD_STAT,
    color: SD_ICE,
    fontFamily: CONTROL_FONT,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.025em',
  },
  container: {
    minHeight: '100vh',
    paddingBottom: 70,
    width: '100%',
    maxWidth: '100vw',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    background: '#000000',
    fontFamily: 'var(--font-inter), Inter, Arial, sans-serif',
    position: 'relative',
  },
  bgGrid: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'none',
    backgroundSize: '60px 60px',
    pointerEvents: 'none',
  },
  bgGlow: {
    position: 'fixed',
    top: '30%',
    left: '50%',
    width: '100%',
    height: '100%',
    transform: 'translate(-50%, -50%)',
    background: 'transparent',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    ...SD_PANEL,
    zIndex: 100,
  },
  // TAB NAVIGATION
  tabNav: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    padding: '16px 24px',
    border: 0,
    background: 'transparent',
    position: 'sticky',
    top: 0,
    zIndex: 99,
  },
  tabButton: {
    padding: '10px 24px',
    ...SD_ROW,
    color: SD_WHITE,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'filter 0.2s ease',
  },
  tabButtonActive: {
    ...SD_COBALT,
    color: '#FFFFFF',
  },
  tabButtonActiveVIP: {
    ...SD_COBALT,
    color: '#FFFFFF',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    ...SD_ROW,
    color: SD_WHITE,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  pageTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: SD_WHITE,
  },
  content: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '32px 24px',
  },
  intro: {
    textAlign: 'center',
    marginBottom: 40,
  },
  introText: {
    fontSize: 16,
    color: SD_SILVER,
    maxWidth: 600,
    margin: '0 auto',
    lineHeight: 1.6,
  },
  packageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
    marginBottom: 40,
  },
  purchaseSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SD_PANEL,
    padding: '20px 28px',
    marginBottom: 48,
  },
  selectedInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  selectedLabel: {
    fontSize: 14,
    color: SD_SILVER,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
  },
  selectedDiamonds: {
    fontSize: 18,
    fontWeight: 700,
    color: SD_ICE,
  },
  purchaseButton: {
    padding: '14px 40px',
    ...SD_COBALT,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  },
  earnSection: {
    textAlign: 'center',
    marginBottom: 40,
  },
  earnTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  earnSubtitle: {
    fontSize: 14,
    color: SD_SILVER,
    marginBottom: 24,
  },
  earnGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
  },
  earnCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '20px 12px',
    ...SD_CARD,
  },
  earnIcon: {
    fontSize: 28,
  },
  earnLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: '#fff',
  },
  earnReward: {
    fontSize: 12,
    fontWeight: 600,
    color: SD_ICE,
  },
  legalNote: {
    fontSize: 12,
    color: SD_SILVER,
    textAlign: 'center',
    maxWidth: 500,
    margin: '0 auto',
    lineHeight: 1.6,
  },
  // The global 44px rule is `a { min-height: 44px }`, and min-height does
  // nothing to a non-replaced INLINE box, so this anchor stood 19px tall at
  // 320px and 14px at 1024px while appearing to be covered. It measured 44px
  // at exactly one width, 390px, and only because the text wrapped onto a
  // second line there. inline-block makes the height real; the negative block
  // margin gives the padding back to the paragraph so the legal note's own
  // rhythm is unchanged. Same remedy as .rewardDetailLink in
  // DiamondStoreShell.module.css.
  link: {
    color: SD_ICE,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    display: 'inline-block',
    paddingBlock: 14,
    marginBlock: -14,
  },
  // YELLOW BALL REWARD SYSTEM STYLES
  rewardSystem: {
    marginBottom: 40,
  },
  capBanner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    ...SD_PANEL,
    boxShadow: '0 14px 28px rgba(0, 0, 0, 0.54)',
    padding: '20px 32px',
    marginBottom: 32,
  },
  capInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  capNumber: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 36,
    fontWeight: 700,
    color: SD_WHITE,
  },
  capLabel: {
    fontSize: 12,
    color: SD_SILVER,
    textTransform: 'capitalize',
    letterSpacing: 1,
  },
  capDivider: {
    width: 1,
    height: 50,
    background: SD_LINE,
  },
  streakMultipliers: {
    display: 'flex',
    gap: 24,
  },
  multiplierItem: {
    display: 'flex',
    minWidth: 112,
    minHeight: 58,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 14px',
    ...SD_STAT,
  },
  multiplierValue: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 24,
    fontWeight: 700,
    color: SD_ICE,
  },
  multiplierValueGold: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 24,
    fontWeight: 700,
    color: SD_CYAN,
  },
  // Silver on the navy chrome-stat well reads well above AA.
  multiplierLabel: {
    fontSize: 12,
    color: SD_SILVER,
  },
  payoutSection: {
    marginBottom: 32,
  },
  payoutTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 16,
  },
  payoutGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 12,
  },
  payoutCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 18px',
    ...SD_CARD,
  },
  referralCard: {
    ...SD_CARD_SELECTED,
  },
  payoutIcon: {
    fontSize: 24,
  },
  payoutInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  payoutName: {
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
  },
  payoutNote: {
    fontSize: 12,
    color: SD_SILVER,
  },
  bypassNote: {
    fontSize: 12,
    color: SD_ICE,
    fontWeight: 600,
  },
  payoutReward: {
    fontSize: 14,
    fontWeight: 600,
    color: SD_ICE,
  },
  referralReward: {
    fontSize: 14,
    fontWeight: 700,
    color: SD_ICE,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMARTER REWARDS SUB-TAB STYLES
  // ═══════════════════════════════════════════════════════════════════════════
  // The sticky declarations here never applied: an ancestor
  // (.diamond-store-page) sets overflow, which makes it the scroll container,
  // and the bar measured -471px at 1440 after scrolling. The background and
  // border were separately overridden to transparent/0 by
  // DiamondStoreShell.module.css. Removing what did nothing rather than
  // leaving it to read as armed.
  rewardsSubNav: {
    display: 'flex',
    gap: 8,
    padding: '16px 24px',
    overflowX: 'auto',
  },
  rewardsSubTab: {
    ...SD_ROW,
    color: SD_WHITE,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '10px 20px',
    transition: 'filter 0.2s ease',
    whiteSpace: 'nowrap',
  },
  rewardsSubTabActive: {
    ...SD_COBALT,
    color: '#fff',
  },

  // Overview Section
  rewardsOverview: {
    padding: '32px 24px',
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
    marginTop: 32,
    marginBottom: 32,
  },
  overviewCard: {
    ...SD_CARD,
    padding: 24,
    textAlign: 'center',
  },
  overviewCardTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: SD_WHITE,
    marginBottom: 12,
  },
  overviewCardText: {
    fontSize: 14,
    color: SD_SILVER,
    lineHeight: 1.6,
  },
  quickStats: {
    display: 'flex',
    justifyContent: 'space-around',
    gap: 20,
    marginTop: 32,
    padding: '24px',
    ...SD_PANEL,
  },
  quickStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  quickStatValue: {
    fontSize: 32,
    fontWeight: 700,
    color: SD_ICE,
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
  },
  quickStatLabel: {
    fontSize: 12,
    color: SD_SILVER,
    textTransform: 'capitalize',
    letterSpacing: '0.5px',
  },

  // Diamond Rewards Section
  diamondRewardsSection: {
    padding: '32px 24px',
  },
  rewardCategory: {
    marginBottom: 32,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: SD_WHITE,
    marginBottom: 16,
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
  },
  rewardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  rewardItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    ...SD_CARD,
  },
  rewardDetails: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  rewardName: {
    fontSize: 14,
    fontWeight: 600,
    color: SD_WHITE,
  },
  rewardNote: {
    fontSize: 12,
    color: SD_SILVER,
  },
  rewardAmount: {
    fontSize: 14,
    fontWeight: 700,
    color: SD_ICE,
    flexShrink: 0,
  },
  referralHighlight: {
    ...SD_CARD_SELECTED,
  },

  // XP System Section
  levelBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    ...SD_COBALT,
    fontSize: 13,
    fontWeight: 700,
    color: '#fff',
  },
  unlocksList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  unlockBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    ...SD_STAT,
    fontSize: 12,
    color: SD_ICE,
    fontWeight: 600,
  },
  noUnlocks: {
    color: SD_SILVER,
  },

  // Easter Eggs Section
  easterEggsSection: {
    padding: '32px 24px',
  },
  eggGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: 20,
    marginTop: 24,
  },
  eggCard: {
    ...SD_CARD,
    padding: 20,
    textAlign: 'center',
    cursor: 'default',
  },
  eggName: {
    fontSize: 16,
    fontWeight: 700,
    color: SD_WHITE,
    marginBottom: 8,
  },
  eggReward: {
    fontSize: 18,
    fontWeight: 700,
    color: SD_CYAN,
    marginBottom: 12,
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
  },
  eggTrigger: {
    fontSize: 12,
    color: SD_SILVER,
    lineHeight: 1.5,
  },
  // Egg Category Styles
  eggCategory: {
    marginBottom: 48,
  },
  eggCategoryTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: SD_WHITE,
    margin: '28px 0 20px',
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
  },
  // Rarity Badge Styles
  rarityBadge: {
    display: 'inline-flex',
    minWidth: 88,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px 14px',
    ...SD_STAT,
    fontFamily: CONTROL_FONT,
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 8,
    letterSpacing: '0.04em',
    textShadow: '0 1px 2px #000',
  },
  rarityCommon: {
    color: '#D1D9DE',
  },
  rarityUncommon: {
    color: '#8FE8FF',
  },
  rarityRare: {
    color: '#78D8FF',
  },
  rarityEpic: {
    color: '#B7F6FF',
  },
  rarityLegendary: {
    color: SD_WHITE,
  },

  easterSection: {
    textAlign: 'center',
    marginBottom: 24,
  },
  easterTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 8,
  },
  easterSubtitle: {
    fontSize: 14,
    color: SD_SILVER,
    marginBottom: 20,
  },
  easterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  easterCategory: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '16px 12px',
    ...SD_CARD,
  },
  categoryRange: {
    fontSize: 12,
    fontWeight: 700,
    color: SD_SILVER,
    textTransform: 'capitalize',
  },
  categoryName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
  },
  categoryExample: {
    fontSize: 12,
    color: SD_SILVER,
    fontStyle: 'italic',
  },
  legendaryNote: {
    fontSize: 13,
    color: SD_SILVER,
    ...SD_STAT,
    padding: '14px 20px',
    lineHeight: 1.6,
    textAlign: 'center',
  },
  // 5-PILLAR CARD STYLES
  pillarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  pillarCard: {
    ...SD_CARD,
    padding: 20,
    textAlign: 'left',
  },
  pillarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  pillarIcon: {
    width: 44,
    height: 44,
    borderRadius: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
  },
  pillarName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
  },
  pillarRange: {
    fontSize: 12,
    color: SD_SILVER,
  },
  pillarExamples: {
    borderTop: `1px solid ${SD_LINE}`,
    paddingTop: 12,
  },
  exampleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: SD_SILVER,
    marginBottom: 8,
  },
  exDiamonds: {
    marginLeft: 'auto',
    color: SD_ICE,
    fontWeight: 600,
  },
  exDiamondsRare: {
    marginLeft: 'auto',
    color: '#83c9e2',
    fontWeight: 600,
  },
  exDiamondsEpic: {
    marginLeft: 'auto',
    color: '#b9d7e5',
    fontWeight: 600,
  },
  exDiamondsLegendary: {
    marginLeft: 'auto',
    color: SD_CYAN,
    fontWeight: 700,
  },
  // VIP MEMBERSHIP STYLES
  vipHero: {
    textAlign: 'center',
    marginBottom: 32,
  },
  vipTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 32,
    fontWeight: 700,
    color: SD_WHITE,
    marginBottom: 12,
  },
  vipSubtitle: {
    fontSize: 15,
    color: SD_SILVER,
    margin: '0 auto',
    lineHeight: 1.4,
  },
  vipPlansRow: {
    display: 'flex',
    gap: 20,
    marginBottom: 24,
  },
  vipSubscribeSection: {
    textAlign: 'center',
    marginBottom: 40,
  },
  vipSubscribeButton: {
    padding: '16px 48px',
    ...SD_COBALT,
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
  },
  vipCancelNote: {
    fontSize: 12,
    color: SD_SILVER,
    marginTop: 12,
  },
  benefitsSection: {
    marginBottom: 32,
  },
  benefitsTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 20,
    fontWeight: 600,
    color: SD_WHITE,
    marginBottom: 20,
    textAlign: 'center',
  },
  benefitsCategoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `1px solid ${SD_LINE}`,
  },
  benefitsCategoryIcon: {
    fontSize: 20,
  },
  benefitsCategoryLabel: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '0.08em',
    textTransform: 'capitalize',
  },
  benefitsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 12,
  },
  benefitCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: '14px 16px',
  },
  benefitIcon: {
    fontSize: 24,
    width: 40,
    textAlign: 'center',
  },
  benefitInfo: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.35,
    color: SD_WHITE,
  },
  // 11px at rgba(255,255,255,0.5) measured under 4.5:1 on the card surface and
  // was the smallest text on the page. Entitlement copy is the reason a shopper
  // is on this page, so it is sized and contrasted to be read.
  benefitDesc: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 1.5,
    color: SD_SILVER,
  },
  benefitValue: {
    flexShrink: 0,
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: 700,
    color: SD_ICE,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  valueComparison: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    padding: '24px',
    ...SD_PANEL,
    marginBottom: 32,
  },
  valueBox: {
    textAlign: 'center',
  },
  valueBoxHighlight: {
    textAlign: 'center',
    padding: '16px 32px',
    ...SD_STAT,
    borderImage: "url('/images/smarterdesign/chrome-active.webp') 11 / 4px stretch",
  },
  valueLabel: {
    fontSize: 12,
    color: SD_SILVER,
    textTransform: 'capitalize',
    letterSpacing: 1,
    marginBottom: 4,
  },
  valueAmount: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: SD_SILVER,
    textDecoration: 'line-through',
  },
  vipPrice: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: SD_ICE,
  },
  valueDivider: {
    fontSize: 24,
    color: SD_SILVER,
  },
  // MERCHANDISE STYLES
  merchTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: SD_WHITE,
    marginBottom: 12,
  },
  merchSection: {
    marginBottom: 32,
  },
  merchCategoryTitle: {
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 18,
    fontWeight: 600,
    color: SD_WHITE,
    marginBottom: 16,
  },
  merchGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
    gap: 18,
  },
};

export default styles;
