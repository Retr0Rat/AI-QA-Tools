import { describe, it, expect } from 'vitest';
import { findRelevantCourses, buildContext, ragPipeline } from './rag';
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

describe('findRelevantCourses — topK and semester filtering', () => {
  it('returns at most topK courses when no code is mentioned', () => {
    const courses = Array.from({ length: 10 }, (_, i) => makeCourse(`AIDI-${1000 + i}`));
    const results = findRelevantCourses('tell me about deep learning', courses, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns all semester-1 courses when question contains "semester 1"', () => {
    const sem1 = [
      { ...makeCourse('AIDI-1000'), semester: 1 },
      { ...makeCourse('AIDI-1001'), semester: 1 },
      { ...makeCourse('AIDI-1002'), semester: 1 },
    ];
    const sem2 = [{ ...makeCourse('AIDI-2000'), semester: 2 }];
    const results = findRelevantCourses('What courses are in semester 1?', [...sem1, ...sem2], 2);
    const codes = results.map((c) => c.code);
    expect(codes).toContain('AIDI-1000');
    expect(codes).toContain('AIDI-1001');
    expect(codes).toContain('AIDI-1002');
    expect(codes).not.toContain('AIDI-2000');
  });
});

describe('buildContext', () => {
  it('includes course code and name in output', () => {
    const course: Course = {
      ...makeCourse('AIDI-2000'),
      name: 'Deep Learning and Neural Networks',
    };
    const result = buildContext([course]);
    expect(result).toContain('AIDI-2000');
    expect(result).toContain('Deep Learning and Neural Networks');
  });

  it('separates multiple courses with a divider', () => {
    const result = buildContext([makeCourse('AIDI-2000'), makeCourse('AIDI-2001')]);
    expect(result).toContain('---');
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
