import { useEffect, useRef } from 'react';
import { ChartController } from '../chartController';

/** Owns the lifecycle boundary for imperative chart rendering. */
export function useChartLifecycle(): ChartController {
  const controller = useRef<ChartController | null>(null);
  if (!controller.current) controller.current = new ChartController();
  useEffect(() => () => controller.current?.dispose(), []);
  return controller.current;
}
