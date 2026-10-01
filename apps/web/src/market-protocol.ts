import type { AdvanceResult, Command, CommandResult, PublicQuery, WorldPublicView } from '@big-a/sim-core';

export type MarketOperation = 'create' | 'view' | 'prepare' | 'command' | 'advance' | 'cancel' | 'export' | 'import' | 'releaseExport';
export type MarketRequest = { requestId: string; sessionId: number; expectedStateVersion: number;
  operation: MarketOperation; payload?: unknown };
export type MarketReply = { requestId: string; sessionId: number; kind: 'progress' | 'result';
  stateVersion: number; publicVersion: number; view?: WorldPublicView;
  progress?: { operation: 'warmup' | 'advance'; completed: number; total: number };
  command?: CommandResult; advance?: AdvanceResult;
  exported?: { url: string; filename: string; checksum: string };
  error?: { code: string; detail: string }; cancelled?: boolean };
export type NewWorldInput = { seed: number; playerCapital: bigint; query: PublicQuery };
export type AdvanceInput = { stop: 'batch' | 'hour' | 'day' | { worldDay: number; batch: number }; acknowledgeMajor: boolean };
export type CommandInput = { command: Command };

