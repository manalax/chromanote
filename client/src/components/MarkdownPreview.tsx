import { memo, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { visit } from 'unist-util-visit';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { WIKILINK_RE, normalizeTitle } from '../../../shared/wikilinks';
import { api } from '@/lib/api';
import { useData } from '@/lib/data';
import { cn } from '@/lib/utils';

const WIKI_PREFIX = '/wiki/';

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

/** remark plugin: turns [[Title]] / [[Title|label]] text into links to /wiki/<title>. */
function remarkWikilinks() {
  return (tree: MdNode) => {
    visit(tree as never, 'text', (node: MdNode, index: number | undefined, parent: MdNode | undefined) => {
      if (!parent || index === undefined || parent.type === 'link' || !node.value?.includes('[[')) return;
      const parts: MdNode[] = [];
      let last = 0;
      for (const m of node.value.matchAll(WIKILINK_RE)) {
        const start = m.index ?? 0;
        if (start > last) parts.push({ type: 'text', value: node.value.slice(last, start) });
        const target = m[1].trim();
        parts.push({
          type: 'link',
          url: WIKI_PREFIX + encodeURIComponent(target),
          children: [{ type: 'text', value: (m[2] ?? m[1]).trim() }],
        });
        last = start + m[0].length;
      }
      if (parts.length === 0) return;
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
      parent.children!.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}

function WikiLink({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { titleIndex, refreshTitles } = useData();
  const id = titleIndex.get(normalizeTitle(title));

  const open = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (id) {
      void navigate(`/notes/${id}`);
      return;
    }
    try {
      const res = await api.resolve(title);
      await refreshTitles();
      if (res.created) toast.success(`Created “${title}”`);
      void navigate(`/notes/${res.id}`);
    } catch {
      toast.error('Could not open that note');
    }
  };

  return (
    <a
      href={id ? `/notes/${id}` : '#'}
      onClick={(e) => void open(e)}
      className={cn('wikilink', !id && 'missing')}
      title={id ? title : `“${title}” doesn't exist yet. Click to create it.`}
    >
      {children}
    </a>
  );
}

function Anchor({ href, children, ...rest }: ComponentProps<'a'>) {
  if (href?.startsWith(WIKI_PREFIX)) {
    return <WikiLink title={decodeURIComponent(href.slice(WIKI_PREFIX.length))}>{children}</WikiLink>;
  }
  if (href?.startsWith('/notes/')) {
    return (
      <Link to={href} className="wikilink">
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}

const components = { a: Anchor };
const remarkPlugins = [remarkGfm, remarkWikilinks];
const rehypePlugins = [rehypeSanitize];

export const MarkdownPreview = memo(function MarkdownPreview({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={cn('prose prose-sm sm:prose-base note-prose', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
});
