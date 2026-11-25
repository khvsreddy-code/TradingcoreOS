#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function readJson(path, description) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error('Unable to read ' + description + ' at ' + path + ': ' + message);
  }
}

function dependencyScope(name, vulnerability, lockfile) {
  const root = lockfile.packages[''];
  const productionRoots = new Set([
    ...Object.keys(root.dependencies || {}),
    ...Object.keys(root.optionalDependencies || {}),
  ]);
  const developmentRoots = new Set(Object.keys(root.devDependencies || {}));
  const isProductionRoot = productionRoots.has(name);
  const isDevelopmentRoot = developmentRoots.has(name);
  if (isProductionRoot && isDevelopmentRoot) return 'production + development';
  if (isProductionRoot) return 'production';
  if (isDevelopmentRoot) return 'development';

  const scopes = new Set();
  for (const node of vulnerability.nodes || []) {
    const entry = lockfile.packages[node];
    if (!entry) continue;
    scopes.add(entry.dev === true ? 'development' : 'production');
  }
  if (scopes.size > 1) return 'production + development';
  if (scopes.size === 1) return [...scopes][0];
  return 'unknown (lockfile path not resolved)';
}

function advisorySummary(via) {
  return (via || []).map(item => {
    if (typeof item === 'string') return { dependency: item };
    return {
      title: item.title || item.name || 'Unnamed advisory',
      source: item.source || null,
      severity: item.severity || null,
      range: item.range || null,
      url: item.url || null,
    };
  });
}

export function summarizeDependencyAudit(report, lockfile) {
  if (!report || !Number.isInteger(report.auditReportVersion) ||
      !report.metadata || !report.metadata.vulnerabilities ||
      !report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    throw new Error('npm audit output is incomplete or is an error response; refusing to treat it as a clean audit.');
  }
  if (!lockfile || !lockfile.packages || !lockfile.packages['']) {
    throw new Error('package-lock.json does not expose the expected npm lockfile package graph.');
  }

  const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4, unknown: 5 };
  const findings = Object.entries(report.vulnerabilities).map(([name, vulnerability]) => ({
    name,
    severity: String(vulnerability.severity || 'unknown').toLowerCase(),
    directness: vulnerability.isDirect === true ? 'direct' : 'transitive',
    scope: dependencyScope(name, vulnerability, lockfile),
    affectedRange: vulnerability.range || null,
    installedPaths: [...new Set(vulnerability.nodes || [])].sort(),
    effects: [...new Set(vulnerability.effects || [])].sort(),
    advisories: advisorySummary(vulnerability.via),
    fixAvailable: vulnerability.fixAvailable === undefined ? null : vulnerability.fixAvailable,
  })).sort((a, b) =>
    (severityOrder[a.severity] === undefined ? 5 : severityOrder[a.severity]) -
    (severityOrder[b.severity] === undefined ? 5 : severityOrder[b.severity]) ||
    a.name.localeCompare(b.name)
  );

  const counts = report.metadata.vulnerabilities;
  const total = Number(counts.total === undefined ? findings.length : counts.total);
  const blockers = findings.filter(item => item.severity === 'critical' || item.severity === 'high');
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    auditReportVersion: report.auditReportVersion,
    totals: {
      info: Number(counts.info || 0),
      low: Number(counts.low || 0),
      moderate: Number(counts.moderate || 0),
      high: Number(counts.high || 0),
      critical: Number(counts.critical || 0),
      total,
      packageFindings: findings.length,
    },
    releaseGate: {
      policy: 'block critical and high npm advisories; retain every severity in the report for remediation triage',
      blockers: blockers.map(item => ({
        name: item.name,
        severity: item.severity,
        directness: item.directness,
        scope: item.scope,
      })),
      passed: blockers.length === 0,
    },
    findings,
  };
}

async function main() {
  const auditPath = process.argv[2] || 'npm-audit.json';
  const lockPath = process.argv[3] || 'package-lock.json';
  const summary = summarizeDependencyAudit(
    readJson(auditPath, 'npm audit report'),
    readJson(lockPath, 'npm lockfile'),
  );
  const outputPath = process.env.DEPENDENCY_AUDIT_SUMMARY || 'dependency-audit-summary.json';
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log('[security] npm audit found ' + summary.totals.total + ' vulnerable package(s) across ' +
    summary.totals.packageFindings + ' package findings; critical=' + summary.totals.critical +
    ', high=' + summary.totals.high + ', moderate=' + summary.totals.moderate + ', low=' + summary.totals.low);
  for (const finding of summary.findings) {
    console.log('[security] ' + finding.severity.toUpperCase() + ' ' + finding.name + ' (' +
      finding.directness + ', ' + finding.scope + ') range=' + (finding.affectedRange || 'unknown') +
      ' paths=' + (finding.installedPaths.join(', ') || 'unresolved'));
  }
  if (!summary.releaseGate.passed) {
    console.error('[security] release blocked by ' + summary.releaseGate.blockers.length +
      ' critical/high advisory package finding(s).');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
