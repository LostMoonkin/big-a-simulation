import type { Clock, MarketId, PublicAccount, PublicCompany, WorldConfig } from './contracts.ts';
import type { AuditSummary, BatchTrace, ProtectionState, PublicTradingView, Side } from './trading-types.ts';

export type SectorId = 'energy' | 'industry' | 'consumer' | 'infrastructure' | 'digital' | 'health';
export type CompanyTier = 'large' | 'medium' | 'small';
export type ConceptId = 'storage' | 'compute' | 'autonomy' | 'renewal' | 'automation' | 'recycling' | 'longevity' | 'crossborder';
export type ConceptExposure = { id: ConceptId; name: string; exposureQ: bigint; business: string };
/** Prices are integer cents, volume is actual matched shares. Fictional timestamps only format charts. */
export type Candle = { stockId: string; worldDay: number; hour: number | null; timestamp: number;
  open: number; high: number; low: number; close: number; volume: number; turnover: bigint;
  completed: boolean; noTrade: boolean; referenceOnly: boolean; lastTradeAt: Clock | null };
export type PlayerExecution = { clock: Clock; stockId: string; orderId: string; side: Side;
  price: number; quantity: number; fee: bigint; unlockAt: Clock | null };
export type WorldCompanyView = PublicCompany & { name: string; sector: SectorId; sectorName: string;
  tier: CompanyTier; totalShares: number; floatShares: number; initialPrice: number;
  concepts: ConceptExposure[]; business: string; demandExposureQ: bigint;
  financingExposureQ: bigint; leverageQ: bigint; durationQ: bigint; reportPhase: number;
  forecastQ: bigint; forecastLowQ: bigint; forecastHighQ: bigint; publicGrowthQ: bigint;
  currentDay: Candle; currentHour: Candle;
  protection: ProtectionState & { low: number; high: number } };
export type WorldPlayerView = Omit<PublicAccount, 'holdings'> & { holdings: (PublicAccount['holdings'][number] & {
  locked: number; lots: { quantity: number; unlockAt: Clock }[] })[]; netAssetValue: bigint };
export type WorldProgress = { seed: number; size: 'prototype'; mode: 'baseline'; preset: 'baseline-v1';
  warmupCompletedBatches: number; warmupTotalBatches: 4000; preheated: boolean;
  playerInjected: boolean; playerDay: number | null; originalCapital: bigint; prototypeDayLimit: 60 };
/** Public preparation has finished in publicDecision; NPC orders do not exist until advance clears it. */
export type WorldPublicView = Omit<PublicTradingView, 'companies' | 'player'> & {
  world: WorldProgress; companies: WorldCompanyView[]; player: WorldPlayerView | null;
  macro: { demandQ: bigint; financingQ: bigint; riskAppetiteQ: bigint };
  sectors: { market: MarketId; sector: SectorId; outlookQ: bigint }[];
  bars: Candle[]; executions: PlayerExecution[] };
export type WarmupRequest = { maxBatches: number; cancelRequested?: boolean };
/** Complete means settled world249/batch15. Explicit prepareNextBatch then injects at world250/batch0. */
export type WarmupResult = WorldProgress & { clock: Clock; phase: 'settled' | 'publicDecision';
  stateVersion: number; publicVersion: number; reason: 'complete' | 'budget' | 'cancelled'; completedBatches: number };
export type WalletSummary = { id: string; role: NpcRole | 'player' | 'founder'; market: MarketId | null;
  cash: bigint; reservedCash: bigint; availableCash: bigint; pendingCash: bigint;
  holdings: { stockId: string; quantity: number; sellable: number; reserved: number }[];
  targets: { stockId: string; targetShares: number; previousWeightQ: bigint; baselineWeightQ: bigint;
    hourCapacity: number; hourUsed: number }[] };
export type WorldDiagnostics = { clock: Clock; phase: 'settled' | 'publicDecision';
  stateVersion: number; publicVersion: number; audit: AuditSummary; latestBatch: BatchTrace | null;
  world: WorldProgress & { config: WorldConfig }; wallets: WalletSummary[];
  stocks: { id: string; market: MarketId; sector: SectorId; floatShares: number;
    lastPrice: number; lastTradeAt: Clock | null; protection: ProtectionState;
    lastCompletedDay: Candle | null }[] };

export type NpcRole = 'repairValue' | 'allocationValue' | 'longValue' | 'shortTrend' | 'swingTrend'
  | 'eventTheme' | 'allocationTheme' | 'inventory1' | 'inventory2' | 'inventory3' | 'inventory4'
  | 'noise' | 'crossSwing' | 'crossLong';
export type NpcStyle = 'value' | 'trend' | 'theme' | 'inventory' | 'noise' | 'crossMarket';
export type NpcAssetState = { stockId: string; initialShares: number; baselineWeightQ: bigint;
  previousWeightQ: bigint; targetShares: number; biasQ: bigint; beliefNoiseQ: bigint;
  inventoryZetaQ: bigint; scoreQ: bigint; referenceQ: bigint; hourCapacity: number; hourUsed: number };
export type NpcState = { accountId: string; role: NpcRole; style: NpcStyle; market: MarketId | null;
  assets: NpcAssetState[]; cashWeightQ: bigint; lastReviewAt: Clock | null; lastReviewPublicVersion: number };
export type WorldStockState = { id: string; name: string; market: MarketId; sector: SectorId;
  sectorName: string; tier: CompanyTier; floatShares: number; concepts: ConceptExposure[];
  business: string; demandExposureQ: bigint; financingExposureQ: bigint; leverageQ: bigint;
  durationQ: bigint; reportPhase: number; muQ: bigint; pendingGrowthQ: bigint;
  publicGrowthQ: bigint; forecastQ: bigint; publicValueQ: bigint; riskQ: bigint;
  currentDay: Candle; currentHour: Candle; days: Candle[]; hours: Candle[] };
/** Only present on generated worlds. P1 explicit scenarios keep their original canonical payload. */
export type WorldState = { generationVersion: 'world-v1'; config: WorldConfig; preset: 'baseline-v1';
  regime: number; regimeExpiresDay: number; macro: { demandQ: bigint; financingQ: bigint; riskAppetiteQ: bigint };
  sectors: { market: MarketId; sector: SectorId; outlookQ: bigint }[];
  stocks: WorldStockState[]; npcs: NpcState[]; executions: PlayerExecution[];
  majorStockIds: string[]; lastSettledTick: number };
