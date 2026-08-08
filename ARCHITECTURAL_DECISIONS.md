# Phase 1A Architectural Decisions

## Repository shape

**Problem:** TradingCore needs a clean Next.js starting point without prematurely creating implementation packages or violating the approved modular architecture.

**Decision:** Keep one deployable Next.js App Router host at repository root as a standalone website. Modular app architecture (apps, modules, plugins) is not needed for a website-only deployment.

**Alternatives considered:** A full workspace containing empty packages; a single unstructured application tree; multiple deployable hosts from day one.

**Tradeoffs:** The project is simplified as a website without modular platform infrastructure, making it easier to maintain and deploy.

**Reasoning:** This is a website project, not a modular trading platform. The current layout provides a clean, maintainable structure for web development without unnecessary complexity.

**Future scalability:** The website can be extended with additional pages and features using standard Next.js patterns without the overhead of a modular monorepo.

**Risks:** Developers could bypass the boundaries by adding generic shared code into `src`. Package/module extraction must be reviewed when reuse crosses a stable ownership boundary.

**Recommendation:** Add workspace tooling only alongside the first genuinely shared package or additional application host.

## Dependency and quality baseline

**Problem:** The product requires strict typed development and repeatable quality checks before feature work begins.

**Decision:** Use strict TypeScript, Next.js App Router, Tailwind’s PostCSS integration, ESLint with Next’s core web vitals/typescript presets, and Prettier with the Tailwind ordering plugin. Framer Motion and Lucide are declared but unused.

**Alternatives considered:** JavaScript-first setup; formatter/linter only; adding UI libraries or component implementations in the foundation phase.

**Tradeoffs:** The dependency graph is intentionally broader than the empty shell currently uses, which prevents later unreviewed setup drift but makes dependency installation required for verification.

**Reasoning:** These are the explicitly approved technology choices, configured before product code so teams inherit the same baseline.

**Future scalability:** Aliases isolate source ownership, while lint/type/format scripts form a CI-ready contract for all future modules and packages.

**Risks:** Tool versions and peer dependencies evolve. Package installation must create and commit a lockfile in the first environment with functional registry access.

**Recommendation:** Gate future pull requests on `format:check`, `lint`, `typecheck`, and `build` after dependency installation succeeds.
