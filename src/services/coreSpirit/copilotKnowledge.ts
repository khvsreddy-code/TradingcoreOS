import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_RUNTIME_VERSION } from './VERSION.js';
import { CORE_SCRIPT_LANGUAGE_VERSION } from './coreScriptLanguagePolicy.js';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary.js';
import { CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES } from './standardLibraryNamespaces.js';

/** Increment this corpus revision whenever curated safety entries, ranking, or index shape changes. */
export const CORE_SPIRIT_COPILOT_KNOWLEDGE_REVISION = '1.0.0';
export const CORE_SPIRIT_COPILOT_KNOWLEDGE_VERSION =
  'corespirit-knowledge-v' + CORE_SPIRIT_COPILOT_KNOWLEDGE_REVISION + ':' + CORE_SCRIPT_LANGUAGE_VERSION + ':' + CORE_SPIRIT_COMPILER_VERSION + ':' + CORE_SPIRIT_RUNTIME_VERSION;

export type CoreSpiritCopilotKnowledgeHit = Readonly<{
  id: string;
  title: string;
  body: string;
  category: string;
  sourcePath: string;
  knowledgeVersion: string;
  kind: 'standard-library' | 'namespace' | 'temporal-safety' | 'compiler-contract' | 'model-lifecycle' | 'ai-runtime';
  score: number;
}>;

type KnowledgeDocument = Omit<CoreSpiritCopilotKnowledgeHit, 'knowledgeVersion' | 'score'> & {
  keywords: readonly string[];
};

