import { isCoreSpiritTemporalType, parseCoreSpiritTemporalType, temporalAssignmentCompatible } from './temporalTypes';

export type CoreSpiritScalarType =
  | 'int'
  | 'float'
  | 'number'
  | 'boolean'
  | 'string'
  | 'null'
  | 'probability';

export type CoreSpiritType =
  | CoreSpiritScalarType
  | `scalar<${string}>`
  | `series<${string}>`
  | `window<${string}>`
  | `state<${string}>`
  | `event<${string}>`
  | `snapshot<${string}>`
  | `stream<${string}>`
  | `confirmed<${string}>`
  | `developing<${string}>`
  | `forecast<${string}>`
  | `array<${string}>`
  | `matrix<${string}>`
  | `tensor<${string}>`
  | `model<${string}>`
  | `prediction<${string}>`
  | `distribution<${string}>`
  | `feature<${string}>`
  | `featureSet<${string}>`
  | `experiment<${string}>`
  | `trainingData<${string}>`
  | `dataset<${string}>`
  | `modelArtifact<${string}>`
  | 'trade'
  | 'orderbook'
  | 'footprint'
  | 'volume-profile'
  | `udt:${string}`
  | 'ui:root'
  | 'ui:panel'
  | 'ui:control'
  | 'visual:root'
  | 'visual:object'
  | 'visual:chart-root'
  | 'visual:area'
  | 'visual:point'
  | 'visual:range'
  | 'visual:position'
  | 'app:root'
  | 'app:widget'
  | 'scan:root'
  | 'scan:candidate'
  | 'market:ref'
  | 'timeframe:ref'
  | 'model:ref'
  | 'event'
  | 'order-intent'
  | 'unknown';

export type CoreSpiritNumericScalar = 'int' | 'float' | 'number';
export type CoreSpiritSeriesType = `series<${string}>`;
export type CoreSpiritStateType = `state<${string}>`;
export type CoreSpiritWindowType = `window<${string}>`;
export type CoreSpiritTemporalValueType =
  | `confirmed<${string}>`
  | `developing<${string}>`
  | `forecast<${string}>`;

export type CoreSpiritModelType = `model<${string}>`;
export type CoreSpiritPredictionType = `prediction<${string}>`;
export type CoreSpiritFeatureType = `feature<${string}>`;
export type CoreSpiritFeatureSetType = `featureSet<${string}>`;
export type CoreSpiritDistributionType = `distribution<${string}>`;
export type CoreSpiritResearchObjectType =
  | `experiment<${string}>`
  | `trainingData<${string}>`
  | `dataset<${string}>`
  | `modelArtifact<${string}>`;

export const isNumericScalarType = (type: CoreSpiritType): type is CoreSpiritNumericScalar =>
  type === 'int' || type === 'float' || type === 'number' || type === 'scalar<float>' || type === 'scalar<int>' || type === 'scalar<number>';

export const isSeriesType = (type: CoreSpiritType): type is CoreSpiritSeriesType =>
  type.startsWith('series<') && type.endsWith('>');

export const isStateType = (type: CoreSpiritType): type is CoreSpiritStateType =>
  type.startsWith('state<') && type.endsWith('>');

export const isWindowType = (type: CoreSpiritType): type is CoreSpiritWindowType =>
  type.startsWith('window<') && type.endsWith('>');

export const isTemporalValueType = (type: CoreSpiritType): type is CoreSpiritTemporalValueType =>
  type.startsWith('confirmed<') || type.startsWith('developing<') || type.startsWith('forecast<');

export const isEventType = (type: CoreSpiritType): boolean =>
  type.startsWith('event<') || type === 'event';

export const isStreamType = (type: CoreSpiritType): boolean =>
  type.startsWith('stream<');

export const isSnapshotType = (type: CoreSpiritType): boolean =>
  type.startsWith('snapshot<');

