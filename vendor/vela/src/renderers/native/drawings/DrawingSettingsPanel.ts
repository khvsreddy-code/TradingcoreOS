import type { VelaTheme } from '../../../core/options';
import { msg } from '../../../core/i18n/message';
import { textOf } from '../../../core/i18n/text';
import type { MessageLike, Translator } from '../../../core/i18n/types';
import type { Drawing, DrawingToolDefaults, DrawingToolTemplate, SerializedDrawing, SettingsField } from '../../../core/drawings';
import {
    DEFAULT_DRAWING_COLOR,
    FIB_PRESETS,
    FibLevels,
    FibRetracement,
    FixedRangeVolumeProfile,
    MachFigure,
    LINE_STYLE_OPTIONS,
    PositionTool,
    TEXT_SIZE_OPTIONS,
    TIMEFRAME_BANDS,
    builtinToolTemplates,
    clonePlain,
    effectiveFillColor,
    getDrawingType,
    magnifierTimeframesBelow,
    matchFibPreset,
    timeframeBandOf,
} from '../../../core/drawings';
import { applyChromeTokens } from '../../shared/theme-tokens';
import { Dialog } from '@luxalgo/vela-ui/dialog';
import { createButton } from '@luxalgo/vela-ui/button';
import { Popover, closeOpenPopovers } from '@luxalgo/vela-ui/popover';
import { buildFieldControl, fieldGrid } from '@luxalgo/vela-ui/field';
import { TextArea } from '@luxalgo/vela-ui/text-area';
import { formatTimeStamp, valueDecimals } from '../chrome/ticks';
import { buildPositionSection, buildProfileSection } from './DrawingSettingsSections';
import type { PopupAnchor, SettingsActions, SettingsPatch } from './DrawingSettingsPopup';
import { withKitTranslator } from '@luxalgo/vela-ui/kit-text';
import { css } from '@luxalgo/vela-ui/css';
import { dispo¶»§q«^