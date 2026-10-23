/**
 * Deterministic typed-array kernels for CoreSpirit's historical/research plane.
 *
 * Contract:
 * - Inputs are read-only and never mutated.
 * - Rolling outputs are aligned to the right edge of each window; incomplete or
 *   invalid windows produce NaN (not zero), preventing warm-up values from
 *   looking like valid market observations.
 * - Stateful smoothers reset after a non-finite gap. EMA seeds from the first
 *   finite observation; Wilder RMA/ATR/RSI seed from a full period.
 * - No kernel has access to orders, broker clients, network APIs, or chart UI.
 */
export const CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH = 4_194_304;
export const CORE_SPIRIT_MAX_KERNEL_MATRIX_DIMENSION = 256;

export const CORE_SPIRIT_NUMERICAL_KERNEL_OPERATIONS = Object.freeze([
  'rollingMean', 'rollingSum', 'rollingVariance', 'rollingStd', 'rollingMin', 'rollingMax',
  'ema', 'rma', 'wma', 'atr', 'rsi', 'linearRegression', 'correlation',
  'covariance', 'zScore', 'dotProduct', 'matrixMultiply', 'matrixDecomposition',
  'softmax', 'logSumExp',
] as const);
export type CoreSpiritNumericalKernelOperation = typeof CORE_SPIRIT_NUMERICAL_KERNEL_OPERATIONS[number];
export type CoreSpiritNumericSeries = ArrayLike<number>;
export type CoreSpiritNumericMatrix = Readonly<{ rows: number; columns: number; data: Float64Array }>;
export type CoreSpiritLinearRegressionResult = Readonly<{
  slope: Float64Array;
  intercept: Float64Array;
  fitted: Float64Array;
  rSquared: Float64Array;
}>;
export type CoreSpiritLuDecomposition = Readonly<{
  size: number;
  lu: Float64Array;
  permutation: Int32Array;
  sign: 1 | -1;
  singular: boolean;
}>;

function validateSeries(values: CoreSpiritNumericSeries, label = 'series'): number {
  if (!values || !Number.isInteger(values.length) || values.length < 0 || values.length > CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH) {
    throw new Error(`${label} length must be an integer between 0 and ${CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH}`);
  }
  return values.length;
}

function validatePeriod(period: number, label = 'period'): number {
  if (!Number.isInteger(period) || period < 1 || period > CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH) {
    throw new Error(`${label} must be an integer between 1 and ${CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH}`);
  }
  return period;
}

function output(length: number): Float64Array {
  const result = new Float64Array(length);
  result.fill(Number.NaN);
  return result;
}

function checkSameLength(left: CoreSpiritNumericSeries, right: CoreSpiritNumericSeries, operation: string): number {
  const a = validateSeries(left, `${operation} left input`);
  const b = validateSeries(right, `${operation} right input`);
  if (a !== b) throw new Error(`${operation} requires equal input lengths`);
  return a;
}

export function rollingMean(values: CoreSpiritNumericSeries, periodValue: number): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const result = output(length);
  let sum = 0;
  let invalid = 0;
  for (let i = 0; i < length; i += 1) {
    const current = Number(values[i]);
    if (Number.isFinite(current)) sum += current;
    else invalid += 1;
    if (i >= period) {
      const leaving = Number(values[i - period]);
      if (Number.isFinite(leaving)) sum -= leaving;
      else invalid -= 1;
    }
    if (i >= period - 1 && invalid === 0) result[i] = sum / period;
  }
  return result;
}

/** Rolling sum with the same right-aligned, finite-window contract as rollingMean. */
export function rollingSum(values: CoreSpiritNumericSeries, periodValue: number): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const result = output(length);
  let sum = 0;
  let invalid = 0;
  for (let i = 0; i < length; i += 1) {
    const current = Number(values[i]);
    if (Number.isFinite(current)) sum += current;
    else invalid += 1;
    if (i >= period) {
      const leaving = Number(values[i - period]);
      if (Number.isFinite(leaving)) sum -= leaving;
      else invalid -= 1;
    }
    if (i >= period - 1 && invalid === 0) result[i] = sum;
  }
  return result;
}

