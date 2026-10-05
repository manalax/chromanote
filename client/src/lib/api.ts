export type FontKey = 'inter' | 'lora' | 'mono' | 'caveat';
export type Priority = 0 | 1 | 2 | 3 | 4;

export interface Tag {
  id: string;
  name: string;
  color: string;
  note_count?: number;
}

interface NoteBase {
  id: string;
  title: string;
  color: string | null;
  text_color: string | null;
  font: FontKey | null;
  priority: Priority;
  due_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface NoteSummary extends NoteBase {
  excerpt: string;
  /** Board column for the Custom order board. */
  board_col: number | null;
}

export interface Note extends NoteBase {
  body: string;
}

export interface NoteRef {
  id: string;
  title: string;
  color?: string | null;
}

export interface Settings {
  user: string;
  theme: 'system' | 'light' | 'dark';
  bg_color: string | null;
  default_font: FontKey;
  default_note_color: string | null;
  default_text_color: string | null;
  /** BCP-47 tag; null = browser default. */
  dictation_lang: string | null;
}

export interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

export interface Source {
  n: number;
  note_id: string;
  title: string;
}

export interface ChatMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[] | null;
}

export interface Graph {
  nodes: {
    id: string;
    title: string;
    color: string | null;
    priority: Priority;
    graph_x: number | null;
    graph_y: number | null;
  }[];
  edges: { source: string; target: string }[];
}

export interface NoteFilters {
  q?: string;
  tag?: string;
  priority?: Priority;
  due?: 'overdue' | 'soon' | 'any';
  status?: 'active' | 'archived' | 'trash';
  sort?: 'custom' | 'updated' | 'created' | 'priority' | 'due' | 'title';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const api = {
  listNotes: (f: NoteFilters = {}) => request<NoteSummary[]>('GET', `/api/notes${query({ ...f })}`),
  getNote: (id: string) => request<Note>('GET', `/api/notes/${id}`),
  createNote: (
    input: Partial<Pick<Note, 'title' | 'body' | 'color' | 'text_color' | 'font' | 'priority' | 'due_at'>> & {
      graph_x?: number;
      graph_y?: number;
    } = {}
  ) => request<Note>('POST', '/api/notes', input),
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'body' | 'color' | 'text_color' | 'font' | 'priority' | 'due_at'>> & {
      archived?: boolean;
    }
  ) => request<Note>('PATCH', `/api/notes/${id}`, patch),
  setNoteTags: (id: string, tagIds: string[]) => request<Note>('PUT', `/api/notes/${id}/tags`, { tagIds }),
  trashNote: (id: string) => request<void>('DELETE', `/api/notes/${id}`),
  restoreNote: (id: string) => request<Note>('POST', `/api/notes/${id}/restore`),
  deleteNoteForever: (id: string) => request<void>('DELETE', `/api/notes/${id}/permanent`),
  moveNote: (id: string, column: number, beforeId: string | null) =>
    request<{ id: string; sort_order: number; board_col: number }>('POST', `/api/notes/${id}/move`, {
      column,
      before_id: beforeId,
    }),
  emptyTrash: () => request<void>('DELETE', '/api/notes/trash'),
  backlinks: (id: string) => request<NoteRef[]>('GET', `/api/notes/${id}/backlinks`),
  titles: () => request<NoteRef[]>('GET', '/api/notes/titles'),
  resolve: (title: string) => request<{ id: string; created: boolean }>('POST', '/api/notes/resolve', { title }),
  graph: () => request<Graph>('GET', '/api/graph'),
  addLink: (sourceId: string, targetId: string) =>
    request<{ added: boolean; reason?: 'exists' | 'self' }>('POST', '/api/graph/links', {
      source_id: sourceId,
      target_id: targetId,
    }),
  removeLink: (sourceId: string, targetId: string) =>
    request<void>('DELETE', '/api/graph/links', { source_id: sourceId, target_id: targetId }),
  setPosition: (id: string, x: number | null, y: number | null) =>
    request<void>('PUT', `/api/notes/${id}/position`, { x, y }),
  resetLayout: () => request<void>('DELETE', '/api/graph/positions'),
  renameNote: (id: string, title: string) =>
    request<{ note: Note; rewritten: number }>('POST', `/api/notes/${id}/rename`, { title }),

  listTags: () => request<Tag[]>('GET', '/api/tags'),
  createTag: (name: string, color: string) => request<Tag>('POST', '/api/tags', { name, color }),
  updateTag: (id: string, patch: Partial<Pick<Tag, 'name' | 'color'>>) =>
    request<Tag>('PATCH', `/api/tags/${id}`, patch),
  deleteTag: (id: string) => request<void>('DELETE', `/api/tags/${id}`),

  tidyDictation: (text: string, lang?: string) =>
    request<{ text: string; changed: boolean }>('POST', '/api/dictation/tidy', { text, lang }),
  createVoiceNote: (transcript: string, lang?: string) =>
    request<Note>('POST', '/api/notes/voice', { transcript, lang }),

  getSettings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (patch: Partial<Omit<Settings, 'user'>>) => request<Settings>('PUT', '/api/settings', patch),

  listChats: () => request<Chat[]>('GET', '/api/chats'),
  createChat: () => request<Chat>('POST', '/api/chats'),
  deleteChat: (id: string) => request<void>('DELETE', `/api/chats/${id}`),
  chatMessages: (id: string) => request<ChatMessage[]>('GET', `/api/chats/${id}/messages`),

  async uploadImage(file: Blob): Promise<string> {
    const res = await fetch('/api/images', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(
        res.status,
        err.error ?? (res.status === 413 ? 'Image is larger than 10 MB' : 'Upload failed')
      );
    }
    return ((await res.json()) as { url: string }).url;
  },
};

export interface StreamHandlers {
  onSources: (sources: Source[]) => void;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}

/** POSTs a question and parses the server's SSE stream. */
export async function askAssistant(chatId: string, content: string, handlers: StreamHandlers, signal?: AbortSignal) {
  const res = await fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The assistant reports note dates in the user's own time zone.
    body: JSON.stringify({ content, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, err.error ?? 'The assistant is unavailable');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (!event || data === undefined) continue;
      const payload: unknown = JSON.parse(data);
      if (event === 'sources') handlers.onSources(payload as Source[]);
      else if (event === 'token') handlers.onToken(payload as string);
      else if (event === 'error') handlers.onError(payload as string);
    }
  }
}
