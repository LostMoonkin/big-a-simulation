# P2 browser checks

The game page owns one active DedicatedWorker. The production core generates, preheats, trades, publishes reports, and validates snapshots there. React renders the public projection and the player's own ledger. Export explicitly returns a Blob download URL; the private snapshot payload is not included in ordinary renderer replies. Appearance preferences are independent of the world.

Build with `npm.cmd run build`, start `npm.cmd run preview`, then run:

```text
node tools/web-checks/browser-check.mjs http://127.0.0.1:4173/ artifacts/verification/p2/browser-full full
```

For a small opening check, replace `full` with `smoke`. The full check uses real Chrome, actual UI clicks and file downloads. It records a cancelled preheat, a new 40-stock world, both company pages and chart scales, order/receipt/resource cases, stable cancellation, held-company report pauses, failed imports, a qualified plan/locked-stock snapshot, closing and reopening the page, 320 resumed batches, and the 60-day read-only summary. The production Node core rebuilds the same initial world and replays the actual submitted commands. The CLI continuation uses the actual downloaded snapshot. Complete canonical checksums are compared, not just chart or wallet totals.

The driver observes public Worker messages to wait for UI actions and collect actual command IDs. It never injects state, generates UI prices, or uses a test-only trading engine. A separate observer locates a reachable scheduled public report for the fixed browser seed; its output is only test setup and is never sent to the page. A missing required scenario fails the run instead of passing an empty event set.

`P2_PLAYWRIGHT_PATH` can select an installed Playwright runtime. `P2_CHROME_PATH` can select the real Chrome executable. Defaults use this host's bundled runtime and Windows Chrome. The complete browser version is recorded each run. This evidence is for the frozen P2 desktop Chrome scope; it does not substitute for P5 browser coverage or performance gates.

Results, complete personal snapshots, raw messages, and screenshots go to ignored `artifacts/verification/p2`. The tracked browser fixture and delivery report identify the actual run and tested source hashes. The economic hash is shared with `tools/sim-runner/p2-runtime.mjs`; the browser hash includes app source/config and these driver files. Changing either tested source group during a run fails its source binding.
