#!/usr/bin/env node
/**
 * Safely delete explicitly named, unreferenced Vercel Container Registry manifests.
 *
 * This is deliberately manual-dispatch only. It never deletes all old images
 * automatically: deployments may still need previous images for rollback.
 */
import { spawnSync } from 'node:child_process';

const image = process.env.VCR_IMAGE_REPOSITORY || '';
const requestedTags = (process.env.VCR_DELETE_TAGS || '').split(',').map(s => s.trim()).filter(Boolean);
const keepTags = new Set((process.env.VCR_KEEP_TAGS || '').split(',').map(s => s.trim()).filter(Boolean));
const confirmation = process.env.VCR_CONFIRMATION || '';
const expectedConfirmation = 'DELETE-UNUSED-IMAGES';

function fail(message) {
  console.error(`VCR cleanup stopped: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) fail(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || 'unknown error').trim()}`);
  }
  return result.stdout.trim();
}

if (!/^vcr\.vercel\.com\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9_-]+$/.test(image)) {
  fail('VCR_IMAGE_REPOSITORY is missing or is not a valid Vercel registry repository path.');
}
if (confirmation !== expectedConfirmation) fail(`set the confirmation input to exactly ${expectedConfirmation}.`);
if (!requestedTags.length) fail('provide one or more exact comma-separated tags; wildcards are not accepted.');
if (requestedTags.some(tag => !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag))) {
  fail('one or more tags have invalid characters; only exact tag names are accepted.');
}
if (new Set(requestedTags).size !== requestedTags.length) fail('duplicate tags were provided.');

const currentCommit = run('git', ['rev-parse', 'HEAD']);
const protectedCommitTags = new Set([currentCommit, currentCommit.slice(0, 12), currentCommit.slice(0, 7)]);
for (const tag of requestedTags) {
  if (protectedCommitTags.has(tag)) fail(`refusing to delete the image tag for the current GitHub commit (${tag}).`);
  if (['latest', 'main', 'production'].includes(tag.toLowerCase())) fail(`refusing to delete the protected alias tag ${tag}.`);
  if (keepTags.has(tag)) fail(`tag ${tag} is also present in VCR_KEEP_TAGS.`);
}

const registryTags = run('crane', ['ls', image]).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const known = new Set(registryTags);
for (const tag of requestedTags) {
  if (!known.has(tag)) fail(`tag ${tag} does not exist in ${image}; nothing was deleted.`);
}
console.log(`Repository: ${image}`);
console.log(`Current Git commit: ${currentCommit}`);
console.log(`Found ${registryTags.length} tags. Requested exact tags: ${requestedTags.join(', ')}`);
console.log('Checking manifest digests and aliases before deletion.');

const digests = new Map();
function digestOf(tag) {
  if (!digests.has(tag)) digests.set(tag, run('crane', ['digest', `${image}:${tag}`]));
  return digests.get(tag);
}

for (const tag of requestedTags) {
  const digest = digestOf(tag);
  const aliases = registryTags.filter(other => other !== tag && digestOf(other) === digest);
  if (aliases.length) {
    fail(`refusing to delete ${tag} (${digest}); this manifest is also tagged as: ${aliases.join(', ')}. Remove aliases deliberately first, then rerun.`);
  }
}

for (const tag of requestedTags) {
  const digest = digestOf(tag);
  console.log(`Deleting ${tag} (${digest})`);
  run('crane', ['delete', `${image}@${digest}`]);
  const after = run('crane', ['ls', image]).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (after.includes(tag)) fail(`registry still lists tag ${tag} after deletion; verify VCR cleanup status in the Dashboard.`);
  console.log(`Deleted manifest for ${tag}`);
}
console.log('Requested VCR manifest cleanup completed. Shared layers may remain if another image still references them.');
