/**
 * CoreSpirit realtime visual engine — #6.
 *
 * Converts scene state changes into incremental patches. The renderer receives
 * only added/updated/removed nodes; it never needs the script to recreate an
 * entire chart. The engine also provides transactional revision semantics for
 * developing bars so visual state follows the same rollback/commit boundary as
 * runtime data and UI state.
 */

import { coreSpiritChecksum } from './artifact';
import {
  buildCoreSpiritSceneFromNodes,
  diffCoreSpiritScenes,
  type CoreSpiritScene,
  type CoreSpiritSceneDiff,
  type CoreSpiritSceneIdentity,
  validateCoreSpiritScene,
} from './visualScene';

export type CoreSpiritVisualPatch = Readonly<{
  revision: number;
  previousRevision: number;
  added: readonly string[];
  updated: readonly string[];
  removed: readonly string[];
  sceneChecksum: string;
  structuralReset: boolean;
}>;

export type CoreSpiritVisualRevisionSnapshot = Readonly<{
  revision: number;
  scene: CoreSpiritScene;
  committed: boolean;
  checksum: string;
}>;

export class CoreSpiritRealtimeVisualEngine {
  private committedScene: CoreSpiritScene;
  private workingScene: CoreSpiritScene;
  private workingRevision = 0;
  private patchQueue: CoreSpiritVisualPatch[] = [];
  private transactionActive = false;

  constructor(identity: CoreSpiritSceneIdentity) {
    const initial = buildCoreSpiritSceneFromNodes(identity, [], 0);
    this.committedScene = initial;
    this.workingScene = initial;
  }

  begin(revision: number): void {
    if (revision < this.workingRevision) throw new Error(`visual revision cannot move backwards (${revision} < ${this.workingRevision})`);
    this.workingRevision = revision;
    this.transactionActive = true;
  }

  apply(nextScene: CoreSpiritScene): CoreSpiritSceneDiff {
    if (!this.transactionActive) throw new Error('visual apply requires an active revision transaction');
    if (nextScene.revision < this.workingScene.revision) throw new Error(`scene revision cannot move backwards (${nextScene.revision} < ${this.workingScene.revision})`);
    const errors = validateCoreSpiritScene(nextScene);
    if (errors.length) throw new Error(`invalid visual scene: ${errors.join('; ')}`);

    const sameIdentity = JSON.stringify(nextScene.identity) === JSON.stringify(this.workingScene.identity);
    const diff = sameIdentity ? diffCoreSpiritScenes(this.workingScene, nextScene) : {
      fromRevision: this.workingScene.revision,
      toRevision: nextScene.revision,
      added: nextScene.nodes,
      updated: [],
      removed: this.workingScene.nodes.map(node => node.id),
    } satisfies CoreSpiritSceneDiff;

    const patch: CoreSpiritVisualPatch = {
      revision: nextScene.revision,
      previousRevision: this.workingScene.revision,
      added: diff.added.map(node => node.id),
      updated: diff.updated.map(node => node.id),
      removed: [...diff.removed],
      sceneChecksum: nextScene.checksum,
      structuralReset: !sameIdentity,
    };
    this.patchQueue.push(patch);
    this.workingScene = nextScene;
    return diff;
  }

  commit(): CoreSpiritVisualPatch | undefined {
    if (!this.transactionActive) return undefined;
    this.committedScene = this.workingScene;
    this.transactionActive = false;
    return this.patchQueue[this.patchQueue.length - 1];
  }

  rollback(): CoreSpiritVisualPatch {
    const prior = this.workingScene;
    this.workingScene = this.committedScene;
    this.transactionActive = false;
    const removed = prior.nodes.filter(node => !this.committedScene.nodes.some(next => next.id === node.id)).map(node => node.id);
    const added = this.committedScene.nodes.filter(node => !prior.nodes.some(previous => previous.id === node.id)).map(node => node.id);
    const updated = this.committedScene.nodes.filter(next => {
      const previous = prior.nodes.find(node => node.id === next.id);
      return previous && coreSpiritChecksum(previous) !== coreSpiritChecksum(next);
    }).map(node => node.id);
    const patch: CoreSpiritVisualPatch = {
      revision: this.committedScene.revision,
      previousRevision: prior.revision,
      added,
      updated,
      removed,
      sceneChecksum: this.committedScene.checksum,
      structuralReset: false,
    };
    this.patchQueue.push(patch);
    return patch;
  }

  drainPatches(): CoreSpiritVisualPatch[] {
    const patches = this.patchQueue.splice(0, this.patchQueue.length);
    if (patches.length <= 1) return patches;
    return [coalesceVisualPatches(patches)];
  }

  snapshot(): CoreSpiritVisualRevisionSnapshot {
    return {
      revision: this.workingScene.revision,
      scene: this.workingScene,
      committed: !this.transactionActive,
      checksum: this.workingScene.checksum,
    };
  }

  getCommittedScene(): CoreSpiritScene {
    return this.committedScene;
  }

  getWorkingScene(): CoreSpiritScene {
    return this.workingScene;
  }
}

export function coalesceVisualPatches(patches: readonly CoreSpiritVisualPatch[]): CoreSpiritVisualPatch {
  if (patches.length === 0) throw new Error('cannot coalesce an empty patch list');
  const first = patches[0];
  const last = patches[patches.length - 1];
  const state = new Map<string, 'added' | 'updated' | 'removed'>();

  for (const patch of patches) {
    for (const id of patch.added) {
      const current = state.get(id);
      if (current === 'removed') state.set(id, 'added');
      else if (!current) state.set(id, 'added');
    }
    for (const id of patch.updated) {
      const current = state.get(id);
      if (current === 'added') continue;
      if (current !== 'removed') state.set(id, 'updated');
    }
    for (const id of patch.removed) {
      const current = state.get(id);
      if (current === 'added') state.delete(id);
      else state.set(id, 'removed');
    }
  }

  return {
    revision: last.revision,
    previousRevision: first.previousRevision,
    added: [...state.entries()].filter(([, op]) => op === 'added').map(([id]) => id),
    updated: [...state.entries()].filter(([, op]) => op === 'updated').map(([id]) => id),
    removed: [...state.entries()].filter(([, op]) => op === 'removed').map(([id]) => id),
    sceneChecksum: last.sceneChecksum,
    structuralReset: patches.some(patch => patch.structuralReset),
  };
}
