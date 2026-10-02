import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

interface GraphContextMenuProps {
  /** Position relative to the graph container. */
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
  onClose: () => void;
}

const MARGIN = 8;

/** A right-click menu positioned at a point inside the graph, styled like the app's dropdowns. */
export function GraphContextMenu({ x, y, title, items, onClose }: GraphContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the menu inside the container.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    setPos({
      left: Math.max(MARGIN, Math.min(x, parent.clientWidth - el.offsetWidth - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, parent.clientHeight - el.offsetHeight - MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute z-30 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="truncate px-2 py-1.5 text-xs font-medium text-muted-foreground">{title}</div>}
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
            'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
            '[&_svg]:size-4 [&_svg]:text-muted-foreground',
            item.destructive && 'text-destructive [&_svg]:text-destructive'
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
