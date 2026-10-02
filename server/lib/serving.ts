import { WorkspaceClient } from '@databricks/sdk-experimental';

// Endpoints are called directly (as the app's identity) rather than through
// the AppKit serving plugin, so the raw endpoints aren't exposed as HTTP
// routes and we can stream with retrieval context injected server-side.
const client = new WorkspaceClient({});

const CHAT_ENDPOINT = () => process.env.DATABRICKS_CHAT_ENDPOINT ?? 'databricks-gpt-oss-120b';
const EMBEDDING_ENDPOINT = () => process.env.DATABRICKS_EMBEDDING_ENDPOINT ?? 'databricks-gte-large-en';
const EMBED_BATCH = 16;

async function invoke(endpoint: string, body: unknown, signal?: AbortSignal): Promise<globalThis.Response> {
  const host = await client.config.getHost();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  await client.config.authenticate(headers);
  const res = await fetch(new URL(`/serving-endpoints/${endpoint}/invocations`, host), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Serving endpoint ${endpoint} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await invoke(EMBEDDING_ENDPOINT(), { input: batch });
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    out.push(...sorted.map((d) => d.embedding));
  }
  return out;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type DeltaContent = string | { type: string; text?: string }[] | null | undefined;

/** Extracts answer text from a delta, skipping reasoning parts (gpt-oss). */
function deltaText(content: DeltaContent): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
  }
  return '';
}

/** Streams answer tokens from the chat endpoint (OpenAI-compatible SSE). */
export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const res = await invoke(CHAT_ENDPOINT(), { messages, stream: true, max_tokens: 2000 }, signal);
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(bytes, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const chunk = JSON.parse(data) as { choices?: { delta?: { content?: DeltaContent } }[] };
        const text = deltaText(chunk.choices?.[0]?.delta?.content);
        if (text) yield text;
      } catch {
        // Ignore keep-alives and partial frames.
      }
    }
  }
}
