'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { ChatMessage } from '@/lib/types';

const SUGGESTIONS = [
  'What tools does AIDI-2000 use?',
  'What semester is AIDI-2003 in?',
  'What was the capstone project in AIDI-2005?',
  'What courses are in Semester 1?',
  'What topics does AIDI-2001 cover?',
  'What are the prerequisites for AIDI-2004?',
];

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(question: string) {
    if (!question.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: question };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput('');
    setLoading(true);

    // Optimistically add an empty assistant message for streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          // Pass prior turns (excluding the empty assistant placeholder)
          history: updatedHistory.slice(0, -1),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;

          const parsed = JSON.parse(payload) as { text?: string; error?: string };
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: 'assistant',
                content: next[next.length - 1].content + parsed.text,
              };
              return next;
            });
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong.'}`,
        };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex flex-col flex-1 gap-4">
      {/* Message list */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="mt-8">
            <p className="text-center text-gray-400 text-sm mb-6">
              Ask anything about the AIDI program
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors text-gray-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-800'
              }`}
            >
              {msg.content || (loading && i === messages.length - 1 ? (
                <span className="inline-flex gap-1 text-gray-400">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce [animation-delay:0.15s]">.</span>
                  <span className="animate-bounce [animation-delay:0.3s]">.</span>
                </span>
              ) : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 mt-auto">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a course, tool, or topic..."
          disabled={loading}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 bg-white"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
