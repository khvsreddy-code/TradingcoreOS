import type { LineStyle } from '../../../core/model/series';
import { chartTypes, settingsRowValueKeys, type SettingsRowDescriptor } from '../../../chart-types/registry';
import { withAlpha } from '../../../core/color';
import { ACCENT, BEARISH, BULLISH, CHIP_PLATE, CROSSHAIR, SERIES_LINE, WARNING } from '../../../core/palette';
import type { PriceStyle } from '../../../core/options';
import type { ScaleMode } from './SceneGraph';

/**
 * Comprehensive, **serializable** native-renderer style/config (item 15).
 *
 * Two shapes live here:
 *  - `ChartStyle` â€” the renderer's LIVE store of the granular cosmetic knobs that
 *    were previously hard-coded or theme-derived (grid colors, crosshair, candle
 *    border/wick, fonts, separators). A `null` color means "inherit from the theme".
 *  - `ChartConfig` â€” the FLAT, versioned JSON the user persists / templates with.
 *    It aggregates the theme cosmetics + the scene's display flags + `ChartStyle`
 *    into one self-contained document (`getConfig()` resolves every inherited value
 *    to a concrete one so an exported template stands alone).
 *
 * `mergeConfig` is the single validating reducer: it deep-merges an untrusted
 * partial config onto a known-good base, dropping any malformed field. This keeps
 * `applyConfig(json)` total â€” it never throws on bad input and never half-applies.
 */
export const CHART_CONFIG_VERSION = 1;

/**
 * Baseline style defaults â€” the baseline chart type owns its palette and does NOT
 * f¶»§q«^