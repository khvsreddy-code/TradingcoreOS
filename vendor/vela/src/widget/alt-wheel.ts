import type { DrawingTypeKey } from '../core/drawings';
import { getDrawingType } from '../core/drawings';
import { registerIcon, svg16 } from '../ui';

const STYLE_ID = 'vela-alt-wheel';
const QUICK_TOOLS: readonly DrawingTypeKey[] = [
    'trendline',
    'ray',
    'hline',
    'vline',
    'fibretracement',
    'box',
    'text',
    'anchoredvwap',
];

const CSS = `
.vela-alt-wheel {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: 80;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 240ms cubic-bezier(.22,1,.36,1), visibility 0s linear 240ms;
}
.vela-alt-wheel[data-open='1'] {
    opacity: 1;
    visibility: visible;
    transition: opacity 240ms cubic-bezier(.22,1,.36,1);
}
.vela-alt-wheel-orbit {
    position: absolute;
    width: 286px;
    height: 286px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) scale(.92);
    transition: transform 260ms cubic-bezier(.22,1,.36,1);
    pointer-events: none;
}
.vela-alt-wheel[data-open='1'] .vela-alt-wheel-orbit {
    transform: translate(-50%, -50%) scale(1);
}
.vela-alt-wheel-orbit::before {
    content: '';
    position: absolute;
    inset: 36px;
    border: 1px solid color-mix(in srgb, var(--vela-accent) 35%, var(--vela-border-strong));
    border-radius: 50%;
    background: color-mix(in srgb, var(--vela-bg) 86%, transparent);
    box-shadow: 0 18px 60px rgba(0,0,0,.38), inset 0 0 0 1px rgba(255,255,255,.02);
    backdrop-filter: blur(14px);
}
.vela-alt-wheel-action {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 62px;
    height: 62px;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-105px) rotate(calc(-1 * var(--angle))) scale(.9);
    border: 1px solid var(--vela-border);
    border-radius: 50%;
    background: color-mix(in srgb, var(--vela-surface-2) 92%, var(--vela-bg));
    color: var(--vela-fg-bright);
    display: grid;
    place-items: center;
    cursor: pointer;
    pointer-events: auto;
    opacity: .92;
    transition: transform 260ms cubic-bezier(.22,1,.36,1), border-color 180ms ease, background 180ms ease, color 180ms ease, box-shadow 180ms ease;
    box-shadow: 0 10px 25px rgba(0,0,0,.25);
}
.vela-alt-wheel[data-open='1'] .vela-alt-wheel-action { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-105px) rotate(calc(-1 * var(--angle))) scale(1); }
.vela-alt-wheel-action:hover {
    border-color: var(--vela-accent);
    background: color-mix(in srgb, var(--vela-accent) 15%, var(--vela-surface-2));
    color: var(--vela-accent-bright, var(--vela-fg-bright));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--vela-accent) 25%, transparent), 0 12px 30px rgba(0,0,0,.3);
}
.vela-alt-wheel-action .vela-alt-wheel-glyph { width: 21px; height: 21px; display: block; }
.vela-alt-wheel-action .vela-alt-wheel-label {
    position: absolute;
    left: 50%;
    top: calc(100% + 8px);
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 9px;
    font-weight: 650;
    letter-spacing: .04em;
    color: var(--vela-fg-muted);
    pointer-events: none;
}
.vela-alt-wheel-center {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 82px;
    height: 82px;
    transform: translate(-50%, -50%) scale(.92);
    border: 1px solid var(--vela-border-strong);
    border-radius: 50%;
    background: linear-gradient(180deg, color-mix(in srgb, var(--vela-surface) 96%, white 4%), var(--vela-surface-2));
    color: var(--vela-fg-bright);
    display: grid;
    place-items: center;
    gap: 2px;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 14px 36px rgba(0,0,0,.36), inset 0 0 0 1px rgba(255,255,255,.02);
    transition: transform 260ms cubic-bezier(.22,1,.36,1), border-color 180ms ease, box-shadow 180ms ease;
}
.vela-alt-wheel[data-open='1'] .vela-alt-wheel-center { transform: translate(-50%, -50%) scale(1); }
.vela-alt-wheel-center:hover {
    border-color: var(--vela-accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--vela-accent) 30%, transparent), 0 18px 42px rgba(0,0,0,.42);
}
.vela-alt-wheel-center .vela-alt-wheel-icon { width: 22px; height: 22px; }
.vela-alt-wheel-center .vela-alt-wheel-center-label { font-size: 9px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--vela-fg-muted); }
.vela-alt-wheel-hint {
    position: absolute;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    padding: 5px 9px;
    border: 1px solid var(--vela-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--vela-bg) 92%, transparent);
    color: var(--vela-fg-muted);
    font: 650 9px/1.2 var(--vela-font-family, system-ui, sans-serif);
    letter-spacing: .04em;
    white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
    .vela-alt-wheel, .vela-alt-wheel-orbit, .vela-alt-wheel-action, .vela-alt-wheel-center { transition: none !important; }
}
`;

