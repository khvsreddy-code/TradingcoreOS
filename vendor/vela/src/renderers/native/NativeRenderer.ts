import type {
    IChartRenderer,
    RendererCapabilities,
    IndicatorRenderHandle,
    CrosshairEvent,
    CrosshairOHLC,
    ClickEvent,
    AxisLongPressEvent,
    InputChangeEvent,
    VisibleRange,
    VisibleRangeOptions,
    WorkspacePaneScaleState,
    IndicatorStatus,
    LegendActionView,
    LegendCalloutView,
    PaneAction,
    DataWindowRow,
    DataWindowOHLC,
    DataWindowGroup,
    DataWindowReadout,
    RendererRootAttributes,
} from '../../core/ports/IChartRenderer';
import type { VelaTheme } from '../../core/options';
import type { Translator } from '../../core/i18n/types';
import { englishTranslator } from '../../core/i18n/translator';
import { msg } from '../../core/i18n/message';
import { textOf } from '../../core/i18n/text';
import type { MessageLike } from '../../core/i18n/types';
import { ENGLISH_FORMAT } from '../../core/format/formatters';
import type { FormatSurface } from '../../core/format/types';
import type { OHLCV } from '../../core/model/ohlcv';
import { columnarTimeToMillis, createMutableColumnarBars, appendColumnarBar } from '../../core/model/columnar-bars';
import type { ColumnarBars, ColumnarBarUpdate, ColumnarLodIndex, MutableColumnarBars } from '../../core/model/columnar-bars';
import type { Millis } from '../../core/model/time';
import type { VolumeLayerData, VpvrLayerData } from '../../core/model/volume-layers';
import type { Fill,  Pane, PriceLine } from '../../core/model/scene';
import type { IndicatorModel, PaneAxisBand } from¶»§q«^