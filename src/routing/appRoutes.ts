import type { WorkspaceRoute } from '../components/workspace/WorkspaceModuleShellTypes';

export const WORKSPACE_ROUTES = [
  '/dashboard',
  '/live',
  '/models',
  '/predictions',
  '/automations',
  '/indicators',
  '/portfolio',
  '/profile',
  '/corespirit',
  '/corespirit/docs',
] as const satisfies readonly WorkspaceRoute[];

export const isWorkspaceRoute = (path: string): path is WorkspaceRoute =>
  (WORKSPACE_ROUTES as readonly string[]).includes(path);
