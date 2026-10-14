import { FibLevels } from './FibLevels';
import type { FibLevel } from './FibRatios';
import { FIB_PRESETS } from '../fibPresets';

/** The classic set: the standard pullback ratios on, the rest of the ladder off. */
const LEVELS = FIB_PRESETS[0]!.levels;

/** Fibonacci retracement: horizontal levels between two swing anchors. */
export class FibRetracement extends FibLevels {
    readonly type = 'fibretracement' as const;

    defaultLevels(): readonly FibLevel[] {
        return LEVELS;
    }
}
