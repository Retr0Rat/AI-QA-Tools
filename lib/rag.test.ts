import { describe, it, expect } from 'vitest';
import { findRelevantCourses } from './rag';
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
