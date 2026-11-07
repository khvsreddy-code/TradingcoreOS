// The in-chart ATTRIBUTION mark — the LuxAlgo logomark at the bottom-left of the plot,
// expanding its wordmark on hover and linking to the project. Rendered by DEFAULT on every
// chart. Per the NOTICE file, products may disable it (`renderer.set('attribution', false)`)
// ONLY if they display an equivalent visible attribution elsewhere in their UI, which the
// same file also allows them to restyle or reposition to fit their design.

import { msg } from '../../../core/i18n/message';
import { textOf } from '../../../core/i18n/text';
import type { Translator } from '../../../core/i18n/types';
import { isDarkColor } from '../../../core/color';
import { TRADINGCOREOS_SYMBOL_SVG } from './tradingcoreos-logos';
import { css } from '@luxalgo/vela-ui/css';


/** Where the mark links — the canonical project page. */
export const ATTRIBUTION_URL = 'https://velacharts.dev';

const STYLE_ID = 'vela-attribution-styles';
const CSS = css`@layer vela.chrome {

.vela-attribution {
    text-decoration: none;
    display: flex;
    align-items: center;
    /* Gutter, wordmark size and offset below are the brand lockup's own ratios,
       measured off the official horizontal logo: gutter 0.157, wordmark height
       0.966, and wordmark 0.109 LOWER than the symbol — box-centering the two
       reads wrong because the symbol's ink hangs low and the wordmark descends. */
    gap: 4px;
}
.vela-attribution .vela-attr-symbol {
    flex: none;
    display: block;
    line-height: 0;
}
.vela-attribution .vela-attr-symbol svg {
    height: 28px;
    width: auto;
    display: block;
    filter: drop-shadow(0 1px 2px var(--vela-attr-shadow, rgba(0,0,0,0.45)));
}
.vela-attribution .vela-attr-wordmark {
    max-width: 0;
    overflow: hidden;
    opacity: 0;
    display: flex;
    align-items: center;
    /* Offset here, not on the image: the clip box must not crop the descender. */
    position: relative;
    top: 3px;
    transform: translateX(-8px);
    transition: max-width 0.3s ease, opacity 0.25s ease, transform 0.3s ease;
    flex: none;
}
.vela-attribution .vela-attr-brand-name {
    color: currentColor;
    font: 700 11px/1.1 Inter, ui-sans-serif, system-ui, sans-serif;
    white-space: nowrap;
    letter-spacing: -0.02em;
}
.vela-attribution .vela-attr-brand-powered {
    color: var(--vela-fg-muted, currentColor);
    font: 500 9px/1.1 Inter, ui-sans-serif, system-ui, sans-serif;
    white-space: nowrap;
    margin-left: 6px;
}
.vela-attribution .vela-attr-wordmark svg {
    height: 27px;
    width: auto;
    display: block;
    filter: drop-shadow(0 1px 2px var(--vela-attr-shadow, rgba(0,0,0,0.45)));
}
.vela-attribution:hover .vela-attr-wordmark {
    max-width: 240px;
    opacity: 1;
    transform: translateX(0);
}
/* Mobile: a hair smaller so the mark doesn't dominate a phone-width plot. Keyed on the
   renderer's own container attribute (data-vela-layout) AND the shell root's
   (data-layout): the workspace's single grid-wide mark lives OUTSIDE any renderer
   container, so only the shell attribute reaches it. */
[data-vela-layout='mobile'] .vela-attribution .vela-attr-symbol svg,
[data-layout='mobile'] .vela-attribution .vela-attr-symbol svg { height: 22px; }
[data-vela-layout='mobile'] .vela-attribution .vela-attr-wordmark,
[data-layout='mobile'] .vela-attribution .vela-attr-wordmark {
    top: 2px;
    transform: translateX(-6px);
}
[data-vela-layout='mobile'] .vela-attribution .vela-attr-wordmark svg,
[data-layout='mobile'] .vela-attribution .vela-attr-wordmark svg { height: 21px; }
[data-vela-layout='mobile'] .vela-attribution:hover .vela-attr-wordmark,
[data-layout='mobile'] .vela-attribution:hover .vela-attr-wordmark { transform: translateX(0); }

}`;

