import { Course } from './types';

/** Tokenize text into a lowercase word set, filtering stop words. */
function tokenSet(text: string): Set<string> {
  const STOP = new Set(['the', 'and', 'for', 'are', 'this', 'that', 'with', 'from', 'have', 'will']);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
  );
}

/** Score a course against a question. Returns a numeric relevance score. */
function scoreRelevance(question: string, course: Course): number {
  const qTokens = tokenSet(question);
  const qUpper = question.toUpperCase();

  // Exact course code mention in question — highest signal
  const codeBonus = qUpper.includes(course.code) ? 20 : 0;

  const corpusText = [
    course.code,
    course.name,
    course.description,
    ...course.tools,
    ...course.topics,
    ...course.projects.map((p) => p.name + ' ' + p.description),
  ].join(' ');

  const cTokens = tokenSet(corpusText);

  let overlap = 0;
  for (const t of qTokens) {
    if (cTokens.has(t)) overlap++;
  }

  return codeBonus + overlap;
}

/**
 * Return the topK most relevant courses for the question.
 * Always includes any course whose code is explicitly mentioned.
 */
export function findRelevantCourses(question: string, courses: Course[], topK = 4): Course[] {
  // Always include exact code matches regardless of score
  const explicit = courses.filter((c) => question.toUpperCase().includes(c.code));

  const ranked = [...courses]
    .map((c) => ({ course: c, score: scoreRelevance(question, c) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.course);

  const merged = [...new Map([...explicit, ...ranked].map((c) => [c.code, c])).values()];
  return merged.slice(0, Math.max(topK, explicit.length));
}

/** Serialize courses into a compact context block for the prompt. */
export function buildContext(courses: Course[]): string {
  return courses
    .map((c) =>
      JSON.stringify(
        {
          code: c.code,
          name: c.name,
          semester: c.semester,
          credits: c.credits,
          description: c.description,
          tools: c.tools,
          topics: c.topics,
          projects: c.projects,
          prerequisites: c.prerequisites,
        },
        null,
        2
      )
    )
    .join('\n\n---\n\n');
}
