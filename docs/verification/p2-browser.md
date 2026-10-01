# P2 Web implementation checkpoint

Status: candidate browser observations complete; independent acceptance pending. P2 is **not passed**: the economic AC3 diagnostic failed and the100+10 experiment has not run. The current browser evidence combines17 actual UI checks with a separately executed terminal-log repair. The original complete-driver command remains recorded as failed.

The new run is `artifacts/verification/p2/browser-candidate-final`, using actual Windows11Pro Chrome154.0.8037.93 and the frozen `world-v2-style-cash` candidate. The17 observed checks passed:4000-batch preheat and exact Node equality, identical hour/day/fast UI streams, both markets and chart scales, three order kinds, partial fills, fees, T+1/next-batch sale and proceeds locks, rejections/cancellation, stable fast-forward cancellation, damaged imports,20-day close/reopen continuation and the60-day summary. `errors=[]`. The black three-column UI and AppearanceSettings remain unchanged.

The actual qualified snapshot is settled259/15, checksum `29a785c87635635ff5a0aa8eb88a5d78ae23a05919220fad3b20aa5d626083ae`. Its A007 plan has8304 shares,489 filled,7815 remaining and46,561,610 cents reserved;499 new A007 shares unlock at world260/batch0. Uninterrupted Chrome, closed/reopened/imported Chrome and production Node each complete320 actual batches to279/15 with checksum `97c230a299568deafc04796e41c2ef8264e4836627f95904c391e45366cf7dcd`. The60-day snapshot is settled309/15, checksum `b5a4b5fb51faf8a806371b3d1a6930a1556c1caa6a2452b3a94cf3e28d6f9219`, retaining holdings and `core.ended=false`.

The earlier candidate attempt exposed a driver assumption: `protection:B001:4080` is published by settlement255/0 and pauses before clearing255/1. A report publishes at batch0, while a protection announcement pauses at the following public batch. The corrected driver verifies the actual held-stock cause, original message ID/publication time, Node/Worker checksum, `lastSettledTick=currentTick-1` and absent active NPC orders. The original failure and the zero-clearing Node regression remain under `browser-candidate-full` and `browser-candidate-pause-regression`.

The separately labelled fixed operating-input test uses this new, genuinely traded snapshot with its existing A002 holding. Only its unpublished operating index changes. Actual Chrome/core preparation pauses at261/0 before any NPC clearing, checksum `8d49b50a713a6e31ab4d7265cb087a3bc0c0fcbce3aa8b03eb74ab14bafd15e4`. Export/import retains publicVersion4311 without repeat publication; acknowledgement clears0 batches and the next explicit continuation clears1. This is report timing/restore evidence with `naturalEconomicEvidence=false`, not natural event-frequency or liquidity evidence.

After all17 checks and source assertions completed, the successful terminal `JSON.stringify` rejected the actual checkpoint BigInt cash. The complete command exited1 and its original `results.json` still says `fail`. Only the terminal console statement was repaired with the exact-money replacer. `footer-replay.mjs` executes that actual source statement against the captured17 checks and46,561,610n cents: red exits1, green exits0; decoded stdout retains all captured checks and the exact amount. It also asserts unchanged economic/runner source, production app files and compiled artifacts. No browser was relaunched or full script rerun for this logging repair.

Source binding is explicit in [candidateCurrent](fixtures/p2-browser.json): full UI tested head `1e27259dd1332e71c7a397944380d4d12065e733`, economic hash `9ac1c6634a1d13e2179cf48dfd511bc29b5bba6385a5e8481760f7bd16a2aa19`, browser hash `c54044561ed3f905afea7e0285ad1f1f18ec3e48fcd526ab4beb0c100444b949`, compiled hash `ef43a15df6f938f74d1a900054580be16209c6c5f16263a5c66e6b69fb3ccce3`. The driver after the console-only repair has browser hash `ae0ba6c0089996ea6a61c07753f478ba609aa2220ee786786e0e1323b1d2ed2e`. These different hashes are not retroactively assigned to the same run.

Actual candidate commands and outcomes:

```text
npm.cmd run build                                                        # exit0
node tools/web-checks/browser-check.mjs http://127.0.0.1:4173/ artifacts/verification/p2/browser-candidate-full full   # exit1: protection-pause assertion
node artifacts/verification/p2/browser-candidate-pause-regression/pause-replay.mjs                                  # exit0
node tools/web-checks/browser-check.mjs http://127.0.0.1:4173/ artifacts/verification/p2/browser-candidate-final full  # exit1 after17 checks: terminal BigInt JSON
node artifacts/verification/p2/browser-candidate-footer/footer-replay.mjs artifacts/verification/p2/browser-candidate-footer/red    # exit1
node --check tools/web-checks/browser-check.mjs                           # exit0
node artifacts/verification/p2/browser-candidate-footer/footer-replay.mjs artifacts/verification/p2/browser-candidate-footer/green  # exit0; console path only
```

