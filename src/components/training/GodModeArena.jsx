/**
 * GOD MODE ARENA — GTO Wizard-Style Training UI
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Full-immersion training with:
 * - GTO Wizard-style action buttons + 5-tier feedback
 * - GTOW Score tracking + EV Loss metrics
 * - Post-session review with hand history
 * - 20 questions per level, 12 levels total (Foundations → Boss Mode)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { shareResult } from '../../utils/shareCard';
import GameUIRouter from './GameUIRouter';
import TrainerConfigModal from './TrainerConfigModal';
import HandReplayViewer from './HandReplayViewer';
import PositionStatsPanel from './PositionStatsPanel';
import LifetimeStatsCard from './LifetimeStatsCard';
import SessionHistoryList from './SessionHistoryList';
// ●●● PHASE 16: Performance Analytics Components ●●●
import PerformanceTrends from './PerformanceTrends';
import StreetAccuracyPanel from './StreetAccuracyPanel';
import ActionAccuracyPanel from './ActionAccuracyPanel';
import MistakePatternPanel from './MistakePatternPanel';
import { useTrainingAnalytics } from './PerformanceTrends';
// ●●● PHASE 17: Smart Practice + AI Coaching ●●●
import SmartPracticeBanner from './SmartPracticeBanner';
import { getSessionToken } from '../../lib/authUtils';
// ●●● PHASE 18: Leaderboard ●●●
import LeaderboardPanel from './LeaderboardPanel';
// ●●● PHASE 19: Share Card + Achievement Toasts ●●●
import SessionShareCard from './SessionShareCard';
import AchievementToast from './AchievementToast';
import { checkAllAchievements } from './utils/achievementChecker';
// ●●● PHASE 20: EV Graph + GTO Deviation Heatmap ●●●
import EVGraph from './EVGraph';
import EVLossTracker from './EVLossTracker';
import GTODeviationHeatmap from './GTODeviationHeatmap';
// ●●● PHASE 21: Study Streak Map + Ghost Replay ●●●
import { StudyStreakMapAuto } from './StudyStreakMap';
import GhostReplayEngine from './GhostReplayEngine';
// ●●● PHASE 356: Solver Tree Viewer ●●●
import SolverTreeViewer from './SolverTreeViewer';
import PostflopRangeViewer from './PostflopRangeViewer';
import RunoutStrategyMatrix from './RunoutStrategyMatrix';
import FrequencyTrainer from './FrequencyTrainer';
import SolverComparisonReplay from './SolverComparisonReplay';
import RangeEquityVisualizer from './RangeEquityVisualizer';
import CrossSessionAnalytics from './CrossSessionAnalytics';
import MultiStreetNavigator from './MultiStreetNavigator';
import ICMTournamentPanel from './ICMTournamentPanel';
import BoardExplorer from './BoardExplorer';
import RangeBuilder from './RangeBuilder';
// ●●● PHASE 5: Multiway, Opponent Profiler, 3-Bet Trainer ●●●
import MultiwayTrainer from './MultiwayTrainer';
import OpponentProfiler from './OpponentProfiler';
import ThreeBetTrainer from './ThreeBetTrainer';
// ●●● PHASE 6: Solutions Browser, Custom Drills, HH Import, Tournament ●●●
import PreflopSolutionsBrowser from './PreflopSolutionsBrowser';
import CustomSpotDrillBuilder from './CustomSpotDrillBuilder';
import HandHistoryImporter from './HandHistoryImporter';
import TournamentTrainer from './TournamentTrainer';
// ●●● PHASE 7: Postflop Solutions, Sizing, Study Plan, Reports ●●●
import PostflopSolutionsBrowser from './PostflopSolutionsBrowser';
import SizingTrainer from './SizingTrainer';
import StudyPlanCurriculum from './StudyPlanCurriculum';
import AggregatedReportViewer from './AggregatedReportViewer';
// ●●● PHASE 8: Equity Calculator, Node Lock, Quiz, Strategy Comparison ●●●
import EquityCalculatorTool from './EquityCalculatorTool';
import NodeLockEditor from './NodeLockEditor';
import QuizModeEngine from './QuizModeEngine';
import StrategyComparison from './StrategyComparison';
// ●●● PHASE 9: Range vs Range, EV Tree, Bankroll, Spot Filter ●●●
import RangeVsRangeExplorer from './RangeVsRangeExplorer';
import EVTreeVisualizer from './EVTreeVisualizer';
import BankrollTracker from './BankrollTracker';
import SpotFilterTrainer from './SpotFilterTrainer';
// ●●● PHASE 10: HUD, Hand Notes, Leak Finder, Table Dynamics ●●●
import PopupHUDOverlay from './PopupHUDOverlay';
import HandNoteTagger from './HandNoteTagger';
import LeakFinderEngine from './LeakFinderEngine';
import TableDynamicsPanel from './TableDynamicsPanel';
// ●●● PHASE 11: Runout Sim, Position Mastery, Mixed Strategy, Session Replay ●●●
import RunoutSimulator from './RunoutSimulator';
import PositionMasteryTracker from './PositionMasteryTracker';
import MixedStrategyTrainer from './MixedStrategyTrainer';
import SessionReplayTimeline from './SessionReplayTimeline';
// ●●● PHASE 12: Flop Textures, Preflop Charts, Hand Strength, Frequency Exploiter ●●●
import FlopTextureAnalyzer from './FlopTextureAnalyzer';
import PreflopRangeCharts from './PreflopRangeCharts';
import HandStrengthDistribution from './HandStrengthDistribution';
import FrequencyExploiter from './FrequencyExploiter';
// ●●● PHASE 13: Chip EV, Flop Categories, Pot Odds, Stack Depth ●●●
import ChipEVCalculator from './ChipEVCalculator';
import FlopCategoryBrowser from './FlopCategoryBrowser';
import PotOddsCalculator from './PotOddsCalculator';
import StackDepthAdvisor from './StackDepthAdvisor';
// ●●● PHASE 14: Bluff Catcher, Tilt Tracker, Odds Oracle, Win Rate Projector ●●●
import BluffCatcherAnalyzer from './BluffCatcherAnalyzer';
import TiltTrackerPanel from './TiltTrackerPanel';
import OddsOracleWidget from './OddsOracleWidget';
import WinRateProjector from './WinRateProjector';
// ●●● PHASE 15: Position Heatmap, Session Goals, Range Memorization, Multi-Table ●●●
import PositionFrequencyHeatmap from './PositionFrequencyHeatmap';
import SessionGoalTracker from './SessionGoalTracker';
import RangeMemorizationDrill from './RangeMemorizationDrill';
import MultiTableTracker from './MultiTableTracker';
// ●●● PHASE 16: C-Bet Trainer, Variance Sim, Check-Raise, Hand Ranking Quiz ●●●
import ContinuationBetTrainer from './ContinuationBetTrainer';
import VarianceSimulator from './VariancSimulator';
import CheckRaiseTrainer from './CheckRaiseTrainer';
import HandRankingQuiz from './HandRankingQuiz';
// ●●● PHASE 17: Range Library, Board Texture Quiz, Position Profit, Final Table ICM ●●●
import PresetRangeLibrary from './PresetRangeLibrary';
import BoardTextureQuiz from './BoardTextureQuiz';
import PositionProfitGraph from './PositionProfitGraph';
import FinalTableICM from './FinalTableICM';
// ●●● PHASE 18: Overbet, Heads-Up, Timed Decisions, Squeeze ●●●
import OverBetTrainer from './OverBetTrainer';
import HeadsUpTrainer from './HeadsUpTrainer';
import TimeBasedDecisionTrainer from './TimeBasedDecisionTrainer';
import SqueezeTrainer from './SqueezeTrainer';
// ●●● PHASE 19: Float Play, Blockers, Tournament Life, Polarization ●●●
import FloatPlayTrainer from './FloatPlayTrainer';
import BlockerAnalysis from './BlockerAnalysis';
import TournamentLifeCalc from './TournamentLifeCalc';
import PolarizationTrainer from './PolarizationTrainer';
// ●●● PHASE 20: Thin Value, Multi-Street Planner, Defense Freq, Preflop Sim ●●●
import ThinValueTrainer from './ThinValueTrainer';
import MultiStreetPlanner from './MultiStreetPlanner';
import DefenseFrequencyCalc from './DefenseFrequencyCalc';
import PreFlopSimulator from './PreFlopSimulator';
// ●●● PHASE 21: SPR Calc, Blind Defense, Draw Odds, Fold Equity ●●●
import StackToRatioCalc from './StackToRatioCalc';
import BlindDefenseTrainer from './BlindDefenseTrainer';
import DrawOddsCalculator from './DrawOddsCalculator';
import FoldEquityCalc from './FoldEquityCalc';
// ●●● PHASE 22: Donk Bet, Multiway Strategy, River Probe, Position Quiz ●●●
import DonkBetTrainer from './DonkBetTrainer';
import MultiWayPotStrategy from './MultiWayPotStrategy';
import RiverProbeTrainer from './RiverProbeTrainer';
import PositionAwarenessQuiz from './PositionAwarenessQuiz';
// ●●● PHASE 23: Stack-Off Ranges, Betting Patterns, Turn Barrel, Short Stack ●●●
import StackOffRangeCalc from './StackOffRangeCalc';
import BettingPatternAnalyzer from './BettingPatternAnalyzer';
import TurnBarrelTrainer from './TurnBarrelTrainer';
import ShortStackStrategy from './ShortStackStrategy';
// ●●● PHASE 24: Range Construction, Capped Range, Bubble Factor, Hand Reading ●●●
import RangeConstructionGuide from './RangeConstructionGuide';
import CappedRangeExploiter from './CappedRangeExploiter';
import BubbleFactorCalc from './BubbleFactorCalc';
import HandReadingTrainer from './HandReadingTrainer';
// ●●● PHASE 25: Geometric Sizing, Mass Data, River Matrix, Pay Jumps ●●●
import GeometricSizingCalc from './GeometricSizingCalc';
import MassDataAnalysis from './MassDataAnalysis';
import RiverDecisionMatrix from './RiverDecisionMatrix';
import TournamentPayJumpCalc from './TournamentPayJumpCalc';
// ●●● PHASE 26: X-Raise Sizing, C-Bet Matrix, Turn Impact, Bluff Ratio ●●●
import XRaiseSizingGuide from './XRaiseSizingGuide';
import FlopCBetMatrix from './FlopCBetMatrix';
import TurnCardImpactAnalyzer from './TurnCardImpactAnalyzer';
import BluffToValueRatio from './BluffToValueRatio';
// ●●● PHASE 27: Slow Play, Kelly Criterion, Preflop Equity, GTO Glossary ●●●
import SlowPlayDecisionTrainer from './SlowPlayDecisionTrainer';
import KellyBetCalculator from './KellyBetCalculator';
import PreFlopAllInEquity from './PreFlopAllInEquity';
import GTOGlossary from './GTOGlossary';
// ●●● PHASE 28: Pot Geometry, Exploitative, River Bluff Catcher, Stack Depth ●●●
import PotGeometryVisualizer from './PotGeometryVisualizer';
import ExploitativeAdjustments from './ExploitativeAdjustments';
import RiverBluffCatcherTrainer from './RiverBluffCatcherTrainer';
import StackDepthStrategyGuide from './StackDepthStrategyGuide';
// ●●● PHASE 29: Check-Raise, Overbet, Multi-Street Planning, RvR Sim ●●●
import CheckRaiseStrategyGuide from './CheckRaiseStrategyGuide';
import OverbetStrategyTrainer from './OverbetStrategyTrainer';
import MultiStreetPlanningGuide from './MultiStreetPlanningGuide';
import RangeVsRangeSim from './RangeVsRangeSim';
// ●●● PHASE 30: Board Coverage, FT ICM, Leak Finder, Heads-Up ●●●
import BoardCoverageAnalyzer from './BoardCoverageAnalyzer';
import FinalTableICMGuide from './FinalTableICMGuide';
import LeakFinderQuiz from './LeakFinderQuiz';
import HeadsUpStrategyGuide from './HeadsUpStrategyGuide';
// ●●● PHASE 31: 3-Bet Defense, Tilt Recovery, Equity Realization, Combinatorics ●●●
import ThreeBetDefenseMatrix from './ThreeBetDefenseMatrix';
import TiltRecoverySystem from './TiltRecoverySystem';
import EquityRealizationGuide from './EquityRealizationGuide';
import HandCombinatoricsGuide from './HandCombinatoricsGuide';
// ●●● PHASE 32: Squeeze Play, Session Review, Implied Odds, Position Profit ●●●
import SqueezPlayGuide from './SqueezPlayGuide';
import SessionReviewChecklist from './SessionReviewChecklist';
import ImpliedOddsCalculator from './ImpliedOddsCalculator';
import PositionProfitTracker from './PositionProfitTracker';
// ●●● PHASE 33: C-Bet Guide, Nut Advantage, PF Open Chart, MDF Calc ●●●
import ContinuationBetGuide from './ContinuationBetGuide';
import NutAdvantageTracker from './NutAdvantageTracker';
import PreFlopOpenChart from './PreFlopOpenChart';
import MDFCalculator from './MDFCalculator';
// ●●● PHASE 34: 4-Bet Strategy, River Polarization, MTT Stages, Bet Sizing ●●●
import FourBetStrategyGuide from './FourBetStrategyGuide';
import RiverPolarizationGuide from './RiverPolarizationGuide';
import TournamentStagesGuide from './TournamentStagesGuide';
import BetSizingOptimizer from './BetSizingOptimizer';
// ●●● PHASE 35: Hand Rankings, Range Balancing, Postflop Quiz ●●●
import HandRankingsReference from './HandRankingsReference';
import RangeBalancingDrill from './RangeBalancingDrill';
import PostflopPlanningQuiz from './PostflopPlanningQuiz';
// ●●● PHASE 36: Seat Selection, Triple Barrel, Pot Control, EP Guide ●●●
import SeatSelectionGuide from './SeatSelectionGuide';
import TripleBarrelTrainer from './TripleBarrelTrainer';
import PotControlStrategy from './PotControlStrategy';
import EarlyPositionGuide from './EarlyPositionGuide';
// ●●● PHASE 37: Check Behind, Blind Battle, River Sizing, Table Image ●●●
import CheckBehindStrategy from './CheckBehindStrategy';
import BlindBattleGuide from './BlindBattleGuide';
import RiverSizingGuide from './RiverSizingGuide';
import TableImageTracker from './TableImageTracker';
// ●●● PHASE 38: Double Barrel, Pot Committed, Range Advantage, Fish Exploit ●●●
import DoubleBarrelGuide from './DoubleBarrelGuide';
import PotCommittedCalc from './PotCommittedCalc';
import RangeAdvantageGuide from './RangeAdvantageGuide';
import FishExploitationGuide from './FishExploitationGuide';
// ●●● PHASE 39: Small Ball, Trap Play, Board Pairing, Effective Stacks ●●●
import SmallBallStrategy from './SmallBallStrategy';
import TrapPlayGuide from './TrapPlayGuide';
import BoardPairingStrategy from './BoardPairingStrategy';
import StackEffectiveCalc from './StackEffectiveCalc';
// ●●● PHASE 40: Semi-Bluff, Value Sizing, Opp Tendencies, Mental Game ●●●
import SemiBluffTrainer from './SemiBluffTrainer';
import ValueBetSizingGuide from './ValueBetSizingGuide';
import OppTendencyTracker from './OppTendencyTracker';
import MentalGameCoach from './MentalGameCoach';
// ●●● PHASE 41: Limp Strategy, Resteal, Cutoff, Button ●●●
import PreFlopLimpStrategy from './PreFlopLimpStrategy';
import RestealGuide from './RestealGuide';
import CutoffStrategy from './CutoffStrategy';
import ButtonPlayGuide from './ButtonPlayGuide';
// ●●● PHASE 42: UTG, HiJack, Small Blind, Big Blind ●●●
import UTGRangeGuide from './UTGRangeGuide';
import HiJackStrategy from './HiJackStrategy';
import SmallBlindComplete from './SmallBlindComplete';
import BigBlindDefense from './BigBlindDefense';
// ●●● PHASE 43: Floating, Probe Bluff, X-Raise Timing, Delayed C-Bet ●●●
import FloatingStrategy from './FloatingStrategy';
import ProbeBluffGuide from './ProbeBluffGuide';
import XRaiseTiming from './XRaiseTiming';
import DelayedCBetGuide from './DelayedCBetGuide';
// ●●● PHASE 44: Multi-Table, Bankroll, Table Selection, Stakes Ladder ●●●
import MultiTableStrategy from './MultiTableStrategy';
import BankrollManagement from './BankrollManagement';
import TableSelectionGuide from './TableSelectionGuide';
import StakesLadderGuide from './StakesLadderGuide';
// ●●● PHASE 45: 3BP Play, 4BP Play, SRP Guide, Squeeze Pots ●●●
import ThreeBetPotPlay from './ThreeBetPotPlay';
import FourBetPotPlay from './FourBetPotPlay';
import SingleRaisedPotGuide from './SingleRaisedPotGuide';
import SqueezePotPlay from './SqueezePotPlay';
// ●●● PHASE 46: Turn X/R, River Overbet, Donk Defense, Range Types ●●●
import TurnCheckRaiseGuide from './TurnCheckRaiseGuide';
import RiverOverbetGuide from './RiverOverbetGuide';
import FlopDonkDefense from './FlopDonkDefense';
import MergeRangeGuide from './MergeRangeGuide';
// ●●● PHASE 47: Frequencies, Node Lock, Polarizer, Equity Buckets ●●●
import BalancingFrequencies from './BalancingFrequencies';
import NodeLockingGuide from './NodeLockingGuide';
import RangePolarizerTool from './RangePolarizerTool';
import EquityBucketGuide from './EquityBucketGuide';

// ●●● PHASE 48: Overbet Bluffs, Value-Own, Check-Call, Bet-Fold ●●●
import OverbetBluffGuide from './OverbetBluffGuide';
import RiverValueOwnedGuide from './RiverValueOwnedGuide';
import CheckCallStrategy from './CheckCallStrategy';
import BetFoldLineGuide from './BetFoldLineGuide';

// ●●● PHASE 49: Pot Odds, Draws, Nut Blockers, Capped Ranges ●●●
import PotOddsTrainer from './PotOddsTrainer';
import DrawPlayingGuide from './DrawPlayingGuide';
import NutBlockerBluff from './NutBlockerBluff';
import CappedRangeDetector from './CappedRangeDetector';

// ●●● PHASE 50: Multi-Way, Iso-Raise, Late Reg, Ante Steal ●●●
import MultiWayCheckGuide from './MultiWayCheckGuide';
import IsoRaiseStrategy from './IsoRaiseStrategy';
import LateRegStrategy from './LateRegStrategy';
import AnteStealGuide from './AnteStealGuide';

// ●●● PHASE 51: Turn Texture, River Impact, Run It Twice, All-In EV ●●●
import TurnTextureGuide from './TurnTextureGuide';
import RiverCardImpact from './RiverCardImpact';
import RunItTwiceCalc from './RunItTwiceCalc';
import AllInEVDashboard from './AllInEVDashboard';

// ●●● PHASE 52: Postflop Aggression, PF Mistakes, Leaks, Win Condition ●●●
import PostFlopAggression from './PostFlopAggression';
import PreFlopMistakes from './PreFlopMistakes';
import CommonLeaksGuide from './CommonLeaksGuide';
import WinConditionPlanner from './WinConditionPlanner';

// ●●● PHASE 53: Flop X/R, Turn Probe, River Bluff Catch, Position ●●●
import FlopCheckRaise from './FlopCheckRaise';
import TurnProbeGuide from './TurnProbeGuide';
import RiverBluffCatcher from './RiverBluffCatcher';
import PositionalAwareness from './PositionalAwareness';

// ●●● PHASE 54: Stack:Blind, Push/Fold, Chip Chop, ICM Deals ●●●
import StackToBlindRatio from './StackToBlindRatio';
import PushFoldChart from './PushFoldChart';
import ChipChopCalc from './ChipChopCalc';
import ICMDealMaker from './ICMDealMaker';

// ●●● PHASE 55: Mixed Strategy, Freq Bench, Indifference, GTO vs Exploit ●●●
import MixedStrategyGuide from './MixedStrategyGuide';
import FreqBenchmarks from './FreqBenchmarks';
import IndifferenceCalc from './IndifferenceCalc';
import GTOvsExploit from './GTOvsExploit';

// ●●● PHASE 56: Combinatorics, Range vs Range, EQ Distribution, EV Calc ●●●
import HandCombinatorics from './HandCombinatorics';
import RangeVsRange from './RangeVsRange';
import EquityDistribution from './EquityDistribution';
import EVCalculatorGuide from './EVCalculatorGuide';

// ●●● PHASE 57: Session Review, Leak Analyzer, Study Plan, Progress ●●●
import SessionReviewTool from './SessionReviewTool';
import LeakAnalyzer from './LeakAnalyzer';
import StudyPlanCreator from './StudyPlanCreator';
import ProgressDashboard from './ProgressDashboard';

// ●●● PHASE 58: Multi-Street Plan, Stack-Off Ranges, Thin Value, Reverse Implied ●●●
import MultiStreetPlan from './MultiStreetPlan';
import StackOffRanges from './StackOffRanges';
import ThinValueGuide from './ThinValueGuide';
import ReverseImpliedOdds from './ReverseImpliedOdds';

// ●●● PHASE 59: Board Coverage, Node Analysis, Solver Simplify, Range Viz ●●●
import BoardCoverageMap from './BoardCoverageMap';
import NodeAnalysis from './NodeAnalysis';
import SolverSimplify from './SolverSimplify';
import RangeVisualization from './RangeVisualization';

// ●●● PHASE 60: Live Tells, Online Timing, Betting Patterns, Player Typing ●●●
import LivePokerTells from './LivePokerTells';
import OnlineTimingTells from './OnlineTimingTells';
import BettingPatternRead from './BettingPatternRead';
import PlayerTyping from './PlayerTyping';

// ●●● PHASE 61: Tournament Lifecycle, Chip Utility, Payout Structure, Field Size ●●●
import TournamentLifecycle from './TournamentLifecycle';
import ChipUtility from './ChipUtility';
import PayoutStructure from './PayoutStructure';
import FieldSizeStrategy from './FieldSizeStrategy';

// ●●● PHASE 62: Heads-Up Adjust, 3-Handed, Short-Handed, Full Ring ●●●
import HeadsUpAdjust from './HeadsUpAdjust';
import ThreeHandedPlay from './ThreeHandedPlay';
import ShortHandedGuide from './ShortHandedGuide';
import FullRingStrategy from './FullRingStrategy';

// ●●● PHASE 63: Micro Stakes, Mid Stakes, High Stakes, Nosebleed ●●●
import MicroStakesGuide from './MicroStakesGuide';
import MidStakesGuide from './MidStakesGuide';
import HighStakesGuide from './HighStakesGuide';
import NosebleedGuide from './NosebleedGuide';

// ●●● PHASE 64: PLO Basics, PLO Hands, PLO Postflop, PLO Draw Math ●●●
import PLOBasicsGuide from './PLOBasicsGuide';
import PLOHandSelection from './PLOHandSelection';
import PLOPostflopGuide from './PLOPostflopGuide';
import PLODrawMath from './PLODrawMath';

// ●●● PHASE 65: Spin & Go, Sit & Go, MTT Final Table, MTT Early Stage ●●●
import SpinAndGoStrategy from './SpinAndGoStrategy';
import SitAndGoGuide from './SitAndGoGuide';
import MTTFinalTableGuide from './MTTFinalTableGuide';
import MTTEarlyStageGuide from './MTTEarlyStageGuide';

// ●●● PHASE 66: Cash Buy-In, Cash vs MTT, Online vs Live, Zoom ●●●
import CashGameBuyIn from './CashGameBuyIn';
import CashVsTournament from './CashVsTournament';
import OnlineVsLiveGuide from './OnlineVsLiveGuide';
import ZoomPokerGuide from './ZoomPokerGuide';

// ●●● PHASE 67: Poker Math, Psychology, Hand History, Warm-Up ●●●
import PokerMathEssentials from './PokerMathEssentials';
import PokerPsychology from './PokerPsychology';
import HandHistoryAnalysis from './HandHistoryAnalysis';
import WarmUpRoutine from './WarmUpRoutine';

// ●●● GAP CLOSERS: GTO Wizard Feature Parity ●●●
import GTOReportsDashboard from './GTOReportsDashboard';
import EVComparisonTool from './EVComparisonTool';
import SimplifiedSolutions from './SimplifiedSolutions';
import CustomSolutionBuilder from './CustomSolutionBuilder';
import AggregatedFlopReport from './AggregatedFlopReport';
import PokerArenaMode from './PokerArenaMode';
import ActionFilterAnalyzer from './ActionFilterAnalyzer';
import PKOSolverGuide from './PKOSolverGuide';
import MultiwaySolver from './MultiwaySolver';
import DeepStackSolutions from './DeepStackSolutions';
// ●●● CRITICAL GAP CLOSERS BATCH 2: Horse AI + Training Tools ●●●
import HandMatrixViewer from './HandMatrixViewer';
import AdaptiveAIOpponent from './AdaptiveAIOpponent';
import DailyPersonalQuiz from './DailyPersonalQuiz';
import MarkTheSpot from './MarkTheSpot';
import StraddleAnteSolver from './StraddleAnteSolver';
import HUSNGSolver from './HUSNGSolver';
import SessionCoachingEngine from './SessionCoachingEngine';
import StrategyNodeInspector from './StrategyNodeInspector';
// ●●● Phase 3 Engines: Real-time scoring + diamond rewards ●●●
import { calculateSessionDiamonds, getScoreGrade, getArenaScoreColor, formatSignedScore } from '../../engines/GTOScoreEngine';

// DYNAMIC IMPORTS — breaks circular dependency (page files importing from src/)
// These page-level components are only used for specific gameIds, so lazy-loading is fine
const SPRTrainer = dynamic(() => import('../../../pages/hub/training/spr-trainer'), { ssr: false });
const QuizGauntlet = dynamic(() => import('../../../pages/hub/training/quiz-gauntlet'), {
  ssr: false,
});

// Components defined locally within this file or in other imports
import useGTOTrainer from '../../hooks/useGTOTrainer';
import useSpacedRepetition from '../../hooks/useSpacedRepetition';
import { CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../hooks/useGTOWScore';
// SESSION ANALYTICS (2026-08-08): pure selectors over the one handHistory
// accumulator — the same functions the session-analytics harness asserts.
import { deriveTopLeaks } from '../../lib/sessionAnalytics';
const Confetti = dynamic(() => import('react-confetti'), { ssr: false });
import { getDiamondReward } from '../../config/trainingConfig';
import { getLevel } from '../../config/LevelRegistry';
import { getGameConfig as getGameEngineConfig } from '../../config/gameConfigs';
import { eventBus, EventType } from '../../engine/EventBus';
// Extracted utilities
import { saveSession } from './utils/saveSession';
import { checkSpeedBonus } from './utils/achievementChecker';
import { acquireScrollLock } from '../../lib/scrollLock';

// ALL GAMES use full-screen immersive UI with GameUIRouter
const FULL_SCREEN_UI_GAMES = [
  // Cash Games (25)
  'cash-001',
  'cash-002',
  'cash-003',
  'cash-004',
  'cash-005',
  'cash-006',
  'cash-007',
  'cash-008',
  'cash-009',
  'cash-010',
  'cash-011',
  'cash-012',
  'cash-013',
  'cash-014',
  'cash-015',
  'cash-016',
  'cash-017',
  'cash-018',
  'cash-019',
  'cash-020',
  'cash-021',
  'cash-022',
  'cash-023',
  'cash-024',
  'cash-025',
  // MTT Games (25)
  'mtt-001',
  'mtt-002',
  'mtt-003',
  'mtt-004',
  'mtt-005',
  'mtt-006',
  'mtt-007',
  'mtt-008',
  'mtt-009',
  'mtt-010',
  'mtt-011',
  'mtt-012',
  'mtt-013',
  'mtt-014',
  'mtt-015',
  'mtt-016',
  'mtt-017',
  'mtt-018',
  'mtt-019',
  'mtt-020',
  'mtt-021',
  'mtt-022',
  'mtt-023',
  'mtt-024',
  'mtt-025',
  // Spins Games (10)
  'spins-001',
  'spins-002',
  'spins-003',
  'spins-004',
  'spins-005',
  'spins-006',
  'spins-007',
  'spins-008',
  'spins-009',
  'spins-010',
  // Psychology Games (20)
  'psy-001',
  'psy-002',
  'psy-003',
  'psy-004',
  'psy-005',
  'psy-006',
  'psy-007',
  'psy-008',
  'psy-009',
  'psy-010',
  'psy-011',
  'psy-012',
  'psy-013',
  'psy-014',
  'psy-015',
  'psy-016',
  'psy-017',
  'psy-018',
  'psy-019',
  'psy-020',
  // Advanced Games (20)
  'adv-001',
  'adv-002',
  'adv-003',
  'adv-004',
  'adv-005',
  'adv-006',
  'adv-007',
  'adv-008',
  'adv-009',
  'adv-010',
  'adv-011',
  'adv-012',
  'adv-013',
  'adv-014',
  'adv-015',
  'adv-016',
  'adv-017',
  'adv-018',
  'adv-019',
  'adv-020',
  // Special Games (7)
  'tournament-prep',
  'final-table-sim',
  'quiz-gauntlet',
  'hand-lab',
  'bluff-catcher',
  'mixed-strategy-lab',
  'study-group',
];

// SVG ICON RENDERER for classification badges
function ClassificationSVGIcon({ icon, size = 14, color = 'currentColor' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (icon) {
    case 'star':
      return (
        <svg {...props} strokeWidth="2.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'check':
      return (
        <svg {...props} strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...props} strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'x':
      return (
        <svg {...props} strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...props} strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return <span>{icon || '?'}</span>;
  }
}

function getEngineType(gameId) {
  const cfg = getGameEngineConfig?.(gameId);
  return cfg?.engine || 'PIO';
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND HISTORY ENTRY — Single row in the post-session review
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function HandHistoryRow({ entry, index }) {
  const [expanded, setExpanded] = useState(false);
  const config =
    CLASSIFICATION_CONFIG[entry.classification] ||
    CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
  const handData = entry.handData || {};

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      {/* Main row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
          borderLeft: `3px solid ${config.borderColor}`,
          borderRadius: 4,
        }}
      >
        <div style={{ color: '#64748b', fontSize: 11, fontWeight: '600', minWidth: 24 }}>
          #{entry.handNumber}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 12,
            background: config.bgColor,
            border: `1px solid ${config.borderColor}`,
            color: config.color,
            fontSize: 11,
            fontWeight: 'bold',
            minWidth: 80,
            justifyContent: 'center',
          }}
        >
          <span>
            <ClassificationSVGIcon icon={config.icon} size={12} color={config.color} />
          </span>
          <span>{config.label}</span>
        </div>
        <div
          style={{
            flex: 1,
            color: '#cbd5e1',
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.question || `Hand ${entry.handNumber}`}
        </div>
        <div
          style={{
            color: entry.evLoss > 0 ? '#ef4444' : '#22c55e',
            fontSize: 12,
            fontWeight: 'bold',
            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
            minWidth: 60,
            textAlign: 'right',
          }}
        >
          {entry.evLoss > 0 ? `-${entry.evLoss.toFixed(2)}` : '0.00'} BB
        </div>
        <span style={{ color: '#64748b', fontSize: 10 }}>{expanded ? '●' : '●'}</span>
      </div>

      {/* F3: Expanded Hand Replay Detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              overflow: 'hidden',
              background: 'rgba(0,0,0,0.3)',
              borderLeft: `3px solid ${config.borderColor}`,
              padding: expanded ? '10px 14px 10px 40px' : 0,
              fontSize: 11,
              color: '#94a3b8',
            }}
          >
            {handData.board && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: '#64748b', fontWeight: 'bold' }}>Board: </span>
                <span style={{ color: '#e2e8f0' }}>{handData.board}</span>
              </div>
            )}
            {handData.heroCards && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: '#64748b', fontWeight: 'bold' }}>Hero: </span>
                <span style={{ color: '#00d4ff' }}>
                  {Array.isArray(handData.heroCards)
                    ? handData.heroCards.join(' ')
                    : handData.heroCards}
                </span>
                {handData.heroPosition && <span> ({handData.heroPosition})</span>}
              </div>
            )}
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#64748b', fontWeight: 'bold' }}>Your Action: </span>
              <span style={{ color: config.color }}>{handData.action || '?'}</span>
              {handData.correctAction && handData.action !== handData.correctAction && (
                <span>
                  {' '}
                  → Optimal:{' '}
                  <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
                    {handData.correctAction}
                  </span>
                </span>
              )}
            </div>
            {entry.isRealData && (
              <div style={{ marginTop: 4 }}>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 4,
                    fontSize: 9,
                    background: 'rgba(0,212,255,0.15)',
                    color: '#00d4ff',
                    border: '1px solid rgba(0,212,255,0.3)',
                    fontWeight: 'bold',
                  }}
                >
                  PIO DATA
                </span>
              </div>
            )}
            {/* Enhanced Replay: Pot, Stack, Street, GTO Frequencies */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              {handData.pot > 0 && (
                <span style={{ fontSize: 10, color: '#64748b' }}>
                  Pot: <strong style={{ color: '#fbbf24' }}>{handData.pot} BB</strong>
                </span>
              )}
              {handData.stackDepth > 0 && (
                <span style={{ fontSize: 10, color: '#64748b' }}>
                  Stack: <strong style={{ color: '#e2e8f0' }}>{handData.stackDepth} BB</strong>
                </span>
              )}
              {handData.street && (
                <span style={{ fontSize: 10, color: '#64748b' }}>
                  Street: <strong style={{ color: '#e2e8f0' }}>{handData.street}</strong>
                </span>
              )}
            </div>
            {/* GTO Frequency breakdown if available */}
            {entry.gtoFrequencies && Object.keys(entry.gtoFrequencies || {}).length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: 1,
                    marginBottom: 3,
                  }}
                >
                  GTO FREQUENCIES
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {Object.entries(entry.gtoFrequencies || {}).map(([action, freq]) => (
                    <span key={action} style={{ fontSize: 10, color: '#94a3b8' }}>
                      {action}:{' '}
                      <strong style={{ color: '#e2e8f0' }}>
                        {typeof freq === 'number' ? `${freq}%` : freq}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F14: ACCURACY BY POSITION — Horizontal bar chart per seat
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function AccuracyByPositionChart({ handHistory }) {
  if (!handHistory || handHistory.length < 3) return null;
  const posStats = {};
  handHistory.forEach((h) => {
    const pos = h.handData?.heroPosition || 'UNK';
    if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0 };
    posStats[pos].total++;
    if (h.classification === 'best' || h.classification === 'correct') posStats[pos].correct++;
  });
  const positions = Object.keys(posStats || {});
  if (positions.length === 0) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        Accuracy by Position
      </div>
      {positions.map((pos) => {
        const pct =
          posStats[pos].total > 0
            ? Math.round((posStats[pos].correct / posStats[pos].total) * 100)
            : 0;
        return (
          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 40, fontSize: 11, fontWeight: 600, color: '#00d4ff' }}>
              {pos}
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                background: '#1e293b',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: 0.1 }}
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background: pct >= 70 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444',
                }}
              />
            </div>
            <span
              style={{
                width: 35,
                fontSize: 11,
                fontWeight: 'bold',
                color: pct >= 70 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444',
                textAlign: 'right',
              }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// WEAKNESS HEATMAP — Position x Street accuracy grid
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function WeaknessHeatmap({ handHistory }) {
  if (!handHistory || handHistory.length < 5) return null;
  const grid = {};
  const positions = new Set();
  const streets = ['preflop', 'flop', 'turn', 'river'];
  handHistory.forEach((h) => {
    const pos = h.handData?.heroPosition || 'UNK';
    const st = h.handData?.street || 'flop';
    positions.add(pos);
    if (!grid[pos]) grid[pos] = {};
    if (!grid[pos][st]) grid[pos][st] = { correct: 0, total: 0 };
    grid[pos][st].total++;
    if (h.classification === 'best' || h.classification === 'correct') grid[pos][st].correct++;
  });
  const posArr = [...positions];
  if (posArr.length === 0) return null;
  const getColor = (pct) =>
    pct >= 80 ? '#22c55e' : pct >= 60 ? '#fbbf24' : pct >= 40 ? '#f97316' : '#ef4444';
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 10,
        }}
      >
        Weakness Heatmap
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `60px repeat(${streets.length}, 1fr)`,
          gap: 3,
          fontSize: 10,
        }}
      >
        <div style={{ color: '#64748b', fontWeight: 700 }}></div>
        {streets.map((s) => (
          <div
            key={s}
            style={{
              color: '#94a3b8',
              fontWeight: 700,
              textTransform: 'uppercase',
              textAlign: 'center',
              fontSize: 9,
            }}
          >
            {s.slice(0, 3)}
          </div>
        ))}
        {posArr.map((pos) => (
          <React.Fragment key={pos}>
            <div
              style={{ color: '#00d4ff', fontWeight: 700, display: 'flex', alignItems: 'center' }}
            >
              {pos}
            </div>
            {streets.map((st) => {
              const cell = grid[pos]?.[st];
              if (!cell || cell.total === 0)
                return (
                  <div
                    key={st}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 4,
                      padding: 4,
                      textAlign: 'center',
                      color: '#475569',
                    }}
                  >
                    -
                  </div>
                );
              const pct = Math.round((cell.correct / cell.total) * 100);
              return (
                <motion.div
                  key={st}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  style={{
                    background: `${getColor(pct)}22`,
                    border: `1px solid ${getColor(pct)}44`,
                    borderRadius: 4,
                    padding: '4px 0',
                    textAlign: 'center',
                    color: getColor(pct),
                    fontWeight: 700,
                  }}
                >
                  {pct}%
                </motion.div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize: 9, color: '#64748b', marginTop: 6, textAlign: 'center' }}>
        Green = 80%+ | Yellow = 60-79% | Orange = 40-59% | Red = under 40%
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ACCURACY OVER TIME — Rolling accuracy line chart across session
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function AccuracyOverTimeChart({ handHistory }) {
  if (!handHistory || handHistory.length < 3) return null;
  const points = [];
  for (let i = 0; i < handHistory.length; i++) {
    const windowStart = Math.max(0, i - 4);
    let correct = 0;
    for (let j = windowStart; j <= i; j++) {
      if (handHistory[j].classification === 'best' || handHistory[j].classification === 'correct')
        correct++;
    }
    points.push(Math.round((correct / (i - windowStart + 1)) * 100));
  }
  const maxH = 60;
  const pathD = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * 100;
      const y = maxH - (p / 100) * maxH;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        Accuracy Over Time
      </div>
      <svg
        viewBox={`0 0 100 ${maxH}`}
        style={{ width: '100%', height: 60 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L100,${maxH} L0,${maxH} Z`} fill="url(#accGrad)" />
        <path d={pathD} fill="none" stroke="#00d4ff" strokeWidth="1.5" />
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: '#64748b',
          marginTop: 2,
        }}
      >
        <span>Hand 1</span>
        <span>Hand {handHistory.length}</span>
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F15: CLASSIFICATION DONUT CHART — SVG donut of move distribution
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function ClassificationDonut({ handHistory, gtowScore }) {
  const segments = useMemo(() => {
    if (!handHistory || handHistory.length === 0) return [];
    const counts = {};
    Object.values(MOVE_CLASSIFICATIONS || {}).forEach((c) => (counts[c] = 0));
    handHistory.forEach((h) => {
      if (h.classification) counts[h.classification]++;
    });
    const total = handHistory.length;
    const colorMap = {};
    Object.entries(CLASSIFICATION_CONFIG || {}).forEach(([key, cfg]) => {
      colorMap[key] = cfg.color;
    });

    let cumAngle = 0;
    return Object.entries(counts || {})
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const pct = count / total;
        const startAngle = cumAngle;
        cumAngle += pct * 360;
        return { key, count, pct, startAngle, endAngle: cumAngle, color: colorMap[key] || '#666' };
      });
  }, [handHistory]);

  if (segments.length === 0) return null;

  const cx = 55,
    cy = 55,
    r = 40,
    strokeWidth = 12;
  const circumference = 2 * Math.PI * r;
  const scoreColor = getArenaScoreColor(gtowScore);

  let dashOffset = 0;

  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={110} height={110} viewBox="0 0 110 110">
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
        {segments.map((seg) => {
          const segLen = seg.pct * circumference;
          const offset = dashOffset;
          dashOffset += segLen;
          return (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segLen} ${circumference - segLen}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          );
        })}
        {/* Center score */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill={scoreColor}
          fontSize="18"
          fontWeight="bold"
          style={{ fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}
        >
          {gtowScore}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7"
          fontWeight="600"
          letterSpacing="1"
        >
          GTOW
        </text>
      </svg>
      <div style={{ flex: 1 }}>
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}
          >
            <div
              style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }}
            />
            <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, flex: 1 }}>
              {CLASSIFICATION_CONFIG[seg.key]?.label || seg.key}
            </div>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: seg.color }}>
              {seg.count} ({Math.round(seg.pct * 100)}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F4: EV LOSS GRAPH — Cumulative EV loss sparkline
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function EVLossGraph({ handHistory }) {
  // Build cumulative EV loss data points
  const dataPoints = useMemo(() => {
    if (!handHistory || handHistory.length < 2) return [];
    let cumulative = 0;
    return handHistory.map((h, i) => {
      cumulative += h.evLoss || 0;
      return cumulative;
    });
  }, [handHistory]);

  if (!handHistory || handHistory.length < 2) return null;

  const maxLoss = Math.max(...dataPoints, 0.1);
  const graphHeight = 60;
  const barWidth = Math.max(2, Math.floor(100 / dataPoints.length) - 1);

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        EV Loss Trend
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          height: graphHeight,
          padding: '0 4px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {dataPoints.map((val, i) => {
          const height = maxLoss > 0 ? (val / maxLoss) * graphHeight : 0;
          const color =
            val > maxLoss * 0.7 ? '#ef4444' : val > maxLoss * 0.3 ? '#fbbf24' : '#22c55e';
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: Math.max(2, height) }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              title={`Hand ${i + 1}: -${val.toFixed(2)} BB`}
              style={{
                width: barWidth + '%',
                flexShrink: 0,
                background: color,
                borderRadius: '2px 2px 0 0',
                cursor: 'default',
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: '#64748b',
          marginTop: 2,
        }}
      >
        <span>Hand 1</span>
        <span>-{maxLoss.toFixed(1)} BB max</span>
        <span>Hand {dataPoints.length}</span>
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ●●● COLLAPSIBLE ANALYSIS SECTION — Groups analysis panels into expandable categories ●●●
// Phase 357: Memoized to prevent re-renders when switching review tabs
const AnalysisSection = memo(function AnalysisSection({
  title,
  icon,
  color = '#94a3b8',
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.25)',
          border: `1px solid ${color}22`,
          borderRadius: open ? '10px 10px 0 0' : 10,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {title}
          </span>
        </div>
        <span
          style={{
            fontSize: 14,
            color: '#64748b',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >

        </span>
      </button>
      {open && (
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(0,0,0,0.15)',
            borderRadius: '0 0 10px 10px',
            border: `1px solid ${color}11`,
            borderTop: 'none',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
});

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CARD PATH HELPER — Same custom card images used in UniversalDynamicTable
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function getCardImagePath(card) {
  if (!card || card.length < 2) return '/cards/back.png';
  const rankChar = card[0].toLowerCase();
  const suit = card[1].toLowerCase();
  const rank = rankChar === 't' ? '10' : rankChar;
  const suitMap = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
  return `/cards/${suitMap[suit] || 'hearts'}_${rank}.png`;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND HISTORY IMPORT MODAL — Paste hand history to train from your own hands
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function HandHistoryImportModal({
  importState,
  setImportState,
  importHandToTrainingQuestion,
  onStartImported,
  onClose,
}) {
  const { parseHandHistory, detectFormat } = require('../../utils/hh-parser');

  const handleParse = () => {
    if (!importState.rawText.trim()) {
      setImportState((prev) => ({ ...prev, error: 'Paste a hand history to continue' }));
      return;
    }
    try {
      const parsed = parseHandHistory(importState.rawText.trim());
      if (!parsed || !parsed.success) {
        setImportState((prev) => ({
          ...prev,
          error: parsed?.error || 'Could not parse hand history',
          parsedHand: null,
        }));
        return;
      }
      setImportState((prev) => ({ ...prev, parsedHand: parsed, error: null }));
    } catch (e) {
      setImportState((prev) => ({ ...prev, error: `Parse error: ${e.message}`, parsedHand: null }));
    }
  };

  const handleTrain = (street) => {
    if (!importState.parsedHand) return;
    const question = importHandToTrainingQuestion(importState.parsedHand, street);
    if (question) {
      onStartImported(question);
    }
  };

  const parsed = importState.parsedHand;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #0a0e17 100%)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              color: '#10b981',
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
            }}
          >
            Import Hand History
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            x
          </button>
        </div>

        {/* Format badges */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {['PokerStars', 'GGPoker', 'Ignition', '888poker', 'WPN/ACR'].map((f) => (
            <span
              key={f}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 600,
                background: 'rgba(16,185,129,0.1)',
                color: '#10b981',
                border: '1px solid rgba(16,185,129,0.2)',
              }}
            >
              {f}
            </span>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          value={importState.rawText}
          onChange={(e) =>
            setImportState((prev) => ({ ...prev, rawText: e.target.value, error: null }))
          }
          placeholder="Paste your hand history here..."
          style={{
            width: '100%',
            minHeight: 140,
            padding: 12,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0',
            fontSize: 11,
            fontFamily: 'monospace',
            resize: 'vertical',
            outline: 'none',
          }}
        />

        {importState.error && (
          <div style={{ color: '#ef4444', fontSize: 11, marginTop: 6 }}>{importState.error}</div>
        )}

        {/* Parse button */}
        <button
          onClick={handleParse}
          style={{
            width: '100%',
            padding: '10px',
            marginTop: 10,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Parse Hand
        </button>

        {/* Parsed result */}
        {parsed && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 10,
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.15)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>
              Hand Parsed Successfully
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                fontSize: 11,
                color: '#94a3b8',
              }}
            >
              <div>
                Format: <span style={{ color: '#e2e8f0' }}>{parsed.format}</span>
              </div>
              <div>
                Position: <span style={{ color: '#e2e8f0' }}>{parsed.heroPosition}</span>
              </div>
              <div>
                Hero:{' '}
                <span style={{ color: '#e2e8f0' }}>{parsed.heroCards?.join(' ') || 'N/A'}</span>
              </div>
              <div>
                Pot: <span style={{ color: '#e2e8f0' }}>{parsed.potSize || '?'} BB</span>
              </div>
              <div>
                Flop:{' '}
                <span style={{ color: '#e2e8f0' }}>{parsed.board?.flop?.join(' ') || 'N/A'}</span>
              </div>
              <div>
                Players: <span style={{ color: '#e2e8f0' }}>{parsed.numPlayers}</span>
              </div>
              {parsed.board?.turn && (
                <div>
                  Turn: <span style={{ color: '#e2e8f0' }}>{parsed.board.turn}</span>
                </div>
              )}
              {parsed.board?.river && (
                <div>
                  River: <span style={{ color: '#e2e8f0' }}>{parsed.board.river}</span>
                </div>
              )}
            </div>

            {/* Street buttons */}
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              {parsed.board?.flop?.length > 0 && (
                <button
                  onClick={() => handleTrain('flop')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: '#3b82f6',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Train Flop
                </button>
              )}
              {parsed.board?.turn && (
                <button
                  onClick={() => handleTrain('turn')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: '#f59e0b',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Train Turn
                </button>
              )}
              {parsed.board?.river && (
                <button
                  onClick={() => handleTrain('river')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Train River
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FLASHCARD MODE — GTO concept flip-cards with spaced repetition feel
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function FlashcardMode({ flashcardState, setFlashcardState, generateFlashcards, onExit }) {
  const { cards, currentIndex, flipped, score } = flashcardState;

  // Initialize cards if empty
  useEffect(() => {
    if (cards.length === 0 && generateFlashcards) {
      const data = generateFlashcards();
      if (data) {
        const cardList = data.cards || data;
        setFlashcardState((prev) => ({
          ...prev,
          category: data.category || 'mixed',
          cards: Array.isArray(cardList) ? cardList : [],
        }));
      }
    }
  }, [cards.length, generateFlashcards, setFlashcardState]);

  if (cards.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#64748b',
        }}
      >
        Loading flashcards...
      </div>
    );
  }

  const card = cards[currentIndex];
  const progress = currentIndex / cards.length;
  const isComplete = currentIndex >= cards.length;

  const handleFlip = () => setFlashcardState((prev) => ({ ...prev, flipped: !prev.flipped }));

  const handleResponse = (knew) => {
    setFlashcardState((prev) => ({
      ...prev,
      flipped: false,
      currentIndex: prev.currentIndex + 1,
      completed: prev.completed + 1,
      score: {
        knew: prev.score.knew + (knew ? 1 : 0),
        learning: prev.score.learning + (knew ? 0 : 1),
      },
    }));
  };

  const handleNewDeck = () => {
    const data = generateFlashcards();
    if (data) {
      const cardList = data.cards || data;
      setFlashcardState({
        category: data.category || 'mixed',
        cards: Array.isArray(cardList) ? cardList : [],
        currentIndex: 0,
        flipped: false,
        completed: 0,
        score: { knew: 0, learning: 0 },
      });
    }
  };

  const catLabels = {
    pot_odds: 'Pot Odds',
    position: 'Position Play',
    betting: 'Betting Strategy',
    draws: 'Drawing Hands',
    preflop: 'Preflop Play',
    board_texture: 'Board Texture',
    river_play: 'River Play',
    gto_theory: 'GTO Theory',
  };

  if (isComplete) {
    const totalCards = score.knew + score.learning;
    const pct = totalCards > 0 ? Math.round((score.knew / totalCards) * 100) : 0;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 20,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {pct >= 80 ? '★' : pct >= 50 ? '□' : '▲'}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
          Deck Complete!
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
          {catLabels[flashcardState.category] || 'GTO Concepts'}
        </div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#22c55e',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              {score.knew}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Knew It</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#f59e0b',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              {score.learning}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Learning</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 300 }}>
          <button
            onClick={handleNewDeck}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            New Deck
          </button>
          <button
            onClick={onExit}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)',
              color: '#94a3b8',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 20,
      }}
    >
      {/* Decorative custom card images */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, opacity: 0.5 }}>
        <img
          src={getCardImagePath('As')}
          alt="card"
          style={{ width: 28, height: 39, borderRadius: 3 }}
        />
        <img
          src={getCardImagePath('Kh')}
          alt="card"
          style={{ width: 28, height: 39, borderRadius: 3 }}
        />
      </div>

      {/* Category + Progress */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#00d4ff',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {catLabels[flashcardState.category] || 'GTO Concepts'} • Card {currentIndex + 1}/
        {cards.length}
      </div>
      <div
        style={{
          width: '80%',
          maxWidth: 300,
          height: 3,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 2,
          marginBottom: 20,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            borderRadius: 2,
            transition: 'width 0.3s',
          }}
        />
      </div>

      {/* Card */}
      <div
        onClick={handleFlip}
        style={{
          width: '100%',
          maxWidth: 360,
          minHeight: 200,
          padding: 24,
          borderRadius: 16,
          cursor: 'pointer',
          background: flipped
            ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.06))'
            : 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.06))',
          border: `1px solid ${flipped ? 'rgba(34,197,94,0.25)' : 'rgba(59,130,246,0.25)'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s',
          transform: flipped ? 'rotateY(0deg)' : 'rotateY(0deg)',
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: flipped ? '#22c55e' : '#3b82f6',
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            marginBottom: 12,
          }}
        >
          {flipped ? 'Answer' : 'Question'}
        </div>
        <div
          style={{
            fontSize: 15,
            color: '#e2e8f0',
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {flipped ? card?.back || 'No answer' : card?.front || 'No question'}
        </div>
        {!flipped && (
          <div style={{ fontSize: 10, color: '#475569', marginTop: 12 }}>Tap to reveal answer</div>
        )}
      </div>

      {/* Response buttons (only when flipped) */}
      {flipped && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%', maxWidth: 360 }}>
          <button
            onClick={() => handleResponse(false)}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 10,
              border: '1px solid rgba(245,158,11,0.3)',
              background: 'rgba(245,158,11,0.08)',
              color: '#f59e0b',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Still Learning
          </button>
          <button
            onClick={() => handleResponse(true)}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 10,
              border: '1px solid rgba(34,197,94,0.3)',
              background: 'rgba(34,197,94,0.08)',
              color: '#22c55e',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Knew It ✓
          </button>
        </div>
      )}

      {/* Score bar */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✓ {score.knew}</div>
        <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>□ {score.learning}</div>
      </div>

      {/* Back */}
      <button
        onClick={onExit}
        style={{
          marginTop: 16,
          background: 'none',
          border: 'none',
          color: '#475569',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ← Back to Training
      </button>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// DRILL MODE — Rapid-fire yes/no GTO decisions with countdown timer
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function DrillMode({
  drillState,
  setDrillState,
  currentQuestion,
  generateQuickFireQuestion,
  getBoardTextureQuiz,
  getConceptQuiz,
  onExit,
  timerRef,
}) {
  const { currentQ, answered, correct, streak, bestStreak, timeLeft, results } = drillState;

  // Generate first drill question
  useEffect(() => {
    if (!currentQ && currentQuestion) {
      const scenario = currentQuestion.scenario || {};
      const heroHand = currentQuestion.heroHand || 'AKs';
      const correctAction = currentQuestion.correctAnswer || 'c';
      let q = null;
      if (generateQuickFireQuestion) {
        q = generateQuickFireQuestion(scenario, heroHand, correctAction);
      }
      if (!q && getBoardTextureQuiz) {
        const btq = getBoardTextureQuiz();
        if (btq)
          q = {
            q: btq.question || btq.prompt || 'Classify this board texture',
            a: btq.answer || 'YES',
          };
      }
      if (!q && getConceptQuiz) {
        const cq = getConceptQuiz();
        if (cq && cq.question) q = { q: cq.question, a: cq.correctAnswer === 0 ? 'YES' : 'NO' };
      }
      if (q) setDrillState((prev) => ({ ...prev, currentQ: q, timeLeft: 10 }));
    }
  }, [
    currentQ,
    currentQuestion,
    generateQuickFireQuestion,
    getBoardTextureQuiz,
    getConceptQuiz,
    setDrillState,
  ]);

  // Countdown timer
  useEffect(() => {
    if (!currentQ) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setDrillState((prev) => {
        if (prev.timeLeft <= 1) {
          clearInterval(timerRef.current);
          // Time's up = wrong
          return {
            ...prev,
            timeLeft: 0,
            answered: prev.answered + 1,
            streak: 0,
            results: [...prev.results, { q: prev.currentQ?.q, correct: false, timedOut: true }],
            currentQ: null, // triggers new question generation
          };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQ, timerRef, setDrillState]);

  const handleAnswer = (answer) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const isCorrect = currentQ && answer === currentQ.a;
    setDrillState((prev) => ({
      ...prev,
      answered: prev.answered + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
      streak: isCorrect ? prev.streak + 1 : 0,
      bestStreak: isCorrect ? Math.max(prev.bestStreak, prev.streak + 1) : prev.bestStreak,
      results: [...prev.results, { q: currentQ?.q, correct: isCorrect, answer }],
      currentQ: null, // triggers re-generation
      timeLeft: 10,
    }));
  };

  const isComplete = answered >= 20;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  if (isComplete) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 20,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {accuracy >= 80 ? '▲' : accuracy >= 60 ? '⌁' : '▲'}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>
          Drill Complete!
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          20 rapid-fire decisions
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: accuracy >= 70 ? '#22c55e' : '#f59e0b',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              {accuracy}%
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Accuracy</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: '#00d4ff',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              {bestStreak}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Best Streak</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: '#a78bfa',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              {correct}/{answered}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Score</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 300 }}>
          <button
            onClick={() =>
              setDrillState({
                active: true,
                currentQ: null,
                answered: 0,
                correct: 0,
                streak: 0,
                bestStreak: 0,
                timeLeft: 10,
                results: [],
              })
            }
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Again
          </button>
          <button
            onClick={onExit}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)',
              color: '#94a3b8',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#64748b',
        }}
      >
        Loading drill question...
      </div>
    );
  }

  const timerPct = (timeLeft / 10) * 100;
  const timerColor = timeLeft > 5 ? '#22c55e' : timeLeft > 2 ? '#f59e0b' : '#ef4444';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 20,
      }}
    >
      {/* Header stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Q {answered + 1}/20</div>
        <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✓ {correct}</div>
        <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>▲ {streak}</div>
      </div>

      {/* Timer bar */}
      <div
        style={{
          width: '80%',
          maxWidth: 300,
          height: 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 2,
          marginBottom: 20,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${timerPct}%`,
            background: timerColor,
            borderRadius: 2,
            transition: 'width 1s linear, background 0.3s',
          }}
        />
      </div>

      {/* Timer number */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 800,
          color: timerColor,
          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
          marginBottom: 16,
          transition: 'color 0.3s',
        }}
      >
        {timeLeft}
      </div>

      {/* Hero Cards + Board (custom card images) */}
      {currentQuestion && (currentQuestion.heroCards || currentQuestion.scenario?.board) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            marginBottom: 12,
          }}
        >
          {/* Hero hand */}
          {currentQuestion.heroCards && currentQuestion.heroCards.length >= 2 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {currentQuestion.heroCards.map((c, i) => (
                <img
                  key={i}
                  src={getCardImagePath(c)}
                  alt={c}
                  style={{
                    width: 40,
                    height: 56,
                    borderRadius: 4,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  }}
                />
              ))}
            </div>
          )}
          {/* Board cards */}
          {currentQuestion.scenario?.board &&
            (() => {
              const boardStr = currentQuestion.scenario.board;
              const bc =
                typeof boardStr === 'string'
                  ? boardStr.replace(/\s+/g, '').match(/.{2}/g) || []
                  : Array.isArray(boardStr)
                    ? boardStr
                    : [];
              if (bc.length === 0) return null;
              return (
                <div style={{ display: 'flex', gap: 3 }}>
                  {bc.map((c, i) => (
                    <img
                      key={i}
                      src={getCardImagePath(c)}
                      alt={c}
                      style={{
                        width: 32,
                        height: 44,
                        borderRadius: 3,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                      }}
                    />
                  ))}
                </div>
              );
            })()}
        </div>
      )}

      {/* Question */}
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          padding: '20px 24px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.04))',
          border: '1px solid rgba(59,130,246,0.2)',
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 16, color: '#e2e8f0', fontWeight: 700, lineHeight: 1.5 }}>
          {currentQ.q}
        </div>
      </div>

      {/* YES / NO buttons */}
      <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 380 }}>
        <button
          onClick={() => handleAnswer('YES')}
          style={{
            flex: 1,
            padding: '18px 0',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            color: '#fff',
            fontSize: 18,
            fontWeight: 800,
            cursor: 'pointer',
            letterSpacing: 1,
          }}
        >
          YES
        </button>
        <button
          onClick={() => handleAnswer('NO')}
          style={{
            flex: 1,
            padding: '18px 0',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: '#fff',
            fontSize: 18,
            fontWeight: 800,
            cursor: 'pointer',
            letterSpacing: 1,
          }}
        >
          NO
        </button>
      </div>

      <button
        onClick={onExit}
        style={{
          marginTop: 16,
          background: 'none',
          border: 'none',
          color: '#475569',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ← Exit Drill
      </button>
    </div>
  );
}

// F7: DRILL FILTERS — Pre-session position/street filter modal
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function DrillFilters({
  show,
  onClose,
  onApply,
  difficulty,
  setDifficulty,
  timerMode,
  setTimerMode,
}) {
  const [positions, setPositions] = useState(['all']);
  const [streets, setStreets] = useState(['all']);

  if (!show) return null;

  const posOpts = ['all', 'BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];
  const streetOpts = ['all', 'preflop', 'flop', 'turn', 'river'];

  const toggleFilter = (arr, setter, val) => {
    if (val === 'all') {
      setter(['all']);
      return;
    }
    const without = arr.filter((x) => x !== 'all');
    if (without.includes(val)) {
      const next = without.filter((x) => x !== val);
      setter(next.length === 0 ? ['all'] : next);
    } else {
      setter([...without, val]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        style={{
          background: 'linear-gradient(180deg, #1e1e2e, #0f0f1a)',
          border: '1px solid rgba(0,212,255,0.3)',
          borderRadius: 16,
          padding: 20,
          width: '90%',
          maxWidth: 360,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: '#e2e8f0',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          Drill Filters
        </div>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Position
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {posOpts.map((p) => (
              <button
                key={p}
                onClick={() => toggleFilter(positions, setPositions, p)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 'bold',
                  minHeight: 44,
                  background: positions.includes(p)
                    ? 'rgba(0,212,255,0.2)'
                    : 'rgba(255,255,255,0.05)',
                  color: positions.includes(p) ? '#00d4ff' : '#94a3b8',
                  border: `1px solid ${positions.includes(p) ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Street
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {streetOpts.map((s) => (
              <button
                key={s}
                onClick={() => toggleFilter(streets, setStreets, s)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 'bold',
                  minHeight: 44,
                  background: streets.includes(s)
                    ? 'rgba(139,92,246,0.2)'
                    : 'rgba(255,255,255,0.05)',
                  color: streets.includes(s) ? '#a78bfa' : '#94a3b8',
                  border: `1px solid ${streets.includes(s) ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Difficulty
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['beginner', 'standard', 'expert'].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 'bold',
                  background: difficulty === d ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                  color: difficulty === d ? '#00d4ff' : '#94a3b8',
                  border: `1px solid ${difficulty === d ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Timer Mode
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'relaxed', label: 'Relaxed (∞)' },
              { id: 'standard', label: 'Standard (25s)' },
              { id: 'quick', label: 'Quick (15s)' },
              { id: 'blitz', label: 'Blitz (7s)' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimerMode(t.id)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 'bold',
                  background: timerMode === t.id ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                  color: timerMode === t.id ? '#ef4444' : '#94a3b8',
                  border: `1px solid ${timerMode === t.id ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              minHeight: 48,
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onApply({ positions, streets });
              onClose();
            }}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              minHeight: 48,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Apply & Start
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F13: DAILY CHALLENGE BANNER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function DailyChallengeBanner({ gtowScore, targetScore = 70 }) {
  const achieved = gtowScore >= targetScore;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        marginBottom: 12,
        background: achieved
          ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,163,74,0.1))'
          : 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
        border: `1px solid ${achieved ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{achieved ? '✓' : '◎'}</span>
        <div>
          <div
            style={{ fontSize: 12, fontWeight: 'bold', color: achieved ? '#22c55e' : '#a78bfa' }}
          >
            {achieved ? 'Daily Challenge Complete!' : 'Daily Challenge'}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Score {formatSignedScore(targetScore)}+ this session</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 8,
          background: achieved ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${achieved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 'bold', color: achieved ? '#22c55e' : '#94a3b8' }}>
          {achieved ? 'Goal met' : 'Goal'}
        </span>
      </div>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// GTOW timebank: 7 / 15 / 25s. 'standard' was 60s -- four times the
// reference product's longest tier. 'quick' is the new middle tier; the old
// id set is kept so any persisted localStorage value still resolves.
const TIMER_DURATIONS = { relaxed: 0, standard: 25, quick: 15, blitz: 7 };

// GTOW parity #4 deleted the 60-second tier -- GTOW's longest timebank is 25s,
// so a minute is four times the reference product's most generous setting. It
// came back anyway, through `TIMER_DURATIONS[timerMode] || 60` at three call
// sites. That expression is wrong twice over.
//
// (a) An UNKNOWN key falls through to 60. `/hub/training/multi-table` defaulted
//     its timer to 'off', which is a value from the AUTO-ADVANCE vocabulary
//     ('on' | 'off'), not this one. Measured on production: a direct visit to
//     the multi-table screen ran a 60-second clock. That is the same class of
//     bug as the three difficulty vocabularies -- two controls whose value sets
//     look interchangeable and are not.
// (b) `relaxed` maps to 0, which is FALSY, so even the correct no-timer key
//     resolves to 60 here. It never showed because `timerEnabled` happened to
//     be computed as `timerMode !== 'relaxed'` and masked it. Two bugs
//     cancelling is not a fix; either one moving exposes the other.
//
// Resolve through these instead. An unrecognised mode means NO timer, never a
// minute, and "is there a timer" is derived from the duration rather than from
// a second string comparison that can drift away from the table above.
const resolveTimerSeconds = (mode) => (
  Object.prototype.hasOwnProperty.call(TIMER_DURATIONS, mode) ? TIMER_DURATIONS[mode] : 0
);
const isTimerEnabled = (mode) => resolveTimerSeconds(mode) > 0;

function GodModeArenaInner({
  userId,
  gameId,
  gameName,
  level = 1,
  sessionId,
  onComplete,
  onExit,
  autoAdvance = false,
  // 2026-07-26 UX FIX: when the caller has ALREADY collected difficulty /
  // timer / mode (SessionSetupModal on the dashboard), pass them here.
  // The arena then starts straight into play instead of showing its own
  // splash asking for the same three things a second time.
  initialConfig = null,
  // GTOW parity #10. Multi-tabling puts several arenas on screen at once, and
  // two of this component's behaviours are viewport-global rather than
  // table-local: the keyboard handler listens on `window`, and the win confetti
  // is a position:fixed canvas. With four arenas mounted, one "1" keypress
  // submitted an answer on all four, and one table passing its level painted
  // 1600 confetti pieces over the other three.
  //
  // Defaults to true so every existing single-table caller is untouched — the
  // one-arena case IS the focused arena. Multi-table passes false for the
  // tables the player is not currently looking at.
  isFocused = true,
}) {
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // SPECIALIZED TRAINERS (Phase 14) -> Safely moved to exported wrapper
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

  const engineType = getEngineType(gameId);

  // Trainer config state
  const [trainerConfig, setTrainerConfig] = useState(() => {
    if (initialConfig) {
      // GTOW's Auto New Hand delay is ~3s at Normal. Fast halves it; Turbo is
      // "as soon as the frame paints" — but 1ms gave no time to even register
      // that the hand resolved, so Turbo is 250ms.
      let delayMs = 3000;
      if (initialConfig.speed === 'fast') delayMs = 1500;
      if (initialConfig.speed === 'turbo') delayMs = 250;

      // GTOW parity #29: these two used to sit AFTER the spread, so whatever
      // the player chose in the setup modal was unconditionally discarded.
      // They now come from the config, with the spread last so it wins.
      return {
        feedbackRule: 'mistakes',
        autoAdvance: true,
        ...initialConfig,
        autoAdvanceDelayMs: delayMs,
      };
    }
    return null;
  });
  const [showConfigModal, setShowConfigModal] = useState(false);

  const handleConfigStart = useCallback((config) => {
    setTrainerConfig(config);
    setShowConfigModal(false);
    // Game will re-mount with new config
  }, []);

  const {
    currentQuestion,
    questionNumber,
    totalQuestions,
    level: currentLevel,
    loading,
    error,
    correctCount,
    streak,
    bestStreak,
    totalXP, // legacy stub (always 0) — diamonds are the only currency
    requiredCorrect,
    passThreshold,
    totalLevels,
    // ●●● MASTERY GATE ●●●
    masteryToken,
    masteryStatus,
    showFeedback,
    feedbackResult,
    explanation,
    gameComplete,
    levelPassed,
    // GTOW scoring
    moveClassification,
    evLoss,
    gtoFrequencies,
    gtowScore,
    totalEVLoss,
    sessionMistakes,
    handHistory,
    avgEVLossPerHand,
    avgEVLossPerMistake,
    avgFrequencyDiff,
    // Phase 37: Enhanced session metrics
    classificationCounts: gtowClassificationCounts,
    currentStreak: gtowCurrentStreak,
    bestGTOWStreak,
    lastClassification,
    gtowAccuracy,
    // Phase 38: Position & street accuracy
    positionAccuracy,
    streetAccuracy,
    weakestPosition,
    // Phase 40: Mistake patterns
    mistakePatterns,
    handTypePerformance,
    // Multi-street state
    currentStreet,
    isMultiStreetActive,
    handSummary,
    // Actions
    submitAnswer,
    nextQuestion,
    startNextLevel,
    retryLevel,
    retrainMistakes,
    resetGame,
    // ●●● PHASE 15: Weak-spot targeting ●●●
    getWeakSpots,
    // ●●● PHASE 251-260: Enhanced training intelligence ●●●
    structuredExplanation,
    generateLeakReport,
    getSessionGrade,
    getImprovementVelocity,
    prescribeDrills,
    getFrequencyMasteryScore,
    generateSessionReport,
    // ●●● PHASE 261-280: Deep coaching + analytics ●●●
    getTeachingPrinciple,
    getPositionReminder,
    getTextureStrategyGuide,
    getSPRStrategyGuide,
    getVillainRangeNarration,
    getMultiStreetPlanningGuide,
    getFrequencyCorrectionPrompt,
    getTiltRecoveryAdvice,
    getSessionPacingAnalysis,
    estimateSpotDifficultyEnhanced,
    classifyHandStrength,
    estimateEquityVsRange,
    getActionEVComparison,
    getSolverLineComparison,
    getConceptMasteryReport,
    generateHints,
    getRunoutImpactPreview,
    getMixedFrequencyDrillData,
    getHandCategoryBreakdown,
    getSessionComparison,
    // ●●● PHASE 281-290: Advanced analytics + coaching ●●●
    getRunningActionFrequencies,
    getMistakeClusters,
    getBoardCoverageAnalysis,
    getBluffToValueRatio,
    getEVLossHeatmap,
    getPositionLeaderboard,
    generateCoachingSummary,
    // ●●● PHASE 291-300: Advanced training intelligence II ●●●
    getStreakAnalysis,
    getTimePressureAnalysis,
    getRangeConstructionDrill,
    getExploitativeAdjustments,
    getICMPressureAnalysis,
    getMultiGameTypeStats,
    getBettingSizeAnalysis,
    getHandReadingDrill,
    getVarianceSimulator,
    getPerformanceTrendAnalysis,
    // ●●● PHASE 301-310: Advanced training intelligence III ●●●
    getOptimalLineNarration,
    getStreetTransitionAnalysis,
    getDefenseFrequencyCheck,
    getPolarizationIndex,
    getMistakeRecoveryRate,
    getConceptQuiz,
    getSessionMilestones,
    getAdaptiveDrillRecommendation,
    getCriticalHandHighlights,
    getComprehensiveSessionReport,
    // ●●● PHASE 311-320: Training edge features ●●●
    getNodeTypeBreakdown,
    getStreetSpecificLeaks,
    getOverbetAnalysis,
    getCheckRaiseAnalysis,
    getCBetAnalysis,
    getPositionPairAnalysis,
    getFrequencyConvergenceTracker,
    getSmartSessionLength,
    getTrainingPlan,
    // ●●● PHASE 321-330: Polish & competitive edge ●●●
    getAggressionProfile,
    getTightLooseProfile,
    getBluffSpotAnalysis,
    getValueBetAnalysis,
    getWeaknessHeatmap,
    getGTOComplianceScore,
    // ●●● PHASE 331-340: Ultimate training intelligence ●●●
    getRangeBalanceScore,
    getCheckBackAnalysis,
    getDonkBetAnalysis,
    getMultiWayPotAnalysis,
    getThinValueFrequency,
    getProtectionBetAnalysis,
    getShowdownAnalysis,
    getRiverDecisionQuality,
    getPreFlopLeaks,
    getSessionProgressionChart,
    // ●●● PHASE 341-350: Mastery & deep analysis ●●●
    getEquityRealizationAnalysis,
    getPotControlAnalysis,
    getBoardTextureQuiz,
    getStackDepthStrategy,
    getMixedStrategyAccuracy,
    getEndgameReport,
    getPlaystyleEvolution,
    getKeyConceptReminders,
    getUltimatePlayerRating,
    getNextSessionPrep,
    getSessionSummaryCard,
    // ●●● Previously unused methods now wired ●●●
    getDifficultyProgression,
    getHandStrengthDistribution,
    getWinRateByHandCategory,
    getActionTimeline,
    getPreDecisionPreview,
    // ●●● Flashcard & Drill mode methods ●●●
    generateFlashcards,
    generateQuickFireQuestion,
    // ●●● Phase 355-356: Hand History Import + Game Tree ●●●
    importHandToTrainingQuestion,
    buildDetailedGameTree,
  } = useGTOTrainer(gameId, engineType, level, trainerConfig);

  // ●●● PHASE 15: Spaced Repetition (cross-session review) ●●●
  const { dueCount: reviewDueCount, getReviewSession, markReviewed } = useSpacedRepetition(gameId);

  // ●●● PHASE 16: Cross-session analytics ●●●
  const { analytics: crossSessionAnalytics, loading: analyticsLoading } = useTrainingAnalytics(
    gameId,
    30
  );

  // ●●● PHASE 17: AI Coaching Debrief ●●●
  const [aiCoaching, setAiCoaching] = useState(null);
  const [isLoadingCoaching, setIsLoadingCoaching] = useState(false);
  const coachingFetchedRef = useRef(false);

  useEffect(() => {
    if (!gameComplete || coachingFetchedRef.current || !gameId) return;
    coachingFetchedRef.current = true;

    async function fetchCoaching() {
      setIsLoadingCoaching(true);
      try {
        const token = getSessionToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Build cross-session context from analytics
        let crossSessionContext = null;
        if (crossSessionAnalytics) {
          const findWeakest = (dataMap, labelKey) => {
            if (!dataMap) return null;
            const sorted = Object.entries(dataMap || {})
              .filter(([, v]) => v.total >= 5)
              .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
            if (!sorted[0]) return null;
            const [key, val] = sorted[0];
            return { [labelKey]: key, accuracy: Math.round((val.correct / val.total) * 100) };
          };
          crossSessionContext = {
            milestones: crossSessionAnalytics.milestones || null,
            mistakePatterns: crossSessionAnalytics.mistakePatterns?.slice(0, 3) || [],
            weakPosition: findWeakest(crossSessionAnalytics.positionAccuracy, 'position'),
            weakStreet: findWeakest(crossSessionAnalytics.streetAccuracy, 'street'),
          };
        }

        const totalQ = handHistory?.length || 0;
        const correctQ =
          handHistory?.filter((h) => h.classification === 'best' || h.classification === 'correct')
            .length || 0;
        const acc = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;

        // Build position stats.
        // roadmap #39/#40 sibling defect: useGTOWScore.recordMove stores the
        // hand entry as `{ handNumber, classification, ..., ...handData }` --
        // handData is SPREAD FLAT, there is no `h.handData` key. Every
        // `h.handData?.x` read below therefore returned undefined, so every
        // position bucketed as 'UNK' and every weak spot as 'general'. Read
        // both shapes, the way PositionStatsPanel already does.
        const hdOf = (h) => (h && h.handData) || h || {};
        const posStats = {};
        handHistory?.forEach((h) => {
          const pos = hdOf(h).heroPosition || 'UNK';
          if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0 };
          posStats[pos].total++;
          if (h.classification === 'best' || h.classification === 'correct')
            posStats[pos].correct++;
        });

        // Build weak spots
        const weakSpots = [];
        const spotBuckets = {};
        handHistory?.forEach((h) => {
          if (h.classification === 'best' || h.classification === 'correct') return;
          const key = `${hdOf(h).heroPosition || 'UNK'}|${hdOf(h).street || 'flop'}|${hdOf(h).spotType || 'general'}`;
          if (!spotBuckets[key])
            spotBuckets[key] = {
              position: hdOf(h).heroPosition || 'UNK',
              street: hdOf(h).street || 'flop',
              spotType: hdOf(h).spotType || 'general',
              mistakes: 0,
              total: 0,
            };
          spotBuckets[key].mistakes++;
        });
        handHistory?.forEach((h) => {
          const key = `${hdOf(h).heroPosition || 'UNK'}|${hdOf(h).street || 'flop'}|${hdOf(h).spotType || 'general'}`;
          if (spotBuckets[key]) spotBuckets[key].total++;
        });
        Object.values(spotBuckets || {}).forEach((b) => {
          if (b.total >= 2) weakSpots.push({ ...b, mistakeRate: b.mistakes / b.total });
        });
        weakSpots.sort((a, b) => b.mistakeRate - a.mistakeRate);

        // Build mistakes array
        const mistakesArr =
          handHistory
            ?.filter(
              (h) =>
                h.classification && h.classification !== 'best' && h.classification !== 'correct'
            )
            .slice(0, 8)
            .map((h) => ({
              question: { question: h.questionText || 'GTO Decision', scenario: h.handData },
              userAnswer: h.userAnswer || '?',
              correctAnswer: h.correctAnswer || '?',
            })) || [];

        // ●●● Phase GTO-CLONE: Engine-only coaching (no AI API) ●●●
        const cc = {};
        handHistory?.forEach((h) => {
          if (h.classification) cc[h.classification] = (cc[h.classification] || 0) + 1;
        });

        const strengths = [];
        if (acc >= 80) strengths.push('Consistent decision-making');
        if (bestStreak >= 8) strengths.push(`Excellent streak of ${bestStreak} correct`);
        else if (bestStreak >= 5) strengths.push('Good streak management');
        const strongPositions = Object.entries(posStats || {})
          .filter(([, v]) => v.total >= 3 && v.correct / v.total >= 0.8)
          .map(([pos]) => pos);
        if (strongPositions.length > 0) strengths.push(`Strong from ${strongPositions.join(', ')}`);
        if (strengths.length === 0) strengths.push('Session completed');

        const areas = [];
        if (cc.blunder > 0)
          areas.push(`${cc.blunder} blunder${cc.blunder > 1 ? 's' : ''} — review these hands`);
        if (weakSpots.length > 0) {
          const worst = weakSpots[0];
          areas.push(
            `Weakest spot: ${worst.position || ''} ${worst.street || ''} ${worst.spotType || ''}`.trim()
          );
        }
        if (acc < 60) areas.push('Core GTO fundamentals need work');

        let feedback = `You played ${totalQ} hands with ${acc}% accuracy.`;
        if (gtowScore !== undefined) feedback += ` GTOW Score: ${gtowScore}.`;
        if (totalEVLoss !== undefined && totalEVLoss > 0)
          feedback += ` Total EV loss: ${totalEVLoss.toFixed(1)} BB.`;
        feedback +=
          bestStreak > 5
            ? ` Great streak of ${bestStreak}!`
            : ' Work on building longer correct streaks.';

        setAiCoaching({
          overallGrade:
            acc >= 90 ? 'A+' : acc >= 80 ? 'A' : acc >= 70 ? 'B' : acc >= 60 ? 'C' : 'D',
          headline:
            acc >= 90
              ? 'Exceptional session — GTO mastery in action.'
              : acc >= 80
                ? 'Strong session — your GTO fundamentals are solid.'
                : acc >= 70
                  ? 'Good session — a few spots to tighten up.'
                  : acc >= 60
                    ? 'Decent session with room for improvement.'
                    : 'Focus on the basics — review your biggest mistakes.',
          strengths,
          areasToImprove: areas,
          detailedFeedback: feedback,
          readyForNextLevel: acc >= 85 && (gtowScore === undefined || gtowScore >= 40),
        });
      } catch (err) {
        console.warn('[AICoaching] Fetch error:', err.message);
      }
      setIsLoadingCoaching(false);
    }
    fetchCoaching();
  }, [gameComplete, gameId, crossSessionAnalytics]);

  // Reset coaching when level changes
  useEffect(() => {
    coachingFetchedRef.current = false;
    setAiCoaching(null);
  }, [currentLevel]);

  const [showDrillFilters, setShowDrillFilters] = useState(false);
  const [drillFilters, setDrillFilters] = useState(null);
  const [mistakesFilterActive, setMistakesFilterActive] = useState(false);

  // ●●● TRAINING MODE: Standard / Flashcard / Drill ●●●
  const [trainingMode, setTrainingMode] = useState(initialConfig?.mode || 'standard'); // 'standard' | 'flashcard' | 'drill' | 'import'

  // ●●● HAND HISTORY IMPORT STATE ●●●
  const [importState, setImportState] = useState({
    showModal: false,
    rawText: '',
    parsedHand: null,
    error: null,
    importedQuestion: null,
  });
  // Local feedback for imported hands — they are graded here, not by the hook,
  // so the imported question's answer is never compared against the trainer queue.
  const [importedFeedback, setImportedFeedback] = useState(null);
  const [flashcardState, setFlashcardState] = useState({
    category: null,
    cards: [],
    currentIndex: 0,
    flipped: false,
    completed: 0,
    score: { knew: 0, learning: 0 },
  });
  const [drillState, setDrillState] = useState({
    active: false,
    currentQ: null,
    answered: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    timeLeft: 10,
    results: [],
  });
  const drillTimerRef = useRef(null);
  const [shareStatus, setShareStatus] = useState(null); // 'success' | 'error' | null
  // ●●● PHASE 19: Share Card + Achievements ●●●
  const [showShareCard, setShowShareCard] = useState(false);
  const [showGhostReplay, setShowGhostReplay] = useState(false);
  const [sessionAchievements, setSessionAchievements] = useState([]);
  const achievementsCheckedRef = useRef(false);

  // Check achievements when game completes
  useEffect(() => {
    if (!gameComplete || achievementsCheckedRef.current) return;
    achievementsCheckedRef.current = true;

    const achievements = checkAllAchievements({
      currentStreak: streak,
      bestStreak,
      accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
      questionsAnswered: totalQuestions,
      level: currentLevel,
      levelPassed,
      gtowScore,
    });

    if (achievements.length > 0) {
      setSessionAchievements(achievements);
    }
  }, [
    gameComplete,
    streak,
    bestStreak,
    correctCount,
    totalQuestions,
    currentLevel,
    levelPassed,
    gtowScore,
  ]);

  // Reset on level change
  useEffect(() => {
    achievementsCheckedRef.current = false;
    setSessionAchievements([]);
  }, [currentLevel]);

  // ●●● QW-1: DIFFICULTY SELECTOR (beginner/standard/expert) ●●●
  const [difficulty, setDifficulty] = useState(() => {
    if (initialConfig?.difficulty) return initialConfig.difficulty;
    if (typeof window !== 'undefined') return localStorage.getItem('gma_difficulty') || 'standard';
    return 'standard';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('gma_difficulty', difficulty);
  }, [difficulty]);

  // ●●● QW-2: TIMER MODE (relaxed/standard/quick/blitz) ●●●
  //
  // Both sources are sanitised against TIMER_DURATIONS. `gma_timer` is a
  // PERSISTED string, and every build that shipped `timer: 'off'` into this
  // component wrote that out-of-vocabulary value straight back into it on the
  // very next render. Reading it back unfiltered would hand a player who once
  // opened the multi-table screen a permanently timer-less arena everywhere
  // else too, because resolveTimerSeconds maps anything unknown to 0. So an
  // unrecognised stored value falls back to the default tier instead of being
  // trusted -- the stale key is repaired the first time the arena mounts.
  const [timerMode, setTimerMode] = useState(() => {
    const known = (v) => typeof v === 'string'
      && Object.prototype.hasOwnProperty.call(TIMER_DURATIONS, v);
    if (known(initialConfig?.timer)) return initialConfig.timer;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('gma_timer');
      if (known(stored)) return stored;
    }
    return 'standard';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('gma_timer', timerMode);
  }, [timerMode]);
  const [timerRemaining, setTimerRemaining] = useState(resolveTimerSeconds(timerMode));
  const timerIntervalRef = useRef(null);

  // Reset timer when new question loads
  // NOTE: UDT's CountdownTimer now handles the visual countdown + auto-submit.
  // This interval is only kept as a fallback for non-UDT game modes.
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    // Skip if UDT CountdownTimer is handling the timer (GTO trainer modes)
    if (trainerConfig?.timerEnabled || isTimerEnabled(timerMode)) return;
    const duration = resolveTimerSeconds(timerMode);
    if (!duration || !currentQuestion || showFeedback || gameComplete) return;
    setTimerRemaining(duration);
    timerIntervalRef.current = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          // Auto-submit timeout as wrong answer
          if (currentQuestion?.options?.length > 0) {
            const wrongOption = currentQuestion.options.find((o) => {
              const id = o.id || o;
              return id !== currentQuestion.correctAnswer;
            });
            if (wrongOption) submitAnswer(wrongOption.id || wrongOption);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerIntervalRef.current);
  }, [timerMode, trainerConfig, currentQuestion, showFeedback, gameComplete, submitAnswer]);

  // ●●● AUTO-ADVANCE FOR MULTI-TABLE BLITZ ●●●
  // GTOW parity #29: this used to fire on a hardcoded 800ms regardless of the
  // player's Game speed choice, and regardless of the feedback rule — so
  // "Every action" still auto-advanced. It now defers to the resolved config
  // and stays out of the way whenever the table's own countdown owns pacing.
  useEffect(() => {
    if (!autoAdvance || !showFeedback || gameComplete) return;
    const rule = trainerConfig?.feedbackRule || 'mistakes';
    if (rule === 'every') return;

    // #6, second half. This is a SECOND auto-advance path: UniversalDynamicTable
    // runs its own countdown from the same trainerConfig, and the two did not
    // share rules. UDT stops on an inaccuracy under 'mistakes' and NEVER
    // advances a wrong answer or a blunder under any rule -- "the player should
    // study the feedback" is the entire point of the setting. This effect
    // advanced everything the moment the rule was not 'every', and with both
    // mounted the earlier timeout wins, so on the multi-table screen a blunder's
    // feedback was pulled off the felt while UDT was deliberately holding it
    // there. Mirror UDT's classification rules exactly rather than racing them.
    const good = lastClassification === 'best' || lastClassification === 'correct';
    if (rule === 'mistakes' && !good) return;
    if (!good && lastClassification !== 'inaccuracy') return;

    // #5: the delay is the player's Game speed choice, and an inaccuracy gets
    // double the reading time -- again matching UDT rather than diverging.
    const base = Number(trainerConfig?.autoAdvanceDelayMs) > 0
      ? Number(trainerConfig.autoAdvanceDelayMs)
      : 3000;
    const delay = lastClassification === 'inaccuracy' ? Math.round(base * 2) : base;
    const timerId = setTimeout(() => {
      nextQuestion();
    }, delay);
    return () => clearTimeout(timerId);
  }, [autoAdvance, showFeedback, gameComplete, nextQuestion, trainerConfig, lastClassification]);

  // Pause timer during feedback
  useEffect(() => {
    if (showFeedback && timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  }, [showFeedback]);

  // ●●● Phase 21: Game Phase State Machine ●●●
  // Skip the splash entirely when the caller already gathered the config.
  const [gamePhase, setGamePhase] = useState(initialConfig ? 'playing' : 'splash'); // 'splash' | 'playing' | 'review'
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [reviewTab, setReviewTab] = useState('overview'); // 'overview' | 'hands' | 'analysis' | 'gametree'
  const [gameTreeData, setGameTreeData] = useState(null);
  const [adaptiveToast, setAdaptiveToast] = useState(null);

  // ●●● Phase 2: Speed Bonus Aggregation ●●●
  const [speedBonusDiamonds, setSpeedBonusDiamonds] = useState(0);

  // ●●● Phase 2: Adaptive Difficulty Level (1-10) ●●●
  // Phase 50: Enhanced adaptive difficulty using GTOW metrics
  const computedDifficultyLevel = useMemo(() => {
    if (!handHistory || handHistory.length < 3) return currentLevel || 1;
    const base = Math.min(10, Math.max(1, currentLevel || 1));

    // Factor 1: Overall accuracy (weighted by classification quality)
    const classWeights = { best: 1.0, correct: 0.75, inaccuracy: 0.3, wrong: 0, blunder: -0.2 };
    let weightedScore = 0;
    handHistory.forEach((h) => {
      weightedScore += classWeights[h.classification] ?? 0;
    });
    const qualityRatio = weightedScore / handHistory.length; // 0-1 scale

    // Factor 2: Recent trend (last 5 hands weighted more heavily)
    const recent = handHistory.slice(-5);
    let recentScore = 0;
    recent.forEach((h) => {
      recentScore += classWeights[h.classification] ?? 0;
    });
    const recentRatio = recent.length > 0 ? recentScore / recent.length : qualityRatio;

    // Factor 3: Streak momentum
    const streakBonus =
      gtowCurrentStreak >= 5
        ? 0.15
        : gtowCurrentStreak >= 3
          ? 0.05
          : gtowCurrentStreak <= -3
            ? -0.1
            : 0;

    // Factor 4: Leak severity penalty — major leaks suggest difficulty is too high
    const leakPenalty = (mistakePatterns || []).filter((p) => p.severity === 'high').length * 0.08;

    // Combined score: 60% quality, 25% recent trend, 15% momentum
    const combined =
      qualityRatio * 0.6 + recentRatio * 0.25 + (0.5 + streakBonus) * 0.15 - leakPenalty;

    // Map to difficulty adjustment
    if (combined >= 0.85) return Math.min(10, base + 2); // Crushing it → jump up
    if (combined >= 0.7) return Math.min(10, base + 1); // Doing well → step up
    if (combined >= 0.5) return base; // Steady → maintain
    if (combined >= 0.35) return Math.max(1, base - 1); // Struggling → step down
    return Math.max(1, base - 2); // Drowning → drop fast
  }, [handHistory, currentLevel, gtowCurrentStreak, mistakePatterns]);

  // ●●● Phase 2: Wrap submitAnswer to capture speed data ●●●
  const handleSubmitAnswer = useCallback(
    (answerId, meta) => {
      // Track speed bonus diamonds using utility
      const bonus = checkSpeedBonus(meta);
      if (bonus > 0) {
        setSpeedBonusDiamonds((prev) => prev + bonus);
      }
      // Forward `meta` intact. The RNG randomiser (GTOW parity #38) rides in
      // here as `rngTargetActionId`; dropping it meant the table drew a dice
      // pointing at one action while the grader scored a different one.
      return submitAnswer(answerId, meta);
    },
    [submitAnswer]
  );

  // ●●● PHASE 18: Splash stays until user clicks Start (no auto-transition) ●●●
  const [splashReady, setSplashReady] = useState(false);
  useEffect(() => {
    if (gamePhase === 'splash' && currentQuestion && !loading) {
      setSplashReady(true);
    }
  }, [gamePhase, currentQuestion, loading]);

  const handleStartTraining = useCallback(() => {
    // 2026-07-26 VERIFIED IN PRODUCTION: "Start Training" did nothing on the
    // /hub/training/arena/[gameId] route. The button rendered enabled and its
    // onClick fired without throwing, but the session never began.
    //
    // This guard was the cause. handleStartTraining is a useCallback over
    // [splashReady, trainingMode]; the button is ALSO already
    // disabled={!splashReady}, so the guard is redundant -- and when the
    // handler closure lags the render that enabled the button, it early-returns
    // against a stale `false` while the button looks perfectly clickable. The
    // disabled attribute is the correct and sufficient gate.
    if (typeof splashReady !== 'undefined' && splashReady === false && !currentQuestion) {
      // Only refuse when there is genuinely nothing to play.
      return;
    }
    if (trainingMode === 'flashcard') {
      setFlashcardState({
        category: null,
        cards: [],
        currentIndex: 0,
        flipped: false,
        completed: 0,
        score: { knew: 0, learning: 0 },
      });
      setGamePhase('flashcard');
    } else if (trainingMode === 'drill') {
      setDrillState({
        active: true,
        currentQ: null,
        answered: 0,
        correct: 0,
        streak: 0,
        bestStreak: 0,
        timeLeft: 10,
        results: [],
      });
      setGamePhase('drill');
    } else if (trainingMode === 'import') {
      setImportState((prev) => ({
        ...prev,
        showModal: true,
        rawText: '',
        parsedHand: null,
        error: null,
      }));
    } else {
      setGamePhase('playing');
    }
  }, [splashReady, trainingMode, currentQuestion]);

  // Phase 8: Listen for adaptive difficulty changes
  useEffect(() => {
    const handler = (eventData) => {
      const { from, to, direction } = eventData || {};
      setAdaptiveToast({
        message:
          direction === 'up'
            ? `Difficulty increased! Level ${from} → ${to}`
            : `Difficulty decreased: Level ${from} → ${to}`,
        direction,
      });
      setTimeout(() => setAdaptiveToast(null), 3000);
    };
    const unsub = eventBus.on('adaptiveDifficultyChange', handler);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Auto-transition to review when game completes + emit bus event
  useEffect(() => {
    if (gameComplete && gamePhase === 'playing') {
      setGamePhase('review');
      // Phase 2: Emit session-complete bus event with engine scoring
      try {
        // Engine: Calculate diamond rewards + grade from GTOScoreEngine
        let engineGrade = null;
        let diamondReward = 0;
        try {
          engineGrade = getScoreGrade(Number(gtowScore));
          const sessionSummary = {
            score: Number(gtowScore),
            totalMoves: totalQuestions,
            correctMoves: correctCount,
            bestStreak: bestStreak,
          };
          diamondReward = calculateSessionDiamonds(sessionSummary, currentLevel || 1);
        } catch (e) {
          console.warn('[GodModeArena] Engine scoring failed:', e.message);
        }

        // BUG FIX (2026-05-08, MAX-RIGOR audit): Include `gameName` + `accuracy`
        // + canonical questionsAnswered/questionsCorrect aliases so
        // TrainingEventAggregator and other listeners can render meaningful
        // toasts ("◆ MTT Push-Fold — 88% Accuracy") instead of falling
        // through to the generic "Session Completed" branch every time.
        const _accuracy =
          totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const sessionPayload = {
          gameId: String(gameId),
          gameName: gameName || String(gameId),
          score: Number(gtowScore),
          accuracy: _accuracy,
          totalHands: totalQuestions,
          questionsAnswered: totalQuestions,
          questionsCorrect: correctCount,
          durationSeconds: Math.round((Date.now() - sessionStartRef.current) / 1000),
          perfectActionCount: correctCount,
          engineGrade,
          diamondReward,
          // GTOW parity #10. `totalEVLoss` was already a dependency of this
          // effect but was never put in the payload, so every consumer that
          // wanted session EV loss — the multi-table aggregator most of all —
          // had nothing to read and fell through to zero.
          totalEVLoss: Number.isFinite(totalEVLoss) ? Number(totalEVLoss) : 0,
        };

        eventBus.emit(EventType.SESSION_END, sessionPayload, 'GodModeArena');
        // Also emit training:session-complete for dual-subscription dashboards
        eventBus.emit('training:session-complete', sessionPayload, 'GodModeArena');
      } catch (e) {
        console.warn('[GodModeArena] Bus emit failed:', e);
      }
    }
  }, [
    gameComplete,
    gamePhase,
    gameId,
    gameName,
    gtowScore,
    totalEVLoss,
    totalQuestions,
    sessionMistakes,
    correctCount,
    bestStreak,
    speedBonusDiamonds,
  ]);

  // Restart actions (retryLevel/retrainMistakes/startNextLevel) reset gameComplete
  // but not gamePhase — return to playing so the review screen doesn't dead-end
  useEffect(() => {
    if (!gameComplete && gamePhase === 'review') setGamePhase('playing');
  }, [gameComplete, gamePhase]);

  // Session timer
  const sessionStartRef = useRef(Date.now());
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Update elapsed time when review screen shows
  useEffect(() => {
    if (gameComplete) {
      setSessionElapsed(Math.round((Date.now() - sessionStartRef.current) / 1000));
    }
  }, [gameComplete]);

  // Gap 2 Fix: Auto-save rich session data when game completes
  const sessionSavedRef = useRef(false);
  useEffect(() => {
    if (!gameComplete || sessionSavedRef.current) return;
    sessionSavedRef.current = true;

    // Use extracted saveSession utility
    saveSession({
      gameId,
      gameName,
      gtowScore,
      totalEVLoss,
      totalQuestions,
      sessionMistakes,
      correctCount,
      bestStreak,
      levelPassed,
      currentLevel,
      handHistory,
      avgEVLossPerHand,
      avgEVLossPerMistake,
      avgFrequencyDiff,
      trainerConfig,
      speedBonusDiamonds,
    });
  }, [
    gameComplete,
    gameId,
    gameName,
    gtowScore,
    totalEVLoss,
    totalQuestions,
    sessionMistakes,
    correctCount,
    bestStreak,
    levelPassed,
    currentLevel,
    handHistory,
    avgEVLossPerHand,
    avgEVLossPerMistake,
    avgFrequencyDiff,
    trainerConfig,
    speedBonusDiamonds,
  ]);

  // Reset one-shot session refs whenever a new run starts (retry/retrain/next level)
  // so coaching, achievements, and session save all fire again on the next completion
  useEffect(() => {
    if (!gameComplete) {
      coachingFetchedRef.current = false;
      achievementsCheckedRef.current = false;
      sessionSavedRef.current = false;
      sessionStartRef.current = Date.now();
      setAiCoaching(null);
    }
  }, [gameComplete]);

  // Wrapped nextQuestion with transition guard
  const handleNextQuestion = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    // Small delay for visual breathing room
    setTimeout(() => {
      // Clear any one-off imported hand so the trainer queue resumes
      if (importState.importedQuestion) {
        setImportState((s) => ({ ...s, importedQuestion: null }));
        setImportedFeedback(null);
        setIsTransitioning(false);
        return; // imported hand was a one-off; resume the queue without skipping
      }
      nextQuestion();
      setIsTransitioning(false);
    }, 350);
  }, [nextQuestion, isTransitioning, importState.importedQuestion]);

  // ●●● GLOBAL KEYBOARD LISTENER & SCROLL LOCK ●●●
  useEffect(() => {
    // 2026-07-26 (roadmap #47 hardening): the previous version captured
    // document.body.style.overflow at MOUNT and restored that value on unmount.
    // If the arena ever mounted while the body was already locked -- a modal
    // open, a route transition, a second arena instance -- it restored
    // 'hidden' and left the whole app permanently unscrollable, which is
    // exactly the symptom #47 describes on /hub/training.
    //
    // Reference-count instead: the last component to release always CLEARS the
    // property rather than restoring a possibly-stale value. Overlapping locks
    // are now safe and the page can never be stranded.
    //
    // 2026-08-06 (roadmap #47, second pass): the bare counter fixed stranding
    // by a stale captured value but could itself get stuck positive — an
    // unmount whose cleanup did not run leaves it at 1 forever, and every
    // safety valve in the app stands down when it is positive, so the page
    // becomes permanently unscrollable with no recovery. src/lib/scrollLock.js
    // holds the same reference count in an auditable registry that heals
    // itself on the next navigation. Behaviour here is otherwise identical.
    if (typeof window === 'undefined') return undefined;
    return acquireScrollLock('GodModeArena');
  }, []);

  // ●●● QW-2 / T2-2: KEYBOARD SHORTCUTS ●●●
  useEffect(() => {
    const handler = (e) => {
      if (gamePhase !== 'playing') return;
      // #10: this listener is on `window`, so in a multi-table grid every
      // mounted arena would receive the same keypress and answer its own
      // question with it. Only the table the player has focused may act.
      if (!isFocused) return;
      // A mounted UniversalDynamicTable owns the keyboard. Its handler resolves
      // the digit against `displayOptions` (what is actually on screen under the
      // active difficulty), whereas this one resolves against the raw question
      // options — so with both live, one keypress submitted two answers and, in
      // Grouped or Simple mode, the wrong one. Stand down when it is present.
      if (typeof window !== 'undefined' && window.__spUnifiedKeyboard > 0) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (showFeedback && e.key === ' ') {
        e.preventDefault();
        handleNextQuestion();
        return;
      }
      if (!showFeedback && currentQuestion?.options) {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < currentQuestion.options.length) {
          e.preventDefault();
          const opt = currentQuestion.options[idx];
          handleSubmitAnswer(opt.id || opt);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gamePhase, showFeedback, currentQuestion, handleSubmitAnswer, handleNextQuestion, isFocused]);

  // F5: Mixed strategy adherence tracking
  const mixedStrategyScore = useMemo(() => {
    if (!handHistory || handHistory.length < 5) return null;
    // Count how often player chose the most common action vs mixing
    const actionCounts = {};
    handHistory.forEach((h) => {
      const action = h.handData?.action || 'unknown';
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    });
    const totalHands = handHistory.length;
    const maxActionCount = Math.max(...Object.values(actionCounts || {}));
    // Perfect mixing = evenly distributed. Overfocusing = one action dominates
    const diversityScore = Math.round((1 - maxActionCount / totalHands) * 100);
    return Math.min(100, Math.max(0, diversityScore));
  }, [handHistory]);

  // UI-2: Manual advance — no auto-timer. User clicks "Next Hand →" button
  // nextQuestion is passed down as onNextHand to UniversalDynamicTable

  // ●●● QW-1: Options by difficulty ●●●
  // GTOW parity #21: difficulty remaps the BUTTON VOCABULARY — it never turns
  // the spot into a two-way multiple-guess. The old 'beginner' branch here
  // kept only the correct answer plus one distractor, which (a) made beginner
  // a coin flip rather than an easier read of the same spot, and (b) ran AFTER
  // applyDifficultyToQuestion had already collapsed the tree to SIMPLE and
  // aggregated the solver frequencies onto those buttons — so the surviving
  // two no longer summed to 100% and every frequency shown was wrong.
  // Simplification now happens in exactly one place: applyDifficultyToQuestion.
  const filteredOptions = useMemo(
    () => currentQuestion?.options || [],
    [currentQuestion]
  );

  // BUG-C FIX: Inject filteredOptions into question so GameUIRouter/UDT receives them
  const questionWithFilteredOptions = useMemo(() => {
    if (!currentQuestion) return null;
    if (filteredOptions === currentQuestion.options) return currentQuestion;
    return { ...currentQuestion, options: filteredOptions };
  }, [currentQuestion, filteredOptions]);

  // ●●● IMPORTED-HAND LOCAL GRADING ●●●
  // When an imported hand is being displayed, grade against IT (not the hook's
  // currentQuestion) and drive feedback from local state.
  const iqActive = !!importState.importedQuestion;
  const handleImportedAnswer = useCallback(
    (optionId) => {
      const iq = importState.importedQuestion;
      if (!iq || importedFeedback) return;
      const isRight = optionId === iq.correctAnswer;
      setImportedFeedback({
        result: isRight ? 'correct' : 'wrong',
        explanation: iq.explanation || '',
      });
    },
    [importState.importedQuestion, importedFeedback]
  );
  // This was `submitAnswer`, which bypassed handleSubmitAnswer entirely — so on
  // the ONLY path a player actually answers from, the BUG-05 speed bonus was
  // never accrued (handleSubmitAnswer fired solely from the keydown handler
  // above) and the RNG meta was discarded before it could reach the grader.
  const fxOnAnswer = iqActive ? handleImportedAnswer : handleSubmitAnswer;
  const fxShowFeedback = iqActive ? importedFeedback != null : showFeedback;
  const fxFeedbackResult = iqActive ? (importedFeedback?.result ?? null) : feedbackResult;
  const fxExplanation = iqActive ? (importedFeedback?.explanation ?? '') : explanation;
  const fxMoveClassification = iqActive
    ? (importedFeedback ? (importedFeedback.result === 'correct' ? 'best' : 'wrong') : null)
    : moveClassification;
  const fxGtoFrequencies = iqActive
    ? (importState.importedQuestion?.gtoFrequencies || null)
    : gtoFrequencies;
  const fxEvLoss = iqActive ? 0 : evLoss;

  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // ERROR STATE — Graceful fallback when API fails (auth, network, etc.)
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  if (error && !gameComplete && !currentQuestion) {
    const isAuthError = error.toLowerCase().includes('auth') || error.toLowerCase().includes('401');
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#121212',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 40,
            maxWidth: 420,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {isAuthError ? (
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            ) : (
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
          </div>
          <h2
            style={{
              color: '#fff',
              fontSize: 20,
              margin: '0 0 12px',
              fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
            }}
          >
            {isAuthError ? 'Sign In Required' : 'Connection Error'}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            {isAuthError
              ? 'You need to be signed in to access GTO training. Sign in to track your progress and compete on leaderboards.'
              : error}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {isAuthError && (
              <button
                onClick={() => {
                  try {
                    window.top.location.href = '/auth/login';
                  } catch (err) {
                    window.location.href = '/auth/login';
                  }
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Sign In
              </button>
            )}
            <button
              onClick={onExit}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Back to Training
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // POST-SESSION REVIEW SCREEN — GTO Wizard-style completion
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

  if (gameComplete) {
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const scoreColor = getArenaScoreColor(gtowScore);

    // Classification distribution — the SAME derived counts the in-hand
    // session rail paints (useGTOWScore -> deriveClassificationCounts over
    // handHistory). The review screen used to recount handHistory locally;
    // identical math, but two code paths for one number is how screens drift.
    const classificationCounts = gtowClassificationCounts;
    const movesGraded = handHistory.length;

    return (
      <div style={styles.reviewContainer}>
        {/* #10: confetti is a position:fixed full-viewport canvas, so an
            unfocused table in a multi-table grid would paint 400 pieces over
            every other table. Only the focused arena celebrates. */}
        {levelPassed && isFocused && typeof window !== 'undefined' && (
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
            style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none' }}
          />
        )}
        {/* ●●● PHASE 19: Achievement Toasts ●●● */}
        <AchievementToast
          achievements={sessionAchievements}
          onDismiss={() => setSessionAchievements([])}
          userId={userId}
        />
        {/* REVIEW HEADER */}
        <div style={styles.reviewHeader}>
          <button onClick={onExit} style={styles.reviewBackBtn}>
            ← Back
          </button>
          <div style={styles.reviewTitle}>Session Review</div>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              fontWeight: 600,
              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
            }}
          >
            {Math.floor(sessionElapsed / 60)}:{String(sessionElapsed % 60).padStart(2, '0')}
          </div>
        </div>

        <div style={styles.reviewScrollArea}>
          {/* F13: Daily Challenge Banner */}
          <DailyChallengeBanner gtowScore={gtowScore} />

          {/* GTOW SCORE — Hero display + Phase 255 Session Grade */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={styles.scoreHero}
          >
            <div style={{ ...styles.scoreHeroValue, color: scoreColor }}>{formatSignedScore(gtowScore)}</div>
            <div style={styles.scoreHeroLabel}>GTOW SCORE</div>
            {/* Phase 255: Session letter grade */}
            {(() => {
              try {
                const grade = getSessionGrade();
                if (grade && grade.grade !== '-')
                  return (
                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 28,
                          fontWeight: 900,
                          color: grade.color,
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                          textShadow: `0 0 12px ${grade.color}44`,
                        }}
                      >
                        {grade.grade}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                        {grade.label}
                      </span>
                    </div>
                  );
              } catch (_) {
                console.warn('[App] Handled exception:', _?.message || _);
              }
              return null;
            })()}
          </motion.div>

          {/* DIAMOND REWARD CARD */}
          {(() => {
            const baseReward = getDiamondReward(currentLevel, correctCount, bestStreak > 5 ? 2 : 0, totalQuestions || undefined);
            const bonusReward = speedBonusDiamonds || 0;
            const totalReward = baseReward + bonusReward;
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  background:
                    'linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(245, 158, 11, 0.04))',
                  border: '1px solid rgba(251, 191, 36, 0.2)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22, color: '#fbbf24' }}>◆</span>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.4)',
                        fontWeight: 600,
                        letterSpacing: 1,
                      }}
                    >
                      DIAMONDS EARNED
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: '#fbbf24',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      +{totalReward}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 4,
                  }}
                >
                  {(() => {
                    const lvlDef = getLevel(currentLevel);
                    const mult = lvlDef?.diamondMultiplier || 1.0;
                    return mult > 1.0 ? (
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: 'rgba(139, 92, 246, 0.15)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#a78bfa',
                        }}
                      >
                        {mult}x LEVEL BONUS
                      </div>
                    ) : null;
                  })()}
                  {bonusReward > 0 && (
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: 'rgba(251, 191, 36, 0.15)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#fbbf24',
                      }}
                    >
                      +{bonusReward} SPEED BONUS
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}

          {/* SUMMARY STATS ROW */}
          <div style={styles.summaryRow}>
            <div style={styles.summaryItem}>
              <div style={styles.summaryValue}>{totalQuestions}</div>
              <div style={styles.summaryLabel}>Hands</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={{ ...styles.summaryValue, color: '#ef4444' }}>
                -{totalEVLoss.toFixed(1)}
              </div>
              <div style={styles.summaryLabel}>EV Loss (BB)</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={{ ...styles.summaryValue, color: '#fbbf24' }}>{sessionMistakes}</div>
              <div style={styles.summaryLabel}>Mistakes</div>
            </div>
            <div style={styles.summaryItem}>
              {/* 2026-07-19 (E2E defect D2): this is an EV LOSS metric — the old
                  bare "EV/Hand" label read as positive EV next to "EV LOSS -X". */}
              <div style={styles.summaryValue}>-{Math.abs(avgEVLossPerHand).toFixed(2)}</div>
              <div style={styles.summaryLabel}>EV Loss/Hand</div>
            </div>
            <div style={styles.summaryItem}>
              {/* roadmap #28 — GTO Wizard reports THREE EV aggregates: total,
                  per hand, and per MISTAKE. Only the first two were on screen.
                  Per-mistake is the one that separates "rare but catastrophic"
                  from "frequent but cheap" — two players can post an identical
                  EV Loss/Hand and need opposite coaching. */}
              <div style={{ ...styles.summaryValue, color: '#f97316' }}>
                -{Math.abs(avgEVLossPerMistake).toFixed(2)}
              </div>
              <div style={styles.summaryLabel}>EV Loss/Mistake</div>
            </div>
            <div style={styles.summaryItem}>
              {/* roadmap #41 — avgFrequencyDiff has been computed, persisted to
                  training_sessions.avg_frequency_diff, and selected back by
                  get-sessions since it shipped, but had no render site at all.
                  It is how far your action mix sat from the solver's, in
                  percentage points; unlike EV loss, lower is better even on
                  hands you got "right". */}
              <div style={{ ...styles.summaryValue, color: '#38bdf8' }}>
                {Math.abs(avgFrequencyDiff).toFixed(1)}%
              </div>
              <div style={styles.summaryLabel}>Freq Diff</div>
            </div>
          </div>

          {/* SESSION DISTRIBUTION BAR — the review-screen home of the data the
              in-hand HUD gave up when six strips collapsed into one rail. Same
              vocabulary as the rail: one segmented track, fill IS the quality
              breakdown, best->blunder in the fixed classification colors. Same
              accumulator too (deriveClassificationCounts over handHistory), so
              this bar and the rail can never tell different stories. */}
          {movesGraded > 0 && (() => {
            const segments = [
              { key: 'best', label: 'Best', color: '#22c55e', count: classificationCounts.best || 0 },
              { key: 'correct', label: 'Correct', color: '#00d4ff', count: classificationCounts.correct || 0 },
              { key: 'inaccuracy', label: 'Inaccuracy', color: '#fbbf24', count: classificationCounts.inaccuracy || 0 },
              { key: 'wrong', label: 'Wrong', color: '#f97316', count: classificationCounts.wrong || 0 },
              { key: 'blunder', label: 'Blunder', color: '#ef4444', count: classificationCounts.blunder || 0 },
            ];
            const lit = segments.filter((seg) => seg.count > 0);
            return (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    height: 14,
                    borderRadius: 7,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.04)',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
                  }}
                >
                  {lit.map((seg) => (
                    <motion.div
                      key={seg.key}
                      initial={{ flexGrow: 0 }}
                      animate={{ flexGrow: seg.count }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      title={`${seg.label}: ${seg.count}`}
                      style={{
                        flexBasis: 0,
                        height: '100%',
                        background: seg.color,
                        boxShadow: `0 0 8px ${seg.color}55`,
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {segments.map((seg) => (
                    <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: seg.count > 0 ? seg.color : 'rgba(255,255,255,0.15)',
                          display: 'inline-block',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: seg.count > 0 ? '#cbd5e1' : '#475569',
                          letterSpacing: 0.5,
                        }}
                      >
                        {seg.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: seg.count > 0 ? seg.color : '#475569',
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}
                      >
                        {seg.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* TAB NAVIGATION */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginBottom: 16,
              borderRadius: 8,
              overflowX: 'auto',
              overflowY: 'hidden',
              flexWrap: 'nowrap',
              WebkitOverflowScrolling: 'touch',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'hands', label: 'Hands' },
              { id: 'solver', label: 'Solver' },
              { id: 'analysis', label: 'Analysis' },
              { id: 'gametree', label: 'Game Tree' },
              { id: 'ranges', label: 'Ranges' },
              { id: 'builder', label: 'Builder' },
              { id: 'boards', label: 'Boards' },
              { id: 'icm', label: 'ICM' },
              { id: 'multiway', label: 'Multiway' },
              { id: 'opponents', label: 'Opponents' },
              { id: '3bet', label: '3-Bet' },
              { id: 'solutions', label: 'Solutions' },
              { id: 'drills', label: 'Drills' },
              { id: 'import', label: 'Import' },
              { id: 'tournament', label: 'MTT' },
              { id: 'postflop', label: 'Postflop' },
              { id: 'sizing', label: 'Sizing' },
              { id: 'curriculum', label: 'Study Plan' },
              { id: 'reports', label: 'Reports' },
              { id: 'equity', label: 'Equity' },
              { id: 'nodelock', label: 'Node Lock' },
              { id: 'quiz', label: 'Quiz' },
              { id: 'compare', label: 'Compare' },
              { id: 'rvr', label: 'RvR' },
              { id: 'evtree', label: 'EV Tree' },
              { id: 'bankroll', label: 'Bankroll' },
              { id: 'spotfilter', label: 'Spot Filter' },
              { id: 'hud', label: 'HUD' },
              { id: 'notes', label: 'Notes' },
              { id: 'leaks', label: 'Leaks' },
              { id: 'dynamics', label: 'Dynamics' },
              { id: 'runouts', label: 'Runouts' },
              { id: 'mastery', label: 'Mastery' },
              { id: 'mixed', label: 'Mixed' },
              { id: 'replay', label: 'Replay' },
              { id: 'textures', label: 'Textures' },
              { id: 'charts', label: 'Charts' },
              { id: 'strength', label: 'Strength' },
              { id: 'exploits', label: 'Exploits' },
              { id: 'chipev', label: 'ChipEV' },
              { id: 'flopcat', label: 'Flop Cat' },
              { id: 'potodds', label: 'Pot Odds' },
              { id: 'stacks', label: 'Stacks' },
              { id: 'bluffcat', label: 'Bluff Cat' },
              { id: 'tilt', label: 'Tilt' },
              { id: 'oracle', label: 'Oracle' },
              { id: 'winrate', label: 'Win Rate' },
              { id: 'posheat', label: 'Pos Heat' },
              { id: 'goals', label: 'Goals' },
              { id: 'rangemem', label: 'Range Mem' },
              { id: 'multitable', label: 'Multi-Tbl' },
              { id: 'cbet', label: 'C-Bet' },
              { id: 'variance', label: 'Variance' },
              { id: 'xraise', label: 'X-Raise' },
              { id: 'handquiz', label: 'Hand Quiz' },
              { id: 'rangelib', label: 'Range Lib' },
              { id: 'boardquiz', label: 'Board Quiz' },
              { id: 'posprofit', label: 'Pos Profit' },
              { id: 'fticm', label: 'FT ICM' },
              { id: 'overbet', label: 'Overbet' },
              { id: 'headsup', label: 'Heads-Up' },
              { id: 'timed', label: 'Timed' },
              { id: 'squeeze', label: 'Squeeze' },
              { id: 'float', label: 'Float' },
              { id: 'blockers', label: 'Blockers' },
              { id: 'tlife', label: 'MTT Life' },
              { id: 'polar', label: 'Polarize' },
              { id: 'thinval', label: 'Thin Value' },
              { id: 'streets', label: 'Streets' },
              { id: 'defense', label: 'Defense' },
              { id: 'preflopsim', label: 'PF Sim' },
              { id: 'spr', label: 'SPR' },
              { id: 'blinddef', label: 'Blinds' },
              { id: 'drawodds', label: 'Draw Odds' },
              { id: 'foldeq', label: 'Fold Eq' },
              { id: 'donk', label: 'Donk Bet' },
              { id: 'mwstrat', label: 'MW Strat' },
              { id: 'probe', label: 'Probe' },
              { id: 'posquiz', label: 'Pos Quiz' },
              { id: 'stackoff', label: 'Stack Off' },
              { id: 'betpat', label: 'Bet Patterns' },
              { id: 'turnbarrel', label: 'Turn Barrel' },
              { id: 'shortstack', label: 'Short Stack' },
              { id: 'rangebuild', label: 'Range Build' },
              { id: 'capped', label: 'Capped' },
              { id: 'bubble', label: 'Bubble' },
              { id: 'handread', label: 'Hand Read' },
              { id: 'geosizing', label: 'Geo Size' },
              { id: 'massdata', label: 'Mass Data' },
              { id: 'rivermatrix', label: 'River' },
              { id: 'payjump', label: 'Pay Jumps' },
              { id: 'xrsize', label: 'X/R Size' },
              { id: 'cbetmatrix', label: 'C-Bet Map' },
              { id: 'turnimpact', label: 'Turn Impact' },
              { id: 'bvr', label: 'B:V Ratio' },
              { id: 'slowplay', label: 'Slow Play' },
              { id: 'kelly', label: 'Kelly' },
              { id: 'pfequity', label: 'PF Equity' },
              { id: 'glossary', label: 'Glossary' },
              { id: 'potgeo', label: 'Pot Geo' },
              { id: 'exploit', label: 'Exploit' },
              { id: 'bluffcatch', label: 'Bluff Catch' },
              { id: 'stackdepth', label: 'Depth' },
              { id: 'xrstrat', label: 'X/R Strat' },
              { id: 'obetrain', label: 'Overbet+' },
              { id: 'msplan', label: 'MS Plan' },
              { id: 'rvrsim', label: 'RvR Sim' },
              { id: 'boardcov', label: 'Coverage' },
              { id: 'fticmguide', label: 'FT ICM+' },
              { id: 'leakfind', label: 'Leak Find' },
              { id: 'hustrat', label: 'HU Strat' },
              { id: '3bdef', label: '3B Def' },
              { id: 'tiltfix', label: 'Tilt Fix' },
              { id: 'eqreal', label: 'EQ Real' },
              { id: 'combos', label: 'Combos' },
              { id: 'sqzplay', label: 'Squeeze' },
              { id: 'sessrev', label: 'Review+' },
              { id: 'impodds', label: 'Implied' },
              { id: 'posprof', label: 'Pos $' },
              { id: 'cbguide', label: 'C-Bet+' },
              { id: 'nutadv', label: 'Nut Adv' },
              { id: 'pfchart', label: 'PF Chart' },
              { id: 'mdfcalc', label: 'MDF' },
              { id: '4bet', label: '4-Bet' },
              { id: 'rivpol', label: 'Polarize+' },
              { id: 'mttstage', label: 'MTT Stage' },
              { id: 'betopt', label: 'Size Opt' },
              { id: 'handrank', label: 'Rankings' },
              { id: 'rngbal', label: 'Balance' },
              { id: 'pfquiz', label: 'PF Quiz+' },
              { id: 'seatsel', label: 'Seat Sel' },
              { id: 'tribarrel', label: '3-Barrel' },
              { id: 'potctrl', label: 'Pot Ctrl' },
              { id: 'epguide', label: 'EP Guide' },
              { id: 'chkbhd', label: 'Check IP' },
              { id: 'blindbat', label: 'Blinds+' },
              { id: 'rivsize', label: 'Riv Size' },
              { id: 'tblimg', label: 'Image' },
              { id: 'dblbarrel', label: '2-Barrel' },
              { id: 'potcommit', label: 'Committed' },
              { id: 'rngadv', label: 'Range Adv' },
              { id: 'fishexp', label: 'Fish Exp' },
              { id: 'smallball', label: 'Small Ball' },
              { id: 'trapplay', label: 'Trap' },
              { id: 'boardpair', label: 'Paired' },
              { id: 'effstack', label: 'Eff Stack' },
              { id: 'semibluff', label: 'Semi-Bluff' },
              { id: 'valsize', label: 'Val Size' },
              { id: 'opptend', label: 'Opp Tend' },
              { id: 'mental', label: 'Mental' },
              { id: 'pfllimp', label: 'Limp' },
              { id: 'resteal', label: 'Resteal' },
              { id: 'costrat', label: 'Cutoff' },
              { id: 'btnplay', label: 'Button' },
              { id: 'utgrange', label: 'UTG' },
              { id: 'hjstrat', label: 'HiJack' },
              { id: 'sbstrat', label: 'Sm Blind' },
              { id: 'bbdef', label: 'BB Def' },
              { id: 'floating', label: 'Float+' },
              { id: 'probeblf', label: 'Probe' },
              { id: 'xrtiming', label: 'X/R Time' },
              { id: 'delaycb', label: 'Delay CB' },
              { id: 'multitbl', label: 'Multi-Tbl+' },
              { id: 'brmgmt', label: 'Bankroll+' },
              { id: 'tblselect', label: 'Table Sel' },
              { id: 'stakesldr', label: 'Stakes' },
              { id: '3bpot', label: '3B Pot' },
              { id: '4bpot', label: '4B Pot' },
              { id: 'srpguide', label: 'SRP' },
              { id: 'sqzpot', label: 'Sqz Pot' },
              { id: 'turnxr', label: 'Turn X/R' },
              { id: 'rivobet', label: 'Riv OB' },
              { id: 'donkdef', label: 'Donk Def' },
              { id: 'mergerng', label: 'Range Type' },
              { id: 'balance', label: 'Balance+' },
              { id: 'nodelockguide', label: 'Node Lock+' },
              { id: 'polarizer', label: 'Polarizer' },
              { id: 'eqbucket', label: 'EQ Bucket' },
              { id: 'obbluff', label: 'OB Bluff' },
              { id: 'valowned', label: 'Val Own' },
              { id: 'chkcall', label: 'Chk-Call' },
              { id: 'betfold', label: 'Bet-Fold' },
              { id: 'potodds2', label: 'Pot Odds+' },
              { id: 'drawplay', label: 'Draw Play' },
              { id: 'nutblock', label: 'Nut Block' },
              { id: 'cappeddet', label: 'Capped+' },
              { id: 'mwcheck', label: 'MW Pot' },
              { id: 'isoraise', label: 'Iso Raise' },
              { id: 'latereg', label: 'Late Reg' },
              { id: 'antesteal', label: 'Ante Steal' },
              { id: 'turntex', label: 'Turn Tex' },
              { id: 'rivimpact', label: 'Riv Impact' },
              { id: 'rit', label: 'Run Twice' },
              { id: 'allinev', label: 'AI EV' },
              { id: 'pfagg', label: 'PF Agg' },
              { id: 'pfmistake', label: 'PF Mistakes' },
              { id: 'leakplug', label: 'Leak Plug' },
              { id: 'wincond', label: 'Win Cond' },
              { id: 'flopxr', label: 'Flop X/R' },
              { id: 'trnprobe', label: 'Trn Probe' },
              { id: 'rivbluff', label: 'Riv Catch' },
              { id: 'posaware', label: 'Position+' },
              { id: 'sbr', label: 'Stk:Blind' },
              { id: 'pushfold', label: 'Push/Fold' },
              { id: 'chipchop', label: 'Chip Chop' },
              { id: 'icmdeal', label: 'ICM Deal' },
              { id: 'mixedstrat', label: 'Mixed' },
              { id: 'freqbench', label: 'Freq Bench' },
              { id: 'indiff', label: 'Indiff' },
              { id: 'gtoexp', label: 'GTO/Exp' },
              { id: 'handcombo', label: 'Combos+' },
              { id: 'rvr2', label: 'RvR+' },
              { id: 'eqdist', label: 'EQ Dist' },
              { id: 'evcalc', label: 'EV Calc' },
              { id: 'sessrevtool', label: 'Sess Rev' },
              { id: 'leakanal', label: 'Leak Ana' },
              { id: 'studyplan', label: 'Study+' },
              { id: 'progress', label: 'Progress' },
              { id: 'msplan2', label: 'MS Plan+' },
              { id: 'stkoff2', label: 'Stack Off+' },
              { id: 'thinval2', label: 'Thin Val+' },
              { id: 'revimpl', label: 'Rev Impl' },
              { id: 'brdcov2', label: 'Board Cov+' },
              { id: 'nodeanlys', label: 'Node Ana' },
              { id: 'solvsimpl', label: 'Simplify' },
              { id: 'rngviz', label: 'Range Viz' },
              { id: 'livetell', label: 'Live Tell' },
              { id: 'onlinetm', label: 'Timing' },
              { id: 'betread', label: 'Bet Read' },
              { id: 'plytype', label: 'Ply Type' },
              { id: 'tourlife', label: 'Tour Life' },
              { id: 'chiputl', label: 'Chip Util' },
              { id: 'payouts', label: 'Payouts' },
              { id: 'fieldsize', label: 'Field Size' },
              { id: 'huadjust', label: 'HU Adjust' },
              { id: '3handed', label: '3-Handed' },
              { id: '6max', label: '6-Max' },
              { id: 'fullring', label: 'Full Ring' },
              { id: 'microstk', label: 'Micros' },
              { id: 'midstk', label: 'Mid Stk' },
              { id: 'highstk', label: 'High Stk' },
              { id: 'nosebleed', label: 'Nosebleed' },
              { id: 'plobasic', label: 'PLO' },
              { id: 'plohands', label: 'PLO Hands' },
              { id: 'plopf', label: 'PLO Post' },
              { id: 'plodraw', label: 'PLO Draw' },
              { id: 'spingo', label: 'Spin&Go' },
              { id: 'sitgo', label: 'Sit&Go' },
              { id: 'mttft', label: 'MTT FT' },
              { id: 'mttearly', label: 'MTT Early' },
              { id: 'cashbuyin', label: 'Buy-In' },
              { id: 'cashvmtt', label: 'Cash/MTT' },
              { id: 'onvlive', label: 'On/Live' },
              { id: 'zoom', label: 'Zoom' },
              { id: 'pkrmath', label: 'Math' },
              { id: 'pkrpsych', label: 'Psych' },
              { id: 'hhanalysis', label: 'HH Review' },
              { id: 'warmup', label: 'Warm-Up' },
              { id: 'gtoreport', label: 'GTO Report' },
              { id: 'evcompare', label: 'EV Compare' },
              { id: 'simpsolve', label: 'Simplified' },
              { id: 'custsolve', label: 'Custom Solve' },
              { id: 'aggflop', label: 'Flop Agg' },
              { id: 'arena', label: 'Arena' },
              { id: 'actfilter', label: 'Act Filter' },
              { id: 'pko', label: 'PKO' },
              { id: 'mwsolve', label: 'MW Solver' },
              { id: 'deepstack', label: 'Deep 200bb' },
              { id: 'handmatrix', label: 'Matrix' },
              { id: 'horseai', label: 'Horse AI' },
              { id: 'dailyquiz', label: 'Daily Quiz' },
              { id: 'bookmark', label: 'Bookmark' },
              { id: 'straddle', label: 'Straddle' },
              { id: 'husng', label: 'HU SNG' },
              { id: 'coach', label: 'Coach' },
              { id: 'nodeinsp', label: 'Node Insp' },
              { id: 'analytics', label: 'Analytics' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReviewTab(tab.id)}
                style={{
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                  padding: '10px 12px',
                  background: reviewTab === tab.id ? 'rgba(0, 212, 255, 0.15)' : 'rgba(0,0,0,0.2)',
                  color: reviewTab === tab.id ? '#00d4ff' : '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  borderBottom:
                    reviewTab === tab.id ? '2px solid #00d4ff' : '2px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ●●● TAB: OVERVIEW ●●● */}
          {reviewTab === 'overview' && (
            <>
              {/* ●●● ENDGAME REPORT — Beautiful session recap ●●● */}
              {(() => {
                try {
                  const eg = getEndgameReport();
                  if (!eg) return null;
                  const gradeColors = {
                    S: '#f59e0b',
                    A: '#22c55e',
                    B: '#4ade80',
                    C: '#06b6d4',
                    D: '#fbbf24',
                    F: '#ef4444',
                  };
                  const gColor = gradeColors[eg.grade] || '#94a3b8';
                  return (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: '18px',
                        borderRadius: 14,
                        background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${gColor}08 100%)`,
                        border: `2px solid ${gColor}30`,
                      }}
                    >
                      <div style={{ textAlign: 'center', marginBottom: 12 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: gColor,
                            textTransform: 'uppercase',
                            letterSpacing: 2,
                          }}
                        >
                          Session Complete
                        </div>
                        <div
                          style={{
                            fontSize: 42,
                            fontWeight: 900,
                            color: gColor,
                            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            lineHeight: 1,
                            marginTop: 4,
                          }}
                        >
                          {eg.grade}
                        </div>
                        {eg.title && (
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#e2e8f0',
                              marginTop: 4,
                            }}
                          >
                            {eg.title}
                          </div>
                        )}
                      </div>
                      {eg.highlights && eg.highlights.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#4ade80',
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            Highlights
                          </div>
                          {eg.highlights.slice(0, 3).map((h, i) => (
                            <div
                              key={i}
                              style={{ fontSize: 10, color: '#e2e8f0', padding: '2px 0' }}
                            >
                              ✓ {h}
                            </div>
                          ))}
                        </div>
                      )}
                      {eg.improvementAreas && eg.improvementAreas.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#fbbf24',
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            Focus Areas
                          </div>
                          {eg.improvementAreas.slice(0, 3).map((a, i) => (
                            <div
                              key={i}
                              style={{ fontSize: 10, color: '#94a3b8', padding: '2px 0' }}
                            >
                              → {a}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                } catch (_) {
                  return null;
                }
              })()}

              {/* ●●● Session Summary Card (getSessionSummaryCard) ●●● */}
              {(() => {
                try {
                  const ssc = getSessionSummaryCard();
                  if (!ssc || !ssc.title) return null;
                  return (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: 'rgba(139,92,246,0.06)',
                        border: '1px solid rgba(139,92,246,0.15)',
                      }}
                    >
                      <div
                        style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}
                      >
                        {ssc.title}
                      </div>
                      {ssc.summary && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#cbd5e1',
                            lineHeight: 1.5,
                            marginBottom: 6,
                          }}
                        >
                          {ssc.summary}
                        </div>
                      )}
                      {ssc.keyStats && ssc.keyStats.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {ssc.keyStats.slice(0, 4).map((s, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: '#e2e8f0',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {s.value}
                              </div>
                              <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>
                                {s.label}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                } catch (_) {
                  return null;
                }
              })()}

              {/* ●●● Comprehensive Report — Next Session Prep ●●● */}
              {(() => {
                try {
                  const csr = getComprehensiveSessionReport();
                  if (!csr || !csr.nextSessionPlan) return null;
                  const plan = csr.nextSessionPlan;
                  return (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: 'rgba(6,182,212,0.05)',
                        border: '1px solid rgba(6,182,212,0.15)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#06b6d4',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        Next Session Plan
                      </div>
                      {plan.focus && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#e2e8f0',
                            fontWeight: 600,
                            marginBottom: 4,
                          }}
                        >
                          Focus: {plan.focus}
                        </div>
                      )}
                      {plan.drills &&
                        plan.drills.length > 0 &&
                        plan.drills.slice(0, 3).map((d, i) => (
                          <div key={i} style={{ fontSize: 10, color: '#94a3b8', padding: '1px 0' }}>
                            • {d}
                          </div>
                        ))}
                    </div>
                  );
                } catch (_) {
                  return null;
                }
              })()}

              {/* ●●● Phase 54: Session Performance Summary ●●● */}
              <div
                style={{
                  marginBottom: 16,
                  padding: '14px 16px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Key metrics row */}
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12 }}>
                  {[
                    {
                      label: 'GTOW Score',
                      value: gtowScore,
                      color: getArenaScoreColor(gtowScore),
                      suffix: '',
                    },
                    {
                      label: 'Accuracy',
                      value: Math.round(gtowAccuracy),
                      color:
                        gtowAccuracy >= 80 ? '#22c55e' : gtowAccuracy >= 60 ? '#fbbf24' : '#ef4444',
                      suffix: '%',
                    },
                    {
                      label: 'EV Loss',
                      value: totalEVLoss?.toFixed(1) || '0.0',
                      color: totalEVLoss > 5 ? '#ef4444' : totalEVLoss > 2 ? '#fbbf24' : '#22c55e',
                      suffix: ' BB',
                      prefix: '-',
                    },
                    {
                      label: 'Best Streak',
                      value: bestGTOWStreak || 0,
                      color: '#00d4ff',
                      suffix: '',
                    },
                  ].map((stat, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: stat.color,
                          fontFamily: "var(--font-orbitron), 'Orbitron', 'Inter', monospace",
                          lineHeight: 1.2,
                        }}
                      >
                        {stat.prefix || ''}
                        {stat.value}
                        {stat.suffix}
                      </div>
                      <div
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Position accuracy breakdown */}
                {positionAccuracy && Object.keys(positionAccuracy || {}).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      By Position
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']
                        .filter((p) => positionAccuracy[p])
                        .map((pos) => {
                          const data = positionAccuracy[pos];
                          const accColor =
                            data.accuracy >= 80
                              ? '#22c55e'
                              : data.accuracy >= 60
                                ? '#fbbf24'
                                : '#ef4444';
                          const isWeakest = weakestPosition === pos;
                          return (
                            <div
                              key={pos}
                              style={{
                                flex: 1,
                                minWidth: 45,
                                textAlign: 'center',
                                padding: '4px 6px',
                                borderRadius: 6,
                                background: isWeakest ? `${accColor}15` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isWeakest ? accColor + '44' : 'rgba(255,255,255,0.06)'}`,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: '#94a3b8',
                                  marginBottom: 2,
                                }}
                              >
                                {pos}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: accColor,
                                  fontFamily: "'Inter', monospace",
                                }}
                              >
                                {data.accuracy}%
                              </div>
                              <div style={{ fontSize: 7, color: '#475569' }}>
                                {data.correct}/{data.total}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Street accuracy breakdown */}
                {streetAccuracy && Object.keys(streetAccuracy || {}).length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      By Street
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['preflop', 'flop', 'turn', 'river']
                        .filter((s) => streetAccuracy[s])
                        .map((st) => {
                          const data = streetAccuracy[st];
                          const streetColors = {
                            preflop: '#a78bfa',
                            flop: '#4ade80',
                            turn: '#fb923c',
                            river: '#f87171',
                          };
                          const accColor =
                            data.accuracy >= 80
                              ? '#22c55e'
                              : data.accuracy >= 60
                                ? '#fbbf24'
                                : '#ef4444';
                          return (
                            <div
                              key={st}
                              style={{
                                flex: 1,
                                textAlign: 'center',
                                padding: '4px 6px',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: streetColors[st],
                                  marginBottom: 2,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {st}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: accColor,
                                  fontFamily: "'Inter', monospace",
                                }}
                              >
                                {data.accuracy}%
                              </div>
                              <div style={{ fontSize: 7, color: '#475569' }}>
                                {data.correct}/{data.total}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Phase 67: Leak-specific coaching tips */}
                {(() => {
                  const tips = [];

                  // Leak-based tips from mistake patterns
                  if (mistakePatterns && mistakePatterns.length > 0) {
                    const highLeaks = mistakePatterns.filter((p) => p.severity === 'high');
                    const medLeaks = mistakePatterns.filter(
                      (p) => p.severity === 'medium' && p.count >= 3
                    );
                    highLeaks.forEach((leak) => {
                      if (leak.type === 'fold_too_much')
                        tips.push({
                          priority: 1,
                          text: "You're folding too often. Practice defending wider — use pot odds to decide close calls.",
                          color: '#ef4444',
                        });
                      else if (leak.type === 'call_too_much')
                        tips.push({
                          priority: 1,
                          text: 'Over-calling is costing you. Tighten up against aggression — not every pair is worth a call.',
                          color: '#ef4444',
                        });
                      else if (leak.type === 'bet_too_small')
                        tips.push({
                          priority: 2,
                          text: 'Your bet sizes are too small. Use larger bets with strong hands to build pots and deny equity.',
                          color: '#f97316',
                        });
                      else if (leak.type === 'bet_too_big')
                        tips.push({
                          priority: 2,
                          text: "You're overbetting too often. Use smaller sizes with merged ranges on dry boards.",
                          color: '#f97316',
                        });
                      else if (leak.type === 'missed_value')
                        tips.push({
                          priority: 1,
                          text: "You're missing value bets. When you have a strong hand, bet for value — don't be afraid to build the pot.",
                          color: '#ef4444',
                        });
                      else if (leak.type === 'bluff_too_much')
                        tips.push({
                          priority: 1,
                          text: 'Over-bluffing is a leak. Choose bluff candidates with blockers and backdoor equity, not random air.',
                          color: '#ef4444',
                        });
                      else
                        tips.push({
                          priority: 2,
                          text:
                            leak.tip ||
                            `Fix your ${leak.type.replace(/_/g, ' ')} leak (${leak.count} times this session).`,
                          color: '#f97316',
                        });
                    });
                    medLeaks.forEach((leak) => {
                      tips.push({
                        priority: 3,
                        text:
                          leak.tip ||
                          `Watch for ${leak.type.replace(/_/g, ' ')} patterns (${leak.count}x).`,
                        color: '#fbbf24',
                      });
                    });
                  }

                  // Position-based tips
                  if (weakestPosition && positionAccuracy) {
                    const weakAcc = positionAccuracy[weakestPosition]?.accuracy;
                    if (weakAcc !== undefined && weakAcc < 50) {
                      tips.push({
                        priority: 2,
                        text: `Your ${weakestPosition} play is weak (${Math.round(weakAcc)}% accuracy). Study ${weakestPosition} ranges and common spots from this seat.`,
                        color: '#f97316',
                      });
                    }
                  }

                  // Street-based tips
                  if (streetAccuracy) {
                    const streets = Object.entries(streetAccuracy || {}).filter(
                      ([, v]) => (v?.accuracy ?? 100) < 50
                    );
                    streets.forEach(([st, v]) => {
                      const acc = v.accuracy;
                      if (st === 'preflop')
                        tips.push({
                          priority: 2,
                          text: `Preflop accuracy is low (${Math.round(acc)}%). Drill opening ranges and 3-bet/call frequencies.`,
                          color: '#f97316',
                        });
                      else if (st === 'river')
                        tips.push({
                          priority: 2,
                          text: `River decisions need work (${Math.round(acc)}%). Focus on bluff-catching frequencies and value bet sizing.`,
                          color: '#f97316',
                        });
                      else
                        tips.push({
                          priority: 3,
                          text: `${st.charAt(0).toUpperCase() + st.slice(1)} accuracy is ${Math.round(acc)}% — review board texture analysis for this street.`,
                          color: '#fbbf24',
                        });
                    });
                  }

                  // Hand type tips
                  if (handTypePerformance && handTypePerformance.length > 0) {
                    const worstType = handTypePerformance[0]; // sorted worst-first
                    if (worstType.accuracy < 40 && worstType.total >= 3) {
                      tips.push({
                        priority: 1,
                        text: `Your ${worstType.type} play is a major leak (${worstType.accuracy}% accuracy, -${worstType.evLoss}bb). Focus practice on these hands.`,
                        color: '#ef4444',
                      });
                    }
                  }

                  // EV-based tips
                  if (avgEVLossPerHand > 0.3) {
                    tips.push({
                      priority: 1,
                      text: `Average EV loss of ${avgEVLossPerHand.toFixed(2)}bb/hand is high. Focus on avoiding blunders — those cost the most.`,
                      color: '#ef4444',
                    });
                  } else if (avgEVLossPerHand > 0.1) {
                    tips.push({
                      priority: 3,
                      text: `Your ${avgEVLossPerHand.toFixed(2)}bb/hand EV loss is moderate. Refine marginal spots to push into the green zone.`,
                      color: '#fbbf24',
                    });
                  }

                  // Sort by priority and take top 3
                  const topTips = tips.sort((a, b) => a.priority - b.priority).slice(0, 3);

                  if (topTips.length === 0) return null;

                  return (
                    <div style={{ marginTop: 8, marginBottom: 4 }}>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#a78bfa',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 4,
                        }}
                      >
                        Coaching Tips
                      </div>
                      {topTips.map((tip, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: 9,
                            color: tip.color,
                            lineHeight: 1.5,
                            padding: '3px 6px',
                            marginBottom: 2,
                            background: `${tip.color}08`,
                            borderRadius: 4,
                            borderLeft: `2px solid ${tip.color}44`,
                          }}
                        >
                          {tip.text}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Phase 59: Hand type performance */}
                {handTypePerformance && handTypePerformance.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      By Hand Type
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {handTypePerformance.slice(0, 6).map((ht) => {
                        const accColor =
                          ht.accuracy >= 80 ? '#22c55e' : ht.accuracy >= 60 ? '#fbbf24' : '#ef4444';
                        const isWorst = handTypePerformance[0] === ht && ht.accuracy < 60;
                        return (
                          <div
                            key={ht.type}
                            style={{
                              flex: '1 1 calc(33% - 4px)',
                              minWidth: 80,
                              textAlign: 'center',
                              padding: '3px 4px',
                              borderRadius: 5,
                              background: isWorst ? `${accColor}12` : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${isWorst ? accColor + '33' : 'rgba(255,255,255,0.06)'}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 7,
                                fontWeight: 600,
                                color: '#94a3b8',
                                textTransform: 'capitalize',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {ht.type}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: accColor,
                                fontFamily: "'Inter', monospace",
                              }}
                            >
                              {ht.accuracy}%
                            </div>
                            <div style={{ fontSize: 7, color: '#475569' }}>
                              {ht.correct}/{ht.total} · -{ht.evLoss}bb
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ●●● PHASE 17: Smart Practice Recommendation ●●● */}
              <SmartPracticeBanner
                gameId={gameId}
                onStartSmartPractice={(config) => {
                  // Reset to playing phase with smart practice targeting
                  sessionSavedRef.current = false;
                  if (config.suggestedLevel) {
                    startNextLevel();
                  } else {
                    retryLevel();
                  }
                }}
              />

              {/* ●●● PHASE 17: AI Coaching Debrief ●●● */}
              {(isLoadingCoaching || aiCoaching) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginBottom: 16,
                    padding: '14px 16px',
                    background:
                      'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(0,212,255,0.04) 100%)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#a78bfa',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>◇</span> AI Coach Debrief
                  </div>

                  {isLoadingCoaching && !aiCoaching && (
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{
                        color: '#64748b',
                        fontSize: 11,
                        textAlign: 'center',
                        padding: '8px 0',
                      }}
                    >
                      Analyzing your session...
                    </motion.div>
                  )}

                  {aiCoaching && (
                    <>
                      {/* Headline */}
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}
                      >
                        {aiCoaching.headline || 'Session Complete'}
                      </div>

                      {/* Detailed feedback */}
                      <div
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          lineHeight: 1.6,
                          marginBottom: 10,
                        }}
                      >
                        {aiCoaching.detailedFeedback}
                      </div>

                      {/* Strengths + Areas to improve */}
                      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                        {aiCoaching.strengths?.length > 0 && (
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: '#22c55e',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                marginBottom: 4,
                              }}
                            >
                              Strengths
                            </div>
                            {aiCoaching.strengths.map((s, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}
                              >
                                • {s}
                              </div>
                            ))}
                          </div>
                        )}
                        {aiCoaching.areasToImprove?.length > 0 && (
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: '#f97316',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                marginBottom: 4,
                              }}
                            >
                              Focus Areas
                            </div>
                            {aiCoaching.areasToImprove.map((a, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}
                              >
                                • {a}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Recommended drill */}
                      {aiCoaching.recommendedDrill && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(0,212,255,0.06)',
                            border: '1px solid rgba(0,212,255,0.15)',
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#00d4ff',
                              marginBottom: 2,
                            }}
                          >
                            Recommended: {aiCoaching.recommendedDrill.name}
                          </div>
                          <div style={{ fontSize: 9, color: '#64748b' }}>
                            {aiCoaching.recommendedDrill.reason}
                          </div>
                        </div>
                      )}

                      {/* Motivational quote */}
                      {aiCoaching.motivationalQuote && (
                        <div
                          style={{
                            fontSize: 10,
                            color: '#475569',
                            fontStyle: 'italic',
                            textAlign: 'center',
                            marginTop: 4,
                          }}
                        >
                          {aiCoaching.motivationalQuote}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              <div style={styles.classBreakdown}>
                <div style={styles.sectionTitle}>Move Breakdown</div>
                <div style={styles.classGrid}>
                  {Object.entries(CLASSIFICATION_CONFIG || {}).map(([key, config]) => (
                    <div key={key} style={styles.classItem}>
                      <div
                        style={{
                          ...styles.classCount,
                          color: config.color,
                        }}
                      >
                        {classificationCounts[key] || 0}
                        {movesGraded > 0 && (
                          <span
                            style={{ fontSize: 9, fontWeight: 600, opacity: 0.6, marginLeft: 2 }}
                          >
                            {/* divide by graded MOVES, not questions — a
                                multi-street session grades several moves per
                                question and these counts are per-move */}
                            ({Math.round(((classificationCounts[key] || 0) / movesGraded) * 100)}
                            %)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          ...styles.classBadge,
                          background: config.bgColor,
                          borderColor: config.borderColor,
                          color: config.color,
                        }}
                      >
                        <ClassificationSVGIcon icon={config.icon} size={14} color={config.color} />{' '}
                        {config.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* F15: CLASSIFICATION DONUT CHART */}
              <ClassificationDonut handHistory={handHistory} gtowScore={gtowScore} />

              {/* Phase 40: MISTAKE PATTERN COACHING */}
              {mistakePatterns && mistakePatterns.length > 0 && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '12px 14px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: '#f59e0b',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    Leak Detection
                  </div>
                  {mistakePatterns.slice(0, 3).map((pattern, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: idx < Math.min(mistakePatterns.length, 3) - 1 ? 10 : 0,
                        padding: '8px 10px',
                        background:
                          pattern.severity === 'high'
                            ? 'rgba(239,68,68,0.08)'
                            : 'rgba(251,191,36,0.06)',
                        borderRadius: 8,
                        border: `1px solid ${pattern.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)'}`,
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
                      >
                        <span style={{ fontSize: 14 }}>{pattern.icon}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            color: pattern.severity === 'high' ? '#ef4444' : '#fbbf24',
                          }}
                        >
                          {pattern.type.replace('_', ' ')} ({pattern.count}x)
                        </span>
                        {pattern.severity === 'high' && (
                          <span
                            style={{
                              fontSize: 8,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: 'rgba(239,68,68,0.2)',
                              color: '#f87171',
                              fontWeight: 700,
                            }}
                          >
                            MAJOR LEAK
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
                        {pattern.tip}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* MOST COSTLY SPOTS — the hands that paid for the session's EV
                  loss, largest first, straight from the one handHistory
                  accumulator via deriveTopLeaks (the same selector the
                  session-analytics harness asserts). Each row: where you were,
                  what you did, what the solver does, what it cost. */}
              {(() => {
                const leaks = deriveTopLeaks(handHistory, 5);
                if (leaks.length === 0) return null;
                const classColors = {
                  inaccuracy: '#fbbf24',
                  wrong: '#f97316',
                  blunder: '#ef4444',
                };
                const streetColors = {
                  preflop: '#a78bfa',
                  flop: '#4ade80',
                  turn: '#fb923c',
                  river: '#f87171',
                };
                return (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: '12px 14px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 10,
                      border: '1px solid rgba(239,68,68,0.12)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 'bold',
                          color: '#ef4444',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        Most Costly Spots
                      </div>
                      <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                        -{totalEVLoss.toFixed(1)} BB total · -
                        {Math.abs(avgEVLossPerMistake).toFixed(2)} BB/mistake
                      </div>
                    </div>
                    {leaks.map((leak, idx) => {
                      const cColor = classColors[leak.classification] || '#ef4444';
                      return (
                        <div
                          key={`${leak.handNumber}-${idx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '7px 8px',
                            marginBottom: idx < leaks.length - 1 ? 4 : 0,
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            borderLeft: `3px solid ${cColor}`,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: '#475569',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              minWidth: 18,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#94a3b8',
                              minWidth: 30,
                            }}
                          >
                            {leak.heroPosition || '—'}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              color: streetColors[(leak.street || '').toLowerCase()] || '#64748b',
                              minWidth: 42,
                            }}
                          >
                            {leak.street || '—'}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              fontSize: 10,
                              color: '#cbd5e1',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ color: cColor, fontWeight: 700 }}>
                              ✕ {leak.action || '?'}
                            </span>
                            <span style={{ color: '#475569' }}> → </span>
                            <span style={{ color: '#22c55e', fontWeight: 700 }}>
                              ✓ {leak.correctAction || '?'}
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: '#ef4444',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            -{leak.evLoss.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* F14: ACCURACY BY POSITION CHART */}
              <AccuracyByPositionChart handHistory={handHistory} />

              {/* F4: EV LOSS TRACKER — Comprehensive EV analysis */}
              <EVLossTracker handHistory={handHistory} />

              {/* F5: MIXED STRATEGY ADHERENCE */}
              {mixedStrategyScore !== null && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 6,
                    }}
                  >
                    Action Diversity
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: '100%',
                        height: 6,
                        background: '#1e293b',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${mixedStrategyScore}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        style={{
                          height: '100%',
                          borderRadius: 3,
                          background:
                            mixedStrategyScore >= 50
                              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                              : mixedStrategyScore >= 30
                                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                                : 'linear-gradient(90deg, #ef4444, #dc2626)',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 'bold',
                        minWidth: 40,
                        color:
                          mixedStrategyScore >= 50
                            ? '#22c55e'
                            : mixedStrategyScore >= 30
                              ? '#fbbf24'
                              : '#ef4444',
                      }}
                    >
                      {mixedStrategyScore}%
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
                    {mixedStrategyScore >= 60
                      ? 'Great mixing — GTO-balanced!'
                      : mixedStrategyScore >= 35
                        ? 'Moderate — try diversifying your actions'
                        : 'Too predictable — mix in more actions'}
                  </div>
                </div>
              )}

              {/* Phase 24: Mistakes-Only Filter + Retrain */}
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setMistakesFilterActive((prev) => !prev)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: 0.3,
                  }}
                >
                  Mistakes Only ({sessionMistakes})
                </motion.button>

                {sessionMistakes > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      // Restart with just the mistake hands
                      retrainMistakes();
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(251, 146, 60, 0.3)',
                      background: 'rgba(251, 146, 60, 0.1)',
                      color: '#fb923c',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      letterSpacing: 0.3,
                    }}
                  >
                    ↻ Retrain Mistakes
                  </motion.button>
                )}

                {/* ●●● PHASE 15+18: Spaced Repetition Review Button ●●● */}
                {reviewDueCount > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      // Restart level to practice — the spaced repetition system
                      // tracks which spots need review, and future sessions will
                      // surface similar spot types via smart practice targeting
                      sessionSavedRef.current = false;
                      retryLevel();
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      background: 'rgba(139, 92, 246, 0.1)',
                      color: '#a78bfa',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      letterSpacing: 0.3,
                    }}
                  >
                    ↻ Review Weak Spots ({reviewDueCount})
                  </motion.button>
                )}
              </div>

              {/* Phase 24: Per-Street EV Loss Breakdown */}
              {handHistory.length > 0 &&
                (() => {
                  const streetEV = { flop: 0, turn: 0, river: 0, preflop: 0 };
                  handHistory.forEach((h) => {
                    const s = h.handData?.street || 'flop';
                    streetEV[s] = (streetEV[s] || 0) + (h.evLoss || 0);
                  });
                  const maxEV = Math.max(0.01, ...Object.values(streetEV || {}));
                  const streetColors = {
                    preflop: '#8b5cf6',
                    flop: '#22c55e',
                    turn: '#fbbf24',
                    river: '#ef4444',
                  };

                  return (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: '12px 14px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 'bold',
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 8,
                        }}
                      >
                        EV Loss by Street
                      </div>
                      {['preflop', 'flop', 'turn', 'river'].map((s) => (
                        <div
                          key={s}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                        >
                          <span
                            style={{
                              width: 55,
                              fontSize: 10,
                              fontWeight: 600,
                              color: streetColors[s],
                              textTransform: 'uppercase',
                            }}
                          >
                            {s}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: 6,
                              background: '#1e293b',
                              borderRadius: 3,
                              overflow: 'hidden',
                            }}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(streetEV[s] / maxEV) * 100}%` }}
                              transition={{ duration: 0.6, delay: 0.2 }}
                              style={{
                                height: '100%',
                                background: streetColors[s],
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              width: 45,
                              fontSize: 10,
                              fontWeight: 'bold',
                              color: streetEV[s] > 0 ? '#ef4444' : '#22c55e',
                              textAlign: 'right',
                            }}
                          >
                            -{streetEV[s].toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

              {/* HAND HISTORY — Enhanced Replay Viewer */}

              {/* WEAKNESS HEATMAP — Position x Street */}
              <WeaknessHeatmap handHistory={handHistory} />

              {/* ACCURACY OVER TIME chart */}
              <AccuracyOverTimeChart handHistory={handHistory} />

              {/* WEAKEST SPOT CALLOUT */}
              {handHistory.length >= 5 &&
                (() => {
                  const spotStats = {};
                  handHistory.forEach((h) => {
                    const pos = h.handData?.heroPosition || 'UNK';
                    const st = h.handData?.street || 'flop';
                    const key = `${pos} on ${st}`;
                    if (!spotStats[key]) spotStats[key] = { evLoss: 0, mistakes: 0, total: 0 };
                    spotStats[key].total++;
                    spotStats[key].evLoss += h.evLoss || 0;
                    if (
                      h.classification &&
                      h.classification !== 'best' &&
                      h.classification !== 'correct'
                    )
                      spotStats[key].mistakes++;
                  });
                  const worst = Object.entries(spotStats || {})
                    .filter(([, v]) => v.total >= 2)
                    .sort(([, a], [, b]) => b.evLoss - a.evLoss)[0];
                  if (!worst || worst[1].evLoss <= 0) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        marginBottom: 16,
                        padding: '12px 16px',
                        background:
                          'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#ef4444',
                          letterSpacing: 0.5,
                          marginBottom: 4,
                        }}
                      >
                        WEAKEST SPOT
                      </div>
                      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                        You leaked {worst[1].evLoss.toFixed(1)} BB on{' '}
                        <span style={{ color: '#00d4ff' }}>{worst[0]}</span> decisions
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        {worst[1].mistakes} mistake{worst[1].mistakes !== 1 ? 's' : ''} out of{' '}
                        {worst[1].total} hand{worst[1].total !== 1 ? 's' : ''}
                      </div>
                    </motion.div>
                  );
                })()}

              {/* Phase 2: Speed Bonus Summary */}
              {speedBonusDiamonds > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    background: 'rgba(251,191,36,0.06)',
                    border: '1px solid rgba(251,191,36,0.2)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                    Speed Bonus Diamonds
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>
                    +{speedBonusDiamonds}
                  </span>
                </motion.div>
              )}

              {/* ●●● PHASE 19: Share Results (image card + feed) ●●● */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowShareCard(true)}
                  style={{
                    flex: 2,
                    padding: '10px 0',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                  }}
                >
                  Share Results Card
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={async () => {
                    try {
                      const token = getSessionToken();
                      const headers = { 'Content-Type': 'application/json' };
                      if (token) headers['Authorization'] = `Bearer ${token}`;
                      const res = await fetch('/api/training/share', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                          userId,
                          shareType: 'session_complete',
                          data: {
                            gameId,
                            gameName,
                            gtowScore,
                            totalEVLoss,
                            totalQuestions,
                            sessionMistakes,
                            correctCount,
                            bestStreak,
                            speedBonusDiamonds,
                          },
                        }),
                      });
                      if (res.ok) {
                        setShareStatus('success');
                      } else {
                        setShareStatus('error');
                      }
                      setTimeout(() => setShareStatus(null), 3000);
                    } catch (e) {
                      console.warn('[Share] Error:', e);
                      setShareStatus('error');
                      setTimeout(() => setShareStatus(null), 3000);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    border: '1px solid rgba(0,212,255,0.25)',
                    background: 'rgba(0,212,255,0.06)',
                    color: '#00d4ff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {shareStatus === 'success'
                    ? '✓ Posted'
                    : shareStatus === 'error'
                      ? 'Failed'
                      : 'Post to Feed'}
                </motion.button>
              </div>

              {/* ●●● PHASE 21: Ghost Replay — Review hands with GTO overlay ●●● */}
              {handHistory.length > 0 && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowGhostReplay(true)}
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    marginBottom: 12,
                    borderRadius: 10,
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    background:
                      'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(139,92,246,0.04))',
                    color: '#a78bfa',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 14 }}>●</span> Ghost Replay — Review with GTO Line
                </motion.button>
              )}
            </>
          )}

          {/* ●●● TAB: HANDS ●●● */}
          {reviewTab === 'hands' && (
            <>
              <div id="hand-replay-section">
                <HandReplayViewer
                  handHistory={
                    mistakesFilterActive
                      ? handHistory.filter(
                          (h) =>
                            h.classification &&
                            h.classification !== 'best' &&
                            h.classification !== 'correct'
                        )
                      : handHistory
                  }
                />
              </div>
            </>
          )}

          {/* ●●● TAB: SOLVER COMPARISON ●●● */}
          {reviewTab === 'solver' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <MultiStreetNavigator handHistory={handHistory} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <SolverComparisonReplay handHistory={handHistory} />
              </div>
              {/* Range vs Range Equity for last hand's board */}
              {handHistory.length > 0 &&
                (() => {
                  const lastHand = handHistory[handHistory.length - 1];
                  const hd = lastHand?.handData || lastHand || {};
                  const board = hd.board;
                  if (!board) return null;
                  return (
                    <div style={{ marginTop: 8 }}>
                      <RangeEquityVisualizer board={board} />
                    </div>
                  );
                })()}
            </>
          )}

          {/* ●●● TAB: ANALYSIS ●●● */}
          {reviewTab === 'analysis' && (
            <>
              {/* ●●● FREQUENCY ADHERENCE TRACKER ●●● */}
              <div style={{ marginBottom: 16 }}>
                <FrequencyTrainer handHistory={handHistory} />
              </div>

              {/* ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
                            GROUPED ANALYSIS — Collapsible sections for organized insights
                            ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}

              {/* ●● SECTION 1: PLAYER RATING & OVERVIEW ●● */}
              <AnalysisSection
                title="Player Rating & Overview"
                icon="★"
                color="#f59e0b"
                defaultOpen={true}
              >
                {/* PHASE 350: Ultimate Player Rating */}
                {(() => {
                  try {
                    const upr = getUltimatePlayerRating();
                    if (!upr) return null;
                    const tierColors = {
                      Grandmaster: '#f59e0b',
                      Master: '#22c55e',
                      Expert: '#06b6d4',
                      Advanced: '#818cf8',
                      Intermediate: '#94a3b8',
                      Developing: '#fbbf24',
                      Beginner: '#ef4444',
                    };
                    const tColor = tierColors[upr.tier] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '16px',
                          background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${tColor}08 100%)`,
                          borderRadius: 14,
                          border: `2px solid ${tColor}40`,
                        }}
                      >
                        <div style={{ textAlign: 'center', marginBottom: 10 }}>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: tColor,
                              textTransform: 'uppercase',
                              letterSpacing: 2,
                              marginBottom: 4,
                            }}
                          >
                            Player Rating
                          </div>
                          <div
                            style={{
                              fontSize: 36,
                              fontWeight: 900,
                              color: tColor,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              lineHeight: 1,
                            }}
                          >
                            {upr.elo}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: '#e2e8f0',
                              marginTop: 2,
                            }}
                          >
                            {upr.tier}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            justifyContent: 'center',
                          }}
                        >
                          {Object.entries(upr.scores || {}).map(([key, val]) => (
                            <div
                              key={key}
                              style={{
                                padding: '3px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                borderRadius: 8,
                                fontSize: 9,
                              }}
                            >
                              <span style={{ color: '#64748b' }}>
                                {key.replace(/([A-Z])/g, ' $1').trim()}:{' '}
                              </span>
                              <span
                                style={{
                                  color: val >= 70 ? '#4ade80' : val >= 50 ? '#fbbf24' : '#ef4444',
                                  fontWeight: 700,
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {val}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* PHASE 330: GTO Compliance */}
                {(() => {
                  try {
                    const gto = getGTOComplianceScore();
                    if (!gto) return null;
                    const tierColors = {
                      Elite: '#22c55e',
                      Advanced: '#4ade80',
                      Intermediate: '#06b6d4',
                      Developing: '#fbbf24',
                      Beginner: '#ef4444',
                    };
                    const tColor = tierColors[gto.tier] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${tColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: tColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          GTO Compliance
                        </div>
                        <div style={{ textAlign: 'center', marginBottom: 8 }}>
                          <div
                            style={{
                              fontSize: 28,
                              fontWeight: 900,
                              color: tColor,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {gto.overall}%
                          </div>
                          <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>
                            {gto.tier}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 6,
                          }}
                        >
                          {['accuracy', 'frequency', 'balance'].map((k) => (
                            <div key={k} style={{ textAlign: 'center' }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#e2e8f0',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {gto.components[k]}%
                              </div>
                              <div
                                style={{
                                  fontSize: 8,
                                  color: '#64748b',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {k}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 4,
                          }}
                        >
                          {gto.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* PHASE 322: Player Profile */}
                {(() => {
                  try {
                    const ap = getAggressionProfile();
                    if (!ap) return null;
                    const profileColors = {
                      'TAG (Tight-Aggressive)': '#22c55e',
                      'LAG (Loose-Aggressive)': '#fbbf24',
                      'LP (Loose-Passive)': '#ef4444',
                      'TP (Tight-Passive)': '#f87171',
                    };
                    const pColor = profileColors[ap.profile] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${pColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: pColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Player Profile
                        </div>
                        <div style={{ textAlign: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: pColor }}>
                            {ap.profile}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {ap.vpip}%
                            </div>
                            <div style={{ fontSize: 8, color: '#64748b' }}>VPIP</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {ap.aggressionPct}%
                            </div>
                            <div style={{ fontSize: 8, color: '#64748b' }}>Aggression</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {ap.aggressionFactor}
                            </div>
                            <div style={{ fontSize: 8, color: '#64748b' }}>AF</div>
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 6,
                          }}
                        >
                          {ap.tip}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* PHASE 347: Session Evolution */}
                {(() => {
                  try {
                    const pe = getPlaystyleEvolution();
                    if (!pe) return null;
                    const evoColors = {
                      'Becoming more aggressive': '#fbbf24',
                      'Becoming more passive': '#06b6d4',
                      'Improving accuracy': '#22c55e',
                      'Declining focus': '#ef4444',
                      'Consistent play': '#94a3b8',
                    };
                    const eColor = evoColors[pe.evolution] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${eColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: eColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Session Evolution
                        </div>
                        <div
                          style={{
                            textAlign: 'center',
                            marginBottom: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            color: eColor,
                          }}
                        >
                          {pe.evolution}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                              {pe.early.accuracy}%
                            </div>
                            <div style={{ fontSize: 8, color: '#64748b' }}>Early Acc</div>
                          </div>
                          <div style={{ textAlign: 'center', color: '#475569' }}>→</div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                              {pe.late.accuracy}%
                            </div>
                            <div style={{ fontSize: 8, color: '#64748b' }}>Late Acc</div>
                          </div>
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}
              </AnalysisSection>

              {/* ●● SECTION 2: LEAK DETECTION ●● */}
              <AnalysisSection title="Leak Detection" icon="○" color="#ef4444" defaultOpen={true}>
                {/* PHASE 254: Leak Report */}
                {(() => {
                  try {
                    const report = generateLeakReport();
                    if (!report || !report.leaks || report.leaks.length === 0) return null;
                    const severityColors = {
                      critical: '#ef4444',
                      high: '#f97316',
                      medium: '#fbbf24',
                      low: '#94a3b8',
                    };
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background:
                            'linear-gradient(180deg, rgba(239,68,68,0.06) 0%, rgba(0,0,0,0.3) 100%)',
                          borderRadius: 12,
                          border: '1px solid rgba(239,68,68,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#ef4444',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 4,
                          }}
                        >
                          Leak Report
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            marginBottom: 12,
                            lineHeight: 1.5,
                          }}
                        >
                          {report.summary}
                        </div>
                        {report.leaks.map((leak, i) => (
                          <div
                            key={i}
                            style={{
                              marginBottom: 10,
                              padding: '10px 12px',
                              background: 'rgba(0,0,0,0.3)',
                              borderRadius: 8,
                              borderLeft: `3px solid ${severityColors[leak.severity] || '#fbbf24'}`,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 4,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: `${severityColors[leak.severity]}22`,
                                  color: severityColors[leak.severity],
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.5,
                                }}
                              >
                                {leak.severity}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                                {leak.title}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: '#94a3b8',
                                lineHeight: 1.5,
                                marginBottom: 4,
                              }}
                            >
                              {leak.detail}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: '#4ade80',
                                lineHeight: 1.5,
                                padding: '4px 8px',
                                background: 'rgba(34,197,94,0.06)',
                                borderRadius: 6,
                                border: '1px solid rgba(34,197,94,0.1)',
                              }}
                            >
                              Fix: {leak.fix}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 258: Recommended Drills ●●● */}
                {(() => {
                  try {
                    const drills = prescribeDrills();
                    if (!drills || drills.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(0,212,255,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#00d4ff',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 10,
                          }}
                        >
                          Recommended Drills
                        </div>
                        {drills.map((drill, i) => (
                          <div
                            key={i}
                            style={{
                              marginBottom: 8,
                              padding: '8px 12px',
                              background: 'rgba(0,212,255,0.04)',
                              borderRadius: 8,
                              border: '1px solid rgba(0,212,255,0.08)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 3,
                              }}
                            >
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                                {drill.name}
                              </span>
                              <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                                {drill.duration}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                              {drill.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 257: Improvement Velocity ●●● */}
                {(() => {
                  try {
                    const velocity = getImprovementVelocity();
                    if (!velocity || velocity.trend === 'INSUFFICIENT_DATA') return null;
                    const trendColors = {
                      STRONG_IMPROVEMENT: '#22c55e',
                      IMPROVING: '#4ade80',
                      STABLE: '#fbbf24',
                      SLIGHT_DECLINE: '#f97316',
                      DECLINING: '#ef4444',
                    };
                    const trendColor = trendColors[velocity.trend] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '10px 14px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 10,
                          border: `1px solid ${trendColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: trendColor,
                            marginBottom: 4,
                          }}
                        >
                          Session Trend: {velocity.trend.replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                          {velocity.message}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 267-269: Frequency Correction + Tilt + Pacing ●●● */}
                {(() => {
                  try {
                    const freqCorr = getFrequencyCorrectionPrompt();
                    if (!freqCorr || !freqCorr.action) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '10px 14px',
                          background: 'rgba(168,85,247,0.06)',
                          borderRadius: 10,
                          border: '1px solid rgba(168,85,247,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#c084fc',
                            marginBottom: 4,
                          }}
                        >
                          Frequency Correction
                        </div>
                        <div style={{ fontSize: 10, color: '#e2e8f0', lineHeight: 1.5 }}>
                          {freqCorr.message ||
                            `Your ${freqCorr.action} frequency deviates ${freqCorr.deviation?.toFixed(1)}% from solver.`}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}
                {(() => {
                  try {
                    const tiltAdv = getTiltRecoveryAdvice();
                    if (!tiltAdv || tiltAdv.severity === 'none') return null;
                    const tc = {
                      low: '#fbbf24',
                      medium: '#f97316',
                      high: '#ef4444',
                      critical: '#dc2626',
                    };
                    const tiltColor = tc[tiltAdv.severity] || '#fbbf24';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '10px 14px',
                          background: `${tiltColor}08`,
                          borderRadius: 10,
                          border: `1px solid ${tiltColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: tiltColor,
                            marginBottom: 4,
                          }}
                        >
                          {tiltAdv.title || 'Tilt Recovery'}
                        </div>
                        <div style={{ fontSize: 10, color: '#e2e8f0', lineHeight: 1.5 }}>
                          {tiltAdv.advice}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}
                {(() => {
                  try {
                    const pacing = getSessionPacingAnalysis();
                    if (!pacing || !pacing.avgTimePerHand) return null;
                    const paceColor =
                      pacing.recommendation === 'slow_down'
                        ? '#f97316'
                        : pacing.recommendation === 'speed_up'
                          ? '#22c55e'
                          : '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '10px 14px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 10,
                          border: `1px solid ${paceColor}22`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: paceColor }}>
                            Session Pacing
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              color: '#e2e8f0',
                            }}
                          >
                            {pacing.avgTimePerHand.toFixed(1)}s / hand
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                          {pacing.message ||
                            `${pacing.fastHands || 0} fast, ${pacing.slowHands || 0} slow decisions`}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 275: Concept Mastery Report ●●● */}
                {(() => {
                  try {
                    const mastery = getConceptMasteryReport();
                    if (!mastery || mastery.concepts.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(59,130,246,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#3b82f6',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 4,
                          }}
                        >
                          Concept Mastery ({mastery.overallMastery}%)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {mastery.concepts.slice(0, 8).map((c, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 9,
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: c.mastered
                                  ? 'rgba(34,197,94,0.1)'
                                  : c.struggling
                                    ? 'rgba(239,68,68,0.1)'
                                    : 'rgba(255,255,255,0.04)',
                                color: c.mastered
                                  ? '#4ade80'
                                  : c.struggling
                                    ? '#ef4444'
                                    : '#94a3b8',
                                border: `1px solid ${c.mastered ? 'rgba(34,197,94,0.2)' : c.struggling ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                              }}
                            >
                              {c.name}: {c.accuracy}%
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 279: Hand Category Breakdown ●●● */}
                {(() => {
                  try {
                    const breakdown = getHandCategoryBreakdown();
                    if (!breakdown || breakdown.categories.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(251,191,36,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fbbf24',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Performance by Hand Type
                        </div>
                        {breakdown.categories.map((cat, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '4px 0',
                              borderBottom:
                                i < breakdown.categories.length - 1
                                  ? '1px solid rgba(255,255,255,0.04)'
                                  : 'none',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>
                              {cat.name}
                            </span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  color:
                                    cat.accuracy >= 70
                                      ? '#4ade80'
                                      : cat.accuracy >= 50
                                        ? '#fbbf24'
                                        : '#ef4444',
                                  fontWeight: 700,
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {cat.accuracy}%
                              </span>
                              <span style={{ fontSize: 9, color: '#64748b' }}>
                                ({cat.total} hands)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 280: Session Comparison ●●● */}
                {(() => {
                  try {
                    const comparison = getSessionComparison();
                    if (!comparison) return null;
                    const hasChanges =
                      comparison.improvements.length > 0 || comparison.regressions.length > 0;
                    if (!hasChanges) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(0,212,255,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#00d4ff',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          vs Average Player
                        </div>
                        {comparison.improvements.map((imp, i) => (
                          <div
                            key={'imp-' + i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '3px 0',
                              fontSize: 10,
                            }}
                          >
                            <span style={{ color: '#94a3b8' }}>{imp.metric}</span>
                            <span style={{ color: '#4ade80', fontWeight: 700 }}>{imp.delta}</span>
                          </div>
                        ))}
                        {comparison.regressions.map((reg, i) => (
                          <div
                            key={'reg-' + i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '3px 0',
                              fontSize: 10,
                            }}
                          >
                            <span style={{ color: '#94a3b8' }}>{reg.metric}</span>
                            <span style={{ color: '#ef4444', fontWeight: 700 }}>{reg.delta}</span>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}
              </AnalysisSection>

              {/* ●● SECTION 3: SESSION ANALYTICS ●● */}
              <AnalysisSection
                title="Session Analytics"
                icon="■"
                color="#06b6d4"
                defaultOpen={false}
              >
                {/* ●●● PHASE 290: AI Coaching Summary ●●● */}
                {(() => {
                  try {
                    const coaching = generateCoachingSummary();
                    if (!coaching || !coaching.summary) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background:
                            'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(168,85,247,0.06) 100%)',
                          borderRadius: 12,
                          border: '1px solid rgba(59,130,246,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#818cf8',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 6,
                          }}
                        >
                          AI Coach
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#e2e8f0',
                            lineHeight: 1.6,
                            marginBottom: coaching.tips?.length > 0 ? 8 : 0,
                          }}
                        >
                          {coaching.summary}
                        </div>
                        {coaching.tips?.length > 0 &&
                          coaching.tips.map((tip, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: 10,
                                color: '#4ade80',
                                padding: '3px 8px',
                                marginTop: 4,
                                background: 'rgba(34,197,94,0.06)',
                                borderRadius: 6,
                                border: '1px solid rgba(34,197,94,0.1)',
                                lineHeight: 1.5,
                              }}
                            >
                              {tip}
                            </div>
                          ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 283: Mistake Clusters ●●● */}
                {(() => {
                  try {
                    const clusters = getMistakeClusters();
                    if (!clusters || clusters.clusters.length === 0) return null;
                    const sevColors = { critical: '#ef4444', high: '#f97316', medium: '#fbbf24' };
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(239,68,68,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#ef4444',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Mistake Patterns ({clusters.totalMistakes} total)
                        </div>
                        {clusters.clusters.slice(0, 5).map((c, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '4px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1 }}>
                              {c.description}
                            </span>
                            <span
                              style={{
                                fontSize: 8,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: `${sevColors[c.severity] || '#fbbf24'}15`,
                                color: sevColors[c.severity] || '#fbbf24',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                              }}
                            >
                              {c.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 285: Bluff-to-Value Ratio ●●● */}
                {(() => {
                  try {
                    const bvr = getBluffToValueRatio();
                    if (!bvr) return null;
                    const bvrColor =
                      bvr.assessment === 'balanced'
                        ? '#4ade80'
                        : bvr.assessment === 'over_bluffing'
                          ? '#ef4444'
                          : '#fbbf24';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '10px 14px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 10,
                          border: `1px solid ${bvrColor}22`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: bvrColor }}>
                            Bluff:Value Ratio
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              color: '#e2e8f0',
                            }}
                          >
                            {bvr.userBluffPct}% bluffs (solver: {bvr.solverBluffPct}%)
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                          {bvr.message}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 282: Running Action Frequencies ●●● */}
                {(() => {
                  try {
                    const freqs = getRunningActionFrequencies();
                    if (!freqs || freqs.frequencies.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(0,212,255,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#00d4ff',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Action Frequency vs Solver
                        </div>
                        {freqs.frequencies.map((f, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '3px 0',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                color: '#e2e8f0',
                                fontWeight: 600,
                                minWidth: 50,
                              }}
                            >
                              {f.action}
                            </span>
                            <div
                              style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                marginLeft: 8,
                              }}
                            >
                              <span style={{ fontSize: 9, color: '#94a3b8' }}>
                                You: {f.userFreq}%
                              </span>
                              <span style={{ fontSize: 9, color: '#64748b' }}>
                                GTO: {f.solverFreq}%
                              </span>
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color:
                                    Math.abs(f.deviation) > 15
                                      ? '#ef4444'
                                      : Math.abs(f.deviation) > 8
                                        ? '#fbbf24'
                                        : '#4ade80',
                                }}
                              >
                                ({f.deviation > 0 ? '+' : ''}
                                {f.deviation}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 289: Position Leaderboard ●●● */}
                {(() => {
                  try {
                    const posLB = getPositionLeaderboard();
                    if (!posLB || posLB.leaderboard.length === 0) return null;
                    const gradeColors = { A: '#22c55e', B: '#4ade80', C: '#fbbf24', D: '#ef4444' };
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(34,197,94,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#4ade80',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Position Leaderboard
                        </div>
                        {posLB.leaderboard.map((p, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '4px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: gradeColors[p.grade] || '#94a3b8',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                  minWidth: 18,
                                }}
                              >
                                {p.grade}
                              </span>
                              <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>
                                {p.position}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  color: gradeColors[p.grade],
                                  fontWeight: 700,
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {p.accuracy}%
                              </span>
                              <span style={{ fontSize: 9, color: '#64748b' }}>({p.total}h)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 291: Streak Analysis ●●● */}
                {(() => {
                  try {
                    const sa = getStreakAnalysis();
                    if (!sa) return null;
                    const tiltColor =
                      sa.tiltResistance >= 70
                        ? '#22c55e'
                        : sa.tiltResistance >= 50
                          ? '#fbbf24'
                          : '#ef4444';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${tiltColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: tiltColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Streak &amp; Tilt Analysis
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Current Streak</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: sa.currentStreakType === 'win' ? '#22c55e' : '#ef4444',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {sa.currentStreak} {sa.currentStreakType === 'win' ? 'W' : 'L'}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Best Win Streak</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#22c55e',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {sa.longestWinStreak}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Tilt Resistance</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: tiltColor,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {sa.tiltResistance}%
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 4,
                          }}
                        >
                          {sa.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 292: Session Stamina ●●● */}
                {(() => {
                  try {
                    const tp = getTimePressureAnalysis();
                    if (!tp) return null;
                    const staminaColors = {
                      Excellent: '#22c55e',
                      Good: '#4ade80',
                      Fair: '#fbbf24',
                      Poor: '#ef4444',
                    };
                    const sColor = staminaColors[tp.staminaRating] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${sColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: sColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Session Stamina
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {tp.earlyAccuracy}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Early</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {tp.midAccuracy}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Mid</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {tp.lateAccuracy}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Late</div>
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Stamina Rating</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: sColor }}>
                            {tp.staminaRating}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 4,
                          }}
                        >
                          {tp.recommendation}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 294: Exploitative Adjustments ●●● */}
                {(() => {
                  try {
                    const ea = getExploitativeAdjustments();
                    if (!ea || ea.isBalanced) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(251,191,36,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fbbf24',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Exploitable Tendencies
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            marginBottom: 8,
                            justifyContent: 'center',
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            F:{' '}
                            <strong style={{ color: '#e2e8f0' }}>
                              {ea.actionProfile.foldPct}%
                            </strong>
                          </span>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            C:{' '}
                            <strong style={{ color: '#e2e8f0' }}>
                              {ea.actionProfile.callPct}%
                            </strong>
                          </span>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            R:{' '}
                            <strong style={{ color: '#e2e8f0' }}>
                              {ea.actionProfile.raisePct}%
                            </strong>
                          </span>
                        </div>
                        {ea.adjustments.slice(0, 3).map((adj, i) => (
                          <div
                            key={i}
                            style={{
                              marginBottom: 6,
                              padding: '6px 8px',
                              background:
                                adj.severity === 'critical'
                                  ? 'rgba(239,68,68,0.1)'
                                  : 'rgba(251,191,36,0.08)',
                              borderRadius: 6,
                              border: `1px solid ${adj.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.1)'}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: adj.severity === 'critical' ? '#ef4444' : '#fbbf24',
                              }}
                            >
                              {adj.title}
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                              {adj.fix}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 296: Multi Game Type Stats ●●● */}
                {(() => {
                  try {
                    const mgs = getMultiGameTypeStats();
                    if (!mgs || mgs.stats.length < 2) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(139,92,246,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#a78bfa',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Pot Type Performance
                        </div>
                        {mgs.stats.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '4px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#e2e8f0' }}>{s.type}</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color:
                                    s.accuracy >= 70
                                      ? '#22c55e'
                                      : s.accuracy >= 50
                                        ? '#fbbf24'
                                        : '#ef4444',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {s.accuracy}%
                              </span>
                              <span style={{ fontSize: 9, color: '#64748b' }}>({s.total}h)</span>
                            </div>
                          </div>
                        ))}
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 6,
                          }}
                        >
                          {mgs.recommendation}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 297: Bet Sizing Analysis ●●● */}
                {(() => {
                  try {
                    const bsa = getBettingSizeAnalysis();
                    if (!bsa || bsa.analysis.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(6,182,212,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#06b6d4',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Bet Sizing Accuracy
                        </div>
                        {bsa.analysis.map((a, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '4px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#e2e8f0' }}>{a.size}</span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color:
                                  a.accuracy >= 70
                                    ? '#22c55e'
                                    : a.accuracy >= 50
                                      ? '#fbbf24'
                                      : '#ef4444',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {a.accuracy}% ({a.total})
                            </span>
                          </div>
                        ))}
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 6,
                          }}
                        >
                          {bsa.tip}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 300: Performance Trend ●●● */}
                {(() => {
                  try {
                    const pt = getPerformanceTrendAnalysis();
                    if (!pt) return null;
                    const trendColors = {
                      strongly_improving: '#22c55e',
                      slightly_improving: '#4ade80',
                      stable: '#06b6d4',
                      slightly_declining: '#fbbf24',
                      strongly_declining: '#ef4444',
                    };
                    const tColor = trendColors[pt.trend] || '#94a3b8';
                    const trendLabels = {
                      strongly_improving: 'Strongly Improving',
                      slightly_improving: 'Improving',
                      stable: 'Stable',
                      slightly_declining: 'Declining',
                      strongly_declining: 'Strongly Declining',
                    };
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${tColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: tColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Performance Trend
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Trend</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: tColor }}>
                            {trendLabels[pt.trend] || pt.trend}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Consistency</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#e2e8f0',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {pt.consistencyScore}%
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Peak</span>
                          <span
                            style={{
                              fontSize: 10,
                              color: '#22c55e',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {pt.peakAccuracy}% ({pt.peakAt})
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Trough</span>
                          <span
                            style={{
                              fontSize: 10,
                              color: '#ef4444',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {pt.troughAccuracy}% ({pt.troughAt})
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 4,
                          }}
                        >
                          {pt.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}
              </AnalysisSection>

              {/* ●● SECTION 4: STRATEGY & PATTERNS ●● */}
              <AnalysisSection
                title="Strategy & Patterns"
                icon="●"
                color="#a78bfa"
                defaultOpen={false}
              >
                {/* ●●● PHASE 302: Street Transition Analysis ●●● */}
                {(() => {
                  try {
                    const sta = getStreetTransitionAnalysis();
                    if (!sta || sta.streetAccuracy.length < 2) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(14,165,233,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#38bdf8',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Street Accuracy
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 8,
                          }}
                        >
                          {sta.streetAccuracy.map((s, i) => (
                            <div key={i} style={{ textAlign: 'center' }}>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color:
                                    s.accuracy >= 70
                                      ? '#22c55e'
                                      : s.accuracy >= 50
                                        ? '#fbbf24'
                                        : '#ef4444',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {s.accuracy}%
                              </div>
                              <div style={{ fontSize: 9, color: '#64748b' }}>
                                {s.street} ({s.total})
                              </div>
                            </div>
                          ))}
                        </div>
                        {sta.weakestStreet && sta.weakestStreet.accuracy < 60 && (
                          <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                            {sta.recommendation}
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 303: Defense Frequency ●●● */}
                {(() => {
                  try {
                    const df = getDefenseFrequencyCheck();
                    if (!df || df.facingBet.total < 2) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(244,63,94,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fb7185',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Defense Frequency
                        </div>
                        {df.facingBet.defendPct !== null && (
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: 6,
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>vs Bets</span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color:
                                  df.facingBet.defendPct >= 55 && df.facingBet.defendPct <= 75
                                    ? '#22c55e'
                                    : '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {df.facingBet.defendPct}% defend
                            </span>
                          </div>
                        )}
                        {df.assessments.map((a, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 9,
                              color:
                                a.severity === 'good'
                                  ? '#4ade80'
                                  : a.severity === 'critical'
                                    ? '#ef4444'
                                    : '#fbbf24',
                              marginTop: 4,
                            }}
                          >
                            {a.message}
                          </div>
                        ))}
                        <div
                          style={{
                            fontSize: 8,
                            color: '#475569',
                            marginTop: 6,
                            fontStyle: 'italic',
                          }}
                        >
                          {df.mdfReference}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 304: Polarization Index ●●● */}
                {(() => {
                  try {
                    const pi = getPolarizationIndex();
                    if (!pi) return null;
                    const pColor =
                      pi.style === 'polarized'
                        ? '#22c55e'
                        : pi.style === 'semi-polarized'
                          ? '#06b6d4'
                          : '#fbbf24';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${pColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: pColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Range Style
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Style</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: pColor }}>
                            {pi.style.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Polarization Score</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#e2e8f0',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {pi.polarizationScore}%
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 4,
                          }}
                        >
                          {pi.tip}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 305: Mistake Recovery ●●● */}
                {(() => {
                  try {
                    const mr = getMistakeRecoveryRate();
                    if (!mr) return null;
                    const gradeColors = { A: '#22c55e', B: '#4ade80', C: '#fbbf24', D: '#ef4444' };
                    const gColor = gradeColors[mr.grade] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${gColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: gColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Mistake Recovery
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Recovery Grade</span>
                          <span
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              color: gColor,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {mr.grade}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Avg Recovery</span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#e2e8f0',
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {mr.avgRecoveryTime} hands
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Quick Recoveries</span>
                          <span style={{ fontSize: 10, color: '#4ade80' }}>
                            {mr.quickRecoveries}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 4,
                          }}
                        >
                          {mr.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 307: Session Milestones ●●● */}
                {(() => {
                  try {
                    const milestones = getSessionMilestones();
                    if (!milestones || milestones.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(168,85,247,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#c084fc',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Session Milestones
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {milestones.map((m, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '4px 10px',
                                background: 'rgba(168,85,247,0.1)',
                                borderRadius: 16,
                                border: '1px solid rgba(168,85,247,0.2)',
                                fontSize: 10,
                                color: '#e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span>{m.icon}</span>
                              <span style={{ fontWeight: 600 }}>{m.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 308: Drill Recommendation ●●● */}
                {(() => {
                  try {
                    const dr = getAdaptiveDrillRecommendation();
                    if (!dr || !dr.topRecommendation) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(34,211,238,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#22d3ee',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Recommended Focus
                        </div>
                        {dr.recommendations.slice(0, 3).map((r, i) => (
                          <div
                            key={i}
                            style={{
                              marginBottom: 6,
                              padding: '6px 8px',
                              background:
                                r.priority === 'high'
                                  ? 'rgba(239,68,68,0.08)'
                                  : 'rgba(34,211,238,0.06)',
                              borderRadius: 6,
                              border: `1px solid ${r.priority === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(34,211,238,0.1)'}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: r.priority === 'high' ? '#ef4444' : '#22d3ee',
                              }}
                            >
                              {r.drill}
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                              {r.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 309: Critical Hand Highlights ●●● */}
                {(() => {
                  try {
                    const ch = getCriticalHandHighlights();
                    if (!ch || ch.totalHighlights === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(251,146,60,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fb923c',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Key Hands
                        </div>
                        {ch.biggestMistakes.map((m, i) => (
                          <div
                            key={`m${i}`}
                            style={{
                              fontSize: 10,
                              color: '#fca5a5',
                              padding: '3px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>#{m.handNumber}</span> {m.userAction}{' '}
                            → should be {m.correctAction}{' '}
                            <span style={{ color: '#ef4444', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                              (-{m.evLoss} EV)
                            </span>
                          </div>
                        ))}
                        {ch.bestDecisions.map((d, i) => (
                          <div
                            key={`d${i}`}
                            style={{
                              fontSize: 10,
                              color: '#86efac',
                              padding: '3px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>#{d.handNumber}</span> {d.action} on{' '}
                            {d.street} — great play!
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 311: Node Type Breakdown ●●● */}
                {(() => {
                  try {
                    const ntb = getNodeTypeBreakdown();
                    if (!ntb || ntb.breakdown.length < 2) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(99,102,241,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#818cf8',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Spot Type Breakdown
                        </div>
                        {ntb.breakdown.slice(0, 6).map((n, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '4px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#e2e8f0' }}>{n.nodeType}</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color:
                                    n.accuracy >= 70
                                      ? '#22c55e'
                                      : n.accuracy >= 50
                                        ? '#fbbf24'
                                        : '#ef4444',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {n.accuracy}%
                              </span>
                              <span style={{ fontSize: 9, color: '#64748b' }}>({n.total})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 313: Street-Specific Leaks ●●● */}
                {(() => {
                  try {
                    const ssl = getStreetSpecificLeaks();
                    if (!ssl || ssl.leaks.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(239,68,68,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#f87171',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Top Leaks by Street
                        </div>
                        {ssl.leaks.slice(0, 5).map((l, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 10,
                              color: '#fca5a5',
                              padding: '3px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            {l.description}
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 315: Check-Raise + Phase 316: C-Bet ●●● */}
                {(() => {
                  try {
                    const cr = getCheckRaiseAnalysis();
                    const cb = getCBetAnalysis();
                    if (!cr && !cb) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(251,191,36,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fbbf24',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Action Analysis
                        </div>
                        {cr && cr.checkRaiseSpots > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                Check-Raise Accuracy
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: (cr.accuracy || 0) >= 60 ? '#22c55e' : '#fbbf24',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {cr.accuracy || 0}%
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                              {cr.tip}
                            </div>
                          </div>
                        )}
                        {cb && cb.cbetSpots > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>C-Bet Accuracy</span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: (cb.accuracy || 0) >= 60 ? '#22c55e' : '#fbbf24',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {cb.accuracy || 0}%
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                              {cb.tip}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 317: Position Pair Analysis ●●● */}
                {(() => {
                  try {
                    const ppa = getPositionPairAnalysis();
                    if (!ppa || ppa.pairs.length < 2) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(52,211,153,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#34d399',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Position Matchups
                        </div>
                        {ppa.pairs.slice(0, 6).map((p, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '4px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#e2e8f0' }}>{p.matchup}</span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color:
                                  p.accuracy >= 70
                                    ? '#22c55e'
                                    : p.accuracy >= 50
                                      ? '#fbbf24'
                                      : '#ef4444',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {p.accuracy}% ({p.total})
                            </span>
                          </div>
                        ))}
                        {ppa.weakestMatchup && ppa.weakestMatchup.accuracy < 50 && (
                          <div
                            style={{
                              fontSize: 10,
                              color: '#ef4444',
                              fontStyle: 'italic',
                              marginTop: 6,
                            }}
                          >
                            Weakest: {ppa.weakestMatchup.matchup} at {ppa.weakestMatchup.accuracy}%
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 318: Frequency Convergence ●●● */}
                {(() => {
                  try {
                    const fc = getFrequencyConvergenceTracker();
                    if (!fc) return null;
                    const convColor = fc.isConverging
                      ? '#22c55e'
                      : fc.improvement === 0
                        ? '#06b6d4'
                        : '#fbbf24';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${convColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: convColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Learning Curve
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {fc.earlyAccuracy}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>First Half</div>
                          </div>
                          <div
                            style={{
                              textAlign: 'center',
                              fontSize: 16,
                              color:
                                fc.improvement > 0
                                  ? '#22c55e'
                                  : fc.improvement < 0
                                    ? '#ef4444'
                                    : '#94a3b8',
                            }}
                          >
                            →
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {fc.lateAccuracy}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Second Half</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                          {fc.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 319: Smart Session Length ●●● */}
                {(() => {
                  try {
                    const ssl = getSmartSessionLength();
                    if (!ssl) return null;
                    const pctDone = Math.min(
                      100,
                      Math.round((ssl.currentLength / ssl.optimalLength) * 100)
                    );
                    const barColor =
                      pctDone < 80 ? '#22c55e' : pctDone < 100 ? '#fbbf24' : '#ef4444';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${barColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: barColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Session Meter
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: 3,
                            marginBottom: 8,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${pctDone}%`,
                              background: barColor,
                              borderRadius: 3,
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            {ssl.currentLength} / {ssl.optimalLength} hands
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: barColor }}>
                            {pctDone}%
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                          {ssl.recommendation}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 320: Training Plan ●●● */}
                {(() => {
                  try {
                    const tp = getTrainingPlan();
                    if (!tp || tp.sessions.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(139,92,246,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#a78bfa',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          5-Session Training Plan
                        </div>
                        {tp.sessions.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '4px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0' }}>
                              {s.label}
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>
                              {s.focus} — {s.hands} hands — {s.goal}
                            </div>
                          </div>
                        ))}
                        {tp.estimatedImprovement > 0 && (
                          <div
                            style={{
                              fontSize: 10,
                              color: '#a78bfa',
                              fontWeight: 600,
                              marginTop: 6,
                            }}
                          >
                            Estimated improvement: +{tp.estimatedImprovement}% accuracy
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}
              </AnalysisSection>

              {/* ●● SECTION 5: DEEP STATS & BALANCE ●● */}
              <AnalysisSection
                title="Deep Stats & Balance"
                icon="◇"
                color="#38bdf8"
                defaultOpen={false}
              >
                {/* ●●● PHASE 341: Equity Realization ●●● */}
                {(() => {
                  try {
                    const er = getEquityRealizationAnalysis();
                    if (!er || (er.ipHands < 2 && er.oopHands < 2)) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(14,165,233,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#38bdf8',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Position Advantage
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#22c55e',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {er.ipAccuracy}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>
                              In Position ({er.ipHands})
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {er.oopAccuracy}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>
                              Out of Position ({er.oopHands})
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                          {er.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 345: Mixed Strategy Accuracy ●●● */}
                {(() => {
                  try {
                    const ms = getMixedStrategyAccuracy();
                    if (!ms || ms.mixedSpots < 2) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(168,85,247,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#a78bfa',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Mixed vs Pure Spots
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: ms.mixedAccuracy >= 60 ? '#22c55e' : '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {ms.mixedAccuracy || 0}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>
                              Mixed ({ms.mixedSpots})
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: (ms.pureAccuracy || 0) >= 60 ? '#22c55e' : '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {ms.pureAccuracy || 0}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>
                              Pure ({ms.pureSpots})
                            </div>
                          </div>
                        </div>
                        {ms.gap !== null && ms.gap > 15 && (
                          <div style={{ fontSize: 10, color: '#fbbf24', fontStyle: 'italic' }}>
                            Gap of {ms.gap}% — mixed spots need work
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 2,
                          }}
                        >
                          {ms.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 349: Next Session Prep ●●● */}
                {(() => {
                  try {
                    const nsp = getNextSessionPrep();
                    if (!nsp) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(34,211,238,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#22d3ee',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Next Session Prep
                        </div>
                        {nsp.focus.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div
                              style={{
                                fontSize: 9,
                                color: '#64748b',
                                fontWeight: 700,
                                marginBottom: 2,
                              }}
                            >
                              FOCUS
                            </div>
                            {nsp.focus.map((f, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 10, color: '#e2e8f0', padding: '2px 0' }}
                              >
                                {f}
                              </div>
                            ))}
                          </div>
                        )}
                        {nsp.studyTopics.length > 0 && (
                          <div>
                            <div
                              style={{
                                fontSize: 9,
                                color: '#64748b',
                                fontWeight: 700,
                                marginBottom: 2,
                                marginTop: 6,
                              }}
                            >
                              STUDY
                            </div>
                            {nsp.studyTopics.slice(0, 2).map((s, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 10, color: '#94a3b8', padding: '2px 0' }}
                              >
                                {s}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 324: Tight/Loose vs Solver ●●● */}
                {(() => {
                  try {
                    const tl = getTightLooseProfile();
                    if (!tl) return null;
                    const aColor =
                      tl.assessment === 'balanced'
                        ? '#22c55e'
                        : tl.assessment.includes('tight')
                          ? '#06b6d4'
                          : '#fbbf24';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${aColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: aColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Fold Frequency vs Solver
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {tl.userFoldPct}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>You</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: aColor,
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {tl.solverFoldPct}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Solver</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                          {tl.description}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 325+326: Bluff & Value Analysis ●●● */}
                {(() => {
                  try {
                    const bs = getBluffSpotAnalysis();
                    const vb = getValueBetAnalysis();
                    if (!bs && !vb) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(168,85,247,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#c084fc',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Bluff &amp; Value
                        </div>
                        {bs && bs.bluffAttempts > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>Bluff Accuracy</span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: (bs.bluffAccuracy || 0) >= 60 ? '#22c55e' : '#fbbf24',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {bs.bluffAccuracy || 0}% ({bs.bluffAttempts})
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>{bs.tip}</div>
                          </div>
                        )}
                        {vb && vb.valueBets > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                Value Bet Accuracy
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: (vb.accuracy || 0) >= 60 ? '#22c55e' : '#fbbf24',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {vb.accuracy || 0}% ({vb.valueBets})
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>{vb.tip}</div>
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 329: Weakness Heatmap ●●● */}
                {(() => {
                  try {
                    const wh = getWeaknessHeatmap();
                    if (!wh || wh.heatmap.length < 3) return null;
                    const intensityColors = {
                      strong: '#22c55e',
                      medium: '#fbbf24',
                      weak: '#f97316',
                      critical: '#ef4444',
                    };
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(251,146,60,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fb923c',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Weakness Map
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {wh.heatmap.map((cell, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '3px 8px',
                                background: `${intensityColors[cell.intensity]}15`,
                                borderRadius: 4,
                                border: `1px solid ${intensityColors[cell.intensity]}30`,
                                fontSize: 9,
                              }}
                            >
                              <span style={{ color: '#94a3b8' }}>
                                {cell.position}/{cell.street}:{' '}
                              </span>
                              <span
                                style={{
                                  color: intensityColors[cell.intensity],
                                  fontWeight: 700,
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {cell.accuracy}%
                              </span>
                            </div>
                          ))}
                        </div>
                        {wh.weakestCell && (
                          <div
                            style={{
                              fontSize: 10,
                              color: '#ef4444',
                              fontStyle: 'italic',
                              marginTop: 6,
                            }}
                          >
                            Weakest: {wh.weakestCell.position} on {wh.weakestCell.street} —{' '}
                            {wh.weakestCell.accuracy}%
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 331: Range Balance Score ●●● */}
                {(() => {
                  try {
                    const rb = getRangeBalanceScore();
                    if (!rb) return null;
                    const gradeColors = { A: '#22c55e', B: '#4ade80', C: '#fbbf24', D: '#ef4444' };
                    const gColor = gradeColors[rb.grade] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${gColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: gColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Range Balance
                        </div>
                        <div style={{ textAlign: 'center', marginBottom: 8 }}>
                          <span
                            style={{
                              fontSize: 24,
                              fontWeight: 900,
                              color: gColor,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {rb.balanceScore}%
                          </span>
                          <span
                            style={{ fontSize: 14, fontWeight: 700, color: gColor, marginLeft: 8 }}
                          >
                            {rb.grade}
                          </span>
                        </div>
                        {rb.actionComparison
                          .filter((a) => a.deviation > 5)
                          .map((a, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '3px 0',
                                fontSize: 10,
                              }}
                            >
                              <span style={{ color: '#94a3b8' }}>{a.action}</span>
                              <span style={{ color: '#e2e8f0' }}>
                                You: {a.userPct}% / Solver: {a.solverPct}%{' '}
                                <span style={{ color: a.deviation > 10 ? '#ef4444' : '#fbbf24' }}>
                                  (±{a.deviation}%)
                                </span>
                              </span>
                            </div>
                          ))}
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: 4,
                          }}
                        >
                          {rb.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 338: River Decision Quality ●●● */}
                {(() => {
                  try {
                    const rdq = getRiverDecisionQuality();
                    if (!rdq) return null;
                    const gradeColors = { A: '#22c55e', B: '#4ade80', C: '#fbbf24', D: '#ef4444' };
                    const gColor = gradeColors[rdq.grade] || '#94a3b8';
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: `1px solid ${gColor}22`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: gColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          River Quality
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>River Accuracy</span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: gColor,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {rdq.accuracy}%
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>
                            F: {rdq.actions.folds}
                          </span>
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>
                            C: {rdq.actions.calls}
                          </span>
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>
                            B: {rdq.actions.bets}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                          {rdq.insight}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● PHASE 339: Preflop Leaks ●●● */}
                {(() => {
                  try {
                    const pfl = getPreFlopLeaks();
                    if (!pfl || !pfl.hasLeaks) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(239,68,68,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#f87171',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Preflop Leaks
                        </div>
                        {pfl.leaks.map((l, i) => (
                          <div
                            key={i}
                            style={{
                              marginBottom: 6,
                              padding: '6px 8px',
                              background: 'rgba(239,68,68,0.08)',
                              borderRadius: 6,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
                                {l.area}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  color: '#fca5a5',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {l.accuracy}%
                              </span>
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                              {l.fix}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● NEW: Pot Control Analysis ●●● */}
                {(() => {
                  try {
                    const pc = getPotControlAnalysis();
                    if (!pc || pc.totalHands < 3) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(14,165,233,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#38bdf8',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Pot Control
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#22c55e',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {pc.potControlRate || 0}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Control Rate</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: pc.inflatedCount > 2 ? '#ef4444' : '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {pc.inflatedCount || 0}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Inflated Pots</div>
                          </div>
                        </div>
                        {pc.insight && (
                          <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                            {pc.insight}
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● NEW: Check-Back Analysis ●●● */}
                {(() => {
                  try {
                    const cb = getCheckBackAnalysis();
                    if (!cb || cb.totalChecks < 2) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(34,197,94,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#4ade80',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Check-Back Decisions
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {cb.correctChecks || 0}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Good Checks</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {cb.betInsteadOfCheck || 0}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Should've Bet</div>
                          </div>
                        </div>
                        {cb.insight && (
                          <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                            {cb.insight}
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● NEW: Showdown Analysis ●●● */}
                {(() => {
                  try {
                    const sd = getShowdownAnalysis();
                    if (!sd || sd.totalHands < 5) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(251,146,60,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fb923c',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Showdown Profile
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {sd.showdownRate || 0}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Showdown %</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {sd.aggressionRate || 0}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Aggression %</div>
                          </div>
                        </div>
                        {sd.insight && (
                          <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                            {sd.insight}
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● NEW: Thin Value + Protection Bets ●●● */}
                {(() => {
                  try {
                    const tv = getThinValueFrequency();
                    const pb = getProtectionBetAnalysis();
                    if (!tv && !pb) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(168,85,247,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#c084fc',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Value & Protection
                        </div>
                        {tv && tv.thinValueSpots > 0 && (
                          <div
                            style={{
                              marginBottom: 6,
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                              Thin Value Accuracy
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: (tv.accuracy || 0) >= 60 ? '#22c55e' : '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {tv.accuracy || 0}% ({tv.thinValueSpots})
                            </span>
                          </div>
                        )}
                        {pb && pb.protectionSpots > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                              Protection Bet Accuracy
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: (pb.accuracy || 0) >= 60 ? '#22c55e' : '#fbbf24',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {pb.accuracy || 0}% ({pb.protectionSpots})
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● NEW: Overbet Analysis ●●● */}
                {(() => {
                  try {
                    const ob = getOverbetAnalysis();
                    if (!ob || ob.overbetSpots < 1) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(251,191,36,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fbbf24',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Overbet Usage
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {ob.overbetSpots}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Overbet Spots</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: (ob.accuracy || 0) >= 50 ? '#22c55e' : '#ef4444',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {ob.accuracy || 0}%
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Accuracy</div>
                          </div>
                        </div>
                        {ob.insight && (
                          <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                            {ob.insight}
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● NEW: Hand Strength Distribution ●●● */}
                {(() => {
                  try {
                    const hsd = getHandStrengthDistribution();
                    if (!hsd || !hsd.distribution) return null;
                    const catColors = {
                      premium: '#f59e0b',
                      strong: '#22c55e',
                      medium: '#06b6d4',
                      weak: '#fbbf24',
                      trash: '#ef4444',
                    };
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(14,165,233,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#38bdf8',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Hand Strength Distribution
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            justifyContent: 'center',
                          }}
                        >
                          {Object.entries(hsd.distribution || {}).map(([cat, count]) => (
                            <div
                              key={cat}
                              style={{
                                padding: '4px 10px',
                                background: `${catColors[cat] || '#64748b'}15`,
                                borderRadius: 6,
                                border: `1px solid ${catColors[cat] || '#64748b'}30`,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: catColors[cat] || '#94a3b8',
                                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                }}
                              >
                                {count}
                              </div>
                              <div
                                style={{
                                  fontSize: 8,
                                  color: '#64748b',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {cat}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                {/* ●●● NEW: Donk Bet + Multiway ●●● */}
                {(() => {
                  try {
                    const db = getDonkBetAnalysis();
                    const mw = getMultiWayPotAnalysis();
                    if (!db && !mw) return null;
                    return (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '14px 16px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(100,116,139,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#94a3b8',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          Specialized Spots
                        </div>
                        {db && db.donkBets > 0 && (
                          <div
                            style={{
                              marginBottom: 6,
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                              Donk Bet Accuracy
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {db.accuracy || 0}% ({db.donkBets})
                            </span>
                          </div>
                        )}
                        {mw && mw.multiWayHands > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                              Multiway Accuracy
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                              }}
                            >
                              {mw.multiWayAccuracy || 0}% ({mw.multiWayHands})
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}
              </AnalysisSection>

              {/* ●● SECTION 6: DATA & HISTORY ●● */}
              <AnalysisSection title="Data & History" icon="▲" color="#22d3ee" defaultOpen={false}>
                {/* ●●● PHASE 20: EV by Street visualization ●●● */}
                <EVGraph handHistory={handHistory} title="EV Loss by Street" />

                {/* ●●● PHASE 20: GTO Deviation Analysis ●●● */}
                {(() => {
                  // Compute user's actual action frequencies vs solver's GTO frequencies
                  if (!handHistory || handHistory.length < 3) return null;
                  const actionCounts = {};
                  const gtoCounts = {};
                  let totalHands = 0;
                  handHistory.forEach((h) => {
                    const hd = h.handData || h;
                    const userAction = (hd.action || '').toLowerCase();
                    const correct = (hd.correctAction || '').toLowerCase();
                    if (!userAction) return;
                    totalHands++;
                    // Normalize action names
                    const normalizeAction = (a) => {
                      if (a.includes('fold')) return 'Fold';
                      if (a.includes('check')) return 'Check';
                      if (a.includes('call')) return 'Call';
                      if (a.includes('raise') || a.includes('3-bet') || a.includes('4-bet'))
                        return 'Raise';
                      if (a.includes('bet') || a.includes('pot') || a.includes('overbet'))
                        return 'Bet';
                      if (a.includes('all-in') || a.includes('push')) return 'All-In';
                      return 'Other';
                    };
                    const norm = normalizeAction(userAction);
                    const normCorrect = normalizeAction(correct);
                    actionCounts[norm] = (actionCounts[norm] || 0) + 1;
                    gtoCounts[normCorrect] = (gtoCounts[normCorrect] || 0) + 1;
                  });
                  if (totalHands < 3) return null;
                  // Get top actions
                  const actions = [
                    ...new Set([
                      ...Object.keys(actionCounts || {}),
                      ...Object.keys(gtoCounts || {}),
                    ]),
                  ].filter((a) => a !== 'Other');
                  return actions.length > 0 ? (
                    <div style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 8,
                        }}
                      >
                        GTO Deviation Analysis
                      </div>
                      {actions.map((action) => (
                        <GTODeviationHeatmap
                          key={action}
                          label={`${action} Frequency`}
                          actualPct={((actionCounts[action] || 0) / totalHands) * 100}
                          gtoPct={((gtoCounts[action] || 0) / totalHands) * 100}
                          description={`You ${action.toLowerCase()} ${actionCounts[action] || 0}/${totalHands} vs GTO ${gtoCounts[action] || 0}/${totalHands}`}
                        />
                      ))}
                    </div>
                  ) : null;
                })()}

                {/* POSITION STATS -- Per-position breakdown */}
                <PositionStatsPanel handHistory={handHistory} />

                {/* LIFETIME STATS -- Aggregated metrics */}
                <LifetimeStatsCard
                  totalHands={totalQuestions}
                  totalSessions={1}
                  avgGTOWScore={gtowScore}
                  bestGTOWScore={gtowScore}
                  totalEVLoss={totalEVLoss}
                  avgEVPerHand={avgEVLossPerHand}
                  longestStreak={bestStreak}
                  totalMistakes={sessionMistakes}
                  gamesCompleted={1}
                  // roadmap #40 — the pot-type breakdown inside this card is
                  // gated on `handHistory.length > 0` and the prop was never
                  // passed, so the SRP / 3BP / 4BP+ row has never once rendered
                  // on this screen. The audit that marked #40 "verified in
                  // source" read the component, not the call site.
                  handHistory={handHistory}
                />

                {/* ●●● PHASE 21: Study Streak Map — Training consistency ●●● */}
                {userId && <StudyStreakMapAuto userId={userId} gameId={gameId} />}

                {/* ●●● PHASE 16: Cross-Session Analytics ●●● */}
                <PerformanceTrends gameId={gameId} userId={userId} days={30} compact={false} />

                {crossSessionAnalytics?.streetAccuracy && (
                  <StreetAccuracyPanel streetAccuracy={crossSessionAnalytics.streetAccuracy} />
                )}

                {crossSessionAnalytics?.actionAccuracy && (
                  <ActionAccuracyPanel actionAccuracy={crossSessionAnalytics.actionAccuracy} />
                )}

                {crossSessionAnalytics?.mistakePatterns?.length > 0 && (
                  <MistakePatternPanel mistakePatterns={crossSessionAnalytics.mistakePatterns} />
                )}

                {/* SESSION HISTORY -- Past sessions */}
                <SessionHistoryList gameId={gameId} userId={userId} limit={5} />

                {/* ●●● PHASE 18: Leaderboard ●●● */}
                <LeaderboardPanel userId={userId} gameId={gameId} />
              </AnalysisSection>
            </>
          )}

          {/* ●●● GAME TREE TAB ●●● */}
          {reviewTab === 'gametree' && (
            <>
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(0,212,255,0.04)',
                  border: '1px solid rgba(0,212,255,0.12)',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>◇</span>
                  <h3
                    style={{
                      color: '#00d4ff',
                      fontSize: 14,
                      fontWeight: 700,
                      margin: 0,
                      fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
                    }}
                  >
                    Solver Decision Tree
                  </h3>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>
                  Interactive visualization of the solver game tree. Click nodes to expand branches.
                  Edge thickness indicates action frequency. Select a hand below to see its tree.
                </p>

                {/* Hand selector for game tree */}
                {handHistory && handHistory.length > 0 ? (
                  <div>
                    {/* Quick hand pills */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                      {handHistory.slice(0, 10).map((hand, i) => {
                        const hd = hand.handData || hand;
                        const cls = hand.classification || 'wrong';
                        const clsColor = CLASSIFICATION_CONFIG[cls]?.color || '#ef4444';
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setGameTreeData({
                                actions: hd.gtoFrequencies || {},
                                street: hd.street,
                                heroPosition: hd.heroPosition,
                                heroHand: hd.heroHand,
                                board: hd.board,
                                boardCards: hd.board,
                              });
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: `1px solid ${clsColor}40`,
                              background: `${clsColor}10`,
                              color: clsColor,
                            }}
                          >
                            #{i + 1} {hd.heroHand || '??'}
                          </button>
                        );
                      })}
                    </div>

                    {/* Solver Tree Viewer */}
                    <SolverTreeViewer
                      spotDetail={
                        gameTreeData ||
                        (() => {
                          const firstHand = handHistory[0]?.handData || handHistory[0];
                          return {
                            actions: firstHand?.gtoFrequencies || {},
                            street: firstHand?.street,
                            heroPosition: firstHand?.heroPosition,
                          };
                        })()
                      }
                      width={Math.min(
                        600,
                        typeof window !== 'undefined' ? window.innerWidth - 48 : 520
                      )}
                      height={350}
                    />

                    {/* Runout Strategy Matrix */}
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <RunoutStrategyMatrix
                        holeCards={(() => {
                          const h = gameTreeData || handHistory[0]?.handData || handHistory[0];
                          return h?.heroHand
                            ? typeof h.heroHand === 'string'
                              ? [h.heroHand.slice(0, 2), h.heroHand.slice(2, 4)]
                              : h.heroHand
                            : ['Ah', 'Kh'];
                        })()}
                        flopBoard={(() => {
                          const h = gameTreeData || handHistory[0]?.handData || handHistory[0];
                          return h?.board?.slice(0, 3) || ['Qd', '7c', '2s'];
                        })()}
                        position={(() => {
                          const h = gameTreeData || handHistory[0]?.handData || handHistory[0];
                          return h?.heroPosition === 'BB' || h?.heroPosition === 'SB'
                            ? 'OOP'
                            : 'IP';
                        })()}
                        street="turn"
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#475569', fontSize: 12 }}>
                    Play some hands first to see the solver decision tree here.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ●●● TAB: RANGES — Postflop Range Viewer ●●● */}
          {reviewTab === 'ranges' && (
            <>
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(15,15,30,0.95), rgba(20,20,40,0.95))',
                  borderRadius: 16,
                  padding: 16,
                  border: '1px solid rgba(0,212,255,0.1)',
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#00d4ff',
                    marginBottom: 12,
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    textAlign: 'center',
                  }}
                >
                  Postflop Range Explorer
                </div>
                <PostflopRangeViewer
                  initialBoard={(() => {
                    // Try to use the board from the most recent hand
                    const lastHand =
                      handHistory[handHistory.length - 1]?.handData ||
                      handHistory[handHistory.length - 1];
                    if (lastHand?.board && lastHand.board.length >= 3) return lastHand.board;
                    return ['Ah', 'Kd', '7c'];
                  })()}
                  initialSpot="cbet"
                  initialPosition="IP"
                />
              </div>
            </>
          )}

          {/* ●●● TAB: ANALYTICS — Cross-Session Dashboard ●●● */}
          {reviewTab === 'analytics' && (
            <>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                Sample data preview - cross-session analytics will populate as you complete more
                sessions
              </div>
              <CrossSessionAnalytics sessionHistory={[]} />
            </>
          )}

          {/* ●●● TAB: RANGE BUILDER ●●● */}
          {reviewTab === 'builder' && (
            <>
              <RangeBuilder />
            </>
          )}

          {/* ●●● TAB: BOARD EXPLORER ●●● */}
          {reviewTab === 'boards' && (
            <>
              <BoardExplorer />
            </>
          )}

          {/* ●●● TAB: ICM CALCULATOR ●●● */}
          {reviewTab === 'icm' && (
            <>
              <ICMTournamentPanel />
            </>
          )}

          {/* ●●● TAB: MULTIWAY TRAINER ●●● */}
          {reviewTab === 'multiway' && (
            <>
              <MultiwayTrainer />
            </>
          )}

          {/* ●●● TAB: OPPONENT PROFILER ●●● */}
          {reviewTab === 'opponents' && (
            <>
              <OpponentProfiler />
            </>
          )}

          {/* ●●● TAB: 3-BET TRAINER ●●● */}
          {reviewTab === '3bet' && (
            <>
              <ThreeBetTrainer />
            </>
          )}

          {/* ●●● TAB: PREFLOP SOLUTIONS BROWSER ●●● */}
          {reviewTab === 'solutions' && (
            <>
              <PreflopSolutionsBrowser />
            </>
          )}

          {/* ●●● TAB: CUSTOM SPOT DRILL BUILDER ●●● */}
          {reviewTab === 'drills' && (
            <>
              <CustomSpotDrillBuilder />
            </>
          )}

          {/* ●●● TAB: HAND HISTORY IMPORTER ●●● */}
          {reviewTab === 'import' && (
            <>
              <HandHistoryImporter />
            </>
          )}

          {/* ●●● TAB: TOURNAMENT TRAINER ●●● */}
          {reviewTab === 'tournament' && (
            <>
              <TournamentTrainer />
            </>
          )}

          {/* ●●● TAB: POSTFLOP SOLUTIONS BROWSER ●●● */}
          {reviewTab === 'postflop' && (
            <>
              <PostflopSolutionsBrowser />
            </>
          )}

          {/* ●●● TAB: SIZING TRAINER ●●● */}
          {reviewTab === 'sizing' && (
            <>
              <SizingTrainer />
            </>
          )}

          {/* ●●● TAB: STUDY PLAN CURRICULUM ●●● */}
          {reviewTab === 'curriculum' && (
            <>
              <StudyPlanCurriculum />
            </>
          )}

          {/* ●●● TAB: AGGREGATED REPORTS ●●● */}
          {reviewTab === 'reports' && (
            <>
              <AggregatedReportViewer />
            </>
          )}

          {/* ●●● TAB: EQUITY CALCULATOR ●●● */}
          {reviewTab === 'equity' && (
            <>
              <EquityCalculatorTool />
            </>
          )}

          {/* ●●● TAB: NODE LOCK EDITOR ●●● */}
          {reviewTab === 'nodelock' && (
            <>
              <NodeLockEditor />
            </>
          )}

          {/* ●●● TAB: QUIZ MODE ●●● */}
          {reviewTab === 'quiz' && (
            <>
              <QuizModeEngine />
            </>
          )}

          {/* ●●● TAB: STRATEGY COMPARISON ●●● */}
          {reviewTab === 'compare' && (
            <>
              <StrategyComparison />
            </>
          )}

          {/* ●●● TAB: RANGE VS RANGE EXPLORER ●●● */}
          {reviewTab === 'rvr' && (
            <>
              <RangeVsRangeExplorer />
            </>
          )}

          {/* ●●● TAB: EV TREE VISUALIZER ●●● */}
          {reviewTab === 'evtree' && (
            <>
              <EVTreeVisualizer />
            </>
          )}

          {/* ●●● TAB: BANKROLL TRACKER ●●● */}
          {reviewTab === 'bankroll' && (
            <>
              <BankrollTracker />
            </>
          )}

          {/* ●●● TAB: SPOT FILTER TRAINER ●●● */}
          {reviewTab === 'spotfilter' && (
            <>
              <SpotFilterTrainer />
            </>
          )}

          {/* ●●● TAB: POPUP HUD OVERLAY ●●● */}
          {reviewTab === 'hud' && (
            <>
              <PopupHUDOverlay />
            </>
          )}

          {/* ●●● TAB: HAND NOTE TAGGER ●●● */}
          {reviewTab === 'notes' && (
            <>
              <HandNoteTagger />
            </>
          )}

          {/* ●●● TAB: LEAK FINDER ENGINE ●●● */}
          {reviewTab === 'leaks' && (
            <>
              <LeakFinderEngine />
            </>
          )}

          {/* ●●● TAB: TABLE DYNAMICS PANEL ●●● */}
          {reviewTab === 'dynamics' && (
            <>
              <TableDynamicsPanel />
            </>
          )}

          {/* ●●● TAB: RUNOUT SIMULATOR ●●● */}
          {reviewTab === 'runouts' && (
            <>
              <RunoutSimulator />
            </>
          )}

          {/* ●●● TAB: POSITION MASTERY TRACKER ●●● */}
          {reviewTab === 'mastery' && (
            <>
              <PositionMasteryTracker />
            </>
          )}

          {/* ●●● TAB: MIXED STRATEGY TRAINER ●●● */}
          {reviewTab === 'mixed' && (
            <>
              <MixedStrategyTrainer />
            </>
          )}

          {/* ●●● TAB: SESSION REPLAY TIMELINE ●●● */}
          {reviewTab === 'replay' && (
            <>
              <SessionReplayTimeline />
            </>
          )}

          {/* ●●● TAB: FLOP TEXTURE ANALYZER ●●● */}
          {reviewTab === 'textures' && (
            <>
              <FlopTextureAnalyzer />
            </>
          )}

          {/* ●●● TAB: PREFLOP RANGE CHARTS ●●● */}
          {reviewTab === 'charts' && (
            <>
              <PreflopRangeCharts />
            </>
          )}

          {/* ●●● TAB: HAND STRENGTH DISTRIBUTION ●●● */}
          {reviewTab === 'strength' && (
            <>
              <HandStrengthDistribution />
            </>
          )}

          {/* ●●● TAB: FREQUENCY EXPLOITER ●●● */}
          {reviewTab === 'exploits' && (
            <>
              <FrequencyExploiter />
            </>
          )}

          {/* ●●● TAB: CHIP EV CALCULATOR ●●● */}
          {reviewTab === 'chipev' && (
            <>
              <ChipEVCalculator />
            </>
          )}

          {/* ●●● TAB: FLOP CATEGORY BROWSER ●●● */}
          {reviewTab === 'flopcat' && (
            <>
              <FlopCategoryBrowser />
            </>
          )}

          {/* ●●● TAB: POT ODDS CALCULATOR ●●● */}
          {reviewTab === 'potodds' && (
            <>
              <PotOddsCalculator />
            </>
          )}

          {/* ●●● TAB: STACK DEPTH ADVISOR ●●● */}
          {reviewTab === 'stacks' && (
            <>
              <StackDepthAdvisor />
            </>
          )}

          {/* ●●● TAB: BLUFF CATCHER ANALYZER ●●● */}
          {reviewTab === 'bluffcat' && (
            <>
              <BluffCatcherAnalyzer />
            </>
          )}

          {/* ●●● TAB: TILT TRACKER ●●● */}
          {reviewTab === 'tilt' && (
            <>
              <TiltTrackerPanel />
            </>
          )}

          {/* ●●● TAB: ODDS ORACLE ●●● */}
          {reviewTab === 'oracle' && (
            <>
              <OddsOracleWidget />
            </>
          )}

          {/* ●●● TAB: WIN RATE PROJECTOR ●●● */}
          {reviewTab === 'winrate' && (
            <>
              <WinRateProjector />
            </>
          )}

          {/* ●●● TAB: POSITION FREQUENCY HEATMAP ●●● */}
          {reviewTab === 'posheat' && (
            <>
              <PositionFrequencyHeatmap />
            </>
          )}

          {/* ●●● TAB: SESSION GOAL TRACKER ●●● */}
          {reviewTab === 'goals' && (
            <>
              <SessionGoalTracker />
            </>
          )}

          {/* ●●● TAB: RANGE MEMORIZATION DRILL ●●● */}
          {reviewTab === 'rangemem' && (
            <>
              <RangeMemorizationDrill />
            </>
          )}

          {/* ●●● TAB: MULTI-TABLE TRACKER ●●● */}
          {reviewTab === 'multitable' && (
            <>
              <MultiTableTracker />
            </>
          )}

          {/* ●●● TAB: CONTINUATION BET TRAINER ●●● */}
          {reviewTab === 'cbet' && (
            <>
              <ContinuationBetTrainer />
            </>
          )}

          {/* ●●● TAB: VARIANCE SIMULATOR ●●● */}
          {reviewTab === 'variance' && (
            <>
              <VarianceSimulator />
            </>
          )}

          {/* ●●● TAB: CHECK-RAISE TRAINER ●●● */}
          {reviewTab === 'xraise' && (
            <>
              <CheckRaiseTrainer />
            </>
          )}

          {/* ●●● TAB: HAND RANKING QUIZ ●●● */}
          {reviewTab === 'handquiz' && (
            <>
              <HandRankingQuiz />
            </>
          )}

          {/* ●●● TAB: PRESET RANGE LIBRARY ●●● */}
          {reviewTab === 'rangelib' && (
            <>
              <PresetRangeLibrary />
            </>
          )}

          {/* ●●● TAB: BOARD TEXTURE QUIZ ●●● */}
          {reviewTab === 'boardquiz' && (
            <>
              <BoardTextureQuiz />
            </>
          )}

          {/* ●●● TAB: POSITION PROFIT GRAPH ●●● */}
          {reviewTab === 'posprofit' && (
            <>
              <PositionProfitGraph />
            </>
          )}

          {/* ●●● TAB: FINAL TABLE ICM ●●● */}
          {reviewTab === 'fticm' && (
            <>
              <FinalTableICM />
            </>
          )}

          {/* ●●● TAB: OVERBET TRAINER ●●● */}
          {reviewTab === 'overbet' && (
            <>
              <OverBetTrainer />
            </>
          )}

          {/* ●●● TAB: HEADS-UP TRAINER ●●● */}
          {reviewTab === 'headsup' && (
            <>
              <HeadsUpTrainer />
            </>
          )}

          {/* ●●● TAB: TIMED DECISION TRAINER ●●● */}
          {reviewTab === 'timed' && (
            <>
              <TimeBasedDecisionTrainer />
            </>
          )}

          {/* ●●● TAB: SQUEEZE TRAINER ●●● */}
          {reviewTab === 'squeeze' && (
            <>
              <SqueezeTrainer />
            </>
          )}

          {/* ●●● TAB: FLOAT PLAY TRAINER ●●● */}
          {reviewTab === 'float' && (
            <>
              <FloatPlayTrainer />
            </>
          )}

          {/* ●●● TAB: BLOCKER ANALYSIS ●●● */}
          {reviewTab === 'blockers' && (
            <>
              <BlockerAnalysis />
            </>
          )}

          {/* ●●● TAB: TOURNAMENT LIFE CALCULATOR ●●● */}
          {reviewTab === 'tlife' && (
            <>
              <TournamentLifeCalc />
            </>
          )}

          {/* ●●● TAB: POLARIZATION TRAINER ●●● */}
          {reviewTab === 'polar' && (
            <>
              <PolarizationTrainer />
            </>
          )}

          {/* ●●● TAB: THIN VALUE TRAINER ●●● */}
          {reviewTab === 'thinval' && (
            <>
              <ThinValueTrainer />
            </>
          )}

          {/* ●●● TAB: MULTI-STREET PLANNER ●●● */}
          {reviewTab === 'streets' && (
            <>
              <MultiStreetPlanner />
            </>
          )}

          {/* ●●● TAB: DEFENSE FREQUENCY CALCULATOR ●●● */}
          {reviewTab === 'defense' && (
            <>
              <DefenseFrequencyCalc />
            </>
          )}

          {/* ●●● TAB: PREFLOP SIMULATOR ●●● */}
          {reviewTab === 'preflopsim' && (
            <>
              <PreFlopSimulator />
            </>
          )}

          {/* ●●● TAB: STACK-TO-POT RATIO CALCULATOR ●●● */}
          {reviewTab === 'spr' && (
            <>
              <StackToRatioCalc />
            </>
          )}

          {/* ●●● TAB: BLIND DEFENSE TRAINER ●●● */}
          {reviewTab === 'blinddef' && (
            <>
              <BlindDefenseTrainer />
            </>
          )}

          {/* ●●● TAB: DRAW ODDS CALCULATOR ●●● */}
          {reviewTab === 'drawodds' && (
            <>
              <DrawOddsCalculator />
            </>
          )}

          {/* ●●● TAB: FOLD EQUITY CALCULATOR ●●● */}
          {reviewTab === 'foldeq' && (
            <>
              <FoldEquityCalc />
            </>
          )}

          {/* ●●● TAB: DONK BET TRAINER ●●● */}
          {reviewTab === 'donk' && (
            <>
              <DonkBetTrainer />
            </>
          )}

          {/* ●●● TAB: MULTIWAY POT STRATEGY ●●● */}
          {reviewTab === 'mwstrat' && (
            <>
              <MultiWayPotStrategy />
            </>
          )}

          {/* ●●● TAB: RIVER PROBE TRAINER ●●● */}
          {reviewTab === 'probe' && (
            <>
              <RiverProbeTrainer />
            </>
          )}

          {/* ●●● TAB: POSITION AWARENESS QUIZ ●●● */}
          {reviewTab === 'posquiz' && (
            <>
              <PositionAwarenessQuiz />
            </>
          )}

          {/* ●●● TAB: STACK-OFF RANGE CALCULATOR ●●● */}
          {reviewTab === 'stackoff' && (
            <>
              <StackOffRangeCalc />
            </>
          )}

          {/* ●●● TAB: BETTING PATTERN ANALYZER ●●● */}
          {reviewTab === 'betpat' && (
            <>
              <BettingPatternAnalyzer />
            </>
          )}

          {/* ●●● TAB: TURN BARREL TRAINER ●●● */}
          {reviewTab === 'turnbarrel' && (
            <>
              <TurnBarrelTrainer />
            </>
          )}

          {/* ●●● TAB: SHORT STACK STRATEGY ●●● */}
          {reviewTab === 'shortstack' && (
            <>
              <ShortStackStrategy />
            </>
          )}

          {/* ●●● TAB: RANGE CONSTRUCTION GUIDE ●●● */}
          {reviewTab === 'rangebuild' && (
            <>
              <RangeConstructionGuide />
            </>
          )}

          {/* ●●● TAB: CAPPED RANGE EXPLOITER ●●● */}
          {reviewTab === 'capped' && (
            <>
              <CappedRangeExploiter />
            </>
          )}

          {/* ●●● TAB: BUBBLE FACTOR CALCULATOR ●●● */}
          {reviewTab === 'bubble' && (
            <>
              <BubbleFactorCalc />
            </>
          )}

          {/* ●●● TAB: HAND READING TRAINER ●●● */}
          {reviewTab === 'handread' && (
            <>
              <HandReadingTrainer />
            </>
          )}

          {/* ●●● TAB: GEOMETRIC SIZING CALCULATOR ●●● */}
          {reviewTab === 'geosizing' && (
            <>
              <GeometricSizingCalc />
            </>
          )}

          {/* ●●● TAB: MASS DATA ANALYSIS ●●● */}
          {reviewTab === 'massdata' && (
            <>
              <MassDataAnalysis />
            </>
          )}

          {/* ●●● TAB: RIVER DECISION MATRIX ●●● */}
          {reviewTab === 'rivermatrix' && (
            <>
              <RiverDecisionMatrix />
            </>
          )}

          {/* ●●● TAB: TOURNAMENT PAY JUMP CALCULATOR ●●● */}
          {reviewTab === 'payjump' && (
            <>
              <TournamentPayJumpCalc />
            </>
          )}

          {/* ●●● TAB: CHECK-RAISE SIZING GUIDE ●●● */}
          {reviewTab === 'xrsize' && (
            <>
              <XRaiseSizingGuide />
            </>
          )}

          {/* ●●● TAB: FLOP C-BET MATRIX ●●● */}
          {reviewTab === 'cbetmatrix' && (
            <>
              <FlopCBetMatrix />
            </>
          )}

          {/* ●●● TAB: TURN CARD IMPACT ANALYZER ●●● */}
          {reviewTab === 'turnimpact' && (
            <>
              <TurnCardImpactAnalyzer />
            </>
          )}

          {/* ●●● TAB: BLUFF-TO-VALUE RATIO ●●● */}
          {reviewTab === 'bvr' && (
            <>
              <BluffToValueRatio />
            </>
          )}

          {/* ●●● TAB: SLOW PLAY DECISION TRAINER ●●● */}
          {reviewTab === 'slowplay' && (
            <>
              <SlowPlayDecisionTrainer />
            </>
          )}

          {/* ●●● TAB: KELLY BET CALCULATOR ●●● */}
          {reviewTab === 'kelly' && (
            <>
              <KellyBetCalculator />
            </>
          )}

          {/* ●●● TAB: PREFLOP ALL-IN EQUITY ●●● */}
          {reviewTab === 'pfequity' && (
            <>
              <PreFlopAllInEquity />
            </>
          )}

          {/* ●●● TAB: GTO GLOSSARY ●●● */}
          {reviewTab === 'glossary' && (
            <>
              <GTOGlossary />
            </>
          )}

          {reviewTab === 'potgeo' && (
            <>
              <PotGeometryVisualizer />
            </>
          )}
          {reviewTab === 'exploit' && (
            <>
              <ExploitativeAdjustments />
            </>
          )}
          {reviewTab === 'bluffcatch' && (
            <>
              <RiverBluffCatcherTrainer />
            </>
          )}
          {reviewTab === 'stackdepth' && (
            <>
              <StackDepthStrategyGuide />
            </>
          )}

          {reviewTab === 'xrstrat' && (
            <>
              <CheckRaiseStrategyGuide />
            </>
          )}
          {reviewTab === 'obetrain' && (
            <>
              <OverbetStrategyTrainer />
            </>
          )}
          {reviewTab === 'msplan' && (
            <>
              <MultiStreetPlanningGuide />
            </>
          )}
          {reviewTab === 'rvrsim' && (
            <>
              <RangeVsRangeSim />
            </>
          )}

          {reviewTab === 'boardcov' && (
            <>
              <BoardCoverageAnalyzer />
            </>
          )}
          {reviewTab === 'fticmguide' && (
            <>
              <FinalTableICMGuide />
            </>
          )}
          {reviewTab === 'leakfind' && (
            <>
              <LeakFinderQuiz />
            </>
          )}
          {reviewTab === 'hustrat' && (
            <>
              <HeadsUpStrategyGuide />
            </>
          )}

          {reviewTab === '3bdef' && (
            <>
              <ThreeBetDefenseMatrix />
            </>
          )}
          {reviewTab === 'tiltfix' && (
            <>
              <TiltRecoverySystem />
            </>
          )}
          {reviewTab === 'eqreal' && (
            <>
              <EquityRealizationGuide />
            </>
          )}
          {reviewTab === 'combos' && (
            <>
              <HandCombinatoricsGuide />
            </>
          )}

          {reviewTab === 'sqzplay' && (
            <>
              <SqueezPlayGuide />
            </>
          )}
          {reviewTab === 'sessrev' && (
            <>
              <SessionReviewChecklist />
            </>
          )}
          {reviewTab === 'impodds' && (
            <>
              <ImpliedOddsCalculator />
            </>
          )}
          {reviewTab === 'posprof' && (
            <>
              <PositionProfitTracker />
            </>
          )}

          {reviewTab === 'cbguide' && (
            <>
              <ContinuationBetGuide />
            </>
          )}
          {reviewTab === 'nutadv' && (
            <>
              <NutAdvantageTracker />
            </>
          )}
          {reviewTab === 'pfchart' && (
            <>
              <PreFlopOpenChart />
            </>
          )}
          {reviewTab === 'mdfcalc' && (
            <>
              <MDFCalculator />
            </>
          )}

          {reviewTab === '4bet' && (
            <>
              <FourBetStrategyGuide />
            </>
          )}
          {reviewTab === 'rivpol' && (
            <>
              <RiverPolarizationGuide />
            </>
          )}
          {reviewTab === 'mttstage' && (
            <>
              <TournamentStagesGuide />
            </>
          )}
          {reviewTab === 'betopt' && (
            <>
              <BetSizingOptimizer />
            </>
          )}
          {reviewTab === 'handrank' && (
            <>
              <HandRankingsReference />
            </>
          )}
          {reviewTab === 'rngbal' && (
            <>
              <RangeBalancingDrill />
            </>
          )}
          {reviewTab === 'pfquiz' && (
            <>
              <PostflopPlanningQuiz />
            </>
          )}
          {reviewTab === 'seatsel' && (
            <>
              <SeatSelectionGuide />
            </>
          )}
          {reviewTab === 'tribarrel' && (
            <>
              <TripleBarrelTrainer />
            </>
          )}
          {reviewTab === 'potctrl' && (
            <>
              <PotControlStrategy />
            </>
          )}
          {reviewTab === 'epguide' && (
            <>
              <EarlyPositionGuide />
            </>
          )}
          {reviewTab === 'chkbhd' && (
            <>
              <CheckBehindStrategy />
            </>
          )}
          {reviewTab === 'blindbat' && (
            <>
              <BlindBattleGuide />
            </>
          )}
          {reviewTab === 'rivsize' && (
            <>
              <RiverSizingGuide />
            </>
          )}
          {reviewTab === 'tblimg' && (
            <>
              <TableImageTracker />
            </>
          )}

          {reviewTab === 'dblbarrel' && (
            <>
              <DoubleBarrelGuide />
            </>
          )}
          {reviewTab === 'potcommit' && (
            <>
              <PotCommittedCalc />
            </>
          )}
          {reviewTab === 'rngadv' && (
            <>
              <RangeAdvantageGuide />
            </>
          )}
          {reviewTab === 'fishexp' && (
            <>
              <FishExploitationGuide />
            </>
          )}
          {reviewTab === 'smallball' && (
            <>
              <SmallBallStrategy />
            </>
          )}
          {reviewTab === 'trapplay' && (
            <>
              <TrapPlayGuide />
            </>
          )}
          {reviewTab === 'boardpair' && (
            <>
              <BoardPairingStrategy />
            </>
          )}
          {reviewTab === 'effstack' && (
            <>
              <StackEffectiveCalc />
            </>
          )}
          {reviewTab === 'semibluff' && (
            <>
              <SemiBluffTrainer />
            </>
          )}
          {reviewTab === 'valsize' && (
            <>
              <ValueBetSizingGuide />
            </>
          )}
          {reviewTab === 'opptend' && (
            <>
              <OppTendencyTracker />
            </>
          )}
          {reviewTab === 'mental' && (
            <>
              <MentalGameCoach />
            </>
          )}
          {reviewTab === 'pfllimp' && (
            <>
              <PreFlopLimpStrategy />
            </>
          )}
          {reviewTab === 'resteal' && (
            <>
              <RestealGuide />
            </>
          )}
          {reviewTab === 'costrat' && (
            <>
              <CutoffStrategy />
            </>
          )}
          {reviewTab === 'btnplay' && (
            <>
              <ButtonPlayGuide />
            </>
          )}
          {reviewTab === 'utgrange' && (
            <>
              <UTGRangeGuide />
            </>
          )}
          {reviewTab === 'hjstrat' && (
            <>
              <HiJackStrategy />
            </>
          )}
          {reviewTab === 'sbstrat' && (
            <>
              <SmallBlindComplete />
            </>
          )}
          {reviewTab === 'bbdef' && (
            <>
              <BigBlindDefense />
            </>
          )}
          {reviewTab === 'floating' && (
            <>
              <FloatingStrategy />
            </>
          )}
          {reviewTab === 'probeblf' && (
            <>
              <ProbeBluffGuide />
            </>
          )}
          {reviewTab === 'xrtiming' && (
            <>
              <XRaiseTiming />
            </>
          )}
          {reviewTab === 'delaycb' && (
            <>
              <DelayedCBetGuide />
            </>
          )}
          {reviewTab === 'multitbl' && (
            <>
              <MultiTableStrategy />
            </>
          )}
          {reviewTab === 'brmgmt' && (
            <>
              <BankrollManagement />
            </>
          )}
          {reviewTab === 'tblselect' && (
            <>
              <TableSelectionGuide />
            </>
          )}
          {reviewTab === 'stakesldr' && (
            <>
              <StakesLadderGuide />
            </>
          )}
          {reviewTab === '3bpot' && (
            <>
              <ThreeBetPotPlay />
            </>
          )}
          {reviewTab === '4bpot' && (
            <>
              <FourBetPotPlay />
            </>
          )}
          {reviewTab === 'srpguide' && (
            <>
              <SingleRaisedPotGuide />
            </>
          )}
          {reviewTab === 'sqzpot' && (
            <>
              <SqueezePotPlay />
            </>
          )}
          {reviewTab === 'turnxr' && (
            <>
              <TurnCheckRaiseGuide />
            </>
          )}
          {reviewTab === 'rivobet' && (
            <>
              <RiverOverbetGuide />
            </>
          )}
          {reviewTab === 'donkdef' && (
            <>
              <FlopDonkDefense />
            </>
          )}
          {reviewTab === 'mergerng' && (
            <>
              <MergeRangeGuide />
            </>
          )}
          {reviewTab === 'balance' && (
            <>
              <BalancingFrequencies />
            </>
          )}
          {reviewTab === 'nodelockguide' && (
            <>
              <NodeLockingGuide />
            </>
          )}
          {reviewTab === 'polarizer' && (
            <>
              <RangePolarizerTool />
            </>
          )}
          {reviewTab === 'eqbucket' && (
            <>
              <EquityBucketGuide />
            </>
          )}

          {reviewTab === 'obbluff' && (
            <>
              <OverbetBluffGuide />
            </>
          )}

          {reviewTab === 'valowned' && (
            <>
              <RiverValueOwnedGuide />
            </>
          )}

          {reviewTab === 'chkcall' && (
            <>
              <CheckCallStrategy />
            </>
          )}

          {reviewTab === 'betfold' && (
            <>
              <BetFoldLineGuide />
            </>
          )}

          {reviewTab === 'potodds2' && (
            <>
              <PotOddsTrainer />
            </>
          )}

          {reviewTab === 'drawplay' && (
            <>
              <DrawPlayingGuide />
            </>
          )}

          {reviewTab === 'nutblock' && (
            <>
              <NutBlockerBluff />
            </>
          )}

          {reviewTab === 'cappeddet' && (
            <>
              <CappedRangeDetector />
            </>
          )}

          {reviewTab === 'mwcheck' && (
            <>
              <MultiWayCheckGuide />
            </>
          )}

          {reviewTab === 'isoraise' && (
            <>
              <IsoRaiseStrategy />
            </>
          )}

          {reviewTab === 'latereg' && (
            <>
              <LateRegStrategy />
            </>
          )}

          {reviewTab === 'antesteal' && (
            <>
              <AnteStealGuide />
            </>
          )}

          {reviewTab === 'turntex' && (
            <>
              <TurnTextureGuide />
            </>
          )}

          {reviewTab === 'rivimpact' && (
            <>
              <RiverCardImpact />
            </>
          )}

          {reviewTab === 'rit' && (
            <>
              <RunItTwiceCalc />
            </>
          )}

          {reviewTab === 'allinev' && (
            <>
              <AllInEVDashboard />
            </>
          )}

          {reviewTab === 'pfagg' && (
            <>
              <PostFlopAggression />
            </>
          )}

          {reviewTab === 'pfmistake' && (
            <>
              <PreFlopMistakes />
            </>
          )}

          {reviewTab === 'leakplug' && (
            <>
              <CommonLeaksGuide />
            </>
          )}

          {reviewTab === 'wincond' && (
            <>
              <WinConditionPlanner />
            </>
          )}

          {reviewTab === 'flopxr' && (
            <>
              <FlopCheckRaise />
            </>
          )}

          {reviewTab === 'trnprobe' && (
            <>
              <TurnProbeGuide />
            </>
          )}

          {reviewTab === 'rivbluff' && (
            <>
              <RiverBluffCatcher />
            </>
          )}

          {reviewTab === 'posaware' && (
            <>
              <PositionalAwareness />
            </>
          )}

          {reviewTab === 'sbr' && (
            <>
              <StackToBlindRatio />
            </>
          )}

          {reviewTab === 'pushfold' && (
            <>
              <PushFoldChart />
            </>
          )}

          {reviewTab === 'chipchop' && (
            <>
              <ChipChopCalc />
            </>
          )}

          {reviewTab === 'icmdeal' && (
            <>
              <ICMDealMaker />
            </>
          )}

          {reviewTab === 'mixedstrat' && (
            <>
              <MixedStrategyGuide />
            </>
          )}

          {reviewTab === 'freqbench' && (
            <>
              <FreqBenchmarks />
            </>
          )}

          {reviewTab === 'indiff' && (
            <>
              <IndifferenceCalc />
            </>
          )}

          {reviewTab === 'gtoexp' && (
            <>
              <GTOvsExploit />
            </>
          )}

          {reviewTab === 'handcombo' && (
            <>
              <HandCombinatorics />
            </>
          )}

          {reviewTab === 'rvr2' && (
            <>
              <RangeVsRange />
            </>
          )}

          {reviewTab === 'eqdist' && (
            <>
              <EquityDistribution />
            </>
          )}

          {reviewTab === 'evcalc' && (
            <>
              <EVCalculatorGuide />
            </>
          )}

          {reviewTab === 'sessrevtool' && (
            <>
              <SessionReviewTool />
            </>
          )}

          {reviewTab === 'leakanal' && (
            <>
              <LeakAnalyzer />
            </>
          )}

          {reviewTab === 'studyplan' && (
            <>
              <StudyPlanCreator />
            </>
          )}

          {reviewTab === 'progress' && (
            <>
              <ProgressDashboard />
            </>
          )}

          {reviewTab === 'msplan2' && (
            <>
              <MultiStreetPlan />
            </>
          )}

          {reviewTab === 'stkoff2' && (
            <>
              <StackOffRanges />
            </>
          )}

          {reviewTab === 'thinval2' && (
            <>
              <ThinValueGuide />
            </>
          )}

          {reviewTab === 'revimpl' && (
            <>
              <ReverseImpliedOdds />
            </>
          )}

          {reviewTab === 'brdcov2' && (
            <>
              <BoardCoverageMap />
            </>
          )}

          {reviewTab === 'nodeanlys' && (
            <>
              <NodeAnalysis />
            </>
          )}

          {reviewTab === 'solvsimpl' && (
            <>
              <SolverSimplify />
            </>
          )}

          {reviewTab === 'rngviz' && (
            <>
              <RangeVisualization />
            </>
          )}

          {reviewTab === 'livetell' && (
            <>
              <LivePokerTells />
            </>
          )}

          {reviewTab === 'onlinetm' && (
            <>
              <OnlineTimingTells />
            </>
          )}

          {reviewTab === 'betread' && (
            <>
              <BettingPatternRead />
            </>
          )}

          {reviewTab === 'plytype' && (
            <>
              <PlayerTyping />
            </>
          )}

          {reviewTab === 'tourlife' && (
            <>
              <TournamentLifecycle />
            </>
          )}

          {reviewTab === 'chiputl' && (
            <>
              <ChipUtility />
            </>
          )}

          {reviewTab === 'payouts' && (
            <>
              <PayoutStructure />
            </>
          )}

          {reviewTab === 'fieldsize' && (
            <>
              <FieldSizeStrategy />
            </>
          )}

          {reviewTab === 'huadjust' && (
            <>
              <HeadsUpAdjust />
            </>
          )}

          {reviewTab === '3handed' && (
            <>
              <ThreeHandedPlay />
            </>
          )}

          {reviewTab === '6max' && (
            <>
              <ShortHandedGuide />
            </>
          )}

          {reviewTab === 'fullring' && (
            <>
              <FullRingStrategy />
            </>
          )}

          {reviewTab === 'microstk' && (
            <>
              <MicroStakesGuide />
            </>
          )}

          {reviewTab === 'midstk' && (
            <>
              <MidStakesGuide />
            </>
          )}

          {reviewTab === 'highstk' && (
            <>
              <HighStakesGuide />
            </>
          )}

          {reviewTab === 'nosebleed' && (
            <>
              <NosebleedGuide />
            </>
          )}

          {reviewTab === 'plobasic' && (
            <>
              <PLOBasicsGuide />
            </>
          )}

          {reviewTab === 'plohands' && (
            <>
              <PLOHandSelection />
            </>
          )}

          {reviewTab === 'plopf' && (
            <>
              <PLOPostflopGuide />
            </>
          )}

          {reviewTab === 'plodraw' && (
            <>
              <PLODrawMath />
            </>
          )}

          {reviewTab === 'spingo' && (
            <>
              <SpinAndGoStrategy />
            </>
          )}

          {reviewTab === 'sitgo' && (
            <>
              <SitAndGoGuide />
            </>
          )}

          {reviewTab === 'mttft' && (
            <>
              <MTTFinalTableGuide />
            </>
          )}

          {reviewTab === 'mttearly' && (
            <>
              <MTTEarlyStageGuide />
            </>
          )}

          {reviewTab === 'cashbuyin' && (
            <>
              <CashGameBuyIn />
            </>
          )}

          {reviewTab === 'cashvmtt' && (
            <>
              <CashVsTournament />
            </>
          )}

          {reviewTab === 'onvlive' && (
            <>
              <OnlineVsLiveGuide />
            </>
          )}

          {reviewTab === 'zoom' && (
            <>
              <ZoomPokerGuide />
            </>
          )}

          {reviewTab === 'pkrmath' && (
            <>
              <PokerMathEssentials />
            </>
          )}

          {reviewTab === 'pkrpsych' && (
            <>
              <PokerPsychology />
            </>
          )}

          {reviewTab === 'hhanalysis' && (
            <>
              <HandHistoryAnalysis />
            </>
          )}

          {reviewTab === 'warmup' && (
            <>
              <WarmUpRoutine />
            </>
          )}

          {reviewTab === 'gtoreport' && (
            <>
              <GTOReportsDashboard />
            </>
          )}

          {reviewTab === 'evcompare' && (
            <>
              <EVComparisonTool />
            </>
          )}

          {reviewTab === 'simpsolve' && (
            <>
              <SimplifiedSolutions />
            </>
          )}

          {reviewTab === 'custsolve' && (
            <>
              <CustomSolutionBuilder />
            </>
          )}

          {reviewTab === 'aggflop' && (
            <>
              <AggregatedFlopReport />
            </>
          )}

          {reviewTab === 'arena' && (
            <>
              <PokerArenaMode />
            </>
          )}

          {reviewTab === 'actfilter' && (
            <>
              <ActionFilterAnalyzer />
            </>
          )}

          {reviewTab === 'pko' && (
            <>
              <PKOSolverGuide />
            </>
          )}

          {reviewTab === 'mwsolve' && (
            <>
              <MultiwaySolver />
            </>
          )}

          {reviewTab === 'deepstack' && (
            <>
              <DeepStackSolutions />
            </>
          )}

          {reviewTab === 'handmatrix' && (
            <>
              <HandMatrixViewer />
            </>
          )}

          {reviewTab === 'horseai' && (
            <>
              <AdaptiveAIOpponent />
            </>
          )}

          {reviewTab === 'dailyquiz' && (
            <>
              <DailyPersonalQuiz />
            </>
          )}

          {reviewTab === 'bookmark' && (
            <>
              <MarkTheSpot />
            </>
          )}

          {reviewTab === 'straddle' && (
            <>
              <StraddleAnteSolver />
            </>
          )}

          {reviewTab === 'husng' && (
            <>
              <HUSNGSolver />
            </>
          )}

          {reviewTab === 'coach' && (
            <>
              <SessionCoachingEngine />
            </>
          )}

          {reviewTab === 'nodeinsp' && (
            <>
              <StrategyNodeInspector />
            </>
          )}

          {/* ACTION BUTTONS */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 20,
              flexDirection: levelPassed ? 'row' : 'column',
            }}
          >
            {levelPassed && currentLevel < (totalLevels || 12) && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  sessionSavedRef.current = false;
                  startNextLevel();
                }}
                style={{
                  flex: 1,
                  padding: '16px 24px',
                  fontSize: 15,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  border: 'none',
                  borderRadius: 14,
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>{'\u2192'}</span>
                Next Level ({currentLevel + 1})
              </motion.button>
            )}
            {!levelPassed && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  sessionSavedRef.current = false;
                  retryLevel();
                }}
                style={{
                  padding: '16px 24px',
                  fontSize: 15,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  border: 'none',
                  borderRadius: 14,
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(249, 115, 22, 0.3)',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>{'\u21BB'}</span>
                Retry Level {currentLevel}
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onComplete?.({
                  gameId,
                  accuracy,
                  questionsAnswered: totalQuestions,
                  questionsCorrect: correctCount,
                  bestStreak,
                  levelPassed,
                  level: currentLevel,
                  gtowScore,
                  totalEVLoss,
                  sessionMistakes,
                });
                onExit?.();
              }}
              style={{
                flex: levelPassed ? 1 : undefined,
                padding: '16px 24px',
                fontSize: 15,
                fontWeight: 700,
                background: 'rgba(255,255,255,0.06)',
                border: '2px solid rgba(255,255,255,0.15)',
                borderRadius: 14,
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>{'\u2190'}</span>
              Back to Training
            </motion.button>
          </div>

          {/* SHARE RESULT */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const grade = (() => {
                  try {
                    const g = getSessionGrade();
                    return (
                      g?.grade ||
                      (gtowScore >= 90
                        ? 'S'
                        : gtowScore >= 60
                          ? 'A'
                          : gtowScore >= 30
                            ? 'B'
                            : gtowScore >= -10
                              ? 'C'
                              : 'D')
                    );
                  } catch {
                    return gtowScore >= 90
                      ? 'S'
                      : gtowScore >= 60
                        ? 'A'
                        : gtowScore >= 30
                          ? 'B'
                          : gtowScore >= -10
                            ? 'C'
                            : 'D';
                  }
                })();
                shareResult({
                  gameTitle: gameName || 'GTO Training',
                  grade,
                  score: gtowScore,
                  scoreLabel: 'GTOW SCORE',
                  subtitle: `Level ${currentLevel} \u2022 ${totalQuestions} hands`,
                  color: '#00D4FF',
                  stats: [
                    { label: 'HANDS', value: totalQuestions },
                    { label: 'EV LOSS', value: `-${totalEVLoss.toFixed(1)}` },
                    { label: 'MISTAKES', value: sessionMistakes },
                    { label: 'STREAK', value: bestStreak },
                  ],
                });
              }}
              style={{
                padding: '10px 24px',
                fontSize: 12,
                fontWeight: 700,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                color: 'rgba(255,255,255,0.45)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: 0.5,
              }}
            >
              {'\uD83D\uDCF7'} Share Result
            </motion.button>
          </div>

          {/* MASTERY PROGRESS */}
          <div style={styles.masteryContainer}>
            <div style={styles.masteryLabel}>
              Overall Mastery: {Math.round((currentLevel / (totalLevels || 12)) * 100)}%
            </div>
            <div style={styles.masteryBar}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((currentLevel / (totalLevels || 12)) * 100)}%` }}
                transition={{ duration: 1, delay: 0.5 }}
                style={styles.masteryFill}
              />
            </div>
            {masteryStatus && (
              <div
                style={{
                  fontSize: 11,
                  color: masteryStatus.passed ? '#22c55e' : '#f97316',
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                {masteryStatus.message}
              </div>
            )}
          </div>

          {/* F7: Drill Filters */}
          <AnimatePresence>
            <DrillFilters
              show={showDrillFilters}
              onClose={() => setShowDrillFilters(false)}
              onApply={(filters) => setDrillFilters(filters)}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
              timerMode={timerMode}
              setTimerMode={setTimerMode}
            />
          </AnimatePresence>

          {/* ●●● PHASE 21: Ghost Replay Modal ●●● */}
          {showGhostReplay && (
            <GhostReplayEngine
              sessionName={gameName}
              handHistory={handHistory}
              onClose={() => setShowGhostReplay(false)}
            />
          )}

          {/* ●●● PHASE 19: Share Card Modal ●●● */}
          {showShareCard && (
            <SessionShareCard
              gameName={gameName}
              level={currentLevel}
              gtowScore={gtowScore}
              totalQuestions={totalQuestions}
              correctCount={correctCount}
              totalEVLoss={totalEVLoss}
              bestStreak={bestStreak}
              classificationCounts={classificationCounts}
              sessionMistakes={sessionMistakes}
              onClose={() => setShowShareCard(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // IN-GAME UI — Full screen with GTO Wizard-style GameUIRouter
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

  const hasFullScreenUI = FULL_SCREEN_UI_GAMES.includes(gameId);

  if (hasFullScreenUI) {
    return (
      <div style={styles.fullScreenContainer}>
        {/* Trainer Config Modal */}
        <TrainerConfigModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onStart={handleConfigStart}
          currentGameId={gameId}
        />

        <AnimatePresence mode="wait">
          {/* ●●● PHASE 18: ENHANCED PRE-SESSION LOBBY ●●● */}
          {gamePhase === 'splash' && (
            <motion.div
              key="splash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4 }}
              style={styles.splashScreen}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 420,
                  padding: '0 16px',
                  overflowY: 'auto',
                  maxHeight: '100vh',
                  paddingBottom: 40,
                }}
              >
                {/* Game Title */}
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  style={{ textAlign: 'center', marginBottom: 20, marginTop: 20 }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: '#f1f5f9',
                      letterSpacing: -0.5,
                      fontFamily: "'Inter', -apple-system, sans-serif",
                    }}
                  >
                    {gameName || 'GTO Training'}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
                    Level {currentLevel} of {totalLevels || 12} • {totalQuestions || 25} Questions
                  </div>
                  {(() => {
                    const levelDef = getLevel(currentLevel);
                    return levelDef ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: levelDef.accentColor || '#00d4ff',
                          fontWeight: 700,
                          marginTop: 2,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {levelDef.name} — {levelDef.tier}
                      </div>
                    ) : null;
                  })()}
                </motion.div>

                {/* Session Goal Card */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    marginBottom: 12,
                    background:
                      'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(139,92,246,0.06) 100%)',
                    border: '1px solid rgba(0,212,255,0.15)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#00d4ff',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 6,
                    }}
                  >
                    Session Goal
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                    Score ≥{passThreshold || 85}% to advance to Level{' '}
                    {Math.min(currentLevel + 1, totalLevels || 12)}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    Answer {requiredCorrect || Math.ceil((totalQuestions || 25) * 0.85)} of{' '}
                    {totalQuestions || 25} questions correctly
                  </div>
                </motion.div>

                {/* Previous Performance (from cross-session analytics) */}
                {crossSessionAnalytics?.milestones && (
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      marginBottom: 12,
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 8,
                      }}
                    >
                      Your Performance (30 Days)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#00d4ff',
                            fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {crossSessionAnalytics.milestones.last5Avg ||
                            crossSessionAnalytics.milestones.overallAccuracy ||
                            '—'}
                          %
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                          Avg Score
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#00d4ff',
                            fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {crossSessionAnalytics.milestones.totalSessions || 0}
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                          Sessions
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#22c55e',
                            fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {crossSessionAnalytics.milestones.totalHands || 0}
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Hands</div>
                      </div>
                    </div>
                    {crossSessionAnalytics.milestones.trending && (
                      <div
                        style={{
                          fontSize: 10,
                          color:
                            crossSessionAnalytics.milestones.trending === 'up'
                              ? '#22c55e'
                              : crossSessionAnalytics.milestones.trending === 'down'
                                ? '#ef4444'
                                : '#64748b',
                          textAlign: 'center',
                          marginTop: 6,
                          fontWeight: 600,
                        }}
                      >
                        {crossSessionAnalytics.milestones.trending === 'up'
                          ? '↑ Trending Up'
                          : crossSessionAnalytics.milestones.trending === 'down'
                            ? '↓ Trending Down'
                            : '→ Steady'}
                        {crossSessionAnalytics.milestones.trendDelta
                          ? ` (${crossSessionAnalytics.milestones.trendDelta > 0 ? '+' : ''}${crossSessionAnalytics.milestones.trendDelta}pts)`
                          : ''}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Difficulty + Timer Selectors */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    marginBottom: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Difficulty */}
                  <div style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 6,
                      }}
                    >
                      Difficulty
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { key: 'beginner', label: 'Beginner', color: '#22c55e' },
                        { key: 'standard', label: 'Standard', color: '#00d4ff' },
                        { key: 'expert', label: 'Expert', color: '#ef4444' },
                      ].map((d) => (
                        <button
                          key={d.key}
                          onClick={() => setDifficulty(d.key)}
                          style={{
                            flex: 1,
                            padding: '8px 0',
                            borderRadius: 8,
                            border: `1px solid ${difficulty === d.key ? d.color + '60' : 'rgba(255,255,255,0.08)'}`,
                            background: difficulty === d.key ? d.color + '15' : 'transparent',
                            color: difficulty === d.key ? d.color : '#64748b',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timer */}
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 6,
                      }}
                    >
                      Timer
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { key: 'relaxed', label: 'Relaxed', desc: 'No timer', color: '#22c55e' },
                        { key: 'standard', label: 'Standard', desc: '25s', color: '#fbbf24' },
                        { key: 'quick', label: 'Quick', desc: '15s', color: '#f59e0b' },
                        { key: 'blitz', label: 'Blitz', desc: '7s', color: '#ef4444' },
                      ].map((t) => (
                        <button
                          key={t.key}
                          onClick={() => setTimerMode(t.key)}
                          style={{
                            flex: 1,
                            padding: '8px 0',
                            borderRadius: 8,
                            border: `1px solid ${timerMode === t.key ? t.color + '60' : 'rgba(255,255,255,0.08)'}`,
                            background: timerMode === t.key ? t.color + '15' : 'transparent',
                            color: timerMode === t.key ? t.color : '#64748b',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {t.label}
                          <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.7, marginTop: 1 }}>
                            {t.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Training Mode Selector */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.38 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    marginBottom: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    Training Mode
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      {
                        key: 'standard',
                        label: 'Standard',
                        desc: 'Full GTO',
                        icon: '◆',
                        color: '#00d4ff',
                      },
                      {
                        key: 'flashcard',
                        label: 'Flashcards',
                        desc: 'Concepts',
                        icon: '◇',
                        color: '#00d4ff',
                      },
                      {
                        key: 'drill',
                        label: 'Speed Drill',
                        desc: '20 Qs',
                        icon: '⌁',
                        color: '#f59e0b',
                      },
                      {
                        key: 'import',
                        label: 'Import HH',
                        desc: 'Your Hands',
                        icon: '□',
                        color: '#10b981',
                      },
                    ].map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setTrainingMode(m.key)}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          border: `1px solid ${trainingMode === m.key ? m.color + '60' : 'rgba(255,255,255,0.08)'}`,
                          background: trainingMode === m.key ? m.color + '15' : 'transparent',
                          color: trainingMode === m.key ? m.color : '#64748b',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontSize: 16 }}>{m.icon}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.7 }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>

                {/* Spaced Repetition Due */}
                {reviewDueCount > 0 && (
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 12,
                      marginBottom: 12,
                      background: 'rgba(139,92,246,0.08)',
                      border: '1px solid rgba(139,92,246,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff' }}>
                        {reviewDueCount} Weak Spot{reviewDueCount > 1 ? 's' : ''} Due for Review
                      </div>
                      <div style={{ fontSize: 9, color: '#64748b' }}>
                        Reviewing now maximizes long-term retention
                      </div>
                    </div>
                    <span style={{ fontSize: 20 }}>↻</span>
                  </motion.div>
                )}

                {/* START BUTTON */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.45 }}
                >
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleStartTraining}
                    disabled={!splashReady}
                    style={{
                      width: '100%',
                      padding: '16px 0',
                      borderRadius: 12,
                      border: 'none',
                      background: splashReady
                        ? 'linear-gradient(135deg, #00d4ff, #0891b2)'
                        : 'rgba(100,116,139,0.2)',
                      color: splashReady ? '#fff' : '#64748b',
                      fontSize: 16,
                      fontWeight: 800,
                      cursor: splashReady ? 'pointer' : 'default',
                      letterSpacing: 0.5,
                      transition: 'all 0.2s',
                      fontFamily: "'Inter', -apple-system, sans-serif",
                    }}
                  >
                    {!splashReady
                      ? 'Loading Solver Data...'
                      : trainingMode === 'flashcard'
                        ? 'Start Flashcards'
                        : trainingMode === 'drill'
                          ? 'Start Speed Drill'
                          : 'Start Training →'}
                  </motion.button>
                </motion.div>

                {/* Back button */}
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  onClick={onExit}
                  style={{
                    display: 'block',
                    margin: '12px auto 0',
                    padding: '8px 20px',
                    background: 'none',
                    border: 'none',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ← Back to Training
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ●●● FLASHCARD MODE ●●● */}
          {gamePhase === 'flashcard' && (
            <motion.div
              key="flashcard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%', height: '100%', position: 'relative' }}
            >
              <FlashcardMode
                flashcardState={flashcardState}
                setFlashcardState={setFlashcardState}
                generateFlashcards={generateFlashcards}
                onExit={() => {
                  setGamePhase('splash');
                  setTrainingMode('standard');
                }}
              />
            </motion.div>
          )}

          {/* ●●● DRILL MODE ●●● */}
          {gamePhase === 'drill' && (
            <motion.div
              key="drill"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%', height: '100%', position: 'relative' }}
            >
              <DrillMode
                drillState={drillState}
                setDrillState={setDrillState}
                currentQuestion={currentQuestion}
                generateQuickFireQuestion={generateQuickFireQuestion}
                getBoardTextureQuiz={getBoardTextureQuiz}
                getConceptQuiz={getConceptQuiz}
                onExit={() => {
                  setGamePhase('splash');
                  setTrainingMode('standard');
                }}
                timerRef={drillTimerRef}
              />
            </motion.div>
          )}

          {/* ●●● HAND HISTORY IMPORT MODAL ●●● */}
          {importState.showModal && (
            <HandHistoryImportModal
              importState={importState}
              setImportState={setImportState}
              importHandToTrainingQuestion={importHandToTrainingQuestion}
              onStartImported={(question) => {
                setImportState((prev) => ({
                  ...prev,
                  showModal: false,
                  importedQuestion: question,
                }));
                setGamePhase('playing');
              }}
              onClose={() => setImportState((prev) => ({ ...prev, showModal: false }))}
            />
          )}

          {/* ●●● GAMEPLAY ●●● */}
          {gamePhase === 'playing' && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%', height: '100%', position: 'relative' }}
            >
              {error ? (
                <div style={styles.errorState}>
                  <p style={{ color: '#ef4444', fontSize: 18 }}>▲ {error}</p>
                  <button onClick={() => window.location.reload()} style={styles.retryButton}>
                    Retry
                  </button>
                </div>
              ) : currentQuestion ? (
                <GameUIRouter
                  gameId={gameId}
                  gameName={gameName}
                  streak={streak}
                  question={importState.importedQuestion || questionWithFilteredOptions}
                  level={currentLevel}
                  questionNumber={questionNumber}
                  totalQuestions={totalQuestions}
                  onAnswer={fxOnAnswer}
                  showFeedback={fxShowFeedback}
                  feedbackResult={fxFeedbackResult}
                  explanation={fxExplanation}
                  structuredExplanation={structuredExplanation}
                  // Phase 261-280: Deep coaching callbacks
                  getTeachingPrinciple={getTeachingPrinciple}
                  getPositionReminder={getPositionReminder}
                  getTextureStrategyGuide={getTextureStrategyGuide}
                  getSPRStrategyGuide={getSPRStrategyGuide}
                  getVillainRangeNarration={getVillainRangeNarration}
                  getMultiStreetPlanningGuide={getMultiStreetPlanningGuide}
                  getFrequencyCorrectionPrompt={getFrequencyCorrectionPrompt}
                  getTiltRecoveryAdvice={getTiltRecoveryAdvice}
                  classifyHandStrength={classifyHandStrength}
                  estimateEquityVsRange={estimateEquityVsRange}
                  getActionEVComparison={getActionEVComparison}
                  getSolverLineComparison={getSolverLineComparison}
                  generateHints={generateHints}
                  getRunoutImpactPreview={getRunoutImpactPreview}
                  getRangeConstructionDrill={getRangeConstructionDrill}
                  getHandReadingDrill={getHandReadingDrill}
                  getExploitativeAdjustments={getExploitativeAdjustments}
                  getVarianceSimulator={getVarianceSimulator}
                  getOptimalLineNarration={getOptimalLineNarration}
                  // Phase 351+: Pre-decision hints & concept reminders
                  getPreDecisionPreview={getPreDecisionPreview}
                  getKeyConceptReminders={getKeyConceptReminders}
                  // GTOW scoring props
                  moveClassification={fxMoveClassification}
                  evLoss={fxEvLoss}
                  gtoFrequencies={fxGtoFrequencies}
                  gtowScore={gtowScore}
                  totalSessionEVLoss={totalEVLoss}
                  sessionMistakes={sessionMistakes}
                  // Phase 37: Enhanced session metrics
                  classificationCounts={gtowClassificationCounts}
                  gtowCurrentStreak={gtowCurrentStreak}
                  bestGTOWStreak={bestGTOWStreak}
                  lastClassification={lastClassification}
                  gtowAccuracy={gtowAccuracy}
                  positionAccuracy={positionAccuracy}
                  streetAccuracy={streetAccuracy}
                  weakestPosition={weakestPosition}
                  // Phase 49: Live leak detection
                  mistakePatterns={mistakePatterns}
                  onNextHand={handleNextQuestion}
                  isMultiStreetActive={isMultiStreetActive}
                  currentStreet={currentStreet}
                  dealingNextStreet={loading && isMultiStreetActive}
                  handSummary={handSummary}
                  onExit={onExit}
                  difficultyLevel={computedDifficultyLevel}
                  // Settings gear — relocated to scenario description area
                  onConfigClick={() => setShowConfigModal(true)}
                  trainerConfig={{
                    ...trainerConfig,
                    // Merge GodModeArena timer settings if no custom config timer
                    timerEnabled: trainerConfig?.timerEnabled || isTimerEnabled(timerMode),
                    timerSeconds: trainerConfig?.timerSeconds || resolveTimerSeconds(timerMode),
                  }}
                />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Default layout with header/footer for games without custom UIs
  const headerScoreColor = getArenaScoreColor(gtowScore);
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onExit} style={styles.backButton}>
          ← Exit
        </button>
        <div style={styles.gameTitle}>{gameName || 'Training'}</div>
        <div style={styles.stats}>
          <span style={{ color: headerScoreColor, fontWeight: 'bold' }}>{formatSignedScore(gtowScore)} Score</span>
        </div>
      </div>

      <div style={styles.questionContainer}>
        {error ? (
          <div style={styles.errorState}>
            <p style={{ color: '#ef4444', fontSize: 18 }}>{error}</p>
            <button onClick={() => window.location.reload()} style={styles.retryButton}>
              Retry
            </button>
          </div>
        ) : currentQuestion ? (
          <GameUIRouter
            gameId={gameId}
            gameName={gameName}
            streak={streak}
            question={importState.importedQuestion || questionWithFilteredOptions}
            level={currentLevel}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
            onAnswer={fxOnAnswer}
            showFeedback={fxShowFeedback}
            feedbackResult={fxFeedbackResult}
            explanation={fxExplanation}
            moveClassification={fxMoveClassification}
            evLoss={fxEvLoss}
            gtoFrequencies={fxGtoFrequencies}
            gtowScore={gtowScore}
            totalSessionEVLoss={totalEVLoss}
            sessionMistakes={sessionMistakes}
            // Phase 37: Enhanced session metrics
            classificationCounts={gtowClassificationCounts}
            gtowCurrentStreak={gtowCurrentStreak}
            bestGTOWStreak={bestGTOWStreak}
            lastClassification={lastClassification}
            gtowAccuracy={gtowAccuracy}
            positionAccuracy={positionAccuracy}
            streetAccuracy={streetAccuracy}
            weakestPosition={weakestPosition}
            // Phase 49: Live leak detection
            mistakePatterns={mistakePatterns}
            onNextHand={() => {
              if (importState.importedQuestion) {
                setImportState((s) => ({ ...s, importedQuestion: null }));
                setImportedFeedback(null);
                return; // one-off imported hand; resume queue without skipping
              }
              nextQuestion();
            }}
            isMultiStreetActive={isMultiStreetActive}
            currentStreet={currentStreet}
            dealingNextStreet={loading && isMultiStreetActive}
            handSummary={handSummary}
            onExit={onExit}
            difficultyLevel={computedDifficultyLevel}
            // Phase 351+: Pre-decision hints
            getPreDecisionPreview={getPreDecisionPreview}
            getKeyConceptReminders={getKeyConceptReminders}
            trainerConfig={{
              ...trainerConfig,
              timerEnabled: trainerConfig?.timerEnabled || isTimerEnabled(timerMode),
              timerSeconds: trainerConfig?.timerSeconds || resolveTimerSeconds(timerMode),
            }}
          />
        ) : null}
      </div>

      <div style={styles.footer}>
        <div style={styles.footerStat}>
          <span style={{ color: '#94a3b8' }}>EV Loss:</span>
          <span style={{ color: '#ef4444', fontWeight: 'bold', marginLeft: 6 }}>
            -{totalEVLoss.toFixed(1)} BB
          </span>
        </div>
        <div style={styles.footerStat}>
          <span style={{ color: '#94a3b8' }}>Mistakes:</span>
          <span style={{ color: '#fbbf24', fontWeight: 'bold', marginLeft: 6 }}>
            {sessionMistakes}
          </span>
        </div>
        <div style={styles.footerStat}>
          <span style={{ color: '#94a3b8' }}>Streak:</span>
          <span style={{ color: '#f97316', fontWeight: 'bold', marginLeft: 6 }}>{streak}</span>
        </div>
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STYLES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const styles = {
  fullScreenContainer: {
    width: '100%',
    maxWidth: 900,
    height: '100vh',
    background: '#121212',
    overflow: 'hidden',
    marginLeft: 'auto',
    marginRight: 'auto',
    position: 'relative',
  },

  // ●● PHASE 21: SPLASH SCREEN STYLES
  splashScreen: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#121212',
    zIndex: 999,
  },
  splashContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  splashIcon: {
    fontSize: 64,
    filter: 'none',
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textShadow: 'none',
  },
  splashSubtitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#00d4ff',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  splashLoader: {
    marginTop: 12,
    fontSize: 12,
    color: '#64748b',
    letterSpacing: 1,
  },

  container: {
    width: '100%',
    maxWidth: 900,
    height: '100vh',
    background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', -apple-system, sans-serif",
    overflow: 'hidden',
    marginLeft: 'auto',
    marginRight: 'auto',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: 'rgba(0,0,0,0.4)',
    borderBottom: '1px solid #1e293b',
  },

  backButton: {
    background: 'linear-gradient(135deg, #0891b2, #0e7490)',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  gameTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00d4ff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  stats: {
    display: 'flex',
    fontSize: 14,
  },

  questionContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    minHeight: 0,
  },

  errorState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  footer: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: '12px 20px',
    background: 'rgba(0,0,0,0.4)',
    borderTop: '1px solid #1e293b',
  },

  footerStat: { fontSize: 13 },

  // ●● POST-SESSION REVIEW STYLES
  reviewContainer: {
    width: '100%',
    height: '100vh',
    background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', sans-serif",
    color: '#e2e8f0',
  },

  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'rgba(0,0,0,0.5)',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },

  reviewBackBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: '6px 14px',
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    cursor: 'pointer',
  },

  reviewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e2e8f0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  reviewScrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },

  // Score hero
  scoreHero: {
    textAlign: 'center',
    padding: '24px 0 16px',
  },

  scoreHeroValue: {
    fontSize: 64,
    fontWeight: 'bold',
    fontFamily: "var(--font-orbitron), 'Orbitron', 'Courier New', monospace",
    lineHeight: 1,
  },

  scoreHeroLabel: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
    fontWeight: '600',
  },

  // Summary row
  summaryRow: {
    // roadmap #28/#41 grew this from four tiles to six. `space-around` on a
    // non-wrapping flex row crushed the two longest labels ("EV Loss/Mistake",
    // "Freq Diff") into overlap at 375px, so it is a 3-column grid now:
    // 3x2 on mobile, still a single tidy band on desktop.
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '14px 4px',
    padding: '16px 0',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 16,
  },

  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },

  summaryValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#e2e8f0',
    fontFamily: "'Inter', sans-serif",
  },

  summaryLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Classification breakdown
  classBreakdown: {
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },

  classGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },

  classItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },

  classCount: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 20,
    textAlign: 'right',
  },

  classBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '3px 8px',
    borderRadius: 10,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Hand history
  historySection: {
    marginBottom: 20,
  },

  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    overflow: 'hidden',
    maxHeight: 300,
    overflowY: 'auto',
  },

  // Action buttons
  reviewActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 20,
  },

  nextLevelButton: {
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    cursor: 'pointer',
  },

  retryButton: {
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    cursor: 'pointer',
  },

  exitButton: {
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    cursor: 'pointer',
  },

  // Mastery
  masteryContainer: { marginTop: 8, marginBottom: 32 },
  masteryLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 8 },
  masteryBar: {
    width: '100%',
    height: 8,
    background: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
  },
  masteryFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
  },
};

function GodModeArena(props) {
  const { gameId, onExit, initialConfig } = props;
  
  if (gameId === 'adv-011') return <SPRTrainer onExit={onExit} />;
  if (gameId === 'quiz-gauntlet') return <QuizGauntlet onExit={onExit} />;

  // GTOW parity #10 — the multi-table branch that used to live here has been
  // removed, not relocated. It rendered N copies of GodModeArenaInner with
  // IDENTICAL props: same gameId, same userId, same sessionId. Every copy was a
  // fully independent arena, so a "4 tables" session produced four separate
  // question fetches of the SAME drill, four SESSION_END emissions carrying the
  // same gameId, and four diamond awards for one session's work. It also
  // stacked four position:fixed full-viewport confetti canvases and four global
  // window keydown listeners, so one "1" keypress submitted an answer on all
  // four tables at once.
  //
  // /hub/training/multi-table is the real implementation — distinct drills per
  // table, one combined session, one save — and pages/hub/training.js now
  // routes there when the setup modal's table count is greater than one. This
  // wrapper renders exactly one arena, which is the only thing it was ever able
  // to do correctly.
  //
  // `initialConfig.tables` is deliberately still accepted and ignored here: the
  // setup modal keeps collecting it, and silently rendering one table is the
  // correct degradation for any caller that has not been routed yet.
  return <GodModeArenaInner {...props} />;
}

export default memo(GodModeArena);
