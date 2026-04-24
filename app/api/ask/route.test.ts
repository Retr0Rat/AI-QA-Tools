import { describe, it, expect, vi, beforeAll } from 'vitest';

// Minimal async iterator that yields one text event then done
function makeStream() {
  return {
    [Symbol.asyncIterator]() {
      const events = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      ];
      let i = 0;
      return {
        next: async () =>
          i < events.length
            ? { value: events[i++], done: false }
            : { value: undefined, done: true },
      };
    },
  };
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        stream: vi.fn().mockReturnValue(makeStream()),
      },
    };
  }),
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
  it('returns 200 with a streaming SSE response for a valid question', async () => {
    const req = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What tools does AIDI-2000 use?' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    // Consume the stream and check at least one data frame was sent
    const text = await res.text();
    expect(text).toContain('data:');
  });

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
