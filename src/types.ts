export interface MessageLatency {
  stt: number;
  claude: number;
  total: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  audioUri?: string;
  timestamp: Date;
  latency?: MessageLatency;
}

export type AppStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'streaming'
  | 'speaking'
  | 'error';
