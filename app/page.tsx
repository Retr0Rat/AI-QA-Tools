import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">
            DC AI Program Q&A
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Durham College &mdash; Artificial Intelligence Analysis &amp; Design
          </p>
        </div>
      </header>
      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 py-6">
        <ChatInterface />
      </div>
    </main>
  );
}
