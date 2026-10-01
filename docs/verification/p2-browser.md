# P2 Web implementation checkpoint

Status: implementation checkpoint, incomplete; independent acceptance pending. This does **not** sign off P2. The economic gate remains with the core/CLI work, and the required fixed-input major-report browser case and final source binding remain open.

The black trading terminal now uses one authoritative DedicatedWorker and production-core public views. It creates a seed/capital world, displays and cancels real 250-day preheating, renders both 20-stock markets, public company reports and actual hour/day Canvas OHLCV. Immediate orders, day orders, plans, cancellation, rejection reasons, cash/reservations/locks and executions are connected to the core. A stable export returns a download URL without copying the private payload into ordinary renderer replies; failed imports retain the old world. There is no automatic world saving. The 60-day limit is a read-only Web stop at settled world309/batch15, preserving the core world for longer CLI experiments.

Actual checks on Windows Chrome154.0.8037.58 used the static preview at `http://127.0.0.1:4173/`. The opening smoke passed after correcting a chart integration bug: forwarding the Candle's bigint turnover caused a chart error, so the adapter now sends only its needed numeric OHLCV fields. Both company pages, both chart scales, filters, MA toggle and background/selection pauses were exercised. The actual complete initial browser snapshot equalled a fresh Node 4,000-batch production preheat.

The longer script exercised actual A immediate fills and T+1 rejection, day-order cancellation, opposite-order conflict and insufficient-cash rejection, B next-batch sales and pending proceeds, a zero-fill day expiry, cancellation at a complete batch, and incompatible/corrupt import preservation. Its actual qualified checkpoint is settled259/15: A010 has 553 newly bought locked shares, its plan submitted9,222/filled543/remaining8,679 shares, and reserved46,881,365 cents. The following 20 days include the world260 fee cycle.

The uninterrupted browser, closed/reopened/imported browser and production Node continuation each completed 320 real batches to settled279/15, with complete checksum `358a9df841a862f077310b70baca1be07885a74d1bf102f6e4b8e4ac68f8e8b5`. The browser then reached settled309/15, showed the read-only 60-day summary, kept holdings, and preserved `core.ended=false`. These are actual observations from the earlier build, not final-source acceptance.

The full browser run remains failed: default seed20261001 produced no natural report meeting the frozen5% major threshold in the examined interval, and the script correctly did not pass an empty report set. The old failure writer also threw a BigInt JSON error after the successful natural trading/resume/60-day actions. That writer is now corrected. A separately labelled legitimate fixed operating-input case is being added to verify actual public preparation, held-report pause and public-decision export/import; it is not natural-occurrence or economy evidence.

The tracked [fixture](fixtures/p2-browser.json) records the actual commands, snapshots, checksums, screenshot/log indexes and failure history. The private files remain under ignored `artifacts/verification/p2/browser-full-trades`. Current Web source has also gained core-provided persistent submission references and core `reserve()` resource previews after that browser build; typechecking passed, but those updates and the upcoming final initialization identity require a fresh complete browser run. The fixture explicitly distinguishes current source identity from the earlier tested compiled artifacts rather than assigning a later source hash to earlier results.

Actual commands:

```text
npm.cmd run typecheck --workspace @big-a/web
npm.cmd run build
node tools/web-checks/browser-check.mjs http://127.0.0.1:4173/ artifacts/verification/p2/browser-full-trades full
node tools/sim-runner/p2-golden.mjs --input artifacts/verification/p2/browser-full-trades/qualified-checkpoint.json --days 20 --out artifacts/verification/p2/browser-full-trades/node-20-days
```

Typecheck/build passed; the last command passed; the full browser command exited nonzero for the open major-report scenario and old failure-writer error. P5 browser breadth/performance, P3 event/technical completeness and P4 automatic storage are not asserted by this checkpoint.
