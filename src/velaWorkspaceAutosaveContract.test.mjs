import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const live = read('src/LiveTradingWorkspace.tsx');
const storage = read('src/services/core/chart/tcoVelaSupabaseStorage.ts');
const terminal = read('src/services/core/chart/tcoVelaTerminal.ts');
const workspace = read('vendor/vela/src/workspace/VelaWorkspace.ts');
const document = read('vendor/vela/src/state/document.ts');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');

assert.match(terminal, /persist:'tradingcore-live-vela-v5'/, 'the live terminal must have a stable default workspace persistence key');
assert.match(terminal, /storage,/, 'Vela persistence must use the broker-scoped TCO storage adapter');
assert.match(workspace, /this\.events\.emit\('state:changed', undefined\)/, 'persistable edits must emit the canonical Vela state-changed event');
assert.match(workspace, /}, 500\)/, 'edits are coalesced before the regular autosave write');
assert.match(workspace, /await this\.storage\.set\(this\.persistKey, encodeState\(this\.getState\(\)\)\)/, 'saveNow writes the entire current Vela state document');
assert.match(workspace, /window\.addEventListener\('beforeunload', this\.onUnload\)/, 'pending edits are flushed before page unload');

for (const field of ['symbol', 'timeframe', 'viewport', 'priceScales', 'rendererConfig', 'drawings', 'indicators', 'ext']) {
  assert.match(document, new RegExp('\\b' + field + '\\??:'), `chart state must include ${field}`);
}
for (const field of ['layout', 'trackSizes', 'activeCellId', 'drawingTools', 'panels', 'charts', 'ext']) {
  assert.match(document, new RegExp('\\b' + field + '\\??:'), `workspace state must include ${field}`);
}

assert.match(storage, /localSet\(broker, key, value\)/, 'workspace snapshots are saved locally before cloud writes');
assert.match(storage, /localGetUpdatedAt/, 'the adapter versions its device-local chart snapshots');
assert.match(storage, /localUpdatedAt > cloudUpdatedAt/, 'a newer offline snapshot must win over an older cloud copy');
assert.match(storage, /queueWorkspaceSnapshotRetry/, 'restoring a newer local snapshot schedules cloud repair');
assert.match(storage, /from\('workspace_layouts'\)/, 'signed-in users sync their full workspace document to cloud storage');
assert.match(storage, /select\('snapshot,updated_at'\)/, 'restore compares local and cloud snapshot revisions');
assert.match(storage, /snapshot,\s*updated_at:/, 'the cloud record stores the complete snapshot and its revision time');
assert.match(storage, /writeLocalSavedWorkspaces\(broker, local\)/, 'named workspace saves keep a browser-local fallback');
assert.match(storage, /APPEARANCE_UPDATED_AT_SETTINGS_KEY/, 'appearance preferences include a cloud revision timestamp');
assert.match(storage, /localUpdatedAt > Date\.parse\(cloudUpdatedAt\)/, 'newer local appearance is not overwritten by stale cloud settings');

assert.match(live, /workspace\.on\('state:changed', \(\) => scheduleNamedWorkspaceAutosave\?\.\(\)\)/, 'active named setups refresh after a persistable edit');
assert.match(live, /namedWorkspaceAutosaveTimer = window\.setTimeout/, 'named workspace updates are coalesced rather than sent on every input event');
assert.match(live, /}, 1_800\)/, 'named snapshots update shortly after editing pauses');
assert.match(live, /30 \* 60 \* 1000/, 'a full checkpoint runs every 30 minutes');
assert.match(live, /window\.addEventListener\('pagehide', checkpointWorkspace\)/, 'a final checkpoint is attempted on page hide');
assert.match(live, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/, 'backgrounding the tab triggers an early checkpoint');
assert.match(live, /window\.setInterval\(checkpointWorkspace, 30 \* 60 \* 1000\)/, 'full workspace and named snapshot checkpoints run on a 30-minute cadence');
assert.match(live, /window\.clearInterval\(checkpointTimer\)/, 'the periodic checkpoint timer is cleaned up when the workspace unmounts');
assert.match(live, /await current\.saveNow\(\)/, 'periodic checkpoints flush Vela state before saving the named setup');
assert.match(live, /WORKSPACE_AUTOSAVE_STATUS_EVENT/, 'save progress and outcomes are surfaced to the workspace UI');
assert.match(live, /loadTcoVelaActiveWorkspaceId\(selectionBrokerKey\)/, 'the signed-in active named setup hydrates before named autosave is armed');
assert.match(live, /currentLocalId === activeWorkspaceIdAtStart/, 'a newer local workspace selection wins a racing cloud hydration');
assert.match(live, /namedWorkspaceAutosavePending = true/, 'edits made while account selection loads are not lost for named-workspace autosave');

assert.match(chrome, /'tco\.workspace-frame'/, 'the workspace panel exposes save and restore controls');
assert.match(chrome, /tco:workspace-autosave-status/, 'the workspace panel displays autosave status');
assert.match(chrome, /tco:workspace-appearance-changed/, 'appearance-only changes publish a persistence event');
assert.match(live, /addEventListener\('tco:workspace-appearance-changed', onWorkspaceAppearanceChanged\)/, 'appearance-only changes refresh the active named snapshot');
assert.match(live, /removeEventListener\('tco:workspace-appearance-changed', onWorkspaceAppearanceChanged\)/, 'appearance autosave listeners are removed on workspace teardown');
assert.match(chrome, /drawings, panel layout and UI theme are saved/, 'the saved-workspace UI describes restored trading configuration');
assert.match(chrome, /Broker positions and orders refresh live from your broker and are never replayed from an old snapshot/, 'broker positions and orders must be refreshed live, not replayed from old data');
assert.match(chrome, /saveTcoVelaAppearance\(preferences\)/, 'workspace appearance changes are independently persisted');
assert.match(chrome, /tco:workspace-appearance-changed/, 'UI-only appearance edits notify the active workspace autosave');
assert.match(live, /window\.addEventListener\('tco:workspace-appearance-changed', onWorkspaceAppearanceChanged\)/, 'named workspace snapshots also autosave when only UI appearance changes');
assert.match(chrome, /getLocalTcoVelaSavedWorkspace/, 'checkpointing resolves active named-workspace metadata without a network request');
assert.match(chrome, /const workspaceState=stateForNamedWorkspaceSnapshot\(api\.getState\(\)\)/, 'named checkpoints serialize one consistent full workspace state');
assert.match(chrome, /const snapshotWrite=saveTcoVelaSavedWorkspace\(/, 'named checkpoints start their local write before awaiting cloud sync');
assert.match(chrome, /Promise\.all\(\[snapshotWrite,flushTcoVelaAppearance\(\)\]\)/, 'appearance and named snapshots sync as part of the same checkpoint');
assert.match(chrome, /saveTcoVelaSavedWorkspace\(/, 'named workspace snapshots are persisted separately from the latest working copy');

console.log('VELA_WORKSPACE_AUTOSAVE_AND_FULL_STATE_CONTRACT_OK');
