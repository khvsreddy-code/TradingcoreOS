// The workspace SYNC model â€” pure data + pure functions (DOM-free, unit-testable).
//
// Links between cells are GROUP-based from day one: `true` is sugar for "every cell in
// one implicit group", and a record maps cell ids to named groups (the colored-group UI
// later is pure presentation over this same model). Propagation itself lives in the
// workspace (it owns the cells); this module answers the one pure question â€” "which
// cells follow this origin?" â€” plus the epsilon test that keeps viewport loops quiet.

// The link TYPES live in the shared state document (`src/state/document.ts`) â€” sync
// settings are part of the persisted format. Re-exported here unchanged.
import type { SyncSetting } from '../state/document';
import type { SerializedDrawing } from '../core/drawings';
import { CANDLE_OVERRIDE_KEYS } from '../renderers/native/core/chartConfig';

export type { SyncKind, SyncSetting, SyncOptions } from '../state/document';
export { SYNC_KINDS } from '../state/document';

/** The cells that follow `originId` under `setting` â€” PURE (never includes the origin). */
export function syncTargets(originId: string, setting: SyncSetting | undefined, cellIds: readonly string[]): string[] {
    if (setting == null || setting === false) return [];
    if (setting === true) return cellIds.filter((id) => id !== originId);
    const group = setting[originId];
    if (group == null) return []; // the origin is unlinked â€” nothing follows it
    return cellIds.filter((id¶»§q«^