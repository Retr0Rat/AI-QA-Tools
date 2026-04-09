import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock heavy dependencies before importing the route
vi.mock('@anthropic-ai/sdk', () => ({
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  default: vi.fn().mockImplementation(function () {}),
}));

vi.mock('@/lib/gcp', () => ({
  fetchCourses: vi.fn().mockResolvedValue([]),
}));

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  const mod = await import('./route');
  POST = mod.POST as unknown as (req: Request) => Promise<Response>;
});

describe('POST /api/ask', () => {
  it('returns 400 when question is empty string', async () => {
    const req = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when question is whitespace only', async () => {
    const req = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '   ' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when question field is missing', async () => {
    const req = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
