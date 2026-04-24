import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { fetchCourses } from '@/lib/gcp';
import { findRelevantCourses, buildContext } from '@/lib/rag';
import { buildSystemPrompt } from '@/lib/prompts';
import { ChatMessage } from '@/lib/types';

export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 1024;

export async function POST(req: NextRequest) {
  const start = Date.now();
  const body = await req.json();
  const question: string = body.question?.trim() ?? '';
  const history: ChatMessage[] = body.history ?? [];

  console.log(`[ask] ${new Date().toISOString()} | question: "${question}" | history: ${history.length} messages`);

  if (!question) {
    return new Response('question is required', { status: 400 });
  }

  const courses = await fetchCourses();
  const relevant = findRelevantCourses(question, courses);
  console.log(`[ask] retrieved courses: ${relevant.map((c) => c.code).join(', ')}`);

  const coursesBlock = `<courses>\n${buildContext(relevant)}\n</courses>`;
  const systemPrompt = buildSystemPrompt(coursesBlock);
  console.log(`[ask] system prompt length: ${systemPrompt.length} chars | model: ${MODEL} | max_tokens: ${MAX_TOKENS}`);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
    { role: 'user', content: question },
  ];

  // Stream the response back as SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages,
        });

        for await (const event of claudeStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        console.log(`[ask] done | latency: ${Date.now() - start}ms`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
