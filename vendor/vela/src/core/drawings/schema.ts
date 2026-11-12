/**
 * A data-driven settings schema. Each {@link SettingsField} names a dot-path into
 * a drawing (`'style.lineColor'`, `'text.value'`) plus a control `kind`, so the
 * renderer's settings popup builds controls generically â€” adding a new drawing
 * type is a schema entry, not new UI code.
 */

import { msg } from '../i18n/message';
import type { MessageLike } from '../i18n/types';

export type FieldKind = 'color' | 'number' | 'select' | 'lineStyle' | 'boolean' | 'text' | 'opacity';

export interface SettingsField {
    /** Dot-path into the drawing, e.g. `'style.lineColor'`, `'text.value'`, `'locked'`. */
    path: string;
    /** What the settings show; a message reads in the chart's language. */
    label: MessageLike;
    kind: FieldKind;
    /** number/opacity bounds. */
    min?: number;
    max?: number;
    step?: number;
    /** select options. */
    options?: ReadonlyArray<{ value: string; label: MessageLike }>;
    /** Cosmetic grouping in the popup. */
    group?: 'line' | 'fill' | 'text' | 'behavior';
    /** Only offered while another setting holds one of these values (an option that matters
     *  only in some modes). */
    when?: { path: string; in: readonly unknown[] };
    /** A color that follows another setting until one is picked (a rectangle's midline takes
     *  the border color): the path whose value the control shows while this one is unset. */
    fallback?: string;
    /** The label of the one row this field shares with the next one: a color¶»§q«^