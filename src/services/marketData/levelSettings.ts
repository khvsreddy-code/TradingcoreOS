export type BreakoutConfirmation = 'Wick' | 'Close';
export type RetestConfirmation = 'Touch' | 'Close';
export type LevelStartMode = 'Confirmation' | 'Pivot';

export interface DynamicLevelSettings {
  enabled: boolean;
  pivotLength: number;
  lookbackPeriod: number;
  maxLevelsPerType: number;
  wickDominanceFilter: boolean;
  mergeNearbyLevels: boolean;
  mergeAtrMultiplier: number;
  breakoutConfirmation: BreakoutConfirmation;
  breakoutAtrBuffer: number;
  showBreakouts: boolean;
  showReversals: boolean;
  retestConfirmation: RetestConfirmation;
  showFailures: boolean;
  levelStartMode: LevelStartMode;
  displayAsZones: boolean;
  showLabels: boolean;
  eventMarkerSize: number;
}

export const DEFAULT_DYNAMIC_LEVEL_SETTINGS: DynamicLevelSettings = {
  enabled: false,
  pivotLength: 10,
  lookbackPeriod: 800,
  maxLevelsPerType: 30,
  wickDominanceFilter: false,
  mergeNearbyLevels: true,
  mergeAtrMultiplier: 0.5,
  breakoutConfirmation: 'Close',
  breakoutAtrBuffer: 0,
  showBreakouts: true,
  showReversals: true,
  retestConfirmation: 'Close',
  showFailures: true,
  levelStartMode: 'Confirmation',
  displayAsZones: false,
  showLabels: true,
  eventMarkerSize: 4,
};

const STORAGE_KEY = 'tradingcore:dynamic-level-settings:v1';

export function getDynamicLevelSettings(): DynamicLevelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DYNAMIC_LEVEL_SETTINGS };
    return { ...DEFAULT_DYNAMIC_LEVEL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DYNAMIC_LEVEL_SETTINGS };
  }
}

export function saveDynamicLevelSettings(value: DynamicLevelSettings) {
  const next = { ...DEFAULT_DYNAMIC_LEVEL_SETTINGS, ...value };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent('tradingcore:level-settings', { detail: next }));
}
