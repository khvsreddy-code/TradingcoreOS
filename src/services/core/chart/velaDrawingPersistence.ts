import { migrate } from '../../../../vendor/vela/src/core/drawings/document';
import type { SerializedDrawing } from '../../../../vendor/vela/src/core/drawings/Drawing';

export function migrateVelaDrawingDocument(value: unknown): SerializedDrawing[] {
  return migrate(value).drawings;
}
