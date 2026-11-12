import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

const provenance = read('../vendor/vela/UPSTREAM.md');
const releaseNotes = read('../vendor/vela/CHANGELOG.md');
const notice = read('../vendor/vela/NOTICE');
const nativeRenderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const symbols = read('../vendor/vela/src/widget/symbol-picker.ts');
const hyperliquid = read('../vendor/vela/src/data/providers/hyperliquid/HyperliquidProvider.ts');
const provider = read('./TcoVelaDataProvider.ts');
const vela = read('../vendor/vela/src/Vela.ts');
const options = read('../vendor/vela/src/core/options.ts');
const nativeIndicator = read('../vendor/vela/src/core/native-indicators/NativeIndicator.ts');
const paneControl = read('../vendor/vela/src/core/PanesControl.ts');
const chartRenderer = read('../vendor/vela/src/core/ports/IChartRenderer.ts');
const rendererControl = read('../vendor/vela/src/core/RendererControl.ts');
const indicatorHandle = read('../vendor/vela/src/core/IndicatorHandle.ts');
const indicatorRegistry = read('../vendor/vela/src/core/engine/IndicatorRegistry.ts');
const engine = read('../vendor/vela/src/core/engine/EngineOrchestrator.ts');
const sceneGraph = read('../vendor/vela/src/renderers/native/core/SceneGraph.ts');
const overlayStack = read('../vendor/vela/src/renderers/native/core/overlayStack.ts');
const averages = read('../vendor/vela/src/core/native-indicators/classics/averages.ts');
const persistedDocument = read('../vendor/vela/src/state/document.ts');
const inputController = read('../vendor/vela/src/renderers/native/core/InputController.ts');
const paneCell = read('../vendor/vela/src/workspace/ChartCell.ts');
const overlayDiff = JSON.parse(read('../vendor/vela/UPSTREAM-DIFF.json'));
const releaseDiff = JSON.parse(read('../vendor/vela/UPSTREAM-RELEASE-DIFF.json'));
const patchManifest = JSON.parse(read('../vendor/vela/patches.json'));

