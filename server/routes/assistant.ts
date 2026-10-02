import { z } from 'zod';
import { type AppKitInstance, HttpError, getUserId, route } from '../lib/appkit';
import { type NoteDetails, embedQuery, loadNoteMeta, retrieveSimilar, retrieveTagged } from '../lib/rag';
import { mentionedTags } from '../lib/tagMatch';
import { formatForModel, safeTimeZone } from '../lib/time';
import { type ChatMessage, streamChat } from '../lib/serving';

const HISTORY_TURNS = 12;

const RECENT_NOTES = 15;

const SYSTEM_PROMPT = `You are Chromanote's assistant. You answer questions about the user's personal notes.
Use only the numbered notes below as your source of facts about the user's notes.
Cite the notes you use inline as [1], [2], etc. (plain ASCII square brackets), matching the note numbers.
Each note lists its current metadata: tags, priority, whether it is archived, when it was created and last edited, its due date, and which notes it links to and is linked from. Dates are in the user's time zone; compare them with the current date below.
Tags, priorities and links are always up to date: if a tag was renamed, only the current name exists. "Your tags" lists every tag the user has.
Archived notes are hidden from the user's main list but are still their notes.
"Note excerpts" contain note text. "Recently edited notes" lists only titles and metadata, not contents.
If the notes don't contain the answer, say so plainly and suggest what the user could write down. Do not invent note contents.
Format answers in concise Markdown.`;

const PRIORITY_LABELS = ['None', 'Low', 'Medium', 'High', 'Urgent'];

export interface Source {
  n: number;
  note_id: string;
  title: string;
}

/** What the assistant can see about a note besides its text. */
export interface NoteMeta {
  note_id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
  due_at: Date | string | null;
}

export interface ContextInput {
  chunks: (NoteMeta & { content: string })[];
  recent: NoteMeta[];
  details: Map<string, NoteDetails>;
  tags: { name: string; note_count: number }[];
  mentionedTags: string[];
}

function describeNote(note: NoteMeta, details: NoteDetails | undefined, timeZone: string): string {
  const parts: string[] = [];
  if (details?.tags.length) parts.push(`tags: ${details.tags.join(', ')}`);
  if (details?.priority) parts.push(`priority: ${PRIORITY_LABELS[details.priority] ?? details.priority}`);
  if (details?.archived) parts.push('archived');
  parts.push(`created ${formatForModel(note.created_at, timeZone)}`);
  parts.push(`last edited ${formatForModel(note.updated_at, timeZone)}`);
  if (note.due_at) parts.push(`due ${formatForModel(note.due_at, timeZone)}`);
  const quote = (titles: string[]) => titles.map((t) => `"${t}"`).join(', ');
  if (details?.links_to.length) parts.push(`links to: ${quote(details.links_to)}`);
  if (details?.linked_from.length) parts.push(`linked from: ${quote(details.linked_from)}`);
  return parts.join(' · ');
}

/**
 * Builds the model context: retrieved excerpts, then an index of recently
 * edited notes, then the user's tags. Notes are numbered once across
 * sections (several chunks of one note share a number).
 */
export function buildContext(input: ContextInput, timeZone: string): { context: string; sources: Source[] } {
  const sources: Source[] = [];
  const byNote = new Map<string, Source>();
  const number = (note: NoteMeta) => {
    let source = byNote.get(note.note_id);
    if (!source) {
      source = { n: sources.length + 1, note_id: note.note_id, title: note.title || 'Untitled' };
      byNote.set(note.note_id, source);
      sources.push(source);
    }
    return source;
  };
  const describe = (note: NoteMeta) => describeNote(note, input.details.get(note.note_id), timeZone);

  const excerpts = input.chunks.map((chunk) => {
    const source = number(chunk);
    return `[${source.n}] "${source.title}" (${describe(chunk)})\n${chunk.content}`;
  });
  const index = input.recent.map((note) => {
    const source = number(note);
    return `- [${source.n}] "${source.title}" (${describe(note)})`;
  });

  const sections: string[] = [];
  if (input.mentionedTags.length) {
    sections.push(
      `The question mentions the tag(s): ${input.mentionedTags.join(', ')}. Notes with these tags are included below.`
    );
  }
  sections.push(`## Note excerpts\n\n${excerpts.length ? excerpts.join('\n\n---\n\n') : '(No matching note text.)'}`);
  if (index.length) sections.push(`## Recently edited notes (newest first)\n\n${index.join('\n')}`);
  sections.push(
    `## Your tags\n\n${
      input.tags.length
        ? input.tags.map((t) => `- ${t.name} (${t.note_count} ${t.note_count === 1 ? 'note' : 'notes'})`).join('\n')
        : '(No tags yet.)'
    }`
  );
  return { context: sections.join('\n\n'), sources };
}

