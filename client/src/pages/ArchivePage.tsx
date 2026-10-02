import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Archive, ArchiveRestore, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@databricks/appkit-ui/react';
import { api, type NoteSummary } from '@/lib/api';
import { useData } from '@/lib/data';
import { plainExcerpt } from '@/lib/meta';

type Tab = 'archived' | 'trash';

export function ArchivePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'trash' ? 'trash' : 'archived';
  const navigate = useNavigate();
  const { refreshTitles } = useData();
  const [list, setList] = useState<{ tab: Tab; notes: NoteSummary[] } | null>(null);
  const [reload, setReload] = useState(0);
  const notes = list?.tab === tab ? list.notes : null;

  useEffect(() => {
    let cancelled = false;
    api
      .listNotes({ status: tab, sort: 'updated' })
      .then((rows) => !cancelled && setList({ tab, notes: rows }))
      .catch((err: Error) => {
        if (cancelled) return;
        toast.error(err.message);
        setList({ tab, notes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, reload]);

  const load = () => setReload((n) => n + 1);

  const act = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      toast.success(message);
      void refreshTitles();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={(v) => setParams(v === 'trash' ? { tab: 'trash' } : {}, { replace: true })}>
          <TabsList>
            <TabsTrigger value="archived">
              <Archive className="size-4" /> Archived
            </TabsTrigger>
            <TabsTrigger value="trash">
              <Trash2 className="size-4" /> Trash
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'trash' && !!notes?.length && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                Empty trash
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Empty the trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  {notes.length} {notes.length === 1 ? 'note' : 'notes'} will be deleted permanently. This can&apos;t be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void act(api.emptyTrash, 'Trash emptied')}>
                  Delete forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {notes === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <Empty className="mt-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">{tab === 'trash' ? <Trash2 /> : <Archive />}</EmptyMedia>
            <EmptyTitle>{tab === 'trash' ? 'Trash is empty' : 'No archived notes'}</EmptyTitle>
            <EmptyDescription>
              {tab === 'trash'
                ? 'Notes you delete land here. You can restore them or delete them forever.'
                : 'Archive notes you want out of the way. The assistant can still find them.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {notes.map((n) => (
            <li key={n.id} className="flex items-center gap-3 px-4 py-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => void navigate(`/notes/${n.id}`)}
                disabled={tab === 'trash'}
              >
                <div className="truncate font-medium">{n.title || 'Untitled'}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {plainExcerpt(n.excerpt, 120) || 'Empty note'}
                </div>
              </button>
              {tab === 'archived' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void act(() => api.updateNote(n.id, { archived: false }), 'Moved back to notes')}
                >
                  <ArchiveRestore className="size-4" /> Unarchive
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void act(() => api.restoreNote(n.id), 'Note restored')}
                  >
                    <RotateCcw className="size-4" /> Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete forever"
                    onClick={() => void act(() => api.deleteNoteForever(n.id), 'Deleted forever')}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
