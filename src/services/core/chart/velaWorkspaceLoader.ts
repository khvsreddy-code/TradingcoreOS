import type { LayoutRegistration } from '../../../../vendor/vela/src/workspace';

/**
 * Optional Vela workspace capability.
 *
 * The chart facade intentionally does not re-export VelaWorkspace because that
 * runtime value imports the multi-chart workspace, layout registry and replay
 * implementation into the single-chart critical graph.
 */
export async function loadVelaWorkspace() {
  // Hydrate every native drawing family BEFORE constructing the workspace. This guarantees
  // the Vela toolbar's canonical groups contain real factories on first render (not just
  // lazy placeholders), including Channels, Fibonacci/Gann, Harmonics and Elliott tools.
  const drawings = await import('../../../../vendor/vela/src/core/drawings');
  await drawings.loadAdvancedDrawingCatalog();
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
