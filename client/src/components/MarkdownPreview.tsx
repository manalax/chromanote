import { memo, useMemo, type ComponentProps } from 'react';
import ReactMarkdown, { type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { visit } from 'unist-util-visit';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { WIKILINK_RE, normalizeTitle } from '../../../shared/wikilinks';
import { api } from '@/lib/api';
import { DEFAULT_SURFACE, textColor } from '@/lib/colors';
import { useData } from '@/lib/data';
import { useSettings } from '@/lib/settings';
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

// Safe HTML only, plus the `data-color` of inline text colour spans.
const schema = {
  ...defaultSchema,
  attributes: { ...defaultSchema.attributes, span: [...(defaultSchema.attributes?.span ?? []), 'dataColor'] },
};
const remarkPlugins = [remarkGfm, remarkWikilinks];
const rehypePlugins: Options['rehypePlugins'] = [rehypeRaw, [rehypeSanitize, schema]];

export const MarkdownPreview = memo(function MarkdownPreview({
  markdown,
  className,
  surface,
}: {
  markdown: string;
  className?: string;
  /** Background the text sits on, for resolving inline text colours. Defaults to the card surface. */
  surface?: string;
}) {
  const { isDark } = useSettings();
  const components = useMemo(() => {
    const bg = surface ?? (isDark ? DEFAULT_SURFACE.dark : DEFAULT_SURFACE.light);
    function Span({ node: _node, ...props }: ComponentProps<'span'> & { node?: unknown; 'data-color'?: string }) {
      const value = props['data-color'];
      const color = value ? textColor(value, bg, isDark) : null;
      return <span {...props} style={color ? { ...props.style, color } : props.style} />;
    }
    return { a: Anchor, span: Span };
  }, [surface, isDark]);

  return (
    <div className={cn('prose prose-sm sm:prose-base note-prose', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
});