export const isNumericType = (type: CoreSpiritType): boolean => {
  if (isNumericScalarType(type) || type === 'probability') return true;
  if (isSeriesType(type) || isWindowType(type) || isStateType(type) || isTemporalValueType(type)) {
    const parsed = parseCoreSpiritTemporalType(type);
    return parsed ? ['int', 'float', 'number', 'price', 'volume', 'currency', 'duration', 'time'].includes(parsed.element) : false;
  }
  if (isPredictionType(type) || isFeatureType(type)) {
    const element = type.slice(type.indexOf('<') + 1, -1).toLowerCase();
    return ['int','float','number','price','volume','currency','duration','time'].includes(element);
  }
  return false;
};

export const isModelType = (type: CoreSpiritType): type is CoreSpiritModelType => type.startsWith('model<') && type.endsWith('>');
export const isPredictionType = (type: CoreSpiritType): type is CoreSpiritPredictionType => type.startsWith('prediction<') && type.endsWith('>');
export const isFeatureType = (type: CoreSpiritType): type is CoreSpiritFeatureType => type.startsWith('feature<') && type.endsWith('>');
export const isFeatureSetType = (type: CoreSpiritType): type is CoreSpiritFeatureSetType => type.startsWith('featureSet<') && type.endsWith('>');
export const isDistributionType = (type: CoreSpiritType): type is CoreSpiritDistributionType => type.startsWith('distribution<') && type.endsWith('>');
export const isForecastType = (type: CoreSpiritType): boolean => type.startsWith('forecast<') && type.endsWith('>');
export const isResearchObjectType = (type: CoreSpiritType): type is CoreSpiritResearchObjectType =>
  type.startsWith('experiment<') || type.startsWith('trainingData<') || type.startsWith('dataset<') || type.startsWith('modelArtifact<');

export const isBooleanType = (type: CoreSpiritType): boolean => {
  if (type === 'boolean') return true;
  if (type === 'series<boolean>' || type === 'state<boolean>' || type === 'window<boolean>') return true;
  const parsed = parseCoreSpiritTemporalType(type);
  return parsed?.element === 'boolean' && ['confirmed', 'developing', 'forecast'].includes(parsed.container);
};

export const isStringType = (type: CoreSpiritType): boolean => {
  if (type === 'string') return true;
  if (type === 'series<string>' || type === 'state<string>' || type === 'window<string>') return true;
  const parsed = parseCoreSpiritTemporalType(type);
  return parsed?.element === 'string' && ['confirmed', 'developing', 'forecast'].includes(parsed.container);
};

export const isNullableType = (type: CoreSpiritType): boolean =>
  type === 'null' || type === 'unknown' || type.endsWith('>');

export function seriesOf(type: CoreSpiritType): CoreSpiritType {
  if (type === 'int' || type === 'float' || type === 'number') return `series<${type}>` as CoreSpiritType;
  if (type === 'boolean' || type === 'string') return `series<${type}>` as CoreSpiritType;
  if (isSeriesType(type)) return type;
  return 'unknown';
}

export function stateOf(type: CoreSpiritType): CoreSpiritType {
  if (type === 'int' || type === 'float' || type === 'number' || type === 'boolean' || type === 'string') return `state<${type}>` as CoreSpiritType;
  if (isStateType(type)) return type;
  return 'unknown';
}

export function windowOf(type: CoreSpiritType): CoreSpiritType {
  if (type === 'int' || type === 'float' || type === 'number' || type === 'boolean' || type === 'string') return `window<${type}>` as CoreSpiritType;
  if (isWindowType(type)) return type;
  return 'unknown';
}

export function elementType(type: CoreSpiritType): CoreSpiritType {
  const parsed = parseCoreSpiritTemporalType(type);
  if (!parsed) return 'unknown';
  return parsed.element as CoreSpiritType;
}

