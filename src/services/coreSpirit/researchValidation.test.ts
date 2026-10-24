import { CoreSpiritParser } from './parser.ts';
import { analyzeCoreSpiritCausality } from './causalityAnalysis.ts';
import { analyzeCoreSpiritRepaintSafety } from './repaintSafety.ts';
import {
  assertNoKnownLabelLeakage,
  splitChronologicalResearchRows,
  summarizeResearchSafety,
  validateConfirmedResearchRows,
  type ResearchFeatureRow,
} from './researchValidation.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function rejects(operation: () => unknown, message: string): void {
  let rejected = false;
  try { operation(); } catch { rejected = true; }
  assert(rejected, message);
}

const featureNames = ['returns', 'volatility'];
const start = Date.UTC(2025, 0, 1);
const rows: ResearchFeatureRow[] = Array.from({ length: 80 }, (_, index) => {
  const timestamp = start + index * 300_000;
  return {
    timestamp,
    availableAt: timestamp,
    confirmed: true,
    phase: 'historical',
    values: [Math.sin(index / 7), Math.abs(Math.cos(index / 11))],
  };
});

const confirmed = validateConfirmedResearchRows(rows, featureNames);
assert(confirmed.length === rows.length, 'confirmed historical rows must pass validation');
assert(confirmed.every((row, index) => row.values !== rows[index]!.values), 'feature vectors must be copied across the validation boundary');
assert(confirmed.every(row => Object.isFrozen(row) && Object.isFrozen(row.values)),
  'validated research rows and feature vectors must be immutable before hashing, queuing, and training');

rejects(() => validateConfirmedResearchRows(
  rows.map((row, index) => index === 5 ? { ...row, confirmed: false } : row),
  featureNames,
), 'unconfirmed/forming candles must not enter model training');
rejects(() => validateConfirmedResearchRows(
  rows.map((row, index) => index === 5 ? { ...row, phase: 'developing' as const } : row),
  featureNames,
), 'developing candles must not enter historical training');
rejects(() => validateConfirmedResearchRows(
  rows.map((row, index) => index === 5 ? { ...row, availableAt: row.timestamp + 1 } : row),
  featureNames,
), 'features becoming available after the decision timestamp must be rejected');
rejects(() => validateConfirmedResearchRows(
  rows.map((row, index) => index === 5 ? { ...row, label: 1 } as ResearchFeatureRow : row),
  featureNames,
), 'rows containing hidden labels/extra metadata must be rejected instead of silently hashed');
rejects(() => validateConfirmedResearchRows(
  rows.map((row, index) => index === 5 ? { ...row, timestamp: rows[4]!.timestamp } : row),
  featureNames,
), 'duplicate decision timestamps must be rejected');
rejects(() => validateConfirmedResearchRows(
  [...rows].reverse(), featureNames,
), 'randomly shuffled or reverse-ordered time series must be rejected');
rejects(() => assertNoKnownLabelLeakage(['returns', 'next_bar_return']),
  'a target built from the next bar must not be treated as an input feature');
rejects(() => assertNoKnownLabelLeakage(['close', 'realized_outcome']),
  'realized outcomes must remain separate from inference features');
rejects(() => assertNoKnownLabelLeakage(['returns', 'nextBarReturn']),
  'camelCase future-return features must not bypass the target/label leakage guard');
rejects(() => assertNoKnownLabelLeakage(['close', 'realizedOutcome']),
  'camelCase realized-outcome features must remain separate from inference inputs');
rejects(() => assertNoKnownLabelLeakage(['futureClose']),
  'camelCase future-price features must be rejected as potential lookahead leakage');

const split = splitChronologicalResearchRows(confirmed, 0.2, 48, 12);
assert(split.trainingRows.length === 64, 'the 80/20 split must train on the first 64 observations');
assert(split.validationRows.length === 16, 'the latest 16 observations must be reserved for holdout validation');
assert(split.trainingRows.at(-1)!.timestamp < split.validationRows[0]!.timestamp,
  'validation begins strictly after the final training observation');
