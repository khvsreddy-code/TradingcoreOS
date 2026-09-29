import type { CoreSpiritComponentContract } from './coreSpiritExecutionModel';

export type CoreSpiritPackageManifest = Readonly<{
  version: 1;
  id: string;
  name: string;
  packageVersion: string;
  languageVersion: number;
  components: readonly string[];
  dependencies: readonly string[];
  capabilities: readonly string[];
  checksum: string;
}>;

function comparePackageVersions(a: string, b: string): number {
  const pa = a.split('.').map(part => Number.parseInt(part.replace(/^[^0-9]*/, ''), 10) || 0);
  const pb = b.split('.').map(part => Number.parseInt(part.replace(/^[^0-9]*/, ''), 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const delta = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (delta) return delta;
  }
  return a.localeCompare(b);
}

export type CoreSpiritPackage = Readonly<{
  manifest: CoreSpiritPackageManifest;
  components: readonly CoreSpiritComponentContract[];
}>;

export function validateCoreSpiritPackage(pkg: CoreSpiritPackage): string[] {
  const errors:string[] = [];
  if (pkg.manifest.version !== 1) errors.push('unsupported package manifest version');
  if (!pkg.manifest.id || !pkg.manifest.name || !pkg.manifest.packageVersion) errors.push('package identity is incomplete');
  if (!Number.isInteger(pkg.manifest.languageVersion) || pkg.manifest.languageVersion < 1) errors.push('invalid languageVersion');
  const componentIds = new Set(pkg.components.map(component => component.id));
  for (const id of pkg.manifest.components) if (!componentIds.has(id)) errors.push(`manifest component '${id}' is missing`);
  if (new Set(pkg.manifest.dependencies).size !== pkg.manifest.dependencies.length) errors.push('package dependencies must be unique');
  return errors;
}

export class CoreSpiritPackageRegistry {
  private readonly packages = new Map<string, CoreSpiritPackage>();
  register(pkg: CoreSpiritPackage): void {
    const errors = validateCoreSpiritPackage(pkg);
    if (errors.length) throw new Error(errors.join('; '));
    this.packages.set(`${pkg.manifest.id}@${pkg.manifest.packageVersion}`, pkg);
  }
  get(id:string, version?:string): CoreSpiritPackage | undefined {
    if (version) return this.packages.get(`${id}@${version}`);
    const matches = [...this.packages.values()].filter(pkg => pkg.manifest.id === id);
    return matches.sort((a, b) => comparePackageVersions(a.manifest.packageVersion, b.manifest.packageVersion)).at(-1);
  }
  list(): readonly CoreSpiritPackageManifest[] { return Object.freeze([...this.packages.values()].map(pkg => pkg.manifest)); }
  clear():void { this.packages.clear(); }
}

export const coreSpiritPackageRegistry = new CoreSpiritPackageRegistry();
