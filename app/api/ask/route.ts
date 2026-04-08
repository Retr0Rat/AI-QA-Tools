import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { fetchCourses } from '@/lib/gcp';
import { findRelevantCourses, buildContext } from '@/lib/rag';
import { ChatMessage } from '@/lib/types';

export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SYSTEM = `You are a knowledgeable assistant for Durham College's Artificial Intelligence Analysis and Design (AIDI) post-graduate certificate program.
You help students, prospects, and faculty answer questions about the program's courses, tools, topics, and projects.

Guidelines:
- Answer accurately using the course data provided in <courses>.
- When a course code is mentioned (e.g. AIDI-2000), focus on that course.
- For "what semester" questions, state the exact semester number.
- For "what tools" questions, list every tool from the course data.
- For project/capstone questions, describe the project in detail.
- If the data doesn't contain the answer, say so honestly instead of guessing.
- Keep answers clear and concise.`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const question: string = body.question?.trim() ?? '';
  const history: ChatMessage[] = body.history ?? [];

  if (!question) {
    return new Response('question is required', { status: 400 });
  }

  // RAG: fetch all courses, find the most relevant ones
  const allCourses = await fetchCourses();
  const relevant = findRelevantCourses(question, allCourses);
  const context = buildContext(relevant);

  const systemPrompt = `${BASE_SYSTEM}

<courses>
${context}
</courses>`;

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
