import { msg, withValues } from '../../../core/i18n/message';
import { sourceText, textOf } from '../../../core/i18n/text';
import type { MessageArgs, MessageLike, Translator } from '../../../core/i18n/types';
import { PRICE_STYLE_UNAVAILABLE, priceStyleMessage } from '../../../chart-types/labels';
import type { VelaTheme, ThemeId } from '../../../core/options';
import { registeredThemes } from '../../../core/theme';
import type { ChartConfig } from '../core/chartConfig';
import type { OHLCV } from '../../../core/model/ohlcv';
import {
    chartType,
    chartTypes,
    normalizeSettingsRow,
    settingsRowValueKeys,
    settingsRowVisible,
    type ChartTypeSettingsInstance,
    type ChartTypeSettingsSection,
    type SettingsInlineControl,
    type SettingsRowDescriptor,
    type SettingsRowWhen,
    type SettingsSelectOption,
    type SettingsValueRow,
} from '../../../chart-types/registry';
import { iconAt } from '../../../core/icons';
import { normalizeTimezone, TIMEZONES, tzMenuLabel } from '../../../core/timezones';
import { closeOpenPopovers } from '@luxalgo/vela-ui/popover';
import { closeWidthPopover } from '@luxalgo/vela-ui/glyph-select';
import { Dialog } from '@luxalgo/vela-ui/dialog';
import { overlayScrollbarCss } from '@luxalgo/vela-ui/styles';
import {
    fieldGrid,
    fieldRow,
    fieldSection,
    fieldSeparator,
    buildFieldControl,
} from '@luxalgo/vela-ui/field';
import { priceStyleIds, hasOwnCandlePaint } from '../core/chartConfig';
import { chrome¶»§q«^