export function rollingVariance(values: CoreSpiritNumericSeries, periodValue: number, ddofValue = 0): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const ddof = Number(ddofValue);
  if (!Number.isInteger(ddof) || ddof < 0 || ddof >= period) throw new Error('variance ddof must be an integer in [0, period)');
  const result = output(length);
  // Rolling Welford updates avoid E[x²] - E[x]² cancellation on price series
  // whose level is large relative to their intrawindow variation. Removing an
  // outgoing sample uses the inverse Welford update; complexity remains O(n).
  let count = 0;
  let mean = 0;
  let m2 = 0;
  let invalid = 0;
  for (let i = 0; i < length; i += 1) {
    if (i >= period) {
      const leaving = Number(values[i - period]);
      if (Number.isFinite(leaving)) {
        if (count <= 1) {
          count = 0;
          mean = 0;
          m2 = 0;
        } else {
          const nextCount = count - 1;
          const nextMean = (count * mean - leaving) / nextCount;
          m2 -= (leaving - mean) * (leaving - nextMean);
          mean = nextMean;
          count = nextCount;
          if (m2 < 0 && Math.abs(m2) <= Number.EPSILON * Math.max(1, Math.abs(m2)) * count * 32) m2 = 0;
        }
      } else {
        invalid -= 1;
      }
    }
    const current = Number(values[i]);
    if (Number.isFinite(current)) {
      count += 1;
      const delta = current - mean;
      mean += delta / count;
      m2 += delta * (current - mean);
    } else {
      invalid += 1;
    }
    if (i >= period - 1 && invalid === 0 && count === period) {
      const centered = m2 < 0 && Math.abs(m2) <= Number.EPSILON * Math.max(1, Math.abs(m2)) * count * 32 ? 0 : m2;
      result[i] = centered < 0 ? Number.NaN : centered / (period - ddof);
    }
  }
  return result;
}

export function rollingStd(values: CoreSpiritNumericSeries, period: number, ddof = 0): Float64Array {
  const variance = rollingVariance(values, period, ddof);
  for (let i = 0; i < variance.length; i += 1) variance[i] = Number.isFinite(variance[i]!) ? Math.sqrt(Math.max(0, variance[i]!)) : Number.NaN;
  return variance;
}

function rollingExtrema(values: CoreSpiritNumericSeries, periodValue: number, highest: boolean): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const result = output(length);
  const deque = new Int32Array(length);
  let head = 0;
  let tail = 0;
  let invalid = 0;
  for (let i = 0; i < length; i += 1) {
    const current = Number(values[i]);
    if (Number.isFinite(current)) {
      while (tail > head) {
        const lastIndex = deque[tail - 1]!;
        const lastValue = Number(values[lastIndex]);
        if (highest ? lastValue > current : lastValue < current) break;
        tail -= 1;
      }
      deque[tail++] = i;
    } else invalid += 1;

    const expired = i - period;
    if (expired >= 0) {
      const leaving = Number(values[expired]);
      if (!Number.isFinite(leaving)) invalid -= 1;
      if (tail > head && deque[head] === expired) head += 1;
    }
    if (i >= period - 1 && invalid === 0 && tail > head) result[i] = Number(values[deque[head]!]);
  }
  return result;
}

export function rollingMin(values: CoreSpiritNumericSeries, period: number): Float64Array {
  return rollingExtrema(values, period, false);
}
export function rollingMax(values: CoreSpiritNumericSeries, period: number): Float64Array {
  return rollingExtrema(values, period, true);
}

export function ema(values: CoreSpiritNumericSeries, periodValue: number): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const result = output(length);
  const alpha = 2 / (period + 1);
  let previous: number | undefined;
  for (let i = 0; i < length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) { previous = undefined; continue; }
    previous = previous === undefined ? value : alpha * value + (1 - alpha) * previous;
    result[i] = previous;
  }
  return result;
}

export function rma(values: CoreSpiritNumericSeries, periodValue: number): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const result = output(length);
  let seedCount = 0;
  let seedSum = 0;
  let previous: number | undefined;
  for (let i = 0; i < length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) {
      seedCount = 0; seedSum = 0; previous = undefined;
      continue;
    }
    if (previous === undefined) {
      seedSum += value;
      seedCount += 1;
      if (seedCount === period) {
        previous = seedSum / period;
        result[i] = previous;
      }
      continue;
    }
    previous = ((period - 1) * previous + value) / period;
    result[i] = previous;
  }
  return result;
}

