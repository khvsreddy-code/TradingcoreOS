import type { WorkspaceRoute } from '../components/workspace/WorkspaceModuleShellTypes';

export const WORKSPACE_ROUTES = [
  '/dashboard', '/live', '/corespirit', '/corespirit/docs', '/indicators',
  '/models', '/predictions', '/automations', '/portfolio', '/news', '/profile',
] as const satisfies readonly WorkspaceRoute[];

export const isWorkspaceRoute = (path: string): path is WorkspaceRoute =>
  (WORKSPACE_ROUTES as readonly string[]).includes(path);