const SAFETY_DOCS: readonly KnowledgeDocument[] = [
  {
    id: 'temporal-lookahead',
    title: 'Lookahead and causal values',
    body: 'CoreScript time-dependent values must retain their provenance and availability boundary. Future-dependent, developing, confirmed, realtime and forecast values are not interchangeable. Do not use future bars or future labels as features at the decision timestamp. Inspect compiler temporal-safety diagnostics and the researchSafety manifest; a missing proof is unknown, not a pass.',
    category: 'temporal safety',
    sourcePath: 'docs/CORESCRIPT_LANGUAGE_SPEC_V1.md',
    kind: 'temporal-safety',
    keywords: ['lookahead','future','causal','causality','availability','timestamp','forecast','developing','confirmed','leakage','decision time'],
  },
  {
    id: 'repainting-and-revisions',
    title: 'Repainting, confirmation and historical corrections',
    body: 'Treat realtime/developing inputs separately from confirmed historical values. Multi-timeframe data can update before its interval closes, and historical candle corrections must invalidate dependent outputs through the dependency graph. Never label a script non-repainting from naming or model output alone; use compiler diagnostics, temporal metadata and a replay against the exact dataset fingerprint.',
    category: 'temporal safety',
    sourcePath: 'docs/CORESCRIPT_LANGUAGE_SPEC_V1.md',
    kind: 'temporal-safety',
    keywords: ['repainting','repaint','higher timeframe','multi timeframe','developing','confirmation','replay','correction','realtime'],
  },
  {
    id: 'lookback-and-warmup',
    title: 'Lookback and warm-up analysis',
    body: 'Rolling series operations require enough prior observations before their values become meaningful. Derive warm-up from the source and compiled dependency/lookback metadata, not from a guessed fixed candle count. Keep lookbacks bounded; check the actual compiled maximum lookback and inspect which source expressions drive it.',
    category: 'performance and temporal safety',
    sourcePath: 'src/services/coreSpirit/standardLibrary.ts',
    kind: 'compiler-contract',
    keywords: ['lookback','warmup','warm-up','window','history','rolling','ema','sma','atr','bars','startup'],
  },
  {
    id: 'execution-complexity',
    title: 'Execution complexity and safe optimization',
    body: 'Prefer bounded lookbacks, reuse common series calculations and avoid repeated expensive rolling work. Standard-library metadata distinguishes pure calls from stateful calls and describes series execution strategies where known. Optimizations must preserve signal outputs, causal semantics and observable side effects; validate on the same bars and compare outputs before adopting a change.',
    category: 'performance',
    sourcePath: 'src/services/coreSpirit/standardLibrary.ts',
    kind: 'compiler-contract',
    keywords: ['complexity','performance','optimization','optimize','vectorizable','fusible','stateful','pure','rolling','execution','cost'],
  },
  {
    id: 'typed-quant-and-dataset-lineage',
    title: 'Typed research models, datasets and provenance',
    body: 'The research lifecycle binds source, compiler/runtime versions, feature graph, immutable dataset version, training range, validation range, safety checks and training parameters to a model artifact. Training rows require causal feature availability, label-leakage checks and chronological holdout separation with purging/embargo where required. Recompile if the feature schema or source safety manifest changes.',
    category: 'research and models',
    sourcePath: 'docs/corespirit-model-artifacts-and-provenance.md',
    kind: 'model-lifecycle',
    keywords: ['model','dataset','training','feature','schema','provenance','holdout','validation','purge','embargo','leakage','immutable','artifact','prediction'],
  },
  {
    id: 'out-of-sample-economics',
    title: 'Evaluate model usefulness beyond prediction accuracy',
    body: 'Predictive confidence alone does not establish tradable value. Separate fit/training and out-of-sample periods; evaluate economic results with realistic transaction costs, turnover, drawdown, stability and the exact decision timing whenever an evaluation backend provides those metrics. Do not present unimplemented metrics as measured evidence.',
    category: 'research evaluation',
    sourcePath: 'docs/corespirit-model-artifacts-and-provenance.md',
    kind: 'model-lifecycle',
    keywords: ['out of sample','oos','accuracy','turnover','transaction cost','slippage','drawdown','stability','economics','pnl','evaluation'],
  },
  {
    id: 'feature-quality-and-drift',
    title: 'Monitor model feature quality and distribution drift',
    body: 'The read-only monitor in src/services/coreSpirit/modelDrift.ts pins a report to model-artifact and feature-schema SHA-256 hashes, learns PSI histogram edges from the confirmed historical baseline only, excludes developing, forecast and unconfirmed observations from the observed drift sample, and reports missing/non-finite values. Too-small samples return insufficient-evidence, not healthy. The monitor does not train or promote models, and it is not a live alerting scheduler; do not claim that drift is monitored in production until telemetry ingestion, durable history and alert delivery are wired.',
    category: 'model monitoring and safety',
    sourcePath: 'src/services/coreSpirit/modelDrift.ts',
    kind: 'model-lifecycle',
    keywords: ['drift','feature quality','PSI','population stability index','missing values','non-finite','distribution','monitoring','model monitoring','insufficient evidence','schema hash','baseline'],
  },
  {
    id: 'ai-draft-and-apply',
    title: 'AI-generated source is an untrusted draft',
    body: 'Copilot output is a draft, not executable authority. Review the structured diff, inputs, tests, diagnostics, required capabilities and the provenance fingerprint. Applying a candidate is explicit and can be blocked if the editor version or chart context changed. Compilation, executable-artifact integrity, sandbox capability validation and read-only replay are independent gates.',
    category: 'AI-assisted coding',
    sourcePath: 'src/server/routes/coreSpirit-copilot.routes.ts',
    kind: 'ai-runtime',
    keywords: ['copilot','ai','draft','diff','patch','apply','compiler','sandbox','capability','artifact','fingerprint','tests','replay'],
  },
  {
    id: 'async-ai-invocation',
    title: 'Asynchronous ai.invoke boundary',
    body: 'ai.invoke is a server automation capability, not a synchronous chart primitive. Remote work is submitted to a background job and uses bounded prompt/context/output sizes, per-user request budgets, a concurrency lease, provider timeout, model-versioned content fingerprint and a short-lived cache. Results are inert advisory text labelled ready, unavailable or stale. The helper API is asynchronous; a native ai.request expression/poll binding in CoreScript is not yet implemented. Historical backtests must not call a live remote model.',
    category: 'AI runtime and safety',
    sourcePath: 'src/services/coreSpirit/aiInvocation.ts',
    kind: 'ai-runtime',
    keywords: ['ai.invoke','ai','async','asynchronous','remote','network','queue','background','timeout','budget','concurrency','cache','stale','unavailable','backtest','hot path','candle'],
  },
  {
    id: 'host-owned-order-routing',
    title: 'Risk gates and broker routing are host-owned',
    body: 'The CoreSpirit sandbox intentionally does not expose raw network, filesystem, arbitrary process, broker credentials or direct account mutation. AI responses never produce authorized order actions. Order intents must pass the platform execution/risk/policy path, and every capability is rederived and checked by compiler and host sandbox rather than trusted from client JSON or model-generated text.',
    category: 'execution safety',
    sourcePath: 'src/services/coreSpirit/capabilitySandbox.ts',
    kind: 'ai-runtime',
    keywords: ['risk','broker','orders','order intent','route','host','capability','execution','credentials','sandbox','direct account mutation','security'],
  },
];