assert(split.trainingRange.to === new Date(split.trainingRows.at(-1)!.timestamp).toISOString(),
  'training provenance must record the last timestamp actually used to fit');
assert(split.validationRange.from === new Date(split.validationRows[0]!.timestamp).toISOString(),
  'validation provenance must record the first held-out decision timestamp');
rejects(() => splitChronologicalResearchRows(confirmed.slice(0, 40), 0.2, 24, 12),
  'a too-small validation tail must fail instead of reporting in-sample metrics');

const largeRows: ResearchFeatureRow[] = Array.from({ length: 6_000 }, (_, index) => {
  const timestamp = start + index * 300_000;
  return {
    timestamp,
    availableAt: timestamp,
    confirmed: true,
    phase: 'historical',
    values: [Math.sin(index / 7), Math.abs(Math.cos(index / 11))],
  };
});
rejects(() => validateConfirmedResearchRows(largeRows, featureNames),
  'interactive validation defaults must remain capped separately from batch datasets');
const validatedLargeRows = validateConfirmedResearchRows(largeRows, featureNames, { maxRows: 6_000 });
assert(validatedLargeRows.length === 6_000, 'bounded batch validation must support a dataset larger than the former 5,000-row ceiling');
const purgedLargeSplit = splitChronologicalResearchRows(validatedLargeRows, 0.2, 48, 12, {
  maxRows: 6_000, purgeBars: 12, embargoBars: 8,
});
assert(purgedLargeSplit.purgedCount === 12 && purgedLargeSplit.embargoedCount === 8 &&
  purgedLargeSplit.validationProtocol === 'purged-chronological-v1',
  'large datasets must separately account for purged and embargoed boundary rows');
assert(purgedLargeSplit.trainingRows.at(-1)!.timestamp < purgedLargeSplit.validationRows[0]!.timestamp,
  'large research splits must remain strictly chronological');
assert(purgedLargeSplit.trainingRows.length + purgedLargeSplit.purgedCount +
  purgedLargeSplit.embargoedCount + purgedLargeSplit.validationRows.length === 6_000,
  'all dataset rows must be accounted for as training, purged, embargoed or validation');

const futureAst = new CoreSpiritParser('let leaked = close[-1]\nplot(leaked)').parse();
const futureCausality = analyzeCoreSpiritCausality(futureAst);
const futureSafety = analyzeCoreSpiritRepaintSafety(futureAst);
const futureSummary = summarizeResearchSafety(futureCausality, futureSafety);
assert(!futureSummary.approvalEligible && futureSummary.blockers.length > 0,
  'future-bar access must block production model approval');

const developingAst = new CoreSpiritParser('let higher = timeframe("15m").developing()\nplot(higher.close)').parse();
const developingSummary = summarizeResearchSafety(
  analyzeCoreSpiritCausality(developingAst),
  analyzeCoreSpiritRepaintSafety(developingAst),
);
assert(!developingSummary.approvalEligible,
  'developing higher-timeframe values must not qualify for production approval');

const confirmedAst = new CoreSpiritParser('let higher = request("NSE:NIFTY50-INDEX","15m","close",0,"confirmed")\nplot(higher)').parse();
const confirmedCausality = analyzeCoreSpiritCausality(confirmedAst);
assert(!confirmedCausality.diagnostics.some(d => d.code === 'CAUSALITY_UNQUALIFIED_REQUEST'),
  'an explicitly confirmed higher-timeframe request satisfies the alignment contract');

const safeSummary = summarizeResearchSafety(
  { diagnostics: [] },
  {
    causality: 'causal',
    lookahead: 'false',
    realtimeSafe: true,
    backtestLiveEquivalent: true,
    warnings: [],
    errors: [],
  },
);
assert(safeSummary.approvalEligible && safeSummary.blockers.length === 0,
  'only fully proven source-safety reports may be eligible for production approval');

console.log('CORESPIRIT_RESEARCH_TEMPORAL_VALIDATION_OK');
