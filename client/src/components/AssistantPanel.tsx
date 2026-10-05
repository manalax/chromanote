import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUp, ChevronDown, FileText, MessageSquarePlus, Sparkles, Square, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
  Textarea,
} from '@databricks/appkit-ui/react';
import { api, askAssistant, type Chat, type ChatMessage, type Source } from '@/lib/api';
import { cn } from '@/lib/utils';
import { joinDictation } from '@/lib/dictation/commands';
import { useDictation } from '@/lib/dictation/useDictation';
import { MarkdownPreview } from './MarkdownPreview';
import { MicButton } from './MicButton';

const SUGGESTIONS = ['What did I write about recently?', "What's due this week?", 'Summarize my notes on a topic'];

/** Turns [n] citations into links to the cited note. */
// Models sometimes cite as 【1】 or [1†source]; all forms are treated as [1].
const CITATION_RE = /[[【](\d+)(?:†[^\]】]*)?[\]】](?!\()/g;

/** Only the sources the answer actually cites, in citation order. */
function citedSources(content: string, sources: Source[]): Source[] {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const cited = new Map<number, Source>();
  for (const m of content.matchAll(CITATION_RE)) {
    const s = byN.get(Number(m[1]));
    if (s) cited.set(s.n, s);
  }
  return [...cited.values()];
}

function linkCitations(content: string, sources: Source[] | null): string {
  if (!sources?.length) return content;
  const byN = new Map(sources.map((s) => [s.n, s]));
  return content.replace(CITATION_RE, (m, n: string) => {
    const s = byN.get(Number(n));
    return s ? `[\\[${n}\\]](/notes/${s.note_id})` : m;
  });
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState('');

  // Dictation fills the question box (after anything already typed); the
  // question is tidied when you stop, and you press Send yourself.
  const voice = useRef({ base: '', said: '' });
  const showVoice = (interim: string) => {
    const { base, said } = voice.current;
    setInput(base + said + (interim.trim() ? joinDictation(base + said, interim) : ''));
  };
  const dictation = useDictation({
    onInterim: showVoice,
    onFinal: (text) => {
      voice.current.said += joinDictation(voice.current.base + voice.current.said, text);
      showVoice('');
    },
    onStop: async () => {
      const { base, said } = voice.current;
      if (!said.trim()) return;
      const [, lead, core] = /^(\s*)([\s\S]*?)\s*$/.exec(said)!;
      const { text } = await api.tidyDictation(core, dictation.lang);
      setInput(base + lead + text);
    },
  });
  const toggleDictation = () => {
    if (dictation.state === 'idle') voice.current = { base: input, said: '' };
    dictation.toggle();
  };
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listChats()
      .then((list) => {
        setChats(list);
        if (list[0]) setChatId(list[0].id);
      })
      .catch(() => toast.error('Could not load chats'));
  }, []);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    if (streaming) return; // the in-flight stream owns the message list
    setLoading(true);
    api
      .chatMessages(chatId)
      .then(setMessages)
      .catch(() => toast.error('Could not load this chat'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when switching chats
  }, [chatId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  useEffect(() => () => abort.current?.abort(), []);

  const newChat = () => {
    abort.current?.abort();
    setChatId(null);
    setMessages([]);
  };

  const deleteChat = async (id: string) => {
    try {
      await api.deleteChat(id);
      setChats((c) => c.filter((x) => x.id !== id));
      if (id === chatId) newChat();
    } catch {
      toast.error('Could not delete chat');
    }
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || streaming) return;
    setInput('');
    setStreaming(true);

    let id = chatId;
    try {
      if (!id) {
        const chat = await api.createChat();
        id = chat.id;
        setChats((c) => [{ ...chat, title: question.slice(0, 60) }, ...c]);
        setChatId(id);
      }
    } catch {
      toast.error('Could not start a chat');
      setStreaming(false);
      return;
    }

    const assistantId = `pending-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: 'user', content: question, sources: null },
      { id: assistantId, role: 'assistant', content: '', sources: null },
    ]);
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((list) => list.map((m) => (m.id === assistantId ? fn(m) : m)));

    abort.current = new AbortController();
    try {
      await askAssistant(
        id,
        question,
        {
          onSources: (sources) => patch((m) => ({ ...m, sources })),
          onToken: (token) => patch((m) => ({ ...m, content: m.content + token })),
          onError: (message) => toast.error(message),
        },
        abort.current.signal
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast.error((err as Error).message);
    } finally {
      setStreaming(false);
      patch((m) => (m.content ? m : { ...m, content: '_No answer._' }));
    }
  };

  const current = chats.find((c) => c.id === chatId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <Sparkles className="ml-1 size-4 text-muted-foreground" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start gap-1 font-medium">
              <span className="truncate">{current?.title || 'New chat'}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuItem onSelect={newChat}>
              <MessageSquarePlus className="size-4" /> New chat
            </DropdownMenuItem>
            {chats.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Recent chats</DropdownMenuLabel>
                {chats.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => setChatId(c.id)} className="group">
                    <span className="flex-1 truncate">{c.title || 'Untitled chat'}</span>
                    <button
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100"
                      aria-label="Delete chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteChat(c.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-sm" onClick={newChat} aria-label="New chat">
          <MessageSquarePlus className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close assistant">
          <X className="size-4" />
        </Button>
      </div>

      <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-4 px-2">
            <div>
              <h3 className="text-base font-medium">Ask your notes</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Answers come from your own notes, with links to the notes they used.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <div
                key={m.id}
                className="ml-8 rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
              >
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="space-y-2">
                {m.content ? (
                  <MarkdownPreview markdown={linkCitations(m.content, m.sources)} className="prose-sm text-sm" />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="size-3.5" /> Searching your notes…
                  </div>
                )}
                {!!m.sources?.length && <SourceList sources={citedSources(m.content, m.sources)} />}
              </div>
            )
          )
        )}
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about your notes…"
            rows={2}
            className="max-h-40 min-h-[60px] resize-none pr-20"
            aria-label="Ask the assistant"
          />
          <MicButton state={dictation.state} onClick={toggleDictation} className="absolute bottom-2 right-11" />
          {streaming ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="absolute bottom-2 right-2"
              onClick={() => abort.current?.abort()}
              aria-label="Stop"
            >
              <Square className="size-3" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              className="absolute bottom-2 right-2"
              disabled={!input.trim()}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <Link
          key={s.note_id}
          to={`/notes/${s.note_id}`}
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs',
            'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
          )}
        >
          <span className="font-medium">{s.n}</span>
          <FileText className="size-3" />
          <span className="truncate">{s.title}</span>
        </Link>
      ))}
    </div>
  );
}
