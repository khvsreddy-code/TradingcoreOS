/**
 * Optional Vela workspace capability.
 *
 * The chart facade intentionally does not re-export VelaWorkspace because that
 * runtime value imports the multi-chart workspace, layout registry and replay
 * implementation into the single-chart critical graph.
 */
export async function loadVelaWorkspace() {
  const module = await import('../../../../vendor/vela/src/workspace');
  return module.VelaWorkspace;
}
export type { VelaWorkspaceOptions, WorkspaceEventMap } from '../../../../vendor/vela/src/workspace';
