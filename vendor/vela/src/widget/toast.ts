// Bottom-center status toast — the reference's small pill over the chart (loading /
// info / error states, auto-hide). One instance per widget.
import { injectStyles } from '../ui/styles';

const STYLE_ID = 'vela-widget-toast';
const CSS = `
.vela-toast {
    /* Market/feed notifications stay in the lower-left safe area; never cover
       the symbol/price statusline in the upper chart chrome. */
    position: absolute !important;
    top: auto !important;
    right: auto !important;
    left: 12px !important;
    bottom: 12px !important;
    transform: none !important;
    z-index: 50;
    display: none;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: min(520px, calc(100% - 24px));
    box-sizing: border-box;
    padding: 8px 12px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--vela-surface-elev) 94%, #0b271c);
    border: 1px solid color-mix(in srgb, var(--vela-up) 52%, var(--vela-border));
    color: var(--vela-fg);
    font-size: var(--vela-font-size-md);
    line-height: 1.35;
    box-shadow: var(--vela-shadow);
    pointer-events: none;
    white-space: normal;
    overflow: hidden;
    text-overflow: ellipsis;
}
.vela-toast[data-open] { display: inline-flex; }
.vela-toast[data-type='error'] { color: var(--vela-down); border-color: var(--vela-down); }
.vela-toast[data-type='success'] { color: var(--vela-up); }
`;

export class Toast {
    private readonly el: HTMLElement;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(host: HTMLElement) {
        injectStyles(STYLE_ID, CSS, host.ownerDocument);
        this.el = host.ownerDocument.createElement('div');
        this.el.className = 'vela-toast';
        host.appendChild(this.el);
    }

    /** Show a message; auto-hides after `ms` (0 = sticky until `hide()`). */
    show(message: string, type: 'info' | 'success' | 'error' = 'info', ms = 3000): void {
        this.el.textContent = message;
        this.el.dataset.type = type;
        this.el.dataset.open = '1';
        if (this.timer) clearTimeout(this.timer);
        this.timer = ms > 0 ? setTimeout(() => this.hide(), ms) : null;
    }

    hide(): void {
        delete this.el.dataset.open;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    destroy(): void {
        this.hide();
        this.el.remove();
    }
}
