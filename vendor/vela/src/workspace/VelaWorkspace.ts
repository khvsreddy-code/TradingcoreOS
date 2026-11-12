// VelaWorkspace â€” the multi-chart shell: a CSS-Grid of ChartCells behind ONE shared
// data feed, wrapped in ONE shared chrome (topbar + layout dropdown, pickers, object
// tree, bottombar, keymap, alerts) that PROJECTS the ACTIVE cell and acts on it.
//
// The projection rule has exactly two triggers, and the chrome holds no state of its
// own: â‘  on `cell:active` the chrome rebinds wholesale (`projectActiveCell`); â‘¡ a
// cell's own events re-project only while that cell IS the active one (alerts are the
// exception â€” always aggregated, tagged by cell). Statusline/watermark/context-menu/
// undo-history are per-cell; everything else is shared.
import type { DataProvider } from '../core/ports/DataProvider';
import type { ScriptingEngine } from '../core/ports/ScriptingEngine';
import type { VelaTheme, NativeBackend, VelaOptions } from '../core/options';
import type { VelaShellOptions } from '../widget/shell-options';
import { resolveTheme } from '../core/theme';
import { TypedEventBus } from '../core/events/EventBus';
import { MultiProviderFeed } from '../data/MultiProviderFeed';
import { sharedBarStore } from '../data/BarStore';
import { ensureUIHost, registerIcon, svg16 } from '../ui';
import { isEditableTarget, KeymapManager } from '../ui/keymap';
import { DropdownMenu } from '@luxalgo/vela-ui/dropdown-menu';
import { createToaster, toast, type ToasterHandle } from '@luxalgo/vela-ui/toast';
import type { Vela } from '../Vela';
import { LocaleState, pickLocalizatio¶»§q«^