export function normalizeDeclaredType(typeName: string): CoreSpiritType {
  const name = typeName.trim();
  if (name === 'bool' || name === 'boolean') return 'boolean';
  if (name === 'float') return 'float';
  if (name === 'int') return 'int';
  if (name === 'number') return 'number';
  if (name === 'string') return 'string';
  if (name === 'probability') return 'probability';
  if (name === 'null' || name === 'na') return 'null';
  if (name === 'price' || name === 'volume' || name === 'time' || name === 'duration' || name === 'currency') return name as CoreSpiritType;
  if (isCoreSpiritTemporalType(name)) return name as CoreSpiritType;
  if (/^(array|matrix|tensor|model|prediction|forecast|distribution|feature|featureSet|experiment|trainingData|dataset|modelArtifact)<.+>$/i.test(name)) return name as CoreSpiritType;
  if (name.startsWith('matrix<') && name.endsWith('>')) return name as CoreSpiritType;
  if (name.startsWith('tensor<') && name.endsWith('>')) return name as CoreSpiritType;
  if (['trade','orderbook','footprint'].includes(name)) return name as CoreSpiritType;
  if (name === 'volumeProfile' || name === 'volume-profile') return 'volume-profile';
  return `udt:${name}`;
}

export function compatible(expected: CoreSpiritType, actual: CoreSpiritType): boolean {
  if (expected === 'unknown' || actual === 'unknown') return true;
  if (expected === actual) return true;
  if (actual === 'null') return true;
  if (temporalAssignmentCompatible(expected, actual)) return true;
  if (isModelType(expected) && actual === 'model:ref') return true;
  if (expected === 'model:ref' && isModelType(actual)) return true;
  if (expected === 'number') return isNumericType(actual);
  if (expected === 'probability') return actual === 'probability' || actual === 'number';
  if (expected === 'float') return actual === 'int' || actual === 'float' || actual === 'number';
  if (expected === 'series<number>') return isSeriesType(actual);
  if (isPredictionType(expected) && isPredictionType(actual)) return expected === actual || expected === 'prediction<number>' || actual === 'prediction<number>';
  if (isForecastType(expected) && isForecastType(actual)) return expected === actual || expected === 'forecast<number>' || actual === 'forecast<number>'; 
  if (isFeatureType(expected) && isFeatureType(actual)) return expected === actual || expected === 'feature<number>' || actual === 'feature<number>';
  if (isFeatureSetType(expected) && isFeatureSetType(actual)) return expected === actual || expected === 'featureSet<number>' || actual === 'featureSet<number>';
  if (expected === 'series<float>') return isSeriesType(actual);
  if (expected === 'boolean') return actual === 'series<boolean>' || actual === 'boolean';
  if (expected === 'string') return actual === 'series<string>' || actual === 'string';
  if (expected === 'series<boolean>') return actual === 'boolean';
  if (expected === 'series<string>') return actual === 'string';
  if (expected === 'series<int>') return actual === 'int';
  return false;
}

export function joinTypes(a: CoreSpiritType, b: CoreSpiritType): CoreSpiritType {
  if (a === 'null') return b;
  if (b === 'null') return a;
  if (a === b) return a;
  if (isSeriesType(a) || isSeriesType(b)) {
    const ae = isSeriesType(a) ? elementType(a) : a;
    const be = isSeriesType(b) ? elementType(b) : b;
    const joined = joinScalarTypes(ae, be);
    return joined === 'unknown' ? 'unknown' : seriesOf(joined);
  }
  return joinScalarTypes(a, b);
}

function joinScalarTypes(a: CoreSpiritType, b: CoreSpiritType): CoreSpiritType {
  if (a === 'null') return b;
  if (b === 'null') return a;
  if (a === b) return a;
  if (isNumericScalarType(a) && isNumericScalarType(b)) {
    if (a === 'number' || b === 'number') return 'number';
    return 'float';
  }
  if ((a === 'boolean' && b === 'boolean') || (a === 'string' && b === 'string')) return a;
  return 'unknown';
}

export function isAssignable(expected: CoreSpiritType, actual: CoreSpiritType): boolean {
  return compatible(expected, actual);
}
