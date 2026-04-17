import { describe, expect, it } from 'vitest';
import { extractJson, extractJsonCandidates } from './extract.js';

describe('extractJson', () => {
  it('extracts the first valid JSON object from surrounding prose', () => {
    const raw = [
      'Here is a quick note: {not actually valid json}.',
      '```json',
      '{"mode":"advanced","nested":{"cards":[{"id":"strike"}]}}',
      '```',
      'Extra explanation after the payload.',
    ].join('\n');

    expect(extractJson(raw)).toBe('{"mode":"advanced","nested":{"cards":[{"id":"strike"}]}}');
  });

  it('extracts arrays with nested objects and trailing text', () => {
    const raw = '[{"id":"a"},{"id":"b","meta":{"phase":2}}]\nThis is the rest of the response.';

    expect(extractJson(raw)).toBe('[{"id":"a"},{"id":"b","meta":{"phase":2}}]');
  });

  it('returns candidates in source order when multiple JSON blocks are present', () => {
    const raw = [
      'Example verification array:',
      '[{"type":"wait","waitMs":3000}]',
      'Actual plan:',
      '{"gameTitle":"Test","phases":[]}',
    ].join('\n');

    expect(extractJsonCandidates(raw)).toEqual([
      '[{"type":"wait","waitMs":3000}]',
      '{"gameTitle":"Test","phases":[]}',
    ]);
  });
});