export function wma(values: CoreSpiritNumericSeries, periodValue: number): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const result = output(length);
  const denominator = (period * (period + 1)) / 2;
  let sum = 0;
  let weighted = 0;
  let invalid = 0;
  for (let i = 0; i < length; i += 1) {
    const value = Number(values[i]);
    const finiteValue = Number.isFinite(value) ? value : 0;
    if (i < period) {
      sum += finiteValue;
      weighted += (i + 1) * finiteValue;
      if (!Number.isFinite(value)) invalid += 1;
    } else {
      const leaving = Number(values[i - period]);
      const finiteLeaving = Number.isFinite(leaving) ? leaving : 0;
      const oldSum = sum;
      sum = oldSum - finiteLeaving + finiteValue;
      weighted = weighted - oldSum + period * finiteValue;
      if (!Number.isFinite(value)) invalid += 1;
      if (!Number.isFinite(leaving)) invalid -= 1;
    }
    if (i >= period - 1 && invalid === 0) result[i] = weighted / denominator;
  }
  return result;
}

export function atr(high: CoreSpiritNumericSeries, low: CoreSpiritNumericSeries, close: CoreSpiritNumericSeries, period: number): Float64Array {
  const length = checkSameLength(high, low, 'ATR');
  if (checkSameLength(high, close, 'ATR') !== length) throw new Error('ATR requires equal OHLC lengths');
  const trueRange = output(length);
  for (let i = 0; i < length; i += 1) {
    const h = Number(high[i]); const l = Number(low[i]); const c = Number(close[i]);
    const previousClose = i > 0 ? Number(close[i - 1]) : Number.NaN;
    if (![h, l, c].every(Number.isFinite) || h < l) continue;
    trueRange[i] = i === 0 || !Number.isFinite(previousClose)
      ? h - l
      : Math.max(h - l, Math.abs(h - previousClose), Math.abs(l - previousClose));
  }
  return rma(trueRange, period);
}

