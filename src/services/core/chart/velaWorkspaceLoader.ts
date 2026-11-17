import type { LayoutRegistration } from '../../../../vendor/vela/src/workspace';

/**
 * Optional Vela workspace capability.
 *
 * The chart facade intentionally does not re-export VelaWorkspace because that
 * runtime value imports the multi-chart workspace, layout registry and replay
 * implementation into the single-chart critical graph.
 */
export async function loadVelaWorkspace() {
  // Keep the chart-critical startup graph focused on the workspace itself. Native drawing
  // metadata is lightweight; Vela loads a family implementation only when its flyout is
  // opened (or when a saved drawing explicitly requires that family).
  const workspace = await import('../../../../vendor/vela/src/workspace');
  return workspace.VelaWorkspace;
}
export type { VelaWorkspaceOptions, WorkspaceEventMap } from '../../../../vendor/vela/src/workspace';

/**
 * Register host presets against the exact layout registry used by the dynamically
 * loaded VelaWorkspace module. Importing layouts through a separate static graph can
 * create a second registry in split production chunks, leaving the native picker empty.
 */
export async function registerVelaWorkspaceLayouts(layouts: readonly LayoutRegistration[]): Promise<void> {
  const module = await import('../../../../vendor/vela/src/workspace');
  for (const layout of layouts) module.registerLayout(layout);
}
