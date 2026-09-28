export const CORE_SPIRIT_LOCAL_STORAGE_SCHEMA_VERSION = 1 as const;

const PREFIX = 'tradingcore:corespirit';

export function versionedStorageKey(name: string): string {
  return `${PREFIX}:v${CORE_SPIRIT_LOCAL_STORAGE_SCHEMA_VERSION}:${name}`;
}

export function readVersionedJson<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(versionedStorageKey(name));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeVersionedJson<T>(name: string, value: T): void {
  try { localStorage.setItem(versionedStorageKey(name), JSON.stringify(value)); } catch { /* quota/security boundary */ }
}