The actual Node20-day and fixed-report subprocess commands/results are indexed in the new run's subdirectory manifests. The tracked fixture retains the original failed runs and earlier-build data. This composite evidence supports only the recorded AC4–8 behaviors, pending independent acceptance; it does not grant P2 economic, P3/P4 feature, or P5 performance/compatibility acceptance.

## Earlier builds retained

The following observations describe the earlier builds and Chrome154.0.8037.58. They are historical evidence, not the current candidate source binding.

The black trading terminal now uses one authoritative DedicatedWorker and production-core public views. It creates a seed/capital world, displays and cancels real 250-day preheating, renders both 20-stock markets, public company reports and actual hour/day Canvas OHLCV. Immediate orders, day orders, plans, cancellation, rejection reasons, cash/reservations/locks and executions are connected to the core. A stable export returns a download URL without copying the private payload into ordinary renderer replies; failed imports retain the old world. There is no automatic world saving. The 60-day limit is a read-only Web stop at settled world309/batch15, preserving the core world for longer CLI experiments.

Actual checks on Windows Chrome154.0.8037.58 used the static preview at `http://127.0.0.1:4173/`. The opening smoke passed after correcting a chart integration bug: forwarding the Candle's bigint turnover caused a chart error, so the adapter now sends only its needed numeric OHLCV fields. Both company pages, both chart scales, filters, MA toggle and background/selection pauses were exercised. The actual complete initial browser snapshot equalled a fresh Node 4,000-batch production preheat.

The longer script exercised actual A immediate fills and T+1 rejection, day-order cancellation, opposite-order conflict and insufficient-cash rejection, B next-batch sales and pending proceeds, a zero-fill day expiry, cancellation at a complete batch, and incompatible/corrupt import preservation. Its actual qualified checkpoint is settled259/15: A010 has 553 newly bought locked shares, its plan submitted9,222/filled543/remaining8,679 shares, and reserved46,881,365 cents. The following 20 days include the world260 fee cycle.

The uninterrupted browser, closed/reopened/imported browser and production Node continuation each completed 320 real batches to settled279/15, with complete checksum `358a9df841a862f077310b70baca1be07885a74d1bf102f6e4b8e4ac68f8e8b5`. The browser then reached settled309/15, showed the read-only 60-day summary, kept holdings, and preserved `core.ended=false`. These are actual observations from the earlier build, not final-source acceptance.

The old full browser run remains failed: default seed20261001 produced no natural report meeting the frozen5% major threshold in the examined interval, and the script correctly did not pass an empty report set. The old failure writer also threw a BigInt JSON error after the successful natural trading/resume/60-day actions. That writer is now corrected; old failed observations remain indexed.

The legitimate fixed operating-input case then passed in actual Chrome154.0.8037.58, using `major-only` and the real traded checkpoint. The Node helper retains all accounts, holdings, orders, prices and history while fixing only the still-unpublished A002 operating index; it advances normally to settled260/15. The browser's real `prepareWorld` publishes the5%-threshold report at261/0 and pauses with zero NPC clearing batches. Its complete paused checksum equals the helper's Node value `5f31f1486a2767608b5541f811dcaf45d32e6e2858701fd062fecd192d58afbe`. Actual file export/import preserves publicVersion4208 and the report count. Confirmation first remains at the already-prepared report; the next explicit continuation clears one batch. No duplicated publication occurs. The evidence states `naturalEconomicEvidence=false`; this is an interface/timing counterexample, not natural-occurrence, liquidity or initialization evidence.

The tracked [fixture](fixtures/p2-browser.json) records the actual commands, snapshots, checksums, screenshot/log indexes and failure history. The private files remain under ignored `artifacts/verification/p2/browser-full-trades`. Current Web source has also gained core-provided persistent submission references and core `reserve()` resource previews after that browser build; typechecking passed, but those updates and the upcoming final initialization identity require a fresh complete browser run. The fixture explicitly distinguishes current source identity from the earlier tested compiled artifacts rather than assigning a later source hash to earlier results.

Actual commands:

```text
npm.cmd run typecheck --workspace @big-a/web
npm.cmd run build
node tools/web-checks/browser-check.mjs http://127.0.0.1:4173/ artifacts/verification/p2/browser-full-trades full
node tools/sim-runner/p2-golden.mjs --input artifacts/verification/p2/browser-full-trades/qualified-checkpoint.json --days 20 --out artifacts/verification/p2/browser-full-trades/node-20-days
node tools/web-checks/browser-check.mjs http://127.0.0.1:4173/ artifacts/verification/p2/browser-major-only major-only artifacts/verification/p2/browser-full-trades/qualified-checkpoint.json
```

Typecheck/build, Node continuation and the separate major-only command passed; the old full browser command exited nonzero for the then-open major-report scenario and old failure-writer error. The full driver now includes exact hour/day/fast UI replay equality and the fixed-input report case, to be run once the final economic version is frozen. P5 browser breadth/performance, P3 event/technical completeness and P4 automatic storage are not asserted by this checkpoint.