function ensureStyles(doc: Document): void {
    let s = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!s) {
        s = doc.createElement('style');
        s.id = STYLE_ID;
        doc.head.appendChild(s);
    }
    s.textContent = CSS;
}

/**
 * Ink for the attribution SVGs — a hard two-way switch on the plot background, never a
 * mid-tone: the logomark is brand artwork, so it stays either fully white or fully black.
 */
export function attributionMarkColor(background: string): string {
    return isDarkColor(background) ? '#ffffff' : '#000000';
}

/**
 * Ink + lift for one plot background (call after any theme / `layout.background` change).
 * The shadow flips with the ink: a black mark under a black shadow reads as unswitched mud.
 */
export function applyAttributionMarkTheme(el: HTMLElement, background: string): void {
    const dark = isDarkColor(background);
    el.style.color = dark ? '#ffffff' : '#000000';
    el.style.setProperty('--vela-attr-shadow', dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)');
}

/**
 * Build a HOST-supplied mark for the same corner. The string is inserted as HTML inside a
 * positioned wrapper, so plain text renders as plain text and markup renders as markup —
 * it is DEVELOPER-supplied branding, never a place to pass user input through. The
 * wrapper carries no link and no theming of its own beyond the ink color, so the content
 * looks exactly as its author wrote it.
 */
export function createCustomMark(doc: Document, html: string, background: string): HTMLElement {
    const el = doc.createElement('div');
    el.className = 'vela-attribution-custom';
    Object.assign(el.style, {
        position: 'absolute',
        zIndex: '6',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        lineHeight: '1',
    });
    el.style.color = attributionMarkColor(background);
    el.innerHTML = html;
    // A mark visible on screen belongs in the PNG export too — the renderer rasterizes
    // every `data-vela-screenshot` overlay (a hidden mark is skipped by the rasterizer).
    el.dataset.velaScreenshot = '1';
    return el;
}

/** The mark's tooltip; Vela's name is never translated. */
const ATTRIBUTION_LABEL = msg('chart.attribution', 'Charting by Vela');

/** Re-read the built-in mark's tooltip in `i18n`'s language; a host's own mark keeps its words. */
export function relabelAttributionMark(el: HTMLElement, i18n?: Translator | null): void {
    if (!el.classList.contains('vela-attribution')) return;
    const label = textOf(i18n, ATTRIBUTION_LABEL);
    el.title = label;
    el.setAttribute('aria-label', label);
}

/** Build the mark element (an anchor; the caller owns absolute positioning). */
export function createAttributionMark(doc: Document, background: string, i18n?: Translator | null): HTMLAnchorElement {
    ensureStyles(doc);
    const a = doc.createElement('a');
    a.className = 'vela-attribution';
    a.href = ATTRIBUTION_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'TradingCoreOS charting · Powered by Vela';
    a.setAttribute('aria-label', 'TradingCoreOS charting powered by Vela');
    Object.assign(a.style, {
        position: 'absolute',
        zIndex: '6',
        pointerEvents: 'auto',
        cursor: 'pointer',
    });
    applyAttributionMarkTheme(a, background);
    // Same screenshot opt-in as the custom mark: the attribution the NOTICE file asks
    // hosts to keep visible must survive into exported PNGs as well.
    a.dataset.velaScreenshot = '1';
    const symbol = doc.createElement('span');
    symbol.className = 'vela-attr-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.innerHTML = TRADINGCOREOS_SYMBOL_SVG;
    const wordmark = doc.createElement('span');
    wordmark.className = 'vela-attr-wordmark';
    wordmark.innerHTML = '<span class="vela-attr-brand-name">TradingCoreOS</span><span class="vela-attr-brand-powered">Powered by Vela</span>';
    a.append(symbol, wordmark);
    return a;
}
