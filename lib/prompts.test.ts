import { describe, it, expect } from 'vitest';
import { OUT_OF_SCOPE_RESPONSES, BASE_SYSTEM, buildSystemPrompt } from './prompts';

describe('OUT_OF_SCOPE_RESPONSES', () => {
  const REQUIRED_KEYS = ['grades', 'scheduling', 'instructors', 'registration', 'offTopic'] as const;

  it.each(REQUIRED_KEYS)('"%s" key exists and is a non-empty string', (key) => {
    expect(typeof OUT_OF_SCOPE_RESPONSES[key]).toBe('string');
    expect(OUT_OF_SCOPE_RESPONSES[key].length).toBeGreaterThan(0);
  });
});

describe('buildSystemPrompt', () => {
  const COURSES_BLOCK = '<courses>\n{"code":"AIDI-2000"}\n</courses>';

  it('output starts with BASE_SYSTEM text', () => {
    const result = buildSystemPrompt(COURSES_BLOCK);
    expect(result.startsWith(BASE_SYSTEM)).toBe(true);
  });

  it('output contains the courses block passed in', () => {
    const result = buildSystemPrompt(COURSES_BLOCK);
    expect(result).toContain(COURSES_BLOCK);
  });

  it('BASE_SYSTEM appears before the courses block', () => {
    const result = buildSystemPrompt(COURSES_BLOCK);
    expect(result.indexOf(BASE_SYSTEM)).toBeLessThan(result.indexOf(COURSES_BLOCK));
  });
});
