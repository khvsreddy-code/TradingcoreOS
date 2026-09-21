import type { CoreSpiritFootprint, CoreSpiritFootprintScene, CoreSpiritFootprintSceneRow } from './types';

/** Converts normalized footprint rows into renderer-ready intensity values. */
export function createFootprintScene(id: string, footprint: CoreSpiritFootprint): CoreSpiritFootprintScene {
  const rows = footprint.rows || [];
  const maxVolume = Math.max(1, ...rows.map(r => Number(r.totalVolume ?? r.buyVolume + r.sellVolume)));
  const maxAbsDelta = Math.max(1, ...rows.map(r => Math.abs(Number(r.delta ?? r.buyVolume - r.sellVolume))));
  const sceneRows: CoreSpiritFootprintSceneRow[] = rows.map(row => {
    const delta = Number(row.delta ?? row.buyVolume - row.sellVolume);
    const total = Number(row.totalVolume ?? row.buyVolume + row.sellVolume);
    return {
      ...row,
      intensity: Math.max(0, Math.min(1, total / maxVolume)),
      side: delta > 0 ? 'buy' : delta < 0 ? 'sell' : 'balanced',
    };
  });
  return { id, timestamp: footprint.timestamp, rows: sceneRows, poc: footprint.poc, vah: footprint.vah, val: footprint.val, maxVolume, maxAbsDelta };
}
