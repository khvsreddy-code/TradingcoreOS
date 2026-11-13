/**
 * Copy-on-write, page-backed ArrayLike storage for chart provenance columns.
 *
 * Live candle changes only replace one page (and the small page-reference table),
 * while previously published snapshots retain their original page references.
 * The ordinary ArrayLike contract keeps history-normalization consumers agnostic
 * to this storage detail. Full materialization occurs only when a plain provider
 * array is first adopted or a dataset is resized backwards.
 */
const SIDECAR_PAGE_SIZE = 512;

type SidecarStore<T> = Readonly<{
  length: number;
  pages: readonly (readonly T[])[];
}>;

type SidecarPatch<T> = Readonly<{ index: number; value: T }>;

const sidecarStores = new WeakMap<object, SidecarStore<unknown>>();

function numericArrayIndex(property: PropertyKey): number | undefined {
  if (typeof property !== 'string') return undefined;
  const index = Number(property);
  return Number.isSafeInteger(index) && index >= 0 && String(index) === property
    ? index
    : undefined;
}

function createSidecarView<T>(store: SidecarStore<T>): ArrayLike<T> {
  const target = Object.create(null) as { length: number; [index: number]: T };
  Object.defineProperty(target, 'length', {
    value: store.length,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  const view = new Proxy(target, {
    get(current, property, receiver) {
      if (property === 'length') return store.length;
      const index = numericArrayIndex(property);
      if (index !== undefined) {
        if (index >= store.length) return undefined;
        return store.pages[Math.floor(index / SIDECAR_PAGE_SIZE)]?.[index % SIDECAR_PAGE_SIZE];
      }
      return Reflect.get(current, property, receiver);
    },
    set() {
      return false;
    },
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  }) as ArrayLike<T>;
  sidecarStores.set(view as object, store as SidecarStore<unknown>);
  return view;
}

/**
 * Apply a small number of indexed mutations without materializing the full
 * historical column. Every touched page is cloned at most once per call.
 */
export function patchImmutableArrayLike<T>(
  previous: ArrayLike<T> | undefined,
  length: number,
  patches: readonly SidecarPatch<T>[],
  fallback: (index: number) => T,
): ArrayLike<T> {
  const parsedLength = Math.floor(Number(length));
  const nextLength = Number.isFinite(parsedLength) ? Math.max(0, parsedLength) : 0;
  const existing = previous
    ? sidecarStores.get(previous as object) as SidecarStore<T> | undefined
    : undefined;
  const canReuse = existing !== undefined && existing.length <= nextLength;
  const pages: (readonly T[])[] = canReuse
    ? existing.pages.slice(0, Math.ceil(nextLength / SIDECAR_PAGE_SIZE))
    : [];
  const mutablePages = new Map<number, T[]>();

  const writablePage = (pageIndex: number): T[] => {
    const cached = mutablePages.get(pageIndex);
    if (cached) return cached;
    const copy = pages[pageIndex] ? pages[pageIndex]!.slice() : [];
    pages[pageIndex] = copy;
    mutablePages.set(pageIndex, copy);
    return copy;
  };

  if (canReuse) {
    for (let index = existing.length; index < nextLength; index += 1) {
      writablePage(Math.floor(index / SIDECAR_PAGE_SIZE)).push(fallback(index));
    }
  } else {
    const sourceLength = Math.min(
      nextLength,
      previous ? Math.max(0, Math.floor(Number(previous.length) || 0)) : 0,
    );
    for (let index = 0; index < nextLength; index += 1) {
      const pageIndex = Math.floor(index / SIDECAR_PAGE_SIZE);
      const page = writablePage(pageIndex);
      page.push(index < sourceLength ? previous![index]! : fallback(index));
    }
  }

  for (const patch of patches) {
    const index = Math.floor(Number(patch.index));
    if (!Number.isSafeInteger(index) || index < 0 || index >= nextLength) continue;
    const pageIndex = Math.floor(index / SIDECAR_PAGE_SIZE);
    const offset = index % SIDECAR_PAGE_SIZE;
    const page = writablePage(pageIndex);
    while (page.length <= offset) {
      page.push(fallback(pageIndex * SIDECAR_PAGE_SIZE + page.length));
    }
    page[offset] = patch.value;
  }

  for (const [pageIndex, page] of mutablePages) {
    pages[pageIndex] = Object.freeze(page);
  }
  const store: SidecarStore<T> = Object.freeze({
    length: nextLength,
    pages: Object.freeze(pages),
  });
  return createSidecarView(store);
}
