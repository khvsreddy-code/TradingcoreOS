/**
 * Compatibility facade.
 *
 * The canonical stateful indicator kernels live in the CoreSpirit layer so the language
 * runtime and market-data incremental engine share exactly one mathematical implementation.
 * Keep this import surface stable for existing market-data consumers/tests.
 * /
export * from '../coreSpirit/statefulIndicatorKernel';
