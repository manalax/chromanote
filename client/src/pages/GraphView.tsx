import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { Archive, ExternalLink, FilePlus, Link2, Pencil, RotateCcw, Trash2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Skeleton } from '@databricks/appkit-ui/react';
import { api, type Graph } from '@/lib/api';
import { accentOf } from '@/lib/colors';
import { useData } from '@/lib/data';
import { useSettings } from '@/lib/settings';
import { GraphContextMenu, type MenuItem } from '@/components/graph/GraphContextMenu';
import { InlineTitleInput } from '@/components/graph/InlineTitleInput';

type GNode = NodeObject<{ id: string; title: string; color: string | null }>;
type GLink = LinkObject<GNode, object>;
interface GraphData {
  nodes: GNode[];
  links: GLink[];
}
interface Point {
  x: number;
  y: number;
}

type Menu =
  | { kind: 'background'; at: Point; graphAt: Point }
  | { kind: 'node'; at: Point; node: GNode }
  | { kind: 'link'; at: Point; link: GLink };

type TitleBox =
  | { kind: 'create'; at: Point; graphAt: Point }
  | { kind: 'create-linked'; at: Point; graphAt: Point; source: GNode }
  | { kind: 'rename'; at: Point; node: GNode };

const DOUBLE_CLICK_MS = 250;
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 8;
const LINK_HIT_PX = 5;
const NODE_HIT_PX = 12;
const DRAG_START_PX = 4;
const CLICK_SLOP_PX = 4;

const endId = (end: GLink['source']) => (typeof end === 'object' ? (end as GNode).id : String(end));
const nodeRadius = (degree: number) => 3 + Math.sqrt(1 + degree) * 2;
const LABEL_PX = 11;
const labelVisible = (degree: number, scale: number) => scale > 0.9 || degree > 1;

const measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

/** The title label's box under a node, in graph units (it's grabbable too). */
function labelBox(n: GNode, degree: number, scale: number) {
  if (!labelVisible(degree, scale)) return null;
  const fontSize = LABEL_PX / scale;
  let width = n.title.length * fontSize * 0.55;
  if (measureCtx) {
    measureCtx.font = `500 ${fontSize}px Inter, sans-serif`;
    width = measureCtx.measureText(n.title).width;
  }
  const pad = 3 / scale;
  return {
    x: (n.x ?? 0) - width / 2 - pad,
    y: (n.y ?? 0) + nodeRadius(degree) + 1,
    w: width + pad * 2,
    h: fontSize + pad * 2,
  };
}

/** Grab radius for a node's dot: never smaller than NODE_HIT_PX on screen. */
const hitRadius = (degree: number, scale: number) => Math.max(nodeRadius(degree) + 2, NODE_HIT_PX / scale);

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function toData(graph: Graph): GraphData {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
      color: n.color,
      // Saved positions pin the node (fx/fy) and seed its start position.
      ...(n.graph_x !== null && n.graph_y !== null ? { x: n.graph_x, y: n.graph_y, fx: n.graph_x, fy: n.graph_y } : {}),
    })),
    links: graph.edges.map((e) => ({ source: e.source, target: e.target })),
  };
}

