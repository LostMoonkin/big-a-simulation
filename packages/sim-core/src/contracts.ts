/** P0 interface capability contract; implementation starts in P1. */
export const RULES_VERSION = '0.3.0';
export const CONTENT_VERSION = '0.3.0';
export const SNAPSHOT_VERSION = 1;
export type MarketId = 'A' | 'B';
export type Clock = { worldDay: number; batch: number };
export type SafePhase = 'settled' | 'publicDecision';
export type OrderKind = 'immediate' | 'day' | 'plan';
export type FailureCode = 'invalidInput' | 'insufficientCash' | 'insufficientShares' |
  'oppositeDirection' | 'staleView' | 'pastBatch' | 'duplicateIdConflict' |
  'notDecisionWindow' | 'ended' | 'incompatibleVersion' | 'corruptSnapshot' | 'generationFailed';

export type CommandBody =
  | { kind: OrderKind; stockId: string; side: 'buy' | 'sell'; quantity: number; limitPrice: number; endAt?: Clock }
  | { kind: 'cancel'; orderId: string }
  | { kind: 'retire' | 'confirmExhaustion' };
export type Command = { id: string; publicVersion: number; target: Clock; body: CommandBody };
export type CommandResult =
  | { accepted: true; id: string; stateVersion: number; orderId?: string; duplicate: boolean }
  | { accepted: false; id: string; stateVersion: number; reason: FailureCode; detail: string };
export type WorldConfig = { rulesVersion: string; contentVersion: string; seed: number;
  size: 'prototype' | 'full'; mode: 'baseline' | 'complete'; playerCapital: bigint };
export type PublicQuery =
  | { kind: 'market' | 'portfolio' | 'messages' | 'orders' }
  | { kind: 'company'; stockId: string }
  | { kind: 'chart'; stockId: string; scale: 'hour' | 'day'; fromWorldDay?: number };
export type PublicView = { publicVersion: number; stateVersion: number; clock: Clock; phase: SafePhase;
  companies: PublicCompany[]; player: PublicAccount | null; messages: PublicMessage[] };
export type PublicCompany = { id: string; market: MarketId; lastPrice: number; lastTradeAt: Clock | null;
  referenceOnly: boolean; reports: { publishedAt: Clock; operatingIndexQ: bigint }[] };
export type PublicAccount = { cash: bigint; reservedCash: bigint;
  holdings: { stockId: string; total: number; sellable: number; reserved: number }[] };
export type PublicMessage = { id: string; revision: number; publishedAt: Clock;
  expectationQ: bigint; expiresAt: Clock; status: 'active' | 'verified' | 'expired'; text: string };
export type AdvanceRequest = { stop: 'batch' | 'hour' | 'day' | 'season' | Clock;
  maxBatches: number; pauseOnMajor: boolean; cancelRequested?: boolean };
export type AdvanceResult = { clock: Clock; phase: SafePhase; stateVersion: number; publicVersion: number;
  reason: 'target' | 'majorMessage' | 'cancelled' | 'budget' | 'seasonEnd' | 'ended'; completedBatches: number };
export type SnapshotEnvelope = { schemaVersion: number; rulesVersion: string; contentVersion: string;
  mathVersion: string; seed: number; configHash: string; clock: Clock; phase: SafePhase;
  stateVersion: number; publicVersion: number; playerInjected: boolean; payload: string; checksum: string };
export interface MarketCore {
  createWorld(config: WorldConfig): { stateVersion: number } | { reason: FailureCode; detail: string };
  submitCommand(command: Command): CommandResult;
  advance(request: AdvanceRequest): AdvanceResult;
  readPublicView(query: PublicQuery): PublicView;
  exportSnapshot(): SnapshotEnvelope;
  restoreSnapshot(snapshot: SnapshotEnvelope): { restored: true; stateVersion: number } |
    { restored: false; reason: FailureCode; detail: string };
}
export type WorkerRequest = { requestId: string; expectedStateVersion: number; operation: string; payload: unknown };
export type WorkerReply = { requestId: string; stateVersion: number; publicVersion: number; payload: unknown };
