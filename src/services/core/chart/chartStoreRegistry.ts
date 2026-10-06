import { ChartStore } from './ChartStore';

type Entry = {
  store: ChartStore;
  consumers: number;
};

const registry = new Map<string, Entry>();

export function acquireChartStore(key: string): ChartStore {
  let entry = registry.get(key);
  if (!entry) {
    entry = { store: new ChartStore(), consumers: 0 };
    registry.set(key, entry);
  }
  entry.consumers += 1;
  return entry.store;
}

export function releaseChartStore(key: string): void {
  const entry = registry.get(key);
  if (!entry) return;
  entry.consumers = Math.max(0, entry.consumers - 1);
  if (entry.consumers > 0) return;
  entry.store.dispose();
  registry.delete(key);
}

export function getChartStore(key: string): ChartStore | undefined {
  return registry.get(key)?.store;
}

export function chartStoreRegistrySize(): number {
  return registry.size;
}

export function clearChartStoreRegistry(): void {
  for (const entry of registry.values()) entry.store.dispose();
  registry.clear();
}
