import { describe, it, expect } from 'vitest';
import { findRelevantCourses, ragPipeline } from './rag';
import type { Course } from './types';

function makeCourse(code: string): Course {
  return {
    code,
    name: `Course ${code}`,
    semester: 1,
    credits: 3,
    description: 'A course description',
    tools: [],
    topics: [],
    projects: [],
    prerequisites: [],
    raw_content: '',
  };
}

describe('findRelevantCourses', () => {
  it('always returns a course when its exact code is mentioned in the question', () => {
    const courses = [makeCourse('AIDI-2000'), makeCourse('AIDI-2001'), makeCourse('AIDI-2002')];
    const results = findRelevantCourses('Tell me about AIDI-2000', courses);
    expect(results.map((c) => c.code)).toContain('AIDI-2000');
  });

  it('returns the explicitly mentioned course even when it scores lower than others', () => {
    const lowMatch = makeCourse('AIDI-1000');
    // Fill other courses with keywords from the question so they score higher
    const highScorers = Array.from({ length: 5 }, (_, i) => ({
      ...makeCourse(`AIDI-200${i}`),
      description: 'machine learning deep neural networks python tensorflow',
    }));
    const question = 'machine learning deep neural networks python tensorflow AIDI-1000';
    const results = findRelevantCourses(question, [lowMatch, ...highScorers], 4);
    expect(results.map((c) => c.code)).toContain('AIDI-1000');
  });
});

describe('ragPipeline', () => {
  it('wraps output in <courses> tags', () => {
    const result = ragPipeline('anything', [makeCourse('AIDI-2000')]);
    expect(result).toMatch(/^<courses>/);
    expect(result).toMatch(/<\/courses>$/);
  });

  it('includes the explicitly mentioned course code in the output', () => {
    const courses = [makeCourse('AIDI-2000'), makeCourse('AIDI-2001'), makeCourse('AIDI-2002')];
    const result = ragPipeline('Tell me about AIDI-2001', courses);
    expect(result).toContain('AIDI-2001');
  });

  it('returns well-formed tags even with an empty course list', () => {
    const result = ragPipeline('anything', []);
    expect(result).toBe('<courses>\n\n</courses>');
  });
});
