import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DC AI Program Q&A',
  description: "Ask anything about Durham College's AI post-graduate program.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
