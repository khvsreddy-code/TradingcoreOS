import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync('.github/workflows/ml-train.yml', 'utf8');
const trainer = readFileSync('ml/app/train_all.py', 'utf8');
const input = readFileSync('ml/training_input.py', 'utf8');
const artifacts = readFileSync('ml/validate_artifacts.py', 'utf8');
const requirements = readFileSync('ml/requirements.txt', 'utf8');

assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read/m);
assert.doesNotMatch(workflow, /contents:\s*write|git\s+push|git\s+commit/i);
assert.doesNotMatch(workflow, /run:[^\n]*\$\{\{\s*inputs\.(?:csv_url|symbol|timeframe|horizon)/i,
  'dispatch inputs must not be interpolated into shell source');
assert.match(workflow, /CSV_URL:\s*\$\{\{\s*inputs\.csv_url\s*\}\}/);
assert.match(workflow, /--url "\$CSV_URL"/);
assert.match(workflow, /MODEL_ROOT:\s*\$\{\{\s*runner\.temp\s*\}\}/);
assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
assert.match(workflow, /actions\/setup-python@[a-f0-9]{40}/);
assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
assert.match(workflow, /if-no-files-found:\s*error/);
assert.match(input, /class _AllowlistedRedirectHandler/);
assert.match(input, /validate_download_url\(newurl\)/);
assert.match(input, /response\.geturl\(\)/);
assert.match(input, /strictly increasing with no duplicates/);
assert.match(input, /MAX_CSV_BYTES/);
assert.match(input, /SYMBOL_RE/);
assert.match(input, /TIMEFRAME_RE/);
assert.match(trainer, /validate_training_identity/);
assert.match(trainer, /validate_training_csv/);
assert.match(artifacts, /releaseStatus.*candidate/);
assert.match(artifacts, /liveTradingEligible.*False/);
assert.match(artifacts, /promotionRequiresReview.*True/);
assert.match(artifacts, /hashlib\.sha256/);
for (const line of requirements.split(/\r?\n/).filter(s => s.trim() && !s.trim().startsWith('#'))) {
  assert.match(line, /^[A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.-]+\])?==[0-9][A-Za-z0-9.!+_-]*$/,
    'each top-level ML dependency must be pinned: ' + line);
}
console.log('TRADINGCOREOS_ML_TRAINING_INPUT_SECURITY_OK');
