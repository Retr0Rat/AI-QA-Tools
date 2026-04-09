import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { fetchCourses } from '@/lib/gcp';
import { ragPipeline } from '@/lib/rag';
import { buildSystemPrompt } from '@/lib/prompts';
import { ChatMessage } from '@/lib/types';

export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const question: string = body.question?.trim() ?? '';
  const history: ChatMessage[] = body.history ?? [];

  if (!question) {
    return new Response('question is required', { status: 400 });
  }

  const courses = await fetchCourses();
  const systemPrompt = buildSystemPrompt(ragPipeline(question, courses));

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
          model: 'claude-opus-4-6',
          max_tokens: 1024,
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
