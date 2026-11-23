import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = file => readFileSync(path.join(process.cwd(), file), 'utf8');
const hero = read('src/components/hero/Hero.tsx');
const nav = read('src/components/navigation/Navbar.tsx');
const landing = read('src/pages/LandingPage.tsx');
const belowFold = read('src/pages/LandingBelowFold.tsx');
const app = read('src/App.tsx');
const routes = read('src/routing/appRoutes.ts');

assert.match(hero, /Your entire trading workflow/);
assert.match(hero, /One workspace/);
assert.match(hero, /Open workspace/);
assert.match(hero, /href="\/explore\/indicators"/);
assert.match(hero, /ILLUSTRATIVE PREVIEW/);
assert.match(hero, /NOT A LIVE MARKET FEED/);
assert.match(hero, /disabled[^>]*aria-label="Orders are disabled in the illustrative preview"/);
assert.doesNotMatch(hero, /Broker connected|BUY 82%|BOS CONFIRMED|NET P&L|BUY MARKET/i);

const navItems = nav.slice(nav.indexOf('const NAV_ITEMS'), nav.indexOf('];', nav.indexOf('const NAV_ITEMS')));
assert.equal((navItems.match(/label:/g) || []).length, 4, 'top navigation should stay focused on four product-entry destinations');
assert.match(navItems, /Workspace/);
assert.match(navItems, /CoreSpirit/);
assert.doesNotMatch(navItems, /Architecture|Why TradingCore|How It Works|Pricing|Future Modules/);

assert.doesNotMatch(belowFold, /WorkspacePreview|ArchitectureSection|WhyTradingCore|FeaturesDeepDive|HowItWorks|PricingSection|FutureModules|BrokerStrip/);
assert.match(belowFold, /workspace-modules/);
assert.match(belowFold, /CLEAR ACCESS BOUNDARIES/);
assert.match(belowFold, /illustrative, not live market data/);
assert.match(belowFold, /FAQSection/);
assert.match(belowFold, /Footer/);

assert.ok(landing.includes('<LandingBelowFold onLaunchPlatform={onLaunchPlatform} />'), 'compact product and access links must exist when the page navigation renders');
assert.match(nav, /href: '#access-model-title'/);
assert.match(app, /const handleLaunchPlatform = \(\) => \{/);
assert.match(app, /setIsAuthModalOpen\(true\)/);
assert.match(app, /navigate\('\/dashboard'\)/);
assert.match(app, /pathnameIsPublicIndicator\(pathname\)/);
assert.match(routes, /'\/indicators'/);
console.log('LANDING_PRODUCT_ENTRY_CONTRACT_OK');
