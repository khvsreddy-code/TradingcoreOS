import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const schemaPath = path.join(root, 'src/services/coreSpirit/indicatorSettingsSchema.ts');
const schema = fs.readFileSync(schemaPath, 'utf8');

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

const fieldIndexDecl = schema.indexOf('const fieldByPath = buildIndicatorSettingsFieldIndex(schema);');
const validationLoop = schema.indexOf('if (field.dependency) errors.push(...validateCondition(field.dependency, paths, field.path, 0, fieldByPath));');
const helperDecl = schema.indexOf('function buildIndicatorSettingsFieldIndex(schema: IndicatorSettingsSchema)');
const requiredValidatorSignature = schema.includes(
  'fieldByPath: ReadonlyMap<string, IndicatorSettingField>',
);

assert(helperDecl >= 0, 'indicator settings field-index helper is missing');
assert(fieldIndexDecl >= 0, 'canonical fieldByPath declaration is missing');
assert(validationLoop >= 0, 'dependency validation no longer uses the canonical field index');
assert(fieldIndexDecl < validationLoop, 'fieldByPath must be initialized before dependency validation');
assert(requiredValidatorSignature, 'validateCondition must require the field index at compile time');
assert(!schema.includes('fieldByPath = new Map<string, IndicatorSettingField>()'), 'validateCondition must not provide an unsafe optional field index');

console.log('TCO_V115_INDICATOR_DEPENDENCY_FIELD_INDEX_CONTRACT_OK');
