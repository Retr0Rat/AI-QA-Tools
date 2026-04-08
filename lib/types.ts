export interface Project {
  name: string;
  description: string;
  type: 'capstone' | 'assignment' | 'lab';
}

export interface Course {
  code: string;
  name: string;
  semester: number;
  credits: number;
  description: string;
  tools: string[];
  topics: string[];
  projects: Project[];
  prerequisites: string[];
  raw_content: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