export function GraphView() {
  const navigate = useNavigate();
  const { isDark } = useSettings();
  const { refreshTitles } = useData();
  const fg = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [titleBox, setTitleBox] = useState<TitleBox | null>(null);
  const [linkSource, setLinkSource] = useState<GNode | null>(null);
  const [hovered, setHovered] = useState<GNode | null>(null);
  const cursor = useRef<Point | null>(null);
  const clickTimer = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; start: Point; fired: boolean } | null>(null);

  const load = useCallback(() => {
    api
      .graph()
      .then((g) => setData(toData(g)))
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [data === null]); // eslint-disable-line react-hooks/exhaustive-deps -- attach once the canvas exists

  // force-graph re-scales the view on every data change until the user zooms,
  // which would shift everything when a note is added. Once the initial zoom is
  // applied, nudge it so later edits keep the camera (and click positions) fixed.
  const zoomLocked = useRef(false);
  useEffect(() => {
    if (!data || zoomLocked.current) return;
    const frame = requestAnimationFrame(() => {
      const graph = fg.current;
      if (!graph) return;
      graph.zoom(graph.zoom() * 1.0001);
      // The centring force drags every note whenever the layout re-runs (e.g.
      // after a note is moved or added). Without it, notes keep their places.
      graph.d3Force('center', null);
      zoomLocked.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [data]);

  // Esc leaves link mode.
  useEffect(() => {
    if (!linkSource) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLinkSource(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkSource]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const l of data?.links ?? []) {
      for (const id of [endId(l.source), endId(l.target)]) d.set(id, (d.get(id) ?? 0) + 1);
    }
    return d;
  }, [data]);

  // ---- coordinate helpers -------------------------------------------------

  const localPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = container.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const toGraph = (p: Point): Point => fg.current?.screen2GraphCoords(p.x, p.y) ?? p;

  /** The node under a graph-space point. */
  const nodeAt = (g: Point): GNode | null => {
    const scale = fg.current?.zoom() ?? 1;
    // Later nodes are drawn on top, so check them first.
    for (const n of [...(data?.nodes ?? [])].reverse()) {
      const deg = degree.get(n.id) ?? 0;
      const r = hitRadius(deg, scale);
      if (((n.x ?? 0) - g.x) ** 2 + ((n.y ?? 0) - g.y) ** 2 <= r * r) return n;
      const box = labelBox(n, deg, scale);
      if (box && g.x >= box.x && g.x <= box.x + box.w && g.y >= box.y && g.y <= box.y + box.h) return n;
    }
    return null;
  };

  /** The link line nearest a graph-space point, within a few screen pixels. */
  const linkAt = (g: Point): GLink | null => {
    const tolerance = LINK_HIT_PX / (fg.current?.zoom() ?? 1);
    let best: { link: GLink; dist: number } | null = null;
    for (const l of data?.links ?? []) {
      const a = l.source as GNode;
      const b = l.target as GNode;
      if (typeof a !== 'object' || typeof b !== 'object') continue;
      const dist = distanceToSegment(g, { x: a.x ?? 0, y: a.y ?? 0 }, { x: b.x ?? 0, y: b.y ?? 0 });
      if (dist <= tolerance && (!best || dist < best.dist)) best = { link: l, dist };
    }
    return best?.link ?? null;
  };

  /**
   * Opens the right menu for whatever is at a container point. We hit-test
   * ourselves rather than using force-graph's right-click callbacks: it treats
   * the pointermove Chrome fires after a context menu as a drag and drops them.
   */
  const openMenuAt = (at: Point) => {
    setLinkSource(null);
    setTitleBox(null);
    const g = toGraph(at);
    const node = nodeAt(g);
    if (node) return setMenu({ kind: 'node', at, node });
    const link = linkAt(g);
    if (link) return setMenu({ kind: 'link', at, link });
    setMenu({ kind: 'background', at, graphAt: g });
  };

  // ---- mutations ----------------------------------------------------------

  const fail = (err: unknown) => {
    toast.error((err as Error).message || 'Something went wrong');
    load();
  };

  const createNote = async (title: string, graphAt: Point, linkFrom?: GNode) => {
    try {
      const note = await api.createNote({ title, graph_x: graphAt.x, graph_y: graphAt.y });
      const node: GNode = {
        id: note.id,
        title: note.title,
        color: note.color,
        ...graphAt,
        fx: graphAt.x,
        fy: graphAt.y,
      };
      let link: GLink | null = null;
      if (linkFrom) {
        await api.addLink(linkFrom.id, note.id);
        link = { source: linkFrom, target: node };
      }
      setData((d) => d && { nodes: [...d.nodes, node], links: link ? [...d.links, link] : d.links });
      void refreshTitles();
      toast.success(linkFrom ? `Created “${title}” linked from “${linkFrom.title}”` : `Created “${title}”`);
    } catch (err) {
      fail(err);
    }
  };

  const linkNotes = async (source: GNode, target: GNode) => {
    setLinkSource(null);
    if (source.id === target.id) return;
    try {
      const res = await api.addLink(source.id, target.id);
      if (!res.added) {
        toast(`“${source.title}” already links to “${target.title}”`);
        return;
      }
      setData((d) => d && { ...d, links: [...d.links, { source, target }] });
      toast.success(`Linked “${source.title}” → “${target.title}”`);
    } catch (err) {
      fail(err);
    }
  };

  const unlink = async (link: GLink) => {
    const source = link.source as GNode;
    const target = link.target as GNode;
    try {
      await api.removeLink(source.id, target.id);
      setData(
        (d) =>
          d && {
            ...d,
            links: d.links.filter((l) => !(endId(l.source) === source.id && endId(l.target) === target.id)),
          }
      );
      toast.success(`Removed link “${source.title}” → “${target.title}”`);
    } catch (err) {
      fail(err);
    }
  };

  const rename = async (node: GNode, title: string) => {
    if (title === node.title) return;
    try {
      const { note, rewritten } = await api.renameNote(node.id, title);
      setData(
        (d) =>
          d && { ...d, nodes: d.nodes.map((n) => (n.id === node.id ? Object.assign(n, { title: note.title }) : n)) }
      );
      void refreshTitles();
      toast.success(
        rewritten ? `Renamed and updated links in ${rewritten} ${rewritten === 1 ? 'note' : 'notes'}` : 'Renamed'
      );
    } catch (err) {
      fail(err);
    }
  };

  const removeNode = (id: string) =>
    setData(
      (d) =>
        d && {
          nodes: d.nodes.filter((n) => n.id !== id),
          links: d.links.filter((l) => endId(l.source) !== id && endId(l.target) !== id),
        }
    );

  const archive = async (node: GNode) => {
    try {
      await api.updateNote(node.id, { archived: true });
      removeNode(node.id);
      toast(`Archived “${node.title}”`, {
        action: { label: 'Undo', onClick: () => void api.updateNote(node.id, { archived: false }).then(load) },
      });
    } catch (err) {
      fail(err);
    }
  };

  const trash = async (node: GNode) => {
    try {
      await api.trashNote(node.id);
      removeNode(node.id);
      void refreshTitles();
      toast(`Moved “${node.title}” to trash`, {
        action: {
          label: 'Undo',
          onClick: () =>
            void api.restoreNote(node.id).then(() => {
              void refreshTitles();
              load();
            }),
        },
      });
    } catch (err) {
      fail(err);
    }
  };

  const pin = (node: GNode) => {
    node.fx = node.x;
    node.fy = node.y;
    if (node.x !== undefined && node.y !== undefined) api.setPosition(node.id, node.x, node.y).catch(fail);
  };

  const unpin = (node: GNode) => {
    if (node.fx === undefined) return;
    node.fx = undefined;
    node.fy = undefined;
    fg.current?.d3ReheatSimulation();
    api.setPosition(node.id, null, null).catch(fail);
    toast('Unpinned');
  };

  const resetLayout = async () => {
    try {
      await api.resetLayout();
      for (const n of data?.nodes ?? []) {
        // Node objects belong to the force simulation, which mutates them every
        // tick; clearing fx/fy in place is how force-graph unpins nodes.
        // eslint-disable-next-line react-hooks/immutability
        n.fx = undefined;
        n.fy = undefined;
      }
      fg.current?.d3ReheatSimulation();
      toast.success('Layout reset');
    } catch (err) {
      fail(err);
    }
  };

  // ---- menus ----------------------------------------------------------------

  const menuItems = (m: Menu): MenuItem[] => {
    if (m.kind === 'background') {
      return [
        {
          label: 'New note',
          icon: <FilePlus />,
          onSelect: () => setTitleBox({ kind: 'create', at: m.at, graphAt: m.graphAt }),
        },
      ];
    }
    if (m.kind === 'link') {
      return [{ label: 'Remove link', icon: <Unlink />, onSelect: () => void unlink(m.link), destructive: true }];
    }
    const node = m.node;
    return [
      { label: 'Link to…', icon: <Link2 />, onSelect: () => setLinkSource(node) },
      { label: 'Open', icon: <ExternalLink />, onSelect: () => void navigate(`/notes/${node.id}`) },
      { label: 'Rename', icon: <Pencil />, onSelect: () => setTitleBox({ kind: 'rename', at: m.at, node }) },
      { label: 'Archive', icon: <Archive />, onSelect: () => void archive(node) },
      { label: 'Move to trash', icon: <Trash2 />, onSelect: () => void trash(node), destructive: true },
    ];
  };

  const menuTitle = (m: Menu) =>
    m.kind === 'node'
      ? m.node.title
      : m.kind === 'link'
        ? `${(m.link.source as GNode).title} → ${(m.link.target as GNode).title}`
        : undefined;

  // ---- pointer handling -----------------------------------------------------

  const handleNodeClick = (node: GNode) => {
    if (longPress.current?.fired) return;
    if (linkSource) {
      void linkNotes(linkSource, node);
      return;
    }
    // Delay single clicks so a double-click can unpin instead of opening.
    if (clickTimer.current?.id === node.id) {
      clearTimeout(clickTimer.current.timer);
      clickTimer.current = null;
      unpin(node);
      return;
    }
    if (clickTimer.current) clearTimeout(clickTimer.current.timer);
    clickTimer.current = {
      id: node.id,
      timer: setTimeout(() => {
        clickTimer.current = null;
        void navigate(`/notes/${node.id}`);
      }, DOUBLE_CLICK_MS),
    };
  };

  const handleBackgroundClick = (at: Point) => {
    setMenu(null);
    if (linkSource) {
      setTitleBox({ kind: 'create-linked', at, graphAt: toGraph(at), source: linkSource });
      setLinkSource(null);
    }
  };

  /**
   * Left clicks are hit-tested here instead of via force-graph's click
   * callbacks, which drop a click if any pointermove arrives between press and
   * release. Clicks that end a pan or node drag are ignored.
   */
  const pressStart = useRef<Point | null>(null);
  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || longPress.current?.fired) return;
    if ((e.target as HTMLElement).closest('[role=menu], form')) return;
    const at = localPoint(e);
    const start = pressStart.current;
    if (start && Math.hypot(at.x - start.x, at.y - start.y) > CLICK_SLOP_PX) return;
    const node = nodeAt(toGraph(at));
    if (node) handleNodeClick(node);
    else handleBackgroundClick(at);
  };

  // Long-press on touch devices opens the same menus as right-click.
  // ---- dragging notes ------------------------------------------------------
  //
  // Node dragging is done here rather than by force-graph: force-graph finds
  // the node under the pointer from a hit map it repaints at most every 800 ms,
  // so while the layout is still moving a press misses the note and pans.
  // nodeAt() checks live positions (dot and title label) instead.

  const nodeDrag = useRef<{ node: GNode; start: Point; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Keeps d3-zoom from starting a pan when the press lands on a note. */
  const claimPress = (e: React.MouseEvent | React.TouchEvent) => {
    if (linkSource) return;
    if ('button' in e && e.button !== 0) return;
    const point = 'touches' in e ? e.touches[0] : e;
    if (point && nodeAt(toGraph(localPoint(point)))) e.stopPropagation();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = localPoint(e);
    pressStart.current = p;
    if (!linkSource && e.isPrimary && e.button === 0) {
      const node = nodeAt(toGraph(p));
      if (node) {
        nodeDrag.current = { node, start: p, moved: false };
        container.current?.setPointerCapture(e.pointerId);
      }
    }
    if (e.pointerType === 'mouse') return;
    const start = localPoint(e);
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = {
      start,
      fired: false,
      timer: setTimeout(() => {
        if (!longPress.current) return;
        longPress.current.fired = true;
        openMenuAt(start);
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = localPoint(e);
    const g = toGraph(p);
    cursor.current = g;
    const d = nodeDrag.current;
    if (d) {
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) > DRAG_START_PX) {
        d.moved = true;
        setDragging(true);
        if (longPress.current) clearTimeout(longPress.current.timer);
        longPress.current = null;
        // No simulation restart: only the held note moves, so unrelated notes stay put.
      }
      if (d.moved) {
        d.node.fx = d.node.x = g.x;
        d.node.fy = d.node.y = g.y;
      }
      return;
    }
    const over = nodeAt(g);
    if (over?.id !== hovered?.id) setHovered(over);
    const lp = longPress.current;
    if (lp && !lp.fired && Math.hypot(p.x - lp.start.x, p.y - lp.start.y) > LONG_PRESS_SLOP_PX) {
      clearTimeout(lp.timer);
      longPress.current = null;
    }
  };
  const onPointerUp = () => {
    const d = nodeDrag.current;
    nodeDrag.current = null;
    if (d?.moved) {
      setDragging(false);
      pin(d.node); // dropped notes stay put (and are saved)
    }
    const lp = longPress.current;
    if (!lp) return;
    clearTimeout(lp.timer);
    // Let the click that follows a fired long-press be ignored, then reset.
    setTimeout(() => {
      if (longPress.current === lp) longPress.current = null;
    }, 50);
  };

  // ---- rendering ------------------------------------------------------------

  if (error) {
    return (
      <Empty className="mt-16">
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load the graph</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!data) return <Skeleton className="mx-auto h-[75vh] w-full max-w-6xl rounded-2xl" />;

  const text = isDark ? 'rgba(250,250,250,0.85)' : 'rgba(24,24,27,0.85)';
  const linkColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
  const fallback = isDark ? '#a1a1aa' : '#71717a';
  const ring = isDark ? '#fafafa' : '#18181b';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h1 className="text-xl font-semibold tracking-tight">Graph</h1>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted-foreground md:block">
            {data.nodes.length} notes · {data.links.length} links · right-click to create or link · drag to pin ·
            double-click to unpin
          </p>
          <Button variant="ghost" size="sm" onClick={() => void resetLayout()}>
            <RotateCcw className="size-4" /> Reset layout
          </Button>
        </div>
      </div>
      <div
        ref={container}
        className="relative h-[75vh] touch-none select-none overflow-hidden rounded-2xl border bg-card"
        style={{ cursor: linkSource ? 'crosshair' : dragging ? 'grabbing' : hovered ? 'grab' : undefined }}
        onMouseDownCapture={claimPress}
        onTouchStartCapture={claimPress}
        onContextMenu={(e) => {
          e.preventDefault();
          // Menus and title boxes handle their own right-clicks.
          if ((e.target as HTMLElement).closest('[role=menu], form')) return;
          openMenuAt(localPoint(e));
        }}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ForceGraph2D<GNode, object>
          ref={fg}
          graphData={data}
          width={size.width}
          height={size.height}
          backgroundColor="transparent"
          autoPauseRedraw={!linkSource && !dragging}
          enableNodeDrag={false}
          linkColor={() => linkColor}
          linkWidth={1}
          linkHoverPrecision={6}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          nodeRelSize={4}
          nodeVal={(n) => 1 + (degree.get(n.id) ?? 0)}
          nodeLabel={(n) => (linkSource ? `Link to “${n.title}”` : n.title)}
          nodeCanvasObject={(n, ctx, scale) => {
            const deg = degree.get(n.id) ?? 0;
            const r = nodeRadius(deg);
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            const isTarget = !!linkSource && hovered?.id === n.id && n.id !== linkSource.id;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = accentOf(n.color) ?? fallback;
            ctx.fill();
            if (n.fx !== undefined) {
              // Pinned: thin outline.
              ctx.lineWidth = 1 / scale;
              ctx.strokeStyle = ring;
              ctx.globalAlpha = 0.35;
              ctx.beginPath();
              ctx.arc(x, y, r + 2 / scale, 0, 2 * Math.PI);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
            if (isTarget || linkSource?.id === n.id) {
              ctx.lineWidth = 2 / scale;
              ctx.strokeStyle = ring;
              ctx.beginPath();
              ctx.arc(x, y, r + 4 / scale, 0, 2 * Math.PI);
              ctx.stroke();
            }
            if (labelVisible(deg, scale) || isTarget) {
              const fontSize = LABEL_PX / scale;
              ctx.font = `500 ${fontSize}px Inter, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = text;
              ctx.fillText(n.title, x, y + r + 2);
            }
          }}
          // The grab area covers the dot (at least NODE_HIT_PX on screen) and the
          // title label, so pressing a note's name drags the note instead of panning.
          nodePointerAreaPaint={(n, color, ctx, scale) => {
            const deg = degree.get(n.id) ?? 0;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, hitRadius(deg, scale), 0, 2 * Math.PI);
            ctx.fill();
            const box = labelBox(n, deg, scale);
            if (box) ctx.fillRect(box.x, box.y, box.w, box.h);
          }}
          showPointerCursor={false}
          onRenderFramePost={(ctx, scale) => {
            // Rubber band from the link source to the cursor (or snapped to the hovered target).
            if (!linkSource || !cursor.current) return;
            const target = hovered && hovered.id !== linkSource.id ? hovered : null;
            ctx.save();
            ctx.setLineDash([4 / scale, 4 / scale]);
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeStyle = ring;
            ctx.beginPath();
            ctx.moveTo(linkSource.x ?? 0, linkSource.y ?? 0);
            ctx.lineTo(target?.x ?? cursor.current.x, target?.y ?? cursor.current.y);
            ctx.stroke();
            ctx.restore();
          }}
        />

        {data.nodes.length === 0 && !titleBox && !menu && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Right-click (or long-press) anywhere to create your first note.
          </div>
        )}

        {linkSource && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border bg-popover px-3 py-1.5 text-xs shadow-sm">
            Linking from <span className="font-medium">{linkSource.title}</span>: click a note, or empty space for a new
            one · Esc to cancel
          </div>
        )}

        {menu && (
          <GraphContextMenu
            x={menu.at.x}
            y={menu.at.y}
            title={menuTitle(menu)}
            items={menuItems(menu)}
            onClose={() => setMenu(null)}
          />
        )}

        {titleBox && (
          <InlineTitleInput
            x={titleBox.at.x}
            y={titleBox.at.y}
            label={
              titleBox.kind === 'rename'
                ? 'Rename note'
                : titleBox.kind === 'create-linked'
                  ? `New note linked from “${titleBox.source.title}”`
                  : 'New note'
            }
            initial={titleBox.kind === 'rename' ? titleBox.node.title : ''}
            onCancel={() => setTitleBox(null)}
            onSubmit={(title) => {
              const box = titleBox;
              setTitleBox(null);
              if (box.kind === 'rename') void rename(box.node, title);
              else void createNote(title, box.graphAt, box.kind === 'create-linked' ? box.source : undefined);
            }}
          />
        )}
      </div>
    </div>
  );
}
