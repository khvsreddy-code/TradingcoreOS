import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const routes = read('./routing/appRoutes.ts');
const routeTypes = read('./components/workspace/WorkspaceModuleShellTypes.ts');
const app = read('./App.tsx');
const moduleShell = read('./components/workspace/WorkspaceModuleShell.tsx');
const workspaceShell = read('./appShells/TradingWorkspaceShell.tsx');
const news = read('./pages/MarketNewsPage.tsx');
const newsRoute = read('./server/routes/news.routes.ts');
const dashboard = read('./pages/DashboardPage.tsx');
const css = read('./index.css');

for (const route of [
  '/dashboard', '/live', '/corespirit', '/corespirit/docs', '/indicators',
  '/models', '/predictions', '/automations', '/portfolio', '/news', '/profile',
]) {
  assert.ok(routes.includes(`'${route}'`), `router includes ${route}`);
  assert.ok(routeTypes.includes(`'${route}'`), `route union includes ${route}`);
}
assert.match(app, /isWorkspaceRoute\(path\)/, 'workspace route selection is central and uses the route registry');
assert.match(moduleShell, /onClick=\{\(\) => onNavigate\(path\)\}/, 'primary navigation buttons call the real route handler');
assert.match(moduleShell, /onClick=\{\(\) => onNavigate\('\/profile'\)\}/, 'profile action has a working navigation handler');
assert.match(moduleShell, /onClick=\{onBroker\}/, 'broker control opens the actual broker setup flow');
assert.match(workspaceShell, /route === '\/news' && <MarketNewsPage/, 'Market News is routed to a live React module');
assert.match(news, /fetch\(\`\/api\/news\?\${params\.toString\(\)}\`/, 'news page uses the existing backend news API');
assert.match(news, /setQuery\(next\)/, 'search submits a new query');
assert.match(news, /setItems\(\[\]\)/, 'never shows previous-query headlines under a new query');
assert.match(news, /onClick=\{\(\) => choosePreset\(preset\.query\)\}/, 'topic preset chips work');
assert.match(news, /onClick=\{refresh\}/, 'refresh and retry controls trigger a request');
assert.match(news, /target="_blank" rel="noopener noreferrer"/, 'article links open the attributed publisher safely');
assert.match(news, /safeExternalUrl/, 'article URLs are limited to HTTP and HTTPS');
assert.match(news, /queryMode === 'topic'/, 'topic filter uses its own backend request mode');
assert.match(newsRoute, /getTopicNews\(topic\)/, 'backend routes topic filters through a separate topic-search path');
assert.match(newsRoute, /TOPIC:/, 'topic cache keys cannot collide with symbol RSS cache keys');
assert.match(dashboard, /onNavigate\('\/news'\)/, 'dashboard links to the full Market News desk');
assert.match(css, /\.tco-stitch-topbar/, 'shared responsive Stitch navigation skin is installed');
assert.match(css, /@media \(max-width: 760px\)/, 'workspace chrome has a mobile layout');
assert.match(moduleShell, /aria-current=\{active === path \? 'page' : undefined\}/, 'active navigation state is exposed accessibly');
assert.match(read('./pages/CoreSpiritDocsPage.tsx'), /WorkspaceModuleShell active="\/corespirit\/docs"/, 'docs route marks Docs as active');

console.log('STITCH_WORKSPACE_WIRING_CONTRACT_OK');