export function rsi(values: CoreSpiritNumericSeries, periodValue: number): Float64Array {
  const length = validateSeries(values);
  const period = validatePeriod(periodValue);
  const result = output(length);
  let previousClose: number | undefined;
  let seedCount = 0;
  let gainSum = 0;
  let lossSum = 0;
  let averageGain: number | undefined;
  let averageLoss: number | undefined;

  for (let i = 0; i < length; i += 1) {
    const close = Number(values[i]);
    if (!Number.isFinite(close)) {
      previousClose = undefined; seedCount = 0; gainSum = 0; lossSum = 0;
      averageGain = undefined; averageLoss = undefined;
      continue;
    }
    if (previousClose === undefined) { previousClose = close; continue; }
    const change = close - previousClose;
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    previousClose = close;

    if (averageGain === undefined || averageLoss === undefined) {
      gainSum += gain; lossSum += loss; seedCount += 1;
      if (seedCount === period) {
        averageGain = gainSum / period;
        averageLoss = lossSum / period;
        result[i] = averageLoss === 0 ? (averageGain === 0 ? 50 : 100) : 100 - 100 / (1 + averageGain / averageLoss);
      }
      continue;
    }
    averageGain = ((period - 1) * averageGain + gain) / period;
    averageLoss = ((period - 1) * averageLoss + loss) / period;
    result[i] = averageLoss === 0 ? (averageGain === 0 ? 50 : 100) : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function linearRegression(values: CoreSpiritNumericSeries, periodValue: number): CoreSpiritLinearRegressionResult {
  const length=validateSeries(values),period=validatePeriod(periodValue);
  const slope=output(length),intercept=output(length),fitted=output(length),rSquared=output(length);
  if(period>length)return Object.freeze({slope,intercept,fitted,rSquared});
  const sumX=period*(period-1)/2,sumXX=period*(period-1)*(2*period-1)/6;
  const denominatorX=period*sumXX-sumX*sumX;
  // Center y around a stable anchor so large price levels cannot swamp small moves.
  let anchor=0;
  for(let i=0;i<length;i++){const v=Number(values[i]);if(Number.isFinite(v)){anchor=v;break;}}
  let sumY=0,sumYY=0,sumXY=0,invalid=0;
  for(let i=0;i<length;i++){
    const raw=Number(values[i]),v=Number.isFinite(raw)?raw-anchor:Number.NaN;
    if(i<period){if(Number.isFinite(v)){sumY+=v;sumYY+=v*v;sumXY+=i*v;}else invalid++;}
    else{
      const oldRaw=Number(values[i-period]),old=Number.isFinite(oldRaw)?oldRaw-anchor:Number.NaN;
      if(Number.isFinite(old)){const surviving=sumY-old;sumXY-=surviving;sumY=surviving;sumYY-=old*old;}else invalid--;
      if(Number.isFinite(v)){sumY+=v;sumYY+=v*v;sumXY+=(period-1)*v;}else invalid++;
    }
    if(i>=period-1&&invalid===0&&denominatorX>0){
      const meanY=sumY/period,numerator=period*sumXY-sumX*sumY;
      const m=numerator/denominatorX,b=meanY-m*(period-1)/2;
      const centeredY=Math.max(0,sumYY-sumY*sumY/period),denominatorY=period*centeredY;
      const r2=denominatorY<=1e-20?0:Math.min(1,Math.max(0,(numerator*numerator)/(denominatorX*denominatorY)));
      slope[i]=m;intercept[i]=b+anchor;fitted[i]=b+anchor+m*(period-1);rSquared[i]=r2;
    }
  }
  return Object.freeze({slope,intercept,fitted,rSquared});
}

function rollingPair(left:CoreSpiritNumericSeries,right:CoreSpiritNumericSeries,periodValue:number,ddofValue=0):{covariance:Float64Array;correlation:Float64Array}{
  const length=checkSameLength(left,right,'rolling pair'),period=validatePeriod(periodValue),ddof=Number(ddofValue);
  if(!Number.isInteger(ddof)||ddof<0||ddof>=period)throw new Error('ddof must be an integer in [0, period)');
  const covariance=output(length),correlation=output(length);
  // Reversible centered moments avoid cancellation in raw second moments.
  let count=0,meanX=0,meanY=0,cxx=0,cyy=0,cxy=0,invalid=0;
  const add=(x:number,y:number):void=>{count++;const dx=x-meanX,dy=y-meanY;meanX+=dx/count;meanY+=dy/count;cxx+=dx*(x-meanX);cyy+=dy*(y-meanY);cxy+=dx*(y-meanY);};
  const remove=(x:number,y:number):void=>{
    if(count<=1){count=0;meanX=0;meanY=0;cxx=0;cyy=0;cxy=0;return;}
    const n=count-1,nmx=(count*meanX-x)/n,nmy=(count*meanY-y)/n;
    cxx-=(x-meanX)*(x-nmx);cyy-=(y-meanY)*(y-nmy);cxy-=(x-meanX)*(y-nmy);
    meanX=nmx;meanY=nmy;count=n;
  };
  for(let i=0;i<length;i++){
    const x=Number(left[i]),y=Number(right[i]);
    if(Number.isFinite(x)&&Number.isFinite(y))add(x,y);else invalid++;
    if(i>=period){const ox=Number(left[i-period]),oy=Number(right[i-period]);if(Number.isFinite(ox)&&Number.isFinite(oy))remove(ox,oy);else invalid--;}
    if(i<period-1||invalid!==0||count!==period)continue;
    const tx=Number.EPSILON*Math.max(1,Math.abs(cxx))*period*32,ty=Number.EPSILON*Math.max(1,Math.abs(cyy))*period*32;
    const vx=cxx<0&&Math.abs(cxx)<=tx?0:cxx,vy=cyy<0&&Math.abs(cyy)<=ty?0:cyy;
    if(vx<0||vy<0)continue;
    covariance[i]=cxy/(period-ddof);
    if(vx>0&&vy>0)correlation[i]=Math.max(-1,Math.min(1,cxy/Math.sqrt(vx*vy)));
  }
  return {covariance,correlation};
}
export function covariance(left: CoreSpiritNumericSeries, right: CoreSpiritNumericSeries, period: number, ddof = 0): Float64Array {
  return rollingPair(left, right, period, ddof).covariance;
}
export function correlation(left: CoreSpiritNumericSeries, right: CoreSpiritNumericSeries, period: number): Float64Array {
  return rollingPair(left, right, period, 0).correlation;
}
export function zScore(values: CoreSpiritNumericSeries, periodValue: number): Float64Array {
  const length = validateSeries(values);
  const mean = rollingMean(values, periodValue);
  const std = rollingStd(values, periodValue);
  const result = output(length);
  for (let i = 0; i < length; i += 1) {
    const value = Number(values[i]);
    if (Number.isFinite(value) && Number.isFinite(mean[i]!) && Number.isFinite(std[i]!) && std[i]! > 0) result[i] = (value - mean[i]!) / std[i]!;
  }
  return result;
}

export function dotProduct(left: CoreSpiritNumericSeries, right: CoreSpiritNumericSeries): number {
  const length = checkSameLength(left, right, 'dot product');
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const a = Number(left[i]); const b = Number(right[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('dot product inputs must be finite');
    sum += a*b;
  }
  return sum;
}

function validateMatrix(matrix: CoreSpiritNumericMatrix, label: string): void {
  if (!matrix || !Number.isInteger(matrix.rows) || !Number.isInteger(matrix.columns) ||
      matrix.rows < 1 || matrix.columns < 1 ||
      matrix.rows > CORE_SPIRIT_MAX_KERNEL_MATRIX_DIMENSION ||
      matrix.columns > CORE_SPIRIT_MAX_KERNEL_MATRIX_DIMENSION ||
      matrix.data.length !== matrix.rows * matrix.columns ||
      Array.from(matrix.data).some(value => !Number.isFinite(value))) {
    throw new Error(`${label} must be a finite, well-shaped matrix within the supported limit`);
  }
}

export function matrixMultiply(left: CoreSpiritNumericMatrix, right: CoreSpiritNumericMatrix): CoreSpiritNumericMatrix {
  validateMatrix(left, 'matrixMultiply left operand'); validateMatrix(right, 'matrixMultiply right operand');
  if (left.columns !== right.rows) throw new Error('matrixMultiply inner dimensions must match');
  const data = new Float64Array(left.rows * right.columns);
  // Cache-friendly row-major i-k-j ordering; no intermediate matrices.
  for (let i = 0; i < left.rows; i += 1) {
    const leftOffset = i * left.columns;
    const outputOffset = i * right.columns;
    for (let k = 0; k < left.columns; k += 1) {
      const a = left.data[leftOffset + k]!;
      const rightOffset = k * right.columns;
      for (let j = 0; j < right.columns; j += 1) data[outputOffset + j] += a * right.data[rightOffset + j]!;
    }
  }
  return Object.freeze({ rows: left.rows, columns: right.columns, data });
}

export function matrixDecomposition(matrix: CoreSpiritNumericMatrix, tolerance = 1e-12): CoreSpiritLuDecomposition {
  validateMatrix(matrix, 'matrixDecomposition input');
  if (matrix.rows !== matrix.columns) throw new Error('matrixDecomposition requires a square matrix');
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('matrix decomposition tolerance must be finite and non-negative');
  const size = matrix.rows;
  const lu = Float64Array.from(matrix.data);
  const permutation = Int32Array.from({ length: size }, (_value, index) => index);
  let sign: 1 | -1 = 1;
  let singular = false;
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    let pivotMagnitude = Math.abs(lu[column * size + column]!);
    for (let row = column + 1; row < size; row += 1) {
      const candidate = Math.abs(lu[row * size + column]!);
      if (candidate > pivotMagnitude) { pivotMagnitude = candidate; pivotRow = row; }
    }
    if (pivotMagnitude <= tolerance) { singular = true; continue; }
    if (pivotRow !== column) {
      for (let j = 0; j < size; j += 1) {
        const a = column * size + j; const b = pivotRow * size + j;
        const temporary = lu[a]!; lu[a] = lu[b]!; lu[b] = temporary;
      }
      const p = permutation[column]!; permutation[column] = permutation[pivotRow]!; permutation[pivotRow] = p;
      sign = sign === 1 ? -1 : 1;
    }
    const pivot = lu[column * size + column]!;
    for (let row = column + 1; row < size; row += 1) {
      const index = row * size + column;
      lu[index] /= pivot;
      const factor = lu[index]!;
      for (let j = column + 1; j < size; j += 1) lu[row * size + j] -= factor * lu[column * size + j]!;
    }
  }
  return Object.freeze({ size, lu, permutation, sign, singular });
}

export function logSumExp(values: CoreSpiritNumericSeries): number {
  const length = validateSeries(values);
  if (length === 0) throw new Error('logSumExp requires at least one value');
  let maximum = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) throw new Error('logSumExp inputs must be finite');
    maximum = Math.max(maximum, value);
  }
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += Math.exp(Number(values[i]) - maximum);
  return maximum + Math.log(sum);
}