assert.match(provenance, /Upstream source version: \*\*0\.10\.5\*\*/, 'vendored Vela foundation must pin the actual upstream source version');
assert.match(provenance, /Previous source base: Vela 0\.10\.2/, 'record the 0.10.2 common ancestor of the upstream release');
assert.match(releaseNotes, /^## \[0\.10\.5\]/m, 'vendored changelog must start with Vela 0.10.6');
assert.match(releaseNotes, /^## \[0\.10\.2\]/m, 'vendored changelog must retain the 0.9.0 historical release notes');
assert.match(releaseNotes, /Linear Regression is now two studies/, 'document the breaking linear-regression study replacement');
assert.match(notice, /ATTRIBUTION REQUIREMENT[\s\S]*visible attribution to the Vela project/, 'preserve the required Vela attribution notice');
const noticeBytes = Buffer.from(notice, 'utf8');
const noticeBlobSha = createHash('sha1').update(Buffer.from('blob ' + noticeBytes.length + '\0', 'utf8')).update(noticeBytes).digest('hex');
assert.equal(noticeBlobSha, '44a31353c6635be99277f19c3298c435ecd67456', 'Vela NOTICE must remain byte-identical to upstream 0.10.6');
assert.match(provenance, /305521811eabc35c3797e5b6ab58adb25e70c1c7/, 'record the 0.10.2 common-base source commit');
assert.equal(overlayDiff.upstream.commit, 'f6769868c5c0e78ba7977a5c89640df896a8f2f3', 'machine-generated diff must use the pinned 0.10.6 source commit');
assert.equal(releaseDiff.upstream.base.commit, '305521811eabc35c3797e5b6ab58adb25e70c1c7', 'release diff must compare from the exact 0.10.2 source base');
assert.equal(releaseDiff.upstream.release.commit, 'f6769868c5c0e78ba7977a5c89640df896a8f2f3', 'release diff must terminate at the exact 0.10.6 source commit');
assert.equal(releaseDiff.counts.total, releaseDiff.files.length, 'release diff summary must match changed source entries');
assert.ok(!releaseDiff.files.some((file) => file.path === 'src/data/providers/hyperliquid/HyperliquidProvider.ts'), 'the HIP-3 provider predates the 0.10.2 to 0.10.6 source delta');
assert.ok(overlayDiff.identical.some((file) => file.path === 'src/data/providers/hyperliquid/HyperliquidProvider.ts'), 'HIP-3 provider source is carried byte-identically from upstream 0.10.6');
assert.match(hyperliquid, /private async listHip3\(/, 'the vendored provider enumerates builder-deployed HIP-3 perp dex markets');
assert.match(hyperliquid, /type: 'perpDexs'/, 'the vendored provider discovers deployed perp dexes from the public API');
assert.match(hyperliquid, /splitDexCoin\(t\)/, 'the vendored provider parses qualified dex:coin tickers after ticker normalization');
assert.ok(releaseDiff.files.some((file) => file.path === 'src/locales/catalog.d.ts'), 'release diff must include the generated localization catalogue types');
assert.ok(releaseDiff.files.some((file) => file.path === 'src/widget/topbar.ts'), 'release diff must include the updated chart-style picker contract');
assert.ok(releaseDiff.files.some((file) => file.path === 'src/chart-types/applicability.ts' && file.status === 'added'), '0.10.6 adds chart-style applicability rules');
assert.ok(releaseDiff.files.some((file) => file.path === 'src/core/data-unavailable.ts' && file.status === 'added'), '0.10.6 adds typed permanent data-unavailable errors');
assert.ok(releaseDiff.files.some((file) => file.path === 'src/renderers/native/backend/close-styles.ts' && file.status === 'added'), '0.10.6 adds close-only chart style rendering');
assert.ok(releaseDiff.files.some((file) => file.path === 'src/core/engine/EngineOrchestrator.ts'), 'release delta includes the updated indicator code-trial lifecycle');
assert.equal(overlayDiff.counts.modified, overlayDiff.modified.length, 'diff summary must agree with the per-file modifications');
assert.equal(overlayDiff.counts.localOnly, overlayDiff.localOnly.length, 'diff summary must agree with TCO-only source files');
assert.ok(overlayDiff.modified.every((file) => patchManifest.patches.some((patch) => patch.id === file.patchId)), 'every modified upstream source file must have a patch owner');
assert.ok(overlayDiff.localOnly.every((file) => patchManifest.patches.some((patch) => patch.id === file.patchId)), 'every TCO-only source file must have a patch owner');
assert.match(persistedDocument, /paneHeightWeights\?: Record<string, number>/, 'pane weights are part of the versioned per-cell state');
assert.match(persistedDocument, /Object\.keys\(source\)\.slice\(0, 64\)/, 'persisted pane count is bounded');
assert.match(paneCell, /private restorePaneHeightWeights\(\)/, 'saved pane proportions are restored to the native chart');
assert.match(paneCell, /chart\.panes\.setHeightWeight\(pane\.id, weight\)/, 'restoration uses the Vela pane API through the 0.10.6 overlay');
assert.match(paneCell, /paneHeightWeights: this\.readPaneHeightWeights\(\)/, 'live pane weights are included in chart snapshots');
assert.match(paneCell, /const normalization = Math\.max\(1, maxWeight \/ 100\)/, 'oversized API weights are normalized by a common factor so pane proportions survive persistence');
assert.match(paneCell, /if \(pending\) \{[\s\S]*maxWeight = Math\.max\(maxWeight, weight\)/, 'pending panes participate in the same normalization factor during progressive restore');
assert.match(vela, /priceAxis\?\.ticks|priceAxisTicks/, 'carry the upstream custom price-axis ticks API');
assert.match(options, /priceAxis\??:/, 'carry the upstream price-axis option contract');
assert.match(nativeIndicator, /waitsForHistory\?: boolean/, 'native indicators can opt into full-history gating');
assert.match(paneControl, /setHeightWeight\(paneId: string, weight: number\)/, 'pane height weights are part of the public Vela API');
assert.match(chartRenderer, /paneId\?: string \| null/, 'click and crosshair events include an optional pane identity');
assert.match(chartRenderer, /setBarsColumns\(columns: ColumnarBars/, 'columnar history replacement is part of the renderer port');
assert.match(chartRenderer, /updateBarColumns\(update: ColumnarBarUpdate/, 'columnar live patches are part of the renderer port');
assert.match(rendererControl, /getWorkspaceScaleState\(\)/, 'workspace pane scales are exposed through the public renderer control');
assert.match(rendererControl, /applyWorkspaceScaleState\(/, 'saved pane scales restore through the public renderer control');
assert.match(rendererControl, /onWorkspaceScaleChange\(/, 'user axis changes notify the workspace through the renderer control');
assert.match(indicatorHandle, /export interface CodeUpdateResult/, 'indicator updates expose a typed result');
assert.match(indicatorHandle, /updateCode\(source: string\): Promise<CodeUpdateResult>/, 'updateCode resolves with its execution result');
assert.match(indicatorRegistry, /codeWaiters\?: Array/, 'the indicator registry tracks in-flight code-update callers');
assert.match(indicatorRegistry, /codeTrial\?: \{ previous: CodeSnapshot \}/, 'the registry records the last known-good code for rollback');
assert.match(engine, /private rejectCode\(/, 'failed first execution restores the last known-good indicator code');
assert.match(engine, /historyComplete\(\): Promise<void>/, 'full-history completion remains an explicit lifecycle boundary');
assert.match(inputController, /this\.dragging && this\.region === 'data' && wasTouch/, 'native inertial fling must only run for touch releases, not mouse drags');
assert.match(sceneGraph, /heightWeight: heightWeight \?\? \(kind === 'price' \? 3 : 1\)/, 'new panes receive deterministic default weights');
assert.match(sceneGraph, /if \(heightWeight !== undefined\) existing\.heightWeight = heightWeight/, 'mounting an indicator without a weight preserves user resizing');
assert.match(overlayStack, /export function/, 'the overlay stacking order logic is vendored');
assert.match(averages, /type: 'lsma'/, 'the breaking linear regression curve is replaced by LSMA');
assert.match(averages, /type: 'linear-regression-slope'/, 'linear regression slope remains an explicit study');
assert.doesNotMatch(averages, /type: 'linear-regression'/, 'the removed 0.8.5 linear-regression built-in must not be re-registered');
assert.match(persistedDocument, /type !== 'linear-regression'/, 'saved chart state must migrate the retired study before restore');
assert.match(persistedDocument, /slope \? 'linear-regression-slope' : 'lsma'/, 'saved Curve and Slope modes must migrate to the correct replacement study');
assert.match(persistedDocument, /length: 100, \.\.\.rest/, 'saved linear-regression curves preserve their former 100-bar default when becoming LSMA');
for (const path of [
  '../vendor/vela/src/renderers/native/chrome/priceAxisTicks.ts',
  '../vendor/vela/src/renderers/native/chrome/vela-logos.ts',
  '../vendor/vela/src/ui/surface-events.ts',
  '../vendor/vela/src/ui/surface-exit.ts',
]) assert.equal(exists(path), true, path + ' must remain present as local UI compatibility fixtures');

assert.match(nativeRenderer, /private settingsEnabled = true/, 'keep native chart settings enabled');
assert.match(nativeRenderer, /btn\.addEventListener\('pointerdown', \(event\) => event\.stopPropagation\(\)\)/, 'native settings gear must not bubble into chart gestures');
assert.match(nativeRenderer, /this\.openSettingsDialog\(\)/, 'native gear must open the real Vela settings dialog');
assert.match(symbols, /'Options'/, "keep TCO's explicit Options market filter");
assert.match(symbols, /queryTokens = q\.match/, 'search compact derivatives by separate query tokens');
assert.match(provider, /Options:\s*\['NSE_FO', 'BSE_FO'\]/, 'Options search must use the FYERS derivatives masters');

for (const path of [
  '../vendor/vela/src/core/model/ColumnarHistoryTape.ts',
  '../vendor/vela/src/core/model/columnar-bars.ts',
  '../vendor/vela/src/core/model/scenePatch.ts',
  '../vendor/vela/src/core/native-indicators/lazyCatalog.ts',
  '../vendor/vela/src/core/drawings/advancedRegistryChannels.ts',
  '../vendor/vela/src/core/drawings/advancedRegistryFibonacci.ts',
  '../vendor/vela/src/core/drawings/advancedRegistryPatterns.ts',
]) assert.equal(exists(path), true, path + ' is a required TCO performance/feature extension');

const localeRegistry = read('../vendor/vela/src/core/i18n/registry.ts');
const hindiLocale = read('../vendor/vela/src/locales/hi.ts');
assert.match(vela, /setLocale\(next: string \| LocalizationOptions\)/, 'Vela supports runtime localization');
assert.match(localeRegistry, /export function registerLocale\(/, 'locale registration is explicit and opt-in');
assert.match(hindiLocale, /locale: 'hi'/, 'the Hindi locale pack is included');
assert.ok(exists('../vendor/vela/src/locales/hi.json'), 'Hindi translation catalogue is included');
assert.ok(releaseDiff.files.some((file) => file.path === 'src/locales/hi.json'), '0.10.6 release delta includes the Hindi catalogue');
console.log('VELA_106_FOUNDATION_AND_TCO_OVERLAY_CONTRACT_OK');
