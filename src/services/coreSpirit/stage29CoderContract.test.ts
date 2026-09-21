import { describe, expect, it } from 'vitest';
import { CoreSpiritEditorModel } from './editorModel';
import { getCoreSpiritCompletionContext, getCoreSpiritFoldingRanges } from './languageService';

describe('CoreSpirit v29 Stage 4 coder contract', () => {
  it('supports contextual completion and navigation metadata', () => {
    const source = 'let fast = ema(close, 20)\nplot(fast)';
    const model = new CoreSpiritEditorModel(source);
    const completion = model.completionAt(source.length);
    expect(completion.mode).toBe('call');
    expect(completion.completions.some(x => x.label === 'plot')).toBe(true);
    expect(model.definitionAt(source.indexOf('fast)') + 2)?.name).toBe('fast');
  });

  it('supports undo/redo and folding ranges', () => {
    const model = new CoreSpiritEditorModel('if (true) {\nplot(close)\n}');
    const before = model.getSource();
    model.applyEdit({ start: before.length, end: before.length, text: '\nplot(open)' });
    expect(model.getSource()).toContain('plot(open)');
    model.undo();
    expect(model.getSource()).toBe(before);
    model.redo();
    expect(model.getSource()).toContain('plot(open)');
    expect(getCoreSpiritFoldingRanges(before).length).toBe(1);
  });

  it('classifies completion context', () => {
    expect(getCoreSpiritCompletionContext('ema(close, 1', 12).mode).toBe('argument');
    expect(getCoreSpiritCompletionContext('plot(', 5).mode).toBe('argument');
  });
});
