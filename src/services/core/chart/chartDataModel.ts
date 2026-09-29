/**
 * Backward-compatible chart import surface. The canonical market store now
 * lives in the renderer-neutral core/data layer so indicators and models can
 * consume the same ownership point without depending on chart code.
 */
export * from '../data/marketDataStore';
