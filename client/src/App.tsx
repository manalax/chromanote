import { createBrowserRouter, Link, NavLink, Outlet, RouterProvider } from 'react-router';
import { Suspense, lazy, useEffect, useState } from 'react';
import {
  Button,
  Sheet,
  Spinner,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { Archive, LayoutGrid, Moon, Network, Settings, Sparkles, Sun } from 'lucide-react';
import { useSettings } from './lib/settings';
import { cn } from './lib/utils';
import { AssistantPanel } from './components/AssistantPanel';
import { NotesGrid } from './pages/NotesGrid';
import { ArchivePage } from './pages/ArchivePage';
import { SettingsPage } from './pages/SettingsPage';

// Heavy pages (CodeMirror, force-graph) load on demand.
const NoteEditor = lazy(() => import('./pages/NoteEditor').then((m) => ({ default: m.NoteEditor })));
const GraphView = lazy(() => import('./pages/GraphView').then((m) => ({ default: m.GraphView })));

const ASSISTANT_KEY = 'chromanote:assistant-open';

const NAV = [
  { to: '/', label: 'Notes', icon: LayoutGrid, end: true },
  { to: '/graph', label: 'Graph', icon: Network, end: false },
  { to: '/archive', label: 'Archive', icon: Archive, end: false },
];

function readAssistantOpen(): boolean {
  try {
    return localStorage.getItem(ASSISTANT_KEY) === '1';
  } catch {
    return false;
  }
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-6 grid-cols-2 gap-0.5 overflow-hidden rounded-md" aria-hidden>
        <span className="bg-[#e05a6d]" />
        <span className="bg-[#d9a514]" />
        <span className="bg-[#2fae7b]" />
        <span className="bg-[#3b8fdc]" />
      </span>
      <span className="hidden sm:inline">chromanote</span>
    </Link>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Layout() {
  const isMobile = useIsMobile();
  const { isDark, update } = useSettings();
  // Desktop remembers the side panel; on mobile the sheet always starts closed.
  const [panelOpen, setPanelOpen] = useState(readAssistantOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const assistantOpen = isMobile ? sheetOpen : panelOpen;
  const setAssistantOpen = isMobile ? setSheetOpen : setPanelOpen;

  useEffect(() => {
    try {
      localStorage.setItem(ASSISTANT_KEY, panelOpen ? '1' : '0');
    } catch {
      // storage unavailable; the panel just won't remember its state
    }
  }, [panelOpen]);

  const panel = <AssistantPanel onClose={() => setAssistantOpen(false)} />;

  return (
    <div className="flex min-h-screen">
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 backdrop-blur-md md:px-6"
          style={{ background: 'color-mix(in oklab, var(--app-bg) 85%, transparent)' }}
        >
          <Logo />
          <nav className="ml-2 flex items-center gap-0.5 md:ml-6">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-foreground/[0.07] text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )
                }
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label={isDark ? 'Light mode' : 'Dark mode'}
              onClick={() => void update({ theme: isDark ? 'light' : 'dark' })}
            >
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </IconButton>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" asChild aria-label="Settings">
                  <NavLink to="/settings">
                    <Settings className="size-4" />
                  </NavLink>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
            <Button
              variant={assistantOpen ? 'secondary' : 'outline'}
              size="sm"
              className="ml-1 gap-1.5 rounded-full"
              onClick={() => setAssistantOpen((o) => !o)}
              aria-pressed={assistantOpen}
            >
              <Sparkles className="size-4" />
              <span className="hidden sm:inline">Ask</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-10 pt-2 md:px-6">
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {isMobile ? (
        <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
          <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md [&>button]:hidden">
            <SheetTitle className="sr-only">Assistant</SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      ) : (
        assistantOpen && (
          <aside className="sticky top-0 h-screen w-[380px] shrink-0 border-l bg-background/80 backdrop-blur-sm">
            {panel}
          </aside>
        )
      )}
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <NotesGrid /> },
      { path: '/notes/:id', element: <NoteEditor /> },
      { path: '/graph', element: <GraphView /> },
      { path: '/archive', element: <ArchivePage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