export function softmax(values: CoreSpiritNumericSeries): Float64Array {
  const length = validateSeries(values);
  if (length === 0) throw new Error('softmax requires at least one value');
  let maximum = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) throw new Error('softmax inputs must be finite');
    maximum = Math.max(maximum, value);
  }
  const result = new Float64Array(length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) { result[i] = Math.exp(Number(values[i]) - maximum); sum += result[i]!; }
  for (let i = 0; i < length; i += 1) result[i] /= sum;
  return result;
}

export type CoreSpiritNumericalKernelResult = Float64Array | number | CoreSpiritLinearRegressionResult | CoreSpiritNumericMatrix | CoreSpiritLuDecomposition;

export function executeCoreSpiritNumericalKernel(
  operation: CoreSpiritNumericalKernelOperation,
  inputs: readonly CoreSpiritNumericSeries[],
  parameters: readonly number[] = [],
): CoreSpiritNumericalKernelResult {
  const requireInputs = (count: number): void => {
    if (inputs.length !== count) throw new Error(`${operation} expects ${count} input series, received ${inputs.length}`);
  };
  const p = (index: number, fallback?: number): number => {
    const value = parameters[index];
    if (value === undefined && fallback !== undefined) return fallback;
    if (value === undefined || !Number.isFinite(value)) throw new Error(`${operation} requires finite parameter at index ${index}`);
    return value;
  };
  switch (operation) {
    case 'rollingMean': requireInputs(1); return rollingMean(inputs[0]!, p(0));
    case 'rollingSum': requireInputs(1); return rollingSum(inputs[0]!, p(0));
    case 'rollingVariance': requireInputs(1); return rollingVariance(inputs[0]!, p(0), p(1, 0));
    case 'rollingStd': requireInputs(1); return rollingStd(inputs[0]!, p(0), p(1, 0));
    case 'rollingMin': requireInputs(1); return rollingMin(inputs[0]!, p(0));
    case 'rollingMax': requireInputs(1); return rollingMax(inputs[0]!, p(0));
    case 'ema': requireInputs(1); return ema(inputs[0]!, p(0));
    case 'rma': requireInputs(1); return rma(inputs[0]!, p(0));
    case 'wma': requireInputs(1); return wma(inputs[0]!, p(0));
    case 'atr': requireInputs(3); return atr(inputs[0]!, inputs[1]!, inputs[2]!, p(0));
    case 'rsi': requireInputs(1); return rsi(inputs[0]!, p(0));
    case 'linearRegression': requireInputs(1); return linearRegression(inputs[0]!, p(0));
    case 'correlation': requireInputs(2); return correlation(inputs[0]!, inputs[1]!, p(0));
    case 'covariance': requireInputs(2); return covariance(inputs[0]!, inputs[1]!, p(0), p(1, 0));
    case 'zScore': requireInputs(1); return zScore(inputs[0]!, p(0));
    case 'dotProduct': requireInputs(2); return dotProduct(inputs[0]!, inputs[1]!);
    case 'matrixMultiply': {
      requireInputs(2);
      const rows = validatePeriod(p(0), 'left matrix rows');
      const inner = validatePeriod(p(1), 'left matrix columns');
      const columns = validatePeriod(p(2), 'right matrix columns');
      if ([rows, inner, columns].some(dimension => dimension > CORE_SPIRIT_MAX_KERNEL_MATRIX_DIMENSION)) {
        throw new Error(`matrixMultiply dimensions must not exceed ${CORE_SPIRIT_MAX_KERNEL_MATRIX_DIMENSION}`);
      }
      const leftLength = validateSeries(inputs[0]!, 'matrixMultiply left data');
      const rightLength = validateSeries(inputs[1]!, 'matrixMultiply right data');
      if (leftLength !== rows * inner || rightLength !== inner * columns) {
        throw new Error('matrixMultiply input lengths must match their declared dimensions');
      }
      return matrixMultiply(
        { rows, columns: inner, data: Float64Array.from(inputs[0]!) },
        { rows: inner, columns, data: Float64Array.from(inputs[1]!) },
      );
    }
    case 'matrixDecomposition': {
      requireInputs(1);
      const size = validatePeriod(p(0), 'matrix dimension');
      if (size > CORE_SPIRIT_MAX_KERNEL_MATRIX_DIMENSION) {
        throw new Error(`matrixDecomposition dimension must not exceed ${CORE_SPIRIT_MAX_KERNEL_MATRIX_DIMENSION}`);
      }
      const length = validateSeries(inputs[0]!, 'matrixDecomposition data');
      if (length !== size * size) throw new Error('matrixDecomposition input length must match the declared square dimensions');
      return matrixDecomposition({ rows: size, columns: size, data: Float64Array.from(inputs[0]!) }, p(1, 1e-12));
    }
    case 'softmax': requireInputs(1); return softmax(inputs[0]!);
    case 'logSumExp': requireInputs(1); return logSumExp(inputs[0]!);
  }
}