function tokenize(value: string): string[] {
  const identifiers = value.toLowerCase().normalize('NFKC').match(/[a-z0-9_.-]+/g) ?? [];
  // Search both canonical qualified identifiers (for example, ai.invoke) and their
  // human-friendly components (ai, invoke) so prose and symbol names cross-match.
  return identifiers.flatMap(token => [token, ...token.split(/[._-]+/).filter(Boolean)]);
}

function scoreDocument(queryTokens: readonly string[], document: KnowledgeDocument): number {
  const title = tokenize(document.title);
  const body = tokenize(document.body);
  const keywords = document.keywords.flatMap(tokenize);
  const id = tokenize(document.id);
  let score = 0;
  for (const queryToken of queryTokens) {
    if (title.includes(queryToken)) score += 8;
    if (id.includes(queryToken)) score += 5;
    if (keywords.includes(queryToken)) score += 4;
    if (body.includes(queryToken)) score += 1;
    if (title.some(token => token.startsWith(queryToken) && token !== queryToken)) score += 2;
  }
  return score;
}

function buildIndex(): KnowledgeDocument[] {
  const docs: KnowledgeDocument[] = [...SAFETY_DOCS];
  for (const builtin of CORE_SPIRIT_BUILTINS.values()) {
    docs.push({
      id: 'builtin:' + builtin.name,
      title: builtin.name + '() standard-library function',
      body: [
        'Canonical CoreSpirit standard-library builtin.',
        'Name: ' + builtin.name + '.',
        'Arguments: minimum ' + builtin.minArgs + (builtin.maxArgs === undefined ? '; no declared maximum.' : ', maximum ' + builtin.maxArgs + '.'),
        'Return type: ' + builtin.returnType + '.',
        'Category: ' + builtin.category + '.',
        'Purity metadata: ' + (builtin.pure ? 'pure' : 'stateful or effectful') + '.',
        builtin.seriesExecution ? 'Series execution: ' + builtin.seriesExecution.strategy +
          '; vectorizable=' + builtin.seriesExecution.vectorizable + '; fusible=' + builtin.seriesExecution.fusible + '.' : '',
        builtin.temporalSafety ? 'Temporal metadata: causality=' + builtin.temporalSafety.causality +
          '; lookahead=' + builtin.temporalSafety.lookahead + '; realtimeSafe=' + builtin.temporalSafety.realtimeSafe + '.' : '',
        'Capability: ' + (builtin.capability ?? 'none declared') + '.',
      ].filter(Boolean).join(' '),
      category: builtin.category,
      sourcePath: 'src/services/coreSpirit/standardLibrary.ts',
      kind: 'standard-library',
      keywords: [builtin.name, builtin.category, builtin.returnType, builtin.capability ?? '', ...(builtin.seriesExecution ? [builtin.seriesExecution.strategy] : [])],
    });
  }
  for (const entry of CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES) {
    docs.push({
      id: 'namespace:' + entry.qualifiedName,
      title: entry.qualifiedName,
      body: entry.description + ' Status: ' + entry.status +
        (entry.canonicalBuiltin ? '. Canonical builtin: ' + entry.canonicalBuiltin + '.' : '') +
        (entry.componentId ? '. Component id: ' + entry.componentId + '.' : ''),
      category: entry.namespace,
      sourcePath: 'src/services/coreSpirit/standardLibraryNamespaces.ts',
      kind: 'namespace',
      keywords: [entry.member, entry.namespace, entry.qualifiedName, entry.status, entry.description],
    });
  }
  return docs;
}

const KNOWLEDGE_INDEX = buildIndex();

/** A versioned search over the canonical builtin/namespace registries and safety contracts. */
export function searchCoreSpiritCopilotKnowledge(query: string, limit = 8): readonly CoreSpiritCopilotKnowledgeHit[] {
  const normalizedQuery = String(query ?? '').slice(0, 500).trim();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(12, Math.trunc(limit))) : 8;
  const queryTokens = tokenize(normalizedQuery);
  const results = KNOWLEDGE_INDEX.map(document => ({
    document,
    score: normalizedQuery ? scoreDocument(queryTokens, document) : 0,
  })).filter(item => !normalizedQuery || item.score > 0)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
    .slice(0, safeLimit)
    .map(({ document, score }) => Object.freeze({
      id: document.id,
      title: document.title,
      body: document.body,
      category: document.category,
      sourcePath: document.sourcePath,
      knowledgeVersion: CORE_SPIRIT_COPILOT_KNOWLEDGE_VERSION,
      kind: document.kind,
      score,
    }));
  return Object.freeze(results);
}
