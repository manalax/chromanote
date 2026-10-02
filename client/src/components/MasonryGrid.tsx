import { useEffect, useRef, useState, type ReactNode } from 'react';
import { columnCount, distributeColumns } from '@/lib/masonry';

interface MasonryGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}

export function MasonryGrid<T>({ items, getKey, renderItem }: MasonryGridProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setCols(columnCount(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex items-start gap-4">
      {distributeColumns(items, cols).map((column, c) => (
        // eslint-disable-next-line react/no-array-index-key -- columns are positional
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-4">
          {column.map((item) => (
            <div key={getKey(item)}>{renderItem(item)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
