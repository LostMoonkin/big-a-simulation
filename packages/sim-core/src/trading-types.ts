import type { Clock, Command, CommandResult, MarketId, PublicMessage, PublicView, SafePhase } from './contracts.ts';
import type { WorldState } from './world-types.ts';

export type Side = 'buy' | 'sell';
export type ProtectionState = {
  reference: number;
  bandPercent: 8 | 16 | 32 | 64;
  mode: 'normal' | 'special' | 'reopenPending';
  zeroDays: number;
  tradedToday: boolean;
  processedBatchesToday: number;
};
export type ScenarioStock = { id: string; market: MarketId; initialPrice: number;
  totalShares?: number; lastPrice?: number; lastTradeAt?: Clock | null;
  actualOperatingIndexQ?: bigint;
  protection?: Partial<ProtectionState> };
export type ScenarioAccount = { id: string; cash: bigint; canTrade?: boolean;
  holdings: { stockId: string; quantity: number; unlockAt?: Clock }[]; feeWeight?: bigint };
export type Publication = { message: PublicMessage; major: boolean; privateResultQ?: bigint };
/** Explicit funded fixtures only. This does not perform the P2 world generation/preheat. */
export type ScenarioInput = { seed: number; clock?: Clock; phase?: SafePhase;
  playerAccountId: string | null; stocks: ScenarioStock[]; accounts: ScenarioAccount[];
  serviceCash?: bigint; publications?: Publication[] };

export type AuctionOrder = { id: string; accountId: string; side: Side;
  limitPrice: number; quantity: number; sequence?: number };
export type AuctionInput = { seed: number; tick: number; stockId: string;
  reference: number; low: number; high: number; orders: AuctionOrder[] };
export type AccountAllocation = { accountId: string; quantity: number };
export type AuctionResult = { price: number | null; quantity: number;
  buyAllocations: AccountAllocation[]; sellAllocations: AccountAllocation[];
  orderAllocations: { orderId: string; accountId: string; side: Side; quantity: number }[] };

export type Intent = { stockId: string; side: Side; quantity: number; limitPrice: number;
  scoreQ?: bigint; level?: number };
export type Lot = { stockId: string; quantity: number; unlockTick: number };
export type AccountState = { id: string; canTrade: boolean; cash: bigint; reservedCash: bigint;
  pendingProceeds: { amount: bigint; availableTick: number }[]; lots: Lot[]; feeWeight: bigint };
export type OrderState = { id: string; accountId: string; kind: 'immediate' | 'day' | 'plan';
  stockId: string; side: Side; quantity: number; remainingQuantity: number; filledQuantity: number;
  limitPrice: number; startTick: number; endTick: number; sequence: number;
  reservedCash: bigint; reservedShares: number; feesPaid: bigint;
  status: 'active' | 'partial' | 'completed' | 'cancelled' | 'expired';
  /** Captured only for player orders in generated worlds; absent from P1 scenario payloads. */
  submissionReference?: number | null; submissionReferenceOnly?: boolean };
export type BatchRecord = { clock: Clock; price: number | null; quantity: number };
export type StockState = { id: string; market: MarketId; initialPrice: number; totalShares: number;
  lastPrice: number; lastTradeAt: Clock | null; actualOperatingIndexQ: bigint;
  reports: { publishedAt: Clock; operatingIndexQ: bigint }[];
  protection: ProtectionState; batches: BatchRecord[] };
export type ReceiptRecord = { id: string; accountId: string; canonical: string; result: CommandResult };
export type TradingState = { seed: number; rngVersion: 'rng-v1'; configHash: string;
  clock: Clock; phase: SafePhase; preparationAppliedTick: number; stateVersion: number;
  majorAtCurrentTick: boolean; pauseNextDecision: boolean;
  publicVersion: number; playerAccountId: string | null; playerInjected: boolean; ended: boolean;
  stocks: StockState[]; accounts: AccountState[]; serviceCash: bigint;
  orders: OrderState[]; nextSequence: number; commands: ReceiptRecord[];
  publications: Publication[]; appliedPublications: string[]; messages: PublicMessage[];
  initialCash: bigint; initialShares: { stockId: string; quantity: number }[]; world?: WorldState };
export type FeeItem = { accountId: string; stockId: string; side: Side; amount: bigint;
  fee: bigint; attribution: { orderId: string; fee: bigint }[] };
export type StockTrace = { stockId: string; low: number; high: number;
  clearing: AuctionResult; indicative: AuctionResult;
  protectionBefore: ProtectionState; protectionAfter: ProtectionState };
export type AuditSummary = { cash: bigint; initialCash: bigint; cashDifference: bigint;
  shares: { stockId: string; total: number; expected: number; difference: number }[];
  valid: boolean };
export type BatchTrace = { clock: Clock; publicVersion: number; stocks: StockTrace[];
  fees: FeeItem[]; audit: AuditSummary };
export type TradingDiagnostics = { state: TradingState; trace: BatchTrace[];
  audit: AuditSummary; stateHash: string };
export type PublicTradingView = PublicView & { orders: OrderState[]; availableCash: bigint | null;
  pendingProceeds: AccountState['pendingProceeds']; history: (BatchRecord & { stockId: string })[] };
/** Submitted after prepareNextBatch using the exact public version shown to this account. */
export type ParticipantInput = { publicView: PublicView; accountId: string };
export type SubmittedActorCommand = { accountId: string; command: Command };
