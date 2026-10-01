import { runNumericProbe } from '../../../tools/p0/numeric-probe.ts';
import type { WorkerReply, WorkerRequest } from '@big-a/sim-core';

// This probe deliberately executes the exact Node function inside a real Worker.
globalThis.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const reply: WorkerReply = {
    requestId: request.requestId,
    stateVersion: 0,
    publicVersion: 0,
    payload: request.operation === 'numericProbe' && request.expectedStateVersion === 0
      ? runNumericProbe()
      : { error: 'invalidProbeRequest' },
  };
  globalThis.postMessage(reply);
});