async function ownedChat(appkit: AppKitInstance, userId: string, rawId: unknown) {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) throw new HttpError(400, 'Invalid id');
  const { rows } = await appkit.lakebase.query<{ id: string; title: string }>(
    'SELECT id, title FROM chromanote.chats WHERE id = $1 AND user_id = $2',
    [id.data, userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Chat not found');
  return rows[0];
}

export function registerAssistantRoutes(appkit: AppKitInstance) {
  appkit.server.extend((app) => {
    app.get(
      '/api/chats',
      route('list chats', async (req, res) => {
        const { rows } = await appkit.lakebase.query(
          `SELECT id, title, updated_at FROM chromanote.chats WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`,
          [getUserId(req)]
        );
        res.json(rows);
      })
    );

    app.post(
      '/api/chats',
      route('create chat', async (req, res) => {
        const { rows } = await appkit.lakebase.query(
          'INSERT INTO chromanote.chats (user_id) VALUES ($1) RETURNING id, title, updated_at',
          [getUserId(req)]
        );
        res.status(201).json(rows[0]);
      })
    );

    app.delete(
      '/api/chats/:id',
      route('delete chat', async (req, res) => {
        const chat = await ownedChat(appkit, getUserId(req), req.params.id);
        await appkit.lakebase.query('DELETE FROM chromanote.chats WHERE id = $1', [chat.id]);
        res.status(204).send();
      })
    );

    app.get(
      '/api/chats/:id/messages',
      route('load chat', async (req, res) => {
        const chat = await ownedChat(appkit, getUserId(req), req.params.id);
        const { rows } = await appkit.lakebase.query(
          'SELECT id, role, content, sources, created_at FROM chromanote.chat_messages WHERE chat_id = $1 ORDER BY id',
          [chat.id]
        );
        res.json(rows);
      })
    );

    app.post(
      '/api/chats/:id/messages',
      route('answer question', async (req, res) => {
        const userId = getUserId(req);
        const chat = await ownedChat(appkit, userId, req.params.id);
        const parsed = z
          .object({ content: z.string().trim().min(1).max(4000), timeZone: z.string().max(64).optional() })
          .safeParse(req.body);
        if (!parsed.success) throw new HttpError(400, 'content is required');
        const question = parsed.data.content;
        const timeZone = safeTimeZone(parsed.data.timeZone);

        const history = await appkit.lakebase.query<{ role: 'user' | 'assistant'; content: string }>(
          `SELECT role, content FROM (
             SELECT id, role, content FROM chromanote.chat_messages WHERE chat_id = $1 ORDER BY id DESC LIMIT $2
           ) h ORDER BY id`,
          [chat.id, HISTORY_TURNS]
        );
        await appkit.lakebase.query(
          `INSERT INTO chromanote.chat_messages (chat_id, role, content) VALUES ($1, 'user', $2)`,
          [chat.id, question]
        );
        await appkit.lakebase.query(
          `UPDATE chromanote.chats SET updated_at = NOW(), title = CASE WHEN title = '' THEN left($2, 60) ELSE title END
           WHERE id = $1`,
          [chat.id, question]
        );

        // Embeddings cover note text only; tags, priority, archive state and
        // links are read fresh here so the assistant always sees current values.
        const vector = await embedQuery(question);
        const [similar, recent, tags] = await Promise.all([
          retrieveSimilar(appkit, userId, vector),
          appkit.lakebase.query<NoteMeta>(
            `SELECT id AS note_id, title, created_at, updated_at, due_at FROM chromanote.notes
             WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT $2`,
            [userId, RECENT_NOTES]
          ),
          appkit.lakebase.query<{ id: string; name: string; note_count: number }>(
            `SELECT t.id, t.name,
               (SELECT count(*)::int FROM chromanote.note_tags nt
                JOIN chromanote.notes n ON n.id = nt.note_id
                WHERE nt.tag_id = t.id AND n.deleted_at IS NULL) AS note_count
             FROM chromanote.tags t WHERE t.user_id = $1 ORDER BY lower(t.name)`,
            [userId]
          ),
        ]);
        const mentioned = mentionedTags(question, tags.rows);
        const tagged = await retrieveTagged(
          appkit,
          userId,
          vector,
          mentioned.map((t) => t.id)
        );
        const seen = new Set(similar.map((c) => c.note_id));
        const chunks = [...similar, ...tagged.filter((c) => !seen.has(c.note_id))];
        const details = await loadNoteMeta(appkit, userId, [
          ...new Set([...chunks.map((c) => c.note_id), ...recent.rows.map((r) => r.note_id)]),
        ]);
        const { context, sources } = buildContext(
          { chunks, recent: recent.rows, details, tags: tags.rows, mentionedTags: mentioned.map((t) => t.name) },
          timeZone
        );
        const now = `Current date and time: ${formatForModel(new Date(), timeZone)} (${timeZone}).`;
        const messages: ChatMessage[] = [
          {
            role: 'system',
            content: `${SYSTEM_PROMPT}\n\n${now}\n\n${recent.rows.length ? context : '(The user has no notes yet.)'}`,
          },
          ...history.rows,
          { role: 'user', content: question },
        ];

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        send('sources', sources);

        const abort = new AbortController();
        res.on('close', () => abort.abort());

        let answer = '';
        try {
          for await (const token of streamChat(messages, abort.signal)) {
            answer += token;
            send('token', token);
          }
        } catch (err) {
          if (!abort.signal.aborted) {
            console.error('[assistant] Streaming failed:', err);
            send('error', 'The assistant could not finish answering. Please try again.');
          }
        }

        if (answer) {
          await appkit.lakebase.query(
            `INSERT INTO chromanote.chat_messages (chat_id, role, content, sources) VALUES ($1, 'assistant', $2, $3)`,
            [chat.id, answer, JSON.stringify(sources)]
          );
        }
        send('done', null);
        res.end();
      })
    );
  });
}