function ensureStyles(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
}

function glyph(meta: ReturnType<typeof getDrawingType>): string {
    return meta?.icon ? meta.icon : svg16('<circle cx="8" cy="8" r="5"/>');
}

export interface AltWheelOptions {
    getAnchor: () => HTMLElement | null;
    onSelect: (type: DrawingTypeKey) => void;
    onPanels: () => void;
}

export class AltDrawingWheel {
    private readonly root: HTMLDivElement;
    private readonly orbit: HTMLDivElement;
    private readonly buttons: HTMLButtonElement[] = [];
    private openState = false;
    private readonly onResize = () => this.position();
    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Alt' || event.repeat) return;
        if (this.isEditable(event.target)) return;
        event.preventDefault();
        this.open();
    };
    private readonly onKeyUp = (event: KeyboardEvent) => {
        if (event.key !== 'Alt') return;
        this.close();
    };
    private readonly onBlur = () => {
        this.close();
    };

    constructor(private readonly host: HTMLElement, private readonly options: AltWheelOptions) {
        ensureStyles(host.ownerDocument);
        this.root = host.ownerDocument.createElement('div');
        this.root.className = 'vela-alt-wheel';
        this.root.setAttribute('aria-hidden', 'true');
        this.orbit = host.ownerDocument.createElement('div');
        this.orbit.className = 'vela-alt-wheel-orbit';
        this.root.appendChild(this.orbit);

        const count = QUICK_TOOLS.length;
        QUICK_TOOLS.forEach((type, index) => {
            const meta = getDrawingType(type);
            if (!meta) return;
            const button = host.ownerDocument.createElement('button');
            button.type = 'button';
            button.className = 'vela-alt-wheel-action';
            button.style.setProperty('--angle', `${index * (360 / count)}deg`);
            button.innerHTML = `<span class="vela-alt-wheel-glyph">${glyph(meta)}</span><span class="vela-alt-wheel-label">${meta.label}</span>`;
            button.title = meta.label;
            button.setAttribute('aria-label', meta.label);
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.options.onSelect(type);
                this.close();
            });
            this.buttons.push(button);
            this.orbit.appendChild(button);
        });

        const center = host.ownerDocument.createElement('button');
        center.type = 'button';
        center.className = 'vela-alt-wheel-center';
        center.title = 'Panels';
        center.setAttribute('aria-label', 'Open panels');
        center.innerHTML = `<span class="vela-alt-wheel-icon">${svg16('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>')}</span><span class="vela-alt-wheel-center-label">Panels</span>`;
        center.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.options.onPanels();
            this.close();
        });
        this.orbit.appendChild(center);

        const hint = host.ownerDocument.createElement('div');
        hint.className = 'vela-alt-wheel-hint';
        hint.textContent = 'Hold Alt · quick drawing tools';
        this.orbit.appendChild(hint);
        host.appendChild(this.root);

        host.ownerDocument.addEventListener('keydown', this.onKeyDown, true);
        host.ownerDocument.addEventListener('keyup', this.onKeyUp, true);
        window.addEventListener('resize', this.onResize, { passive: true });
        window.addEventListener('blur', this.onBlur);
    }

    open(): void {
        if (this.openState) {
            this.position();
            return;
        }
        this.openState = true;
        this.root.dataset.open = '1';
        this.root.setAttribute('aria-hidden', 'false');
        this.position();
    }

    private isEditable(target: EventTarget | null): boolean {
        const element = target instanceof HTMLElement ? target : null;
        return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
    }

    close(): void {
        if (!this.openState) return;
        this.openState = false;
        delete this.root.dataset.open;
        this.root.setAttribute('aria-hidden', 'true');
    }

    private position(): void {
        const anchor = this.options.getAnchor();
        const hostRect = this.host.getBoundingClientRect();
        const rect = anchor?.getBoundingClientRect();
        const centerX = rect ? rect.left + rect.width / 2 - hostRect.left : hostRect.width / 2;
        const centerY = rect ? rect.top + rect.height / 2 - hostRect.top : hostRect.height / 2;
        this.orbit.style.left = `${Math.round(centerX)}px`;
        this.orbit.style.top = `${Math.round(centerY)}px`;
    }

    destroy(): void {
        this.active = false;
        this.host.ownerDocument.removeEventListener('keydown', this.onKeyDown, true);
        this.host.ownerDocument.removeEventListener('keyup', this.onKeyUp, true);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('blur', this.onBlur);
        this.root.remove();
    }
}
