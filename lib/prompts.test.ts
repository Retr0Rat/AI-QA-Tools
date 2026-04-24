import { describe, it, expect } from 'vitest';
import { OUT_OF_SCOPE_RESPONSES, BASE_SYSTEM, buildSystemPrompt } from './prompts';

describe('OUT_OF_SCOPE_RESPONSES', () => {
  const REQUIRED_KEYS = [
    'grades', 'scheduling', 'instructors', 'registration', 'fees', 'intake', 'offTopic',
  ] as const;

  it.each(REQUIRED_KEYS)('"%s" key exists and is a non-empty string', (key) => {
    expect(typeof OUT_OF_SCOPE_RESPONSES[key]).toBe('string');
    expect(OUT_OF_SCOPE_RESPONSES[key].length).toBeGreaterThan(0);
  });
});

describe('BASE_SYSTEM out-of-scope coverage', () => {
  it('contains a refusal for tuition / fees questions', () => {
    expect(BASE_SYSTEM.toLowerCase()).toMatch(/tuition|fees|program cost/);
  });

  it('contains a refusal for intake / application deadline questions', () => {
    expect(BASE_SYSTEM.toLowerCase()).toMatch(/intake|application deadline|when the program starts/);
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
